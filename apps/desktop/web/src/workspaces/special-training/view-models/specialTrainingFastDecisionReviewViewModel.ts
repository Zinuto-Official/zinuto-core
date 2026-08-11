// SPDX-License-Identifier: GPL-3.0-only

import { formatMoneyFixed } from "@/ui/formatting/format";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import { formatConfigValue } from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionChoice,
  FastDecisionResult,
  FastDecisionReviewDetail,
} from "@/workspaces/special-training/domain/specialTrainingTypes";

const FAST_DECISION_CHOICE_OBSERVE: FastDecisionChoice = "OBSERVE";

type BuildFastDecisionReviewDetailParams = {
  language: AppUiLanguage;
  directionResult: FastDecisionResult | null;
  resolveFastChoiceLabel: (choice: FastDecisionChoice) => string;
  percentUnitLabel: string;
  secondUnitLabel: string;
  infinityRatioLabel: string;
  reasonConfirmedLabel: string;
  reasonTimeoutLabel: string;
  reasonMissedTrendLabel: string;
  reasonReverseLabel: string;
  reasonChoppyLabel: string;
  favorableLabel: string;
  adverseLabel: string;
};

export const buildFastDecisionReviewDetail = ({
  language,
  directionResult,
  resolveFastChoiceLabel,
  percentUnitLabel,
  secondUnitLabel,
  infinityRatioLabel,
  reasonConfirmedLabel,
  reasonTimeoutLabel,
  reasonMissedTrendLabel,
  reasonReverseLabel,
  reasonChoppyLabel,
  favorableLabel,
  adverseLabel,
}: BuildFastDecisionReviewDetailParams): FastDecisionReviewDetail | null => {
  if (!directionResult) {
    return null;
  }

  const selectedLabel = resolveFastChoiceLabel(directionResult.selection);
  const actualLabel = resolveFastChoiceLabel(directionResult.actual);
  const isObserveMiss =
    directionResult.selection === FAST_DECISION_CHOICE_OBSERVE &&
    directionResult.actual !== FAST_DECISION_CHOICE_OBSERVE;
  const displayMfeRatio = isObserveMiss
    ? directionResult.opportunityMfeRatio
    : directionResult.selectedMfeRatio;
  const displayMaeRatio = isObserveMiss
    ? directionResult.opportunityMaeRatio
    : directionResult.selectedMaeRatio;
  const displayMfeMaeRatio = isObserveMiss
    ? directionResult.opportunityMfeMaeRatio
    : directionResult.selectedMfeMaeRatio;
  const favorableValue = formatMoneyFixed(displayMfeRatio * 100, 2);
  const adverseValue = formatMoneyFixed(displayMaeRatio * 100, 2);

  let badgeLabel = reasonConfirmedLabel;
  if (directionResult.timedOut) {
    badgeLabel = reasonTimeoutLabel;
  } else if (isObserveMiss) {
    badgeLabel = reasonMissedTrendLabel;
  } else if (
    !directionResult.correct &&
    directionResult.actual !== FAST_DECISION_CHOICE_OBSERVE
  ) {
    badgeLabel = reasonReverseLabel;
  } else if (!directionResult.correct) {
    badgeLabel = reasonChoppyLabel;
  }

  return {
    favorableLabel,
    adverseLabel,
    favorableValue: `+${favorableValue}${percentUnitLabel}`,
    adverseValue: `-${adverseValue}${percentUnitLabel}`,
    ratioValue:
      displayMfeMaeRatio >= 999
        ? infinityRatioLabel
        : formatConfigValue(displayMfeMaeRatio, 2),
    directionLabel: selectedLabel,
    actualDirectionLabel: actualLabel,
    badgeLabel,
    decisionSecondsLabel: formatCountWithUnitText(
      language,
      formatMoneyFixed(directionResult.decisionSecondsUsed, 0),
      secondUnitLabel,
    ),
    selectedChoice: directionResult.selection,
    actualChoice: directionResult.actual,
    favorableRatio: displayMfeRatio,
    adverseRatio: displayMaeRatio,
    ratioGaugeValue: displayMfeMaeRatio,
    ratioIsInfinity: displayMfeMaeRatio >= 999,
  };
};
