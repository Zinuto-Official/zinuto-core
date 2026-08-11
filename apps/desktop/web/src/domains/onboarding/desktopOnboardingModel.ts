// SPDX-License-Identifier: GPL-3.0-only

import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";

export const DESKTOP_ONBOARDING_STEPS = [
  "MODE_OVERVIEW",
  "PREP_PAGES_DETAIL",
  "TOOLS_AND_DISPLAY",
  "LOCAL_DATA_DETAIL",
] as const;

export const DESKTOP_ONBOARDING_TOTAL_STEPS =
  DESKTOP_ONBOARDING_STEPS.length;

export const DESKTOP_ONBOARDING_ROW_COUNT = 3;

export const DESKTOP_ONBOARDING_ROW_LABELS = ["A", "B", "C"] as const;

export const DESKTOP_ONBOARDING_FIRST_STEP = DESKTOP_ONBOARDING_STEPS[0];

export type DesktopOnboardingTourStep =
  (typeof DESKTOP_ONBOARDING_STEPS)[number];

export type DesktopOnboardingTourStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "SKIPPED"
  | "DEFERRED";

export type DesktopOnboardingLocalImportAction = "IMPORT";

export const DESKTOP_ONBOARDING_TARGETS = [
  "MODE_FREE_REPLAY",
  "MODE_LIGHTNING",
  "MODE_SURVIVAL",
  "FREE_REPLAY_PREP_CONFIG",
  "LIGHTNING_PREP_BANK_CONFIG",
  "SURVIVAL_PREP_BANK_CONFIG",
  "TOOLS_INDICATOR",
  "TOOLS_NOTES",
  "TOOLS_MARKET_DISPLAY",
  "LOCAL_IMPORT_ENTRY",
  "LOCAL_IMPORT_TIME_ZONE",
  "LOCAL_IMPORT_SAMPLE",
] as const;

export type DesktopOnboardingTargetId =
  (typeof DESKTOP_ONBOARDING_TARGETS)[number];

export type DesktopOnboardingTargetDefinition = {
  id: DesktopOnboardingTargetId;
  step: DesktopOnboardingTourStep;
  rowIndex: 0 | 1 | 2;
  page: WorkspacePage;
};

export const DESKTOP_ONBOARDING_TARGET_ATTRIBUTE =
  "data-onboarding-target";

export const DESKTOP_ONBOARDING_TARGET_DEFINITIONS = {
  MODE_FREE_REPLAY: {
    id: "MODE_FREE_REPLAY",
    step: "MODE_OVERVIEW",
    rowIndex: 0,
    page: "COMMAND_CENTER",
  },
  MODE_LIGHTNING: {
    id: "MODE_LIGHTNING",
    step: "MODE_OVERVIEW",
    rowIndex: 1,
    page: "COMMAND_CENTER",
  },
  MODE_SURVIVAL: {
    id: "MODE_SURVIVAL",
    step: "MODE_OVERVIEW",
    rowIndex: 2,
    page: "COMMAND_CENTER",
  },
  FREE_REPLAY_PREP_CONFIG: {
    id: "FREE_REPLAY_PREP_CONFIG",
    step: "PREP_PAGES_DETAIL",
    rowIndex: 0,
    page: "TRAINER",
  },
  LIGHTNING_PREP_BANK_CONFIG: {
    id: "LIGHTNING_PREP_BANK_CONFIG",
    step: "PREP_PAGES_DETAIL",
    rowIndex: 1,
    page: "SPECIAL_TRAINING",
  },
  SURVIVAL_PREP_BANK_CONFIG: {
    id: "SURVIVAL_PREP_BANK_CONFIG",
    step: "PREP_PAGES_DETAIL",
    rowIndex: 2,
    page: "SPECIAL_TRAINING",
  },
  TOOLS_INDICATOR: {
    id: "TOOLS_INDICATOR",
    step: "TOOLS_AND_DISPLAY",
    rowIndex: 0,
    page: "CUSTOM_INDICATOR",
  },
  TOOLS_NOTES: {
    id: "TOOLS_NOTES",
    step: "TOOLS_AND_DISPLAY",
    rowIndex: 1,
    page: "NOTES",
  },
  TOOLS_MARKET_DISPLAY: {
    id: "TOOLS_MARKET_DISPLAY",
    step: "TOOLS_AND_DISPLAY",
    rowIndex: 2,
    page: "SETTINGS",
  },
  LOCAL_IMPORT_ENTRY: {
    id: "LOCAL_IMPORT_ENTRY",
    step: "LOCAL_DATA_DETAIL",
    rowIndex: 0,
    page: "DATA",
  },
  LOCAL_IMPORT_TIME_ZONE: {
    id: "LOCAL_IMPORT_TIME_ZONE",
    step: "LOCAL_DATA_DETAIL",
    rowIndex: 1,
    page: "DATA",
  },
  LOCAL_IMPORT_SAMPLE: {
    id: "LOCAL_IMPORT_SAMPLE",
    step: "LOCAL_DATA_DETAIL",
    rowIndex: 2,
    page: "DATA",
  },
} as const satisfies Record<
  DesktopOnboardingTargetId,
  DesktopOnboardingTargetDefinition
