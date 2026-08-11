// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from '@zinuto/shared/period';
import { getMarketBarCount } from './barReader.js';
import { queryRows } from './connection.js';
import { buildOhlcvSelectDoubleSql } from './ohlcvSql.js';
import type { MarketDisplayBar, MarketTimelineBuildInput } from './types.js';
import { toSafeInt } from './utils.js';
import {
  buildCalendarBoundariesValuesSql,
  buildDailyTimelineSourceSql,
  buildFixedTimelineBucketStartSql,
  normalizeTimelineBaseTimeframe,
  normalizeTimelineTimeZone,
  normalizeTimelineVersionToken,
  toMarketDisplayBar,
} from './timelineBuild.js';

export const getRawDisplayBarsByIndexRange = async (
  input: {
    instrumentId: string;
    offset: number;
    limit: number;
    signal?: AbortSignal;
  }
): Promise<MarketDisplayBar[]> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT raw_index AS display_index,
            ts_ms AS bucket_start_ms,
            raw_index AS start_raw_index,
            raw_index AS end_raw_index,
            ts_ms AS start_ts_ms,
            ts_ms AS end_ts_ms,
            open,
            high,
            low,
            close,
            volume
       FROM market_bars
      WHERE instrument_id = ?
        AND raw_index >= ?
        AND raw_index < ?
      ORDER BY raw_index ASC`,
    [
      input.instrumentId,
      input.offset,
      input.offset + input.limit
    ],
    { signal: input.signal },
  );
  return rows.map(toMarketDisplayBar);
};

export const getRawDisplayBarContainingRawIndex = async (
  input: {
    instrumentId: string;
    rawIndex: number;
    signal?: AbortSignal;
  }
): Promise<MarketDisplayBar | null> => {
  const bars = await getRawDisplayBarsByIndexRange({
    instrumentId: input.instrumentId,
    offset: input.rawIndex,
    limit: 1,
    signal: input.signal,
  });
  return bars[0] ?? null;
};

export const getPersistedDisplayBarsByIndexRange = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    offset: number;
    limit: number;
  }
): Promise<MarketDisplayBar[]> => {
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT display.display_index,
            display.bucket_start_ms,
            display.start_raw_index,
            display.end_raw_index,
            start_bar.ts_ms AS start_ts_ms,
            end_bar.ts_ms AS end_ts_ms,
            ${buildOhlcvSelectDoubleSql('display')}
       FROM market_display_bars AS display
       JOIN market_bars AS start_bar
         ON start_bar.instrument_id = display.instrument_id
        AND start_bar.raw_index = display.start_raw_index
       JOIN market_bars AS end_bar
         ON end_bar.instrument_id = display.instrument_id
        AND end_bar.raw_index = display.end_raw_index
      WHERE display.instrument_id = ?
        AND display.version_token = ?
        AND display.display_period = ?
        AND display.time_zone = ?
        AND display.display_index >= ?
        AND display.display_index < ?
      ORDER BY display.display_index ASC`,
    [
      instrumentId,
      versionToken,
      input.displayPeriod,
      timeZone,
      input.offset,
      input.offset + input.limit
    ],
    { signal: input.signal },
  );
  return rows.map(toMarketDisplayBar);
};

