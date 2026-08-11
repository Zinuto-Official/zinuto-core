// SPDX-License-Identifier: GPL-3.0-only

import type { DuckDBConnection } from '@duckdb/node-api';
import type { OhlcvBar } from '../../../domain/models.js';
import { isAppError } from '../../../kernel/appError.js';
import {
  getCachedMarketBarChunk,
  getCachedMarketBarCount,
  setCachedMarketBarChunk,
  setCachedMarketBarCount,
} from '../marketReadCache.js';
import { MARKET_BAR_CHUNK_SIZE } from './constants.js';
import {
  executeWithConnection,
  getMarketDbContext,
  queryRow,
  queryRows,
  type MarketReadQueryOptions,
  withMarketDbLock,
} from './connection.js';
import { incrementMarketReadDiagnostic } from './readDiagnostics.js';
import { buildOhlcvSelectDoubleSql } from './ohlcvSql.js';
import {
  removeMarketStorageForExplicitClear,
  removeMarketStorageForExplicitClearWithLockHeld,
} from './storageMaintenance.js';
import {
  toEpochMs,
  toEpochMsBigInt,
  toIsoFromEpochMs,
  toSafeInt,
  toSafeNumber,
} from './utils.js';

export const toOhlcvBar = (row: Record<string, unknown>): OhlcvBar => ({
  ts: toIsoFromEpochMs(row.ts_ms) ?? '',
  open: toSafeNumber(row.open),
  high: toSafeNumber(row.high),
  low: toSafeNumber(row.low),
  close: toSafeNumber(row.close),
  volume: toSafeNumber(row.volume)
});

export const refreshMarketBarChunkAnchorsWithConnection = async (
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
    `DELETE FROM market_bar_chunk_anchors
      WHERE instrument_id IN (${placeholders})`,
    normalizedInstrumentIds as never[]
  );
  await connection.run(
    `INSERT INTO market_bar_chunk_anchors (instrument_id, chunk_start, start_ts_ms)
     SELECT instrument_id,
            raw_index AS chunk_start,
            ts_ms AS start_ts_ms
       FROM market_bars
      WHERE instrument_id IN (${placeholders})
        AND raw_index % ${String(MARKET_BAR_CHUNK_SIZE)} = 0
      ORDER BY instrument_id ASC, chunk_start ASC`,
    normalizedInstrumentIds as never[]
  );
};

export const queryMarketBarRowsByOffset = async <TRow extends Record<string, unknown>>(
  options: {
    instrumentId: string;
    offset: number;
    limit: number;
    selectSql: string;
    signal?: AbortSignal;
  }
): Promise<TRow[]> => {
  const normalizedInstrumentId = String(options.instrumentId ?? '').trim();
  const normalizedOffset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const normalizedLimit = Math.max(0, Math.floor(Number(options.limit) || 0));
  if (!normalizedInstrumentId || normalizedLimit <= 0) {
    return [];
  }
  return queryRows<TRow>(
    `SELECT ${options.selectSql}
       FROM market_bars
      WHERE instrument_id = ?
        AND raw_index >= ?
        AND raw_index < ?
      ORDER BY raw_index ASC`,
    [
      normalizedInstrumentId,
      normalizedOffset,
      normalizedOffset + normalizedLimit
    ],
    { signal: options.signal },
  );
};

export const loadMarketBarChunk = async (
  instrumentId: string,
  chunkStart: number,
  options: MarketReadQueryOptions = {},
): Promise<OhlcvBar[]> => {
  options.signal?.throwIfAborted();
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return [];
  }
  const normalizedChunkStart = Math.max(0, Math.floor(Number(chunkStart) || 0));
  const cachedBars = getCachedMarketBarChunk(normalizedInstrumentId, normalizedChunkStart);
  if (cachedBars) {
    return cachedBars;
  }
  const rows = await queryMarketBarRowsByOffset<Record<string, unknown>>({
    instrumentId: normalizedInstrumentId,
    offset: normalizedChunkStart,
    limit: MARKET_BAR_CHUNK_SIZE,
    selectSql: `ts_ms, ${buildOhlcvSelectDoubleSql()}`,
    signal: options.signal,
  });
  options.signal?.throwIfAborted();
  const loadedBars = rows.map(toOhlcvBar);
  setCachedMarketBarChunk(normalizedInstrumentId, normalizedChunkStart, loadedBars);
  return loadedBars;
};

