// SPDX-License-Identifier: GPL-3.0-only

import {
  buildInitialLocalDataImportDraftValidation,
  createLocalDataImportDraftValidationService,
} from '../dataSource/importDraftValidationService.js';
import {
  previewLocalDataImportFolderCore,
  type PreviewLocalDataImportFolderProgressReporter,
  type PreviewLocalDataImportFolderResult
} from '../dataSource/folderPreview.js';
import {
  createLocalDataImportPreviewJobService,
  type LocalDataImportPreviewJobDetail,
  type PreviewLocalDataImportFolderApiResult,
} from '../dataSource/importPreviewJobService.js';
import { createPreviewPlanImportResolver } from '../dataSource/previewPlanResolver.js';
import { buildLocalDataSourceSyncQuickCheck } from '../dataSource/syncQuickCheck.js';
import { normalizeSymbolListInOrder } from '../dataSource/symbolLimit.js';
import { createLocalImportOperationGate } from '../dataSource/operationGate.js';
import { createPreviewImportPlanningService } from '../dataSource/previewImportPlanning.js';
import type {
  LocalDataImportScopeStrategy,
  LocalDataSyncQuickCheck,
  LocalDataSyncQuickCheckFileMetadata,
  LocalDataSourceStatus,
} from '../dataSource/types.js';
import { parseSymbolFromFileName } from '../dataSource/sourceIdentity.js';
import { normalizeFileSize } from '../dataSource/importProgress.js';
import { createId } from '../../kernel/id.js';
import { nowIso } from '../../kernel/time.js';
import { appError } from '../../kernel/appError.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { throwIfOperationAborted } from '../dataSource/operationAbort.js';
import { isResetAllStoredDataJobActiveState } from '../trading/resetAllDataJobState.js';
import { isSystemResetExecutionActive } from '../trading/resetExecutionState.js';

import {
  acquireImportTempDirLease,
  assertManagedImportTempPath,
  normalizeImportFilePath,
  previewImportSessionStore,
  readDistinctFilePaths,
  readDistinctImportTempDirPaths,
  removeImportTempDirsByPath,
  listLatestImportedFileMetaBySourceStmt,
  listImportedSourceSymbolOrderRowsStmt,
  listAllFilePathsStmt,
  getSourceSyncQuickCheckByIdStmt,
  invalidateLocalDataSourcesCache,
  listImportedSymbolsBySourceStmt,
} from './sharedDependencies.js';
import { startLocalDataImportJob } from './importJobControl.js';
import { listLocalDataSources } from './dataSourceManagement.js';

type ExistingImportedFileMetaRow = {
  instrumentId?: string | null;
  symbol: string;
  fileName?: string | null;
  filePath?: string | null;
  fileSize: number | null;
  fileMtimeMs: number | null;
  fileFingerprint: string | null;
};

const HASH_COMPARE_CONCURRENCY = Math.max(1, Math.min(4, runtimeLimits.importParallelFiles));
const { resolveImportFilesFromPreviewPlan } = createPreviewPlanImportResolver({
  normalizeImportFilePath,
  assertManagedImportTempPath,
  parseSymbolFromFileName: (fileName: string) => {
    
    return parseSymbolFromFileName(fileName);
  },
  readDistinctImportTempDirPaths,
  normalizeFileSize: (value: unknown) => {
    
    return normalizeFileSize(value);
  },
  previewStore: previewImportSessionStore,
  listLatestImportedFileMetaBySource: (sourceId) =>
    listLatestImportedFileMetaBySourceStmt.all(sourceId) as ExistingImportedFileMetaRow[],
  hashCompareConcurrency: HASH_COMPARE_CONCURRENCY,
  appError
});

const assertLocalImportPreviewAccess = createLocalImportOperationGate({
  listLocalDataSources: () => listLocalDataSources(),
  appError,
});

const assertLocalImportMutationAccess = createLocalImportOperationGate({
  listLocalDataSources: () => listLocalDataSources(),
  appError,
});

