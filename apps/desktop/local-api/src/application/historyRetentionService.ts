// SPDX-License-Identifier: GPL-3.0-only

import { createId } from "../kernel/id.js";
import { nowIso } from "../kernel/time.js";
import { appError, isAppError } from "../kernel/appError.js";
import {
  updateHistoryRetentionPolicyRow,
} from "./ports/infrastructure/db/history/historyRetentionStore.js";
import { runManualHistoryRetentionInWorker } from "./ports/runtime/historyRetentionMaintenanceWorkerClient.js";
import { isSystemResetExecutionActive } from "./trading/resetExecutionState.js";
import {
  applyHistoryRetentionPolicySnapshot,
  buildHistoryRetentionPreviewForPolicy,
  ensureHistoryRetentionPolicy,
  normalizeHistoryRetentionWindow,
} from "./historyRetentionExecution.js";
import type {
  HistoryRetentionApplyResult,
  HistoryRetentionJob,
  HistoryRetentionPolicy,
  HistoryRetentionPreview,
  HistoryRetentionTargets,
} from "../domain/historyRetentionTypes.js";

type HistoryRetentionPolicyInput = {
  retentionWindow?: unknown;
  targets?: Partial<Record<keyof HistoryRetentionTargets, unknown>>;
};

const JOBS = new Map<string, HistoryRetentionJob>();
let latestJobId: string | null = null;
const MAX_RETAINED_HISTORY_RETENTION_JOBS = 5;

const pruneCompletedJobs = (): void => {
  if (JOBS.size <= MAX_RETAINED_HISTORY_RETENTION_JOBS) return;
  const terminalJobs = [...JOBS.entries()]
    .filter(([, job]) => job.status === "SUCCESS" || job.status === "FAILED")
    .sort(([, a], [, b]) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
  for (let i = MAX_RETAINED_HISTORY_RETENTION_JOBS; i < terminalJobs.length; i++) {
    const [id] = terminalJobs[i];
    if (id !== latestJobId) JOBS.delete(id);
  }
};

const mergePolicyInput = (
  base: HistoryRetentionPolicy,
  input?: HistoryRetentionPolicyInput | null,
): HistoryRetentionPolicy => {
  if (!input || typeof input !== "object") {
    return base;
  }
  return {
    ...base,
    retentionWindow: normalizeHistoryRetentionWindow(
      input.retentionWindow,
      base.retentionWindow,
    ),
    targets: {
      freeReplayDetails:
        typeof input.targets?.freeReplayDetails === "boolean"
          ? input.targets.freeReplayDetails
          : base.targets.freeReplayDetails,
      challengeDetails:
        typeof input.targets?.challengeDetails === "boolean"
          ? input.targets.challengeDetails
          : base.targets.challengeDetails,
      noteText:
        typeof input.targets?.noteText === "boolean"
          ? input.targets.noteText
          : base.targets.noteText,
    },
  };
};

const updateJob = (
  jobId: string,
  patch: Partial<Omit<HistoryRetentionJob, "id">>,
): HistoryRetentionJob => {
  const current = JOBS.get(jobId);
  if (!current) {
    throw appError("HISTORY_RETENTION_JOB_NOT_FOUND");
  }
  const next = {
    ...current,
    ...patch,
  };
  JOBS.set(jobId, next);
  return next;
};

const normalizeUnexpectedError = (
  error: unknown,
): { code: string; args: Record<string, string | number | boolean | null> | null } => {
  if (isAppError(error)) {
    return {
      code: error.code,
      args: error.args ?? null,
    };
  }
  if (error instanceof Error) {
    if (error.name === "HistoryRetentionMaintenanceTimeoutError") {
      return { code: "HISTORY_RETENTION_JOB_TIMEOUT", args: null };
    }
    if (error.name === "AbortError") {
      return { code: "HISTORY_RETENTION_JOB_INTERRUPTED", args: null };
    }
    if (error.name === "HistoryRetentionMaintenanceBusyError") {
      return { code: "HISTORY_RETENTION_MAINTENANCE_BUSY", args: null };
    }
    return {
      code: "HISTORY_RETENTION_JOB_FAILED",
      args: {
        reason: String(error.message || error.name || "UNKNOWN_ERROR").slice(0, 240),
      },
    };
  }
  return {
    code: "HISTORY_RETENTION_JOB_FAILED",
    args: null,
  };
};

const runHistoryRetentionJob = async (
  jobId: string,
): Promise<void> => {
  updateJob(jobId, {
    status: "RUNNING",
    stage: "PREVIEWING",
    progressPercent: 5,
    startedAt: nowIso(),
  });
  try {
    const result = await runManualHistoryRetentionInWorker({
      onProgress: ({ stage, progressPercent }) => {
        updateJob(jobId, { stage, progressPercent });
      },
    });
    updateJob(jobId, {
      status: "SUCCESS",
      stage: "DONE",
      progressPercent: 100,
      finishedAt: nowIso(),
      result,
    });
  } catch (error) {
    const failure = normalizeUnexpectedError(error);
    updateJob(jobId, {
      status: "FAILED",
      finishedAt: nowIso(),
      errorCode: failure.code,
      errorArgs: failure.args,
    });
  } finally {
    pruneCompletedJobs();
  }
};

export const getHistoryRetentionPolicy = (): HistoryRetentionPolicy =>
  ensureHistoryRetentionPolicy();

export const updateHistoryRetentionPolicy = (
  input: HistoryRetentionPolicyInput,
): HistoryRetentionPolicy => {
  const current = ensureHistoryRetentionPolicy();
  const next = mergePolicyInput(current, input);
  const timestamp = nowIso();
  updateHistoryRetentionPolicyRow(next, timestamp);
  return {
    ...next,
    updatedAt: timestamp,
  };
};

export const previewHistoryRetentionPolicy = (
  input?: HistoryRetentionPolicyInput | null,
): HistoryRetentionPreview =>
  buildHistoryRetentionPreviewForPolicy(
    mergePolicyInput(ensureHistoryRetentionPolicy(), input),
  );

export const applyHistoryRetentionPolicy = (): HistoryRetentionApplyResult =>
  applyHistoryRetentionPolicySnapshot(ensureHistoryRetentionPolicy());

export const startHistoryRetentionJob = (): HistoryRetentionJob => {
  if (isSystemResetExecutionActive()) {
    throw appError("SYSTEM_RESET_IN_PROGRESS");
  }
  const existing = latestJobId ? JOBS.get(latestJobId) : null;
  if (existing && (existing.status === "QUEUED" || existing.status === "RUNNING")) {
    return existing;
  }
  const job: HistoryRetentionJob = {
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
  JOBS.set(job.id, job);
  latestJobId = job.id;
  void runHistoryRetentionJob(job.id);
  return job;
};

export const getLatestHistoryRetentionJob = (): HistoryRetentionJob | null =>
  latestJobId ? JOBS.get(latestJobId) ?? null : null;

export const getHistoryRetentionJob = (jobId: string): HistoryRetentionJob => {
  const id = String(jobId ?? "").trim();
  if (!id) {
    throw appError("HISTORY_RETENTION_JOB_NOT_FOUND");
  }
  const job = JOBS.get(id);
  if (!job) {
    throw appError("HISTORY_RETENTION_JOB_NOT_FOUND");
  }
  return job;
};
