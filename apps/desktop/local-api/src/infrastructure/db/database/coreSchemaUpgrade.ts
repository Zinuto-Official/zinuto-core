// SPDX-License-Identifier: GPL-3.0-only

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_SCHEMA_VERSION, CORE_SCHEMA_STARTUP_SCRATCH_BYTES, GLOBAL_STARTUP_MIN_FREE_BYTES } from "./constants.js";
import { inspectCoreSchemaManifest } from "./coreSchemaManifest.js";
import type { DesktopStorageLayout } from "./location.js";
import { schemaSql } from "./schemaSql.js";

export const SUPPORTED_CORE_SCHEMA_UPGRADE_VERSIONS = [] as const;

export type CoreSchemaUpgradeResult = {
  status: "NO_DATABASE" | "CURRENT" | "UNSUPPORTED" | "UPGRADED" | "FAILED";
  fromVersion: string | null;
  toVersion: string;
  backupPath: string | null;
  requiredHeadroomBytes: number | null;
  availableHeadroomBytes: number | null;
  failureReason:
    | "CORE_DATABASE_UNREADABLE"
    | "INSUFFICIENT_DISK_SPACE"
    | "INTEGRITY_CHECK_FAILED"
    | "SHAPE_MISMATCH"
    | "MIGRATION_FAILED"
    | null;
};

type CurrentSchemaRepairTable = {
  name: "training_projects" | "training_stats_sessions" | "user_settings";
  temporaryName: string;
};

const CURRENT_SCHEMA_SAMPLE_POOL_NAME_REPAIR_TABLES: readonly CurrentSchemaRepairTable[] = [
  {
    name: "training_projects",
    temporaryName: "__zinuto_training_projects_repair",
  },
  {
    name: "training_stats_sessions",
    temporaryName: "__zinuto_training_stats_sessions_repair",
  },
];

const CURRENT_SCHEMA_REPAIR_TABLES: readonly CurrentSchemaRepairTable[] = [
  ...CURRENT_SCHEMA_SAMPLE_POOL_NAME_REPAIR_TABLES,
  {
    name: "user_settings",
    temporaryName: "__zinuto_user_settings_repair",
  },
];

const result = (
  status: CoreSchemaUpgradeResult["status"],
  fromVersion: string | null,
  failureReason: CoreSchemaUpgradeResult["failureReason"] = null,
  backupPath: string | null = null,
  availableHeadroomBytes: number | null = null,
): CoreSchemaUpgradeResult => ({
  status,
  fromVersion,
  toVersion: DB_SCHEMA_VERSION,
  backupPath,
  requiredHeadroomBytes:
    availableHeadroomBytes === null
      ? null
      : GLOBAL_STARTUP_MIN_FREE_BYTES + CORE_SCHEMA_STARTUP_SCRATCH_BYTES,
  availableHeadroomBytes,
  failureReason,
});

const readSchemaVersion = (db: Database.Database): string | null => {
  const tableExists = Number(
    db
      .prepare(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'",
      )
      .pluck()
      .get() ?? 0,
  );
  if (tableExists !== 1) {
    return null;
  }
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = 'db_schema_version'")
    .get() as { value?: unknown } | undefined;
  const version = String(row?.value ?? "").trim();
  return version || null;
};

const hasValidIntegrity = (db: Database.Database): boolean => {
  const rows = db.pragma("integrity_check") as Array<Record<string, unknown>>;
  return rows.length === 1 && String(rows[0]?.integrity_check ?? "") === "ok";
};

const normalizeSql = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ");

const quoteSqlLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;

const readTableCreateSql = (db: Database.Database, tableName: string): string => {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(tableName) as { sql?: unknown } | undefined;
  return normalizeSql(row?.sql);
};

const readTableCreateBody = (db: Database.Database, tableName: string): string => {
  const createSql = readTableCreateSql(db, tableName);
  const bodyStart = createSql.indexOf("(");
  return bodyStart >= 0 ? createSql.slice(bodyStart) : createSql;
};

const readTableColumns = (db: Database.Database, tableName: string): string[] =>
  (db.pragma(`table_xinfo(${JSON.stringify(tableName)})`) as Array<{
    name?: unknown;
    hidden?: unknown;
  }>)
    .filter((column) => Number(column.hidden ?? 0) === 0)
    .map((column) => String(column.name ?? ""));

const createExpectedCurrentSchema = (): Database.Database => {
  const expected = new Database(":memory:");
  expected.exec(schemaSql);
  return expected;
};