export const findMarketBarRawIndexByTs = async (
  instrumentId: string,
  ts: string
): Promise<number | null> => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  const targetMs = toEpochMs(ts);
  if (!normalizedInstrumentId || targetMs === null) {
    return null;
  }
  const anchorRow = await queryRow<{ chunk_start: unknown }>(
    `SELECT chunk_start
       FROM market_bar_chunk_anchors
      WHERE instrument_id = ?
        AND start_ts_ms <= ?
      ORDER BY start_ts_ms DESC
      LIMIT 1`,
    [normalizedInstrumentId, BigInt(targetMs)]
  );
  const anchorChunkStart = Math.max(0, Math.floor(Number(anchorRow?.chunk_start ?? 0) || 0));
  const barCount = await getMarketBarCount(normalizedInstrumentId);
  const lastChunkStart =
    barCount > 0
      ? Math.floor(Math.max(0, barCount - 1) / MARKET_BAR_CHUNK_SIZE) * MARKET_BAR_CHUNK_SIZE
      : 0;
  // The anchor can lag the latest data by more than one chunk (for example
  // after an interrupted prepend). Binary search the chunk range between the
  // anchor and the final chunk instead of probing only two fixed chunks.
  let lowChunkStart = anchorChunkStart;
  let highChunkStart = Math.max(anchorChunkStart, lastChunkStart);
  while (lowChunkStart <= highChunkStart) {
    const midChunkStart =
      Math.floor((lowChunkStart + highChunkStart) / 2 / MARKET_BAR_CHUNK_SIZE) *
      MARKET_BAR_CHUNK_SIZE;
    const chunkBars = await loadMarketBarChunk(normalizedInstrumentId, midChunkStart);
    if (!chunkBars.length) {
      highChunkStart = midChunkStart - MARKET_BAR_CHUNK_SIZE;
      continue;
    }
    const chunkFirstMs = toEpochMs(chunkBars[0]?.ts ?? '');
    const chunkLastMs = toEpochMs(chunkBars[chunkBars.length - 1]?.ts ?? '');
    if (chunkFirstMs !== null && targetMs < chunkFirstMs) {
      highChunkStart = midChunkStart - MARKET_BAR_CHUNK_SIZE;
      continue;
    }
    if (chunkLastMs !== null && targetMs > chunkLastMs) {
      lowChunkStart = midChunkStart + MARKET_BAR_CHUNK_SIZE;
      continue;
    }
    for (let offset = 0; offset < chunkBars.length; offset += 1) {
      if (toEpochMs(chunkBars[offset]?.ts ?? '') === targetMs) {
        return midChunkStart + offset;
      }
    }
    return null;
  }
  return null;
};

export const getMarketBarCount = async (
  instrumentId: string,
  options: MarketReadQueryOptions = {},
): Promise<number> => {
  options.signal?.throwIfAborted();
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return 0;
  }
  const cachedBarCount = getCachedMarketBarCount(normalizedInstrumentId);
  if (cachedBarCount !== null) {
    return cachedBarCount;
  }
  const row = await queryRow<{ count: unknown }>(
    `SELECT bar_count AS count
       FROM market_instruments
      WHERE instrument_id = ?`,
    [normalizedInstrumentId],
    options,
  );
  options.signal?.throwIfAborted();
  const resolvedCount = toSafeInt(row?.count ?? 0);
  setCachedMarketBarCount(normalizedInstrumentId, resolvedCount);
  return resolvedCount;
};

