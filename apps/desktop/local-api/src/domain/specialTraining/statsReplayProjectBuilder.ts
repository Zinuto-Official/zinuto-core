// SPDX-License-Identifier: GPL-3.0-only

import {
  buildRiskDisciplineRuntimeSeed,
  executeSpecialTrainingRiskOrder,
  resolveSpecialTrainingRiskOrderEstimate,
} from '@zinuto/shared/domain-calculations/special-training-risk';
import type { TrainingSummaryPayload } from '../training/summary.js';
import type {
  SpecialTrainingHistoryQuestionDetail,
  SpecialTrainingHistorySessionSummary,
} from './historyTypes.js';
import type { ChallengeStatsProjectDetail } from './statsContracts.js';

const DEFAULT_SPECIAL_TRAINING_INITIAL_TOTAL = 100000;

type SpecialTrainingDecisionSelection = 'LONG' | 'SHORT' | 'OBSERVE';

type SpecialTrainingReplayFill = {
  id: string;
  order_id: string;
  session_id: string;
  instrument_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  fill_index: number;
  fill_time: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  created_at: string;
};

const toRecordOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

const toNullableFiniteNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeDecisionSelection = (
  value: unknown,
): SpecialTrainingDecisionSelection | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (
    normalized === 'LONG' ||
    normalized === 'SHORT' ||
    normalized === 'OBSERVE'
  ) {
    return normalized;
  }
  return null;
};

const buildFastDecisionReplayOverlayContext = (input: {
  bars: Array<{ open?: unknown; close?: unknown }>;
  startIndex: number;
  revealEndIndex: number;
  decisionSelection: SpecialTrainingDecisionSelection | null;
  decisionActual: SpecialTrainingDecisionSelection | null;
  selectedMfeRatio: number;
  selectedMaeRatio: number;
  longMfeRatio: number;
  longMaeRatio: number;
  correct: boolean | null;
}): Record<string, unknown> | null => {
  const bars = Array.isArray(input.bars) ? input.bars : [];
  if (!bars.length) {
    return null;
  }
  const maxIndex = Math.max(0, bars.length - 1);
  const safeStartIndex = clamp(Math.floor(input.startIndex || 0), 0, maxIndex);
  const safeRevealEndIndex = clamp(
    Math.floor(input.revealEndIndex || safeStartIndex),
    safeStartIndex,
    maxIndex,
  );
  let fastDecisionExtremeRay: Record<string, unknown> | null = null;
  if (safeRevealEndIndex > safeStartIndex) {
    const revealBars = bars.slice(safeStartIndex + 1, safeRevealEndIndex + 1);
    let revealMaxOpenClose = Number.NEGATIVE_INFINITY;
    let revealMinOpenClose = Number.POSITIVE_INFINITY;
    revealBars.forEach((bar) => {
      const open = toFiniteNumber(bar?.open);
      const close = toFiniteNumber(bar?.close);
      if (Number.isFinite(open) && Number.isFinite(close)) {
        revealMaxOpenClose = Math.max(revealMaxOpenClose, open, close);
        revealMinOpenClose = Math.min(revealMinOpenClose, open, close);
        return;
      }
      if (Number.isFinite(open)) {
        revealMaxOpenClose = Math.max(revealMaxOpenClose, open);
        revealMinOpenClose = Math.min(revealMinOpenClose, open);
        return;
      }
      if (Number.isFinite(close)) {
        revealMaxOpenClose = Math.max(revealMaxOpenClose, close);
        revealMinOpenClose = Math.min(revealMinOpenClose, close);
      }
    });
    if (
      Number.isFinite(revealMaxOpenClose) &&
      Number.isFinite(revealMinOpenClose)
    ) {
      let profitUsesUpperLine = input.decisionSelection !== 'SHORT';
      if (input.decisionSelection === 'OBSERVE') {
        // OBSERVE has no user-side direction; use the realized (actual)
        // position direction instead of guessing from MFE/MAE ratios.
        profitUsesUpperLine = input.decisionActual !== 'SHORT';
      }
      const baselinePrice = toFiniteNumber(bars[safeStartIndex]?.close);
      const profitPrice = profitUsesUpperLine
        ? revealMaxOpenClose
        : revealMinOpenClose;
      const drawdownPrice = profitUsesUpperLine
        ? revealMinOpenClose
        : revealMaxOpenClose;
      if (
        Number.isFinite(baselinePrice) &&
        Number.isFinite(profitPrice) &&
        Number.isFinite(drawdownPrice)
      ) {
        fastDecisionExtremeRay = {
          profitPrice,
          drawdownPrice,
          baselinePrice,
          profitRatio: input.selectedMfeRatio,
          drawdownRatio: input.selectedMaeRatio,
        };
      }
    }
  }

  return {
    decisionBoundaryRawIndex: safeStartIndex,
    decisionMarker: input.decisionSelection
      ? {
          selection: input.decisionSelection,
          label: input.decisionSelection,
          displayText: input.decisionSelection,
        }
      : null,
    fastDecisionExtremeRay,
    riskDisciplineGuides: null,
    fastDecisionReview:
      input.decisionSelection && input.decisionActual
        ? {
            selection: input.decisionSelection,
            actual: input.decisionActual,
            selectedMfeRatio: input.selectedMfeRatio,
            selectedMaeRatio: input.selectedMaeRatio,
            correct: Boolean(input.correct),
          }
        : null,
  };
};

