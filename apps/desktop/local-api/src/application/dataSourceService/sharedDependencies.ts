// SPDX-License-Identifier: GPL-3.0-only

import { db, listSystemSeedInstruments, resolveSystemSeedInstrumentMetadata } from '../ports/infrastructure/db/database.js';
import {
  setMarketTimelinePrewarmBlocker
} from '../ports/infrastructure/db/marketDatabase.js';
import {
  calculateFileBasedProgressPercent,
  normalizeCount,
} from '../dataSource/importProgress.js';
import {
  createSourceDiagnosticsRuntime,
} from '../dataSource/sourceDiagnosticsRuntime.js';
import { dataSourceRepository } from '../ports/infrastructure/db/dataSource/dataSourceRepository.js';
import { markActiveImportJobsAsInterruptedCore } from '../dataSource/jobRecovery.js';
import { restoreSystemMarketSeedMetadataAfterLocalClearCore } from '../dataSource/systemSeedReseed.js';
import {
  pruneLocalDataImportJobsForAllSources,
} from '../ports/infrastructure/db/dataSource/importJobRetentionStore.js';
import type {
  LocalDataImportJobStatus,
} from '../dataSource/types.js';
import { createId } from '../../kernel/id.js';
import { nowIso } from '../../kernel/time.js';
import { appError } from '../../kernel/appError.js';
import { createDataSourceRuntimeContext } from '../dataSource/runtimeContext.js';

export const FILE_STATUS_QUEUED = 'QUEUED';
export const FILE_STATUS_IMPORTING = 'IMPORTING';
export const FILE_STATUS_IMPORTED = 'IMPORTED';
export const FILE_STATUS_FAILED = 'FAILED';

export const {
  insertSourceStmt,
  insertJobStmt,
  insertFileStmt,
  updateFileImportingStmt,
  updateFileProgressStmt,
  updateFileImportedStmt,
  updateFileFailedStmt,
  updateFileFailureDetailsStmt,
  updateSourceStatusStmt,
  beginSourceDeletionStmt,
  beginSourceSymbolMutationStmt,
  updateSourceSymbolMutationSummaryStmt,
  completeSourceSymbolMutationStmt,
  markSourceSymbolMutationFailedStmt,
  recoverInterruptedSourceSymbolMutationsStmt,
  updateSourceFinalStmt,
  updateSourceStorageBytesStmt,
  markAllSourcesDeletingIfIdleStmt,
  updateSourceForSyncImportStmt,
  updateSourceForIncrementalImportStmt,
  updateSourceTradingCalendarStmt,
  updateJobRunningStmt,
  updateJobProgressStmt,
  updateJobCompactingProgressStmt,
  updateJobCompactionResultStmt,
  updateJobCompactionBaselineStmt,
  updateJobFinalStmt,
  updateJobFailureDetailsStmt,
  listSourcesStmt,
  listTrainingPoolCatalogStmt,
  getJobStmt,
  getJobStatusStmt,
  listFailedFilesByJobStmt,
  getSourceBaseTimeframeByIdStmt,
  getSourceImportConfigByIdStmt,
  getSourceSyncQuickCheckByIdStmt,
  listAllFilePathsStmt,
  listActiveFilePathsStmt,
  listImportedSymbolsBySourceStmt,
  listImportedSourceSymbolOrderRowsStmt,
  listLatestImportedFileMetaBySourceStmt,
  listLatestSourceFileLedgerRowsStmt,
  listAllImportedSourceInstrumentsStmt,
  deleteSourceDiagnosticsCacheStmt,
  deleteSourceSymbolDiagnosticsCacheBySourceStmt,
  listFilePathsBySourceStmt,
  countActiveJobsStmt,
  countRunningJobsStmt,
  countActiveJobsBySourceStmt,
  listActiveJobsDetailStmt,
  summarizeJobFilesStmt,
  failActiveFilesByJobStmt,
  listLocalInstrumentsStmt,
  listLocalInstrumentIdsBySourceStmt,
  getLocalInstrumentBySymbolStmt,
  countLocalSourcesStmt,
  countLocalSourceFilesStmt,
  countLocalImportJobsStmt,
  countLocalInstrumentsStmt,
  countLocalSourceDiagnosticsStmt,
  countLocalSourceSymbolDiagnosticsStmt,
  countSourceByIdStmt,
  countSourceFilesBySourceIdStmt,
  countSourceFilesBySourceSymbolStmt,
  countImportJobsBySourceIdStmt,
  countLocalInstrumentsBySourceIdStmt,
  countLocalInstrumentsBySourceSymbolStmt,
  countSourceDiagnosticsBySourceIdStmt,
  countSourceSymbolDiagnosticsBySourceIdStmt,
  countSourceSymbolDiagnosticsBySourceSymbolStmt,
  getSourceStoredSummaryByIdStmt,
  listLocalInstrumentConsistencyRowsBySourceStmt,
  listSystemInstrumentsBySymbolStmt,
  upsertSystemInstrumentStmt,
  deleteLocalSourceFilesStmt,
  deleteLocalImportJobsStmt,
  deleteLocalSourcesStmt,
  deleteLocalInstrumentsStmt,
  deleteAllSourceDiagnosticsCacheStmt,
  deleteAllSourceSymbolDiagnosticsCacheStmt,
  deleteSourceFilesBySourceIdStmt,
  deleteSourceFilesBySourceSymbolStmt,
  deleteSourceFilesBySourceSymbolExceptJobStmt,
  deleteImportJobsBySourceIdStmt,
  deleteSourceByIdStmt,
  deleteInstrumentByIdStmt
} = dataSourceRepository;

