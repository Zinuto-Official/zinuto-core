// SPDX-License-Identifier: GPL-3.0-only

import {
  getSpecialTrainingPageContent,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";

type FastDecisionChoiceLike = "LONG" | "SHORT" | "OBSERVE" | string | null | undefined;

export type FastDecisionChoiceLabelSet = {
  longLabel: string;
  shortLabel: string;
  observeLabel: string;
};

export const resolveFastDecisionChoiceLabel = (
  choice: FastDecisionChoiceLike,
  labels: FastDecisionChoiceLabelSet,
  fallback = "",
): string => {
  const normalizedChoice = String(choice ?? "").trim().toUpperCase();
  if (normalizedChoice === "LONG") {
    return labels.longLabel;
  }
  if (normalizedChoice === "SHORT") {
    return labels.shortLabel;
  }
  if (normalizedChoice === "OBSERVE") {
    return labels.observeLabel;
  }
  return fallback;
};

export const resolveFastDecisionChoiceDisplayText = (
  choice: FastDecisionChoiceLike,
  language: AppUiLanguage,
  fallback = "",
): string => {
  const content = getSpecialTrainingPageContent(language);
  return resolveFastDecisionChoiceLabel(
    choice,
    {
      longLabel: content.decisionDirectionUpLabel,
      shortLabel: content.decisionDirectionDownLabel,
      observeLabel: content.decisionObserveLabel,
    },
    fallback,
  );
};