export const previewLocalDataImportFolder = async (
  folderPathRaw: string, sourceIdRaw = '', localeRaw = '',
  sourceFolderNameRaw = '',
  onProgress?: PreviewLocalDataImportFolderProgressReporter,
  signal?: AbortSignal,
): Promise<PreviewLocalDataImportFolderApiResult> => {
  throwIfOperationAborted(signal);
  const normalizedFolderPath = normalizeImportFilePath(folderPathRaw);
  const isManagedTempPreviewPath = (() => {
    try {
      assertManagedImportTempPath(normalizedFolderPath);
      return true;
    } catch {
      return false;
    }
  })();
  let preview: PreviewLocalDataImportFolderResult;
  try {
    await assertLocalImportPreviewAccess(sourceIdRaw);
    throwIfOperationAborted(signal);
    const sourceId = String(sourceIdRaw || '').trim();
    const existingSourceTimeZone = sourceId
      ? String(
          (await listLocalDataSources()).find(
            (source) => String(source.id || '').trim() === sourceId,
          )?.timeZone || '',
        ).trim()
      : '';
    preview = await previewLocalDataImportFolderCore(
      normalizedFolderPath,
      {
        normalizeImportFilePath,
        assertManagedImportTempPath,
        parseSymbolFromFileName: (fileName: string) => {
          
          return parseSymbolFromFileName(fileName);
        },
        createId
      },
      {
        existingSourceTimeZone,
        locale: localeRaw,
        sourceFolderName: sourceFolderNameRaw,
        onProgress,
        signal,
      }
    );
  } catch (error) {
    if (isManagedTempPreviewPath) {
      await removeImportTempDirsByPath([normalizedFolderPath]).catch(() => undefined);
    }
    throw error;
  }
  throwIfOperationAborted(signal);
  const sources = await listLocalDataSources();
  throwIfOperationAborted(signal);
  const draftValidation = buildInitialLocalDataImportDraftValidation({
    preview,
    sources,
    locale: localeRaw,
    validatedAt: nowIso(),
  });
  throwIfOperationAborted(signal);
  const previewToken = previewImportSessionStore.save({
    folderPath: preview.folderPath,
    plans: (Array.isArray(preview.plans) ? preview.plans : []).map((plan) => ({
      ...plan,
      defaultPoolName:
        preview.confirmableImportPlans.find(
          (item) => String(item.previewPlanId || '').trim() === String(plan.id || '').trim(),
        )?.defaultPoolName ?? '',
    })),
    suggestedFreeReplayEnvironment: preview.suggestedFreeReplayEnvironment,
    suggestedTradingCalendar: preview.tradingCalendarSuggestion,
    headers: preview.headers,
  });
  if (signal?.aborted) {
    previewImportSessionStore.discard(previewToken, { cleanupFolder: false });
    throw signal.reason ?? new Error('LOCAL_DATA_IMPORT_PREVIEW_ABORTED');
  }
  return {
    previewToken,
    folderName: preview.folderName,
    folderPath: preview.folderPath,
    marketDataAcquisitionMetadata: preview.marketDataAcquisitionMetadata,
    suggestedFreeReplayEnvironment: preview.suggestedFreeReplayEnvironment,
    suggestedTimeZone: preview.suggestedTimeZone,
    suggestedTimeZoneReason: preview.suggestedTimeZoneReason,
    timeZoneSuggestion: preview.timeZoneSuggestion,
    tradingCalendarSuggestion: preview.tradingCalendarSuggestion,
    draftValidation,
    headers: preview.headers,
    defaultMapping: preview.defaultMapping,
    mappingProfile: preview.mappingProfile,
    fieldDiagnostics: preview.fieldDiagnostics,
    repairSummary: preview.repairSummary,
    schemaDiagnostics: preview.schemaDiagnostics,
    detectedTimeframe: preview.detectedTimeframe,
    detectedTimeframes: Array.isArray(preview.detectedTimeframes) ? preview.detectedTimeframes : [preview.detectedTimeframe],
    validSymbolCount: preview.validSymbolCount,
    totalFiles: preview.totalFiles,
    validFiles: preview.validFiles,
    invalidFiles: preview.invalidFiles,
    invalidFileSamples: Array.isArray(preview.invalidFileSamples) ? preview.invalidFileSamples : [],
    planSummaries: Array.isArray(preview.planSummaries) ? preview.planSummaries : [],
    confirmableImportPlans: Array.isArray(preview.confirmableImportPlans) ? preview.confirmableImportPlans : [],
    sampledFileNames: Array.isArray(preview.sampledFileNames) ? preview.sampledFileNames : [],
    skippedNestedCount: preview.skippedNestedCount
  };
};

const localDataImportPreviewJobService = createLocalDataImportPreviewJobService({
  normalizeImportFilePath,
  assertManagedImportTempPath,
  assertLocalImportPreviewAccess,
  previewLocalDataImportFolder,
  previewImportSessionStore,
  readDistinctFilePaths,
  listAllFilePaths: () =>
    listAllFilePathsStmt.all() as Array<{ filePath: string | null }>,
  acquireImportTempDirLease,
  removeImportTempDirsByPath,
  createId,
  nowIso,
  previewDeadlineMs: runtimeLimits.importPreviewJobDeadlineMs,
  maxConcurrentPreviewJobs: runtimeLimits.importPreviewMaxConcurrentJobs,
  isSystemResetRunning: () =>
    isResetAllStoredDataJobActiveState() || isSystemResetExecutionActive(),
});

export type { LocalDataImportPreviewJobDetail };

export const startLocalDataImportPreviewJob =
  localDataImportPreviewJobService.startLocalDataImportPreviewJob;

export const getLocalDataImportPreviewJob =
  localDataImportPreviewJobService.getLocalDataImportPreviewJob;

export const getActiveLocalDataImportPreviewExecutionCount =
  localDataImportPreviewJobService.getActiveLocalDataImportPreviewExecutionCount;

export const hasActiveLocalDataImportPreviewExecutions =
  localDataImportPreviewJobService.hasActiveLocalDataImportPreviewExecutions;

