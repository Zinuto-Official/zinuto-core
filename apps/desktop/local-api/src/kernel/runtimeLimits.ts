// SPDX-License-Identifier: GPL-3.0-only

import os from 'node:os';
import {
  API_BODY_LIMITS,
  IMPORT_LIMITS,
  SYSTEM_RESET_LIMITS,
} from '@zinuto/shared/input-limits';

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

type ByteUnit = 'b' | 'kb' | 'mb' | 'gb';

const BYTE_UNIT_MAP: Record<ByteUnit, number> = {
  b: 1,
  kb: KB,
  mb: MB,
  gb: GB
};

const parsePositiveInt = (rawValue: unknown): number | null => {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : null;
};

const parseByteSize = (rawValue: unknown): number | null => {
  const value = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : '';
  if (!value) {
    return null;
  }

  const pureInt = parsePositiveInt(value);
  if (pureInt !== null) {
    return pureInt;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase() as ByteUnit;
  if (!Number.isFinite(amount) || amount <= 0 || !(unit in BYTE_UNIT_MAP)) {
    return null;
  }
  const bytes = Math.floor(amount * BYTE_UNIT_MAP[unit]);
  return bytes > 0 ? bytes : null;
};

const readIntEnv = (name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number => {
  const parsed = parsePositiveInt(process.env[name]);
  if (parsed === null) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
};

const readByteEnv = (name: string, fallback: number): number => {
  const parsed = parseByteSize(process.env[name]);
  if (parsed === null) {
    return fallback;
  }
  return Math.max(1, parsed);
};

const readBooleanEnv = (name: string, fallback = false): boolean => {
  const raw = typeof process.env[name] === 'string' ? process.env[name].trim().toLowerCase() : '';
  if (!raw) {
    return fallback;
  }
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return true;
  }
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }
  return fallback;
};

