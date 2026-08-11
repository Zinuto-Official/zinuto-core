// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getTrainingCommandCenterContent,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";
import type {
  TrainingCommandCenterPageProps,
  TrainingCommandCenterHeroCardView,
} from "@/workspaces/command-center/trainingCommandCenterTypes";
import {
  createEmptyCommandCenterReadModelSnapshot,
  loadCommandCenterReadModelSnapshot,
  type CommandCenterReadModelSnapshot,
} from "@/workspaces/command-center/trainingCommandCenterDataLoader";
import { launchFreeReplayFromCommandCenter } from "@/workspaces/command-center/strategyLaunchBehavior";
import {
  buildFlashMetricPresentation,
  buildRecentActivities,
  buildRiskMetricPresentation,
  buildStrategyMetricPresentation,
  replaceTemplate,
  type SpecialTrainingCommandCenterModeId,
} from "@/workspaces/command-center/trainingCommandCenterMetricPresenters";

export type UseTrainingCommandCenterPageControllerArgs = {
  isActive: boolean;
  language: AppUiLanguage;
  ui: UiLabelEntry;
  onStatsError?: (message: string) => void;
  onSelectPage: (page: WorkspacePage) => void;
  canResumeTrainerSession: boolean;
  onResumeTrainerSession: () => void;
  onNavigateToSpecialTrainingMode: (
    modeId: "fast-decision-training" | "risk-discipline-training",
  ) => void;
  trainerBridge: {
    freeReplaySetup: {
      samplePoolOptions: Array<{ value: string; label: string }>;
      selectedPoolDataTraits: Array<{
        id: "assetClass" | "marketPreset" | "sourceTimeframe";
        label: string;
        value: string;
      }>;
      selectedSymbol: string;
      selectedSamplePoolId: string;
      selectedMinimumBaseTimeframe: string;
      selectedMode: "FOCUSED" | "RANDOM";
      isPrepMode: boolean;
      startDisabled: boolean;
      onStart: () => void;
      onResetToPrepView: () => void;
    };
  };
  notesBridge: {
    formatReplayNoteTime: (value: string) => string;
    onSelectReplayNoteId: (id: string) => void;
  };
};

