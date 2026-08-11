// SPDX-License-Identifier: GPL-3.0-only

import {
  serializeReplaySessionDataGrant,
  type ReplaySessionDataGrant,
} from '../trainingDataAccessGrant.js';
import type { FreeReplayAdvancePeriod } from '@zinuto/shared/period';
import {
  SYSTEM_FX_1M_2025Q1_POOL_ID,
  SYSTEM_WIKI_EOD_POOL_ID,
} from '../ports/infrastructure/db/systemSeedBars.js';
import type { createSessionCashStore } from '../ports/infrastructure/db/trading/sessionCashStore.js';
import type { createSessionLifecycleStore } from '../ports/infrastructure/db/trading/sessionLifecycleStore.js';
import type { createSessionPositionStore } from '../ports/infrastructure/db/trading/sessionPositionStore.js';
import type { createSessionTimelinePlanner } from './sessionTimeline.js';
import type {
  InstrumentRow,
  PositionRow,
  SessionRow,
  TradingExecutionSettings,
} from '../../domain/trading/types.js';

export type CreateOrGetSessionOptions = {
  instrumentId?: string;
  samplePoolId?: string;
  minimumBaseTimeframe?: FreeReplayAdvancePeriod;
  sessionTradingSettings?: TradingExecutionSettings;
  accessGrant?: ReplaySessionDataGrant;
  sessionScope?: ReplaySessionScope;
  createdAt?: string;
  archiveStartIndex?: number;
};

type ReplaySessionScope = 'OFFICIAL' | 'SIMULATION_ONLY';

type SessionCashStore = Pick<
  ReturnType<typeof createSessionCashStore>,
  'resolveSessionInitialCashBalance'
>;

type SessionLifecycleStore = Pick<
  ReturnType<typeof createSessionLifecycleStore>,
  'findLatestReusableSession' | 'insertSession' | 'updateSessionAccessGrant'
>;

type SessionPositionStore = Pick<
  ReturnType<typeof createSessionPositionStore>,
  'touchPosition'
>;

type TimelinePlanner = ReturnType<typeof createSessionTimelinePlanner>;

type CreateSessionCreationRuntimeDeps = {
  DEFAULT_USER_ID: string;
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
  nowIso: () => string;
  createId: () => string;
  getTradingSettings: () => TradingExecutionSettings;
  getInstrumentBySymbol: (symbol: string, timeframe?: string) => InstrumentRow | undefined;
  getInstrumentById: (id: string) => InstrumentRow | undefined;
  ensureInstrumentMarketBarsReady: (instrument: InstrumentRow) => Promise<number>;
  getOrCreatePosition: (sessionId: string, instrumentId: string) => PositionRow;
  normalizeSessionScope: (value: unknown) => ReplaySessionScope;
  resolveOperationIso: (value: unknown) => string;
  toBaseTimeframe: TimelinePlanner['toBaseTimeframe'];
  resolveRequestedFreeReplayAdvancePeriod: TimelinePlanner['resolveRequestedFreeReplayAdvancePeriod'];
  resolveReplayableInitialCursorIndex: TimelinePlanner['resolveReplayableInitialCursorIndex'];
  sessionCashStore: SessionCashStore;
  sessionLifecycleStore: SessionLifecycleStore;
  sessionPositionStore: SessionPositionStore;
};

const normalizeSamplePoolId = (value: unknown): string =>
  String(value ?? '').trim();

