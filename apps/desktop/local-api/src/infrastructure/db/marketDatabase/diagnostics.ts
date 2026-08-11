// SPDX-License-Identifier: GPL-3.0-only

import { normalizeTimeZone } from '@zinuto/shared/timezone';
import type { TradingCalendarConfig } from '@zinuto/shared/tradingCalendar';
import { quoteDuckLiteral } from '../marketCsvImportSql.js';
import { queryRow, queryRows } from './connection.js';
import type { MarketSymbolDiagnosticsSnapshot } from './types.js';
import { toIsoFromEpochMs, toSafeInt, toSafeNumber } from './utils.js';

const MARKET_DIAGNOSTICS_MAX_ALERT_ROWS = 500;
const MARKET_DIAGNOSTICS_OUT_OF_SESSION_SCAN_ROWS = 100_000;
const MARKET_DIAGNOSTICS_BASE_INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000
};
const MARKET_DIAGNOSTICS_DAY_MINUTES = 24 * 60;
const MARKET_DIAGNOSTICS_BASE_INTERVAL_MINUTES: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '1h': 60,
  '1d': MARKET_DIAGNOSTICS_DAY_MINUTES
};

const buildTradingCalendarSqlIntegerList = (values: number[]): string => {
  const normalized = values
    .map((value) => Math.trunc(value))
    .filter((value) => Number.isFinite(value));
  return normalized.length ? normalized.join(', ') : 'NULL';
};

const buildTradingCalendarMembershipConditionSql = (
  calendar: TradingCalendarConfig,
): string => {
  const tradingDays = buildTradingCalendarSqlIntegerList(calendar.tradingDays);
  const clauses = calendar.sessions
    .map((session) => {
      const startMinute = Math.max(
        0,
        Math.min(MARKET_DIAGNOSTICS_DAY_MINUTES - 1, Math.trunc(session.startMinute)),
      );
      const endMinute = Math.max(
        0,
        Math.min(MARKET_DIAGNOSTICS_DAY_MINUTES, Math.trunc(session.endMinute)),
      );
      if (session.crossesMidnight) {
        return `((minute_of_day >= ${String(startMinute)} AND local_weekday IN (${tradingDays})) OR (minute_of_day < ${String(endMinute)} AND previous_local_weekday IN (${tradingDays})))`;
      }
      return `(minute_of_day >= ${String(startMinute)} AND minute_of_day < ${String(endMinute)} AND local_weekday IN (${tradingDays}))`;
    })
    .filter((clause) => clause.length > 0);
  return clauses.length ? clauses.join(' OR ') : 'FALSE';
};

const buildTradingCalendarTimeframeAlignmentConditionSql = (
  calendar: TradingCalendarConfig,
  stepMinutes: number,
): string => {
  const tradingDays = buildTradingCalendarSqlIntegerList(calendar.tradingDays);
  const step = Math.max(1, Math.trunc(stepMinutes));
  const clauses = calendar.sessions
    .map((session) => {
      const startMinute = Math.max(
        0,
        Math.min(MARKET_DIAGNOSTICS_DAY_MINUTES - 1, Math.trunc(session.startMinute)),
      );
      const endMinute = Math.max(
        0,
        Math.min(MARKET_DIAGNOSTICS_DAY_MINUTES, Math.trunc(session.endMinute)),
      );
      if (session.crossesMidnight) {
        return `((minute_of_day >= ${String(startMinute)} AND local_weekday IN (${tradingDays}) AND MOD(minute_of_day - ${String(startMinute)}, ${String(step)}) = 0) OR (minute_of_day < ${String(endMinute)} AND previous_local_weekday IN (${tradingDays}) AND MOD(minute_of_day + ${String(MARKET_DIAGNOSTICS_DAY_MINUTES - startMinute)}, ${String(step)}) = 0))`;
      }
      return `(minute_of_day >= ${String(startMinute)} AND minute_of_day < ${String(endMinute)} AND local_weekday IN (${tradingDays}) AND MOD(minute_of_day - ${String(startMinute)}, ${String(step)}) = 0)`;
    })
    .filter((clause) => clause.length > 0);
  return clauses.length ? clauses.join(' OR ') : 'FALSE';
};

