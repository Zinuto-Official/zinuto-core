// SPDX-License-Identifier: GPL-3.0-only

import type { DuckDBConnection } from '@duckdb/node-api';
import { appError } from '../../../kernel/appError.js';
import { nowIso } from '../../../kernel/time.js';
import { quoteDuckLiteral } from '../marketCsvImportSql.js';
import {
  getNextTimeZonePeriodStartMs,
  getTimeZonePeriodStartMs,
  type DisplayPeriodKey,
} from '@zinuto/shared/period';
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from '@zinuto/shared/timezone';
import {
  getNextTradingCalendarPeriodStartMs,
  getTradingCalendarPeriodStartMs,
  type TradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';
import {
  MARKET_DISPLAY_ANCHOR_STRIDE,
  MARKET_TIMELINE_CALENDAR_PERIODS,
  MARKET_TIMELINE_DISPLAY_PERIODS,
  MARKET_TIMELINE_FIXED_PERIOD_MINUTES,
  MARKET_TIMELINE_PERSISTED_DISPLAY_PERIODS,
} from './constants.js';
import { queryRowsWithConnection } from './connection.js';
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
  buildOhlcvSelectDoubleSql,
} from './ohlcvSql.js';
import type { MarketDisplayBar, MarketTimelineBuildInput } from './types.js';
import { toIsoFromEpochMs, toSafeInt, toSafeNumber } from './utils.js';

export const normalizeTimelineTimeZone = (value: unknown): string =>
  normalizeTimeZone(String(value ?? '').trim() || DEFAULT_TIME_ZONE);

export const normalizeTimelineVersionToken = (value: unknown, fallback: string): string => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

export const normalizeTimelineDisplayPeriod = (value: unknown): DisplayPeriodKey | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (MARKET_TIMELINE_DISPLAY_PERIODS.includes(normalized as DisplayPeriodKey)) {
    return normalized as DisplayPeriodKey;
  }
  throw appError('INVALID_PARAMS', { displayPeriod: normalized });
};

export const toMarketDisplayBar = (row: Record<string, unknown>): MarketDisplayBar => {
  const bucketStartMs = Number(row.bucket_start_ms);
  const startTsMs = Number(row.start_ts_ms);
  const endTsMs = Number(row.end_ts_ms);
  return {
    displayIndex: toSafeInt(row.display_index),
    bucketStartMs,
    startRawIndex: toSafeInt(row.start_raw_index),
    endRawIndex: toSafeInt(row.end_raw_index),
    ts: Number.isFinite(bucketStartMs) ? new Date(bucketStartMs).toISOString() : '',
    startTs: toIsoFromEpochMs(Number.isFinite(startTsMs) ? startTsMs : bucketStartMs) ?? '',
    endTs: toIsoFromEpochMs(Number.isFinite(endTsMs) ? endTsMs : bucketStartMs) ?? '',
    open: toSafeNumber(row.open),
    high: toSafeNumber(row.high),
    low: toSafeNumber(row.low),
    close: toSafeNumber(row.close),
    volume: toSafeNumber(row.volume)
  };
};

export const reindexMarketBarsWithConnection = async (
  connection: DuckDBConnection,
  instrumentIds: readonly string[]
): Promise<void> => {
  const normalizedInstrumentIds = Array.from(
    new Set(
      instrumentIds
        .map((item) => String(item ?? '').trim())
        .filter((item) => Boolean(item))
    )
  );
  if (!normalizedInstrumentIds.length) {
    return;
  }
  const placeholders = normalizedInstrumentIds.map(() => '?').join(',');
  await connection.run('DROP TABLE IF EXISTS market_bars_reindexed');
  await connection.run(
    `CREATE TEMP TABLE market_bars_reindexed AS
     SELECT instrument_id,
            ROW_NUMBER() OVER (PARTITION BY instrument_id ORDER BY ts_ms ASC) - 1 AS raw_index,
            ts_ms,
            ${buildOhlcvSelectDoubleSql()}
       FROM (
         SELECT instrument_id,
                ts_ms,
                ANY_VALUE(open) AS open,
                ANY_VALUE(high) AS high,
                ANY_VALUE(low) AS low,
                ANY_VALUE(close) AS close,
                ANY_VALUE(volume) AS volume
           FROM market_bars
          WHERE instrument_id IN (${placeholders})
          GROUP BY instrument_id, ts_ms
       ) AS deduped_market_bars
      ORDER BY instrument_id ASC, raw_index ASC`,
    normalizedInstrumentIds as never[]
  );
  await connection.run(
    `DELETE FROM market_bars
      WHERE instrument_id IN (${placeholders})`,
    normalizedInstrumentIds as never[]
  );
  await connection.run(
    `INSERT INTO market_bars (instrument_id, raw_index, ts_ms, open, high, low, close, volume)
     SELECT instrument_id, raw_index, ts_ms, open, high, low, close, volume
       FROM market_bars_reindexed
      ORDER BY instrument_id ASC, raw_index ASC`
  );
  await connection.run('DROP TABLE IF EXISTS market_bars_reindexed');
};

