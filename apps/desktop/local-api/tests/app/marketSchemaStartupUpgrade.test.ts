// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DuckDBInstance } from '@duckdb/node-api';
import { MARKET_SCHEMA_VERSION } from '../../src/infrastructure/db/database/constants.js';

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-market-startup-upgrade-'),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const marketDbPath = path.join(
  tempDataDir,
  'data',
  'market',
  'zinuto.market.duckdb',
);
await fs.promises.mkdir(path.dirname(marketDbPath), { recursive: true });
const fixtureSql = await fs.promises.readFile(
  path.join(
    import.meta.dirname,
    '..',
    'fixtures',
    'market-schema',
    '2026-05-18-trading-calendar-timeline-v1.sql',
  ),
  'utf8',
);
const historicalInstance = await DuckDBInstance.create(marketDbPath);
const historicalConnection = await historicalInstance.connect();
try {
  await historicalConnection.run(fixtureSql);
  await historicalConnection.run(`
    INSERT INTO market_instruments
    VALUES ('startup-upgrade', 'UPGRADE', 2, '2026-05-18T00:00:00.000Z');
    INSERT INTO market_bars
    VALUES
      ('startup-upgrade', 0, 1710000000000, 1, 2, 0.5, 1.5, 10),
      ('startup-upgrade', 1, 1710000060000, 1.5, 2.5, 1, 2, 20);
    CHECKPOINT;
  `);
} finally {
  historicalConnection.closeSync();
  historicalInstance.closeSync();
}

const {
  CORE_SCHEMA_UPGRADE_RESULT,
  MARKET_SCHEMA_UPGRADE_RESULT,
  STARTUP_PREFLIGHT_STATUS,
  db,
} = await import('../../src/infrastructure/db/database.js');

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test('database startup upgrades a supported historical market store before reporting READY', async () => {
  assert.equal(CORE_SCHEMA_UPGRADE_RESULT.status, 'NO_DATABASE');
  assert.equal(MARKET_SCHEMA_UPGRADE_RESULT.status, 'UPGRADED');
  assert.equal(MARKET_SCHEMA_UPGRADE_RESULT.schemaVersion, MARKET_SCHEMA_VERSION);
  assert.ok(MARKET_SCHEMA_UPGRADE_RESULT.backupPath);
  assert.equal(fs.existsSync(MARKET_SCHEMA_UPGRADE_RESULT.backupPath), true);
  assert.equal(STARTUP_PREFLIGHT_STATUS.mode, 'READY');
  assert.equal(STARTUP_PREFLIGHT_STATUS.startupAllowed, true);
  assert.equal(STARTUP_PREFLIGHT_STATUS.localDataStatus, 'CURRENT');
  assert.equal(
    STARTUP_PREFLIGHT_STATUS.blockDetails.marketSchemaUpgradeStatus,
    'UPGRADED',
  );

  const currentInstance = await DuckDBInstance.create(marketDbPath, {
    access_mode: 'READ_ONLY',
  });
  const currentConnection = await currentInstance.connect();
  try {
    const result = await currentConnection.run(`
      SELECT COUNT(*) AS count, MIN(ts_ms) AS min_ts, MAX(ts_ms) AS max_ts
        FROM market_bars
       WHERE instrument_id = 'startup-upgrade'
    `);
    assert.deepEqual(await result.getRowObjectsJS(), [
      { count: 2n, min_ts: 1710000000000n, max_ts: 1710000060000n },
    ]);
  } finally {
    currentConnection.closeSync();
    currentInstance.closeSync();
  }
});
