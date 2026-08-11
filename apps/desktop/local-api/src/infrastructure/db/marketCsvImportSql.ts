// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_TIME_ZONE,
  normalizeTimeZone as normalizeSharedTimeZone
} from '@zinuto/shared/timezone';
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
} from './marketDatabase/ohlcvSql.js';

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

type CsvImportSourceKeyOptions = {
  sourceKeyExpr?: string | null;
  sourceKeyColumn?: string | null;
};

const CSV_IMPORT_SOURCE_KEY_ALIAS = 'import_source_key';

export const DEFAULT_MARKET_CSV_DATETIME_TIMEZONE = DEFAULT_TIME_ZONE;

export const quoteDuckIdentifier = (value: string): string => {
  const normalized = String(value ?? '').trim();
  return `"${normalized.replace(/"/g, '""')}"`;
};

export const quoteDuckLiteral = (value: string): string =>
  `'${String(value ?? '').replace(/'/g, "''")}'`;

// DuckDB's `filename` column returns engine-canonicalized paths. Normalize it
// the same way the Node side normalizes `path.resolve` results so exact-key
// comparisons survive Windows separators and case-insensitive filesystems.
export const buildNormalizedSourceKeySqlExpr = (sourceKeyExpr: string): string => {
  const normalized = String(sourceKeyExpr ?? '').trim();
  if (!normalized) {
    return '';
  }
  const casted = `CAST(${normalized} AS VARCHAR)`;
  const separatorFolded = `REPLACE(${casted}, ${quoteDuckLiteral('\\')}, '/')`;
  return process.platform === 'win32'
    ? `LOWER(${separatorFolded})`
    : separatorFolded;
};

export const normalizeCsvColumnName = (value: string): string =>
  String(value ?? '').trim();

export const buildCsvTextExpr = (ident: string): string =>
  `TRIM(COALESCE(CAST(${ident} AS VARCHAR), ''))`;

export const buildCsvNumericExpr = (
  ident: string,
  targetType = MARKET_VOLUME_STORAGE_SQL,
): string => {
  const textExpr = buildCsvTextExpr(ident);
  const plainNumberPattern = '^[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][+-]?[0-9]+)?$';
  const groupedNumberPattern = '^[+-]?[0-9]{1,3}(,[0-9]{3})+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$';
  return `CASE
      WHEN REGEXP_MATCHES(${textExpr}, ${quoteDuckLiteral(plainNumberPattern)})
        THEN TRY_CAST(${textExpr} AS ${targetType})
      WHEN REGEXP_MATCHES(${textExpr}, ${quoteDuckLiteral(groupedNumberPattern)})
        THEN TRY_CAST(REPLACE(${textExpr}, ',', '') AS ${targetType})
      ELSE NULL
    END`;
};

export const buildOptionalCsvNumericExpr = (columnName: string): string => {
  const normalizedColumnName = normalizeCsvColumnName(columnName);
  if (!normalizedColumnName) {
    return '0';
  }
  const ident = quoteDuckIdentifier(normalizedColumnName);
  return `CASE
      WHEN ${buildCsvTextExpr(ident)} = '' THEN 0
      ELSE ${buildCsvNumericExpr(ident, MARKET_VOLUME_STORAGE_SQL)}
    END`;
};

export const normalizeCsvTimestampMode = (
  value: string
): 'SINGLE' | 'SPLIT' => (String(value ?? '').trim().toUpperCase() === 'SPLIT' ? 'SPLIT' : 'SINGLE');

export const normalizeCsvTimezone = (value: string): string => {
  return normalizeSharedTimeZone(value, DEFAULT_MARKET_CSV_DATETIME_TIMEZONE);
};

