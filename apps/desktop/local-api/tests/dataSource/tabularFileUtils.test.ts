// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DuckDBConnection } from '@duckdb/node-api';
import { IMPORT_LIMITS } from '@zinuto/shared/input-limits';

import {
  detectTabularFileTimeframe,
  materializeTabularFileToImportCsv,
  readTabularPreviewRowsFromPath,
} from '../../src/application/dataSource/tabularFileUtils.js';
import { appendEdgeBarsForInstrumentsFromCsvFilesBatchCore } from '../../src/infrastructure/db/marketCsvEdgeAppend.js';
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
} from '../../src/infrastructure/db/marketDatabase/ohlcvSql.js';
import { appError } from '../../src/kernel/appError.js';

type ExcelCell = { value: string | number };
type ExcelSheet = {
  data: ExcelCell[][];
  sheet: string;
};
type WriteExcelFileNode = (
  data: ExcelCell[][] | ExcelSheet[],
) => {
  toFile: (filePath: string) => Promise<void>;
};
type WriteExcelFileNodeModule = WriteExcelFileNode & {
  default?: WriteExcelFileNode;
};

const requireFromModule = createRequire(import.meta.url);
const writeExcelFileModule = requireFromModule('write-excel-file/node') as WriteExcelFileNodeModule;
const writeExcelFile = writeExcelFileModule.default ?? writeExcelFileModule;

const FIELD_MAPPING = {
  timestampMode: 'SINGLE' as const,
  date: 'date',
  time: '',
  open: 'open',
  high: 'high',
  low: 'low',
  close: 'close',
  volume: 'volume',
};

const HEADER_VALUES = ['date', 'open', 'high', 'low', 'close', 'volume'] as const;
const ROW_VALUES = [
  ['2024-01-01', 1, 2, 0.5, 1.5, 100],
  ['2024-01-02', 1.1, 2.1, 0.6, 1.6, 120],
  ['2024-01-03', 1.2, 2.2, 0.7, 1.7, 140],
] as const;

const toExcelData = (): ExcelCell[][] => [
  HEADER_VALUES.map((value) => ({ value })),
  ...ROW_VALUES.map((row) => row.map((value) => ({ value }))),
];

const writeParquetFixture = async (filePath: string): Promise<void> => {
  const connection = await DuckDBConnection.create();
  try {
    await connection.run(`
      CREATE TABLE fixture (
        date VARCHAR,
        open DOUBLE,
        high DOUBLE,
        low DOUBLE,
        close DOUBLE,
        volume DOUBLE
      )
    `);
    await connection.run(`
      INSERT INTO fixture VALUES
        ('2024-01-01', 1, 2, 0.5, 1.5, 100),
        ('2024-01-02', 1.1, 2.1, 0.6, 1.6, 120),
        ('2024-01-03', 1.2, 2.2, 0.7, 1.7, 140)
    `);
    await connection.run(
      `COPY fixture TO '${filePath.replaceAll("'", "''")}' (FORMAT PARQUET)`,
    );
  } finally {
    connection.closeSync();
  }
};

test('all four supported formats expose the same canonical preview columns', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-preview-formats-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const csvPath = path.join(tempRoot, 'AAPL_1d.csv');
  const jsonPath = path.join(tempRoot, 'AAPL_1d.json');
  const parquetPath = path.join(tempRoot, 'AAPL_1d.parquet');
  const xlsxPath = path.join(tempRoot, 'AAPL_1d.xlsx');
  await Promise.all([
    fs.writeFile(
      csvPath,
      `${HEADER_VALUES.join(',')}\n${ROW_VALUES.map((row) => row.join(',')).join('\n')}\n`,
      'utf8',
    ),
    fs.writeFile(
      jsonPath,
      JSON.stringify(ROW_VALUES.map((row) => Object.fromEntries(
        HEADER_VALUES.map((header, index) => [header, row[index]]),
      ))),
      'utf8',
    ),
    writeParquetFixture(parquetPath),
    writeExcelFile(toExcelData()).toFile(xlsxPath),
  ]);

  for (const filePath of [csvPath, jsonPath, parquetPath, xlsxPath]) {
    const preview = await readTabularPreviewRowsFromPath(filePath, 2);
    assert.deepEqual(preview.headers, [...HEADER_VALUES], path.extname(filePath));
    assert.equal(preview.rows.length, 2, path.extname(filePath));
    assert.equal(
      await detectTabularFileTimeframe(
        filePath,
        FIELD_MAPPING,
        'misleading_1m',
        'Etc/UTC',
      ),
      '1d',
      path.extname(filePath),
    );
  }
});