export const recoverInterruptedSourceSymbolMutations = (): number =>
  recoverInterruptedSourceSymbolMutationsStmt.run(nowIso()).changes;

setMarketTimelinePrewarmBlocker(() => Number(countActiveJobsStmt.pluck().get() ?? 0) > 0);

export const markActiveJobsAsInterrupted = (): void =>
  markActiveImportJobsAsInterruptedCore({
    listActiveJobsDetail: () =>
      listActiveJobsDetailStmt.all() as Array<{
        id: string;
        sourceId: string;
        status: LocalDataImportJobStatus;
        stage: 'QUEUED' | 'SCANNING' | 'IMPORTING' | 'FINALIZING' | 'DONE';
        sourceStatus: 'IMPORTING' | 'READY' | 'FAILED' | null;
        totalFiles: number;
        doneFiles: number;
        totalRows: number;
        importedRows: number;
        skippedRows: number;
        errorFiles: number;
      }>,
    nowIso,
    withTransaction: (runner) => {
      const tx = db.transaction(runner);
      tx();
    },
    failActiveFilesByJob: (jobId, interruptedAt) => {
      failActiveFilesByJobStmt.run(
        FILE_STATUS_FAILED,
        'LOCAL_DATA_IMPORT_INTERRUPTED',
        interruptedAt,
        jobId,
        FILE_STATUS_QUEUED,
        FILE_STATUS_IMPORTING
      );
    },
    summarizeJobFiles: (jobId) =>
      summarizeJobFilesStmt.get(jobId) as
        | {
            totalFiles: number | null;
            importedFiles: number | null;
            failedFiles: number | null;
          }
        | undefined,
    normalizeCount,
    calculateFileBasedProgressPercent,
    updateJobFinalFailedInterrupted: ({
      jobId,
      progressPercent,
      doneFiles,
      totalRows,
      importedRows,
      skippedRows,
      errorFiles,
      interruptedAt
    }) => {
      updateJobFinalStmt.run(
        'FAILED',
        'DONE',
        progressPercent,
        doneFiles,
        totalRows,
        importedRows,
        skippedRows,
        errorFiles,
        'LOCAL_DATA_IMPORT_INTERRUPTED',
        null,
        interruptedAt,
        interruptedAt,
        jobId
      );
    },
    updateJobFinalRecoveredSuccess: ({
      jobId,
      status,
      doneFiles,
      totalRows,
      importedRows,
      skippedRows,
      errorFiles,
      errorMessage,
      recoveredAt
    }) => {
      updateJobFinalStmt.run(
        status,
        'DONE',
        100,
        doneFiles,
        totalRows,
        importedRows,
        skippedRows,
        errorFiles,
        errorMessage,
        null,
        recoveredAt,
        recoveredAt,
        jobId
      );
    },
    updateSourceStatusFailed: (sourceId, interruptedAt) => {
      updateSourceStatusStmt.run('FAILED', interruptedAt, sourceId);
    }
  });

