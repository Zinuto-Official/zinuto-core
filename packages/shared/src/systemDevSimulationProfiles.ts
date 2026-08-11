// SPDX-License-Identifier: GPL-3.0-only

import { REPLAY_DRAW_TOOL_VISIBLE_NAMES } from "./replayDrawingTools.js";
import { REPLAY_NOTE_COLOR_TOKENS } from "./replayNoteColors.js";
import { REPLAY_NOTE_TYPES } from "./replayNoteTypes.js";
import {
  ORDER_INPUT_MODES,
  PRICE_MODES,
  type OrderInputMode,
  type PriceMode,
} from "./trading.js";

export const SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION = 7;

export const SYSTEM_DEV_SIMULATION_PROFILE_IDS = [
  "REALISTIC",
  "STRESS",
] as const;

export type SystemDevSimulationProfileId =
  (typeof SYSTEM_DEV_SIMULATION_PROFILE_IDS)[number];

export type SystemDevSimulationEnabledPoolLike = {
  baseTimeframe: "1m" | "5m" | "1h" | "1d";
  symbols: string[];
  instruments?: Array<{
    instrumentId?: string | null;
    symbol?: string | null;
    baseTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  }>;
};

export type SystemDevSimulationDataAvailability = {
  ready: boolean;
  localReadySourceCount: number;
  localEligibleInstrumentCount: number;
  systemEligibleInstrumentCount: number;
  selectedInstrumentCount: number;
  selectedLocalInstrumentCount: number;
  selectedSystemInstrumentCount: number;
  willUseSystemFallback: boolean;
  sourceStrategy:
    | "NONE"
    | "LOCAL_READY"
    | "SYSTEM_FALLBACK_ONLY";
};

export type SystemDevSimulationProfileTargets = {
  freeReplayTarget: number;
  fastDecisionTarget: number;
  riskDisciplineTarget: number;
  independentCustomNotes: number;
  customIndicatorProfiles: number;
  realBacktestBatches: number;
};

export const SYSTEM_DEV_SIMULATION_FREE_REPLAY_ARCHETYPES = [
  "TREND_CONTINUATION",
  "FALSE_BREAKOUT",
  "RANGE_ROTATION",
  "MEAN_REVERSION",
  "SHORT_OPPORTUNITY",
  "SCALE_IN_OUT",
  "WATCH_ONLY",
  "FORCED_EXIT",
] as const;

export type SystemDevSimulationFreeReplayArchetype =
  (typeof SYSTEM_DEV_SIMULATION_FREE_REPLAY_ARCHETYPES)[number];

export const SYSTEM_DEV_SIMULATION_FREE_REPLAY_INPUT_MODES =
  ORDER_INPUT_MODES;

export type SystemDevSimulationFreeReplayInputMode = OrderInputMode;

export const SYSTEM_DEV_SIMULATION_FREE_REPLAY_PRICE_MODES = PRICE_MODES;

export type SystemDevSimulationFreeReplayPriceMode = PriceMode;

export const SYSTEM_DEV_SIMULATION_TRAINING_TAGS = [
  "trend",
  "range",
  "short",
  "scale",
  "watch",
  "risk",
] as const;

export type SystemDevSimulationTrainingTag =
  (typeof SYSTEM_DEV_SIMULATION_TRAINING_TAGS)[number];

export const SYSTEM_DEV_SIMULATION_FAST_DECISION_OUTCOME_BUCKETS = [
  "CORRECT",
  "WRONG",
  "TIMEOUT",
  "LATE_CONFIRM",
] as const;

export type SystemDevSimulationFastDecisionOutcomeBucket =
  (typeof SYSTEM_DEV_SIMULATION_FAST_DECISION_OUTCOME_BUCKETS)[number];

export const SYSTEM_DEV_SIMULATION_RISK_DISCIPLINE_OUTCOME_BUCKETS = [
  "EARLY_CUT",
  "ADD_AND_HOLD",
  "FREEZE",
  "RECOVERED",
  "FAILED",
] as const;

export type SystemDevSimulationRiskDisciplineOutcomeBucket =
  (typeof SYSTEM_DEV_SIMULATION_RISK_DISCIPLINE_OUTCOME_BUCKETS)[number];

export type SystemDevSimulationCalibrationObservation = {
  freeReplayAverageMs: number | null;
  fastDecisionAverageMs: number | null;
  riskDisciplineAverageMs: number | null;
  customNoteAverageMs: number | null;
};

