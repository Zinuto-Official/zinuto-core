// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { DB_SCHEMA_VERSION } from "../../src/infrastructure/db/database/constants.js";
import { schemaSql } from "../../src/infrastructure/db/database/schemaSql.js";
import {
  STARTUP_LOCAL_DATA_REINITIALIZE_CONFIRMATION,
  reinitializeStartupLocalData,
} from "../../src/infrastructure/db/database/startupReinitialize.js";
import { runStartupPreflight } from "../../src/infrastructure/db/database/startupPreflight.js";

const createTempLayout = () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "zinuto-startup-reset-"));
  const coreDataDir = path.join(rootDir, "data", "core");
  const marketDataDir = path.join(rootDir, "data", "market");
  const cacheDir = path.join(rootDir, "cache");
  const tempDir = path.join(rootDir, "temp");
  fs.mkdirSync(coreDataDir, { recursive: true });
  fs.mkdirSync(marketDataDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  return {
    cleanup: () => {
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
    layout: {
      appRootDir: rootDir,
      coreDataDir,
      marketDataDir,
      cacheDir,
      tempDir,
      dbPath: path.join(coreDataDir, "zinuto.db"),
      marketDbPath: path.join(marketDataDir, "zinuto.market.duckdb"),
      duckdbTempDir: path.join(tempDir, "duckdb-tmp"),
    },
  };
};

const createCurrentCoreSchema = (db: Database.Database): void => {
  db.exec(schemaSql);
  db.prepare("INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)")
    .run("db_schema_version", DB_SCHEMA_VERSION, new Date().toISOString());
};

const listColumns = (dbPath: string, tableName: string): string[] => {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return (
      db
        .prepare(`PRAGMA table_info("${tableName.replaceAll('"', '""')}")`)
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
  } finally {
    db.close();
  }
};

test("startup local data reinitialize quarantines blocked data and creates current schema", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    fs.writeFileSync(layout.dbPath, "not-a-sqlite-database");
    fs.writeFileSync(layout.marketDbPath, "market-data");
    const blockedStatus = runStartupPreflight(layout);
    assert.equal(blockedStatus.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
    assert.equal(blockedStatus.localDataIssueReason, "DATABASE_CORRUPTED");

    const result = reinitializeStartupLocalData({
      request: {
        confirmation: STARTUP_LOCAL_DATA_REINITIALIZE_CONFIRMATION,
      },
      startupStatus: blockedStatus,
      storageLayout: layout,
    });

    assert.equal(result.status, "REINITIALIZED");
    assert.equal(result.requiresReload, true);
    assert.equal(result.requiresBackendRestart, true);
    assert.equal(result.reason, "DATABASE_CORRUPTED");
    assert.equal(fs.existsSync(path.join(result.quarantinePath, "core", "zinuto.db")), true);
    assert.equal(
      fs.existsSync(path.join(result.quarantinePath, "market", "zinuto.market.duckdb")),
      true,
    );
    assert.equal(
      listColumns(layout.dbPath, "local_data_import_jobs").includes(
        "symbol_limit_json",
      ),
      true,
    );

    const readyStatus = runStartupPreflight(layout);
    assert.equal(readyStatus.mode, "READY");
    assert.equal(readyStatus.startupAllowed, true);
    assert.equal(readyStatus.localDataStatus, "CURRENT");
  } finally {
    cleanup();
  }
});

test("startup local data reinitialize rejects non-blocked current data", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    const db = new Database(layout.dbPath);
    createCurrentCoreSchema(db);
    db.close();
    const readyStatus = runStartupPreflight(layout);
    assert.equal(readyStatus.mode, "READY");

    assert.throws(
      () =>
        reinitializeStartupLocalData({
          request: {
            confirmation: STARTUP_LOCAL_DATA_REINITIALIZE_CONFIRMATION,
          },
          startupStatus: readyStatus,
          storageLayout: layout,
        }),
      /STARTUP_LOCAL_DATA_REINITIALIZE_UNAVAILABLE/,
    );
    assert.equal(fs.existsSync(layout.dbPath), true);
  } finally {
    cleanup();
  }
});
