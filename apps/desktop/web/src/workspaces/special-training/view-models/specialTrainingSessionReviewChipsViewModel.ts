// SPDX-License-Identifier: GPL-3.0-only

import type {
  ReplayContextMetricTone,
  ReplayContextSummaryChip,
} from "@/frontend-kernel/replayContext";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { formatMoneyFixed } from "@/ui/formatting/format";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import { resolveFastDecisionRatioGaugeThreshold } from "@/workspaces/special-training/fastDecisionRatioGauge";
import {
  formatPercent,
  formatPercentFixed,
  formatPrice,
  formatRoundedPercent,
  formatSigned,
  formatTemplate,
  resolveSummaryChipTone,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import {
  formatFastDecisionCapitalAmount,
  formatFastDecisionCapitalSignedAmount,
} from "@/workspaces/special-training/fastDecisionCapitalPresentation";
import type {
  FastDecisionChoice,
  SessionReviewItem,
  SettlementResult,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import type { RiskDisciplineBehaviorType } from "@/workspaces/special-training/riskDisciplineSessionDisplayFacts";

type SelectedSessionReviewSummaryLabels = {
  challengeDashboardRiskFirstActionBarsLabel: string;
  challengeDashboardRiskFirstActionBarsTemplate: string;
  metricTotalAssetLabel: string;
  statusFloatingLabel: string;
  metricAlphaLabel: string;
  metricGradeLabel: string;
  metricMaxDrawdownLabel: string;
  decisionSelectedLabel: string;
  decisionActualLabel: string;
  metricAvgDecisionSecondsLabel: string;
  fastArenaSecondUnitLabel: string;
  fastArenaMfeTagLabel: string;
  fastArenaMaeTagLabel: string;
  fastDecisionRatioLabel: string;
  fastDecisionMfeMaeInfinityValue: string;
};

type ComposeSelectedSessionReviewChipsParams = {
  language: AppUiLanguage;
  selectedSessionReviewItem: SessionReviewItem | null;
  selectedSessionReviewSettlement: SettlementResult | null;
  labels: SelectedSessionReviewSummaryLabels;
  resolveFastChoiceLabel: (choice: FastDecisionChoice) => string;
  resolveFastTrendLabel: (choice: FastDecisionChoice) => string;
  resolveRiskDisciplineFirstAction: (settlement: SettlementResult) => {
    behavior: RiskDisciplineBehaviorType;
    barsSinceStart: number;
  };
};

const resolveSecondaryPriceTone = (value: number): ReplayContextMetricTone => {
  if (!Number.isFinite(value) || value === 0) {
    return "flat";
  }
  return value > 0 ? "up" : "down";
};

const resolveFastChoiceSecondaryTone = (
  choice: FastDecisionChoice,
): ReplayContextMetricTone =>
  choice === "LONG" ? "buy" : choice === "SHORT" ? "sell" : "flat";

const resolveRiskBehaviorSecondaryTone = (
  behavior: RiskDisciplineBehaviorType,
): ReplayContextMetricTone =>
  behavior === "ADD_POSITION"
    ? "buy"
    : behavior === "CUT_LOSS"
      ? "sell"
      : "flat";

export const composeSelectedSessionReviewChips = ({
  language,
  selectedSessionReviewItem,
  selectedSessionReviewSettlement,
  labels,
  resolveFastChoiceLabel,
  resolveFastTrendLabel,
  resolveRiskDisciplineFirstAction,
}: ComposeSelectedSessionReviewChipsParams): ReplayContextSummaryChip[] => {
  if (!selectedSessionReviewItem || !selectedSessionReviewSettlement) {
    return [];
  }
  if (selectedSessionReviewItem.kind === "risk") {
    const firstAction = resolveRiskDisciplineFirstAction(
      selectedSessionReviewSettlement,
    );
    const chips: ReplayContextSummaryChip[] = [
      {
        label: labels.challengeDashboardRiskFirstActionBarsLabel,
        value: formatTemplate(labels.challengeDashboardRiskFirstActionBarsTemplate, [
          formatMoneyFixed(firstAction.barsSinceStart, 0),
        ]),
        tone:
          firstAction.behavior === "CUT_LOSS"
            ? "positive"
            : firstAction.behavior === "ADD_POSITION"
              ? "warning"
              : "danger",
        secondaryTone: resolveRiskBehaviorSecondaryTone(firstAction.behavior),
      },
      {
        label: labels.metricTotalAssetLabel,
        value: formatPrice(selectedSessionReviewSettlement.finalTotalAsset),
        tone: resolveSummaryChipTone(selectedSessionReviewSettlement.totalPnl),
        secondaryTone: resolveSecondaryPriceTone(
          selectedSessionReviewSettlement.totalPnl,
        ),
      },
      {
        label: labels.statusFloatingLabel,
        value: formatSigned(selectedSessionReviewSettlement.totalPnl),
        tone: resolveSummaryChipTone(selectedSessionReviewSettlement.totalPnl),
        secondaryTone: resolveSecondaryPriceTone(
          selectedSessionReviewSettlement.totalPnl,
        ),
      },
    ];
    if (selectedSessionReviewSettlement.alpha !== null) {
      chips.push({
        label: labels.metricAlphaLabel,
        value: formatPercent(selectedSessionReviewSettlement.alpha),
        tone: resolveSummaryChipTone(selectedSessionReviewSettlement.alpha),
        secondaryTone: resolveSecondaryPriceTone(
          selectedSessionReviewSettlement.alpha,
        ),
      });
    }
    if (selectedSessionReviewSettlement.grade) {
      chips.push({
        label: labels.metricGradeLabel,
        value: selectedSessionReviewSettlement.grade,
        tone: selectedSessionReviewSettlement.passed ? "positive" : "warning",
        secondaryTone: selectedSessionReviewSettlement.passed
          ? "accent"
          : "warning",
      });
    }
    return chips;
  }
  const directionResult = selectedSessionReviewSettlement.directionResult;
  if (!directionResult) {
    return [];
  }
  const chips: ReplayContextSummaryChip[] = [
    ...(selectedSessionReviewItem.fastReview
      ? ([
          {
            label: labels.metricTotalAssetLabel,
            value: formatFastDecisionCapitalAmount(
              selectedSessionReviewItem.fastReview.finalAsset,
            ),
            tone: resolveSummaryChipTone(
              selectedSessionReviewItem.fastReview.totalPnl,
            ),
            secondaryTone: resolveSecondaryPriceTone(
              selectedSessionReviewItem.fastReview.totalPnl,
            ),
          },
          {
            label: labels.statusFloatingLabel,
            value: formatFastDecisionCapitalSignedAmount(
              selectedSessionReviewItem.fastReview.totalPnl,
            ),
            tone: resolveSummaryChipTone(
              selectedSessionReviewItem.fastReview.totalPnl,
            ),
            secondaryTone: resolveSecondaryPriceTone(
              selectedSessionReviewItem.fastReview.totalPnl,
            ),
          },
          {
            label: labels.metricMaxDrawdownLabel,
            value: formatRoundedPercent(
              selectedSessionReviewItem.fastReview.maxDrawdownRate,
            ),
            tone: "warning" as const,
            secondaryTone:
              selectedSessionReviewItem.fastReview.maxDrawdownRate > 0
                ? "down"
                : "flat",
          },
        ] satisfies ReplayContextSummaryChip[])
      : []),
    {
      label: labels.decisionSelectedLabel,
      value: resolveFastChoiceLabel(directionResult.selection),
      tone: directionResult.correct ? "positive" : "danger",
      secondaryTone: resolveFastChoiceSecondaryTone(directionResult.selection),
    },
    {
      label: labels.decisionActualLabel,
      value: resolveFastTrendLabel(directionResult.actual),
      tone: directionResult.correct ? "positive" : "warning",
      secondaryTone: resolveFastChoiceSecondaryTone(directionResult.actual),
    },
    {
      label: labels.metricAvgDecisionSecondsLabel,
      value: formatCountWithUnitText(
        language,
        formatMoneyFixed(directionResult.decisionSecondsUsed, 2),
        labels.fastArenaSecondUnitLabel,
      ),
      tone:
        directionResult.decisionSecondsUsed <= 2
          ? directionResult.correct
            ? "positive"
            : "warning"
          : "neutral",
      secondaryTone:
        directionResult.decisionSecondsUsed <= 2 && directionResult.correct
          ? "accent"
          : directionResult.decisionSecondsUsed <= 2
            ? "warning"
            : "flat",
    },
  ];
  const favorableRatio = Math.max(0, Number(directionResult.selectedMfeRatio) || 0);
  const adverseRatio = Math.max(0, Number(directionResult.selectedMaeRatio) || 0);
  chips.push(
    {
      label: labels.fastArenaMfeTagLabel,
      value: `+${formatPercentFixed(favorableRatio, 2)}`,
      tone: "positive",
      secondaryTone: favorableRatio > 0 ? "up" : "flat",
    },
    {
      label: labels.fastArenaMaeTagLabel,
      value: `-${formatPercentFixed(adverseRatio, 2)}`,
      tone: "danger",
      secondaryTone: adverseRatio > 0 ? "down" : "flat",
    },
  );
  const edgeRatio = Number(directionResult.selectedMfeMaeRatio);
  chips.push({
    label: labels.fastDecisionRatioLabel,
    value:
      edgeRatio >= 999
        ? labels.fastDecisionMfeMaeInfinityValue
        : `${formatMoneyFixed(Math.max(0, edgeRatio), 2)}${tt("appText.message0680")}`,
    tone:
      edgeRatio >=
      resolveFastDecisionRatioGaugeThreshold(directionResult.dominanceRatio)
        ? "positive"
        : edgeRatio >= 1
          ? "warning"
          : "danger",
    secondaryTone:
      edgeRatio >=
      resolveFastDecisionRatioGaugeThreshold(directionResult.dominanceRatio)
        ? "accent"
        : edgeRatio >= 1
          ? "warning"
          : "danger",
  });
  return chips;
};
