// SPDX-License-Identifier: GPL-3.0-only

export type DatabaseStorageUsageSource =
  | "DBSTAT"
  | "ROW_COUNT_ESTIMATE"
  | "PHYSICAL_FALLBACK";

export type DatabaseStorageUsageSummary = {
  measuredAt: string;
  source: DatabaseStorageUsageSource;
  categories: {
    trainingDataBytes: number;
    replayNotesBytes: number;
    marketDataBytes: number;
    systemSettingsBytes: number;
    statsDataBytes: number;
    otherBytes: number;
  };
  logicalTotalBytes: number;
  physicalFootprint: DatabaseStorageFootprintLike;
  physicalTotalBytes: number;
};

type StorageUsageCategory =
  | "TRAINING"
  | "NOTES"
  | "MARKET"
  | "SYSTEM"
  | "OTHER";

type DbstatRow = {
  name: string;
  bytes: number;
};

type DatabaseStorageFootprintLike = {
  dbBytes: number;
  walBytes: number;
  shmBytes: number;
  totalBytes: number;
};

const STORAGE_CATEGORY_TOKENS: Record<StorageUsageCategory | "STATS", string[]> =
  {
    TRAINING: [
      "training_projects",
      "training_project_replay_refs",
      "training_project_replay_fills",
      "training_project_replay_cash_adjustments",
      "training_project_portable_previews",
      "special_training_banks",
      "special_training_question_scope_indexes",
      "special_training_question_draw_cursors",
      "special_training_question_ledger",
      "special_training_history_sessions",
      "special_training_history_questions",
      "special_training_question_snapshot_archives",
      "sim_orders",
      "sim_fills",
      "sim_accrual_events",
      "replay_session_metric_totals",
      "replay_sessions",
      "positions",
      "cash_transfers",
    ],
    STATS: [
      "special_training_stats_projection",
      "training_stats_sessions",
      "training_stats_tags",
      "training_stats_monthly",
      "training_stats_pool",
      "training_stats_symbol",
      "training_stats_timeframe",
    ],
    NOTES: [
      "replay_notes",
      "replay_note_contents",
      "replay_note_context_refs",
      "replay_note_special_training_context_refs",
      "replay_note_context_archives",
      "replay_note_attachments",
      "replay_note_colors",
    ],
    MARKET: [
      "instruments",
      "local_data_sources",
      "local_data_import_jobs",
      "local_data_source_files",
      "portable_source_manifests",
    ],
    SYSTEM: [
      "users",
      "accounts",
      "user_settings",
      "user_app_preferences",
      "app_meta",
      "custom_indicator_profiles",
    ],
    OTHER: [],
  };

const toSafeByteCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const resolveStorageCategoryByObjectName = (
  objectName: string,
): StorageUsageCategory => {
  const normalized = objectName.trim().toLowerCase();
  if (!normalized) {
    return "OTHER";
  }

  if (
    normalized === "sqlite_schema" ||
    normalized === "sqlite_sequence" ||
    normalized === "sqlite_stat1"
  ) {
    return "SYSTEM";
  }

  if (
    STORAGE_CATEGORY_TOKENS.TRAINING.some((token) => normalized.includes(token))
  ) {
    return "TRAINING";
  }
  if (
    STORAGE_CATEGORY_TOKENS.NOTES.some((token) => normalized.includes(token))
  ) {
    return "NOTES";
  }
  if (
    STORAGE_CATEGORY_TOKENS.MARKET.some((token) => normalized.includes(token))
  ) {
    return "MARKET";
  }
  if (
    STORAGE_CATEGORY_TOKENS.SYSTEM.some((token) => normalized.includes(token))
  ) {
    return "SYSTEM";
  }
  return "OTHER";
};

const summarizeDbstatRows = (
  rows: DbstatRow[],
): (Record<StorageUsageCategory, number> & { STATS: number }) => {
  const summary: Record<StorageUsageCategory, number> & { STATS: number } = {
    TRAINING: 0,
    NOTES: 0,
    MARKET: 0,
    SYSTEM: 0,
    STATS: 0,
    OTHER: 0,
  };

  rows.forEach((row) => {
    const normalized = String(row.name || "").trim().toLowerCase();
    const rowBytes = toSafeByteCount(row.bytes);
    if (!normalized || rowBytes <= 0) {
      return;
    }
    if (
      STORAGE_CATEGORY_TOKENS.STATS.some((token) => normalized.includes(token))
    ) {
      summary.STATS += rowBytes;
      return;
    }
    const category = resolveStorageCategoryByObjectName(normalized);
    summary[category] += rowBytes;
  });

  return summary;
};