export const buildCsvTimestampRawExpr = (
  mapping: CsvImportColumnMappingLike
): string => {
  const dateIdent = quoteDuckIdentifier(mapping.date);
  const dateExpr = `TRIM(COALESCE(CAST(${dateIdent} AS VARCHAR), ''))`;
  if (mapping.timestampMode !== 'SPLIT') {
    return dateExpr;
  }
  const timeIdent = quoteDuckIdentifier(mapping.time);
  const timeExpr = `TRIM(COALESCE(CAST(${timeIdent} AS VARCHAR), ''))`;
  const normalizedDigitsTimeExpr = `CASE
      WHEN LENGTH(${timeExpr}) <= 2 THEN CONCAT(LPAD(${timeExpr}, 2, '0'), '0000')
      WHEN LENGTH(${timeExpr}) <= 4 THEN CONCAT(LPAD(${timeExpr}, 4, '0'), '00')
      ELSE LPAD(${timeExpr}, 6, '0')
    END`;
  return `CASE
      WHEN ${dateExpr} = '' THEN ''
      WHEN ${timeExpr} = '' THEN ${dateExpr}
      WHEN REGEXP_MATCHES(${dateExpr}, '^[0-9]{8}$') AND REGEXP_MATCHES(${timeExpr}, '^[0-9]{1,6}$')
        THEN CONCAT(${dateExpr}, ${normalizedDigitsTimeExpr})
      WHEN REGEXP_MATCHES(${dateExpr}, '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}([T ].+)?$')
        THEN CONCAT(REGEXP_EXTRACT(${dateExpr}, '^([0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})', 1), ' ', ${timeExpr})
      ELSE CONCAT(${dateExpr}, ' ', ${timeExpr})
    END`;
};

export const buildCsvTimestampMsExpr = (
  tsRawExpr: string,
  timezone = DEFAULT_MARKET_CSV_DATETIME_TIMEZONE
): string => {
  const tzLiteral = quoteDuckLiteral(normalizeCsvTimezone(timezone));
  const normalizedTsExpr = `REPLACE(REPLACE(${tsRawExpr}, '/', '-'), '.', '-')`;
  return `CASE
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[+-][0-9]+$') THEN
        CASE
          WHEN LENGTH(${tsRawExpr}) - 1 = 10 THEN TRY_CAST(${tsRawExpr} AS BIGINT) * 1000
          ELSE TRY_CAST(${tsRawExpr} AS BIGINT)
        END
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{13}$') THEN TRY_CAST(${tsRawExpr} AS BIGINT)
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{10}$') THEN TRY_CAST(${tsRawExpr} AS BIGINT) * 1000
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}[ T]24(:?00){0,2}(\\.0+)?([zZ]|[+-][0-9]{2}:?[0-9]{2}|[[:space:]]+(UTC|GMT))?$') THEN NULL
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{8}$') THEN EPOCH_MS(TRY_STRPTIME(${tsRawExpr}, '%Y%m%d') AT TIME ZONE ${tzLiteral})
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{12}$') THEN EPOCH_MS(TRY_STRPTIME(${tsRawExpr}, '%Y%m%d%H%M') AT TIME ZONE ${tzLiteral})
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{14}$') THEN EPOCH_MS(TRY_STRPTIME(${tsRawExpr}, '%Y%m%d%H%M%S') AT TIME ZONE ${tzLiteral})
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{8} [0-9]{4}$') THEN EPOCH_MS(TRY_STRPTIME(${tsRawExpr}, '%Y%m%d %H%M') AT TIME ZONE ${tzLiteral})
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{8} [0-9]{6}$') THEN EPOCH_MS(TRY_STRPTIME(${tsRawExpr}, '%Y%m%d %H%M%S') AT TIME ZONE ${tzLiteral})
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]+$') THEN TRY_CAST(${tsRawExpr} AS BIGINT)
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2} [0-9]{4}$')
        THEN EPOCH_MS(TRY_STRPTIME(${normalizedTsExpr}, '%Y-%m-%d %H%M') AT TIME ZONE ${tzLiteral})
      WHEN REGEXP_MATCHES(${tsRawExpr}, '^[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2} [0-9]{6}$')
        THEN EPOCH_MS(TRY_STRPTIME(${normalizedTsExpr}, '%Y-%m-%d %H%M%S') AT TIME ZONE ${tzLiteral})
      WHEN REGEXP_MATCHES(${tsRawExpr}, '.*([zZ]|[+-][0-9]{2}:?[0-9]{2}|[[:space:]]+(UTC|GMT))$')
        THEN EPOCH_MS(TRY_CAST(${tsRawExpr} AS TIMESTAMPTZ))
      ELSE COALESCE(
        EPOCH_MS(TRY_CAST(${tsRawExpr} AS TIMESTAMP) AT TIME ZONE ${tzLiteral}),
        EPOCH_MS(TRY_CAST(${normalizedTsExpr} AS TIMESTAMP) AT TIME ZONE ${tzLiteral})
      )
    END`;
};

