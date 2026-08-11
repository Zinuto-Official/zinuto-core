// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-market-empty-reclaim-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const [
  { db },
  {
    closeMarketDatabase,
    reclaimEmptyMarketStorage,
    getMarketStorageBlockUsage,
    getMarketStorageFootprint,
  },
  { getSystemStorageUsage },
  { marketDatabaseHarness },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
  import("../../src/application/systemStorageService.js"),
  import("../support/marketDatabaseHarness.js"),
]);

test.after(async () => {
  await closeMarketDatabase();
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

const createEmptyMarketStorageFile = async (): Promise<number> => {
  await getMarketStorageBlockUsage();
  const footprint = await getMarketStorageFootprint();
  assert.ok(footprint.totalBytes > 0);
  return footprint.totalBytes;
};

test("storage usage is observational and does not reclaim an empty market DuckDB file", async () => {
  const footprintBefore = await createEmptyMarketStorageFile();

  const usage = await getSystemStorageUsage();
  const footprintAfter = await getMarketStorageFootprint();

  assert.ok(footprintAfter.totalBytes >= footprintBefore);
  // marketDataBytes includes the SQLite market metadata footprint; with no
  // instrument rows there is no usable market content to report.
  assert.equal(usage.marketDataSummary.hasContent, false);
  assert.equal(usage.marketDataSummary.instrumentCount, 0);
  assert.equal(usage.marketDataSummary.barCount, 0);
  assert.equal(usage.physicalBreakdown.market.totalBytes, footprintAfter.totalBytes);
});

test("empty market reclaim waits for borrowed read connections before closing storage", async () => {
  await createEmptyMarketStorageFile();

  const releaseReadConnection =
    await marketDatabaseHarness.acquireReadConnection();
  let reclaimSettled = false;
  const reclaimPromise = reclaimEmptyMarketStorage().finally(() => {
    reclaimSettled = true;
  });

  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = marketDatabaseHarness.getReadConnectionPoolState();
      if (state.drainWaiterCount > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const state = marketDatabaseHarness.getReadConnectionPoolState();
    assert.equal(state.drainWaiterCount, 1);
    assert.equal(reclaimSettled, false);
  } finally {
    releaseReadConnection();
  }

  const result = await reclaimPromise;
  const footprintAfter = await getMarketStorageFootprint();

  assert.equal(result.hasContent, false);
  assert.equal(footprintAfter.totalBytes, 0);
  assert.equal(marketDatabaseHarness.getReadConnectionPoolState().openCount, 0);
});

test("storage usage keeps an empty market file while an import job is active", async () => {
  const beforeBytes = await createEmptyMarketStorageFile();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,base_timeframe,field_mapping_json,trading_calendar_json,status,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "source-active-import",
    "Active Import",
    "",
    "Asia/Shanghai",
    "1d",
    "{}",
    DEFAULT_TRADING_CALENDAR_JSON,
    "IMPORTING",
    now,
    now,
  );
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,status,stage,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    "job-active-import",
    "source-active-import",
    "Active Import",
    "Asia/Shanghai",
    "1d",
    "RUNNING",
    "IMPORTING",
    now,
    now,
  );

  const usage = await getSystemStorageUsage();
  const footprintAfter = await getMarketStorageFootprint();

  assert.equal(usage.marketDataSummary.hasContent, false);
  assert.ok(footprintAfter.totalBytes >= beforeBytes);
});
