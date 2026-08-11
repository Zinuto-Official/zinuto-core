// SPDX-License-Identifier: GPL-3.0-only

import { db, type SystemSeedBaseTimeframe } from '../database.js';

export type SystemMarketSeedInstrumentRow = {
  id: string;
  symbol: string;
  base_timeframe?: string | null;
  name?: string | null;
  market?: string | null;
  bar_count?: number;
  time_start_ts?: string | null;
  time_end_ts?: string | null;
  bars_version_token?: string | null;
};

export type SystemMarketSeedInstrumentMetadata = {
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  barsVersionToken: string;
};

type SystemMarketSeedInstrumentInput = {
  id: string;
  symbol: string;
  baseTimeframe: SystemSeedBaseTimeframe;
  name: string;
  timeZone: string;
  minTradeStep: number;
  metadata: SystemMarketSeedInstrumentMetadata;
};

const readSystemInstrumentBySymbolStmt = db.prepare(
  `SELECT id,symbol,base_timeframe,name,market,bar_count,time_start_ts,time_end_ts,bars_version_token
     FROM instruments
    WHERE symbol = ?
      AND base_timeframe = ?
      AND market = 'SYSTEM'
    LIMIT 1`,
);

const updateSystemInstrumentMetadataStmt = db.prepare(
  `UPDATE instruments
      SET name = ?,
          market = 'SYSTEM',
          time_zone = ?,
          min_trade_step = ?,
          bar_count = ?,
          time_start_ts = ?,
          time_end_ts = ?,
          bars_version_token = ?
    WHERE id = ?`,
);

const insertSystemInstrumentStmt = db.prepare(
  `INSERT INTO instruments
    (id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const listSystemInstrumentSeedRowsStmt = db.prepare(
  `SELECT id,symbol,base_timeframe AS baseTimeframe
     FROM instruments
    WHERE market = 'SYSTEM'`,
);

const deleteInstrumentByIdStmt = db.prepare(
  'DELETE FROM instruments WHERE id = ?',
);

const upsertAppMetaValueStmt = db.prepare(
  `INSERT INTO app_meta (key,value,updated_at)
   VALUES (?,?,?)
   ON CONFLICT(key) DO UPDATE SET
     value = excluded.value,
     updated_at = excluded.updated_at`,
);

const readAppMetaValueStmt = db.prepare(
  `SELECT value
     FROM app_meta
    WHERE key = ?
    LIMIT 1`,
);

const listSystemInstrumentKeysStmt = db.prepare(
  `SELECT symbol, base_timeframe AS baseTimeframe, bar_count AS barCount
     FROM instruments
    WHERE market = 'SYSTEM'`,
);

const toSystemInstrumentRow = (
  input: SystemMarketSeedInstrumentInput,
): SystemMarketSeedInstrumentRow => ({
  id: input.id,
  symbol: input.symbol,
  base_timeframe: input.baseTimeframe,
  name: input.name,
  market: 'SYSTEM',
  bar_count: input.metadata.barCount,
  time_start_ts: input.metadata.timeStartTs,
  time_end_ts: input.metadata.timeEndTs,
  bars_version_token: input.metadata.barsVersionToken,
});

export const readSystemInstrumentBySymbol = (
  symbol: string,
  baseTimeframe: SystemSeedBaseTimeframe,
): SystemMarketSeedInstrumentRow | undefined =>
  readSystemInstrumentBySymbolStmt.get(
    symbol.trim().toUpperCase(),
    baseTimeframe,
  ) as SystemMarketSeedInstrumentRow | undefined;

export const updateSystemInstrumentMetadata = (
  input: SystemMarketSeedInstrumentInput,
): SystemMarketSeedInstrumentRow => {
  updateSystemInstrumentMetadataStmt.run(
    input.name,
    input.timeZone,
    input.minTradeStep,
    input.metadata.barCount,
    input.metadata.timeStartTs,
    input.metadata.timeEndTs,
    input.metadata.barsVersionToken,
    input.id,
  );
  return toSystemInstrumentRow(input);
};

export const insertSystemInstrument = (
  input: SystemMarketSeedInstrumentInput & { createdAt: string },
): SystemMarketSeedInstrumentRow => {
  insertSystemInstrumentStmt.run(
    input.id,
    input.symbol,
    input.baseTimeframe,
    input.name,
    'SYSTEM',
    input.timeZone,
    input.minTradeStep,
    input.metadata.barCount,
    input.metadata.timeStartTs,
    input.metadata.timeEndTs,
    input.metadata.barsVersionToken,
    input.createdAt,
  );
  return toSystemInstrumentRow(input);
};

export const listSystemInstrumentSeedRows = (): Array<{
  id: string;
  symbol: string;
  baseTimeframe: SystemSeedBaseTimeframe;
}> =>
  listSystemInstrumentSeedRowsStmt.all() as Array<{
    id: string;
    symbol: string;
    baseTimeframe: SystemSeedBaseTimeframe;
  }>;

export const deleteInstrumentById = (instrumentId: string): void => {
  deleteInstrumentByIdStmt.run(instrumentId);
};

export const upsertAppMetaValue = ({
  key,
  value,
  updatedAt,
}: {
  key: string;
  value: string;
  updatedAt: string;
}): void => {
  upsertAppMetaValueStmt.run(key, value, updatedAt);
};

export const readAppMetaValue = (key: string): string => {
  const row = readAppMetaValueStmt.get(key) as { value?: unknown } | undefined;
  return String(row?.value ?? '').trim();
};

export const listSystemInstrumentKeys = (): Array<{
  symbol?: string;
  baseTimeframe?: string;
  barCount?: number;
}> =>
  listSystemInstrumentKeysStmt.all() as Array<{
    symbol?: string;
    baseTimeframe?: string;
    barCount?: number;
  }>;
