// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { DuckDBConnection } from '@duckdb/node-api';
import { parseCsvTimestampValue } from '@zinuto/shared/csv';

import { previewLocalDataImportFolderCore } from '../../src/application/dataSource/folderPreview.js';
import { parseSymbolFromFileName } from '../../src/application/dataSource/sourceIdentity.js';
import { readTabularHeadersFromPath } from '../../src/application/dataSource/tabularFileUtils.js';
import { appError } from '../../src/kernel/appError.js';
import { appendEdgeBarsForInstrumentsFromCsvFilesBatchCore } from '../../src/infrastructure/db/marketCsvEdgeAppend.js';
import {
  buildCsvDedupedRowsFromClassifiedRowsSql,
  buildCsvImportClassifiedRowsSql,
  buildCsvImportValidationSummarySql,
  buildCsvTimestampMsExpr,
} from '../../src/infrastructure/db/marketCsvImportSql.js';
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
} from '../../src/infrastructure/db/marketDatabase/ohlcvSql.js';

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

const CANONICAL_HEADERS = ['date', 'open', 'high', 'low', 'close', 'volume'];

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

const toSafeInt = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const quoteDuckLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;

const createPreviewDeps = () => {
  let idCursor = 0;
  return {
    normalizeImportFilePath: (input: string) => path.resolve(String(input || '').trim()),
    assertManagedImportTempPath: (_filePath: string) => undefined,
    parseSymbolFromFileName,
    createId: () => `adversarial-plan-${++idCursor}`,
  };
};

const createTempRoot = async (t: TestContext, prefix: string): Promise<string> => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
  return tempRoot;
};

const readValidationSummary = async (
  connection: DuckDBConnection,
  sourceSql: string,
): Promise<Record<string, unknown>> => {
  const result = await connection.run(
    buildCsvImportValidationSummarySql({
      sourceSql,
      mapping: FIELD_MAPPING,
      timezone: 'Etc/UTC',
    }),
  );
  return (await result.getRowObjectsJS())[0] as Record<string, unknown>;
};

test('OHLCV validation rejects every non-finite numeric value', async (t) => {
  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  const cases = [
    {
      name: 'positive infinity high',
      row: "('2024-01-01', '1', 'Infinity', '0.5', '1.5', '100')",
    },
    {
      name: 'all NaN prices',
      row: "('2024-01-01', 'NaN', 'NaN', 'NaN', 'NaN', '100')",
    },
    {
      name: 'positive infinity volume',
      row: "('2024-01-01', '1', '2', '0.5', '1.5', 'Infinity')",
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const sourceSql = `(
        SELECT *
          FROM (VALUES ${item.row})
            AS source(date, open, high, low, close, volume)
      )`;
      const summary = await readValidationSummary(connection, sourceSql);
      assert.equal(
        Number(summary.valid_rows ?? 0),
        0,
        `${item.name} must never be classified as an importable bar`,
      );
      assert.ok(
        Number(summary.required_invalid_rows ?? 0) +
          Number(summary.ohlc_invalid_rows ?? 0) >=
          1,
        `${item.name} must be counted as an invalid row`,
      );
    });
  }
});

test('ambiguous decimal commas are rejected or preserved, never stripped into another value', async (t) => {
  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  const sourceSql = `(
    SELECT *
      FROM (VALUES ('2024-01-01', '1,0', '2,0', '0,5', '1,5', '1,2'))
        AS source(date, open, high, low, close, volume)
  )`;
  await connection.run(
    `CREATE TEMP TABLE decimal_comma_stage AS
     ${buildCsvImportClassifiedRowsSql({
       sourceSql,
       mapping: FIELD_MAPPING,
       timezone: 'Etc/UTC',
     })}`,
  );
  const summaryResult = await connection.run(
    buildCsvImportValidationSummarySql({
      sourceSql,
      mapping: FIELD_MAPPING,
      timezone: 'Etc/UTC',
    }),
  );
  const [summary = {}] = await summaryResult.getRowObjectsJS() as Array<Record<string, unknown>>;
  const validRows = Number(summary.valid_rows ?? 0);
  if (validRows === 0) {
    assert.ok(
      Number(summary.required_invalid_rows ?? 0) +
        Number(summary.ohlc_invalid_rows ?? 0) >=
        1,
      'a rejected decimal-comma row must be reported as invalid',
    );
    return;
  }

  const dedupedResult = await connection.run(
    buildCsvDedupedRowsFromClassifiedRowsSql('decimal_comma_stage'),
  );
  const [row] = await dedupedResult.getRowObjectsJS() as Array<Record<string, unknown>>;
  assert.deepEqual(
    [row?.open, row?.high, row?.low, row?.close, row?.volume].map(Number),
    [1, 2, 0.5, 1.5, 1.2],
    'locale decimal separators must retain their decimal meaning',
  );
});

