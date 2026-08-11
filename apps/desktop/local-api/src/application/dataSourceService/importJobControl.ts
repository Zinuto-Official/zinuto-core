// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../ports/infrastructure/db/database.js';
import {
  checkpointMarketStorage,
  getMarketStorageFootprint,
  removeMarketInstrumentData,
  enqueueHotMarketTimelinePrewarmForInstruments,
  refreshInstrumentQuestionMetaBatch,
  runMarketMaintenance,
} from '../ports/infrastructure/db/marketDatabase.js';
import {
  importCsvFilesBatchedWithProgress,
  importCsvFilesIncrementalWithProgress
} from '../dataSource/tabularImport.js';
import { parseStoredFieldMappingJson } from '../dataSource/fieldMapping.js';
import { createImportJobQueue } from '../dataSource/importJobQueue.js';
import {
  estimateSourceStorageBytesFromCurrentMarket,
  summarizeSourceBars
} from '../dataSource/sourceSummary.js';
import {
  IMPORT_COMPACT_PROGRESS_BASE_PERCENT,
  calculateFileBasedProgressPercent,
  calculateRunningImportProgressPercent,
  normalizeFileSize,
  normalizeCompactProgressPercent,
  normalizeCount,
  normalizeProgressPercent,
  resolveImportInitialBatchFiles,
  resolveImportBatchSize,
  resolveOverallProgressFromMaintenancePercent,
  toSafeStorageBytes
} from '../dataSource/importProgress.js';
import {
  processQueuedImportJob,
  type QueuedImportJob
} from '../dataSource/importJobExecutor.js';
import { failImportJobUnexpectedlyCore } from '../dataSource/importJobFailure.js';
import { startLocalDataImportJobCore } from '../dataSource/importJobStart.js';
import { toLocalDataImportJobDetail, type FailedFileRow, type JobDetailRow } from '../dataSource/importJobDetail.js';
import { controlLocalDataImportJobCore } from '../dataSource/jobControl.js';
import { normalizeSourceName, parseSymbolFromFileName } from '../dataSource/sourceIdentity.js';
import { listLocalDataSourcesCore, type SourceListRow } from '../dataSource/sourceQuery.js';
import {
  applyOperationalAccessToLocalDataSources,
  assertLocalImportOperationalAccessForSources,
} from '../dataSource/accessPolicy.js';
import { pruneLocalDataImportJobsForSource } from '../ports/infrastructure/db/dataSource/importJobRetentionStore.js';
import type {
  LocalDataImportJobControlAction,
  LocalDataImportJobDetail,
  LocalDataImportJobStatus,
  LocalDataSourceSummary,
  StartLocalDataImportInput
} from '../dataSource/types.js';
import { createId } from '../../kernel/id.js';
import { nowIso } from '../../kernel/time.js';
import { appError, isAppError } from '../../kernel/appError.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { isResetAllStoredDataJobActiveState } from '../trading/resetAllDataJobState.js';
import { isSystemResetExecutionActive } from '../trading/resetExecutionState.js';

