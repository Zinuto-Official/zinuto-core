// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../ports/infrastructure/db/database.js';
import { invalidateMarketReadCaches } from '../ports/infrastructure/db/marketReadCache.js';
import {
  removeMarketInstrumentData,
  reclaimEmptyMarketStorage,
} from '../ports/infrastructure/db/marketDatabase.js';
import { parseStoredFieldMappingJson } from '../dataSource/fieldMapping.js';
import { createLocalDataSourceTradingCalendarUpdateService } from '../dataSource/tradingCalendarUpdate.js';
import {
  estimateSourceStorageBytesFromCurrentMarket,
  summarizeSourceBars
} from '../dataSource/sourceSummary.js';
import {
  normalizeCompactProgressPercent,
  normalizeCount,
  normalizeProgressPercent,
  toSafeStorageBytes
} from '../dataSource/importProgress.js';
import { createSourceAdminService } from '../dataSource/sourceAdminService.js';
import { createSourceDestructiveVerification } from '../dataSource/sourceDestructiveVerification.js';
import { listLocalDataSourcesCore, type SourceListRow } from '../dataSource/sourceQuery.js';
import type {
  LocalDataSourceSummary,
} from '../dataSource/types.js';
import { isResetAllStoredDataJobActiveState } from '../trading/resetAllDataJobState.js';
import { isSystemResetExecutionActive } from '../trading/resetExecutionState.js';
import type { DataSourceDiagnosticConfigRow } from '../dataSource/sourceDiagnosticsRuntime.js';
import { listSystemSeedInstruments } from '../ports/infrastructure/db/database.js';
import { createLocalImportOperationGate } from '../dataSource/operationGate.js';
import { recoverStaleActiveImportJobsIfNeeded as recoverStaleActiveImportJobsIfNeededCore } from '../dataSource/runtimeLifecycle.js';
import { clearLocalDataSourcesAndMarketDataCore, removeLocalDataSourceCore } from '../dataSource/sourceMutations.js';
import { isLocalDataSourceEligibleForTraining } from '@zinuto/shared/localDataSourceEligibility';

import {
  beginSourceDeletionStmt,
  beginSourceSymbolMutationStmt,
  updateSourceSymbolMutationSummaryStmt,
  completeSourceSymbolMutationStmt,
  markSourceSymbolMutationFailedStmt,
  updateSourceTradingCalendarStmt,
  markAllSourcesDeletingIfIdleStmt,
  listSourcesStmt,
  listTrainingPoolCatalogStmt,
  getSourceBaseTimeframeByIdStmt,
  listAllFilePathsStmt,
  listImportedSymbolsBySourceStmt,
  listImportedSourceSymbolOrderRowsStmt,
  listLatestSourceFileLedgerRowsStmt,
  listAllImportedSourceInstrumentsStmt,
  deleteSourceDiagnosticsCacheStmt,
  deleteSourceSymbolDiagnosticsCacheBySourceStmt,
  listFilePathsBySourceStmt,
  countActiveJobsBySourceStmt,
  listActiveJobsDetailStmt,
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
  deleteLocalSourceFilesStmt,
  deleteLocalImportJobsStmt,
  deleteLocalSourcesStmt,
  deleteLocalInstrumentsStmt,
  deleteAllSourceDiagnosticsCacheStmt,
  deleteAllSourceSymbolDiagnosticsCacheStmt,
  deleteSourceFilesBySourceIdStmt,
  deleteSourceFilesBySourceSymbolStmt,
  deleteImportJobsBySourceIdStmt,
  deleteSourceByIdStmt,
  deleteInstrumentByIdStmt,
  countActiveJobsStmt,
  markActiveJobsAsInterrupted,
  invalidateLocalDataSourcesCache,
  localDataSourcesCacheStore,
  readDistinctFilePaths,
  readDistinctImportTempDirPaths,
  removeImportTempFilesByPath,
  removeImportTempDirsByPath,
  cleanupUntrackedImportUploadTempFiles,
  restoreSystemMarketSeedMetadataAfterLocalClear,
  scheduleLocalDataSourceDiagnosticsRebuild,
  hasImportJobControlState,
} from './sharedDependencies.js';
import { appError } from '../../kernel/appError.js';
import { nowIso } from '../../kernel/time.js';

const loadLocalDataSourcesFresh = async (): Promise<LocalDataSourceSummary[]> => {
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
  return items;
};

