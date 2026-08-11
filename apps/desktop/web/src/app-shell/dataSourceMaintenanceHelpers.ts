// SPDX-License-Identifier: GPL-3.0-only

import {
  api,
  toBackendErrorMessage,
  type ApiLocalDataImportPreviewJob,
  type CsvFolderStagingProgress,
} from '@/api';
import { IMPORT_LIMITS } from '@zinuto/shared/input-limits';

const LOCAL_DATA_IMPORT_PREVIEW_JOB_POLL_INTERVAL_MS = 220;
export const LOCAL_DATA_IMPORT_PREVIEW_CLIENT_DEADLINE_MS =
  IMPORT_LIMITS.previewJobDeadlineMaxMs + IMPORT_LIMITS.clientDeadlineGraceMs;

type WaitForLocalDataImportPreviewJobOptions = {
  signal?: AbortSignal;
  deadlineMs?: number;
  now?: () => number;
  waitForPollInterval?: (signal?: AbortSignal) => Promise<void>;
  loadJob?: (
    jobId: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) => Promise<ApiLocalDataImportPreviewJob>;
};

const throwIfPreviewPollingAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) {
    return;
  }
  throw signal.reason ?? new DOMException('LOCAL_DATA_IMPORT_PREVIEW_POLL_ABORTED', 'AbortError');
};

const waitForPreviewJobPollInterval = (signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    throwIfPreviewPollingAborted(signal);
    let timeoutId: number | null = null;
    const cleanup = () => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
        timeoutId = null;
      }
      signal?.removeEventListener('abort', abort);
    };
    const complete = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException('LOCAL_DATA_IMPORT_PREVIEW_POLL_ABORTED', 'AbortError'));
    };
    timeoutId = globalThis.setTimeout(
      complete,
      LOCAL_DATA_IMPORT_PREVIEW_JOB_POLL_INTERVAL_MS,
    ) as unknown as number;
    signal?.addEventListener('abort', abort, { once: true });
  });

const createPreviewClientDeadlineError = (deadlineMs: number): Error =>
  new Error(
    toBackendErrorMessage(
      'LOCAL_DATA_IMPORT_PREVIEW_TIMEOUT',
      { timeoutMs: deadlineMs },
      408,
    ),
  );

export const clampProgressPercent = (value: unknown): number | null => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return Math.max(0, Math.min(100, numericValue));
};

export const resolveStagingProgressPercent = (
  progress: CsvFolderStagingProgress,
): number | null => {
  if (progress.phase === 'DONE') {
    return 100;
  }
  if (!progress.totalFiles && !progress.totalBytes) {
    return null;
  }
  return clampProgressPercent(progress.progressPercent);
};

export const resolvePreviewJobProgressPercent = (
  job: ApiLocalDataImportPreviewJob,
): number | null => {
  const hasKnownTotal = Math.max(0, Number(job.totalFiles) || 0) > 0;
  if (!hasKnownTotal && job.status !== 'SUCCESS') {
    return null;
  }
  return clampProgressPercent(job.progressPercent);
};

export const resolvePreviewJobErrorMessage = (
  job: ApiLocalDataImportPreviewJob,
  fallbackErrorMessage: string,
): string => {
  const errorCode = String(job.errorCode || job.errorMessage || '').trim();
  return errorCode
    ? toBackendErrorMessage(errorCode, job.errorArgs ?? undefined, 400)
    : fallbackErrorMessage;
};

export const waitForLocalDataImportPreviewJobResult = async (
  initialJob: ApiLocalDataImportPreviewJob,
  fallbackErrorMessage: string,
  onProgress?: (job: ApiLocalDataImportPreviewJob) => void,
  options: WaitForLocalDataImportPreviewJobOptions = {},
) => {
  const deadlineMs = Math.max(
    1,
    Math.floor(
      Number(options.deadlineMs ?? LOCAL_DATA_IMPORT_PREVIEW_CLIENT_DEADLINE_MS) || 0,
    ),
  );
  const now = options.now ?? Date.now;
  const deadlineAt = now() + deadlineMs;
  const waitForPollInterval =
    options.waitForPollInterval ?? waitForPreviewJobPollInterval;
  const loadJob = options.loadJob ?? api.getLocalDataImportPreviewJob;
  let job = initialJob;
  onProgress?.(job);
  while (job.status === 'QUEUED' || job.status === 'RUNNING') {
    throwIfPreviewPollingAborted(options.signal);
    if (now() >= deadlineAt) {
      throw createPreviewClientDeadlineError(deadlineMs);
    }
    await waitForPollInterval(options.signal);
    throwIfPreviewPollingAborted(options.signal);
    const remainingMs = deadlineAt - now();
    if (remainingMs <= 0) {
      throw createPreviewClientDeadlineError(deadlineMs);
    }
    job = await loadJob(job.id, {
      signal: options.signal,
      timeoutMs: Math.max(1, Math.min(15_000, remainingMs)),
    });
    onProgress?.(job);
  }
  if (job.status === 'SUCCESS' && job.result) {
    onProgress?.(job);
    return job.result;
  }
  throw new Error(resolvePreviewJobErrorMessage(job, fallbackErrorMessage));
};
