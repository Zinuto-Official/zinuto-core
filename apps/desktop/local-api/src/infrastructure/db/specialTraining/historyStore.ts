// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs } from '@zinuto/shared/marketTime'
import { isSpecialTrainingModeId } from '@zinuto/shared/specialTrainingModes'
import { detectBaseTimeframeFromTimestamps } from '@zinuto/shared/timeframe'
import type { OperatorSummary } from '@zinuto/shared/operatorSummary'

import { db } from '../database.js'
import { getMarketBarsByInstrumentIdTsRange } from '../marketDatabase.js'
import {
  encodeStoredJsonToCompressedBuffer,
  parseStoredJsonSafe
} from '../../../kernel/compressedJson.js'
import {
  parseSpecialTrainingHistoryQuestionDetailPayload,
} from '../specialTrainingHistoryQuestionDetailStorage.js'
import type {
  SpecialTrainingModeId,
  SpecialTrainingQuestionState,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction
} from '../../../domain/specialTraining/contracts.js'
import {
  normalizeSpecialTrainingBaseTimeframe,
  type SpecialTrainingBaseTimeframe,
} from '../../../domain/specialTraining/timeframeSemantics.js'
import {
  type SpecialTrainingPersistedSessionSummary,
} from '../../../domain/specialTraining/sessionSummary.js'
import {
  buildHumanOperatorSummary,
  normalizeOperatorSummary,
} from '../../../domain/operatorSummary.js'

export { persistSpecialTrainingHistorySession } from './historyPersistenceStore.js'

type ListSpecialTrainingHistorySessionsInput = {
  modeId?: SpecialTrainingModeId
  limit?: number
}

type SpecialTrainingHistorySessionRow = {
  id: string
  challenge_id: string
  bank_id: string
  bank_name: string
  mode_id: SpecialTrainingModeId
  simulation_batch_id?: string | null
  source_tag: string
  timeframe: string
  minimum_base_timeframe: string
  source_timeframe: string
  question_count: number
  completed_question_count: number
  passed_question_count: number
  failed_question_count: number
  missed_question_count: number
  timed_out_question_count: number
  decision_seconds_total: number
  decision_seconds_average: number
  max_consecutive_passes: number
  config_json: string
  session_summary_json: unknown
  operator_summary_json: string | null
  created_at: string
  finished_at: string
  updated_at: string
}

type SpecialTrainingHistoryQuestionRow = {
  id: string
  session_id: string
  question_order: number
  mode_id: SpecialTrainingModeId
  source_tag: string
  symbol: string
  base_timeframe: string
  effective_timeframe: string
  minimum_base_timeframe: string
  instrument_id: string
  bars_version_token: string
  window_start_ts: string | null
  window_end_ts: string | null
  window_bar_count: number
  source_window_bar_count: number
  start_index: number
  end_index: number
  min_trade_step: number
  settlement_status: 'SETTLED' | 'ABANDONED'
  score: number
  passed: number
  initial_total: number
  total_pnl: number
  final_total_asset: number
  return_rate: number
  used_operations: number
  max_operations: number
  max_drawdown_ratio: number
  performance_rate: number
  grade: string
  detail_blob?: unknown
  detail_encoding?: string
  detail_expired_at?: string | null
  created_at: string
  settled_at: string
  updated_at: string
}

type SpecialTrainingQuestionSnapshotArchiveRow = {
  question_id: string
  snapshot_payload: unknown
}

type ReplayHydrationStatus = 'READY' | 'SOURCE_CHANGED' | 'SOURCE_MISSING' | 'SNAPSHOT_ONLY' | 'EXPIRED'

export type SpecialTrainingHistorySessionSummary = {
  id: string
  challengeId: string
  bankId: string
  bankName: string
  modeId: SpecialTrainingModeId
  sourceTag: string
  timeframe: string
  effectiveTimeframe: SpecialTrainingBaseTimeframe | null
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe | null
  sourceTimeframe: SpecialTrainingBaseTimeframe | null
  questionCount: number
  completedQuestionCount: number
  passedQuestionCount: number
  failedQuestionCount: number
  missedQuestionCount: number
  timedOutQuestionCount: number
  decisionSecondsTotal: number
  decisionSecondsAverage: number
  maxConsecutivePasses: number
  createdAt: string
  finishedAt: string
  updatedAt: string
  config: Record<string, unknown>
  sessionSummary: SpecialTrainingPersistedSessionSummary | null
  operatorSummary: OperatorSummary
}

