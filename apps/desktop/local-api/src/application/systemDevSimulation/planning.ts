// SPDX-License-Identifier: GPL-3.0-only

import {
  SYSTEM_DEV_SIMULATION_FAST_DECISION_OUTCOME_BUCKETS,
  SYSTEM_DEV_SIMULATION_FREE_REPLAY_ARCHETYPES,
  SYSTEM_DEV_SIMULATION_RISK_DISCIPLINE_OUTCOME_BUCKETS,
  countSystemDevSimulationEnabledPairs,
  resolveSystemDevSimulationEffectivePlan,
  type SystemDevSimulationCalibrationObservation,
  type SystemDevSimulationEffectivePlan,
  type SystemDevSimulationFastDecisionOutcomeBucket,
  type SystemDevSimulationFreeReplayArchetype,
  type SystemDevSimulationProfileId,
  type SystemDevSimulationProfileTargets,
  type SystemDevSimulationRiskDisciplineOutcomeBucket,
} from "@zinuto/shared/systemDevSimulationProfiles";
import type { SystemDevSimulationEnabledPool } from "../../domain/systemDevSimulation/sharedDomain.js";

export const resolveSystemDevSimulationEffectivePlanForPools = (input: {
  profileId: SystemDevSimulationProfileId;
  pools: readonly SystemDevSimulationEnabledPool[];
  calibration?: Partial<SystemDevSimulationCalibrationObservation> | null;
  targets?: Partial<SystemDevSimulationProfileTargets> | null;
}): SystemDevSimulationEffectivePlan =>
  resolveSystemDevSimulationEffectivePlan({
    profileId: input.profileId,
    enabledPairCount: countSystemDevSimulationEnabledPairs(input.pools),
    calibration: input.calibration,
    targets: input.targets,
  });

export const resolveSystemDevSimulationTotalTargetForPlan = (
  plan: SystemDevSimulationEffectivePlan,
  options?: { calibrationOnly?: boolean },
): number => {
  const targets =
    options?.calibrationOnly && plan.budget.calibrationTargets
      ? plan.budget.calibrationTargets
      : plan.targets;
  return Math.max(
    1,
    Math.floor(Number(targets.freeReplayTarget) || 0) +
      Math.floor(Number(targets.fastDecisionTarget) || 0) +
      Math.floor(Number(targets.riskDisciplineTarget) || 0) +
      Math.floor(Number(targets.independentCustomNotes) || 0) +
      Math.floor(Number(targets.customIndicatorProfiles) || 0) +
      Math.floor(Number(targets.realBacktestBatches) || 0) +
      2,
  );
};

export const resolveSystemDevSimulationCalibrationTargets = (
  plan: SystemDevSimulationEffectivePlan,
): SystemDevSimulationProfileTargets | null =>
  plan.profileId === "STRESS" ? plan.budget.calibrationTargets ?? null : null;

export const buildFreeReplayArchetypeSequence = (
  plan: SystemDevSimulationEffectivePlan,
  count: number,
): SystemDevSimulationFreeReplayArchetype[] => {
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  const warmup = plan.coverage.freeReplayWarmupArchetypes.length
    ? plan.coverage.freeReplayWarmupArchetypes
    : [...SYSTEM_DEV_SIMULATION_FREE_REPLAY_ARCHETYPES];
  const sequence: SystemDevSimulationFreeReplayArchetype[] = [];
  for (let index = 0; index < normalizedCount; index += 1) {
    sequence.push(warmup[index % warmup.length] ?? warmup[0]!);
  }
  return sequence;
};

export const buildFastDecisionOutcomeSequence = (
  plan: SystemDevSimulationEffectivePlan,
  count: number,
): SystemDevSimulationFastDecisionOutcomeBucket[] => {
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  const buckets = plan.coverage.fastDecisionBuckets.length
    ? plan.coverage.fastDecisionBuckets
    : [...SYSTEM_DEV_SIMULATION_FAST_DECISION_OUTCOME_BUCKETS];
  const sequence: SystemDevSimulationFastDecisionOutcomeBucket[] = [];
  for (let index = 0; index < normalizedCount; index += 1) {
    sequence.push(buckets[index % buckets.length] ?? buckets[0]!);
  }
  return sequence;
};