test('JSON preview accepts a one-line array larger than the old full-file preview ceiling', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-large-json-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const filePath = path.join(tempRoot, 'AAPL_1d.json');
  const rowText = JSON.stringify({
    date: '2024-01-01',
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 100,
  });
  const rowCount = Math.ceil((IMPORT_LIMITS.maxFullJsonPreviewBytes + 4096) / (rowText.length + 1));
  const jsonText = `[${Array.from({ length: rowCount }, () => rowText).join(',')}]`;
  assert.ok(Buffer.byteLength(jsonText) > IMPORT_LIMITS.maxFullJsonPreviewBytes);
  await fs.writeFile(filePath, jsonText, 'utf8');

  const preview = await readTabularPreviewRowsFromPath(filePath, 2);
  assert.deepEqual(preview.headers, [...HEADER_VALUES]);
  assert.equal(preview.rows.length, 2);

  const materialized = await materializeTabularFileToImportCsv(
    filePath,
    path.basename(filePath),
    FIELD_MAPPING,
    appError,
  );
  assert.equal(materialized.inputFormat, 'json');
  assert.deepEqual(materialized.normalizedMapping, FIELD_MAPPING);
  await materialized.cleanup();
});

test('JSON preview uses the same row shape as DuckDB execution for wrapped and column-oriented documents', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-json-shape-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const cases = [
    {
      name: 'wrapped',
      value: {
        rows: [{ date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }],
      },
    },
    {
      name: 'column-oriented',
      value: {
        columns: [...HEADER_VALUES],
        data: [ROW_VALUES[0]],
      },
    },
    {
      name: 'column-dictionary',
      value: Object.fromEntries(
        HEADER_VALUES.map((header, index) => [
          header,
          ROW_VALUES.map((row) => row[index]),
        ]),
      ),
    },
  ] as const;

  for (const item of cases) {
    const filePath = path.join(tempRoot, `${item.name}_1d.json`);
    await fs.writeFile(filePath, JSON.stringify(item.value), 'utf8');
    await assert.rejects(
      () => readTabularPreviewRowsFromPath(filePath, 2),
      /JSON_NESTED_TABULAR_SHAPE_UNSUPPORTED/,
    );
    await assert.rejects(
      () => materializeTabularFileToImportCsv(
        filePath,
        path.basename(filePath),
        FIELD_MAPPING,
        appError,
      ),
      (error: unknown) => {
        const appFailure = error as Error & {
          args?: { reason?: string };
          code?: string;
        };
        return appFailure.code === 'CSV_HEADER_READ_FAILED' &&
          appFailure.args?.reason === 'JSON_NESTED_TABULAR_SHAPE_UNSUPPORTED';
      },
    );
  }
});

test('malformed JSONL is rejected by both preview and execution without partial import', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-malformed-jsonl-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const filePath = path.join(tempRoot, 'AAPL_1d.json');
  await fs.writeFile(
    filePath,
    [
      JSON.stringify({ date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }),
      '{"date":"2024-01-02","open":',
      JSON.stringify({ date: '2024-01-03', open: 2, high: 3, low: 1, close: 2.5, volume: 120 }),
    ].join('\n'),
    'utf8',
  );

  await assert.rejects(
    () => readTabularPreviewRowsFromPath(filePath, 2),
    /Malformed JSON/,
  );

  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  await connection.run(`
    CREATE TABLE market_bars (
      instrument_id VARCHAR NOT NULL,
      raw_index BIGINT NOT NULL DEFAULT 0,
      ts_ms BIGINT NOT NULL,
      open ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      high ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      low ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      close ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
      volume ${MARKET_VOLUME_STORAGE_SQL} NOT NULL
    )
  `);
  await assert.rejects(
    () => appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
      [{
        instrumentId: 'instrument-aapl',
        symbol: 'AAPL',
        filePath,
        inputFormat: 'json',
        mapping: FIELD_MAPPING,
        timezone: 'Etc/UTC',
      }],
      {
        connection,
        sampleSize: 4096,
        toSafeInt: (value) => Math.max(0, Math.floor(Number(value) || 0)),
      },
    ),
    /Malformed JSON/,
  );
  const countResult = await connection.run('SELECT COUNT(*) AS count FROM market_bars');
  const [countRow] = await countResult.getRowObjectsJS() as Array<{ count?: unknown }>;
  assert.equal(Number(countRow?.count ?? 0), 0);
});

test('XLSX preview and execution reject multiple worksheets instead of dropping later sheets', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-xlsx-sheets-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const filePath = path.join(tempRoot, 'AAPL_1d.xlsx');
  await writeExcelFile([
    { data: toExcelData(), sheet: 'Bars A' },
    { data: toExcelData(), sheet: 'Bars B' },
  ]).toFile(filePath);

  await assert.rejects(
    () => readTabularPreviewRowsFromPath(filePath),
    /XLSX_MULTIPLE_SHEETS_UNSUPPORTED/,
  );
  await assert.rejects(
    () => materializeTabularFileToImportCsv(
      filePath,
      path.basename(filePath),
      FIELD_MAPPING,
      appError,
    ),
    (error: unknown) => {
      const appFailure = error as Error & {
        args?: { reason?: string };
        code?: string;
      };
      return appFailure.code === 'CSV_FILE_IMPORT_FAILED' &&
        appFailure.args?.reason === 'XLSX_MULTIPLE_SHEETS_UNSUPPORTED';
    },
  );
});
