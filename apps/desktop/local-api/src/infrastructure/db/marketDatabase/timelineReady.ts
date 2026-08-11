// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from '@zinuto/shared/period';
import { getMarketBarCount } from './barReader.js';
import {
  MARKET_TIMELINE_CALENDAR_PERIODS,
  MARKET_TIMELINE_DISPLAY_PERIODS,
} from './constants.js';
import {
  getMarketDbContext,
  queryRows,
  queryRowsWithConnection,
  withMarketDbLock,
} from './connection.js';
import type { MarketTimelineBuildInput } from './types.js';
import { toSafeInt } from './utils.js';
import {
  normalizeTimelineBaseTimeframe,
  normalizeTimelineDisplayPeriod,
  normalizeTimelineTimeZone,
  normalizeTimelineVersionToken,
  rebuildMarketTimelineWithConnection,
} from './timelineBuild.js';

export const ensureMarketTimelinePeriodsReady = async (
  input: MarketTimelineBuildInput,
  displayPeriods: readonly DisplayPeriodKey[],
  options: {
    priority?: 'bulk' | 'interactive';
    signal?: AbortSignal;
  } = {},
): Promise<void> => {
  const signal = options.signal ?? input.signal;
  signal?.throwIfAborted();
  const instrumentId = String(input.instrumentId ?? '').trim();
  if (!instrumentId) {
    return;
  }
  const totalRaw = await getMarketBarCount(instrumentId, { signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const baseTimeframe = normalizeTimelineBaseTimeframe(input.baseTimeframe);
  const requestedDisplayPeriods = Array.from(
    new Set(
      displayPeriods
        .map((period) => normalizeTimelineDisplayPeriod(period))
        .filter((period): period is DisplayPeriodKey => Boolean(period))
    )
  );
  if (
    baseTimeframe !== '1d' &&
    requestedDisplayPeriods.some((period) =>
      period !== '1d' && MARKET_TIMELINE_CALENDAR_PERIODS.includes(period)
    ) &&
    !requestedDisplayPeriods.includes('1d')
  ) {
    requestedDisplayPeriods.unshift('1d');
  }
  if (!requestedDisplayPeriods.length) {
    return;
  }
  const periodPlaceholders = requestedDisplayPeriods.map(() => '?').join(',');
  const readyRows = await queryRows<{ count: unknown }>(
    `SELECT COUNT(*) AS count
       FROM market_timeline_meta
      WHERE instrument_id = ?
        AND version_token = ?
        AND time_zone = ?
        AND total_raw = ?
        AND build_status = 'READY'
        AND display_period IN (${periodPlaceholders})`,
    [instrumentId, versionToken, timeZone, totalRaw, ...requestedDisplayPeriods],
    { signal },
  );
  const expectedReadyCount = requestedDisplayPeriods.length;
  if (toSafeInt(readyRows[0]?.count ?? 0) >= expectedReadyCount) {
    return;
  }

  await withMarketDbLock(
    async () => {
      signal?.throwIfAborted();
      const { connection } = await getMarketDbContext();
      const interrupt = (): void => {
        try {
          connection.interrupt();
        } catch {
          // The task still observes the aborted signal before publishing.
        }
      };
      signal?.addEventListener('abort', interrupt, { once: true });
      try {
        signal?.throwIfAborted();
        const lockedReadyRows = await queryRowsWithConnection<{ count: unknown }>(
          connection,
          `SELECT COUNT(*) AS count
             FROM market_timeline_meta
             WHERE instrument_id = ?
              AND version_token = ?
              AND time_zone = ?
              AND total_raw = ?
              AND build_status = 'READY'
              AND display_period IN (${periodPlaceholders})`,
          [instrumentId, versionToken, timeZone, totalRaw, ...requestedDisplayPeriods]
        );
        signal?.throwIfAborted();
        if (toSafeInt(lockedReadyRows[0]?.count ?? 0) >= expectedReadyCount) {
          return;
        }
        await rebuildMarketTimelineWithConnection(connection, {
          ...input,
          instrumentId,
          versionToken,
          timeZone,
          signal,
          displayPeriods: requestedDisplayPeriods
        });
        signal?.throwIfAborted();
      } finally {
        signal?.removeEventListener('abort', interrupt);
      }
    },
    { priority: options.priority ?? 'interactive', signal }
  );
};

export const ensureMarketTimelineReady = async (
  input: MarketTimelineBuildInput & { displayPeriod?: DisplayPeriodKey },
  options: {
    priority?: 'bulk' | 'interactive';
    signal?: AbortSignal;
  } = {},
): Promise<void> => {
  const displayPeriod = normalizeTimelineDisplayPeriod(input.displayPeriod);
  await ensureMarketTimelinePeriodsReady(
    input,
    displayPeriod ? [displayPeriod] : MARKET_TIMELINE_DISPLAY_PERIODS,
    options,
  );
};

export const getMarketTimelineReadyPeriods = async (
  input: MarketTimelineBuildInput
): Promise<DisplayPeriodKey[]> => {
  input.signal?.throwIfAborted();
  const instrumentId = String(input.instrumentId ?? '').trim();
  if (!instrumentId) {
    return [];
  }
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const rows = await queryRows<{ display_period: unknown }>(
    `SELECT display_period
       FROM market_timeline_meta
      WHERE instrument_id = ?
        AND version_token = ?
        AND time_zone = ?
        AND total_raw = ?
        AND build_status = 'READY'
      ORDER BY display_period ASC`,
    [instrumentId, versionToken, timeZone, totalRaw],
    { signal: input.signal },
  );
  return rows
    .map((row) => normalizeTimelineDisplayPeriod(row.display_period))
    .filter((period): period is DisplayPeriodKey => Boolean(period));
};
