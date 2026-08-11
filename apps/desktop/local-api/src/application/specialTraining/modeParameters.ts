// SPDX-License-Identifier: GPL-3.0-only

import {
  SPECIAL_TRAINING_ALLOWED_QUESTION_COUNTS,
  SPECIAL_TRAINING_MODE_CATALOG,
  SPECIAL_TRAINING_MODE_IDS,
  isSpecialTrainingDecisionSecondsAllowed,
  isSpecialTrainingHorizonBarsAllowed,
  isSpecialTrainingQuestionCountAllowed,
  supportsSpecialTrainingFastDecisionStrictness,
  type SpecialTrainingModeId,
} from '@zinuto/shared/specialTrainingModes';

type ParameterAvailability = {
  enabled: boolean;
  reasonCode: string | null;
};

type NumericParameterValidation = ParameterAvailability & {
  value: number;
  allowedValues: readonly number[];
};

export type SpecialTrainingModeParameterFacts = {
  modeId: SpecialTrainingModeId;
  defaults: {
    questionCount: number;
    horizonBars: number;
    maxOperations: number;
    maxEntries: number;
    decisionSecondsLimit: number;
    fastDecisionStrictnessLevel: string;
  };
  options: {
    questionCounts: readonly number[];
    horizonBars: readonly number[];
    decisionSeconds: readonly number[];
    fastDecisionStrictnessLevels: readonly string[];
  };
  supports: {
    decisionSecondsLimit: boolean;
    fastDecisionStrictness: boolean;
  };
  validation: {
    questionCount: NumericParameterValidation;
    horizonBars: NumericParameterValidation;
    maxOperations: ParameterAvailability & { value: number };
    decisionSecondsLimit: NumericParameterValidation;
    fastDecisionStrictnessLevel: ParameterAvailability & { value: string };
  };
};

const FAST_DECISION_STRICTNESS_LEVELS = ['LENIENT', 'STANDARD', 'STRICT'] as const;

const normalizeInteger = (value: unknown): number =>
  Math.floor(Number(value) || 0);

export const buildSpecialTrainingModeParameterFacts = (
  modeId: SpecialTrainingModeId,
  input: {
    questionCount?: unknown;
    horizonBars?: unknown;
    maxOperations?: unknown;
    decisionSecondsLimit?: unknown;
    fastDecisionStrictnessLevel?: unknown;
  } = {},
): SpecialTrainingModeParameterFacts => {
  const catalog = SPECIAL_TRAINING_MODE_CATALOG[modeId];
  const questionCount = normalizeInteger(
    input.questionCount ?? catalog.defaultQuestionCount,
  );
  const horizonBars = normalizeInteger(
    input.horizonBars ?? catalog.defaultHorizonBars,
  );
  const maxOperations = normalizeInteger(
    input.maxOperations ?? catalog.defaultMaxOperations,
  );
  const decisionSecondsLimit = normalizeInteger(
    input.decisionSecondsLimit ?? catalog.defaultDecisionSecondsLimit,
  );
  const strictnessLevel = String(
    input.fastDecisionStrictnessLevel ??
      catalog.defaultFastDecisionStrictnessLevel,
  )
    .trim()
    .toUpperCase();
  const questionCountAllowed =
    isSpecialTrainingQuestionCountAllowed(questionCount);
  const horizonAllowed = isSpecialTrainingHorizonBarsAllowed(
    modeId,
    horizonBars,
  );
  const decisionSecondsSupported = catalog.supportsDecisionSecondsLimit;
  const decisionSecondsAllowed =
    decisionSecondsSupported &&
    isSpecialTrainingDecisionSecondsAllowed(modeId, decisionSecondsLimit);
  const strictnessSupported = supportsSpecialTrainingFastDecisionStrictness(modeId);
  const strictnessAllowed =
    strictnessSupported &&
    FAST_DECISION_STRICTNESS_LEVELS.some((item) => item === strictnessLevel);

  return {
    modeId,
    defaults: {
      questionCount: catalog.defaultQuestionCount,
      horizonBars: catalog.defaultHorizonBars,
      maxOperations: catalog.defaultMaxOperations,
      maxEntries: catalog.defaultMaxEntries,
      decisionSecondsLimit: catalog.defaultDecisionSecondsLimit,
      fastDecisionStrictnessLevel: catalog.defaultFastDecisionStrictnessLevel,
    },
    options: {
      questionCounts: SPECIAL_TRAINING_ALLOWED_QUESTION_COUNTS,
      horizonBars: catalog.allowedHorizonBars,
      decisionSeconds: catalog.allowedDecisionSeconds,
      fastDecisionStrictnessLevels: FAST_DECISION_STRICTNESS_LEVELS,
    },
    supports: {
      decisionSecondsLimit: decisionSecondsSupported,
      fastDecisionStrictness: strictnessSupported,
    },
    validation: {
      questionCount: {
        value: questionCount,
        allowedValues: SPECIAL_TRAINING_ALLOWED_QUESTION_COUNTS,
        enabled: questionCountAllowed,
        reasonCode: questionCountAllowed
          ? null
          : 'SPECIAL_TRAINING_QUESTION_COUNT_INVALID',
      },
      horizonBars: {
        value: horizonBars,
        allowedValues: catalog.allowedHorizonBars,
        enabled: horizonAllowed,
        reasonCode: horizonAllowed
          ? null
          : 'SPECIAL_TRAINING_HORIZON_INVALID',
      },
      maxOperations: {
        value: maxOperations,
        enabled: modeId !== 'fast-decision-training',
        reasonCode:
          modeId === 'fast-decision-training'
            ? 'SPECIAL_TRAINING_MAX_OPERATIONS_INVALID'
            : null,
      },
      decisionSecondsLimit: {
        value: decisionSecondsLimit,
        allowedValues: catalog.allowedDecisionSeconds,
        enabled: decisionSecondsAllowed,
        reasonCode: decisionSecondsSupported
          ? decisionSecondsAllowed
            ? null
            : 'SPECIAL_TRAINING_DECISION_SECONDS_INVALID'
          : 'SPECIAL_TRAINING_DECISION_SECONDS_UNSUPPORTED',
      },
      fastDecisionStrictnessLevel: {
        value: strictnessLevel,
        enabled: strictnessAllowed,
        reasonCode: strictnessSupported
          ? strictnessAllowed
            ? null
            : 'SPECIAL_TRAINING_FAST_DECISION_STRICTNESS_INVALID'
          : 'SPECIAL_TRAINING_FAST_DECISION_STRICTNESS_UNSUPPORTED',
      },
    },
  };
};

export const buildSpecialTrainingModeParameterFactsById = (): Record<
  SpecialTrainingModeId,
  SpecialTrainingModeParameterFacts
> =>
  Object.fromEntries(
    SPECIAL_TRAINING_MODE_IDS.map((modeId) => [
      modeId,
      buildSpecialTrainingModeParameterFacts(modeId),
    ]),
  ) as Record<SpecialTrainingModeId, SpecialTrainingModeParameterFacts>;
