// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const waitForActiveMarketPrewarm = async (
  readActiveCount: () => number,
): Promise<void> => {
  const deadlineAt = Date.now() + 5_000;
  while (Date.now() < deadlineAt) {
    if (readActiveCount() > 0) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('MARKET_STARTUP_WARMUP_DID_NOT_START');
};

test('startup market warmup drains before reset or close and cannot reopen after stop', async (t) => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-market-startup-warmup-'),
  );
  const previousDbPath = process.env.ZINUTO_DB_PATH;
  const previousSkipAutoInit = process.env.ZINUTO_SKIP_DATABASE_AUTO_INIT;
  process.env.ZINUTO_DB_PATH = path.join(tempDir, 'zinuto.db');
  process.env.ZINUTO_SKIP_DATABASE_AUTO_INIT = '1';

  const marketDatabase = await import(
    '../../src/infrastructure/db/marketDatabase.js'
  );
  const marketConnection = await import(
    '../../src/infrastructure/db/marketDatabase/connection.js'
  );
  const { marketDatabaseHarness } = await import(
    '../support/marketDatabaseHarness.js'
  );

  t.after(async () => {
    await marketDatabase.closeMarketDatabase();
    if (previousDbPath === undefined) {
      delete process.env.ZINUTO_DB_PATH;
    } else {
      process.env.ZINUTO_DB_PATH = previousDbPath;
    }
    if (previousSkipAutoInit === undefined) {
      delete process.env.ZINUTO_SKIP_DATABASE_AUTO_INIT;
    } else {
      process.env.ZINUTO_SKIP_DATABASE_AUTO_INIT = previousSkipAutoInit;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  assert.equal(marketDatabase.scheduleMarketDatabaseWarmUp(), true);
  await waitForActiveMarketPrewarm(
    () => marketDatabaseHarness.getPrewarmExecutionState().activeTaskCount,
  );

  const resetLease =
    await marketDatabaseHarness.acquirePrewarmQuiesceLease();
  await marketConnection.resetMarketDbContext();
  assert.deepEqual(
    marketDatabaseHarness.getReadConnectionPoolState(),
    {
      openCount: 0,
      idleCount: 0,
      waiterCount: 0,
      drainWaiterCount: 0,
      poolResetting: false,
      contextResetting: false,
    },
  );
  assert.equal(marketDatabase.scheduleMarketDatabaseWarmUp(), false);
  resetLease.release();

  assert.equal(marketDatabase.scheduleMarketDatabaseWarmUp(), true);
  await waitForActiveMarketPrewarm(
    () => marketDatabaseHarness.getPrewarmExecutionState().activeTaskCount,
  );
  await marketDatabase.closeMarketDatabase();
  assert.deepEqual(
    marketDatabaseHarness.getReadConnectionPoolState(),
    {
      openCount: 0,
      idleCount: 0,
      waiterCount: 0,
      drainWaiterCount: 0,
      poolResetting: false,
      contextResetting: false,
    },
  );
  assert.equal(marketDatabase.scheduleMarketDatabaseWarmUp(), false);
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  assert.equal(
    marketDatabaseHarness.getReadConnectionPoolState().openCount,
    0,
  );
});
