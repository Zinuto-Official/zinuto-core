// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs/promises';
import path from 'node:path';

type AppErrorFactory = (code: string, args?: Record<string, string | number | boolean | null>) => Error;

type ImportFilePathRow = {
  filePath: string | null;
};

type CreateProtectedImportTempDirRemoverInput = {
  listActiveFilePathRows: () => ImportFilePathRow[];
  listRetainedTempDirPaths: () => string[];
  listLeasedTempDirPaths?: () => string[];
  readDistinctFilePaths: (rows: ImportFilePathRow[]) => string[];
  readDistinctImportTempDirPaths: (filePaths: string[]) => string[];
  removeImportTempDirsByPathUnchecked: (dirPaths: string[]) => Promise<void>;
};

type CreateProtectedImportTempFileRemoverInput = {
  listActiveFilePathRows: () => ImportFilePathRow[];
  listRetainedTempDirPaths: () => string[];
  listLeasedTempDirPaths?: () => string[];
  readDistinctFilePaths: (rows: ImportFilePathRow[]) => string[];
  readDistinctImportTempDirPaths: (filePaths: string[]) => string[];
  removeImportTempFilesByPathUnchecked: (filePaths: string[]) => Promise<void>;
};

export const createImportTempDirLeaseStore = ({
  readDistinctImportTempDirPaths,
}: {
  readDistinctImportTempDirPaths: (filePaths: string[]) => string[];
}) => {
  const leaseCountsByDirPath = new Map<string, number>();

  const acquireImportTempDirLease = (paths: string[]): (() => void) => {
    const leasedDirPaths = readDistinctImportTempDirPaths(paths);
    for (const dirPath of leasedDirPaths) {
      leaseCountsByDirPath.set(
        dirPath,
        (leaseCountsByDirPath.get(dirPath) ?? 0) + 1,
      );
    }

    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      for (const dirPath of leasedDirPaths) {
        const remainingCount = (leaseCountsByDirPath.get(dirPath) ?? 0) - 1;
        if (remainingCount > 0) {
          leaseCountsByDirPath.set(dirPath, remainingCount);
        } else {
          leaseCountsByDirPath.delete(dirPath);
        }
      }
    };
  };

  return {
    acquireImportTempDirLease,
    listLeasedTempDirPaths: (): string[] =>
      Array.from(leaseCountsByDirPath.keys()),
  };
};

export const createProtectedImportTempFileRemover = ({
  listActiveFilePathRows,
  listRetainedTempDirPaths,
  listLeasedTempDirPaths = () => [],
  readDistinctFilePaths,
  readDistinctImportTempDirPaths,
  removeImportTempFilesByPathUnchecked,
}: CreateProtectedImportTempFileRemoverInput) =>
  async (filePaths: string[]): Promise<void> => {
    const requestedFilePaths = readDistinctFilePaths(
      filePaths.map((filePath) => ({ filePath })),
    );
    if (!requestedFilePaths.length) {
      return;
    }

    const activeFilePaths = new Set(
      readDistinctFilePaths(listActiveFilePathRows()),
    );
    const retainedDirPaths = new Set(
      readDistinctImportTempDirPaths([
        ...listRetainedTempDirPaths(),
        ...listLeasedTempDirPaths(),
      ]),
    );
    const removableFilePaths = requestedFilePaths.filter((filePath) => {
      if (activeFilePaths.has(filePath)) {
        return false;
      }
      const [fileDirPath] = readDistinctImportTempDirPaths([filePath]);
      return !fileDirPath || !retainedDirPaths.has(fileDirPath);
    });
    if (!removableFilePaths.length) {
      return;
    }
    await removeImportTempFilesByPathUnchecked(removableFilePaths);
  };

