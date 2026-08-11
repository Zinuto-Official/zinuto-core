// SPDX-License-Identifier: GPL-3.0-only

import type { SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { api } from "@/api";
import type { SystemSettingsTabId } from "@/workspaces/settings/settings/SystemSettingsTabs";
import {
  formatDotJoinedText,
} from "@/ui/formatting/i18nDisplay";
import {
  isReplaySnapshotNoteType,
} from "@/workspaces/notes/useReplayNotes";
import {
  resetSharedStatsViewCache,
} from "@/workspaces/challenge-stats/trainingStatsViewCache";
import { useAppRootNavigationShellBindings } from "@/app-shell/useAppRootNavigationShellBindings";
import { useTrainingResetDialogController } from "@/app-shell/useTrainingResetDialogController";
import { useAppGlobalResetController } from "@/app-shell/useAppGlobalResetController";
import { useDestructiveDataChangeFinalizer } from "@/app-shell/useDestructiveDataChangeFinalizer";
import { useHistoryProjectCrudController } from "@/app-shell/useHistoryProjectCrudController";
import {
  type TrainingProject,
  type UiSettings
} from "@/frontend-kernel/appTypes";
import {
  formatStorageBytes,
} from "@/frontend-kernel/uiOptions";
import {
  MAX_ARCHIVE_DRAWING_COUNT,
} from "@/frontend-kernel/runtimeConstants";
import { sanitizeDrawingForArchive } from "@/app-shell/appDrawingArchive";
import {
  formatProjectNameByPattern,
} from "@/app-shell/appSessionNaming";
import {
  mapApiTrainingProjectToLocal,
} from "@/app-shell/appProjectMapping";
import {
  sanitizeSamplePoolName,
} from "@/app-shell/appSamplePools";
import { getUiLabels } from "@/ui/config/uiLabels";
import { installI18nAuditBridge } from "@/frontend-kernel/i18n";
import {
  SAMPLE_POOL_ALL_ID,
  SAMPLE_POOL_UNKNOWN_ID,
  SAMPLE_POOL_UNKNOWN_NAME,
} from "@/domains/trainer/samplePools";
import { readActiveSessionTerminationReasonCode } from "@/domains/trainer/trainingSessionGuards";
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
import type { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
type RuntimeHookScope = AppRootRuntimeProps &
  ReturnType<typeof useRuntimeStartupState> &
  ReturnType<typeof useRuntimeStartupHistoryState> &
  ReturnType<typeof useRuntimeStartupPersistence> &
  ReturnType<typeof useRuntimeTrainerChartSession> &
  ReturnType<typeof useRuntimeTrainerMarketSettings> &
  ReturnType<typeof useRuntimeTrainerPoolChartPipeline> &
  ReturnType<typeof useRuntimeTrainerChartOrchestration> &
  ReturnType<typeof useRuntimeFreeReplaySetup> &
  ReturnType<typeof useRuntimeFreeReplayExecution> &
  ReturnType<typeof useRuntimeTradingSettingsAndImport> &
  Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeDataResetNavigation = (scope: RuntimeHookScope) => {
  const {
    actionDialog,
    activeDrawToolRef,
    activePage,
    activeSessionTradingSettings,
    appIsMountedRef,
    barsOffsetRef,
    barsRef,
    barsTotalRef,
    buyPriceMode,
    cancelPendingUiSettingsPersist,
    chartRef,
    clearAllReplayNotePendingState,
    clearLoadedHistoryProjectIds,
    currentDisplayPeriodRef,
    currentTrainingPoolMeta,
    deletingSamplePoolId,
    drawingOverlayIdRef,
    drawingStoreRef,
    editingProjectId,
    editingProjectName,
    ensureBarsForwardAbortControllerRef,
    globalResetProgressHideTimerRef,
    globalResetProgressPercentRef,
    handleMissingTrainerSession,
    handledTrainingTerminationSignatureRef,
    historyProjectsWarmupTaskRef,
    isAutoplay,
    isBusy,
    isClearingLocalDataSources,
    isGlobalResetInProgressRef,
    isPlacingOrderRef,
    isPreparingAction,
    isPreparingCsvImportPreview,
    language,
    loadReplayNotesPage,
    loadTrainingProjectsPage,
    mainNativeIndicator,
    mainNativeIndicatorParams,
    markHistoryProjectLoaded,
    openCsvFolderPathAndPrepareImport,
    openCsvFolderPickerAndPrepareImport,
    openResetAllDialogRef,
    prefetchWorkspacePageData,
    rearmTimerRef,
    refreshInstruments,
    refreshLatestResumableTrainerSession,
    refreshSystemStorageUsage,
    refreshTradingSettings,
    resetAllTraining,
    resetNotesPageController,
    resetTrainerToPrepView,
    sessionId,
    sessionNameFormat,
    setActionDialog,
    setActiveDrawTool,
    setActivePage,
    setActiveSamplePoolId,
    setActiveTrainingRecordNoteId,
    setBars,
    setBarsOffset,
    setBarsTotal,
    setCustomSamplePools,
    setDataConfigPoolOrderByBase,
    setDataPoolRemovedSymbolsBySourceId,
    setEditingProjectId,
    setEditingProjectName,
    setError,
    setGlobalResetModules,
    setGlobalResetProgressLabel,
    setGlobalResetProgressPercent,
    setGlobalResetProgressTargetPercent,
    setHiddenBuiltInTradingMarketPresetIds,
    setHint,
    setHistoryKeyword,
    setHistoryProfitFilter,
    setHistoryProjectsNextCursor,
    setHistorySamplePoolFilter,
    setIncludeSystemDefaultPool,
    setIsAutoplay,
    setIsBusy,
    setIsGlobalResetProgressVisible,
    setIsPreparingAction,
    setLocalDataSourceSummaries,
    setLotSizeByPool,
    setOrderEndPrompt,
    setReplayNotes,
    setReplayNotesNextCursor,
    setReplayUnavailableMessage,
    setRequestedSystemSettingsTab,
    setSelectedHistoryProjectId,
    setSelectedReplayNoteId,
    setSelectedSymbol,
    setSessionId,
    setShowShortcutModal,
    setSnapshot,
    setSystemPoolNameOverrides,
    setSystemPoolTradingBindingById,
    setTradingMarketPresetCustomTemplates,
    setTradingMarketPresetValuesByKey,
    setTrainingProjects,
    shellNavigationLabels,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalTopIndicator,
    signalTopIndicatorParams,
    snapshot,
    snapshotAbortControllerRef,
    symbolLoadAbortControllerRef,
    syncCustomSamplePoolsFromDataSources,
    syncDrawingStoreFromChart,
    tradingSettings,
    trainerDisplayPeriod,
    tt,
    ttf,
    unmarkHistoryProjectLoaded,
    upsertTrainingProjectInState,
  } = scope;
  const [globalResetRevision, setGlobalResetRevision] = useState(0);
  const markGlobalResetCompleted = useCallback(() => {
    setGlobalResetRevision((current) => current + 1);
  }, []);
  const archiveCurrentTrainingProject =
    useCallback(async (): Promise<boolean> => {
      const now = new Date();
      const archivedSessionId = (
        sessionId ||
        snapshot?.session.id ||
        ""
      ).trim();
      if (!archivedSessionId) {
        setError(tt("appText.trainingSessionsProgress"));
        return false;
      }
      const samplePoolId = currentTrainingPoolMeta.id || SAMPLE_POOL_UNKNOWN_ID;
      const samplePoolName = sanitizeSamplePoolName(
        currentTrainingPoolMeta.name,
        SAMPLE_POOL_UNKNOWN_NAME(),
      );
      const name =
        formatProjectNameByPattern(now, sessionNameFormat) ||
        now.toISOString().slice(0, 16).replace("T", " ");
      let archivedDrawingOverlays: SavedDrawingOverlay[] = [];
      let archiveFollowUpFailureMode: "DRAWINGS" | "SYNC" | "MULTIPLE" | null =
        null;
      try {
        const chart = chartRef.current;
        if (chart && drawingOverlayIdRef.current) {
          chart.removeOverlay({ id: drawingOverlayIdRef.current });
          drawingOverlayIdRef.current = "";
        }
        if (rearmTimerRef.current !== null) {
          window.clearTimeout(rearmTimerRef.current);
          rearmTimerRef.current = null;
        }
        activeDrawToolRef.current = "cursor";
        setActiveDrawTool("cursor");
        syncDrawingStoreFromChart(currentDisplayPeriodRef.current);
        const drawingOverlays = drawingStoreRef.current
          .map((item) => sanitizeDrawingForArchive(item))
          .filter((item): item is SavedDrawingOverlay => Boolean(item));
        archivedDrawingOverlays =
          drawingOverlays.length > MAX_ARCHIVE_DRAWING_COUNT
            ? drawingOverlays.slice(
                drawingOverlays.length - MAX_ARCHIVE_DRAWING_COUNT,
              )
            : drawingOverlays;
      } catch {
        archiveFollowUpFailureMode = "DRAWINGS";
      }
      let saved: TrainingProject;
      try {
        saved = mapApiTrainingProjectToLocal(
          await api.archiveTrainingProjectFromSession({
            sessionId: archivedSessionId,
            name,
            samplePoolId,
            samplePoolName,
            displayPeriod: trainerDisplayPeriod,
            finalizePriceMode:
              activeSessionTradingSettings.freeReplayEndSettlementMode ===
              "FORCE_CLOSE"
                ? buyPriceMode
                : undefined,
            drawings: archivedDrawingOverlays,
            chartIndicators: {
              mainNativeIndicator,
              mainNativeIndicatorParams: [...mainNativeIndicatorParams],
              signalTopIndicator,
              signalTopIndicatorParams: [...signalTopIndicatorParams],
              signalBottomIndicator,
              signalBottomIndicatorParams: [...signalBottomIndicatorParams],
            },
          }),
        );
      } catch (err) {
        setError(tt("appText.archiveHistoricalTraining"));
        return false;
      }
      try {
        markHistoryProjectLoaded(saved.id);
        upsertTrainingProjectInState(saved);
        setSelectedHistoryProjectId(saved.id);
        setHistoryKeyword("");
        setHistoryProfitFilter("ALL");
        setHistorySamplePoolFilter(SAMPLE_POOL_ALL_ID);
        if (archivedSessionId) {
          const boundProjectId = saved.id;
          setReplayNotes((current) => {
            const nowIsoText = new Date().toISOString();
            return current.map((note) => {
              if (!isReplaySnapshotNoteType(note.type)) {
                return note;
              }
              const noteBinding = (note.trainingProjectId || "").trim();
              const noteSessionId = (note.contextSessionId || "").trim();
              const isBound =
                noteBinding === archivedSessionId ||
                noteSessionId === archivedSessionId;
              if (!isBound || noteBinding === boundProjectId) {
                return note;
              }
              return {
                ...note,
                trainingProjectId: boundProjectId,
                updatedAt: nowIsoText,
              };
            });
          });
          await api.rebindTrainingRecordNotes(
            archivedSessionId,
            boundProjectId,
          );
        }
      } catch (err) {
        archiveFollowUpFailureMode =
          archiveFollowUpFailureMode === "DRAWINGS" ? "MULTIPLE" : "SYNC";
      }
      if (archiveFollowUpFailureMode && appIsMountedRef.current) {
        setError(
          formatDotJoinedText(language, [
            getUiLabels(language).reviewConsoleTabArchive,
            formatMessage(language, "common.status.requestFailed"),
          ]),
        );
      }
      return true;
    }, [
      activeSessionTradingSettings.freeReplayEndSettlementMode,
      appIsMountedRef,
      buyPriceMode,
      currentTrainingPoolMeta.id,
      currentTrainingPoolMeta.name,
      mainNativeIndicator,
      mainNativeIndicatorParams,
      mapApiTrainingProjectToLocal,
      markHistoryProjectLoaded,
      sanitizeSamplePoolName,
      sessionNameFormat,
      sessionId,
      setActiveDrawTool,
      setError,
      setHistoryKeyword,
      setHistoryProfitFilter,
      signalBottomIndicatorParams,
      signalBottomIndicator,
      signalTopIndicatorParams,
      signalTopIndicator,
      setReplayNotes,
      setSelectedHistoryProjectId,
      setHistorySamplePoolFilter,
      snapshot,
      syncDrawingStoreFromChart,
      tt,
      trainerDisplayPeriod,
      upsertTrainingProjectInState,
    ]);

  const handleTrainingProjectsChanged = useCallback(
    async (options: {
      reason: "rename" | "delete" | "clear";
      projectIds?: string[];
    }) => {
      resetSharedStatsViewCache("training");
      if (options.reason === "delete" || options.reason === "clear") {
        historyProjectsWarmupTaskRef.current = null;
        await loadTrainingProjectsPage(false, null);
      }
    },
    [loadTrainingProjectsPage],
  );

  const {
    startRenameTrainingProject,
    cancelRenameTrainingProject,
    saveRenameTrainingProject,
    deleteTrainingProject,
    deleteTrainingProjects,
    clearAllTrainingProjects,
  } = useHistoryProjectCrudController({
    editingProjectId,
    editingProjectName,
    setEditingProjectId,
    setEditingProjectName,
    setTrainingProjects,
    setHistoryProjectsNextCursor,
    mapApiTrainingProjectToLocal,
    markHistoryProjectLoaded,
    unmarkHistoryProjectLoaded,
    clearLoadedHistoryProjectIds,
    upsertTrainingProjectInState,
    onProjectsChanged: handleTrainingProjectsChanged,
    setError,
    tt,
  });

  const resetDestructiveHistoryRuntime = useCallback(() => {
    clearAllReplayNotePendingState();
    resetSharedStatsViewCache();
    resetNotesPageController();
    clearLoadedHistoryProjectIds();
    setReplayNotes([]);
    setReplayNotesNextCursor(null);
    setSelectedReplayNoteId("");
    setActiveTrainingRecordNoteId("");
    setTrainingProjects([]);
    setHistoryProjectsNextCursor(null);
    setSelectedHistoryProjectId("");
    setEditingProjectId("");
    setEditingProjectName("");
  }, [
    clearAllReplayNotePendingState,
    clearLoadedHistoryProjectIds,
    resetNotesPageController,
    setActiveTrainingRecordNoteId,
    setEditingProjectId,
    setEditingProjectName,
    setHistoryProjectsNextCursor,
    setReplayNotes,
    setReplayNotesNextCursor,
    setSelectedHistoryProjectId,
    setSelectedReplayNoteId,
    setTrainingProjects,
  ]);

  const finalizeDestructiveDataChange = useDestructiveDataChangeFinalizer({
    resetTrainerToPrepView,
    setActionDialog,
    setOrderEndPrompt,
    setIsAutoplay,
    setDataPoolRemovedSymbolsBySourceId,
    resetHistoryRuntime: resetDestructiveHistoryRuntime,
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshLatestResumableTrainerSession,
    refreshTradingSettings,
    refreshTrainingProjects: () => loadTrainingProjectsPage(false, null),
    refreshReplayNotes: () => loadReplayNotesPage(false, null),
    refreshSystemStorageUsage,
  });

  const resetAllStoredData = useAppGlobalResetController({
    isBusy,
    isPreparingAction,
    isPlacingOrderRef,
    appIsMountedRef,
    isGlobalResetInProgressRef,
    globalResetProgressHideTimerRef,
    globalResetProgressPercentRef,
    symbolLoadAbortControllerRef,
    snapshotAbortControllerRef,
    ensureBarsForwardAbortControllerRef,
    barsRef,
    barsOffsetRef,
    barsTotalRef,
    cancelPendingUiSettingsPersist,
    clearAllReplayNotePendingState,
    resetNotesPageController,
    clearLoadedHistoryProjectIds,
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshTradingSettings,
    refreshSystemStorageUsage,
    finalizeDestructiveDataChange,
    onResetCompleted: markGlobalResetCompleted,
    formatStorageBytes,
    tt,
    ttf,
    setError,
    setIsGlobalResetProgressVisible,
    setGlobalResetProgressLabel,
    setGlobalResetProgressPercent,
    setGlobalResetProgressTargetPercent,
    setGlobalResetModules,
    setIsBusy,
    setReplayNotes,
    setReplayNotesNextCursor,
    setSelectedReplayNoteId,
    setActiveTrainingRecordNoteId,
    setTrainingProjects,
    setHistoryProjectsNextCursor,
    setSelectedHistoryProjectId,
    setEditingProjectId,
    setEditingProjectName,
    setActionDialog,
    setOrderEndPrompt,
    setSessionId,
    setSnapshot,
    setSelectedSymbol,
    setBars,
    setBarsOffset,
    setBarsTotal,
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
    setLotSizeByPool,
    setDataPoolRemovedSymbolsBySourceId,
    setReplayUnavailableMessage,
    setActivePage,
    setHint,
  });

  const {
    actionDialogReplayMetrics,
    openResetAllDialog,
    confirmActionDialog,
    actionDialogTitle,
    actionDialogDesc,
  } = useTrainingResetDialogController({
    actionDialog,
    setActionDialog,
    tradingInitialSecuritiesBalance: tradingSettings.initialSecuritiesBalance,
    currentSessionId: String(sessionId || snapshot?.session.id || "").trim(),
    displayPeriod: trainerDisplayPeriod,
    buyPriceMode,
    freeReplayEndSettlementMode:
      activeSessionTradingSettings.freeReplayEndSettlementMode,
    isPreparingAction,
    setIsPreparingAction,
    setError,
    onSessionMissing: handleMissingTrainerSession,
    archiveCurrentTrainingProject,
    resetAllTraining,
    loadTrainingProjectsPage,
    language,
  });
  useEffect(() => {
    openResetAllDialogRef.current = openResetAllDialog;
  }, [openResetAllDialog]);

  useEffect(() => {
    const reasonCode = readActiveSessionTerminationReasonCode(
      snapshot,
      sessionId,
    );
    if (!sessionId || !reasonCode) {
      handledTrainingTerminationSignatureRef.current = "";
      return;
    }
    const signature = `${sessionId}|${reasonCode}`;
    if (handledTrainingTerminationSignatureRef.current === signature) {
      return;
    }
    handledTrainingTerminationSignatureRef.current = signature;
    if (isAutoplay) {
      setIsAutoplay(false);
    }
    setOrderEndPrompt(null);
    setHint(
      reasonCode === "NO_POSITION_AND_CANNOT_OPEN"
        ? tt("appText.openPositionRemainsMinimumTradeUnitLongerOpen")
        : reasonCode === "NO_FUTURE_DATA"
          ? tt("appText.futureBarsLeftOpenPositionRemainsFreeReplay")
          : tt("appText.futureBarsLeftRemainingPositionLongerResolvedUnder"),
    );
    void openResetAllDialog({ terminationReasonCode: reasonCode });
  }, [
    isAutoplay,
    openResetAllDialog,
    sessionId,
    setHint,
    setIsAutoplay,
    setOrderEndPrompt,
    snapshot,
    tt,
  ]);
  const {
    isNativeImportDragActive,
    historyReplayChartBindings,
    sidebarGroups,
    clearPendingWindowDrag,
    startWindowDrag,
    continueWindowDrag,
    toggleWindowMaximize,
  } = useAppRootNavigationShellBindings({
    activePage,
    setActivePage,
    isPreparingCsvImportPreview,
    isClearingLocalDataSources,
    deletingSamplePoolId,
    openCsvFolderPickerAndPrepareImport,
    openCsvFolderPathAndPrepareImport,
    labels: shellNavigationLabels,
    prefetchWorkspacePageData,
  });
  useEffect(() => {
    const openSettings = (requestedTab: SystemSettingsTabId) => {
      prefetchWorkspacePageData("SETTINGS");
      setRequestedSystemSettingsTab(requestedTab);
      setActivePage("SETTINGS");
    };
    return api.subscribeToDesktopMenuCommands((command) => {
      switch (command) {
        case "OPEN_SETTINGS":
          openSettings("GENERAL");
          break;
        case "NEW_FREE_REPLAY":
          prefetchWorkspacePageData("TRAINER");
          resetTrainerToPrepView();
          setActivePage("TRAINER");
          break;
        case "OPEN_FREE_REPLAY":
          prefetchWorkspacePageData("TRAINER");
          setActivePage("TRAINER");
          break;
        case "OPEN_MARKET_DATA_IMPORT":
        case "OPEN_DATA":
          prefetchWorkspacePageData("DATA");
          setActivePage("DATA");
          break;
        case "OPEN_COMMAND_CENTER":
          prefetchWorkspacePageData("COMMAND_CENTER");
          setActivePage("COMMAND_CENTER");
          break;
        case "OPEN_KEYBOARD_SHORTCUTS":
          setShowShortcutModal(true);
          break;
        default:
          break;
      }
    });
  }, [
    prefetchWorkspacePageData,
    resetTrainerToPrepView,
    setActivePage,
    setError,
    setRequestedSystemSettingsTab,
    setShowShortcutModal,
    tt,
  ]);
  useEffect(() => installI18nAuditBridge(), []);
  return {
    actionDialogDesc,
    actionDialogReplayMetrics,
    actionDialogTitle,
    archiveCurrentTrainingProject,
    cancelRenameTrainingProject,
    clearAllTrainingProjects,
    clearPendingWindowDrag,
    confirmActionDialog,
    continueWindowDrag,
    deleteTrainingProject,
    deleteTrainingProjects,
    handleTrainingProjectsChanged,
    historyReplayChartBindings,
    globalResetRevision,
    isNativeImportDragActive,
    openResetAllDialog,
    resetAllStoredData,
    saveRenameTrainingProject,
    sidebarGroups,
    startRenameTrainingProject,
    startWindowDrag,
    toggleWindowMaximize,
  };
};
