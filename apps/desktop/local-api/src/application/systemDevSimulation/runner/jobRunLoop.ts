// SPDX-License-Identifier: GPL-3.0-only

import { appError } from "../../../kernel/appError.js";
import { resolveSessionNameFormat } from "@zinuto/shared/sessionNaming";
import {
  formatCopyTemplate,
  resolveAppUiLanguage,
  type SystemDevSimulationCopy,
} from "@zinuto/shared/systemDevSimulationCopy";
import type {
  SystemDevSimulationEffectivePlan,
  SystemDevSimulationFastDecisionOutcomeBucket,
  SystemDevSimulationProfileTargets,
  SystemDevSimulationRiskDisciplineOutcomeBucket,
} from "@zinuto/shared/systemDevSimulationProfiles";
import type { SpecialTrainingModeId } from "../../specialTrainingService.js";
import type { SpecialTrainingSimulationSymbolGroup } from "../barCache.js";
import {
  buildSystemDevSimulationFreeReplayPlan,
  type SystemDevSimulationFreeReplayPlanItem,
} from "../freeReplayPlan.js";
import type {
  MutableSystemDevSimulationJob,
  StartSystemDevSimulationPayload,
} from "../../ports/infrastructure/db/systemDevSimulation/jobStore.js";
import {
  buildFastDecisionOutcomeSequence,
  buildRiskDisciplineOutcomeSequence,
  resolveSystemDevSimulationCalibrationTargets,
  resolveSystemDevSimulationTotalTargetForPlan,
} from "../planning.js";
import type { SystemDevSimulationJobMessageTokenKey } from "../../../domain/systemDevSimulation/sharedDomain.js";
import {
  runSystemDevSimulationChallengeWorkload,
  runSystemDevSimulationCustomNoteWorkload,
  runSystemDevSimulationFreeReplayWorkload,
  runSystemDevSimulationTimedTask,
} from "../workloads/executionHelpers.js";
import type { SystemDevSimulationDesktopMutableDataResult } from "../workloads/desktopMutableData.js";
import { createSystemDevSimulationCustomIndicators } from "../workloads/customIndicators.js";
import { createSystemDevSimulationRealBacktests } from "../workloads/backtests.js";
import { getBarsWindowCached } from "../barCache.js";

type Language = ReturnType<typeof resolveAppUiLanguage>;
type SessionNameFormat = ReturnType<typeof resolveSessionNameFormat>;

type SetCurrentMessage = (
  job: MutableSystemDevSimulationJob,
  key: SystemDevSimulationJobMessageTokenKey,
  fallback: string,
  values?: Record<string, unknown> | null,
) => void;

type RetryTask = <T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>;
type RunPool = (
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<void>,
) => Promise<void>;

