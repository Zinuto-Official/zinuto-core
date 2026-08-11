// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { AppIcon } from "@/assets/graphics";
import type {
  SpecialTrainingModeDefinition,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import type { FastDecisionStrictnessLevel } from "@/workspaces/special-training/domain/specialTrainingTypes";
import {
  clampSpecialTrainingMinimumBaseTimeframe,
  normalizeSpecialTrainingBaseTimeframe,
  resolveSelectableMinimumBaseTimeframes,
} from "@/workspaces/special-training/domain/specialTrainingTimeframes";

export type ModeQuestionBankState = {
  scopeHash: string;
  poolCount: number;
  instrumentCount: number;
  symbolCount: number;
  totalQuestionCount: number;
  completedQuestionCount: number;
  remainingQuestionCount: number;
  availableQuestionCount: number;
  builtQuestionCount: number;
  status:
    | "EMPTY"
    | "READY_FRESH"
    | "READY_IN_PROGRESS"
    | "AUTO_SWITCHED"
    | "RESETTING"
    | "ERROR";
  noticeKind:
    | "AUTO_SWITCHED_RANGE"
    | "AUTO_SWITCHED_REVISION"
    | "ACTIVE_SESSION_STALE"
    | "RESET_DONE"
    | null;
  noticeMessage: string;
  loading: boolean;
  refreshing: boolean;
  building: boolean;
  errorMessage: string;
  updatedAt: string;
  expiresAt: string | null;
  effectiveTrainingTimeframe: BaseTimeframe | null;
  effectiveTrainingTimeframes: BaseTimeframe[];
  sourceTimeframes: BaseTimeframe[];
  hasQuestionBankCapacityForRun: boolean;
  willRestartQuestionScope: boolean;
  sessionUsesOldSnapshot: boolean;
  actionAvailability: {
    start: {
      enabled: boolean;
      reasonCode: string | null;
      hasCapacityForRun: boolean;
      willRestartQuestionScope: boolean;
    };
    reset: {
      enabled: boolean;
      reasonCode: string | null;
      hasProgress: boolean;
    };
  };
};

export type ModeQuestionBankStateMap = Record<
  SpecialTrainingModeId,
  ModeQuestionBankState
>;

export type SpecialTrainingModeRuntimeConfig = {
  questionCount: number;
  horizonBars: number;
  operationLimit: number;
  decisionSecondsLimit: number;
  minimumBaseTimeframe: BaseTimeframe;
  fastDecisionStrictnessLevel: FastDecisionStrictnessLevel;
};

export type SpecialTrainingModeRuntimeConfigMap = Record<
  SpecialTrainingModeId,
  SpecialTrainingModeRuntimeConfig
>;

type SpecialTrainingModeFrontendMeta = {
  heroIconName: Parameters<typeof AppIcon>[0]["name"];
  defaultQuestionCount: number;
  defaultHorizonBars: number;
  allowedHorizonBars: readonly number[];
  operationLimit: number;
  decisionSecondsLimit: number;
  minimumBaseTimeframeFloor: BaseTimeframe;
};

export const SPECIAL_TRAINING_MODE_IDS: readonly SpecialTrainingModeId[] = [
  "fast-decision-training",
  "risk-discipline-training",
];

export const DEFAULT_SPECIAL_TRAINING_MODE_ID: SpecialTrainingModeId =
  SPECIAL_TRAINING_MODE_IDS[0];

const DEFAULT_DECISION_SECONDS_LIMIT = 20;
const DEFAULT_QUESTION_COUNT = 5;
export const FAST_DECISION_DEFAULT_STRICTNESS_LEVEL: FastDecisionStrictnessLevel =
  "STANDARD";
export const FAST_DECISION_STRICTNESS_RATIO_BY_LEVEL = Object.freeze({
  LENIENT: 1.2,
  STANDARD: 1.5,
  STRICT: 2,
}) satisfies Readonly<Record<FastDecisionStrictnessLevel, number>>;
const FAST_DECISION_DOMINANCE_RATIO_MIN = 1.001;
const FAST_DECISION_DOMINANCE_RATIO_MAX = 9;

const toFiniteNumber = (value: unknown, fallback = Number.NaN): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const resolveFastDecisionStrictnessLevel = (
  value?: unknown,
): FastDecisionStrictnessLevel => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "LENIENT" ||
    normalized === "STANDARD" ||
    normalized === "STRICT"
  ) {
    return normalized;
  }
  return FAST_DECISION_DEFAULT_STRICTNESS_LEVEL;
};

