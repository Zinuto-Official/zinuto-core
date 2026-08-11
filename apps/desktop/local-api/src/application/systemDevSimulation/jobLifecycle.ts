// SPDX-License-Identifier: GPL-3.0-only

import { appError } from "../../kernel/appError.js";
import { createId } from "../../kernel/id.js";
import { getAppPreferences } from "../appPreferencesService.js";
import { isSystemResetExecutionActive } from "../trading/resetExecutionState.js";
import {
  finishSystemDevSimulationBatch,
  upsertSystemDevSimulationBatch,
} from "../ports/infrastructure/db/systemDevSimulation/batchStore.js";
import { hasActiveSystemDevSimulationCleanupJob } from "../ports/infrastructure/db/systemDevSimulation/cleanupJobStore.js";
import {
  SYSTEM_DEV_SIMULATION_JOBS as JOBS,
  buildRecoveredSystemDevSimulationJobSnapshot,
  createInitialSystemDevSimulationJob,
  getLatestSystemDevSimulationJobInternal,
  hasActiveSystemDevSimulationJob as hasActiveSimulationJob,
  normalizeSystemDevSimulationPayload,
  parsePersistedSystemDevSimulationJobSnapshot,
  persistSystemDevSimulationJobSnapshot as persistSimulationJobSnapshot,
  releaseSystemDevSimulationJobPayload,
  resolveSystemDevSimulationJobPhase as resolveSimulationJobPhase,
  snapshotSystemDevSimulationJob as snapshotJob,
  upsertSystemDevSimulationJob,
  type MutableSystemDevSimulationJob,
  type StartSystemDevSimulationPayload,
  type SystemDevSimulationJobSnapshot,
} from "../ports/infrastructure/db/systemDevSimulation/jobStore.js";
import { countIndependentCustomNotesByBatchId } from "../ports/infrastructure/db/systemDevSimulation/simulationReadStore.js";
import { isSystemDevSimulationCleanupExecutionActive } from "./cleanupExecutionState.js";
import {
  hasActiveSystemDevSimulationTaskExecution,
  throwIfSystemDevSimulationTaskAborted,
  waitForSystemDevSimulationTaskExecutions,
} from "./taskExecutionState.js";
import { executeSystemDevSimulationDesktopMutableDataWorkload } from "./workloads/desktopMutableData.js";
import { executeSystemDevSimulationJobRunLoop } from "./runner/jobRunLoop.js";
import { verifySystemDevSimulationBatchCounts } from "./runner/verification.js";
import {
  buildDocumentFromReflection,
  buildSimulationColors,
} from "./freeReplayNoteTask.js";
import {
  clearSystemDevSimulationBarCache,
  resolveSpecialTrainingSymbolGroups,
  setSystemDevSimulationBarCacheMaxSeries,
} from "./barCache.js";
import { simulateChallengeItem } from "./challengeItemSimulation.js";
import { getSystemDevSimulationCapabilities as getSystemDevSimulationCapabilitiesInternal } from "./capabilities.js";
import { planSystemDevSimulationDataset } from "./datasetPlanner.js";
import { normalizeSystemDevSimulationJobFailure } from "./failure.js";
import { simulateFreeReplayItem } from "./freeReplayItemSimulation.js";
import {
  clearSimulationJobCurrentWorkload,
  finalizeCalibratedPlan,
  markJobPhase,
  maybeThrowJobInterrupted,
  persistJobState,
  setSimulationJobCurrentMessage,
  setSimulationJobCurrentWorkload,
  syncJobCountsFromBatch,
  updateCalibrationObservation,
} from "./jobRuntime.js";
import {
  resolveSystemDevSimulationCalibrationTargets,
  resolveSystemDevSimulationEffectivePlanForPools,
  resolveSystemDevSimulationTotalTargetForPlan,
} from "./planning.js";
import { runPool, withRetry } from "./simulationHelpers.js";
import { createIndependentCustomReplayNotesWorkload } from "./workloads/customNotes.js";
import { createSystemDevSimulationRandom } from "../../domain/systemDevSimulation/random.js";
import {
  SYSTEM_DEV_SIMULATION_INTERRUPTED_ERROR_CODE,
  buildSystemDevSimulationJobMessageToken,
  nowIso,
  randomCreatedAt,
  randomInt,
  shiftIso,
} from "../../domain/systemDevSimulation/sharedDomain.js";
import {
  buildReplayNoteDefaultTitle,
  buildReplayNoteSeedMeta,
  buildReplayNoteSourceForCreate,
  getReplayNoteBuilderCopy,
} from "@zinuto/shared/replayNoteBuilder";
import { resolveSessionNameFormat } from "@zinuto/shared/sessionNaming";
import {
  getSystemDevSimulationCopy,
  resolveAppUiLanguage,
  type SystemDevSimulationCopy,
} from "@zinuto/shared/systemDevSimulationCopy";
import {
  resolveSystemDevSimulationProfileId,
  resolveSystemDevSimulationProfileTargets,
  type SystemDevSimulationProfileTargets,
} from "@zinuto/shared/systemDevSimulationProfiles";
import { listBacktestBatches } from "../backtest/backtestService.js";
import { listCustomIndicatorProfiles } from "../customIndicatorService.js";
import { runtimeLimits } from "../../kernel/runtimeLimits.js";
import { cleanupSystemDevSimulationData } from "./cleanupRuntime.js";
import {
  SYSTEM_DEV_SIMULATION_BACKTEST_ID_PREFIX,
  SYSTEM_DEV_SIMULATION_INDICATOR_ID_PREFIX,
} from "../ports/infrastructure/db/systemDevSimulation/cleanupStore.js";
import type {
  SystemDevSimulationCapabilities,
  SystemDevSimulationProfileId,
} from "@zinuto/shared/systemDevSimulationProfiles";