const buildOutOfSessionDiagnosticsSql = (
  timeZone: string,
  calendar: TradingCalendarConfig,
): string => {
  const timeZoneLiteral = quoteDuckLiteral(timeZone);
  const membershipCondition = buildTradingCalendarMembershipConditionSql(calendar);
  return `WITH scanned AS (
            SELECT raw_index,
                   ts_ms,
                   TO_TIMESTAMP(ts_ms / 1000.0) AT TIME ZONE ${timeZoneLiteral} AS local_ts
              FROM market_bars
             WHERE instrument_id = ?
             ORDER BY raw_index ASC
             LIMIT ${String(MARKET_DIAGNOSTICS_OUT_OF_SESSION_SCAN_ROWS)}
          ),
          localized AS (
            SELECT raw_index,
                   ts_ms,
                   CAST(DATE_PART('hour', local_ts) AS INTEGER) * 60 +
                     CAST(DATE_PART('minute', local_ts) AS INTEGER) AS minute_of_day,
                   CAST(DATE_PART('isodow', local_ts) AS INTEGER) AS local_weekday
              FROM scanned
          ),
          calendar_membership AS (
            SELECT raw_index,
                   ts_ms,
                   minute_of_day,
                   local_weekday,
                   CASE WHEN local_weekday = 1 THEN 7 ELSE local_weekday - 1 END AS previous_local_weekday
              FROM localized
          )
          SELECT raw_index,
                 ts_ms
            FROM calendar_membership
           WHERE NOT (${membershipCondition})
           ORDER BY raw_index ASC
          LIMIT ${String(MARKET_DIAGNOSTICS_MAX_ALERT_ROWS)}`;
};

const buildTimeframeMisalignedDiagnosticsSql = (
  timeZone: string,
  calendar: TradingCalendarConfig,
  stepMinutes: number,
): string => {
  const timeZoneLiteral = quoteDuckLiteral(timeZone);
  const membershipCondition = buildTradingCalendarMembershipConditionSql(calendar);
  const alignmentCondition = buildTradingCalendarTimeframeAlignmentConditionSql(
    calendar,
    stepMinutes,
  );
  return `WITH scanned AS (
            SELECT raw_index,
                   ts_ms,
                   TO_TIMESTAMP(ts_ms / 1000.0) AT TIME ZONE ${timeZoneLiteral} AS local_ts
              FROM market_bars
             WHERE instrument_id = ?
             ORDER BY raw_index ASC
             LIMIT ${String(MARKET_DIAGNOSTICS_OUT_OF_SESSION_SCAN_ROWS)}
          ),
          localized AS (
            SELECT raw_index,
                   ts_ms,
                   CAST(DATE_PART('hour', local_ts) AS INTEGER) * 60 +
                     CAST(DATE_PART('minute', local_ts) AS INTEGER) AS minute_of_day,
                   CAST(DATE_PART('isodow', local_ts) AS INTEGER) AS local_weekday
              FROM scanned
          ),
          calendar_membership AS (
            SELECT raw_index,
                   ts_ms,
                   minute_of_day,
                   local_weekday,
                   CASE WHEN local_weekday = 1 THEN 7 ELSE local_weekday - 1 END AS previous_local_weekday
              FROM localized
          )
          SELECT raw_index,
                 ts_ms
            FROM calendar_membership
           WHERE (${membershipCondition})
             AND NOT (${alignmentCondition})
           ORDER BY raw_index ASC
           LIMIT ${String(MARKET_DIAGNOSTICS_MAX_ALERT_ROWS)}`;
};

