// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiRecentReplayNoteSummary,
  ApiSpecialTrainingStatsSummary,
  ApiTrainingStatsSummary,
} from "@/api";
import {
  REPLAY_NOTE_TYPE_LABEL_BY_LANGUAGE,
  getTrainingCommandCenterContent,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";
import type { SpecialTrainingResumableSessionModeId } from "@/domains/special-training/specialTrainingContracts";
import type {
  ResumableSessionSummary,
  SessionSnapshot,
} from "@/domains/training/types";
import type {
  TrainingCommandCenterHeroCardView,
  TrainingCommandCenterRecentActivityView,
} from "@/workspaces/command-center/trainingCommandCenterTypes";

export type TrainingCommandCenterMetricNotesBridge = {
  formatReplayNoteTime: (value: string) => string;
  onSelectReplayNoteId: (id: string) => void;
};

export type TrainingCommandCenterMetricTrainerBridge = {
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
  };
};

type SpecialTrainingCommandCenterModeId = SpecialTrainingResumableSessionModeId;
type CommandCenterContent = ReturnType<typeof getTrainingCommandCenterContent>;

export const replaceTemplate = (
  template: string,
  ...values: Array<string | number>
): string => {
  let message = template;
  values.forEach((value, index) => {
    message = message.replaceAll(`{${index}}`, String(value));
  });
  return message;
};

const toFiniteNumber = (value: unknown): number => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const formatCount = (language: AppUiLanguage, value: number): string =>
  new Intl.NumberFormat(language).format(Math.max(0, Math.floor(value)));