const createIndependentCustomReplayNotes = (params: {
  count: number;
  enabledSamplePools: StartSystemDevSimulationPayload["enabledSamplePools"];
  language: ReturnType<typeof resolveAppUiLanguage>;
  maxColorCount: number;
  concurrency: number;
  simulationBatchId: string;
  signal?: AbortSignal;
}): Promise<number> =>
  createIndependentCustomReplayNotesWorkload({
    ...params,
    runPool,
    createRandom: createSystemDevSimulationRandom,
    randomCreatedAt,
    buildSeedMeta: buildReplayNoteSeedMeta,
    getReplayNoteBuilderCopy,
    buildDocumentFromReflection,
    buildSource: buildReplayNoteSourceForCreate,
    buildDefaultTitle: buildReplayNoteDefaultTitle,
    buildColors: buildSimulationColors,
    shiftIso,
    randomInt,
  });

const handleJobFailure = (params: {
  job: MutableSystemDevSimulationJob;
  batchId: string;
  copy: SystemDevSimulationCopy;
  error: unknown;
}): void => {
  const normalizedFailure = normalizeSystemDevSimulationJobFailure(
    params.error,
    params.job,
    params.batchId,
  );
  params.job.status = normalizedFailure.interrupted ? "INTERRUPTED" : "FAILED";
  params.job.finishedAt = nowIso();
  params.job.canCancel = false;
  clearSimulationJobCurrentWorkload(params.job);
  params.job.errorCode = normalizedFailure.errorCode;
  params.job.errorArgs = normalizedFailure.errorArgs;
  params.job.errorMessage = normalizedFailure.errorMessage;
  params.job.errorMessageToken = null;
  setSimulationJobCurrentMessage(
    params.job,
    normalizedFailure.interrupted ? "interrupted" : "failed",
    normalizedFailure.interrupted
      ? params.copy.jobMessages.interrupted
      : params.copy.jobMessages.failed,
  );
  finishSystemDevSimulationBatch(params.batchId, params.job.finishedAt);
  releaseSystemDevSimulationJobPayload(params.job);
  persistJobState(params.job);
};

let activeSimulationJobRunPromise: Promise<void> | null = null;
const ACTIVE_JOB_ABORT_CONTROLLERS = new Map<string, AbortController>();
let isStartingSimulationJob = false;

const isActiveSimulationJob = (
  job: MutableSystemDevSimulationJob | null,
): job is MutableSystemDevSimulationJob =>
  job?.status === "QUEUED" || job?.status === "RUNNING";

