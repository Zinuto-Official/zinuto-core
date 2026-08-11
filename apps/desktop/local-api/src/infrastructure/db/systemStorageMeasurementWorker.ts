// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';

import { buildMarketStorageUsageSummary } from './marketStorageUsage.js';
import { buildDatabaseStorageUsageSummary } from './storageUsageSummary.js';
import type {
  SystemStorageMeasurementWorkerInput,
  SystemStorageMeasurementWorkerMessage,
  SystemStorageMeasurementWorkerResult,
} from './systemStorageMeasurementTypes.js';

const isMissingPathError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT',
  );

const readFileBytes = (targetPath: string): number => {
  try {
    const stat = fs.statSync(targetPath);
    return stat.isFile() ? Math.max(0, stat.size) : 0;
  } catch (error) {
    if (isMissingPathError(error)) {
      return 0;
    }
    throw error;
  }
};

const countDirectoryBytes = (rootPath: string): number => {
  const pendingDirectories = [rootPath];
  let totalBytes = 0;
  while (pendingDirectories.length > 0) {
    const directoryPath = pendingDirectories.pop();
    if (!directoryPath) {
      continue;
    }
    let directory: fs.Dir;
    try {
      directory = fs.opendirSync(directoryPath);
    } catch (error) {
      if (isMissingPathError(error)) {
        continue;
      }
      throw error;
    }
    try {
      for (;;) {
        const entry = directory.readSync();
        if (!entry) {
          break;
        }
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          pendingDirectories.push(entryPath);
        } else if (entry.isFile()) {
          totalBytes += readFileBytes(entryPath);
        }
      }
    } finally {
      directory.closeSync();
    }
  }
  return totalBytes;
};

const readCoreFootprint = (dbPath: string) => {
  const dbBytes = readFileBytes(dbPath);
  const walBytes = readFileBytes(`${dbPath}-wal`);
  const shmBytes = readFileBytes(`${dbPath}-shm`);
  return {
    dbBytes,
    walBytes,
    shmBytes,
    totalBytes: dbBytes + walBytes + shmBytes,
  };
};

const readMarketFootprint = (marketDbPath: string) => {
  const dbBytes = readFileBytes(marketDbPath);
  const walBytes = readFileBytes(`${marketDbPath}.wal`);
  const shmBytes = readFileBytes(`${marketDbPath}.tmp`);
  return {
    dbBytes,
    walBytes,
    shmBytes,
    totalBytes: dbBytes + walBytes + shmBytes,
  };
};

const readDbstatRows = (
  database: Database.Database,
): Array<{ name: string; bytes: number }> | null => {
  try {
    return database
      .prepare(
        `SELECT name, SUM(pgsize) AS bytes
           FROM dbstat
          GROUP BY name`,
      )
      .all() as Array<{ name: string; bytes: number }>;
  } catch (error) {
    if (/\bdbstat\b.*(?:unavailable|no such table)/iu.test(String(error))) {
      return null;
    }
    throw error;
  }
};

const readMarketContentSummary = (database: Database.Database) => {
  try {
    const row = database
      .prepare(
        `SELECT COUNT(*) AS instrument_count,
                COALESCE(SUM(i.bar_count), 0) AS bar_count
           FROM instruments i
          WHERE i.bar_count > 0
            AND (
              UPPER(COALESCE(i.market, '')) <> 'SYSTEM'
              OR EXISTS (
                SELECT 1
                  FROM app_meta m
                 WHERE m.key = 'system_bars_seed_instrument:' || i.id
                   AND m.value = i.bars_version_token
              )
            )`,
      )
      .get() as
      | { instrument_count?: unknown; bar_count?: unknown }
      | undefined;
    const instrumentCount = Math.max(
      0,
      Math.floor(Number(row?.instrument_count ?? 0) || 0),
    );
    const barCount = Math.max(0, Math.floor(Number(row?.bar_count ?? 0) || 0));
    return {
      hasContent: instrumentCount > 0 && barCount > 0,
      instrumentCount,
      barCount,
    };
  } catch (error) {
    if (/no such table:\s*(?:instruments|app_meta)/iu.test(String(error))) {
      return { hasContent: false, instrumentCount: 0, barCount: 0 };
    }
    throw error;
  }
};

const readDuckDbTempFootprintBytes = (input: SystemStorageMeasurementWorkerInput): number => {
  const duckDbTempDir = input.tempDir
    ? path.join(input.tempDir, 'duckdb-tmp')
    : '';
  if (!duckDbTempDir || !fs.existsSync(duckDbTempDir)) {
    return 0;
  }
  return countDirectoryBytes(duckDbTempDir);
};

const measure = (
  input: SystemStorageMeasurementWorkerInput,
): SystemStorageMeasurementWorkerResult => {
  const coreFootprint = readCoreFootprint(input.dbPath);
  const marketFootprint = readMarketFootprint(input.marketDbPath);
  let database: Database.Database | null = null;
  let dbstatRows: Array<{ name: string; bytes: number }> | null = null;
  let marketContentSummary = {
    hasContent: false,
    instrumentCount: 0,
    barCount: 0,
  };
  if (coreFootprint.dbBytes > 0) {
    database = new Database(input.dbPath, {
      readonly: true,
      fileMustExist: true,
      timeout: 250,
    });
    try {
      database.pragma('query_only = ON');
      dbstatRows = readDbstatRows(database);
      marketContentSummary = readMarketContentSummary(database);
    } finally {
      database.close();
    }
  }
  return {
    metaUsage: buildDatabaseStorageUsageSummary({
      measuredAt: new Date().toISOString(),
      dbstatRows,
      physicalFootprint: coreFootprint,
    }),
    marketUsage: buildMarketStorageUsageSummary({
      physicalFootprint: marketFootprint,
      blockUsage: null,
      contentSummary: marketContentSummary,
    }),
    cacheBytes: countDirectoryBytes(input.cacheDir),
    // DuckDB spills its temp database into <tempDir>/duckdb-tmp. That space is
    // charged to marketDataBytes; subtracting it here keeps tempBytes from
    // double-counting the same physical footprint.
    tempBytes: Math.max(
      0,
      countDirectoryBytes(input.tempDir) -
        readDuckDbTempFootprintBytes(input),
    ),
  };
};

const post = (message: SystemStorageMeasurementWorkerMessage): void => {
  parentPort?.postMessage(message);
};

try {
  post({
    type: 'RESULT',
    value: measure(workerData as SystemStorageMeasurementWorkerInput),
  });
} catch (error) {
  post({
    type: 'ERROR',
    message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
}