export const buildDatabaseStorageUsageSummary = ({
  measuredAt,
  dbstatRows,
  physicalFootprint,
}: {
  measuredAt: string;
  dbstatRows: DbstatRow[] | null;
  physicalFootprint: DatabaseStorageFootprintLike;
}): DatabaseStorageUsageSummary => {
  const safePhysicalFootprint = {
    dbBytes: toSafeByteCount(physicalFootprint.dbBytes),
    walBytes: toSafeByteCount(physicalFootprint.walBytes),
    shmBytes: toSafeByteCount(physicalFootprint.shmBytes),
    totalBytes: toSafeByteCount(physicalFootprint.totalBytes),
  };

  if (!dbstatRows?.length) {
    return {
      measuredAt,
      source: "PHYSICAL_FALLBACK",
      categories: {
        trainingDataBytes: 0,
        replayNotesBytes: 0,
        marketDataBytes: 0,
        systemSettingsBytes: 0,
        statsDataBytes: 0,
        otherBytes: safePhysicalFootprint.totalBytes,
      },
      logicalTotalBytes: safePhysicalFootprint.totalBytes,
      physicalFootprint: safePhysicalFootprint,
      physicalTotalBytes: safePhysicalFootprint.totalBytes,
    };
  }

  const dbstatSummary = summarizeDbstatRows(dbstatRows);
  const sqliteAttributedDbBytes =
    dbstatSummary.TRAINING +
    dbstatSummary.NOTES +
    dbstatSummary.MARKET +
    dbstatSummary.SYSTEM +
    dbstatSummary.STATS +
    dbstatSummary.OTHER;
  const sqliteUnattributedDbBytes = Math.max(
    0,
    safePhysicalFootprint.dbBytes - sqliteAttributedDbBytes,
  );
  const otherBytes =
    dbstatSummary.OTHER +
    sqliteUnattributedDbBytes +
    safePhysicalFootprint.walBytes +
    safePhysicalFootprint.shmBytes;
  const logicalTotalBytes =
    dbstatSummary.TRAINING +
    dbstatSummary.NOTES +
    dbstatSummary.MARKET +
    dbstatSummary.SYSTEM +
    dbstatSummary.STATS +
    otherBytes;

  return {
    measuredAt,
    source: "DBSTAT",
    categories: {
      trainingDataBytes: dbstatSummary.TRAINING,
      replayNotesBytes: dbstatSummary.NOTES,
      marketDataBytes: dbstatSummary.MARKET,
      systemSettingsBytes: dbstatSummary.SYSTEM,
      statsDataBytes: dbstatSummary.STATS,
      otherBytes,
    },
    logicalTotalBytes,
    physicalFootprint: safePhysicalFootprint,
    physicalTotalBytes: safePhysicalFootprint.totalBytes,
  };
};

export const buildEstimatedDatabaseStorageUsageSummary = ({
  measuredAt,
  estimatedCategories,
  physicalFootprint,
}: {
  measuredAt: string;
  estimatedCategories: {
    trainingDataBytes: number;
    replayNotesBytes: number;
    marketDataBytes: number;
    systemSettingsBytes: number;
    statsDataBytes: number;
  };
  physicalFootprint: DatabaseStorageFootprintLike;
}): DatabaseStorageUsageSummary => {
  const safePhysicalFootprint = {
    dbBytes: toSafeByteCount(physicalFootprint.dbBytes),
    walBytes: toSafeByteCount(physicalFootprint.walBytes),
    shmBytes: toSafeByteCount(physicalFootprint.shmBytes),
    totalBytes: toSafeByteCount(physicalFootprint.totalBytes),
  };

  const categories = {
    trainingDataBytes: toSafeByteCount(estimatedCategories.trainingDataBytes),
    replayNotesBytes: toSafeByteCount(estimatedCategories.replayNotesBytes),
    marketDataBytes: toSafeByteCount(estimatedCategories.marketDataBytes),
    systemSettingsBytes: toSafeByteCount(
      estimatedCategories.systemSettingsBytes,
    ),
    statsDataBytes: toSafeByteCount(estimatedCategories.statsDataBytes),
    otherBytes: 0,
  };

  const attributedDbBytes =
    categories.trainingDataBytes +
    categories.replayNotesBytes +
    categories.marketDataBytes +
    categories.systemSettingsBytes +
    categories.statsDataBytes;

  categories.otherBytes =
    Math.max(0, safePhysicalFootprint.dbBytes - attributedDbBytes) +
    safePhysicalFootprint.walBytes +
    safePhysicalFootprint.shmBytes;

  const logicalTotalBytes =
    categories.trainingDataBytes +
    categories.replayNotesBytes +
    categories.marketDataBytes +
    categories.systemSettingsBytes +
    categories.statsDataBytes +
    categories.otherBytes;

  return {
    measuredAt,
    source: "ROW_COUNT_ESTIMATE",
    categories,
    logicalTotalBytes,
    physicalFootprint: safePhysicalFootprint,
    physicalTotalBytes: safePhysicalFootprint.totalBytes,
  };
};