const interruptActiveSimulationJob = (params: {
  job: MutableSystemDevSimulationJob;
  copy: SystemDevSimulationCopy;
  reason: string;
}): void => {
  params.job.status = "INTERRUPTED";
  params.job.phase = resolveSimulationJobPhase(params.job);
  params.job.finishedAt = nowIso();
  params.job.canCancel = false;
  clearSimulationJobCurrentWorkload(params.job);
  setSimulationJobCurrentMessage(
    params.job,
    "interrupted",
    params.copy.jobMessages.interrupted,
  );
  params.job.errorMessage = SYSTEM_DEV_SIMULATION_INTERRUPTED_ERROR_CODE;
  params.job.errorMessageToken = null;
  params.job.errorCode = SYSTEM_DEV_SIMULATION_INTERRUPTED_ERROR_CODE;
  params.job.errorArgs = {
    reason: params.reason,
    jobId: params.job.id,
    profileId: params.job.profileId,
    phase: params.job.phase,
    progressPercent: params.job.progressPercent,
  };
  finishSystemDevSimulationBatch(
    params.job.payload?.batchId ?? params.job.id,
    params.job.finishedAt,
  );
  releaseSystemDevSimulationJobPayload(params.job);
  persistJobState(params.job);
};

const interruptOrphanedActiveSimulationJobIfNeeded = (
  copy: SystemDevSimulationCopy,
): MutableSystemDevSimulationJob | null => {
  if (activeSimulationJobRunPromise) {
    return null;
  }
  const activeJob = getLatestSystemDevSimulationJobInternal();
  if (!isActiveSimulationJob(activeJob)) {
    return null;
  }
  interruptActiveSimulationJob({
    job: activeJob,
    copy,
    reason: "ORPHANED_ACTIVE_JOB",
  });
  return activeJob;
};

const runJob = async (
  job: MutableSystemDevSimulationJob,
  payload: StartSystemDevSimulationPayload,
  options: {
    resume?: boolean;
    signal: AbortSignal;
  },
): Promise<void> => {
  try {
    const appPreferences = getAppPreferences();
    const language = resolveAppUiLanguage(appPreferences.uiSettings.language);
    const copy = getSystemDevSimulationCopy(language);
    const sessionNameFormat = resolveSessionNameFormat(
      appPreferences.uiSettings.sessionNameFormat,
    );
    const initialEffectivePlan =
      job.effectivePlan ??
      resolveSystemDevSimulationEffectivePlanForPools({
        profileId: payload.profileId,
        pools: payload.enabledSamplePools,
        targets: payload.targets,
      });

    job.status = "RUNNING";
    if (!job.startedAt) {
      job.startedAt = nowIso();
    }
    if (!job.phaseStartedAt) {
      job.phaseStartedAt = job.startedAt;
    }
    job.finishedAt = null;
    job.errorMessage = null;
    job.errorMessageToken = null;
    job.errorCode = null;
    job.errorArgs = null;
    job.payload = payload;
    job.canCancel = true;
    job.effectivePlan = initialEffectivePlan;
    clearSimulationJobCurrentWorkload(job);
    syncJobCountsFromBatch(job, payload.batchId);
    setSimulationJobCurrentMessage(
      job,
      options?.resume ? "resuming" : "preparing",
      options?.resume ? copy.jobMessages.resuming : copy.jobMessages.preparing,
    );
    if (payload.profileId === "STRESS" && !job.effectivePlan.calibrated) {
      const calibrationTargets = resolveSystemDevSimulationCalibrationTargets(
        job.effectivePlan,
      );
      if (
        calibrationTargets &&
        job.freeReplayCompleted >= calibrationTargets.freeReplayTarget &&
        job.fastDecisionCompleted >= calibrationTargets.fastDecisionTarget &&
        job.riskDisciplineCompleted >=
          calibrationTargets.riskDisciplineTarget &&
        job.createdCounts.independentCustomNotes >=
          calibrationTargets.independentCustomNotes
      ) {
        finalizeCalibratedPlan(job, payload);
      } else {
        job.totalTarget = resolveSystemDevSimulationTotalTargetForPlan(
          job.effectivePlan,
          { calibrationOnly: true },
        );
      }
    } else {
      job.totalTarget = resolveSystemDevSimulationTotalTargetForPlan(
        job.effectivePlan,
      );
    }
    setSystemDevSimulationBarCacheMaxSeries(
      job.effectivePlan.runtime.barCacheMaxSeries,
    );
    persistJobState(job);

    clearSimulationJobCurrentWorkload(job);
    persistJobState(job);
    const specialTrainingSymbolGroups =
      await resolveSpecialTrainingSymbolGroups(payload.enabledSamplePools);
    throwIfSystemDevSimulationTaskAborted(options.signal);
    const needsTrainingSymbols =
      job.effectivePlan.targets.freeReplayTarget > 0 ||
      job.effectivePlan.targets.fastDecisionTarget > 0 ||
      job.effectivePlan.targets.riskDisciplineTarget > 0 ||
      job.effectivePlan.targets.independentCustomNotes > 0;
    if (needsTrainingSymbols && !specialTrainingSymbolGroups.length) {
      throw appError("SYSTEM_DEV_SIMULATION_INVALID");
    }
    await executeSystemDevSimulationJobRunLoop({
      job,
      payload,
      signal: options.signal,
      copy,
      language,
      sessionNameFormat,
      specialTrainingSymbolGroups,
      setCurrentMessage: setSimulationJobCurrentMessage,
      markJobPhase,
      setCurrentWorkload: setSimulationJobCurrentWorkload,
      clearCurrentWorkload: clearSimulationJobCurrentWorkload,
      persistJobState,
      maybeThrowJobInterrupted,
      updateCalibrationObservation,
      finalizeCalibratedPlan,
      verifySimulationBatch: (currentJob, currentPayload) =>
        verifySystemDevSimulationBatchCounts({
          job: currentJob,
          payload: currentPayload,
          countIndependentCustomNotesByBatchId,
        }),
      setBarCacheMaxSeries: setSystemDevSimulationBarCacheMaxSeries,
      withRetry,
      runPool,
      simulateFreeReplayItem,
      simulateChallengeItem,
      createIndependentCustomReplayNotes,
      executeDesktopMutableDataWorkload:
        executeSystemDevSimulationDesktopMutableDataWorkload,
    });

    throwIfSystemDevSimulationTaskAborted(options.signal);
    markJobPhase(job, "DONE");
    job.status = "SUCCESS";
    job.progressPercent = 100;
    job.canCancel = false;
    clearSimulationJobCurrentWorkload(job);
    setSimulationJobCurrentMessage(
      job,
      "completed",
      copy.jobMessages.completed,
    );
    job.finishedAt = nowIso();
    job.errorMessage = null;
    job.errorMessageToken = null;
    job.errorCode = null;
    job.errorArgs = null;
    finishSystemDevSimulationBatch(payload.batchId, job.finishedAt);
    releaseSystemDevSimulationJobPayload(job);
    persistJobState(job);
  } finally {
    clearSystemDevSimulationBarCache();
    setSystemDevSimulationBarCacheMaxSeries(8);
  }
};