export const buildCsvOhlcValidPredicate = (): string =>
  `isfinite(open)
      AND isfinite(high)
      AND isfinite(low)
      AND isfinite(close)
      AND isfinite(volume)
      AND open > 0
      AND high > 0
      AND low > 0
      AND close > 0
      AND volume >= 0
      AND high >= open
      AND high >= low
      AND high >= close
      AND low <= open
      AND low <= high
      AND low <= close`;

export const buildCsvDuplicateValuesMatchPredicate = (): string =>
  `MIN(open) = MAX(open)
      AND MIN(high) = MAX(high)
      AND MIN(low) = MAX(low)
      AND MIN(close) = MAX(close)
      AND MIN(volume) = MAX(volume)`;

export const buildCsvImportCteSql = ({
  sourceSql,
  mapping,
  timezone = DEFAULT_MARKET_CSV_DATETIME_TIMEZONE,
  sourceKeyExpr,
}: {
  sourceSql: string;
  mapping: CsvImportColumnMappingLike;
  timezone?: string;
  sourceKeyExpr?: string | null;
}): string => {
  const normalizedSourceKeyExpr = String(sourceKeyExpr ?? '').trim();
  const hasSourceKey = Boolean(normalizedSourceKeyExpr);
  const sourceKeySelect = hasSourceKey ? `${CSV_IMPORT_SOURCE_KEY_ALIAS},` : '';
  const sourceKeyRawSelect = hasSourceKey
    ? `CAST(${normalizedSourceKeyExpr} AS VARCHAR) AS ${CSV_IMPORT_SOURCE_KEY_ALIAS},`
    : '';
  const duplicateGroupColumns = hasSourceKey
    ? `${CSV_IMPORT_SOURCE_KEY_ALIAS}, ts_ms`
    : 'ts_ms';
  const duplicateJoinPredicate = hasSourceKey
    ? `csv_duplicate_conflicts.${CSV_IMPORT_SOURCE_KEY_ALIAS} = csv_valid.${CSV_IMPORT_SOURCE_KEY_ALIAS}
           AND csv_duplicate_conflicts.ts_ms = csv_valid.ts_ms`
    : 'csv_duplicate_conflicts.ts_ms = csv_valid.ts_ms';
  const openIdent = quoteDuckIdentifier(mapping.open);
  const highIdent = quoteDuckIdentifier(mapping.high);
  const lowIdent = quoteDuckIdentifier(mapping.low);
  const closeIdent = quoteDuckIdentifier(mapping.close);
  const volumeIdent = normalizeCsvColumnName(mapping.volume)
    ? quoteDuckIdentifier(mapping.volume)
    : '';
  const tsRawExpr = buildCsvTimestampRawExpr(mapping);
  const tsMsExpr = buildCsvTimestampMsExpr(tsRawExpr, timezone);
  const volumeRawExpr = volumeIdent ? buildCsvTextExpr(volumeIdent) : `''`;
  const ohlcValidPredicate = buildCsvOhlcValidPredicate();
  const duplicateValuesMatchPredicate = buildCsvDuplicateValuesMatchPredicate();
  return `csv_raw AS (
        SELECT
          ${sourceKeyRawSelect}
          ${tsRawExpr} AS ts_raw,
          ${buildCsvTextExpr(openIdent)} AS open_raw,
          ${buildCsvTextExpr(highIdent)} AS high_raw,
          ${buildCsvTextExpr(lowIdent)} AS low_raw,
          ${buildCsvTextExpr(closeIdent)} AS close_raw,
          ${volumeRawExpr} AS volume_raw,
          ${tsMsExpr} AS ts_ms,
          ${buildCsvNumericExpr(openIdent, MARKET_PRICE_STORAGE_SQL)} AS open,
          ${buildCsvNumericExpr(highIdent, MARKET_PRICE_STORAGE_SQL)} AS high,
          ${buildCsvNumericExpr(lowIdent, MARKET_PRICE_STORAGE_SQL)} AS low,
          ${buildCsvNumericExpr(closeIdent, MARKET_PRICE_STORAGE_SQL)} AS close,
          ${buildOptionalCsvNumericExpr(mapping.volume)} AS volume
          FROM ${sourceSql}
      ),
      csv_relevant AS (
        SELECT ${sourceKeySelect} ts_ms, open, high, low, close, volume
          FROM csv_raw
         WHERE NOT (
           ts_raw = ''
           AND open_raw = ''
           AND high_raw = ''
           AND low_raw = ''
           AND close_raw = ''
           AND volume_raw = ''
         )
      ),
      csv_required_invalid AS (
        SELECT *
          FROM csv_relevant
         WHERE ts_ms IS NULL
            OR open IS NULL
            OR high IS NULL
            OR low IS NULL
            OR close IS NULL
            OR volume IS NULL
      ),
      csv_required_valid AS (
        SELECT ${sourceKeySelect} ts_ms, open, high, low, close, volume
          FROM csv_relevant
         WHERE ts_ms IS NOT NULL
           AND open IS NOT NULL
           AND high IS NOT NULL
           AND low IS NOT NULL
           AND close IS NOT NULL
           AND volume IS NOT NULL
      ),
      csv_ohlc_invalid AS (
        SELECT *
          FROM csv_required_valid
         WHERE NOT (${ohlcValidPredicate})
      ),
      csv_valid AS (
        SELECT ${sourceKeySelect} ts_ms, open, high, low, close, volume
          FROM csv_required_valid
         WHERE ${ohlcValidPredicate}
      ),
      csv_duplicate_conflicts AS (
        SELECT ${duplicateGroupColumns}
          FROM csv_valid
         GROUP BY ${duplicateGroupColumns}
        HAVING NOT (${duplicateValuesMatchPredicate})
      ),
      csv_duplicate_conflict_rows AS (
        SELECT csv_valid.*
          FROM csv_valid
         INNER JOIN csv_duplicate_conflicts
            ON ${duplicateJoinPredicate}
      ),
      csv_identical_duplicate_groups AS (
        SELECT ${duplicateGroupColumns},
               COUNT(*) AS duplicate_row_count
          FROM csv_valid
         GROUP BY ${duplicateGroupColumns}
        HAVING COUNT(*) > 1
           AND ${duplicateValuesMatchPredicate}
      ),
      csv_deduped AS (
        SELECT ${sourceKeySelect} ts_ms,
               ANY_VALUE(open) AS open,
               ANY_VALUE(high) AS high,
               ANY_VALUE(low) AS low,
               ANY_VALUE(close) AS close,
               ANY_VALUE(volume) AS volume
          FROM csv_valid
         GROUP BY ${duplicateGroupColumns}
        HAVING ${duplicateValuesMatchPredicate}
      )`;
};