export type LocalDataSourceTrainingPoolCatalog = {
  id: string;
  name: string;
  baseTimeframe: '1m' | '5m' | '1h' | '1d';
  diagnosticAssetClass: string | null;
  diagnosticMarketPresetId: string | null;
  symbolCount: number;
  trainableSymbolCount: number;
};

/**
 * Free replay only needs the source catalog while the user is changing pools.
 * Do not materialize source files, diagnostics, or every imported instrument here.
 */
export const listLocalDataSourceTrainingPoolCatalog = (): LocalDataSourceTrainingPoolCatalog[] =>
  (
    listTrainingPoolCatalogStmt.all() as Array<{
      id: string;
      name: string;
      baseTimeframe: '1m' | '5m' | '1h' | '1d';
      diagnosticAssetClass: string | null;
      diagnosticMarketPresetId: string | null;
      status: string;
      deletionState: string | null;
      symbolCount: number;
      trainableSymbolCount: number;
    }>
  )
    .filter((source) =>
      isLocalDataSourceEligibleForTraining({
        status: source.status,
        deletionState: source.deletionState,
      }),
    )
    .map((source) => ({
      id: String(source.id ?? '').trim(),
      name: String(source.name ?? '').trim() || String(source.id ?? '').trim(),
      baseTimeframe: source.baseTimeframe,
      diagnosticAssetClass: String(source.diagnosticAssetClass ?? '').trim() || null,
      diagnosticMarketPresetId:
        String(source.diagnosticMarketPresetId ?? '').trim() || null,
      symbolCount: Math.max(0, Math.floor(Number(source.symbolCount) || 0)),
      trainableSymbolCount: Math.max(
        0,
        Math.floor(Number(source.trainableSymbolCount) || 0),
      ),
    }))
    .filter((source) => Boolean(source.id) && source.trainableSymbolCount > 0);

const {
  verifyLocalDataSourcesCleared,
  verifyLocalDataSourceRemoved,
  verifySourceSymbolsRemoved,
} = createSourceDestructiveVerification({
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
});

const assertLocalImportMutationAccess = createLocalImportOperationGate({
  listLocalDataSources: () => listLocalDataSources(),
  appError,
});

const recoverStaleActiveImportJobsIfNeeded = (): void => {
  recoverStaleActiveImportJobsIfNeededCore({
    listActiveJobs: () => listActiveJobsDetailStmt.all() as Array<{ id: string }>,
    hasImportJobControlState,
    markActiveJobsAsInterrupted
  });
};