const runTrackedJob = (
  job: MutableSystemDevSimulationJob,
  payload: StartSystemDevSimulationPayload,
  copy: SystemDevSimulationCopy,
  options?: {
    resume?: boolean;
  },
): void => {
  const controller = new AbortController();
  ACTIVE_JOB_ABORT_CONTROLLERS.set(job.id, controller);
  let runPromise: Promise<void>;
  runPromise = runJob(job, payload, { ...options, signal: controller.signal })
    .catch((error) => {
      if (!controller.signal.aborted) {
        controller.abort(
          appError("SYSTEM_DEV_SIMULATION_INTERRUPTED", {
            reason: "PEER_TASK_FAILED",
          }),
        );
      }
      handleJobFailure({
        job,
        batchId: payload.batchId,
        copy,
        error,
      });
    })
    .finally(() => {
      if (ACTIVE_JOB_ABORT_CONTROLLERS.get(job.id) === controller) {
        ACTIVE_JOB_ABORT_CONTROLLERS.delete(job.id);
      }
      if (activeSimulationJobRunPromise === runPromise) {
        activeSimulationJobRunPromise = null;
      }
    });
  activeSimulationJobRunPromise = runPromise;
  void runPromise;
};

const recoverLatestSimulationJob = (): void => {
  const language = resolveAppUiLanguage(
    getAppPreferences().uiSettings.language,
  );
  const copy = getSystemDevSimulationCopy(language);
  const persisted = parsePersistedSystemDevSimulationJobSnapshot();
  if (persisted) {
    if (
      (persisted.status === "QUEUED" || persisted.status === "RUNNING") &&
      persisted.payload
    ) {
      persisted.status = "RUNNING";
      persisted.phase = resolveSimulationJobPhase(persisted);
      persisted.finishedAt = null;
      persisted.phaseStartedAt = nowIso();
      syncJobCountsFromBatch(persisted, persisted.payload.batchId);
      clearSimulationJobCurrentWorkload(persisted);
      setSimulationJobCurrentMessage(
        persisted,
        "resuming",
        copy.jobMessages.resuming,
      );
      persisted.errorMessage = null;
      persisted.errorMessageToken = null;
      persisted.errorCode = null;
      persisted.errorArgs = null;
      persistJobState(persisted);
      runTrackedJob(persisted, persisted.payload, copy, { resume: true });
      return;
    }
    if (persisted.status === "QUEUED" || persisted.status === "RUNNING") {
      interruptActiveSimulationJob({
        job: persisted,
        copy,
        reason: "MISSING_RESUME_PAYLOAD",
      });
      return;
    }
    releaseSystemDevSimulationJobPayload(persisted);
    persistJobState(persisted);
    return;
  }

  const recovered = buildRecoveredSystemDevSimulationJobSnapshot();
  if (!recovered) {
    return;
  }
  upsertSystemDevSimulationJob(recovered);
  persistSimulationJobSnapshot(recovered);
};

