// SPDX-License-Identifier: GPL-3.0-only

import os from 'node:os';
import path from 'node:path';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { createId } from '../../kernel/id.js';
import { createImportJobControlStore } from './importJobControl.js';
import { createImportTempCleanupTools } from './tempCleanup.js';
import {
  createImportTempDirLeaseStore,
  createImportTempFileTools,
  createProtectedImportTempDirRemover,
  createProtectedImportTempFileRemover,
} from './tempFiles.js';
import { createPreviewImportSessionStore } from '../ports/infrastructure/db/dataSource/previewSessionStore.js';
import type { PreviewImportSessionStore } from '../ports/infrastructure/db/dataSource/previewSessionStore.js';
import { createLocalDataSourcesCache } from './sourceCache.js';
import { createDataSourceRuntimeLifecycle } from './runtimeLifecycle.js';
import { stopTabularDuckDbRuntime } from './tabularDuckDbRuntime.js';

const DATA_SOURCE_UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'zinuto-csv-upload');
const IMPORT_JOB_QUEUE_CONCURRENCY = Math.max(
  1,
  Math.min(4, runtimeLimits.importParallelFiles),
);
const PREVIEW_SESSION_TTL_MS = 20 * 60 * 1000;
const PREVIEW_SESSION_MAX_ENTRIES = 48;
const LOCAL_DATA_SOURCES_CACHE_TTL_MS = 1200;

export const createDataSourceRuntimeContext = ({
  appError,
  countActiveJobs,
  listAllFilePathRows,
  listActiveFilePathRows,
  markActiveJobsAsInterrupted,
  pruneRetainedImportJobs,
  queuedFileStatus,
  importingFileStatus,
}: {
  appError: (code: string, args?: Record<string, string | number | boolean | null>, status?: number) => Error;
  countActiveJobs: () => number;
  listAllFilePathRows: () => Array<{ filePath: string | null }>;
  listActiveFilePathRows: () => Array<{ filePath: string | null }>;
  markActiveJobsAsInterrupted: () => void;
  pruneRetainedImportJobs: () => void;
  queuedFileStatus: string;
  importingFileStatus: string;
}) => {
  const {
    normalizeImportFilePath,
    assertManagedImportTempPath,
    readDistinctFilePaths,
    readDistinctImportTempDirPaths,
    removeImportTempFilesByPath: removeImportTempFilesByPathUnchecked,
    removeImportTempDirsByPath: removeImportTempDirsByPathUnchecked,
  } = createImportTempFileTools(DATA_SOURCE_UPLOAD_TEMP_DIR, appError);

  let previewImportSessionStore: PreviewImportSessionStore;
  const {
    acquireImportTempDirLease,
    listLeasedTempDirPaths,
  } = createImportTempDirLeaseStore({ readDistinctImportTempDirPaths });
  const listRetainedTempDirPaths = () =>
    previewImportSessionStore?.listFolderPaths() ?? [];
  const removeImportTempFilesByPath = createProtectedImportTempFileRemover({
    listActiveFilePathRows,
    listRetainedTempDirPaths,
    listLeasedTempDirPaths,
    readDistinctFilePaths,
    readDistinctImportTempDirPaths,
    removeImportTempFilesByPathUnchecked,
  });
  const removeImportTempDirsByPath = createProtectedImportTempDirRemover({
    listActiveFilePathRows,
    listRetainedTempDirPaths,
    listLeasedTempDirPaths,
    readDistinctFilePaths,
    readDistinctImportTempDirPaths,
    removeImportTempDirsByPathUnchecked,
  });

  previewImportSessionStore = createPreviewImportSessionStore({
    ttlMs: PREVIEW_SESSION_TTL_MS,
    maxEntries: PREVIEW_SESSION_MAX_ENTRIES,
    nowMs: () => Date.now(),
    createToken: createId,
    onDiscardFolder: (folderPath) => {
      void removeImportTempDirsByPath([folderPath]);
    },
  });

  const {
    readImportJobControlState,
    ensureImportJobControlState,
    hasImportJobControlState,
    clearImportJobControlState,
    getImportJobAbortSignal,
    abortImportJob,
    requestCancelImportJob,
    requestCancelAllImportJobs,
    waitForJobControlRelease,
  } = createImportJobControlStore();

  const {
    cleanupStaleImportUploadTempFiles,
    cleanupUntrackedImportUploadTempFiles,
  } = createImportTempCleanupTools({
    uploadTempDir: DATA_SOURCE_UPLOAD_TEMP_DIR,
    countActiveJobs,
    listAllFilePathRows,
    listActiveFilePathRows,
    listRetainedTempDirPaths: () => previewImportSessionStore.listFolderPaths(),
    listLeasedTempDirPaths,
    readDistinctFilePaths,
    readDistinctImportTempDirPaths,
    removeImportTempFilesByPath,
    removeImportTempDirsByPath,
  });

  const localDataSourcesCacheStore = createLocalDataSourcesCache({
    ttlMs: LOCAL_DATA_SOURCES_CACHE_TTL_MS,
    nowMs: () => Date.now(),
  });

  const dataSourceRuntimeLifecycle = createDataSourceRuntimeLifecycle({
    previewSessionTtlMs: PREVIEW_SESSION_TTL_MS,
    cleanupPreviewSessions: () => {
      previewImportSessionStore.cleanupExpiredSessions();
    },
    clearPreviewSessions: () => {
      previewImportSessionStore.clear();
    },
    markActiveJobsAsInterrupted,
    pruneRetainedImportJobs,
    cleanupStaleImportUploadTempFiles,
    cleanupUntrackedImportUploadTempFiles,
    stopTabularDuckDbRuntime,
  });

  return {
    abortImportJob,
    acquireImportTempDirLease,
    assertManagedImportTempPath,
    clearImportJobControlState,
    cleanupStaleImportUploadTempFiles,
    cleanupUntrackedImportUploadTempFiles,
    ensureImportJobControlState,
    hasImportJobControlState,
    getImportJobAbortSignal,
    importJobQueueConcurrency: IMPORT_JOB_QUEUE_CONCURRENCY,
    importJobQueueMaxQueuedJobs: runtimeLimits.importJobQueueMaxQueuedJobs,
    importingFileStatus,
    invalidateLocalDataSourcesCache: () => {
      localDataSourcesCacheStore.invalidate();
    },
    localDataSourcesCacheStore,
    normalizeImportFilePath,
    previewImportSessionStore,
    queuedFileStatus,
    readDistinctFilePaths,
    readDistinctImportTempDirPaths,
    readImportJobControlState,
    removeImportTempDirsByPath,
    removeImportTempFilesByPath,
    requestCancelAllImportJobs,
    requestCancelImportJob,
    startDataSourceRuntime: dataSourceRuntimeLifecycle.startDataSourceRuntime,
    stopDataSourceRuntime: dataSourceRuntimeLifecycle.stopDataSourceRuntime,
    waitForJobControlRelease,
  };
};