export const invalidateMarketTimelineWithConnection = async (
  connection: DuckDBConnection,
  instrumentIds: readonly string[]
): Promise<void> => {
  const normalizedInstrumentIds = Array.from(
    new Set(
      instrumentIds
        .map((item) => String(item ?? '').trim())
        .filter((item) => Boolean(item))
    )
  );
  if (!normalizedInstrumentIds.length) {
    return;
  }
  const placeholders = normalizedInstrumentIds.map(() => '?').join(',');
  await connection.run(
    `DELETE FROM market_display_bars
      WHERE instrument_id IN (${placeholders})`,
    normalizedInstrumentIds as never[]
  );
  await connection.run(
    `DELETE FROM market_display_anchors
      WHERE instrument_id IN (${placeholders})`,
    normalizedInstrumentIds as never[]
  );
  await connection.run(
    `DELETE FROM market_timeline_meta
      WHERE instrument_id IN (${placeholders})`,
    normalizedInstrumentIds as never[]
  );
};

export const buildFixedTimelineBucketStartSql = (
  period: DisplayPeriodKey
): string => {
  const periodMinutes = MARKET_TIMELINE_FIXED_PERIOD_MINUTES.get(period);
  if (!periodMinutes) {
    throw appError('MARKET_TIMELINE_FIXED_PERIOD_INVALID', { period });
  }
  const periodMs = periodMinutes * 60_000;
  return `CAST(FLOOR(ts_ms / ${String(periodMs)}) * ${String(periodMs)} AS BIGINT)`;
};

export const normalizeTimelineBaseTimeframe = (value: unknown): DisplayPeriodKey => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1m' || normalized === '5m' || normalized === '1h' || normalized === '1d'
    ? normalized
    : '1d';
};

export const isRawNativeDisplayPeriod = (
  input: MarketTimelineBuildInput & { displayPeriod: DisplayPeriodKey }
): boolean => normalizeTimelineBaseTimeframe(input.baseTimeframe) === input.displayPeriod;

export const shouldPersistDisplayPeriod = (
  input: MarketTimelineBuildInput & { displayPeriod: DisplayPeriodKey }
): boolean =>
  MARKET_TIMELINE_PERSISTED_DISPLAY_PERIODS.has(input.displayPeriod) &&
  !isRawNativeDisplayPeriod(input);

export const buildTimelinePeriodsForBuild = (
  input: MarketTimelineBuildInput & { displayPeriods?: readonly DisplayPeriodKey[] }
): DisplayPeriodKey[] => {
  return Array.from(
    new Set(
      (input.displayPeriods?.length ? input.displayPeriods : MARKET_TIMELINE_DISPLAY_PERIODS)
        .map((period) => normalizeTimelineDisplayPeriod(period))
        .filter((period): period is DisplayPeriodKey => Boolean(period))
    )
  );
};

export const insertTimelineMetaWithConnection = async (
  connection: DuckDBConnection,
  input: {
    instrumentId: string;
    versionToken: string;
    displayPeriod: DisplayPeriodKey;
    timeZone: string;
    totalRaw: number;
    totalDisplay: number;
    builtAt: string;
  }
): Promise<void> => {
  await connection.run(
    `INSERT INTO market_timeline_meta (
       instrument_id, version_token, display_period, time_zone,
       total_raw, total_display, build_status, built_at
     )
     VALUES (?, ?, ?, ?, ?, ?, 'READY', ?)`,
    [
      input.instrumentId,
      input.versionToken,
      input.displayPeriod,
      input.timeZone,
      Math.max(0, Math.floor(Number(input.totalRaw) || 0)),
      Math.max(0, Math.floor(Number(input.totalDisplay) || 0)),
      input.builtAt
    ] as never[]
  );
};

