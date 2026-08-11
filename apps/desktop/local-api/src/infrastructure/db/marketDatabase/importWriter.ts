// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { OhlcvBar } from '../../../domain/models.js';
import {
  applyInstrumentRangeMetaBatch,
  queryInstrumentRangeMetaByIds,
  updateInstrumentQuestionMeta,
} from '../marketInstrumentMetadata.js';
import { invalidateMarketReadCaches } from '../marketReadCache.js';
import {
  DEFAULT_MARKET_CSV_DATETIME_TIMEZONE,
  buildCsvDedupedRowsFromClassifiedRowsSql,
  buildCsvImportClassifiedRowsSql,
  buildNormalizedSourceKeySqlExpr,
  normalizeCsvColumnName,
  normalizeCsvTimestampMode,
  normalizeCsvTimezone,
  quoteDuckLiteral,
} from '../marketCsvImportSql.js';
import {
  appendEdgeBarsForInstrumentsFromCsvFilesBatchCore,
  type CsvEdgeAppendInput,
  type CsvEdgeAppendResult,
} from '../marketCsvEdgeAppend.js';
import {
  MARKET_CSV_IMPORT_FILE_STAGE_TABLE,
  MARKET_CSV_IMPORT_SAMPLE_SIZE,
  SYMBOL_QUERY_CHUNK_SIZE,
} from './constants.js';
import {
  closeDuckDbConnectionSafely,
  execute,
  getMarketDbContext,
  queryRows,
  withMarketDbLock,
} from './connection.js';
import { refreshMarketBarChunkAnchorsWithConnection } from './barReader.js';
import {
  invalidateMarketTimelineWithConnection,
  prewarmHotMarketTimelinesForInstruments,
  reindexMarketBarsWithConnection,
} from './timeline.js';
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
} from './ohlcvSql.js';
import type {
  CsvBatchImportInput,
  CsvBatchImportResult,
  CsvImportColumnMapping,
  TabularImportFileFormat,
} from './types.js';

import {
  formatVersionClose,
  toEpochMs,
  toIsoFromEpochMs,
  toSafeInt,
} from './utils.js';
import {
  detectCommonMarketCsvDialect,
} from '../marketCsvDialect.js';
import { assertNoMixedSymbolsInTabularSource } from '../marketCsvSymbolGuard.js';

import {
  checkpointAfterLargeMarketWrite,
  buildTabularSourceSql,
  collectCsvImportQualityBySourceKeyWithConnection,
  collectCsvImportQualityWithConnection,
  createCsvImportFileStageWithConnection,
  marketWriteAbortReason,
  normalizeSourceKeyPath,
  preserveNonWhitespacePath,
  refreshInstrumentCountsBatchInternal,
  runInterruptibleMarketConnectionTask,
  throwIfMarketWriteAborted,
  type CsvImportQualitySummary,
  type MarketWriteOptions,
  type NormalizedCsvBatchImportInput,
} from './importWriterSupport.js';
export type { MarketWriteOptions } from './importWriterSupport.js';

import { upsertInstrumentCountWithConnection } from './importWriterSupport.js';

const replaceInstrumentBarsFromDedupedRowsWithConnection = async (
  connection: DuckDBConnection,
  input: Pick<NormalizedCsvBatchImportInput, 'instrumentId' | 'symbol'>,
  dedupedRowsSql: string
): Promise<number> => {
  await connection.run(
    `DELETE FROM market_bars
      WHERE instrument_id = ?`,
    [input.instrumentId] as never[]
  );
  const insertResult = await connection.run(
    `INSERT INTO market_bars (instrument_id, raw_index, ts_ms, open, high, low, close, volume)
     SELECT
       ? AS instrument_id,
       ROW_NUMBER() OVER (ORDER BY ts_ms ASC) - 1 AS raw_index,
       ts_ms,
       CAST(open AS ${MARKET_PRICE_STORAGE_SQL}) AS open,
       CAST(high AS ${MARKET_PRICE_STORAGE_SQL}) AS high,
       CAST(low AS ${MARKET_PRICE_STORAGE_SQL}) AS low,
       CAST(close AS ${MARKET_PRICE_STORAGE_SQL}) AS close,
       CAST(volume AS ${MARKET_VOLUME_STORAGE_SQL}) AS volume
       FROM (${dedupedRowsSql}) AS csv_deduped
      ORDER BY ts_ms`,
    [input.instrumentId] as never[]
  );
  const rawRowsChanged = (insertResult as { rowsChanged?: unknown }).rowsChanged;
  let importedRows = rawRowsChanged !== undefined && rawRowsChanged !== null
    ? toSafeInt(rawRowsChanged)
    : 0;
  if (rawRowsChanged === undefined || rawRowsChanged === null) {
    const countResult = await connection.run(
      `SELECT COUNT(*) AS count
         FROM market_bars
        WHERE instrument_id = ?`,
      [input.instrumentId] as never[]
    );
    const countRows = await countResult.getRowObjectsJS();
    importedRows = toSafeInt((countRows[0] as { count?: unknown } | undefined)?.count ?? 0);
  }
  await invalidateMarketTimelineWithConnection(connection, [input.instrumentId]);
  await refreshMarketBarChunkAnchorsWithConnection(connection, [input.instrumentId]);
  await upsertInstrumentCountWithConnection(
    connection,
    input.instrumentId,
    input.symbol,
    importedRows
  );
  return importedRows;
};

