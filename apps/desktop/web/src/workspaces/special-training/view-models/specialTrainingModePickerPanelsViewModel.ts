// SPDX-License-Identifier: GPL-3.0-only

import { formatMessage } from "@zinuto/shared/i18n";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { SpecialTrainingDurationEstimateState } from "@/workspaces/special-training/domain/specialTrainingTypes";

export type ModePickerReadinessChecklistItemTone =
  | "ready"
  | "warning"
  | "danger"
  | "neutral"
  | "loading";

export type ModePickerReadinessChecklistItem = {
  key: string;
  label: string;
  value: string;
  tone: ModePickerReadinessChecklistItemTone;
};

export type ModePickerPrepGuideItem = {
  key: string;
  label: string;
  value: string;
};

type BuildModePickerPrepGuideItemsParams = {
  isFastDecisionMode: boolean;
  modeGoal: string;
  historyBars: number;
  activeDecisionSecondsLimit: number;
  activeHorizonBars: number;
  activeStrictnessSummary: string;
  labels: {
    goal: string;
    rules: string;
    settlementFocus: string;
  };
  templates: {
    fastDecisionGoal: string;
    fastDecisionRules: string;
    fastDecisionSettlementFocus: string;
    riskDisciplineRules: string;
    riskDisciplineSettlementFocus: string;
  };
  formatTemplate: (template: string, values: Array<string | number>) => string;
};

type ResolveModePickerDurationEstimateViewModelParams = {
  language: AppUiLanguage;
  durationEstimateState: SpecialTrainingDurationEstimateState;
  activeDurationEstimateSignature: string;
};

type ResolveModePickerDurationEstimateViewModelResult = {
  estimatedDurationText: string;
};

type BuildModePickerReadinessChecklistItemsParams = {
  modeTitle: string;
  bankStatusLabel: string;
  bankStatusTone: ModePickerReadinessChecklistItemTone;
  questionCountSummary: string;
  questionCountTone: ModePickerReadinessChecklistItemTone;
  estimatedDurationText: string;
  labels: {
    mode: string;
    bank: string;
    questionCount: string;
    duration: string;
  };
};

export const resolveModePickerDurationEstimateViewModel = ({
  language,
  durationEstimateState,
  activeDurationEstimateSignature,
}: ResolveModePickerDurationEstimateViewModelParams): ResolveModePickerDurationEstimateViewModelResult => {
  const hasActiveDurationEstimateState =
    durationEstimateState.signature === activeDurationEstimateSignature;
  const activeDurationEstimate = hasActiveDurationEstimateState
    ? durationEstimateState.estimate
    : null;
  const visibleDurationEstimate =
    activeDurationEstimate ??
    (activeDurationEstimateSignature ? durationEstimateState.estimate : null);
  const isDurationEstimateError =
    hasActiveDurationEstimateState && durationEstimateState.error;
  const estimatedDurationText = visibleDurationEstimate
    ? formatMessage(language, "trainer.durationEstimate.range", {
        minMinutes: visibleDurationEstimate.minMinutes,
        maxMinutes: visibleDurationEstimate.maxMinutes,
      })
    : isDurationEstimateError
      ? formatMessage(language, "trainer.durationEstimate.unavailable")
      : formatMessage(language, "trainer.durationEstimate.loading");
  return {
    estimatedDurationText,
  };
};

export const buildModePickerReadinessChecklistItems = ({
  modeTitle,
  bankStatusLabel,
  bankStatusTone,
  questionCountSummary,
  questionCountTone,
  estimatedDurationText,
  labels,
}: BuildModePickerReadinessChecklistItemsParams): ModePickerReadinessChecklistItem[] => [
  {
    key: "mode",
    label: labels.mode,
    value: modeTitle,
    tone: "neutral",
  },
  {
    key: "bank",
    label: labels.bank,
    value: bankStatusLabel,
    tone: bankStatusTone,
  },
  {
    key: "questionCount",
    label: labels.questionCount,
    value: questionCountSummary,
    tone: questionCountTone,
  },
  {
    key: "duration",
    label: labels.duration,
    value: estimatedDurationText,
    tone: "neutral",
  },
];

export const buildModePickerPrepGuideItems = ({
  isFastDecisionMode,
  modeGoal,
  historyBars,
  activeDecisionSecondsLimit,
  activeHorizonBars,
  activeStrictnessSummary,
  labels,
  templates,
  formatTemplate,
}: BuildModePickerPrepGuideItemsParams): ModePickerPrepGuideItem[] => {
  if (isFastDecisionMode) {
    return [
      {
        key: "goal",
        label: labels.goal,
        value: formatTemplate(templates.fastDecisionGoal, [
          historyBars,
          activeDecisionSecondsLimit,
        ]),
      },
      {
        key: "rules",
        label: labels.rules,
        value: formatTemplate(templates.fastDecisionRules, [activeHorizonBars]),
      },
      {
        key: "settlement",
        label: labels.settlementFocus,
        value: formatTemplate(templates.fastDecisionSettlementFocus, [
          activeStrictnessSummary,
        ]),
      },
    ];
  }
  return [
    {
      key: "goal",
      label: labels.goal,
      value: modeGoal,
    },
    {
      key: "rules",
      label: labels.rules,
      value: formatTemplate(templates.riskDisciplineRules, [
        historyBars,
        activeHorizonBars,
      ]),
    },
    {
      key: "settlement",
      label: labels.settlementFocus,
      value: templates.riskDisciplineSettlementFocus,
    },
  ];
};