test('preview and execution preserve absolute UTC and GMT timestamps', async (t) => {
  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  const expected = Date.parse('2024-01-01T09:30:00.000Z');
  const timestampExpr = buildCsvTimestampMsExpr('raw_timestamp', 'America/New_York');

  for (const raw of ['2024-01-01 09:30:00 UTC', '2024-01-01 09:30:00 GMT']) {
    await t.test(raw, async () => {
      const previewTimestamp = parseCsvTimestampValue(raw, 'America/New_York');
      const result = await connection.run(
        `SELECT ${timestampExpr} AS timestamp_ms
           FROM (SELECT ? AS raw_timestamp)`,
        [raw],
      );
      const [row] = await result.getRowObjectsJS() as Array<{ timestamp_ms?: unknown }>;
      const executionTimestamp = row?.timestamp_ms == null
        ? null
        : Number(row.timestamp_ms);
      assert.equal(previewTimestamp, expected);
      assert.equal(executionTimestamp, expected);
    });
  }
});

test('preview and execution choose the same DST fallback instant', async (t) => {
  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  const raw = '2024-11-03 01:30:00';
  const previewTimestamp = parseCsvTimestampValue(raw, 'America/New_York');
  const timestampExpr = buildCsvTimestampMsExpr('raw_timestamp', 'America/New_York');
  const result = await connection.run(
    `SELECT ${timestampExpr} AS timestamp_ms
       FROM (SELECT ? AS raw_timestamp)`,
    [raw],
  );
  const [row] = await result.getRowObjectsJS() as Array<{ timestamp_ms?: unknown }>;
  const executionTimestamp = row?.timestamp_ms == null
    ? null
    : Number(row.timestamp_ms);

  assert.equal(
    executionTimestamp,
    previewTimestamp,
    'the previewed instant must be the instant that is persisted',
  );
});

test('preview and execution reject invalid calendar rollover and agree on microseconds', async (t) => {
  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  const timestampExpr = buildCsvTimestampMsExpr('raw_timestamp', 'Etc/UTC');
  const cases = [
    { raw: '2024-02-30 09:30:00', expected: null },
    { raw: '2024-01-01 24:00:00', expected: null },
    { raw: '2024-01-01 09:30:00.123456', expected: Date.parse('2024-01-01T09:30:00.123Z') },
  ];
  for (const item of cases) {
    const previewTimestamp = parseCsvTimestampValue(item.raw, 'Etc/UTC');
    const result = await connection.run(
      `SELECT ${timestampExpr} AS timestamp_ms FROM (SELECT ? AS raw_timestamp)`,
      [item.raw],
    );
    const [row] = await result.getRowObjectsJS() as Array<{ timestamp_ms?: unknown }>;
    const executionTimestamp = row?.timestamp_ms == null ? null : Number(row.timestamp_ms);
    assert.equal(previewTimestamp, item.expected, item.raw);
    assert.equal(executionTimestamp, item.expected, item.raw);
  }
});