const runMarketWriteTransaction = async <T>(
  connection: DuckDBConnection,
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  throwIfMarketWriteAborted(signal);
  let transactionStarted = false;
  let transactionCommitted = false;
  const interrupt = (): void => {
    try {
      connection.interrupt();
    } catch {
      // Rollback and connection cleanup below still run before the caller settles.
    }
  };
  signal?.addEventListener('abort', interrupt, { once: true });
  try {
    await connection.run('BEGIN TRANSACTION');
    transactionStarted = true;
    throwIfMarketWriteAborted(signal);
    const result = await task();
    throwIfMarketWriteAborted(signal);
    await connection.run('COMMIT');
    transactionCommitted = true;
    return result;
  } catch (error) {
    signal?.removeEventListener('abort', interrupt);
    if (transactionStarted && !transactionCommitted) {
      await connection.run('ROLLBACK').catch(() => undefined);
    }
    if (signal?.aborted) {
      throw marketWriteAbortReason(signal);
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', interrupt);
  }
};


const refreshInstrumentQuestionMetaBatchInternal = async (instrumentIds: string[]): Promise<void> => {
  const metaByInstrumentId = await queryInstrumentRangeMetaByIds({
    instrumentIds,
    chunkSize: SYMBOL_QUERY_CHUNK_SIZE,
    queryRows,
    toSafeInt,
    toIsoFromEpochMs,
    formatVersionClose
  });
  applyInstrumentRangeMetaBatch(instrumentIds, metaByInstrumentId);
};

export const refreshInstrumentQuestionMetaBatch = async (instrumentIds: string[]): Promise<void> => {
  await refreshInstrumentQuestionMetaBatchInternal(instrumentIds);
};

const refreshInstrumentQuestionMetaInternal = async (instrumentId: string): Promise<void> => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return;
  }
  await refreshInstrumentQuestionMetaBatchInternal([normalizedInstrumentId]);
};

const appendBarsToStage = async (
  instrumentId: string,
  bars: OhlcvBar[],
  options?: {
    clearBeforeAppend?: boolean;
  }
): Promise<void> => {
  const { connection } = await getMarketDbContext();
  if (options?.clearBeforeAppend ?? true) {
    await execute('DELETE FROM market_bars_stage');
  }
  const appender = await connection.createAppender('market_bars_stage');
  try {
    bars.forEach((bar) => {
      const tsMs = toEpochMs(bar.ts);
      if (tsMs === null) {
        return;
      }
      appender.appendVarchar(instrumentId);
      appender.appendBigInt(BigInt(tsMs));
      appender.appendDouble(bar.open);
      appender.appendDouble(bar.high);
      appender.appendDouble(bar.low);
      appender.appendDouble(bar.close);
      appender.appendDouble(bar.volume);
      appender.endRow();
    });
    appender.flushSync();
  } finally {
    appender.closeSync();
  }
};

