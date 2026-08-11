// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('source diagnostics abort interrupts its active DuckDB read', async (t) => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-source-diagnostics-cancel-'),
  );
  const previousDbPath = process.env.ZINUTO_DB_PATH;
  process.env.ZINUTO_DB_PATH = path.join(tempDir, 'zinuto.db');
  const {
    closeMarketDatabase,
    getMarketDbContext,
    getMarketReadConnectionPoolState,
    queryRows,
  } = await import(
    '../../src/infrastructure/db/marketDatabase/connection.js'
  );
  const { getMarketSymbolDiagnosticsSnapshot } = await import(
    '../../src/infrastructure/db/marketDatabase/diagnostics.js'
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

  const { connection } = await getMarketDbContext();
  await connection.run(`
    INSERT INTO market_bars (
      instrument_id,
      raw_index,
      ts_ms,
      open,
      high,
      low,
      close,
      volume
    )
    SELECT 'diagnostics-cancel',
           i,
           1700000000000 + i * 60000,
           100 + (i % 100) * 0.01,
           101 + (i % 100) * 0.01,
           99 + (i % 100) * 0.01,
           100.5 + (i % 100) * 0.01,
           1000
      FROM range(750000) AS rows(i)
  `);
  await queryRows('SELECT 1 AS ready');
  assert.equal(getMarketReadConnectionPoolState().idleCount, 1);

  const controller = new AbortController();
  const abortReason = new Error('SOURCE_DIAGNOSTICS_TEST_ABORTED');
  const timer = setTimeout(() => controller.abort(abortReason), 10);
  await assert.rejects(
    getMarketSymbolDiagnosticsSnapshot('diagnostics-cancel', '1m', {
      signal: controller.signal,
    }),
    (error: unknown) =>
      error === abortReason ||
      (error instanceof Error && /Interrupted/u.test(error.message)),
  );
  clearTimeout(timer);
  assert.equal(controller.signal.reason, abortReason);

  assert.deepEqual(getMarketReadConnectionPoolState(), {
    openCount: 0,
    idleCount: 0,
    waiterCount: 0,
    drainWaiterCount: 0,
    poolResetting: false,
    contextResetting: false,
  });
});
