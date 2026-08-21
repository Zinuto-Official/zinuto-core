// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runtimeLimits } from "../../../kernel/runtimeLimits.js";
import { nowIso } from "../../../kernel/time.js";
import {
  buildDatabaseStorageUsageSummary,
  buildEstimatedDatabaseStorageUsageSummary,
  type DatabaseStorageUsageSummary,
} from "../storageUsageSummary.js";
import {
  SQLITE_VACUUM_FREE_PAGE_RATIO,
  STORAGE_USAGE_DB_ALLOCATABLE_RATIO,
} from "./constants.js";
import { DESKTOP_STORAGE_LAYOUT } from "./location.js";

type EstimatedStorageUsageCategoryKey =
  | "trainingDataBytes"
  | "replayNotesBytes"
  | "marketDataBytes"
  | "systemSettingsBytes"
  | "statsDataBytes";

type StorageUsageEstimateTableConfig = {
  tableName: string;
  categoryKey: EstimatedStorageUsageCategoryKey;
  approxBytesPerRow: number;
};

export const quoteSqlIdentifier = (value: string): string =>
  `"${String(value).replaceAll('"', '""')}"`;

const STORAGE_USAGE_ESTIMATE_TABLES: StorageUsageEstimateTableConfig[] = [
  {
    tableName: "training_projects",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 2_048,
  },
  {
    tableName: "training_project_replay_refs",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 4_096,
  },
  {
    tableName: "training_project_replay_fills",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 160,
  },
  {
    tableName: "training_project_replay_cash_adjustments",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 144,
  },
  {
    tableName: "replay_sessions",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 2_048,
  },
  {
    tableName: "sim_orders",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 384,
  },
  {
    tableName: "sim_fills",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 384,
  },
  {
    tableName: "sim_accrual_events",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 192,
  },
  {
    tableName: "replay_session_metric_totals",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 128,
  },
  {
    tableName: "positions",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 256,
  },
  {
    tableName: "cash_transfers",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 192,
  },
  {
    tableName: "special_training_banks",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 768,
  },
  {
    tableName: "special_training_question_scope_indexes",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 4_096,
  },
  {
    tableName: "special_training_question_draw_cursors",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 192,
  },
  {
    tableName: "special_training_question_ledger",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 640,
  },
  {
    tableName: "special_training_history_sessions",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 1_536,
  },
  {
    tableName: "special_training_history_questions",
    categoryKey: "trainingDataBytes",
    approxBytesPerRow: 5_120,
  },
  {
    tableName: "special_training_stats_projection",
    categoryKey: "statsDataBytes",
    approxBytesPerRow: 1_536,
  },
  {
    tableName: "training_stats_sessions",
    categoryKey: "statsDataBytes",
    approxBytesPerRow: 1_536,
  },
  {
    tableName: "training_stats_tags",
    categoryKey: "statsDataBytes",
    approxBytesPerRow: 96,
  },
  {
    tableName: "training_stats_monthly",
    categoryKey: "statsDataBytes",
    approxBytesPerRow: 256,
  },
  {
    tableName: "training_stats_pool",
    categoryKey: "statsDataBytes",
    approxBytesPerRow: 256,
  },
  {
    tableName: "training_stats_symbol",
    categoryKey: "statsDataBytes",
    approxBytesPerRow: 256,
  },
  {
    tableName: "training_stats_timeframe",
    categoryKey: "statsDataBytes",
    approxBytesPerRow: 256,
  },
  {
    tableName: "replay_notes",
    categoryKey: "replayNotesBytes",
    approxBytesPerRow: 512,
  },
  {
    tableName: "replay_note_contents",
    categoryKey: "replayNotesBytes",
    approxBytesPerRow: 4_096,
  },
  {
    tableName: "replay_note_context_refs",
    categoryKey: "replayNotesBytes",
    approxBytesPerRow: 192,
  },
  {
    tableName: "replay_note_special_training_context_refs",
    categoryKey: "replayNotesBytes",
    approxBytesPerRow: 160,
  },
  {
    tableName: "replay_note_context_archives",
    categoryKey: "replayNotesBytes",
    approxBytesPerRow: 8_192,
  },
  {
    tableName: "replay_note_attachments",
    categoryKey: "replayNotesBytes",
    approxBytesPerRow: 1_024,
  },
  {
    tableName: "replay_note_meta",
    categoryKey: "replayNotesBytes",
    approxBytesPerRow: 1_024,
  },
  {
    tableName: "replay_note_colors",
    categoryKey: "replayNotesBytes",
    approxBytesPerRow: 96,
  },
  {
    tableName: "instruments",
    categoryKey: "marketDataBytes",
    approxBytesPerRow: 512,
  },
  {
    tableName: "local_data_sources",
    categoryKey: "marketDataBytes",
    approxBytesPerRow: 1_024,
  },
  {
    tableName: "local_data_import_jobs",
    categoryKey: "marketDataBytes",
    approxBytesPerRow: 1_024,
  },
  {
    tableName: "local_data_source_files",
    categoryKey: "marketDataBytes",
    approxBytesPerRow: 256,
  },
  {
    tableName: "users",
    categoryKey: "systemSettingsBytes",
    approxBytesPerRow: 512,
  },
  {
    tableName: "accounts",
    categoryKey: "systemSettingsBytes",
    approxBytesPerRow: 768,
  },
  {
    tableName: "user_settings",
    categoryKey: "systemSettingsBytes",
    approxBytesPerRow: 2_048,
  },
  {
    tableName: "user_app_preferences",
    categoryKey: "systemSettingsBytes",
    approxBytesPerRow: 2_048,
  },
  {
    tableName: "app_meta",
    categoryKey: "systemSettingsBytes",
    approxBytesPerRow: 512,
  },
  {
    tableName: "custom_indicator_profiles",
    categoryKey: "systemSettingsBytes",
    approxBytesPerRow: 4_096,
  },
];

