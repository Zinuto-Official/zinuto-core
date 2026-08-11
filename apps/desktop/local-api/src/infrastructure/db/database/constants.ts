// SPDX-License-Identifier: GPL-3.0-only

export const DB_FILE_NAME = "zinuto.db";
export const DB_SCHEMA_VERSION = "2026-08-12-open-source-desktop-v2";
export const MARKET_DB_FILE_NAME = "zinuto.market.duckdb";
export const MARKET_SCHEMA_VERSION = "2026-07-20-market-double-storage-v1";
export const CORE_SCHEMA_STARTUP_SCRATCH_BYTES = 64 * 1024 * 1024;
export const MARKET_STARTUP_SCRATCH_BYTES = 16 * 1024 * 1024;
export const GLOBAL_STARTUP_MIN_FREE_BYTES = 1024 * 1024 * 1024;
export const SQLITE_VACUUM_FREE_PAGE_RATIO = 0.05;
export const STORAGE_USAGE_DB_ALLOCATABLE_RATIO = 0.85;
