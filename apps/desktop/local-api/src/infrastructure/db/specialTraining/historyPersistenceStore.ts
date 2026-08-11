// SPDX-License-Identifier: GPL-3.0-only

import type { OperatorSummary } from '@zinuto/shared/operatorSummary'

import { db } from '../database.js'
import { DEFAULT_USER_ID } from '../defaults.js'
import {
  encodeSpecialTrainingHistoryQuestionDetailPayload,
  SPECIAL_TRAINING_HISTORY_QUESTION_DETAIL_ENCODING,
} from '../specialTrainingHistoryQuestionDetailStorage.js'
import { appError } from '../../../kernel/appError.js'
import { encodeStoredJsonToCompressedBuffer } from '../../../kernel/compressedJson.js'
import { createId } from '../../../kernel/id.js'
import {
  buildHumanOperatorSummary,
  normalizeOperatorSummary,
} from '../../../domain/operatorSummary.js'
import type {
  SettleSpecialTrainingQuestionPayload,
  SpecialTrainingFastDecisionStrictnessLevel,
  SpecialTrainingLedgerSourceTag,
  SpecialTrainingModeId,
  SpecialTrainingQuestionState,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction,
} from '../../../domain/specialTraining/contracts.js'
import {
  summarizeSpecialTrainingSession,
} from '../../../domain/specialTraining/sessionSummary.js'
import { normalizeSpecialTrainingBaseTimeframe } from '../../../domain/specialTraining/timeframeSemantics.js'

type SpecialTrainingQuestionSettlementEntry = {
  result: SpecialTrainingSettlementResult
  payload: SettleSpecialTrainingQuestionPayload
  abandoned: boolean
  settledAt: string
}

type PersistSpecialTrainingHistorySessionInput = {
  challengeId: string
  bankId: string
  bankName: string
  modeId: SpecialTrainingModeId
  simulationBatchId?: string | null
  questionCount: number
  horizonBars: number
  maxOperations: number
  maxEntries: number
  decisionSecondsLimit: number
  fastDecisionStrictnessLevel: SpecialTrainingFastDecisionStrictnessLevel
  fastDecisionDominanceRatio: number
  createdAtMs: number
  timeframe: string
  sourceTag: SpecialTrainingLedgerSourceTag
  enabledInstrumentIds: string[]
  questionIds: string[]
  questionsById: Map<string, SpecialTrainingQuestionState>
  settledEntriesByQuestionId: Map<string, SpecialTrainingQuestionSettlementEntry>
  operatorSummary?: OperatorSummary | null
}

const SPECIAL_TRAINING_INITIAL_TOTAL_FALLBACK = 100000

const normalizeText = (value: unknown): string => String(value ?? '').trim()

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : Number.NaN
}

const clampNonNegativeInteger = (value: unknown): number => {
  const numeric = Math.floor(toFiniteNumber(value))
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0
  }
  return numeric
}

const clampNonNegativeNumber = (value: unknown): number => {
  const numeric = toFiniteNumber(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0
  }
  return numeric
}

const normalizeOrderInputValue = (value: unknown): string | number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  return null
}

const normalizeStoredOperatorSummary = (
  value: unknown
): OperatorSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return buildHumanOperatorSummary()
  }
  return normalizeOperatorSummary(value)
}

const encodeStoredJson = (value: unknown): Buffer =>
  encodeStoredJsonToCompressedBuffer(value)

const toRecordOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const normalizeBaseTimeframe = (
  value: unknown,
): '1m' | '5m' | '1h' | '1d' | null => {
  return normalizeSpecialTrainingBaseTimeframe(value)
}

const normalizeProjectionString = (value: unknown): string =>
  normalizeText(value)

const resolveProjectionInitialTotal = (
  finalEquity: number,
  totalPnl: number,
): number => {
  const derived = finalEquity - totalPnl
  if (Number.isFinite(derived) && derived > 0) {
    return derived
  }
  return SPECIAL_TRAINING_INITIAL_TOTAL_FALLBACK
}