export const buildRiskDisciplineOutcomeSequence = (
  plan: SystemDevSimulationEffectivePlan,
  count: number,
): SystemDevSimulationRiskDisciplineOutcomeBucket[] => {
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  const buckets = plan.coverage.riskDisciplineBuckets.length
    ? plan.coverage.riskDisciplineBuckets
    : [...SYSTEM_DEV_SIMULATION_RISK_DISCIPLINE_OUTCOME_BUCKETS];
  const sequence: SystemDevSimulationRiskDisciplineOutcomeBucket[] = [];
  for (let index = 0; index < normalizedCount; index += 1) {
    sequence.push(buckets[index % buckets.length] ?? buckets[0]!);
  }
  return sequence;
};

export const estimateSystemDevSimulationRemainingMs = (input: {
  plan: SystemDevSimulationEffectivePlan | null;
  freeReplayCompleted: number;
  fastDecisionCompleted: number;
  riskDisciplineCompleted: number;
  customNotesCreated: number;
  customIndicatorProfilesCreated?: number;
  realBacktestBatchesCreated?: number;
  averages: Partial<SystemDevSimulationCalibrationObservation> | null | undefined;
}): number | null => {
  const plan = input.plan;
  if (!plan) {
    return null;
  }
  const averageFreeReplayMs = Number(input.averages?.freeReplayAverageMs) || 0;
  const averageFastDecisionMs = Number(input.averages?.fastDecisionAverageMs) || 0;
  const averageRiskDisciplineMs =
    Number(input.averages?.riskDisciplineAverageMs) || 0;
  const averageCustomNoteMs = Number(input.averages?.customNoteAverageMs) || 0;
  const remainingCustomIndicatorProfiles = Math.max(
    0,
    plan.targets.customIndicatorProfiles -
      Math.max(0, Math.floor(Number(input.customIndicatorProfilesCreated) || 0)),
  );
  const remainingRealBacktestBatches = Math.max(
    0,
    plan.targets.realBacktestBatches -
      Math.max(0, Math.floor(Number(input.realBacktestBatchesCreated) || 0)),
  );
  const generatedWorkloadEstimateMs =
    remainingCustomIndicatorProfiles * 25 +
    remainingRealBacktestBatches * 1_000;
  if (
    averageFreeReplayMs <= 0 ||
    averageFastDecisionMs <= 0 ||
    averageRiskDisciplineMs <= 0 ||
    averageCustomNoteMs <= 0
  ) {
    const baseWorkloadEstimateMs = plan.budget.projectedDurationMs;
    if (baseWorkloadEstimateMs !== null) {
      return baseWorkloadEstimateMs + generatedWorkloadEstimateMs;
    }
    const hasLegacyWorkloads =
      plan.targets.freeReplayTarget > 0 ||
      plan.targets.fastDecisionTarget > 0 ||
      plan.targets.riskDisciplineTarget > 0 ||
      plan.targets.independentCustomNotes > 0;
    return hasLegacyWorkloads ? null : generatedWorkloadEstimateMs;
  }
  const remainingFreeReplay = Math.max(
    0,
    plan.targets.freeReplayTarget - Math.max(0, Math.floor(input.freeReplayCompleted)),
  );
  const remainingFastDecision = Math.max(
    0,
    plan.targets.fastDecisionTarget - Math.max(0, Math.floor(input.fastDecisionCompleted)),
  );
  const remainingRiskDiscipline = Math.max(
    0,
    plan.targets.riskDisciplineTarget -
      Math.max(0, Math.floor(input.riskDisciplineCompleted)),
  );
  const remainingCustomNotes = Math.max(
    0,
    plan.targets.independentCustomNotes -
      Math.max(0, Math.floor(input.customNotesCreated)),
  );
  return Math.round(
    remainingFreeReplay * averageFreeReplayMs +
      remainingFastDecision * averageFastDecisionMs +
      remainingRiskDiscipline * averageRiskDisciplineMs +
      remainingCustomNotes * averageCustomNoteMs +
      generatedWorkloadEstimateMs,
  );
};
