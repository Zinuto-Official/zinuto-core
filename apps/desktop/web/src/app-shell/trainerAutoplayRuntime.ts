// SPDX-License-Identifier: GPL-3.0-only

// Resolves the paused flag of a resumed session. Returns null when the field
// is absent or unrecognized: the session is treated as running (never show a
// paused state), but autoplay must not start without an explicit signal.
export const resolveTrainerAutoplayFromSessionPaused = (
  isPaused: unknown,
): boolean | null => {
  if (isPaused === null || isPaused === undefined) {
    return null;
  }
  if (typeof isPaused === "boolean") {
    return isPaused;
  }
  if (typeof isPaused === "number") {
    if (isPaused === 0) {
      return false;
    }
    if (isPaused === 1) {
      return true;
    }
    return null;
  }
  if (typeof isPaused === "string") {
    const trimmed = isPaused.trim();
    if (trimmed === "true" || trimmed === "1") {
      return true;
    }
    if (trimmed === "false" || trimmed === "0") {
      return false;
    }
    return null;
  }
  return null;
};

export const resolveTrainerAutoplaySurfaceRunning = ({
  hasSession,
  isSurfaceActive,
  userAutoplayIntent,
}: {
  hasSession: boolean;
  isSurfaceActive: boolean;
  userAutoplayIntent: boolean;
}): boolean => Boolean(hasSession && isSurfaceActive && userAutoplayIntent);

type TrainerAutoplayTimerHandle = ReturnType<typeof globalThis.setTimeout>;

export type TrainerAutoplayStepResult = {
  shouldContinue: boolean;
};

export type TrainerAutoplaySchedulerRuntime = {
  setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => TrainerAutoplayTimerHandle;
  clearTimeout: (handle: TrainerAutoplayTimerHandle) => void;
};

type CreateTrainerAutoplaySchedulerArgs = {
  getShouldRun: () => boolean;
  getDelayMs: () => number;
  step: () => Promise<TrainerAutoplayStepResult>;
  runtime?: TrainerAutoplaySchedulerRuntime;
  onStepError?: (error: unknown) => void;
};

const defaultTrainerAutoplaySchedulerRuntime: TrainerAutoplaySchedulerRuntime = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

export const createTrainerAutoplayScheduler = ({
  getShouldRun,
  getDelayMs,
  step,
  runtime = defaultTrainerAutoplaySchedulerRuntime,
  onStepError,
}: CreateTrainerAutoplaySchedulerArgs) => {
  let isRunning = false;
  let isStepInFlight = false;
  let timerHandle: TrainerAutoplayTimerHandle | null = null;
  let runVersion = 0;

  const clearTimer = () => {
    if (timerHandle !== null) {
      runtime.clearTimeout(timerHandle);
      timerHandle = null;
    }
  };

  const stop = () => {
    isRunning = false;
    runVersion += 1;
    clearTimer();
  };

  function schedule(delayMs: number) {
    if (!isRunning) {
      return;
    }
    clearTimer();
    const version = runVersion;
    timerHandle = runtime.setTimeout(() => {
      timerHandle = null;
      void runTick(version);
    }, Math.max(0, Math.floor(Number(delayMs) || 0)));
  }

  async function runTick(version: number) {
    if (!isRunning || version !== runVersion) {
      return;
    }
    if (!getShouldRun()) {
      stop();
      return;
    }
    if (isStepInFlight) {
      schedule(getDelayMs());
      return;
    }

    isStepInFlight = true;
    try {
      const result = await step();
      isStepInFlight = false;
      if (!isRunning || version !== runVersion) {
        return;
      }
      if (!result.shouldContinue || !getShouldRun()) {
        stop();
        return;
      }
      schedule(getDelayMs());
    } catch (error) {
      isStepInFlight = false;
      onStepError?.(error);
      stop();
    }
  }

  return {
    isRunning: () => isRunning,
    start: () => {
      if (isRunning) {
        if (!isStepInFlight) {
          schedule(0);
        }
        return;
      }
      isRunning = true;
      runVersion += 1;
      schedule(0);
    },
    stop,
    reschedule: () => {
      if (!isRunning || isStepInFlight) {
        return;
      }
      schedule(getDelayMs());
    },
  };
};