export const startSystemDevSimulationJob = async (payload: {
  profileId?: SystemDevSimulationProfileId;
  repeatMode?: "REPLACE" | "APPEND";
  seed?: string;
  targets?: SystemDevSimulationProfileTargets;
}): Promise<SystemDevSimulationJobSnapshot> => {
  if (isSystemResetExecutionActive()) {
    throw appError("SYSTEM_RESET_IN_PROGRESS");
  }
  const language = resolveAppUiLanguage(
    getAppPreferences().uiSettings.language,
  );
  const copy = getSystemDevSimulationCopy(language);
  if (isStartingSimulationJob || hasActiveSystemDevSimulationTaskExecution()) {
    throw appError("SYSTEM_DEV_SIMULATION_JOB_ACTIVE");
  }
  const interruptedOrphanJob = interruptOrphanedActiveSimulationJobIfNeeded(
    copy,
  );
  if (hasActiveSimulationJob()) {
    throw appError("SYSTEM_DEV_SIMULATION_JOB_ACTIVE");
  }
  if (
    hasActiveSystemDevSimulationCleanupJob() ||
    isSystemDevSimulationCleanupExecutionActive()
  ) {
    throw appError("SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE");
  }
  isStartingSimulationJob = true;
  try {
  const requestedProfileId = resolveSystemDevSimulationProfileId(
    payload.profileId,
  );
  const requestedTargets = payload.targets ?? resolveSystemDevSimulationProfileTargets(
    requestedProfileId,
    0,
  );
  const totalRequestedTargets = Object.values(requestedTargets).reduce(
    (total, value) => total + Math.max(0, Math.floor(Number(value) || 0)),
    0,
  );
  if (totalRequestedTargets <= 0) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID", { reason: "NO_TARGETS" });
  }
  const repeatMode = payload.repeatMode === "APPEND" ? "APPEND" : "REPLACE";
  const existingIndicatorProfiles = await listCustomIndicatorProfiles();
  const retainedIndicatorProfiles =
    repeatMode === "APPEND"
      ? existingIndicatorProfiles
      : existingIndicatorProfiles.filter(
          (profile) =>
            !profile.id.startsWith(SYSTEM_DEV_SIMULATION_INDICATOR_ID_PREFIX),
        );
  if (
    retainedIndicatorProfiles.length + requestedTargets.customIndicatorProfiles >
    runtimeLimits.customIndicatorSavedProfilesMax
  ) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID", {
      reason: "CUSTOM_INDICATOR_CAPACITY",
      max: runtimeLimits.customIndicatorSavedProfilesMax,
    });
  }
  const requestedBacktestCount = requestedTargets.realBacktestBatches;
  const existingBacktestBatches = listBacktestBatches();
  const retainedBacktestBatches =
    repeatMode === "APPEND"
      ? existingBacktestBatches
      : existingBacktestBatches.filter(
          (batch) =>
            !batch.id.startsWith(SYSTEM_DEV_SIMULATION_BACKTEST_ID_PREFIX),
        );
  if (retainedBacktestBatches.length + requestedBacktestCount > 500) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID", { reason: "BACKTEST_CAPACITY" });
  }
  if (repeatMode === "REPLACE") {
    await cleanupSystemDevSimulationData();
    if (interruptedOrphanJob) {
      upsertSystemDevSimulationJob(interruptedOrphanJob);
    }
  }
  const jobId = createId();
  const normalizedPayload = normalizeSystemDevSimulationPayload({
    profileId: requestedProfileId,
    repeatMode,
    targets: requestedTargets,
    enabledSamplePools: planSystemDevSimulationDataset().enabledSamplePools,
    batchId: jobId,
    batchSeed: String(payload.seed ?? "").trim() || jobId,
  });
  if (!normalizedPayload) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID");
  }
  const capabilities = getSystemDevSimulationCapabilitiesInternal();
  const requestedProfileAvailable = capabilities.profiles.some(
    (profile) =>
      profile.profileId === normalizedPayload.profileId && profile.available,
  );
  if (!requestedProfileAvailable) {
    throw appError("SYSTEM_DEV_SIMULATION_PROFILE_UNAVAILABLE", {
      profileId: normalizedPayload.profileId,
    });
  }
  const effectivePlan = resolveSystemDevSimulationEffectivePlanForPools({
    profileId: normalizedPayload.profileId,
    pools: normalizedPayload.enabledSamplePools,
    targets: normalizedPayload.targets,
  });
  upsertSystemDevSimulationBatch({
    id: normalizedPayload.batchId,
    profileId: normalizedPayload.profileId,
    seed: normalizedPayload.batchSeed,
    specVersion: effectivePlan.specVersion,
    effectivePlan,
  });
  const job = createInitialSystemDevSimulationJob({
    id: jobId,
    profileId: normalizedPayload.profileId,
    payload: normalizedPayload,
    effectivePlan,
    currentMessage: copy.jobMessages.queued,
    currentMessageToken: buildSystemDevSimulationJobMessageToken(
      "queued",
      copy.jobMessages.queued,
    ),
  });
  persistJobState(job);

  runTrackedJob(job, normalizedPayload, copy);

  return snapshotJob(job);
  } finally {
    isStartingSimulationJob = false;
  }
};

