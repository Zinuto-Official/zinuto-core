// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { DUCKDB_TEMP_DIR, MARKET_DB_FILE_PATH } from './constants.js';

export const safeStatSize = (filePath: string): number => {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
};

export const randomCompactSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => entry.name.startsWith(`${marketDbBaseName}.bak-`))
      .map((entry) =>
        fsPromises
          .rm(path.join(marketDbDir, entry.name), { recursive: true, force: true })
          .then(() => undefined)
          .catch(() => undefined)
      )
  );
};

export const cleanupMarketStorageArtifacts = async (): Promise<void> => {
  await cleanupMarketCompactArtifacts();
  await cleanupMarketDbBackupArtifacts();
};

export const removeMarketStorageFiles = async (): Promise<void> => {
  await Promise.all(
    [
      MARKET_DB_FILE_PATH,
      `${MARKET_DB_FILE_PATH}.wal`,
      `${MARKET_DB_FILE_PATH}.tmp`
    ].map((targetPath) =>
      fsPromises.rm(targetPath, { force: true }).catch(() => undefined)
    )
  );
};
