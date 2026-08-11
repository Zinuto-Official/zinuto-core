// SPDX-License-Identifier: GPL-3.0-only

export const STARTUP_STATUS_REVEAL_MS = 1_200;
export const STARTUP_MINIMUM_VISIBLE_MS = 800;
export const STARTUP_EXIT_DURATION_MS = 180;
export const STARTUP_SURFACE_VISIBLE_EVENT =
  "zinuto:startup-surface-visible";

export type StartupStageMessageId =
  | "appText.startupStarting"
  | "appText.startupStartingLocalEngine"
  | "appText.startupPreparingLocalData"
  | "appText.startupCheckingMarketData"
  | "appText.startupUpdatingMarketData"
  | "appText.startupRecoveringLocalData"
  | "appText.startupSyncingBuiltInData"
  | "appText.startupPreparingWorkspace";

type StartupVisibleListener = (visibleAtMs: number) => void;

let startupSurfaceVisibleAtMs: number | null = null;
const startupVisibleListeners = new Set<StartupVisibleListener>();

export const readStartupNowMs = (): number => {
  if (typeof performance !== "undefined") {
    return performance.now();
  }
  return Date.now();
};

export const readStartupSurfaceVisibleAtMs = (): number | null => {
  if (startupSurfaceVisibleAtMs !== null) {
    return startupSurfaceVisibleAtMs;
  }
  if (typeof document === "undefined") {
    return null;
  }
  const recordedVisibleAtMs = Number(
    document.documentElement.dataset.zinutoStartupVisibleAtMs,
  );
  if (!Number.isFinite(recordedVisibleAtMs) || recordedVisibleAtMs < 0) {
    return null;
  }
  startupSurfaceVisibleAtMs = recordedVisibleAtMs;
  return startupSurfaceVisibleAtMs;
};

export const markStartupSurfaceVisible = (
  visibleAtMs = readStartupNowMs(),
): number => {
  if (startupSurfaceVisibleAtMs !== null) {
    return startupSurfaceVisibleAtMs;
  }
  startupSurfaceVisibleAtMs = visibleAtMs;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.zinutoStartupVisibleAtMs =
      String(visibleAtMs);
  }
  for (const listener of startupVisibleListeners) {
    listener(visibleAtMs);
  }
  startupVisibleListeners.clear();
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<{ visibleAtMs: number }>(
        STARTUP_SURFACE_VISIBLE_EVENT,
        { detail: { visibleAtMs } },
      ),
    );
  }
  return visibleAtMs;
};

export const subscribeStartupSurfaceVisible = (
  listener: StartupVisibleListener,
): (() => void) => {
  const visibleAtMs = readStartupSurfaceVisibleAtMs();
  if (visibleAtMs !== null) {
    listener(visibleAtMs);
    return () => undefined;
  }
  startupVisibleListeners.add(listener);
  return () => {
    startupVisibleListeners.delete(listener);
  };
};

export const calculateStartupCopyRevealDelayMs = ({
  nowMs,
  visibleAtMs,
}: {
  nowMs: number;
  visibleAtMs: number;
}): number =>
  Math.max(0, visibleAtMs + STARTUP_STATUS_REVEAL_MS - nowMs);

export const resolveStartupExitSchedule = ({
  exitDurationMs = STARTUP_EXIT_DURATION_MS,
  readyAtMs,
  visibleAtMs,
}: {
  exitDurationMs?: number;
  readyAtMs: number;
  visibleAtMs: number;
}): { exitAtMs: number; hiddenAtMs: number } => {
  const boundedExitDurationMs = Math.max(0, exitDurationMs);
  const earliestExitAtMs =
    visibleAtMs + STARTUP_MINIMUM_VISIBLE_MS - boundedExitDurationMs;
  const exitAtMs = Math.max(readyAtMs, earliestExitAtMs);
  return {
    exitAtMs,
    hiddenAtMs: exitAtMs + boundedExitDurationMs,
  };
};

export const isStartupMotionReduced = (): boolean => {
  if (typeof document !== "undefined") {
    if (document.documentElement.dataset.motion === "reduced") {
      return true;
    }
  }
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
};

const STARTUP_LOCAL_ENGINE_STAGES = new Set([
  "manifest",
  "nodeRuntime",
  "bridgeSecret",
  "spawn",
  "health",
  "runtimeState",
  "transport",
  "startupLease",
  "orphanReconciliation",
  "startup",
  "startupTask",
  "bootstrap",
  "ready",
  "state",
]);

export const resolveStartupStageMessageId = (
  nativeBackendStage: string | null | undefined,
): StartupStageMessageId => {
  const stage = String(nativeBackendStage ?? "").trim();
  if (!stage) {
    return "appText.startupStarting";
  }
  if (STARTUP_LOCAL_ENGINE_STAGES.has(stage)) {
    return "appText.startupStartingLocalEngine";
  }
  switch (stage) {
    case "dataUpgrade:core-schema":
      return "appText.startupPreparingLocalData";
    case "dataUpgrade:market-probing":
    case "dataUpgrade:market-validating":
      return "appText.startupCheckingMarketData";
    case "dataUpgrade:market-copying":
    case "dataUpgrade:market-switching":
      return "appText.startupUpdatingMarketData";
    case "dataUpgrade:reset-recovery":
      return "appText.startupRecoveringLocalData";
    case "dataUpgrade:seed-reconcile":
      return "appText.startupSyncingBuiltInData";
    case "dataUpgrade:runtime-bootstrap":
      return "appText.startupPreparingWorkspace";
    default:
      return "appText.startupStarting";
  }
};