const buildRiskDisciplineReplayOverlayContext = (
  question: SpecialTrainingHistoryQuestionDetail,
): Record<string, unknown> | null => {
  const riskReviewRecord = toRecordOrNull(question.riskReview);
  const costBasisShift = toRecordOrNull(riskReviewRecord?.costBasisShift);
  const baselinePrice =
    toNullableFiniteNumber(
      costBasisShift?.initialCostBasis ?? costBasisShift?.initialAvgCost,
    ) ?? null;
  const currentCostPrice =
    toNullableFiniteNumber(
      costBasisShift?.finalCostBasis ?? costBasisShift?.finalAvgCost,
    ) ?? null;
  return {
    decisionBoundaryRawIndex: -1,
    decisionMarker: null,
    fastDecisionExtremeRay: null,
    riskDisciplineGuides:
      baselinePrice !== null || currentCostPrice !== null
        ? {
            baselinePrice,
            currentCostPrice,
            baselineTagText: 'BASE',
            currentCostTagText: 'COST',
          }
        : null,
  };
};

const buildRiskDisciplineReplayFills = (input: {
  question: SpecialTrainingHistoryQuestionDetail;
  bindingId: string;
  createdAt: string;
  visibleEndIndex: number;
}): SpecialTrainingReplayFill[] => {
  const { question, bindingId, createdAt, visibleEndIndex } = input;
  const fills: SpecialTrainingReplayFill[] = [];
  const bars = Array.isArray(question.bars) ? question.bars : [];
  if (!bars.length) {
    return fills;
  }

  const seed = buildRiskDisciplineRuntimeSeed({
    bars,
    startIndex: question.startIndex,
    minTradeStep: question.minTradeStep,
  });
  let runtime = {
    cashBalance: seed?.cashBalance ?? DEFAULT_SPECIAL_TRAINING_INITIAL_TOTAL,
    positionQty: seed?.positionQty ?? 0,
    entryPrice: seed?.entryPrice ?? Number.NaN,
    usedOperations: 0,
    openCount: seed && seed.positionQty > 0 ? 1 : 0,
  };

  if (seed) {
    const baselineTime =
      String(bars[Math.max(0, Math.floor(question.startIndex) || 0)]?.ts || createdAt) ||
      createdAt;
    fills.push({
      id: `${bindingId}-fill-baseline`,
      order_id: `${bindingId}-order-baseline`,
      session_id: bindingId,
      instrument_id: bindingId,
      symbol: question.symbol,
      side: 'BUY',
      fill_index: Math.max(0, Math.floor(question.startIndex) || 0),
      fill_time: baselineTime,
      fill_price: seed.entryPrice,
      fill_qty: seed.positionQty,
      contract_multiplier: 1,
      fee: 0,
      tax: 0,
      slippage: 0,
      created_at: baselineTime,
    });
  }

  const tradeActions = (Array.isArray(question.tradeActions) ? question.tradeActions : [])
    .map((action) => ({
      type: action.type,
      barIndex: Math.max(0, Math.floor(toFiniteNumber(action.barIndex))),
      inputMode: action.inputMode === 'LOT' || action.inputMode === 'AMOUNT' ? action.inputMode : 'RATIO',
      priceMode: action.priceMode === 'NEXT_OPEN' ? 'NEXT_OPEN' : 'CUR_CLOSE',
      lotInput: action.lotInput ?? null,
      amountInput: action.amountInput ?? null,
      ratioInput: action.ratioInput ?? null,
      quantity: Math.max(0, Number(action.quantity) || 0),
      executionPrice: Math.max(0, Number(action.executionPrice) || 0),
      cashEffect: Math.max(0, Number(action.cashEffect) || 0),
    }))
    .filter(
      (
        action,
      ): action is {
        type: 'BUY' | 'SELL';
        barIndex: number;
        inputMode: 'LOT' | 'AMOUNT' | 'RATIO';
        priceMode: 'CUR_CLOSE' | 'NEXT_OPEN';
        lotInput: string | number | null;
        amountInput: string | number | null;
        ratioInput: string | number | null;
        quantity: number;
        executionPrice: number;
        cashEffect: number;
      } =>
        (action.type === 'BUY' || action.type === 'SELL') &&
        Number.isFinite(action.barIndex) &&
        action.barIndex >= Math.max(0, Math.floor(question.startIndex) || 0) &&
        action.barIndex <= visibleEndIndex,
    )
    .sort((left, right) => left.barIndex - right.barIndex);

  tradeActions.forEach((action, index) => {
    const markPrice = toFiniteNumber(bars[action.barIndex]?.close);
    if (!Number.isFinite(markPrice) || markPrice <= 0) {
      return;
    }
    const fillTime = String(bars[action.barIndex]?.ts || createdAt) || createdAt;
    const executionPrice = action.executionPrice > 0 ? action.executionPrice : markPrice;
    const quotedEstimate =
      action.quantity > 0
        ? null
        : resolveSpecialTrainingRiskOrderEstimate({
            side: action.type,
            runtime,
            order: {
              inputMode: action.inputMode,
              lotInput: action.lotInput,
              amountInput: action.amountInput,
              ratioInput: action.ratioInput,
            },
            currentPrice: executionPrice,
            tradeStep: question.minTradeStep,
            maxOperations: 0,
            maxEntries: 0,
          });
    const quantity = action.quantity > 0 ? action.quantity : quotedEstimate?.qty ?? 0;
    const result = executeSpecialTrainingRiskOrder({
      runtime,
      side: action.type,
      qty: quantity,
      executionPrice,
      tradeStep: question.minTradeStep,
      maxOperations: 0,
      maxEntries: 0,
    });
    if (!result.tradeChanged || result.estimate.qty === null) {
      return;
    }
    runtime = result.runtime;
    const fillPrice = result.estimate.executionPrice ?? markPrice;
    const fee = result.estimate.fee ?? 0;
    fills.push({
      id: `${bindingId}-fill-${action.type.toLowerCase()}-${index}`,
      order_id: `${bindingId}-order-${action.type.toLowerCase()}-${index}`,
      session_id: bindingId,
      instrument_id: bindingId,
      symbol: question.symbol,
      side: action.type,
      fill_index: action.barIndex,
      fill_time: fillTime,
      fill_price: fillPrice,
      fill_qty: result.estimate.qty,
      contract_multiplier: 1,
      fee,
      tax: 0,
      slippage: Math.abs(fillPrice - markPrice) * result.estimate.qty,
      created_at: fillTime,
    });
  });

  return fills;
};