const formatAverage = (language: AppUiLanguage, value: number): string =>
  new Intl.NumberFormat(language, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(Math.max(0, toFiniteNumber(value)));

const formatPercent = (value: number, fractionDigits = 0): string =>
  `${(Math.max(0, toFiniteNumber(value)) * 100).toFixed(fractionDigits)}%`;

const formatProfitLossRatio = (
  content: CommandCenterContent,
  value: number,
): string => {
  const numeric = Number(value);
  if (numeric > 0 && !Number.isFinite(numeric)) {
    return content.strategyProfitRatioInfinity;
  }
  const safeValue = Math.max(0, Number.isFinite(numeric) ? numeric : 0);
  return replaceTemplate(
    content.strategyProfitRatioValueTemplate,
    safeValue.toFixed(safeValue >= 10 ? 0 : 1),
  );
};

export const buildFlashMetricPresentation = ({
  content,
  language,
  report,
}: {
  content: CommandCenterContent;
  language: AppUiLanguage;
  report: ApiSpecialTrainingStatsSummary | null;
}): Pick<
  TrainingCommandCenterHeroCardView,
  "metricLabel" | "metricValue" | "metricSupport"
> => {
  const rollingMetrics = report?.dashboardInsights?.fast?.RECENT_10 ?? null;

  if (rollingMetrics) {
    return {
      metricLabel: replaceTemplate(
        content.flashRecentMetricLabelTemplate,
        rollingMetrics.sampleCount,
      ),
      metricValue: formatPercent(rollingMetrics.effectiveHitRate),
      metricSupport: replaceTemplate(
        content.flashRecentMetricSupportTemplate,
        formatAverage(language, rollingMetrics.medianDecisionSeconds),
        formatPercent(rollingMetrics.observeMissRate),
      ),
    };
  }

  return {
    metricLabel: content.flashColdMetricLabel,
    metricValue: content.flashColdMetricValue,
    metricSupport: content.flashColdMetricSupport,
  };
};

const resolveRiskBehaviorLabel = ({
  content,
  behavior,
}: {
  content: CommandCenterContent;
  behavior: "CUT_LOSS" | "ADD_POSITION" | "FREEZE";
}): string => {
  if (behavior === "CUT_LOSS") {
    return content.crisisBehaviorCutLossLabel;
  }
  if (behavior === "ADD_POSITION") {
    return content.crisisBehaviorAddPositionLabel;
  }
  return content.crisisBehaviorFreezeLabel;
};

export const buildRiskMetricPresentation = ({
  content,
  language,
  report,
}: {
  content: CommandCenterContent;
  language: AppUiLanguage;
  report: ApiSpecialTrainingStatsSummary | null;
}): Pick<
  TrainingCommandCenterHeroCardView,
  "metricLabel" | "metricValue" | "metricSupport"
> => {
  const rollingMetrics = report?.dashboardInsights?.risk?.RECENT_10 ?? null;

  if (rollingMetrics) {
    const dominantBehaviorLabel = resolveRiskBehaviorLabel({
      content,
      behavior: rollingMetrics.dominantBehavior,
    });
    const metricSupport =
      rollingMetrics.dominantBehavior === "FREEZE"
        ? replaceTemplate(
            content.crisisRecentNoActionMetricSupportTemplate,
            dominantBehaviorLabel,
            formatPercent(rollingMetrics.dominantBehaviorShare),
          )
        : replaceTemplate(
            content.crisisRecentMetricSupportTemplate,
            dominantBehaviorLabel,
            formatPercent(rollingMetrics.dominantBehaviorShare),
            formatAverage(language, rollingMetrics.medianFirstActionBars),
          );
    return {
      metricLabel: replaceTemplate(
        content.crisisRecentMetricLabelTemplate,
        rollingMetrics.sampleCount,
      ),
      metricValue: formatPercent(rollingMetrics.positiveAlphaRate),
      metricSupport,
    };
  }

  return {
    metricLabel: content.crisisColdMetricLabel,
    metricValue: content.crisisColdMetricValue,
    metricSupport: content.crisisColdMetricSupport,
  };
};

export const buildStrategyMetricPresentation = ({
  content,
  language,
  notesBridge,
  trainerBridge,
  strategyReport,
  latestResumableSession,
  latestResumableSnapshot,
}: {
  content: CommandCenterContent;
  language: AppUiLanguage;
  notesBridge: TrainingCommandCenterMetricNotesBridge;
  trainerBridge: TrainingCommandCenterMetricTrainerBridge;
  strategyReport: ApiTrainingStatsSummary | null;
  latestResumableSession: ResumableSessionSummary | null;
  latestResumableSnapshot: SessionSnapshot | null;
}): Pick<
  TrainingCommandCenterHeroCardView,
  "metricLabel" | "metricValue" | "metricSupport"
> => {
  if (latestResumableSession) {
    const cursorIndex = Number(latestResumableSnapshot?.session?.cursor_index);
    const updatedAtLabel = notesBridge.formatReplayNoteTime(
      latestResumableSession.updatedAt,
    );
    return {
      metricLabel: content.strategyResumeMetricLabel,
      metricValue: replaceTemplate(
        content.strategyMetricPairTemplate,
        latestResumableSession.symbol,
        latestResumableSession.minimumBaseTimeframe ||
          latestResumableSession.timeframe,
      ),
      metricSupport:
        Number.isFinite(cursorIndex) && cursorIndex >= 0
          ? replaceTemplate(
              content.strategyResumeMetricSupportTemplate,
              formatCount(language, cursorIndex + 1),
              updatedAtLabel,
            )
          : updatedAtLabel,
    };
  }

  const recentMetrics = strategyReport?.comparisons.recent20VsPrevious20.left;
  if (recentMetrics && recentMetrics.sessionCount > 0) {
    return {
      metricLabel: replaceTemplate(
        content.strategyRecentMetricLabelTemplate,
        recentMetrics.sessionCount,
      ),
      metricValue: formatProfitLossRatio(
        content,
        recentMetrics.profitLossRatio,
      ),
      metricSupport: replaceTemplate(
        content.strategyRecentMetricSupportTemplate,
        formatPercent(recentMetrics.winRate),
        formatPercent(recentMetrics.maxDrawdownRate, 1),
      ),
    };
  }

  const freeReplaySetup = trainerBridge.freeReplaySetup;
  const assetClassLabel =
    freeReplaySetup.selectedPoolDataTraits.find(
      (trait) => trait.id === "assetClass",
    )?.value ?? "";
  const selectedSymbol = freeReplaySetup.selectedSymbol.trim().toUpperCase();
  const selectedSamplePoolName =
    freeReplaySetup.samplePoolOptions.find(
      (option) => option.value === freeReplaySetup.selectedSamplePoolId,
    )?.label ?? "";

  return {
    metricLabel: content.strategyEnvironmentMetricLabel,
    metricValue: replaceTemplate(
      content.strategyMetricPairTemplate,
      assetClassLabel,
      freeReplaySetup.selectedMinimumBaseTimeframe,
    ),
    metricSupport:
      freeReplaySetup.selectedMode === "FOCUSED"
        ? selectedSymbol
          ? replaceTemplate(
              content.strategyEnvironmentFocusedSupportTemplate,
              selectedSymbol,
            )
          : content.strategyEnvironmentFocusedSupportFallback
        : selectedSamplePoolName
          ? replaceTemplate(
              content.strategyEnvironmentRandomSupportTemplate,
              selectedSamplePoolName,
            )
          : content.strategyEnvironmentRandomSupportFallback,
  };
};

export const buildRecentActivities = ({
  language,
  notesBridge,
  recentReplayNotes,
  onSelectPage,
}: {
  language: AppUiLanguage;
  notesBridge: TrainingCommandCenterMetricNotesBridge;
  recentReplayNotes: ApiRecentReplayNoteSummary[];
  onSelectPage: (page: WorkspacePage) => void;
}): TrainingCommandCenterRecentActivityView[] => {
  const items: Array<TrainingCommandCenterRecentActivityView & { at: number }> =
    [];

  [...recentReplayNotes]
    .sort(
      (left, right) =>
        (Date.parse(right.updatedAt) || Date.parse(right.createdAt) || 0) -
        (Date.parse(left.updatedAt) || Date.parse(left.createdAt) || 0),
    )
    .slice(0, 2)
    .forEach((note) => {
      items.push({
        id: `note:${note.id}`,
        title: note.title,
        typeLabel:
          REPLAY_NOTE_TYPE_LABEL_BY_LANGUAGE[language]?.[note.type] ?? note.type,
        colorTokens: note.colorTokens ?? [],
        timeLabel: notesBridge.formatReplayNoteTime(note.updatedAt),
        onOpen: () => {
          notesBridge.onSelectReplayNoteId(note.id);
          onSelectPage("NOTES");
        },
        at: Date.parse(note.updatedAt) || 0,
      });
    });

  return items;
};

export type { SpecialTrainingCommandCenterModeId };
