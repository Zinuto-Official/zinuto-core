// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

import { appendEdgeBarsForInstrumentsFromCsvFilesBatchCore } from '../../src/infrastructure/db/marketCsvEdgeAppend.js';
import { materializeTabularFileToImportCsv } from '../../src/application/dataSource/tabularFileUtils.js';
import { appError } from '../../src/kernel/appError.js';
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
} from '../../src/infrastructure/db/marketDatabase/ohlcvSql.js';

const OHLC_CSV = `date,open,high,low,close
2024-01-01,1,2,0.5,1.5
2024-01-02,1.1,2.1,0.6,1.6
`;

const OHLC_MAPPING = {
  timestampMode: 'SINGLE' as const,
  date: 'date',
  time: '',
  open: 'open',
  high: 'high',
  low: 'low',
  close: 'close',
  volume: '',
};

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const requireFromModule = createRequire(import.meta.url);

type WriteExcelFileNode = (
  rows: Array<Array<{ value: string | number }>>,
) => {
  toFile: (filePath: string) => Promise<void>;
};

type WriteExcelFileNodeModule = {
  default?: WriteExcelFileNode;
} & WriteExcelFileNode;

type OhlcFixtureRow = {
  date: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume?: number | string;
};

const MARKET_BARS_SCHEMA_SQL = `
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
`;

const toSafeInt = (value: unknown): number => Math.max(0, Math.floor(Number(value) || 0));

const createMarketConnection = async (
  t: TestContext,
): Promise<DuckDBConnection> => {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  t.after(() => {
    connection.closeSync();
  });
  await connection.run(MARKET_BARS_SCHEMA_SQL);
  return connection;
};

const writeCsvRows = async (
  filePath: string,
  rows: OhlcFixtureRow[],
): Promise<void> => {
  await fs.writeFile(
    filePath,
    [
      'date,open,high,low,close,volume',
      ...rows.map((row) =>
        [
          row.date,
          row.open,
          row.high,
          row.low,
          row.close,
          row.volume ?? '',
        ].join(','),
      ),
    ].join('\n') + '\n',
    'utf8',
  );
};

const writeJsonRows = async (
  filePath: string,
  rows: OhlcFixtureRow[],
): Promise<void> => {
  await fs.writeFile(
    filePath,
    rows.map((row) => JSON.stringify(row)).join('\n'),
    'utf8',
  );
};

