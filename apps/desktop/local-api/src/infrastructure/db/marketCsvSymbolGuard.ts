// SPDX-License-Identifier: GPL-3.0-only

import type { DuckDBConnection } from '@duckdb/node-api';

import { quoteDuckIdentifier } from './marketCsvImportSql.js';

const SYMBOL_COLUMN_KEYS = new Set([
  'symbol',
  'ticker',
  'instrument',
  'instrumentid',
  'security',
  'securitycode',
  'seccode',
  'stockcode',
  'contract',
  'contractcode',
  'tscode',
  'indexcode',
  'code',
]);

const normalizeSymbolColumnKey = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/gu, '');

const throwMixedSymbolColumn = (): never => {
  const error = new Error('CSV_SYMBOL_COLUMN_MIXED');
  Object.assign(error, { code: 'CSV_SYMBOL_COLUMN_MIXED' });
  throw error;
};

export const assertNoMixedSymbolsInTabularSource = async (
  connection: DuckDBConnection,
  sourceSql: string,
  options: { sourceKeyColumn?: string } = {},
): Promise<void> => {
  const description = await connection.run(`DESCRIBE SELECT * FROM ${sourceSql}`);
  const columns = (await description.getRowObjectsJS()) as Array<{ column_name?: unknown }>;
  const symbolColumns = columns
    .map((row) => String(row.column_name ?? '').trim())
    .filter((columnName) => SYMBOL_COLUMN_KEYS.has(normalizeSymbolColumnKey(columnName)));
  if (!symbolColumns.length) {
    return;
  }
  const sourceKeyColumn = String(options.sourceKeyColumn ?? '').trim();
  const sourceKeyExpression = sourceKeyColumn
    ? `CAST(${quoteDuckIdentifier(sourceKeyColumn)} AS VARCHAR)`
    : `''`;
  const normalizedSymbolRowsSql = symbolColumns.map((columnName) => {
    const identifier = quoteDuckIdentifier(columnName);
    return `SELECT ${sourceKeyExpression} AS import_source_key,
                   NULLIF(UPPER(TRIM(CAST(${identifier} AS VARCHAR))), '') AS symbol_value
              FROM ${sourceSql}`;
  }).join('\nUNION ALL\n');
  const result = await connection.run(
    `SELECT import_source_key
       FROM (${normalizedSymbolRowsSql}) AS normalized_symbols
      WHERE symbol_value IS NOT NULL
      GROUP BY import_source_key
     HAVING COUNT(DISTINCT symbol_value) > 1
      LIMIT 1`,
  );
  const rows = (await result.getRowObjectsJS()) as Array<Record<string, unknown>>;
  if (rows.length > 0) {
    throwMixedSymbolColumn();
  }
};