export const createDailyDisplayBarsStage = async (
  connection: DuckDBConnection
): Promise<void> => {
  await connection.run('DROP TABLE IF EXISTS market_display_bars_stage');
  await connection.run(`
    CREATE TEMP TABLE market_display_bars_stage (
      instrument_id VARCHAR NOT NULL,
      version_token VARCHAR NOT NULL,
      display_period VARCHAR NOT NULL,
      time_zone VARCHAR NOT NULL,
      display_index BIGINT NOT NULL,
      bucket_start_ms BIGINT NOT NULL,
      start_raw_index BIGINT NOT NULL,
      end_raw_index BIGINT NOT NULL,
      open ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      high ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      low ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      close ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      volume ${MARKET_VOLUME_STORAGE_SQL} NOT NULL,
      raw_count BIGINT NOT NULL
    )
  `);
};

export const insertCalendarTimelineStageFromRaw = async (
  connection: DuckDBConnection,
  input: {
    instrumentId: string;
    versionToken: string;
    timeZone: string;
  }
): Promise<void> => {
  await connection.run(
    `INSERT INTO market_display_bars_stage (
       instrument_id, version_token, display_period, time_zone,
       display_index, bucket_start_ms, start_raw_index, end_raw_index,
       open, high, low, close, volume, raw_count
     )
     WITH aggregated AS (
       SELECT boundaries.display_period,
              boundaries.bucket_start_ms,
              MIN(bars.raw_index) AS start_raw_index,
              MAX(bars.raw_index) AS end_raw_index,
              ARG_MIN(bars.open, bars.raw_index) AS open,
              MAX(bars.high) AS high,
              MIN(bars.low) AS low,
              ARG_MAX(bars.close, bars.raw_index) AS close,
              SUM(bars.volume) AS volume,
              COUNT(*) AS raw_count
         FROM market_timeline_boundaries_stage AS boundaries
         JOIN market_bars AS bars
           ON bars.instrument_id = ?
          AND bars.ts_ms >= boundaries.bucket_start_ms
          AND bars.ts_ms < boundaries.bucket_end_ms
        GROUP BY boundaries.display_period, boundaries.bucket_start_ms
     )
     SELECT ? AS instrument_id,
            ? AS version_token,
            display_period,
            ? AS time_zone,
            CAST(ROW_NUMBER() OVER (
              PARTITION BY display_period
              ORDER BY bucket_start_ms ASC
            ) - 1 AS BIGINT) AS display_index,
            bucket_start_ms,
            start_raw_index,
            end_raw_index,
            open,
            high,
            low,
            close,
            volume,
            raw_count
       FROM aggregated
      ORDER BY display_period ASC, display_index ASC`,
    [
      input.instrumentId,
      input.instrumentId,
      input.versionToken,
      input.timeZone
    ] as never[]
  );
};