>;

const desktopOnboardingTargetSet = new Set<string>(DESKTOP_ONBOARDING_TARGETS);
const desktopOnboardingStepSet = new Set<string>(DESKTOP_ONBOARDING_STEPS);

export const normalizeDesktopOnboardingTourStep = (
  value: unknown,
): DesktopOnboardingTourStep =>
  typeof value === "string" && desktopOnboardingStepSet.has(value)
    ? (value as DesktopOnboardingTourStep)
    : DESKTOP_ONBOARDING_FIRST_STEP;

export const normalizeDesktopOnboardingTourStatus = (
  value: unknown,
): DesktopOnboardingTourStatus => {
  switch (value) {
    case "ACTIVE":
    case "COMPLETED":
    case "SKIPPED":
    case "DEFERRED":
      return value;
    default:
      return "ACTIVE";
  }
};

export const normalizeDesktopOnboardingPersistedTourStatus = (
  value: unknown,
  fallback: DesktopOnboardingTourStatus = "ACTIVE",
): DesktopOnboardingTourStatus => {
  switch (value) {
    case "COMPLETED":
    case "SKIPPED":
      return value;
    case "ACTIVE":
    case "DEFERRED":
      return "ACTIVE";
    default:
      return fallback;
  }
};

export const resolveDesktopOnboardingPersistedTourStatus = (
  status: DesktopOnboardingTourStatus,
): DesktopOnboardingTourStatus =>
  status === "ACTIVE" ? "DEFERRED" : status;

export const getDesktopOnboardingStepIndex = (
  step: DesktopOnboardingTourStep,
): number => DESKTOP_ONBOARDING_STEPS.indexOf(step) + 1;

export const getNextDesktopOnboardingStep = (
  step: DesktopOnboardingTourStep,
): DesktopOnboardingTourStep | null => {
  const stepIndex = DESKTOP_ONBOARDING_STEPS.indexOf(step);
  return DESKTOP_ONBOARDING_STEPS[stepIndex + 1] ?? null;
};

export const getPreviousDesktopOnboardingStep = (
  step: DesktopOnboardingTourStep,
): DesktopOnboardingTourStep | null => {
  const stepIndex = DESKTOP_ONBOARDING_STEPS.indexOf(step);
  return DESKTOP_ONBOARDING_STEPS[stepIndex - 1] ?? null;
};

export const isDesktopOnboardingTargetId = (
  value: unknown,
): value is DesktopOnboardingTargetId =>
  typeof value === "string" && desktopOnboardingTargetSet.has(value);

export const getDesktopOnboardingStepTargets = (
  step: DesktopOnboardingTourStep,
): DesktopOnboardingTargetId[] =>
  DESKTOP_ONBOARDING_TARGETS.filter(
    (targetId) => DESKTOP_ONBOARDING_TARGET_DEFINITIONS[targetId].step === step,
  );

export const getDesktopOnboardingTargetSelector = (
  targetId: DesktopOnboardingTargetId,
): string => `[${DESKTOP_ONBOARDING_TARGET_ATTRIBUTE}="${targetId}"]`;

export const resolveDesktopOnboardingLocalImportAction =
  (): DesktopOnboardingLocalImportAction => "IMPORT";

export const getDesktopOnboardingMainPage = (
  step: DesktopOnboardingTourStep,
): WorkspacePage | null => {
  switch (step) {
    case "MODE_OVERVIEW":
      return "COMMAND_CENTER";
    case "PREP_PAGES_DETAIL":
      return "TRAINER";
    case "TOOLS_AND_DISPLAY":
      return "CUSTOM_INDICATOR";
    case "LOCAL_DATA_DETAIL":
      return "DATA";
  }
};
