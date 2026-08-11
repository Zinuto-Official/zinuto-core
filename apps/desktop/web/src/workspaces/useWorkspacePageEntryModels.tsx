// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useMemo,
  useState,
} from "react";
import { useStableSamplePools } from "@/workspaces/trainer/useStableSamplePools";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { AppUiLanguage, SpecialTrainingModeId } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import type {
  SpecialTrainingChallengeReviewNoteRequest,
  SpecialTrainingChartSyncHandler,
  SpecialTrainingLaunchRequest,
  SpecialTrainingShortcutBindings,
} from "@/domains/special-training/specialTrainingContracts";
import type { TrainerChartWorkspaceProps } from "@/domains/trainer/TrainerChartWorkspace";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";
import {
  type DiagnosticHistoryDeps,
} from "@/workspaces/history/DiagnosticCenterWorkspacePage";
import type { HistoryWorkspacePageProps } from "@/workspaces/history/HistoryWorkspacePage";
import type {
  ChallengeFusionDashboardChartBindings,
} from "@/workspaces/challenge-stats/ChallengeFusionDashboard";
import { resolveSpecialTrainingLaunchRequest } from "@/workspaces/command-center/specialTrainingLaunchRequest";

type UseWorkspacePageEntryModelsArgs = {
  onSelectPage: (page: WorkspacePage) => void;
  tt: (key: AppTextKey) => string;
  ui: UiLabelEntry;
  language: AppUiLanguage;
  historyWorkspacePageProps: HistoryWorkspacePageProps;
  sharedTrainerChartWorkspaceProps: Omit<TrainerChartWorkspaceProps, "topBar">;
  enabledSamplePoolSymbols: string[];
  enabledSamplePools: Array<{
    id: string;
    name: string;
    assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
    assetClassLabel: string;
    marketPresetId: string;
    baseTimeframe: "1m" | "5m" | "1h" | "1d";
    symbols: string[];
    instruments: Array<{
      instrumentId: string;
      symbol: string;
      barCount?: number;
      timeStartTs?: string | null;
      timeEndTs?: string | null;
    }>;
    questionBankRevisionToken: string;
  }>;
  globalResetRevision: number;
  onSpecialTrainingChartSync: SpecialTrainingChartSyncHandler;
  onSpecialTrainingShortcutBindingsChange: (
    payload: SpecialTrainingShortcutBindings | null,
  ) => void;
  onCreateSpecialTrainingChallengeReviewNote: (
    payload: SpecialTrainingChallengeReviewNoteRequest,
  ) => void;
  resolveSamplePoolDisplayName: (
    samplePoolId: string,
    fallbackName?: string,
  ) => string;
  onStatsError: (message: string) => void;
};

