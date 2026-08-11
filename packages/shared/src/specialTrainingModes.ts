// SPDX-License-Identifier: GPL-3.0-only

import {
  FAST_DECISION_DEFAULT_STRICTNESS_LEVEL,
  type FastDecisionStrictnessLevel,
} from "./domain-calculations/fast-decision.js";

export const SPECIAL_TRAINING_MODE_IDS = [
  "fast-decision-training",
  "risk-discipline-training",
] as const;

export type SpecialTrainingModeId =
  (typeof SPECIAL_TRAINING_MODE_IDS)[number];

export type SpecialTrainingDashboardFamily =
  | "FAST_DECISION"
  | "RISK_DISCIPLINE";

export const SPECIAL_TRAINING_ALLOWED_QUESTION_COUNTS = [
  5,
  10,
  15,
  20,
  30,
  50,
] as const;

export const SPECIAL_TRAINING_ALLOWED_DECISION_SECONDS = [
  10,
  20,
  30,
  60,
  120,
] as const;

export type SpecialTrainingModeCatalogEntry = Readonly<{
  id: SpecialTrainingModeId;
  dashboardFamily: SpecialTrainingDashboardFamily;
  statsTag: string;
  lookbackBars: number;
  defaultQuestionCount: number;
  defaultHorizonBars: number;
  allowedHorizonBars: readonly number[];
  defaultMaxOperations: number;
  defaultMaxEntries: number;
  defaultDecisionSecondsLimit: number;
  allowedDecisionSeconds: readonly number[];
  supportsDecisionSecondsLimit: boolean;
  supportsFastDecisionStrictness: boolean;
  defaultFastDecisionStrictnessLevel: FastDecisionStrictnessLevel;
}>;

export const SPECIAL_TRAINING_MODE_CATALOG: Readonly<
  Record<SpecialTrainingModeId, SpecialTrainingModeCatalogEntry>
> = {
  "fast-decision-training": {
    id: "fast-decision-training",
    dashboardFamily: "FAST_DECISION",
    statsTag: "special_fast_decision",
    lookbackBars: 100,
    defaultQuestionCount: 5,
    defaultHorizonBars: 20,
    allowedHorizonBars: [20, 30, 50, 80, 100],
    defaultMaxOperations: 1,
    defaultMaxEntries: 1,
    defaultDecisionSecondsLimit: 20,
    allowedDecisionSeconds: SPECIAL_TRAINING_ALLOWED_DECISION_SECONDS,
    supportsDecisionSecondsLimit: true,
    supportsFastDecisionStrictness: true,
    defaultFastDecisionStrictnessLevel:
      FAST_DECISION_DEFAULT_STRICTNESS_LEVEL,
  },
  "risk-discipline-training": {
    id: "risk-discipline-training",
    dashboardFamily: "RISK_DISCIPLINE",
    statsTag: "special_risk",
    lookbackBars: 100,
    defaultQuestionCount: 5,
    defaultHorizonBars: 60,
    allowedHorizonBars: [5, 10, 20, 30, 40, 50, 60, 120, 240],
    defaultMaxOperations: 0,
    defaultMaxEntries: 0,
    defaultDecisionSecondsLimit: 20,
    allowedDecisionSeconds: SPECIAL_TRAINING_ALLOWED_DECISION_SECONDS,
    supportsDecisionSecondsLimit: false,
    supportsFastDecisionStrictness: false,
    defaultFastDecisionStrictnessLevel:
      FAST_DECISION_DEFAULT_STRICTNESS_LEVEL,
  },
};

export const isSpecialTrainingModeId = (
  value: unknown,
): value is SpecialTrainingModeId =>
  SPECIAL_TRAINING_MODE_IDS.some((modeId) => modeId === value);

export const getSpecialTrainingModeCatalogEntry = (
  modeId: SpecialTrainingModeId,
): SpecialTrainingModeCatalogEntry => SPECIAL_TRAINING_MODE_CATALOG[modeId];

const normalizeSpecialTrainingNumericOption = (value: unknown): number =>
  Math.floor(Number(value) || 0);