export type SpecialTrainingHistoryQuestionSummary = {
  id: string
  sessionId: string
  questionOrder: number
  symbol: string
  timeframe: string
  baseTimeframe: '1m' | '5m' | '1h' | '1d' | null
  effectiveTimeframe: '1m' | '5m' | '1h' | '1d' | null
  minimumBaseTimeframe: '1m' | '5m' | '1h' | '1d' | null
  sourceTimeframe: '1m' | '5m' | '1h' | '1d' | null
  startIndex: number
  endIndex: number
  minTradeStep: number
  settlementStatus: 'SETTLED' | 'ABANDONED'
  score: number
  passed: boolean
  totalPnl: number
  finalTotalAsset: number
  usedOperations: number
  maxOperations: number
  maxDrawdownRatio: number
  performanceRate: number
  grade: string
  createdAt: string
  settledAt: string
  updatedAt: string
}

export type SpecialTrainingHistoryQuestionDetail = {
  id: string
  sessionId: string
  questionOrder: number
  symbol: string
  timeframe: string
  baseTimeframe: '1m' | '5m' | '1h' | '1d' | null
  effectiveTimeframe: '1m' | '5m' | '1h' | '1d' | null
  minimumBaseTimeframe: '1m' | '5m' | '1h' | '1d' | null
  sourceTimeframe: '1m' | '5m' | '1h' | '1d' | null
  bars: SpecialTrainingQuestionState['bars']
  startIndex: number
  endIndex: number
  cursorIndex: number | null
  revealEndIndex: number | null
  minTradeStep: number
  settlementStatus: 'SETTLED' | 'ABANDONED'
  score: number
  passed: boolean
  totalPnl: number
  finalTotalAsset: number
  usedOperations: number
  maxOperations: number
  decisionSelection: string | null
  decisionActual: string | null
  decisionCorrect: boolean | null
  decisionTimedOut: boolean | null
  decisionSecondsUsed: number | null
  strictnessLevel: string | null
  dominanceRatio: number | null
  selectedMfeRatio: number | null
  selectedMaeRatio: number | null
  selectedMfeMaeRatio: number | null
  opportunityDirection: string | null
  opportunityMfeRatio: number | null
  opportunityMaeRatio: number | null
  opportunityMfeMaeRatio: number | null
  longMfeRatio: number | null
  longMaeRatio: number | null
  recoveryRate: number | null
  alpha: number | null
  captureRate: number | null
  maxDrawdownRatio: number
  grade: string
  feedbackCodes: string[]
  riskReview: SpecialTrainingSettlementResult['riskReview'] | null
  fastReview: SpecialTrainingSettlementResult['fastReview'] | null
  tradeActions: SpecialTrainingTradeAction[]
  replayHydrationStatus?: ReplayHydrationStatus
  detailExpiredAt?: string | null
  createdAt: string
  settledAt: string
  updatedAt: string
}

export type SpecialTrainingHistorySessionDetail =
  SpecialTrainingHistorySessionSummary & {
    questions: SpecialTrainingHistoryQuestionSummary[]
  }

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

const normalizeStoredOperatorSummary = (
  value: unknown
): OperatorSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return buildHumanOperatorSummary()
  }
  return normalizeOperatorSummary(value)
}

const clampListLimit = (value: unknown): number => {
  const numeric = Math.floor(toFiniteNumber(value))
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 50
  }
  return Math.max(1, Math.min(200, numeric))
}

const parseJsonRecord = (raw: unknown): Record<string, unknown> =>
  parseStoredJsonSafe<Record<string, unknown>>(raw, {})

const parseJsonValue = <T,>(raw: unknown, fallback: T): T =>
  parseStoredJsonSafe<T>(raw, fallback)

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

const hasInstrumentById = (instrumentId: string): boolean => {
  const normalizedInstrumentId = normalizeText(instrumentId)
  if (!normalizedInstrumentId) {
    return false
  }
  const row = db
    .prepare(
      `SELECT 1
         FROM instruments
        WHERE id = ?
        LIMIT 1`,
    )
    .get(normalizedInstrumentId) as { 1?: unknown } | undefined
  return Boolean(row)
}

