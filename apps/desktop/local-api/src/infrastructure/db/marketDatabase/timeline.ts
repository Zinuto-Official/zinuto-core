// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from '@zinuto/shared/period';
import { getMarketBarCount } from './barReader.js';
import {
  MARKET_TIMELINE_FIXED_PERIOD_MINUTES,
} from './constants.js';
import { queryRows } from './connection.js';
import { incrementMarketReadDiagnostic } from './readDiagnostics.js';
import type { MarketDisplayBar, MarketTimelineBuildInput } from './types.js';
import { toSafeInt } from './utils.js';

export {
  prewarmHotMarketTimelinesForInstruments,
  scheduleMarketDatabaseWarmUp,
  setMarketTimelinePrewarmBlocker,
  enqueueHotMarketTimelinePrewarmForInstruments,
  waitForMarketTimelinePrewarmQueueIdle,
  getMarketTimelinePrewarmQueueState,
  setMarketTimelinePrewarmRunner,
  stopMarketTimelinePrewarmQueue,
  drainMarketTimelinePrewarmQueue,
  resetMarketTimelinePrewarmRuntime,
  acquireMarketPrewarmQuiesceLease,
  invalidateMarketPrewarmRuntime,
  stopMarketPrewarmRuntime,
  scheduleMarketPrewarmTask,
} from './timelinePrewarm.js';
export type { MarketPrewarmQuiesceLease, MarketPrewarmTaskContext } from './timelinePrewarm.js';

import {
  isRawNativeDisplayPeriod,
  normalizeTimelineDisplayPeriod,
  normalizeTimelineTimeZone,
  normalizeTimelineVersionToken,
  shouldPersistDisplayPeriod,
} from './timelineBuild.js';
export {
  invalidateMarketTimelineWithConnection,
  normalizeTimelineBaseTimeframe,
  normalizeTimelineDisplayPeriod,
  normalizeTimelineTimeZone,
  normalizeTimelineVersionToken,
  reindexMarketBarsWithConnection,
  toMarketDisplayBar,
} from './timelineBuild.js';

import { ensureMarketTimelineReady } from './timelineReady.js';
export {
  ensureMarketTimelinePeriodsReady,
  ensureMarketTimelineReady,
  getMarketTimelineReadyPeriods,
} from './timelineReady.js';

import {
  getCalendarDisplayBarContainingRawIndex,
  getCalendarDisplayBarsByIndexRange,
  getFixedDisplayBarContainingRawIndex,
  getFixedDisplayBarsByIndexRange,
  getPersistedDisplayBarContainingRawIndex,
  getPersistedDisplayBarsByIndexRange,
  getRawDisplayBarContainingRawIndex,
  getRawDisplayBarsByIndexRange,
} from './timelineReader.js';

export const getMarketTimelineTotalDisplay = async (
  input: MarketTimelineBuildInput & { displayPeriod: DisplayPeriodKey }
): Promise<number> => {
  input.signal?.throwIfAborted();
  await ensureMarketTimelineReady(input, { signal: input.signal });
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const rows = await queryRows<{ total_display: unknown }>(
    `SELECT total_display
       FROM market_timeline_meta
      WHERE instrument_id = ?
        AND version_token = ?
        AND display_period = ?
        AND time_zone = ?
        AND build_status = 'READY'
      LIMIT 1`,
    [instrumentId, versionToken, input.displayPeriod, timeZone],
    { signal: input.signal },
  );
  return toSafeInt(rows[0]?.total_display ?? 0);
};

export const getMarketTimelineStorageStats = async (
  instrumentId: string
): Promise<{
  persistedDisplayRowsByPeriod: Record<string, number>;
  anchorRowsByPeriod: Record<string, number>;
}> => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return {
      persistedDisplayRowsByPeriod: {},
      anchorRowsByPeriod: {}
    };
  }
  const displayRows = await queryRows<Record<string, unknown>>(
    `SELECT display_period, COUNT(*) AS count
       FROM market_display_bars
      WHERE instrument_id = ?
      GROUP BY display_period`,
    [normalizedInstrumentId]
  );
  const anchorRows = await queryRows<Record<string, unknown>>(
    `SELECT display_period, COUNT(*) AS count
       FROM market_display_anchors
      WHERE instrument_id = ?
      GROUP BY display_period`,
    [normalizedInstrumentId]
  );
  return {
    persistedDisplayRowsByPeriod: Object.fromEntries(
      displayRows.map((row) => [String(row.display_period ?? ''), toSafeInt(row.count)])
    ),
    anchorRowsByPeriod: Object.fromEntries(
      anchorRows.map((row) => [String(row.display_period ?? ''), toSafeInt(row.count)])
    )
  };
};

export const getMarketDisplayBarsByIndexRange = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    offset: number;
    limit: number;
  }
): Promise<MarketDisplayBar[]> => {
  input.signal?.throwIfAborted();
  await ensureMarketTimelineReady(input, { signal: input.signal });
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const limit = Math.max(0, Math.floor(Number(input.limit) || 0));
  if (!instrumentId || limit <= 0) {
    return [];
  }
  const displayPeriod = normalizeTimelineDisplayPeriod(input.displayPeriod) ?? '1d';
  const routedInput = {
    ...input,
    instrumentId,
    versionToken,
    timeZone,
    displayPeriod,
    offset,
    limit
  };
  if (isRawNativeDisplayPeriod(routedInput)) {
    return getRawDisplayBarsByIndexRange({
      instrumentId,
      offset,
      limit,
      signal: input.signal,
    });
  }
  if (shouldPersistDisplayPeriod(routedInput)) {
    return getPersistedDisplayBarsByIndexRange(routedInput);
  }
  if (MARKET_TIMELINE_FIXED_PERIOD_MINUTES.has(displayPeriod)) {
    return getFixedDisplayBarsByIndexRange(routedInput);
  }
  return getCalendarDisplayBarsByIndexRange(routedInput);
};

export const getMarketDisplayBarContainingRawIndex = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    rawIndex: number;
  }
): Promise<MarketDisplayBar | null> => {
  input.signal?.throwIfAborted();
  incrementMarketReadDiagnostic('displayContainingReadCount');
  await ensureMarketTimelineReady(input, { signal: input.signal });
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const rawIndex = Math.max(0, Math.floor(Number(input.rawIndex) || 0));
  const displayPeriod = normalizeTimelineDisplayPeriod(input.displayPeriod) ?? '1d';
  const routedInput = {
    ...input,
    instrumentId,
    versionToken,
    timeZone,
    displayPeriod,
    rawIndex
  };
  if (isRawNativeDisplayPeriod(routedInput)) {
    return getRawDisplayBarContainingRawIndex({
      instrumentId,
      rawIndex,
      signal: input.signal,
    });
  }
  if (shouldPersistDisplayPeriod(routedInput)) {
    return getPersistedDisplayBarContainingRawIndex(routedInput);
  }
  if (MARKET_TIMELINE_FIXED_PERIOD_MINUTES.has(displayPeriod)) {
    return getFixedDisplayBarContainingRawIndex(routedInput);
  }
  return getCalendarDisplayBarContainingRawIndex(routedInput);
};

export const getMarketDisplayBarByDisplayIndex = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    displayIndex: number;
  }
): Promise<MarketDisplayBar | null> => {
  incrementMarketReadDiagnostic('displayIndexReadCount');
  const bars = await getMarketDisplayBarsByIndexRange({
    ...input,
    offset: Math.max(0, Math.floor(Number(input.displayIndex) || 0)),
    limit: 1
  });
  return bars[0] ?? null;
};