export const resolveFastDecisionDominanceRatio = (value?: {
  strictnessLevel?: unknown;
  dominanceRatio?: unknown;
}): number => {
  const strictnessLevel = resolveFastDecisionStrictnessLevel(
    value?.strictnessLevel,
  );
  const fallbackRatio = FAST_DECISION_STRICTNESS_RATIO_BY_LEVEL[strictnessLevel];
  const numericRatio = toFiniteNumber(value?.dominanceRatio, fallbackRatio);
  if (!Number.isFinite(numericRatio)) {
    return fallbackRatio;
  }
  return Math.min(
    FAST_DECISION_DOMINANCE_RATIO_MAX,
    Math.max(FAST_DECISION_DOMINANCE_RATIO_MIN, numericRatio),
  );
};

const SPECIAL_TRAINING_MODE_META_BY_ID: Readonly<
  Record<SpecialTrainingModeId, SpecialTrainingModeFrontendMeta>
> = {
  "fast-decision-training": {
    heroIconName: "challengeModeFastDecisionHero",
    defaultQuestionCount: DEFAULT_QUESTION_COUNT,
    defaultHorizonBars: 20,
    allowedHorizonBars: [20, 30, 50, 80, 100],
    operationLimit: 1,
    decisionSecondsLimit: DEFAULT_DECISION_SECONDS_LIMIT,
    minimumBaseTimeframeFloor: "1m",
  },
  "risk-discipline-training": {
    heroIconName: "challengeModeRiskDisciplineHero",
    defaultQuestionCount: DEFAULT_QUESTION_COUNT,
    defaultHorizonBars: 60,
    allowedHorizonBars: [5, 10, 20, 30, 40, 50, 60, 120, 240],
    operationLimit: 0,
    decisionSecondsLimit: DEFAULT_DECISION_SECONDS_LIMIT,
    minimumBaseTimeframeFloor: "1m",
  },
};

const buildSpecialTrainingModeRecord = <T>(
  factory: (modeId: SpecialTrainingModeId) => T,
): Record<SpecialTrainingModeId, T> =>
  Object.fromEntries(
    SPECIAL_TRAINING_MODE_IDS.map((modeId) => [modeId, factory(modeId)]),
  ) as Record<SpecialTrainingModeId, T>;

export const createEmptyModeQuestionBankState = (): ModeQuestionBankState => ({
  scopeHash: "",
  poolCount: 0,
  instrumentCount: 0,
  symbolCount: 0,
  totalQuestionCount: 0,
  completedQuestionCount: 0,
  remainingQuestionCount: 0,
  availableQuestionCount: 0,
  builtQuestionCount: 0,
  status: "EMPTY",
  noticeKind: null,
  noticeMessage: "",
  loading: false,
  refreshing: false,
  building: false,
  errorMessage: "",
  updatedAt: "",
  expiresAt: null,
  effectiveTrainingTimeframe: null,
  effectiveTrainingTimeframes: [],
  sourceTimeframes: [],
  hasQuestionBankCapacityForRun: false,
  willRestartQuestionScope: false,
  sessionUsesOldSnapshot: false,
  actionAvailability: {
    start: {
      enabled: false,
      reasonCode: "QUESTION_BANK_READ_MODEL_PENDING",
      hasCapacityForRun: false,
      willRestartQuestionScope: false,
    },
    reset: {
      enabled: false,
      reasonCode: "QUESTION_BANK_READ_MODEL_PENDING",
      hasProgress: false,
    },
  },
});

export const createModeQuestionBankStateMap = (): ModeQuestionBankStateMap =>
  buildSpecialTrainingModeRecord(() => createEmptyModeQuestionBankState());