type JobRunContext = {
  job: MutableSystemDevSimulationJob;
  payload: StartSystemDevSimulationPayload;
  signal: AbortSignal;
  copy: SystemDevSimulationCopy;
  language: Language;
  sessionNameFormat: SessionNameFormat;
  specialTrainingSymbolGroups: SpecialTrainingSimulationSymbolGroup[];
  setCurrentMessage: SetCurrentMessage;
  markJobPhase: (
    job: MutableSystemDevSimulationJob,
    phase: MutableSystemDevSimulationJob["phase"],
  ) => void;
  setCurrentWorkload: (
    job: MutableSystemDevSimulationJob,
    input: {
      workload:
        | "FREE_REPLAY"
        | "FAST_DECISION"
        | "RISK_DISCIPLINE"
        | "CUSTOM_NOTE"
        | "CUSTOM_INDICATORS"
        | "REAL_BACKTEST"
        | "DESKTOP_MUTABLE"
        | "VERIFYING";
      index?: number | null;
      current: number;
      target: number;
    },
  ) => void;
  clearCurrentWorkload: (job: MutableSystemDevSimulationJob) => void;
  persistJobState: (job: MutableSystemDevSimulationJob) => void;
  maybeThrowJobInterrupted: (job: MutableSystemDevSimulationJob) => void;
  updateCalibrationObservation: (input: {
    job: MutableSystemDevSimulationJob;
    workload: "freeReplay" | "fastDecision" | "riskDiscipline" | "customNote";
    durationMs: number;
  }) => void;
  finalizeCalibratedPlan: (
    job: MutableSystemDevSimulationJob,
    payload: StartSystemDevSimulationPayload,
  ) => void;
  verifySimulationBatch: (
    job: MutableSystemDevSimulationJob,
    payload: StartSystemDevSimulationPayload,
  ) => void;
  setBarCacheMaxSeries: (maxSeries: number) => void;
  withRetry: RetryTask;
  runPool: RunPool;
  simulateFreeReplayItem: (
    item: SystemDevSimulationFreeReplayPlanItem,
    index: number,
    options: {
      language: Language;
      effectivePlan: SystemDevSimulationEffectivePlan;
      simulationBatchId: string;
      sessionNameFormat: SessionNameFormat;
      signal?: AbortSignal;
    },
  ) => Promise<{ replayNotesCreated: number }>;
  simulateChallengeItem: (
    modeId: SpecialTrainingModeId,
    symbolGroups: SpecialTrainingSimulationSymbolGroup[],
    index: number,
    options: {
      copy: SystemDevSimulationCopy;
      effectivePlan: SystemDevSimulationEffectivePlan;
      language: Language;
      simulationBatchId: string;
      fastOutcomeBucket: SystemDevSimulationFastDecisionOutcomeBucket;
      riskOutcomeBucket: SystemDevSimulationRiskDisciplineOutcomeBucket;
      signal?: AbortSignal;
    },
  ) => Promise<{
    replayNotesCreated: number;
    questionCount: number;
    coverage?: {
      createdQuestionBanks?: number;
    };
  }>;
  createIndependentCustomReplayNotes: (params: {
    count: number;
    enabledSamplePools: StartSystemDevSimulationPayload["enabledSamplePools"];
    language: Language;
    maxColorCount: number;
    concurrency: number;
    simulationBatchId: string;
    signal?: AbortSignal;
  }) => Promise<number>;
  executeDesktopMutableDataWorkload: (
    payload: StartSystemDevSimulationPayload,
    signal?: AbortSignal,
  ) => Promise<SystemDevSimulationDesktopMutableDataResult>;
};

