// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import path from 'node:path';

type ImportFilePathRow = {
  filePath: string | null;
};

type CreateImportTempCleanupToolsInput = {
  uploadTempDir: string;
  countActiveJobs: () => number;
  listAllFilePathRows: () => ImportFilePathRow[];
  listActiveFilePathRows: () => ImportFilePathRow[];
  listRetainedTempDirPaths?: () => string[];
  listLeasedTempDirPaths?: () => string[];
  readDistinctFilePaths: (rows: ImportFilePathRow[]) => string[];
  readDistinctImportTempDirPaths: (filePaths: string[]) => string[];
  removeImportTempFilesByPath: (filePaths: string[]) => Promise<void>;
  removeImportTempDirsByPath: (dirPaths: string[]) => Promise<void>;
  nowMs?: () => number;
  untrackedEntryGraceMs?: number;
};

const DEFAULT_UNTRACKED_IMPORT_TEMP_GRACE_MS = 30 * 60 * 1000;

export const createImportTempCleanupTools = ({
  uploadTempDir,
  countActiveJobs,
  listAllFilePathRows,
  listActiveFilePathRows,
  listRetainedTempDirPaths,
  listLeasedTempDirPaths,
  readDistinctFilePaths,
  readDistinctImportTempDirPaths,
  removeImportTempFilesByPath,
  removeImportTempDirsByPath,
  nowMs = () => Date.now(),
  untrackedEntryGraceMs = DEFAULT_UNTRACKED_IMPORT_TEMP_GRACE_MS
}: CreateImportTempCleanupToolsInput) => {
  const normalizedUntrackedEntryGraceMs = Math.max(
    0,
    Math.floor(Number(untrackedEntryGraceMs) || 0),
  );

  const isRecentUntrackedTempEntry = (
    stat: Awaited<ReturnType<typeof fs.stat>>,
  ): boolean => {
    if (normalizedUntrackedEntryGraceMs <= 0) {
      return false;
    }
    const touchedAtMs = Math.max(
      Number(stat.mtimeMs) || 0,
      Number(stat.ctimeMs) || 0,
      Number(stat.birthtimeMs) || 0,
    );
    if (!Number.isFinite(touchedAtMs) || touchedAtMs <= 0) {
      return false;
    }
    return nowMs() - touchedAtMs <= normalizedUntrackedEntryGraceMs;
  };

  const cleanupStaleImportUploadTempFiles = async (): Promise<void> => {
    const allFilePaths = readDistinctFilePaths(listAllFilePathRows());
    if (!allFilePaths.length) {
      return;
    }
    const activeFilePaths = new Set(readDistinctFilePaths(listActiveFilePathRows()));
    const stalePaths = allFilePaths.filter((filePath) => !activeFilePaths.has(filePath));
    await removeImportTempFilesByPath(stalePaths);
    await removeImportTempDirsByPath(readDistinctImportTempDirPaths(stalePaths));
  };

  const cleanupUntrackedImportUploadTempFiles = async (): Promise<void> => {
    const activeJobs = countActiveJobs();
    if (Number.isFinite(activeJobs) && activeJobs > 0) {
      return;
    }
    const trackedFilePaths = readDistinctFilePaths(listAllFilePathRows());
    const trackedPaths = new Set(trackedFilePaths);
    const trackedDirPaths = new Set(readDistinctImportTempDirPaths(trackedFilePaths));
    const retainedDirPaths = new Set(
      readDistinctImportTempDirPaths([
        ...(listRetainedTempDirPaths?.() ?? []),
        ...(listLeasedTempDirPaths?.() ?? []),
      ]),
    );
    let fileNames: string[] = [];
    try {
      fileNames = await fs.readdir(uploadTempDir);
    } catch {
      return;
    }
    await Promise.all(
      fileNames.map(async (fileName) => {
        const filePath = path.join(uploadTempDir, fileName);
        if (trackedPaths.has(filePath) || retainedDirPaths.has(filePath)) {
          return;
        }
        try {
          const stat = await fs.stat(filePath);
          if (isRecentUntrackedTempEntry(stat)) {
            return;
          }
          if (stat.isDirectory()) {
            if (trackedDirPaths.has(filePath)) {
              return;
            }
            await fs.rm(filePath, { recursive: true, force: true });
            return;
          }
          if (!stat.isFile()) {
            return;
          }
          await fs.unlink(filePath);
        } catch {
          // ignore stale cleanup failures
        }
      })
    );
  };

  return {
    cleanupStaleImportUploadTempFiles,
    cleanupUntrackedImportUploadTempFiles
  };
};