const resolveFastPerformanceRate = (input: {
  selection: string | null
  actual: string | null
  correct: boolean
  selectedMfeRatio: number
  selectedMaeRatio: number
  opportunityMfeRatio: number
}): number => {
  if (input.selection === 'OBSERVE') {
    if (input.correct || input.actual === 'OBSERVE') {
      return 0
    }
    return -Math.max(0, input.opportunityMfeRatio)
  }
  return input.correct
    ? Math.max(0, input.selectedMfeRatio)
    : -Math.max(0, input.selectedMaeRatio)
}

const resolveRiskReviewGrade = (
  survived: boolean,
  comeback: boolean,
): 'S' | 'A' | 'F' => {
  if (!survived) {
    return 'F'
  }
  if (comeback) {
    return 'S'
  }
  return 'A'
}

const normalizeProjectionTradeActions = (
  raw: unknown,
): SpecialTrainingTradeAction[] => {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map<SpecialTrainingTradeAction | null>((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const source = item as Record<string, unknown>
      const type = normalizeText(source.type).toUpperCase()
      if (type !== 'BUY' && type !== 'SELL') {
        return null
      }
      return {
        type,
        barIndex: clampNonNegativeInteger(source.barIndex),
        inputMode:
          source.inputMode === 'LOT' || source.inputMode === 'AMOUNT'
            ? source.inputMode
            : 'RATIO',
        priceMode: source.priceMode === 'NEXT_OPEN' ? 'NEXT_OPEN' : 'CUR_CLOSE',
        lotInput: normalizeOrderInputValue(source.lotInput),
        amountInput: normalizeOrderInputValue(source.amountInput),
        ratioInput: normalizeOrderInputValue(source.ratioInput),
        quantity: clampNonNegativeNumber(source.quantity),
        executionPrice: clampNonNegativeNumber(source.executionPrice),
        cashEffect: clampNonNegativeNumber(source.cashEffect),
      }
    })
    .filter((item): item is SpecialTrainingTradeAction => Boolean(item))
}

const resolveRiskBehavior = (
  actions: SpecialTrainingTradeAction[],
  startIndex: number,
): { behavior: 'CUT_LOSS' | 'ADD_POSITION' | 'FREEZE'; bars: number } => {
  const first = [...actions]
    .map((action) => ({
      type: normalizeText(action.type).toUpperCase(),
      barIndex: clampNonNegativeInteger(action.barIndex),
    }))
    .sort((left, right) => left.barIndex - right.barIndex)[0]
  if (!first) {
    return {
      behavior: 'FREEZE',
      bars: Math.max(0, 0 - clampNonNegativeInteger(startIndex)),
    }
  }
  const diff = Math.max(0, first.barIndex - clampNonNegativeInteger(startIndex))
  const behavior:
    | 'CUT_LOSS'
    | 'ADD_POSITION'
    | 'FREEZE' = first.type === 'SELL'
    ? 'CUT_LOSS'
    : first.type === 'BUY'
      ? 'ADD_POSITION'
      : 'FREEZE'
  return { behavior, bars: diff }
}