test('CSV structural width errors are rejected or counted without silent row loss', async (t) => {
  const tempRoot = await createTempRoot(t, 'zinuto-import-width-safety-');
  const cases = [
    {
      name: 'missing trailing columns',
      body: `date,open,high,low,close,volume
2024-01-01,1,2,0.5
2024-01-02,1.1,2.1,0.6
2024-01-03,1.2,2.2,0.7
`,
    },
    {
      name: 'extra trailing columns',
      body: `date,open,high,low,close,volume
2024-01-01,1,2,0.5,1.5,100,EXTRA
2024-01-02,1.1,2.1,0.6,1.6,110,EXTRA
2024-01-03,1.2,2.2,0.7,1.7,120,EXTRA
`,
    },
  ];

  for (const [index, item] of cases.entries()) {
    await t.test(item.name, async (t) => {
      const filePath = path.join(tempRoot, `width-${index}.csv`);
      await fs.writeFile(filePath, item.body, 'utf8');
      const connection = await DuckDBConnection.create();
      t.after(() => {
        connection.closeSync();
      });
      await connection.run(MARKET_BARS_SCHEMA_SQL);

      let result: Awaited<ReturnType<typeof appendEdgeBarsForInstrumentsFromCsvFilesBatchCore>> | null = null;
      let rejected = false;
      try {
        result = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
          [{
            instrumentId: `instrument-width-${index}`,
            symbol: `WIDTH${index}`,
            filePath,
            inputFormat: 'csv',
            mapping: FIELD_MAPPING,
            timezone: 'Etc/UTC',
          }],
          {
            connection,
            sampleSize: 4096,
            toSafeInt,
          },
        );
      } catch {
        rejected = true;
      }

      const countResult = await connection.run('SELECT COUNT(*) AS count FROM market_bars');
      const [countRow] = await countResult.getRowObjectsJS() as Array<{ count?: unknown }>;
      assert.equal(Number(countRow?.count ?? 0), 0);
      if (rejected) {
        return;
      }
      assert.equal(Number(result?.[0]?.validRows ?? 0), 0);
      assert.equal(Number(result?.[0]?.importedRows ?? 0), 0);
      assert.equal(
        Number(result?.[0]?.skippedRows ?? 0),
        3,
        'every malformed physical data row must be represented in the outcome',
      );
    });
  }
});

test('CR-only CSV uses the same canonical header row as LF and CRLF files', async (t) => {
  const tempRoot = await createTempRoot(t, 'zinuto-import-cr-only-');
  const filePath = path.join(tempRoot, 'AAPL_1d.csv');
  await fs.writeFile(
    filePath,
    [
      CANONICAL_HEADERS.join(','),
      '2024-01-01,1,2,0.5,1.5,100',
      '2024-01-02,1.1,2.1,0.6,1.6,110',
      '2024-01-03,1.2,2.2,0.7,1.7,120',
    ].join('\r') + '\r',
    'utf8',
  );

  const { headers } = await readTabularHeadersFromPath(filePath, appError);
  assert.deepEqual(headers, CANONICAL_HEADERS);

  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  await connection.run(MARKET_BARS_SCHEMA_SQL);
  const [result] = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [{
      instrumentId: 'instrument-cr-only',
      symbol: 'AAPL',
      filePath,
      inputFormat: 'csv',
      mapping: FIELD_MAPPING,
      timezone: 'Etc/UTC',
    }],
    { connection, sampleSize: 4096, toSafeInt },
  );
  assert.equal(result?.validRows, 3);
  assert.equal(result?.importedRows, 3);
});

test('UTF-16 BOM input is decoded correctly or rejected as an encoding error', async (t) => {
  const tempRoot = await createTempRoot(t, 'zinuto-import-utf16-');
  const filePath = path.join(tempRoot, 'AAPL_1d.csv');
  const text = `${CANONICAL_HEADERS.join(',')}\n` +
    '2024-01-01,1,2,0.5,1.5,100\n' +
    '2024-01-02,1.1,2.1,0.6,1.6,110\n' +
    '2024-01-03,1.2,2.2,0.7,1.7,120\n';
  await fs.writeFile(
    filePath,
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
  );

  let headers: string[] | null = null;
  try {
    ({ headers } = await readTabularHeadersFromPath(filePath, appError));
  } catch (error) {
    assert.equal(
      (error as { code?: unknown }).code,
      'CSV_ENCODING_UNSUPPORTED',
      'unsupported encodings must not be misreported as a schema problem',
    );
    return;
  }
  assert.deepEqual(headers, CANONICAL_HEADERS);

  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  await connection.run(MARKET_BARS_SCHEMA_SQL);
  const [result] = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [{
      instrumentId: 'instrument-utf16',
      symbol: 'AAPL',
      filePath,
      inputFormat: 'csv',
      mapping: FIELD_MAPPING,
      timezone: 'Etc/UTC',
    }],
    { connection, sampleSize: 4096, toSafeInt },
  );
  assert.equal(result?.validRows, 3);
  assert.equal(result?.importedRows, 3);
});

