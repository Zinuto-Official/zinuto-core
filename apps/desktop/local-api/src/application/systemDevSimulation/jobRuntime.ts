// SPDX-License-Identifier: GPL-3.0-only

import type { SystemDevSimulationEffectivePlan } from "@zinuto/shared/systemDevSimulationProfiles";
import { appError } from "../../kernel/appError.js";
import { getSystemDevSimulationBatch, upsertSystemDevSimulationBatch } from "../ports/infrastructure/db/systemDevSimulation/batchStore.js";
import {
  countSimulationQuestionLedgerByBatchIds,
  countSimulationReplayNotesByBatchIds,
  countSimulationSpecialTrainingBanksByBatchIds,
  countSimulationSpecialTrainingHistoryQuestionsByBatchIds,
  countSimulationSpecialTrainingHistorySessionsByBatchIds,
  countSimulationTrainingProjectsByBatchIds,
  countSimulationCustomIndicatorProfilesByBatchId,
  countSimulationBacktestBatchesByBatchId,
} from "../ports/infrastructure/db/systemDevSimulation/cleanupStore.js";
import {
  persistSystemDevSimulationJobSnapshot,
  upsertSystemDevSimulationJob,
  updateSystemDevSimulationJobProgress,
  type MutableSystemDevSimulationJob,
  type SystemDevSimulationJobCurrentWorkload,
  type StartSystemDevSimulationPayload,
} from "../ports/infrastructure/db/systemDevSimulation/jobStore.js";
import {
  estimateSystemDevSimulationRemainingMs,
  resolveSystemDevSimulationEffectivePlanForPools,
  resolveSystemDevSimulationTotalTargetForPlan,
} from "./planning.js";
import {
  buildSystemDevSimulationJobMessageToken,
  nowIso,
  type SystemDevSimulationJobMessageTokenKey,
} from "../../domain/systemDevSimulation/sharedDomain.js";
import { countIndependentCustomNotesByBatchId } from "../ports/infrastructure/db/systemDevSimulation/simulationReadStore.js";

export const setSimulationJobCurrentMessage = (
  job: MutableSystemDevSimulationJob,
  key: SystemDevSimulationJobMessageTokenKey,
  fallback: string,
  values?: Record<string, unknown> | null,
): void => {
  job.currentMessage = fallback;
  job.currentMessageToken = buildSystemDevSimulationJobMessageToken(
    key,
    fallback,
    values,
  );
};

export const updateJobTimingMetrics = (
  job: MutableSystemDevSimulationJob,
): void => {
  const startedAtMs = Date.parse(job.startedAt ?? "");
  const nowMs = Date.now();
  job.elapsedMs =
    Number.isFinite(startedAtMs) && startedAtMs > 0
      ? Math.max(0, nowMs - startedAtMs)
      : 0;
  const phaseStartedAtMs = Date.parse(job.phaseStartedAt ?? "");
  job.metrics.phaseElapsedMs =
    Number.isFinite(phaseStartedAtMs) && phaseStartedAtMs > 0
      ? Math.max(0, nowMs - phaseStartedAtMs)
      : 0;
  const completedItems =
    job.freeReplayCompleted +
    job.fastDecisionCompleted +
    job.riskDisciplineCompleted +
    job.createdCounts.independentCustomNotes +
    job.createdCounts.customIndicatorProfiles +
    job.createdCounts.realBacktestBatches;
  job.throughput = {
    completedItems,
    itemsPerMinute:
      job.elapsedMs > 0
        ? Number(((completedItems / job.elapsedMs) * 60_000).toFixed(2))
        : 0,
  };
  job.estimatedRemainingMs = estimateSystemDevSimulationRemainingMs({
    plan: job.effectivePlan,
    freeReplayCompleted: job.freeReplayCompleted,
    fastDecisionCompleted: job.fastDecisionCompleted,
    riskDisciplineCompleted: job.riskDisciplineCompleted,
    customNotesCreated: job.createdCounts.independentCustomNotes,
    customIndicatorProfilesCreated: job.createdCounts.customIndicatorProfiles,
    realBacktestBatchesCreated: job.createdCounts.realBacktestBatches,
    averages: job.metrics.workloadAverageMs,
  });
};