export const appendTimelineBoundaryRows = async (
  connection: DuckDBConnection,
  input: {
    displayPeriods: readonly DisplayPeriodKey[];
    minTsMs: number;
    maxTsMs: number;
    timeZone: string;
    tradingCalendar?: TradingCalendarConfig | null;
  }
): Promise<void> => {
  await connection.run('DROP TABLE IF EXISTS market_timeline_boundaries_stage');
  await connection.run(`
    CREATE TEMP TABLE market_timeline_boundaries_stage (
      display_period VARCHAR NOT NULL,
      bucket_start_ms BIGINT NOT NULL,
      bucket_end_ms BIGINT NOT NULL
    )
  `);
  if (!Number.isFinite(input.minTsMs) || !Number.isFinite(input.maxTsMs)) {
    return;
  }
  const appender = await connection.createAppender('market_timeline_boundaries_stage');
  try {
    for (const period of input.displayPeriods) {
      if (!MARKET_TIMELINE_CALENDAR_PERIODS.includes(period)) {
        continue;
      }
      let bucketStartMs = input.tradingCalendar
        ? getTradingCalendarPeriodStartMs(input.minTsMs, period, input.timeZone, input.tradingCalendar)
        : getTimeZonePeriodStartMs(input.minTsMs, period, input.timeZone);
      let guard = 0;
      while (Number.isFinite(bucketStartMs) && bucketStartMs <= input.maxTsMs) {
        const bucketEndMs = input.tradingCalendar
          ? getNextTradingCalendarPeriodStartMs(bucketStartMs, period, input.timeZone, input.tradingCalendar)
          : getNextTimeZonePeriodStartMs(bucketStartMs, period, input.timeZone);
        if (!Number.isFinite(bucketEndMs) || bucketEndMs <= bucketStartMs) {
          throw appError('MARKET_TIMELINE_BOUNDARY_INVALID', { period });
        }
        appender.appendVarchar(period);
        appender.appendBigInt(BigInt(Math.trunc(bucketStartMs)));
        appender.appendBigInt(BigInt(Math.trunc(bucketEndMs)));
        appender.endRow();
        bucketStartMs = bucketEndMs;
        guard += 1;
        if (guard > 1_000_000) {
          throw appError('MARKET_TIMELINE_BOUNDARY_GUARD_EXCEEDED', { period });
        }
      }
    }
    appender.flushSync();
  } finally {
    appender.closeSync();
  }
  await connection.run(`
    CREATE INDEX market_timeline_boundaries_stage_lookup
      ON market_timeline_boundaries_stage(display_period, bucket_start_ms, bucket_end_ms)
  `);
};

export const validateCalendarTimelineStage = async (
  connection: DuckDBConnection,
  input: {
    instrumentId: string;
    displayPeriod: DisplayPeriodKey;
    totalRaw: number;
  }
): Promise<void> => {
  const row = (
    await queryRowsWithConnection<Record<string, unknown>>(
    connection,
    `WITH ordered AS (
       SELECT display_index,
              start_raw_index,
              end_raw_index,
              raw_count,
              ROW_NUMBER() OVER (ORDER BY display_index ASC) - 1 AS expected_display_index,
              LAG(end_raw_index) OVER (ORDER BY display_index ASC) AS previous_end_raw_index
         FROM market_display_bars_stage
        WHERE display_period = ?
     ),
     summary AS (
       SELECT COUNT(*) AS total_display,
              COALESCE(SUM(raw_count), 0) AS covered_raw,
              COALESCE(MIN(display_index), 0) AS min_display_index,
              COALESCE(MAX(display_index), 0) AS max_display_index,
              COALESCE(SUM(CASE WHEN display_index <> expected_display_index THEN 1 ELSE 0 END), 0) AS index_errors,
              COALESCE(SUM(CASE WHEN start_raw_index > end_raw_index THEN 1 ELSE 0 END), 0) AS span_errors,
              COALESCE(SUM(
                CASE
                  WHEN previous_end_raw_index IS NOT NULL
                   AND start_raw_index <= previous_end_raw_index
                  THEN 1
                  ELSE 0
                END
              ), 0) AS overlap_errors
         FROM ordered
     )
     SELECT COALESCE(summary.total_display, 0) AS total_display,
            COALESCE(summary.covered_raw, 0) AS covered_raw,
            COALESCE(summary.min_display_index, 0) AS min_display_index,
            COALESCE(summary.max_display_index, 0) AS max_display_index,
            COALESCE(summary.index_errors, 0) AS index_errors,
            COALESCE(summary.span_errors, 0) AS span_errors,
            COALESCE(summary.overlap_errors, 0) AS overlap_errors
       FROM summary`
      ,
      [input.displayPeriod]
    )
  )[0] ?? {};
  const totalDisplay = toSafeInt(row.total_display);
  const coveredRaw = toSafeInt(row.covered_raw);
  const minDisplayIndex = toSafeInt(row.min_display_index);
  const maxDisplayIndex = toSafeInt(row.max_display_index);
  const indexErrors = toSafeInt(row.index_errors);
  const spanErrors = toSafeInt(row.span_errors);
  const overlapErrors = toSafeInt(row.overlap_errors);
  const expectedMaxDisplayIndex = totalDisplay > 0 ? totalDisplay - 1 : 0;
  if (
    coveredRaw !== input.totalRaw ||
    indexErrors > 0 ||
    spanErrors > 0 ||
    overlapErrors > 0 ||
    (totalDisplay > 0 && minDisplayIndex !== 0) ||
    maxDisplayIndex !== expectedMaxDisplayIndex
  ) {
    throw appError('MARKET_TIMELINE_STAGE_INVALID', {
      instrumentId: input.instrumentId,
      period: input.displayPeriod,
      totalRaw: input.totalRaw,
      coveredRaw,
      totalDisplay,
      indexErrors,
      spanErrors,
      overlapErrors
    });
  }
};