const runCalibrationWorkloads = async (
  input: JobRunContext & {
    calibrationTargets: SystemDevSimulationProfileTargets;
  },
): Promise<void> => {
  input.markJobPhase(input.job, "CALIBRATING");
  input.job.totalTarget = resolveSystemDevSimulationTotalTargetForPlan(
    input.job.effectivePlan!,
    { calibrationOnly: true },
  );
  input.persistJobState(input.job);

  const calibrationFreeReplayPlan = buildSystemDevSimulationFreeReplayPlan(
    input.payload.enabledSamplePools,
    `${input.payload.batchSeed}:calibration`,
    input.calibrationTargets.freeReplayTarget,
    {
      profileId: input.payload.profileId,
      requireLeveragePresetCoverage:
        input.job.effectivePlan!.coverage.requireLeveragePresetCoverage,
    },
  );
  await runSystemDevSimulationFreeReplayWorkload({
    signal: input.signal,
    job: input.job,
    startIndex: input.job.freeReplayCompleted,
    target: input.calibrationTargets.freeReplayTarget,
    concurrency: 1,
    runPool: input.runPool,
    withRetry: input.withRetry,
    maybeThrowInterrupted: input.maybeThrowJobInterrupted,
    items: calibrationFreeReplayPlan,
    executeItem: (item, index, signal) =>
      input.simulateFreeReplayItem(item, index, {
        language: input.language,
        effectivePlan: input.job.effectivePlan!,
        simulationBatchId: input.payload.batchId,
        sessionNameFormat: input.sessionNameFormat,
        signal,
      }),
    onBeforeItem: ({ index }) => {
      input.setCurrentWorkload(input.job, {
        workload: "FREE_REPLAY",
        index,
        current: index + 1,
        target: input.calibrationTargets.freeReplayTarget,
      });
      input.setCurrentMessage(
        input.job,
        "preparing",
        input.copy.jobMessages.preparing,
        {
          current: index + 1,
          target: input.calibrationTargets.freeReplayTarget,
        },
      );
      input.persistJobState(input.job);
    },
    onItemCompleted: ({ durationMs, result }) => {
      input.job.freeReplayCompleted += 1;
      input.job.createdCounts.trainingProjects += 1;
      input.job.createdCounts.replayNotes += result.replayNotesCreated;
      input.updateCalibrationObservation({
        job: input.job,
        workload: "freeReplay",
        durationMs,
      });
      input.persistJobState(input.job);
    },
  });

  const calibrationFastDecisionSequence = buildFastDecisionOutcomeSequence(
    input.job.effectivePlan!,
    input.calibrationTargets.fastDecisionTarget,
  );
  const calibrationRiskSequence = buildRiskDisciplineOutcomeSequence(
    input.job.effectivePlan!,
    input.calibrationTargets.riskDisciplineTarget,
  );
  const fallbackRiskOutcome = buildRiskDisciplineOutcomeSequence(
    input.job.effectivePlan!,
    1,
  )[0]!;
  const fallbackFastOutcome = buildFastDecisionOutcomeSequence(
    input.job.effectivePlan!,
    1,
  )[0]!;

  await runSystemDevSimulationChallengeWorkload({
    signal: input.signal,
    job: input.job,
    startIndex: input.job.fastDecisionCompleted,
    target: input.calibrationTargets.fastDecisionTarget,
    concurrency: input.job.effectivePlan!.runtime.challengeConcurrency,
    runPool: input.runPool,
    withRetry: input.withRetry,
    maybeThrowInterrupted: input.maybeThrowJobInterrupted,
    executeItem: (index, signal) =>
      input.simulateChallengeItem(
        "fast-decision-training",
        input.specialTrainingSymbolGroups,
        index,
        {
          copy: input.copy,
          effectivePlan: input.job.effectivePlan!,
          language: input.language,
          simulationBatchId: input.payload.batchId,
          fastOutcomeBucket: calibrationFastDecisionSequence[index]!,
          riskOutcomeBucket: fallbackRiskOutcome,
          signal,
        },
      ),
    workload: "FAST_DECISION",
    onBeforeItem: ({ index }) => {
      input.setCurrentWorkload(input.job, {
        workload: "FAST_DECISION",
        index,
        current: index + 1,
        target: input.calibrationTargets.fastDecisionTarget,
      });
      input.setCurrentMessage(
        input.job,
        "fastDecisionProgress",
        formatCopyTemplate(input.copy.jobMessages.fastDecisionProgress, [
          input.job.fastDecisionCompleted,
          input.calibrationTargets.fastDecisionTarget,
        ]),
        {
          current: input.job.fastDecisionCompleted,
          target: input.calibrationTargets.fastDecisionTarget,
        },
      );
      input.persistJobState(input.job);
    },
    onItemCompleted: ({ durationMs, result }) => {
      input.job.fastDecisionCompleted += 1;
      input.job.createdCounts.specialTrainingSessions += 1;
      input.job.createdCounts.specialTrainingQuestions += result.questionCount;
      input.job.createdCounts.specialTrainingBanks +=
        result.coverage?.createdQuestionBanks ?? 0;
      input.job.createdCounts.questionLedger += result.questionCount;
      input.job.createdCounts.replayNotes += result.replayNotesCreated;
      input.updateCalibrationObservation({
        job: input.job,
        workload: "fastDecision",
        durationMs,
      });
      input.setCurrentMessage(
        input.job,
        "fastDecisionProgress",
        formatCopyTemplate(input.copy.jobMessages.fastDecisionProgress, [
          input.job.fastDecisionCompleted,
          input.calibrationTargets.fastDecisionTarget,
        ]),
        {
          current: input.job.fastDecisionCompleted,
          target: input.calibrationTargets.fastDecisionTarget,
        },
      );
      input.persistJobState(input.job);
    },
  });

  await runSystemDevSimulationChallengeWorkload({
    signal: input.signal,
    job: input.job,
    startIndex: input.job.riskDisciplineCompleted,
    target: input.calibrationTargets.riskDisciplineTarget,
    concurrency: input.job.effectivePlan!.runtime.challengeConcurrency,
    runPool: input.runPool,
    withRetry: input.withRetry,
    maybeThrowInterrupted: input.maybeThrowJobInterrupted,
    executeItem: (index, signal) =>
      input.simulateChallengeItem(
        "risk-discipline-training",
        input.specialTrainingSymbolGroups,
        index,
        {
          copy: input.copy,
          effectivePlan: input.job.effectivePlan!,
          language: input.language,
          simulationBatchId: input.payload.batchId,
          fastOutcomeBucket: fallbackFastOutcome,
          riskOutcomeBucket: calibrationRiskSequence[index]!,
          signal,
        },
      ),
    workload: "RISK_DISCIPLINE",
    onBeforeItem: ({ index }) => {
      input.setCurrentWorkload(input.job, {
        workload: "RISK_DISCIPLINE",
        index,
        current: index + 1,
        target: input.calibrationTargets.riskDisciplineTarget,
      });
      input.setCurrentMessage(
        input.job,
        "riskDisciplineProgress",
        formatCopyTemplate(input.copy.jobMessages.riskDisciplineProgress, [
          input.job.riskDisciplineCompleted,
          input.calibrationTargets.riskDisciplineTarget,
        ]),
        {
          current: input.job.riskDisciplineCompleted,
          target: input.calibrationTargets.riskDisciplineTarget,
        },
      );
      input.persistJobState(input.job);
    },
    onItemCompleted: ({ durationMs, result }) => {
      input.job.riskDisciplineCompleted += 1;
      input.job.createdCounts.specialTrainingSessions += 1;
      input.job.createdCounts.specialTrainingQuestions += result.questionCount;
      input.job.createdCounts.specialTrainingBanks +=
        result.coverage?.createdQuestionBanks ?? 0;
      input.job.createdCounts.questionLedger += result.questionCount;
      input.job.createdCounts.replayNotes += result.replayNotesCreated;
      input.updateCalibrationObservation({
        job: input.job,
        workload: "riskDiscipline",
        durationMs,
      });
      input.setCurrentMessage(
        input.job,
        "riskDisciplineProgress",
        formatCopyTemplate(input.copy.jobMessages.riskDisciplineProgress, [
          input.job.riskDisciplineCompleted,
          input.calibrationTargets.riskDisciplineTarget,
        ]),
        {
          current: input.job.riskDisciplineCompleted,
          target: input.calibrationTargets.riskDisciplineTarget,
        },
      );
      input.persistJobState(input.job);
    },
  });

  const calibrationCustomNotesRemaining =
    input.calibrationTargets.independentCustomNotes -
    input.job.createdCounts.independentCustomNotes;
  if (calibrationCustomNotesRemaining > 0) {
    input.setCurrentWorkload(input.job, {
      workload: "CUSTOM_NOTE",
      index: null,
      current: input.job.createdCounts.independentCustomNotes,
      target: input.calibrationTargets.independentCustomNotes,
    });
    input.persistJobState(input.job);
  }
  await runSystemDevSimulationCustomNoteWorkload({
    signal: input.signal,
    remainingCount: calibrationCustomNotesRemaining,
    createNotes: (count, signal) =>
      input.createIndependentCustomReplayNotes({
        count,
        enabledSamplePools: input.payload.enabledSamplePools,
        language: input.language,
        maxColorCount: input.job.effectivePlan!.notePolicy.maxColorCount,
        concurrency: input.job.effectivePlan!.runtime.customNoteConcurrency,
        simulationBatchId: input.payload.batchId,
        signal,
      }),
    phase: input.job.phase,
    onCompleted: ({ createdCount, averageDurationMs }) => {
      input.job.createdCounts.independentCustomNotes += createdCount;
      input.job.createdCounts.replayNotes += createdCount;
      input.updateCalibrationObservation({
        job: input.job,
        workload: "customNote",
        durationMs: averageDurationMs,
      });
      input.persistJobState(input.job);
    },
  });

  input.finalizeCalibratedPlan(input.job, input.payload);
  input.persistJobState(input.job);
};

