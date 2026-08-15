// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  SUPPORTED_CORE_SCHEMA_UPGRADE_VERSIONS,
  upgradeSupportedCoreSchema,
} from "../../src/infrastructure/db/database/coreSchemaUpgrade.js";
import { DB_SCHEMA_VERSION } from "../../src/infrastructure/db/database/constants.js";
import type { DesktopStorageLayout } from "../../src/infrastructure/db/database/location.js";
import { schemaSql } from "../../src/infrastructure/db/database/schemaSql.js";

const createTempLayout = (): {
  cleanup: () => void;
  layout: DesktopStorageLayout;
} => {
  const appRootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "zinuto-core-schema-check-"),
  );
  const coreDataDir = path.join(appRootDir, "data", "core");
  const marketDataDir = path.join(appRootDir, "data", "market");
  const cacheDir = path.join(appRootDir, "cache");
  const tempDir = path.join(appRootDir, "temp");
  for (const directory of [coreDataDir, marketDataDir, cacheDir, tempDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return {
    cleanup: () => fs.rmSync(appRootDir, { recursive: true, force: true }),
    layout: {
      appRootDir,
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

const createSchema = (dbPath: string, version = DB_SCHEMA_VERSION): void => {
  const db = new Database(dbPath);
  try {
    db.exec(schemaSql);
    db.prepare("INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)")
      .run("db_schema_version", version, new Date().toISOString());
  } finally {
    db.close();
  }
};

const readTableCreateSql = (db: Database.Database, tableName: string): string => {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(tableName) as { sql?: unknown } | undefined;
  return String(row?.sql ?? "").trim();
};

const createLegacySamplePoolNameSchema = (dbPath: string): void => {
  const db = new Database(dbPath);
  try {
    db.pragma("foreign_keys = OFF");
    const legacyTrainingProjectsSql = readTableCreateSql(db, "training_projects")
      .replace("CREATE TABLE training_projects", "CREATE TABLE training_projects_legacy")
      .replace("CHECK(LENGTH(sample_pool_name) <= 20)", "CHECK(LENGTH(sample_pool_name) <= 48)");
    const legacyTrainingStatsSql = readTableCreateSql(db, "training_stats_sessions")
      .replace(
        "CREATE TABLE training_stats_sessions",
        "CREATE TABLE training_stats_sessions_legacy",
      )
      .replace("CHECK(LENGTH(sample_pool_name) <= 20)", "CHECK(LENGTH(sample_pool_name) <= 48)");
    db.exec(legacyTrainingProjectsSql);
    db.exec(legacyTrainingStatsSql);
    db.exec(
      "INSERT INTO training_projects_legacy SELECT * FROM training_projects",
    );
    db.exec(
      "INSERT INTO training_stats_sessions_legacy SELECT * FROM training_stats_sessions",
    );
    db.exec("DROP TABLE training_stats_sessions");
    db.exec("DROP TABLE training_projects");
    db.exec("ALTER TABLE training_projects_legacy RENAME TO training_projects");
    db.exec("ALTER TABLE training_stats_sessions_legacy RENAME TO training_stats_sessions");
    db.exec(schemaSql);
  } finally {
    db.close();
  }
};

const createLegacyUserSettingsSchema = (dbPath: string): void => {
  const db = new Database(dbPath);
  try {
    db.pragma("foreign_keys = OFF");
    const legacyUserSettingsSql = readTableCreateSql(db, "user_settings")
      .replace("CREATE TABLE user_settings", "CREATE TABLE user_settings_legacy")
      .replace("taker_fee_rate REAL NOT NULL DEFAULT 0", "taker_fee_rate REAL NOT NULL DEFAULT 0.03")
      .replace("regulatory_fee_rate REAL NOT NULL DEFAULT 0", "regulatory_fee_rate REAL NOT NULL DEFAULT 0.002")
      .replace("slippage_rate REAL NOT NULL DEFAULT 0.01", "slippage_rate REAL NOT NULL DEFAULT 0")
      .replace("stamp_duty_rate REAL NOT NULL DEFAULT 0.05", "stamp_duty_rate REAL NOT NULL DEFAULT 0.1")
      .replace("commission_minimum_fee REAL NOT NULL DEFAULT 5", "commission_minimum_fee REAL NOT NULL DEFAULT 0")
      .replace("short_borrow_annual_rate REAL NOT NULL DEFAULT 6", "short_borrow_annual_rate REAL NOT NULL DEFAULT 7.5")
      .replace("short_maintenance_margin_ratio REAL NOT NULL DEFAULT 130", "short_maintenance_margin_ratio REAL NOT NULL DEFAULT 30")
      .replace("trade_settlement_mode TEXT NOT NULL DEFAULT 'T1'", "trade_settlement_mode TEXT NOT NULL DEFAULT 'T0'");
    db.exec(legacyUserSettingsSql);
    db.exec("INSERT INTO user_settings_legacy SELECT * FROM user_settings");
    db.exec("DROP TABLE user_settings");
    db.exec("ALTER TABLE user_settings_legacy RENAME TO user_settings");
    db.exec(schemaSql);
  } finally {
    db.close();
  }
};

test("Core publishes no historical private-schema migration matrix", () => {
  assert.deepEqual(SUPPORTED_CORE_SCHEMA_UPGRADE_VERSIONS, []);
});

test("missing and current databases pass without mutation", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    assert.equal(upgradeSupportedCoreSchema(layout).status, "NO_DATABASE");
    createSchema(layout.dbPath);
    const before = fs.readFileSync(layout.dbPath);
    const result = upgradeSupportedCoreSchema(layout);
    assert.equal(result.status, "CURRENT");
    assert.equal(result.fromVersion, DB_SCHEMA_VERSION);
    assert.equal(result.backupPath, null);
    assert.deepEqual(fs.readFileSync(layout.dbPath), before);
  } finally {
    cleanup();
  }
});

test("unknown schema versions are preserved and reported as unsupported", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    createSchema(layout.dbPath, "unknown-schema");
    const before = fs.readFileSync(layout.dbPath);
    const result = upgradeSupportedCoreSchema(layout);
    assert.equal(result.status, "UNSUPPORTED");
    assert.equal(result.fromVersion, "unknown-schema");
    assert.deepEqual(fs.readFileSync(layout.dbPath), before);
  } finally {
    cleanup();
  }
});

