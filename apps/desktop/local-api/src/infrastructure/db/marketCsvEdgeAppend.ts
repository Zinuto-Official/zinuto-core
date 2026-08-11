// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import type { DuckDBConnection } from '@duckdb/node-api';
import {
  DEFAULT_MARKET_CSV_DATETIME_TIMEZONE,
  buildCsvDedupedRowsFromClassifiedRowsSql,
  buildCsvImportClassifiedRowsSql,
  buildCsvImportValidationSummaryFromClassifiedRowsSql,
  normalizeCsvColumnName,
  normalizeCsvTimestampMode,
  normalizeCsvTimezone,
  quoteDuckLiteral,
} from './marketCsvImportSql.js';
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
} from './marketDatabase/ohlcvSql.js';
import {
  buildMarketCsvReadOptionsSql,
  detectMarketCsvDialect,
  type MarketCsvDialect,
} from './marketCsvDialect.js';
import { assertNoMixedSymbolsInTabularSource } from './marketCsvSymbolGuard.js';

type CsvImportColumnMappingLike = {
  timestampMode: 'SINGLE' | 'SPLIT';
  date: string;
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

type TabularImportFileFormat = 'csv' | 'json' | 'parquet';

export type CsvEdgeAppendInput = {
  instrumentId: string;
  symbol: string;
  filePath: string;
  mapping: CsvImportColumnMappingLike;
  inputFormat?: TabularImportFileFormat;
  timezone?: string;
};

export type CsvEdgeAppendResult = {
  instrumentId: string;
  symbol: string;
  filePath: string;
  validRows: number;
  importedRows: number;
  prependedRows: number;
  appendedRows: number;
  overlapRowsIgnored: number;
  internalRangeRowsIgnored: number;
  conflictRowsIgnored: number;
  skippedRows: number;
  invalidRequiredRowsSkipped: number;
  invalidOhlcRowsSkipped: number;
  duplicateConflictRowsSkipped: number;
  duplicateIdenticalRowsDeduped: number;
  errorMessage?: string;
};

const preserveNonWhitespacePath = (value: unknown): string => {
  const raw = String(value ?? '');
  return raw.trim() ? raw : '';
};

type AppendEdgeBatchDeps = {
  connection: DuckDBConnection;
  sampleSize: number;
  toSafeInt: (value: unknown) => number;
  signal?: AbortSignal;
};

const throwIfAppendAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('MARKET_WRITE_ABORTED');
  }
};