export const saveSpecialTrainingQuestionSnapshotArchive = (
  questionId: string,
  snapshot: Record<string, unknown> | null,
  timestamp: string,
  sourceManifestHash = '',
): boolean => {
  const normalizedQuestionId = normalizeText(questionId)
  if (!normalizedQuestionId || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    if (normalizedQuestionId) {
      db.prepare(
        'DELETE FROM special_training_question_snapshot_archives WHERE question_id = ?',
      ).run(normalizedQuestionId)
    }
    return false
  }
  const sourceJson = JSON.stringify(snapshot)
  const sourceBytes = Buffer.byteLength(sourceJson, 'utf-8')
  const snapshotPayload = encodeStoredJsonToCompressedBuffer(snapshot)
  db.prepare(
    `INSERT INTO special_training_question_snapshot_archives (
      question_id,source_manifest_hash,snapshot_encoding,snapshot_payload,source_bytes,snapshot_bytes,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(question_id) DO UPDATE SET
      source_manifest_hash = excluded.source_manifest_hash,
      snapshot_encoding = excluded.snapshot_encoding,
      snapshot_payload = excluded.snapshot_payload,
      source_bytes = excluded.source_bytes,
      snapshot_bytes = excluded.snapshot_bytes,
      updated_at = excluded.updated_at`,
  ).run(
    normalizedQuestionId,
    normalizeText(sourceManifestHash),
    'GZIP_JSON_V1',
    snapshotPayload,
    sourceBytes,
    snapshotPayload.byteLength,
    timestamp,
    timestamp,
  )
  return true
}

export const loadSpecialTrainingQuestionSnapshotArchive = (
  questionId: string,
): Record<string, unknown> | null => {
  const normalizedQuestionId = normalizeText(questionId)
  if (!normalizedQuestionId) {
    return null
  }
  const row = db
    .prepare(
      `SELECT question_id,snapshot_payload
         FROM special_training_question_snapshot_archives
        WHERE question_id = ?
        LIMIT 1`,
    )
    .get(normalizedQuestionId) as SpecialTrainingQuestionSnapshotArchiveRow | undefined
  if (!row) {
    return null
  }
  const parsed = parseStoredJsonSafe<Record<string, unknown> | null>(
    row.snapshot_payload,
    null,
  )
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed
    : null
}

const loadHydratedQuestionBars = async (
  row: SpecialTrainingHistoryQuestionRow,
): Promise<{
  bars: SpecialTrainingQuestionState['bars']
  replayHydrationStatus: ReplayHydrationStatus
}> => {
  const instrumentExists = hasInstrumentById(row.instrument_id)
  const currentBarsVersionToken = getInstrumentBarsVersionToken(row.instrument_id)
  const replayHydrationStatus: ReplayHydrationStatus = !instrumentExists
    ? 'SOURCE_MISSING'
    : row.bars_version_token.trim() &&
        currentBarsVersionToken?.trim() &&
        currentBarsVersionToken.trim() !== row.bars_version_token.trim()
      ? 'SOURCE_CHANGED'
      : 'READY'
  const loadSnapshotBars = (): SpecialTrainingQuestionState['bars'] => {
    const portableSnapshot = loadSpecialTrainingQuestionSnapshotArchive(row.id)
    const snapshotBars = Array.isArray((portableSnapshot as { bars?: unknown })?.bars)
      ? (((portableSnapshot as { bars?: unknown[] }).bars ?? []) as SpecialTrainingQuestionState['bars'])
      : ([] as SpecialTrainingQuestionState['bars'])
    return Array.isArray(snapshotBars) ? snapshotBars : []
  }
  if (
    replayHydrationStatus === 'SOURCE_MISSING' ||
    !normalizeText(row.instrument_id) ||
    !normalizeText(row.window_start_ts) ||
    !normalizeText(row.window_end_ts)
  ) {
    const snapshotBars = loadSnapshotBars()
    return {
      bars: snapshotBars,
      replayHydrationStatus:
        snapshotBars.length > 0
          ? 'SNAPSHOT_ONLY'
          : 'SOURCE_MISSING',
    }
  }
  const bars = await getMarketBarsByInstrumentIdTsRange(
    normalizeText(row.instrument_id),
    normalizeText(row.window_start_ts),
    normalizeText(row.window_end_ts),
  )
  if (Array.isArray(bars) && bars.length > 0) {
    return {
      bars,
      replayHydrationStatus,
    }
  }
  const snapshotBars = loadSnapshotBars()
  return {
    bars: snapshotBars,
    replayHydrationStatus:
      snapshotBars.length > 0
        ? 'SNAPSHOT_ONLY'
        : 'SOURCE_MISSING',
  }
}