export type DatabaseStorageFootprint = {
  dbBytes: number;
  walBytes: number;
  shmBytes: number;
  totalBytes: number;
};

export type DatabaseCheckpointMode = "PASSIVE" | "TRUNCATE";

export type DatabaseMaintenanceApi = {
  getDatabaseStorageFootprint: () => DatabaseStorageFootprint;
  sweepStaleDuckdbTempArtifacts: () => {
    deletedEntries: number;
    deletedBytes: number;
  };
  checkpointDatabaseStorage: (
    mode?: DatabaseCheckpointMode,
  ) => DatabaseStorageFootprint;
  reclaimDatabaseStorage: () => DatabaseStorageFootprint;
  runDatabaseMaintenance: () => {
    footprintBefore: DatabaseStorageFootprint;
    footprintAfter: DatabaseStorageFootprint;
    reclaimedBytes: number;
  };
  getDatabaseStorageUsageSummary: () => DatabaseStorageUsageSummary;
};

type CreateDatabaseMaintenanceApiOptions = {
  db: Database.Database;
  dbFilePath: string;
  duckdbTempDir?: string;
  duckdbTempArtifactMaxAgeMs?: number;
};

const DEFAULT_DUCKDB_TEMP_ARTIFACT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const createDatabaseMaintenanceApi = ({
  db,
  dbFilePath,
  duckdbTempDir = DESKTOP_STORAGE_LAYOUT.duckdbTempDir,
  duckdbTempArtifactMaxAgeMs = DEFAULT_DUCKDB_TEMP_ARTIFACT_MAX_AGE_MS,
}: CreateDatabaseMaintenanceApiOptions): DatabaseMaintenanceApi => {
  const tryPragma = (pragmaSql: string): void => {
    try {
      db.pragma(pragmaSql);
    } catch {
      // keep startup resilient across sqlite builds
    }
  };

  const runSqliteOptimize = (): void => {
    tryPragma(
      `analysis_limit = ${String(runtimeLimits.sqliteOptimizeAnalysisLimit)}`,
    );
    tryPragma("optimize");
  };

  const readDatabaseFreePageStats = (): {
    pageCount: number;
    freePageCount: number;
  } => {
    try {
      const pageCount = Math.max(
        0,
        Math.floor(Number(db.prepare("PRAGMA page_count").pluck().get() ?? 0)),
      );
      const freePageCount = Math.max(
        0,
        Math.floor(
          Number(db.prepare("PRAGMA freelist_count").pluck().get() ?? 0),
        ),
      );
      return {
        pageCount,
        freePageCount: Math.min(pageCount, freePageCount),
      };
    } catch {
      return {
        pageCount: 0,
        freePageCount: 0,
      };
    }
  };

  tryPragma("journal_mode = WAL");
  tryPragma(`busy_timeout = ${String(runtimeLimits.sqliteBusyTimeoutMs)}`);
  tryPragma("foreign_keys = ON");
  tryPragma("synchronous = NORMAL");
  tryPragma("temp_store = MEMORY");
  tryPragma(
    `cache_size = -${String(Math.max(1024, Math.floor(runtimeLimits.sqliteCacheBytes / 1024)))}`,
  );
  tryPragma(`mmap_size = ${String(runtimeLimits.sqliteMmapBytes)}`);
  // Keep WAL growth bounded under long-running write sessions.
  tryPragma(
    `wal_autocheckpoint = ${String(runtimeLimits.sqliteWalAutocheckpointPages)}`,
  );
  tryPragma(
    `journal_size_limit = ${String(runtimeLimits.sqliteJournalSizeLimitBytes)}`,
  );
  runSqliteOptimize();

  const safeStatSize = (filePath: string): number => {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  };

  const readRecursivePathBytes = (targetPath: string): number => {
    try {
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        return Math.max(0, stat.size);
      }
      let total = 0;
      fs.readdirSync(targetPath, { withFileTypes: true }).forEach((entry) => {
        total += readRecursivePathBytes(path.join(targetPath, entry.name));
      });
      return total;
    } catch {
      return 0;
    }
  };

  const sweepStaleDuckdbTempArtifacts = (): {
    deletedEntries: number;
    deletedBytes: number;
  } => {
    const rawTempDir = String(duckdbTempDir || "").trim();
    if (!rawTempDir) {
      return { deletedEntries: 0, deletedBytes: 0 };
    }
    const normalizedTempDir = path.resolve(rawTempDir);
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(normalizedTempDir, { withFileTypes: true });
    } catch {
      return { deletedEntries: 0, deletedBytes: 0 };
    }
    const maxAgeMs = Math.max(
      60_000,
      Math.floor(Number(duckdbTempArtifactMaxAgeMs) || DEFAULT_DUCKDB_TEMP_ARTIFACT_MAX_AGE_MS),
    );
    const staleBeforeMs = Date.now() - maxAgeMs;
    let deletedEntries = 0;
    let deletedBytes = 0;
    entries.forEach((entry) => {
      const targetPath = path.join(normalizedTempDir, entry.name);
      try {
        const stat = fs.statSync(targetPath);
        if (stat.mtimeMs > staleBeforeMs) {
          return;
        }
        const bytes = readRecursivePathBytes(targetPath);
        fs.rmSync(targetPath, { recursive: true, force: true });
        deletedEntries += 1;
        deletedBytes += bytes;
      } catch {
        // best-effort cleanup; active DuckDB files can disappear while scanning
      }
    });
    return { deletedEntries, deletedBytes };
  };

  sweepStaleDuckdbTempArtifacts();

  const readDatabaseStorageFootprint = (): DatabaseStorageFootprint => {
    const dbBytes = safeStatSize(dbFilePath);
    const walBytes = safeStatSize(`${dbFilePath}-wal`);
    const shmBytes = safeStatSize(`${dbFilePath}-shm`);
    return {
      dbBytes,
      walBytes,
      shmBytes,
      totalBytes: dbBytes + walBytes + shmBytes,
    };
  };

  const readDatabaseDbstatRows = (): Array<{ name: string; bytes: number }> | null => {
    try {
      return db
        .prepare(
          `SELECT name, SUM(pgsize) AS bytes
             FROM dbstat
            GROUP BY name`,
        )
        .all() as Array<{ name: string; bytes: number }>;
    } catch {
      return null;
    }
  };

  const checkpointDatabaseStorage = (
    mode: DatabaseCheckpointMode = "TRUNCATE",
  ): DatabaseStorageFootprint => {
    if (mode !== "PASSIVE") {
      sweepStaleDuckdbTempArtifacts();
    }
    try {
      db.pragma(`wal_checkpoint(${mode})`);
    } catch {
      // ignore checkpoint failures
    }
    return readDatabaseStorageFootprint();
  };

  const storageUsageCountStmtCache = new Map<string, Database.Statement>();

  const readEstimatedTableRowCount = (tableName: string): number => {
    const normalizedTableName = String(tableName ?? "").trim();
    if (!normalizedTableName) {
      return 0;
    }
    try {
      let stmt = storageUsageCountStmtCache.get(normalizedTableName);
      if (!stmt) {
        stmt = db.prepare(
          `SELECT COUNT(*) AS count FROM ${quoteSqlIdentifier(normalizedTableName)}`,
        );
        storageUsageCountStmtCache.set(normalizedTableName, stmt);
      }
      const row = stmt.get() as { count?: unknown } | undefined;
      return Math.max(0, Math.floor(Number(row?.count ?? 0) || 0));
    } catch {
      return 0;
    }
  };

  const buildEstimatedStorageUsageCategoryBytes = (
    physicalFootprint: DatabaseStorageFootprint,
  ): {
    trainingDataBytes: number;
    replayNotesBytes: number;
    marketDataBytes: number;
    systemSettingsBytes: number;
    statsDataBytes: number;
  } => {
    const rawCategoryBytes = {
      trainingDataBytes: 0,
      replayNotesBytes: 0,
      marketDataBytes: 0,
      systemSettingsBytes: 0,
      statsDataBytes: 0,
    };

    STORAGE_USAGE_ESTIMATE_TABLES.forEach((config) => {
      const rowCount = readEstimatedTableRowCount(config.tableName);
      rawCategoryBytes[config.categoryKey] +=
        rowCount * config.approxBytesPerRow;
    });

    const rawEstimatedTotal =
      rawCategoryBytes.trainingDataBytes +
      rawCategoryBytes.replayNotesBytes +
      rawCategoryBytes.marketDataBytes +
      rawCategoryBytes.systemSettingsBytes +
      rawCategoryBytes.statsDataBytes;

    if (rawEstimatedTotal <= 0) {
      return rawCategoryBytes;
    }

    const allocatableDbBytes = Math.max(
      0,
      Math.floor(
        Math.max(0, Number(physicalFootprint.dbBytes ?? 0)) *
          STORAGE_USAGE_DB_ALLOCATABLE_RATIO,
      ),
    );
    if (allocatableDbBytes <= 0) {
      return {
        trainingDataBytes: 0,
        replayNotesBytes: 0,
        marketDataBytes: 0,
        systemSettingsBytes: 0,
        statsDataBytes: 0,
      };
    }

    const scale = allocatableDbBytes / rawEstimatedTotal;
    return {
      trainingDataBytes: Math.floor(rawCategoryBytes.trainingDataBytes * scale),
      replayNotesBytes: Math.floor(rawCategoryBytes.replayNotesBytes * scale),
      marketDataBytes: Math.floor(rawCategoryBytes.marketDataBytes * scale),
      systemSettingsBytes: Math.floor(rawCategoryBytes.systemSettingsBytes * scale),
      statsDataBytes: Math.floor(rawCategoryBytes.statsDataBytes * scale),
    };
  };

  const getDatabaseStorageUsageSummary = (): DatabaseStorageUsageSummary => {
    const physicalFootprint = readDatabaseStorageFootprint();
    const dbstatRows = readDatabaseDbstatRows();
    if (dbstatRows?.length) {
      return buildDatabaseStorageUsageSummary({
        measuredAt: nowIso(),
        dbstatRows,
        physicalFootprint,
      });
    }
    return buildEstimatedDatabaseStorageUsageSummary({
      measuredAt: nowIso(),
      estimatedCategories: buildEstimatedStorageUsageCategoryBytes(
        physicalFootprint,
      ),
      physicalFootprint,
    });
  };

  const readDatabaseFreeBytes = (): number => {
    try {
      const pageSize = Math.max(
        1,
        Math.floor(Number(db.prepare("PRAGMA page_size").pluck().get() ?? 0)),
      );
      const { freePageCount } = readDatabaseFreePageStats();
      return freePageCount * pageSize;
    } catch {
      return 0;
    }
  };

  const reclaimDatabaseStorage = (): DatabaseStorageFootprint => {
    sweepStaleDuckdbTempArtifacts();
    checkpointDatabaseStorage();

    const { pageCount, freePageCount } = readDatabaseFreePageStats();
    const freePageRatio = pageCount > 0 ? freePageCount / pageCount : 0;
    const freeBytes = readDatabaseFreeBytes();
    const shouldVacuum =
      (freePageCount >= runtimeLimits.sqliteVacuumMinFreePages &&
        freePageRatio >= SQLITE_VACUUM_FREE_PAGE_RATIO) ||
      freeBytes > 50 * 1024 * 1024;

    if (shouldVacuum) {
      try {
        db.exec("VACUUM");
      } catch {
        // ignore vacuum failures
      }
    }

    checkpointDatabaseStorage();
    runSqliteOptimize();

    return readDatabaseStorageFootprint();
  };

  const runDatabaseMaintenance = (): {
    footprintBefore: DatabaseStorageFootprint;
    footprintAfter: DatabaseStorageFootprint;
    reclaimedBytes: number;
  } => {
    const footprintBefore = readDatabaseStorageFootprint();
    reclaimDatabaseStorage();
    runSqliteOptimize();
    try {
      db.exec(
        "INSERT INTO replay_notes_fts(replay_notes_fts) VALUES('optimize')",
      );
    } catch {
      // ignore fts optimize failures
    }
    const footprintAfter = readDatabaseStorageFootprint();
    return {
      footprintBefore,
      footprintAfter,
      reclaimedBytes: Math.max(
        0,
        footprintBefore.totalBytes - footprintAfter.totalBytes,
      ),
    };
  };

  return {
    getDatabaseStorageFootprint: readDatabaseStorageFootprint,
    sweepStaleDuckdbTempArtifacts,
    checkpointDatabaseStorage,
    reclaimDatabaseStorage,
    runDatabaseMaintenance,
    getDatabaseStorageUsageSummary,
  };
};