export const getMarketBarsByInstrumentId = async (instrumentId: string): Promise<OhlcvBar[]> => {
  incrementMarketReadDiagnostic('fullRawReadCount');
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT ts_ms, ${buildOhlcvSelectDoubleSql()}
	       FROM market_bars
	      WHERE instrument_id = ?
	      ORDER BY raw_index ASC`,
    [instrumentId]
  );
  return rows.map(toOhlcvBar);
};

export const getMarketBarsByInstrumentIdRange = async (
  instrumentId: string,
  offset: number,
  limit: number,
  options: MarketReadQueryOptions = {},
): Promise<OhlcvBar[]> => {
  options.signal?.throwIfAborted();
  incrementMarketReadDiagnostic('rangeReadCount');
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return [];
  }
  const normalizedOffset = Math.max(0, Math.floor(offset));
  const normalizedLimit = Math.max(0, Math.floor(limit));
  if (normalizedLimit <= 0) {
    return [];
  }
  if (normalizedLimit <= MARKET_BAR_CHUNK_SIZE) {
    const chunkStart = Math.floor(normalizedOffset / MARKET_BAR_CHUNK_SIZE) * MARKET_BAR_CHUNK_SIZE;
    const chunkEndExclusive = chunkStart + MARKET_BAR_CHUNK_SIZE;
    if (normalizedOffset + normalizedLimit <= chunkEndExclusive) {
      const chunkBars = await loadMarketBarChunk(normalizedInstrumentId, chunkStart, options);
      const chunkOffset = normalizedOffset - chunkStart;
      return chunkBars.slice(chunkOffset, chunkOffset + normalizedLimit);
    }
  }
  const rows = await queryMarketBarRowsByOffset<Record<string, unknown>>({
    instrumentId: normalizedInstrumentId,
    offset: normalizedOffset,
    limit: normalizedLimit,
    selectSql: `ts_ms, ${buildOhlcvSelectDoubleSql()}`,
    signal: options.signal,
  });
  options.signal?.throwIfAborted();
  const mapped = rows.map(toOhlcvBar);
  if (mapped.length > 0) {
    // Populate fully covered fixed-size chunks into cache, even for non-aligned ranges.
    // This improves follow-up getBarByIndex and nearby range reads at large offsets.
    const rangeStart = normalizedOffset;
    const rangeEndExclusive = normalizedOffset + mapped.length;
    const firstChunkStart = Math.floor(rangeStart / MARKET_BAR_CHUNK_SIZE) * MARKET_BAR_CHUNK_SIZE;
    for (
      let chunkStart = firstChunkStart;
      chunkStart + MARKET_BAR_CHUNK_SIZE <= rangeEndExclusive;
      chunkStart += MARKET_BAR_CHUNK_SIZE
    ) {
      const relativeStart = chunkStart - rangeStart;
      const relativeEnd = relativeStart + MARKET_BAR_CHUNK_SIZE;
      if (relativeStart < 0 || relativeEnd > mapped.length) {
        continue;
      }
      setCachedMarketBarChunk(normalizedInstrumentId, chunkStart, mapped.slice(relativeStart, relativeEnd));
    }
  }
  return mapped;
};

export const getMarketBarsByInstrumentIdTsRange = async (
  instrumentId: string,
  startTs: string,
  endTs: string,
  options: MarketReadQueryOptions = {},
): Promise<OhlcvBar[]> => {
  options.signal?.throwIfAborted();
  const startMs = toEpochMsBigInt(startTs);
  const endMs = toEpochMsBigInt(endTs);
  if (startMs === null || endMs === null) {
    return [];
  }
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT ts_ms, ${buildOhlcvSelectDoubleSql()}
       FROM market_bars
      WHERE instrument_id = ?
        AND ts_ms >= ?
        AND ts_ms <= ?
      ORDER BY ts_ms ASC`,
    [instrumentId, startMs, endMs],
    options,
  );
  options.signal?.throwIfAborted();
  return rows.map(toOhlcvBar);
};

export const getMarketBarByIndex = async (instrumentId: string, index: number): Promise<OhlcvBar | undefined> => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return undefined;
  }
  const normalizedIndex = Math.max(0, Math.floor(index));
  const chunkStart = Math.floor(normalizedIndex / MARKET_BAR_CHUNK_SIZE) * MARKET_BAR_CHUNK_SIZE;
  const chunkBars = await loadMarketBarChunk(normalizedInstrumentId, chunkStart);
  const chunkOffset = normalizedIndex - chunkStart;
  if (chunkOffset >= MARKET_BAR_CHUNK_SIZE - 4 && chunkBars.length === MARKET_BAR_CHUNK_SIZE) {
    void loadMarketBarChunk(normalizedInstrumentId, chunkStart + MARKET_BAR_CHUNK_SIZE)
      .catch(() => undefined);
  }
  return chunkBars[chunkOffset];
};

export const countMarketBarsAfterUntilExclusive = async (
  instrumentId: string,
  startExclusiveTs: string,
  endExclusiveTs: string
): Promise<number> => {
  const startMs = toEpochMsBigInt(startExclusiveTs);
  const endMs = toEpochMsBigInt(endExclusiveTs);
  if (startMs === null || endMs === null) {
    return 0;
  }
  const row = await queryRow<{ count: unknown }>(
    `SELECT COUNT(*) AS count
       FROM market_bars
      WHERE instrument_id = ?
        AND ts_ms > ?
        AND ts_ms < ?`,
    [instrumentId, startMs, endMs]
  );
  return toSafeInt(row?.count ?? 0);
};

export const countMarketBarsAfterUntilInclusive = async (
  instrumentId: string,
  startExclusiveTs: string,
  endInclusiveTs: string
): Promise<number> => {
  const startMs = toEpochMsBigInt(startExclusiveTs);
  const endMs = toEpochMsBigInt(endInclusiveTs);
  if (startMs === null || endMs === null) {
    return 0;
  }
  const row = await queryRow<{ count: unknown }>(
    `SELECT COUNT(*) AS count
       FROM market_bars
      WHERE instrument_id = ?
        AND ts_ms > ?
        AND ts_ms <= ?`,
    [instrumentId, startMs, endMs]
  );
  return toSafeInt(row?.count ?? 0);
};

