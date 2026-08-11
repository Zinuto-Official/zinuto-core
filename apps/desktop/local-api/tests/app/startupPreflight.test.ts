// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  DB_SCHEMA_VERSION,
  MARKET_SCHEMA_VERSION,
} from "../../src/infrastructure/db/database/constants.js";
import {
  computeCoreSchemaManifestFingerprint,
  PINNED_CORE_SCHEMA_MANIFEST_SHA256,
  SUPPORTED_CORE_SCHEMA_MANIFEST_VERSIONS,
} from "../../src/infrastructure/db/database/coreSchemaManifest.js";
import { schemaSql } from "../../src/infrastructure/db/database/schemaSql.js";
import { runStartupPreflight } from "../../src/infrastructure/db/database/startupPreflight.js";
import type { MarketSchemaUpgradeResult } from "../../src/infrastructure/db/marketDatabase/schemaUpgrade.js";

const PRE_SYMBOL_LIMIT_SCHEMA_VERSION =
  "2026-05-18-trading-calendar-source-v1";

const createTempLayout = (): {
  cleanup: () => void;
  layout: {
    appRootDir: string;
    coreDataDir: string;
    marketDataDir: string;
    cacheDir: string;
    tempDir: string;
    dbPath: string;
    marketDbPath: string;
    duckdbTempDir: string;
    pathMigrationState: "NOT_NEEDED";
  };
} => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "zinuto-startup-"));
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
      pathMigrationState: "NOT_NEEDED",
    },
  };
};

const insertCurrentSchemaMeta = (db: Database.Database): void => {
  db.prepare("INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)")
    .run("db_schema_version", DB_SCHEMA_VERSION, new Date().toISOString());
};

const createCurrentCoreSchema = (db: Database.Database): void => {
  db.exec(schemaSql);
  insertCurrentSchemaMeta(db);
};

test("current and supported historical core manifests match immutable fingerprints", () => {
  for (const version of [
    ...SUPPORTED_CORE_SCHEMA_MANIFEST_VERSIONS,
    DB_SCHEMA_VERSION,
  ] as const) {
    assert.equal(
      computeCoreSchemaManifestFingerprint(version),
      PINNED_CORE_SCHEMA_MANIFEST_SHA256[version],
      version,
    );
  }
});

test("startup preflight stays ready for a current core schema", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    const db = new Database(layout.dbPath);
    createCurrentCoreSchema(db);
    db.close();

    const result = runStartupPreflight(layout);
    assert.equal(result.mode, "READY");
    assert.equal(result.startupAllowed, true);
    assert.equal(result.blockReason, null);
    assert.equal(result.localDataStatus, "CURRENT");
    assert.equal(result.localDataIssueReason, null);
  } finally {
    cleanup();
  }
});

test("startup preflight blocks a current-version database without the reset recovery journal", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    const db = new Database(layout.dbPath);
    createCurrentCoreSchema(db);
    db.exec("DROP TABLE system_reset_operations");
    db.close();

    const result = runStartupPreflight(layout);
    assert.equal(result.mode, "BLOCKED");
    assert.equal(result.startupAllowed, false);
    assert.equal(result.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
    assert.equal(result.localDataIssueReason, "SCHEMA_MISMATCH");
    assert.match(
      result.blockDetails.missingSchemaRequirements,
      /system_reset_operations:<missing-table>/,
    );
  } finally {
    cleanup();
  }
});

