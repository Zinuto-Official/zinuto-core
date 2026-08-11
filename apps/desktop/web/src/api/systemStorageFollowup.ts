// SPDX-License-Identifier: GPL-3.0-only

import type { ApiSystemStorageSummary } from "@/api/system";

const REFRESH_PENDING_POLL_MS = 400;
const IDLE_RECHECK_BASE_MS = 5_000;
const IDLE_RECHECK_MAX_MS = 30_000;
const MIN_RETRY_WAIT_MS = 5_000;
const MAX_RETRY_WAIT_MS = 30_000;
const LOAD_FAILURE_BASE_MS = 500;
const LOAD_FAILURE_MAX_MS = 5_000;
const MAX_FOLLOWUP_POLL_ATTEMPTS = 60;

type WaitForDelay = (
  delayMs: number,
  signal: AbortSignal,
) => Promise<boolean>;

const waitForDelay: WaitForDelay = (delayMs, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve(true);
    }, delayMs);
    const abort = (): void => {
      clearTimeout(timeout);
      resolve(false);
    };
    signal.addEventListener("abort", abort, { once: true });
  });

export const getSystemStorageFollowupDelayMs = (
  summary: ApiSystemStorageSummary,
  nowMs = Date.now(),
  attemptIndex = 0,
): number | null => {
  const state = summary.measurementState;
  if (state.status === "FRESH") {
    return null;
  }
  const nextRetryAtMs = Date.parse(state.nextRetryAt ?? "");
  if (Number.isFinite(nextRetryAtMs) && nextRetryAtMs > nowMs) {
    return Math.min(
      MAX_RETRY_WAIT_MS,
      Math.max(MIN_RETRY_WAIT_MS, nextRetryAtMs - nowMs),
    );
  }
  if (state.refreshPending) {
    return REFRESH_PENDING_POLL_MS;
  }
  return Math.min(
    IDLE_RECHECK_MAX_MS,
    IDLE_RECHECK_BASE_MS *
      2 ** Math.max(0, Math.floor(Number(attemptIndex) || 0)),
  );
};

export const followSystemStorageUntilFresh = async ({
  loadSummary,
  publishSummary,
  signal,
  wait = waitForDelay,
}: {
  loadSummary: (signal: AbortSignal) => Promise<ApiSystemStorageSummary>;
  publishSummary: (summary: ApiSystemStorageSummary) => void;
  signal: AbortSignal;
  wait?: WaitForDelay;
}): Promise<void> => {
  let latestSummary: ApiSystemStorageSummary | null = null;
  let consecutiveLoadFailures = 0;
  let attemptIndex = 0;

  while (
    !signal.aborted &&
    attemptIndex < MAX_FOLLOWUP_POLL_ATTEMPTS
  ) {
    attemptIndex += 1;
    const stateDelayMs = latestSummary
      ? getSystemStorageFollowupDelayMs(
          latestSummary,
          Date.now(),
          attemptIndex - 1,
        )
      : 0;
    if (stateDelayMs === null) {
      return;
    }
    const failureDelayMs = consecutiveLoadFailures
      ? Math.min(
          LOAD_FAILURE_MAX_MS,
          LOAD_FAILURE_BASE_MS * 2 ** (consecutiveLoadFailures - 1),
        )
      : 0;
    const delayMs = Math.max(stateDelayMs, failureDelayMs);
    if (delayMs > 0 && !(await wait(delayMs, signal))) {
      return;
    }
    try {
      const nextSummary = await loadSummary(signal);
      if (signal.aborted) {
        return;
      }
      latestSummary = nextSummary;
      consecutiveLoadFailures = 0;
      publishSummary(nextSummary);
    } catch {
      if (signal.aborted) {
        return;
      }
      consecutiveLoadFailures += 1;
    }
  }
};
