// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import type { DuckDBConnection } from '@duckdb/node-api';
import { nowIso } from '../../../kernel/time.js';
import { setCachedMarketBarCount } from '../marketReadCache.js';
import { buildCsvImportClassifiedRowsSql, buildCsvImportValidationSummaryFromClassifiedRowsSql, quoteDuckLiteral } from '../marketCsvImportSql.js';
import { MARKET_CSV_IMPORT_FILE_STAGE_TABLE, MARKET_CSV_IMPORT_SAMPLE_SIZE, SYMBOL_QUERY_CHUNK_SIZE } from './constants.js';
import { getMarketDbContext } from './connection.js';
import type { CsvImportColumnMapping, TabularImportFileFormat } from './types.js';
import { toSafeInt } from './utils.js';
import { buildMarketCsvReadOptionsSql, detectMarketCsvDialect, type MarketCsvDialect } from '../marketCsvDialect.js';
import { assertNoMixedSymbolsInTabularSource } from '../marketCsvSymbolGuard.js';

export const preserveNonWhitespacePath = (value: unknown): string => {
  const raw = String(value ?? '');
  return raw.trim() ? raw : '';
};

// DuckDB canonicalizes file paths in the `filename` column (forward slashes,
// case preserved by the engine). Compare both sides through the same
// normalization: absolute resolve, separator folding, and case folding on
// case-insensitive filesystems so exact-set matching cannot fail from
// Windows separators or drive-letter casing.
export const normalizeSourceKeyPath = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  const resolved = path.resolve(raw);
  const separatorFolded =
    process.platform === 'win32'
      ? resolved.replace(/\\/gu, '/')
      : resolved;
  return process.platform === 'win32'
    ? separatorFolded.toLowerCase()
    : separatorFolded;
};

const buildDuckFilePathSql = (filePaths: string | string[]): string => {
  const normalizedPaths = Array.isArray(filePaths) ? filePaths : [filePaths];
  if (normalizedPaths.length === 1) {
    return quoteDuckLiteral(normalizedPaths[0] ?? '');
  }
  return `[${normalizedPaths.map((filePath) => quoteDuckLiteral(filePath)).join(', ')}]`;
};

const MARKET_WRITE_CHECKPOINT_MIN_ROWS = 100_000;

export const checkpointAfterLargeMarketWrite = async (
  connection: DuckDBConnection,
  rowCount: unknown,
): Promise<void> => {
  if (toSafeInt(rowCount) < MARKET_WRITE_CHECKPOINT_MIN_ROWS) {
    return;
  }
  await connection.run('CHECKPOINT').catch(() => undefined);
};

export const buildTabularSourceSql = (
  filePath: string | string[],
  inputFormat: TabularImportFileFormat,
  options: { includeFilename?: boolean; csvDialect?: MarketCsvDialect } = {},
): string => {
  const pathSql = buildDuckFilePathSql(filePath);
  if (inputFormat === 'parquet') {
    return `read_parquet(${pathSql})`;
  }
  if (inputFormat === 'json') {
    return `read_json_auto(${pathSql}, ignore_errors = false)`;
  }
  const filenameOption = options.includeFilename ? ',\n    filename = true' : '';
  const dialect = options.csvDialect ?? { delimiter: ',', encoding: 'utf-8' };
  return `read_csv_auto(
    ${pathSql},
    sample_size = ${String(MARKET_CSV_IMPORT_SAMPLE_SIZE)},
    ${buildMarketCsvReadOptionsSql(dialect)}${filenameOption}
  )`;
};

export type NormalizedCsvBatchImportInput = {
  instrumentId: string;
  symbol: string;
  filePath: string;
  inputFormat: TabularImportFileFormat;
  mapping: CsvImportColumnMapping;
  timezone: string;
};

type CsvImportValidationSummary = {
  required_invalid_rows?: unknown;
  ohlc_invalid_rows?: unknown;
  duplicate_conflict_groups?: unknown;
  duplicate_conflict_rows?: unknown;
  duplicate_identical_rows_deduped?: unknown;
  valid_rows?: unknown;
};