export const runtimeLimits = Object.freeze({
  apiJsonBodyLimitBytes: readByteEnv('ZINUTO_LIMIT_API_JSON_BODY', API_BODY_LIMITS.desktopJsonBodyBytes),
  sqliteBusyTimeoutMs: readIntEnv('ZINUTO_LIMIT_SQLITE_BUSY_TIMEOUT_MS', 15_000, 1_000, 120_000),
  sqliteCacheBytes: readByteEnv('ZINUTO_LIMIT_SQLITE_CACHE_BYTES', 64 * MB),
  sqliteMmapBytes: readByteEnv('ZINUTO_LIMIT_SQLITE_MMAP_BYTES', 256 * MB),
  sqliteJournalSizeLimitBytes: readByteEnv('ZINUTO_LIMIT_SQLITE_JOURNAL_SIZE_LIMIT_BYTES', 64 * MB),
  sqliteWalAutocheckpointPages: readIntEnv('ZINUTO_LIMIT_SQLITE_WAL_AUTOCHECKPOINT_PAGES', 512, 64, 16_384),
  sqliteOptimizeAnalysisLimit: readIntEnv('ZINUTO_LIMIT_SQLITE_OPTIMIZE_ANALYSIS_LIMIT', 1000, 100, 100_000),
  sqliteVacuumMinFreePages: readIntEnv('ZINUTO_LIMIT_SQLITE_VACUUM_MIN_FREE_PAGES', 512, 32, 1_000_000),
  uploadMaxFiles: readIntEnv('ZINUTO_LIMIT_UPLOAD_MAX_FILES', IMPORT_LIMITS.maxFiles, 1, IMPORT_LIMITS.maxFiles),
  uploadMaxSingleFileBytes: readByteEnv('ZINUTO_LIMIT_UPLOAD_MAX_SINGLE_FILE_BYTES', IMPORT_LIMITS.maxSingleFileBytes),
  uploadMaxTotalBytes: readByteEnv('ZINUTO_LIMIT_UPLOAD_MAX_TOTAL_BYTES', IMPORT_LIMITS.maxTotalBytes),
  uploadMaxDepth: readIntEnv('ZINUTO_LIMIT_UPLOAD_MAX_DEPTH', IMPORT_LIMITS.maxDepth, 1, IMPORT_LIMITS.maxDepth),
  sessionStepCountMax: readIntEnv('ZINUTO_LIMIT_SESSION_STEP_MAX', 500),
  orderNextOpenDelayBarsMax: readIntEnv('ZINUTO_LIMIT_ORDER_NEXT_OPEN_DELAY_MAX', 20_000),
  barsRangeLimitMax: readIntEnv('ZINUTO_LIMIT_BARS_RANGE_MAX', 50_000),
  importParallelFiles: readIntEnv(
    'ZINUTO_LIMIT_IMPORT_PARALLEL_FILES',
    Math.max(1, Math.min(8, (os.cpus()?.length ?? 1))),
    1,
    12
  ),
  importJobQueueMaxQueuedJobs: readIntEnv('ZINUTO_LIMIT_IMPORT_JOB_QUEUE_MAX', 32, 1, 500),
  importPreviewJobDeadlineMs: readIntEnv(
    'ZINUTO_LIMIT_IMPORT_PREVIEW_JOB_DEADLINE_MS',
    IMPORT_LIMITS.previewJobDeadlineMs,
    10_000,
    IMPORT_LIMITS.previewJobDeadlineMaxMs
  ),
  importPreviewMaxConcurrentJobs: readIntEnv(
    'ZINUTO_LIMIT_IMPORT_PREVIEW_MAX_CONCURRENT_JOBS',
    2,
    1,
    8
  ),
  importJobExecutionDeadlineMs: readIntEnv(
    'ZINUTO_LIMIT_IMPORT_JOB_EXECUTION_DEADLINE_MS',
    IMPORT_LIMITS.importJobDeadlineMs,
    60_000,
    IMPORT_LIMITS.importJobDeadlineMaxMs
  ),
  resetJobDeadlineMs: readIntEnv(
    'ZINUTO_LIMIT_RESET_JOB_DEADLINE_MS',
    SYSTEM_RESET_LIMITS.jobDeadlineMs,
    10_000,
    SYSTEM_RESET_LIMITS.jobDeadlineMaxMs
  ),
  resetRecoveryDeadlineMs: readIntEnv(
    'ZINUTO_LIMIT_RESET_RECOVERY_DEADLINE_MS',
    SYSTEM_RESET_LIMITS.recoveryDeadlineMs,
    10_000,
    SYSTEM_RESET_LIMITS.recoveryDeadlineMaxMs
  ),
  trainingProjectsQueryLimitMax: readIntEnv('ZINUTO_LIMIT_TRAINING_PROJECTS_QUERY_MAX', 200),
  replayNotesQueryLimitMax: readIntEnv('ZINUTO_LIMIT_REPLAY_NOTES_QUERY_MAX', 200),
  archiveReplayFillsMax: readIntEnv('ZINUTO_LIMIT_ARCHIVE_REPLAY_FILLS_MAX', 80_000),
  archiveDrawingCountMax: readIntEnv('ZINUTO_LIMIT_ARCHIVE_DRAWING_COUNT_MAX', 12_000),
  archiveTextCharsMax: readIntEnv('ZINUTO_LIMIT_ARCHIVE_TEXT_CHARS_MAX', 240),
  noteContentPreviewMaxChars: readIntEnv('ZINUTO_LIMIT_NOTE_PREVIEW_MAX_CHARS', 140),
  replayNoteSnapshotSourceMaxBytes: readByteEnv('ZINUTO_LIMIT_REPLAY_NOTE_SNAPSHOT_SOURCE_BYTES', 24 * MB),
  replayNoteSnapshotCompressedMaxBytes: readByteEnv('ZINUTO_LIMIT_REPLAY_NOTE_SNAPSHOT_COMPRESSED_BYTES', 8 * MB),
  customIndicatorSavedProfilesMax: readIntEnv('ZINUTO_LIMIT_CUSTOM_INDICATOR_SAVED_PROFILES_MAX', 80, 1, 1000),
  customIndicatorProfileRevisionsMax: readIntEnv('ZINUTO_LIMIT_CUSTOM_INDICATOR_PROFILE_REVISIONS_MAX', 12, 1, 200),
  customIndicatorStorageBytesMax: readByteEnv('ZINUTO_LIMIT_CUSTOM_INDICATOR_STORAGE_BYTES_MAX', 4 * MB),
  idleMaintenanceStartupDelayMs: readIntEnv('ZINUTO_LIMIT_IDLE_MAINT_STARTUP_DELAY_MS', 60_000, 1000, 10 * 60 * 1000),
  idleMaintenanceApiQuietWindowMs: readIntEnv('ZINUTO_LIMIT_IDLE_MAINT_API_QUIET_WINDOW_MS', 30_000, 1000, 10 * 60 * 1000),
  idleMaintenanceCheckpointIntervalMs: readIntEnv('ZINUTO_LIMIT_IDLE_MAINT_CHECKPOINT_INTERVAL_MS', 5 * 60 * 1000, 10_000, 60 * 60 * 1000),
  idleMaintenanceDuckdbCooldownMs: readIntEnv('ZINUTO_LIMIT_IDLE_MAINT_DUCKDB_COOLDOWN_MS', 45 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000),
  idleMaintenanceDuckdbFullCycleMs: readIntEnv('ZINUTO_LIMIT_IDLE_MAINT_DUCKDB_FULL_CYCLE_MS', 6 * 60 * 60 * 1000, 5 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
  idleMaintenanceDuckdbWalBytes: readByteEnv('ZINUTO_LIMIT_IDLE_MAINT_DUCKDB_WAL_BYTES', 64 * MB),
  idleMaintenanceDuckdbMinDbBytes: readByteEnv('ZINUTO_LIMIT_IDLE_MAINT_DUCKDB_MIN_DB_BYTES', 256 * MB),
  duckdbObjectCacheEnabled: readBooleanEnv('ZINUTO_LIMIT_DUCKDB_OBJECT_CACHE_ENABLED', true),
  marketReadConnectionPoolSize: readIntEnv('ZINUTO_LIMIT_MARKET_READ_CONNECTION_POOL_SIZE', 4, 1, 8),
  marketBarCountCacheMaxEntries: readIntEnv('ZINUTO_LIMIT_MARKET_BAR_COUNT_CACHE_MAX', 4096, 64, 100_000),
  marketBarCountCacheTtlMs: readIntEnv('ZINUTO_LIMIT_MARKET_BAR_COUNT_CACHE_TTL_MS', 20 * 60 * 1000, 10_000, 24 * 60 * 60 * 1000)
});