export const buildDailyTimelineSourceSql = (input: {
  instrumentId: string;
  versionToken: string;
  timeZone: string;
  baseTimeframe: DisplayPeriodKey;
}): string => {
  const instrumentIdLiteral = quoteDuckLiteral(input.instrumentId);
  if (input.baseTimeframe === '1d') {
    return `SELECT raw_index AS display_index,
                   ts_ms AS bucket_start_ms,
                   raw_index AS start_raw_index,
                   raw_index AS end_raw_index,
                   ts_ms AS start_ts_ms,
                   ts_ms AS end_ts_ms,
                   ${buildOhlcvSelectDoubleSql()}
              FROM market_bars
             WHERE instrument_id = ${instrumentIdLiteral}`;
  }
  return `SELECT display.display_index,
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
           WHERE display.instrument_id = ${instrumentIdLiteral}
             AND display.version_token = ${quoteDuckLiteral(input.versionToken)}
             AND display.display_period = '1d'
             AND display.time_zone = ${quoteDuckLiteral(input.timeZone)}`;
};

export const buildCalendarBoundariesValuesSql = (
  input: {
    displayPeriod: DisplayPeriodKey;
    minTsMs: number;
    maxTsMs: number;
    timeZone: string;
    tradingCalendar?: TradingCalendarConfig | null;
  }
): string => {
  const values: string[] = [];
  if (!Number.isFinite(input.minTsMs) || !Number.isFinite(input.maxTsMs)) {
    return '';
  }
  let bucketStartMs = input.tradingCalendar
    ? getTradingCalendarPeriodStartMs(input.minTsMs, input.displayPeriod, input.timeZone, input.tradingCalendar)
    : getTimeZonePeriodStartMs(input.minTsMs, input.displayPeriod, input.timeZone);
  let guard = 0;
  while (Number.isFinite(bucketStartMs) && bucketStartMs <= input.maxTsMs) {
    const bucketEndMs = input.tradingCalendar
      ? getNextTradingCalendarPeriodStartMs(bucketStartMs, input.displayPeriod, input.timeZone, input.tradingCalendar)
      : getNextTimeZonePeriodStartMs(bucketStartMs, input.displayPeriod, input.timeZone);
    if (!Number.isFinite(bucketEndMs) || bucketEndMs <= bucketStartMs) {
      throw appError('MARKET_TIMELINE_BOUNDARY_INVALID', { period: input.displayPeriod });
    }
    values.push(`(${String(Math.trunc(bucketStartMs))}, ${String(Math.trunc(bucketEndMs))})`);
    bucketStartMs = bucketEndMs;
    guard += 1;
    if (guard > 1_000_000) {
      throw appError('MARKET_TIMELINE_BOUNDARY_GUARD_EXCEEDED', { period: input.displayPeriod });
    }
  }
  return values.join(',');
};

export const getDailySourceRangeWithConnection = async (
  connection: DuckDBConnection,
  input: {
    instrumentId: string;
    versionToken: string;
    timeZone: string;
    baseTimeframe: DisplayPeriodKey;
  }
): Promise<{ minTsMs: number; maxTsMs: number }> => {
  const sourceSql = buildDailyTimelineSourceSql(input);
  const rows = await queryRowsWithConnection<{
    min_ts_ms?: unknown;
    max_ts_ms?: unknown;
  }>(
    connection,
    `SELECT MIN(bucket_start_ms) AS min_ts_ms,
            MAX(bucket_start_ms) AS max_ts_ms
       FROM (${sourceSql}) AS daily_source`
  );
  return {
    minTsMs: Number(rows[0]?.min_ts_ms),
    maxTsMs: Number(rows[0]?.max_ts_ms)
  };
};