export const createProtectedImportTempDirRemover = ({
  listActiveFilePathRows,
  listRetainedTempDirPaths,
  listLeasedTempDirPaths = () => [],
  readDistinctFilePaths,
  readDistinctImportTempDirPaths,
  removeImportTempDirsByPathUnchecked,
}: CreateProtectedImportTempDirRemoverInput) =>
  async (dirPaths: string[]): Promise<void> => {
    const requestedDirPaths = readDistinctImportTempDirPaths(dirPaths);
    if (!requestedDirPaths.length) {
      return;
    }

    const activeDirPaths = readDistinctImportTempDirPaths(
      readDistinctFilePaths(listActiveFilePathRows()),
    );
    const retainedDirPaths = readDistinctImportTempDirPaths(
      [...listRetainedTempDirPaths(), ...listLeasedTempDirPaths()],
    );
    const protectedDirPaths = new Set([
      ...activeDirPaths,
      ...retainedDirPaths,
    ]);
    const removableDirPaths = requestedDirPaths.filter(
      (dirPath) => !protectedDirPaths.has(dirPath),
    );
    if (!removableDirPaths.length) {
      return;
    }
    await removeImportTempDirsByPathUnchecked(removableDirPaths);
  };

export const createImportTempFileTools = (uploadTempDir: string, appError: AppErrorFactory) => {
  const normalizedUploadTempRoot = path.resolve(uploadTempDir);

  const normalizeImportFilePath = (value: unknown): string => {
    const raw = String(value ?? '');
    if (!raw.trim()) {
      return '';
    }
    return path.resolve(raw);
  };

  const isManagedImportTempFilePath = (value: unknown): boolean => {
    const normalizedPath = normalizeImportFilePath(value);
    if (!normalizedPath) {
      return false;
    }
    const relativePath = path.relative(normalizedUploadTempRoot, normalizedPath);
    return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  };

  const assertManagedImportTempPath = (value: unknown): void => {
    if (!isManagedImportTempFilePath(value)) {
      throw appError('INVALID_PARAMS');
    }
  };

  const resolveManagedImportTempDirPath = (value: unknown): string => {
    const normalizedPath = normalizeImportFilePath(value);
    if (!normalizedPath) {
      return '';
    }
    const relativePath = path.relative(normalizedUploadTempRoot, normalizedPath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return '';
    }
    const topLevelSegment = relativePath.split(path.sep).filter(Boolean)[0] ?? '';
    if (!topLevelSegment) {
      return '';
    }
    const normalizedDirPath = path.join(normalizedUploadTempRoot, topLevelSegment);
    const normalizedDirRelativePath = path.relative(normalizedUploadTempRoot, normalizedDirPath);
    if (!normalizedDirRelativePath || normalizedDirRelativePath.startsWith('..') || path.isAbsolute(normalizedDirRelativePath)) {
      return '';
    }
    return normalizedDirPath;
  };

  const readDistinctFilePaths = (rows: Array<{ filePath: string | null }>): string[] =>
    Array.from(
      new Set(
        rows
          .map((item) => normalizeImportFilePath(item.filePath))
          .filter((item) => Boolean(item))
      )
    );

  const readDistinctImportTempDirPaths = (filePaths: string[]): string[] =>
    Array.from(
      new Set(
        filePaths
          .map((item) => resolveManagedImportTempDirPath(item))
          .filter((item) => Boolean(item))
      )
    );

  const removeImportTempFilesByPath = async (filePaths: string[]): Promise<void> => {
    const deduped = Array.from(
      new Set(
        filePaths
          .map((item) => normalizeImportFilePath(item))
          .filter((item) => Boolean(item) && isManagedImportTempFilePath(item))
      )
    );
    if (!deduped.length) {
      return;
    }
    await Promise.all(
      deduped.map(async (filePath) => {
        await fs.unlink(filePath).catch(() => undefined);
      })
    );
  };

  const removeImportTempDirsByPath = async (dirPaths: string[]): Promise<void> => {
    const deduped = Array.from(
      new Set(
        dirPaths
          .map((item) => resolveManagedImportTempDirPath(item))
          .filter((item) => Boolean(item))
      )
    );
    if (!deduped.length) {
      return;
    }
    await Promise.all(
      deduped.map(async (dirPath) => {
        await fs.rm(dirPath, { recursive: true, force: true }).catch(() => undefined);
      })
    );
  };

  return {
    normalizeImportFilePath,
    isManagedImportTempFilePath,
    assertManagedImportTempPath,
    readDistinctFilePaths,
    readDistinctImportTempDirPaths,
    removeImportTempFilesByPath,
    removeImportTempDirsByPath
  };
};
