// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-market-unreadable-empty-reclaim-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const marketDbPath = path.join(
  tempDataDir,
  "data",
  "market",
  "zinuto.market.duckdb",
);

const [
  { db },
  {
    closeMarketDatabase,
    reclaimEmptyMarketStorage,
  },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
]);

test.after(async () => {
  await closeMarketDatabase();
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test("empty market reclaim removes unreadable storage when core has no local market bars", async () => {
  await fs.promises.mkdir(path.dirname(marketDbPath), { recursive: true });
  await fs.promises.writeFile(marketDbPath, "not-a-duckdb-database");

  const result = await reclaimEmptyMarketStorage();

  assert.equal(result.hasContent, false);
  assert.ok(result.footprintBefore.totalBytes > 0);
  assert.equal(result.footprintAfter.totalBytes, 0);
  assert.equal(result.reclaimedBytes, result.footprintBefore.totalBytes);
  assert.equal(fs.existsSync(marketDbPath), false);
});