export const executeSystemDevSimulationJobRunLoop = async (
  input: JobRunContext,
): Promise<void> => {
  if (!input.job.effectivePlan) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID");
  }

  const calibrationTargets = resolveSystemDevSimulationCalibrationTargets(
    input.job.effectivePlan,
  );
  if (
    input.payload.profileId === "STRESS" &&
    calibrationTargets &&
    !input.job.effectivePlan.calibrated
  ) {
    await runCalibrationWorkloads({
      ...input,
      calibrationTargets,
    });
  }

  const effectivePlan = input.job.effectivePlan;
  input.setBarCacheMaxSeries(effectivePlan.runtime.barCacheMaxSeries);
  const freeReplayPlan = buildSystemDevSimulationFreeReplayPlan(
    input.payload.enabledSamplePools,
    input.payload.batchSeed,
    effectivePlan.targets.freeReplayTarget,
    {
      profileId: input.payload.profileId,
      requireLeveragePresetCoverage:
        effectivePlan.coverage.requireLeveragePresetCoverage,
    },
  );
  const fastDecisionSequence = buildFastDecisionOutcomeSequence(
    effectivePlan,
    effectivePlan.targets.fastDecisionTarget,
  );
  const riskDisciplineSequence = buildRiskDisciplineOutcomeSequence(
    effectivePlan,
    effectivePlan.targets.riskDisciplineTarget,
  );
  input.job.freeReplayTarget = freeReplayPlan.length;
  input.job.fastDecisionTarget = effectivePlan.targets.fastDecisionTarget;
  input.job.riskDisciplineTarget = effectivePlan.targets.riskDisciplineTarget;
  input.job.totalTarget = resolveSystemDevSimulationTotalTargetForPlan(effectivePlan);
  input.persistJobState(input.job);

  input.markJobPhase(input.job, "FREE_REPLAY");
  input.persistJobState(input.job);
  await runSystemDevSimulationFreeReplayWorkload({
    signal: input.signal,
    job: input.job,
    startIndex: input.job.freeReplayCompleted,
    target: freeReplayPlan.length,
    concurrency: effectivePlan.runtime.freeReplayConcurrency,
    runPool: input.runPool,
    withRetry: input.withRetry,
    maybeThrowInterrupted: input.maybeThrowJobInterrupted,
    items: freeReplayPlan,
    executeItem: (item, index, signal) =>
      input.simulateFreeReplayItem(item, index, {
        language: input.language,
        effectivePlan,
        simulationBatchId: input.payload.batchId,
        sessionNameFormat: input.sessionNameFormat,
        signal,
      }),
    onBeforeItem: ({ index }) => {
      input.setCurrentWorkload(input.job, {
        workload: "FREE_REPLAY",
        index,
        current: index + 1,
        target: freeReplayPlan.length,
      });
      input.setCurrentMessage(
        input.job,
        "freeReplayProgress",
        formatCopyTemplate(input.copy.jobMessages.freeReplayProgress, [
          input.job.freeReplayCompleted,
          input.job.freeReplayTarget,
        ]),
        {
          current: input.job.freeReplayCompleted,
          target: input.job.freeReplayTarget,
        },
      );
      input.persistJobState(input.job);
    },
    onItemCompleted: ({ durationMs, result }) => {
      input.job.freeReplayCompleted += 1;
      input.job.createdCounts.trainingProjects += 1;
      input.job.createdCounts.replayNotes += result.replayNotesCreated;
      input.updateCalibrationObservation({
        job: input.job,
        workload: "freeReplay",
        durationMs,
      });
      input.setCurrentMessage(
        input.job,
        "freeReplayProgress",
        formatCopyTemplate(input.copy.jobMessages.freeReplayProgress, [
          input.job.freeReplayCompleted,
          input.job.freeReplayTarget,
        ]),
        {
          current: input.job.freeReplayCompleted,
          target: input.job.freeReplayTarget,
        },
      );
      input.persistJobState(input.job);
    },
  });

  input.markJobPhase(input.job, "FAST_DECISION");
  input.persistJobState(input.job);
  await runSystemDevSimulationChallengeWorkload({
    signal: input.signal,
    job: input.job,
    startIndex: input.job.fastDecisionCompleted,
    target: input.job.fastDecisionTarget,
    concurrency: effectivePlan.runtime.challengeConcurrency,
    runPool: input.runPool,
    withRetry: input.withRetry,
    maybeThrowInterrupted: input.maybeThrowJobInterrupted,
    executeItem: (index, signal) =>
      input.simulateChallengeItem(
        "fast-decision-training",
        input.specialTrainingSymbolGroups,
        index,
        {
          copy: input.copy,
          effectivePlan,
          language: input.language,
          simulationBatchId: input.payload.batchId,
          fastOutcomeBucket: fastDecisionSequence[index]!,
          riskOutcomeBucket: riskDisciplineSequence[0]!,
          signal,
        },
      ),
    workload: "FAST_DECISION",
    onBeforeItem: ({ index }) => {
      input.setCurrentWorkload(input.job, {
        workload: "FAST_DECISION",
        index,
        current: index + 1,
        target: input.job.fastDecisionTarget,
      });
      input.setCurrentMessage(
        input.job,
        "fastDecisionProgress",
        formatCopyTemplate(input.copy.jobMessages.fastDecisionProgress, [
          input.job.fastDecisionCompleted,
          input.job.fastDecisionTarget,
        ]),
        {
          current: input.job.fastDecisionCompleted,
          target: input.job.fastDecisionTarget,
        },
      );
      input.persistJobState(input.job);
    },
    onItemCompleted: ({ durationMs, result }) => {
      input.job.fastDecisionCompleted += 1;
      input.job.createdCounts.specialTrainingSessions += 1;
      input.job.createdCounts.specialTrainingQuestions += result.questionCount;
      input.job.createdCounts.specialTrainingBanks +=
        result.coverage?.createdQuestionBanks ?? 0;
      input.job.createdCounts.questionLedger += result.questionCount;
      input.job.createdCounts.replayNotes += result.replayNotesCreated;
      input.updateCalibrationObservation({
        job: input.job,
        workload: "fastDecision",
        durationMs,
      });
      input.setCurrentMessage(
        input.job,
        "fastDecisionProgress",
        formatCopyTemplate(input.copy.jobMessages.fastDecisionProgress, [
          input.job.fastDecisionCompleted,
          input.job.fastDecisionTarget,
        ]),
        {
          current: input.job.fastDecisionCompleted,
          target: input.job.fastDecisionTarget,
        },
      );
      input.persistJobState(input.job);
    },
  });

  input.markJobPhase(input.job, "RISK_DISCIPLINE");
  input.persistJobState(input.job);
  await runSystemDevSimulationChallengeWorkload({
    signal: input.signal,
    job: input.job,
    startIndex: input.job.riskDisciplineCompleted,
    target: input.job.riskDisciplineTarget,
    concurrency: effectivePlan.runtime.challengeConcurrency,
    runPool: input.runPool,
    withRetry: input.withRetry,
    maybeThrowInterrupted: input.maybeThrowJobInterrupted,
    executeItem: (index, signal) =>
      input.simulateChallengeItem(
        "risk-discipline-training",
        input.specialTrainingSymbolGroups,
        index,
        {
          copy: input.copy,
          effectivePlan,
          language: input.language,
          simulationBatchId: input.payload.batchId,
          fastOutcomeBucket: fastDecisionSequence[0]!,
          riskOutcomeBucket: riskDisciplineSequence[index]!,
          signal,
        },
      ),
    workload: "RISK_DISCIPLINE",
    onBeforeItem: ({ index }) => {
      input.setCurrentWorkload(input.job, {
        workload: "RISK_DISCIPLINE",
        index,
        current: index + 1,
        target: input.job.riskDisciplineTarget,
      });
      input.setCurrentMessage(
        input.job,
        "riskDisciplineProgress",
        formatCopyTemplate(input.copy.jobMessages.riskDisciplineProgress, [
          input.job.riskDisciplineCompleted,
          input.job.riskDisciplineTarget,
        ]),
        {
          current: input.job.riskDisciplineCompleted,
          target: input.job.riskDisciplineTarget,
        },
      );
      input.persistJobState(input.job);
    },
    onItemCompleted: ({ durationMs, result }) => {
      input.job.riskDisciplineCompleted += 1;
      input.job.createdCounts.specialTrainingSessions += 1;
      input.job.createdCounts.specialTrainingQuestions += result.questionCount;
      input.job.createdCounts.specialTrainingBanks +=
        result.coverage?.createdQuestionBanks ?? 0;
      input.job.createdCounts.questionLedger += result.questionCount;
      input.job.createdCounts.replayNotes += result.replayNotesCreated;
      input.updateCalibrationObservation({
        job: input.job,
        workload: "riskDiscipline",
        durationMs,
      });
      input.setCurrentMessage(
        input.job,
        "riskDisciplineProgress",
        formatCopyTemplate(input.copy.jobMessages.riskDisciplineProgress, [
          input.job.riskDisciplineCompleted,
          input.job.riskDisciplineTarget,
        ]),
        {
          current: input.job.riskDisciplineCompleted,
          target: input.job.riskDisciplineTarget,
        },
      );
      input.persistJobState(input.job);
    },
  });

  const customNotesRemaining =
    effectivePlan.targets.independentCustomNotes -
    input.job.createdCounts.independentCustomNotes;
  if (customNotesRemaining > 0) {
    input.setCurrentWorkload(input.job, {
      workload: "CUSTOM_NOTE",
      index: null,
      current: input.job.createdCounts.independentCustomNotes,
      target: effectivePlan.targets.independentCustomNotes,
    });
    input.persistJobState(input.job);
  }
  await runSystemDevSimulationCustomNoteWorkload({
    signal: input.signal,
    remainingCount: customNotesRemaining,
    createNotes: (count, signal) =>
      input.createIndependentCustomReplayNotes({
        count,
        enabledSamplePools: input.payload.enabledSamplePools,
        language: input.language,
        maxColorCount: effectivePlan.notePolicy.maxColorCount,
        concurrency: effectivePlan.runtime.customNoteConcurrency,
        simulationBatchId: input.payload.batchId,
        signal,
      }),
    phase: input.job.phase,
    onCompleted: ({ createdCount, averageDurationMs }) => {
      input.job.createdCounts.independentCustomNotes += createdCount;
      input.job.createdCounts.replayNotes += createdCount;
      input.updateCalibrationObservation({
        job: input.job,
        workload: "customNote",
        durationMs: averageDurationMs,
      });
      input.persistJobState(input.job);
    },
  });

  const firstInstrument = input.payload.enabledSamplePools
    .flatMap((pool) => pool.instruments ?? [])
    .at(0);
  const indicatorSampleBars = firstInstrument
    ? (
        await getBarsWindowCached(
          firstInstrument.symbol,
          firstInstrument.baseTimeframe,
          firstInstrument.instrumentId,
          0,
          Math.min(96, Math.max(24, firstInstrument.barCount)),
        )
      ).bars
    : [];
  const indicatorTarget = effectivePlan.targets.customIndicatorProfiles;
  if (indicatorTarget > 0) {
    input.markJobPhase(input.job, "CUSTOM_INDICATORS");
    input.setCurrentWorkload(input.job, {
      workload: "CUSTOM_INDICATORS",
      index: null,
      current: input.job.createdCounts.customIndicatorProfiles,
      target: indicatorTarget,
    });
    input.persistJobState(input.job);
    const created = await createSystemDevSimulationCustomIndicators({
      batchId: input.payload.batchId,
      seed: input.payload.batchSeed,
      count: indicatorTarget,
      sampleBars: indicatorSampleBars,
      language: input.language,
      signal: input.signal,
    });
    input.job.createdCounts.customIndicatorProfiles = created;
    input.persistJobState(input.job);
  }

  const realBacktestTarget = effectivePlan.targets.realBacktestBatches;
  const realBacktestsRemaining = Math.max(
    0,
    realBacktestTarget - input.job.createdCounts.realBacktestBatches,
  );
  if (realBacktestsRemaining > 0) {
    input.markJobPhase(input.job, "REAL_BACKTEST");
    input.persistJobState(input.job);
    await createSystemDevSimulationRealBacktests({
      batchId: input.payload.batchId,
      seed: input.payload.batchSeed,
      count: realBacktestsRemaining,
      startIndex: input.job.createdCounts.realBacktestBatches,
      pools: input.payload.enabledSamplePools,
      language: input.language,
      signal: input.signal,
      onCreated: (created) => {
        input.job.createdCounts.realBacktestBatches = Math.min(
          realBacktestTarget,
          realBacktestTarget - realBacktestsRemaining + created,
        );
        input.setCurrentWorkload(input.job, {
          workload: "REAL_BACKTEST",
          index: input.job.createdCounts.realBacktestBatches - 1,
          current: input.job.createdCounts.realBacktestBatches,
          target: realBacktestTarget,
        });
        input.persistJobState(input.job);
      },
    });
  }

  input.markJobPhase(input.job, "DESKTOP_MUTABLE");
  input.setCurrentWorkload(input.job, {
    workload: "DESKTOP_MUTABLE",
    index: null,
    current: 0,
    target: 1,
  });
  input.setCurrentMessage(
    input.job,
    "preparing",
    input.copy.jobMessages.preparing,
  );
  input.persistJobState(input.job);
  input.maybeThrowJobInterrupted(input.job);
  await runSystemDevSimulationTimedTask({
    task: (signal) =>
      input.executeDesktopMutableDataWorkload(input.payload, signal),
    signal: input.signal,
    phase: input.job.phase,
    workload: "DESKTOP_MUTABLE",
    index: null,
    target: 1,
    timeoutReason: "WORKLOAD_TIMEOUT",
  });
  input.job.createdCounts.desktopMutableRuns = 1;
  input.persistJobState(input.job);

  input.markJobPhase(input.job, "VERIFYING");
  input.setCurrentWorkload(input.job, {
    workload: "VERIFYING",
    index: null,
    current: 0,
    target: 1,
  });
  input.setCurrentMessage(input.job, "completed", input.copy.jobMessages.completed);
  input.persistJobState(input.job);
  await runSystemDevSimulationTimedTask({
    task: async (signal) => {
      signal.throwIfAborted();
      input.verifySimulationBatch(input.job, input.payload);
    },
    signal: input.signal,
    phase: input.job.phase,
    workload: "VERIFYING",
    index: null,
    target: 1,
    timeoutReason: "WORKLOAD_TIMEOUT",
  });
  input.clearCurrentWorkload(input.job);
};
