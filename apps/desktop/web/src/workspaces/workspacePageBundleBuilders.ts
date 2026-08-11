// SPDX-License-Identifier: GPL-3.0-only

import type { UseWorkspacePagePropsBundleParams } from '@/workspaces/useWorkspacePagePropsBundle';

type TrainerBundle = UseWorkspacePagePropsBundleParams['trainer'];
type HistoryBundle = UseWorkspacePagePropsBundleParams['history'];
type NotesBundle = UseWorkspacePagePropsBundleParams['notes'];
type DataConfigBundle = UseWorkspacePagePropsBundleParams['dataConfig'];
type SystemSettingsBundle = UseWorkspacePagePropsBundleParams['systemSettings'];

export type BuildTrainerWorkspaceBundleArgs = {
  layout: TrainerBundle['layout'];
  ui: TrainerBundle['ui'];
  freeReplaySetup: TrainerBundle['freeReplaySetup'];
  tradingAssetUi: TrainerBundle['tradingAssetUi'];
  tradeLogBaseTimeframe: TrainerBundle['tradeLogBaseTimeframe'];
  tradeLogTimeZone: TrainerBundle['tradeLogTimeZone'];
  tradingPresetEditor: TrainerBundle['tradingPresetEditor'];
  tt: TrainerBundle['tt'];
  ttf: TrainerBundle['ttf'];
  trainerHydrationState: TrainerBundle['trainerHydrationState'];
} & TrainerBundle['status'] &
  TrainerBundle['summary'] &
  TrainerBundle['order'] &
  TrainerBundle['tradeLog'] &
  TrainerBundle['formatters'] &
  TrainerBundle['actions'];

export const buildTrainerWorkspaceBundleInput = ({
  layout,
  ui,
  freeReplaySetup,
  tradingAssetUi,
  tradeLogBaseTimeframe,
  tradeLogTimeZone,
  tradingPresetEditor,
  tt,
  ttf,
  trainerHydrationState,
  isBusy,
  isPreparingAction,
  trainingDays,
  trainingKlineCount,
  trainingKlineSourceProgressLine,
  hasTrainingKlineProgressWarning,
  calendarSpanText,
  replaySpanText,
  securitiesTotal,
  securitiesDelta,
  positionMarketValue,
  securitiesAccount,
  currentPosition,
  currentTradingFee,
  floatingRate,
  cumulativePnlRate,
  currentLeverageSummary,
  tradeCapacity,
  trainingDateRange,
  buyTradeInputMode,
  buyLotInput,
  buyAmountInput,
  buyRatioInput,
  buyRatioPresetOptions,
  buyEstimate,
  sellEstimate,
  buyPriceMode,
  buyOrderDisabled,
  buyBlockReason,
  sellOrderDisabled,
  sellBlockReason,
  nextOpenUnavailable,
  canUndo,
  undoAvailableSteps,
  undoMaxSteps,
  lastUndoableAction,
  tradeLogRows,
  tradeLogSideStats,
  formatMoney,
  formatRatio,
  formatSignedMoney,
  formatTradingQuantityText,
  formatTradeLogQuantityText,
  withCountUnit,
  withBuySellCount,
  pnlClass,
  normalizeInput,
  setBuyTradeInputMode,
  setBuyLotInput,
  setBuyAmountInput,
  setBuyRatioInput,
  setBuyPriceMode,
  stepNext,
  isStepNextDisabled,
  undo,
  placeOrder,
  openResetAllDialog
}: BuildTrainerWorkspaceBundleArgs): TrainerBundle => ({
  layout,
  ui,
  freeReplaySetup,
  tradingAssetUi,
  tradeLogBaseTimeframe,
  tradeLogTimeZone,
  tradingPresetEditor,
  tt,
  ttf,
  trainerHydrationState,
  status: {
    isBusy,
    isPreparingAction
  },
  summary: {
    trainingDays,
    trainingKlineCount,
    trainingKlineSourceProgressLine,
    hasTrainingKlineProgressWarning,
    calendarSpanText,
    replaySpanText,
    securitiesTotal,
    securitiesDelta,
    positionMarketValue,
    securitiesAccount,
    currentPosition,
    currentTradingFee,
    floatingRate,
    cumulativePnlRate,
    currentLeverageSummary,
    tradeCapacity,
    trainingDateRange
  },
  order: {
    buyTradeInputMode,
    buyLotInput,
    buyAmountInput,
    buyRatioInput,
    buyRatioPresetOptions,
    buyEstimate,
    sellEstimate,
    buyPriceMode,
    buyOrderDisabled,
    buyBlockReason,
    sellOrderDisabled,
    sellBlockReason,
    nextOpenUnavailable,
    canUndo,
    undoAvailableSteps,
    undoMaxSteps,
    lastUndoableAction
  },
  tradeLog: {
    tradeLogRows,
    tradeLogSideStats
  },
  formatters: {
    formatMoney,
    formatRatio,
    formatSignedMoney,
    formatTradingQuantityText,
    formatTradeLogQuantityText,
    withCountUnit,
    withBuySellCount,
    pnlClass,
    normalizeInput
  },
  actions: {
    setBuyTradeInputMode,
    setBuyLotInput,
    setBuyAmountInput,
    setBuyRatioInput,
    setBuyPriceMode,
    stepNext,
    isStepNextDisabled,
    undo,
    placeOrder,
    openResetAllDialog
  }
});

