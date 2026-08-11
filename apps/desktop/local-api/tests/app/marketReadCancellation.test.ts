// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('a guarded DuckDB timeout waits for interrupt and discards its pooled connection', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-market-read-cancel-'));
  const previousDbPath = process.env.ZINUTO_DB_PATH;
  process.env.ZINUTO_DB_PATH = path.join(tempDir, 'zinuto.db');
  const {
    closeMarketDatabase,
    getMarketReadConnectionPoolState,
    queryRows,
  } = await import('../../src/infrastructure/db/marketDatabase/connection.js');
  const { awaitBacktestOperation } = await import(
    '../../src/application/backtest/backtestAsyncGuard.js'
  );

  t.after(async () => {
    await closeMarketDatabase();
    if (previousDbPath === undefined) {
      delete process.env.ZINUTO_DB_PATH;
    } else {
      process.env.ZINUTO_DB_PATH = previousDbPath;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await queryRows('SELECT 1 AS ready');
  assert.equal(getMarketReadConnectionPoolState().idleCount, 1);
  await assert.rejects(
    awaitBacktestOperation(
      (signal) => queryRows(
        'SELECT SUM(SQRT(i::DOUBLE)) AS total FROM range(1000000000000) AS values(i)',
        [],
        { signal },
      ),
      {
        isCancelled: () => false,
        timeoutCode: 'TEST_MARKET_READ_TIMEOUT',
        timeoutMs: 30,
      },
    ),
    /TEST_MARKET_READ_TIMEOUT/u,
  );
  assert.deepEqual(
    getMarketReadConnectionPoolState(),
    {
      openCount: 0,
      idleCount: 0,
      waiterCount: 0,
      drainWaiterCount: 0,
      poolResetting: false,
      contextResetting: false,
    },
  );
});