export const replaceMarketBarsForInstrumentFromCsvFile = async (
  instrumentId: string,
  symbol: string,
  filePath: string,
  mapping: CsvImportColumnMapping,
  timezone = DEFAULT_MARKET_CSV_DATETIME_TIMEZONE,
  inputFormat: TabularImportFileFormat = 'csv',
): Promise<{
  importedRows: number;
  skippedRows: number;
  invalidRequiredRowsSkipped: number;
  invalidOhlcRowsSkipped: number;
  duplicateConflictRowsSkipped: number;
  duplicateIdenticalRowsDeduped: number;
}> => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const rawFilePath = preserveNonWhitespacePath(filePath);
  if (!normalizedInstrumentId || !normalizedSymbol || !rawFilePath) {
    return {
      importedRows: 0,
      skippedRows: 0,
      invalidRequiredRowsSkipped: 0,
      invalidOhlcRowsSkipped: 0,
      duplicateConflictRowsSkipped: 0,
      duplicateIdenticalRowsDeduped: 0
    };
  }
  const normalizedFilePath = path.resolve(rawFilePath);

  const normalizedMapping: CsvImportColumnMapping = {
    timestampMode: normalizeCsvTimestampMode(mapping.timestampMode),
    date: normalizeCsvColumnName(mapping.date),
    time: normalizeCsvColumnName(mapping.time),
    open: normalizeCsvColumnName(mapping.open),
    high: normalizeCsvColumnName(mapping.high),
    low: normalizeCsvColumnName(mapping.low),
    close: normalizeCsvColumnName(mapping.close),
    volume: normalizeCsvColumnName(mapping.volume)
  };
  if (
    !normalizedMapping.date ||
    (normalizedMapping.timestampMode === 'SPLIT' && !normalizedMapping.time) ||
    !normalizedMapping.open ||
    !normalizedMapping.high ||
    !normalizedMapping.low ||
    !normalizedMapping.close
  ) {
    return {
      importedRows: 0,
      skippedRows: 0,
      invalidRequiredRowsSkipped: 0,
      invalidOhlcRowsSkipped: 0,
      duplicateConflictRowsSkipped: 0,
      duplicateIdenticalRowsDeduped: 0
    };
  }

  let importedRows = 0;
  let qualitySummary: CsvImportQualitySummary = {
    validRows: 0,
    invalidRequiredRowsSkipped: 0,
    invalidOhlcRowsSkipped: 0,
    duplicateConflictGroups: 0,
    duplicateConflictRowsSkipped: 0,
    duplicateIdenticalRowsDeduped: 0,
    skippedRows: 0
  };
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    await connection.run('BEGIN TRANSACTION');
    try {
      await createCsvImportFileStageWithConnection(connection, {
        filePath: normalizedFilePath,
        inputFormat,
        mapping: normalizedMapping,
        timezone,
      });
      qualitySummary = await collectCsvImportQualityWithConnection(connection);
      if (qualitySummary.validRows <= 0) {
        await connection.run('COMMIT');
        return;
      }
      await connection.run(
        `DELETE FROM market_bars
          WHERE instrument_id = ?`,
        [normalizedInstrumentId] as never[]
      );
      const insertResult = await connection.run(
        `INSERT INTO market_bars (instrument_id, raw_index, ts_ms, open, high, low, close, volume)
         SELECT
           ? AS instrument_id,
           ROW_NUMBER() OVER (ORDER BY ts_ms ASC) - 1 AS raw_index,
           ts_ms,
           CAST(open AS ${MARKET_PRICE_STORAGE_SQL}) AS open,
           CAST(high AS ${MARKET_PRICE_STORAGE_SQL}) AS high,
           CAST(low AS ${MARKET_PRICE_STORAGE_SQL}) AS low,
           CAST(close AS ${MARKET_PRICE_STORAGE_SQL}) AS close,
           CAST(volume AS ${MARKET_VOLUME_STORAGE_SQL}) AS volume
           FROM (${buildCsvDedupedRowsFromClassifiedRowsSql(MARKET_CSV_IMPORT_FILE_STAGE_TABLE)}) AS csv_deduped
          ORDER BY ts_ms`,
        [normalizedInstrumentId] as never[]
      );
      const rawRowsChanged = (insertResult as { rowsChanged?: unknown }).rowsChanged;
      if (rawRowsChanged !== undefined && rawRowsChanged !== null) {
        importedRows = toSafeInt(rawRowsChanged);
      } else {
        const countResult = await connection.run(
          `SELECT COUNT(*) AS count
             FROM market_bars
            WHERE instrument_id = ?`,
          [normalizedInstrumentId] as never[]
        );
        const countRows = await countResult.getRowObjectsJS();
        importedRows = toSafeInt((countRows[0] as { count?: unknown } | undefined)?.count ?? 0);
      }
      await invalidateMarketTimelineWithConnection(connection, [normalizedInstrumentId]);
      await refreshMarketBarChunkAnchorsWithConnection(connection, [normalizedInstrumentId]);
      await upsertInstrumentCountWithConnection(
        connection,
        normalizedInstrumentId,
        normalizedSymbol,
        importedRows
      );
      await connection.run('COMMIT');
      await checkpointAfterLargeMarketWrite(connection, importedRows);
    } catch (error) {
      await connection.run('ROLLBACK');
      throw error;
    } finally {
      await connection.run(`DROP TABLE IF EXISTS ${MARKET_CSV_IMPORT_FILE_STAGE_TABLE}`).catch(() => undefined);
    }
  });
  if (qualitySummary.validRows <= 0) {
    return {
      importedRows: 0,
      skippedRows: qualitySummary.skippedRows,
      invalidRequiredRowsSkipped: qualitySummary.invalidRequiredRowsSkipped,
      invalidOhlcRowsSkipped: qualitySummary.invalidOhlcRowsSkipped,
      duplicateConflictRowsSkipped: qualitySummary.duplicateConflictRowsSkipped,
      duplicateIdenticalRowsDeduped: qualitySummary.duplicateIdenticalRowsDeduped
    };
  }
  await refreshInstrumentQuestionMetaInternal(normalizedInstrumentId);
  invalidateMarketReadCaches(normalizedInstrumentId);
  await prewarmHotMarketTimelinesForInstruments([normalizedInstrumentId]);
  return {
    importedRows,
    skippedRows: qualitySummary.skippedRows,
    invalidRequiredRowsSkipped: qualitySummary.invalidRequiredRowsSkipped,
    invalidOhlcRowsSkipped: qualitySummary.invalidOhlcRowsSkipped,
    duplicateConflictRowsSkipped: qualitySummary.duplicateConflictRowsSkipped,
    duplicateIdenticalRowsDeduped: qualitySummary.duplicateIdenticalRowsDeduped
  };
};