export const createDefaultModeRuntimeConfigMap =
  (): SpecialTrainingModeRuntimeConfigMap =>
    buildSpecialTrainingModeRecord((modeId) => {
      const modeMeta = SPECIAL_TRAINING_MODE_META_BY_ID[modeId];
      return {
        questionCount: modeMeta.defaultQuestionCount,
        horizonBars: modeMeta.defaultHorizonBars,
        operationLimit: modeMeta.operationLimit,
        decisionSecondsLimit: modeMeta.decisionSecondsLimit,
        minimumBaseTimeframe: modeMeta.minimumBaseTimeframeFloor,
        fastDecisionStrictnessLevel: FAST_DECISION_DEFAULT_STRICTNESS_LEVEL,
      };
    });

export const createModeStringMap = (
  initialValue = "",
): Record<SpecialTrainingModeId, string> =>
  buildSpecialTrainingModeRecord(() => initialValue);

export const createModeNumberMap = (
  initialValue = 0,
): Record<SpecialTrainingModeId, number> =>
  buildSpecialTrainingModeRecord(() => initialValue);

export const createModeBooleanMap = (
  initialValue = false,
): Record<SpecialTrainingModeId, boolean> =>
  buildSpecialTrainingModeRecord(() => initialValue);

export const createModeSelectedPoolIdsMap = (
  selectedPoolIds: readonly string[],
): Record<SpecialTrainingModeId, string[]> =>
  buildSpecialTrainingModeRecord(() => [...selectedPoolIds]);

export const DEFAULT_MODE_RUNTIME_CONFIG_BY_ID =
  createDefaultModeRuntimeConfigMap();

export const resolveSpecialTrainingModeHeroIconName = (
  modeId: SpecialTrainingModeId,
): Parameters<typeof AppIcon>[0]["name"] =>
  SPECIAL_TRAINING_MODE_META_BY_ID[modeId].heroIconName;

export const resolveRuntimeHorizonBars = (
  modeId: SpecialTrainingModeId,
  horizonBars: number,
): number => {
  const parsed = Math.floor(Number(horizonBars) || 0);
  const modeMeta = SPECIAL_TRAINING_MODE_META_BY_ID[modeId];
  return modeMeta.allowedHorizonBars.includes(parsed)
    ? parsed
    : modeMeta.defaultHorizonBars;
};

export const resolveModeMinimumBaseTimeframeFloor = (
  modeId: SpecialTrainingModeId,
): BaseTimeframe =>
  SPECIAL_TRAINING_MODE_META_BY_ID[modeId].minimumBaseTimeframeFloor;

export const resolveSelectableRuntimeMinimumBaseTimeframes = (
  modeId: SpecialTrainingModeId,
  selectedPoolBaseTimeframes: readonly BaseTimeframe[],
): BaseTimeframe[] =>
  resolveSelectableMinimumBaseTimeframes({
    selectedPoolBaseTimeframes,
    hardMinimumBaseTimeframe: resolveModeMinimumBaseTimeframeFloor(modeId),
  });

export const resolveRuntimeMinimumBaseTimeframe = (
  modeId: SpecialTrainingModeId,
  requestedMinimumBaseTimeframe: BaseTimeframe | null | undefined,
  selectedPoolBaseTimeframes: readonly BaseTimeframe[],
): BaseTimeframe =>
  clampSpecialTrainingMinimumBaseTimeframe({
    requestedMinimumBaseTimeframe:
      normalizeSpecialTrainingBaseTimeframe(requestedMinimumBaseTimeframe),
    selectedPoolBaseTimeframes,
    hardMinimumBaseTimeframe: resolveModeMinimumBaseTimeframeFloor(modeId),
  });

export const resolveSpecialTrainingContentModes = (
  modes: readonly SpecialTrainingModeDefinition[],
): SpecialTrainingModeDefinition[] =>
  SPECIAL_TRAINING_MODE_IDS.flatMap((modeId) => {
    const mode = modes.find((item) => item.id === modeId);
    return mode ? [mode] : [];
  });