export const countFixedTimelineDisplayWithConnection = async (
  connection: DuckDBConnection,
  input: {
    instrumentId: string;
    displayPeriod: DisplayPeriodKey;
  }
): Promise<number> => {
  const bucketStartSql = buildFixedTimelineBucketStartSql(input.displayPeriod);
  const rows = await queryRowsWithConnection<{ count: unknown }>(
    connection,
    `SELECT COUNT(*) AS count
       FROM (
         SELECT ${bucketStartSql} AS bucket_start_ms
           FROM market_bars
          WHERE instrument_id = ?
          GROUP BY bucket_start_ms
       ) AS display_buckets`,
    [input.instrumentId]
  );
  return toSafeInt(rows[0]?.count ?? 0);
};

export const insertFixedTimelineAnchorsWithConnection = async (
  connection: DuckDBConnection,
  input: {
    instrumentId: string;
    versionToken: string;
    displayPeriod: DisplayPeriodKey;
    timeZone: string;
  }
): Promise<void> => {
  const bucketStartSql = buildFixedTimelineBucketStartSql(input.displayPeriod);
  await connection.run(
    `INSERT INTO market_display_anchors (
       instrument_id, version_token, display_period, time_zone,
       display_index, bucket_start_ms, start_raw_index
     )
     WITH bucketed AS (
       SELECT raw_index,
              ${bucketStartSql} AS bucket_start_ms
         FROM market_bars
        WHERE instrument_id = ?
     ),
     bucket_edges AS (
       SELECT raw_index,
              bucket_start_ms,
              LAG(bucket_start_ms) OVER (ORDER BY raw_index ASC) AS previous_bucket_start_ms
         FROM bucketed
     ),
     bucket_starts AS (
       SELECT CAST(ROW_NUMBER() OVER (ORDER BY raw_index ASC) - 1 AS BIGINT) AS display_index,
              bucket_start_ms,
              raw_index AS start_raw_index
         FROM bucket_edges
        WHERE previous_bucket_start_ms IS NULL
           OR bucket_start_ms <> previous_bucket_start_ms
     )
     SELECT ? AS instrument_id,
            ? AS version_token,
            ? AS display_period,
            ? AS time_zone,
            display_index,
            bucket_start_ms,
            start_raw_index
       FROM bucket_starts
      WHERE display_index % ${String(MARKET_DISPLAY_ANCHOR_STRIDE)} = 0
      ORDER BY display_index ASC`,
    [
      input.instrumentId,
      input.instrumentId,
      input.versionToken,
      input.displayPeriod,
      input.timeZone
    ] as never[]
  );
};

export const countCalendarTimelineDisplayWithConnection = async (
  connection: DuckDBConnection,
  input: {
    instrumentId: string;
    versionToken: string;
    displayPeriod: DisplayPeriodKey;
    timeZone: string;
    baseTimeframe: DisplayPeriodKey;
    tradingCalendar?: TradingCalendarConfig | null;
  }
): Promise<number> => {
  const range = await getDailySourceRangeWithConnection(connection, input);
  const boundariesSql = buildCalendarBoundariesValuesSql({
    displayPeriod: input.displayPeriod,
    minTsMs: range.minTsMs,
    maxTsMs: range.maxTsMs,
    timeZone: input.timeZone,
    tradingCalendar: input.tradingCalendar ?? null,
  });
  if (!boundariesSql) {
    return 0;
  }
  const sourceSql = buildDailyTimelineSourceSql(input);
  const rows = await queryRowsWithConnection<{ count: unknown }>(
    connection,
    `WITH daily_source AS (
       ${sourceSql}
     ),
     boundaries(bucket_start_ms, bucket_end_ms) AS (
       VALUES ${boundariesSql}
     )
     SELECT COUNT(*) AS count
       FROM (
         SELECT boundaries.bucket_start_ms
           FROM boundaries
           JOIN daily_source
             ON daily_source.bucket_start_ms >= boundaries.bucket_start_ms
            AND daily_source.bucket_start_ms < boundaries.bucket_end_ms
          GROUP BY boundaries.bucket_start_ms
       ) AS calendar_buckets`
  );
  return toSafeInt(rows[0]?.count ?? 0);
};

