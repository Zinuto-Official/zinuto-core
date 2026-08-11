// SPDX-License-Identifier: GPL-3.0-only

export type SpecialTrainingModeId =
  | "risk-discipline-training"
  | "fast-decision-training";

export type SpecialTrainingModeDefinition = Readonly<{
  id: SpecialTrainingModeId;
  title: string;
  summary: string;
  switcherSubtitle: string;
  goal: string;
  rules: string;
  settlementFocus: string;
  additionalLimitNote: string;
  questionCount: number;
  maxOperations: number;
  maxEntries: number;
  requiresStopLoss: boolean;
  decisionStyle: "TRADE" | "DECISION";
}>;

type SpecialTrainingModuleBinding = Readonly<{
  historyTag: string;
  statsDimension: string;
  notesContextTag: string;
  indicatorScope: "SYSTEM" | "CUSTOM" | "MIXED";
}>;

export const SPECIAL_TRAINING_MODULE_BINDINGS: Readonly<
  Record<SpecialTrainingModeId, SpecialTrainingModuleBinding>
> = {
  "risk-discipline-training": {
    historyTag: "RISK_DISCIPLINE",
    statsDimension: "SPECIAL_RISK",
    notesContextTag: "SPECIAL_RISK",
    indicatorScope: "SYSTEM",
  },
  "fast-decision-training": {
    historyTag: "FAST_DECISION",
    statsDimension: "SPECIAL_FAST_DECISION",
    notesContextTag: "SPECIAL_FAST_DECISION",
    indicatorScope: "SYSTEM",
  },
};