export type BuildHistoryWorkspaceBundleArgs = {
  tt: HistoryBundle['tt'];
  compactScriptLanguage: HistoryBundle['compactScriptLanguage'];
} & HistoryBundle['filters'] &
  HistoryBundle['dataset'] &
  HistoryBundle['loading'] &
  HistoryBundle['editing'] &
  HistoryBundle['chart'] &
  HistoryBundle['actions'] &
  HistoryBundle['formatters'];

export const buildHistoryWorkspaceBundleInput = ({
  tt,
  compactScriptLanguage,
  historyListCompact,
  historyKeyword,
  historyProfitFilter,
  historySamplePoolFilterSelectValue,
  samplePoolAllId,
  historyPoolFilterOptions,
  trainingProjects,
  selectedHistoryCompactStats,
  historyVisibleProjects,
  selectedHistoryProjectId,
  selectedHistoryProjectReplayNoteCount,
  selectedHistoryProject,
  historyProjectsNextCursor,
  replayNotesNextCursor,
  isHistoryProjectsLoading,
  isHistoryProjectsLoadingMore,
  isReplayNotesLoading,
  isReplayNotesLoadingMore,
  editingProjectId,
  editingProjectName,
  effectiveThemeMode,
  showGlobalDecimals,
  priceColorMode,
  tradeColorTheme,
  chartRenderMode,
  language,
  trainerDisplayPeriod,
  trainerPeriodOptionsByBase,
  historyReplayChartBindings,
  showChartSettingsModal,
  setTrainerDisplayPeriod,
  setChartRenderMode,
  createSystemMarkers,
  createHistoryReviewReplayNote,
  setHistoryKeyword,
  setHistoryProfitFilter,
  setHistorySamplePoolFilter,
  clearAllTrainingProjects,
  setHistoryListCompact,
  setSelectedHistoryProjectId,
  startRenameTrainingProject,
  deleteTrainingProject,
  deleteTrainingProjects,
  saveRenameTrainingProject,
  cancelRenameTrainingProject,
  setEditingProjectName,
  loadMoreTrainingProjects,
  loadMoreReplayNotes,
  setShowChartSettingsModal,
  formatMoney,
  formatRatio,
  formatSignedMoney,
  withCountUnit,
  withBuySellCount,
  changeClass,
  reverseChangeClass,
  pnlClass,
  formatReplayNoteTime
}: BuildHistoryWorkspaceBundleArgs): HistoryBundle => ({
  tt,
  compactScriptLanguage,
  filters: {
    historyListCompact,
    historyKeyword,
    historyProfitFilter,
    historySamplePoolFilterSelectValue,
    samplePoolAllId,
    historyPoolFilterOptions
  },
  dataset: {
    trainingProjects,
    selectedHistoryCompactStats,
    historyVisibleProjects,
    selectedHistoryProjectId,
    selectedHistoryProjectReplayNoteCount,
    selectedHistoryProject,
    historyProjectsNextCursor,
    replayNotesNextCursor
  },
  loading: {
    isHistoryProjectsLoading,
    isHistoryProjectsLoadingMore,
    isReplayNotesLoading,
    isReplayNotesLoadingMore
  },
  editing: {
    editingProjectId,
    editingProjectName
  },
  chart: {
    effectiveThemeMode,
    showGlobalDecimals,
    priceColorMode,
    tradeColorTheme,
    chartRenderMode,
    language,
    trainerDisplayPeriod,
    trainerPeriodOptionsByBase,
    historyReplayChartBindings,
    showChartSettingsModal,
    createSystemMarkers,
    createHistoryReviewReplayNote
  },
  actions: {
    setHistoryKeyword,
    setHistoryProfitFilter,
    setHistorySamplePoolFilter,
    clearAllTrainingProjects,
    setHistoryListCompact,
    setSelectedHistoryProjectId,
    startRenameTrainingProject,
    deleteTrainingProject,
    deleteTrainingProjects,
    saveRenameTrainingProject,
    cancelRenameTrainingProject,
    setEditingProjectName,
    loadMoreTrainingProjects,
    loadMoreReplayNotes,
    setShowChartSettingsModal,
    setTrainerDisplayPeriod,
    setChartRenderMode
  },
  formatters: {
    formatMoney,
    formatRatio,
    formatSignedMoney,
    withCountUnit,
    withBuySellCount,
    changeClass,
    reverseChangeClass,
    pnlClass,
    formatReplayNoteTime
  }
});