const parseSessionSummary = (
  raw: unknown,
): SpecialTrainingPersistedSessionSummary | null => {
  const parsed = parseStoredJsonSafe<SpecialTrainingPersistedSessionSummary | null>(
    raw,
    null,
  )
  if (!parsed || typeof parsed !== 'object') {
    return null
  }
  const modeId = normalizeText((parsed as { modeId?: unknown }).modeId)
  const version = Number((parsed as { version?: unknown }).version)
  if (version !== 1 || !isSpecialTrainingModeId(modeId)) {
    return null
  }
  return parsed
}

export type ClearSpecialTrainingHistoryResult = {
  deletedSessionRows: number
  deletedQuestionRows: number
  deletedProjectionRows: number
}

const normalizeBaseTimeframe = (
  value: unknown,
): '1m' | '5m' | '1h' | '1d' | null => {
  return normalizeSpecialTrainingBaseTimeframe(value)
}

const resolveSpecialTrainingHistoryBaseTimeframe = (input: {
  timeframe?: unknown
  bars?: SpecialTrainingQuestionState['bars']
}): '1m' | '5m' | '1h' | '1d' | null => {
  const candidateBars = Array.isArray(input.bars) ? input.bars : []
  if (candidateBars.length >= 3) {
    const timestamps = candidateBars
      .slice(0, Math.min(candidateBars.length, 240))
      .map((bar) => parseTimestampMs(String(bar?.ts ?? '')))
      .filter((value): value is number => Number.isFinite(value))
    const detected = detectBaseTimeframeFromTimestamps(timestamps)
    if (detected) {
      return detected
    }
  }
  return normalizeBaseTimeframe(input.timeframe)
}

const resolvePersistedHistoryTimeframe = (
  value: unknown,
): SpecialTrainingBaseTimeframe | null => normalizeBaseTimeframe(value)

const mapSessionSummary = (
  row: SpecialTrainingHistorySessionRow
): SpecialTrainingHistorySessionSummary => {
  const rawOperatorSummary = parseJsonValue<OperatorSummary | null>(
    row.operator_summary_json,
    null,
  )
  return {
    id: row.id,
    challengeId: row.challenge_id,
    bankId: normalizeText(row.bank_id),
    bankName: normalizeText(row.bank_name),
    modeId: row.mode_id,
    sourceTag: row.source_tag,
    timeframe: row.timeframe,
    effectiveTimeframe: resolvePersistedHistoryTimeframe(row.timeframe),
    minimumBaseTimeframe: resolvePersistedHistoryTimeframe(
      row.minimum_base_timeframe,
    ),
    sourceTimeframe: resolvePersistedHistoryTimeframe(row.source_timeframe),
    questionCount: clampNonNegativeInteger(row.question_count),
    completedQuestionCount: clampNonNegativeInteger(row.completed_question_count),
    passedQuestionCount: clampNonNegativeInteger(row.passed_question_count),
    failedQuestionCount: clampNonNegativeInteger(row.failed_question_count),
    missedQuestionCount: clampNonNegativeInteger(row.missed_question_count),
    timedOutQuestionCount: clampNonNegativeInteger(row.timed_out_question_count),
    decisionSecondsTotal: clampNonNegativeNumber(row.decision_seconds_total),
    decisionSecondsAverage: clampNonNegativeNumber(row.decision_seconds_average),
    maxConsecutivePasses: clampNonNegativeInteger(row.max_consecutive_passes),
    createdAt: normalizeText(row.created_at),
    finishedAt: normalizeText(row.finished_at),
    updatedAt: normalizeText(row.updated_at),
    config: parseJsonRecord(row.config_json),
    sessionSummary: parseSessionSummary(row.session_summary_json),
    operatorSummary: rawOperatorSummary
      ? normalizeStoredOperatorSummary(rawOperatorSummary)
      : buildHumanOperatorSummary(),
  }
}