test("startup preflight blocks old import job schema that lacks symbol limit state", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    const db = new Database(layout.dbPath);
    createCurrentCoreSchema(db);
    db.exec(`
      DROP TABLE local_data_import_jobs;
      CREATE TABLE local_data_import_jobs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        base_timeframe TEXT NOT NULL,
        job_mode TEXT NOT NULL DEFAULT 'FULL_IMPORT',
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        progress_percent REAL NOT NULL DEFAULT 0,
        compact_progress_percent REAL NOT NULL DEFAULT 0,
        compact_before_bytes INTEGER NOT NULL DEFAULT 0,
        compact_after_bytes INTEGER NOT NULL DEFAULT 0,
        compact_reclaimed_bytes INTEGER NOT NULL DEFAULT 0,
        total_files INTEGER NOT NULL DEFAULT 0,
        done_files INTEGER NOT NULL DEFAULT 0,
        total_rows INTEGER NOT NULL DEFAULT 0,
        imported_rows INTEGER NOT NULL DEFAULT 0,
        skipped_rows INTEGER NOT NULL DEFAULT 0,
        error_files INTEGER NOT NULL DEFAULT 0,
        current_file_name TEXT,
        error_message TEXT,
        error_code TEXT,
        error_cause_json TEXT,
        error_details_json TEXT,
        failure_summary_json TEXT,
        outcome_summary_json TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare("UPDATE app_meta SET value = ? WHERE key = 'db_schema_version'")
      .run(PRE_SYMBOL_LIMIT_SCHEMA_VERSION);
    db.close();

    const result = runStartupPreflight(layout);
    assert.equal(result.mode, "BLOCKED");
    assert.equal(result.startupAllowed, false);
    assert.equal(result.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
    assert.equal(result.localDataStatus, "NEEDS_ATTENTION");
    assert.equal(result.localDataIssueReason, "SCHEMA_MISMATCH");
    assert.equal(
      result.blockDetails.coreSchemaVersion,
      PRE_SYMBOL_LIMIT_SCHEMA_VERSION,
    );
    assert.equal(result.blockDetails.expectedCoreSchemaVersion, DB_SCHEMA_VERSION);
    assert.match(
      result.blockDetails.missingSchemaRequirements,
      /local_data_import_jobs:symbol_limit_json/,
    );
  } finally {
    cleanup();
  }
});

test("startup preflight blocks and preserves current-version core data when custom indicator profile schema is incomplete", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    const db = new Database(layout.dbPath);
    createCurrentCoreSchema(db);
    db.exec(`
      DROP TABLE custom_indicator_profiles;
      CREATE TABLE custom_indicator_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        parameter_inputs_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.close();

    const result = runStartupPreflight(layout);
    assert.equal(result.mode, "BLOCKED");
    assert.equal(result.startupAllowed, false);
    assert.equal(result.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
    assert.equal(result.localDataStatus, "NEEDS_ATTENTION");
    assert.equal(result.localDataIssueReason, "SCHEMA_MISMATCH");
    assert.equal(fs.existsSync(layout.dbPath), true);
  } finally {
    cleanup();
  }
});

