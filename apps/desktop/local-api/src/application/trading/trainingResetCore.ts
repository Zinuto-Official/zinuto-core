// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { OhlcvBar, PriceMode, Side } from '../../domain/models.js';
import type { TradingExecutionSettings } from '../../domain/trading/types.js';
import { calculateTradingCostBreakdown } from '../../domain/trading/feeModel.js';
import { resolveLongFinancingPrincipal } from '../../domain/trading/longFinancingModel.js';
import { buildAccrualIntervalSettlement } from '../../domain/trading/accrualEvents.js';
import { createInstrumentBarReadCache } from './instrumentBarReadCache.js';
import { resolveContractMultiplier } from '../../domain/trading/orderSizing.js';
import { resolveTradingExecutionSettingsFromStoredJson } from './sessionTradingSettings.js';
import { countMarketDaysBetween, toMarketDateKey } from '@zinuto/shared/marketTime';
import { isPriceMode, normalizePriceMode } from '@zinuto/shared/trading';
import {
  createTrainingResetStore,
  type TrainingFillRow,
  type TrainingFinancingChargeRow,
  type TrainingSessionRow,
} from '../ports/infrastructure/db/trading/trainingResetStore.js';

type SessionIdentity = {
  id: string;
  user_id: string;
  instrument_id: string;
  trading_settings_json?: string;
  cash_balance?: number | null;
  timeframe: string;
  minimum_base_timeframe: string;
  start_index: number;
  entry_index: number;
  history_bars: number;
  cursor_index: number;
  autoplay_interval_ms: number;
  is_paused: number;
  session_scope?: 'OFFICIAL' | 'SIMULATION_ONLY';
  created_at: string;
};

type PositionIdentity = {
  qty: number;
};

type TrainingSummaryResult = {
  initialAsset: number;
  endingAsset: number;
  assetReturnRate: number;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  buyCount: number;
  sellCount: number;
  totalTrades: number;
  investedAmount: number;
  tradingCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  profitRate: number;
  maxDrawdownRate: number;
  maxDrawdownAmount: number;
  forcedLiquidationApplied: boolean;
  forcedLiquidationCount: number;
  forcedLiquidationBuyCount: number;
  forcedLiquidationSellCount: number;
  forcedLiquidationFallbackToCloseCount: number;
  forcedLiquidationPriceMode: PriceMode;
};

type CleanupStaleSessionsResult = {
  keptSessionId: string | null;
  clearedSessions: number;
  accounts: unknown[];
};

type CreateTrainingResetOpsDeps = {
  db: Pick<Database.Database, 'prepare'>;
  DAY_MS: number;
  TRAINING_SUMMARY_MAX_TIMELINE_BARS: number;
  DEFAULT_USER_ID: string;
  DEFAULT_SECURITIES_ACCOUNT_ID: string;
  round: (value: number, digits?: number) => number;
  toUtcDayMs: (iso: string) => number;
  nowIso: () => string;
  createId: () => string;
  getInitialBalances: () => { initialSecuritiesBalance: number };
  getSessionById: (sessionId: string) => SessionIdentity;
  getOrCreatePosition: (sessionId: string, instrumentId: string) => PositionIdentity;
  setAccountBalance: (accountId: string, value: number) => void;
  listAccounts: () => unknown[];
  replayAccountBalancesFromHistory: () => void;
  getInstrumentBySymbol: (symbol: string, timeframe?: string) => { id: string; symbol: string } | undefined;
  getBarCount: (instrumentId: string) => Promise<number>;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  getBarTsByRange: (instrumentId: string, offset: number, limit: number) => Promise<string[]>;
  getCloseAtOrBefore: (instrumentId: string, ts: string) => Promise<number | null>;
  executeFill: (
    orderId: string,
    session: SessionIdentity,
    side: Side,
    fillIndex: number,
    fillPrice: number,
    qty?: number,
    amount?: number,
    options?: { bypassSettlementCheck?: boolean; bypassTradeStepCheck?: boolean; fillBar?: OhlcvBar }
  ) => Promise<string>;
  runSerializedTrainingMutation: <T>(run: () => Promise<T>) => Promise<T>;
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
};

