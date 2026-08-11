// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { OhlcvBar, Side } from '../../domain/models.js';
import type { AccountRow, InstrumentRow, PositionRow, SessionRow, TradingExecutionSettings, TradingSettings } from '../../domain/trading/types.js';
import { resolveTradingExecutionSettingsFromStoredJson } from './sessionTradingSettings.js';
import { createSessionCashStore } from '../ports/infrastructure/db/trading/sessionCashStore.js';
import { createSessionCreationRuntime } from './sessionCreationRuntime.js';
import { createSessionFinancing } from './sessionFinancing.js';
import { createSessionFillStore } from '../ports/infrastructure/db/trading/sessionFillStore.js';
import { createSessionFillExecutionRuntime } from './sessionFillExecutionRuntime.js';
import { createSessionLifecycleStore } from '../ports/infrastructure/db/trading/sessionLifecycleStore.js';
import { createSessionMarginDomain } from '../../domain/trading/sessionMargin.js';
import { createSessionMarginRuntime } from './sessionMarginRuntime.js';
import { createSessionMetricStore } from '../ports/infrastructure/db/trading/sessionMetricStore.js';
import {
  createSessionActionRuntime,
  type ReplaySessionActionPayload,
  type SessionActionExecutionResult,
} from './sessionActionRuntime.js';
import {
  createSessionOrderStore,
} from '../ports/infrastructure/db/trading/sessionOrderStore.js';
import {
  createSessionOrderPlacementRuntime,
  type PlaceOrderPayload,
} from './sessionOrderPlacementRuntime.js';
import {
  createSessionOrderQuoteRuntime,
} from './sessionOrderQuoteRuntime.js';
import {
  createSessionPendingOrdersRuntime,
  type PendingNextOpenFillFailureMode,
} from './sessionPendingOrdersRuntime.js';
import { createSessionPositionStore } from '../ports/infrastructure/db/trading/sessionPositionStore.js';
import { createSessionProjection } from './sessionProjection.js';
import { createSessionSavepointRunner } from './sessionSavepoint.js';
import {
  createSessionTimelinePlanner,
} from './sessionTimeline.js';
import { createReplaySessionUndoStore } from '../ports/infrastructure/db/trading/sessionUndoStore.js';
import { toMarketDateKey } from '@zinuto/shared/marketTime';
import type { DisplayPeriodKey } from '@zinuto/shared/period';
import type { TradingCalendarConfig } from '@zinuto/shared/tradingCalendar';
import { normalizeTimeZone, toTimeZoneDateKey } from '@zinuto/shared/timezone';
import { createSessionMutationCoordinator } from './sessionMutationCoordinator.js';

type CreateSessionOpsDeps = {
  db: Pick<Database.Database, 'prepare' | 'exec' | 'transaction'>;
  DEFAULT_USER_ID: string;
  round: (value: number, digits?: number) => number;
  nowIso: () => string;
  createId: () => string;
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
  getTradingSettings: () => TradingExecutionSettings;
  getInstrumentBySymbol: (symbol: string, timeframe?: string) => InstrumentRow | undefined;
  getInstrumentById: (id: string) => InstrumentRow | undefined;
  ensureInstrumentMarketBarsReady: (instrument: InstrumentRow) => Promise<number>;
  getSessionById: (sessionId: string) => SessionRow;
  getOrCreatePosition: (sessionId: string, instrumentId: string) => PositionRow;
  getAccount: () => AccountRow;
  setAccountBalance: (accountId: string, value: number) => void;
  getBarCount: (instrumentId: string) => Promise<number>;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  getBarsByInstrumentIdRange: (instrumentId: string, offset: number, limit: number) => Promise<OhlcvBar[]>;
  getCloseAtOrBefore: (instrumentId: string, ts: string) => Promise<number | null>;
  getDisplayBarContainingRawIndex: (input: {
    instrumentId: string;
    versionToken: string;
    baseTimeframe: string;
    timeZone?: string | null;
    tradingCalendar?: TradingCalendarConfig | null;
    displayPeriod: DisplayPeriodKey;
    rawIndex: number;
  }) => Promise<{
    displayIndex: number;
    startRawIndex: number;
    endRawIndex: number;
    open: number;
    close: number;
  } | null>;
  getDisplayBarByDisplayIndex: (input: {
    instrumentId: string;
    versionToken: string;
    baseTimeframe: string;
    timeZone?: string | null;
    tradingCalendar?: TradingCalendarConfig | null;
    displayPeriod: DisplayPeriodKey;
    displayIndex: number;
  }) => Promise<{
    displayIndex: number;
    startRawIndex: number;
    endRawIndex: number;
    open: number;
    close: number;
  } | null>;
  listAccounts: () => AccountRow[];
  ensureBackendStartupReady: () => void;
  resolveInstrumentTimelineConfig?: (
    instrument: InstrumentRow,
    totalRaw: number,
  ) => {
    versionToken: string;
    tradingCalendar: TradingCalendarConfig | null;
  };
};