const legacySamplePoolNameCreateSql = (currentCreateSql: string): string =>
  currentCreateSql.replace(
    /CHECK\(LENGTH\(sample_pool_name\) <= \d+\)/u,
    "CHECK(LENGTH(sample_pool_name) <= 48)",
  );

const legacyUserSettingsCreateSql = (currentCreateSql: string): string =>
  currentCreateSql
    .replace(
      "taker_fee_rate REAL NOT NULL DEFAULT 0",
      "taker_fee_rate REAL NOT NULL DEFAULT 0.03",
    )
    .replace(
      "regulatory_fee_rate REAL NOT NULL DEFAULT 0",
      "regulatory_fee_rate REAL NOT NULL DEFAULT 0.002",
    )
    .replace(
      "slippage_rate REAL NOT NULL DEFAULT 0.01",
      "slippage_rate REAL NOT NULL DEFAULT 0",
    )
    .replace(
      "stamp_duty_rate REAL NOT NULL DEFAULT 0.05",
      "stamp_duty_rate REAL NOT NULL DEFAULT 0.1",
    )
    .replace(
      "commission_minimum_fee REAL NOT NULL DEFAULT 5",
      "commission_minimum_fee REAL NOT NULL DEFAULT 0",
    )
    .replace(
      "short_borrow_annual_rate REAL NOT NULL DEFAULT 6",
      "short_borrow_annual_rate REAL NOT NULL DEFAULT 7.5",
    )
    .replace(
      "short_maintenance_margin_ratio REAL NOT NULL DEFAULT 130",
      "short_maintenance_margin_ratio REAL NOT NULL DEFAULT 30",
    )
    .replace(
      "trade_settlement_mode TEXT NOT NULL DEFAULT 'T1'",
      "trade_settlement_mode TEXT NOT NULL DEFAULT 'T0'",
    );

const legacyCurrentSchemaCreateSql = (
  name: CurrentSchemaRepairTable["name"],
  currentCreateSql: string,
): string =>
  name === "user_settings"
    ? legacyUserSettingsCreateSql(currentCreateSql)
    : legacySamplePoolNameCreateSql(currentCreateSql);

const getRepairableCurrentSchemaDifferenceNames = (): string[] =>
  CURRENT_SCHEMA_REPAIR_TABLES.map(
    ({ name }) => `${name}:<definition-mismatch>`,
  );

const isRepairableCurrentSchemaShape = (
  db: Database.Database,
  differences: string[],
): boolean => {
  const expectedDifferences = new Set(getRepairableCurrentSchemaDifferenceNames());
  if (
    differences.length === 0 ||
    differences.some((difference) => !expectedDifferences.has(difference))
  ) {
    return false;
  }

  const expected = createExpectedCurrentSchema();
  try {
    return CURRENT_SCHEMA_REPAIR_TABLES.every(({ name }) => {
      const expectedCreateSql = readTableCreateBody(expected, name);
      const actualCreateSql = readTableCreateBody(db, name);
      return (
        (
          actualCreateSql === expectedCreateSql ||
          actualCreateSql === legacyCurrentSchemaCreateSql(name, expectedCreateSql)
        ) &&
        JSON.stringify(readTableColumns(db, name)) ===
          JSON.stringify(readTableColumns(expected, name))
      );
    });
  } finally {
    expected.close();
  }
};

const assertCurrentSamplePoolNamesFit = (db: Database.Database): void => {
  for (const { name } of CURRENT_SCHEMA_SAMPLE_POOL_NAME_REPAIR_TABLES) {
    const maxLength = Number(
      db
        .prepare(`SELECT MAX(LENGTH(sample_pool_name)) FROM ${name}`)
        .pluck()
        .get() ?? 0,
    );
    if (!Number.isFinite(maxLength) || maxLength > 20) {
      throw new Error("CURRENT_SCHEMA_SAMPLE_POOL_NAME_REPAIR_NOT_SAFE");
    }
  }
};

const createRecoverableBackup = (
  db: Database.Database,
  storageLayout: DesktopStorageLayout,
): string => {
  const backupDirectory = path.join(storageLayout.appRootDir, "core-schema-backups");
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const backupPath = path.join(
    backupDirectory,
    `core-schema-${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID()}.db`,
  );
  db.exec(`VACUUM INTO ${quoteSqlLiteral(backupPath)}`);
  return backupPath;
};