export type BuildNotesWorkspaceBundleArgs = NotesBundle;

export const buildNotesWorkspaceBundleInput = (
  args: BuildNotesWorkspaceBundleArgs,
): NotesBundle => args;

export type BuildDataConfigWorkspaceBundleArgs = {
  ui: DataConfigBundle['ui'];
  tt: DataConfigBundle['tt'];
} & DataConfigBundle['summary'] &
  DataConfigBundle['progress'] &
  DataConfigBundle['dataset'] &
  DataConfigBundle['formatters'] &
  DataConfigBundle['chart'] &
  DataConfigBundle['actions'];

export const buildDataConfigWorkspaceBundleInput = ({
  ui,
  tt,
  enabledPoolGroupCount,
  combinedEnabledPoolSymbols,
  customSamplePoolsCount,
  totalPoolGroupCount,
  headerSymbolCount,
  marketDataStorageBytes,
  compactScriptLanguage,
  isCsvImporting,
  isPreparingCsvImportPreview,
  isClearingLocalDataSources,
  isNativeImportDragActive,
  deletingSamplePoolId,
  preparingCsvImportPreviewPercent,
  preparingCsvImportPreviewProgress,
  clearingLocalDataSourcesProgressPercent,
  deletingSamplePoolProgressPercent,
  csvImportCardViews,
  csvImportCardControlAction,
  poolSettingsRows,
  dataSourceSyncMonitorStateById,
  dataSourceSyncPrefsById,
  editingSamplePoolId,
  editingSamplePoolName,
  pendingLocalDataSourceSyncPreview,
  preparingLocalDataSourceSyncPreview,
  removedSymbolsByPool,
  formatMoney,
  formatStorageBytes,
  withLabelValue,
  getBaseTimeframeLabels,
  effectiveThemeMode,
  priceColorMode,
  language,
  trainerDisplayPeriod,
  trainerPeriodOptionsByBase,
  historyReplayChartBindings,
  onClearLocalPools,
  openCsvFolderPickerAndPrepareImport,
  openCsvFolderPathAndPrepareImport,
  controlCsvImportCardJob,
  fetchDetailSymbolBarsRange,
  fetchDetailSymbolDiagnostics,
  startTrainingWithSymbol,
  dismissLocalDataSourceSyncPreview,
  selectLocalDataSourceSyncPreviewPlan,
  confirmLocalDataSourceSyncPreview,
  syncSamplePoolWithSourceFolder,
  removeSymbolsFromSamplePool,
  updateDataSourceSyncPreference,
  runDataSourceSyncQuickCheckSweep,
  refreshLocalDataSources,
  setEditingSamplePoolName,
  saveRenameSamplePool,
  cancelRenameSamplePool,
  startRenameSamplePool,
  moveCustomPoolWithinTimeframe,
  removeCustomPool,
  portableRebindTargetSourceIds,
  openDeviceTransferSettings,
  setRemovedSymbolsByPool
}: BuildDataConfigWorkspaceBundleArgs): DataConfigBundle => ({
  ui,
  tt,
  summary: {
    enabledPoolGroupCount,
    combinedEnabledPoolSymbols,
    customSamplePoolsCount,
    totalPoolGroupCount,
    headerSymbolCount,
    marketDataStorageBytes,
    compactScriptLanguage
  },
  progress: {
    isCsvImporting,
    isPreparingCsvImportPreview,
    isClearingLocalDataSources,
    isNativeImportDragActive,
    deletingSamplePoolId,
    preparingCsvImportPreviewPercent,
    preparingCsvImportPreviewProgress,
    clearingLocalDataSourcesProgressPercent,
    deletingSamplePoolProgressPercent
  },
  dataset: {
    csvImportCardViews,
    csvImportCardControlAction,
    poolSettingsRows,
    dataSourceSyncMonitorStateById,
    dataSourceSyncPrefsById,
    editingSamplePoolId,
    editingSamplePoolName,
    pendingLocalDataSourceSyncPreview,
    preparingLocalDataSourceSyncPreview,
    removedSymbolsByPool
  },
  formatters: {
    formatMoney,
    formatStorageBytes,
    withLabelValue,
    getBaseTimeframeLabels
  },
  chart: {
    effectiveThemeMode,
    priceColorMode,
    language,
    trainerDisplayPeriod,
    trainerPeriodOptionsByBase,
    historyReplayChartBindings
  },
  actions: {
    onClearLocalPools,
    openCsvFolderPickerAndPrepareImport,
    openCsvFolderPathAndPrepareImport,
    controlCsvImportCardJob,
    fetchDetailSymbolBarsRange,
    fetchDetailSymbolDiagnostics,
    startTrainingWithSymbol,
    dismissLocalDataSourceSyncPreview,
    selectLocalDataSourceSyncPreviewPlan,
    confirmLocalDataSourceSyncPreview,
    syncSamplePoolWithSourceFolder,
    removeSymbolsFromSamplePool,
    updateDataSourceSyncPreference,
    runDataSourceSyncQuickCheckSweep,
    refreshLocalDataSources,
    setEditingSamplePoolName,
    saveRenameSamplePool,
    cancelRenameSamplePool,
    startRenameSamplePool,
    moveCustomPoolWithinTimeframe,
    removeCustomPool,
    portableRebindTargetSourceIds,
    openDeviceTransferSettings,
    setRemovedSymbolsByPool
  }
});

