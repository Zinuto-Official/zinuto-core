// SPDX-License-Identifier: GPL-3.0-only

import type { PriceMode as OrderPriceMode } from "@zinuto/shared/trading";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  api,
} from "@/api";
import { formatMoney } from "@/ui/formatting/format";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import { useAppCsvImportActions } from "@/app-shell/useAppCsvImportActions";
import { usePendingCsvImportPlanning } from "@/app-shell/usePendingCsvImportPlanning";
import {
  buildCsvImportTimeZoneConfirmationKey,
  type CsvPoolNamingStrategy,
} from "@/app-shell/appCsvImportContracts";
import { useAppDataSourceMaintenanceActions } from "@/app-shell/useAppDataSourceMaintenanceActions";
import { useDestructiveDataChangeFinalizer } from "@/app-shell/useDestructiveDataChangeFinalizer";
import { useDataSourceSyncMonitorController } from "@/app-shell/useDataSourceSyncMonitorController";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import { formatStorageBytes, getBaseTimeframeLabels } from "@/frontend-kernel/uiOptions";
import {
  waitForNextAnimationFrame,
} from "@/frontend-kernel/runtimeConstants";
import { resolveUnknownErrorMessage, resolveLocalDataImportJobErrorMessage } from "@/frontend-kernel/errors/appErrorUtils";
import { sanitizeSamplePoolName } from "@/app-shell/appSamplePools";
import {
  resolveImportBatchWorkerCount,
} from "@/app-shell/appRootDataConfigUtils";
import { useCsvImportController } from "@/domains/data-import/useCsvImportController";
import { useCsvImportWorkflow } from "@/domains/data-import/useCsvImportWorkflow";
import { resolveImportPreviewPoolGroups } from "@/domains/data-import/importPreviewPools";
import {
  normalizePendingImportScopeStrategy,
  resolveAvailableImportScopeStrategies,
} from "@/app-shell/importScopeStrategy";
import { isTradingSettingsPayloadChanged, parseTradingSettingsDraft } from "@/domains/trainer/tradingSettingsFormDomain";
import {
  formatMessage,
} from "@zinuto/shared/i18n";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import type { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useCsvImportController> & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & ReturnType<typeof useRuntimeTrainerChartOrchestration> & ReturnType<typeof useRuntimeFreeReplaySetup> & ReturnType<typeof useRuntimeFreeReplayExecution> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeTradingSettingsAndImport = (scope: RuntimeHookScope) => {
  const { activePage, activeSamplePoolId, allowLongMarginTrading, allowShortSelling, appIsMountedRef, applyResolvedTradingSettingsToForm, beginCsvImportPreviewProgress, clearCsvImportCardState, clearingLocalDataSourcesProgressPercentRef, commissionMinimumFeeInput, commissionRateInput, contractMultiplierInput, csvImportCardControlAction, csvImportCardStates, customSamplePools, dataSourceSyncPrefsById, deletingSamplePoolId, finishCsvImportPreviewProgress, freeReplayEndSettlementMode, fundingRateInput, initialSecuritiesInput, isBusy, isClearingLocalDataSources, isCsvImporting, isPreparingCsvImportPreview, isSavingTradingSettings, language, lastCsvImportFolderOpenRef, loadSymbol, localDataSourceSummaries, longFinancingAnnualRateInput, longInitialMarginRatioInput, longMaintenanceMarginRatioInput, makerFeeRateInput, markCsvImportBatchFinished, markCsvImportBatchStarted, markCsvImportPreviewReady, minTradeStepInput, patchCsvImportCardState, pendingCsvFieldMapping, pendingCsvFolderImport, pendingCsvImportTimeZone, pendingCsvImportTimeZoneMode, pendingCsvPlanOverrides, pendingCsvPoolNamingStrategy, platformFeeMinimumFeeInput, platformFeeRateInput, positionCostMode, refreshInstruments, refreshLatestResumableTrainerSession, refreshSystemStorageUsage, refreshTradingSettings, regulatoryFeeRateInput, resetTrainerToPrepView, resolveSamplePoolDisplayName, resolveSourceFolderBookmarkIdBySourceId, sessionId, setActionDialog, setActivePage, setActiveSamplePoolId, setClearingLocalDataSourcesProgressPercent, setClearingLocalDataSourcesProgressTargetPercent, setCsvImportCardControlAction, setCsvImportCardStates, setCurrentTrainingBaseTimeframe, setCurrentTrainingPoolMeta, setCustomSamplePools, setDataConfigPoolOrderByBase, setDataPoolRemovedSymbolsBySourceId, setEditingSamplePoolId, setEditingSamplePoolName, setError, setHiddenBuiltInTradingMarketPresetIds, setHint, setHistorySamplePoolFilter, setIncludeSystemDefaultPool, setIsAutoplay, setIsBusy, setIsClearingLocalDataSources, setIsSavingTradingSettings, setLocalDataSourceSummaries, setLotSizeByPool, setOrderEndPrompt, setPendingCsvFieldMapping, setPendingCsvFolderImport, setPendingCsvImportTimeZone, setPendingCsvImportTimeZoneMode, setPendingCsvPlanOverrides, setPendingCsvPoolNamingStrategy, setReplayUnavailableMessage, setShowChartSettingsModal, setSnapshot, setSystemPoolNameOverrides, setSystemPoolTradingBindingById, setTradingMarketPresetCustomTemplates, setTradingMarketPresetValuesByKey, setTradingSettings, shortBorrowAnnualRateInput, shortInitialMarginRatioInput, shortMaintenanceMarginRatioInput, slippageRateInput, snapshot, stampDutyMode, stampDutyRateInput, syncActiveTrainingRuntime, syncCustomSamplePoolsFromDataSources, takerFeeRateInput, tradeAmountIncludesFees, tradeSettlementMode, tradingAssetClass, tradingMarketPresetKey, tradingSettings, transactionLevyMinimumFeeInput, transactionLevyRateInput, transferFeeRateInput, tt, ttf } = scope;
  const {
    updateCsvImportPreviewProgress,
    pendingCsvImportTimeZoneConfirmationKey,
    setPendingCsvImportTimeZoneConfirmationKey,
  } = scope;
  const pendingCsvImportTimeZoneConfirmed =
    buildCsvImportTimeZoneConfirmationKey(
      pendingCsvFolderImport?.previewToken,
      pendingCsvImportTimeZone,
    ) === pendingCsvImportTimeZoneConfirmationKey;
  const tradingSettingsDraftParseResult = useMemo(
    () =>
      parseTradingSettingsDraft({
        initialSecuritiesInput,
        assetClass: tradingAssetClass,
        marketPresetId: tradingMarketPresetKey,
        minTradeStepInput,
        commissionRateInput,
        makerFeeRateInput,
        takerFeeRateInput,
        fundingRateInput,
        contractMultiplierInput,
        transferFeeRateInput,
        regulatoryFeeRateInput,
        platformFeeRateInput,
        transactionLevyRateInput,
        slippageRateInput,
        stampDutyRateInput,
        commissionMinimumFeeInput,
        platformFeeMinimumFeeInput,
        transactionLevyMinimumFeeInput,
        longFinancingAnnualRateInput,
        longInitialMarginRatioInput,
        longMaintenanceMarginRatioInput,
        shortBorrowAnnualRateInput,
        shortInitialMarginRatioInput,
        shortMaintenanceMarginRatioInput,
        stampDutyMode,
        positionCostMode,
        tradeSettlementMode,
        freeReplayEndSettlementMode,
        tradeAmountIncludesFees,
        allowLongMarginTrading,
        allowShortSelling,
      }),
    [
      contractMultiplierInput,
      commissionRateInput,
      commissionMinimumFeeInput,
      freeReplayEndSettlementMode,
      fundingRateInput,
      initialSecuritiesInput,
      longFinancingAnnualRateInput,
      longInitialMarginRatioInput,
      longMaintenanceMarginRatioInput,
      makerFeeRateInput,
      minTradeStepInput,
      platformFeeMinimumFeeInput,
      platformFeeRateInput,
      positionCostMode,
      regulatoryFeeRateInput,
      slippageRateInput,
      shortInitialMarginRatioInput,
      shortMaintenanceMarginRatioInput,
      stampDutyMode,
      stampDutyRateInput,
      transactionLevyMinimumFeeInput,
      transactionLevyRateInput,
      shortBorrowAnnualRateInput,
      takerFeeRateInput,
      tradeAmountIncludesFees,
      tradingAssetClass,
      tradingMarketPresetKey,
      allowLongMarginTrading,
      allowShortSelling,
      tradeSettlementMode,
      transferFeeRateInput,
    ],
  );
  const tradingSettingsDraftParseResultRef = useRef(tradingSettingsDraftParseResult);
  useEffect(() => {
    tradingSettingsDraftParseResultRef.current = tradingSettingsDraftParseResult;
  }, [tradingSettingsDraftParseResult]);

  const saveTradingSettings = useCallback(
    async (options?: { closeChartSettingsModal?: boolean; quietHint?: boolean }): Promise<boolean> => {
      if (!tradingSettingsDraftParseResult.ok) {
        setError(
          tt(
            tradingSettingsDraftParseResult.errorCode === "INVALID_INITIAL_SECURITIES"
              ? "appText.initialAmountMustIntegerGreaterThan0"
              : tradingSettingsDraftParseResult.errorCode === "INVALID_MARGIN_RATIO"
                ? "appText.invalidMarginSettingsCheckRatioRangeInitialMaintenance"
                : "appText.rateMustGreaterThanEqual0",
          ),
        );
        return false;
      }

      setError("");

      const submittedPayload = tradingSettingsDraftParseResult.payload;
      const hasGlobalChange = isTradingSettingsPayloadChanged(
        submittedPayload,
        tradingSettings,
      );
      const normalizedSessionId = String(sessionId || "").trim();
      const hasActiveSessionTradingSettingsChange =
        activePage === "TRAINER" &&
        Boolean(normalizedSessionId) &&
        !snapshot?.termination?.isTerminated &&
        isTradingSettingsPayloadChanged(
          submittedPayload,
          snapshot?.sessionTradingSettings ?? tradingSettings,
        );

      if (!hasGlobalChange && !hasActiveSessionTradingSettingsChange) {
        if (options?.closeChartSettingsModal) {
          setShowChartSettingsModal(false);
        }
        return true;
      }

      setIsSavingTradingSettings(true);
      try {
        const submittedPayloadSerialized = JSON.stringify(submittedPayload);
        let savedGlobalSettings = tradingSettings;
        if (hasGlobalChange) {
          savedGlobalSettings = await api.updateTradingSettings(submittedPayload);
          if (!appIsMountedRef.current) {
            return false;
          }
          setTradingSettings(savedGlobalSettings);
        }
        let updatedSessionSnapshot: Awaited<
          ReturnType<typeof api.updateSessionTradingSettings>
        > | null = null;
        if (hasActiveSessionTradingSettingsChange) {
          updatedSessionSnapshot = await api.updateSessionTradingSettings(
            normalizedSessionId,
            savedGlobalSettings,
          );
          if (!appIsMountedRef.current) {
            return false;
          }
          setSnapshot(updatedSessionSnapshot);
        }

        const latestDraftParseResult = tradingSettingsDraftParseResultRef.current;
        const hasNewerDraftChange = !latestDraftParseResult.ok || JSON.stringify(latestDraftParseResult.payload) !== submittedPayloadSerialized;
        if (hasNewerDraftChange) {
          return true;
        }

        applyResolvedTradingSettingsToForm(savedGlobalSettings);
        if (!updatedSessionSnapshot) {
          void syncActiveTrainingRuntime();
        }
        if (!options?.quietHint) {
          setHint(
            tt(
              updatedSessionSnapshot
                ? "appText.transactionSettingsSavedCurrentReplayImmediatelyAffected"
                : "appText.transactionSettingsSavedNewRatesImmediatelyAffectOrder",
            ),
          );
        }
        if (options?.closeChartSettingsModal) {
          setShowChartSettingsModal(false);
        }
        return true;
      } catch (err) {
        if (!appIsMountedRef.current) {
          return false;
        }
        setError(tt("appText.saveTransactionSettings"));
        return false;
      } finally {
        if (appIsMountedRef.current) {
          setIsSavingTradingSettings(false);
        }
      }
    },
    [
      applyResolvedTradingSettingsToForm,
      activePage,
      sessionId,
      setSnapshot,
      snapshot?.sessionTradingSettings,
      snapshot?.termination?.isTerminated,
      syncActiveTrainingRuntime,
      tradingSettings,
      tradingSettingsDraftParseResult,
    ],
  );

  useEffect(() => {
    if (activePage !== "SETTINGS" || isBusy || isSavingTradingSettings) {
      return;
    }
    if (!tradingSettingsDraftParseResult.ok) {
      return;
    }
    const submittedPayload = tradingSettingsDraftParseResult.payload;
    const hasGlobalChange = isTradingSettingsPayloadChanged(
      submittedPayload,
      tradingSettings,
    );
    if (!hasGlobalChange) {
      return;
    }
    const autoSaveTimer = window.setTimeout(() => {
      void saveTradingSettings({ quietHint: true });
    }, 420);
    return () => window.clearTimeout(autoSaveTimer);
  }, [
    activePage,
    isBusy,
    isSavingTradingSettings,
    saveTradingSettings,
    tradingSettings,
    tradingSettingsDraftParseResult,
  ]);

  const finalizeDestructiveDataChange = useDestructiveDataChangeFinalizer({
    resetTrainerToPrepView,
    setActionDialog,
    setOrderEndPrompt,
    setIsAutoplay,
    setDataPoolRemovedSymbolsBySourceId,
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshLatestResumableTrainerSession,
    refreshTradingSettings,
    refreshSystemStorageUsage,
  });

  const resetAllTraining = useCallback(
    async (finalizePriceMode?: OrderPriceMode) => {
      setIsBusy(true);
      setError("");
      try {
        await api.resetAllTraining(finalizePriceMode);
        if (!appIsMountedRef.current) {
          return;
        }
        const finalizeResult = await finalizeDestructiveDataChange({
          refreshDataSources: true,
          resetAutoplay: true,
        });
        if (!appIsMountedRef.current) {
          return;
        }
        setHint(tt("appText.workoutsReset"));
        if (finalizeResult.failed) {
          setError(
            formatDotJoinedText(language, [
              tt("appText.workoutsReset"),
              formatMessage(language, "common.status.requestFailed"),
            ]),
          );
        }
      } catch (err) {
        if (!appIsMountedRef.current) {
          return;
        }
        setError(tt("appText.reset"));
      } finally {
        if (appIsMountedRef.current) {
          setIsBusy(false);
        }
      }
    },
    [
      appIsMountedRef,
      finalizeDestructiveDataChange,
      language,
      setError,
      setHint,
      setIsBusy,
      tt,
    ],
  );

  const { importCsv } = useCsvImportWorkflow({
    appIsMountedRef,
    csvImportCardStates,
    customSamplePoolsCount: customSamplePools.length,
    sanitizeSamplePoolName,
    resolveLocalDataImportJobErrorMessage,
    resolveUnknownErrorMessage,
    waitForNextAnimationFrame,
    formatStorageBytes,
    getBaseTimeframeLabels,
    formatMoney,
    tt,
    ttf,
    setError,
    setHint,
    patchCsvImportCardState,
    clearCsvImportCardState,
    markCsvImportBatchStarted,
    markCsvImportBatchFinished,
    syncCustomSamplePoolsFromDataSources,
    refreshInstruments,
    setCustomSamplePools,
    setLotSizeByPool,
    setIncludeSystemDefaultPool,
    setActiveSamplePoolId,
  });

  const resolvePendingCsvPoolNamePrefix = useCallback(
    (pendingImport: { folderName: string }) => {
      const fallbackPoolName = ttf("appText.samplePoolValue0", [customSamplePools.length + 1]);
      const basePoolName = pendingImport.folderName ? pendingImport.folderName.trim() : fallbackPoolName;
      return sanitizeSamplePoolName(basePoolName, fallbackPoolName);
    },
    [customSamplePools.length],
  );

  const pendingCsvPoolPreviewName = useMemo(
    () => (pendingCsvFolderImport ? resolvePendingCsvPoolNamePrefix(pendingCsvFolderImport) : ""),
    [pendingCsvFolderImport, resolvePendingCsvPoolNamePrefix],
  );
  const pendingCsvAvailableScopeStrategies = useMemo(
    () => resolveAvailableImportScopeStrategies(pendingCsvFolderImport),
    [pendingCsvFolderImport],
  );
  useEffect(() => {
    const normalizedStrategy = normalizePendingImportScopeStrategy(
      pendingCsvFolderImport,
      pendingCsvPoolNamingStrategy,
    );
    if (normalizedStrategy !== pendingCsvPoolNamingStrategy) {
      setPendingCsvPoolNamingStrategy(normalizedStrategy);
    }
  }, [
    pendingCsvFolderImport,
    pendingCsvPoolNamingStrategy,
    setPendingCsvPoolNamingStrategy,
  ]);
  const updatePendingCsvPoolNamingStrategy = useCallback(
    (value: CsvPoolNamingStrategy) => {
      if (pendingCsvFolderImport?.importEntryMode === "FULL_REIMPORT") {
        return;
      }
      if (
        pendingCsvAvailableScopeStrategies.length > 0 &&
        !pendingCsvAvailableScopeStrategies.includes(value)
      ) {
        return;
      }
      setPendingCsvPoolNamingStrategy(value);
    },
    [
      pendingCsvAvailableScopeStrategies,
      pendingCsvFolderImport?.importEntryMode,
      setPendingCsvPoolNamingStrategy,
    ],
  );

  const pendingCsvImportPoolGroups = useMemo(() => {
    if (!pendingCsvFolderImport) {
      return [];
    }
    return resolveImportPreviewPoolGroups(pendingCsvFolderImport, pendingCsvPoolNamingStrategy, pendingCsvPoolPreviewName).filter(
      (group) => group.symbolCount > 0 && group.fileCount > 0,
    );
  }, [pendingCsvFolderImport, pendingCsvPoolNamingStrategy, pendingCsvPoolPreviewName]);
  const {
    pendingCsvImportTargetSourceOptions,
    pendingCsvRecommendedTimeZone,
    pendingCsvRecommendedTimeZoneReason,
    pendingCsvPlanConfigRows
  } = usePendingCsvImportPlanning({
    pendingCsvFolderImport,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneMode,
    setPendingCsvImportTimeZone,
    setPendingCsvImportTimeZoneMode,
    setPendingCsvPlanOverrides
  });
  const pendingCsvTimeZoneRecommendationSignatureRef = useRef('');
  useEffect(() => {
    if (!pendingCsvFolderImport) {
      pendingCsvTimeZoneRecommendationSignatureRef.current = '';
      return;
    }
    const signature = [
      pendingCsvFolderImport.previewToken,
      pendingCsvRecommendedTimeZone,
      pendingCsvRecommendedTimeZoneReason,
    ].join(':');
    if (
      pendingCsvTimeZoneRecommendationSignatureRef.current &&
      pendingCsvTimeZoneRecommendationSignatureRef.current !== signature
    ) {
      setPendingCsvImportTimeZoneConfirmationKey('');
    }
    pendingCsvTimeZoneRecommendationSignatureRef.current = signature;
  }, [
    pendingCsvFolderImport,
    pendingCsvRecommendedTimeZone,
    pendingCsvRecommendedTimeZoneReason,
    setPendingCsvImportTimeZoneConfirmationKey,
  ]);

  const {
    resetPendingCsvImportTimeZoneRecommendation,
    resetPendingCsvImportTradingCalendarRecommendation,
    openCsvFolderPickerAndPrepareImport,
    openCsvFolderPathAndPrepareImport,
    confirmPendingCsvImportTimeZone,
    updatePendingCsvImportTimeZone,
    updatePendingCsvImportTradingCalendar,
    updatePendingCsvPlanSourceId,
    updatePendingCsvPlanPoolName,
    confirmPendingCsvImport,
    controlCsvImportCardJob,
    cancelPendingCsvImport,
    updatePendingCsvMapping,
    updatePendingCsvTimestampMode,
  } = useAppCsvImportActions({
    language,
    appIsMountedRef,
    lastCsvImportFolderOpenRef,
    isPreparingCsvImportPreview,
    isClearingLocalDataSources,
    deletingSamplePoolId,
    localDataSourceSummaries,
    pendingCsvFolderImport,
    pendingCsvFieldMapping,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneMode,
    pendingCsvImportTimeZoneConfirmed,
    pendingCsvPlanOverrides,
    pendingCsvImportPoolGroups,
    pendingCsvImportTargetSourceOptions,
    pendingCsvPlanConfigRows,
    csvImportCardStates,
    csvImportCardControlAction,
    customSamplePoolsCount: customSamplePools.length,
    importCsv,
    beginCsvImportPreviewProgress,
    updateCsvImportPreviewProgress,
    markCsvImportPreviewReady,
    finishCsvImportPreviewProgress,
    patchCsvImportCardState,
    sanitizeSamplePoolName,
    resolveImportBatchWorkerCount,
    resolveUnknownErrorMessage,
    setPendingCsvImportTimeZone,
    setPendingCsvImportTimeZoneConfirmationKey,
    setPendingCsvImportTimeZoneMode,
    setPendingCsvFolderImport,
    setPendingCsvFieldMapping,
    setPendingCsvPoolNamingStrategy,
    setPendingCsvPlanOverrides,
    setCsvImportCardStates,
    setCsvImportCardControlAction,
    setError,
    setHint,
    tt,
    ttf,
  });

  const {
    clearSelectedFolder,
    pendingLocalDataSourceSyncPreview,
    preparingLocalDataSourceSyncPreview,
    dismissLocalDataSourceSyncPreview,
    selectLocalDataSourceSyncPreviewPlan,
    confirmLocalDataSourceSyncPreview,
    prepareLocalDataSourceSyncPreview,
    runConfirmedLocalDataSourceSync,
    syncSamplePoolWithSourceFolder,
    removeSymbolsFromSamplePool,
    fetchDetailSymbolBarsRange,
    fetchDetailSymbolDiagnostics,
    startTrainingWithSymbol,
  } = useAppDataSourceMaintenanceActions({
    language,
    appIsMountedRef,
    clearingLocalDataSourcesProgressPercentRef,
    isClearingLocalDataSources,
    deletingSamplePoolId,
    isPreparingCsvImportPreview,
    isCsvImporting,
    activeSamplePoolId,
    customSamplePools,
    localDataSourceSummaries,
    csvImportCardStates,
    importCsv,
    tt,
    ttf,
    resolveUnknownErrorMessage,
    resolveSourceFolderBookmarkIdBySourceId,
    resolveSamplePoolDisplayName,
    finalizeDestructiveDataChange,
    loadSymbol,
    clearCsvImportCardState,
    patchCsvImportCardState,
    setError,
    setHint,
    setIsClearingLocalDataSources,
    setClearingLocalDataSourcesProgressPercent,
    setClearingLocalDataSourcesProgressTargetPercent,
    setReplayUnavailableMessage,
    setEditingSamplePoolId,
    setEditingSamplePoolName,
    setPendingCsvFolderImport,
    setPendingCsvFieldMapping,
    setPendingCsvPoolNamingStrategy,
    setPendingCsvPlanOverrides,
    setCsvImportCardControlAction,
    setCsvImportCardStates,
    setLotSizeByPool,
    setIncludeSystemDefaultPool,
    setSystemPoolNameOverrides,
    setSystemPoolTradingBindingById,
    setDataConfigPoolOrderByBase,
    setHiddenBuiltInTradingMarketPresetIds,
    setTradingMarketPresetCustomTemplates,
    setTradingMarketPresetValuesByKey,
    setCustomSamplePools,
    setLocalDataSourceSummaries,
    setActiveSamplePoolId,
    setHistorySamplePoolFilter,
    setCurrentTrainingPoolMeta,
    setCurrentTrainingBaseTimeframe,
    setActivePage,
  });

  const {
    dataSourceSyncMonitorStateById,
    runDataSourceSyncQuickCheckSweep,
  } = useDataSourceSyncMonitorController({
    activePage,
    customSamplePools,
    localDataSourceSummaries,
    csvImportCardStates,
    dataSourceSyncPrefsById,
    isClearingLocalDataSources,
    deletingSamplePoolId,
    isPreparingCsvImportPreview,
    isCsvImporting,
    tt,
    setError,
    resolveUnknownErrorMessage,
    prepareLocalDataSourceSyncPreview,
    runConfirmedLocalDataSourceSync,
  });
  return { cancelPendingCsvImport, clearSelectedFolder, confirmLocalDataSourceSyncPreview, confirmPendingCsvImport, confirmPendingCsvImportTimeZone, controlCsvImportCardJob, dataSourceSyncMonitorStateById, dismissLocalDataSourceSyncPreview, fetchDetailSymbolBarsRange, fetchDetailSymbolDiagnostics, importCsv, openCsvFolderPathAndPrepareImport, openCsvFolderPickerAndPrepareImport, pendingCsvAvailableScopeStrategies, pendingCsvImportPoolGroups, pendingCsvImportTargetSourceOptions, pendingCsvImportTimeZoneConfirmed, pendingCsvPlanConfigRows, pendingCsvPoolPreviewName, pendingCsvRecommendedTimeZone, pendingCsvRecommendedTimeZoneReason, pendingLocalDataSourceSyncPreview, prepareLocalDataSourceSyncPreview, preparingLocalDataSourceSyncPreview, removeSymbolsFromSamplePool, resetAllTraining, resetPendingCsvImportTimeZoneRecommendation, resetPendingCsvImportTradingCalendarRecommendation, resolvePendingCsvPoolNamePrefix, runConfirmedLocalDataSourceSync, runDataSourceSyncQuickCheckSweep, saveTradingSettings, selectLocalDataSourceSyncPreviewPlan, startTrainingWithSymbol, syncSamplePoolWithSourceFolder, tradingSettingsDraftParseResult, tradingSettingsDraftParseResultRef, updatePendingCsvImportTimeZone, updatePendingCsvImportTradingCalendar, updatePendingCsvMapping, updatePendingCsvPlanPoolName, updatePendingCsvPlanSourceId, updatePendingCsvPoolNamingStrategy, updatePendingCsvTimestampMode };
};