export const insertCalendarTimelineAnchorsWithConnection = async (
  connection: DuckDBConnection,
  input: {
    instrumentId: string;
    versionToken: string;
    displayPeriod: DisplayPeriodKey;
    timeZone: string;
    baseTimeframe: DisplayPeriodKey;
    tradingCalendar?: TradingCalendarConfig | null;
  }
): Promise<void> => {
  const range = await getDailySourceRangeWithConnection(connection, input);
  const boundariesSql = buildCalendarBoundariesValuesSql({
    displayPeriod: input.displayPeriod,
    minTsMs: range.minTsMs,
    maxTsMs: range.maxTsMs,
    timeZone: input.timeZone,
    tradingCalendar: input.tradingCalendar ?? null,
  });
  if (!boundariesSql) {
    return;
  }
  const sourceSql = buildDailyTimelineSourceSql(input);
  await connection.run(
    `INSERT INTO market_display_anchors (
       instrument_id, version_token, display_period, time_zone,
       display_index, bucket_start_ms, start_raw_index
     )
     WITH daily_source AS (
       ${sourceSql}
     ),
     boundaries(bucket_start_ms, bucket_end_ms) AS (
       VALUES ${boundariesSql}
     ),
     aggregated AS (
       SELECT boundaries.bucket_start_ms,
              MIN(daily_source.start_raw_index) AS start_raw_index
         FROM boundaries
         JOIN daily_source
           ON daily_source.bucket_start_ms >= boundaries.bucket_start_ms
          AND daily_source.bucket_start_ms < boundaries.bucket_end_ms
        GROUP BY boundaries.bucket_start_ms
     ),
     indexed AS (
       SELECT CAST(ROW_NUMBER() OVER (ORDER BY bucket_start_ms ASC) - 1 AS BIGINT) AS display_index,
              bucket_start_ms,
              start_raw_index
         FROM aggregated
     )
     SELECT ? AS instrument_id,
            ? AS version_token,
            ? AS display_period,
            ? AS time_zone,
            display_index,
            bucket_start_ms,
            start_raw_index
       FROM indexed
      WHERE display_index % ${String(MARKET_DISPLAY_ANCHOR_STRIDE)} = 0
      ORDER BY display_index ASC`,
    [
      input.instrumentId,
      input.versionToken,
      input.displayPeriod,
      input.timeZone
    ] as never[]
  );
};

