// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";

export type SystemDevSimulationInstrumentCapacity = {
  instrumentId: string;
  symbol: string;
  barCount: number;
};

export const listSystemDevSimulationInstrumentCapacities = (
  instrumentIds: string[],
): SystemDevSimulationInstrumentCapacity[] => {
  const normalizedInstrumentIds = Array.from(
    new Set(
      instrumentIds
        .map((instrumentId) => String(instrumentId || "").trim())
        .filter((instrumentId) => instrumentId.length > 0),
    ),
  );
  if (!normalizedInstrumentIds.length) {
    return [];
  }
  const placeholders = normalizedInstrumentIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, symbol, bar_count AS barCount
         FROM instruments
        WHERE id IN (${placeholders})`,
    )
    .all(...normalizedInstrumentIds) as Array<{
    id?: unknown;
    symbol?: unknown;
    barCount?: unknown;
  }>;
  return rows.flatMap((row) => {
    const instrumentId = String(row.id ?? "").trim();
    const symbol = String(row.symbol ?? "").trim().toUpperCase();
    if (!instrumentId || !symbol) {
      return [];
    }
    return [
      {
        instrumentId,
        symbol,
        barCount: Math.max(0, Math.floor(Number(row.barCount) || 0)),
      },
    ];
  });
};

export const listInstrumentIdsForSimulationSymbols = ({
  baseTimeframe,
  symbols,
}: {
  baseTimeframe: string;
  symbols: string[];
}): string[] => {
  const normalizedSymbols = Array.from(
    new Set(
      symbols
        .map((symbol) => String(symbol || "").trim().toUpperCase())
        .filter((symbol) => symbol.length > 0),
    ),
  );
  if (!normalizedSymbols.length) {
    return [];
  }
  const placeholders = normalizedSymbols.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id
         FROM instruments
        WHERE base_timeframe = ?
          AND UPPER(TRIM(symbol)) IN (${placeholders})`,
    )
    .all(baseTimeframe, ...normalizedSymbols) as Array<{ id?: unknown }>;
  return Array.from(
    new Set(
      rows
        .map((row) => String(row.id ?? "").trim())
        .filter((instrumentId) => instrumentId.length > 0),
    ),
  );
};

export const countIndependentCustomNotesByBatchId = (
  simulationBatchId: string,
): number =>
  Math.max(
    0,
    Number(
      db
        .prepare(
          `SELECT COUNT(*)
             FROM replay_notes
            WHERE simulation_batch_id = ?
              AND type = 'CUSTOM'
              AND training_project_id IS NULL`,
        )
        .pluck()
        .get(simulationBatchId) ?? 0,
    ),
  );