export const replaceMarketBarsForInstrumentsFromCsvFilesBatch = async (
  inputs: CsvBatchImportInput[],
  options: MarketWriteOptions = {},
): Promise<CsvBatchImportResult[]> => {
  const signal = options.signal;
  throwIfMarketWriteAborted(signal);
  const normalizedInputs = inputs
    .map((input) => {
      const normalizedInstrumentId = String(input.instrumentId ?? '').trim();
      const normalizedSymbol = String(input.symbol ?? '').trim().toUpperCase();
      const rawFilePath = preserveNonWhitespacePath(input.filePath);
      if (!normalizedInstrumentId || !normalizedSymbol || !rawFilePath) {
        return null;
      }
      const normalizedFilePath = path.resolve(rawFilePath);
      const mapping: CsvImportColumnMapping = {
        timestampMode: normalizeCsvTimestampMode(input.mapping?.timestampMode ?? 'SINGLE'),
        date: normalizeCsvColumnName(input.mapping?.date ?? ''),
        time: normalizeCsvColumnName(input.mapping?.time ?? ''),
        open: normalizeCsvColumnName(input.mapping?.open ?? ''),
        high: normalizeCsvColumnName(input.mapping?.high ?? ''),
        low: normalizeCsvColumnName(input.mapping?.low ?? ''),
        close: normalizeCsvColumnName(input.mapping?.close ?? ''),
        volume: normalizeCsvColumnName(input.mapping?.volume ?? '')
      };
      if (
        !mapping.date ||
        (mapping.timestampMode === 'SPLIT' && !mapping.time) ||
        !mapping.open ||
        !mapping.high ||
        !mapping.low ||
        !mapping.close
      ) {
        return null;
      }
      return {
        instrumentId: normalizedInstrumentId,
        symbol: normalizedSymbol,
        filePath: normalizedFilePath,
        inputFormat:
          input.inputFormat === 'json' || input.inputFormat === 'parquet'
            ? input.inputFormat
            : 'csv',
        mapping,
        timezone: normalizeCsvTimezone(input.timezone ?? DEFAULT_MARKET_CSV_DATETIME_TIMEZONE)
      };
    })
    .filter(
      (
        item
      ): item is NormalizedCsvBatchImportInput => Boolean(item)
    );
  if (!normalizedInputs.length) {
    return [];
  }

  const countByInstrumentId = new Map<string, number>();
  const qualityByInstrumentId = new Map<string, CsvImportQualitySummary>();
  const successfulInstrumentIds = new Set<string>();
  const uniqueInstrumentIds = Array.from(new Set(normalizedInputs.map((item) => item.instrumentId)));
  const symbolByInstrumentId = new Map<string, string>();
  normalizedInputs.forEach((item) => {
    if (!symbolByInstrumentId.has(item.instrumentId)) {
      symbolByInstrumentId.set(item.instrumentId, item.symbol);
    }
  });

  uniqueInstrumentIds.forEach((instrumentId) => {
    countByInstrumentId.set(instrumentId, 0);
  });

  const importSingleInput = async (input: NormalizedCsvBatchImportInput): Promise<void> => {
    throwIfMarketWriteAborted(signal);
    await withMarketDbLock(async () => {
      const { connection } = await getMarketDbContext();
      try {
        await runMarketWriteTransaction(connection, async () => {
          await createCsvImportFileStageWithConnection(connection, {
            filePath: input.filePath,
            inputFormat: input.inputFormat,
            mapping: input.mapping,
            timezone: input.timezone,
          });
          const qualitySummary = await collectCsvImportQualityWithConnection(connection);
          qualityByInstrumentId.set(input.instrumentId, qualitySummary);
          if (qualitySummary.validRows <= 0) {
            return;
          }
          const importedRows = await replaceInstrumentBarsFromDedupedRowsWithConnection(
            connection,
            input,
            buildCsvDedupedRowsFromClassifiedRowsSql(MARKET_CSV_IMPORT_FILE_STAGE_TABLE)
          );
          countByInstrumentId.set(input.instrumentId, importedRows);
          successfulInstrumentIds.add(input.instrumentId);
        }, signal);
      } finally {
        await connection.run(`DROP TABLE IF EXISTS ${MARKET_CSV_IMPORT_FILE_STAGE_TABLE}`).catch(() => undefined);
      }
    }, { signal });
  };

  const buildCsvGroupKey = (input: NormalizedCsvBatchImportInput): string => {
    if (input.inputFormat !== 'csv') {
      return '';
    }
    return JSON.stringify([
      input.timezone,
      input.mapping.timestampMode,
      input.mapping.date,
      input.mapping.time,
      input.mapping.open,
      input.mapping.high,
      input.mapping.low,
      input.mapping.close,
      input.mapping.volume,
    ]);
  };

  const groupedCsvInputs = new Map<string, NormalizedCsvBatchImportInput[]>();
  const isolatedInputs: NormalizedCsvBatchImportInput[] = [];
  normalizedInputs.forEach((input) => {
    const groupKey = buildCsvGroupKey(input);
    if (!groupKey) {
      isolatedInputs.push(input);
      return;
    }
    const group = groupedCsvInputs.get(groupKey) ?? [];
    group.push(input);
    groupedCsvInputs.set(groupKey, group);
  });

  const importCsvGroup = async (group: NormalizedCsvBatchImportInput[]): Promise<void> => {
    throwIfMarketWriteAborted(signal);
    const uniqueFilePaths = new Set(group.map((input) => input.filePath));
    if (group.length <= 1 || uniqueFilePaths.size !== group.length) {
      for (const input of group) {
        throwIfMarketWriteAborted(signal);
        // eslint-disable-next-line no-await-in-loop
        await importSingleInput(input);
      }
      return;
    }

    const { instance } = await getMarketDbContext();
    const connection = await instance.connect();
    const groupStageTable = 'market_csv_import_group_stage';
    const groupDedupedTable = 'market_csv_import_group_deduped_stage';
    try {
      await runInterruptibleMarketConnectionTask(connection, signal, async () => {
        const csvDialect = await detectCommonMarketCsvDialect(
          group.map((input) => input.filePath),
        );
        const sourceSql = buildTabularSourceSql(
          group.map((input) => input.filePath),
          'csv',
          { includeFilename: true, csvDialect }
        );
        await assertNoMixedSymbolsInTabularSource(connection, sourceSql, {
          sourceKeyColumn: 'filename',
        });
        await connection.run(`DROP TABLE IF EXISTS ${groupStageTable}`);
        await connection.run(
          `CREATE TEMP TABLE ${groupStageTable} AS
         ${buildCsvImportClassifiedRowsSql({
           sourceSql,
           mapping: group[0].mapping,
           timezone: group[0].timezone,
           sourceKeyExpr: buildNormalizedSourceKeySqlExpr('filename'),
         })}`
        );

        const sourceKeyRows = (await (
          await connection.run(
          `SELECT DISTINCT import_source_key AS source_key
             FROM ${groupStageTable}`
          )
        ).getRowObjectsJS()) as Array<{ source_key?: unknown }>;
        const expectedSourceKeys = new Set(
          group.map((input) => normalizeSourceKeyPath(input.filePath)),
        );
        const unknownSourceKey = sourceKeyRows
          .map((row) => normalizeSourceKeyPath(row.source_key))
          .find((sourceKey) => sourceKey && !expectedSourceKeys.has(sourceKey));
        if (unknownSourceKey) {
          throw new Error('CSV_IMPORT_SOURCE_FILENAME_MISMATCH');
        }

        const groupQualityByFilePath = await collectCsvImportQualityBySourceKeyWithConnection(
          connection,
          groupStageTable,
          'import_source_key'
        );
        group.forEach((input) => {
          qualityByInstrumentId.set(
            input.instrumentId,
            groupQualityByFilePath.get(normalizeSourceKeyPath(input.filePath)) ?? {
            validRows: 0,
            invalidRequiredRowsSkipped: 0,
            invalidOhlcRowsSkipped: 0,
            duplicateConflictGroups: 0,
            duplicateConflictRowsSkipped: 0,
            duplicateIdenticalRowsDeduped: 0,
            skippedRows: 0,
            }
          );
        });

        await connection.run(`DROP TABLE IF EXISTS ${groupDedupedTable}`);
        await connection.run(
          `CREATE TEMP TABLE ${groupDedupedTable} AS
         SELECT import_source_key, ts_ms, open, high, low, close, volume
           FROM (${buildCsvDedupedRowsFromClassifiedRowsSql(groupStageTable, {
             sourceKeyColumn: 'import_source_key',
           })}) AS csv_deduped`
        );
      });

      for (const input of group) {
        throwIfMarketWriteAborted(signal);
        const qualitySummary = qualityByInstrumentId.get(input.instrumentId);
        if (!qualitySummary || qualitySummary.validRows <= 0) {
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await withMarketDbLock(async () => {
          await runMarketWriteTransaction(connection, async () => {
            const importedRows = await replaceInstrumentBarsFromDedupedRowsWithConnection(
              connection,
              input,
              `SELECT ts_ms, open, high, low, close, volume
                 FROM ${groupDedupedTable}
                WHERE import_source_key = ${quoteDuckLiteral(normalizeSourceKeyPath(input.filePath))}`
            );
            countByInstrumentId.set(input.instrumentId, importedRows);
            successfulInstrumentIds.add(input.instrumentId);
          }, signal);
        }, { signal });
      }
    } finally {
      await connection.run(`DROP TABLE IF EXISTS ${groupDedupedTable}`).catch(() => undefined);
      await connection.run(`DROP TABLE IF EXISTS ${groupStageTable}`).catch(() => undefined);
      closeDuckDbConnectionSafely(connection);
    }
  };

  for (const group of groupedCsvInputs.values()) {
    throwIfMarketWriteAborted(signal);
    // eslint-disable-next-line no-await-in-loop
    await importCsvGroup(group);
  }
  for (const input of isolatedInputs) {
    throwIfMarketWriteAborted(signal);
    // eslint-disable-next-line no-await-in-loop
    await importSingleInput(input);
  }

  for (const input of normalizedInputs.filter((item) => successfulInstrumentIds.has(item.instrumentId))) {
    invalidateMarketReadCaches(input.instrumentId);
  }
  throwIfMarketWriteAborted(signal);

  return normalizedInputs.map((input) => {
    const qualitySummary = qualityByInstrumentId.get(input.instrumentId);
    return {
      instrumentId: input.instrumentId,
      symbol: input.symbol,
      filePath: input.filePath,
      importedRows: countByInstrumentId.get(input.instrumentId) ?? 0,
      skippedRows: qualitySummary?.skippedRows ?? 0,
      invalidRequiredRowsSkipped: qualitySummary?.invalidRequiredRowsSkipped ?? 0,
      invalidOhlcRowsSkipped: qualitySummary?.invalidOhlcRowsSkipped ?? 0,
      duplicateConflictRowsSkipped: qualitySummary?.duplicateConflictRowsSkipped ?? 0,
      duplicateIdenticalRowsDeduped: qualitySummary?.duplicateIdenticalRowsDeduped ?? 0
    };
  });
};

export const replaceMarketBarsForInstrument = async (
  instrumentId: string,
  symbol: string,
  bars: OhlcvBar[],
  options: { prewarmHotTimelines?: boolean } = {},
): Promise<void> => {
  if (!instrumentId || !symbol) {
    return;
  }
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    await connection.run('BEGIN TRANSACTION');
    try {
      await execute(
        `DELETE FROM market_bars
         WHERE instrument_id = ?`,
        [instrumentId]
      );
      if (bars.length) {
        await appendBarsToStage(instrumentId, bars);
        await execute(
          `INSERT INTO market_bars (instrument_id, raw_index, ts_ms, open, high, low, close, volume)
           SELECT instrument_id,
                  ROW_NUMBER() OVER (PARTITION BY instrument_id ORDER BY ts_ms ASC) - 1 AS raw_index,
                  ts_ms,
                  CAST(ANY_VALUE(open) AS ${MARKET_PRICE_STORAGE_SQL}) AS open,
                  CAST(ANY_VALUE(high) AS ${MARKET_PRICE_STORAGE_SQL}) AS high,
                  CAST(ANY_VALUE(low) AS ${MARKET_PRICE_STORAGE_SQL}) AS low,
                  CAST(ANY_VALUE(close) AS ${MARKET_PRICE_STORAGE_SQL}) AS close,
                  CAST(ANY_VALUE(volume) AS ${MARKET_VOLUME_STORAGE_SQL}) AS volume
             FROM market_bars_stage
            WHERE instrument_id = ?
            GROUP BY instrument_id, ts_ms
            ORDER BY instrument_id ASC, raw_index ASC`,
          [instrumentId]
        );
        await execute(
          `DELETE FROM market_bars_stage
           WHERE instrument_id = ?`,
          [instrumentId]
        );
      }
      await invalidateMarketTimelineWithConnection(connection, [instrumentId]);
      await refreshMarketBarChunkAnchorsWithConnection(connection, [instrumentId]);
      const countResult = await connection.run(
        `SELECT COUNT(*) AS count
           FROM market_bars
          WHERE instrument_id = ?`,
        [instrumentId] as never[],
      );
      const countRows = await countResult.getRowObjectsJS();
      await upsertInstrumentCountWithConnection(
        connection,
        instrumentId,
        symbol,
        toSafeInt((countRows[0] as { count?: unknown } | undefined)?.count ?? 0),
      );
      await connection.run('COMMIT');
      await checkpointAfterLargeMarketWrite(connection, bars.length);
    } catch (error) {
      await connection.run('ROLLBACK');
      throw error;
    }
  });
  await refreshInstrumentQuestionMetaInternal(instrumentId);
  invalidateMarketReadCaches(instrumentId);
  if (options.prewarmHotTimelines ?? true) {
    await prewarmHotMarketTimelinesForInstruments([instrumentId]);
  }
};

