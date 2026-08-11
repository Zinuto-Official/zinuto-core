// SPDX-License-Identifier: GPL-3.0-only

import { useShallowStableObject } from '@/workspaces/useShallowStableObject';
import type { DataConfigWorkspacePageProps } from '@/workspaces/data/DataConfigWorkspacePage';

type UseDataConfigWorkspacePagePropsArgs = {
  ui: DataConfigWorkspacePageProps['ui'];
  tt: DataConfigWorkspacePageProps['tt'];
  summary: {
    enabledPoolGroupCount: DataConfigWorkspacePageProps['enabledPoolGroupCount'];
    combinedEnabledPoolSymbols: DataConfigWorkspacePageProps['combinedEnabledPoolSymbols'];
    customSamplePoolsCount: DataConfigWorkspacePageProps['customSamplePoolsCount'];
    totalPoolGroupCount: DataConfigWorkspacePageProps['totalPoolGroupCount'];
    headerSymbolCount: DataConfigWorkspacePageProps['headerSymbolCount'];
    marketDataStorageBytes: DataConfigWorkspacePageProps['marketDataStorageBytes'];
    compactScriptLanguage: DataConfigWorkspacePageProps['compactScriptLanguage'];
  };
  progress: {
    isCsvImporting: DataConfigWorkspacePageProps['isCsvImporting'];
    isPreparingCsvImportPreview: DataConfigWorkspacePageProps['isPreparingCsvImportPreview'];
    isClearingLocalDataSources: DataConfigWorkspacePageProps['isClearingLocalDataSources'];
    isNativeImportDragActive: DataConfigWorkspacePageProps['isNativeImportDragActive'];
    deletingSamplePoolId: DataConfigWorkspacePageProps['deletingSamplePoolId'];
    preparingCsvImportPreviewPercent: DataConfigWorkspacePageProps['preparingCsvImportPreviewPercent'];
    preparingCsvImportPreviewProgress: DataConfigWorkspacePageProps['preparingCsvImportPreviewProgress'];
    clearingLocalDataSourcesProgressPercent: DataConfigWorkspacePageProps['clearingLocalDataSourcesProgressPercent'];
    deletingSamplePoolProgressPercent: DataConfigWorkspacePageProps['deletingSamplePoolProgressPercent'];
  };
  dataset: {
    csvImportCardViews: DataConfigWorkspacePageProps['csvImportCardViews'];
    csvImportCardControlAction: DataConfigWorkspacePageProps['csvImportCardControlAction'];
    poolSettingsRows: DataConfigWorkspacePageProps['poolSettingsRows'];
    dataSourceSyncMonitorStateById: DataConfigWorkspacePageProps['dataSourceSyncMonitorStateById'];
    dataSourceSyncPrefsById: DataConfigWorkspacePageProps['dataSourceSyncPrefsById'];
    editingSamplePoolId: DataConfigWorkspacePageProps['editingSamplePoolId'];
    editingSamplePoolName: DataConfigWorkspacePageProps['editingSamplePoolName'];
    pendingLocalDataSourceSyncPreview: DataConfigWorkspacePageProps['pendingLocalDataSourceSyncPreview'];
    preparingLocalDataSourceSyncPreview: DataConfigWorkspacePageProps['preparingLocalDataSourceSyncPreview'];
    removedSymbolsByPool: DataConfigWorkspacePageProps['removedSymbolsByPool'];
  };
  formatters: {
    formatMoney: DataConfigWorkspacePageProps['formatMoney'];
    formatStorageBytes: DataConfigWorkspacePageProps['formatStorageBytes'];
    withLabelValue: DataConfigWorkspacePageProps['withLabelValue'];
    getBaseTimeframeLabels: DataConfigWorkspacePageProps['getBaseTimeframeLabels'];
  };
  chart: {
    effectiveThemeMode: DataConfigWorkspacePageProps['effectiveThemeMode'];
    priceColorMode: DataConfigWorkspacePageProps['priceColorMode'];
    language: DataConfigWorkspacePageProps['language'];
    trainerDisplayPeriod: DataConfigWorkspacePageProps['trainerDisplayPeriod'];
    trainerPeriodOptionsByBase: DataConfigWorkspacePageProps['trainerPeriodOptionsByBase'];
    historyReplayChartBindings: DataConfigWorkspacePageProps['historyReplayChartBindings'];
  };
  actions: {
    onClearLocalPools: DataConfigWorkspacePageProps['onClearLocalPools'];
    openCsvFolderPickerAndPrepareImport: DataConfigWorkspacePageProps['openCsvFolderPickerAndPrepareImport'];
    openCsvFolderPathAndPrepareImport: DataConfigWorkspacePageProps['openCsvFolderPathAndPrepareImport'];
    controlCsvImportCardJob: DataConfigWorkspacePageProps['controlCsvImportCardJob'];
    fetchDetailSymbolBarsRange: DataConfigWorkspacePageProps['fetchDetailSymbolBarsRange'];
    fetchDetailSymbolDiagnostics: DataConfigWorkspacePageProps['fetchDetailSymbolDiagnostics'];
    startTrainingWithSymbol: DataConfigWorkspacePageProps['startTrainingWithSymbol'];
    dismissLocalDataSourceSyncPreview: DataConfigWorkspacePageProps['dismissLocalDataSourceSyncPreview'];
    selectLocalDataSourceSyncPreviewPlan: DataConfigWorkspacePageProps['selectLocalDataSourceSyncPreviewPlan'];
    confirmLocalDataSourceSyncPreview: DataConfigWorkspacePageProps['confirmLocalDataSourceSyncPreview'];
    syncSamplePoolWithSourceFolder: DataConfigWorkspacePageProps['syncSamplePoolWithSourceFolder'];
    removeSymbolsFromSamplePool: DataConfigWorkspacePageProps['removeSymbolsFromSamplePool'];
    updateDataSourceSyncPreference: DataConfigWorkspacePageProps['updateDataSourceSyncPreference'];
    runDataSourceSyncQuickCheckSweep: DataConfigWorkspacePageProps['runDataSourceSyncQuickCheckSweep'];
    refreshLocalDataSources: DataConfigWorkspacePageProps['refreshLocalDataSources'];
    setEditingSamplePoolName: DataConfigWorkspacePageProps['setEditingSamplePoolName'];
    saveRenameSamplePool: DataConfigWorkspacePageProps['saveRenameSamplePool'];
    cancelRenameSamplePool: DataConfigWorkspacePageProps['cancelRenameSamplePool'];
    startRenameSamplePool: DataConfigWorkspacePageProps['startRenameSamplePool'];
    moveCustomPoolWithinTimeframe: DataConfigWorkspacePageProps['moveCustomPoolWithinTimeframe'];
    removeCustomPool: DataConfigWorkspacePageProps['removeCustomPool'];
    portableRebindTargetSourceIds: DataConfigWorkspacePageProps['portableRebindTargetSourceIds'];
    openDeviceTransferSettings: DataConfigWorkspacePageProps['openDeviceTransferSettings'];
    setRemovedSymbolsByPool: DataConfigWorkspacePageProps['setRemovedSymbolsByPool'];
  };
};