export const rebuildMarketTimelineWithConnection = async (
  connection: DuckDBConnection,
  input: MarketTimelineBuildInput & { displayPeriods?: readonly DisplayPeriodKey[] }
): Promise<void> => {
  input.signal?.throwIfAborted();
  const instrumentId = String(input.instrumentId ?? '').trim();
  if (!instrumentId) {
    return;
  }
  const displayPeriods = buildTimelinePeriodsForBuild(input);
  if (!displayPeriods.length) {
    return;
  }
  const totalRawRows = await queryRowsWithConnection<{ count: unknown }>(
    connection,
    `SELECT COUNT(*) AS count
       FROM market_bars
      WHERE instrument_id = ?`,
    [instrumentId]
  );
  input.signal?.throwIfAborted();
  const totalRaw = toSafeInt(totalRawRows[0]?.count ?? 0);
  const versionToken = normalizeTimelineVersionToken(
    input.versionToken,
    ['market-timeline', instrumentId, totalRaw].join(':')
  );
  const timeZone = normalizeTimelineTimeZone(input.timeZone);
  const baseTimeframe = normalizeTimelineBaseTimeframe(input.baseTimeframe);
  const rangeRows = await queryRowsWithConnection<{
    min_ts_ms?: unknown;
    max_ts_ms?: unknown;
  }>(
    connection,
    `SELECT MIN(ts_ms) AS min_ts_ms,
            MAX(ts_ms) AS max_ts_ms
       FROM market_bars
      WHERE instrument_id = ?`,
    [instrumentId]
  );
  input.signal?.throwIfAborted();
  const minTsMs = Number(rangeRows[0]?.min_ts_ms);
  const maxTsMs = Number(rangeRows[0]?.max_ts_ms);
  const builtAt = nowIso();

  const placeholders = displayPeriods.map(() => '?').join(',');
  try {
    input.signal?.throwIfAborted();
    await connection.run('BEGIN TRANSACTION');
    try {
      await connection.run(
        `DELETE FROM market_display_bars
          WHERE instrument_id = ?
            AND display_period IN (${placeholders})`,
        [instrumentId, ...displayPeriods] as never[]
      );
      await connection.run(
        `DELETE FROM market_display_anchors
          WHERE instrument_id = ?
            AND display_period IN (${placeholders})`,
        [instrumentId, ...displayPeriods] as never[]
      );
      await connection.run(
        `DELETE FROM market_timeline_meta
          WHERE instrument_id = ?
            AND display_period IN (${placeholders})`,
        [instrumentId, ...displayPeriods] as never[]
      );

      for (const displayPeriod of displayPeriods) {
        input.signal?.throwIfAborted();
        const timelineInput = {
          instrumentId,
          versionToken,
          displayPeriod,
          timeZone,
          baseTimeframe,
          tradingCalendar: input.tradingCalendar ?? null,
        };
        if (shouldPersistDisplayPeriod(timelineInput)) {
          await createDailyDisplayBarsStage(connection);
          await appendTimelineBoundaryRows(connection, {
            displayPeriods: [displayPeriod],
            minTsMs,
            maxTsMs,
            timeZone,
            tradingCalendar: input.tradingCalendar ?? null,
          });
          await insertCalendarTimelineStageFromRaw(connection, {
            instrumentId,
            versionToken,
            timeZone
          });
          await validateCalendarTimelineStage(connection, {
            instrumentId,
            displayPeriod,
            totalRaw
          });
          await connection.run(
            `INSERT INTO market_display_bars (
               instrument_id, version_token, display_period, time_zone,
               display_index, bucket_start_ms, start_raw_index, end_raw_index,
               open, high, low, close, volume
             )
             SELECT instrument_id, version_token, display_period, time_zone,
                    display_index, bucket_start_ms, start_raw_index, end_raw_index,
                    open, high, low, close, volume
               FROM market_display_bars_stage
              ORDER BY display_index ASC`
          );
          const stageRows = await queryRowsWithConnection<{ count: unknown }>(
            connection,
            `SELECT COUNT(*) AS count
               FROM market_display_bars_stage
              WHERE display_period = ?`,
            [displayPeriod]
          );
          await insertTimelineMetaWithConnection(connection, {
            instrumentId,
            versionToken,
            displayPeriod,
            timeZone,
            totalRaw,
            totalDisplay: toSafeInt(stageRows[0]?.count ?? 0),
            builtAt
          });
          continue;
        }

        if (isRawNativeDisplayPeriod(timelineInput)) {
          await insertTimelineMetaWithConnection(connection, {
            instrumentId,
            versionToken,
            displayPeriod,
            timeZone,
            totalRaw,
            totalDisplay: totalRaw,
            builtAt
          });
          continue;
        }

        if (MARKET_TIMELINE_FIXED_PERIOD_MINUTES.has(displayPeriod)) {
          await insertFixedTimelineAnchorsWithConnection(connection, timelineInput);
          await insertTimelineMetaWithConnection(connection, {
            instrumentId,
            versionToken,
            displayPeriod,
            timeZone,
            totalRaw,
            totalDisplay: await countFixedTimelineDisplayWithConnection(connection, {
              instrumentId,
              displayPeriod
            }),
            builtAt
          });
          continue;
        }

        if (MARKET_TIMELINE_CALENDAR_PERIODS.includes(displayPeriod)) {
          await insertCalendarTimelineAnchorsWithConnection(connection, timelineInput);
          await insertTimelineMetaWithConnection(connection, {
            instrumentId,
            versionToken,
            displayPeriod,
            timeZone,
            totalRaw,
            totalDisplay: await countCalendarTimelineDisplayWithConnection(connection, timelineInput),
            builtAt
          });
        }
      }
      input.signal?.throwIfAborted();
      await connection.run('COMMIT');
    } catch (error) {
      await connection.run('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    await connection.run('DROP TABLE IF EXISTS market_timeline_boundaries_stage').catch(() => undefined);
    await connection.run('DROP TABLE IF EXISTS market_display_bars_stage').catch(() => undefined);
  }
};