const sourceAdminService = createSourceAdminService({
  listLocalDataSourcesCore,
  clearLocalDataSourcesAndMarketDataCore,
  removeLocalDataSourceCore,
  appError,
  nowIso,
  invalidateLocalDataSourcesCache,
  assertLocalImportOperationAccess: assertLocalImportMutationAccess,
  listLocalDataSourcesCached: loadLocalDataSourcesFresh,
  listLocalDataSourcesDeps: {
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
  },
  recoverStaleActiveImportJobsIfNeeded,
  clearLocalDataSourcesAndMarketDataDeps: {
    isSystemResetRunning: () => isResetAllStoredDataJobActiveState() || isSystemResetExecutionActive(),
    countActiveJobs: () => Number(countActiveJobsStmt.pluck().get() ?? 0),
    markAllSourcesDeleting: (updatedAt) => {
      const result = markAllSourcesDeletingIfIdleStmt.run(updatedAt);
      const sourceCount = Number(countLocalSourcesStmt.pluck().get() ?? 0);
      const acquired = result.changes > 0 || sourceCount === 0;
      if (acquired) {
        invalidateLocalDataSourcesCache();
      }
      return acquired;
    },
    listAllImportFilePaths: () => listAllFilePathsStmt.all() as Array<{ filePath: string | null }>,
    readDistinctFilePaths,
    readDistinctImportTempDirPaths,
    listLocalInstrumentIds: () =>
      (listLocalInstrumentsStmt.all() as Array<{ id: string }>)
        .map((item) => String(item.id ?? '').trim())
        .filter((item) => Boolean(item)),
    removeMarketInstrumentData,
    runDeleteAllSourcesTx: db.transaction(() => {
      deleteAllSourceSymbolDiagnosticsCacheStmt.run();
      deleteAllSourceDiagnosticsCacheStmt.run();
      const deletedSourceFiles = deleteLocalSourceFilesStmt.run().changes;
      const deletedImportJobs = deleteLocalImportJobsStmt.run().changes;
      const deletedSources = deleteLocalSourcesStmt.run().changes;
      const deletedInstruments = deleteLocalInstrumentsStmt.run().changes;
      return {
        deletedSourceFiles,
        deletedImportJobs,
        deletedSources,
        deletedInstruments
      };
    }),
    removeImportTempFilesByPath,
    removeImportTempDirsByPath,
    cleanupUntrackedImportUploadTempFiles,
    restoreSystemMarketSeedMetadataAfterLocalClear,
    reclaimEmptyMarketStorage: () => reclaimEmptyMarketStorage().catch(() => undefined),
    verifyLocalDataSourcesCleared,
    nowIso
  },
  removeLocalDataSourceDeps: {
    isSystemResetRunning: () => isResetAllStoredDataJobActiveState() || isSystemResetExecutionActive(),
    getSourceById: (sourceId: string) =>
      getSourceBaseTimeframeByIdStmt.get(sourceId) as
        | { id: string; baseTimeframe: '1m' | '5m' | '1h' | '1d' }
        | undefined,
    countActiveJobsBySource: (sourceId: string) => Number(countActiveJobsBySourceStmt.pluck().get(sourceId) ?? 0),
    markSourceDeleting: (sourceId: string, updatedAt: string) => {
      const acquired = beginSourceDeletionStmt.run(updatedAt, sourceId).changes === 1;
      if (acquired) {
        invalidateLocalDataSourcesCache();
      }
      return acquired;
    },
    listFilePathsBySource: (sourceId: string) => listFilePathsBySourceStmt.all(sourceId) as Array<{ filePath: string | null }>,
    readDistinctFilePaths,
    readDistinctImportTempDirPaths,
    listLocalInstrumentIdsBySource: (sourceId: string) =>
      (listLocalInstrumentIdsBySourceStmt.all(sourceId) as Array<{ id: string }>)
        .map((row) => String(row.id ?? '').trim())
        .filter((instrumentId) => Boolean(instrumentId)),
    removeMarketInstrumentData,
    runDeleteSourceTx: db.transaction((sourceId: string, removableInstrumentIds: string[]) => {
      deleteSourceDiagnosticsCacheStmt.run(sourceId);
      deleteSourceSymbolDiagnosticsCacheBySourceStmt.run(sourceId);
      const deletedSourceFiles = deleteSourceFilesBySourceIdStmt.run(sourceId).changes;
      const deletedImportJobs = deleteImportJobsBySourceIdStmt.run(sourceId).changes;
      const deletedSources = deleteSourceByIdStmt.run(sourceId).changes;
      let deletedInstruments = 0;
      removableInstrumentIds.forEach((instrumentId) => {
        deletedInstruments += deleteInstrumentByIdStmt.run(instrumentId).changes;
      });
      return {
        deletedSourceFiles,
        deletedImportJobs,
        deletedSources,
        deletedInstruments
      };
    }),
    removeImportTempFilesByPath,
    removeImportTempDirsByPath,
    cleanupUntrackedImportUploadTempFiles,
    reclaimEmptyMarketStorage: () => reclaimEmptyMarketStorage().catch(() => undefined),
    verifyLocalDataSourceRemoved,
    nowIso
  },
  removeSymbolsFromLocalDataSourceDeps: {
    isSystemResetRunning: () => isResetAllStoredDataJobActiveState() || isSystemResetExecutionActive(),
    getSourceById: (sourceId: string) =>
      getSourceBaseTimeframeByIdStmt.get(sourceId) as
        | { id: string; baseTimeframe: '1m' | '5m' | '1h' | '1d' }
        | undefined,
    countActiveJobsBySource: (sourceId: string) => Number(countActiveJobsBySourceStmt.pluck().get(sourceId) ?? 0),
    listImportedSymbolsBySource: (sourceId: string) =>
      listImportedSymbolsBySourceStmt.all(sourceId) as Array<{ symbol: string }>,
    getLocalInstrumentBySymbol: (sourceId: string, symbol: string, baseTimeframe: string) =>
      getLocalInstrumentBySymbolStmt.get(sourceId, symbol, baseTimeframe) as { id: string } | undefined,
    removeMarketInstrumentData,
    runDeleteSourceSymbolsTx: db.transaction(
      (normalizedSourceId: string, symbols: string[], instrumentIds: string[]) => {
        deleteSourceDiagnosticsCacheStmt.run(normalizedSourceId);
        deleteSourceSymbolDiagnosticsCacheBySourceStmt.run(normalizedSourceId);
        let deletedSourceFiles = 0;
        symbols.forEach((symbol) => {
          deletedSourceFiles += deleteSourceFilesBySourceSymbolStmt.run(normalizedSourceId, symbol).changes;
        });
        let deletedInstruments = 0;
        instrumentIds.forEach((instrumentId) => {
          deletedInstruments += deleteInstrumentByIdStmt.run(instrumentId).changes;
        });
        return {
          deletedSourceFiles,
          deletedInstruments
        };
      }
    ),
    reclaimEmptyMarketStorage: () => reclaimEmptyMarketStorage().catch(() => undefined),
    summarizeSourceBars,
    estimateSourceStorageBytesFromCurrentMarket,
    updateSourceSymbolMutationSummary: (
      totalFiles,
      importedFiles,
      symbolCount,
      barCount,
      storageBytes,
      startTs,
      endTs,
      updatedAt,
      sourceId
    ) => {
      return updateSourceSymbolMutationSummaryStmt.run(
        totalFiles,
        importedFiles,
        symbolCount,
        barCount,
        storageBytes,
        startTs,
        endTs,
        updatedAt,
        sourceId
      ).changes === 1;
    },
    beginSourceSymbolMutation: (updatedAt, sourceId) => {
      return beginSourceSymbolMutationStmt.run(updatedAt, sourceId).changes === 1;
    },
    completeSourceSymbolMutation: (updatedAt, sourceId) => {
      return completeSourceSymbolMutationStmt.run(updatedAt, sourceId).changes === 1;
    },
    markSourceSymbolMutationFailed: (updatedAt, sourceId) => {
      markSourceSymbolMutationFailedStmt.run(updatedAt, sourceId);
    },
    verifySourceSymbolsRemoved
  }
});