export const createTrainingResetOps = (deps: CreateTrainingResetOpsDeps) => {
  const {
    db,
    DAY_MS,
    TRAINING_SUMMARY_MAX_TIMELINE_BARS,
    DEFAULT_USER_ID,
    DEFAULT_SECURITIES_ACCOUNT_ID,
    round,
    toUtcDayMs,
    nowIso,
    createId,
    getInitialBalances,
    getSessionById,
    getOrCreatePosition,
    setAccountBalance,
    listAccounts,
    replayAccountBalancesFromHistory,
    getInstrumentBySymbol,
    getBarCount,
    getBarByIndex,
    getBarTsByRange,
    getCloseAtOrBefore,
    executeFill,
    runSerializedTrainingMutation,
    appError
  } = deps;

  const trainingResetStore = createTrainingResetStore({
    db,
    defaultUserId: DEFAULT_USER_ID,
  });

  const listTrainingSessions = (symbol?: string, timeframe?: string): TrainingSessionRow[] =>
    trainingResetStore.listTrainingSessions(symbol, timeframe);

  const emptyTrainingSummary = (): TrainingSummaryResult => ({
    initialAsset: 0,
    endingAsset: 0,
    assetReturnRate: 0,
    durationDays: 0,
    startDate: null,
    endDate: null,
    buyCount: 0,
    sellCount: 0,
    totalTrades: 0,
    investedAmount: 0,
    tradingCost: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    profitRate: 0,
    maxDrawdownRate: 0,
    maxDrawdownAmount: 0,
    forcedLiquidationApplied: false,
    forcedLiquidationCount: 0,
    forcedLiquidationBuyCount: 0,
    forcedLiquidationSellCount: 0,
    forcedLiquidationFallbackToCloseCount: 0,
    forcedLiquidationPriceMode: 'CUR_CLOSE'
  });

  const getTrainingSummary = async (symbol?: string, timeframe?: string): Promise<TrainingSummaryResult> => {
    const sessions = listTrainingSessions(symbol, timeframe);
    if (!sessions.length) {
      return emptyTrainingSummary();
    }
    const durationSessions = symbol ? listTrainingSessions() : sessions;
    const { getBarCountCached, getBarByIndexCached } = createInstrumentBarReadCache({
      getBarCount,
      getBarByIndex
    });
    const sessionSettingsById = new Map<string, TradingExecutionSettings>();
    const resolveSessionTradingSettings = (session: { id: string; tradingSettingsJson?: string | null }): TradingExecutionSettings => {
      const cached = sessionSettingsById.get(session.id);
      if (cached) {
        return cached;
      }
      const resolved = resolveTradingExecutionSettingsFromStoredJson(session.tradingSettingsJson);
      sessionSettingsById.set(session.id, resolved);
      return resolved;
    };

    let minDay: number | null = null;
    let maxDay: number | null = null;
    const sessionMap = new Map<string, TrainingSessionRow>();
    const sessionEndBarMap = new Map<string, OhlcvBar>();

    for (const session of sessions) {
      sessionMap.set(session.id, session);
      const barCount = await getBarCountCached(session.instrumentId);
      if (barCount <= 0) {
        continue;
      }

      const endIndex = Math.max(0, Math.min(session.cursorIndex, barCount - 1));
      const endBar = await getBarByIndexCached(session.instrumentId, endIndex);
      if (endBar) {
        sessionEndBarMap.set(session.id, endBar);
      }
    }

    for (const session of durationSessions) {
      const barCount = await getBarCountCached(session.instrumentId);
      if (barCount <= 0) {
        continue;
      }
      const startIndex = Math.max(0, Math.min(session.entryIndex, barCount - 1));
      const endIndex = Math.max(0, Math.min(session.cursorIndex, barCount - 1));
      const [startBar, endBar] = await Promise.all([
        getBarByIndexCached(session.instrumentId, startIndex),
        getBarByIndexCached(session.instrumentId, endIndex)
      ]);
      if (startBar) {
        const day = toUtcDayMs(startBar.ts);
        minDay = minDay === null ? day : Math.min(minDay, day);
      }
      if (endBar) {
        const day = toUtcDayMs(endBar.ts);
        maxDay = maxDay === null ? day : Math.max(maxDay, day);
      }
    }

    const sessionIds = sessions.map((item) => item.id);
    const fillRows = trainingResetStore.listTrainingFillRows(sessionIds);
    const accrualEventRows =
      trainingResetStore.listTrainingFinancingChargeRows(sessionIds);
    const positionRows = trainingResetStore.listTrainingPositionRows(sessionIds);

    let buyCount = 0;
    let sellCount = 0;
    let investedAmount = 0;
    let tradingCost = 0;

    for (const row of fillRows) {
      const contractMultiplier = resolveContractMultiplier(row.contractMultiplier);
      tradingCost += row.fee + row.tax + row.slippage;
      investedAmount += row.fillPrice * row.fillQty * contractMultiplier;
      if (row.side === 'BUY') {
        buyCount += 1;
      } else {
        sellCount += 1;
      }
    }
    for (const row of accrualEventRows) {
      tradingCost += row.amount;
    }
    let realizedPnl = 0;
    let unrealizedPnl = 0;
    for (const row of positionRows) {
      realizedPnl += row.realizedPnl;
      const session = sessionMap.get(row.sessionId);
      if (!session) {
        continue;
      }
      const barCount = await getBarCountCached(row.instrumentId);
      const endIndex = Math.max(0, Math.min(session.cursorIndex, Math.max(0, barCount - 1)));
      const markBar = await getBarByIndexCached(row.instrumentId, endIndex);
      const markPrice = markBar?.close ?? 0;
      const sessionSettings = resolveSessionTradingSettings(session);
      const contractMultiplier = resolveContractMultiplier(sessionSettings.contractMultiplier);
      unrealizedPnl += row.qty * (markPrice - row.avgCost) * contractMultiplier;
    }

    const settings = getInitialBalances();
    const initialAsset = Math.max(0, settings.initialSecuritiesBalance);
    let cash = initialAsset;
    let peakEquity = initialAsset;
    let maxDrawdownAmount = 0;
    let maxDrawdownRate = 0;

    const positionStateMap = new Map<
      string,
      {
        instrumentId: string;
        qty: number;
        contractMultiplier: number;
      }
    >();
    const lastPriceMap = new Map<string, number>();
    const priceCache = new Map<string, number>();
    const buildPositionKey = (sessionId: string, instrumentId: string) => `${sessionId}|${instrumentId}`;

    const resolvePrice = async (instrumentId: string, ts: string, fallback: number): Promise<number> => {
      const key = `${instrumentId}|${ts}`;
      if (priceCache.has(key)) {
        return priceCache.get(key) ?? fallback;
      }
      const price = (await getCloseAtOrBefore(instrumentId, ts)) ?? fallback;
      priceCache.set(key, price);
      return price;
    };

    const calcEquity = async (ts?: string): Promise<number> => {
      let marketValue = 0;
      for (const positionState of positionStateMap.values()) {
        const { instrumentId, qty, contractMultiplier } = positionState;
        if (Math.abs(qty) <= 1e-8) {
          continue;
        }
        const currentPrice = lastPriceMap.get(instrumentId) ?? 0;
        const priced = ts ? await resolvePrice(instrumentId, ts, currentPrice) : currentPrice;
        marketValue += qty * priced * contractMultiplier;
      }
      return cash + marketValue;
    };

    const captureDrawdown = async (ts?: string): Promise<void> => {
      const equity = await calcEquity(ts);
      if (equity > peakEquity) {
        peakEquity = equity;
        return;
      }
      const drawdown = peakEquity - equity;
      if (drawdown > maxDrawdownAmount) {
        maxDrawdownAmount = drawdown;
        maxDrawdownRate = peakEquity > 0 ? drawdown / peakEquity : 0;
      }
    };

    const applyFill = async (row: TrainingFillRow): Promise<void> => {
      const contractMultiplier = resolveContractMultiplier(row.contractMultiplier);
      const gross = row.fillPrice * row.fillQty * contractMultiplier;
      const positionKey = buildPositionKey(row.sessionId, row.instrumentId);
      const currentState = positionStateMap.get(positionKey) ?? {
        instrumentId: row.instrumentId,
        qty: 0,
        contractMultiplier
      };
      if (row.side === 'BUY') {
        cash -= gross + row.fee + row.tax + row.slippage;
        positionStateMap.set(positionKey, {
          ...currentState,
          contractMultiplier,
          qty: currentState.qty + row.fillQty
        });
      } else {
        cash += gross - row.fee - row.tax - row.slippage;
        positionStateMap.set(positionKey, {
          ...currentState,
          contractMultiplier,
          qty: currentState.qty - row.fillQty
        });
      }
      const markPrice = await resolvePrice(row.instrumentId, row.fillTime, row.fillPrice);
      lastPriceMap.set(row.instrumentId, markPrice);
    };

    const applyFinancingCharge = (row: TrainingFinancingChargeRow): void => {
      cash -= row.amount;
    };

    const timelineEvents: Array<
      | { kind: 'FILL'; ts: string; createdAt: string; sequence: number; row: TrainingFillRow }
      | { kind: 'FINANCING'; ts: string; createdAt: string; sequence: number; row: TrainingFinancingChargeRow }
    > = [];
    fillRows.forEach((row, index) => {
      timelineEvents.push({
        kind: 'FILL',
        ts: row.fillTime,
        createdAt: row.createdAt,
        sequence: index,
        row
      });
    });
    accrualEventRows.forEach((row, index) => {
      const eventTsRaw = String(row.accrualTime || '').trim() || String(row.createdAt || '').trim();
      if (!eventTsRaw) {
        return;
      }
      timelineEvents.push({
        kind: 'FINANCING',
        ts: eventTsRaw,
        createdAt: row.createdAt,
        sequence: index,
        row
      });
    });
    timelineEvents.sort((left, right) => {
      const byTs = left.ts.localeCompare(right.ts);
      if (byTs !== 0) {
        return byTs;
      }
      const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
      if (byCreatedAt !== 0) {
        return byCreatedAt;
      }
      if (left.kind !== right.kind) {
        const priorityByKind = {
          FINANCING: 0,
          FILL: 1
        } as const;
        return priorityByKind[left.kind] - priorityByKind[right.kind];
      }
      return left.sequence - right.sequence;
    });

    const timeline = new Set<string>();
    let timelineBarsPlanned = 0;
    let useCondensedTimeline = false;
    for (const session of sessions) {
      const barCount = await getBarCountCached(session.instrumentId);
      if (barCount <= 0) {
        continue;
      }
      const startIndex = Math.max(0, Math.min(session.entryIndex, barCount - 1));
      const endIndex = Math.max(0, Math.min(session.cursorIndex, barCount - 1));
      const count = Math.max(0, endIndex - startIndex + 1);
      if (count <= 0) {
        continue;
      }
      if (timelineBarsPlanned + count > TRAINING_SUMMARY_MAX_TIMELINE_BARS) {
        useCondensedTimeline = true;
        break;
      }
      timelineBarsPlanned += count;
      const timestamps = await getBarTsByRange(session.instrumentId, startIndex, count);
      timestamps.forEach((ts) => {
        timeline.add(ts);
      });
    }

    if (useCondensedTimeline) {
      timeline.clear();
      for (const session of sessions) {
        const barCount = await getBarCountCached(session.instrumentId);
        if (barCount <= 0) {
          continue;
        }
        const startIndex = Math.max(0, Math.min(session.entryIndex, barCount - 1));
        const startBar = await getBarByIndexCached(session.instrumentId, startIndex);
        if (startBar) {
          timeline.add(startBar.ts);
        }
        const endBar = sessionEndBarMap.get(session.id);
        if (endBar) {
          timeline.add(endBar.ts);
        }
      }
    }

    for (const row of fillRows) {
      timeline.add(row.fillTime);
    }
    for (const row of accrualEventRows) {
      const eventTsRaw = String(row.accrualTime || '').trim() || String(row.createdAt || '').trim();
      if (eventTsRaw) {
        timeline.add(eventTsRaw);
      }
    }
    const timelineList = Array.from(timeline).sort((a, b) => a.localeCompare(b));
    await captureDrawdown();

    let eventPtr = 0;
    for (const ts of timelineList) {
      while (eventPtr < timelineEvents.length && timelineEvents[eventPtr].ts <= ts) {
        const event = timelineEvents[eventPtr];
        if (event.kind === 'FILL') {
          await applyFill(event.row);
        } else {
          applyFinancingCharge(event.row);
        }
        eventPtr += 1;
      }
      await captureDrawdown(ts);
    }
    while (eventPtr < timelineEvents.length) {
      const event = timelineEvents[eventPtr];
      if (event.kind === 'FILL') {
        await applyFill(event.row);
      } else {
        applyFinancingCharge(event.row);
      }
      await captureDrawdown(event.ts);
      eventPtr += 1;
    }

    for (const [sessionId, endBar] of sessionEndBarMap) {
      const session = sessionMap.get(sessionId);
      if (!session) {
        continue;
      }
      lastPriceMap.set(session.instrumentId, endBar.close);
    }

    if (maxDay !== null) {
      await captureDrawdown(new Date(maxDay).toISOString());
    }

    const endingAssetFromEquity = await calcEquity();
    const fallbackEndingAsset = initialAsset + realizedPnl + unrealizedPnl;
    const endingAsset = Number.isFinite(endingAssetFromEquity) ? endingAssetFromEquity : fallbackEndingAsset;
    const totalPnl = endingAsset - initialAsset;
    const normalizedUnrealizedPnl = unrealizedPnl;
    const normalizedRealizedPnl = totalPnl - normalizedUnrealizedPnl;
    const assetReturnRate = initialAsset > 0 ? totalPnl / initialAsset : 0;
    const durationDays = minDay !== null && maxDay !== null ? Math.max(1, Math.floor((maxDay - minDay) / DAY_MS) + 1) : 0;

    return {
      initialAsset: round(initialAsset, 6),
      endingAsset: round(endingAsset, 6),
      assetReturnRate: round(assetReturnRate, 8),
      durationDays,
      startDate: minDay === null ? null : toMarketDateKey(minDay),
      endDate: maxDay === null ? null : toMarketDateKey(maxDay),
      buyCount,
      sellCount,
      totalTrades: fillRows.length,
      investedAmount: round(investedAmount, 6),
      tradingCost: round(tradingCost, 6),
      realizedPnl: round(normalizedRealizedPnl, 6),
      unrealizedPnl: round(normalizedUnrealizedPnl, 6),
      totalPnl: round(totalPnl, 6),
      profitRate: round(assetReturnRate, 8),
      maxDrawdownRate: round(Math.max(0, maxDrawdownRate), 8),
      maxDrawdownAmount: round(maxDrawdownAmount, 6),
      forcedLiquidationApplied: false,
      forcedLiquidationCount: 0,
      forcedLiquidationBuyCount: 0,
      forcedLiquidationSellCount: 0,
      forcedLiquidationFallbackToCloseCount: 0,
      forcedLiquidationPriceMode: 'CUR_CLOSE'
    };
  };

  const resolveForcedLiquidationTarget = async (
    session: SessionIdentity,
    priceMode: PriceMode
  ): Promise<{
    fillIndex: number;
    fillPrice: number;
    submitIndex: number;
    appliedPriceMode: PriceMode;
    bypassSettlementCheck: boolean;
  } | null> => {
    const barCount = await getBarCount(session.instrument_id);
    if (barCount <= 0) {
      return null;
    }
    const maxIndex = Math.max(0, barCount - 1);
    const cursor = Math.max(0, Math.min(session.cursor_index, maxIndex));
    const currentBar = await getBarByIndex(session.instrument_id, cursor);
    if (!currentBar) {
      return null;
    }
    if (priceMode === 'NEXT_OPEN' && cursor < maxIndex) {
      const nextIndex = cursor + 1;
      const nextBar = await getBarByIndex(session.instrument_id, nextIndex);
      if (nextBar) {
        return {
          fillIndex: nextIndex,
          fillPrice: nextBar.open,
          submitIndex: nextIndex - 1,
          appliedPriceMode: 'NEXT_OPEN',
          bypassSettlementCheck: false
        };
      }
    }
    return {
      fillIndex: cursor,
      fillPrice: currentBar.close,
      submitIndex: cursor,
      appliedPriceMode: 'CUR_CLOSE',
      // Ending/resetting training is an explicit forced-liquidation flow, so it must
      // settle open longs even under T+1 instead of reusing regular sellability checks.
      bypassSettlementCheck: true
    };
  };

  const finalizeOpenPositionsForSessions = async (sessions: TrainingSessionRow[], priceMode: PriceMode): Promise<void> => {
    for (const item of sessions) {
      const session = getSessionById(item.id);
      const position = getOrCreatePosition(session.id, session.instrument_id);
      if (!Number.isFinite(position.qty) || Math.abs(position.qty) <= 1e-8) {
        continue;
      }
      const target = await resolveForcedLiquidationTarget(session, priceMode);
      if (!target) {
        continue;
      }
      const closeSide: Side = position.qty > 0 ? 'SELL' : 'BUY';
      const closeQty = Math.abs(position.qty);
      trainingResetStore.cancelPendingNextOpenOrders(session.id);
      const orderId = createId();
      trainingResetStore.insertPendingCloseOrder({
        orderId,
        sessionId: session.id,
        instrumentId: session.instrument_id,
        side: closeSide,
        qty: closeQty,
        priceMode: target.appliedPriceMode,
        submitIndex: target.submitIndex,
        createdAt: nowIso(),
      });
      try {
        await executeFill(orderId, session, closeSide, target.fillIndex, target.fillPrice, closeQty, undefined, {
          bypassSettlementCheck: target.bypassSettlementCheck,
          bypassTradeStepCheck: true
        });
      } catch (error) {
        trainingResetStore.cancelPendingOrder(orderId);
        throw error;
      }
      if (target.fillIndex > session.cursor_index) {
        trainingResetStore.updateReplaySessionCursor(
          session.id,
          target.fillIndex,
          nowIso(),
        );
      }
    }
  };

type PreviewFinalizationAdjustment = {
  tradingCostDelta: number;
  financingCostDelta: number;
  realizedPnlDelta: number;
  unrealizedPnlDelta: number;
  totalPnlDelta: number;
    forcedCloseCount: number;
    forcedBuyCount: number;
    forcedSellCount: number;
    forcedFallbackToCloseCount: number;
  };

  const normalizeTradeDay = (value: unknown): string | null => {
    const raw = String(value ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  };

  const countCalendarDaysBetween = (fromDay: string, toDay: string): number => {
    const diffDays = countMarketDaysBetween(fromDay, toDay);
    if (!Number.isFinite(diffDays) || diffDays <= 0) {
      return 0;
    }
    return Math.max(0, Math.trunc(diffDays));
  };

  const calculatePreviewFinalizationAdjustment = async (
    sessions: TrainingSessionRow[],
    priceMode: PriceMode
  ): Promise<PreviewFinalizationAdjustment> => {
    const resolveSessionTradingSettings = (session: SessionIdentity): TradingExecutionSettings =>
      resolveTradingExecutionSettingsFromStoredJson(session.trading_settings_json);
    let tradingCostDelta = 0;
    let financingCostDelta = 0;
    let realizedPnlDelta = 0;
    let unrealizedPnlDelta = 0;
    let forcedCloseCount = 0;
    let forcedBuyCount = 0;
    let forcedSellCount = 0;
    let forcedFallbackToCloseCount = 0;

    for (const item of sessions) {
      const session = getSessionById(item.id);
      const sessionSettings = resolveSessionTradingSettings(session);
      const contractMultiplier = resolveContractMultiplier(sessionSettings.contractMultiplier);
      const position = trainingResetStore.getPreviewPosition(
        session.id,
        session.instrument_id,
      );
      if (!position || !Number.isFinite(position.qty) || Math.abs(position.qty) <= 1e-8) {
        continue;
      }

      const barCount = await getBarCount(session.instrument_id);
      if (barCount <= 0) {
        continue;
      }
      const maxIndex = Math.max(0, barCount - 1);
      const cursor = Math.max(0, Math.min(session.cursor_index, maxIndex));
      const currentBar = await getBarByIndex(session.instrument_id, cursor);
      if (!currentBar) {
        continue;
      }

      const target = await resolveForcedLiquidationTarget(session, priceMode);
      if (!target) {
        continue;
      }
      if (priceMode === 'NEXT_OPEN' && target.appliedPriceMode !== 'NEXT_OPEN') {
        forcedFallbackToCloseCount += 1;
      }

      const fillBar = await getBarByIndex(session.instrument_id, target.fillIndex);
      if (!fillBar) {
        continue;
      }

      const closeQty = Math.abs(position.qty);
      const gross = closeQty * target.fillPrice * contractMultiplier;
      const isSellClose = position.qty > 0;
      const closeSide: Side = isSellClose ? 'SELL' : 'BUY';
      const tradingCost = calculateTradingCostBreakdown(
        gross,
        closeSide,
        sessionSettings,
        closeQty,
      ).tradingCost;
      let financingCost = 0;
      const asOfDay = toMarketDateKey(fillBar.ts);
      const lastAccrualDay = normalizeTradeDay(position.lastBorrowAccrualDay);
      const accrualDays = lastAccrualDay ? countCalendarDaysBetween(lastAccrualDay, asOfDay) : 0;
      if (accrualDays > 0 && lastAccrualDay) {
        const avgCost = Number(position.avgCost);
        const fallbackReferencePrice = (() => {
          const asOfClose = Number(fillBar.close);
          if (Number.isFinite(asOfClose) && asOfClose > 1e-8) {
            return asOfClose;
          }
          if (Number.isFinite(avgCost) && avgCost > 1e-8) {
            return avgCost;
          }
          return 0;
        })();
        const closeAtOrBefore = await getCloseAtOrBefore(
          session.instrument_id,
          `${asOfDay}T23:59:59.999Z`,
        );
        const referencePrice =
          Number.isFinite(closeAtOrBefore) &&
          closeAtOrBefore !== null &&
          closeAtOrBefore > 1e-8
            ? closeAtOrBefore
            : fallbackReferencePrice;
        const settlement = buildAccrualIntervalSettlement({
          accrualDays,
          positionQty: position.qty,
          referencePrice,
          contractMultiplier,
          longFinancingPrincipal: isSellClose
            ? resolveLongFinancingPrincipal(session.cash_balance)
            : 0,
          annualRatePercent: Math.max(
            0,
            Number(
              isSellClose
                ? sessionSettings.longFinancingAnnualRate
                : sessionSettings.shortBorrowAnnualRate,
            ) || 0,
          ),
          fundingRatePercent: Number(sessionSettings.fundingRate) || 0,
          assetClass: sessionSettings.assetClass,
          allowShortSelling: sessionSettings.allowShortSelling,
        });
        financingCost = round(settlement.totalAmount, 6);
      }

      const oldUnrealized = position.qty * (currentBar.close - position.avgCost) * contractMultiplier;
      const newRealized = isSellClose
        ? (target.fillPrice - position.avgCost) * closeQty * contractMultiplier - tradingCost
        : (position.avgCost - target.fillPrice) * closeQty * contractMultiplier - tradingCost;
      const realizedDelta = newRealized - financingCost;
      const unrealizedDelta = -oldUnrealized;

      tradingCostDelta += tradingCost + financingCost;
      financingCostDelta += financingCost;
      realizedPnlDelta += realizedDelta;
      unrealizedPnlDelta += unrealizedDelta;
      forcedCloseCount += 1;
      if (isSellClose) {
        forcedSellCount += 1;
      } else {
        forcedBuyCount += 1;
      }
    }

    return {
      tradingCostDelta,
      financingCostDelta,
      realizedPnlDelta,
      unrealizedPnlDelta,
      totalPnlDelta: realizedPnlDelta + unrealizedPnlDelta,
      forcedCloseCount,
      forcedBuyCount,
      forcedSellCount,
      forcedFallbackToCloseCount
    };
  };

  const previewFinalizedTrainingSummary = async (
    symbol: string | undefined,
    finalizePriceMode: PriceMode
  ): Promise<TrainingSummaryResult> => {
    const summary = await getTrainingSummary(symbol);
    const sessions = listTrainingSessions(symbol);
    const adjustment = await calculatePreviewFinalizationAdjustment(sessions, finalizePriceMode);
    if (adjustment.forcedCloseCount <= 0) {
      return summary;
    }

    const totalPnl = summary.totalPnl + adjustment.totalPnlDelta;
    const realizedPnl = summary.realizedPnl + adjustment.realizedPnlDelta;
    const unrealizedPnl = summary.unrealizedPnl + adjustment.unrealizedPnlDelta;
    const tradingCost = summary.tradingCost + adjustment.tradingCostDelta;
    const endingAsset = summary.initialAsset + totalPnl;
    const assetReturnRate = summary.initialAsset > 0 ? totalPnl / summary.initialAsset : 0;
    const profitRate = assetReturnRate;

    return {
      ...summary,
      endingAsset: round(endingAsset, 6),
      assetReturnRate: round(assetReturnRate, 8),
      buyCount: Math.max(0, Math.floor(summary.buyCount + adjustment.forcedBuyCount)),
      sellCount: Math.max(0, Math.floor(summary.sellCount + adjustment.forcedSellCount)),
      totalTrades: Math.max(0, Math.floor(summary.totalTrades + adjustment.forcedCloseCount)),
      tradingCost: round(tradingCost, 6),
      realizedPnl: round(realizedPnl, 6),
      unrealizedPnl: round(unrealizedPnl, 6),
      totalPnl: round(totalPnl, 6),
      profitRate: round(profitRate, 8),
      forcedLiquidationApplied: adjustment.forcedCloseCount > 0,
      forcedLiquidationCount: Math.max(0, Math.floor(adjustment.forcedCloseCount)),
      forcedLiquidationBuyCount: Math.max(0, Math.floor(adjustment.forcedBuyCount)),
      forcedLiquidationSellCount: Math.max(0, Math.floor(adjustment.forcedSellCount)),
      forcedLiquidationFallbackToCloseCount: Math.max(0, Math.floor(adjustment.forcedFallbackToCloseCount)),
      forcedLiquidationPriceMode: normalizePriceMode(finalizePriceMode)
    };
  };

  const previewTrainingSummary = async (
    symbol?: string,
    timeframe = '1d',
    finalizePriceMode?: PriceMode
  ): Promise<TrainingSummaryResult> => {
    if (symbol) {
      const instrument = getInstrumentBySymbol(symbol.toUpperCase(), timeframe);
      if (!instrument) {
        throw appError('INSTRUMENT_NOT_FOUND', { symbol, timeframe });
      }
      if (isPriceMode(finalizePriceMode)) {
        return previewFinalizedTrainingSummary(instrument.symbol, finalizePriceMode);
      }
      return getTrainingSummary(instrument.symbol, timeframe);
    }
    if (isPriceMode(finalizePriceMode)) {
      return previewFinalizedTrainingSummary(undefined, finalizePriceMode);
    }
    return getTrainingSummary();
  };

  const cleanupStaleSessions = async (keepSessionId?: string): Promise<CleanupStaleSessionsResult> =>
    runSerializedTrainingMutation(async () => {
      const normalizedKeepSessionId = String(keepSessionId || '').trim();
      if (normalizedKeepSessionId) {
        const keepSession = getSessionById(normalizedKeepSessionId);
        if (
          keepSession.user_id !== DEFAULT_USER_ID ||
          String(keepSession.session_scope ?? '').trim() !== 'OFFICIAL'
        ) {
          throw appError('SESSION_NOT_FOUND');
        }
        const clearedSessions =
          trainingResetStore.deleteOfficialReplaySessionsExcept(keepSession.id);
        replayAccountBalancesFromHistory();
        return {
          keptSessionId: keepSession.id,
          clearedSessions,
          accounts: listAccounts()
        };
      }

      const clearedSessions = trainingResetStore.deleteAllOfficialReplaySessions();
      replayAccountBalancesFromHistory();
      return {
        keptSessionId: null,
        clearedSessions,
        accounts: listAccounts()
      };
    });

  const resetAllTraining = async (finalizePriceMode?: PriceMode) =>
    runSerializedTrainingMutation(async () => {
      const sessions = listTrainingSessions();
      if (isPriceMode(finalizePriceMode)) {
        await finalizeOpenPositionsForSessions(sessions, finalizePriceMode);
      }
      const clearedSessions = trainingResetStore.resetAllTrainingData();
      const settings = getInitialBalances();
      setAccountBalance(DEFAULT_SECURITIES_ACCOUNT_ID, settings.initialSecuritiesBalance);

      return {
        clearedSessions,
        accounts: listAccounts(),
        summary: emptyTrainingSummary()
      };
    });

  const resetSymbolTraining = async (
    symbol: string,
    timeframe = '1d',
    finalizePriceMode: PriceMode = 'CUR_CLOSE'
  ) =>
    runSerializedTrainingMutation(async () => {
      const instrument = getInstrumentBySymbol(symbol, timeframe);
      if (!instrument) {
        throw appError('INSTRUMENT_NOT_FOUND', { symbol, timeframe });
      }

      const sessions = listTrainingSessions(instrument.symbol, timeframe);
      await finalizeOpenPositionsForSessions(sessions, normalizePriceMode(finalizePriceMode));
      const clearedSessions = trainingResetStore.resetSymbolTrainingData({
        instrumentId: instrument.id,
        symbol: instrument.symbol,
      });

      replayAccountBalancesFromHistory();
      return {
        symbol: instrument.symbol,
        clearedSessions,
        accounts: listAccounts(),
        summary: emptyTrainingSummary()
      };
    });

  return {
    cleanupStaleSessions,
    emptyTrainingSummary,
    previewTrainingSummary,
    resetAllTraining,
    resetSymbolTraining
  };
};
