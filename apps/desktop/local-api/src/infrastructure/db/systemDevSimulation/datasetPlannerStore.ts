// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";

export type SystemDevSimulationEligibleInstrumentRow = {
  instrumentId?: unknown;
  symbol?: unknown;
  baseTimeframe?: unknown;
  barCount?: unknown;
  sourceId?: unknown;
  sourceName?: unknown;
  sourceKind?: unknown;
};

type EligibleInstrumentQueryOptions = {
  minEligibleBars: number;
  limit: number;
};

const normalizeNonNegativeInteger = (value: number): number =>
  Math.max(0, Math.floor(Number(value) || 0));

export const listSystemDevSimulationLocalEligibleInstrumentRows = ({
  minEligibleBars,
  limit,
}: EligibleInstrumentQueryOptions): SystemDevSimulationEligibleInstrumentRow[] =>
  db
    .prepare(
      `SELECT i.id AS instrumentId,
              i.symbol AS symbol,
              i.base_timeframe AS baseTimeframe,
              i.bar_count AS barCount,
              src.id AS sourceId,
              src.name AS sourceName,
              'LOCAL' AS sourceKind
         FROM local_data_sources src
         JOIN instruments i
           ON i.source_id = src.id
          AND i.market = 'LOCAL'
        WHERE src.status = 'READY'
          AND src.deletion_state = 'IDLE'
          AND i.bar_count >= ?
        ORDER BY src.updated_at DESC,
                 src.id ASC,
                 i.base_timeframe ASC,
                 i.symbol ASC,
                 i.id ASC
        LIMIT ?`,
    )
    .all(normalizeNonNegativeInteger(minEligibleBars), normalizeNonNegativeInteger(limit)) as
    SystemDevSimulationEligibleInstrumentRow[];

export const listSystemDevSimulationSystemEligibleInstrumentRows = ({
  minEligibleBars,
  limit,
}: EligibleInstrumentQueryOptions): SystemDevSimulationEligibleInstrumentRow[] =>
  db
    .prepare(
      `SELECT id AS instrumentId,
              symbol AS symbol,
              base_timeframe AS baseTimeframe,
              bar_count AS barCount,
              'SYSTEM' AS sourceKind
         FROM instruments
        WHERE market = 'SYSTEM'
          AND bar_count >= ?
        ORDER BY CASE base_timeframe
                   WHEN '1d' THEN 0
                   WHEN '1m' THEN 1
                   WHEN '5m' THEN 2
                   WHEN '1h' THEN 3
                   ELSE 4
                 END ASC,
                 symbol ASC,
                 id ASC
        LIMIT ?`,
    )
    .all(normalizeNonNegativeInteger(minEligibleBars), normalizeNonNegativeInteger(limit)) as
    SystemDevSimulationEligibleInstrumentRow[];

export const countSystemDevSimulationLocalReadySources = (): number =>
  Math.max(
    0,
    Number(
      db
        .prepare(
          `SELECT COUNT(1)
             FROM local_data_sources
            WHERE status = 'READY'
              AND deletion_state = 'IDLE'`,
        )
        .pluck()
        .get() ?? 0,
    ),
  );