import {
  FILE_STATUS_QUEUED,
  FILE_STATUS_IMPORTING,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_FAILED,
  insertSourceStmt,
  insertJobStmt,
  insertFileStmt,
  updateFileImportingStmt,
  updateFileProgressStmt,
  updateFileImportedStmt,
  updateFileFailedStmt,
  updateFileFailureDetailsStmt,
  updateSourceStatusStmt,
  updateSourceFinalStmt,
  updateSourceStorageBytesStmt,
  updateSourceForSyncImportStmt,
  updateSourceForIncrementalImportStmt,
  updateJobRunningStmt,
  updateJobProgressStmt,
  updateJobCompactingProgressStmt,
  updateJobCompactionResultStmt,
  updateJobCompactionBaselineStmt,
  updateJobFinalStmt,
  updateJobFailureDetailsStmt,
  listSourcesStmt,
  getJobStmt,
  getJobStatusStmt,
  listFailedFilesByJobStmt,
  getSourceImportConfigByIdStmt,
  listImportedSymbolsBySourceStmt,
  listImportedSourceSymbolOrderRowsStmt,
  listLatestSourceFileLedgerRowsStmt,
  listAllImportedSourceInstrumentsStmt,
  deleteSourceDiagnosticsCacheStmt,
  deleteSourceSymbolDiagnosticsCacheBySourceStmt,
  countRunningJobsStmt,
  countActiveJobsBySourceStmt,
  summarizeJobFilesStmt,
  failActiveFilesByJobStmt,
  getLocalInstrumentBySymbolStmt,
  deleteSourceFilesBySourceSymbolExceptJobStmt,
  deleteSourceFilesBySourceSymbolStmt,
  deleteInstrumentByIdStmt,
  countActiveJobsStmt,
  markActiveJobsAsInterrupted,
  assertManagedImportTempPath,
  abortImportJob,
  clearImportJobControlState,
  ensureImportJobControlState,
  getImportJobAbortSignal,
  hasImportJobControlState,
  importJobQueueConcurrency,
  importJobQueueMaxQueuedJobs,
  invalidateLocalDataSourcesCache,
  normalizeImportFilePath,
  readImportJobControlState,
  removeImportTempDirsByPath,
  removeImportTempFilesByPath,
  requestCancelImportJob,
  requestCancelAllImportJobs,
  waitForJobControlRelease,
} from './sharedDependencies.js';

const toJobDetail = (jobId: string): LocalDataImportJobDetail => {
  return toLocalDataImportJobDetail(jobId, {
    getJobRow: (normalizedJobId) => getJobStmt.get(normalizedJobId) as JobDetailRow | undefined,
    listFailedFileRows: (normalizedJobId, failedStatus) =>
      listFailedFilesByJobStmt.all(normalizedJobId, failedStatus) as FailedFileRow[],
    readImportJobControlState,
    failedFileStatus: FILE_STATUS_FAILED,
    normalizeProgressPercent,
    normalizeCompactProgressPercent,
    toSafeStorageBytes
  });
};