const applyCurrentSchemaSamplePoolNameRepair = (db: Database.Database): void => {
  const foreignKeysEnabled = Number(db.pragma("foreign_keys", { simple: true })) === 1;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      for (const { name, temporaryName } of CURRENT_SCHEMA_REPAIR_TABLES) {
        db.exec(`CREATE TEMP TABLE ${temporaryName} AS SELECT * FROM ${name}`);
      }
      for (const { name } of CURRENT_SCHEMA_REPAIR_TABLES) {
        db.exec(`DROP TABLE ${name}`);
      }
      db.exec(schemaSql);
      for (const { name, temporaryName } of CURRENT_SCHEMA_REPAIR_TABLES) {
        db.exec(`INSERT INTO ${name} SELECT * FROM ${temporaryName}`);
        db.exec(`DROP TABLE ${temporaryName}`);
      }
      if (inspectCoreSchemaManifest(db, DB_SCHEMA_VERSION).length > 0) {
        throw new Error("CURRENT_SCHEMA_SAMPLE_POOL_NAME_REPAIR_INCOMPLETE");
      }
      const foreignKeyViolations = db.pragma("foreign_key_check") as unknown[];
      if (foreignKeyViolations.length > 0) {
        throw new Error("CURRENT_SCHEMA_SAMPLE_POOL_NAME_REPAIR_FOREIGN_KEY_FAILURE");
      }
    })();
  } finally {
    if (foreignKeysEnabled) {
      db.pragma("foreign_keys = ON");
    }
  }
};

const isInsufficientDiskSpaceError = (error: unknown): boolean => {
  const code = String((error as NodeJS.ErrnoException | null)?.code ?? "");
  if (code === "ENOSPC" || code === "SQLITE_FULL") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b(?:no space left on device|database or disk is full)\b/iu.test(message);
};

const measureAvailableBytes = (targetDir: string): number | null => {
  try {
    const statfs = fs.statfsSync(targetDir);
    const availableBlocks = Number(statfs.bavail ?? Number.NaN);
    const blockSize = Number(statfs.bsize ?? Number.NaN);
    if (!Number.isFinite(availableBlocks) || !Number.isFinite(blockSize)) {
      return null;
    }
    return Math.max(0, Math.floor(availableBlocks * blockSize));
  } catch {
    return null;
  }
};

export const upgradeSupportedCoreSchema = (
  storageLayout: DesktopStorageLayout,
): CoreSchemaUpgradeResult => {
  if (!fs.existsSync(storageLayout.dbPath)) {
    return result("NO_DATABASE", null);
  }

  let db: Database.Database | null = null;
  let fromVersion: string | null = null;
  let backupPath: string | null = null;
  try {
    db = new Database(storageLayout.dbPath, { fileMustExist: true });
    db.pragma("busy_timeout = 5000");
    fromVersion = readSchemaVersion(db);
    if (!hasValidIntegrity(db)) {
      db.close();
      db = null;
      return result("FAILED", fromVersion, "INTEGRITY_CHECK_FAILED");
    }
  } catch (error) {
    db?.close();
    if (isInsufficientDiskSpaceError(error)) {
      return result(
        "FAILED",
        fromVersion,
        "INSUFFICIENT_DISK_SPACE",
        null,
        measureAvailableBytes(storageLayout.appRootDir),
      );
    }
    return result("FAILED", fromVersion, "CORE_DATABASE_UNREADABLE");
  }

  try {
    if (fromVersion !== DB_SCHEMA_VERSION) {
      return result("UNSUPPORTED", fromVersion);
    }
    const differences = inspectCoreSchemaManifest(db, DB_SCHEMA_VERSION);
    if (differences.length === 0) {
      return result("CURRENT", fromVersion);
    }
    if (!isRepairableCurrentSchemaShape(db, differences)) {
      return result("FAILED", fromVersion, "SHAPE_MISMATCH");
    }
    assertCurrentSamplePoolNamesFit(db);
    backupPath = createRecoverableBackup(db, storageLayout);
    applyCurrentSchemaSamplePoolNameRepair(db);
    return result("UPGRADED", fromVersion, null, backupPath);
  } catch (error) {
    if (isInsufficientDiskSpaceError(error)) {
      return result(
        "FAILED",
        fromVersion,
        "INSUFFICIENT_DISK_SPACE",
        backupPath,
        measureAvailableBytes(storageLayout.appRootDir),
      );
    }
    return result("FAILED", fromVersion, "MIGRATION_FAILED", backupPath);
  } finally {
    db?.close();
  }
};
