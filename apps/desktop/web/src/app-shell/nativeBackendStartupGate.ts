// SPDX-License-Identifier: GPL-3.0-only

import type { NativeBackendStartupPreflightStatus } from "@/api";
import { runTauriUnlistenSafely } from "@/frontend-kernel/tauriEventCleanup";

export const NATIVE_BACKEND_STARTUP_POLL_INTERVAL_MS = 2_500;
export const NATIVE_BACKEND_READY_FALLBACK_POLL_INTERVAL_MS = 30_000;
export const NATIVE_BACKEND_STARTUP_MAX_READ_FAILURES = 8;

const ORDINARY_STARTUP_DEADLINE_MS = 2 * 60 * 1_000;
const CORE_SCHEMA_STARTUP_DEADLINE_MS = 16 * 60 * 1_000;
const RUNTIME_BOOTSTRAP_STARTUP_DEADLINE_MS = 6 * 60 * 1_000;
const MARKET_SCHEMA_STARTUP_DEADLINE_MS = 24 * 60 * 60 * 1_000 + 60_000;

export type NativeBackendStartupGateState = {
  allowedStartupMs: number;
  consecutiveReadFailures: number;
  lastStage: string;
  startedAtMs: number;
};

export type NativeBackendStartupFailure = {
  errorCode: string;
  errorMessage?: string | null;
  stage: string;
};

export type NativeBackendStartupGateDecision =
  | {
      kind: "wait";
      stage: string;
      state: NativeBackendStartupGateState;
    }
  | {
      kind: "ready";
      state: NativeBackendStartupGateState;
    }
  | {
      failure: NativeBackendStartupFailure;
      kind: "failed";
      state: NativeBackendStartupGateState;
    };

type NativeBackendStartupPollTimer = ReturnType<typeof globalThis.setTimeout>;

export type NativeBackendStartupStatusWatcher = {
  dispose: () => void;
  initialRead: Promise<void>;
};

export type NativeBackendStartupStatusWatcherOptions = {
  cancelPoll?: (timer: NativeBackendStartupPollTimer) => void;
  listenStatus: (
    handler: (status: NativeBackendStartupPreflightStatus) => void,
  ) => Promise<() => void>;
  nowMs?: () => number;
  onFailed: (failure: NativeBackendStartupFailure) => void;
  onPending: (stage: string) => void;
  onReady: () => void;
  pollIntervalMs?: number;
  readStatus: () => Promise<NativeBackendStartupPreflightStatus | null>;
  readyFallbackPollIntervalMs?: number;
  schedulePoll?: (
    callback: () => void,
    delayMs: number,
  ) => NativeBackendStartupPollTimer;
};

const resolveAllowedStartupMs = (stage: string): number => {
  if (stage.startsWith("dataUpgrade:market-")) {
    return MARKET_SCHEMA_STARTUP_DEADLINE_MS;
  }
  if (
    stage === "dataUpgrade:core-schema" ||
    stage === "dataUpgrade:reset-recovery" ||
    stage === "dataUpgrade:seed-reconcile"
  ) {
    return CORE_SCHEMA_STARTUP_DEADLINE_MS;
  }
  if (stage === "dataUpgrade:runtime-bootstrap") {
    return RUNTIME_BOOTSTRAP_STARTUP_DEADLINE_MS;
  }
  return ORDINARY_STARTUP_DEADLINE_MS;
};

export const createNativeBackendStartupGateState = (
  startedAtMs: number,
): NativeBackendStartupGateState => ({
  allowedStartupMs: ORDINARY_STARTUP_DEADLINE_MS,
  consecutiveReadFailures: 0,
  lastStage: "",
  startedAtMs,
});

export const advanceNativeBackendStartupGate = ({
  nowMs,
  state,
  status,
}: {
  nowMs: number;
  state: NativeBackendStartupGateState;
  status: NativeBackendStartupPreflightStatus | null;
}): NativeBackendStartupGateDecision => {
  const normalizedState = String(status?.state ?? "").trim().toUpperCase();
  const stage = String(status?.stage || state.lastStage).trim();
  const nextState: NativeBackendStartupGateState = {
    ...state,
    allowedStartupMs: Math.max(
      state.allowedStartupMs,
      resolveAllowedStartupMs(stage),
    ),
    consecutiveReadFailures: status
      ? 0
      : state.consecutiveReadFailures + 1,
    lastStage: stage,
  };

  if (!status) {
    if (
      nextState.consecutiveReadFailures >=
      NATIVE_BACKEND_STARTUP_MAX_READ_FAILURES
    ) {
      return {
        failure: {
          errorCode: "BACKEND_STARTUP_STATUS_UNAVAILABLE",
          stage: stage || "nativeStatus",
        },
        kind: "failed",
        state: nextState,
      };
    }
  } else if (normalizedState === "FAILED") {
    return {
      failure: {
        errorCode: status.errorCode || "BACKEND_STARTUP_FAILED",
        errorMessage: status.errorMessage,
        stage: stage || "unknown",
      },
      kind: "failed",
      state: nextState,
    };
  } else if (normalizedState === "READY") {
    return { kind: "ready", state: nextState };
  } else if (normalizedState !== "PENDING") {
    return {
      failure: {
        errorCode: "BACKEND_STARTUP_STATUS_INVALID",
        stage: stage || "nativeStatus",
      },
      kind: "failed",
      state: nextState,
    };
  }

  if (nowMs - state.startedAtMs >= nextState.allowedStartupMs) {
    return {
      failure: {
        errorCode: "BACKEND_STARTUP_DEADLINE_EXCEEDED",
        stage: stage || "startupDeadline",
      },
      kind: "failed",
      state: nextState,
    };
  }

  return {
    kind: "wait",
    stage,
    state: nextState,
  };
};

