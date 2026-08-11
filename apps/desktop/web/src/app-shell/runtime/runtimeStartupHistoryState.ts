// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type { ActiveDrawTool } from "@/domains/chart/drawingTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  api,
  type ApiDesktopWorkspaceId,
  type ApiLocalDataSourceSummary,
} from "@/api";
import { useReplayNotes } from "@/workspaces/notes/useReplayNotes";
import { useHistoryProjectsOrchestrator } from "@/domains/history/useHistoryProjectsOrchestrator";
import { resetSharedStatsViewCache } from "@/workspaces/challenge-stats/trainingStatsViewCache";
import { prefetchTrainingStatsPageView } from "@/workspaces/challenge-stats/useTrainingStatsPageController";
import {
  type CsvPoolNamingStrategy,
  type PendingCsvPlanOverride,
} from "@/app-shell/appCsvImportContracts";
import { type SpecialTrainingShortcutBindings } from "@/domains/special-training/specialTrainingContracts";
import { useSpecialTrainingChartSyncState } from "@/app-shell/useSpecialTrainingChartSyncState";
import {
  resolveSystemTimeZone
} from "@zinuto/shared/timezone";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import {
  HISTORY_PROJECT_PAGE_SIZE,
  REPLAY_NOTE_PAGE_SIZE,
} from "@/frontend-kernel/runtimeConstants";
import { mapApiTrainingProjectToLocal } from "@/app-shell/appProjectMapping";
import { mapApiReplayNoteToLocal } from "@/domains/notes/replayNoteMapping";
import {
  type DrawToolScopePage,
  resolveDrawToolScopePage,
} from "@/app-shell/appRootDataConfigUtils";
import {
  DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE,
} from "@/ui/config/uiConfig";
import {
  SAMPLE_POOL_ALL_ID,
} from "@/domains/trainer/samplePools";
import { useCsvImportController } from "@/domains/data-import/useCsvImportController";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





