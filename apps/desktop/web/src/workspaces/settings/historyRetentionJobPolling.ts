// SPDX-License-Identifier: GPL-3.0-only

import type { ApiHistoryRetentionJob, ApiRequestOptions } from '@/api';

export const HISTORY_RETENTION_JOB_POLL_INTERVAL_MS = 1_500;
export const HISTORY_RETENTION_JOB_POLL_REQUEST_TIMEOUT_MS = 8_000;
const HISTORY_RETENTION_JOB_MAX_CONSECUTIVE_RETRYABLE_FAILURES = 3;

type PollFailure = {
  error: unknown;
  willRetry: boolean;
};

type PollResult =
  | { status: 'COMPLETED'; job: ApiHistoryRetentionJob }
  | { status: 'CANCELLED' }
  | { status: 'FAILED'; error: unknown };

const isActiveJob = (job: ApiHistoryRetentionJob): boolean =>
  job.status === 'QUEUED' || job.status === 'RUNNING';

export const waitForHistoryRetentionPollTick = (
  delayMs: number,
  signal: AbortSignal,
): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      signal.removeEventListener('abort', abort);
    };
    const abort = (): void => {
      cleanup();
      resolve(false);
    };
    timer = setTimeout(() => {
      cleanup();
      resolve(true);
    }, Math.max(0, delayMs));
    signal.addEventListener('abort', abort, { once: true });
  });

export const pollHistoryRetentionJobUntilTerminal = async ({
  initialJob,
  signal,
  loadJob,
  isRetryableError,
  onJob,
  onFailure,
  waitForPollTick = waitForHistoryRetentionPollTick,
  pollIntervalMs = HISTORY_RETENTION_JOB_POLL_INTERVAL_MS,
  requestTimeoutMs = HISTORY_RETENTION_JOB_POLL_REQUEST_TIMEOUT_MS,
}: {
  initialJob: ApiHistoryRetentionJob;
  signal: AbortSignal;
  loadJob: (
    jobId: string,
    options: ApiRequestOptions,
  ) => Promise<ApiHistoryRetentionJob>;
  isRetryableError: (error: unknown) => boolean;
  onJob: (job: ApiHistoryRetentionJob) => void;
  onFailure: (failure: PollFailure) => void;
  waitForPollTick?: (delayMs: number, signal: AbortSignal) => Promise<boolean>;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
}): Promise<PollResult> => {
  let currentJob = initialJob;
  let consecutiveFailures = 0;

  while (isActiveJob(currentJob)) {
    const shouldContinue = await waitForPollTick(pollIntervalMs, signal);
    if (!shouldContinue || signal.aborted) {
      return { status: 'CANCELLED' };
    }
    try {
      currentJob = await loadJob(currentJob.id, {
        signal,
        timeoutMs: requestTimeoutMs,
      });
      if (signal.aborted) {
        return { status: 'CANCELLED' };
      }
      consecutiveFailures = 0;
      onJob(currentJob);
    } catch (error) {
      if (signal.aborted) {
        return { status: 'CANCELLED' };
      }
      consecutiveFailures += 1;
      const willRetry =
        isRetryableError(error) &&
        consecutiveFailures <
          HISTORY_RETENTION_JOB_MAX_CONSECUTIVE_RETRYABLE_FAILURES;
      onFailure({ error, willRetry });
      if (!willRetry) {
        return { status: 'FAILED', error };
      }
    }
  }

  return { status: 'COMPLETED', job: currentJob };
};