export type BuildSystemSettingsWorkspaceBundleArgs = {
  isActive?: SystemSettingsBundle['isActive'];
  requestedTab?: SystemSettingsBundle['requestedTab'];
  requestedTabRequestId?: SystemSettingsBundle['requestedTabRequestId'];
  tt: SystemSettingsBundle['tt'];
  ui: SystemSettingsBundle['ui'];
  devSimulationInput: SystemSettingsBundle['devSimulationInput'];
} & SystemSettingsBundle['labels'] &
  SystemSettingsBundle['values'] &
  SystemSettingsBundle['status'] &
  SystemSettingsBundle['storage'] &
  SystemSettingsBundle['options'] &
  SystemSettingsBundle['actions'] &
  SystemSettingsBundle['formatters'];

export const buildSystemSettingsWorkspaceBundleInput = ({
  isActive,
  requestedTab,
  requestedTabRequestId,
  tt,
  ui,
  activeLanguageLabel,
  activeFontSizeLabel,
  activeThemeLabel,
  language,
  fontSizePreset,
  themeMode,
  desktopCloseButtonAction,
  priceColorMode,
  tradeColorTheme,
  showGlobalDecimals,
  developerModeEnabled,
  isSystemStorageUsageLoading,
  isBusy,
  isPreparingAction,
  isGlobalResetProgressVisible,
  globalResetProgressLabel,
  globalResetProgressPercent,
  storageUsageTotalText,
  storageUsageRows,
  globalResetStorageTotalText,
  isGlobalResetStorageSummaryReady,
  globalResetStorageRows,
  globalResetAffectedPoolCount,
  globalResetAffectedSymbolCount,
  languageOptions,
  fontSizePresetOptions,
  setCurrentUiLanguage,
  setLanguage,
  setFontSizePreset,
  setThemeMode,
  setDesktopCloseButtonAction,
  setPriceColorMode,
  setTradeColorTheme,
  setShowGlobalDecimals,
  refreshSystemStorageUsage,
  onHistoryRetentionApplied,
  onRequestGlobalReset,
  onEnableDeveloperMode,
  openDataWorkspaceForPortableRebind,
  withLabelValue,
  formatStorageBytes,
  devSimulationInput
}: BuildSystemSettingsWorkspaceBundleArgs): SystemSettingsBundle => ({
  isActive,
  requestedTab,
  requestedTabRequestId,
  tt,
  ui,
  labels: {
    activeLanguageLabel,
    activeFontSizeLabel,
    activeThemeLabel
  },
  values: {
    language,
    fontSizePreset,
    themeMode,
    desktopCloseButtonAction,
    priceColorMode,
    tradeColorTheme,
    showGlobalDecimals,
    developerModeEnabled
  },
  status: {
    isSystemStorageUsageLoading,
    isBusy,
    isPreparingAction,
    isGlobalResetProgressVisible,
    globalResetProgressLabel,
    globalResetProgressPercent
  },
  storage: {
    storageUsageTotalText,
    storageUsageRows,
    globalResetStorageTotalText,
    isGlobalResetStorageSummaryReady,
    globalResetStorageRows,
    globalResetAffectedPoolCount,
    globalResetAffectedSymbolCount
  },
  options: {
    languageOptions,
    fontSizePresetOptions
  },
  actions: {
    setCurrentUiLanguage,
    setLanguage,
    setFontSizePreset,
    setThemeMode,
    setDesktopCloseButtonAction,
    setPriceColorMode,
    setTradeColorTheme,
    setShowGlobalDecimals,
    refreshSystemStorageUsage,
    onHistoryRetentionApplied,
    onRequestGlobalReset,
    onEnableDeveloperMode,
    openDataWorkspaceForPortableRebind
  },
  formatters: {
    withLabelValue,
    formatStorageBytes
  },
  devSimulationInput
});