export const useRuntimeStartupHistoryState = (scope: RuntimeHookScope) => {
  const { activeDrawTool, activePage, isBusy, language, persistedUi, sessionId, setActiveTrainingRecordNoteId, setError, setIsCsvImporting, setSelectedReplayNoteId, setTrainerHydrationState, trainerHydrationState, tt } = scope;
useEffect(() => {
    if (!sessionId && !isBusy && trainerHydrationState !== "FAILED") {
      setTrainerHydrationState("IDLE");
    }
  }, [isBusy, sessionId, trainerHydrationState]);
  const drawToolByScopePageRef = useRef<Record<DrawToolScopePage, ActiveDrawTool>>({
    TRAINER: activeDrawTool,
    SPECIAL_TRAINING: "cursor",
  });
  const lastDrawToolScopePageRef = useRef<DrawToolScopePage | null>(resolveDrawToolScopePage(activePage));
  const [localDataSourceSummaries, setLocalDataSourceSummaries] = useState<ApiLocalDataSourceSummary[]>([]);
  const [pendingCsvPoolNamingStrategy, setPendingCsvPoolNamingStrategy] = useState<CsvPoolNamingStrategy>("FLAT");
  const [pendingCsvPlanOverrides, setPendingCsvPlanOverrides] = useState<Record<string, PendingCsvPlanOverride>>({});
  const [pendingCsvImportTimeZone, setPendingCsvImportTimeZone] = useState<string>(() => resolveSystemTimeZone());
  const [pendingCsvImportTimeZoneMode, setPendingCsvImportTimeZoneMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [pendingCsvImportTimeZoneConfirmationKey, setPendingCsvImportTimeZoneConfirmationKey] = useState('');
  const { specialTrainingChartState, specialTrainingChartBaseTimeframe, syncSpecialTrainingChartState } = useSpecialTrainingChartSyncState();
  const [specialTrainingShortcutBindings, setSpecialTrainingShortcutBindings] = useState<SpecialTrainingShortcutBindings | null>(null);
  const handleReplayNotesError = useCallback((message: string) => {
    setError(message);
  }, []);
  const {
    replayNotes,
    setReplayNotes,
    replayNotesRef,
    isReplayNotesLoading,
    isReplayNotesLoadingMore,
    hasReplayNotesHydrated,
    replayNotesTotal,
    replayNotesNextCursor,
    loadReplayNotesPage,
    loadMoreReplayNotes,
    ensureReplayNoteDetail,
    mergeReplayNotesInState,
    upsertReplayNoteInState,
    clearReplayNotePendingState,
    clearAllReplayNotePendingState,
    flushReplayNotePatch,
    scheduleReplayNotePatch,
    setReplayNotesNextCursor,
  } = useReplayNotes<ArchivedReplayData, DisplayPeriodKey>({
    pageSize: REPLAY_NOTE_PAGE_SIZE,
    mapApiReplayNoteToLocal,
    onError: handleReplayNotesError,
  });

  const appIsMountedRef = useRef(true);
  const isPlacingOrderRef = useRef(false);
  const isGlobalResetInProgressRef = useRef(false);
  const globalResetProgressHideTimerRef = useRef<number | null>(null);
  const globalResetProgressPercentRef = useRef(0);
  const clearingLocalDataSourcesProgressPercentRef = useRef(0);
  const activeCsvImportBatchCountRef = useRef(0);
  const lastLiveRuntimeSyncAtRef = useRef(0);
  const autoSyncSymbolKeyRef = useRef("");
  const manualPoolSwitchTokenRef = useRef(0);
  const manualPoolSwitchLoadingRef = useRef(false);
  const lastCsvImportFolderOpenRef = useRef<{ path: string; at: number }>({
    path: "",
    at: 0,
  });
  const historyProjectsWarmupTaskRef = useRef<Promise<void> | null>(null);
  const replayNotesWarmupTaskRef = useRef<Promise<void> | null>(null);
  const challengeStatsWarmupTaskRef = useRef<Promise<void> | null>(null);
  const workspaceReadModelWarmupTaskRef = useRef<
    Partial<Record<ApiDesktopWorkspaceId, Promise<void>>>
  >({});
  const strategyBacktestBatchesWarmupTaskRef =
    useRef<Promise<void> | null>(null);
  const {
    trainingProjects,
    setTrainingProjects,
    historyProjectsNextCursor,
    setHistoryProjectsNextCursor,
    isHistoryProjectsLoading,
    isHistoryProjectsLoadingMore,
    hasHistoryProjectsHydrated,
    selectedHistoryProjectId,
    setSelectedHistoryProjectId,
    historyKeyword,
    setHistoryKeyword,
    historyProfitFilter,
    setHistoryProfitFilter,
    historySamplePoolFilter,
    setHistorySamplePoolFilter,
    loadTrainingProjectsPage,
    loadMoreTrainingProjects,
    ensureTrainingProjectDetail,
    upsertTrainingProjectInState,
    cleanupHistoryProjectRequests,
    markHistoryProjectLoaded,
    unmarkHistoryProjectLoaded,
    clearLoadedHistoryProjectIds,
  } = useHistoryProjectsOrchestrator({
    pageSize: HISTORY_PROJECT_PAGE_SIZE,
    samplePoolAllId: SAMPLE_POOL_ALL_ID,
    initialHistorySamplePoolFilter:
      typeof persistedUi.historySamplePoolFilter === "string" && persistedUi.historySamplePoolFilter.trim()
        ? persistedUi.historySamplePoolFilter
        : SAMPLE_POOL_ALL_ID,
    appIsMountedRef,
    mapApiTrainingProjectToLocal,
    listTrainingProjects: api.listTrainingProjects,
    getTrainingProject: api.getTrainingProject,
    setError,
    listErrorFallbackText: tt("appText.readHistoricalTraining"),
  });
  const handleSystemDevSimulationDataChanged = useCallback(
    async ({ reason }: { reason: "success" | "cleanup" }) => {
      resetSharedStatsViewCache();
      historyProjectsWarmupTaskRef.current = null;
      replayNotesWarmupTaskRef.current = null;
      challengeStatsWarmupTaskRef.current = null;
      clearLoadedHistoryProjectIds();
      if (reason === "cleanup") {
        clearAllReplayNotePendingState();
        setTrainingProjects([]);
        setHistoryProjectsNextCursor(null);
        setSelectedHistoryProjectId("");
        setReplayNotes([]);
        setReplayNotesNextCursor(null);
        setSelectedReplayNoteId("");
        setActiveTrainingRecordNoteId("");
      }
      await Promise.allSettled([loadTrainingProjectsPage(false, null), loadReplayNotesPage(false, null)]);
    },
    [
      clearAllReplayNotePendingState,
      clearLoadedHistoryProjectIds,
      loadReplayNotesPage,
      loadTrainingProjectsPage,
      setActiveTrainingRecordNoteId,
      setHistoryProjectsNextCursor,
      setReplayNotes,
      setReplayNotesNextCursor,
      setSelectedHistoryProjectId,
      setSelectedReplayNoteId,
      setTrainingProjects,
    ],
  );
  const prefetchWorkspacePageData = useCallback(
    (page: typeof activePage) => {
      const warmWorkspaceReadModel = (workspaceId: ApiDesktopWorkspaceId) => {
        if (workspaceReadModelWarmupTaskRef.current[workspaceId]) {
          return;
        }
        workspaceReadModelWarmupTaskRef.current[workspaceId] = api
          .getWorkspaceReadModel(workspaceId)
          .then(() => undefined)
          .catch(() => {
            // Sidebar warmup is best-effort; failures should not interrupt navigation.
          })
          .finally(() => {
            delete workspaceReadModelWarmupTaskRef.current[workspaceId];
          });
      };

      if (page === "HISTORY") {
        if (!hasHistoryProjectsHydrated && !historyProjectsWarmupTaskRef.current && !isHistoryProjectsLoading && !isHistoryProjectsLoadingMore) {
          historyProjectsWarmupTaskRef.current = loadTrainingProjectsPage(false, null).finally(() => {
            historyProjectsWarmupTaskRef.current = null;
          });
        }
        return;
      }
      if (page === "NOTES") {
        if (!hasReplayNotesHydrated && !replayNotesWarmupTaskRef.current && !isReplayNotesLoading && !isReplayNotesLoadingMore) {
          replayNotesWarmupTaskRef.current = loadReplayNotesPage(false, null).finally(() => {
            replayNotesWarmupTaskRef.current = null;
          });
        }
        return;
      }
      if (page === "CHALLENGE_STATS" && !challengeStatsWarmupTaskRef.current) {
        challengeStatsWarmupTaskRef.current = prefetchTrainingStatsPageView({
          viewMode: "challenge",
          challengeInitialProfitability: "ALL",
        })
          .catch(() => {
            // Sidebar warmup is best-effort; failures should not take down the app shell.
          })
          .finally(() => {
            challengeStatsWarmupTaskRef.current = null;
          });
        warmWorkspaceReadModel("challenge-stats");
        return;
      }
      if (page === "COMMAND_CENTER") {
        warmWorkspaceReadModel("command-center");
        return;
      }
      if (page === "TRAINER") {
        warmWorkspaceReadModel("trainer");
        return;
      }
      if (page === "SPECIAL_TRAINING") {
        warmWorkspaceReadModel("special-training");
        return;
      }
      if (page === "CUSTOM_INDICATOR") {
        warmWorkspaceReadModel("custom-indicator");
        return;
      }
      if (page === "DATA") {
        warmWorkspaceReadModel("data-management");
        return;
      }
      if (page === "SETTINGS") {
        warmWorkspaceReadModel("settings");
        return;
      }
      if (page === "STRATEGY_BACKTEST") {
        warmWorkspaceReadModel("strategy-backtest");
        if (!strategyBacktestBatchesWarmupTaskRef.current) {
          strategyBacktestBatchesWarmupTaskRef.current = api
            .listBacktestBatches()
            .then(() => undefined)
            .catch(() => undefined)
            .finally(() => {
              strategyBacktestBatchesWarmupTaskRef.current = null;
            });
        }
      }
    },
    [
      hasHistoryProjectsHydrated,
      hasReplayNotesHydrated,
      isHistoryProjectsLoading,
      isHistoryProjectsLoadingMore,
      isReplayNotesLoading,
      isReplayNotesLoadingMore,
      loadReplayNotesPage,
      loadTrainingProjectsPage,
    ],
  );
  const {
    isPreparingCsvImportPreview,
    preparingCsvImportPreviewPercent,
    preparingCsvImportPreviewProgress,
    csvImportCardStates,
    csvImportCardControlAction,
    setCsvImportCardStates,
    setCsvImportCardControlAction,
    beginCsvImportPreviewProgress,
    updateCsvImportPreviewProgress,
    markCsvImportPreviewReady,
    finishCsvImportPreviewProgress,
    clearCsvImportCardState,
    patchCsvImportCardState,
  } = useCsvImportController(appIsMountedRef);
  const markCsvImportBatchStarted = useCallback(() => {
    activeCsvImportBatchCountRef.current += 1;
    if (appIsMountedRef.current) {
      setIsCsvImporting(true);
    }
  }, [setIsCsvImporting]);
  const markCsvImportBatchFinished = useCallback(() => {
    activeCsvImportBatchCountRef.current = Math.max(0, activeCsvImportBatchCountRef.current - 1);
    if (appIsMountedRef.current) {
      setIsCsvImporting(activeCsvImportBatchCountRef.current > 0);
    }
  }, [setIsCsvImporting]);
  const defaultReplayNoteTitle = DEFAULT_REPLAY_NOTE_TITLE_BY_LANGUAGE[language];
  const [activeReplayNoteEditorNoteId, setActiveReplayNoteEditorNoteId] =
    useState("");
  const deleteReplayNoteById = useCallback(
    async (noteId: string) => {
      const id = noteId.trim();
      if (!id) {
        return;
      }
      clearReplayNotePendingState(id);
      await api.deleteReplayNote(id);
      if (!appIsMountedRef.current) {
        return;
      }
      setReplayNotes((current) => current.filter((note) => note.id !== id));
      setActiveTrainingRecordNoteId((current) => (current === id ? "" : current));
      setActiveReplayNoteEditorNoteId((current) => (current === id ? "" : current));
    },
    [clearReplayNotePendingState, setReplayNotes, setActiveTrainingRecordNoteId],
  );
  const setReplayNotesKeywordRef =
    useRef<Dispatch<SetStateAction<string>>>(() => {});
  const forwardSetReplayNotesKeyword = useCallback(
    (value: SetStateAction<string>) => {
      setReplayNotesKeywordRef.current(value);
    },
    [],
  );
  const resetNotesPageControllerRef = useRef<() => void>(() => {});
  const resetNotesPageController = useCallback(() => {
    resetNotesPageControllerRef.current();
  }, []);
  return { activeCsvImportBatchCountRef, activeReplayNoteEditorNoteId, appIsMountedRef, autoSyncSymbolKeyRef, beginCsvImportPreviewProgress, challengeStatsWarmupTaskRef, cleanupHistoryProjectRequests, clearAllReplayNotePendingState, clearCsvImportCardState, clearLoadedHistoryProjectIds, clearReplayNotePendingState, clearingLocalDataSourcesProgressPercentRef, csvImportCardControlAction, csvImportCardStates, defaultReplayNoteTitle, deleteReplayNoteById, drawToolByScopePageRef, ensureReplayNoteDetail, ensureTrainingProjectDetail, finishCsvImportPreviewProgress, flushReplayNotePatch, forwardSetReplayNotesKeyword, globalResetProgressHideTimerRef, globalResetProgressPercentRef, handleReplayNotesError, handleSystemDevSimulationDataChanged, hasHistoryProjectsHydrated, hasReplayNotesHydrated, historyKeyword, historyProfitFilter, historyProjectsNextCursor, historyProjectsWarmupTaskRef, historySamplePoolFilter, isGlobalResetInProgressRef, isHistoryProjectsLoading, isHistoryProjectsLoadingMore, isPlacingOrderRef, isPreparingCsvImportPreview, isReplayNotesLoading, isReplayNotesLoadingMore, lastCsvImportFolderOpenRef, lastDrawToolScopePageRef, lastLiveRuntimeSyncAtRef, loadMoreReplayNotes, loadMoreTrainingProjects, loadReplayNotesPage, loadTrainingProjectsPage, localDataSourceSummaries, manualPoolSwitchLoadingRef, manualPoolSwitchTokenRef, markCsvImportBatchFinished, markCsvImportBatchStarted, markCsvImportPreviewReady, markHistoryProjectLoaded, mergeReplayNotesInState, patchCsvImportCardState, pendingCsvImportTimeZone, pendingCsvImportTimeZoneConfirmationKey, pendingCsvImportTimeZoneMode, pendingCsvPlanOverrides, pendingCsvPoolNamingStrategy, prefetchWorkspacePageData, preparingCsvImportPreviewPercent, preparingCsvImportPreviewProgress, replayNotes, replayNotesNextCursor, replayNotesRef, replayNotesTotal, replayNotesWarmupTaskRef, resetNotesPageController, resetNotesPageControllerRef, scheduleReplayNotePatch, selectedHistoryProjectId, setActiveReplayNoteEditorNoteId, setCsvImportCardControlAction, setCsvImportCardStates, setHistoryKeyword, setHistoryProfitFilter, setHistoryProjectsNextCursor, setHistorySamplePoolFilter, setLocalDataSourceSummaries, setPendingCsvImportTimeZone, setPendingCsvImportTimeZoneConfirmationKey, setPendingCsvImportTimeZoneMode, setPendingCsvPlanOverrides, setPendingCsvPoolNamingStrategy, setReplayNotes, setReplayNotesKeywordRef, setReplayNotesNextCursor, setSelectedHistoryProjectId, setSpecialTrainingShortcutBindings, setTrainingProjects, specialTrainingChartBaseTimeframe, specialTrainingChartState, specialTrainingShortcutBindings, syncSpecialTrainingChartState, trainingProjects, unmarkHistoryProjectLoaded, updateCsvImportPreviewProgress, upsertReplayNoteInState, upsertTrainingProjectInState };
};