type ReplaySessionScope = 'OFFICIAL' | 'SIMULATION_ONLY';

const normalizeSessionScope = (value: unknown): ReplaySessionScope =>
  String(value ?? '').trim() === 'SIMULATION_ONLY' ? 'SIMULATION_ONLY' : 'OFFICIAL';

export const createSessionOps = (deps: CreateSessionOpsDeps) => {
  const {
    db,
    DEFAULT_USER_ID,
    round,
    nowIso,
    createId,
    appError,
    getTradingSettings,
    getInstrumentBySymbol,
    getInstrumentById,
    ensureInstrumentMarketBarsReady,
    getSessionById,
    getOrCreatePosition,
    getBarCount,
    getBarByIndex,
    getBarsByInstrumentIdRange,
    getCloseAtOrBefore,
    getDisplayBarContainingRawIndex,
    getDisplayBarByDisplayIndex,
    resolveInstrumentTimelineConfig,
    ensureBackendStartupReady,
  } = deps;

  const sessionTimeline = createSessionTimelinePlanner({
    appError,
    getInstrumentById,
    getBarCount,
    getDisplayBarContainingRawIndex,
    getDisplayBarByDisplayIndex,
    resolveInstrumentTimelineConfig,
  });
  const {
    toBaseTimeframe,
    normalizeDisplayPeriod,
    toClientSession,
    resolveSessionAdvancePlan,
    buildRuntimeContextFromAdvancePlan,
    toAdvanceStateFromBucket,
    resolveKnownStepAdvanceState,
  } = sessionTimeline;

  const resolveOperationIso = (value: unknown): string => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) {
      return nowIso();
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : nowIso();
  };

  const resolveSessionTradingSettings = (session: SessionRow): TradingExecutionSettings => {
    return resolveTradingExecutionSettingsFromStoredJson(session.trading_settings_json);
  };

  const {
    runSerializedSessionMutation,
    runSerializedTrainingMutation,
  } = createSessionMutationCoordinator({ ensureBackendStartupReady });

  const sessionOrderStore = createSessionOrderStore({ db, createId, round });
  const sessionCashStore = createSessionCashStore({
    db,
    round,
    nowIso,
    getTradingSettings,
    resolveSessionTradingSettings,
  });
  const sessionPositionStore = createSessionPositionStore({
    db,
    createId,
    round,
    nowIso,
  });
  const sessionFillStore = createSessionFillStore({ db, createId, round });
  const sessionLifecycleStore = createSessionLifecycleStore({ db });
  const sessionMargin = createSessionMarginDomain({ round });
  const sessionMetricStore = createSessionMetricStore({ db, round });
  const sessionPendingOrdersRuntime = createSessionPendingOrdersRuntime({
    nowIso,
    getBarByIndex,
    getBarsByInstrumentIdRange,
    sessionOrderStore,
  });
  const {
    runPendingNextOpenOrdersByCursorRange,
  } = sessionPendingOrdersRuntime;
  const sessionMarginRuntime = createSessionMarginRuntime({
    appError,
    round,
    nowIso,
    getBarByIndex,
    resolveSessionTradingSettings,
    sessionCashStore,
    sessionPositionStore,
    sessionOrderStore,
    sessionMargin,
  });
  const {
    assertInitialMarginSufficient,
  } = sessionMarginRuntime;

  const resolveInstrumentTimeZone = (instrumentId: string): string =>
    normalizeTimeZone(getInstrumentById(instrumentId)?.time_zone);

  const resolveTradeDay = (value: string, instrumentId?: string): string => {
    if (instrumentId) {
      return toTimeZoneDateKey(value, resolveInstrumentTimeZone(instrumentId));
    }
    return toMarketDateKey(value);
  };

  const sessionFinancing = createSessionFinancing({
    round,
    nowIso,
    resolveTradeDay,
    resolveSessionTradingSettings,
    getOrCreatePosition,
    getCloseAtOrBefore,
    sessionCashStore,
    sessionMetricStore,
    sessionPositionStore,
  });
  const {
    accruePositionFinancingUntil,
    resolveNextFinancingAccrualDay,
    resolveNextLeverageCycleStartTime,
  } = sessionFinancing;
  const { withSavepoint } = createSessionSavepointRunner({
    exec: (sql) => {
      db.exec(sql);
    },
  });

  const replaySessionUndoStore = createReplaySessionUndoStore({
    db,
    createId,
    nowIso,
    appError,
    normalizeSessionScope,
    rebuildSessionMetricTotals: sessionMetricStore.rebuildTotals,
  });
  const sessionProjection = createSessionProjection({
    appError,
    round,
    getSessionById,
    getInstrumentById,
    getOrCreatePosition,
    getBarByIndex,
    getBarCount,
    resolveTradeDay,
    resolveSessionTradingSettings,
    normalizeDisplayPeriod,
    toBaseTimeframe,
    toClientSession,
    resolveSessionAdvancePlan,
    toAdvanceStateFromBucket,
    sessionMetricStore,
    sessionCashStore,
    sessionPositionStore,
    sessionMargin,
    replaySessionUndoStore,
  });
  const {
    getSessionRuntimeDelta,
    getSessionSnapshot,
  } = sessionProjection;
  const { getSessionOrderQuote } = createSessionOrderQuoteRuntime({
    getSessionById,
    getBarByIndex,
    getBarCount,
    getCloseAtOrBefore,
    getOrCreatePosition,
    resolveTradeDay,
    resolveSessionTradingSettings,
    resolveSessionAdvancePlan,
    sessionCashStore,
    sessionPositionStore,
    sessionMargin,
  });

  const undoReplaySessionAction = (
    sessionId: string,
    occurredAt = nowIso(),
  ): { session: SessionRow; fillIds: string[]; forcedLiquidationCount: number } => {
    replaySessionUndoStore.restoreLatestDelta(sessionId);
    sessionLifecycleStore.touchSession(sessionId, occurredAt);
    const nextSession = getSessionById(sessionId);
    return {
      session: nextSession,
      fillIds: [],
      forcedLiquidationCount: 0,
    };
  };

  const { executeFill } = createSessionFillExecutionRuntime({
    appError,
    round,
    resolveOperationIso,
    getBarByIndex,
    getOrCreatePosition,
    resolveTradeDay,
    resolveSessionTradingSettings,
    accruePositionFinancingUntil,
    resolveNextFinancingAccrualDay,
    resolveNextLeverageCycleStartTime,
    assertInitialMarginSufficient,
    sessionCashStore,
    sessionFillStore,
    sessionMetricStore,
    sessionOrderStore,
    sessionPositionStore,
  });

  const enforceMaintenanceMarginWithLiquidation = async (
    session: SessionRow,
    occurredAt = nowIso(),
  ): Promise<string[]> =>
    sessionMarginRuntime.enforceMaintenanceMarginWithLiquidation(
      session,
      occurredAt,
      ({
        orderId,
        side,
        fillIndex,
        fillPrice,
        qty,
        fillBar,
        occurredAt: forcedOccurredAt,
      }) =>
        executeFill(
          orderId,
          session,
          side,
          fillIndex,
          fillPrice,
          qty,
          undefined,
          {
            bypassSettlementCheck: true,
            bypassTradeStepCheck: true,
            fillBar,
            occurredAt: forcedOccurredAt,
          },
        ),
    );

  const executeFillWithMaintenance = async (
    orderId: string,
    session: SessionRow,
    side: Side,
    fillIndex: number,
    fillPrice: number,
    qty?: number,
    amount?: number,
    options?: {
      bypassSettlementCheck?: boolean;
      bypassTradeStepCheck?: boolean;
      fillBar?: OhlcvBar;
      occurredAt?: string;
    }
  ): Promise<string[]> => {
    const fillBar = options?.fillBar ?? (await getBarByIndex(session.instrument_id, fillIndex));
    if (!fillBar) {
      throw appError('FILL_BAR_NOT_FOUND');
    }
    try {
      return await withSavepoint(async () => {
        const primaryFillId = await executeFill(orderId, session, side, fillIndex, fillPrice, qty, amount, {
          ...options,
          fillBar
        });
        const forcedFillIds = await enforceMaintenanceMarginWithLiquidation(
          session,
          options?.occurredAt,
        );
        return [primaryFillId, ...forcedFillIds];
      });
    } catch (error) {
      sessionOrderStore.cancelPendingOrderById(orderId);
      throw error;
    }
  };

  const { createOrGetSession } = createSessionCreationRuntime({
    DEFAULT_USER_ID,
    appError,
    nowIso,
    createId,
    getTradingSettings,
    getInstrumentBySymbol,
    getInstrumentById,
    ensureInstrumentMarketBarsReady,
    getOrCreatePosition,
    normalizeSessionScope,
    resolveOperationIso,
    toBaseTimeframe,
    resolveRequestedFreeReplayAdvancePeriod:
      sessionTimeline.resolveRequestedFreeReplayAdvancePeriod,
    resolveReplayableInitialCursorIndex:
      sessionTimeline.resolveReplayableInitialCursorIndex,
    sessionCashStore,
    sessionLifecycleStore,
    sessionPositionStore,
  });

  const setSessionPlaybackCore = (sessionId: string, intervalMs: number, isPaused: boolean): SessionRow => {
    const session = getSessionById(sessionId);
    sessionLifecycleStore.updatePlayback(
      session.id,
      intervalMs,
      isPaused,
      nowIso(),
    );

    return getSessionById(session.id);
  };

  const pauseSessionPlayback = (session: SessionRow, occurredAt: string): SessionRow => {
    sessionLifecycleStore.updatePlayback(
      session.id,
      Math.max(100, Math.floor(Number(session.autoplay_interval_ms) || 1000)),
      true,
      occurredAt,
    );
    return getSessionById(session.id);
  };

  const updateSessionTradingSettingsCore = async (
    sessionId: string,
    settings: TradingSettings,
  ) => {
    const session = getSessionById(sessionId);
    await withSavepoint(async () => {
      sessionOrderStore.cancelPendingNextOpenOrdersForSession(session.id);
      sessionLifecycleStore.updateTradingSettings(
        session.id,
        JSON.stringify(settings),
        nowIso(),
      );
    });
    return getSessionSnapshot(session.id, null);
  };

  const stepSessionCore = async (
    sessionId: string,
    count = 1,
    options?: {
      targetRawIndex?: number;
      occurredAt?: string;
      maxIndex?: number;
      pendingNextOpenFillFailureMode?: PendingNextOpenFillFailureMode;
    }
  ): Promise<{ session: SessionRow; fillIds: string[]; forcedLiquidationCount: number }> => {
    const session = getSessionById(sessionId);
    const occurredAt = resolveOperationIso(options?.occurredAt);
    sessionOrderStore.normalizePendingNextOpenOrders(session);
    const maxIndex = Number.isFinite(options?.maxIndex)
      ? Math.max(0, Math.floor(Number(options?.maxIndex)))
      : Math.max(0, (await getBarCount(session.instrument_id)) - 1);

    const stepCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
    const startCursor = Math.max(0, session.cursor_index);
    const requestedTarget = Number.isFinite(options?.targetRawIndex)
      ? Math.max(0, Math.floor(Number(options?.targetRawIndex)))
      : startCursor + stepCount;
    const targetCursor = startCursor >= maxIndex ? startCursor : Math.min(maxIndex, Math.max(startCursor, requestedTarget));
    const pendingOrderResult =
      targetCursor > startCursor
        ? await runPendingNextOpenOrdersByCursorRange(
            session,
            startCursor,
            targetCursor,
            occurredAt,
            ({ order, triggerIndex, bar }) =>
              executeFillWithMaintenance(
                order.id,
                session,
                order.side,
                triggerIndex,
                bar.open,
                order.qty ?? undefined,
                order.amount ?? undefined,
                { fillBar: bar, occurredAt },
              ),
            { fillFailureMode: options?.pendingNextOpenFillFailureMode },
          )
        : { fillIds: [], forcedLiquidationCount: 0 };
    const fillIds: string[] = [...pendingOrderResult.fillIds];
    let forcedLiquidationCount = pendingOrderResult.forcedLiquidationCount;

    if (targetCursor > startCursor) {
      const targetBar = await getBarByIndex(session.instrument_id, targetCursor);
      if (targetBar) {
        const maintenanceFillIds = await withSavepoint(async () => {
          await accruePositionFinancingUntil(session, targetBar, occurredAt);
          return enforceMaintenanceMarginWithLiquidation(session, occurredAt);
        });
        fillIds.push(...maintenanceFillIds);
        forcedLiquidationCount += maintenanceFillIds.length;
      }
    }

    sessionLifecycleStore.updateCursor(sessionId, targetCursor, occurredAt);
    const nextSession = getSessionById(sessionId);
    return { session: nextSession, fillIds, forcedLiquidationCount };
  };

  const { placeOrderCore } = createSessionOrderPlacementRuntime({
    appError,
    round,
    resolveOperationIso,
    getSessionById,
    getBarByIndex,
    getBarCount,
    getOrCreatePosition,
    resolveSessionTradingSettings,
    sessionOrderStore,
    executeFillWithMaintenance,
    stepSessionCore,
  });

  const { executeSessionActionCore } = createSessionActionRuntime({
    appError,
    resolveOperationIso,
    getSessionById,
    getBarByIndex,
    getOrCreatePosition,
    resolveSessionTradingSettings,
    resolveSessionAdvancePlan,
    resolveKnownStepAdvanceState,
    buildRuntimeContextFromAdvancePlan,
    sessionCashStore,
    replaySessionUndoStore,
    withSavepoint,
    stepSessionCore,
    placeOrderCore,
    undoReplaySessionAction,
    pauseSessionPlayback,
    getSessionOrderQuote,
  });

  const setSessionPlayback = async (
    sessionId: string,
    intervalMs: number,
    isPaused: boolean,
  ): Promise<SessionRow> =>
    runSerializedSessionMutation(sessionId, async () =>
      setSessionPlaybackCore(sessionId, intervalMs, isPaused),
    );

  const updateSessionTradingSettings = async (
    sessionId: string,
    settings: TradingSettings,
  ): Promise<Awaited<ReturnType<typeof updateSessionTradingSettingsCore>>> =>
    runSerializedSessionMutation(sessionId, async () =>
      updateSessionTradingSettingsCore(sessionId, settings),
    );

  const stepSession = async (
    sessionId: string,
    count = 1,
  ): Promise<{ session: SessionRow; fillIds: string[]; forcedLiquidationCount: number }> =>
    runSerializedSessionMutation(sessionId, async () => stepSessionCore(sessionId, count));

  const executeSessionAction = async (
    sessionId: string,
    payload: ReplaySessionActionPayload,
  ): Promise<SessionActionExecutionResult> =>
    runSerializedSessionMutation(sessionId, async () =>
      executeSessionActionCore(sessionId, payload),
    );

  const placeOrder = async (
    sessionId: string,
    payload: Omit<PlaceOrderPayload, 'occurredAt'>,
  ): Promise<{ session: SessionRow; fillIds: string[]; forcedLiquidationCount: number }> =>
    runSerializedSessionMutation(sessionId, async () => placeOrderCore(sessionId, payload));

  return {
    executeFill,
    createOrGetSession,
    setSessionPlayback,
    updateSessionTradingSettings,
    stepSession,
    executeSessionAction,
    placeOrder,
    runSerializedTrainingMutation,
    getSessionOrderQuote,
    getSessionRuntimeDelta,
    getSessionSnapshot
  };
};