const mapQuestionSummary = (
  row: SpecialTrainingHistoryQuestionRow,
): SpecialTrainingHistoryQuestionSummary => ({
  id: row.id,
  sessionId: row.session_id,
  questionOrder: clampNonNegativeInteger(row.question_order),
  symbol: row.symbol,
  timeframe: row.effective_timeframe,
  baseTimeframe: resolveSpecialTrainingHistoryBaseTimeframe({
    timeframe: row.base_timeframe,
  }),
  effectiveTimeframe: resolvePersistedHistoryTimeframe(row.effective_timeframe),
  minimumBaseTimeframe: resolvePersistedHistoryTimeframe(
    row.minimum_base_timeframe,
  ),
  sourceTimeframe: resolvePersistedHistoryTimeframe(row.base_timeframe),
  startIndex: clampNonNegativeInteger(row.start_index),
  endIndex: clampNonNegativeInteger(row.end_index),
  minTradeStep: clampNonNegativeNumber(row.min_trade_step),
  settlementStatus: row.settlement_status,
  score: Number(row.score) || 0,
  passed: Number(row.passed) === 1,
  totalPnl: Number(row.total_pnl) || 0,
  finalTotalAsset: Number(row.final_total_asset) || 0,
  usedOperations: clampNonNegativeInteger(row.used_operations),
  maxOperations: clampNonNegativeInteger(row.max_operations),
  maxDrawdownRatio: clampNonNegativeNumber(row.max_drawdown_ratio),
  performanceRate: clampNonNegativeNumber(row.performance_rate),
  grade: normalizeText(row.grade),
  createdAt: normalizeText(row.created_at),
  settledAt: normalizeText(row.settled_at),
  updatedAt: normalizeText(row.updated_at),
})

const mapQuestionDetail = async (
  row: SpecialTrainingHistoryQuestionRow,
): Promise<SpecialTrainingHistoryQuestionDetail> => {
  const detailExpiredAt = normalizeText(row.detail_expired_at) || null
  const isDetailExpired = Boolean(detailExpiredAt) || !row.detail_blob
  const detail = parseSpecialTrainingHistoryQuestionDetailPayload(
    row.detail_blob,
  )
  const { bars, replayHydrationStatus } = isDetailExpired
    ? {
        bars: [] as SpecialTrainingQuestionState['bars'],
        replayHydrationStatus: 'EXPIRED' as ReplayHydrationStatus,
      }
    : await loadHydratedQuestionBars(row)
  return {
    id: row.id,
    sessionId: row.session_id,
    questionOrder: clampNonNegativeInteger(row.question_order),
    symbol: row.symbol,
    timeframe: row.effective_timeframe,
    baseTimeframe: resolveSpecialTrainingHistoryBaseTimeframe({
      timeframe: row.base_timeframe,
      bars,
    }),
    effectiveTimeframe: resolvePersistedHistoryTimeframe(row.effective_timeframe),
    minimumBaseTimeframe: resolvePersistedHistoryTimeframe(
      row.minimum_base_timeframe,
    ),
    sourceTimeframe: resolvePersistedHistoryTimeframe(row.base_timeframe),
    bars,
    startIndex: clampNonNegativeInteger(row.start_index),
    endIndex: clampNonNegativeInteger(row.end_index),
    cursorIndex:
      detail.cursorIndex === null
        ? null
        : clampNonNegativeInteger(detail.cursorIndex),
    revealEndIndex:
      detail.revealEndIndex === null
        ? null
        : clampNonNegativeInteger(detail.revealEndIndex),
    minTradeStep: clampNonNegativeNumber(row.min_trade_step),
    settlementStatus: row.settlement_status,
    score: Number(row.score) || 0,
    passed: Number(row.passed) === 1,
    totalPnl: Number(row.total_pnl) || 0,
    finalTotalAsset: Number(row.final_total_asset) || 0,
    usedOperations: clampNonNegativeInteger(row.used_operations),
    maxOperations: clampNonNegativeInteger(row.max_operations),
    decisionSelection: detail.decisionSelection,
    decisionActual: detail.decisionActual,
    decisionCorrect: detail.decisionCorrect,
    decisionTimedOut: detail.decisionTimedOut,
    decisionSecondsUsed:
      detail.decisionSecondsUsed === null
        ? null
        : clampNonNegativeNumber(detail.decisionSecondsUsed),
    strictnessLevel: detail.strictnessLevel,
    dominanceRatio:
      detail.dominanceRatio === null
        ? null
        : clampNonNegativeNumber(detail.dominanceRatio),
    selectedMfeRatio:
      detail.selectedMfeRatio === null
        ? null
        : clampNonNegativeNumber(detail.selectedMfeRatio),
    selectedMaeRatio:
      detail.selectedMaeRatio === null
        ? null
        : clampNonNegativeNumber(detail.selectedMaeRatio),
    selectedMfeMaeRatio:
      detail.selectedMfeMaeRatio === null
        ? null
        : clampNonNegativeNumber(detail.selectedMfeMaeRatio),
    opportunityDirection: detail.opportunityDirection,
    opportunityMfeRatio:
      detail.opportunityMfeRatio === null
        ? null
        : clampNonNegativeNumber(detail.opportunityMfeRatio),
    opportunityMaeRatio:
      detail.opportunityMaeRatio === null
        ? null
        : clampNonNegativeNumber(detail.opportunityMaeRatio),
    opportunityMfeMaeRatio:
      detail.opportunityMfeMaeRatio === null
        ? null
        : clampNonNegativeNumber(detail.opportunityMfeMaeRatio),
    longMfeRatio:
      detail.longMfeRatio === null
        ? null
        : clampNonNegativeNumber(detail.longMfeRatio),
    longMaeRatio:
      detail.longMaeRatio === null
        ? null
        : clampNonNegativeNumber(detail.longMaeRatio),
    recoveryRate:
      detail.recoveryRate === null
        ? null
        : clampNonNegativeNumber(detail.recoveryRate),
    alpha: detail.alpha === null ? null : Number(detail.alpha) || 0,
    captureRate:
      detail.captureRate === null
        ? null
        : clampNonNegativeNumber(detail.captureRate),
    maxDrawdownRatio: clampNonNegativeNumber(row.max_drawdown_ratio),
    grade: normalizeText(row.grade),
    feedbackCodes: detail.feedbackCodes,
    riskReview:
      detail.riskReview as SpecialTrainingSettlementResult['riskReview'] | null,
    fastReview:
      detail.fastReview as SpecialTrainingSettlementResult['fastReview'] | null,
    tradeActions: isDetailExpired ? [] : detail.tradeActions,
    replayHydrationStatus,
    detailExpiredAt,
    createdAt: normalizeText(row.created_at),
    settledAt: normalizeText(row.settled_at),
    updatedAt: normalizeText(row.updated_at),
  }
}

