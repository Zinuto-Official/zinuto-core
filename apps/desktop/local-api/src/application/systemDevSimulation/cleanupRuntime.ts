// SPDX-License-Identifier: GPL-3.0-only

import { reclaimDatabaseStorage } from "../ports/infrastructure/db/database.js";
import { appError, isAppError } from "../../kernel/appError.js";
import { deleteTrainingProjects } from "../historyService.js";
import { isSystemResetExecutionActive } from "../trading/resetExecutionState.js";
import { clearSystemDevSimulationBarCache } from "./barCache.js";
import { deleteSystemDevSimulationBatches } from "../ports/infrastructure/db/systemDevSimulation/batchStore.js";
import {
  collectSimulationReplayNoteIds,
  collectSimulationReplayNoteIdsByBatchIds,
  collectSimulationTrainingProjectIds,
  collectSimulationTrainingProjectIdsByBatchIds,
  deleteReplayNotesByIds,
  deleteSimulationCustomIndicatorProfiles,
  deleteSimulationBacktestBatches,
  deleteSimulationQuestionLedger,
  deleteSimulationQuestionLedgerByBatchIds,
  deleteSimulationSpecialTrainingBanks,
  deleteSimulationSpecialTrainingBanksByBatchIds,
  deleteSimulationSpecialTrainingHistoryQuestions,
  deleteSimulationSpecialTrainingHistoryQuestionsByBatchIds,
  deleteSimulationSpecialTrainingHistorySessions,
  deleteSimulationSpecialTrainingHistorySessionsByBatchIds,
  deleteSimulationSpecialTrainingStatsProjection,
  deleteSimulationSpecialTrainingStatsProjectionByBatchIds,
  listSystemDevSimulationBatchIds,
} from "../ports/infrastructure/db/systemDevSimulation/cleanupStore.js";
import {
  getLatestSystemDevSimulationCleanupJobState,
  getSystemDevSimulationCleanupJobState,
  hasActiveSystemDevSimulationCleanupJob,
  startSystemDevSimulationCleanupJobState,
  waitForSystemDevSimulationCleanupJobIdle,
  type SystemDevSimulationCleanupJobSnapshot,
  type SystemDevSimulationCleanupJobStage,
} from "../ports/infrastructure/db/systemDevSimulation/cleanupJobStore.js";
import {
  SYSTEM_DEV_SIMULATION_JOBS as JOBS,
  clearPersistedSystemDevSimulationJobSnapshot,
  hasActiveSystemDevSimulationJob as hasActiveSimulationJob,
} from "../ports/infrastructure/db/systemDevSimulation/jobStore.js";
import {
  isSystemDevSimulationCleanupExecutionActive,
  releaseSystemDevSimulationCleanupExecution,
  tryAcquireSystemDevSimulationCleanupExecution,
} from "./cleanupExecutionState.js";
import { hasActiveSystemDevSimulationTaskExecution } from "./taskExecutionState.js";

export type SystemDevSimulationCleanupResult = {
  deletedTrainingProjects: number;
  deletedReplayNotes: number;
  deletedQuestionLedger: number;
  deletedSpecialTrainingBanks: number;
  deletedSpecialTrainingHistoryQuestions: number;
  deletedSpecialTrainingHistorySessions: number;
  deletedCustomIndicatorProfiles: number;
  deletedBacktestBatches: number;
};

export type { SystemDevSimulationCleanupJobSnapshot };

const extractCleanupErrorCode = (error: unknown): string =>
  isAppError(error) ? error.code : "SYSTEM_DEV_SIMULATION_FAILED";

const extractCleanupErrorArgs = (
  error: unknown,
): Record<string, string | number | boolean | null> | null =>
  isAppError(error) ? error.args ?? null : null;

const ensureSystemResetIdle = (): void => {
  if (isSystemResetExecutionActive()) {
    throw appError("SYSTEM_RESET_IN_PROGRESS");
  }
};