export const replaceMarketBarsForInstrumentBatched = async ({
  instrumentId,
  symbol,
  loadBatch,
  batchSize = 5_000,
}: {
  instrumentId: string;
  symbol: string;
  loadBatch: (offset: number, limit: number) => Promise<OhlcvBar[]>;
  batchSize?: number;
}): Promise<void> => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedBatchSize = Math.max(1, Math.min(50_000, Math.floor(Number(batchSize) || 0)));
  if (!normalizedInstrumentId || !normalizedSymbol) {
    return;
  }
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    await connection.run('BEGIN TRANSACTION');
    try {
      await execute(
        `DELETE FROM market_bars
         WHERE instrument_id = ?`,
        [normalizedInstrumentId],
      );
      await execute('DELETE FROM market_bars_stage');
      let offset = 0;
      while (true) {
        const bars = await loadBatch(offset, normalizedBatchSize);
        if (!Array.isArray(bars) || bars.length <= 0) {
          break;
        }
        await appendBarsToStage(normalizedInstrumentId, bars, {
          clearBeforeAppend: false,
        });
        offset += bars.length;
        if (bars.length < normalizedBatchSize) {
          break;
        }
      }
      await execute(
        `INSERT INTO market_bars (instrument_id, raw_index, ts_ms, open, high, low, close, volume)
         SELECT instrument_id,
                ROW_NUMBER() OVER (PARTITION BY instrument_id ORDER BY ts_ms ASC) - 1 AS raw_index,
                ts_ms,
                CAST(ANY_VALUE(open) AS ${MARKET_PRICE_STORAGE_SQL}) AS open,
                CAST(ANY_VALUE(high) AS ${MARKET_PRICE_STORAGE_SQL}) AS high,
                CAST(ANY_VALUE(low) AS ${MARKET_PRICE_STORAGE_SQL}) AS low,
                CAST(ANY_VALUE(close) AS ${MARKET_PRICE_STORAGE_SQL}) AS close,
                CAST(ANY_VALUE(volume) AS ${MARKET_VOLUME_STORAGE_SQL}) AS volume
           FROM market_bars_stage
          WHERE instrument_id = ?
          GROUP BY instrument_id, ts_ms
          ORDER BY instrument_id ASC, raw_index ASC`,
        [normalizedInstrumentId],
      );
      await execute(
        `DELETE FROM market_bars_stage
         WHERE instrument_id = ?`,
        [normalizedInstrumentId],
      );
      await invalidateMarketTimelineWithConnection(connection, [normalizedInstrumentId]);
      await refreshMarketBarChunkAnchorsWithConnection(connection, [normalizedInstrumentId]);
      const countResult = await connection.run(
        `SELECT COUNT(*) AS count
           FROM market_bars
          WHERE instrument_id = ?`,
        [normalizedInstrumentId] as never[],
      );
      const countRows = await countResult.getRowObjectsJS();
      const insertedRows = toSafeInt((countRows[0] as { count?: unknown } | undefined)?.count ?? 0);
      await upsertInstrumentCountWithConnection(
        connection,
        normalizedInstrumentId,
        normalizedSymbol,
        insertedRows,
      );
      await connection.run('COMMIT');
      await checkpointAfterLargeMarketWrite(connection, insertedRows);
    } catch (error) {
      await connection.run('ROLLBACK');
      throw error;
    }
  });
  await refreshInstrumentQuestionMetaInternal(normalizedInstrumentId);
  invalidateMarketReadCaches(normalizedInstrumentId);
  await prewarmHotMarketTimelinesForInstruments([normalizedInstrumentId]);
};

