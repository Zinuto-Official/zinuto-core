// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import os from 'node:os';
import { DESKTOP_STORAGE_LAYOUT } from '../database/location.js';
import type { DisplayPeriodKey } from '@zinuto/shared/period';

export const MARKET_DB_FILE_PATH = DESKTOP_STORAGE_LAYOUT.marketDbPath;
export const DUCKDB_TEMP_DIR = DESKTOP_STORAGE_LAYOUT.duckdbTempDir;
if (!fs.existsSync(DUCKDB_TEMP_DIR)) {
  fs.mkdirSync(DUCKDB_TEMP_DIR, { recursive: true });
}
export const DUCKDB_THREAD_COUNT = Math.max(2, Math.min(12, os.cpus()?.length ?? 4));
export const DUCKDB_MEMORY_LIMIT_MB = Math.max(
  1024,
  Math.min(16384, Math.floor((os.totalmem() / (1024 * 1024)) * 0.6))
);
export const MARKET_DB_COMPACT_FREE_BLOCK_RATIO = 0.2;
export const MARKET_DB_COMPACT_MIN_FREE_BLOCKS = 128;
export const MARKET_CSV_IMPORT_SAMPLE_SIZE = 4096;
export const MARKET_CSV_IMPORT_FILE_STAGE_TABLE = 'market_csv_import_file_stage';
export const MARKET_BAR_CHUNK_SIZE = 512;
export const MARKET_DISPLAY_ANCHOR_STRIDE = 1024;
export const MARKET_TIMELINE_DISPLAY_PERIODS: DisplayPeriodKey[] = [
  '1m',
  '5m',
  '1h',
  '1d',
  '1w',
  '1month',
  '1year'
];
export const HOT_MARKET_TIMELINE_PREWARM_PERIODS: readonly DisplayPeriodKey[] = [
  '1m',
  '5m',
  '1h',
  '1d'
];
export const MARKET_TIMELINE_FIXED_PERIOD_MINUTES = new Map<DisplayPeriodKey, number>([
  ['1m', 1],
  ['5m', 5],
  ['1h', 60]
]);
export const MARKET_TIMELINE_CALENDAR_PERIODS: DisplayPeriodKey[] = [
  '1d',
  '1w',
  '1month',
  '1year'
];
export const MARKET_TIMELINE_PERSISTED_DISPLAY_PERIODS = new Set<DisplayPeriodKey>([
  '1d',
]);
export const SYMBOL_QUERY_CHUNK_SIZE = 400;