export const getPersistedDisplayBarContainingRawIndex = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    rawIndex: number;
  }
): Promise<MarketDisplayBar | null> => {
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT display.display_index,
            display.bucket_start_ms,
            display.start_raw_index,
            display.end_raw_index,
            start_bar.ts_ms AS start_ts_ms,
            end_bar.ts_ms AS end_ts_ms,
            ${buildOhlcvSelectDoubleSql('display')}
       FROM market_display_bars AS display
       JOIN market_bars AS start_bar
         ON start_bar.instrument_id = display.instrument_id
        AND start_bar.raw_index = display.start_raw_index
       JOIN market_bars AS end_bar
         ON end_bar.instrument_id = display.instrument_id
        AND end_bar.raw_index = display.end_raw_index
      WHERE display.instrument_id = ?
        AND display.version_token = ?
        AND display.display_period = ?
        AND display.time_zone = ?
        AND display.start_raw_index <= ?
        AND display.end_raw_index >= ?
      ORDER BY display.display_index ASC
      LIMIT 1`,
    [instrumentId, versionToken, input.displayPeriod, timeZone, input.rawIndex, input.rawIndex],
    { signal: input.signal },
  );
  return rows[0] ? toMarketDisplayBar(rows[0]) : null;
};

export const getTimelineAnchorByDisplayIndex = async (
  input: {
    instrumentId: string;
    versionToken: string;
    displayPeriod: DisplayPeriodKey;
    timeZone: string;
    displayIndex: number;
    signal?: AbortSignal;
  }
): Promise<{ displayIndex: number; startRawIndex: number } | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT display_index, start_raw_index
       FROM market_display_anchors
      WHERE instrument_id = ?
        AND version_token = ?
        AND display_period = ?
        AND time_zone = ?
        AND display_index <= ?
      ORDER BY display_index DESC
      LIMIT 1`,
    [
      input.instrumentId,
      input.versionToken,
      input.displayPeriod,
      input.timeZone,
      input.displayIndex
    ],
    { signal: input.signal },
  );
  if (!rows[0]) {
    return null;
  }
  return {
    displayIndex: toSafeInt(rows[0].display_index),
    startRawIndex: toSafeInt(rows[0].start_raw_index)
  };
};

export const getTimelineAnchorAfterDisplayIndex = async (
  input: {
    instrumentId: string;
    versionToken: string;
    displayPeriod: DisplayPeriodKey;
    timeZone: string;
    displayIndex: number;
    signal?: AbortSignal;
  }
): Promise<{ displayIndex: number; startRawIndex: number } | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT display_index, start_raw_index
       FROM market_display_anchors
      WHERE instrument_id = ?
        AND version_token = ?
        AND display_period = ?
        AND time_zone = ?
        AND display_index >= ?
      ORDER BY display_index ASC
      LIMIT 1`,
    [
      input.instrumentId,
      input.versionToken,
      input.displayPeriod,
      input.timeZone,
      input.displayIndex
    ],
    { signal: input.signal },
  );
  if (!rows[0]) {
    return null;
  }
  return {
    displayIndex: toSafeInt(rows[0].display_index),
    startRawIndex: toSafeInt(rows[0].start_raw_index)
  };
};

export const getTimelineAnchorByRawIndex = async (
  input: {
    instrumentId: string;
    versionToken: string;
    displayPeriod: DisplayPeriodKey;
    timeZone: string;
    rawIndex: number;
    signal?: AbortSignal;
  }
): Promise<{ displayIndex: number; startRawIndex: number } | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT display_index, start_raw_index
       FROM market_display_anchors
      WHERE instrument_id = ?
        AND version_token = ?
        AND display_period = ?
        AND time_zone = ?
        AND start_raw_index <= ?
      ORDER BY start_raw_index DESC
      LIMIT 1`,
    [
      input.instrumentId,
      input.versionToken,
      input.displayPeriod,
      input.timeZone,
      input.rawIndex
    ],
    { signal: input.signal },
  );
  if (!rows[0]) {
    return null;
  }
  return {
    displayIndex: toSafeInt(rows[0].display_index),
    startRawIndex: toSafeInt(rows[0].start_raw_index)
  };
};