test("startup preflight blocks and preserves current-version core data when local data source diagnostics columns are missing", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    const db = new Database(layout.dbPath);
    createCurrentCoreSchema(db);
    db.exec(`
      DROP TABLE local_data_sources;
      CREATE TABLE local_data_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        base_timeframe TEXT NOT NULL,
        field_mapping_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.close();

    const result = runStartupPreflight(layout);
    assert.equal(result.mode, "BLOCKED");
    assert.equal(result.startupAllowed, false);
    assert.equal(result.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
    assert.equal(result.localDataStatus, "NEEDS_ATTENTION");
    assert.equal(result.localDataIssueReason, "SCHEMA_MISMATCH");
    assert.equal(fs.existsSync(layout.dbPath), true);
  } finally {
    cleanup();
  }
});

test("startup preflight blocks and preserves current-version core data when special training banks table is partial", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    const db = new Database(layout.dbPath);
    createCurrentCoreSchema(db);
    db.exec(`
      DROP TABLE special_training_banks;
      CREATE TABLE special_training_banks (
        id TEXT PRIMARY KEY,
        simulation_batch_id TEXT
      );
    `);
    db.close();

    const result = runStartupPreflight(layout);
    assert.equal(result.mode, "BLOCKED");
    assert.equal(result.startupAllowed, false);
    assert.equal(result.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
    assert.equal(result.localDataStatus, "NEEDS_ATTENTION");
    assert.equal(result.localDataIssueReason, "SCHEMA_MISMATCH");
    assert.equal(fs.existsSync(layout.dbPath), true);
  } finally {
    cleanup();
  }
});

test("startup preflight blocks and preserves non-current core data before first-version startup", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    const db = new Database(layout.dbPath);
    db.exec(
      "CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    );
    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)")
      .run("db_schema_version", "2026-01-01-preview");
    db.close();
    fs.writeFileSync(layout.marketDbPath, "stale-market-db");
    fs.writeFileSync(`${layout.dbPath}-wal`, "stale-core-wal");

    const result = runStartupPreflight(layout);
    assert.equal(result.mode, "BLOCKED");
    assert.equal(result.startupAllowed, false);
    assert.equal(result.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
    assert.equal(result.localDataStatus, "NEEDS_ATTENTION");
    assert.equal(result.localDataIssueReason, "SCHEMA_MISMATCH");
    assert.equal(fs.existsSync(layout.dbPath), true);
    assert.equal(fs.existsSync(`${layout.dbPath}-wal`), true);
    assert.equal(fs.existsSync(layout.marketDbPath), true);
  } finally {
    cleanup();
  }
});

test("startup preflight blocks and preserves corrupted core data", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    fs.writeFileSync(layout.dbPath, "not-a-sqlite-database");
    fs.writeFileSync(layout.marketDbPath, "market-data");

    const result = runStartupPreflight(layout);
    assert.equal(result.mode, "BLOCKED");
    assert.equal(result.startupAllowed, false);
    assert.equal(result.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
    assert.equal(result.localDataStatus, "NEEDS_ATTENTION");
    assert.equal(result.localDataIssueReason, "DATABASE_CORRUPTED");
    assert.equal(fs.existsSync(layout.dbPath), true);
    assert.equal(fs.existsSync(layout.marketDbPath), true);
  } finally {
    cleanup();
  }
});

for (const marketFailure of [
  {
    name: "unknown market schema",
    result: {
      status: "UNSUPPORTED",
      schemaVersion: "2026-01-01-unknown-market",
      isCurrent: false,
      issueReason: "SCHEMA_MISMATCH",
      missingSchemaRequirements: [],
      backupPath: null,
      requiredHeadroomBytes: null,
      availableHeadroomBytes: null,
    },
    blockReason: "LOCAL_DATA_NEEDS_ATTENTION",
    issueReason: "SCHEMA_MISMATCH",
  },
  {
    name: "corrupted market database",
    result: {
      status: "FAILED",
      schemaVersion: null,
      isCurrent: false,
      issueReason: "DATABASE_CORRUPTED",
      missingSchemaRequirements: [],
      backupPath: null,
      requiredHeadroomBytes: null,
      availableHeadroomBytes: null,
    },
    blockReason: "LOCAL_DATA_NEEDS_ATTENTION",
    issueReason: "DATABASE_CORRUPTED",
  },
  {
    name: "market upgrade with insufficient disk space",
    result: {
      status: "INSUFFICIENT_DISK_SPACE",
      schemaVersion: "2026-05-18-trading-calendar-timeline-v1",
      isCurrent: false,
      issueReason: null,
      missingSchemaRequirements: [],
      backupPath: null,
      requiredHeadroomBytes: 2 * 1024 * 1024 * 1024,
      availableHeadroomBytes: 1024,
    },
    blockReason: "INSUFFICIENT_DISK_SPACE",
    issueReason: null,
  },
] satisfies Array<{
  name: string;
  result: MarketSchemaUpgradeResult;
  blockReason: "LOCAL_DATA_NEEDS_ATTENTION" | "INSUFFICIENT_DISK_SPACE";
  issueReason: "SCHEMA_MISMATCH" | "DATABASE_CORRUPTED" | null;
}>) {
  test(`startup preflight blocks ${marketFailure.name} without reporting current market data`, () => {
    const { cleanup, layout } = createTempLayout();
    try {
      const db = new Database(layout.dbPath);
      createCurrentCoreSchema(db);
      db.close();

      const result = runStartupPreflight(layout, {
        market: marketFailure.result,
      });
      assert.equal(result.mode, "BLOCKED");
      assert.equal(result.startupAllowed, false);
      assert.equal(result.blockReason, marketFailure.blockReason);
      assert.equal(result.localDataStatus, "NEEDS_ATTENTION");
      assert.equal(result.localDataIssueReason, marketFailure.issueReason);
      assert.notEqual(
        marketFailure.result.schemaVersion,
        MARKET_SCHEMA_VERSION,
      );
      assert.equal(
        result.blockDetails.marketSchemaUpgradeStatus,
        marketFailure.result.status,
      );
    } finally {
      cleanup();
    }
  });
}