const cleanupSystemDevSimulationDataInternal = async (
  onProgress?: (
    stage: SystemDevSimulationCleanupJobStage,
    progressPercent: number,
  ) => void,
): Promise<SystemDevSimulationCleanupResult> => {
  if (
    hasActiveSimulationJob() ||
    hasActiveSystemDevSimulationTaskExecution()
  ) {
    throw appError("SYSTEM_DEV_SIMULATION_JOB_ACTIVE");
  }

  onProgress?.("COLLECTING", 6);
  const simulationBatchIds = listSystemDevSimulationBatchIds();
  const replayNoteIds = Array.from(
    new Set([
      ...collectSimulationReplayNoteIds(),
      ...collectSimulationReplayNoteIdsByBatchIds(simulationBatchIds),
    ]),
  );
  const trainingProjectIds = Array.from(
    new Set([
      ...collectSimulationTrainingProjectIds(),
      ...collectSimulationTrainingProjectIdsByBatchIds(simulationBatchIds),
    ]),
  );

  onProgress?.("REPLAY_NOTES", 18);
  const deletedReplayNotes = deleteReplayNotesByIds(replayNoteIds);

  onProgress?.("QUESTION_LEDGER", 30);
  const deletedQuestionLedger = simulationBatchIds.length
    ? deleteSimulationQuestionLedgerByBatchIds(simulationBatchIds)
    : deleteSimulationQuestionLedger();

  const deletedSpecialTrainingBanks = simulationBatchIds.length
    ? deleteSimulationSpecialTrainingBanksByBatchIds(simulationBatchIds)
    : deleteSimulationSpecialTrainingBanks();

  onProgress?.("SPECIAL_TRAINING_HISTORY", 52);
  const deletedSpecialTrainingStatsProjection = simulationBatchIds.length
    ? deleteSimulationSpecialTrainingStatsProjectionByBatchIds(
        simulationBatchIds,
      )
    : deleteSimulationSpecialTrainingStatsProjection();
  const deletedSpecialTrainingHistoryQuestions = simulationBatchIds.length
    ? deleteSimulationSpecialTrainingHistoryQuestionsByBatchIds(
        simulationBatchIds,
      )
    : deleteSimulationSpecialTrainingHistoryQuestions();
  const deletedSpecialTrainingHistorySessions = simulationBatchIds.length
    ? deleteSimulationSpecialTrainingHistorySessionsByBatchIds(
        simulationBatchIds,
      )
    : deleteSimulationSpecialTrainingHistorySessions();

  onProgress?.("TRAINING_PROJECTS", 72);
  const { deleted: deletedTrainingProjects } = trainingProjectIds.length
    ? await deleteTrainingProjects(trainingProjectIds)
    : { deleted: 0 };

  onProgress?.("CUSTOM_INDICATORS", 82);
  const deletedCustomIndicatorProfiles = deleteSimulationCustomIndicatorProfiles();

  onProgress?.("BACKTESTS", 90);
  const deletedBacktestBatches = deleteSimulationBacktestBatches();

  onProgress?.("FINALIZING", 96);
  deleteSystemDevSimulationBatches(simulationBatchIds);
  clearSystemDevSimulationBarCache();
  JOBS.clear();
  clearPersistedSystemDevSimulationJobSnapshot();

  if (
    deletedTrainingProjects <= 0 &&
    (deletedReplayNotes > 0 ||
      deletedQuestionLedger > 0 ||
      deletedSpecialTrainingBanks > 0 ||
      deletedSpecialTrainingStatsProjection > 0 ||
      deletedSpecialTrainingHistoryQuestions > 0 ||
      deletedSpecialTrainingHistorySessions > 0 ||
      deletedCustomIndicatorProfiles > 0 ||
      deletedBacktestBatches > 0)
  ) {
    reclaimDatabaseStorage();
  }

  return {
    deletedTrainingProjects,
    deletedReplayNotes,
    deletedQuestionLedger,
    deletedSpecialTrainingBanks,
    deletedSpecialTrainingHistoryQuestions,
    deletedSpecialTrainingHistorySessions,
    deletedCustomIndicatorProfiles,
    deletedBacktestBatches,
  };
};

const runCleanupWithExecutionLease = async (
  onProgress?: (
    stage: SystemDevSimulationCleanupJobStage,
    progressPercent: number,
  ) => void,
): Promise<SystemDevSimulationCleanupResult> => {
  ensureSystemResetIdle();
  if (!tryAcquireSystemDevSimulationCleanupExecution()) {
    throw appError("SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE");
  }
  try {
    return await cleanupSystemDevSimulationDataInternal(onProgress);
  } finally {
    releaseSystemDevSimulationCleanupExecution();
  }
};

export const cleanupSystemDevSimulationData =
  async (): Promise<SystemDevSimulationCleanupResult> => {
    if (hasActiveSystemDevSimulationCleanupJob()) {
      throw appError("SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE");
    }
    return runCleanupWithExecutionLease();
  };

export const startSystemDevSimulationCleanupJob =
  (): SystemDevSimulationCleanupJobSnapshot<SystemDevSimulationCleanupResult> => {
    ensureSystemResetIdle();
    if (
      hasActiveSimulationJob() ||
      hasActiveSystemDevSimulationTaskExecution()
    ) {
      throw appError("SYSTEM_DEV_SIMULATION_JOB_ACTIVE");
    }
    if (isSystemDevSimulationCleanupExecutionActive()) {
      throw appError("SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE");
    }
    return startSystemDevSimulationCleanupJobState({
      runCleanup: runCleanupWithExecutionLease,
      extractErrorCode: extractCleanupErrorCode,
      extractErrorArgs: extractCleanupErrorArgs,
    });
  };

export const getSystemDevSimulationCleanupJob = (
  jobId: string,
): SystemDevSimulationCleanupJobSnapshot<SystemDevSimulationCleanupResult> =>
  getSystemDevSimulationCleanupJobState(jobId);

export const getLatestSystemDevSimulationCleanupJob = ():
  | SystemDevSimulationCleanupJobSnapshot<SystemDevSimulationCleanupResult>
  | null => getLatestSystemDevSimulationCleanupJobState();

export const waitForSystemDevSimulationCleanupRuntimeIdle =
  waitForSystemDevSimulationCleanupJobIdle;
