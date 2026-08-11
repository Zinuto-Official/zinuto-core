// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import type { getSpecialTrainingPageContent } from "@/ui/config/uiConfig";
import {
  formatFastDecisionCapitalAmount,
  formatFastDecisionCapitalSignedAmount,
} from "@/workspaces/special-training/fastDecisionCapitalPresentation";
import {
  formatPercent,
  formatPrice,
  formatRoundedPercent,
  formatSigned,
  resolveSummaryChipTone,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionChoice,
  FastDecisionResult,
  FastDecisionReviewDetail,
  SettlementResult,
  SpecialTrainingQuestion,
} from "@/workspaces/special-training/domain/specialTrainingTypes";

type ComposeChallengeReviewChipsInput = {
  content: ReturnType<typeof getSpecialTrainingPageContent>;
  activeQuestion: SpecialTrainingQuestion | null;
  activeFastDecisionDirectionResult: FastDecisionResult | null;
  resolvedFastDecisionReviewDetail: FastDecisionReviewDetail | null;
  settlement: SettlementResult | null;
  riskReviewAlphaVsHold: number | null;
  riskReviewAlphaVsHardStop: number | null;
  riskAlphaVsHoldLabel: string;
  riskAlphaVsHardStopLabel: string;
  fastDecisionReviewGaugeTone: "up" | "down" | "flat";
  fastDecisionReviewRatioDisplay: string;
  textDoubleDash: string;
  resolveFastChoiceLabel: (choice: FastDecisionChoice) => string;
};

export const composeChallengeReviewChips = ({
  content,
  activeQuestion,
  activeFastDecisionDirectionResult,
  resolvedFastDecisionReviewDetail,
  settlement,
  riskReviewAlphaVsHold,
  riskReviewAlphaVsHardStop,
  riskAlphaVsHoldLabel,
  riskAlphaVsHardStopLabel,
  fastDecisionReviewGaugeTone,
  fastDecisionReviewRatioDisplay,
  textDoubleDash,
  resolveFastChoiceLabel,
}: ComposeChallengeReviewChipsInput): ReplayContextSummaryChip[] => {
  if (!activeQuestion) {
    return [];
  }

  const chips: ReplayContextSummaryChip[] = [];
  const pushChip = (
    label: string,
    value: string,
    tone: ReplayContextSummaryChip["tone"] = "neutral",
  ) => {
    const normalizedLabel = String(label || "").trim();
    const normalizedValue = String(value || "").trim();
    if (
      !normalizedLabel ||
      !normalizedValue ||
      normalizedValue === textDoubleDash
    ) {
      return;
    }
    chips.push({
      label: normalizedLabel,
      value: normalizedValue,
      tone,
    });
  };

  if (activeFastDecisionDirectionResult && resolvedFastDecisionReviewDetail) {
    if (settlement?.fastReview) {
      pushChip(
        content.metricTotalAssetLabel,
        formatFastDecisionCapitalAmount(settlement.fastReview.finalAsset),
        resolveSummaryChipTone(settlement.fastReview.totalPnl),
      );
      pushChip(
        content.statusFloatingLabel,
        formatFastDecisionCapitalSignedAmount(settlement.fastReview.totalPnl),
        resolveSummaryChipTone(settlement.fastReview.totalPnl),
      );
      pushChip(
        content.metricMaxDrawdownLabel,
        formatRoundedPercent(settlement.fastReview.maxDrawdownRate),
        "warning",
      );
    }
    pushChip(
      content.decisionSelectedLabel,
      resolveFastChoiceLabel(activeFastDecisionDirectionResult.selection),
      activeFastDecisionDirectionResult.correct ? "positive" : "neutral",
    );
    pushChip(
      content.decisionActualLabel,
      resolveFastChoiceLabel(activeFastDecisionDirectionResult.actual),
      activeFastDecisionDirectionResult.correct ? "positive" : "danger",
    );
    pushChip(
      resolvedFastDecisionReviewDetail.favorableLabel,
      resolvedFastDecisionReviewDetail.favorableValue,
      "positive",
    );
    pushChip(
      resolvedFastDecisionReviewDetail.adverseLabel,
      resolvedFastDecisionReviewDetail.adverseValue,
      "danger",
    );
    pushChip(
      content.fastDecisionRatioLabel,
      fastDecisionReviewRatioDisplay,
      fastDecisionReviewGaugeTone === "up"
        ? "positive"
        : fastDecisionReviewGaugeTone === "down"
          ? "danger"
          : "neutral",
    );
    pushChip(
      content.metricAvgDecisionSecondsLabel,
      resolvedFastDecisionReviewDetail.decisionSecondsLabel,
    );
    return chips.slice(0, 9);
  }

  if (!settlement) {
    return [];
  }

  pushChip(
    content.metricMaxDrawdownLabel,
    formatPercent(settlement.maxDrawdownRatio),
    "warning",
  );
  pushChip(
    content.metricTotalAssetLabel,
    formatPrice(settlement.finalTotalAsset),
    resolveSummaryChipTone(settlement.totalPnl),
  );
  pushChip(
    content.statusFloatingLabel,
    formatSigned(settlement.totalPnl),
    resolveSummaryChipTone(settlement.totalPnl),
  );
  if (riskReviewAlphaVsHold !== null) {
    pushChip(
      riskAlphaVsHoldLabel,
      formatPercent(riskReviewAlphaVsHold),
      resolveSummaryChipTone(riskReviewAlphaVsHold),
    );
  }
  if (riskReviewAlphaVsHardStop !== null) {
    pushChip(
      riskAlphaVsHardStopLabel,
      formatPercent(riskReviewAlphaVsHardStop),
      resolveSummaryChipTone(riskReviewAlphaVsHardStop),
    );
  }
  if (settlement.recoveryRate !== null) {
    pushChip(
      content.metricRecoveryRateLabel,
      formatPercent(settlement.recoveryRate),
      resolveSummaryChipTone(settlement.recoveryRate),
    );
  }
  if (settlement.captureRate !== null) {
    pushChip(
      content.metricCaptureRateLabel,
      formatPercent(settlement.captureRate),
      resolveSummaryChipTone(settlement.captureRate),
    );
  }
  if (settlement.grade) {
    pushChip(
      content.metricGradeLabel,
      settlement.grade,
      settlement.passed ? "positive" : "warning",
    );
  }

  return chips.slice(0, 9);
};