export const isSpecialTrainingQuestionCountAllowed = (
  value: unknown,
): boolean => {
  const parsed = normalizeSpecialTrainingNumericOption(value);
  return SPECIAL_TRAINING_ALLOWED_QUESTION_COUNTS.includes(
    parsed as (typeof SPECIAL_TRAINING_ALLOWED_QUESTION_COUNTS)[number],
  );
};

export const resolveSpecialTrainingModeQuestionCount = (
  value: unknown,
): number => {
  const parsed = normalizeSpecialTrainingNumericOption(value);
  return isSpecialTrainingQuestionCountAllowed(parsed)
    ? parsed
    : SPECIAL_TRAINING_ALLOWED_QUESTION_COUNTS[0];
};

export const resolveSpecialTrainingLookbackBars = (
  modeId: SpecialTrainingModeId,
): number => getSpecialTrainingModeCatalogEntry(modeId).lookbackBars;

export const isSpecialTrainingHorizonBarsAllowed = (
  modeId: SpecialTrainingModeId,
  value: unknown,
): boolean => {
  const parsed = normalizeSpecialTrainingNumericOption(value);
  const catalog = getSpecialTrainingModeCatalogEntry(modeId);
  return catalog.allowedHorizonBars.includes(
    parsed as (typeof catalog.allowedHorizonBars)[number],
  );
};

export const resolveSpecialTrainingHorizonBars = (
  modeId: SpecialTrainingModeId,
  value: unknown,
): number => {
  const parsed = normalizeSpecialTrainingNumericOption(value);
  const catalog = getSpecialTrainingModeCatalogEntry(modeId);
  return isSpecialTrainingHorizonBarsAllowed(modeId, parsed)
    ? parsed
    : catalog.defaultHorizonBars;
};

export const resolveSpecialTrainingDefaultMaxOperations = (
  modeId: SpecialTrainingModeId,
): number => getSpecialTrainingModeCatalogEntry(modeId).defaultMaxOperations;

export const resolveSpecialTrainingDefaultMaxEntries = (
  modeId: SpecialTrainingModeId,
): number => getSpecialTrainingModeCatalogEntry(modeId).defaultMaxEntries;

export const isSpecialTrainingDecisionSecondsAllowed = (
  modeId: SpecialTrainingModeId,
  value: unknown,
): boolean => {
  const parsed = normalizeSpecialTrainingNumericOption(value);
  const catalog = getSpecialTrainingModeCatalogEntry(modeId);
  return catalog.allowedDecisionSeconds.includes(
    parsed as (typeof catalog.allowedDecisionSeconds)[number],
  );
};

export const supportsSpecialTrainingFastDecisionStrictness = (
  modeId: SpecialTrainingModeId,
): boolean =>
  getSpecialTrainingModeCatalogEntry(modeId).supportsFastDecisionStrictness;

export const resolveSpecialTrainingDecisionSecondsLimit = (
  modeId: SpecialTrainingModeId,
  value: unknown,
): number => {
  const catalog = getSpecialTrainingModeCatalogEntry(modeId);
  if (!catalog.supportsDecisionSecondsLimit) {
    return catalog.defaultDecisionSecondsLimit;
  }
  const parsed = normalizeSpecialTrainingNumericOption(value);
  return isSpecialTrainingDecisionSecondsAllowed(modeId, parsed)
    ? parsed
    : catalog.defaultDecisionSecondsLimit;
};

export const resolveSpecialTrainingDashboardFamily = (
  modeId: SpecialTrainingModeId,
): SpecialTrainingDashboardFamily =>
  getSpecialTrainingModeCatalogEntry(modeId).dashboardFamily;

export const resolveSpecialTrainingStatsTag = (
  modeId: SpecialTrainingModeId,
): string => getSpecialTrainingModeCatalogEntry(modeId).statsTag;

export const normalizeSpecialTrainingBaseTimeframe = (
  value: unknown,
): "1m" | "5m" | "1h" | "1d" | null => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "1m" ||
    normalized === "5m" ||
    normalized === "1h" ||
    normalized === "1d"
  ) {
    return normalized;
  }
  return null;
};