export const useWorkspacePageEntryModels = ({
  onSelectPage,
  tt,
  ui,
  language,
  historyWorkspacePageProps,
  sharedTrainerChartWorkspaceProps,
  enabledSamplePoolSymbols,
  enabledSamplePools,
  globalResetRevision,
  onSpecialTrainingChartSync,
  onSpecialTrainingShortcutBindingsChange,
  onCreateSpecialTrainingChallengeReviewNote,
  resolveSamplePoolDisplayName,
  onStatsError,
}: UseWorkspacePageEntryModelsArgs) => {
  const [specialTrainingLaunchRequest, setSpecialTrainingLaunchRequest] =
    useState<SpecialTrainingLaunchRequest | null>(null);
  const stableEnabledSamplePools = useStableSamplePools(enabledSamplePools);

  const openChartSettingsModal = useCallback(() => {
    historyWorkspacePageProps.setShowChartSettingsModal(true);
  }, [historyWorkspacePageProps]);

  const diagnosticHistoryDeps = useMemo<DiagnosticHistoryDeps>(
    () => ({
      samplePoolAllId: historyWorkspacePageProps.samplePoolAllId,
      trainingProjects: historyWorkspacePageProps.trainingProjects,
      historyProjectsNextCursor: historyWorkspacePageProps.historyProjectsNextCursor,
      isHistoryProjectsLoading: historyWorkspacePageProps.isHistoryProjectsLoading,
      isHistoryProjectsLoadingMore:
        historyWorkspacePageProps.isHistoryProjectsLoadingMore,
      loadMoreTrainingProjects:
        historyWorkspacePageProps.loadMoreTrainingProjects,
      editingProjectId: historyWorkspacePageProps.editingProjectId,
      editingProjectName: historyWorkspacePageProps.editingProjectName,
      startRenameTrainingProject:
        historyWorkspacePageProps.startRenameTrainingProject,
      saveRenameTrainingProject:
        historyWorkspacePageProps.saveRenameTrainingProject,
      cancelRenameTrainingProject:
        historyWorkspacePageProps.cancelRenameTrainingProject,
      setEditingProjectName: historyWorkspacePageProps.setEditingProjectName,
      deleteTrainingProject: historyWorkspacePageProps.deleteTrainingProject,
      deleteTrainingProjects: historyWorkspacePageProps.deleteTrainingProjects,
      clearAllTrainingProjects:
        historyWorkspacePageProps.clearAllTrainingProjects,
      effectiveThemeMode: historyWorkspacePageProps.effectiveThemeMode,
      showGlobalDecimals: historyWorkspacePageProps.showGlobalDecimals,
      priceColorMode: historyWorkspacePageProps.priceColorMode,
      tradeColorTheme: historyWorkspacePageProps.tradeColorTheme,
      trainerDisplayPeriod: historyWorkspacePageProps.trainerDisplayPeriod,
      trainerPeriodOptionsByBase:
        historyWorkspacePageProps.trainerPeriodOptionsByBase,
      historyReplayChartBindings:
        historyWorkspacePageProps.historyReplayChartBindings,
      chartRenderMode: historyWorkspacePageProps.chartRenderMode,
      setChartRenderMode: historyWorkspacePageProps.setChartRenderMode,
      showChartSettingsModal: historyWorkspacePageProps.showChartSettingsModal,
      openChartSettingsModal,
      setTrainerDisplayPeriod: historyWorkspacePageProps.setTrainerDisplayPeriod,
      createSystemMarkers: historyWorkspacePageProps.createSystemMarkers,
      createHistoryReviewReplayNote:
        historyWorkspacePageProps.createHistoryReviewReplayNote,
      formatMoney: historyWorkspacePageProps.formatMoney,
      formatRatio: historyWorkspacePageProps.formatRatio,
      withCountUnit: historyWorkspacePageProps.withCountUnit,
    }),
    [historyWorkspacePageProps],
  );

  const reviewSnapshotChart = useMemo(
    () => ({
      themeMode: historyWorkspacePageProps.effectiveThemeMode,
      showGlobalDecimals: historyWorkspacePageProps.showGlobalDecimals,
      priceColorMode: historyWorkspacePageProps.priceColorMode,
      tradeColorTheme: historyWorkspacePageProps.tradeColorTheme,
      trainerDisplayPeriod: historyWorkspacePageProps.trainerDisplayPeriod,
      chartRenderMode: historyWorkspacePageProps.chartRenderMode,
      onChartRenderModeChange: historyWorkspacePageProps.setChartRenderMode,
      showChartSettingsModal: historyWorkspacePageProps.showChartSettingsModal,
      openChartSettingsModal,
      setTrainerDisplayPeriod: historyWorkspacePageProps.setTrainerDisplayPeriod,
      trainerPeriodOptionsByBase:
        historyWorkspacePageProps.trainerPeriodOptionsByBase,
      bindings: historyWorkspacePageProps.historyReplayChartBindings,
      createSystemMarkers: historyWorkspacePageProps.createSystemMarkers,
    }),
    [historyWorkspacePageProps, openChartSettingsModal],
  );

  const challengeChartBindings =
    useMemo<ChallengeFusionDashboardChartBindings>(
      () => ({
        themeMode: historyWorkspacePageProps.effectiveThemeMode,
        showGlobalDecimals: historyWorkspacePageProps.showGlobalDecimals,
        priceColorMode: historyWorkspacePageProps.priceColorMode,
        tradeColorTheme: historyWorkspacePageProps.tradeColorTheme,
        trainerDisplayPeriod: historyWorkspacePageProps.trainerDisplayPeriod,
        trainerPeriodOptionsByBase:
          historyWorkspacePageProps.trainerPeriodOptionsByBase,
        historyReplayChartBindings:
          historyWorkspacePageProps.historyReplayChartBindings,
        chartRenderMode: historyWorkspacePageProps.chartRenderMode,
        setChartRenderMode: historyWorkspacePageProps.setChartRenderMode,
        showChartSettingsModal: historyWorkspacePageProps.showChartSettingsModal,
        openChartSettingsModal,
        setTrainerDisplayPeriod: historyWorkspacePageProps.setTrainerDisplayPeriod,
        createSystemMarkers: historyWorkspacePageProps.createSystemMarkers,
      }),
      [historyWorkspacePageProps, openChartSettingsModal],
    );

  const handleNavigateToSpecialTraining = useCallback(
    (modeId: SpecialTrainingModeId) => {
      setSpecialTrainingLaunchRequest((current) =>
        resolveSpecialTrainingLaunchRequest({
          requestedModeId: modeId,
          previousRequestId: current?.requestId ?? null,
        }),
      );
      onSelectPage("SPECIAL_TRAINING");
    },
    [onSelectPage],
  );

  const specialTrainingEntryProps = useMemo(
    () => ({
      language,
      ui,
      enabledSamplePoolSymbols,
      enabledSamplePools: stableEnabledSamplePools,
      globalResetRevision,
      sharedTrainerChartWorkspaceProps,
      reviewSnapshotChart,
      launchRequest: specialTrainingLaunchRequest,
      onSyncChartQuestion: onSpecialTrainingChartSync,
      onShortcutBindingsChange: onSpecialTrainingShortcutBindingsChange,
      onCreateChallengeReviewNote: onCreateSpecialTrainingChallengeReviewNote,
    }),
    [
      enabledSamplePoolSymbols,
      globalResetRevision,
      stableEnabledSamplePools,
      language,
      onCreateSpecialTrainingChallengeReviewNote,
      onSpecialTrainingChartSync,
      onSpecialTrainingShortcutBindingsChange,
      reviewSnapshotChart,
      sharedTrainerChartWorkspaceProps,
      specialTrainingLaunchRequest,
      ui,
    ],
  );

  const challengeStatsEntryProps = useMemo(
    () => ({
      language,
      ui,
      tt,
      viewMode: "challenge" as const,
      resolveSamplePoolName: (
        samplePoolId: string,
        fallbackName?: string,
      ) => resolveSamplePoolDisplayName(samplePoolId, fallbackName || ""),
      challengeInitialProfitability: "ALL" as const,
      challengeChartBindings,
      onError: onStatsError,
    }),
    [
      challengeChartBindings,
      language,
      onStatsError,
      resolveSamplePoolDisplayName,
      tt,
      ui,
    ],
  );

  return {
    diagnosticHistoryDeps,
    navigateToSpecialTrainingMode: handleNavigateToSpecialTraining,
    specialTrainingEntryProps,
    challengeStatsEntryProps,
  };
};
