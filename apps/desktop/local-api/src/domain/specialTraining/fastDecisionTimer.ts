// SPDX-License-Identifier: GPL-3.0-only

export type SpecialTrainingFastDecisionTimerRuntime = {
  startedAtMs: number;
  elapsedActiveMs: number;
  runningSinceMs: number | null;
};

const normalizeNowMs = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export const createSpecialTrainingFastDecisionTimer = (
  nowMs: number,
  paused: boolean,
): SpecialTrainingFastDecisionTimerRuntime => {
  const normalizedNowMs = normalizeNowMs(nowMs);
  return {
    startedAtMs: normalizedNowMs,
    elapsedActiveMs: 0,
    runningSinceMs: paused ? null : normalizedNowMs,
  };
};

export const pauseSpecialTrainingFastDecisionTimer = (
  timer: SpecialTrainingFastDecisionTimerRuntime,
  nowMs: number,
): void => {
  if (timer.runningSinceMs === null) {
    return;
  }
  const normalizedNowMs = Math.max(
    timer.runningSinceMs,
    normalizeNowMs(nowMs),
  );
  timer.elapsedActiveMs += normalizedNowMs - timer.runningSinceMs;
  timer.runningSinceMs = null;
};

export const resumeSpecialTrainingFastDecisionTimer = (
  timer: SpecialTrainingFastDecisionTimerRuntime,
  nowMs: number,
): void => {
  if (timer.runningSinceMs !== null) {
    return;
  }
  timer.runningSinceMs = normalizeNowMs(nowMs);
};

export const readSpecialTrainingFastDecisionTimer = (
  timer: SpecialTrainingFastDecisionTimerRuntime,
  nowMs: number,
  secondsLimit: number,
): {
  elapsedSeconds: number;
  remainingSeconds: number;
  deadlineAtMs: number | null;
} => {
  const normalizedLimitSeconds = Math.max(0, Math.floor(secondsLimit));
  const normalizedNowMs = normalizeNowMs(nowMs);
  const runningElapsedMs =
    timer.runningSinceMs === null
      ? 0
      : Math.max(0, normalizedNowMs - timer.runningSinceMs);
  const elapsedActiveMs = Math.max(
    0,
    timer.elapsedActiveMs + runningElapsedMs,
  );
  const remainingActiveMs = Math.max(
    0,
    normalizedLimitSeconds * 1000 - elapsedActiveMs,
  );
  const elapsedSeconds = Math.min(
    normalizedLimitSeconds,
    Math.max(0, Math.floor(elapsedActiveMs / 1000)),
  );
  const remainingSeconds = Math.max(
    0,
    normalizedLimitSeconds - elapsedSeconds,
  );
  return {
    elapsedSeconds,
    remainingSeconds,
    deadlineAtMs:
      timer.runningSinceMs === null
        ? null
        : normalizedNowMs + remainingActiveMs,
  };
};
