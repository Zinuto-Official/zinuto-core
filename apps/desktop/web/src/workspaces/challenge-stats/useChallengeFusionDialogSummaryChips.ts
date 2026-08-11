// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import type { ReplayContextMetricTone } from "@/frontend-kernel/replayContext";
import {
  getSpecialTrainingPageContent,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  FAST_EDGE_S_THRESHOLD,
  type FastDirectionSelection,
  type RiskBehaviorType,
  type SessionRowModel,
  type SummaryChipTone,
  formatBarsValue,
  formatEdgeRatioText,
  formatSecondsText,
  formatSignedPercentText,
  formatTemplate,
} from "@/workspaces/challenge-stats/challengeFusionDashboardModel";
import {
  GRADE_LABELS,
  resolveChallengeReplayBehaviorTone,
  resolveChallengeReplayPriceTone,
  resolveChallengeReplaySelectionTone,
} from "@/workspaces/challenge-stats/ChallengeFusionDashboardContracts";

export type ChallengeFusionDialogSummaryChip = {
  label: string;
  value: string;
  tone: SummaryChipTone;
  replayTone: ReplayContextMetricTone;
};

export const useChallengeFusionDialogSummaryChips = ({
  behaviorLabelMap,
  content,
  emptyPlaceholder,
  language,
  selectedSession,
  selectionLabelMap,
  ui,
}: {
  behaviorLabelMap: Record<RiskBehaviorType, string>;
  content: ReturnType<typeof getSpecialTrainingPageContent>;
  emptyPlaceholder: string;
  language: AppUiLanguage;
  selectedSession: SessionRowModel | null;
  selectionLabelMap: Record<FastDirectionSelection, string>;
  ui: UiLabelEntry;
}): ChallengeFusionDialogSummaryChip[] =>
  useMemo(() => {
    if (!selectedSession) {
      return [];
    }
    if (selectedSession.kind === "fast") {
      return [
        {
          label: content.decisionSelectedLabel,
          value: selectionLabelMap[selectedSession.selection],
          tone:
            selectedSession.selection === "LONG"
              ? "buy"
              : selectedSession.selection === "SHORT"
                ? "sell"
                : "neutral",
          replayTone: resolveChallengeReplaySelectionTone(
            selectedSession.selection,
          ),
        },
        {
          label: content.decisionActualLabel,
          value: selectionLabelMap[selectedSession.actual],
          tone:
            selectedSession.actual === "LONG"
              ? "buy"
              : selectedSession.actual === "SHORT"
                ? "sell"
                : "neutral",
          replayTone: resolveChallengeReplaySelectionTone(selectedSession.actual),
        },
        {
          label: content.challengeStatsFastAvgDecisionSecondsLabel,
          value: formatSecondsText(
            language,
            selectedSession.decisionSeconds,
            content.fastArenaSecondUnitLabel,
          ),
          tone:
            selectedSession.decisionSeconds <= 2
              ? "positive"
              : selectedSession.decisionSeconds <= 5
                ? "warning"
                : "neutral",
          replayTone:
            selectedSession.decisionSeconds <= 2
              ? "accent"
              : selectedSession.decisionSeconds <= 5
                ? "warning"
                : "flat",
        },
        {
          label: ui.metricExecutionEdgeRatio,
          value: formatEdgeRatioText(selectedSession.edgeRatio),
          tone:
            selectedSession.edgeRatio >= FAST_EDGE_S_THRESHOLD
              ? "positive"
              : selectedSession.edgeRatio >= 1
                ? "warning"
                : "danger",
          replayTone:
            selectedSession.edgeRatio >= FAST_EDGE_S_THRESHOLD
              ? "accent"
              : selectedSession.edgeRatio >= 1
                ? "warning"
                : "danger",
        },
        {
          label: content.challengeMacroFastPerformanceAxisLabel,
          value: formatSignedPercentText(selectedSession.performanceRate, 1),
          tone:
            selectedSession.performanceRate > 0
              ? "positive"
              : selectedSession.performanceRate < 0
                ? "danger"
                : "neutral",
          replayTone: resolveChallengeReplayPriceTone(
            selectedSession.performanceRate,
          ),
        },
      ];
    }
    return [
      {
        label: content.challengeStatsRiskSurvivalRateLabel,
        value: selectedSession.survived ? GRADE_LABELS.A : GRADE_LABELS.F,
        tone: selectedSession.survived ? "accent" : "danger",
        replayTone: selectedSession.survived ? "accent" : "danger",
      },
      {
        label: content.metricAlphaLabel,
        value:
          selectedSession.alphaRatio === null
            ? emptyPlaceholder
            : formatSignedPercentText(selectedSession.alphaRatio, 1),
        tone:
          selectedSession.alphaRatio === null
            ? "neutral"
            : selectedSession.alphaRatio > 0
              ? "positive"
              : selectedSession.alphaRatio < 0
                ? "danger"
                : "neutral",
        replayTone: resolveChallengeReplayPriceTone(selectedSession.alphaRatio),
      },
      {
        label: content.challengeDashboardRiskFirstActionBarsLabel,
        value: formatTemplate(content.challengeDashboardRiskFirstActionBarsTemplate, [
          formatBarsValue(selectedSession.firstActionBars),
        ]),
        tone:
          selectedSession.behavior === "CUT_LOSS"
            ? "sell"
            : selectedSession.behavior === "ADD_POSITION"
              ? "buy"
              : "neutral",
        replayTone: resolveChallengeReplayBehaviorTone(selectedSession.behavior),
      },
      {
        label: behaviorLabelMap[selectedSession.behavior],
        value: formatSignedPercentText(selectedSession.returnRate, 1),
        tone:
          selectedSession.returnRate > 0
            ? "positive"
            : selectedSession.returnRate < 0
              ? "danger"
              : "neutral",
        replayTone: resolveChallengeReplayPriceTone(selectedSession.returnRate),
      },
    ];
  }, [
    behaviorLabelMap,
    content,
    emptyPlaceholder,
    language,
    selectedSession,
    selectionLabelMap,
    ui.metricExecutionEdgeRatio,
  ]);