test("repairs the exact current-version sample-pool-name constraint drift with a backup", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    createSchema(layout.dbPath);
    const db = new Database(layout.dbPath);
    try {
      db.prepare(
        `INSERT INTO training_projects (
          id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,
          training_date_range,summary_json
        ) VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        "project-1",
        "Project",
        "2026-07-31T00:00:00.000Z",
        "2026-07-31T00:00:00.000Z",
        "AAPL",
        "pool-1",
        "Pool name",
        "2026-01-01/2026-01-31",
        "{}",
      );
      db.prepare(
        `INSERT INTO training_stats_sessions (
          project_id,name,created_at,symbol,sample_pool_id,sample_pool_name,
          base_timeframe,training_date_range,generated_at
        ) VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        "project-1",
        "Project",
        "2026-07-31T00:00:00.000Z",
        "AAPL",
        "pool-1",
        "Pool name",
        "1d",
        "2026-01-01/2026-01-31",
        "2026-07-31T00:00:00.000Z",
      );
    } finally {
      db.close();
    }
    createLegacySamplePoolNameSchema(layout.dbPath);

    const result = upgradeSupportedCoreSchema(layout);
    assert.equal(result.status, "UPGRADED");
    assert.equal(result.fromVersion, DB_SCHEMA_VERSION);
    assert.ok(result.backupPath);
    assert.equal(fs.existsSync(result.backupPath), true);

    const repaired = new Database(layout.dbPath, { readonly: true });
    try {
      assert.equal(
        Number(
          repaired
            .prepare("SELECT COUNT(*) FROM training_projects")
            .pluck()
            .get(),
        ),
        1,
      );
      assert.equal(
        Number(
          repaired
            .prepare("SELECT COUNT(*) FROM training_stats_sessions")
            .pluck()
            .get(),
        ),
        1,
      );
    } finally {
      repaired.close();
    }
    assert.equal(upgradeSupportedCoreSchema(layout).status, "CURRENT");
  } finally {
    cleanup();
  }
});