const failImportJobUnexpectedly = async (queuedJob: QueuedImportJob, error: unknown): Promise<void> => {
  await failImportJobUnexpectedlyCore(queuedJob, error, {
    nowIso,
    normalizeCount,
    calculateFileBasedProgressPercent,
    failActiveFilesByJob: (jobId, errorMessage, failedAt) => {
      failActiveFilesByJobStmt.run(
        FILE_STATUS_FAILED,
        errorMessage,
        failedAt,
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
    getJobRow: (jobId) =>
      getJobStmt.get(jobId) as
        | {
            totalFiles: number;
            doneFiles: number;
            totalRows: number;
            importedRows: number;
            skippedRows: number;
            errorFiles: number;
          }
        | undefined,
    summarizeSourceBars,
    estimateSourceStorageBytesFromCurrentMarket,
    updateSourceFinalFailed: ({
      sourceId,
      totalFiles,
      importedFiles,
      failedFiles,
      symbolCount,
      barCount,
      storageBytes,
      startTs,
      endTs,
      failedAt
    }) => {
      updateSourceFinalStmt.run(
        'FAILED',
        totalFiles,
        importedFiles,
        failedFiles,
        symbolCount,
        barCount,
        storageBytes,
        startTs,
        endTs,
        failedAt,
        sourceId
      );
    },
    updateJobFinalFailed: ({
      jobId,
      progressPercent,
      doneFiles,
      totalRows,
      importedRows,
      skippedRows,
      errorFiles,
      errorMessage,
      failedAt
    }) => {
      invalidateLocalDataSourcesCache();
      updateJobFinalStmt.run(
        'FAILED',
        'DONE',
        progressPercent,
        doneFiles,
        totalRows,
        importedRows,
        skippedRows,
        errorFiles,
        errorMessage,
        null,
        failedAt,
        failedAt,
        jobId
      );
    },
    updateSourceStatusFailed: (sourceId, failedAt) => {
      updateSourceStatusStmt.run('FAILED', failedAt, sourceId);
    },
    updateJobFinalFailedFallback: (jobId, errorMessage, failedAt) => {
      invalidateLocalDataSourcesCache();
      updateJobFinalStmt.run('FAILED', 'DONE', 0, 0, 0, 0, 0, 0, errorMessage, null, failedAt, failedAt, jobId);
    },
    updateJobFailureDetails: ({
      jobId,
      errorCode,
      causeJson,
      detailsJson,
      updatedAt,
    }) => {
      updateJobFailureDetailsStmt.run(
        errorCode,
        causeJson,
        detailsJson,
        null,
        updatedAt,
        jobId,
      );
    },
    clearImportJobControlState,
    normalizeImportFilePath,
    removeImportTempFilesByPath,
    removeImportTempDirsByPath
  });
  pruneLocalDataImportJobsForSource(queuedJob.sourceId);
};

const processImportJob = async (queuedJob: QueuedImportJob): Promise<void> => {
  deleteSourceDiagnosticsCacheStmt.run(queuedJob.sourceId);
  deleteSourceSymbolDiagnosticsCacheBySourceStmt.run(queuedJob.sourceId);
  await processQueuedImportJob(queuedJob, {
    nowIso,
    fileStatusImporting: FILE_STATUS_IMPORTING,
    fileStatusImported: FILE_STATUS_IMPORTED,
    fileStatusFailed: FILE_STATUS_FAILED,
    resolveRuntimeImportParallelFiles: () => {
      const runningJobs = Math.max(1, Math.floor(Number(countRunningJobsStmt.pluck().get() ?? 1)));
      return Math.max(1, Math.floor(runtimeLimits.importParallelFiles / runningJobs));
    },
    resolveImportInitialBatchFiles,
    normalizeImportFilePath,
    removeImportTempFilesByPath,
    removeImportTempDirsByPath,
    updateSourceStatusStmt,
    updateJobRunningStmt,
    ensureImportJobControlState,
    getImportJobAbortSignal,
    abortImportJob,
    importJobExecutionDeadlineMs: runtimeLimits.importJobExecutionDeadlineMs,
    calculateRunningImportProgressPercent,
    updateJobProgressStmt,
    importCsvFilesBatchedWithProgress,
    importCsvFilesIncrementalWithProgress,
    readImportJobControlState,
    createCanceledImportError: () => appError('LOCAL_DATA_IMPORT_JOB_CANCELED'),
    isCanceledImportError: (error) => isAppError(error) && error.code === 'LOCAL_DATA_IMPORT_JOB_CANCELED',
    updateFileImportingStmt,
    updateFileProgressStmt,
    updateFileImportedStmt,
    updateFileFailedStmt,
    updateFileFailureDetails: ({
      fileRowId,
      errorCode,
      causeJson,
      detailsJson,
      diagnosticsJson,
      updatedAt,
    }) => {
      updateFileFailureDetailsStmt.run(errorCode, causeJson, detailsJson, diagnosticsJson, updatedAt, fileRowId);
    },
    waitForJobControlRelease,
    resolveImportBatchSize,
    listImportedSymbolsBySourceStmt,
    summarizeSourceBars,
    estimateSourceStorageBytesFromCurrentMarket,
    calculateFileBasedProgressPercent,
    updateSourceFinalStmt,
    beforePublishTerminalJob: invalidateLocalDataSourcesCache,
    updateJobFinalStmt,
    updateJobFailureDetails: ({
      jobId,
      errorCode,
      causeJson,
      detailsJson,
      failureSummaryJson,
      updatedAt,
    }) => {
      updateJobFailureDetailsStmt.run(errorCode, causeJson, detailsJson, failureSummaryJson, updatedAt, jobId);
    },
    checkpointMarketStorage,
    clearImportJobControlState,
    updateJobCompactingProgressStmt,
    importCompactProgressBasePercent: IMPORT_COMPACT_PROGRESS_BASE_PERCENT,
    normalizeCompactProgressPercent,
    normalizeProgressPercent,
    getMarketStorageFootprint,
    toSafeStorageBytes,
    updateJobCompactionBaselineStmt,
    countActiveJobs: () => Number(countActiveJobsStmt.pluck().get() ?? 0),
    runMarketMaintenance,
    resolveOverallProgressFromMaintenancePercent,
    updateJobCompactionResultStmt,
    updateSourceStorageBytesStmt,
    refreshImportedInstrumentDerivedData: refreshInstrumentQuestionMetaBatch,
    enqueueImportedInstrumentTimelinePrewarm: enqueueHotMarketTimelinePrewarmForInstruments,
    deleteSourceFilesBySourceSymbolExceptJob: (sourceId, symbol, currentJobId) =>
      deleteSourceFilesBySourceSymbolExceptJobStmt.run(sourceId, symbol, currentJobId).changes,
    deleteSourceFilesBySourceSymbol: (sourceId, symbol) =>
      deleteSourceFilesBySourceSymbolStmt.run(sourceId, symbol).changes,
    getLocalInstrumentBySymbol: (sourceId, symbol, baseTimeframe) =>
      getLocalInstrumentBySymbolStmt.get(sourceId, symbol, baseTimeframe) as { id: string } | undefined,
    removeMarketInstrumentData,
    deleteInstrumentById: (instrumentId) => deleteInstrumentByIdStmt.run(instrumentId).changes,
    pruneImportJobHistoryForSource: (sourceId) => {
      pruneLocalDataImportJobsForSource(sourceId);
    },
  });
};

const importJobQueue = createImportJobQueue<QueuedImportJob>({
  concurrency: importJobQueueConcurrency,
  maxQueuedJobs: importJobQueueMaxQueuedJobs,
  processJob: processImportJob,
  handleProcessError: failImportJobUnexpectedly,
  onJobSettled: () => {
    invalidateLocalDataSourcesCache();
  },
});

export const stopLocalDataImportJobQueue = async (): Promise<void> => {
  requestCancelAllImportJobs();
  await importJobQueue.stop();
  markActiveJobsAsInterrupted();
};

const loadLocalDataSources = (): LocalDataSourceSummary[] => {
  const items = listLocalDataSourcesCore({
    listSourcesRows: () => listSourcesStmt.all() as SourceListRow[],
    listLatestSourceFileRows: () =>
      listLatestSourceFileLedgerRowsStmt.all() as Array<{
        sourceId: string;
        instrumentId?: string | null;
        symbol: string;
        fileName?: string | null;
        filePath?: string | null;
        status: 'QUEUED' | 'IMPORTING' | 'IMPORTED' | 'FAILED';
        rowsImported: number;
      }>,
    listAllImportedSourceInstruments: () =>
      listAllImportedSourceInstrumentsStmt.all() as Array<{
        sourceId: string;
        instrumentId: string;
        symbol: string;
        baseTimeframe: '1m' | '5m' | '1h' | '1d';
        timeStartTs: string | null;
        timeEndTs: string | null;
        barCount: number;
        sourceIdForInstrument: string | null;
        sourceName: string | null;
      }>,
    parseStoredFieldMappingJson,
    normalizeProgressPercent,
    normalizeCompactProgressPercent,
    normalizeCount,
    toSafeStorageBytes,
  });
  const symbolOrderRows = listImportedSourceSymbolOrderRowsStmt.all() as Array<{
    sourceId: string;
    symbol: string;
    firstCreatedAt: string | null;
  }>;
  const symbolOrderBySourceId = new Map<string, string[]>();
  symbolOrderRows.forEach((row) => {
    const sourceId = String(row.sourceId ?? '').trim();
    const symbol = String(row.symbol ?? '').trim().toUpperCase();
    if (!sourceId || !symbol) {
      return;
    }
    const current = symbolOrderBySourceId.get(sourceId) ?? [];
    if (!current.includes(symbol)) {
      current.push(symbol);
      symbolOrderBySourceId.set(sourceId, current);
    }
  });
  return applyOperationalAccessToLocalDataSources({
    items,
    symbolOrderBySourceId,
  });
};

export const startLocalDataImportJob = async (input: StartLocalDataImportInput): Promise<LocalDataImportJobDetail> => {
  const detail = startLocalDataImportJobCore(input, {
    normalizeSourceName,
    nowIso,
    createId,
    normalizeFileSize,
    assertManagedImportTempPath,
    parseSymbolFromFileName,
    isSystemResetRunning: () => isResetAllStoredDataJobActiveState() || isSystemResetExecutionActive(),
    getSourceImportConfigById: (sourceId) => {
      const row = getSourceImportConfigByIdStmt.get(sourceId) as
        | {
            id: string;
            name: string;
            sourceFolder: string;
            sourceFolderBookmarkId: string;
            importScopeStrategy: 'FLAT' | 'WITH_PARENT' | null;
            importScopeTopLevelSubfolder: string;
            timeZone: string;
            timeZoneOrigin: 'PRESET_DEFAULT' | 'INFERRED_DEFAULT' | 'USER_SELECTED';
            tradingCalendarJson: string;
            diagnosticAssetClass: string | null;
            diagnosticMarketPresetId: string | null;
            diagnosticProfileOrigin: string | null;
          }
        | undefined;
      return row;
    },
    countActiveJobsBySource: (sourceId) => Number(countActiveJobsBySourceStmt.pluck().get(sourceId) ?? 0),
    listImportedSymbolsBySource: (sourceId) => listImportedSymbolsBySourceStmt.all(sourceId) as Array<{ symbol: string }>,
    withTransaction: (runner) => {
      const tx = db.transaction(runner);
      tx();
    },
    insertSource: ({
      sourceId,
      sourceName,
      sourceFolder,
      sourceFolderBookmarkId,
      importScopeStrategy,
      importScopeTopLevelSubfolder,
      timeZone,
      timeZoneOrigin,
      baseTimeframe,
      diagnosticProfile,
      mappingJson,
      tradingCalendarJson,
      totalFiles,
      lastJobId,
      createdAt
    }) => {
      insertSourceStmt.run(
        sourceId,
        sourceName,
        sourceFolder,
        sourceFolderBookmarkId,
        importScopeStrategy,
        importScopeTopLevelSubfolder,
        timeZone,
        timeZoneOrigin,
        baseTimeframe,
        diagnosticProfile.assetClass,
        diagnosticProfile.marketPresetId,
        diagnosticProfile.profileOrigin,
        mappingJson,
        tradingCalendarJson,
        'IMPORTING',
        totalFiles,
        0,
        0,
        0,
        0,
        0,
        null,
        null,
        lastJobId,
        createdAt,
        createdAt
      );
    },
    updateSourceForSyncImport: ({
      sourceId,
      sourceName,
      sourceFolder,
      sourceFolderBookmarkId,
      importScopeStrategy,
      importScopeTopLevelSubfolder,
      timeZone,
      timeZoneOrigin,
      baseTimeframe,
      diagnosticProfile,
      mappingJson,
      tradingCalendarJson,
      totalFiles,
      lastJobId,
      updatedAt
    }) => {
      return updateSourceForSyncImportStmt.run(
        sourceName,
        sourceFolder,
        sourceFolderBookmarkId,
        importScopeStrategy,
        importScopeTopLevelSubfolder,
        timeZone,
        timeZoneOrigin,
        baseTimeframe,
        diagnosticProfile.assetClass,
        diagnosticProfile.marketPresetId,
        diagnosticProfile.profileOrigin,
        mappingJson,
        tradingCalendarJson,
        totalFiles,
        lastJobId,
        updatedAt,
        sourceId
      ).changes === 1;
    },
    updateSourceForIncrementalImport: ({
      sourceId,
      sourceFolder,
      sourceFolderBookmarkId,
      lastJobId,
      updatedAt
    }) => {
      return updateSourceForIncrementalImportStmt.run(
        sourceFolder ? sourceFolder : null,
        sourceFolderBookmarkId ? sourceFolderBookmarkId : null,
        lastJobId,
        updatedAt,
        sourceId
      ).changes === 1;
    },
    insertJob: ({ jobId, sourceId, sourceName, timeZone, baseTimeframe, jobMode, totalFiles, symbolLimitJson, createdAt }) => {
      insertJobStmt.run(
        jobId,
        sourceId,
        sourceName,
        timeZone,
        baseTimeframe,
        jobMode,
        'QUEUED',
        'QUEUED',
        0,
        0,
        0,
        0,
        0,
        totalFiles,
        0,
        0,
        0,
        0,
        0,
        null,
        null,
        null,
        symbolLimitJson,
        createdAt,
        null,
        null,
        createdAt
      );
    },
    insertFile: ({
      fileRowId,
      sourceId,
      jobId,
      symbol,
      fileName,
      filePath,
      fileSize,
      fileMtimeMs,
      fileFingerprint,
      createdAt
    }) => {
      insertFileStmt.run(
        fileRowId,
        sourceId,
        jobId,
        null,
        symbol,
        fileName,
        filePath,
        fileSize,
        fileMtimeMs,
        fileFingerprint,
        FILE_STATUS_QUEUED,
        0,
        0,
        0,
        null,
        createdAt,
        createdAt
      );
    },
    ensureImportJobControlState: (jobId) => {
      ensureImportJobControlState(jobId);
    },
    assertMutationAccessForSource: (sourceIdRaw) => {
      assertLocalImportOperationalAccessForSources({
        sourceIdRaw,
        sources: loadLocalDataSources(),
        appError,
      });
    },
    enqueueImportJob: (job) => {
      importJobQueue.enqueue(job);
    },
    assertImportQueueCapacity: () => {
      importJobQueue.assertCanEnqueue();
    },
    toJobDetail
  });
  invalidateLocalDataSourcesCache();
  return detail;
};

export const getLocalDataImportJob = (jobId: string): LocalDataImportJobDetail => toJobDetail(jobId);

export const controlLocalDataImportJob = (
  jobId: string,
  action: LocalDataImportJobControlAction
): LocalDataImportJobDetail => {
  const detail = controlLocalDataImportJobCore(jobId, action, {
    getJobStatusById: (normalizedJobId) =>
      getJobStatusStmt.get(normalizedJobId) as
        | {
            id: string;
            sourceId: string;
            status: LocalDataImportJobStatus;
          }
        | undefined,
    toJobDetail,
    hasImportJobControlState,
    ensureImportJobControlState,
    requestCancelImportJob: (normalizedJobId) => {
      requestCancelImportJob(
        normalizedJobId,
        appError('LOCAL_DATA_IMPORT_JOB_CANCELED'),
      );
      return ensureImportJobControlState(normalizedJobId);
    },
    clearImportJobControlState,
    nowIso,
    importJobQueue,
    updateFileFailed: (fileRowId, canceledAt) => {
      updateFileFailedStmt.run(FILE_STATUS_FAILED, 0, 0, 0, 'LOCAL_DATA_IMPORT_JOB_CANCELED', canceledAt, fileRowId);
    },
    removeImportTempFile: (filePath) => {
      void removeImportTempFilesByPath([filePath]);
    },
    removeImportTempDirs: (dirPaths) => {
      void removeImportTempDirsByPath(dirPaths);
    },
    updateSourceFinalFailedCanceled: (sourceId, totalFiles, canceledAt) => {
      updateSourceFinalStmt.run(
        'FAILED',
        totalFiles,
        0,
        totalFiles,
        0,
        0,
        0,
        null,
        null,
        canceledAt,
        sourceId
      );
    },
    updateJobFinalCanceled: (normalizedJobId, progressPercent, doneFiles, failedFiles, canceledAt) => {
      updateJobFinalStmt.run(
        'CANCELED',
        'DONE',
        progressPercent,
        doneFiles,
        0,
        0,
        0,
        failedFiles,
        'LOCAL_DATA_IMPORT_JOB_CANCELED',
        null,
        canceledAt,
        canceledAt,
        normalizedJobId
      );
    },
    failActiveFilesByJob: (normalizedJobId, canceledAt) => {
      failActiveFilesByJobStmt.run(
        FILE_STATUS_FAILED,
        'LOCAL_DATA_IMPORT_JOB_CANCELED',
        canceledAt,
        normalizedJobId,
        FILE_STATUS_QUEUED,
        FILE_STATUS_IMPORTING
      );
    },
    summarizeJobFiles: (normalizedJobId) =>
      summarizeJobFilesStmt.get(normalizedJobId) as
        | {
            totalFiles: number | null;
            importedFiles: number | null;
            failedFiles: number | null;
          }
        | undefined,
    updateSourceStatusFailed: (sourceId, canceledAt) => {
      updateSourceStatusStmt.run('FAILED', canceledAt, sourceId);
    },
    normalizeCount,
    calculateFileBasedProgressPercent
  });
  invalidateLocalDataSourcesCache();
  return detail;
};