export const buildCsvImportValidationSummarySql = ({
  sourceSql,
  mapping,
  timezone = DEFAULT_MARKET_CSV_DATETIME_TIMEZONE,
}: {
  sourceSql: string;
  mapping: CsvImportColumnMappingLike;
  timezone?: string;
}): string => `WITH ${buildCsvImportCteSql({ sourceSql, mapping, timezone })}
      SELECT
        (SELECT COUNT(*) FROM csv_required_invalid) AS required_invalid_rows,
        (SELECT COUNT(*) FROM csv_ohlc_invalid) AS ohlc_invalid_rows,
        (SELECT COUNT(*) FROM csv_duplicate_conflicts) AS duplicate_conflict_groups,
        (SELECT COUNT(*) FROM csv_duplicate_conflict_rows) AS duplicate_conflict_rows,
        COALESCE((SELECT SUM(duplicate_row_count - 1) FROM csv_identical_duplicate_groups), 0) AS duplicate_identical_rows_deduped,
        (SELECT COUNT(*) FROM csv_deduped) AS valid_rows`;

export const buildCsvImportClassifiedRowsSql = ({
  sourceSql,
  mapping,
  timezone = DEFAULT_MARKET_CSV_DATETIME_TIMEZONE,
  sourceKeyExpr,
}: {
  sourceSql: string;
  mapping: CsvImportColumnMappingLike;
  timezone?: string;
  sourceKeyExpr?: string | null;
}): string => {
  const hasSourceKey = Boolean(String(sourceKeyExpr ?? '').trim());
  const sourceKeySelect = hasSourceKey ? `${CSV_IMPORT_SOURCE_KEY_ALIAS},` : '';
  return `WITH ${buildCsvImportCteSql({ sourceSql, mapping, timezone, sourceKeyExpr })}
      SELECT
        ${sourceKeySelect}
        'REQUIRED_INVALID' AS import_row_status,
        ts_ms,
        open,
        high,
        low,
        close,
        volume
        FROM csv_required_invalid
      UNION ALL
      SELECT
        ${sourceKeySelect}
        'OHLC_INVALID' AS import_row_status,
        ts_ms,
        open,
        high,
        low,
        close,
        volume
        FROM csv_ohlc_invalid
      UNION ALL
      SELECT
        ${sourceKeySelect}
        'VALID' AS import_row_status,
        ts_ms,
        open,
        high,
        low,
        close,
        volume
        FROM csv_valid`;
};