export const clearSpecialTrainingHistorySessions = (options?: {
  modeId?: SpecialTrainingModeId
}): ClearSpecialTrainingHistoryResult => {
  const normalizedModeId = isSpecialTrainingModeId(options?.modeId)
    ? options?.modeId
    : null

  const clearTx = db.transaction(() => {
    if (normalizedModeId) {
      const deletedProjectionRows = db
        .prepare('DELETE FROM special_training_stats_projection WHERE mode_id = ?')
        .run(normalizedModeId).changes
      const scopedSessionRows = db
        .prepare(
          `SELECT id
             FROM special_training_history_sessions
            WHERE mode_id = ?`
        )
        .all(normalizedModeId) as Array<{ id: string }>
      const scopedSessionIds = scopedSessionRows
        .map((row) => normalizeText(row.id))
        .filter((sessionId) => sessionId.length > 0)
      if (!scopedSessionIds.length) {
        return {
          deletedSessionRows: 0,
          deletedQuestionRows: 0,
          deletedProjectionRows,
        } satisfies ClearSpecialTrainingHistoryResult
      }
      const placeholders = scopedSessionIds.map(() => '?').join(',')
      const deletedQuestionRows = db
        .prepare(
          `DELETE FROM special_training_history_questions
            WHERE session_id IN (${placeholders})`
        )
        .run(...scopedSessionIds).changes
      const deletedSessionRows = db
        .prepare(
          `DELETE FROM special_training_history_sessions
            WHERE id IN (${placeholders})`
        )
        .run(...scopedSessionIds).changes
      return {
        deletedSessionRows,
        deletedQuestionRows,
        deletedProjectionRows,
      } satisfies ClearSpecialTrainingHistoryResult
    }

    const deletedProjectionRows = db
      .prepare('DELETE FROM special_training_stats_projection')
      .run().changes
    const deletedQuestionRows = db
      .prepare('DELETE FROM special_training_history_questions')
      .run().changes
    const deletedSessionRows = db
      .prepare('DELETE FROM special_training_history_sessions')
      .run().changes
    return {
      deletedSessionRows,
      deletedQuestionRows,
      deletedProjectionRows,
    } satisfies ClearSpecialTrainingHistoryResult
  })

  return clearTx()
}