export const getTimelineAnchorAfterRawIndex = async (
  input: {
    instrumentId: string;
    versionToken: string;
    displayPeriod: DisplayPeriodKey;
    timeZone: string;
    rawIndex: number;
    signal?: AbortSignal;
  }
): Promise<{ displayIndex: number; startRawIndex: number } | null> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT display_index, start_raw_index
       FROM market_display_anchors
      WHERE instrument_id = ?
        AND version_token = ?
        AND display_period = ?
        AND time_zone = ?
        AND start_raw_index > ?
      ORDER BY start_raw_index ASC
      LIMIT 1`,
    [
      input.instrumentId,
      input.versionToken,
      input.displayPeriod,
      input.timeZone,
      input.rawIndex
    ],
    { signal: input.signal },
  );
  if (!rows[0]) {
    return null;
  }
  return {
    displayIndex: toSafeInt(rows[0].display_index),
    startRawIndex: toSafeInt(rows[0].start_raw_index)
  };
};

export const getFixedDisplayBarsFromRawWindow = async (
  input: {
    instrumentId: string;
    displayPeriod: DisplayPeriodKey;
    anchorDisplayIndex: number;
    rawStartIndex: number;
    rawEndExclusive: number;
    displayStartIndex?: number;
    displayEndExclusive?: number;
    containingRawIndex?: number;
    signal?: AbortSignal;
  }
): Promise<MarketDisplayBar[]> => {
  const bucketStartSql = buildFixedTimelineBucketStartSql(input.displayPeriod);
  const filters: string[] = [];
  const params: unknown[] = [
    input.instrumentId,
    input.rawStartIndex,
    input.rawEndExclusive,
    input.anchorDisplayIndex
  ];
  if (Number.isFinite(input.displayStartIndex) && Number.isFinite(input.displayEndExclusive)) {
    filters.push('display_index >= ? AND display_index < ?');
    params.push(input.displayStartIndex, input.displayEndExclusive);
  }
  if (Number.isFinite(input.containingRawIndex)) {
    filters.push('start_raw_index <= ? AND end_raw_index >= ?');
    params.push(input.containingRawIndex, input.containingRawIndex);
  }
  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await queryRows<Record<string, unknown>>(
    `WITH source AS (
       SELECT raw_index, ts_ms, open, high, low, close, volume
         FROM market_bars
        WHERE instrument_id = ?
          AND raw_index >= ?
          AND raw_index < ?
     ),
     bucketed AS (
       SELECT raw_index, ts_ms, open, high, low, close, volume,
              ${bucketStartSql} AS bucket_start_ms
         FROM source
     ),
     bucket_edges AS (
       SELECT raw_index, ts_ms, open, high, low, close, volume, bucket_start_ms,
              LAG(bucket_start_ms) OVER (ORDER BY raw_index ASC) AS previous_bucket_start_ms
         FROM bucketed
     ),
     segmented AS (
       SELECT raw_index, ts_ms, open, high, low, close, volume, bucket_start_ms,
              CAST(
                SUM(
                  CASE
                    WHEN previous_bucket_start_ms IS NULL
                      OR bucket_start_ms <> previous_bucket_start_ms
                    THEN 1
                    ELSE 0
                  END
                ) OVER (
                  ORDER BY raw_index ASC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) - 1
                AS BIGINT
              ) AS local_display_index
         FROM bucket_edges
     ),
     aggregated AS (
       SELECT CAST(? + local_display_index AS BIGINT) AS display_index,
              ANY_VALUE(bucket_start_ms) AS bucket_start_ms,
              MIN(raw_index) AS start_raw_index,
              MAX(raw_index) AS end_raw_index,
              ARG_MIN(ts_ms, raw_index) AS start_ts_ms,
              ARG_MAX(ts_ms, raw_index) AS end_ts_ms,
              ARG_MIN(open, raw_index) AS open,
              MAX(high) AS high,
              MIN(low) AS low,
              ARG_MAX(close, raw_index) AS close,
              SUM(volume) AS volume
         FROM segmented
        GROUP BY local_display_index
     )
	     SELECT display_index, bucket_start_ms, start_raw_index, end_raw_index,
	            start_ts_ms, end_ts_ms,
	            ${buildOhlcvSelectDoubleSql()}
       FROM aggregated
       ${whereSql}
      ORDER BY display_index ASC`,
    params,
    { signal: input.signal },
  );
  return rows.map(toMarketDisplayBar);
};

export const getFixedDisplayBarsByIndexRange = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    offset: number;
    limit: number;
  }
): Promise<MarketDisplayBar[]> => {
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const anchor = await getTimelineAnchorByDisplayIndex({
    instrumentId,
    versionToken,
    displayPeriod: input.displayPeriod,
    timeZone,
    displayIndex: input.offset,
    signal: input.signal,
  }) ?? { displayIndex: 0, startRawIndex: 0 };
  const nextAnchor = await getTimelineAnchorAfterDisplayIndex({
    instrumentId,
    versionToken,
    displayPeriod: input.displayPeriod,
    timeZone,
    displayIndex: input.offset + input.limit,
    signal: input.signal,
  });
  return getFixedDisplayBarsFromRawWindow({
    instrumentId,
    displayPeriod: input.displayPeriod,
    anchorDisplayIndex: anchor.displayIndex,
    rawStartIndex: anchor.startRawIndex,
    rawEndExclusive: nextAnchor?.startRawIndex ?? totalRaw,
    displayStartIndex: input.offset,
    displayEndExclusive: input.offset + input.limit,
    signal: input.signal,
  });
};

export const getFixedDisplayBarContainingRawIndex = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    rawIndex: number;
  }
): Promise<MarketDisplayBar | null> => {
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const anchor = await getTimelineAnchorByRawIndex({
    instrumentId,
    versionToken,
    displayPeriod: input.displayPeriod,
    timeZone,
    rawIndex: input.rawIndex,
    signal: input.signal,
  }) ?? { displayIndex: 0, startRawIndex: 0 };
  const nextAnchor = await getTimelineAnchorAfterRawIndex({
    instrumentId,
    versionToken,
    displayPeriod: input.displayPeriod,
    timeZone,
    rawIndex: input.rawIndex,
    signal: input.signal,
  });
  const bars = await getFixedDisplayBarsFromRawWindow({
    instrumentId,
    displayPeriod: input.displayPeriod,
    anchorDisplayIndex: anchor.displayIndex,
    rawStartIndex: anchor.startRawIndex,
    rawEndExclusive: nextAnchor?.startRawIndex ?? totalRaw,
    containingRawIndex: input.rawIndex,
    signal: input.signal,
  });
  return bars[0] ?? null;
};

export const getCalendarDisplayBarsByIndexRange = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    offset: number;
    limit: number;
  }
): Promise<MarketDisplayBar[]> => {
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const baseTimeframe = normalizeTimelineBaseTimeframe(input.baseTimeframe);
  const rangeRows = await queryRows<Record<string, unknown>>(
    `SELECT MIN(bucket_start_ms) AS min_ts_ms,
            MAX(bucket_start_ms) AS max_ts_ms
       FROM (${buildDailyTimelineSourceSql({ instrumentId, versionToken, timeZone, baseTimeframe })}) AS daily_source`,
    [],
    { signal: input.signal },
  );
  const boundariesSql = buildCalendarBoundariesValuesSql({
    displayPeriod: input.displayPeriod,
    minTsMs: Number(rangeRows[0]?.min_ts_ms),
    maxTsMs: Number(rangeRows[0]?.max_ts_ms),
    timeZone,
    tradingCalendar: input.tradingCalendar ?? null,
  });
  if (!boundariesSql) {
    return [];
  }
  const rows = await queryRows<Record<string, unknown>>(
    `WITH daily_source AS (
       ${buildDailyTimelineSourceSql({ instrumentId, versionToken, timeZone, baseTimeframe })}
     ),
     boundaries(bucket_start_ms, bucket_end_ms) AS (
       VALUES ${boundariesSql}
     ),
     aggregated AS (
       SELECT boundaries.bucket_start_ms,
              MIN(daily_source.start_raw_index) AS start_raw_index,
              MAX(daily_source.end_raw_index) AS end_raw_index,
              ARG_MIN(daily_source.start_ts_ms, daily_source.start_raw_index) AS start_ts_ms,
              ARG_MAX(daily_source.end_ts_ms, daily_source.end_raw_index) AS end_ts_ms,
              ARG_MIN(daily_source.open, daily_source.start_raw_index) AS open,
              MAX(daily_source.high) AS high,
              MIN(daily_source.low) AS low,
              ARG_MAX(daily_source.close, daily_source.end_raw_index) AS close,
              SUM(daily_source.volume) AS volume
         FROM boundaries
         JOIN daily_source
           ON daily_source.bucket_start_ms >= boundaries.bucket_start_ms
          AND daily_source.bucket_start_ms < boundaries.bucket_end_ms
        GROUP BY boundaries.bucket_start_ms
     ),
     indexed AS (
       SELECT CAST(ROW_NUMBER() OVER (ORDER BY bucket_start_ms ASC) - 1 AS BIGINT) AS display_index,
              bucket_start_ms,
              start_raw_index,
              end_raw_index,
              start_ts_ms,
              end_ts_ms,
              open,
              high,
              low,
              close,
              volume
         FROM aggregated
     )
	     SELECT display_index, bucket_start_ms, start_raw_index, end_raw_index,
	            start_ts_ms, end_ts_ms,
	            ${buildOhlcvSelectDoubleSql()}
       FROM indexed
      WHERE display_index >= ?
        AND display_index < ?
      ORDER BY display_index ASC`,
    [input.offset, input.offset + input.limit],
    { signal: input.signal },
  );
  return rows.map(toMarketDisplayBar);
};

export const getCalendarDisplayBarContainingRawIndex = async (
  input: MarketTimelineBuildInput & {
    displayPeriod: DisplayPeriodKey;
    rawIndex: number;
  }
): Promise<MarketDisplayBar | null> => {
  const instrumentId = String(input.instrumentId ?? '').trim();
  const totalRaw = await getMarketBarCount(instrumentId, { signal: input.signal });
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const baseTimeframe = normalizeTimelineBaseTimeframe(input.baseTimeframe);
  const rangeRows = await queryRows<Record<string, unknown>>(
    `SELECT MIN(bucket_start_ms) AS min_ts_ms,
            MAX(bucket_start_ms) AS max_ts_ms
       FROM (${buildDailyTimelineSourceSql({ instrumentId, versionToken, timeZone, baseTimeframe })}) AS daily_source`,
    [],
    { signal: input.signal },
  );
  const boundariesSql = buildCalendarBoundariesValuesSql({
    displayPeriod: input.displayPeriod,
    minTsMs: Number(rangeRows[0]?.min_ts_ms),
    maxTsMs: Number(rangeRows[0]?.max_ts_ms),
    timeZone,
    tradingCalendar: input.tradingCalendar ?? null,
  });
  if (!boundariesSql) {
    return null;
  }
  const rows = await queryRows<Record<string, unknown>>(
    `WITH daily_source AS (
       ${buildDailyTimelineSourceSql({ instrumentId, versionToken, timeZone, baseTimeframe })}
     ),
     boundaries(bucket_start_ms, bucket_end_ms) AS (
       VALUES ${boundariesSql}
     ),
     aggregated AS (
       SELECT boundaries.bucket_start_ms,
              MIN(daily_source.start_raw_index) AS start_raw_index,
              MAX(daily_source.end_raw_index) AS end_raw_index,
              ARG_MIN(daily_source.start_ts_ms, daily_source.start_raw_index) AS start_ts_ms,
              ARG_MAX(daily_source.end_ts_ms, daily_source.end_raw_index) AS end_ts_ms,
              ARG_MIN(daily_source.open, daily_source.start_raw_index) AS open,
              MAX(daily_source.high) AS high,
              MIN(daily_source.low) AS low,
              ARG_MAX(daily_source.close, daily_source.end_raw_index) AS close,
              SUM(daily_source.volume) AS volume
         FROM boundaries
         JOIN daily_source
           ON daily_source.bucket_start_ms >= boundaries.bucket_start_ms
          AND daily_source.bucket_start_ms < boundaries.bucket_end_ms
        GROUP BY boundaries.bucket_start_ms
     ),
     indexed AS (
       SELECT CAST(ROW_NUMBER() OVER (ORDER BY bucket_start_ms ASC) - 1 AS BIGINT) AS display_index,
              bucket_start_ms,
              start_raw_index,
              end_raw_index,
              start_ts_ms,
              end_ts_ms,
              open,
              high,
              low,
              close,
              volume
         FROM aggregated
     )
	     SELECT display_index, bucket_start_ms, start_raw_index, end_raw_index,
	            start_ts_ms, end_ts_ms,
	            ${buildOhlcvSelectDoubleSql()}
       FROM indexed
      WHERE start_raw_index <= ?
        AND end_raw_index >= ?
      ORDER BY display_index ASC
      LIMIT 1`,
    [input.rawIndex, input.rawIndex],
    { signal: input.signal },
  );
  return rows[0] ? toMarketDisplayBar(rows[0]) : null;
};