export type CsvEdgeAppendBatchInput = CsvEdgeAppendInput;
export type CsvEdgeAppendBatchResult = CsvEdgeAppendResult;

export const appendEdgeBarsForInstrumentsFromCsvFilesBatch = async (
  inputs: CsvEdgeAppendBatchInput[],
  options: MarketWriteOptions = {},
): Promise<CsvEdgeAppendBatchResult[]> => {
  const signal = options.signal;
  throwIfMarketWriteAborted(signal);
  const normalizedInputs = Array.isArray(inputs) ? inputs : [];
  if (!normalizedInputs.length) {
    return [];
  }
  const results: CsvEdgeAppendBatchResult[] = [];
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    try {
      await runMarketWriteTransaction(connection, async () => {
        const batchResults = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
          normalizedInputs,
          {
            connection,
            sampleSize: MARKET_CSV_IMPORT_SAMPLE_SIZE,
            toSafeInt,
            signal,
          }
        );
        results.push(...batchResults);
        const changedInstrumentIds = Array.from(
          new Set(
            batchResults
              .filter((item) => toSafeInt(item.importedRows ?? 0) > 0)
              .map((item) => String(item.instrumentId ?? '').trim())
              .filter((item) => Boolean(item))
          )
        );
        const reindexInstrumentIds = Array.from(
          new Set(
            batchResults
              .filter(
                (item) =>
                  toSafeInt(item.importedRows ?? 0) > 0 &&
                  toSafeInt(item.prependedRows ?? 0) > 0
              )
              .map((item) => String(item.instrumentId ?? '').trim())
              .filter((item) => Boolean(item))
          )
        );
        await reindexMarketBarsWithConnection(connection, reindexInstrumentIds);
        await invalidateMarketTimelineWithConnection(connection, changedInstrumentIds);
        await refreshMarketBarChunkAnchorsWithConnection(connection, changedInstrumentIds);
      }, signal);
      await runInterruptibleMarketConnectionTask(connection, signal, () =>
        checkpointAfterLargeMarketWrite(
          connection,
          results.reduce((total, item) => total + toSafeInt(item.importedRows ?? 0), 0),
        )
      );
    } finally {
      await connection.run('DROP TABLE IF EXISTS market_bars_incremental_stage').catch(() => undefined);
      await connection.run('DROP TABLE IF EXISTS market_bars_incremental_file_stage').catch(() => undefined);
    }
  }, { signal });
  throwIfMarketWriteAborted(signal);
  const uniqueByInstrumentId = new Map<string, string>();
  results.forEach((item) => {
    const instrumentId = String(item.instrumentId ?? '').trim();
    const symbol = String(item.symbol ?? '').trim().toUpperCase();
    if (!instrumentId || uniqueByInstrumentId.has(instrumentId)) {
      return;
    }
    uniqueByInstrumentId.set(instrumentId, symbol);
  });
  await refreshInstrumentCountsBatchInternal(uniqueByInstrumentId);
  throwIfMarketWriteAborted(signal);
  for (const instrumentId of uniqueByInstrumentId.keys()) {
    invalidateMarketReadCaches(instrumentId);
  }
  const changedInstrumentIds = Array.from(
    new Set(
      results
        .filter((item) => toSafeInt(item.importedRows ?? 0) > 0)
        .map((item) => String(item.instrumentId ?? '').trim())
        .filter((item) => Boolean(item))
    )
  );
  if (changedInstrumentIds.length > 0) {
    await refreshInstrumentQuestionMetaBatchInternal(changedInstrumentIds);
    await prewarmHotMarketTimelinesForInstruments(changedInstrumentIds);
  }
  return results;
};