export type CsvImportQualitySummary = {
  validRows: number;
  invalidRequiredRowsSkipped: number;
  invalidOhlcRowsSkipped: number;
  duplicateConflictGroups: number;
  duplicateConflictRowsSkipped: number;
  duplicateIdenticalRowsDeduped: number;
  skippedRows: number;
};

export type MarketWriteOptions = {
  signal?: AbortSignal;
};

export const marketWriteAbortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new Error('MARKET_WRITE_ABORTED');

export const throwIfMarketWriteAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw marketWriteAbortReason(signal);
  }
};

export const runInterruptibleMarketConnectionTask = async <T>(
  connection: DuckDBConnection,
  signal: AbortSignal | undefined,
  task: () => Promise<T>,
): Promise<T> => {
  throwIfMarketWriteAborted(signal);
  const interrupt = (): void => {
    try {
      connection.interrupt();
    } catch {
      // The connection is closed by the caller after the interrupted query drains.
    }
  };
  signal?.addEventListener('abort', interrupt, { once: true });
  try {
    throwIfMarketWriteAborted(signal);
    const result = await task();
    throwIfMarketWriteAborted(signal);
    return result;
  } catch (error) {
    if (signal?.aborted) {
      throw marketWriteAbortReason(signal);
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', interrupt);
  }
};

export const toCsvImportQualitySummary = (summary: CsvImportValidationSummary): CsvImportQualitySummary => {
  const invalidRequiredRowsSkipped = toSafeInt(summary.required_invalid_rows ?? 0);
  const invalidOhlcRowsSkipped = toSafeInt(summary.ohlc_invalid_rows ?? 0);
  const duplicateConflictGroups = toSafeInt(summary.duplicate_conflict_groups ?? 0);
  const duplicateConflictRowsSkipped = toSafeInt(summary.duplicate_conflict_rows ?? 0);
  const duplicateIdenticalRowsDeduped = toSafeInt(summary.duplicate_identical_rows_deduped ?? 0);
  return {
    validRows: toSafeInt(summary.valid_rows ?? 0),
    invalidRequiredRowsSkipped,
    invalidOhlcRowsSkipped,
    duplicateConflictGroups,
    duplicateConflictRowsSkipped,
    duplicateIdenticalRowsDeduped,
    skippedRows:
      invalidRequiredRowsSkipped +
      invalidOhlcRowsSkipped +
      duplicateConflictRowsSkipped +
      duplicateIdenticalRowsDeduped
  };
};

export const createCsvImportFileStageWithConnection = async (
  connection: DuckDBConnection,
  input: {
    filePath: string;
    inputFormat: TabularImportFileFormat;
    mapping: CsvImportColumnMapping;
    timezone: string;
  }
): Promise<void> => {
  const csvDialect = input.inputFormat === 'csv'
    ? await detectMarketCsvDialect(input.filePath)
    : undefined;
  const sourceSql = buildTabularSourceSql(input.filePath, input.inputFormat, { csvDialect });
  await assertNoMixedSymbolsInTabularSource(connection, sourceSql);
  await connection.run(`DROP TABLE IF EXISTS ${MARKET_CSV_IMPORT_FILE_STAGE_TABLE}`);
  await connection.run(
    `CREATE TEMP TABLE ${MARKET_CSV_IMPORT_FILE_STAGE_TABLE} AS
     ${buildCsvImportClassifiedRowsSql({
       sourceSql,
       mapping: input.mapping,
       timezone: input.timezone,
     })}`
  );
};

export const collectCsvImportQualityWithConnection = async (
  connection: DuckDBConnection
): Promise<CsvImportQualitySummary> => {
  const result = await connection.run(
    buildCsvImportValidationSummaryFromClassifiedRowsSql(MARKET_CSV_IMPORT_FILE_STAGE_TABLE)
  );
  const [summary = {}] = (await result.getRowObjectsJS()) as CsvImportValidationSummary[];
  return toCsvImportQualitySummary(summary);
};

export const collectCsvImportQualityBySourceKeyWithConnection = async (
  connection: DuckDBConnection,
  tableName: string,
  sourceKeyColumn: string
): Promise<Map<string, CsvImportQualitySummary>> => {
  const result = await connection.run(
    buildCsvImportValidationSummaryFromClassifiedRowsSql(tableName, {
      sourceKeyColumn,
    })
  );
  const rows = (await result.getRowObjectsJS()) as Array<
    CsvImportValidationSummary & { import_source_key?: unknown }
  >;
  const qualityBySourceKey = new Map<string, CsvImportQualitySummary>();
  rows.forEach((row) => {
    const sourceKey = String(row.import_source_key ?? '').trim();
    if (!sourceKey) {
      return;
    }
    qualityBySourceKey.set(sourceKey, toCsvImportQualitySummary(row));
  });
  return qualityBySourceKey;
};

export const refreshInstrumentCountsBatchInternal = async (
  instruments: ReadonlyMap<string, string>
): Promise<void> => {
  const normalizedEntries = Array.from(instruments.entries())
    .map(([instrumentId, symbol]) => [
      String(instrumentId ?? '').trim(),
      String(symbol ?? '').trim().toUpperCase(),
    ] as const)
    .filter(([instrumentId, symbol]) => Boolean(instrumentId && symbol));
  if (!normalizedEntries.length) {
    return;
  }
  const { connection } = await getMarketDbContext();
  for (let offset = 0; offset < normalizedEntries.length; offset += SYMBOL_QUERY_CHUNK_SIZE) {
    const chunk = normalizedEntries.slice(offset, offset + SYMBOL_QUERY_CHUNK_SIZE);
    const targetRowsSql = chunk.map(() => '(?, ?)').join(',');
    const targetValues = chunk.flatMap(([instrumentId, symbol]) => [instrumentId, symbol]);
    const countResult = await connection.run(
      `WITH target(instrument_id, symbol) AS (
         VALUES ${targetRowsSql}
       )
       SELECT target.instrument_id,
              target.symbol,
              COUNT(bars.ts_ms) AS count
         FROM target
         LEFT JOIN market_bars AS bars
           ON bars.instrument_id = target.instrument_id
        GROUP BY target.instrument_id, target.symbol
        ORDER BY target.instrument_id ASC`,
      targetValues as never[]
    );
    const countRows = (await countResult.getRowObjectsJS()) as Array<{
      instrument_id?: unknown;
      symbol?: unknown;
      count?: unknown;
    }>;
    if (!countRows.length) {
      continue;
    }
    const updatedAt = nowIso();
    const upsertRowsSql = countRows.map(() => '(?, ?, ?, ?)').join(',');
    const upsertValues = countRows.flatMap((row) => {
      const instrumentId = String(row.instrument_id ?? '').trim();
      const symbol = String(row.symbol ?? '').trim().toUpperCase();
      const count = toSafeInt(row.count ?? 0);
      return [instrumentId, symbol, count, updatedAt];
    });
    await connection.run(
      `INSERT INTO market_instruments (instrument_id, symbol, bar_count, updated_at)
       VALUES ${upsertRowsSql}
       ON CONFLICT(instrument_id) DO UPDATE SET
         symbol = EXCLUDED.symbol,
         bar_count = EXCLUDED.bar_count,
         updated_at = EXCLUDED.updated_at`,
      upsertValues as never[]
    );
    countRows.forEach((row) => {
      const instrumentId = String(row.instrument_id ?? '').trim();
      if (!instrumentId) {
        return;
      }
      setCachedMarketBarCount(instrumentId, toSafeInt(row.count ?? 0));
    });
  }
};
export const upsertInstrumentCountWithConnection = async (
  connection: DuckDBConnection,
  instrumentId: string,
  symbol: string,
  barCount: number
): Promise<void> => {
  if (!instrumentId || !symbol) {
    return;
  }
  const normalizedInstrumentId = String(instrumentId).trim();
  if (!normalizedInstrumentId) {
    return;
  }
  const resolvedCount = Math.max(0, Math.floor(Number(barCount) || 0));
  await connection.run(
    `INSERT INTO market_instruments (instrument_id, symbol, bar_count, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(instrument_id) DO UPDATE SET
       symbol = EXCLUDED.symbol,
       bar_count = EXCLUDED.bar_count,
       updated_at = EXCLUDED.updated_at`,
    [normalizedInstrumentId, symbol, resolvedCount, nowIso()] as never[]
  );
  setCachedMarketBarCount(normalizedInstrumentId, resolvedCount);
};