test('header-only files cannot become confirmable from a filename timeframe hint', async (t) => {
  const tempRoot = await createTempRoot(t, 'zinuto-import-header-only-');
  await fs.writeFile(
    path.join(tempRoot, 'AAPL_1d.csv'),
    `${CANONICAL_HEADERS.join(',')}\n`,
    'utf8',
  );

  await assert.rejects(
    () => previewLocalDataImportFolderCore(tempRoot, createPreviewDeps()),
    (error: unknown) => {
      const code = String((error as { code?: unknown }).code ?? '');
      return /(?:NO_(?:VALID_)?(?:DATA|BARS)|EMPTY)/u.test(code);
    },
  );
});

test('a symbol column cannot silently merge multiple instruments into the filename symbol', async (t) => {
  const tempRoot = await createTempRoot(t, 'zinuto-import-multi-symbol-');
  const rows = Array.from({ length: 160 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10);
    return `${date},AAPL,1,2,0.5,1.5,100`;
  });
  rows.push('2024-06-09,MSFT,200,210,190,205,200');
  await fs.writeFile(
    path.join(tempRoot, 'AAPL.csv'),
    `date,symbol,open,high,low,close,volume\n${rows.join('\n')}\n`,
    'utf8',
  );

  await assert.rejects(
    () => previewLocalDataImportFolderCore(tempRoot, createPreviewDeps()),
    (error: unknown) =>
      /SYMBOL/u.test(String((error as { code?: unknown }).code ?? '')),
  );
});

test('sparse symbol aliases cannot hide multiple instruments from execution validation', async (t) => {
  const tempRoot = await createTempRoot(t, 'zinuto-import-sparse-symbols-');
  const filePath = path.join(tempRoot, 'AAPL_1d.csv');
  await fs.writeFile(
    filePath,
    `date,symbol,ticker,open,high,low,close,volume
2024-01-01,AAPL,,1,2,0.5,1.5,100
2024-01-02,,MSFT,2,3,1.5,2.5,200
`,
    'utf8',
  );

  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  await connection.run(MARKET_BARS_SCHEMA_SQL);
  await assert.rejects(
    () => appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
      [{
        instrumentId: 'instrument-sparse-symbols',
        symbol: 'AAPL',
        filePath,
        inputFormat: 'csv',
        mapping: FIELD_MAPPING,
        timezone: 'Etc/UTC',
      }],
      { connection, sampleSize: 4096, toSafeInt },
    ),
    (error: unknown) =>
      String((error as { code?: unknown }).code ?? '') === 'CSV_SYMBOL_COLUMN_MIXED',
  );
});

test('ordinary quoted commas remain valid CSV syntax', async (t) => {
  const tempRoot = await createTempRoot(t, 'zinuto-import-quoted-comma-');
  const filePath = path.join(tempRoot, 'AAPL_1d.csv');
  await fs.writeFile(
    filePath,
    `date,open,high,low,close,volume,note
2024-01-01,1,2,0.5,1.5,100,"hello, world"
2024-01-02,1.1,2.1,0.6,1.6,110,"still valid"
2024-01-03,1.2,2.2,0.7,1.7,120,"still valid"
`,
    'utf8',
  );
  const sourceSql = `read_csv_auto(
    ${quoteDuckLiteral(filePath)},
    header = true,
    all_varchar = true,
    ignore_errors = false
  )`;
  const connection = await DuckDBConnection.create();
  t.after(() => {
    connection.closeSync();
  });
  const summary = await readValidationSummary(connection, sourceSql);
  assert.equal(Number(summary.valid_rows ?? 0), 3);
  assert.equal(Number(summary.required_invalid_rows ?? 0), 0);
  assert.equal(Number(summary.ohlc_invalid_rows ?? 0), 0);
});
