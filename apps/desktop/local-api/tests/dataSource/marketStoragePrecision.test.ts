// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

import { appendEdgeBarsForInstrumentsFromCsvFilesBatchCore } from '../../src/infrastructure/db/marketCsvEdgeAppend.js';
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
} from '../../src/infrastructure/db/marketDatabase/ohlcvSql.js';

const createMarketConnection = async (
  t: TestContext,
): Promise<DuckDBConnection> => {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  t.after(() => {
    connection.closeSync();
    instance.closeSync();
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
  return connection;
};

test('CSV import retains price and volume values beyond float32 precision', async (t) => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-market-double-import-'),
  );
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const csvPath = path.join(tempRoot, 'PRECISION_1d.csv');
  await fs.writeFile(
    csvPath,
    `date,open,high,low,close,volume
2024-01-01,1.036930,1.036930,1.036930,1.036930,34344567
2024-01-02,123456.78,123456.78,123456.78,123456.78,34344567
2024-01-03,100000000.01,100000000.01,100000000.01,100000000.01,34344567
`,
    'utf8',
  );
  const connection = await createMarketConnection(t);

  const [importResult] = await appendEdgeBarsForInstrumentsFromCsvFilesBatchCore(
    [
      {
        instrumentId: 'instrument-precision',
        symbol: 'PRECISION',
        filePath: csvPath,
        mapping: {
          timestampMode: 'SINGLE',
          date: 'date',
          time: '',
          open: 'open',
          high: 'high',
          low: 'low',
          close: 'close',
          volume: 'volume',
        },
        timezone: 'Etc/UTC',
      },
    ],
    {
      connection,
      sampleSize: 4096,
      toSafeInt: (value) => Math.max(0, Math.floor(Number(value) || 0)),
    },
  );
  assert.equal(importResult?.validRows, 3);
  assert.equal(importResult?.importedRows, 3);

  const result = await connection.run(`
    SELECT open, high, low, close, volume
      FROM market_bars
     WHERE instrument_id = 'instrument-precision'
     ORDER BY ts_ms
  `);
  const rows = await result.getRowObjectsJS();
  assert.deepEqual(rows, [
    {
      open: 1.03693,
      high: 1.03693,
      low: 1.03693,
      close: 1.03693,
      volume: 34344567,
    },
    {
      open: 123456.78,
      high: 123456.78,
      low: 123456.78,
      close: 123456.78,
      volume: 34344567,
    },
    {
      open: 100000000.01,
      high: 100000000.01,
      low: 100000000.01,
      close: 100000000.01,
      volume: 34344567,
    },
  ]);
  for (const value of [1.03693, 123456.78, 100000000.01, 34344567]) {
    assert.notEqual(value, Math.fround(value));
  }
});