export const startNativeBackendStartupStatusWatcher = ({
  cancelPoll = (timer) => globalThis.clearTimeout(timer),
  listenStatus,
  nowMs = Date.now,
  onFailed,
  onPending,
  onReady,
  pollIntervalMs = NATIVE_BACKEND_STARTUP_POLL_INTERVAL_MS,
  readStatus,
  readyFallbackPollIntervalMs =
    NATIVE_BACKEND_READY_FALLBACK_POLL_INTERVAL_MS,
  schedulePoll = (callback, delayMs) =>
    globalThis.setTimeout(callback, delayMs),
}: NativeBackendStartupStatusWatcherOptions): NativeBackendStartupStatusWatcher => {
  let disposed = false;
  let reachedReady = false;
  let terminalFailure = false;
  let listenerInstalled = false;
  let pollInFlight = false;
  let pollTimer: NativeBackendStartupPollTimer | null = null;
  let unlisten: (() => void) | null = null;
  let latestCheckedAtMs = -1;
  let gateState = createNativeBackendStartupGateState(nowMs());

  const clearScheduledPoll = (): void => {
    if (pollTimer === null) {
      return;
    }
    cancelPoll(pollTimer);
    pollTimer = null;
  };

  const releaseListener = (): void => {
    const nextUnlisten = unlisten;
    unlisten = null;
    listenerInstalled = false;
    runTauriUnlistenSafely(nextUnlisten);
  };

  const failOnce = (failure: NativeBackendStartupFailure): void => {
    if (disposed || terminalFailure) {
      return;
    }
    terminalFailure = true;
    clearScheduledPoll();
    releaseListener();
    onFailed(failure);
  };

  const acceptStatus = (
    status: NativeBackendStartupPreflightStatus | null,
  ): void => {
    if (disposed || terminalFailure) {
      return;
    }
    if (status && status.checkedAtMs < latestCheckedAtMs) {
      return;
    }
    if (status) {
      latestCheckedAtMs = Math.max(latestCheckedAtMs, status.checkedAtMs);
    }

    if (reachedReady) {
      if (status?.state !== "FAILED") {
        return;
      }
      const decision = advanceNativeBackendStartupGate({
        nowMs: nowMs(),
        state: gateState,
        status,
      });
      gateState = decision.state;
      if (decision.kind === "failed") {
        failOnce(decision.failure);
      }
      return;
    }

    const decision = advanceNativeBackendStartupGate({
      nowMs: nowMs(),
      state: gateState,
      status,
    });
    gateState = decision.state;
    if (decision.kind === "ready") {
      reachedReady = true;
      if (listenerInstalled) {
        clearScheduledPoll();
      }
      onReady();
      return;
    }
    if (decision.kind === "failed") {
      failOnce(decision.failure);
      return;
    }
    onPending(decision.stage);
  };

  const poll = async (forceInitialRead = false): Promise<void> => {
    if (
      disposed ||
      pollInFlight ||
      terminalFailure ||
      (!forceInitialRead && reachedReady && listenerInstalled)
    ) {
      return;
    }
    pollInFlight = true;
    const status = await readStatus().catch(() => null);
    pollInFlight = false;
    if (disposed) {
      return;
    }
    acceptStatus(status);
    if (!terminalFailure && (!reachedReady || !listenerInstalled)) {
      const nextPollIntervalMs =
        reachedReady && !listenerInstalled
          ? readyFallbackPollIntervalMs
          : pollIntervalMs;
      pollTimer = schedulePoll(() => {
        pollTimer = null;
        void poll();
      }, Math.max(0, nextPollIntervalMs));
    }
  };

  const initialRead = (async () => {
    try {
      const nextUnlisten = await listenStatus(acceptStatus);
      if (disposed || terminalFailure) {
        runTauriUnlistenSafely(nextUnlisten);
      } else {
        unlisten = nextUnlisten;
        listenerInstalled = true;
        if (reachedReady) {
          clearScheduledPoll();
        }
      }
    } catch {
      // Initial polling remains the bounded fallback when event registration
      // is unavailable in a damaged or partially initialized native shell.
    }
    if (!disposed) {
      await poll(true);
    }
  })();

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      clearScheduledPoll();
      releaseListener();
    },
    initialRead,
  };
};
