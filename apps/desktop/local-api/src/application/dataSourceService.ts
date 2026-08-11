// SPDX-License-Identifier: GPL-3.0-only

/**
 * Barrel file — re-exports the data source service API from dataSourceService/.
 * Split from the original monolith for maintainability.
 */
export {
  acquireSourceDiagnosticsQuiesceLease,
  startDataSourceRuntime,
  stopDataSourceRuntime,
  stopSourceDiagnosticsRuntime,
  recoverInterruptedSourceSymbolMutations,
  invalidateLocalDataSourceAccessCache,
  ensureLocalDataSourceDiagnosticsCache,
  getLocalDataSourceDiagnostics,
  getLocalDataSourceSymbolDiagnostics,
  updateLocalDataSourceDiagnosticProfile,
  invalidateSourceDiagnosticsRuntimeCaches,
} from './dataSourceService/runtimeAndDiagnostics.js';

export {
  previewLocalDataImportFolder,
  startLocalDataImportPreviewJob,
  getLocalDataImportPreviewJob,
  getActiveLocalDataImportPreviewExecutionCount,
  hasActiveLocalDataImportPreviewExecutions,
  stopLocalDataImportPreviewJobs,
  discardLocalDataImportPreview,
  validateLocalDataImportDraft,
  startLocalDataImportJobFromPreviewPlan,
  startLocalDataFullReimportJobFromPreviewPlan,
  startLocalDataIncrementalUpdateJobFromPreviewPlan,
  previewLocalDataSourceSync,
  quickCheckLocalDataSourceSync,
} from './dataSourceService/previewAndPlanning.js';

export {
  startLocalDataImportJob,
  getLocalDataImportJob,
  controlLocalDataImportJob,
  stopLocalDataImportJobQueue,
} from './dataSourceService/importJobControl.js';

export {
  listLocalDataSources,
  listLocalDataSourcesFresh,
  listLocalDataSourceTrainingPoolCatalog,
  updateLocalDataSourceTradingCalendar,
  clearLocalDataSourcesAndMarketData,
  removeLocalDataSource,
  removeSymbolsFromLocalDataSource,
} from './dataSourceService/dataSourceManagement.js';