export type SystemDevSimulationProfileSpec = {
  id: SystemDevSimulationProfileId;
  specVersion: number;
  devOnly: boolean;
  budget: {
    targetDurationMs: number | null;
    hardLimitMs: number | null;
    calibrationTargets: SystemDevSimulationProfileTargets | null;
  };
  targetPolicy: {
    freeReplayMin: number;
    freeReplayMax: number;
    fastDecisionMin: number;
    fastDecisionMax: number;
    riskDisciplineMin: number;
    riskDisciplineMax: number;
    independentCustomNotesMin: number;
    independentCustomNotesMax: number;
    customIndicatorProfilesMin: number;
    customIndicatorProfilesMax: number;
    realBacktestBatchesMin: number;
    realBacktestBatchesMax: number;
  };
  runtime: {
    freeReplayConcurrency: number;
    challengeConcurrency: number;
    customNoteConcurrency: number;
    barCacheMaxSeries: number;
  };
  notePolicy: {
    freeReplayForceCreateUntil: number;
    freeReplayCreateProbability: number;
    challengeForceCreateUntil: number;
    challengeCreateProbability: number;
    maxColorCount: number;
  };
  coverage: {
    freeReplayWarmupArchetypes: SystemDevSimulationFreeReplayArchetype[];
    freeReplayMinPerArchetype: number;
    freeReplayInputModes: SystemDevSimulationFreeReplayInputMode[];
    freeReplayPriceModes: SystemDevSimulationFreeReplayPriceMode[];
    drawingTools: Array<(typeof REPLAY_DRAW_TOOL_VISIBLE_NAMES)[number]>;
    noteTypes: Array<(typeof REPLAY_NOTE_TYPES)[number]>;
    noteColorTokens: Array<(typeof REPLAY_NOTE_COLOR_TOKENS)[number]>;
    trainingTags: SystemDevSimulationTrainingTag[];
    fastDecisionBuckets: SystemDevSimulationFastDecisionOutcomeBucket[];
    fastDecisionMinPerBucket: number;
    riskDisciplineBuckets: SystemDevSimulationRiskDisciplineOutcomeBucket[];
    riskDisciplineMinPerBucket: number;
    requireLeveragePresetCoverage: boolean;
  };
};

export type SystemDevSimulationEffectivePlan = {
  specVersion: number;
  profileId: SystemDevSimulationProfileId;
  enabledPairCount: number;
  calibrated: boolean;
  budget: {
    targetDurationMs: number | null;
    hardLimitMs: number | null;
    projectedDurationMs: number | null;
    calibrationTargets: SystemDevSimulationProfileTargets | null;
  };
  targets: SystemDevSimulationProfileTargets;
  runtime: SystemDevSimulationProfileSpec["runtime"];
  notePolicy: SystemDevSimulationProfileSpec["notePolicy"];
  coverage: SystemDevSimulationProfileSpec["coverage"];
  calibrationObservation: SystemDevSimulationCalibrationObservation | null;
};

export type SystemDevSimulationCapabilities = {
  specVersion: number;
  defaultProfileId: SystemDevSimulationProfileId;
  dataAvailability: SystemDevSimulationDataAvailability;
  profiles: Array<{
    profileId: SystemDevSimulationProfileId;
    available: boolean;
    devOnly: boolean;
    reasonCode: "AVAILABLE" | "DEV_ONLY_DISABLED" | null;
    defaultTargets: SystemDevSimulationProfileTargets;
  }>;
};

const STRESS_TARGET_DURATION_MS = 12 * 60_000;
const STRESS_HARD_LIMIT_MS = 18 * 60_000;

const PROFILE_SPECS: Record<
  SystemDevSimulationProfileId,
  SystemDevSimulationProfileSpec