const assertSpecialTrainingStatsProjectionComplete = (input: {
  sessionId: string
  expectedQuestionIds: string[]
}): void => {
  const sessionId = normalizeText(input.sessionId)
  const expectedQuestionIds = input.expectedQuestionIds
    .map((questionId) => normalizeText(questionId))
    .filter((questionId) => questionId.length > 0)
  const expectedQuestionCount = expectedQuestionIds.length
  const row = db
    .prepare(
      `SELECT COUNT(*) AS projectionRowCount,
              COUNT(DISTINCT question_id) AS projectionQuestionCount
         FROM special_training_stats_projection
        WHERE session_id = ?`,
    )
    .get(sessionId) as
    | {
        projectionRowCount?: unknown
        projectionQuestionCount?: unknown
      }
    | undefined
  const projectionRowCount = clampNonNegativeInteger(row?.projectionRowCount)
  const projectionQuestionCount = clampNonNegativeInteger(row?.projectionQuestionCount)
  let matchedExpectedQuestionCount = 0
  if (expectedQuestionIds.length > 0) {
    const placeholders = expectedQuestionIds.map(() => '?').join(',')
    const matchedRow = db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM special_training_stats_projection
          WHERE session_id = ?
            AND question_id IN (${placeholders})`,
      )
      .get(sessionId, ...expectedQuestionIds) as { count?: unknown } | undefined
    matchedExpectedQuestionCount = clampNonNegativeInteger(matchedRow?.count)
  }
  if (
    projectionRowCount !== expectedQuestionCount ||
    projectionQuestionCount !== expectedQuestionCount ||
    matchedExpectedQuestionCount !== expectedQuestionCount
  ) {
    throw appError('SPECIAL_TRAINING_HISTORY_PERSIST_FAILED', {
      sessionId,
      expectedQuestionCount,
      projectionRowCount,
      projectionQuestionCount,
      matchedExpectedQuestionCount,
    })
  }
}

const buildRiskCurvePoints = (
  riskReview: SpecialTrainingSettlementResult['riskReview'] | null,
  initialEquity: number,
): Array<[number, number]> => {
  if (initialEquity <= 0 || !riskReview) {
    return []
  }
  const rawCurve = Array.isArray(riskReview.equityCurves?.user)
    ? riskReview.equityCurves?.user as Array<number | Record<string, unknown>>
    : []
  return rawCurve
    .map((item, index) => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        return [index, ((item - initialEquity) / initialEquity) * 100]
      }
      const record = toRecordOrNull(item)
      const barIndex = clampNonNegativeInteger(record?.barIndex ?? record?.x ?? index)
      const asset = clampNonNegativeNumber(record?.asset ?? record?.y)
      if (!Number.isFinite(asset)) {
        return null
      }
      return [barIndex, ((asset - initialEquity) / initialEquity) * 100]
    })
    .filter((item): item is [number, number] => Boolean(item))
}

const getInstrumentBarsVersionToken = (instrumentId: string): string | null => {
  const normalizedInstrumentId = normalizeText(instrumentId)
  if (!normalizedInstrumentId) {
    return null
  }
  const row = db
    .prepare(
      `SELECT bars_version_token
         FROM instruments
        WHERE id = ?
        LIMIT 1`,
    )
    .get(normalizedInstrumentId) as { bars_version_token?: unknown } | undefined
  const value = normalizeText(row?.bars_version_token)
  return value || null
}

const resolveInstrumentHistoryRef = (
  instrumentId: string | null | undefined,
  symbol: string,
  baseTimeframe: string,
  barsVersionToken: string | null | undefined,
): { instrumentId: string; barsVersionToken: string } => {
  const normalizedInstrumentId = normalizeText(instrumentId)
  const normalizedBarsVersionToken = normalizeText(barsVersionToken)
  if (normalizedInstrumentId) {
    const resolvedBarsVersionToken: string =
      normalizedBarsVersionToken ||
      getInstrumentBarsVersionToken(normalizedInstrumentId) ||
      ''
    return {
      instrumentId: normalizedInstrumentId,
      barsVersionToken: resolvedBarsVersionToken,
    }
  }
  const row = db
    .prepare(
      `SELECT id, bars_version_token
         FROM instruments
        WHERE symbol = ?
          AND base_timeframe = ?
        LIMIT 1`,
    )
    .get(
      normalizeText(symbol).toUpperCase(),
      normalizeText(baseTimeframe).toLowerCase(),
    ) as
    | { id?: unknown; bars_version_token?: unknown }
    | undefined
  return {
    instrumentId: normalizeText(row?.id),
    barsVersionToken: normalizeText(row?.bars_version_token),
  }
}

export const persistSpecialTrainingHistorySession = (
  input: PersistSpecialTrainingHistorySessionInput
): string => {
  if (input.questionIds.length !== input.questionCount) {
    throw appError('SPECIAL_TRAINING_HISTORY_PERSIST_FAILED')
  }
  const sessionId = createId()
  const createdAt = new Date(input.createdAtMs).toISOString()
  const orderedEntries = input.questionIds.map((questionId, index) => {
    const question = input.questionsById.get(questionId)
    const entry = input.settledEntriesByQuestionId.get(questionId)
    if (!question || !entry) {
      throw appError('SPECIAL_TRAINING_HISTORY_PERSIST_FAILED')
    }
    return {
      question,
      entry,
      questionNumber: index + 1
    }
  })

  let passedQuestionCount = 0
  let missedQuestionCount = 0
  let timedOutQuestionCount = 0
  let totalDecisionSeconds = 0
  let decisionCount = 0
  let maxConsecutivePasses = 0
  let currentConsecutivePasses = 0
  let finishedAt = createdAt
  const firstQuestion = orderedEntries[0]?.question ?? null
  const effectiveTimeframe =
    normalizeBaseTimeframe(input.timeframe) ??
    normalizeBaseTimeframe(firstQuestion?.effectiveTimeframe) ??
    normalizeBaseTimeframe(firstQuestion?.timeframe) ??
    '1d'
  const minimumBaseTimeframe =
    normalizeBaseTimeframe(firstQuestion?.minimumBaseTimeframe) ??
    effectiveTimeframe
  const sourceTimeframe =
    normalizeBaseTimeframe(firstQuestion?.sourceTimeframe) ??
    normalizeBaseTimeframe(firstQuestion?.timeframe) ??
    effectiveTimeframe

  orderedEntries.forEach(({ entry }) => {
    if (entry.result.passed) {
      passedQuestionCount += 1
      currentConsecutivePasses += 1
      maxConsecutivePasses = Math.max(
        maxConsecutivePasses,
        currentConsecutivePasses
      )
    } else {
      currentConsecutivePasses = 0
      if (
        entry.result.directionResult?.selection === 'OBSERVE' &&
        entry.result.directionResult.actual !== 'OBSERVE'
      ) {
        missedQuestionCount += 1
      }
    }
    if (entry.result.directionResult?.timedOut) {
      timedOutQuestionCount += 1
    }
    const entryDecisionSeconds = entry.result.directionResult
      ? clampNonNegativeNumber(entry.result.directionResult.decisionSecondsUsed)
      : clampNonNegativeNumber(entry.payload.decisionSecondsUsed)
    if (entryDecisionSeconds > 0) {
      totalDecisionSeconds += entryDecisionSeconds
      decisionCount += 1
    }
    if (entry.settledAt > finishedAt) {
      finishedAt = entry.settledAt
    }
  })

  const config = {
    enabledInstrumentIds: input.enabledInstrumentIds,
    horizonBars: input.horizonBars,
    maxOperations: input.maxOperations,
    maxEntries: input.maxEntries,
    decisionSecondsLimit: input.decisionSecondsLimit,
    fastDecisionStrictnessLevel: input.fastDecisionStrictnessLevel,
    fastDecisionDominanceRatio: input.fastDecisionDominanceRatio,
    timeframe: effectiveTimeframe,
    effectiveTimeframe,
    minimumBaseTimeframe,
    sourceTimeframe,
  }
  const sessionSummary = summarizeSpecialTrainingSession(
    input.modeId,
    orderedEntries.map(({ question, entry }) => ({
      question,
      payload: entry.payload,
      result: entry.result,
    })),
  )

  const insertSessionStmt = db.prepare(
    `INSERT INTO special_training_history_sessions (
      id,user_id,challenge_id,bank_id,bank_name,mode_id,simulation_batch_id,source_tag,timeframe,minimum_base_timeframe,source_timeframe,question_count,completed_question_count,
      passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,
      decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,session_summary_json,operator_summary_json,
      created_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
  const insertQuestionStmt = db.prepare(
    `INSERT INTO special_training_history_questions (
      id,session_id,question_order,mode_id,source_tag,symbol,base_timeframe,effective_timeframe,minimum_base_timeframe,instrument_id,bars_version_token,
      window_start_ts,window_end_ts,window_bar_count,source_window_bar_count,start_index,end_index,min_trade_step,
      settlement_status,score,passed,initial_total,total_pnl,final_total_asset,return_rate,used_operations,max_operations,
      max_drawdown_ratio,performance_rate,grade,detail_blob,detail_encoding,created_at,settled_at,updated_at
    ) VALUES (${Array.from({ length: 35 }, () => '?').join(',')})`
  )
  const insertStatsProjectionStmt = db.prepare(
    `INSERT INTO special_training_stats_projection (
      project_id,session_id,question_id,question_order,mode_id,created_at,settled_at,finished_at,symbol,base_timeframe,
      sample_pool_id,sample_pool_name,initial_total,final_equity,total_pnl,profit_rate,return_rate,total_trades,duration_days,
      max_drawdown_rate,passed,decision_seconds_used,decision_count,selection,actual,correct,timed_out,edge_ratio,
      opportunity_edge_ratio,performance_rate,fast_review_grade,survived,comeback,alpha_ratio,first_action_bars,behavior,
      risk_review_grade,curve_points_json,generated_at,detail_expired_at
    ) VALUES (${Array.from({ length: 40 }, () => '?').join(',')})
    ON CONFLICT(project_id) DO UPDATE SET
      session_id = excluded.session_id,
      question_id = excluded.question_id,
      question_order = excluded.question_order,
      mode_id = excluded.mode_id,
      created_at = excluded.created_at,
      settled_at = excluded.settled_at,
      finished_at = excluded.finished_at,
      symbol = excluded.symbol,
      base_timeframe = excluded.base_timeframe,
      sample_pool_id = excluded.sample_pool_id,
      sample_pool_name = excluded.sample_pool_name,
      initial_total = excluded.initial_total,
      final_equity = excluded.final_equity,
      total_pnl = excluded.total_pnl,
      profit_rate = excluded.profit_rate,
      return_rate = excluded.return_rate,
      total_trades = excluded.total_trades,
      duration_days = excluded.duration_days,
      max_drawdown_rate = excluded.max_drawdown_rate,
      passed = excluded.passed,
      decision_seconds_used = excluded.decision_seconds_used,
      decision_count = excluded.decision_count,
      selection = excluded.selection,
      actual = excluded.actual,
      correct = excluded.correct,
      timed_out = excluded.timed_out,
      edge_ratio = excluded.edge_ratio,
      opportunity_edge_ratio = excluded.opportunity_edge_ratio,
      performance_rate = excluded.performance_rate,
      fast_review_grade = excluded.fast_review_grade,
      survived = excluded.survived,
      comeback = excluded.comeback,
      alpha_ratio = excluded.alpha_ratio,
      first_action_bars = excluded.first_action_bars,
      behavior = excluded.behavior,
      risk_review_grade = excluded.risk_review_grade,
      curve_points_json = excluded.curve_points_json,
      generated_at = excluded.generated_at,
      detail_expired_at = excluded.detail_expired_at`
  )

  const persistTx = db.transaction(() => {
    const historyQuestionIds: string[] = []
    insertSessionStmt.run(
      sessionId,
      DEFAULT_USER_ID,
      input.challengeId,
      input.bankId,
      input.bankName,
      input.modeId,
      String(input.simulationBatchId ?? "").trim() || null,
      input.sourceTag,
      effectiveTimeframe,
      minimumBaseTimeframe,
      sourceTimeframe,
      input.questionCount,
      orderedEntries.length,
      passedQuestionCount,
      Math.max(0, orderedEntries.length - passedQuestionCount),
      missedQuestionCount,
      timedOutQuestionCount,
      totalDecisionSeconds,
      decisionCount > 0 ? totalDecisionSeconds / decisionCount : 0,
      maxConsecutivePasses,
      JSON.stringify(config),
      encodeStoredJson(sessionSummary),
      JSON.stringify(
        normalizeStoredOperatorSummary(input.operatorSummary ?? buildHumanOperatorSummary()),
      ),
      createdAt,
      finishedAt,
      finishedAt
    )

    orderedEntries.forEach(({ question, entry, questionNumber }) => {
      const historyQuestionId = createId()
      historyQuestionIds.push(historyQuestionId)
      const finalEquity = clampNonNegativeNumber(entry.result.finalTotalAsset)
      const totalPnl = Number(entry.result.totalPnl) || 0
      const initialTotal = resolveProjectionInitialTotal(
        finalEquity,
        totalPnl,
      )
      const returnRate =
        initialTotal > 0 ? (finalEquity - initialTotal) / initialTotal : 0
      const selection = normalizeProjectionString(
        entry.result.directionResult?.selection
      ).toUpperCase() || null
      const actual = normalizeProjectionString(
        entry.result.directionResult?.actual ?? entry.result.directionResult?.opportunityDirection
      ).toUpperCase() || null
      const correct = Boolean(entry.result.directionResult?.correct)
      const performanceRate = resolveFastPerformanceRate({
        selection,
        actual,
        correct,
        selectedMfeRatio: clampNonNegativeNumber(
          entry.result.directionResult?.selectedMfeRatio
        ),
        selectedMaeRatio: clampNonNegativeNumber(
          entry.result.directionResult?.selectedMaeRatio
        ),
        opportunityMfeRatio: clampNonNegativeNumber(
          entry.result.directionResult?.opportunityMfeRatio
        ),
      })
      const tradeActions = normalizeProjectionTradeActions(entry.payload.tradeActions)
      const riskBehavior = resolveRiskBehavior(tradeActions, question.startIndex)
      const survived = Boolean(entry.result.passed)
      const comeback = survived && returnRate > 0
      const riskReviewGrade = resolveRiskReviewGrade(survived, comeback)
      const alphaRaw = Number(entry.result.alpha)
      const alphaRatio = Number.isFinite(alphaRaw)
        ? Math.abs(alphaRaw) > 1.2 && initialTotal > 0
          ? alphaRaw / initialTotal
          : alphaRaw
        : null
      const instrumentRef = resolveInstrumentHistoryRef(
        question.instrumentId,
        question.symbol,
        question.sourceTimeframe,
        question.barsVersionToken,
      )
      const firstBarTs = normalizeText(question.bars[0]?.ts)
      const lastBarTs = normalizeText(question.bars[question.bars.length - 1]?.ts)
      const detailBlob = encodeSpecialTrainingHistoryQuestionDetailPayload({
        cursorIndex:
          entry.payload.cursorIndex === undefined || entry.payload.cursorIndex === null
            ? null
            : clampNonNegativeInteger(entry.payload.cursorIndex),
        revealEndIndex: entry.result.directionResult?.revealEndIndex ?? null,
        tradeActionCount: tradeActions.length,
        decisionSelection: entry.result.directionResult?.selection ?? null,
        decisionActual: entry.result.directionResult?.actual ?? null,
        decisionCorrect: entry.result.directionResult
          ? entry.result.directionResult.correct
          : null,
        decisionTimedOut: entry.result.directionResult
          ? entry.result.directionResult.timedOut
          : null,
        decisionSecondsUsed:
          entry.result.directionResult?.decisionSecondsUsed ??
          entry.payload.decisionSecondsUsed ??
          null,
        strictnessLevel: entry.result.directionResult?.strictnessLevel ?? null,
        dominanceRatio: entry.result.directionResult?.dominanceRatio ?? null,
        selectedMfeRatio: entry.result.directionResult?.selectedMfeRatio ?? null,
        selectedMaeRatio: entry.result.directionResult?.selectedMaeRatio ?? null,
        selectedMfeMaeRatio:
          entry.result.directionResult?.selectedMfeMaeRatio ?? null,
        opportunityDirection:
          entry.result.directionResult?.opportunityDirection ?? null,
        opportunityMfeRatio:
          entry.result.directionResult?.opportunityMfeRatio ?? null,
        opportunityMaeRatio:
          entry.result.directionResult?.opportunityMaeRatio ?? null,
        opportunityMfeMaeRatio:
          entry.result.directionResult?.opportunityMfeMaeRatio ?? null,
        longMfeRatio: entry.result.directionResult?.longMfeRatio ?? null,
        longMaeRatio: entry.result.directionResult?.longMaeRatio ?? null,
        recoveryRate: entry.result.recoveryRate ?? null,
        alpha: entry.result.alpha ?? null,
        captureRate: entry.result.captureRate ?? null,
        firstActionBars: riskBehavior.bars,
        riskBehavior: riskBehavior.behavior,
        riskReviewGrade,
        feedbackCodes: Array.isArray(entry.result.feedbackCodes)
          ? entry.result.feedbackCodes
              .map((item) => normalizeText(item))
              .filter((item) => item.length > 0)
          : [],
        tradeActions,
        riskReview:
          entry.result.riskReview && typeof entry.result.riskReview === 'object'
            ? (entry.result.riskReview as Record<string, unknown>)
            : null,
        fastReview:
          entry.result.fastReview && typeof entry.result.fastReview === 'object'
            ? (entry.result.fastReview as Record<string, unknown>)
            : null,
      })
      insertQuestionStmt.run(
        historyQuestionId,
        sessionId,
        questionNumber,
        input.modeId,
        input.sourceTag,
        question.symbol,
        question.sourceTimeframe,
        question.effectiveTimeframe,
        question.minimumBaseTimeframe,
        instrumentRef.instrumentId,
        instrumentRef.barsVersionToken,
        firstBarTs || null,
        lastBarTs || null,
        question.effectiveWindowBarCount,
        question.sourceWindowBarCount,
        question.startIndex,
        question.endIndex,
        question.minTradeStep,
        entry.abandoned ? 'ABANDONED' : 'SETTLED',
        entry.result.score,
        entry.result.passed ? 1 : 0,
        initialTotal,
        entry.result.totalPnl,
        entry.result.finalTotalAsset,
        returnRate,
        entry.result.usedOperations,
        entry.result.maxOperations,
        entry.result.maxDrawdownRatio,
        performanceRate,
        entry.result.grade,
        detailBlob,
        SPECIAL_TRAINING_HISTORY_QUESTION_DETAIL_ENCODING,
        createdAt,
        entry.settledAt,
        entry.settledAt
      )
      insertStatsProjectionStmt.run(
        historyQuestionId,
        sessionId,
        historyQuestionId,
        questionNumber,
        input.modeId,
        createdAt,
        entry.settledAt,
        finishedAt,
        question.symbol,
        question.effectiveTimeframe,
        input.bankId || sessionId,
        input.bankName || input.bankId || sessionId,
        initialTotal,
        finalEquity,
        totalPnl,
        returnRate,
        returnRate,
        tradeActions.length,
        0,
        clampNonNegativeNumber(entry.result.maxDrawdownRatio),
        entry.result.passed ? 1 : 0,
        entry.result.directionResult?.decisionSecondsUsed ?? null,
        entry.result.directionResult ? 1 : 0,
        selection,
        actual,
        correct ? 1 : 0,
        entry.result.directionResult?.timedOut ? 1 : 0,
        clampNonNegativeNumber(entry.result.directionResult?.selectedMfeMaeRatio),
        clampNonNegativeNumber(entry.result.directionResult?.opportunityMfeMaeRatio),
        performanceRate,
        entry.result.grade,
        riskReviewGrade === 'F' ? 0 : 1,
        comeback ? 1 : 0,
        alphaRatio,
        riskBehavior.bars,
        riskBehavior.behavior,
        riskReviewGrade,
        JSON.stringify(buildRiskCurvePoints(entry.result.riskReview ?? null, initialTotal)),
        entry.settledAt,
        ''
      )
    })
    assertSpecialTrainingStatsProjectionComplete({
      sessionId,
      expectedQuestionIds: historyQuestionIds,
    })
  })

  persistTx()
  return sessionId
}