type NormalizedCsvEdgeAppendInput = {
  instrumentId: string;
  symbol: string;
  filePath: string;
  inputFormat: TabularImportFileFormat;
  mapping: CsvImportColumnMappingLike;
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

type CsvImportQualitySummary = {
  validRows: number;
  invalidRequiredRowsSkipped: number;
  invalidOhlcRowsSkipped: number;
  duplicateConflictGroups: number;
  duplicateConflictRowsSkipped: number;
  duplicateIdenticalRowsDeduped: number;
  skippedRows: number;
};

const STAGE_TABLE_NAME = 'market_bars_incremental_stage';
const FILE_STAGE_TABLE_NAME = 'market_bars_incremental_file_stage';

const buildTabularSourceSql = (
  filePath: string,
  inputFormat: TabularImportFileFormat,
  sampleSize: number,
  csvDialect?: MarketCsvDialect,
): string => {
  const pathLiteral = quoteDuckLiteral(filePath);
  if (inputFormat === 'parquet') {
    return `read_parquet(${pathLiteral})`;
  }
  if (inputFormat === 'json') {
    return `read_json_auto(${pathLiteral}, ignore_errors = false)`;
  }
  const dialect = csvDialect ?? { delimiter: ',', encoding: 'utf-8' };
  return `read_csv_auto(
    ${pathLiteral},
    sample_size = ${String(sampleSize)},
    ${buildMarketCsvReadOptionsSql(dialect)}
  )`;
};

const createStageTable = async (connection: DuckDBConnection): Promise<void> => {
  await connection.run(`DROP TABLE IF EXISTS ${STAGE_TABLE_NAME}`);
  await connection.run(`
    CREATE TEMP TABLE ${STAGE_TABLE_NAME} (
      instrument_id VARCHAR NOT NULL,
      ts_ms BIGINT NOT NULL,
      open ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      high ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      low ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      close ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      volume ${MARKET_VOLUME_STORAGE_SQL} NOT NULL
    )
  `);
};

const toCsvImportQualitySummary = (
  summary: CsvImportValidationSummary,
  deps: Pick<AppendEdgeBatchDeps, 'toSafeInt'>
): CsvImportQualitySummary => {
  const invalidRequiredRowsSkipped = deps.toSafeInt(summary.required_invalid_rows ?? 0);
  const invalidOhlcRowsSkipped = deps.toSafeInt(summary.ohlc_invalid_rows ?? 0);
  const duplicateConflictGroups = deps.toSafeInt(summary.duplicate_conflict_groups ?? 0);
  const duplicateConflictRowsSkipped = deps.toSafeInt(summary.duplicate_conflict_rows ?? 0);
  const duplicateIdenticalRowsDeduped = deps.toSafeInt(summary.duplicate_identical_rows_deduped ?? 0);
  return {
    validRows: deps.toSafeInt(summary.valid_rows ?? 0),
    invalidRequiredRowsSkipped,
    invalidOhlcRowsSkipped,
    duplicateConflictGroups,
    duplicateConflictRowsSkipped,
    duplicateIdenticalRowsDeduped,
    skippedRows:
      invalidRequiredRowsSkipped +
      invalidOhlcRowsSkipped +
      duplicateConflictRowsSkipped +
      duplicateIdenticalRowsDeduped,
  };
};

const createClassifiedFileStage = async (
  input: NormalizedCsvEdgeAppendInput,
  deps: AppendEdgeBatchDeps
): Promise<void> => {
  const csvDialect = input.inputFormat === 'csv'
    ? await detectMarketCsvDialect(input.filePath)
    : undefined;
  const sourceSql = buildTabularSourceSql(
    input.filePath,
    input.inputFormat,
    deps.sampleSize,
    csvDialect,
  );
  await assertNoMixedSymbolsInTabularSource(deps.connection, sourceSql);
  await deps.connection.run(`DROP TABLE IF EXISTS ${FILE_STAGE_TABLE_NAME}`);
  await deps.connection.run(
    `CREATE TEMP TABLE ${FILE_STAGE_TABLE_NAME} AS
     ${buildCsvImportClassifiedRowsSql({
       sourceSql,
       mapping: input.mapping,
       timezone: input.timezone,
     })}`
  );
};

const collectCsvImportQualityFromFileStage = async (
  deps: AppendEdgeBatchDeps,
): Promise<CsvImportQualitySummary> => {
  const result = await deps.connection.run(
    buildCsvImportValidationSummaryFromClassifiedRowsSql(FILE_STAGE_TABLE_NAME),
  );
  const [summary = {}] = (await result.getRowObjectsJS()) as CsvImportValidationSummary[];
  return toCsvImportQualitySummary(summary, deps);
};

export const appendEdgeBarsForInstrumentsFromCsvFilesBatchCore = async (
  inputs: CsvEdgeAppendInput[],
  deps: AppendEdgeBatchDeps
): Promise<CsvEdgeAppendResult[]> => {
  throwIfAppendAborted(deps.signal);
  const normalizedInputs = inputs
    .map((input) => {
      const instrumentId = String(input.instrumentId ?? '').trim();
      const symbol = String(input.symbol ?? '').trim().toUpperCase();
      const filePath = preserveNonWhitespacePath(input.filePath);
      const mapping = {
        timestampMode: normalizeCsvTimestampMode(input.mapping?.timestampMode ?? 'SINGLE'),
        date: normalizeCsvColumnName(input.mapping?.date ?? ''),
        time: normalizeCsvColumnName(input.mapping?.time ?? ''),
        open: normalizeCsvColumnName(input.mapping?.open ?? ''),
        high: normalizeCsvColumnName(input.mapping?.high ?? ''),
        low: normalizeCsvColumnName(input.mapping?.low ?? ''),
        close: normalizeCsvColumnName(input.mapping?.close ?? ''),
        volume: normalizeCsvColumnName(input.mapping?.volume ?? ''),
      } satisfies CsvImportColumnMappingLike;
      if (
        !instrumentId ||
        !symbol ||
        !filePath ||
        !mapping.date ||
        !mapping.open ||
        !mapping.high ||
        !mapping.low ||
        !mapping.close ||
        (mapping.timestampMode === 'SPLIT' && !mapping.time)
      ) {
        return null;
      }
      return {
        instrumentId,
        symbol,
        filePath: path.resolve(filePath),
        inputFormat:
          input.inputFormat === 'json' || input.inputFormat === 'parquet'
            ? input.inputFormat
            : 'csv',
        mapping,
        timezone: normalizeCsvTimezone(input.timezone ?? DEFAULT_MARKET_CSV_DATETIME_TIMEZONE),
      };
    })
    .filter(
      (
        item
      ): item is NormalizedCsvEdgeAppendInput => Boolean(item)
    );

  if (!normalizedInputs.length) {
    return [];
  }

  const qualityByInstrumentId = new Map<string, CsvImportQualitySummary>();
  await createStageTable(deps.connection);
  throwIfAppendAborted(deps.signal);
  try {
    for (const input of normalizedInputs) {
      throwIfAppendAborted(deps.signal);
      await createClassifiedFileStage(input, deps);
      throwIfAppendAborted(deps.signal);
      const qualitySummary = await collectCsvImportQualityFromFileStage(deps);
      throwIfAppendAborted(deps.signal);
      qualityByInstrumentId.set(input.instrumentId, qualitySummary);
      if (qualitySummary.validRows <= 0) {
        continue;
      }
      const instrumentIdLiteral = quoteDuckLiteral(input.instrumentId);
      await deps.connection.run(
        `INSERT INTO ${STAGE_TABLE_NAME} (instrument_id, ts_ms, open, high, low, close, volume)
         SELECT
           ${instrumentIdLiteral} AS instrument_id,
           ts_ms,
           open,
           high,
           low,
           close,
           volume
           FROM (${buildCsvDedupedRowsFromClassifiedRowsSql(FILE_STAGE_TABLE_NAME)}) AS csv_deduped
          ORDER BY ts_ms`
      );
      throwIfAppendAborted(deps.signal);
    }
  } finally {
    await deps.connection.run(`DROP TABLE IF EXISTS ${FILE_STAGE_TABLE_NAME}`).catch(() => undefined);
  }

  const summaryResult = await deps.connection.run(
    `WITH stage_bounds AS (
       SELECT instrument_id,
              COUNT(*) AS valid_rows,
              MIN(ts_ms) AS stage_min_ts_ms,
              MAX(ts_ms) AS stage_max_ts_ms
         FROM ${STAGE_TABLE_NAME}
        GROUP BY instrument_id
     ),
     existing_bounds AS (
       SELECT instrument_id,
              COUNT(*) AS existing_bar_count,
              MIN(ts_ms) AS min_ts_ms,
              MAX(ts_ms) AS max_ts_ms
         FROM market_bars
        WHERE instrument_id IN (SELECT instrument_id FROM stage_bounds)
        GROUP BY instrument_id
     ),
     stage_enriched AS (
       SELECT s.instrument_id,
              s.ts_ms,
              s.open,
              s.high,
              s.low,
              s.close,
              s.volume,
              COALESCE(b.existing_bar_count, 0) AS existing_bar_count,
              b.min_ts_ms,
              b.max_ts_ms,
              m.ts_ms AS existing_ts_ms,
              m.open AS existing_open,
              m.high AS existing_high,
              m.low AS existing_low,
              m.close AS existing_close,
              m.volume AS existing_volume
         FROM ${STAGE_TABLE_NAME} s
         LEFT JOIN existing_bounds b ON b.instrument_id = s.instrument_id
         LEFT JOIN market_bars m
                ON m.instrument_id = s.instrument_id
               AND m.ts_ms = s.ts_ms
     )
     SELECT sb.instrument_id AS instrument_id,
            sb.valid_rows AS valid_rows,
            SUM(
              CASE
                WHEN se.existing_bar_count <= 0 THEN 0
                WHEN se.ts_ms < se.min_ts_ms THEN 1
                ELSE 0
              END
            ) AS prepended_rows,
            SUM(
              CASE
                WHEN se.existing_bar_count <= 0 THEN 1
                WHEN se.ts_ms > se.max_ts_ms THEN 1
                ELSE 0
              END
            ) AS appended_rows,
            SUM(
              CASE
                WHEN se.existing_bar_count > 0
                 AND se.existing_ts_ms IS NOT NULL
                 AND se.existing_open = se.open
                 AND se.existing_high = se.high
                 AND se.existing_low = se.low
                 AND se.existing_close = se.close
                 AND se.existing_volume = se.volume
                THEN 1
                ELSE 0
              END
            ) AS overlap_rows_ignored,
            SUM(
              CASE
                WHEN se.existing_bar_count > 0
                 AND se.existing_ts_ms IS NOT NULL
                 AND (
                   se.existing_open <> se.open
                   OR se.existing_high <> se.high
                   OR se.existing_low <> se.low
                   OR se.existing_close <> se.close
                   OR se.existing_volume <> se.volume
                 )
                THEN 1
                ELSE 0
              END
            ) AS conflict_rows_ignored,
            SUM(
              CASE
                WHEN se.existing_bar_count > 0
                 AND se.existing_ts_ms IS NULL
                 AND se.ts_ms > se.min_ts_ms
                 AND se.ts_ms < se.max_ts_ms
                THEN 1
                ELSE 0
              END
            ) AS internal_range_rows_ignored
       FROM stage_bounds sb
       JOIN stage_enriched se ON se.instrument_id = sb.instrument_id
      GROUP BY sb.instrument_id, sb.valid_rows`
  );
  throwIfAppendAborted(deps.signal);
  const summaryRows = (await summaryResult.getRowObjectsJS()) as Array<{
    instrument_id?: unknown;
    valid_rows?: unknown;
    prepended_rows?: unknown;
    appended_rows?: unknown;
    overlap_rows_ignored?: unknown;
    conflict_rows_ignored?: unknown;
    internal_range_rows_ignored?: unknown;
  }>;
  const summaryByInstrumentId = new Map<
    string,
    {
      validRows: number;
      prependedRows: number;
      appendedRows: number;
      overlapRowsIgnored: number;
      conflictRowsIgnored: number;
      internalRangeRowsIgnored: number;
    }
  >();
  summaryRows.forEach((row) => {
    const instrumentId = String(row.instrument_id ?? '').trim();
    if (!instrumentId) {
      return;
    }
    summaryByInstrumentId.set(instrumentId, {
      validRows: deps.toSafeInt(row.valid_rows ?? 0),
      prependedRows: deps.toSafeInt(row.prepended_rows ?? 0),
      appendedRows: deps.toSafeInt(row.appended_rows ?? 0),
      overlapRowsIgnored: deps.toSafeInt(row.overlap_rows_ignored ?? 0),
      conflictRowsIgnored: deps.toSafeInt(row.conflict_rows_ignored ?? 0),
      internalRangeRowsIgnored: deps.toSafeInt(row.internal_range_rows_ignored ?? 0),
    });
  });
  const blockedInstrumentIds = new Set(
    Array.from(summaryByInstrumentId.entries())
      .filter(([, summary]) => summary.conflictRowsIgnored > 0 || summary.internalRangeRowsIgnored > 0)
      .map(([instrumentId]) => instrumentId),
  );
  const blockedInstrumentInsertFilter = blockedInstrumentIds.size
    ? `AND s.instrument_id NOT IN (${Array.from(blockedInstrumentIds).map(quoteDuckLiteral).join(', ')})`
    : '';

  await deps.connection.run(
    `INSERT INTO market_bars (instrument_id, raw_index, ts_ms, open, high, low, close, volume)
     WITH existing_bounds AS (
       SELECT instrument_id,
              COUNT(*) AS existing_bar_count,
              MIN(ts_ms) AS min_ts_ms,
              MAX(ts_ms) AS max_ts_ms,
              MAX(raw_index) AS max_raw_index
         FROM market_bars
        WHERE instrument_id IN (SELECT instrument_id FROM ${STAGE_TABLE_NAME})
        GROUP BY instrument_id
     )
     SELECT insertable.instrument_id,
            CASE
              WHEN insertable.existing_bar_count <= 0
              THEN ROW_NUMBER() OVER (
                PARTITION BY insertable.instrument_id
                ORDER BY insertable.ts_ms ASC
              ) - 1
              WHEN insertable.ts_ms > insertable.max_ts_ms
              THEN insertable.max_raw_index + ROW_NUMBER() OVER (
                PARTITION BY insertable.instrument_id, insertable.append_index_group
                ORDER BY insertable.ts_ms ASC
              )
              ELSE 0
            END AS raw_index,
            insertable.ts_ms,
            CAST(insertable.open AS ${MARKET_PRICE_STORAGE_SQL}) AS open,
            CAST(insertable.high AS ${MARKET_PRICE_STORAGE_SQL}) AS high,
            CAST(insertable.low AS ${MARKET_PRICE_STORAGE_SQL}) AS low,
            CAST(insertable.close AS ${MARKET_PRICE_STORAGE_SQL}) AS close,
            CAST(insertable.volume AS ${MARKET_VOLUME_STORAGE_SQL}) AS volume
       FROM (
         SELECT s.instrument_id,
                s.ts_ms,
                s.open,
                s.high,
                s.low,
                s.close,
                s.volume,
                COALESCE(b.existing_bar_count, 0) AS existing_bar_count,
                COALESCE(b.max_raw_index, -1) AS max_raw_index,
                b.min_ts_ms,
                b.max_ts_ms,
                CASE
                  WHEN COALESCE(b.existing_bar_count, 0) > 0 AND s.ts_ms > b.max_ts_ms THEN 1
                  ELSE 0
                END AS append_index_group
           FROM ${STAGE_TABLE_NAME} s
           LEFT JOIN existing_bounds b ON b.instrument_id = s.instrument_id
          WHERE (
                COALESCE(b.existing_bar_count, 0) <= 0
             OR s.ts_ms < b.min_ts_ms
             OR s.ts_ms > b.max_ts_ms
          )
          ${blockedInstrumentInsertFilter}
       ) AS insertable
      ORDER BY insertable.instrument_id, raw_index ASC`
  );
  throwIfAppendAborted(deps.signal);

  // Front-inserted rows (ts < min_ts_ms) are written with raw_index 0 by the
  // ELSE branch above and would collide with the existing first bar. Reindex
  // every instrument that received prepended rows by time so raw_index stays
  // dense and the reader's anchor-chunk assumptions hold. This is the
  // Core-layer guarantee for direct calls; the import wrapper reindexes as
  // well and this step is idempotent. The reindex runs inline (no module
  // import) so the database module graph is never reordered.
  const reindexInstrumentIds = normalizedInputs
    .map((input) => input.instrumentId)
    .filter((instrumentId) => {
      const summary = summaryByInstrumentId.get(instrumentId);
      return !blockedInstrumentIds.has(instrumentId)
        && (summary?.prependedRows ?? 0) > 0;
    });
  if (reindexInstrumentIds.length) {
    const reindexPlaceholders = reindexInstrumentIds.map(() => '?').join(',');
    await deps.connection.run('DROP TABLE IF EXISTS market_bars_reindexed');
    await deps.connection.run(
      `CREATE TEMP TABLE market_bars_reindexed AS
       SELECT instrument_id,
              ROW_NUMBER() OVER (PARTITION BY instrument_id ORDER BY ts_ms ASC) - 1 AS raw_index,
              ts_ms,
              CAST(open AS ${MARKET_PRICE_STORAGE_SQL}) AS open,
              CAST(high AS ${MARKET_PRICE_STORAGE_SQL}) AS high,
              CAST(low AS ${MARKET_PRICE_STORAGE_SQL}) AS low,
              CAST(close AS ${MARKET_PRICE_STORAGE_SQL}) AS close,
              CAST(volume AS ${MARKET_VOLUME_STORAGE_SQL}) AS volume
         FROM (
           SELECT instrument_id,
                  ts_ms,
                  ANY_VALUE(open) AS open,
                  ANY_VALUE(high) AS high,
                  ANY_VALUE(low) AS low,
                  ANY_VALUE(close) AS close,
                  ANY_VALUE(volume) AS volume
             FROM market_bars
            WHERE instrument_id IN (${reindexPlaceholders})
            GROUP BY instrument_id, ts_ms
         ) AS deduped_market_bars
        ORDER BY instrument_id ASC, raw_index ASC`,
      reindexInstrumentIds as never[],
    );
    await deps.connection.run(
      `DELETE FROM market_bars
        WHERE instrument_id IN (${reindexPlaceholders})`,
      reindexInstrumentIds as never[],
    );
    await deps.connection.run(
      `INSERT INTO market_bars (instrument_id, raw_index, ts_ms, open, high, low, close, volume)
       SELECT instrument_id, raw_index, ts_ms, open, high, low, close, volume
         FROM market_bars_reindexed
        ORDER BY instrument_id ASC, raw_index ASC`
    );
    await deps.connection.run('DROP TABLE IF EXISTS market_bars_reindexed');
  }
  throwIfAppendAborted(deps.signal);

  return normalizedInputs.map((input) => {
    const qualitySummary = qualityByInstrumentId.get(input.instrumentId);
    const summary = summaryByInstrumentId.get(input.instrumentId);
    const validRows = summary?.validRows ?? qualitySummary?.validRows ?? 0;
    const isBlockedForFullReimport = blockedInstrumentIds.has(input.instrumentId);
    const prependedRows = isBlockedForFullReimport ? 0 : (summary?.prependedRows ?? 0);
    const appendedRows = isBlockedForFullReimport
      ? 0
      : (summary?.appendedRows ?? (validRows > 0 ? validRows : 0));
    const overlapRowsIgnored = summary?.overlapRowsIgnored ?? 0;
    const internalRangeRowsIgnored = summary?.internalRangeRowsIgnored ?? 0;
    const conflictRowsIgnored = summary?.conflictRowsIgnored ?? 0;
    return {
      instrumentId: input.instrumentId,
      symbol: input.symbol,
      filePath: input.filePath,
      validRows,
      importedRows: prependedRows + appendedRows,
      prependedRows,
      appendedRows,
      overlapRowsIgnored,
      internalRangeRowsIgnored,
      conflictRowsIgnored,
      skippedRows: qualitySummary?.skippedRows ?? 0,
      invalidRequiredRowsSkipped: qualitySummary?.invalidRequiredRowsSkipped ?? 0,
      invalidOhlcRowsSkipped: qualitySummary?.invalidOhlcRowsSkipped ?? 0,
      duplicateConflictRowsSkipped: qualitySummary?.duplicateConflictRowsSkipped ?? 0,
      duplicateIdenticalRowsDeduped: qualitySummary?.duplicateIdenticalRowsDeduped ?? 0,
      errorMessage: isBlockedForFullReimport ? 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED' : undefined,
    };
  });
};
