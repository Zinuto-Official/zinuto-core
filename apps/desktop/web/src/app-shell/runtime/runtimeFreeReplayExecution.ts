// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import {
  useCallback,
  useMemo,
} from "react";
import { api } from "@/api";
import {
  formatMoney,
} from "@/ui/formatting/format";
import {
  formatCountWithUnitText,
} from "@/ui/formatting/i18nDisplay";
import { useNotesPageController } from "@/workspaces/notes/useNotesPageController";
import { useHistoryWorkspaceOrchestrator } from "@/domains/history/useHistoryWorkspaceOrchestrator";
import {
  useGlobalResetStorageSummary,
} from "@/app-shell/useGlobalResetStorageSummary";
import { useWorkspaceKeepAliveStabilizers } from "@/app-shell/useWorkspaceKeepAliveStabilizers";
import { resolveTrainerAutoplayFromSessionPaused } from "@/app-shell/trainerAutoplayRuntime";
import { useReplayNotesDomainController } from "@/app-shell/useReplayNotesDomainController";
import { useSelectedBarChange } from "@/app-shell/useSelectedBarChange";
import { useTrainerComputedViewModels } from "@/app-shell/useTrainerComputedViewModels";
import { useFreeReplayPrepFormHandlers } from "@/app-shell/useFreeReplayPrepFormHandlers";
import {
  resolveFreeReplayEnvironmentSelectionForStart,
} from "@/domains/trainer/freeReplaySetup";
import { useTrainerFillDerivedState } from "@/domains/trainer/trainerFillDerivedState";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import {
  formatStorageBytes,
  getFontSizePresetOptions,
} from "@/frontend-kernel/uiOptions";
import {
  MAX_ARCHIVE_DRAWING_COUNT,
  waitForNextAnimationFrame,
} from "@/frontend-kernel/runtimeConstants";
import { sanitizeDrawingForArchive } from "@/app-shell/appDrawingArchive";
import {
  mapApiReplayNoteToLocal,
  toReplayNotePreview,
} from "@/domains/notes/replayNoteMapping";
import {
  updatePoolTradingBindingCore,
} from "@/app-shell/appRootPoolTradingBinding";
import {
  DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE,
} from "@/ui/config/uiConfig";
import { getLanguageOptions } from "@/ui/config/uiLabels";
import { ensureLocaleCatalog } from "@zinuto/shared/i18n";
import type { SystemStorageCategoryKey } from "@zinuto/shared/systemStorageCategories";
import {
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  SAMPLE_POOL_UNKNOWN_NAME,
} from "@/domains/trainer/samplePools";
import {
  useSystemSettingsWorkspaceViewModel,
} from "@/workspaces";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
type RuntimeHookScope = AppRootRuntimeProps &
  ReturnType<typeof useRuntimeStartupState> &
  ReturnType<typeof useRuntimeStartupHistoryState> &
  ReturnType<typeof useRuntimeStartupPersistence> &
  ReturnType<typeof useRuntimeTrainerChartSession> &
  ReturnType<typeof useRuntimeTrainerMarketSettings> &
  ReturnType<typeof useRuntimeTrainerPoolChartPipeline> &
  ReturnType<typeof useRuntimeTrainerChartOrchestration> &
  ReturnType<typeof useRuntimeFreeReplaySetup> &
  Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeFreeReplayExecution = (scope: RuntimeHookScope) => {
  const {
    activePage,
    activeSessionTradingSettings,
    activeTrainingRecordNoteId,
    appIsMountedRef,
    applySessionBootstrap,
    bars,
    barsOffset,
    barsTotal,
    buyPriceMode,
    chartPipelineBars,
    chartPipelineSnapshot,
    clearAllReplayNotePendingState,
    clearReplayNotePendingState,
    currentDisplayPeriodRef,
    customSamplePools,
    defaultReplayNoteTitle,
    deleteReplayNoteById,
    drawingStoreRef,
    effectiveTrainingBaseTimeframe,
    enabledSpecialTrainingSamplePools,
    ensureBarsBackwardAbortControllerRef,
    ensureBarsForwardAbortControllerRef,
    ensureReplayNoteDetail,
    ensureTrainingProjectDetail,
    flushReplayNotePatch,
    fontSizePreset,
    forwardSetReplayNotesKeyword,
    freeReplayPersistEnvironmentToPool,
    freeReplayPrepAnchorIndex,
    freeReplayPrepConfig,
    freeReplayPrepEnvironmentAssetClass,
    freeReplayPrepEnvironmentPresetId,
    freeReplaySelectedMinimumBaseTimeframe,
    freeReplaySelectedPool,
    freeReplaySelectedSymbol,
    freeReplayStartCandidates,
    freeReplayStartReadiness,
    getChartPipelineAggregatedBars,
    handleReplayNotesError,
    handleSystemDevSimulationDataChanged,
    hasReplayNotesHydrated,
    historyKeyword,
    historyProfitFilter,
    historySamplePoolFilter,
    instrumentMetaMap,
    isBusy,
    isReplayNotesLoading,
    isReplayNotesLoadingMore,
    isSpecialTrainingChartOverrideActive,
    language,
    loadMoreReplayNotes,
    loadReplayNotesPage,
    mergeReplayNotesInState,
    mainNativeIndicator,
    mainNativeIndicatorParams,
    noticeCountdownMs,
    noticeDialog,
    replayNotes,
    replayNotesNextCursor,
    replayNotesRef,
    replayNotesTotal,
    resetNotesPageController,
    resetNotesPageControllerRef,
    resolveCurrentPeriodAdvance,
    resolveSessionTradingSettingsByEnvironment,
    resolveSessionTradingSettingsErrorMessageByEnvironment,
    scheduleReplayNotePatch,
    selectedDataIndex,
    selectedHistoryProjectId,
    selectedReplayNoteId,
    selectedSymbol,
    sessionId,
    setActiveSamplePoolId,
    setActiveTrainingRecordNoteId,
    setCurrentTrainingMinimumBaseTimeframe,
    setCustomSamplePools,
    setError,
    setFreeReplayPersistEnvironmentToPool,
    setFreeReplayPrepBaseTimeframe,
    setFreeReplayPrepBlindBoxValue,
    setFreeReplayPrepEnvironmentAssetClass,
    setFreeReplayPrepEnvironmentPresetId,
    setFreeReplayPrepMode,
    setFreeReplayPrepTouched,
    setFreeReplaySelectedPoolId,
    setFreeReplaySelectedSymbol,
    setHint,
    setHistorySamplePoolFilter,
    setIsAutoplay,
    setIsBusy,
    setLanguage,
    setLanguageSource,
    setLocalDataSourceSummaries,
    setReplayNotes,
    setReplayNotesKeywordRef,
    setReplayNotesNextCursor,
    setReplayUnavailableMessage,
    setSelectedHistoryProjectId,
    setSelectedReplayNoteId,
    setSystemPoolTradingBindingById,
    setTrainerHydrationState,
    showNotice,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    snapshot,
    symbolLoadAbortControllerRef,
    symbolLoadRequestVersionRef,
    syncDrawingStoreFromChart,
    systemPoolTradingBindingById,
    systemStorageUsage,
    systemThemeMode,
    themeMode,
    tradingAssetClass,
    tradingMarketPresetCustomTemplates,
    tradingMarketPresetKey,
    trainerDisplayPeriod,
    trainingProjects,
    tt,
    ttf,
    ui,
    upsertReplayNoteInState,
    withLabelValue,
  } = scope;
  const {
    freeReplayPrepEnvironmentSelectionRef,
    freeReplayPrepEnvironmentTouchedRef,
  } = scope;
  const freeReplaySelectedInstrumentId = String(
    (scope as { freeReplaySelectedInstrumentId?: unknown })
      .freeReplaySelectedInstrumentId ?? "",
  ).trim();
  const startPreparedFreeReplay = useCallback(() => {
    if (isBusy) {
      // eslint-disable-next-line no-console
      console.warn("[free-replay] startPreparedFreeReplay blocked: isBusy");
      return;
    }
    const isFocusedReplayMode = freeReplayPrepConfig.mode === "FOCUSED";
    const explicitSelectedSymbol = isFocusedReplayMode
      ? String(freeReplaySelectedSymbol || "")
          .trim()
          .toUpperCase()
      : "";
    const explicitSelectedPool = freeReplaySelectedPool;
    if (isFocusedReplayMode && !freeReplayStartCandidates.length) {
      // eslint-disable-next-line no-console
      console.warn("[free-replay] startPreparedFreeReplay blocked: no candidates");
      setHint(ui.freeReplayEmptyState);
      return;
    }
    if (!freeReplayStartReadiness.canStart) {
      if (freeReplayStartReadiness.reason === "NO_SAMPLES") {
        setHint(ui.freeReplayEmptyState);
        return;
      }
      if (freeReplayStartReadiness.reason === "NO_SYMBOL") {
        setHint(tt("appText.matchingSymbol"));
        return;
      }
      if (freeReplayStartReadiness.reason === "NO_ANCHOR") {
        setHint(ui.freeReplayPrepAnchorRequired);
        return;
      }
      // eslint-disable-next-line no-console
      console.warn("[free-replay] startPreparedFreeReplay blocked: canStart=false, reason=", freeReplayStartReadiness.reason);
      return;
    }
    const selectedEnvironment = resolveFreeReplayEnvironmentSelectionForStart({
      current: freeReplayPrepEnvironmentSelectionRef.current,
      fallback: {
        assetClass: freeReplayPrepEnvironmentAssetClass,
        marketPresetId: freeReplayPrepEnvironmentPresetId,
      },
    });
    setReplayUnavailableMessage("");
    symbolLoadRequestVersionRef.current += 1;
    const requestVersion = symbolLoadRequestVersionRef.current;
    symbolLoadAbortControllerRef.current?.abort();
    ensureBarsForwardAbortControllerRef.current?.abort();
    ensureBarsBackwardAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    symbolLoadAbortControllerRef.current = abortController;
    const isRequestActive = () =>
      appIsMountedRef.current &&
      symbolLoadRequestVersionRef.current === requestVersion &&
      !abortController.signal.aborted;
    setError("");
    setIsAutoplay(false);
    setIsBusy(true);
    setTrainerHydrationState("LAUNCHING");
    void (async () => {
      try {
        if (
          freeReplayPersistEnvironmentToPool &&
          String(explicitSelectedPool?.id || "").trim()
        ) {
          const persisted = await updatePoolTradingBindingCore({
            poolId: explicitSelectedPool!.id,
            assetClass: selectedEnvironment.assetClass,
            marketPresetId: selectedEnvironment.marketPresetId,
            tradingMarketPresetCustomTemplates,
            setSystemPoolTradingBindingById,
            appIsMountedRef,
            fallbackErrorMessage: tt("appText.request"),
            reportError: (message) => {
              setError(message);
            },
          });
          if (!persisted) {
            if (isRequestActive()) {
              setTrainerHydrationState("FAILED");
            }
            return;
          }
          if (!isRequestActive()) {
            return;
          }
        }
        const started = await api.startPreparedFreeReplaySession(
          {
            mode: freeReplayPrepConfig.mode,
            selectedPoolId: explicitSelectedPool?.id,
            selectedPoolName: explicitSelectedPool?.name,
            selectedInstrumentId: freeReplaySelectedInstrumentId || undefined,
            selectedSymbol: explicitSelectedSymbol || undefined,
            selectedAnchorIndex: isFocusedReplayMode
              ? (freeReplayPrepAnchorIndex ?? undefined)
              : undefined,
            minimumBaseTimeframe: freeReplaySelectedMinimumBaseTimeframe,
            tradingEnvironment: {
              assetClass: selectedEnvironment.assetClass,
              marketPresetId: selectedEnvironment.marketPresetId,
            },
          },
          { signal: abortController.signal },
        );
        if (!isRequestActive()) {
          return;
        }
        setTrainerHydrationState("HYDRATING");
        setCurrentTrainingMinimumBaseTimeframe(
          freeReplaySelectedMinimumBaseTimeframe,
        );
        setActiveSamplePoolId(started.selected.poolId);
        const committed = applySessionBootstrap(started.bootstrap, {
          preferredPoolId: started.selected.poolId,
          preferredPoolName: started.selected.poolName,
          fallbackSymbol: started.selected.symbol,
          fallbackBaseTimeframe: started.selected.sourceTimeframe,
        });
        setIsAutoplay(
          resolveTrainerAutoplayFromSessionPaused(
            committed.snapshot.session.is_paused,
          ) === false,
        );
        if (!isRequestActive()) {
          return;
        }
        const consumed = Math.max(
          1,
          committed.snapshot.session.cursor_index -
            committed.snapshot.session.start_index +
            1,
        );
        const future = Math.max(
          0,
          committed.range.total - committed.snapshot.session.cursor_index - 1,
        );
        setHint(
          ttf("appText.loadedValue0TotalValue1LinesHistoryValue2FutureValue3", [
            committed.symbol,
            formatMoney(committed.range.total, 0),
            formatMoney(consumed, 0),
            formatMoney(future, 0),
          ]),
        );
        await waitForNextAnimationFrame();
        if (!isRequestActive()) {
          return;
        }
        setTrainerHydrationState("READY");
        void api
          .cleanupStaleSessions(committed.sessionId)
          .catch(() => undefined);
      } catch (error) {
        if (!isRequestActive()) {
          return;
        }
        console.error("[free-replay] session load failed", error);
        const message = tt("common.status.loadFailed");
        setTrainerHydrationState("FAILED");
        setReplayUnavailableMessage(message);
        setError(message);
      } finally {
        if (symbolLoadAbortControllerRef.current === abortController) {
          symbolLoadAbortControllerRef.current = null;
        }
        if (
          appIsMountedRef.current &&
          symbolLoadRequestVersionRef.current === requestVersion
        ) {
          setIsBusy(false);
        }
      }
    })();
  }, [
    applySessionBootstrap,
    formatMoney,
    freeReplayPrepConfig.mode,
    freeReplayPrepAnchorIndex,
    freeReplayPrepEnvironmentAssetClass,
    freeReplayPrepEnvironmentPresetId,
    freeReplayPrepEnvironmentSelectionRef,
    freeReplayPersistEnvironmentToPool,
    freeReplaySelectedPool,
    freeReplaySelectedInstrumentId,
    freeReplaySelectedMinimumBaseTimeframe,
    freeReplaySelectedSymbol,
    freeReplayStartReadiness.canStart,
    freeReplayStartReadiness.reason,
    freeReplayStartCandidates,
    isBusy,
    resolveSessionTradingSettingsByEnvironment,
    resolveSessionTradingSettingsErrorMessageByEnvironment,
    setCustomSamplePools,
    setError,
    setActiveSamplePoolId,
    setCurrentTrainingMinimumBaseTimeframe,
    setHint,
    setIsAutoplay,
    setIsBusy,
    setLocalDataSourceSummaries,
    setReplayUnavailableMessage,
    setSystemPoolTradingBindingById,
    setTrainerHydrationState,
    tradingMarketPresetCustomTemplates,
    ttf,
    tt,
    ui.freeReplayPrepAnchorRequired,
    ui.freeReplayEmptyState,
    appIsMountedRef,
    waitForNextAnimationFrame,
  ]);
  const markFreeReplayPrepEnvironmentTouched = useCallback(() => {
    freeReplayPrepEnvironmentTouchedRef.current = true;
  }, [freeReplayPrepEnvironmentTouchedRef]);
  const {
    handleFreeReplayPrepEnvironmentAssetClassChange:
      handleFreeReplayPrepEnvironmentAssetClassChangeBase,
    handleFreeReplayPrepEnvironmentPresetChange,
    handleFreeReplayPrepPersistEnvironmentToPoolChange,
    handleFreeReplayPrepModeChange,
    handleFreeReplayPrepBaseTimeframeChange,
    handleFreeReplayPrepSamplePoolChange,
    handleFreeReplayPrepSymbolChange,
    handleFreeReplayPrepBlindBoxChange,
  } = useFreeReplayPrepFormHandlers({
    setFreeReplayPrepTouched,
    markFreeReplayPrepEnvironmentTouched,
    setFreeReplayPrepMode,
    setFreeReplayPrepBaseTimeframe,
    setFreeReplaySelectedPoolId,
    setFreeReplaySelectedSymbol,
    setFreeReplayPrepBlindBoxValue,
    setFreeReplayPrepEnvironmentAssetClass,
    setFreeReplayPrepEnvironmentPresetId,
    setFreeReplayPrepPersistEnvironmentToPool:
      setFreeReplayPersistEnvironmentToPool,
  });
  const trainerFillDerivedState = useTrainerFillDerivedState(snapshot, bars);

  const {
    currentPosition,
    currentBar,
    tradeLogRows,
    tradeLogSideStats,
    selectedBarChange,
    securitiesAccount,
    currentTradingFee,
    cumulativePnlRate,
    positionMarketValue,
    securitiesTotal,
    securitiesDelta,
    floatingRate,
    leverageExposureSummary,
    trainingDays,
    trainingDateRange,
    calendarSpanText,
    replaySpanText,
    selectedSymbolUpper,
    klineProgressData,
    klineRemainingLine,
  } = useTrainerComputedViewModels({
    bars,
    barsOffset,
    barsTotal,
    snapshot,
    fillDerivedState: trainerFillDerivedState,
    selectedSymbol,
    baseTimeframe: effectiveTrainingBaseTimeframe,
    instrumentMetaMap,
    selectedDataIndex,
    trainerDisplayPeriod,
    getCachedTrainerAggregatedBars: getChartPipelineAggregatedBars,
    tradingSettings: activeSessionTradingSettings,
    uiRemainingLabel: ui.remaining,
    uiKlineUnitLabel: ui.klineUnit,
    formatMoney,
    language,
  });
  const chartSelectedBarChange = useSelectedBarChange({
    bars: chartPipelineBars,
    snapshot: chartPipelineSnapshot,
    selectedDataIndex,
    trainerDisplayPeriod,
    getCachedTrainerAggregatedBars: getChartPipelineAggregatedBars,
  });
  const workspaceSelectedBarChange = isSpecialTrainingChartOverrideActive
    ? chartSelectedBarChange
    : selectedBarChange;
  const pnlClass = (value: number) =>
    value > 0 ? "up" : value < 0 ? "down" : "flat";
  const changeClass = (value: number) =>
    value > 0 ? "up" : value < 0 ? "down" : "";
  const reverseChangeClass = (value: number) =>
    value > 0 ? "down" : value < 0 ? "up" : "";
  const periodAdvanceMeta = useMemo(
    () => resolveCurrentPeriodAdvance(),
    [resolveCurrentPeriodAdvance],
  );
  const hasNextBar = periodAdvanceMeta.hasFutureBars;
  const nextOpenUnavailable =
    buyPriceMode === "NEXT_OPEN" &&
    Boolean(snapshot && bars.length) &&
    periodAdvanceMeta.nextOpenDelay <= 0 &&
    !periodAdvanceMeta.needsFutureBars;
  const canUndoTrainerAction = Boolean(snapshot?.actionState?.canUndo);
  const undoAvailableTrainerSteps = Math.max(
    0,
    Math.floor(Number(snapshot?.actionState?.undoAvailableSteps ?? 0) || 0),
  );
  const undoMaxTrainerSteps = Math.max(
    1,
    Math.floor(Number(snapshot?.actionState?.undoMaxSteps ?? 5) || 5),
  );
  const lastUndoableTrainerAction =
    snapshot?.actionState?.lastUndoableAction ?? null;
  const noticeCountdownSec = !noticeDialog?.autoCloseMs
    ? 0
    : Math.max(
        0,
        Math.ceil((noticeCountdownMs ?? noticeDialog.autoCloseMs) / 1000),
      );
  const fontSizePresetOptions = getFontSizePresetOptions(language);
  const languageOptions = useMemo(
    () => getLanguageOptions(language),
    [language],
  );
  const setUserLanguagePreference = useCallback(
    async (nextLanguage: UiLanguage) => {
      await ensureLocaleCatalog(nextLanguage);
      // Commit the React language and its preference source together. Updating
      // the global singleton first used to publish next, stale, then next to
      // secondary windows while the catalog was still being loaded.
      setLanguage(nextLanguage);
      setLanguageSource("USER");
    },
    [setLanguage, setLanguageSource],
  );
  const {
    activeLanguageLabel,
    activeThemeLabel,
    activeFontSizeLabel,
    storageUsageRows,
    storageUsageTotalText,
  } = useSystemSettingsWorkspaceViewModel({
    language,
    ui,
    themeMode,
    systemThemeMode,
    fontSizePreset,
    languageOptions,
    fontSizePresetOptions,
    systemStorageUsage,
    formatStorageBytes,
  });
  const storageLabelByKey = useMemo(
    (): Record<SystemStorageCategoryKey, string> => ({
      training: tt("appText.trainingData"),
      replayNotes: tt("appText.notesData"),
      marketData: tt("appText.marketDataStorage"),
      systemSettings: tt("appText.systemSettings"),
      stats: tt("appText.statsData"),
      other: tt("appText.other2"),
    }),
    [tt],
  );
  const globalResetStorageSummaryRefreshKey = useMemo(
    () =>
      [
        systemStorageUsage?.measuredAt ?? "",
        systemStorageUsage?.logicalTotalBytes ?? 0,
        systemStorageUsage?.physicalTotalBytes ?? 0,
        systemStorageUsage?.marketDataSummary?.instrumentCount ?? 0,
        systemStorageUsage?.marketDataSummary?.barCount ?? 0,
      ].join("|"),
    [systemStorageUsage],
  );
  const {
    globalResetStorageRows,
    globalResetStorageTotalText,
    isGlobalResetStorageSummaryReady,
    marketContentCounts: globalResetMarketContentCounts,
  } = useGlobalResetStorageSummary({
    formatStorageBytes,
    labelByKey: storageLabelByKey,
    refreshKey: globalResetStorageSummaryRefreshKey,
  });
  const globalResetAffectedPoolCount = globalResetMarketContentCounts.instrumentCount;
  const globalResetAffectedSymbolCount = globalResetMarketContentCounts.barCount;
  const {
    historyPoolFilterOptions,
    historySamplePoolFilterSelectValue,
    historyVisibleProjects,
    selectedHistoryProject,
    selectedHistoryProjectReplayNoteCount,
    selectedHistoryCompactStats,
  } = useHistoryWorkspaceOrchestrator({
    language,
    historyKeyword,
    historyProfitFilter,
    historySamplePoolFilter,
    samplePoolAllId: SAMPLE_POOL_ALL_ID,
    samplePoolUnknownId: SAMPLE_POOL_UNKNOWN_ID,
    trainingProjects,
    selectedHistoryProjectId,
    setHistorySamplePoolFilter,
    setSelectedHistoryProjectId,
    ensureTrainingProjectDetail,
    formatMoney,
    formatCountWithUnitText,
    withLabelValue,
  });
  const selectedReplayNote =
    replayNotes.find((note) => note.id === selectedReplayNoteId) ??
    replayNotes[0] ??
    null;
  const {
    activeTrainingRecordNote,
    activeTrainingRecordProject,
    isActiveTrainingRecordNoteNewlyCreated,
    buildTrainingRecordProjectFromNote,
    buildCurrentReplayContext,
    createChallengeReviewReplayNote,
    createCustomReplayNote,
    createHistoryReviewReplayNote,
    createTrainingRecordReplayNote,
    closeActiveTrainingRecordNote,
    cancelActiveTrainingRecordNote,
    updateReplayNoteContextDisplayPeriod,
    updateReplayNoteTitle,
    commitReplayNoteTitle,
    updateReplayNoteContent,
    updateReplayNoteColorTokens,
    clearAllReplayNotes,
    formatReplayNoteTime,
  } = useReplayNotesDomainController({
    replayNotes,
    replayNotesRef,
    selectedReplayNote,
    isNotesPageActive: activePage === "NOTES",
    activeTrainingRecordNoteId,
    setReplayNotes,
    setReplayNotesNextCursor,
    setSelectedReplayNoteId,
    setReplayNotesKeyword: forwardSetReplayNotesKeyword,
    setActiveTrainingRecordNoteId,
    ensureReplayNoteDetail,
    scheduleReplayNotePatch,
    flushReplayNotePatch,
    clearReplayNotePendingState,
    clearAllReplayNotePendingState,
    resetNotesPageController,
    upsertReplayNoteInState,
    appIsMountedRef,
    setError,
    showNotice,
    tt,
    ttf,
    language,
    fallbackReplayNoteTitle: DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE[language],
    bars,
    snapshot,
    sessionId,
    trainerDisplayPeriod,
    currentTrainingBaseTimeframe: effectiveTrainingBaseTimeframe,
    drawingStoreRef,
    currentDisplayPeriodRef,
    syncDrawingStoreFromChart,
    tradingInitialSecuritiesBalance:
      activeSessionTradingSettings.initialSecuritiesBalance,
    mainNativeIndicator,
    mainNativeIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    toReplayNotePreview,
    mapApiReplayNoteToLocal,
    sanitizeDrawingForArchive,
    maxArchiveDrawingCount: MAX_ARCHIVE_DRAWING_COUNT,
    samplePoolUnknownId: SAMPLE_POOL_UNKNOWN_ID,
    samplePoolUnknownName: SAMPLE_POOL_UNKNOWN_NAME(),
  });
  const { systemSettingsDevSimulationInput } = useWorkspaceKeepAliveStabilizers(
    {
      loadMoreReplayNotes,
      enabledSpecialTrainingSamplePools,
      tradingAssetClass,
      tradingMarketPresetKey,
      customSamplePools,
      systemPoolTradingBindingById,
      tradingMarketPresetCustomTemplates,
      handleSystemDevSimulationDataChanged,
    },
  );
  const notesPageController = useNotesPageController({
    isActive: activePage === "NOTES",
    language,
    replayNotes,
    hasReplayNotesHydrated,
    isReplayNotesLoading,
    isReplayNotesLoadingMore,
    replayNotesNextCursor,
    replayNotesTotal,
    loadReplayNotesPage,
    loadMoreReplayNotes,
    setReplayNotes,
    mergeReplayNotesInState,
    selectedReplayNoteId,
    setSelectedReplayNoteId,
    defaultReplayNoteTitle,
    onCreateCustomReplayNote: createCustomReplayNote,
    onDeleteReplayNote: deleteReplayNoteById,
    onError: handleReplayNotesError,
    fallbackErrorMessage: tt("appText.request"),
  });
  resetNotesPageControllerRef.current =
    notesPageController.resetNotesPageController;
  setReplayNotesKeywordRef.current = notesPageController.setReplayNotesKeyword;

  return {
    activeFontSizeLabel,
    activeLanguageLabel,
    activeThemeLabel,
    activeTrainingRecordNote,
    activeTrainingRecordProject,
    buildCurrentReplayContext,
    buildTrainingRecordProjectFromNote,
    calendarSpanText,
    canUndoTrainerAction,
    cancelActiveTrainingRecordNote,
    changeClass,
    chartSelectedBarChange,
    clearAllReplayNotes,
    closeActiveTrainingRecordNote,
    commitReplayNoteTitle,
    createChallengeReviewReplayNote,
    createCustomReplayNote,
    createHistoryReviewReplayNote,
    createTrainingRecordReplayNote,
    cumulativePnlRate,
    currentBar,
    currentPosition,
    currentTradingFee,
    floatingRate,
    fontSizePresetOptions,
    formatReplayNoteTime,
    globalResetAffectedPoolCount,
    globalResetAffectedSymbolCount,
    globalResetStorageRows,
    globalResetStorageTotalText,
    isGlobalResetStorageSummaryReady,
    handleFreeReplayPrepBaseTimeframeChange,
    handleFreeReplayPrepBlindBoxChange,
    handleFreeReplayPrepEnvironmentAssetClassChangeBase,
    handleFreeReplayPrepEnvironmentPresetChange,
    handleFreeReplayPrepModeChange,
    handleFreeReplayPrepPersistEnvironmentToPoolChange,
    handleFreeReplayPrepSamplePoolChange,
    handleFreeReplayPrepSymbolChange,
    hasNextBar,
    historyPoolFilterOptions,
    historySamplePoolFilterSelectValue,
    historyVisibleProjects,
    isActiveTrainingRecordNoteNewlyCreated,
    klineProgressData,
    klineRemainingLine,
    lastUndoableTrainerAction,
    leverageExposureSummary,
    nextOpenUnavailable,
    notesPageController,
    noticeCountdownSec,
    periodAdvanceMeta,
    pnlClass,
    positionMarketValue,
    replaySpanText,
    reverseChangeClass,
    securitiesAccount,
    securitiesDelta,
    securitiesTotal,
    selectedBarChange,
    selectedHistoryCompactStats,
    selectedHistoryProject,
    selectedHistoryProjectReplayNoteCount,
    selectedReplayNote,
    selectedSymbolUpper,
    setUserLanguagePreference,
    startPreparedFreeReplay,
    storageUsageRows,
    storageUsageTotalText,
    systemSettingsDevSimulationInput,
    tradeLogRows,
    tradeLogSideStats,
    trainerFillDerivedState,
    trainingDateRange,
    trainingDays,
    undoAvailableTrainerSteps,
    undoMaxTrainerSteps,
    updateReplayNoteColorTokens,
    updateReplayNoteContent,
    updateReplayNoteContextDisplayPeriod,
    updateReplayNoteTitle,
    workspaceSelectedBarChange,
  };
};