const buildTradingCalendarMissingRangeHasSessionSql = (
  timeZone: string,
  calendar: TradingCalendarConfig,
): string => {
  const timeZoneLiteral = quoteDuckLiteral(timeZone);
  const membershipCondition = buildTradingCalendarMembershipConditionSql(calendar);
  return `EXISTS (
            SELECT 1
              FROM (
                SELECT minute_of_day,
                       local_weekday,
                       CASE WHEN local_weekday = 1 THEN 7 ELSE local_weekday - 1 END AS previous_local_weekday
                  FROM (
                    SELECT CAST(DATE_PART('hour', local_ts) AS INTEGER) * 60 +
                             CAST(DATE_PART('minute', local_ts) AS INTEGER) AS minute_of_day,
                           CAST(DATE_PART('isodow', local_ts) AS INTEGER) AS local_weekday
                      FROM (
                        SELECT TO_TIMESTAMP(missing_ts_ms / 1000.0) AT TIME ZONE ${timeZoneLiteral} AS local_ts
                          FROM GENERATE_SERIES(
                            CAST(deltas.previous_ts_ms + dominant.base_interval_ms AS BIGINT),
                            CAST(deltas.ts_ms - dominant.base_interval_ms AS BIGINT),
                            CAST(dominant.base_interval_ms AS BIGINT)
                          ) AS missing(missing_ts_ms)
                      ) AS localized_missing_ts
                  ) AS localized_missing
              ) AS missing_calendar
             WHERE ${membershipCondition}
             LIMIT 1
          )`;
};

const toIsoFromEpochMsRequired = (value: unknown): string =>
  toIsoFromEpochMs(value) ?? new Date(0).toISOString();

