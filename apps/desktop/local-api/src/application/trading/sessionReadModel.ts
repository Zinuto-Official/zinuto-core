// SPDX-License-Identifier: GPL-3.0-only

import { countDateKeysBetween } from '@zinuto/shared/timezone';
import type { OhlcvBar } from '../../domain/models.js';
import type { SessionActionState } from '../../domain/trading/orderQuote.js';
import {
  POSITION_EPSILON,
  resolveContractMultiplier,
} from '../../domain/trading/orderSizing.js';
import type { SessionFillRow } from '../ports/infrastructure/db/trading/sessionMetricStore.js';
import type {
  InstrumentRow,
  PositionRow,
  SessionRow,
  TradingExecutionSettings,
} from '../../domain/trading/types.js';

type DataFactsLike = {
  sourceCount?: number;
  readySourceCount?: number;
  importingSourceCount?: number;
  failedSourceCount?: number;
  rebindRequiredSourceCount?: number;
  lockedSourceCount?: number;
  symbolCount?: number;
  barCount?: number;
};

type TradingCostBreakdown = {
  fees: number;
  taxes: number;
  slippage: number;
  borrowCost: number;
  financingCost: number;
  totalTradingCost: number;
};

type SessionTerminationLike = {
  isTerminated?: boolean;
  reasonCode?: string | null;
  hasFutureBars?: boolean;
  hasOpenPosition?: boolean;
  canOpenMinLong?: boolean;
  canOpenMinShort?: boolean;
  canFullyClosePosition?: boolean;
};

type CurrentLeverageCycleLike = {
  isActive: boolean;
  holdingStartDate: string | null;
  holdingEndDate: string | null;
  longFinancingFee: number;
  shortFee: number;
  totalFee: number;
};

type ActionAvailability = {
  enabled: boolean;
  reasonCode: string | null;
  facts: Record<string, unknown>;
};

export type TrainerActionExecutionConclusion = {
  action: 'STEP' | 'BUY' | 'SELL' | 'UNDO';
  statusCode: 'NOT_ORDER' | 'NO_FILL' | 'FILLED';
  reasonCode: string | null;
  side: 'BUY' | 'SELL' | null;
  fillIds: string[];
  qty: number;
  amount: number;
  tradingCost: number;
  cashEffect: number;
};

export type TrainerSessionTradingReadModel = {
  schemaVersion: 'trainer-session-trading-read-model.v1';
  tradingFacts: {
    sessionId: string;
    instrumentId: string;
    symbol: string;
    assetClass: string;
    marketPresetId: string;
    tradeSettlementMode: string;
    freeReplayEndSettlementMode: string;
    minTradeStep: number;
    contractMultiplier: number;
    allowLongMarginTrading: boolean;
    allowShortSelling: boolean;
    initialSecuritiesBalance: number;
    cashBalance: number;
    positionQty: number;
    positionAvgCost: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    markPrice: number;
    referencePrice: number | null;
    nextOpenAvailable: boolean;
  };
  replayAvailability: {
    statusCode: 'RUNNING' | 'TERMINATED';
    reasonCode: string | null;
    hasFutureBars: boolean;
    canStep: boolean;
    canUndo: boolean;
    undoAvailableSteps: number;
    undoMaxSteps: number;
    lastUndoableAction: 'STEP' | 'BUY' | 'SELL' | null;
  };
  summary: {
    currentTradingFee: number;
    positionMarketValue: number;
    securitiesTotal: number;
    securitiesDelta: number;
    cumulativePnlRate: number;
    floatingRate: number;
    selectedSymbolBarCount: number;
    trainingDays: number;
    trainingDateRange: {
      startDateKey: string | null;
      endDateKey: string | null;
    };
    klineProgress: {
      current: number;
      total: number;
      remaining: number;
    };
    leverageExposureSummary: {
      isActive: boolean;
      isConfigured: boolean;
      allowLongMarginTrading: boolean;
      allowShortSelling: boolean;
      holdingStartDate: string | null;
      holdingEndDate: string | null;
      longFinancingFee: number;
      cumulativeLongFinancingFee: number;
      shortAmount: number;
      shortFee: number;
      cumulativeShortFee: number;
      totalFee: number;
      shortQty: number;
      shortAmountRatio: number;
      shortQtyRatio: number;
    };
  };
  validation: {
    buy: ActionAvailability;
    sell: ActionAvailability;
    step: ActionAvailability;
    undo: ActionAvailability;
  };
  actionAvailability: {
    buy: ActionAvailability;
    sell: ActionAvailability;
    step: ActionAvailability;
    undo: ActionAvailability;
  };
  runConclusion: {
    statusCode: 'RUNNING' | 'TERMINATED';
    reasonCode: string | null;
    equity: number;
    totalPnl: number;
    returnRate: number;
    lastActionExecution: TrainerActionExecutionConclusion | null;
  };
};