> = {
  REALISTIC: {
    id: "REALISTIC",
    specVersion: SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION,
    devOnly: false,
    budget: {
      targetDurationMs: null,
      hardLimitMs: null,
      calibrationTargets: null,
    },
    targetPolicy: {
      freeReplayMin: 24,
      freeReplayMax: 96,
      fastDecisionMin: 24,
      fastDecisionMax: 24,
      riskDisciplineMin: 24,
      riskDisciplineMax: 24,
      independentCustomNotesMin: 6,
      independentCustomNotesMax: 24,
      customIndicatorProfilesMin: 12,
      customIndicatorProfilesMax: 1_000,
      realBacktestBatchesMin: 33,
      realBacktestBatchesMax: 500,
    },
    runtime: {
      freeReplayConcurrency: 1,
      challengeConcurrency: 2,
      customNoteConcurrency: 1,
      barCacheMaxSeries: 8,
    },
    notePolicy: {
      freeReplayForceCreateUntil: 8,
      freeReplayCreateProbability: 0.68,
      challengeForceCreateUntil: 4,
      challengeCreateProbability: 0.84,
      maxColorCount: 3,
    },
    coverage: {
      freeReplayWarmupArchetypes: [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_ARCHETYPES],
      freeReplayMinPerArchetype: 1,
      freeReplayInputModes: [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_INPUT_MODES],
      freeReplayPriceModes: [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_PRICE_MODES],
      drawingTools: [...REPLAY_DRAW_TOOL_VISIBLE_NAMES],
      noteTypes: [...REPLAY_NOTE_TYPES],
      noteColorTokens: [...REPLAY_NOTE_COLOR_TOKENS],
      trainingTags: [...SYSTEM_DEV_SIMULATION_TRAINING_TAGS],
      fastDecisionBuckets: [...SYSTEM_DEV_SIMULATION_FAST_DECISION_OUTCOME_BUCKETS],
      fastDecisionMinPerBucket: 1,
      riskDisciplineBuckets: [...SYSTEM_DEV_SIMULATION_RISK_DISCIPLINE_OUTCOME_BUCKETS],
      riskDisciplineMinPerBucket: 1,
      requireLeveragePresetCoverage: false,
    },
  },
  STRESS: {
    id: "STRESS",
    specVersion: SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION,
    devOnly: true,
    budget: {
      targetDurationMs: STRESS_TARGET_DURATION_MS,
      hardLimitMs: STRESS_HARD_LIMIT_MS,
      calibrationTargets: null,
    },
    targetPolicy: {
      freeReplayMin: 1200,
      freeReplayMax: 3000,
      fastDecisionMin: 240,
      fastDecisionMax: 600,
      riskDisciplineMin: 240,
      riskDisciplineMax: 600,
      independentCustomNotesMin: 24,
      independentCustomNotesMax: 48,
      customIndicatorProfilesMin: 60,
      customIndicatorProfilesMax: 1_000,
      realBacktestBatchesMin: 310,
      realBacktestBatchesMax: 500,
    },
    runtime: {
      freeReplayConcurrency: 4,
      challengeConcurrency: 4,
      customNoteConcurrency: 2,
      barCacheMaxSeries: 32,
    },
    notePolicy: {
      freeReplayForceCreateUntil: 64,
      freeReplayCreateProbability: 0.85,
      challengeForceCreateUntil: 12,
      challengeCreateProbability: 0.95,
      maxColorCount: 3,
    },
    coverage: {
      freeReplayWarmupArchetypes: [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_ARCHETYPES],
      freeReplayMinPerArchetype: 8,
      freeReplayInputModes: [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_INPUT_MODES],
      freeReplayPriceModes: [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_PRICE_MODES],
      drawingTools: [...REPLAY_DRAW_TOOL_VISIBLE_NAMES],
      noteTypes: [...REPLAY_NOTE_TYPES],
      noteColorTokens: [...REPLAY_NOTE_COLOR_TOKENS],
      trainingTags: [...SYSTEM_DEV_SIMULATION_TRAINING_TAGS],
      fastDecisionBuckets: [...SYSTEM_DEV_SIMULATION_FAST_DECISION_OUTCOME_BUCKETS],
      fastDecisionMinPerBucket: 12,
      riskDisciplineBuckets: [...SYSTEM_DEV_SIMULATION_RISK_DISCIPLINE_OUTCOME_BUCKETS],
      riskDisciplineMinPerBucket: 10,
      requireLeveragePresetCoverage: true,
    },
  },
};

const normalizeFiniteNumber = (
  value: unknown,
  fallback = 0,
): number => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundWithinBounds = (
  value: number,
  min: number,
  max: number,
): number =>
  clamp(Math.round(normalizeFiniteNumber(value, min)), min, max);

export const resolveSystemDevSimulationProfileId = (
  value: unknown,
): SystemDevSimulationProfileId =>
  value === "STRESS" ? "STRESS" : "REALISTIC";

