// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { appError } from '../../../kernel/appError.js';
import { DUCKDB_TEMP_DIR, MARKET_DB_FILE_PATH } from './constants.js';

type MarketDatabaseSwapOperations = {
  exists: (filePath: string) => boolean;
  remove: (filePath: string) => Promise<void>;
  rename: (sourcePath: string, targetPath: string) => Promise<void>;
};

const defaultMarketDatabaseSwapOperations: MarketDatabaseSwapOperations = {
  exists: fs.existsSync,
  remove: async (filePath) => fsPromises.rm(filePath, { force: true }),
  rename: fsPromises.rename,
};

export const safeStatSize = (filePath: string): number => {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
};

export const randomCompactSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const replaceMarketDatabaseFile = async ({
  replacementPath,
  backupPath,
  operations = defaultMarketDatabaseSwapOperations,
}: {
  replacementPath: string;
  backupPath: string;
  operations?: MarketDatabaseSwapOperations;
}): Promise<void> => {
  let backupMoved = false;
  if (operations.exists(MARKET_DB_FILE_PATH)) {
    await operations.remove(backupPath);
    await operations.rename(MARKET_DB_FILE_PATH, backupPath);
    backupMoved = true;
  }

  try {
    await operations.rename(replacementPath, MARKET_DB_FILE_PATH);
  } catch (installError) {
    if (
      backupMoved &&
      !operations.exists(MARKET_DB_FILE_PATH) &&
      operations.exists(backupPath)
    ) {
      try {
        await operations.rename(backupPath, MARKET_DB_FILE_PATH);
        backupMoved = false;
      } catch (restoreError) {
        throw new AggregateError(
          [installError, restoreError],
          `Market database replacement and backup restoration both failed; backup retained at ${backupPath}`,
        );
      }
    }
    throw installError;
  }

  if (backupMoved) {
    await operations.remove(backupPath);
  }
};

export const cleanupMarketCompactArtifacts = async (): Promise<void> => {
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsPromises.readdir(DUCKDB_TEMP_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  const cleanupJobs: Promise<void>[] = [];
  entries.forEach((entry) => {
    const name = entry.name;
    if (!name.startsWith('market-export-') && !name.startsWith('market-compact-')) {
      return;
    }
    const targetPath = path.join(DUCKDB_TEMP_DIR, name);
    cleanupJobs.push(
      fsPromises
        .rm(targetPath, { recursive: true, force: true })
        .then(() => undefined)
        .catch(() => undefined)
    );
  });
  if (!cleanupJobs.length) {
    return;
  }
  await Promise.all(cleanupJobs);
};

export const cleanupMarketDbBackupArtifacts = async (): Promise<void> => {
  let entries: fs.Dirent[] = [];
  const marketDbDir = path.dirname(MARKET_DB_FILE_PATH);
  const marketDbBaseName = path.basename(MARKET_DB_FILE_PATH);
  try {
    entries = await fsPromises.readdir(marketDbDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const backupPaths = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.startsWith(`${marketDbBaseName}.bak-`),
    )
    .map((entry) => path.join(marketDbDir, entry.name));
  if (!backupPaths.length) {
    return;
  }

  await Promise.all(
    backupPaths.map((backupPath) => fsPromises.rm(backupPath, { force: true })),
  );
};

export const recoverMarketDbBackupIfCanonicalMissing = async (): Promise<void> => {
  if (fs.existsSync(MARKET_DB_FILE_PATH)) return;
  const marketDbDir = path.dirname(MARKET_DB_FILE_PATH);
  const marketDbBaseName = path.basename(MARKET_DB_FILE_PATH);
  let entries: fs.Dirent[];
  try {
    entries = await fsPromises.readdir(marketDbDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const backupsByNewest = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.startsWith(`${marketDbBaseName}.bak-`),
      )
      .map(async (entry) => {
        const backupPath = path.join(marketDbDir, entry.name);
        return {
          backupPath,
          modifiedAtMs: (await fsPromises.stat(backupPath)).mtimeMs,
        };
      }),
  );
  backupsByNewest.sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
  const [recovery, ...obsolete] = backupsByNewest;
  if (!recovery) return;
  await fsPromises.rename(recovery.backupPath, MARKET_DB_FILE_PATH);
  await Promise.all(
    obsolete.map(({ backupPath }) => fsPromises.rm(backupPath, { force: true })),
  );
};

export const cleanupMarketStorageArtifacts = async (): Promise<void> => {
  await cleanupMarketCompactArtifacts();
  await cleanupMarketDbBackupArtifacts();
};

export const removeMarketStorageFiles = async (): Promise<void> => {
  const targetPaths = [
    MARKET_DB_FILE_PATH,
    `${MARKET_DB_FILE_PATH}.wal`,
    `${MARKET_DB_FILE_PATH}.tmp`,
  ];
  await Promise.all(
    targetPaths.map((targetPath) => fsPromises.rm(targetPath, { force: true })),
  );
  const retainedPaths = targetPaths.filter(fs.existsSync);
  if (retainedPaths.length) {
    throw appError('MARKET_STORAGE_REMOVAL_FAILED', {
      retainedCount: retainedPaths.length,
    });
  }
};
