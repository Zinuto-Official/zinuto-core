// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

import { measureSystemStorageUsageInWorker } from '../../src/infrastructure/db/systemStorageMeasurementWorkerClient.js';

test('storage measurement runs in an isolated worker and returns physical and metadata facts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-storage-worker-'));
  const dbPath = path.join(root, 'core.sqlite');
  const marketDbPath = path.join(root, 'market.duckdb');
  const cacheDir = path.join(root, 'cache');
  const tempDir = path.join(root, 'temp');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'cache.bin'), Buffer.alloc(123));
  fs.writeFileSync(marketDbPath, Buffer.alloc(456));
  const database = new Database(dbPath);
  database.exec(`
    CREATE TABLE instruments (
      id TEXT PRIMARY KEY,
      market TEXT NOT NULL,
      bar_count INTEGER NOT NULL,
      bars_version_token TEXT NOT NULL
    );
    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE training_projects (id TEXT PRIMARY KEY);
    INSERT INTO instruments (id, market, bar_count, bars_version_token)
    VALUES ('instrument-1', 'LOCAL', 12, 'v1');
    INSERT INTO training_projects (id) VALUES ('project-1');
  `);
  database.close();

  try {
    let eventLoopReached = false;
    const eventLoopProbe = new Promise<void>((resolve) => {
      setImmediate(() => {
        eventLoopReached = true;
        resolve();
      });
    });
    const measurement = measureSystemStorageUsageInWorker({
      input: { dbPath, marketDbPath, cacheDir, tempDir },
    });
    await eventLoopProbe;
    assert.equal(eventLoopReached, true);
    const result = await measurement;
    assert.equal(result.metaUsage.source, 'DBSTAT');
    assert.equal(result.cacheBytes, 123);
    assert.equal(result.marketUsage.physicalFootprint.totalBytes, 456);
    assert.equal(result.marketUsage.contentSummary.instrumentCount, 1);
    assert.equal(result.marketUsage.contentSummary.barCount, 12);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