export const countSystemDevSimulationEnabledPairs = (
  pools: readonly SystemDevSimulationEnabledPoolLike[],
): number => {
  const seen = new Set<string>();
  for (const pool of Array.isArray(pools) ? pools : []) {
    const timeframe = String(pool?.baseTimeframe ?? "").trim().toLowerCase();
    if (Array.isArray(pool?.instruments) && pool.instruments.length > 0) {
      for (const instrument of pool.instruments) {
        const instrumentId = String(instrument?.instrumentId ?? "").trim();
        const instrumentTimeframe = String(
          instrument?.baseTimeframe ?? timeframe,
        )
          .trim()
          .toLowerCase();
        if (!instrumentId || !instrumentTimeframe) {
          continue;
        }
        seen.add(`${instrumentTimeframe}::${instrumentId}`);
      }
      continue;
    }
    for (const rawSymbol of Array.isArray(pool?.symbols) ? pool.symbols : []) {
      const symbol = String(rawSymbol ?? "").trim().toUpperCase();
      if (!symbol || !timeframe) {
        continue;
      }
      seen.add(`${timeframe}::${symbol}`);
    }
  }
  return seen.size;
};

export const resolveSystemDevSimulationProfileSpec = (
  profileId: SystemDevSimulationProfileId,
): SystemDevSimulationProfileSpec =>
  PROFILE_SPECS[resolveSystemDevSimulationProfileId(profileId)];

const resolveRealisticTargets = (): SystemDevSimulationProfileTargets => ({
  freeReplayTarget: 48,
  fastDecisionTarget: 24,
  riskDisciplineTarget: 24,
  independentCustomNotes: 24,
  customIndicatorProfiles: 12,
  realBacktestBatches: 33,
});

const hasCalibrationObservation = (
  calibration: Partial<SystemDevSimulationCalibrationObservation> | null | undefined,
): boolean =>
  Boolean(
    normalizeFiniteNumber(calibration?.freeReplayAverageMs, 0) > 0 &&
      normalizeFiniteNumber(calibration?.fastDecisionAverageMs, 0) > 0 &&
      normalizeFiniteNumber(calibration?.riskDisciplineAverageMs, 0) > 0 &&
      normalizeFiniteNumber(calibration?.customNoteAverageMs, 0) > 0,
  );

const projectDurationMs = (
  targets: SystemDevSimulationProfileTargets,
  calibration: Partial<SystemDevSimulationCalibrationObservation> | null | undefined,
): number | null => {
  if (!hasCalibrationObservation(calibration)) {
    return null;
  }
  return Math.round(
    Math.max(0, normalizeFiniteNumber(calibration?.freeReplayAverageMs, 0)) *
      targets.freeReplayTarget +
      Math.max(0, normalizeFiniteNumber(calibration?.fastDecisionAverageMs, 0)) *
        targets.fastDecisionTarget +
      Math.max(0, normalizeFiniteNumber(calibration?.riskDisciplineAverageMs, 0)) *
        targets.riskDisciplineTarget +
      Math.max(0, normalizeFiniteNumber(calibration?.customNoteAverageMs, 0)) *
        targets.independentCustomNotes,
  );
};

const resolveStressTargets = (
  calibration: Partial<SystemDevSimulationCalibrationObservation> | null | undefined,
): SystemDevSimulationProfileTargets => {
  const spec = PROFILE_SPECS.STRESS;
  const minimumTargets: SystemDevSimulationProfileTargets = {
    freeReplayTarget: spec.targetPolicy.freeReplayMin,
    fastDecisionTarget: spec.targetPolicy.fastDecisionMin,
    riskDisciplineTarget: spec.targetPolicy.riskDisciplineMin,
    independentCustomNotes: spec.targetPolicy.independentCustomNotesMin,
    customIndicatorProfiles: spec.targetPolicy.customIndicatorProfilesMin,
    realBacktestBatches: spec.targetPolicy.realBacktestBatchesMin,
  };
  if (!hasCalibrationObservation(calibration)) {
    return minimumTargets;
  }

  const minimumProjectedDurationMs = Math.max(
    1,
    projectDurationMs(minimumTargets, calibration) ?? 1,
  );
  const scaleFactor = Math.max(
    1,
    normalizeFiniteNumber(spec.budget.targetDurationMs, minimumProjectedDurationMs) /
      minimumProjectedDurationMs,
  );

  return {
    freeReplayTarget: roundWithinBounds(
      minimumTargets.freeReplayTarget * scaleFactor,
      spec.targetPolicy.freeReplayMin,
      spec.targetPolicy.freeReplayMax,
    ),
    fastDecisionTarget: roundWithinBounds(
      minimumTargets.fastDecisionTarget * scaleFactor,
      spec.targetPolicy.fastDecisionMin,
      spec.targetPolicy.fastDecisionMax,
    ),
    riskDisciplineTarget: roundWithinBounds(
      minimumTargets.riskDisciplineTarget * scaleFactor,
      spec.targetPolicy.riskDisciplineMin,
      spec.targetPolicy.riskDisciplineMax,
    ),
    independentCustomNotes: roundWithinBounds(
      minimumTargets.independentCustomNotes * scaleFactor,
      spec.targetPolicy.independentCustomNotesMin,
      spec.targetPolicy.independentCustomNotesMax,
    ),
    customIndicatorProfiles: minimumTargets.customIndicatorProfiles,
    realBacktestBatches: minimumTargets.realBacktestBatches,
  };
};