export const listSpecialTrainingHistorySessions = (
  input: ListSpecialTrainingHistorySessionsInput = {}
): SpecialTrainingHistorySessionSummary[] => {
  const limit = clampListLimit(input.limit)
  const modeId = isSpecialTrainingModeId(input.modeId) ? input.modeId : null
  const rows = modeId
    ? (db
        .prepare(
          `SELECT id,challenge_id,bank_id,bank_name,mode_id,source_tag,timeframe,minimum_base_timeframe,source_timeframe,question_count,completed_question_count,
                  passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,
                  decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,session_summary_json,operator_summary_json,
                  created_at,finished_at,updated_at
             FROM special_training_history_sessions
            WHERE mode_id = ?
            ORDER BY finished_at DESC, id DESC
            LIMIT ?`
        )
        .all(modeId, limit) as SpecialTrainingHistorySessionRow[])
    : (db
        .prepare(
          `SELECT id,challenge_id,bank_id,bank_name,mode_id,source_tag,timeframe,minimum_base_timeframe,source_timeframe,question_count,completed_question_count,
                  passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,
                  decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,session_summary_json,operator_summary_json,
                  created_at,finished_at,updated_at
             FROM special_training_history_sessions
            ORDER BY finished_at DESC, id DESC
            LIMIT ?`
        )
        .all(limit) as SpecialTrainingHistorySessionRow[])
  return rows.map(mapSessionSummary)
}

export const getSpecialTrainingHistorySessionSummaryById = (
  sessionId: string
): SpecialTrainingHistorySessionSummary | null => {
  const normalizedId = normalizeText(sessionId)
  if (!normalizedId) {
    return null
  }

  const sessionRow = db
    .prepare(
    `SELECT id,challenge_id,bank_id,bank_name,mode_id,source_tag,timeframe,minimum_base_timeframe,source_timeframe,question_count,completed_question_count,
              passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,
              decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,session_summary_json,operator_summary_json,
              created_at,finished_at,updated_at
         FROM special_training_history_sessions
        WHERE id = ?
        LIMIT 1`
    )
    .get(normalizedId) as SpecialTrainingHistorySessionRow | undefined
  if (!sessionRow) {
    return null
  }
  return mapSessionSummary(sessionRow)
}

export const getSpecialTrainingHistorySessionById = async (
  sessionId: string
): Promise<SpecialTrainingHistorySessionDetail | null> => {
  const sessionSummary = getSpecialTrainingHistorySessionSummaryById(sessionId)
  if (!sessionSummary) {
    return null
  }
  const questionRows = db
    .prepare(
      `SELECT id,session_id,question_order,mode_id,source_tag,symbol,base_timeframe,effective_timeframe,minimum_base_timeframe,instrument_id,bars_version_token,
              window_start_ts,window_end_ts,window_bar_count,source_window_bar_count,start_index,end_index,min_trade_step,settlement_status,
              score,passed,initial_total,total_pnl,final_total_asset,return_rate,used_operations,max_operations,
              max_drawdown_ratio,performance_rate,grade,detail_expired_at,created_at,settled_at,updated_at
         FROM special_training_history_questions
        WHERE session_id = ?
        ORDER BY question_order ASC, id ASC`
    )
    .all(sessionSummary.id) as SpecialTrainingHistoryQuestionRow[]

  return {
    ...sessionSummary,
    questions: questionRows.map((row) => mapQuestionSummary(row)),
  }
}

export const getSpecialTrainingHistoryQuestionDetailById = async (
  questionId: string,
): Promise<SpecialTrainingHistoryQuestionDetail | null> => {
  const normalizedQuestionId = normalizeText(questionId)
  if (!normalizedQuestionId) {
    return null
  }
  const row = db
    .prepare(
      `SELECT id,session_id,question_order,mode_id,source_tag,symbol,base_timeframe,effective_timeframe,minimum_base_timeframe,instrument_id,bars_version_token,
              window_start_ts,window_end_ts,window_bar_count,source_window_bar_count,start_index,end_index,min_trade_step,settlement_status,
              score,passed,initial_total,total_pnl,final_total_asset,return_rate,used_operations,max_operations,
              max_drawdown_ratio,performance_rate,grade,detail_blob,detail_encoding,detail_expired_at,created_at,settled_at,updated_at
         FROM special_training_history_questions
        WHERE id = ?
        LIMIT 1`,
    )
    .get(normalizedQuestionId) as SpecialTrainingHistoryQuestionRow | undefined
  if (!row) {
    return null
  }
  return mapQuestionDetail(row)
}