export const getFirstMarketBarTsAtOrAfter = async (instrumentId: string, minTs: string): Promise<string | null> => {
  const minTsMs = toEpochMsBigInt(minTs);
  if (minTsMs === null) {
    return null;
  }
  const row = await queryRow<{ ts_ms: unknown }>(
    `SELECT ts_ms
       FROM market_bars
      WHERE instrument_id = ?
        AND ts_ms >= ?
      ORDER BY ts_ms ASC
      LIMIT 1`,
    [instrumentId, minTsMs]
  );
  return toIsoFromEpochMs(row?.ts_ms);
};

export const getMarketCloseAtOrBefore = async (instrumentId: string, ts: string): Promise<number | null> => {
  const tsMs = toEpochMsBigInt(ts);
  if (tsMs === null) {
    return null;
  }
  const row = await queryRow<{ close: unknown }>(
    `SELECT CAST(close AS DOUBLE) AS close
       FROM market_bars
      WHERE instrument_id = ?
        AND ts_ms <= ?
      ORDER BY ts_ms DESC
      LIMIT 1`,
    [instrumentId, tsMs]
  );
  if (!row) {
    return null;
  }
  const close = Number(row.close);
  if (!Number.isFinite(close)) {
    return null;
  }
  return close;
};

export const getMarketBarTsByRange = async (instrumentId: string, offset: number, limit: number): Promise<string[]> => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  const normalizedOffset = Math.max(0, Math.floor(offset));
  const normalizedLimit = Math.max(0, Math.floor(limit));
  if (!normalizedInstrumentId || normalizedLimit <= 0) {
    return [];
  }
  if (normalizedLimit <= MARKET_BAR_CHUNK_SIZE) {
    const chunkStart = Math.floor(normalizedOffset / MARKET_BAR_CHUNK_SIZE) * MARKET_BAR_CHUNK_SIZE;
    const chunkEndExclusive = chunkStart + MARKET_BAR_CHUNK_SIZE;
    if (normalizedOffset + normalizedLimit <= chunkEndExclusive) {
      const chunkBars = await loadMarketBarChunk(normalizedInstrumentId, chunkStart);
      const chunkOffset = normalizedOffset - chunkStart;
      return chunkBars
        .slice(chunkOffset, chunkOffset + normalizedLimit)
        .map((bar) => bar.ts)
        .filter((item) => Boolean(item));
    }
  }
  const rows = await queryMarketBarRowsByOffset<{ ts_ms: unknown }>({
    instrumentId: normalizedInstrumentId,
    offset: normalizedOffset,
    limit: normalizedLimit,
    selectSql: 'ts_ms'
  });
  return rows.map((row) => toIsoFromEpochMs(row.ts_ms) ?? '').filter((item) => Boolean(item));
};

export const clearMarketData = async (
  options: MarketReadQueryOptions = {},
): Promise<{ deletedBars: number; deletedInstruments: number }> => {
  options.signal?.throwIfAborted();
  let result: { deletedBars: number; deletedInstruments: number };
  try {
    result = await withMarketDbLock(async () => {
      const { connection } = await getMarketDbContext();
      const interrupt = (): void => {
        try {
          connection.interrupt();
        } catch {
          // The interrupted task is awaited below before the lock is released.
        }
      };
      options.signal?.addEventListener('abort', interrupt, { once: true });
      try {
        options.signal?.throwIfAborted();
        await executeWithConnection(connection, 'BEGIN TRANSACTION');
        try {
          const deletedBars = await executeWithConnection(connection, 'DELETE FROM market_bars');
          const deletedInstruments = await executeWithConnection(connection, 'DELETE FROM market_instruments');
          await executeWithConnection(connection, 'DELETE FROM market_bar_chunk_anchors');
          await executeWithConnection(connection, 'DELETE FROM market_display_bars');
          await executeWithConnection(connection, 'DELETE FROM market_display_anchors');
          await executeWithConnection(connection, 'DELETE FROM market_timeline_meta');
          await executeWithConnection(connection, 'COMMIT');
          options.signal?.throwIfAborted();
          await removeMarketStorageForExplicitClearWithLockHeld({
            signal: options.signal,
          });
          return { deletedBars, deletedInstruments };
        } catch (error) {
          await executeWithConnection(connection, 'ROLLBACK').catch(() => undefined);
          throw error;
        }
      } finally {
        options.signal?.removeEventListener('abort', interrupt);
      }
    }, { signal: options.signal });
  } catch (error) {
    options.signal?.throwIfAborted();
    if (!isAppError(error) || error.code !== 'LOCAL_MARKET_DATA_NEEDS_ATTENTION') {
      throw error;
    }
    await removeMarketStorageForExplicitClear({ signal: options.signal });
    options.signal?.throwIfAborted();
    return { deletedBars: 0, deletedInstruments: 0 };
  }
  return result;
};