const writeParquetRows = async (
  filePath: string,
  rows: OhlcFixtureRow[],
  includeVolume = true,
): Promise<void> => {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    const valuesSql = rows
      .map((row) =>
        [
          `'${row.date.replaceAll("'", "''")}'`,
          Number(row.open),
          Number(row.high),
          Number(row.low),
          Number(row.close),
          ...(includeVolume ? [Number(row.volume ?? 0)] : []),
        ].join(', '),
      )
      .map((values) => `(${values})`)
      .join(', ');
    const columnsSql = includeVolume
      ? 'date, open, high, low, close, volume'
      : 'date, open, high, low, close';
    const escapedFilePath = filePath.replaceAll("'", "''");
    await connection.run(
      `CREATE TABLE parquet_fixture AS SELECT * FROM (VALUES ${valuesSql}) AS rows(${columnsSql})`,
    );
    await connection.run(
      `COPY parquet_fixture TO '${escapedFilePath}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
    );
  } finally {
    connection.closeSync();
  }
};

const writeXlsxRows = async (
  filePath: string,
  rows: OhlcFixtureRow[],
): Promise<void> => {
  const writeExcelFileModule = requireFromModule('write-excel-file/node') as WriteExcelFileNodeModule;
  const writeExcelFile = (writeExcelFileModule.default ?? writeExcelFileModule) as WriteExcelFileNode;
  await writeExcelFile(
    [
      ['date', 'open', 'high', 'low', 'close', 'volume'].map((value) => ({ value })),
      ...rows.map((row) => [
        { value: row.date },
        { value: row.open },
        { value: row.high },
        { value: row.low },
        { value: row.close },
        { value: row.volume ?? 0 },
      ]),
    ],
  ).toFile(filePath);
};

const TABULAR_FORMAT_CASES = [
  {
    name: 'CSV',
    extension: 'csv',
    write: writeCsvRows,
  },
  {
    name: 'JSON',
    extension: 'json',
    write: writeJsonRows,
  },
  {
    name: 'Parquet',
    extension: 'parquet',
    write: writeParquetRows,
  },
  {
    name: 'XLSX',
    extension: 'xlsx',
    write: writeXlsxRows,
  },
] as const;

const appendCsvFile = async (
  connection: DuckDBConnection,
  filePath: string,
) =>
  appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [
      {
        instrumentId: 'instrument-aapl',
        symbol: 'AAPL',
        filePath,
        mapping: { ...OHLC_MAPPING, volume: 'volume' },
        timezone: 'Etc/UTC',
      },
    ],
    {
      connection,
      sampleSize: 4096,
      toSafeInt,
    },
  );

const appendTabularFile = async (
  connection: DuckDBConnection,
  filePath: string,
  {
    instrumentId = 'instrument-aapl',
    symbol = 'AAPL',
    fileName = path.basename(filePath),
  }: {
    instrumentId?: string;
    symbol?: string;
    fileName?: string;
  } = {},
) => {
  const materialized = await materializeTabularFileToImportCsv(
    filePath,
    fileName,
    { ...OHLC_MAPPING, volume: 'volume' },
    appError,
  );
  try {
    return await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
      [
        {
          instrumentId,
          symbol,
          filePath: materialized.importCsvPath,
          inputFormat: materialized.inputFormat,
          mapping: materialized.normalizedMapping,
          timezone: 'Etc/UTC',
        },
      ],
      {
        connection,
        sampleSize: 4096,
        toSafeInt,
      },
    );
  } finally {
    await materialized.cleanup();
  }
};

const readMarketBarsForInstrument = async (
  connection: DuckDBConnection,
  instrumentId: string,
): Promise<Array<{ raw_index?: unknown; ts_ms?: unknown; close?: unknown; volume?: unknown }>> => {
  const result = await connection.run(
    `SELECT raw_index,
            ts_ms,
            CAST(close AS DOUBLE) AS close,
            CAST(volume AS DOUBLE) AS volume
       FROM market_bars
      WHERE instrument_id = ?
      ORDER BY ts_ms`,
    [instrumentId] as never[],
  );
  return (await result.getRowObjectsJS()) as Array<{
    raw_index?: unknown;
    ts_ms?: unknown;
    close?: unknown;
    volume?: unknown;
  }>;
};

const readMarketBars = async (
  connection: DuckDBConnection,
): Promise<Array<{ ts_ms?: unknown; close?: unknown; volume?: unknown }>> => {
  return readMarketBarsForInstrument(connection, 'instrument-aapl');
};

const readMarketTimestampsForInstrument = async (
  connection: DuckDBConnection,
  instrumentId: string,
): Promise<number[]> =>
  (await readMarketBarsForInstrument(connection, instrumentId)).map((row) => Number(row.ts_ms));

test('CSV import accepts compact datetime with a space in single timestamp column', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-compact-datetime-import-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const csvPath = path.join(tempRoot, 'EURUSD_1m_2025Q1.csv');
  await fs.writeFile(
    csvPath,
    `datetime,open,high,low,close,volume
20250102 000000,1.036930,1.036940,1.036930,1.036930,0
20250102 000100,1.036940,1.036990,1.036930,1.036940,0
`,
    'utf8',
  );

  const connection = await createMarketConnection(t);

  const [importResult] = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [
      {
        instrumentId: 'instrument-eurusd',
        symbol: 'EURUSD',
        filePath: csvPath,
        mapping: {
          timestampMode: 'SINGLE',
          date: 'datetime',
          time: '',
          open: 'open',
          high: 'high',
          low: 'low',
          close: 'close',
          volume: 'volume',
        },
        timezone: 'America/New_York',
      },
    ],
    {
      connection,
      sampleSize: 4096,
      toSafeInt,
    },
  );

  assert.equal(importResult?.validRows, 2);
  assert.equal(importResult?.importedRows, 2);
  const result = await connection.run(
    `SELECT ts_ms FROM market_bars WHERE instrument_id = 'instrument-eurusd' ORDER BY ts_ms`,
  );
  const rows = (await result.getRowObjectsJS()) as Array<{ ts_ms?: unknown }>;
  assert.deepEqual(
    rows.map((row) => Number(row.ts_ms)),
    [
      Date.parse('2025-01-02T05:00:00.000Z'),
      Date.parse('2025-01-02T05:01:00.000Z'),
    ],
  );
});

test('CSV timestamp parsing pins timezone, split time, ISO offset, epoch, and normalized date formats', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-timestamp-matrix-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const splitPath = path.join(tempRoot, 'SPLIT_1m.csv');
  const splitDateTimePath = path.join(tempRoot, 'SPLIT_DATETIME_1m.csv');
  const compactPath = path.join(tempRoot, 'COMPACT_1m.csv');
  const isoPath = path.join(tempRoot, 'ISO_1m.csv');
  const epochPath = path.join(tempRoot, 'EPOCH_1m.csv');
  await fs.writeFile(
    splitPath,
    `date,time,open,high,low,close,volume
20240310,9,1,2,0.5,1.5,100
20240311,930,2,3,1,2.5,200
20240312,093015,3,4,2,3.5,300
`,
    'utf8',
  );
  await fs.writeFile(
    splitDateTimePath,
    `datetime,time,open,high,low,close,volume
2025/3/3 00:00,14:31:00,1,2,0.5,1.5,100
2025/3/3 00:00,14:32:00,2,3,1,2.5,200
`,
    'utf8',
  );
  await fs.writeFile(
    compactPath,
    `datetime,open,high,low,close,volume
20240310,1,2,0.5,1.5,100
20240311093015,2,3,1,2.5,200
2024/03/12 09:30:00,3,4,2,3.5,300
2024.03.13 09:30:00,4,5,3,4.5,400
`,
    'utf8',
  );
  await fs.writeFile(
    isoPath,
    `datetime,open,high,low,close,volume
2024-03-10T09:30:00+09:00,1,2,0.5,1.5,100
2024-03-10T09:30:00Z,2,3,1,2.5,200
`,
    'utf8',
  );
  await fs.writeFile(
    epochPath,
    `datetime,open,high,low,close,volume
1710063000,1,2,0.5,1.5,100
1710063060000,2,3,1,2.5,200
`,
    'utf8',
  );

  const connection = await createMarketConnection(t);
  const results = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [
      {
        instrumentId: 'instrument-split',
        symbol: 'SPLIT',
        filePath: splitPath,
        mapping: {
          timestampMode: 'SPLIT',
          date: 'date',
          time: 'time',
          open: 'open',
          high: 'high',
          low: 'low',
          close: 'close',
          volume: 'volume',
        },
        timezone: 'America/New_York',
      },
      {
        instrumentId: 'instrument-split-datetime',
        symbol: 'SPLIT_DATETIME',
        filePath: splitDateTimePath,
        mapping: {
          timestampMode: 'SPLIT',
          date: 'datetime',
          time: 'time',
          open: 'open',
          high: 'high',
          low: 'low',
          close: 'close',
          volume: 'volume',
        },
        timezone: 'America/New_York',
      },
      {
        instrumentId: 'instrument-compact',
        symbol: 'COMPACT',
        filePath: compactPath,
        mapping: {
          timestampMode: 'SINGLE',
          date: 'datetime',
          time: '',
          open: 'open',
          high: 'high',
          low: 'low',
          close: 'close',
          volume: 'volume',
        },
        timezone: 'America/New_York',
      },
      {
        instrumentId: 'instrument-iso',
        symbol: 'ISO',
        filePath: isoPath,
        mapping: {
          timestampMode: 'SINGLE',
          date: 'datetime',
          time: '',
          open: 'open',
          high: 'high',
          low: 'low',
          close: 'close',
          volume: 'volume',
        },
        timezone: 'America/New_York',
      },
      {
        instrumentId: 'instrument-epoch',
        symbol: 'EPOCH',
        filePath: epochPath,
        mapping: {
          timestampMode: 'SINGLE',
          date: 'datetime',
          time: '',
          open: 'open',
          high: 'high',
          low: 'low',
          close: 'close',
          volume: 'volume',
        },
        timezone: 'America/New_York',
      },
    ],
    {
      connection,
      sampleSize: 4096,
      toSafeInt,
    },
  );

  assert.deepEqual(
    results.map((result) => [result.symbol, result.validRows, result.importedRows]),
    [
      ['SPLIT', 3, 3],
      ['SPLIT_DATETIME', 2, 2],
      ['COMPACT', 4, 4],
      ['ISO', 2, 2],
      ['EPOCH', 2, 2],
    ],
  );
  assert.deepEqual(
    await readMarketTimestampsForInstrument(connection, 'instrument-split'),
    [
      Date.parse('2024-03-10T13:00:00.000Z'),
      Date.parse('2024-03-11T13:30:00.000Z'),
      Date.parse('2024-03-12T13:30:15.000Z'),
    ],
  );
  assert.deepEqual(
    await readMarketTimestampsForInstrument(connection, 'instrument-split-datetime'),
    [
      Date.parse('2025-03-03T19:31:00.000Z'),
      Date.parse('2025-03-03T19:32:00.000Z'),
    ],
  );
  assert.deepEqual(
    await readMarketTimestampsForInstrument(connection, 'instrument-compact'),
    [
      Date.parse('2024-03-10T05:00:00.000Z'),
      Date.parse('2024-03-11T13:30:15.000Z'),
      Date.parse('2024-03-12T13:30:00.000Z'),
      Date.parse('2024-03-13T13:30:00.000Z'),
    ],
  );
  assert.deepEqual(
    await readMarketTimestampsForInstrument(connection, 'instrument-iso'),
    [
      Date.parse('2024-03-10T00:30:00.000Z'),
      Date.parse('2024-03-10T09:30:00.000Z'),
    ],
  );
  assert.deepEqual(
    await readMarketTimestampsForInstrument(connection, 'instrument-epoch'),
    [
      Date.parse('2024-03-10T09:30:00.000Z'),
      Date.parse('2024-03-10T09:31:00.000Z'),
    ],
  );
});

test('incremental CSV import writes 0 volume when source files omit volume', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-optional-volume-import-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const csvPath = path.join(tempRoot, 'AAPL_1d.csv');
  await fs.writeFile(csvPath, OHLC_CSV, 'utf8');

  const connection = await createMarketConnection(t);

  const [firstImport] = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [
      {
        instrumentId: 'instrument-aapl',
        symbol: 'AAPL',
        filePath: csvPath,
        mapping: OHLC_MAPPING,
        timezone: 'Etc/UTC',
      },
    ],
    {
      connection,
      sampleSize: 4096,
      toSafeInt,
    },
  );

  assert.equal(firstImport?.validRows, 2);
  assert.equal(firstImport?.importedRows, 2);
  const volumeResult = await connection.run(
    `SELECT raw_index, volume FROM market_bars WHERE instrument_id = 'instrument-aapl' ORDER BY ts_ms`,
  );
  const volumeRows = (await volumeResult.getRowObjectsJS()) as Array<{
    raw_index?: unknown;
    volume?: unknown;
  }>;
  assert.deepEqual(volumeRows.map((row) => Number(row.volume)), [0, 0]);
  assert.deepEqual(volumeRows.map((row) => Number(row.raw_index)), [0, 1]);

  const [secondImport] = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [
      {
        instrumentId: 'instrument-aapl',
        symbol: 'AAPL',
        filePath: csvPath,
        mapping: OHLC_MAPPING,
        timezone: 'Etc/UTC',
      },
    ],
    {
      connection,
      sampleSize: 4096,
      toSafeInt,
    },
  );

  assert.equal(secondImport?.validRows, 2);
  assert.equal(secondImport?.importedRows, 0);
  assert.equal(secondImport?.overlapRowsIgnored, 2);
});

test('incremental CSV append assigns raw indexes without a full reindex pass', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-csv-append-raw-index-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const connection = await createMarketConnection(t);
  const seedPath = path.join(tempRoot, 'AAPL_seed.csv');
  const appendPath = path.join(tempRoot, 'AAPL_append.csv');
  await writeCsvRows(seedPath, [
    { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 },
    { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
  ]);
  await writeCsvRows(appendPath, [
    { date: '2024-01-03', open: 3, high: 4, low: 2, close: 3.5 },
    { date: '2024-01-04', open: 4, high: 5, low: 3, close: 4.5 },
  ]);

  await appendCsvFile(connection, seedPath);
  const [result] = await appendCsvFile(connection, appendPath);

  assert.equal(result?.prependedRows, 0);
  assert.equal(result?.appendedRows, 2);
  assert.deepEqual(
    (await readMarketBars(connection)).map((row) => Number(row.raw_index)),
    [0, 1, 2, 3],
  );
});

test('tabular materialization treats missing optional volume as an empty mapping', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-optional-volume-materialize-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const csvPath = path.join(tempRoot, 'AAPL_1d.csv');
  const jsonPath = path.join(tempRoot, 'MSFT_1d.json');
  const parquetPath = path.join(tempRoot, 'NVDA_1d.parquet');
  const xlsxPath = path.join(tempRoot, 'TSLA_1d.xlsx');
  await fs.writeFile(csvPath, OHLC_CSV, 'utf8');
  await fs.writeFile(
    jsonPath,
    [
      JSON.stringify({ date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 }),
      JSON.stringify({ date: '2024-01-02', open: 1.1, high: 2.1, low: 0.6, close: 1.6 }),
    ].join('\n'),
    'utf8',
  );
  await writeParquetRows(
    parquetPath,
    [
      { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 },
      { date: '2024-01-02', open: 1.1, high: 2.1, low: 0.6, close: 1.6 },
    ],
    false,
  );
  const writeExcelFileModule = requireFromModule('write-excel-file/node') as WriteExcelFileNodeModule;
  const writeExcelFile = (writeExcelFileModule.default ?? writeExcelFileModule) as WriteExcelFileNode;
  await writeExcelFile(
    [
      ['date', 'open', 'high', 'low', 'close'].map((value) => ({ value })),
      [
        { value: '2024-01-01' },
        { value: 1 },
        { value: 2 },
        { value: 0.5 },
        { value: 1.5 },
      ],
      [
        { value: '2024-01-02' },
        { value: 1.1 },
        { value: 2.1 },
        { value: 0.6 },
        { value: 1.6 },
      ],
    ],
  ).toFile(xlsxPath);

  const csvMaterialized = await materializeTabularFileToImportCsv(
    csvPath,
    path.basename(csvPath),
    { ...OHLC_MAPPING, volume: 'volume' },
    appError,
  );
  const jsonMaterialized = await materializeTabularFileToImportCsv(
    jsonPath,
    path.basename(jsonPath),
    { ...OHLC_MAPPING, volume: 'volume' },
    appError,
  );
  const parquetMaterialized = await materializeTabularFileToImportCsv(
    parquetPath,
    path.basename(parquetPath),
    { ...OHLC_MAPPING, volume: 'volume' },
    appError,
  );
  const xlsxMaterialized = await materializeTabularFileToImportCsv(
    xlsxPath,
    path.basename(xlsxPath),
    { ...OHLC_MAPPING, volume: 'volume' },
    appError,
  );

  assert.equal(csvMaterialized.normalizedMapping.volume, '');
  assert.equal(jsonMaterialized.normalizedMapping.volume, '');
  assert.equal(parquetMaterialized.normalizedMapping.volume, '');
  assert.equal(xlsxMaterialized.normalizedMapping.volume, 'volume');
  const xlsxCsv = await fs.readFile(xlsxMaterialized.importCsvPath, 'utf8');
  assert.match(xlsxCsv, /2024-01-01,1,2,0\.5,1\.5,0/);
  await Promise.all([
    csvMaterialized.cleanup(),
    jsonMaterialized.cleanup(),
    parquetMaterialized.cleanup(),
    xlsxMaterialized.cleanup(),
  ]);
});

test('CSV import skips invalid rows and imports valid rows with quality counts', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-csv-import-quality-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const cases: Array<{
    name: string;
    rows: OhlcFixtureRow[];
    expectedQuality: {
      invalidRequiredRowsSkipped?: number;
      invalidOhlcRowsSkipped?: number;
      duplicateConflictRowsSkipped?: number;
    };
  }> = [
    {
      name: 'unparseable required timestamp',
      rows: [
        { date: 'not-a-date', open: 1, high: 2, low: 0.5, close: 1.5 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
      ],
      expectedQuality: { invalidRequiredRowsSkipped: 1 },
    },
    {
      name: 'unparseable required OHLC field',
      rows: [
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 'oops' },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
      ],
      expectedQuality: { invalidRequiredRowsSkipped: 1 },
    },
    {
      name: 'negative price',
      rows: [
        { date: '2024-01-01', open: -1, high: 2, low: 0.5, close: 1.5 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
      ],
      expectedQuality: { invalidOhlcRowsSkipped: 1 },
    },
    {
      name: 'high low reversal',
      rows: [
        { date: '2024-01-01', open: 1.5, high: 1, low: 2, close: 1.6 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
      ],
      expectedQuality: { invalidOhlcRowsSkipped: 1 },
    },
    {
      name: 'close outside high low range',
      rows: [
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 2.5 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
      ],
      expectedQuality: { invalidOhlcRowsSkipped: 1 },
    },
    {
      name: 'conflicting duplicate timestamp',
      rows: [
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 },
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.6 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
      ],
      expectedQuality: { duplicateConflictRowsSkipped: 2 },
    },
  ];

  for (const item of cases) {
    const connection = await createMarketConnection(t);
    const csvPath = path.join(tempRoot, `${item.name.replaceAll(' ', '-')}.csv`);
    await writeCsvRows(csvPath, item.rows);
    const [result] = await appendCsvFile(connection, csvPath);

    assert.equal(result?.validRows, 1);
    assert.equal(result?.importedRows, 1);
    assert.equal(result?.skippedRows, Math.max(1, item.expectedQuality.duplicateConflictRowsSkipped ?? 1));
    assert.equal(result?.invalidRequiredRowsSkipped, item.expectedQuality.invalidRequiredRowsSkipped ?? 0);
    assert.equal(result?.invalidOhlcRowsSkipped, item.expectedQuality.invalidOhlcRowsSkipped ?? 0);
    assert.equal(result?.duplicateConflictRowsSkipped, item.expectedQuality.duplicateConflictRowsSkipped ?? 0);
    assert.deepEqual(
      (await readMarketBars(connection)).map((row) => Number(row.close)),
      [2.5],
    );
  }
});

test('CSV import deduplicates identical timestamps and keeps missing volume at 0', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-csv-import-dedup-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const connection = await createMarketConnection(t);
  const csvPath = path.join(tempRoot, 'AAPL_1d.csv');
  await writeCsvRows(csvPath, [
    { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 },
    { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 },
  ]);

  const [result] = await appendCsvFile(connection, csvPath);

  assert.equal(result?.validRows, 1);
  assert.equal(result?.importedRows, 1);
  assert.equal(result?.skippedRows, 1);
  assert.equal(result?.duplicateIdenticalRowsDeduped, 1);
  const rows = await readMarketBars(connection);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0]?.volume), 0);
});

test('incremental CSV import accepts boundary prepend and append with exact overlap only', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-csv-incremental-boundary-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const connection = await createMarketConnection(t);
  const seedPath = path.join(tempRoot, 'AAPL_seed.csv');
  const updatePath = path.join(tempRoot, 'AAPL_update.csv');
  await writeCsvRows(seedPath, [
    { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
  ]);
  await writeCsvRows(updatePath, [
    { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 },
    { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
    { date: '2024-01-03', open: 3, high: 4, low: 2, close: 3.5 },
  ]);

  await appendCsvFile(connection, seedPath);
  const [result] = await appendCsvFile(connection, updatePath);

  assert.equal(result?.validRows, 3);
  assert.equal(result?.prependedRows, 1);
  assert.equal(result?.appendedRows, 1);
  assert.equal(result?.overlapRowsIgnored, 1);
  assert.equal(result?.importedRows, 2);
  assert.deepEqual(
    (await readMarketBars(connection)).map((row) => Number(row.close)),
    [1.5, 2.5, 3.5],
  );
});

test('incremental CSV import reports internal history edits without mutating that instrument', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-csv-incremental-reimport-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const connection = await createMarketConnection(t);
  const seedPath = path.join(tempRoot, 'AAPL_seed.csv');
  const internalInsertPath = path.join(tempRoot, 'AAPL_internal.csv');
  const overlapConflictPath = path.join(tempRoot, 'AAPL_conflict.csv');
  await writeCsvRows(seedPath, [
    { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 },
    { date: '2024-01-03', open: 3, high: 4, low: 2, close: 3.5 },
  ]);
  await writeCsvRows(internalInsertPath, [
    { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
  ]);
  await writeCsvRows(overlapConflictPath, [
    { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.6 },
  ]);

  await appendCsvFile(connection, seedPath);
  const beforeRows = await readMarketBars(connection);
  const [internalInsertResult] = await appendCsvFile(connection, internalInsertPath);
  assert.equal(internalInsertResult?.validRows, 1);
  assert.equal(internalInsertResult?.importedRows, 0);
  assert.equal(internalInsertResult?.internalRangeRowsIgnored, 1);
  assert.equal(internalInsertResult?.conflictRowsIgnored, 0);
  assert.equal(internalInsertResult?.errorMessage, 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');
  assert.deepEqual(await readMarketBars(connection), beforeRows);

  const [overlapConflictResult] = await appendCsvFile(connection, overlapConflictPath);
  assert.equal(overlapConflictResult?.validRows, 1);
  assert.equal(overlapConflictResult?.importedRows, 0);
  assert.equal(overlapConflictResult?.internalRangeRowsIgnored, 0);
  assert.equal(overlapConflictResult?.conflictRowsIgnored, 1);
  assert.equal(overlapConflictResult?.errorMessage, 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');
  assert.deepEqual(await readMarketBars(connection), beforeRows);
});

test('incremental CSV import commits valid instruments when another instrument requires full reimport', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-csv-incremental-partial-reimport-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const connection = await createMarketConnection(t);
  const seedPath = path.join(tempRoot, 'AAPL_seed.csv');
  const internalRepairPath = path.join(tempRoot, 'AAPL_internal.csv');
  const newSymbolPath = path.join(tempRoot, 'MSFT_new.csv');
  await writeCsvRows(seedPath, [
    { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 },
    { date: '2024-01-03', open: 3, high: 4, low: 2, close: 3.5 },
  ]);
  await writeCsvRows(internalRepairPath, [
    { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5 },
  ]);
  await writeCsvRows(newSymbolPath, [
    { date: '2024-01-04', open: 4, high: 5, low: 3, close: 4.5 },
  ]);

  await appendCsvFile(connection, seedPath);
  const aaplBeforeRows = await readMarketBarsForInstrument(connection, 'instrument-aapl');
  const results = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [
      {
        instrumentId: 'instrument-aapl',
        symbol: 'AAPL',
        filePath: internalRepairPath,
        mapping: { ...OHLC_MAPPING, volume: 'volume' },
        timezone: 'Etc/UTC',
      },
      {
        instrumentId: 'instrument-msft',
        symbol: 'MSFT',
        filePath: newSymbolPath,
        mapping: { ...OHLC_MAPPING, volume: 'volume' },
        timezone: 'Etc/UTC',
      },
    ],
    {
      connection,
      sampleSize: 4096,
      toSafeInt,
    },
  );

  const aaplResult = results.find((result) => result.symbol === 'AAPL');
  const msftResult = results.find((result) => result.symbol === 'MSFT');
  assert.equal(aaplResult?.importedRows, 0);
  assert.equal(aaplResult?.internalRangeRowsIgnored, 1);
  assert.equal(aaplResult?.errorMessage, 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');
  assert.equal(msftResult?.validRows, 1);
  assert.equal(msftResult?.importedRows, 1);
  assert.equal(msftResult?.appendedRows, 1);
  assert.equal(msftResult?.errorMessage, undefined);
  assert.deepEqual(await readMarketBarsForInstrument(connection, 'instrument-aapl'), aaplBeforeRows);
  assert.deepEqual(
    (await readMarketBarsForInstrument(connection, 'instrument-msft')).map((row) => Number(row.close)),
    [4.5],
  );
});

test('all supported tabular formats import and incrementally update only edge bars', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-incremental-matrix-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  for (const formatCase of TABULAR_FORMAT_CASES) {
    await t.test(formatCase.name, async (t) => {
      const connection = await createMarketConnection(t);
      const baseName = formatCase.name.toLowerCase();
      const seedPath = path.join(tempRoot, `${baseName}-seed.${formatCase.extension}`);
      const updatePath = path.join(tempRoot, `${baseName}-update.${formatCase.extension}`);
      await formatCase.write(seedPath, [
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
      ]);
      await formatCase.write(updatePath, [
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
        { date: '2024-01-03', open: 3, high: 4, low: 2, close: 3.5, volume: 300 },
      ]);

      const [seedResult] = await appendTabularFile(connection, seedPath);
      assert.equal(seedResult?.validRows, 1);
      assert.equal(seedResult?.importedRows, 1);

      const [updateResult] = await appendTabularFile(connection, updatePath);
      assert.equal(updateResult?.validRows, 3);
      assert.equal(updateResult?.prependedRows, 1);
      assert.equal(updateResult?.appendedRows, 1);
      assert.equal(updateResult?.overlapRowsIgnored, 1);
      assert.equal(updateResult?.internalRangeRowsIgnored, 0);
      assert.equal(updateResult?.conflictRowsIgnored, 0);
      assert.equal(updateResult?.importedRows, 2);
      assert.deepEqual(
        (await readMarketBars(connection)).map((row) => Number(row.close)),
        [1.5, 2.5, 3.5],
      );
    });
  }
});

test('all supported tabular formats read exact file paths with legal trailing whitespace', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-path-whitespace-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  for (const formatCase of TABULAR_FORMAT_CASES) {
    await t.test(formatCase.name, async (t) => {
      const connection = await createMarketConnection(t);
      const filePath = path.join(
        tempRoot,
        `${formatCase.name.toLowerCase()}.${formatCase.extension} `,
      );
      await formatCase.write(filePath, [
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
      ]);

      const [result] = await appendTabularFile(connection, filePath);

      assert.equal(result?.validRows, 1);
      assert.equal(result?.importedRows, 1);
      assert.deepEqual(
        (await readMarketBars(connection)).map((row) => Number(row.close)),
        [2.5],
      );
    });
  }
});

test('all supported tabular formats read POSIX file names with literal backslashes', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows treats backslash as a native path separator');
    return;
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-path-backslash-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  for (const formatCase of TABULAR_FORMAT_CASES) {
    await t.test(formatCase.name, async (t) => {
      const connection = await createMarketConnection(t);
      const fileName = `group\\${formatCase.name.toLowerCase()}.${formatCase.extension}`;
      const filePath = path.join(tempRoot, fileName);
      await formatCase.write(filePath, [
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
      ]);

      const [result] = await appendTabularFile(connection, filePath);

      assert.equal(result?.validRows, 1);
      assert.equal(result?.importedRows, 1);
      assert.deepEqual(
        (await readMarketBars(connection)).map((row) => Number(row.close)),
        [2.5],
      );
    });
  }
});

test('all supported tabular formats skip invalid rows without dropping valid bars', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-invalid-matrix-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const invalidCases: Array<{
    name: string;
    rows: OhlcFixtureRow[];
    expectedQuality: {
      invalidRequiredRowsSkipped?: number;
      invalidOhlcRowsSkipped?: number;
      duplicateConflictRowsSkipped?: number;
    };
  }> = [
    {
      name: 'invalid timestamp',
      rows: [
        { date: 'not-a-date', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
      ],
      expectedQuality: { invalidRequiredRowsSkipped: 1 },
    },
    {
      name: 'invalid OHLC',
      rows: [
        { date: '2024-01-01', open: 1.5, high: 1, low: 2, close: 1.6, volume: 100 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
      ],
      expectedQuality: { invalidOhlcRowsSkipped: 1 },
    },
    {
      name: 'conflicting duplicate timestamp',
      rows: [
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.6, volume: 100 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
      ],
      expectedQuality: { duplicateConflictRowsSkipped: 2 },
    },
  ];

  for (const formatCase of TABULAR_FORMAT_CASES) {
    for (const invalidCase of invalidCases) {
      await t.test(`${formatCase.name} ${invalidCase.name}`, async (t) => {
        const connection = await createMarketConnection(t);
        const filePath = path.join(
          tempRoot,
          `${formatCase.name.toLowerCase()}-${invalidCase.name.replaceAll(' ', '-')}.${formatCase.extension}`,
        );
        await formatCase.write(filePath, invalidCase.rows);

        const [result] = await appendTabularFile(connection, filePath);

        assert.equal(result?.validRows, 1);
        assert.equal(result?.importedRows, 1);
        assert.equal(result?.invalidRequiredRowsSkipped, invalidCase.expectedQuality.invalidRequiredRowsSkipped ?? 0);
        assert.equal(result?.invalidOhlcRowsSkipped, invalidCase.expectedQuality.invalidOhlcRowsSkipped ?? 0);
        assert.equal(result?.duplicateConflictRowsSkipped, invalidCase.expectedQuality.duplicateConflictRowsSkipped ?? 0);
        assert.deepEqual(
          (await readMarketBars(connection)).map((row) => Number(row.close)),
          [2.5],
        );
      });
    }
  }
});

test('all supported tabular formats report full reimport for internal incremental repairs', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-incremental-repair-matrix-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  for (const formatCase of TABULAR_FORMAT_CASES) {
    await t.test(formatCase.name, async (t) => {
      const connection = await createMarketConnection(t);
      const baseName = formatCase.name.toLowerCase();
      const seedPath = path.join(tempRoot, `${baseName}-repair-seed.${formatCase.extension}`);
      const internalInsertPath = path.join(tempRoot, `${baseName}-repair-internal.${formatCase.extension}`);
      const overlapConflictPath = path.join(tempRoot, `${baseName}-repair-conflict.${formatCase.extension}`);
      await formatCase.write(seedPath, [
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { date: '2024-01-03', open: 3, high: 4, low: 2, close: 3.5, volume: 300 },
      ]);
      await formatCase.write(internalInsertPath, [
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
      ]);
      await formatCase.write(overlapConflictPath, [
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.6, volume: 100 },
      ]);

      await appendTabularFile(connection, seedPath);
      const beforeRows = await readMarketBars(connection);
      const [internalInsertResult] = await appendTabularFile(connection, internalInsertPath);
      assert.equal(internalInsertResult?.validRows, 1);
      assert.equal(internalInsertResult?.importedRows, 0);
      assert.equal(internalInsertResult?.internalRangeRowsIgnored, 1);
      assert.equal(internalInsertResult?.conflictRowsIgnored, 0);
      assert.equal(internalInsertResult?.errorMessage, 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');
      assert.deepEqual(await readMarketBars(connection), beforeRows);

      const [overlapConflictResult] = await appendTabularFile(connection, overlapConflictPath);
      assert.equal(overlapConflictResult?.validRows, 1);
      assert.equal(overlapConflictResult?.importedRows, 0);
      assert.equal(overlapConflictResult?.internalRangeRowsIgnored, 0);
      assert.equal(overlapConflictResult?.conflictRowsIgnored, 1);
      assert.equal(overlapConflictResult?.errorMessage, 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');
      assert.deepEqual(await readMarketBars(connection), beforeRows);
    });
  }
});

test('incremental tabular workflow keeps valid updates when another file in the run is bad', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-partial-bad-files-'));
  const tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-partial-bad-data-'));
  const previousDataDir = process.env.ZINUTO_DATA_DIR;
  process.env.ZINUTO_DATA_DIR = tempDataDir;

  let closeMarketDatabase: (() => Promise<void>) | null = null;
  let closeLocalDatabase: (() => void) | null = null;
  t.after(async () => {
    await closeMarketDatabase?.();
    closeLocalDatabase?.();
    if (previousDataDir === undefined) {
      delete process.env.ZINUTO_DATA_DIR;
    } else {
      process.env.ZINUTO_DATA_DIR = previousDataDir;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.rm(tempDataDir, { recursive: true, force: true });
  });

  const [
    { importCsvFilesBatchedWithProgress, importCsvFilesIncrementalWithProgress },
    { closeMarketDatabase: closeMarketDatabaseImported, getMarketBarsByInstrumentId },
    { closeLocalDatabase: closeLocalDatabaseImported },
    { dataSourceRepository },
  ] = await Promise.all([
    import('../../src/application/dataSource/tabularImport.js'),
    import('../../src/infrastructure/db/marketDatabase.js'),
    import('../../src/infrastructure/db/database.js'),
    import('../../src/infrastructure/db/dataSource/dataSourceRepository.js'),
  ]);
  closeMarketDatabase = closeMarketDatabaseImported;
  closeLocalDatabase = closeLocalDatabaseImported;

  const insertReadySource = (sourceId: string): void => {
    const createdAt = new Date().toISOString();
    dataSourceRepository.insertSourceStmt.run(
      sourceId,
      sourceId,
      tempRoot,
      '',
      'FLAT',
      '',
      'Etc/UTC',
      'USER_SELECTED',
      '1d',
      'STOCK',
      'A_SHARE',
      'USER',
      '{}',
      DEFAULT_TRADING_CALENDAR_JSON,
      'READY',
      0,
      0,
      0,
      0,
      0,
      0,
      null,
      null,
      null,
      createdAt,
      createdAt,
    );
  };

  for (const formatCase of TABULAR_FORMAT_CASES) {
    await t.test(formatCase.name, async () => {
      const baseName = formatCase.name.toLowerCase();
      const sourceId = `source-partial-${baseName}`;
      const symbol = `${formatCase.extension.toUpperCase()}OK`;
      const badSymbol = `${formatCase.extension.toUpperCase()}BAD`;
      const seedPath = path.join(tempRoot, `${baseName}-partial-seed.${formatCase.extension}`);
      const updatePath = path.join(tempRoot, `${baseName}-partial-update.${formatCase.extension}`);
      const badPath = path.join(tempRoot, `${baseName}-partial-bad.${formatCase.extension}`);
      await formatCase.write(seedPath, [
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
      ]);
      await formatCase.write(updatePath, [
        { date: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
        { date: '2024-01-03', open: 3, high: 4, low: 2, close: 3.5, volume: 300 },
      ]);
      await formatCase.write(badPath, [
        { date: '2024-01-04', open: 4, high: 3, low: 5, close: 4.5, volume: 400 },
      ]);
      insertReadySource(sourceId);

      const [seedResult] = await importCsvFilesIncrementalWithProgress(
        [
          {
            originalname: path.basename(seedPath),
            path: seedPath,
            symbol,
          },
        ],
        { ...OHLC_MAPPING, volume: 'volume' },
        'Etc/UTC',
        () => undefined,
        { baseTimeframe: '1d', sourceId },
      );
      assert.equal(seedResult?.rows, 1);
      assert.equal(seedResult?.errorMessage, undefined);

      const results = await importCsvFilesIncrementalWithProgress(
        [
          {
            originalname: path.basename(updatePath),
            path: updatePath,
            symbol,
          },
          {
            originalname: path.basename(badPath),
            path: badPath,
            symbol: badSymbol,
          },
        ],
        { ...OHLC_MAPPING, volume: 'volume' },
        'Etc/UTC',
        () => undefined,
        { baseTimeframe: '1d', sourceId },
      );
      const updateResult = results.find((result) => result.symbol === symbol);
      const badResult = results.find((result) => result.symbol === badSymbol);

      assert.equal(updateResult?.rows, 2);
      assert.equal(updateResult?.prependedRows, 1);
      assert.equal(updateResult?.appendedRows, 1);
      assert.equal(updateResult?.overlapRowsIgnored, 1);
      assert.equal(updateResult?.errorMessage, undefined);
      assert.equal(badResult?.rows, 0);
      assert.equal(badResult?.invalidOhlcRowsSkipped, 1);
      assert.equal(badResult?.errorMessage, 'CSV_NO_VALID_BARS');

      const validBars = await getMarketBarsByInstrumentId(String(seedResult?.instrumentId ?? ''));
      assert.deepEqual(
        validBars.map((row) => row.close),
        [1.5, 2.5, 3.5],
      );
      if (badResult?.instrumentId) {
        assert.deepEqual(await getMarketBarsByInstrumentId(badResult.instrumentId), []);
      }

      const repairSourceId = `source-partial-reimport-${baseName}`;
      const repairSymbol = `${formatCase.extension.toUpperCase()}REPAIR`;
      const addedSymbol = `${formatCase.extension.toUpperCase()}ADD`;
      const repairSeedPath = path.join(tempRoot, `${baseName}-repair-seed.${formatCase.extension}`);
      const repairInternalPath = path.join(tempRoot, `${baseName}-repair-internal.${formatCase.extension}`);
      const addedSymbolPath = path.join(tempRoot, `${baseName}-repair-added.${formatCase.extension}`);
      insertReadySource(repairSourceId);
      await formatCase.write(repairSeedPath, [
        { date: '2024-04-01', open: 10, high: 12, low: 9, close: 11, volume: 1000 },
        { date: '2024-04-03', open: 12, high: 14, low: 11, close: 13, volume: 1200 },
      ]);
      await formatCase.write(repairInternalPath, [
        { date: '2024-04-02', open: 11, high: 13, low: 10, close: 12, volume: 1100 },
      ]);
      await formatCase.write(addedSymbolPath, [
        { date: '2024-04-04', open: 20, high: 22, low: 19, close: 21, volume: 2000 },
      ]);

      const [repairSeedResult] = await importCsvFilesIncrementalWithProgress(
        [
          {
            originalname: path.basename(repairSeedPath),
            path: repairSeedPath,
            symbol: repairSymbol,
          },
        ],
        { ...OHLC_MAPPING, volume: 'volume' },
        'Etc/UTC',
        () => undefined,
        { baseTimeframe: '1d', sourceId: repairSourceId },
      );
      assert.equal(repairSeedResult?.rows, 2);
      const repairRunResults = await importCsvFilesIncrementalWithProgress(
        [
          {
            originalname: path.basename(repairInternalPath),
            path: repairInternalPath,
            symbol: repairSymbol,
          },
          {
            originalname: path.basename(addedSymbolPath),
            path: addedSymbolPath,
            symbol: addedSymbol,
          },
        ],
        { ...OHLC_MAPPING, volume: 'volume' },
        'Etc/UTC',
        () => undefined,
        { baseTimeframe: '1d', sourceId: repairSourceId },
      );
      const repairResult = repairRunResults.find((result) => result.symbol === repairSymbol);
      const addedResult = repairRunResults.find((result) => result.symbol === addedSymbol);
      assert.equal(repairResult?.rows, 0);
      assert.equal(repairResult?.internalRangeRowsIgnored, 1);
      assert.equal(repairResult?.errorMessage, 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');
      assert.equal(addedResult?.rows, 1);
      assert.equal(addedResult?.appendedRows, 1);
      assert.equal(addedResult?.errorMessage, undefined);
      assert.deepEqual(
        (await getMarketBarsByInstrumentId(String(repairSeedResult?.instrumentId ?? ''))).map((row) => row.close),
        [11, 13],
      );
      assert.deepEqual(
        (await getMarketBarsByInstrumentId(String(addedResult?.instrumentId ?? ''))).map((row) => row.close),
        [21],
      );

      const reimportSourceId = `source-full-reimport-${baseName}`;
      const fullSeedPath = path.join(tempRoot, `${baseName}-full-seed.${formatCase.extension}`);
      const fullBadPath = path.join(tempRoot, `${baseName}-full-bad.${formatCase.extension}`);
      const fullNewBadPath = path.join(tempRoot, `${baseName}-full-new-bad.${formatCase.extension}`);
      const fullSymbol = `${formatCase.extension.toUpperCase()}FULL`;
      const fullNewBadSymbol = `${formatCase.extension.toUpperCase()}NEWBAD`;
      insertReadySource(reimportSourceId);
      await formatCase.write(fullSeedPath, [
        { date: '2024-02-01', open: 10, high: 12, low: 9, close: 11, volume: 1000 },
        { date: '2024-02-02', open: 11, high: 13, low: 10, close: 12, volume: 1100 },
      ]);
      await formatCase.write(fullBadPath, [
        { date: '2024-02-03', open: 12, high: 11, low: 14, close: 12.5, volume: 1200 },
      ]);
      await formatCase.write(fullNewBadPath, [
        { date: '2024-03-01', open: 3, high: 2, low: 4, close: 3.5, volume: 300 },
      ]);

      const [fullSeedResult] = await importCsvFilesBatchedWithProgress(
        [
          {
            originalname: path.basename(fullSeedPath),
            path: fullSeedPath,
            symbol: fullSymbol,
          },
        ],
        { ...OHLC_MAPPING, volume: 'volume' },
        'Etc/UTC',
        () => undefined,
        { baseTimeframe: '1d', sourceId: reimportSourceId },
      );
      assert.equal(fullSeedResult?.rows, 2);
      assert.equal(fullSeedResult?.errorMessage, undefined);
      const fullBarsBefore = await getMarketBarsByInstrumentId(String(fullSeedResult?.instrumentId ?? ''));

      const [fullBadResult] = await importCsvFilesBatchedWithProgress(
        [
          {
            originalname: path.basename(fullBadPath),
            path: fullBadPath,
            symbol: fullSymbol,
          },
        ],
        { ...OHLC_MAPPING, volume: 'volume' },
        'Etc/UTC',
        () => undefined,
        { baseTimeframe: '1d', sourceId: reimportSourceId },
      );
      assert.equal(fullBadResult?.rows, 0);
      assert.equal(fullBadResult?.invalidOhlcRowsSkipped, 1);
      assert.equal(fullBadResult?.errorMessage, 'CSV_NO_VALID_BARS');
      assert.deepEqual(
        await getMarketBarsByInstrumentId(String(fullSeedResult?.instrumentId ?? '')),
        fullBarsBefore,
      );

      const [fullNewBadResult] = await importCsvFilesBatchedWithProgress(
        [
          {
            originalname: path.basename(fullNewBadPath),
            path: fullNewBadPath,
            symbol: fullNewBadSymbol,
          },
        ],
        { ...OHLC_MAPPING, volume: 'volume' },
        'Etc/UTC',
        () => undefined,
        { baseTimeframe: '1d', sourceId: reimportSourceId },
      );
      assert.equal(fullNewBadResult?.rows, 0);
      assert.equal(fullNewBadResult?.invalidOhlcRowsSkipped, 1);
      assert.equal(fullNewBadResult?.errorMessage, 'CSV_NO_VALID_BARS');
      assert.deepEqual(
        await getMarketBarsByInstrumentId(String(fullNewBadResult?.instrumentId ?? '')),
        [],
      );
      assert.equal(
        dataSourceRepository.getLocalInstrumentBySymbolStmt.get(
          reimportSourceId,
          fullNewBadSymbol,
          '1d',
        ),
        undefined,
      );
    });
  }
});

test('JSON, Parquet, and XLSX tabular imports skip OHLC violations', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-import-quality-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  const invalidRows: OhlcFixtureRow[] = [
    { date: '2024-01-01', open: 1.5, high: 1, low: 2, close: 1.6, volume: 100 },
    { date: '2024-01-02', open: 2, high: 3, low: 1, close: 2.5, volume: 200 },
  ];

  const cases = [
    {
      name: 'json',
      fileName: 'AAPL_1d.json',
      inputFormat: 'json' as const,
      write: writeJsonRows,
      materialize: false,
    },
    {
      name: 'parquet',
      fileName: 'AAPL_1d.parquet',
      inputFormat: 'parquet' as const,
      write: writeParquetRows,
      materialize: false,
    },
    {
      name: 'xlsx',
      fileName: 'AAPL_1d.xlsx',
      inputFormat: 'csv' as const,
      write: writeXlsxRows,
      materialize: true,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async (t) => {
      const connection = await createMarketConnection(t);
      const filePath = path.join(tempRoot, item.fileName);
      await item.write(filePath, invalidRows);
      let importPath = filePath;
      let mapping = { ...OHLC_MAPPING, volume: 'volume' };
      let cleanup = async () => undefined;
      if (item.materialize) {
        const materialized = await materializeTabularFileToImportCsv(
          filePath,
          path.basename(filePath),
          mapping,
          appError,
        );
        importPath = materialized.importCsvPath;
        mapping = materialized.normalizedMapping;
        cleanup = materialized.cleanup;
      }
      t.after(async () => {
        await cleanup();
      });

      const [result] = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
        [
          {
            instrumentId: 'instrument-aapl',
            symbol: 'AAPL',
            filePath: importPath,
            inputFormat: item.inputFormat,
            mapping,
            timezone: 'Etc/UTC',
          },
        ],
        {
          connection,
          sampleSize: 4096,
          toSafeInt,
        },
      );
      assert.equal(result?.validRows, 1);
      assert.equal(result?.importedRows, 1);
      assert.equal(result?.invalidOhlcRowsSkipped, 1);
      assert.deepEqual(
        (await readMarketBars(connection)).map((row) => Number(row.close)),
        [2.5],
      );
    });
  }
});
