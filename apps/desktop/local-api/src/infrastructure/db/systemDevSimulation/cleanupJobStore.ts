// SPDX-License-Identifier: GPL-3.0-only

import { appError } from "../../../kernel/appError.js";
import { createId } from "../../../kernel/id.js";
import { nowIso } from "../../../kernel/time.js";

export type SystemDevSimulationCleanupJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED";

export type SystemDevSimulationCleanupJobStage =
  | "QUEUED"
  | "COLLECTING"
  | "REPLAY_NOTES"
  | "QUESTION_LEDGER"
  | "SPECIAL_TRAINING_HISTORY"
  | "TRAINING_PROJECTS"
  | "CUSTOM_INDICATORS"
  | "BACKTESTS"
  | "FINALIZING"
  | "DONE";

export type SystemDevSimulationCleanupJobSnapshot<TResult = unknown> = {
  id: string;
  status: SystemDevSimulationCleanupJobStatus;
  stage: SystemDevSimulationCleanupJobStage;
  progressPercent: number;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorArgs: Record<string, string | number | boolean | null> | null;
  result: TResult | null;
};

type MutableSystemDevSimulationCleanupJob<TResult = unknown> =
  SystemDevSimulationCleanupJobSnapshot<TResult>;

type StartSystemDevSimulationCleanupJobArgs<TResult> = {
  runCleanup: (
    onProgress: (
      stage: SystemDevSimulationCleanupJobStage,
      progressPercent: number,
    ) => void,
  ) => Promise<TResult>;
  extractErrorCode: (error: unknown) => string;
  extractErrorArgs: (
    error: unknown,
  ) => Record<string, string | number | boolean | null> | null;
};

let cleanupJobState:
  | MutableSystemDevSimulationCleanupJob<unknown>
  | null = null;
let cleanupJobPromise: Promise<void> | null = null;

const scheduleCleanupJobRunner = (runner: () => void): void => {
  setImmediate(runner);
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
};

const cloneCleanupJobSnapshot = <TResult>(
  state: MutableSystemDevSimulationCleanupJob<TResult>,
): SystemDevSimulationCleanupJobSnapshot<TResult> => ({
  ...state,
  errorArgs: state.errorArgs ? { ...state.errorArgs } : null,
  result: state.result ?? null,
});

export const hasActiveSystemDevSimulationCleanupJob = (): boolean =>
  Boolean(
    cleanupJobState &&
      (cleanupJobState.status === "QUEUED" ||
        cleanupJobState.status === "RUNNING"),
  );

export const clearInactiveSystemDevSimulationCleanupJobState = (): void => {
  if (hasActiveSystemDevSimulationCleanupJob()) {
    throw appError("SYSTEM_DEV_SIMULATION_CLEANUP_ACTIVE");
  }
  cleanupJobState = null;
  cleanupJobPromise = null;
};

export const startSystemDevSimulationCleanupJobState = <TResult>({
  runCleanup,
  extractErrorCode,
  extractErrorArgs,
}: StartSystemDevSimulationCleanupJobArgs<TResult>): SystemDevSimulationCleanupJobSnapshot<TResult> => {
  if (hasActiveSystemDevSimulationCleanupJob() && cleanupJobState) {
    return cloneCleanupJobSnapshot(
      cleanupJobState as MutableSystemDevSimulationCleanupJob<TResult>,
    );
  }

  const created: MutableSystemDevSimulationCleanupJob<TResult> = {
    id: createId(),
    status: "QUEUED",
    stage: "QUEUED",
    progressPercent: 0,
    startedAt: null,
    finishedAt: null,
    errorCode: null,
    errorArgs: null,
    result: null,
  };
  cleanupJobState = created;

  cleanupJobPromise = new Promise((resolve) => {
    scheduleCleanupJobRunner(() => {
      void (async () => {
        if (!cleanupJobState || cleanupJobState.id !== created.id) {
          resolve();
          return;
        }
        cleanupJobState.status = "RUNNING";
        cleanupJobState.stage = "COLLECTING";
        cleanupJobState.progressPercent = 2;
        cleanupJobState.startedAt = nowIso();
        try {
          const result = await runCleanup((stage, progressPercent) => {
            if (!cleanupJobState || cleanupJobState.id !== created.id) {
              return;
            }
            cleanupJobState.stage = stage;
            cleanupJobState.progressPercent = clampPercent(progressPercent);
          });
          if (!cleanupJobState || cleanupJobState.id !== created.id) {
            resolve();
            return;
          }
          cleanupJobState.result = result;
          cleanupJobState.stage = "DONE";
          cleanupJobState.progressPercent = 100;
          cleanupJobState.status = "SUCCESS";
          cleanupJobState.errorCode = null;
          cleanupJobState.errorArgs = null;
        } catch (error) {
          if (!cleanupJobState || cleanupJobState.id !== created.id) {
            resolve();
            return;
          }
          cleanupJobState.status = "FAILED";
          cleanupJobState.errorCode = extractErrorCode(error);
          cleanupJobState.errorArgs = extractErrorArgs(error);
        } finally {
          if (cleanupJobState && cleanupJobState.id === created.id) {
            cleanupJobState.finishedAt = nowIso();
          }
          cleanupJobPromise = null;
          resolve();
        }
      })();
    });
  });
  void cleanupJobPromise;

  return cloneCleanupJobSnapshot(created);
};

export const getSystemDevSimulationCleanupJobState = <TResult>(
  jobId: string,
): SystemDevSimulationCleanupJobSnapshot<TResult> => {
  const normalizedJobId = String(jobId ?? "").trim();
  if (!normalizedJobId || !cleanupJobState || cleanupJobState.id !== normalizedJobId) {
    throw appError(
      "SYSTEM_DEV_SIMULATION_CLEANUP_JOB_NOT_FOUND",
      { jobId: normalizedJobId },
      404,
    );
  }
  return cloneCleanupJobSnapshot(
    cleanupJobState as MutableSystemDevSimulationCleanupJob<TResult>,
  );
};

export const getLatestSystemDevSimulationCleanupJobState = <TResult>():
  | SystemDevSimulationCleanupJobSnapshot<TResult>
  | null => {
  if (!cleanupJobState) {
    return null;
  }
  return cloneCleanupJobSnapshot(
    cleanupJobState as MutableSystemDevSimulationCleanupJob<TResult>,
  );
};

export const waitForSystemDevSimulationCleanupJobIdle = async (): Promise<void> => {
  await cleanupJobPromise;
};