export const getSystemDevSimulationCapabilities =
  (): SystemDevSimulationCapabilities =>
    getSystemDevSimulationCapabilitiesInternal();

export const cancelSystemDevSimulationJob = (
  jobId?: string,
): SystemDevSimulationJobSnapshot => {
  const activeJob =
    typeof jobId === "string" && jobId.trim()
      ? (JOBS.get(jobId.trim()) ?? null)
      : getLatestSystemDevSimulationJobInternal();
  if (!activeJob) {
    throw appError("SYSTEM_DEV_SIMULATION_JOB_NOT_FOUND");
  }
  if (activeJob.status !== "QUEUED" && activeJob.status !== "RUNNING") {
    return snapshotJob(activeJob);
  }
  activeJob.cancelRequested = true;
  activeJob.canCancel = false;
  ACTIVE_JOB_ABORT_CONTROLLERS.get(activeJob.id)?.abort(
    appError("SYSTEM_DEV_SIMULATION_INTERRUPTED"),
  );
  setSimulationJobCurrentMessage(
    activeJob,
    "interrupted",
    getSystemDevSimulationCopy(
      resolveAppUiLanguage(getAppPreferences().uiSettings.language),
    ).jobMessages.interrupted,
  );
  persistJobState(activeJob);
  return snapshotJob(activeJob);
};

export const stopSystemDevSimulationJobRuntime = async (): Promise<void> => {
  const activeJob = getLatestSystemDevSimulationJobInternal();
  if (activeJob && (activeJob.status === "QUEUED" || activeJob.status === "RUNNING")) {
    activeJob.cancelRequested = true;
    activeJob.canCancel = false;
    persistJobState(activeJob);
  }
  for (const controller of ACTIVE_JOB_ABORT_CONTROLLERS.values()) {
    if (!controller.signal.aborted) {
      controller.abort(
        appError("SYSTEM_DEV_SIMULATION_INTERRUPTED", {
          reason: "RUNTIME_STOPPED",
        }),
      );
    }
  }
  await activeSimulationJobRunPromise;
  await waitForSystemDevSimulationTaskExecutions();
};

export const getSystemDevSimulationJob = (
  jobId: string,
): SystemDevSimulationJobSnapshot => {
  const normalizedJobId = String(jobId || "").trim();
  const job = normalizedJobId ? JOBS.get(normalizedJobId) : null;
  if (!job) {
    throw appError("SYSTEM_DEV_SIMULATION_JOB_NOT_FOUND");
  }
  return snapshotJob(job);
};

export const getLatestSystemDevSimulationJob =
  (): SystemDevSimulationJobSnapshot | null => {
    const latestJob = getLatestSystemDevSimulationJobInternal();
    return latestJob ? snapshotJob(latestJob) : null;
  };

recoverLatestSimulationJob();
