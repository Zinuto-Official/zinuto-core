// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';

type ClearResult = {
  deletedSourceFiles: number;
  deletedImportJobs: number;
  deletedSources: number;
  deletedInstruments: number;
  clearedAt: string;
};

type RemoveResult = {
  sourceId: string;
  deletedSourceFiles: number;
  deletedImportJobs: number;
  deletedSources: number;
  deletedInstruments: number;
  clearedAt: string;
};

type ClearLocalDataSourcesDeps = {
  isSystemResetRunning: () => boolean;
  countActiveJobs: () => number;
  markAllSourcesDeleting: (updatedAt: string) => boolean;
  listAllImportFilePaths: () => Array<{ filePath: string | null }>;
  readDistinctFilePaths: (rows: Array<{ filePath: string | null }>) => string[];
  readDistinctImportTempDirPaths: (filePaths: string[]) => string[];
  listLocalInstrumentIds: () => string[];
  removeMarketInstrumentData: (instrumentId: string) => Promise<void>;
  runDeleteAllSourcesTx: () => {
    deletedSourceFiles: number;
    deletedImportJobs: number;
    deletedSources: number;
    deletedInstruments: number;
  };
  removeImportTempFilesByPath: (filePaths: string[]) => Promise<void>;
  removeImportTempDirsByPath: (dirPaths: string[]) => Promise<void>;
  cleanupUntrackedImportUploadTempFiles: () => Promise<void>;
  restoreSystemMarketSeedMetadataAfterLocalClear: () => Promise<void>;
  reclaimEmptyMarketStorage: () => Promise<unknown>;
  verifyLocalDataSourcesCleared: (instrumentIds: string[]) => Promise<void>;
  nowIso: () => string;
};

type RemoveLocalDataSourceDeps = {
  isSystemResetRunning: () => boolean;
  getSourceById: (sourceId: string) => { id: string; baseTimeframe: '1m' | '5m' | '1h' | '1d' } | undefined;
  countActiveJobsBySource: (sourceId: string) => number;
  markSourceDeleting: (sourceId: string, updatedAt: string) => boolean;
  listFilePathsBySource: (sourceId: string) => Array<{ filePath: string | null }>;
  readDistinctFilePaths: (rows: Array<{ filePath: string | null }>) => string[];
  readDistinctImportTempDirPaths: (filePaths: string[]) => string[];
  listLocalInstrumentIdsBySource: (sourceId: string) => string[];
  removeMarketInstrumentData: (instrumentId: string) => Promise<void>;
  runDeleteSourceTx: (
    sourceId: string,
    removableInstrumentIds: string[]
  ) => {
    deletedSourceFiles: number;
    deletedImportJobs: number;
    deletedSources: number;
    deletedInstruments: number;
  };
  removeImportTempFilesByPath: (filePaths: string[]) => Promise<void>;
  removeImportTempDirsByPath: (dirPaths: string[]) => Promise<void>;
  cleanupUntrackedImportUploadTempFiles: () => Promise<void>;
  reclaimEmptyMarketStorage: () => Promise<unknown>;
  verifyLocalDataSourceRemoved: (
    sourceId: string,
    instrumentIds: string[]
  ) => Promise<void>;
  nowIso: () => string;
};

const LOCAL_DATA_PARTIAL_ERROR_CODE =
  'LOCAL_DATA_DESTRUCTIVE_OPERATION_PARTIAL_FAILED';

const normalizePartialFailureCause = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const code = String((error as { code?: unknown }).code ?? '').trim();
    if (code) {
      return code;
    }
  }
  if (error instanceof Error) {
    return error.message.trim() || error.name || 'UNKNOWN';
  }
  return String(error ?? '').trim() || 'UNKNOWN';
};

const throwLocalDataPartialFailure = (
  operation: string,
  sourceId: string | null,
  error: unknown
): never => {
  const cause = normalizePartialFailureCause(error);
  if (cause === LOCAL_DATA_PARTIAL_ERROR_CODE) {
    throw error;
  }
  throw appError('LOCAL_DATA_DESTRUCTIVE_OPERATION_PARTIAL_FAILED', {
    operation,
    sourceId,
    cause
  });
};