export const persistJobState = (job: MutableSystemDevSimulationJob): void => {
  updateJobTimingMetrics(job);
  updateSystemDevSimulationJobProgress(job);
  upsertSystemDevSimulationJob(job);
  persistSystemDevSimulationJobSnapshot(job);
};

export const markJobPhase = (
  job: MutableSystemDevSimulationJob,
  phase: MutableSystemDevSimulationJob["phase"],
): void => {
  if (job.phase !== phase) {
    job.phase = phase;
    job.phaseStartedAt = nowIso();
  } else if (!job.phaseStartedAt) {
    job.phaseStartedAt = nowIso();
  }
};

export const setSimulationJobCurrentWorkload = (
  job: MutableSystemDevSimulationJob,
  input: {
    workload: SystemDevSimulationJobCurrentWorkload["workload"];
    index?: number | null;
    current: number;
    target: number;
  },
): void => {
  const now = nowIso();
  const previous = job.currentWorkload;
  const sameWorkload =
    previous?.phase === job.phase &&
    previous.workload === input.workload &&
    previous.index ===
      (Number.isFinite(Number(input.index)) && Number(input.index) >= 0
        ? Math.floor(Number(input.index))
        : null);
  job.currentWorkload = {
    phase: job.phase,
    workload: input.workload,
    index:
      Number.isFinite(Number(input.index)) && Number(input.index) >= 0
        ? Math.floor(Number(input.index))
        : null,
    current: Math.max(0, Math.floor(Number(input.current) || 0)),
    target: Math.max(0, Math.floor(Number(input.target) || 0)),
    startedAt: sameWorkload && previous ? previous.startedAt : now,
    updatedAt: now,
  };
};

export const clearSimulationJobCurrentWorkload = (
  job: MutableSystemDevSimulationJob,
): void => {
  job.currentWorkload = null;
};

export const syncJobCountsFromBatch = (
  job: MutableSystemDevSimulationJob,
  batchId: string,
): void => {
  const batchIds = [batchId];
  job.freeReplayCompleted = countSimulationTrainingProjectsByBatchIds(batchIds);
  job.fastDecisionCompleted =
    countSimulationSpecialTrainingHistorySessionsByBatchIds(
      batchIds,
      "fast-decision-training",
    );
  job.riskDisciplineCompleted =
    countSimulationSpecialTrainingHistorySessionsByBatchIds(
      batchIds,
      "risk-discipline-training",
    );
  job.createdCounts = {
    trainingProjects: job.freeReplayCompleted,
    replayNotes: countSimulationReplayNotesByBatchIds(batchIds),
    independentCustomNotes: countIndependentCustomNotesByBatchId(batchId),
    specialTrainingSessions:
      countSimulationSpecialTrainingHistorySessionsByBatchIds(batchIds),
    specialTrainingQuestions:
      countSimulationSpecialTrainingHistoryQuestionsByBatchIds(batchIds),
    specialTrainingBanks: countSimulationSpecialTrainingBanksByBatchIds(batchIds),
    questionLedger: countSimulationQuestionLedgerByBatchIds(batchIds),
    customIndicatorProfiles: countSimulationCustomIndicatorProfilesByBatchId(
      batchId,
    ),
    realBacktestBatches: countSimulationBacktestBatchesByBatchId(
      batchId,
      "real",
    ),
    desktopMutableRuns: job.createdCounts.desktopMutableRuns,
  };
  updateJobTimingMetrics(job);
};

const recordAverageDuration = (input: {
  currentAverageMs: number | null;
  currentCount: number;
  latestDurationMs: number;
}): number => {
  const latestDurationMs = Math.max(
    1,
    Math.floor(Number(input.latestDurationMs) || 0),
  );
  const currentAverageMs =
    Number.isFinite(Number(input.currentAverageMs)) &&
    Number(input.currentAverageMs) > 0
      ? Number(input.currentAverageMs)
      : null;
  if (!currentAverageMs || input.currentCount <= 1) {
    return latestDurationMs;
  }
  return Math.max(
    1,
    Math.round(
      (currentAverageMs * Math.max(0, input.currentCount - 1) +
        latestDurationMs) /
        Math.max(1, input.currentCount),
    ),
  );
};