const resolveHistoryInitialTotal = (
  question: SpecialTrainingHistoryQuestionDetail,
): number => {
  const finalTotal = Number(question.finalTotalAsset);
  const totalPnl = Number(question.totalPnl);
  const derived =
    Number.isFinite(finalTotal) && Number.isFinite(totalPnl)
      ? finalTotal - totalPnl
      : Number.NaN;
  if (Number.isFinite(derived) && derived > 0) {
    return derived;
  }
  return DEFAULT_SPECIAL_TRAINING_INITIAL_TOTAL;
};

const normalizeSpecialTrainingBaseTimeframe = (
  value: unknown,
): '1m' | '5m' | '1h' | '1d' | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === '1m' || normalized === '5m' || normalized === '1h' || normalized === '1d') {
    return normalized;
  }
  return null;
};

export const buildChallengeStatsProjectSummary = (
  session: SpecialTrainingHistorySessionSummary,
  question: SpecialTrainingHistoryQuestionDetail,
): ChallengeStatsProjectDetail => {
  const resolvedEffectiveTimeframe =
    normalizeSpecialTrainingBaseTimeframe(
      question.effectiveTimeframe ?? question.timeframe,
    ) ??
    normalizeSpecialTrainingBaseTimeframe(
      session.effectiveTimeframe ?? session.timeframe,
    ) ??
    '1d';
  const resolvedSourceTimeframe =
    normalizeSpecialTrainingBaseTimeframe(
      question.sourceTimeframe ?? question.baseTimeframe ?? question.timeframe,
    ) ?? '1d';
  const initialTotal = resolveHistoryInitialTotal(question);
  const finalEquity = Number.isFinite(Number(question.finalTotalAsset))
    ? Number(question.finalTotalAsset)
    : initialTotal + Number(question.totalPnl || 0);
  const equityReturnRate =
    initialTotal > 0 ? (finalEquity - initialTotal) / initialTotal : 0;
  const tradeActions = Array.isArray(question.tradeActions)
    ? question.tradeActions
    : [];
  const buyCount = tradeActions.filter((item) => item.type === 'BUY').length;
  const sellCount = tradeActions.filter((item) => item.type === 'SELL').length;
  const createdAt = question.settledAt || session.finishedAt || session.createdAt;
  const bindingId = `special-training-history:${question.id}`;

  const summary: TrainingSummaryPayload = {
    initialAsset: initialTotal,
    endingAsset: finalEquity,
    assetReturnRate: equityReturnRate,
    durationDays: 0,
    startDate: null,
    endDate: null,
    buyCount,
    sellCount,
    totalTrades: tradeActions.length,
    investedAmount: 0,
    tradingCost: 0,
    realizedPnl: question.totalPnl,
    unrealizedPnl: 0,
    totalPnl: question.totalPnl,
    profitRate: equityReturnRate,
    maxDrawdownRate: question.maxDrawdownRatio,
    maxDrawdownAmount: initialTotal * question.maxDrawdownRatio,
    decisionSecondsUsed: question.decisionSecondsUsed ?? 0,
    decisionCount: question.decisionSecondsUsed === null ? 0 : 1,
  };

  return {
    id: question.id,
    name: `${session.modeId}:${question.questionOrder}`,
    createdAt,
    updatedAt: question.updatedAt,
    initialTotal,
    totalPnl: question.totalPnl,
    profitRate: equityReturnRate,
    durationDays: 0,
    totalTrades: tradeActions.length,
    symbol: question.symbol,
    samplePoolId: session.bankId || session.id,
    samplePoolName: session.bankName || session.bankId || session.id,
    baseTimeframe: resolvedEffectiveTimeframe,
    trainingDateRange: '',
    summary,
    finalEquity,
    equityReturnRate,
    replayHydrationStatus: question.replayHydrationStatus,
    detailExpiredAt: question.detailExpiredAt ?? null,
    replay: {
      bars: [],
      snapshot: {
        session: {
          id: bindingId,
          user_id: 'special-training-history',
          instrument_id: bindingId,
          timeframe: resolvedSourceTimeframe,
          start_index: 0,
          entry_index: 0,
          history_bars: 0,
          cursor_index: 0,
          autoplay_interval_ms: 0,
          is_paused: 1,
          created_at: createdAt,
          symbol: question.symbol,
          instrumentName: null,
        },
        accounts: [
          {
            id: `${bindingId}-account`,
            user_id: 'special-training-history',
            kind: 'SECURITIES',
            balance: finalEquity,
            currency: 'CNY',
          },
        ],
        positions: [],
        fills: [],
        fillsTotal: 0,
        nextFillCursor: null,
        shortBorrowChargesTotal: 0,
        drawings: [],
      },
      drawings: [],
      equityCurve: [],
      drawdownCurve: [],
      tradeRounds: [],
      finalEquity,
      equityReturnRate,
      baseTimeframe: resolvedSourceTimeframe,
      directionResult: {
        selection: question.decisionSelection,
        actual: question.decisionActual,
        correct: question.decisionCorrect,
        timedOut: question.decisionTimedOut,
        decisionSecondsUsed: question.decisionSecondsUsed,
        revealEndIndex: question.revealEndIndex,
        strictnessLevel: question.strictnessLevel,
        dominanceRatio: question.dominanceRatio,
        selectedMfeRatio: question.selectedMfeRatio,
        selectedMaeRatio: question.selectedMaeRatio,
        selectedMfeMaeRatio: question.selectedMfeMaeRatio,
        opportunityDirection: question.opportunityDirection,
        opportunityMfeRatio: question.opportunityMfeRatio,
        opportunityMaeRatio: question.opportunityMaeRatio,
        opportunityMfeMaeRatio: question.opportunityMfeMaeRatio,
        longMfeRatio: question.longMfeRatio,
        longMaeRatio: question.longMaeRatio,
      },
      feedbackCodes: question.feedbackCodes,
      riskReview: question.riskReview,
      tradeActions,
    },
  };
};

