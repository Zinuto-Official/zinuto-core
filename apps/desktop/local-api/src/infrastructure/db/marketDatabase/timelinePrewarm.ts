// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../../kernel/appError.js';
import { db } from '../database.js';
import type { DisplayPeriodKey } from '@zinuto/shared/period';
import {
  DEFAULT_TRADING_CALENDAR_CONFIG,
  parseStoredTradingCalendarConfig,
  stableTradingCalendarKey,
  type TradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';
import {
  HOT_MARKET_TIMELINE_PREWARM_PERIODS,
  SYMBOL_QUERY_CHUNK_SIZE,
} from './constants.js';
import { warmUpMarketDatabase } from './connection.js';
import { toSafeInt } from './utils.js';
import {
  acquireMarketPrewarmExecutionQuiesceLease,
  getMarketPrewarmExecutionState,
  invalidateMarketPrewarmExecutionState,
  drainMarketPrewarmTasks,
  resetMarketPrewarmExecutionState,
  scheduleMarketPrewarmTask,
  setMarketPrewarmBlocker,
  stopMarketPrewarmExecutionState,
  waitForMarketPrewarmIdle,
  type MarketPrewarmQuiesceLease,
  type MarketPrewarmTaskContext,
} from './prewarmExecutionState.js';
import {
  normalizeTimelineBaseTimeframe,
  normalizeTimelineVersionToken,
} from './timelineBuild.js';
import { ensureMarketTimelinePeriodsReady } from './timelineReady.js';

export type HotMarketTimelinePrewarmProfile = {
  instrumentId: string;
  baseTimeframe: DisplayPeriodKey;
  timeZone: string | null;
  versionToken: string;
  tradingCalendar: TradingCalendarConfig;
  totalRaw: number;
};

export const listHotMarketTimelinePrewarmProfiles = (
  instrumentIds: readonly string[]
): HotMarketTimelinePrewarmProfile[] => {
  const normalizedInstrumentIds = Array.from(
    new Set(
      instrumentIds
        .map((item) => String(item ?? '').trim())
        .filter((item) => Boolean(item))
    )
  );
  if (!normalizedInstrumentIds.length) {
    return [];
  }
  const profiles: HotMarketTimelinePrewarmProfile[] = [];
  for (let offset = 0; offset < normalizedInstrumentIds.length; offset += SYMBOL_QUERY_CHUNK_SIZE) {
    const chunk = normalizedInstrumentIds.slice(offset, offset + SYMBOL_QUERY_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT instruments.id,
              instruments.source_id,
              instruments.market,
              instruments.base_timeframe,
              instruments.time_zone,
              instruments.bar_count,
              instruments.bars_version_token,
              local_data_sources.trading_calendar_json
         FROM instruments
         LEFT JOIN local_data_sources
           ON local_data_sources.id = instruments.source_id
        WHERE instruments.id IN (${placeholders})`
    ).all(...chunk) as Array<{
      id?: unknown;
      source_id?: unknown;
      market?: unknown;
      base_timeframe?: unknown;
      time_zone?: unknown;
      bar_count?: unknown;
      bars_version_token?: unknown;
      trading_calendar_json?: unknown;
    }>;
    rows.forEach((row) => {
      const instrumentId = String(row.id ?? '').trim();
      const totalRaw = toSafeInt(row.bar_count ?? 0);
      if (!instrumentId || totalRaw <= 0) {
        return;
      }
      const market = String(row.market ?? '').trim().toUpperCase();
      const sourceId = String(row.source_id ?? '').trim();
      const tradingCalendar =
        market === 'LOCAL'
          ? parseStoredTradingCalendarConfig(
              String(row.trading_calendar_json ?? '').trim() ||
                (() => {
                  throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
                })(),
            )
          : DEFAULT_TRADING_CALENDAR_CONFIG;
      const baseTimeframe = normalizeTimelineBaseTimeframe(row.base_timeframe);
      const rawVersionToken = String(row.bars_version_token ?? '').trim();
      const baseVersionToken = normalizeTimelineVersionToken(
        rawVersionToken,
        ['market-frame', instrumentId, baseTimeframe, totalRaw].join(':')
      );
      const versionToken = `${baseVersionToken}:calendar:${stableTradingCalendarKey(tradingCalendar)}`;
      profiles.push({
        instrumentId,
        baseTimeframe,
        timeZone:
          typeof row.time_zone === 'string' && row.time_zone.trim()
            ? row.time_zone.trim()
            : null,
        versionToken,
        tradingCalendar,
        totalRaw
      });
    });
  }
  return profiles;
};

export const prewarmHotMarketTimelinesForInstruments = async (
  instrumentIds: readonly string[],
  options: { signal?: AbortSignal } = {},
): Promise<void> => {
  options.signal?.throwIfAborted();
  const profiles = listHotMarketTimelinePrewarmProfiles(instrumentIds);
  for (const profile of profiles) {
    options.signal?.throwIfAborted();
    await ensureMarketTimelinePeriodsReady(
      {
        instrumentId: profile.instrumentId,
        versionToken: profile.versionToken,
        baseTimeframe: profile.baseTimeframe,
        timeZone: profile.timeZone,
        tradingCalendar: profile.tradingCalendar,
        signal: options.signal,
      },
      HOT_MARKET_TIMELINE_PREWARM_PERIODS,
      { priority: 'bulk', signal: options.signal },
    );
  }
};

export const marketTimelinePrewarmQueue = new Set<string>();
let marketTimelinePrewarmRunnerOverride:
  | ((instrumentIds: readonly string[]) => Promise<void>)
  | null = null;
export const MARKET_TIMELINE_PREWARM_TASK_KEY = 'timeline:hot-instruments';
export const MARKET_DATABASE_STARTUP_WARMUP_TASK_KEY = 'connection:startup';

export const scheduleMarketDatabaseWarmUp = (): boolean =>
  scheduleMarketPrewarmTask(
    MARKET_DATABASE_STARTUP_WARMUP_TASK_KEY,
    async (context) => {
      await warmUpMarketDatabase({
        signal: context.signal,
        canPublish: context.canPublish,
      });
      context.assertCanPublish();
    },
  );

export const normalizeInstrumentIdsForTimelinePrewarm = (
  instrumentIds: readonly string[]
): string[] => {
  const normalizedIds = new Set<string>();
  instrumentIds.forEach((instrumentId) => {
    const normalizedInstrumentId = String(instrumentId ?? '').trim();
    if (normalizedInstrumentId) {
      normalizedIds.add(normalizedInstrumentId);
    }
  });
  return Array.from(normalizedIds);
};

export const resolveHotMarketTimelinePrewarmRunner = (): ((
  instrumentIds: readonly string[],
  options?: { signal?: AbortSignal },
) => Promise<void>) =>
  marketTimelinePrewarmRunnerOverride ?? prewarmHotMarketTimelinesForInstruments;

export const setMarketTimelinePrewarmBlocker = (blocker: (() => boolean) | null): void => {
  setMarketPrewarmBlocker(blocker);
};

export const runMarketTimelinePrewarmBatch = async (
  context: MarketPrewarmTaskContext,
): Promise<void> => {
  context.signal.throwIfAborted();
  const instrumentIds = Array.from(marketTimelinePrewarmQueue);
  marketTimelinePrewarmQueue.clear();
  if (!instrumentIds.length) {
    return;
  }
  try {
    await resolveHotMarketTimelinePrewarmRunner()(instrumentIds, {
      signal: context.signal,
    });
    context.assertCanPublish();
  } catch (error) {
    if (context.signal.aborted) {
      throw error;
    }
    // eslint-disable-next-line no-console
    console.error('[zinuto-market] timeline prewarm failed', {
      instrumentCount: instrumentIds.length,
      errorType: error instanceof Error ? error.name : typeof error
    });
  }
};

export const scheduleMarketTimelinePrewarmQueue = (): boolean => {
  if (!marketTimelinePrewarmQueue.size) {
    return false;
  }
  return scheduleMarketPrewarmTask(
    MARKET_TIMELINE_PREWARM_TASK_KEY,
    runMarketTimelinePrewarmBatch,
  );
};

export const enqueueHotMarketTimelinePrewarmForInstruments = (
  instrumentIds: readonly string[]
): void => {
  const normalizedInstrumentIds = normalizeInstrumentIdsForTimelinePrewarm(instrumentIds);
  if (!normalizedInstrumentIds.length) {
    return;
  }
  normalizedInstrumentIds.forEach((instrumentId) => {
    marketTimelinePrewarmQueue.add(instrumentId);
  });
  if (!scheduleMarketTimelinePrewarmQueue()) {
    marketTimelinePrewarmQueue.clear();
  }
};

export const waitForMarketTimelinePrewarmQueueIdle = async (): Promise<void> => {
  await waitForMarketPrewarmIdle();
};

export const getMarketTimelinePrewarmQueueState = () => {
  const state = getMarketPrewarmExecutionState();
  return {
    pendingInstrumentIds: Array.from(marketTimelinePrewarmQueue),
    running: state.activeKeys.includes(MARKET_TIMELINE_PREWARM_TASK_KEY),
    scheduled: state.scheduled || state.pendingKeys.includes(MARKET_TIMELINE_PREWARM_TASK_KEY),
    idleWaiterCount: state.idleWaiterCount,
  };
};

export const setMarketTimelinePrewarmRunner = (
  runner: ((instrumentIds: readonly string[]) => Promise<void>) | null
): void => {
  marketTimelinePrewarmRunnerOverride = runner;
};

export const stopMarketTimelinePrewarmQueue = async (): Promise<void> => {
  marketTimelinePrewarmQueue.clear();
  await stopMarketPrewarmExecutionState();
};

export const drainMarketTimelinePrewarmQueue = async (): Promise<void> => {
  await drainMarketPrewarmTasks();
};

export const resetMarketTimelinePrewarmRuntime = (): void => {
  marketTimelinePrewarmQueue.clear();
  marketTimelinePrewarmRunnerOverride = null;
  resetMarketPrewarmExecutionState();
};

export const acquireMarketPrewarmQuiesceLease = async (
): Promise<MarketPrewarmQuiesceLease> => {
  marketTimelinePrewarmQueue.clear();
  return acquireMarketPrewarmExecutionQuiesceLease();
};

export const invalidateMarketPrewarmRuntime = async (): Promise<void> => {
  marketTimelinePrewarmQueue.clear();
  await invalidateMarketPrewarmExecutionState();
};

export const stopMarketPrewarmRuntime = stopMarketTimelinePrewarmQueue;

export { scheduleMarketPrewarmTask };
export type { MarketPrewarmQuiesceLease, MarketPrewarmTaskContext };