export const stopLocalDataImportPreviewJobs =
  localDataImportPreviewJobService.stopLocalDataImportPreviewJobs;

export const discardLocalDataImportPreview =
  localDataImportPreviewJobService.discardLocalDataImportPreview;

export const validateLocalDataImportDraft =
  createLocalDataImportDraftValidationService({
    assertLocalImportPreviewAccess,
    listLocalDataSources: () => listLocalDataSources(),
    nowIso,
    previewImportSessionStore,
  });

const previewImportPlanningService = createPreviewImportPlanningService({
  assertLocalImportPreviewAccess: assertLocalImportPreviewAccess,
  assertLocalImportMutationAccess: assertLocalImportMutationAccess,
  previewStore: previewImportSessionStore,
  resolveImportFilesFromPreviewPlan,
  startLocalDataImportJob,
  invalidateLocalDataSourcesCache,
  listLocalDataSources: () => listLocalDataSources(),
  listImportedSymbolsBySource: (sourceId) =>
    listImportedSymbolsBySourceStmt.all(sourceId) as Array<{ symbol: string }>,
  resolveLocalImportSymbolLimit: async () => null,
  acquireImportTempDirLease,
  removeImportTempDirsByPath,
  appError
});

export const startLocalDataImportJobFromPreviewPlan =
  previewImportPlanningService.startLocalDataImportJobFromPreviewPlan;

export const startLocalDataFullReimportJobFromPreviewPlan =
  previewImportPlanningService.startLocalDataFullReimportJobFromPreviewPlan;

export const startLocalDataIncrementalUpdateJobFromPreviewPlan =
  previewImportPlanningService.startLocalDataIncrementalUpdateJobFromPreviewPlan;

export const previewLocalDataSourceSync =
  previewImportPlanningService.previewLocalDataSourceSync;

export const quickCheckLocalDataSourceSync = async (input: {
  sourceId: string;
  sourceFolder?: string;
  files: LocalDataSyncQuickCheckFileMetadata[];
}): Promise<LocalDataSyncQuickCheck> => {
  const normalizedSourceId = String(input.sourceId || '').trim();
  await assertLocalImportPreviewAccess(normalizedSourceId);
  const maxSymbols = null;
  const unlockedSymbols =
    maxSymbols === null || !normalizedSourceId
      ? null
      : normalizeSymbolListInOrder(
          (
            listImportedSourceSymbolOrderRowsStmt.all() as Array<{
              sourceId: string | null;
              symbol: string | null;
            }>
          )
            .filter(
              (row) => String(row.sourceId || '').trim() === normalizedSourceId,
            )
            .map((row) => row.symbol),
        ).slice(0, maxSymbols);
  const checkedAt = nowIso();
  const source = normalizedSourceId
    ? ((getSourceSyncQuickCheckByIdStmt.get(normalizedSourceId) as
        | {
            id: string;
            name: string;
            sourceFolder: string;
            status: LocalDataSourceStatus;
            baseTimeframe: '1m' | '5m' | '1h' | '1d';
            importScopeStrategy: LocalDataImportScopeStrategy | null;
            importScopeTopLevelSubfolder: string | null;
          }
        | undefined) ?? null)
    : null;
  const latestImportedFileMetaBySource = normalizedSourceId
    ? (
        listLatestImportedFileMetaBySourceStmt.all(normalizedSourceId) as Array<{
          instrumentId: string | null;
          symbol: string | null;
          fileName: string | null;
          filePath: string | null;
          fileSize: number | null;
          fileMtimeMs: number | null;
          fileFingerprint: string | null;
        }>
      ).map((item) => ({
        instrumentId: item.instrumentId,
        symbol: String(item.symbol || '').trim().toUpperCase(),
        fileName: String(item.fileName ?? '').trim()
          ? String(item.fileName ?? '')
          : '',
        filePath: String(item.filePath ?? '').trim()
          ? String(item.filePath ?? '')
          : '',
        fileSize: item.fileSize,
        fileMtimeMs: item.fileMtimeMs,
        fileFingerprint: item.fileFingerprint,
      }))
    : [];

  return buildLocalDataSourceSyncQuickCheck({
    source: source
      ? {
          id: source.id,
          name: source.name,
          sourceFolder: source.sourceFolder,
          status: source.status,
          baseTimeframe: source.baseTimeframe,
          importScopeStrategy: source.importScopeStrategy,
          importScopeTopLevelSubfolder: String(
            source.importScopeTopLevelSubfolder ?? '',
          ).trim()
            ? String(source.importScopeTopLevelSubfolder ?? '')
            : '',
        }
      : null,
    sourceFolder: input.sourceFolder,
    files: Array.isArray(input.files) ? input.files : [],
    latestImportedFileMetaBySource,
    symbolLimitContext: {
      maxSymbols,
      unlockedSymbols,
    },
    parseSymbolFromFileName: (fileName: string) => {
      
      return parseSymbolFromFileName(fileName);
    },
    checkedAt,
  });
};
