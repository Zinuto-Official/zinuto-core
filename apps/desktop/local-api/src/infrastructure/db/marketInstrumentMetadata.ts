// SPDX-License-Identifier: GPL-3.0-only

import { db } from './database.js';

export type InstrumentRangeMeta = {
  instrumentId: string;
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  barsVersionToken: string;
};

const getUpdateInstrumentQuestionMetaStmt = () =>
  db.prepare(
    `UPDATE instruments
        SET bar_count = ?,
            time_start_ts = ?,
            time_end_ts = ?,
            bars_version_token = ?
      WHERE id = ?`
  );

const getClearAllInstrumentQuestionMetaStmt = () =>
  db.prepare(
    `UPDATE instruments
        SET bar_count = 0,
            time_start_ts = NULL,
            time_end_ts = NULL,
            bars_version_token = ''`
  );

export const updateInstrumentQuestionMeta = (
  instrumentId: string,
  meta?: InstrumentRangeMeta | null
): void => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return;
  }
  if (!meta || meta.barCount <= 0) {
    getUpdateInstrumentQuestionMetaStmt().run(
      0,
      null,
      null,
      '',
      normalizedInstrumentId
    );
    return;
  }
  getUpdateInstrumentQuestionMetaStmt().run(
    meta.barCount,
    meta.timeStartTs,
    meta.timeEndTs,
    meta.barsVersionToken,
    normalizedInstrumentId
  );
};

export const clearAllInstrumentQuestionMeta = (): void => {
  getClearAllInstrumentQuestionMetaStmt().run();
};

export const applyInstrumentRangeMetaBatch = (
  instrumentIds: string[],
  metaByInstrumentId: Map<string, InstrumentRangeMeta>
): void => {
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

  const tx = db.transaction((ids: string[]) => {
    ids.forEach((instrumentId) => {
      updateInstrumentQuestionMeta(instrumentId, metaByInstrumentId.get(instrumentId) ?? null);
    });
  });
  tx(normalizedInstrumentIds);
};

export const queryInstrumentRangeMetaByIds = async (options: {
  instrumentIds: string[];
  chunkSize: number;
  queryRows: (
    sql: string,
    params?: unknown[]
  ) => Promise<
    Array<{
      instrument_id?: unknown;
      total_bars?: unknown;
      start_ts_ms?: unknown;
      end_ts_ms?: unknown;
      first_close?: unknown;
      last_close?: unknown;
    }>
  >;
  toSafeInt: (value: unknown) => number;
  toIsoFromEpochMs: (value: unknown) => string | null;
  formatVersionClose: (value: unknown) => string;
}): Promise<Map<string, InstrumentRangeMeta>> => {
  const normalizedInstrumentIds = Array.from(
    new Set(
      options.instrumentIds
        .map((item) => String(item ?? '').trim())
        .filter((item) => Boolean(item))
    )
  );
  const metaByInstrumentId = new Map<string, InstrumentRangeMeta>();
  if (!normalizedInstrumentIds.length) {
    return metaByInstrumentId;
  }

  for (let offset = 0; offset < normalizedInstrumentIds.length; offset += options.chunkSize) {
    const chunk = normalizedInstrumentIds.slice(offset, offset + options.chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await options.queryRows(
      `SELECT instrument_id,
              COUNT(*) AS total_bars,
              MIN(ts_ms) AS start_ts_ms,
              MAX(ts_ms) AS end_ts_ms,
              CAST(arg_min(close, ts_ms) AS DOUBLE) AS first_close,
              CAST(arg_max(close, ts_ms) AS DOUBLE) AS last_close
         FROM market_bars
        WHERE instrument_id IN (${placeholders})
        GROUP BY instrument_id`,
      chunk
    );
    rows.forEach((row) => {
      const instrumentId = String(row.instrument_id ?? '').trim();
      if (!instrumentId) {
        return;
      }
      const barCount = options.toSafeInt(row.total_bars ?? 0);
      const timeStartTs = options.toIsoFromEpochMs(row.start_ts_ms);
      const timeEndTs = options.toIsoFromEpochMs(row.end_ts_ms);
      const barsVersionToken =
        barCount > 0 && timeStartTs && timeEndTs
          ? `${barCount}:${timeStartTs}:${options.formatVersionClose(row.first_close)}:${timeEndTs}:${options.formatVersionClose(row.last_close)}`
          : '';
      metaByInstrumentId.set(instrumentId, {
        instrumentId,
        barCount,
        timeStartTs,
        timeEndTs,
        barsVersionToken
      });
    });
  }

  return metaByInstrumentId;
};
