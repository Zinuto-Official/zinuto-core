// SPDX-License-Identifier: GPL-3.0-only

export const RUNTIME_STARTUP_DATA_RETRY_DELAYS_MS = [
  300,
  900,
  1_800,
  3_600,
  5_000,
] as const;

export type RuntimeDataRecoveryReason = "mount" | "backend-ready";

export type RuntimeBackendLifecycleStatus = {
  state: string;
  checkedAtMs: number;
};

type RuntimeDataRecoveryRun = (context: {
  reason: RuntimeDataRecoveryReason;
  sequence: number;
  signal: AbortSignal;
}) => Promise<void>;

export type RuntimeDataRecoveryCoordinator = {
  dispose: () => void;
  observeBackendStatus: (status: RuntimeBackendLifecycleStatus) => boolean;
  request: (reason: RuntimeDataRecoveryReason) => Promise<void>;
};

export type RuntimeBackendLifecycleSubscriber = (
  handler: (status: RuntimeBackendLifecycleStatus) => void,
) => Promise<() => void>;

export const connectRuntimeDataRecoveryToBackendLifecycle = ({
  coordinator,
  subscribe,
}: {
  coordinator: RuntimeDataRecoveryCoordinator;
  subscribe: RuntimeBackendLifecycleSubscriber;
}): Promise<() => void> =>
  subscribe((status) => {
    coordinator.observeBackendStatus(status);
  });

export const createRuntimeDataRecoveryCoordinator = ({
  run,
}: {
  run: RuntimeDataRecoveryRun;
}): RuntimeDataRecoveryCoordinator => {
  let activeRun:
    | {
        abortController: AbortController;
        sequence: number;
      }
    | null = null;
  let disposed = false;
  let latestReadyCheckedAtMs = -1;
  let observedBackendUnavailable = false;
  let sequence = 0;

  const request = (reason: RuntimeDataRecoveryReason): Promise<void> => {
    if (disposed) {
      return Promise.resolve();
    }
    activeRun?.abortController.abort();
    sequence += 1;
    const abortController = new AbortController();
    const currentRun = {
      abortController,
      sequence,
    };
    activeRun = currentRun;
    return Promise.resolve()
      .then(() =>
        run({
          reason,
          sequence: currentRun.sequence,
          signal: abortController.signal,
        }),
      )
      .finally(() => {
        if (activeRun === currentRun) {
          activeRun = null;
        }
      });
  };

  const observeBackendStatus = (
    status: RuntimeBackendLifecycleStatus,
  ): boolean => {
    if (disposed) {
      return false;
    }
    const normalizedState = String(status.state || "").trim().toUpperCase();
    if (normalizedState !== "READY") {
      observedBackendUnavailable = true;
      return false;
    }
    const checkedAtMs = Math.max(
      0,
      Math.floor(Number(status.checkedAtMs) || 0),
    );
    if (checkedAtMs <= latestReadyCheckedAtMs) {
      return false;
    }
    const shouldRecover =
      observedBackendUnavailable || latestReadyCheckedAtMs >= 0;
    latestReadyCheckedAtMs = checkedAtMs;
    observedBackendUnavailable = false;
    if (!shouldRecover) {
      return false;
    }
    void request("backend-ready").catch(() => undefined);
    return true;
  };

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      activeRun?.abortController.abort();
      activeRun = null;
    },
    observeBackendStatus,
    request,
  };
};

type RuntimeStartupRetryResult<T> =
  | {
      status: "ready";
      attempts: number;
      value: T;
    }
  | {
      status: "failed";
      attempts: number;
      error: unknown;
    }
  | {
      status: "aborted";
      attempts: number;
    };

type RunRuntimeStartupTaskWithRetryArgs<T> = {
  task: () => Promise<T>;
  signal: AbortSignal;
  isActive: () => boolean;
  retryDelaysMs?: readonly number[];
  waitForRetry?: (delayMs: number, signal: AbortSignal) => Promise<boolean>;
};

const waitForRuntimeStartupRetry = (
  delayMs: number,
  signal: AbortSignal,
): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    let settled = false;
    let timerId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const settle = (ready: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timerId !== null) {
        globalThis.clearTimeout(timerId);
      }
      signal.removeEventListener("abort", handleAbort);
      resolve(ready);
    };
    const handleAbort = () => settle(false);
    timerId = globalThis.setTimeout(
      () => settle(true),
      Math.max(0, Math.floor(delayMs)),
    );
    signal.addEventListener("abort", handleAbort, { once: true });
  });

export const runRuntimeStartupTaskWithRetry = async <T>({
  task,
  signal,
  isActive,
  retryDelaysMs = RUNTIME_STARTUP_DATA_RETRY_DELAYS_MS,
  waitForRetry = waitForRuntimeStartupRetry,
}: RunRuntimeStartupTaskWithRetryArgs<T>): Promise<
  RuntimeStartupRetryResult<T>
> => {
  let attempts = 0;
  let lastError: unknown = new Error("RUNTIME_STARTUP_DATA_UNAVAILABLE");

  while (!signal.aborted && isActive()) {
    attempts += 1;
    try {
      const value = await task();
      if (signal.aborted || !isActive()) {
        return { status: "aborted", attempts };
      }
      return { status: "ready", attempts, value };
    } catch (error) {
      lastError = error;
    }

    const retryDelayMs = retryDelaysMs[attempts - 1];
    if (retryDelayMs === undefined) {
      return { status: "failed", attempts, error: lastError };
    }
    const shouldRetry = await waitForRetry(retryDelayMs, signal);
    if (!shouldRetry || signal.aborted || !isActive()) {
      return { status: "aborted", attempts };
    }
  }

  return { status: "aborted", attempts };
};

type RuntimeStartupDataTask = (options?: {
  signal?: AbortSignal;
}) => Promise<unknown>;

type RunRuntimeStartupDataRecoveryArgs = {
  refreshInstruments: RuntimeStartupDataTask;
  syncCustomSamplePoolsFromDataSources: RuntimeStartupDataTask;
  signal: AbortSignal;
  isActive: () => boolean;
  retryDelaysMs?: readonly number[];
  waitForRetry?: (delayMs: number, signal: AbortSignal) => Promise<boolean>;
};

export const runRuntimeStartupDataRecovery = ({
  refreshInstruments,
  syncCustomSamplePoolsFromDataSources,
  signal,
  isActive,
  retryDelaysMs,
  waitForRetry,
}: RunRuntimeStartupDataRecoveryArgs) =>
  runRuntimeStartupTaskWithRetry({
    signal,
    isActive,
    retryDelaysMs,
    waitForRetry,
    task: async () => {
      const results = await Promise.allSettled([
        refreshInstruments({ signal }),
        syncCustomSamplePoolsFromDataSources({ signal }),
      ]);
      const instrumentResult = results[0];
      const samplePoolResult = results[1];
      if (instrumentResult.status === "rejected") {
        throw instrumentResult.reason;
      }
      if (samplePoolResult.status === "rejected") {
        throw samplePoolResult.reason;
      }
      return {
        instruments: instrumentResult.value,
        samplePools: samplePoolResult.value,
      };
    },
  });