export const createSessionCreationRuntime = ({
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
  resolveRequestedFreeReplayAdvancePeriod,
  resolveReplayableInitialCursorIndex,
  sessionCashStore,
  sessionLifecycleStore,
  sessionPositionStore,
}: CreateSessionCreationRuntimeDeps) => {
  const resolveInstrumentSamplePoolId = (instrument: InstrumentRow): string => {
    const sourceId = normalizeSamplePoolId(instrument.source_id);
    if (sourceId) {
      return sourceId;
    }
    if (String(instrument.market || '').trim().toUpperCase() === 'SYSTEM') {
      return toBaseTimeframe(instrument.base_timeframe, '1d') === '1m'
        ? SYSTEM_FX_1M_2025Q1_POOL_ID
        : SYSTEM_WIKI_EOD_POOL_ID;
    }
    return '';
  };

  const createOrGetSession = async (
    symbol: string,
    timeframe = '1d',
    forceNew = false,
    anchorIndex?: number,
    options?: CreateOrGetSessionOptions,
  ): Promise<SessionRow> => {
    const normalizedInstrumentId = String(options?.instrumentId || '').trim();
    const instrument = normalizedInstrumentId
      ? getInstrumentById(normalizedInstrumentId)
      : getInstrumentBySymbol(symbol, timeframe);
    if (!instrument) {
      throw appError(
        'INSTRUMENT_NOT_FOUND',
        normalizedInstrumentId ? { instrumentId: normalizedInstrumentId } : { symbol },
      );
    }
    const instrumentSourceTimeframe = toBaseTimeframe(instrument.base_timeframe, '1d');
    const sourceTimeframe = normalizedInstrumentId
      ? instrumentSourceTimeframe
      : toBaseTimeframe(timeframe, instrumentSourceTimeframe);
    const minimumBaseTimeframe = resolveRequestedFreeReplayAdvancePeriod(
      sourceTimeframe,
      options?.minimumBaseTimeframe,
    );
    const instrumentSamplePoolId = resolveInstrumentSamplePoolId(instrument);
    const requestedSamplePoolId = normalizeSamplePoolId(options?.samplePoolId);
    if (
      instrumentSamplePoolId &&
      requestedSamplePoolId &&
      instrumentSamplePoolId !== requestedSamplePoolId
    ) {
      throw appError('INSTRUMENT_NOT_FOUND', {
        instrumentId: instrument.id,
        samplePoolId: requestedSamplePoolId,
      });
    }
    const samplePoolId = instrumentSamplePoolId || requestedSamplePoolId;
    const sessionTradingSettingsJson = JSON.stringify(
      options?.sessionTradingSettings ?? getTradingSettings(),
    );
    const accessGrantJson = options?.accessGrant
      ? serializeReplaySessionDataGrant(options.accessGrant)
      : 'null';
    const sessionScope = normalizeSessionScope(options?.sessionScope);
    const createdAt = resolveOperationIso(options?.createdAt);

    const persistSessionAccessGrant = (
      session: SessionRow,
      persistOptions?: { touch?: boolean },
    ): SessionRow => {
      const nextSession = { ...session };
      const shouldUpdateAccessGrant =
        accessGrantJson !== 'null' &&
        String(nextSession.access_grant_json ?? '') !== accessGrantJson;
      if (!shouldUpdateAccessGrant && !persistOptions?.touch) {
        return session;
      }
      const updatedAt = nowIso();
      if (shouldUpdateAccessGrant) {
        nextSession.access_grant_json = accessGrantJson;
      }
      nextSession.updated_at = updatedAt;
      sessionLifecycleStore.updateSessionAccessGrant({
        sessionId: session.id,
        tradingSettingsJson: String(nextSession.trading_settings_json ?? ''),
        accessGrantJson: String(nextSession.access_grant_json ?? 'null'),
        updatedAt,
      });
      return nextSession;
    };

    const hasManualAnchor = Number.isFinite(anchorIndex);
    if (!forceNew && !hasManualAnchor) {
      const existing = sessionLifecycleStore.findLatestReusableSession({
        userId: DEFAULT_USER_ID,
        instrumentId: instrument.id,
        timeframe: sourceTimeframe,
        minimumBaseTimeframe,
        samplePoolId,
        sessionScope,
      });

      if (existing) {
        return persistSessionAccessGrant(existing, { touch: true });
      }
    }

    const barCount = await ensureInstrumentMarketBarsReady(instrument);
    if (barCount <= 0) {
      throw appError(
        'INSTRUMENT_NO_BARS',
        normalizedInstrumentId ? { instrumentId: normalizedInstrumentId } : { symbol },
      );
    }
    if (barCount < 2) {
      throw appError(
        'INSTRUMENT_NOT_ENOUGH_BARS',
        normalizedInstrumentId
          ? { instrumentId: normalizedInstrumentId, barCount, minimumBars: 2 }
          : { symbol, barCount, minimumBars: 2 },
      );
    }

    const initialCursor = await resolveReplayableInitialCursorIndex({
      instrument,
      sourceTimeframe,
      minimumBaseTimeframe,
      barCount,
      anchorIndex,
    });
    const requestedArchiveStartIndex = Number.isFinite(options?.archiveStartIndex)
      ? Math.floor(Number(options?.archiveStartIndex))
      : 0;
    const initialStartIndex = Math.max(
      0,
      Math.min(initialCursor, requestedArchiveStartIndex),
    );
    const initialEntryIndex = initialCursor;
    const initialHistoryBars = Math.max(1, initialCursor - initialStartIndex + 1);

    const created: SessionRow = {
      id: createId(),
      user_id: DEFAULT_USER_ID,
      instrument_id: instrument.id,
      sample_pool_id: samplePoolId,
      trading_settings_json: sessionTradingSettingsJson,
      access_grant_json: accessGrantJson,
      timeframe: sourceTimeframe,
      minimum_base_timeframe: minimumBaseTimeframe,
      start_index: initialStartIndex,
      entry_index: initialEntryIndex,
      history_bars: initialHistoryBars,
      cursor_index: initialCursor,
      cash_balance: sessionCashStore.resolveSessionInitialCashBalance({
        id: '',
        user_id: DEFAULT_USER_ID,
        instrument_id: instrument.id,
        sample_pool_id: samplePoolId,
        trading_settings_json: sessionTradingSettingsJson,
        access_grant_json: accessGrantJson,
        timeframe: sourceTimeframe,
        minimum_base_timeframe: minimumBaseTimeframe,
        start_index: initialStartIndex,
        entry_index: initialEntryIndex,
        history_bars: initialHistoryBars,
        cursor_index: initialCursor,
        autoplay_interval_ms: 1000,
        is_paused: 1,
        created_at: createdAt,
      } as SessionRow),
      autoplay_interval_ms: 1000,
      is_paused: 1,
      session_scope: sessionScope,
      created_at: createdAt,
    };

    sessionLifecycleStore.insertSession(created);

    getOrCreatePosition(created.id, created.instrument_id);
    sessionPositionStore.touchPosition(
      created.id,
      created.instrument_id,
      createdAt,
    );
    return persistSessionAccessGrant(created);
  };

  return {
    createOrGetSession,
  };
};
