// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

import { MARKET_SCHEMA_VERSION } from "../../src/infrastructure/db/database/constants.js";
import {
  MARKET_PRICE_STORAGE_SQL,
  MARKET_VOLUME_STORAGE_SQL,
} from "../../src/infrastructure/db/marketDatabase/ohlcvSql.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-market-schema-preflight-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const marketDbPath = path.join(
  tempDataDir,
  "data",
  "market",
  "zinuto.market.duckdb",
);

const readTableColumns = async (
  connection: DuckDBConnection,
  tableName: string,
): Promise<string[]> => {
  try {
    const result = await connection.run(
      `PRAGMA table_info('${tableName.replace(/'/g, "''")}')`,
    );
    const rows = (await result.getRowObjectsJS()) as Array<{ name?: unknown }>;
    return rows
      .map((row) => String(row.name ?? "").trim().toLowerCase())
      .filter((column) => Boolean(column));
  } catch {
    return [];
  }
};

const createCurrentVersionPartialMarketDb = async (): Promise<void> => {
  await fs.promises.mkdir(path.dirname(marketDbPath), { recursive: true });
  const instance = await DuckDBInstance.create(marketDbPath);
  const connection = await instance.connect();
  try {
    await connection.run(`
      CREATE TABLE market_meta (
        key VARCHAR PRIMARY KEY,
        value VARCHAR NOT NULL,
        updated_at VARCHAR NOT NULL
      );
      INSERT INTO market_meta (key, value, updated_at)
      VALUES ('market_schema_version', '${MARKET_SCHEMA_VERSION}', '2026-05-15T00:00:00.000Z');

      CREATE TABLE market_bars (
        instrument_id VARCHAR NOT NULL,
        raw_index BIGINT NOT NULL DEFAULT 0,
        ts_ms BIGINT NOT NULL,
        open ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        high ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        low ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        close ${MARKET_PRICE_STORAGE_SQL} NOT NULL,
        volume ${MARKET_VOLUME_STORAGE_SQL} NOT NULL
      );

      CREATE TABLE market_display_bars (
        instrument_id VARCHAR NOT NULL,
        display_index BIGINT NOT NULL
      );
    `);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
};

await createCurrentVersionPartialMarketDb();

const [
  { db, STARTUP_PREFLIGHT_STATUS },
  { closeMarketDatabase, getMarketBarCount },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/marketDatabase.js"),
]);

test.after(async () => {
  await closeMarketDatabase();
  if (STARTUP_PREFLIGHT_STATUS.startupAllowed) {
    db.close();
  }
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test("market db initialization blocks and preserves current-version partial schema", async () => {
  assert.equal(STARTUP_PREFLIGHT_STATUS.mode, "BLOCKED");
  assert.equal(STARTUP_PREFLIGHT_STATUS.startupAllowed, false);
  assert.equal(
    STARTUP_PREFLIGHT_STATUS.blockReason,
    "LOCAL_DATA_NEEDS_ATTENTION",
  );
  assert.equal(
    STARTUP_PREFLIGHT_STATUS.localDataIssueReason,
    "SCHEMA_MISMATCH",
  );
  assert.equal(
    STARTUP_PREFLIGHT_STATUS.blockDetails.marketSchemaVersion,
    MARKET_SCHEMA_VERSION,
  );
  assert.notEqual(
    STARTUP_PREFLIGHT_STATUS.blockDetails.marketSchemaUpgradeStatus,
    "CURRENT",
  );
  await assert.rejects(
    () => getMarketBarCount("schema-preflight"),
    (error: unknown) => {
      const appError = error as {
        code?: unknown;
        status?: unknown;
        args?: Record<string, unknown>;
      };
      assert.equal(appError.code, "LOCAL_MARKET_DATA_NEEDS_ATTENTION");
      assert.equal(appError.status, 503);
      assert.equal(appError.args?.reason, "SCHEMA_MISMATCH");
      return true;
    },
  );
  await closeMarketDatabase();
  assert.equal(fs.existsSync(marketDbPath), true);

  const instance = await DuckDBInstance.create(marketDbPath);
  const connection = await instance.connect();
  try {
    const result = await connection.run(
      "SELECT value FROM market_meta WHERE key = 'market_schema_version' LIMIT 1",
    );
    const rows = (await result.getRowObjectsJS()) as Array<{ value?: unknown }>;
    assert.equal(String(rows[0]?.value ?? ""), MARKET_SCHEMA_VERSION);

    const displayColumns = await readTableColumns(connection, "market_display_bars");
    assert.deepEqual(displayColumns, ["instrument_id", "display_index"]);

    const timelineColumns = await readTableColumns(connection, "market_timeline_meta");
    assert.deepEqual(timelineColumns, []);

    const anchorColumns = await readTableColumns(connection, "market_bar_chunk_anchors");
    assert.deepEqual(anchorColumns, []);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});