test("adds the acquisition history table to a pre-history current-version database with a backup", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    createSchema(layout.dbPath);
    const db = new Database(layout.dbPath);
    try {
      db.exec("DROP TABLE local_data_acquisition_jobs");
      db.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(
        "user-1",
        "User",
        "2026-07-31T00:00:00.000Z",
      );
    } finally {
      db.close();
    }

    const result = upgradeSupportedCoreSchema(layout);
    assert.equal(result.status, "UPGRADED");
    assert.ok(result.backupPath);
    assert.equal(fs.existsSync(result.backupPath), true);

    const repaired = new Database(layout.dbPath, { readonly: true });
    try {
      assert.equal(
        Number(repaired.prepare("SELECT COUNT(*) FROM users").pluck().get()),
        1,
      );
      assert.equal(
        Number(
          repaired
            .prepare(
              "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_data_acquisition_jobs'",
            )
            .pluck()
            .get(),
        ),
        1,
      );
    } finally {
      repaired.close();
    }
    assert.equal(upgradeSupportedCoreSchema(layout).status, "CURRENT");
  } finally {
    cleanup();
  }
});

test("repairs user-settings default drift without changing stored settings", () => {
  const { cleanup, layout } = createTempLayout();
  try {
    createSchema(layout.dbPath);
    const db = new Database(layout.dbPath);
    try {
      db.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)")
        .run("default-user", "Default", "2026-08-08T00:00:00.000Z");
      db.prepare(
        "INSERT INTO user_settings (user_id, taker_fee_rate, slippage_rate, trade_settlement_mode, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run("default-user", 0.11, 0.22, "T0", "2026-08-08T00:00:00.000Z");
    } finally {
      db.close();
    }
    createLegacyUserSettingsSchema(layout.dbPath);

    const result = upgradeSupportedCoreSchema(layout);
    assert.equal(result.status, "UPGRADED");
    assert.ok(result.backupPath);

    const repaired = new Database(layout.dbPath, { readonly: true });
    try {
      assert.deepEqual(
        repaired.prepare(
          "SELECT taker_fee_rate, slippage_rate, trade_settlement_mode FROM user_settings WHERE user_id = ?",
        ).get("default-user"),
        { taker_fee_rate: 0.11, slippage_rate: 0.22, trade_settlement_mode: "T0" },
      );
      assert.equal(upgradeSupportedCoreSchema(layout).status, "CURRENT");
    } finally {
      repaired.close();
    }
  } finally {
    cleanup();
  }
});

test("current schema shape drift and unreadable files fail closed", () => {
  const drift = createTempLayout();
  try {
    createSchema(drift.layout.dbPath);
    const db = new Database(drift.layout.dbPath);
    try {
      db.exec("DROP TABLE system_reset_operations");
    } finally {
      db.close();
    }
    const result = upgradeSupportedCoreSchema(drift.layout);
    assert.equal(result.status, "FAILED");
    assert.equal(result.failureReason, "SHAPE_MISMATCH");
  } finally {
    drift.cleanup();
  }

  const unreadable = createTempLayout();
  try {
    fs.writeFileSync(unreadable.layout.dbPath, "not a sqlite database");
    const result = upgradeSupportedCoreSchema(unreadable.layout);
    assert.equal(result.status, "FAILED");
    assert.equal(result.failureReason, "CORE_DATABASE_UNREADABLE");
  } finally {
    unreadable.cleanup();
  }
});