const buildCsvDeduplicationCteFromClassifiedRowsSql = (
  tableName: string,
  options: CsvImportSourceKeyOptions = {}
): string => {
  const tableIdent = quoteDuckIdentifier(tableName);
  const sourceKeyColumn = normalizeCsvColumnName(String(options.sourceKeyColumn ?? ''));
  const hasSourceKey = Boolean(sourceKeyColumn);
  const sourceKeyIdent = hasSourceKey ? quoteDuckIdentifier(sourceKeyColumn) : '';
  const sourceKeySelect = hasSourceKey ? `${sourceKeyIdent} AS ${CSV_IMPORT_SOURCE_KEY_ALIAS},` : '';
  const normalizedSourceKeySelect = hasSourceKey ? `${CSV_IMPORT_SOURCE_KEY_ALIAS},` : '';
  const duplicateGroupColumns = hasSourceKey
    ? `${CSV_IMPORT_SOURCE_KEY_ALIAS}, ts_ms`
    : 'ts_ms';
  const duplicateJoinPredicate = hasSourceKey
    ? `csv_duplicate_conflicts.${CSV_IMPORT_SOURCE_KEY_ALIAS} = csv_valid.${CSV_IMPORT_SOURCE_KEY_ALIAS}
           AND csv_duplicate_conflicts.ts_ms = csv_valid.ts_ms`
    : 'csv_duplicate_conflicts.ts_ms = csv_valid.ts_ms';
  const duplicateValuesMatchPredicate = buildCsvDuplicateValuesMatchPredicate();
  return `csv_valid AS (
        SELECT ${sourceKeySelect} ts_ms, open, high, low, close, volume
          FROM ${tableIdent}
         WHERE import_row_status = 'VALID'
      ),
      csv_duplicate_conflicts AS (
        SELECT ${duplicateGroupColumns}
          FROM csv_valid
         GROUP BY ${duplicateGroupColumns}
        HAVING NOT (${duplicateValuesMatchPredicate})
      ),
      csv_duplicate_conflict_rows AS (
        SELECT csv_valid.*
          FROM csv_valid
         INNER JOIN csv_duplicate_conflicts
            ON ${duplicateJoinPredicate}
      ),
      csv_identical_duplicate_groups AS (
        SELECT ${duplicateGroupColumns},
               COUNT(*) AS duplicate_row_count
          FROM csv_valid
         GROUP BY ${duplicateGroupColumns}
        HAVING COUNT(*) > 1
           AND ${duplicateValuesMatchPredicate}
      ),
      csv_deduped AS (
        SELECT ${normalizedSourceKeySelect} ts_ms,
               ANY_VALUE(open) AS open,
               ANY_VALUE(high) AS high,
               ANY_VALUE(low) AS low,
               ANY_VALUE(close) AS close,
               ANY_VALUE(volume) AS volume
          FROM csv_valid
         GROUP BY ${duplicateGroupColumns}
        HAVING ${duplicateValuesMatchPredicate}
      )`;
};