export const listLocalDataSources = async (): Promise<LocalDataSourceSummary[]> => {
  const authorizationSignature = 'local-data-v2';
  const cached = localDataSourcesCacheStore.getCached(authorizationSignature);
  if (cached) {
    return cached;
  }
  const items = await loadLocalDataSourcesFresh();
  localDataSourcesCacheStore.setCached(authorizationSignature, items);
  return items;
};

/** Read directly from the local runtime for admission checks that cannot use a UI cache. */
export const listLocalDataSourcesFresh = loadLocalDataSourcesFresh;

export const updateLocalDataSourceTradingCalendar =
  createLocalDataSourceTradingCalendarUpdateService({
    assertLocalImportMutationAccess,
    countActiveJobsBySource: (sourceId) =>
      Number(countActiveJobsBySourceStmt.pluck().get(sourceId) ?? 0),
    getSourceBaseTimeframe: (sourceId) =>
      getSourceBaseTimeframeByIdStmt.get(sourceId) as
        | DataSourceDiagnosticConfigRow
        | undefined,
    invalidateLocalDataSourcesCache,
    invalidateMarketReadCaches,
    listLocalDataSources,
    listLocalInstrumentIdsBySource: (sourceId) =>
      (listLocalInstrumentIdsBySourceStmt.all(sourceId) as Array<{ id?: string | null }>)
        .map((row) => String(row.id ?? '').trim())
        .filter((id) => Boolean(id)),
    listSystemSeedPoolIds: () =>
      listSystemSeedInstruments()
        .map((instrument) => String(instrument.poolId ?? '').trim())
        .filter((poolId) => Boolean(poolId)),
    nowIso,
    persistTradingCalendar: (sourceId, tradingCalendarJson, updatedAt) => {
      db.transaction(() => {
        updateSourceTradingCalendarStmt.run(tradingCalendarJson, updatedAt, sourceId);
        deleteSourceDiagnosticsCacheStmt.run(sourceId);
        deleteSourceSymbolDiagnosticsCacheBySourceStmt.run(sourceId);
      })();
    },
    scheduleLocalDataSourceDiagnosticsRebuild,
  });

export const clearLocalDataSourcesAndMarketData =
  sourceAdminService.clearLocalDataSourcesAndMarketData;

export const removeLocalDataSource = sourceAdminService.removeLocalDataSource;

export const removeSymbolsFromLocalDataSource =
  sourceAdminService.removeSymbolsFromLocalDataSource;