export type TrainerWorkspaceTradingReadModel = {
  schemaVersion: 'trainer-workspace-trading-read-model.v1';
  tradingFacts: {
    assetClass: string;
    marketPresetId: string;
    tradeSettlementMode: string;
    freeReplayEndSettlementMode: string;
    minTradeStep: number;
    contractMultiplier: number;
    allowLongMarginTrading: boolean;
    allowShortSelling: boolean;
    initialSecuritiesBalance: number;
  };
  replayAvailability: {
    statusCode: 'READY' | 'EMPTY';
    reasonCode: string | null;
    canStart: boolean;
    canResume: boolean;
    startDisabledReasonCode: string | null;
    resumeDisabledReasonCode: string | null;
    sourceCount: number;
    readySourceCount: number;
    trainableSymbolCount: number;
    hasResumableSession: boolean;
  };
  summary: {
    portfolioSummary: unknown;
    tradingSettings: unknown;
    hasResumableSession: boolean;
  };
  validation: {
    startSession: ActionAvailability;
    resumeSession: ActionAvailability;
  };
  actionAvailability: {
    startSession: ActionAvailability;
    resumeSession: ActionAvailability;
  };
  runConclusion: {
    statusCode: 'IDLE' | 'RESUMABLE' | 'BLOCKED';
    reasonCode: string | null;
    resumableSessionId: string | null;
  };
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toNonNegativeInt = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

const roundReadModelNumber = (value: unknown, digits = 6): number => {
  const numeric = toFiniteNumber(value, 0);
  return Number(numeric.toFixed(digits));
};

const normalizeText = (value: unknown, fallback = ''): string => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const normalizeActionFacts = (
  value: unknown,
): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const buildAvailability = (
  enabled: boolean,
  reasonCode: string | null,
  facts: Record<string, unknown> = {},
): ActionAvailability => ({
  enabled,
  reasonCode: enabled ? null : reasonCode,
  facts,
});

const toOrderActionAvailability = (
  value: unknown,
  fallbackReasonCode: string | null,
): ActionAvailability => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { enabled?: unknown; reasonCode?: unknown; facts?: unknown })
      : null;
  if (!source) {
    return buildAvailability(false, fallbackReasonCode);
  }
  const enabled = source.enabled === true;
  const reasonCode = normalizeText(source.reasonCode, '') || fallbackReasonCode;
  return buildAvailability(enabled, reasonCode, normalizeActionFacts(source.facts));
};

const resolveDateKey = (
  bar: OhlcvBar | undefined,
  session: SessionRow,
  resolveTradeDay: (value: string, instrumentId?: string) => string,
): string | null => {
  const dateKey = resolveTradeDay(String(bar?.ts ?? ''), session.instrument_id);
  return dateKey ? dateKey : null;
};