export const updateCalibrationObservation = (input: {
  job: MutableSystemDevSimulationJob;
  workload: "freeReplay" | "fastDecision" | "riskDiscipline" | "customNote";
  durationMs: number;
}): void => {
  if (input.workload === "freeReplay") {
    input.job.metrics.workloadAverageMs.freeReplayAverageMs =
      recordAverageDuration({
        currentAverageMs: input.job.metrics.workloadAverageMs.freeReplayAverageMs,
        currentCount: input.job.freeReplayCompleted,
        latestDurationMs: input.durationMs,
      });
    return;
  }
  if (input.workload === "fastDecision") {
    input.job.metrics.workloadAverageMs.fastDecisionAverageMs =
      recordAverageDuration({
        currentAverageMs:
          input.job.metrics.workloadAverageMs.fastDecisionAverageMs,
        currentCount: input.job.fastDecisionCompleted,
        latestDurationMs: input.durationMs,
      });
    return;
  }
  if (input.workload === "riskDiscipline") {
    input.job.metrics.workloadAverageMs.riskDisciplineAverageMs =
      recordAverageDuration({
        currentAverageMs:
          input.job.metrics.workloadAverageMs.riskDisciplineAverageMs,
        currentCount: input.job.riskDisciplineCompleted,
        latestDurationMs: input.durationMs,
      });
    return;
  }
  input.job.metrics.workloadAverageMs.customNoteAverageMs =
    recordAverageDuration({
      currentAverageMs: input.job.metrics.workloadAverageMs.customNoteAverageMs,
      currentCount: input.job.createdCounts.independentCustomNotes,
      latestDurationMs: input.durationMs,
    });
};

export const maybeThrowJobInterrupted = (
  job: MutableSystemDevSimulationJob,
): void => {
  if (job.cancelRequested) {
    throw appError("SYSTEM_DEV_SIMULATION_INTERRUPTED");
  }
  const hardLimitMs = Number(job.effectivePlan?.budget.hardLimitMs) || 0;
  if (hardLimitMs > 0) {
    updateJobTimingMetrics(job);
    if (job.elapsedMs >= hardLimitMs) {
      throw appError("SYSTEM_DEV_SIMULATION_INTERRUPTED", {
        reason: "HARD_LIMIT_REACHED",
      });
    }
  }
};

const updateBatchEffectivePlan = (
  payload: StartSystemDevSimulationPayload,
  effectivePlan: SystemDevSimulationEffectivePlan,
): void => {
  upsertSystemDevSimulationBatch({
    id: payload.batchId,
    profileId: payload.profileId,
    seed: payload.batchSeed,
    specVersion: effectivePlan.specVersion,
    effectivePlan,
    createdAt: getSystemDevSimulationBatch(payload.batchId)?.createdAt,
    finishedAt: getSystemDevSimulationBatch(payload.batchId)?.finishedAt ?? null,
  });
};

export const finalizeCalibratedPlan = (
  job: MutableSystemDevSimulationJob,
  payload: StartSystemDevSimulationPayload,
): void => {
  if (payload.profileId !== "STRESS") {
    return;
  }
  const nextPlan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: payload.profileId,
    pools: payload.enabledSamplePools,
    calibration: job.metrics.workloadAverageMs,
    targets: payload.targets,
  });
  job.effectivePlan = nextPlan;
  job.freeReplayTarget = nextPlan.targets.freeReplayTarget;
  job.fastDecisionTarget = nextPlan.targets.fastDecisionTarget;
  job.riskDisciplineTarget = nextPlan.targets.riskDisciplineTarget;
  job.totalTarget = resolveSystemDevSimulationTotalTargetForPlan(nextPlan);
  updateBatchEffectivePlan(payload, nextPlan);
  updateJobTimingMetrics(job);
};