export const resolveSystemDevSimulationProfileTargets = (
  profileId: SystemDevSimulationProfileId,
  _enabledPairCount: number,
): SystemDevSimulationProfileTargets =>
  resolveSystemDevSimulationProfileId(profileId) === "STRESS"
    ? resolveStressTargets(null)
    : resolveRealisticTargets();

const normalizeRequestedTargets = (
  profileId: SystemDevSimulationProfileId,
  fallback: SystemDevSimulationProfileTargets,
  requested: Partial<SystemDevSimulationProfileTargets> | null | undefined,
): SystemDevSimulationProfileTargets => {
  const policy = resolveSystemDevSimulationProfileSpec(profileId).targetPolicy;
  const normalizeTarget = (
    key: keyof SystemDevSimulationProfileTargets,
    min: number,
    max: number,
  ): number => {
    if (!requested || requested[key] === undefined) {
      return fallback[key];
    }
    const value = Number(requested[key]);
    return Number.isFinite(value)
      ? clamp(Math.floor(value), min, max)
      : fallback[key];
  };
  return {
    freeReplayTarget: normalizeTarget(
      "freeReplayTarget",
      0,
      policy.freeReplayMax,
    ),
    fastDecisionTarget: normalizeTarget(
      "fastDecisionTarget",
      0,
      policy.fastDecisionMax,
    ),
    riskDisciplineTarget: normalizeTarget(
      "riskDisciplineTarget",
      0,
      policy.riskDisciplineMax,
    ),
    independentCustomNotes: normalizeTarget(
      "independentCustomNotes",
      0,
      policy.independentCustomNotesMax,
    ),
    customIndicatorProfiles: normalizeTarget(
      "customIndicatorProfiles",
      0,
      policy.customIndicatorProfilesMax,
    ),
    realBacktestBatches: normalizeTarget(
      "realBacktestBatches",
      0,
      policy.realBacktestBatchesMax,
    ),
  };
};