const resolveTrainingDays = (
  startDateKey: string | null,
  endDateKey: string | null,
): number => {
  if (!startDateKey || !endDateKey) {
    return 0;
  }
  const raw = countDateKeysBetween(startDateKey, endDateKey);
  return Number.isFinite(raw) ? Math.max(1, Math.floor(raw) + 1) : 0;
};

const resolveExecutionAction = (
  value: unknown,
): TrainerActionExecutionConclusion['action'] =>
  value === 'BUY' || value === 'SELL' || value === 'UNDO' ? value : 'STEP';

export const buildTrainerActionExecutionConclusion = ({
  action,
  fillIds,
  fills,
}: {
  action: unknown;
  fillIds?: readonly string[] | null;
  fills: readonly SessionFillRow[];
}): TrainerActionExecutionConclusion | null => {
  const normalizedAction = resolveExecutionAction(action);
  if (normalizedAction !== 'BUY' && normalizedAction !== 'SELL') {
    return null;
  }
  const normalizedFillIds = Array.isArray(fillIds)
    ? fillIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const fillIdSet = new Set(normalizedFillIds);
  if (fillIdSet.size <= 0) {
    return {
      action: normalizedAction,
      statusCode: 'NO_FILL',
      reasonCode: 'NO_MATCHED_FILL',
      side: normalizedAction,
      fillIds: [],
      qty: 0,
      amount: 0,
      tradingCost: 0,
      cashEffect: 0,
    };
  }

  const totals = fills.reduce(
    (next, fill) => {
      if (
        fill.side !== normalizedAction ||
        !fillIdSet.has(String(fill.id ?? '').trim())
      ) {
        return next;
      }
      const qty = Math.max(0, toFiniteNumber(fill.fill_qty, 0));
      const price = Math.max(0, toFiniteNumber(fill.fill_price, 0));
      const contractMultiplier = resolveContractMultiplier(
        fill.contract_multiplier,
      );
      const amount = qty * price * contractMultiplier;
      const tradingCost =
        Math.max(0, toFiniteNumber(fill.fee, 0)) +
        Math.max(0, toFiniteNumber(fill.tax, 0)) +
        Math.max(0, toFiniteNumber(fill.slippage, 0));
      return {
        qty: next.qty + qty,
        amount: next.amount + amount,
        tradingCost: next.tradingCost + tradingCost,
      };
    },
    { qty: 0, amount: 0, tradingCost: 0 },
  );

  if (totals.qty <= POSITION_EPSILON) {
    return {
      action: normalizedAction,
      statusCode: 'NO_FILL',
      reasonCode: 'NO_MATCHED_FILL',
      side: normalizedAction,
      fillIds: normalizedFillIds,
      qty: 0,
      amount: 0,
      tradingCost: 0,
      cashEffect: 0,
    };
  }

  return {
    action: normalizedAction,
    statusCode: 'FILLED',
    reasonCode: null,
    side: normalizedAction,
    fillIds: normalizedFillIds,
    qty: roundReadModelNumber(totals.qty, 8),
    amount: roundReadModelNumber(totals.amount),
    tradingCost: roundReadModelNumber(totals.tradingCost),
    cashEffect: roundReadModelNumber(
      normalizedAction === 'BUY'
        ? totals.amount + totals.tradingCost
        : totals.amount - totals.tradingCost,
    ),
  };
};