export const buildCsvImportValidationSummaryFromClassifiedRowsSql = (
  tableName: string,
  options: CsvImportSourceKeyOptions = {}
): string => {
  const tableIdent = quoteDuckIdentifier(tableName);
  const sourceKeyColumn = normalizeCsvColumnName(String(options.sourceKeyColumn ?? ''));
  if (!sourceKeyColumn) {
    return `WITH ${buildCsvDeduplicationCteFromClassifiedRowsSql(tableName)}
      SELECT
        (SELECT COUNT(*) FROM ${tableIdent} WHERE import_row_status = 'REQUIRED_INVALID') AS required_invalid_rows,
        (SELECT COUNT(*) FROM ${tableIdent} WHERE import_row_status = 'OHLC_INVALID') AS ohlc_invalid_rows,
        (SELECT COUNT(*) FROM csv_duplicate_conflicts) AS duplicate_conflict_groups,
        (SELECT COUNT(*) FROM csv_duplicate_conflict_rows) AS duplicate_conflict_rows,
        COALESCE((SELECT SUM(duplicate_row_count - 1) FROM csv_identical_duplicate_groups), 0) AS duplicate_identical_rows_deduped,
        (SELECT COUNT(*) FROM csv_deduped) AS valid_rows`;
  }
  const sourceKeyIdent = quoteDuckIdentifier(sourceKeyColumn);
  return `WITH ${buildCsvDeduplicationCteFromClassifiedRowsSql(tableName, { sourceKeyColumn })},
      source_keys AS (
        SELECT DISTINCT ${sourceKeyIdent} AS ${CSV_IMPORT_SOURCE_KEY_ALIAS}
          FROM ${tableIdent}
      ),
      classified_summary AS (
        SELECT ${sourceKeyIdent} AS ${CSV_IMPORT_SOURCE_KEY_ALIAS},
               SUM(CASE WHEN import_row_status = 'REQUIRED_INVALID' THEN 1 ELSE 0 END) AS required_invalid_rows,
               SUM(CASE WHEN import_row_status = 'OHLC_INVALID' THEN 1 ELSE 0 END) AS ohlc_invalid_rows
          FROM ${tableIdent}
         GROUP BY ${sourceKeyIdent}
      ),
      duplicate_conflict_summary AS (
        SELECT ${CSV_IMPORT_SOURCE_KEY_ALIAS},
               COUNT(*) AS duplicate_conflict_groups
          FROM csv_duplicate_conflicts
         GROUP BY ${CSV_IMPORT_SOURCE_KEY_ALIAS}
      ),
      duplicate_conflict_row_summary AS (
        SELECT ${CSV_IMPORT_SOURCE_KEY_ALIAS},
               COUNT(*) AS duplicate_conflict_rows
          FROM csv_duplicate_conflict_rows
         GROUP BY ${CSV_IMPORT_SOURCE_KEY_ALIAS}
      ),
      identical_duplicate_summary AS (
        SELECT ${CSV_IMPORT_SOURCE_KEY_ALIAS},
               SUM(duplicate_row_count - 1) AS duplicate_identical_rows_deduped
          FROM csv_identical_duplicate_groups
         GROUP BY ${CSV_IMPORT_SOURCE_KEY_ALIAS}
      ),
      valid_summary AS (
        SELECT ${CSV_IMPORT_SOURCE_KEY_ALIAS},
               COUNT(*) AS valid_rows
          FROM csv_deduped
         GROUP BY ${CSV_IMPORT_SOURCE_KEY_ALIAS}
      )
      SELECT source_keys.${CSV_IMPORT_SOURCE_KEY_ALIAS} AS ${CSV_IMPORT_SOURCE_KEY_ALIAS},
             COALESCE(classified_summary.required_invalid_rows, 0) AS required_invalid_rows,
             COALESCE(classified_summary.ohlc_invalid_rows, 0) AS ohlc_invalid_rows,
             COALESCE(duplicate_conflict_summary.duplicate_conflict_groups, 0) AS duplicate_conflict_groups,
             COALESCE(duplicate_conflict_row_summary.duplicate_conflict_rows, 0) AS duplicate_conflict_rows,
             COALESCE(identical_duplicate_summary.duplicate_identical_rows_deduped, 0) AS duplicate_identical_rows_deduped,
             COALESCE(valid_summary.valid_rows, 0) AS valid_rows
        FROM source_keys
        LEFT JOIN classified_summary USING (${CSV_IMPORT_SOURCE_KEY_ALIAS})
        LEFT JOIN duplicate_conflict_summary USING (${CSV_IMPORT_SOURCE_KEY_ALIAS})
        LEFT JOIN duplicate_conflict_row_summary USING (${CSV_IMPORT_SOURCE_KEY_ALIAS})
        LEFT JOIN identical_duplicate_summary USING (${CSV_IMPORT_SOURCE_KEY_ALIAS})
        LEFT JOIN valid_summary USING (${CSV_IMPORT_SOURCE_KEY_ALIAS})`;
};

export const buildCsvDedupedRowsFromClassifiedRowsSql = (
  tableName: string,
  options: CsvImportSourceKeyOptions = {}
): string => {
  const sourceKeyColumn = normalizeCsvColumnName(String(options.sourceKeyColumn ?? ''));
  const sourceKeySelect = sourceKeyColumn ? `${CSV_IMPORT_SOURCE_KEY_ALIAS},` : '';
  return `WITH ${buildCsvDeduplicationCteFromClassifiedRowsSql(tableName, { sourceKeyColumn })}
      SELECT ${sourceKeySelect} ts_ms, open, high, low, close, volume
        FROM csv_deduped`;
};