export const resolveSystemDevSimulationEffectivePlan = (input: {
  profileId: SystemDevSimulationProfileId;
  enabledPairCount: number;
  calibration?: Partial<SystemDevSimulationCalibrationObservation> | null;
  targets?: Partial<SystemDevSimulationProfileTargets> | null;
}): SystemDevSimulationEffectivePlan => {
  const profileId = resolveSystemDevSimulationProfileId(input.profileId);
  const spec = resolveSystemDevSimulationProfileSpec(profileId);
  const enabledPairCount = Math.max(
    0,
    Math.floor(normalizeFiniteNumber(input.enabledPairCount, 0)),
  );
  const calibration =
    profileId === "STRESS" && hasCalibrationObservation(input.calibration)
      ? {
          freeReplayAverageMs: Math.max(
            1,
            normalizeFiniteNumber(input.calibration?.freeReplayAverageMs, 1),
          ),
          fastDecisionAverageMs: Math.max(
            1,
            normalizeFiniteNumber(input.calibration?.fastDecisionAverageMs, 1),
          ),
          riskDisciplineAverageMs: Math.max(
            1,
            normalizeFiniteNumber(input.calibration?.riskDisciplineAverageMs, 1),
          ),
          customNoteAverageMs: Math.max(
            1,
            normalizeFiniteNumber(input.calibration?.customNoteAverageMs, 1),
          ),
        }
      : null;
  const defaultTargets =
    profileId === "STRESS"
      ? resolveStressTargets(calibration)
      : resolveRealisticTargets();
  const targets = normalizeRequestedTargets(
    profileId,
    defaultTargets,
    input.targets,
  );

  return {
    specVersion: spec.specVersion,
    profileId,
    enabledPairCount,
    calibrated: Boolean(calibration) || profileId !== "STRESS",
    budget: {
      targetDurationMs: spec.budget.targetDurationMs,
      hardLimitMs: spec.budget.hardLimitMs,
      projectedDurationMs: projectDurationMs(targets, calibration),
      calibrationTargets: spec.budget.calibrationTargets,
    },
    targets,
    runtime: { ...spec.runtime },
    notePolicy: { ...spec.notePolicy },
    coverage: {
      freeReplayWarmupArchetypes: [...spec.coverage.freeReplayWarmupArchetypes],
      freeReplayMinPerArchetype: spec.coverage.freeReplayMinPerArchetype,
      freeReplayInputModes: [...spec.coverage.freeReplayInputModes],
      freeReplayPriceModes: [...spec.coverage.freeReplayPriceModes],
      drawingTools: [...spec.coverage.drawingTools],
      noteTypes: [...spec.coverage.noteTypes],
      noteColorTokens: [...spec.coverage.noteColorTokens],
      trainingTags: [...spec.coverage.trainingTags],
      fastDecisionBuckets: [...spec.coverage.fastDecisionBuckets],
      fastDecisionMinPerBucket: spec.coverage.fastDecisionMinPerBucket,
      riskDisciplineBuckets: [...spec.coverage.riskDisciplineBuckets],
      riskDisciplineMinPerBucket: spec.coverage.riskDisciplineMinPerBucket,
      requireLeveragePresetCoverage: spec.coverage.requireLeveragePresetCoverage,
    },
    calibrationObservation: calibration,
  };
};

export const resolveSystemDevSimulationCapabilities = (input?: {
  stressAvailable?: boolean;
  dataAvailability?: Partial<SystemDevSimulationDataAvailability> | null;
}): SystemDevSimulationCapabilities => {
  const stressAvailable = Boolean(input?.stressAvailable);
  const dataAvailability: SystemDevSimulationDataAvailability = {
    ready: Boolean(input?.dataAvailability?.ready),
    localReadySourceCount: Math.max(
      0,
      Math.floor(Number(input?.dataAvailability?.localReadySourceCount) || 0),
    ),
    localEligibleInstrumentCount: Math.max(
      0,
      Math.floor(Number(input?.dataAvailability?.localEligibleInstrumentCount) || 0),
    ),
    systemEligibleInstrumentCount: Math.max(
      0,
      Math.floor(Number(input?.dataAvailability?.systemEligibleInstrumentCount) || 0),
    ),
    selectedInstrumentCount: Math.max(
      0,
      Math.floor(Number(input?.dataAvailability?.selectedInstrumentCount) || 0),
    ),
    selectedLocalInstrumentCount: Math.max(
      0,
      Math.floor(Number(input?.dataAvailability?.selectedLocalInstrumentCount) || 0),
    ),
    selectedSystemInstrumentCount: Math.max(
      0,
      Math.floor(Number(input?.dataAvailability?.selectedSystemInstrumentCount) || 0),
    ),
    willUseSystemFallback: Boolean(input?.dataAvailability?.willUseSystemFallback),
    sourceStrategy:
      input?.dataAvailability?.sourceStrategy === "LOCAL_READY" ||
      input?.dataAvailability?.sourceStrategy === "SYSTEM_FALLBACK_ONLY"
        ? input.dataAvailability.sourceStrategy
        : "NONE",
  };
  return {
    specVersion: SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION,
    defaultProfileId: "REALISTIC",
    dataAvailability,
    profiles: SYSTEM_DEV_SIMULATION_PROFILE_IDS.map((profileId) => {
      const spec = resolveSystemDevSimulationProfileSpec(profileId);
      const available = profileId === "STRESS" ? stressAvailable : true;
      return {
        profileId,
        available,
        devOnly: spec.devOnly,
        reasonCode: available ? "AVAILABLE" : "DEV_ONLY_DISABLED",
        defaultTargets: resolveSystemDevSimulationProfileTargets(profileId, 0),
      };
    }),
  };
};