export const buildTrainerSessionTradingReadModel = ({
  session,
  instrument,
  position,
  cursorBar,
  entryBar,
  barCount,
  sessionCashBalance,
  tradingSettings,
  tradingCostBreakdown,
  currentLeverageCycle,
  termination,
  actionState,
  lastActionExecution,
  resolveTradeDay,
}: {
  session: SessionRow;
  instrument: InstrumentRow;
  position: PositionRow;
  cursorBar: OhlcvBar | undefined;
  entryBar: OhlcvBar | undefined;
  barCount: number;
  sessionCashBalance: number;
  tradingSettings: TradingExecutionSettings;
  tradingCostBreakdown: TradingCostBreakdown;
  currentLeverageCycle: CurrentLeverageCycleLike;
  termination: SessionTerminationLike;
  actionState: SessionActionState;
  lastActionExecution?: TrainerActionExecutionConclusion | null;
  resolveTradeDay: (value: string, instrumentId?: string) => string;
}): TrainerSessionTradingReadModel => {
  const contractMultiplier = resolveContractMultiplier(
    tradingSettings.contractMultiplier,
  );
  const markPrice = Math.max(0, toFiniteNumber(cursorBar?.close, 0));
  const positionQty = toFiniteNumber(position.qty, 0);
  const positionAvgCost = toFiniteNumber(position.avg_cost, 0);
  const realizedPnl = toFiniteNumber(position.realized_pnl, 0);
  const unrealizedPnl =
    positionQty * (markPrice - positionAvgCost) * contractMultiplier;
  const totalPnl = realizedPnl + unrealizedPnl;
  const positionMarketValue = positionQty * markPrice * contractMultiplier;
  const securitiesTotal = sessionCashBalance + positionMarketValue;
  const initialSecuritiesBalance = Math.max(
    0,
    toFiniteNumber(tradingSettings.initialSecuritiesBalance, 0),
  );
  const securitiesDelta = securitiesTotal - initialSecuritiesBalance;
  const cumulativePnlRate =
    initialSecuritiesBalance > POSITION_EPSILON
      ? securitiesDelta / initialSecuritiesBalance
      : 0;
  const floatingDenominator = Math.abs(
    positionQty * positionAvgCost * contractMultiplier,
  );
  const floatingRate =
    floatingDenominator > POSITION_EPSILON
      ? unrealizedPnl / floatingDenominator
      : 0;
  const totalBars = Math.max(0, Math.floor(Number(barCount) || 0));
  const entryIndex = Math.max(0, Math.floor(Number(session.entry_index) || 0));
  const cursorIndex = Math.max(0, Math.floor(Number(session.cursor_index) || 0));
  const progressTotal =
    totalBars > entryIndex ? Math.max(1, totalBars - entryIndex) : 0;
  const progressCurrent =
    progressTotal > 0
      ? Math.max(1, Math.min(cursorIndex - entryIndex + 1, progressTotal))
      : 0;
  const startDateKey = resolveDateKey(entryBar, session, resolveTradeDay);
  const endDateKey = resolveDateKey(cursorBar, session, resolveTradeDay);
  const shortQty = Math.max(0, -positionQty);
  const shortAmount = shortQty * markPrice * contractMultiplier;
  const marketExposure = Math.abs(positionQty) * markPrice * contractMultiplier;
  const cumulativeShortFee = Math.max(
    0,
    toFiniteNumber(tradingCostBreakdown.borrowCost, 0),
  );
  const cumulativeLongFinancingFee = toFiniteNumber(
    tradingCostBreakdown.financingCost,
    0,
  );
  const leverageConfigured =
    Boolean(tradingSettings.allowLongMarginTrading) ||
    Boolean(tradingSettings.allowShortSelling);
  const shortAmountRatio =
    marketExposure > POSITION_EPSILON ? shortAmount / marketExposure : 0;
  const shortQtyRatio =
    Math.abs(positionQty) > POSITION_EPSILON
      ? shortQty / Math.abs(positionQty)
      : 0;
  const leverageActive =
    marketExposure > POSITION_EPSILON &&
    (shortQty > POSITION_EPSILON ||
      cumulativeShortFee > POSITION_EPSILON ||
      Math.abs(cumulativeLongFinancingFee) > POSITION_EPSILON);
  const isTerminated = termination.isTerminated === true;
  const stepReasonCode = isTerminated
    ? normalizeText(termination.reasonCode, 'SESSION_TERMINATED')
    : actionState.allowStep
      ? null
      : 'NO_FUTURE_DATA';
  const undoEnabled = actionState.canUndo === true;
  const undoReasonCode = undoEnabled ? null : 'NO_UNDO_STEPS';
  const buyAvailability = toOrderActionAvailability(
    actionState.buyOrder,
    actionState.buyBlockedReasonCode ?? null,
  );
  const sellAvailability = toOrderActionAvailability(
    actionState.sellOrder,
    actionState.sellBlockedReasonCode ?? null,
  );
  const stepAvailability = buildAvailability(
    actionState.allowStep === true && !isTerminated,
    stepReasonCode,
    {
      hasFutureBars: termination.hasFutureBars === true,
      reasonCode: termination.reasonCode ?? null,
    },
  );
  const undoAvailability = buildAvailability(undoEnabled, undoReasonCode, {
    availableSteps: actionState.undoAvailableSteps,
    maxSteps: actionState.undoMaxSteps,
    lastUndoableAction: actionState.lastUndoableAction ?? null,
  });

  return {
    schemaVersion: 'trainer-session-trading-read-model.v1',
    tradingFacts: {
      sessionId: session.id,
      instrumentId: session.instrument_id,
      symbol: normalizeText(instrument.symbol, normalizeText(session.instrument_symbol)),
      assetClass: normalizeText(tradingSettings.assetClass, 'STOCK'),
      marketPresetId: normalizeText(tradingSettings.marketPresetId),
      tradeSettlementMode: normalizeText(tradingSettings.tradeSettlementMode, 'T1'),
      freeReplayEndSettlementMode: normalizeText(
        tradingSettings.freeReplayEndSettlementMode,
        'FORCE_CLOSE',
      ),
      minTradeStep: Math.max(
        POSITION_EPSILON,
        toFiniteNumber(tradingSettings.minTradeStep, 1),
      ),
      contractMultiplier,
      allowLongMarginTrading: Boolean(tradingSettings.allowLongMarginTrading),
      allowShortSelling: Boolean(tradingSettings.allowShortSelling),
      initialSecuritiesBalance: roundReadModelNumber(initialSecuritiesBalance),
      cashBalance: roundReadModelNumber(sessionCashBalance),
      positionQty: roundReadModelNumber(positionQty, 8),
      positionAvgCost: roundReadModelNumber(positionAvgCost),
      realizedPnl: roundReadModelNumber(realizedPnl),
      unrealizedPnl: roundReadModelNumber(unrealizedPnl),
      totalPnl: roundReadModelNumber(totalPnl),
      markPrice: roundReadModelNumber(markPrice),
      referencePrice: actionState.referencePrice ?? null,
      nextOpenAvailable: actionState.nextOpenAvailable === true,
    },
    replayAvailability: {
      statusCode: isTerminated ? 'TERMINATED' : 'RUNNING',
      reasonCode: isTerminated ? termination.reasonCode ?? null : null,
      hasFutureBars: termination.hasFutureBars === true,
      canStep: stepAvailability.enabled,
      canUndo: undoAvailability.enabled,
      undoAvailableSteps: toNonNegativeInt(actionState.undoAvailableSteps),
      undoMaxSteps: toNonNegativeInt(actionState.undoMaxSteps),
      lastUndoableAction: actionState.lastUndoableAction ?? null,
    },
    summary: {
      currentTradingFee: roundReadModelNumber(
        tradingCostBreakdown.totalTradingCost,
      ),
      positionMarketValue: roundReadModelNumber(positionMarketValue),
      securitiesTotal: roundReadModelNumber(securitiesTotal),
      securitiesDelta: roundReadModelNumber(securitiesDelta),
      cumulativePnlRate: roundReadModelNumber(cumulativePnlRate, 8),
      floatingRate: roundReadModelNumber(floatingRate, 8),
      selectedSymbolBarCount: totalBars,
      trainingDays: resolveTrainingDays(startDateKey, endDateKey),
      trainingDateRange: {
        startDateKey,
        endDateKey,
      },
      klineProgress: {
        current: progressCurrent,
        total: progressTotal,
        remaining: Math.max(0, progressTotal - progressCurrent),
      },
      leverageExposureSummary: {
        isActive: leverageActive,
        isConfigured: leverageConfigured,
        allowLongMarginTrading: Boolean(tradingSettings.allowLongMarginTrading),
        allowShortSelling: Boolean(tradingSettings.allowShortSelling),
        holdingStartDate: currentLeverageCycle.holdingStartDate,
        holdingEndDate: currentLeverageCycle.holdingEndDate,
        longFinancingFee: roundReadModelNumber(
          currentLeverageCycle.longFinancingFee,
        ),
        cumulativeLongFinancingFee: roundReadModelNumber(
          cumulativeLongFinancingFee,
        ),
        shortAmount: roundReadModelNumber(shortAmount),
        shortFee: roundReadModelNumber(currentLeverageCycle.shortFee),
        cumulativeShortFee: roundReadModelNumber(cumulativeShortFee),
        totalFee: roundReadModelNumber(
          cumulativeShortFee + cumulativeLongFinancingFee,
        ),
        shortQty: roundReadModelNumber(shortQty, 8),
        shortAmountRatio: roundReadModelNumber(shortAmountRatio, 8),
        shortQtyRatio: roundReadModelNumber(shortQtyRatio, 8),
      },
    },
    validation: {
      buy: buyAvailability,
      sell: sellAvailability,
      step: stepAvailability,
      undo: undoAvailability,
    },
    actionAvailability: {
      buy: buyAvailability,
      sell: sellAvailability,
      step: stepAvailability,
      undo: undoAvailability,
    },
    runConclusion: {
      statusCode: isTerminated ? 'TERMINATED' : 'RUNNING',
      reasonCode: isTerminated ? termination.reasonCode ?? null : null,
      equity: roundReadModelNumber(securitiesTotal),
      totalPnl: roundReadModelNumber(securitiesDelta),
      returnRate: roundReadModelNumber(cumulativePnlRate, 8),
      lastActionExecution: lastActionExecution ?? null,
    },
  };
};