export const restoreSystemMarketSeedMetadataAfterLocalClear = async (): Promise<void> =>
  restoreSystemMarketSeedMetadataAfterLocalClearCore({
    listSystemSeedInstruments,
    resolveSystemSeedInstrumentMetadata,
    getSystemInstrumentBySymbol: (symbol, baseTimeframe) =>
      listSystemInstrumentsBySymbolStmt.get(symbol, baseTimeframe) as { id: string; symbol: string } | undefined,
    createId,
    upsertSystemInstrument: ({
      instrumentId,
      symbol,
      baseTimeframe,
      name,
      timeZone,
      minTradeStep,
      barCount,
      timeStartTs,
      timeEndTs,
      barsVersionToken,
      createdAt,
    }) => {
      upsertSystemInstrumentStmt.run(
        instrumentId,
        symbol,
        baseTimeframe,
        name,
        timeZone,
        minTradeStep,
        barCount,
        timeStartTs,
        timeEndTs,
        barsVersionToken,
        createdAt
      );
    },
    nowIso
  });

export const {
  abortImportJob,
  acquireImportTempDirLease,
  assertManagedImportTempPath,
  clearImportJobControlState,
  ensureImportJobControlState,
  hasImportJobControlState,
  getImportJobAbortSignal,
  importJobQueueConcurrency,
  importJobQueueMaxQueuedJobs,
  invalidateLocalDataSourcesCache,
  localDataSourcesCacheStore,
  normalizeImportFilePath,
  previewImportSessionStore,
  readDistinctFilePaths,
  readDistinctImportTempDirPaths,
  readImportJobControlState,
  removeImportTempDirsByPath,
  removeImportTempFilesByPath,
  requestCancelAllImportJobs,
  requestCancelImportJob,
  startDataSourceRuntime,
  stopDataSourceRuntime,
  waitForJobControlRelease,
  cleanupUntrackedImportUploadTempFiles,
} = createDataSourceRuntimeContext({
  appError,
  countActiveJobs: () => Number(countActiveJobsStmt.pluck().get() ?? 0),
  listAllFilePathRows: () =>
    listAllFilePathsStmt.all() as Array<{ filePath: string | null }>,
  listActiveFilePathRows: () =>
    listActiveFilePathsStmt.all(
      FILE_STATUS_QUEUED,
      FILE_STATUS_IMPORTING,
    ) as Array<{ filePath: string | null }>,
  markActiveJobsAsInterrupted,
  pruneRetainedImportJobs: () => {
    pruneLocalDataImportJobsForAllSources();
  },
  queuedFileStatus: FILE_STATUS_QUEUED,
  importingFileStatus: FILE_STATUS_IMPORTING,
});

export const sourceDiagnosticsRuntime = createSourceDiagnosticsRuntime({
  invalidateLocalDataSourcesCache,
});

export const {
  acquireSourceDiagnosticsQuiesceLease,
  ensureLocalDataSourceDiagnosticsCache,
  scheduleLocalDataSourceDiagnosticsRebuild,
  warmMissingSystemDataSourceDiagnosticsCaches,
  getLocalDataSourceDiagnostics,
  getLocalDataSourceSymbolDiagnostics,
  updateLocalDataSourceDiagnosticProfile,
  invalidateSourceDiagnosticsRuntimeCaches,
  stopSourceDiagnosticsRuntime,
} = sourceDiagnosticsRuntime;