export const useDataConfigWorkspacePageProps = ({
  ui,
  tt,
  summary,
  progress,
  dataset,
  formatters,
  chart,
  actions
}: UseDataConfigWorkspacePagePropsArgs): DataConfigWorkspacePageProps =>
  useShallowStableObject({
    ui,
    tt,
    enabledPoolGroupCount: summary.enabledPoolGroupCount,
    combinedEnabledPoolSymbols: summary.combinedEnabledPoolSymbols,
    isCsvImporting: progress.isCsvImporting,
    isPreparingCsvImportPreview: progress.isPreparingCsvImportPreview,
    isClearingLocalDataSources: progress.isClearingLocalDataSources,
    isNativeImportDragActive: progress.isNativeImportDragActive,
    deletingSamplePoolId: progress.deletingSamplePoolId,
    preparingCsvImportPreviewPercent: progress.preparingCsvImportPreviewPercent,
    preparingCsvImportPreviewProgress: progress.preparingCsvImportPreviewProgress,
    clearingLocalDataSourcesProgressPercent: progress.clearingLocalDataSourcesProgressPercent,
    deletingSamplePoolProgressPercent: progress.deletingSamplePoolProgressPercent,
    csvImportCardViews: dataset.csvImportCardViews,
    csvImportCardControlAction: dataset.csvImportCardControlAction,
    poolSettingsRows: dataset.poolSettingsRows,
    dataSourceSyncMonitorStateById: dataset.dataSourceSyncMonitorStateById,
    dataSourceSyncPrefsById: dataset.dataSourceSyncPrefsById,
    customSamplePoolsCount: summary.customSamplePoolsCount,
    editingSamplePoolId: dataset.editingSamplePoolId,
    editingSamplePoolName: dataset.editingSamplePoolName,
    pendingLocalDataSourceSyncPreview: dataset.pendingLocalDataSourceSyncPreview,
    preparingLocalDataSourceSyncPreview: dataset.preparingLocalDataSourceSyncPreview,
    removedSymbolsByPool: dataset.removedSymbolsByPool,
    totalPoolGroupCount: summary.totalPoolGroupCount,
    headerSymbolCount: summary.headerSymbolCount,
    marketDataStorageBytes: summary.marketDataStorageBytes,
    compactScriptLanguage: summary.compactScriptLanguage,
    formatMoney: formatters.formatMoney,
    formatStorageBytes: formatters.formatStorageBytes,
    withLabelValue: formatters.withLabelValue,
    getBaseTimeframeLabels: formatters.getBaseTimeframeLabels,
    effectiveThemeMode: chart.effectiveThemeMode,
    priceColorMode: chart.priceColorMode,
    language: chart.language,
    trainerDisplayPeriod: chart.trainerDisplayPeriod,
    trainerPeriodOptionsByBase: chart.trainerPeriodOptionsByBase,
    historyReplayChartBindings: chart.historyReplayChartBindings,
    onClearLocalPools: actions.onClearLocalPools,
    openCsvFolderPickerAndPrepareImport: actions.openCsvFolderPickerAndPrepareImport,
    openCsvFolderPathAndPrepareImport: actions.openCsvFolderPathAndPrepareImport,
    controlCsvImportCardJob: actions.controlCsvImportCardJob,
    fetchDetailSymbolBarsRange: actions.fetchDetailSymbolBarsRange,
    fetchDetailSymbolDiagnostics: actions.fetchDetailSymbolDiagnostics,
    startTrainingWithSymbol: actions.startTrainingWithSymbol,
    dismissLocalDataSourceSyncPreview: actions.dismissLocalDataSourceSyncPreview,
    selectLocalDataSourceSyncPreviewPlan: actions.selectLocalDataSourceSyncPreviewPlan,
    confirmLocalDataSourceSyncPreview: actions.confirmLocalDataSourceSyncPreview,
    syncSamplePoolWithSourceFolder: actions.syncSamplePoolWithSourceFolder,
    removeSymbolsFromSamplePool: actions.removeSymbolsFromSamplePool,
    updateDataSourceSyncPreference: actions.updateDataSourceSyncPreference,
    runDataSourceSyncQuickCheckSweep: actions.runDataSourceSyncQuickCheckSweep,
    refreshLocalDataSources: actions.refreshLocalDataSources,
    setEditingSamplePoolName: actions.setEditingSamplePoolName,
    saveRenameSamplePool: actions.saveRenameSamplePool,
    cancelRenameSamplePool: actions.cancelRenameSamplePool,
    startRenameSamplePool: actions.startRenameSamplePool,
    moveCustomPoolWithinTimeframe: actions.moveCustomPoolWithinTimeframe,
    removeCustomPool: actions.removeCustomPool,
    portableRebindTargetSourceIds: actions.portableRebindTargetSourceIds,
    openDeviceTransferSettings: actions.openDeviceTransferSettings,
    setRemovedSymbolsByPool: actions.setRemovedSymbolsByPool
  });