export const attachTrainerSessionTradingReadModel = (
  actionState: SessionActionState,
  readModel: TrainerSessionTradingReadModel,
): SessionActionState & {
  readModel: TrainerSessionTradingReadModel;
  tradingFacts: TrainerSessionTradingReadModel['tradingFacts'];
  replayAvailability: TrainerSessionTradingReadModel['replayAvailability'];
  summary: TrainerSessionTradingReadModel['summary'];
  validation: TrainerSessionTradingReadModel['validation'];
  actionAvailability: TrainerSessionTradingReadModel['actionAvailability'];
  runConclusion: TrainerSessionTradingReadModel['runConclusion'];
  execution: TrainerActionExecutionConclusion | null;
} => ({
  ...actionState,
  readModel,
  tradingFacts: readModel.tradingFacts,
  replayAvailability: readModel.replayAvailability,
  summary: readModel.summary,
  validation: readModel.validation,
  actionAvailability: readModel.actionAvailability,
  runConclusion: readModel.runConclusion,
  execution: readModel.runConclusion.lastActionExecution,
});

// --- Session guard utilities (migrated from web domains/trainer/trainingSessionGuards) ---

export const normalizeTrainingSessionId = (value: unknown): string =>
  String(value ?? '').trim();

export const isSnapshotForSession = (
  snapshot: { session?: { id?: unknown } } | null | undefined,
  sessionId: unknown,
): boolean => {
  const normalizedSessionId = normalizeTrainingSessionId(sessionId);
  if (!normalizedSessionId || !snapshot) {
    return false;
  }
  return normalizeTrainingSessionId(snapshot.session?.id) === normalizedSessionId;
};