export const clearLocalDataSourcesAndMarketDataCore = async (
  deps: ClearLocalDataSourcesDeps
): Promise<ClearResult> => {
  if (deps.isSystemResetRunning()) {
    throw appError('SYSTEM_RESET_IN_PROGRESS');
  }
  const activeJobs = Number(deps.countActiveJobs());
  if (Number.isFinite(activeJobs) && activeJobs > 0) {
    throw appError('LOCAL_DATA_IMPORT_JOB_ACTIVE');
  }
  if (!deps.markAllSourcesDeleting(deps.nowIso())) {
    throw appError('LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS', {}, 409);
  }
  try {
    const importFilePaths = deps.readDistinctFilePaths(deps.listAllImportFilePaths());

    const localInstrumentIds = deps.listLocalInstrumentIds();
    await Promise.all(localInstrumentIds.map((instrumentId) => deps.removeMarketInstrumentData(instrumentId)));

    const result = deps.runDeleteAllSourcesTx();
    await deps.removeImportTempFilesByPath(importFilePaths);
    await deps.removeImportTempDirsByPath(deps.readDistinctImportTempDirPaths(importFilePaths));
    await deps.cleanupUntrackedImportUploadTempFiles();
    await deps.restoreSystemMarketSeedMetadataAfterLocalClear();
    await deps.reclaimEmptyMarketStorage();
    await deps.verifyLocalDataSourcesCleared(localInstrumentIds);

    return {
      ...result,
      clearedAt: deps.nowIso()
    };
  } catch (error) {
    return throwLocalDataPartialFailure('CLEAR_ALL_LOCAL_DATA_SOURCES', null, error);
  }
};

export const removeLocalDataSourceCore = async (
  sourceIdRaw: string,
  deps: RemoveLocalDataSourceDeps
): Promise<RemoveResult> => {
  const sourceId = String(sourceIdRaw ?? '').trim();
  if (!sourceId) {
    throw appError('INVALID_PARAMS');
  }
  if (deps.isSystemResetRunning()) {
    throw appError('SYSTEM_RESET_IN_PROGRESS');
  }
  const sourceExists = deps.getSourceById(sourceId);
  if (!sourceExists) {
    throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
  }
  const activeJobs = Number(deps.countActiveJobsBySource(sourceId));
  if (Number.isFinite(activeJobs) && activeJobs > 0) {
    throw appError('LOCAL_DATA_IMPORT_JOB_ACTIVE');
  }
  if (!deps.markSourceDeleting(sourceId, deps.nowIso())) {
    throw appError(
      'LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS',
      { sourceId },
      409,
    );
  }

  try {
    const filePaths = deps.readDistinctFilePaths(deps.listFilePathsBySource(sourceId));
    const removableInstrumentIds = Array.from(
      new Set(
        deps
          .listLocalInstrumentIdsBySource(sourceId)
          .map((instrumentId) => String(instrumentId ?? '').trim())
          .filter((instrumentId) => Boolean(instrumentId)),
      ),
    );

    await Promise.all(removableInstrumentIds.map((instrumentId) => deps.removeMarketInstrumentData(instrumentId)));
    const result = deps.runDeleteSourceTx(sourceId, removableInstrumentIds);

    await deps.removeImportTempFilesByPath(filePaths);
    await deps.removeImportTempDirsByPath(deps.readDistinctImportTempDirPaths(filePaths));
    await deps.cleanupUntrackedImportUploadTempFiles();
    if (result.deletedInstruments > 0) {
      await deps.reclaimEmptyMarketStorage();
    }
    await deps.verifyLocalDataSourceRemoved(sourceId, removableInstrumentIds);

    return {
      sourceId,
      ...result,
      clearedAt: deps.nowIso()
    };
  } catch (error) {
    return throwLocalDataPartialFailure('REMOVE_LOCAL_DATA_SOURCE', sourceId, error);
  }
};