export const useTrainingCommandCenterPageController = ({
  isActive,
  language,
  ui,
  onSelectPage,
  canResumeTrainerSession,
  onResumeTrainerSession,
  onNavigateToSpecialTrainingMode,
  trainerBridge,
  notesBridge,
}: UseTrainingCommandCenterPageControllerArgs): TrainingCommandCenterPageProps => {
  const content = getTrainingCommandCenterContent(language);
  const [commandCenterSnapshot, setCommandCenterSnapshot] =
    useState<CommandCenterReadModelSnapshot>(
      createEmptyCommandCenterReadModelSnapshot,
    );
  const {
    fastReport,
    riskReport,
    strategyReport,
    latestResumableSession,
    latestResumableSnapshot,
    recentReplayNotes,
    dataCenterSummary,
  } = commandCenterSnapshot;
  const readModelReloadRequestIdRef = useRef(0);
  const reloadCommandCenterReadModel = useCallback(() => {
    const requestId = readModelReloadRequestIdRef.current + 1;
    readModelReloadRequestIdRef.current = requestId;
    void loadCommandCenterReadModelSnapshot()
      .then((snapshot) => {
        if (requestId !== readModelReloadRequestIdRef.current) {
          return;
        }
        setCommandCenterSnapshot(snapshot);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    reloadCommandCenterReadModel();
  }, [isActive, reloadCommandCenterReadModel]);

  const dataCenterMetricItems = useMemo(
    () => [
      {
        id: "pool-count",
        value: String(Math.max(0, Number(dataCenterSummary.poolCount) || 0)),
        label: content.strategyPoolUnitLabel,
      },
      {
        id: "symbol-count",
        value: String(Math.max(0, Number(dataCenterSummary.symbolCount) || 0)),
        label: content.strategySymbolUnitLabel,
      },
    ],
    [
      content.strategyPoolUnitLabel,
      content.strategySymbolUnitLabel,
      dataCenterSummary.poolCount,
      dataCenterSummary.symbolCount,
    ],
  );

  const strategyMetric = useMemo(
    () =>
      buildStrategyMetricPresentation({
        content,
        language,
        notesBridge,
        trainerBridge,
        strategyReport,
        latestResumableSession,
        latestResumableSnapshot,
      }),
    [
      content,
      language,
      latestResumableSession,
      latestResumableSnapshot,
      notesBridge,
      strategyReport,
      trainerBridge,
    ],
  );

  const flashMetric = useMemo(
    () =>
      buildFlashMetricPresentation({
        content,
        language,
        report: fastReport,
      }),
    [content, fastReport, language],
  );

  const riskMetric = useMemo(
    () =>
      buildRiskMetricPresentation({
        content,
        language,
        report: riskReport,
      }),
    [content, language, riskReport],
  );

  const heroCards = useMemo<TrainingCommandCenterHeroCardView[]>(() => {
    const canContinueTrainerSession =
      !trainerBridge.freeReplaySetup.isPrepMode ||
      canResumeTrainerSession ||
      commandCenterSnapshot.actions.resumeTrainer.enabled;
    const handleLaunchStrategy = () => {
      launchFreeReplayFromCommandCenter({
        canResumeTrainerSession: canContinueTrainerSession,
        hasActiveTrainerSession: !trainerBridge.freeReplaySetup.isPrepMode,
        onSelectPage,
        onResumeTrainerSession,
      });
    };
    const buildSpecialTrainingPrimaryAction = (
      targetModeId: SpecialTrainingCommandCenterModeId,
      label: string,
    ) => {
      return {
        label,
        tone: "tonal" as const,
        onClick: () => onNavigateToSpecialTrainingMode(targetModeId),
        iconName: "actionArrowRight" as const,
      };
    };
    return [
      {
        id: "strategy",
        title: ui.navTrainer,
        summary: content.strategySummary,
        iconName: "navTrainer",
        metricLabel: strategyMetric.metricLabel,
        metricValue: strategyMetric.metricValue,
        metricSupport: strategyMetric.metricSupport,
        primaryAction: {
          label: canContinueTrainerSession
            ? content.strategySecondaryAction
            : content.strategyPrimaryAction,
          tone: "primary",
          onClick: handleLaunchStrategy,
          iconName: canContinueTrainerSession
            ? "actionPlay"
            : "actionArrowRight",
        },
      },
      {
        id: "flash",
        title: ui.commandCenterFlashTitle,
        summary: content.flashSummary,
        iconName: "challengeModeFastDecisionHero",
        metricLabel: flashMetric.metricLabel,
        metricValue: flashMetric.metricValue,
        metricSupport: flashMetric.metricSupport,
        primaryAction: buildSpecialTrainingPrimaryAction(
          "fast-decision-training",
          content.flashPrimaryAction,
        ),
      },
      {
        id: "crisis",
        title: ui.commandCenterCrisisTitle,
        summary: content.crisisSummary,
        iconName: "challengeModeRiskDisciplineHero",
        metricLabel: riskMetric.metricLabel,
        metricValue: riskMetric.metricValue,
        metricSupport: riskMetric.metricSupport,
        primaryAction: buildSpecialTrainingPrimaryAction(
          "risk-discipline-training",
          content.crisisPrimaryAction,
        ),
      },
    ];
  }, [
    content.crisisPrimaryAction,
    content.crisisSummary,
    canResumeTrainerSession,
    commandCenterSnapshot.actions.resumeTrainer.enabled,
    content.flashPrimaryAction,
    content.flashSummary,
    content.strategyPrimaryAction,
    content.strategySecondaryAction,
    content.strategySummary,
    flashMetric,
    onNavigateToSpecialTrainingMode,
    onResumeTrainerSession,
    onSelectPage,
    riskMetric,
    strategyMetric,
    trainerBridge.freeReplaySetup.isPrepMode,
    ui.commandCenterCrisisTitle,
    ui.commandCenterFlashTitle,
    ui.navTrainer,
  ]);

  const recentActivities = useMemo(
    () =>
      buildRecentActivities({
        language,
        notesBridge,
        recentReplayNotes,
        onSelectPage,
      }),
    [language, notesBridge, onSelectPage, recentReplayNotes],
  );

  return {
    eyebrow: content.eyebrow,
    title: content.title,
    heroSection: {
      title: content.heroSectionTitle,
      subtitle: content.heroSectionSubtitle,
      cards: heroCards,
    },
    utilitySection: {
      title: content.utilitySectionTitle,
      subtitle: content.utilitySectionSubtitle,
      dataCenter: {
        title: content.dataCenterTitle,
        subtitle: content.dataCenterSubtitle,
        summaryLabel: content.dataCenterSummaryLabel,
        actionLabel: content.dataCenterAction,
        summary: replaceTemplate(
          content.strategyDatasetTemplate,
          Math.max(0, Number(dataCenterSummary.poolCount) || 0),
          Math.max(0, Number(dataCenterSummary.symbolCount) || 0),
        ),
        summaryItems: dataCenterMetricItems,
        onOpen: () => onSelectPage("DATA"),
      },
      recentActivities: {
        title: content.recentActivitiesTitle,
        moreActionLabel: content.recentActivitiesMoreAction,
        onOpenMore: () => onSelectPage("NOTES"),
        emptyText: content.recentActivitiesEmpty,
        emptyHintText: content.recentActivitiesEmptyHint,
        items: recentActivities,
      },
    },
  };
};