export const resolveActiveSessionTerminationReason = (
  snapshot: { session?: { id?: unknown }; termination?: { isTerminated?: boolean; reasonCode?: string | null } } | null | undefined,
  sessionId: unknown,
): string | null => {
  if (!snapshot || !isSnapshotForSession(snapshot, sessionId)) {
    return null;
  }
  return snapshot.termination?.isTerminated
    ? (snapshot.termination.reasonCode ?? null)
    : null;
};

export const buildTrainerWorkspaceTradingReadModel = ({
  dataFacts,
  resumableSession,
  portfolioSummary,
  tradingSettings,
}: {
  dataFacts: DataFactsLike;
  resumableSession: unknown;
  portfolioSummary: unknown;
  tradingSettings: Partial<TradingExecutionSettings> | null | undefined;
}): TrainerWorkspaceTradingReadModel => {
  const readySourceCount = toNonNegativeInt(dataFacts.readySourceCount);
  const sourceCount = toNonNegativeInt(dataFacts.sourceCount);
  const canStart = readySourceCount > 0;
  const resumableRecord =
    resumableSession && typeof resumableSession === 'object'
      ? (resumableSession as Record<string, unknown>)
      : null;
  const resumableSessionId =
    normalizeText(resumableRecord?.sessionId) ||
    normalizeText(resumableRecord?.id) ||
    null;
  const canResume = Boolean(resumableSessionId);
  const startReasonCode = canStart ? null : 'NO_READY_DATA_SOURCE';
  const resumeReasonCode = canResume ? null : 'NO_RESUMABLE_SESSION';
  const startSession = buildAvailability(canStart, startReasonCode, {
    sourceCount,
    readySourceCount,
    trainableSymbolCount: toNonNegativeInt(dataFacts.symbolCount),
  });
  const resumeSession = buildAvailability(canResume, resumeReasonCode, {
    sessionId: resumableSessionId,
  });
  const settings = tradingSettings ?? {};
  const statusCode = canStart ? 'READY' : 'EMPTY';
  const reasonCode = canStart ? null : 'NO_DATA_SOURCE';

  return {
    schemaVersion: 'trainer-workspace-trading-read-model.v1',
    tradingFacts: {
      assetClass: normalizeText(settings.assetClass, 'STOCK'),
      marketPresetId: normalizeText(settings.marketPresetId),
      tradeSettlementMode: normalizeText(settings.tradeSettlementMode, 'T1'),
      freeReplayEndSettlementMode: normalizeText(
        settings.freeReplayEndSettlementMode,
        'FORCE_CLOSE',
      ),
      minTradeStep: Math.max(
        POSITION_EPSILON,
        toFiniteNumber(settings.minTradeStep, 1),
      ),
      contractMultiplier: resolveContractMultiplier(settings.contractMultiplier),
      allowLongMarginTrading: Boolean(settings.allowLongMarginTrading),
      allowShortSelling: Boolean(settings.allowShortSelling),
      initialSecuritiesBalance: Math.max(
        0,
        toFiniteNumber(settings.initialSecuritiesBalance, 0),
      ),
    },
    replayAvailability: {
      statusCode,
      reasonCode,
      canStart,
      canResume,
      startDisabledReasonCode: startReasonCode,
      resumeDisabledReasonCode: resumeReasonCode,
      sourceCount,
      readySourceCount,
      trainableSymbolCount: toNonNegativeInt(dataFacts.symbolCount),
      hasResumableSession: canResume,
    },
    summary: {
      portfolioSummary,
      tradingSettings,
      hasResumableSession: canResume,
    },
    validation: {
      startSession,
      resumeSession,
    },
    actionAvailability: {
      startSession,
      resumeSession,
    },
    runConclusion: {
      statusCode: canResume ? 'RESUMABLE' : canStart ? 'IDLE' : 'BLOCKED',
      reasonCode: canResume ? null : reasonCode,
      resumableSessionId,
    },
  };
};