export const appendEdgeBarsForInstrumentFromCsvFile = async (
  instrumentId: string,
  symbol: string,
  filePath: string,
  mapping: CsvImportColumnMapping,
  timezone = DEFAULT_MARKET_CSV_DATETIME_TIMEZONE,
  inputFormat: TabularImportFileFormat = 'csv'
): Promise<CsvEdgeAppendBatchResult> => {
  const [result] = await appendEdgeBarsForInstrumentsFromCsvFilesBatch([
    { instrumentId, symbol, filePath, mapping, timezone, inputFormat }
  ]);
  return (
    result ?? {
      instrumentId: String(instrumentId ?? '').trim(),
      symbol: String(symbol ?? '').trim().toUpperCase(),
      filePath: preserveNonWhitespacePath(filePath),
      validRows: 0,
      importedRows: 0,
      prependedRows: 0,
      appendedRows: 0,
      overlapRowsIgnored: 0,
      internalRangeRowsIgnored: 0,
      conflictRowsIgnored: 0,
      skippedRows: 0,
      invalidRequiredRowsSkipped: 0,
      invalidOhlcRowsSkipped: 0,
      duplicateConflictRowsSkipped: 0,
      duplicateIdenticalRowsDeduped: 0
    }
  );
};

export const removeMarketInstrumentData = async (instrumentId: string): Promise<void> => {
  if (!instrumentId) {
    return;
  }
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    await connection.run(
      `DELETE FROM market_bars WHERE instrument_id = ?`,
      [instrumentId] as never[]
    );
    await connection.run(
      `DELETE FROM market_instruments WHERE instrument_id = ?`,
      [instrumentId] as never[]
    );
    await connection.run(
      `DELETE FROM market_bar_chunk_anchors WHERE instrument_id = ?`,
      [instrumentId] as never[]
    );
    await invalidateMarketTimelineWithConnection(connection, [instrumentId]);
    updateInstrumentQuestionMeta(instrumentId, null);
  });
  invalidateMarketReadCaches(instrumentId);
};