export const buildChallengeStatsProjectDetail = (
  session: SpecialTrainingHistorySessionSummary,
  question: SpecialTrainingHistoryQuestionDetail,
): ChallengeStatsProjectDetail => {
  const bars = Array.isArray(question.bars) ? question.bars : [];
  const resolvedEffectiveTimeframe =
    normalizeSpecialTrainingBaseTimeframe(
      question.effectiveTimeframe ?? question.timeframe,
    ) ??
    normalizeSpecialTrainingBaseTimeframe(
      session.effectiveTimeframe ?? session.timeframe,
    ) ??
    '1d';
  const resolvedSourceTimeframe =
    normalizeSpecialTrainingBaseTimeframe(
      question.sourceTimeframe ?? question.baseTimeframe ?? question.timeframe,
    ) ?? '1d';
  const visibleEndIndex = Math.max(
    0,
    Math.min(
      Math.max(0, bars.length - 1),
      Math.floor(
        Number(
          question.revealEndIndex ??
            question.cursorIndex ??
            question.endIndex ??
            Math.max(0, bars.length - 1),
        ) || 0,
      ),
    ),
  );
  const visibleBars = bars.slice(0, visibleEndIndex + 1);
  const initialTotal = resolveHistoryInitialTotal(question);
  const finalEquity = Number.isFinite(Number(question.finalTotalAsset))
    ? Number(question.finalTotalAsset)
    : initialTotal + Number(question.totalPnl || 0);
  const equityReturnRate =
    initialTotal > 0 ? (finalEquity - initialTotal) / initialTotal : 0;
  const tradeActions = (Array.isArray(question.tradeActions)
    ? question.tradeActions
    : []
  ).filter((item) => item.barIndex <= visibleEndIndex);
  const buyCount = tradeActions.filter((item) => item.type === 'BUY').length;
  const sellCount = tradeActions.filter((item) => item.type === 'SELL').length;
  const createdAt = question.settledAt || session.finishedAt || session.createdAt;
  const bindingId = `special-training-history:${question.id}`;
  const specialTrainingReplayContext =
    session.modeId === 'fast-decision-training'
      ? buildFastDecisionReplayOverlayContext({
          bars: visibleBars,
          startIndex: question.startIndex,
          revealEndIndex: visibleEndIndex,
          decisionSelection: normalizeDecisionSelection(question.decisionSelection),
          decisionActual: normalizeDecisionSelection(question.decisionActual),
          selectedMfeRatio: Math.max(0, Number(question.selectedMfeRatio) || 0),
          selectedMaeRatio: Math.max(0, Number(question.selectedMaeRatio) || 0),
          longMfeRatio: Math.max(0, Number(question.longMfeRatio) || 0),
          longMaeRatio: Math.max(0, Number(question.longMaeRatio) || 0),
          correct: question.decisionCorrect,
        })
      : session.modeId === 'risk-discipline-training'
        ? buildRiskDisciplineReplayOverlayContext(question)
        : null;
  const replayFills =
    session.modeId === 'risk-discipline-training'
      ? buildRiskDisciplineReplayFills({
          question,
          bindingId,
          createdAt,
          visibleEndIndex,
        })
      : [];
  const sessionSnapshot = {
    session: {
      id: bindingId,
      user_id: 'special-training-history',
      instrument_id: bindingId,
      timeframe: resolvedSourceTimeframe,
      start_index: 0,
      entry_index: Math.max(
        0,
        Math.min(
          Math.max(0, visibleBars.length - 1),
          Math.floor(Number(question.startIndex) || 0),
        ),
      ),
      history_bars: visibleBars.length,
      cursor_index: Math.max(
        0,
        visibleBars.length > 0 ? visibleBars.length - 1 : 0,
      ),
      autoplay_interval_ms: 0,
      is_paused: 1,
      created_at: createdAt,
      symbol: question.symbol,
      instrumentName: null,
    },
    accounts: [
      {
        id: `${bindingId}-account`,
        user_id: 'special-training-history',
        kind: 'SECURITIES',
        balance: finalEquity,
        currency: 'CNY',
      },
    ],
    positions: [],
    fills: replayFills,
    fillsTotal: replayFills.length,
    nextFillCursor: null,
    shortBorrowChargesTotal: 0,
    drawings: [],
  };
  const riskReviewRecord = toRecordOrNull(question.riskReview);
  const equityCurvesRecord = toRecordOrNull(riskReviewRecord?.equityCurves);
  const userCurveRaw = Array.isArray(equityCurvesRecord?.user)
    ? (equityCurvesRecord.user as Array<number | Record<string, unknown>>)
    : [];
  const equityCurve = userCurveRaw
    .map((item, index) => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        return {
          ts: String((visibleBars[index] as { ts?: unknown } | undefined)?.ts || createdAt),
          value: item,
        };
      }
      const record = toRecordOrNull(item);
      const barIndex = Math.max(
        0,
        Math.floor(Number(record?.barIndex ?? record?.x ?? index) || 0),
      );
      const asset = Number(record?.asset ?? record?.y);
      if (!Number.isFinite(asset)) {
        return null;
      }
      return {
        ts: String(
          (visibleBars[barIndex] as { ts?: unknown } | undefined)?.ts ||
            (visibleBars[index] as { ts?: unknown } | undefined)?.ts ||
            createdAt,
        ),
        value: asset,
      };
    })
    .filter(
      (item): item is { ts: string; value: number } =>
        item !== null && Number.isFinite(item.value),
    );
  const drawdownCurve = equityCurve.map((point) => ({
    ts: point.ts,
    value:
      initialTotal > 0
        ? Math.max(0, (initialTotal - point.value) / initialTotal)
        : 0,
  }));
  const replay = {
    bars: visibleBars,
    snapshot: sessionSnapshot,
    drawings: [],
    equityCurve,
    drawdownCurve,
    tradeRounds: [],
    finalEquity,
    equityReturnRate,
    baseTimeframe: resolvedSourceTimeframe,
    specialTraining: specialTrainingReplayContext,
    directionResult: {
      selection: question.decisionSelection,
      actual: question.decisionActual,
      correct: question.decisionCorrect,
      timedOut: question.decisionTimedOut,
      decisionSecondsUsed: question.decisionSecondsUsed,
      revealEndIndex: question.revealEndIndex,
      strictnessLevel: question.strictnessLevel,
      dominanceRatio: question.dominanceRatio,
      selectedMfeRatio: question.selectedMfeRatio,
      selectedMaeRatio: question.selectedMaeRatio,
      selectedMfeMaeRatio: question.selectedMfeMaeRatio,
      opportunityDirection: question.opportunityDirection,
      opportunityMfeRatio: question.opportunityMfeRatio,
      opportunityMaeRatio: question.opportunityMaeRatio,
      opportunityMfeMaeRatio: question.opportunityMfeMaeRatio,
      longMfeRatio: question.longMfeRatio,
      longMaeRatio: question.longMaeRatio,
    },
    feedbackCodes: question.feedbackCodes,
    riskReview: question.riskReview,
    tradeActions,
  };
  const summary: TrainingSummaryPayload = {
    initialAsset: initialTotal,
    endingAsset: finalEquity,
    assetReturnRate: equityReturnRate,
    durationDays: 0,
    startDate:
      String((visibleBars[0] as { ts?: unknown } | undefined)?.ts ?? '') || null,
    endDate:
      String(
        (visibleBars[visibleBars.length - 1] as { ts?: unknown } | undefined)?.ts ??
          '',
      ) || null,
    buyCount,
    sellCount,
    totalTrades: tradeActions.length,
    investedAmount: 0,
    tradingCost: 0,
    realizedPnl: question.totalPnl,
    unrealizedPnl: 0,
    totalPnl: question.totalPnl,
    profitRate: equityReturnRate,
    maxDrawdownRate: question.maxDrawdownRatio,
    maxDrawdownAmount: initialTotal * question.maxDrawdownRatio,
    decisionSecondsUsed: question.decisionSecondsUsed ?? 0,
    decisionCount: question.decisionSecondsUsed === null ? 0 : 1,
  };
  return {
    id: question.id,
    name: `${session.modeId}:${question.questionOrder}`,
    createdAt,
    updatedAt: question.updatedAt,
    initialTotal,
    totalPnl: question.totalPnl,
    profitRate: equityReturnRate,
    durationDays: 0,
    totalTrades: tradeActions.length,
    symbol: question.symbol,
    samplePoolId: session.bankId || session.id,
    samplePoolName: session.bankName || session.bankId || session.id,
    baseTimeframe: resolvedEffectiveTimeframe,
    trainingDateRange: '',
    summary,
    finalEquity,
    equityReturnRate,
    replayHydrationStatus: question.replayHydrationStatus,
    detailExpiredAt: question.detailExpiredAt ?? null,
    replay,
  };
};