export const getMarketSymbolDiagnosticsSnapshot = async (
  instrumentId: string,
  baseTimeframe: string,
  options?: {
    timeZone?: string | null;
    tradingCalendar?: TradingCalendarConfig | null;
    signal?: AbortSignal;
  }
): Promise<MarketSymbolDiagnosticsSnapshot> => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return {
      totalBars: 0,
      volatilityPercent: 0,
      highPrice: 0,
      lowPrice: 0,
      invalidOhlcItems: [],
      duplicateTimestampItems: [],
      timeOrderItems: [],
      gaps: [],
      outOfSessionItems: [],
      timeframeMisalignedItems: [],
      extremePriceSpikeItems: []
    };
  }
  const normalizedBaseTimeframe = String(baseTimeframe ?? '').trim().toLowerCase();
  const fallbackIntervalMs =
    MARKET_DIAGNOSTICS_BASE_INTERVAL_MS[normalizedBaseTimeframe] ??
    MARKET_DIAGNOSTICS_BASE_INTERVAL_MS['1d'];
  const baseIntervalMinutes =
    MARKET_DIAGNOSTICS_BASE_INTERVAL_MINUTES[normalizedBaseTimeframe] ??
    MARKET_DIAGNOSTICS_BASE_INTERVAL_MINUTES['1d'];
  const diagnosticsTimeZone = normalizeTimeZone(options?.timeZone);
  const tradingCalendar = options?.tradingCalendar ?? null;
  const gapCalendarReportFilterSql = tradingCalendar
    ? `AND ${buildTradingCalendarMissingRangeHasSessionSql(diagnosticsTimeZone, tradingCalendar)}`
    : '';
  const summaryRow = await queryRow<{
    total_bars?: unknown;
    high_price?: unknown;
    low_price?: unknown;
    volatility_percent?: unknown;
  }>(
    `WITH ordered AS (
       SELECT raw_index,
              CAST(high AS DOUBLE) AS high,
              CAST(low AS DOUBLE) AS low,
              CAST(close AS DOUBLE) AS close,
              LAG(CAST(close AS DOUBLE)) OVER (ORDER BY raw_index ASC) AS previous_close
         FROM market_bars
        WHERE instrument_id = ?
     )
     SELECT COUNT(*) AS total_bars,
            COALESCE(MAX(high), 0) AS high_price,
            COALESCE(MIN(low), 0) AS low_price,
            COALESCE(STDDEV_SAMP(
              CASE
                WHEN previous_close > 0 THEN (close - previous_close) / previous_close
                ELSE NULL
              END
            ), 0) * 100 AS volatility_percent
       FROM ordered`,
    [normalizedInstrumentId],
    { signal: options?.signal }
  );
  const gapRows = await queryRows<Record<string, unknown>>(
    `WITH ordered AS (
       SELECT raw_index,
              ts_ms,
              LAG(ts_ms) OVER (ORDER BY raw_index ASC) AS previous_ts_ms
         FROM market_bars
        WHERE instrument_id = ?
     ),
     deltas AS (
       SELECT raw_index,
              ts_ms,
              previous_ts_ms,
              CAST(ROUND((ts_ms - previous_ts_ms) / 1000.0) * 1000 AS BIGINT) AS delta_ms
         FROM ordered
        WHERE previous_ts_ms IS NOT NULL
          AND ts_ms > previous_ts_ms
     ),
     histogram AS (
       SELECT delta_ms,
              COUNT(*) AS count
         FROM deltas
        WHERE delta_ms > 0
        GROUP BY delta_ms
     ),
     ranked AS (
       SELECT delta_ms,
              count,
              ROW_NUMBER() OVER (ORDER BY count DESC, delta_ms ASC) AS rank,
              SUM(count) OVER () AS total_count
         FROM histogram
     ),
     dominant AS (
       SELECT COALESCE(
                (SELECT delta_ms FROM ranked WHERE rank = 1),
                ?
              ) AS base_interval_ms
     )
     SELECT deltas.raw_index,
            deltas.previous_ts_ms,
            deltas.ts_ms,
            deltas.delta_ms,
            dominant.base_interval_ms,
            COALESCE(ranked.count, 0) AS repeat_count,
            CASE
              WHEN ranked.total_count > 0 THEN CAST(ranked.count AS DOUBLE) / ranked.total_count
              ELSE 0
            END AS repeat_ratio
       FROM deltas
       CROSS JOIN dominant
       LEFT JOIN ranked ON ranked.delta_ms = deltas.delta_ms
      WHERE deltas.delta_ms > dominant.base_interval_ms * 2
        ${gapCalendarReportFilterSql}
      ORDER BY deltas.raw_index ASC
      LIMIT ${String(MARKET_DIAGNOSTICS_MAX_ALERT_ROWS)}`,
    [normalizedInstrumentId, fallbackIntervalMs],
    { signal: options?.signal }
  );
  const extremePriceSpikeRows = await queryRows<Record<string, unknown>>(
    `WITH ordered AS (
       SELECT raw_index,
              ts_ms,
              CAST(open AS DOUBLE) AS open,
              CAST(high AS DOUBLE) AS high,
              CAST(low AS DOUBLE) AS low,
              CAST(close AS DOUBLE) AS close,
              LAG(CAST(close AS DOUBLE)) OVER (ORDER BY raw_index ASC) AS previous_close,
              LEAD(CAST(close AS DOUBLE)) OVER (ORDER BY raw_index ASC) AS next_close
         FROM market_bars
        WHERE instrument_id = ?
     ),
     scored AS (
     SELECT raw_index,
            ts_ms,
            CASE
              WHEN previous_close > 0 THEN (open - previous_close) / previous_close
              ELSE 0
            END AS open_gap_ratio,
            CASE
              WHEN previous_close > 0 THEN (close - previous_close) / previous_close
              ELSE 0
            END AS close_change_ratio,
            CASE
              WHEN previous_close > 0 THEN
                GREATEST(GREATEST(0, high - low), ABS(high - previous_close), ABS(low - previous_close)) / previous_close
              ELSE 0
            END AS amplitude_ratio,
            CASE
              WHEN previous_close > 0 AND next_close > 0 THEN ABS(next_close - previous_close) / LEAST(previous_close, next_close)
              ELSE 0
            END AS neighbor_drift_ratio,
            CASE
              WHEN previous_close > 0 AND next_close > 0 THEN
                LEAST(ABS(close - previous_close) / previous_close, ABS(close - next_close) / next_close)
              ELSE 0
            END AS close_neighbor_deviation_ratio,
            CASE
              WHEN previous_close > 0 AND next_close > 0 THEN
                GREATEST(
                  CASE
                    WHEN high > GREATEST(previous_close, next_close) THEN
                      (high - GREATEST(previous_close, next_close)) / GREATEST(previous_close, next_close)
                    ELSE 0
                  END,
                  CASE
                    WHEN low < LEAST(previous_close, next_close) THEN
                      (LEAST(previous_close, next_close) - low) / LEAST(previous_close, next_close)
                    ELSE 0
                  END
                )
              ELSE 0
            END AS wick_neighbor_deviation_ratio
       FROM ordered
      WHERE previous_close > 0 AND next_close > 0
     )
     SELECT raw_index,
            ts_ms,
            close_change_ratio,
            amplitude_ratio,
            GREATEST(close_neighbor_deviation_ratio, wick_neighbor_deviation_ratio) AS spike_ratio,
            CASE
              WHEN neighbor_drift_ratio > 0.000001 THEN
                GREATEST(close_neighbor_deviation_ratio, wick_neighbor_deviation_ratio) / neighbor_drift_ratio
              ELSE GREATEST(close_neighbor_deviation_ratio, wick_neighbor_deviation_ratio) * 100
            END AS multiple
       FROM scored
      WHERE neighbor_drift_ratio <= 0.08
        AND (
          close_neighbor_deviation_ratio >= 0.15
          OR (
            wick_neighbor_deviation_ratio >= 0.2
            AND ABS(open_gap_ratio) <= 0.08
            AND ABS(close_change_ratio) <= 0.08
          )
        )
      ORDER BY raw_index ASC
      LIMIT ${String(MARKET_DIAGNOSTICS_MAX_ALERT_ROWS)}`,
    [normalizedInstrumentId],
    { signal: options?.signal }
  );
  const invalidOhlcRows = await queryRows<Record<string, unknown>>(
    `SELECT raw_index,
            ts_ms,
            COUNT(*) AS count
       FROM market_bars
      WHERE instrument_id = ?
        AND (
          open <= 0 OR high <= 0 OR low <= 0 OR close <= 0 OR
          high < low OR
          high < GREATEST(open, close) OR
          low > LEAST(open, close)
        )
      GROUP BY raw_index, ts_ms
      ORDER BY raw_index ASC
      LIMIT ${String(MARKET_DIAGNOSTICS_MAX_ALERT_ROWS)}`,
    [normalizedInstrumentId],
    { signal: options?.signal }
  );
  const duplicateTimestampRows = await queryRows<Record<string, unknown>>(
    `SELECT MIN(raw_index) AS raw_index,
            ts_ms,
            COUNT(*) AS duplicate_count
       FROM market_bars
      WHERE instrument_id = ?
      GROUP BY ts_ms
     HAVING COUNT(*) > 1
      ORDER BY MIN(raw_index) ASC
      LIMIT ${String(MARKET_DIAGNOSTICS_MAX_ALERT_ROWS)}`,
    [normalizedInstrumentId],
    { signal: options?.signal }
  );
  const timeOrderRows = await queryRows<Record<string, unknown>>(
    `WITH ordered AS (
       SELECT raw_index,
              ts_ms,
              LAG(ts_ms) OVER (ORDER BY raw_index ASC) AS previous_ts_ms
         FROM market_bars
        WHERE instrument_id = ?
     )
     SELECT raw_index,
            ts_ms,
            previous_ts_ms
       FROM ordered
      WHERE previous_ts_ms IS NOT NULL
        AND ts_ms <= previous_ts_ms
      ORDER BY raw_index ASC
      LIMIT ${String(MARKET_DIAGNOSTICS_MAX_ALERT_ROWS)}`,
    [normalizedInstrumentId],
    { signal: options?.signal }
  );
  const outOfSessionRows = tradingCalendar
    ? await queryRows<Record<string, unknown>>(
        buildOutOfSessionDiagnosticsSql(diagnosticsTimeZone, tradingCalendar),
        [normalizedInstrumentId],
        { signal: options?.signal },
      )
    : [];
  const outOfSessionItems: MarketSymbolDiagnosticsSnapshot['outOfSessionItems'] =
    outOfSessionRows
      .map((row) => {
        const tsMs = Number(row.ts_ms);
        if (!Number.isFinite(tsMs)) {
          return null;
        }
        return {
          rawIndex: toSafeInt(row.raw_index),
          ts: toIsoFromEpochMsRequired(tsMs),
          count: 1,
        };
      })
      .filter((item): item is MarketSymbolDiagnosticsSnapshot['outOfSessionItems'][number] =>
        item !== null
      );
  const timeframeMisalignedRows =
    tradingCalendar && baseIntervalMinutes > 1 && baseIntervalMinutes < MARKET_DIAGNOSTICS_DAY_MINUTES
      ? await queryRows<Record<string, unknown>>(
          buildTimeframeMisalignedDiagnosticsSql(
            diagnosticsTimeZone,
            tradingCalendar,
            baseIntervalMinutes,
          ),
          [normalizedInstrumentId],
          { signal: options?.signal },
        )
      : [];
  const timeframeMisalignedItems: NonNullable<MarketSymbolDiagnosticsSnapshot['timeframeMisalignedItems']> =
    timeframeMisalignedRows
      .map((row) => {
        const tsMs = Number(row.ts_ms);
        if (!Number.isFinite(tsMs)) {
          return null;
        }
        return {
          rawIndex: toSafeInt(row.raw_index),
          ts: toIsoFromEpochMsRequired(tsMs),
          count: 1,
        };
      })
      .filter((item): item is NonNullable<MarketSymbolDiagnosticsSnapshot['timeframeMisalignedItems']>[number] =>
        item !== null
      );
  const gapItems = gapRows.map((row) => {
    const baseIntervalMs = Math.max(1, toSafeInt(row.base_interval_ms ?? fallbackIntervalMs));
    const deltaMs = Math.max(0, toSafeInt(row.delta_ms));
    const previousTsMs = Number(row.previous_ts_ms);
    const currentTsMs = Number(row.ts_ms);
    const missingStartMs = previousTsMs + baseIntervalMs;
    const missingEndMs = currentTsMs - baseIntervalMs;
    return {
      rawIndex: toSafeInt(row.raw_index),
      missingBars: Math.max(0, Math.round(deltaMs / baseIntervalMs) - 1),
      missingStartTs: new Date(missingStartMs).toISOString(),
      missingEndTs: new Date(missingEndMs).toISOString(),
      deltaMs,
      baseIntervalMs,
      repeatCount: toSafeInt(row.repeat_count),
      repeatRatio: toSafeNumber(row.repeat_ratio)
    };
  }).filter((item) => {
    if (item.missingBars <= 0) {
      return false;
    }
    return true;
  });
  return {
    totalBars: toSafeInt(summaryRow?.total_bars ?? 0),
    volatilityPercent: toSafeNumber(summaryRow?.volatility_percent ?? 0),
    highPrice: toSafeNumber(summaryRow?.high_price ?? 0),
    lowPrice: toSafeNumber(summaryRow?.low_price ?? 0),
    invalidOhlcItems: invalidOhlcRows.map((row) => ({
      rawIndex: toSafeInt(row.raw_index),
      ts: toIsoFromEpochMsRequired(row.ts_ms),
      count: Math.max(1, toSafeInt(row.count))
    })),
    duplicateTimestampItems: duplicateTimestampRows.map((row) => ({
      rawIndex: toSafeInt(row.raw_index),
      ts: toIsoFromEpochMsRequired(row.ts_ms),
      duplicateCount: Math.max(2, toSafeInt(row.duplicate_count))
    })),
    timeOrderItems: timeOrderRows.map((row) => ({
      rawIndex: toSafeInt(row.raw_index),
      ts: toIsoFromEpochMsRequired(row.ts_ms),
      previousTs: toIsoFromEpochMsRequired(row.previous_ts_ms)
    })),
    gaps: gapItems,
    outOfSessionItems,
    timeframeMisalignedItems,
    extremePriceSpikeItems: extremePriceSpikeRows.map((row) => ({
      rawIndex: toSafeInt(row.raw_index),
      ts: toIsoFromEpochMsRequired(row.ts_ms),
      closeChangeRatio: toSafeNumber(row.close_change_ratio),
      amplitudeRatio: toSafeNumber(row.amplitude_ratio),
      zScore: toSafeNumber(row.spike_ratio),
      multiple: toSafeNumber(row.multiple)
    }))
  };
};
