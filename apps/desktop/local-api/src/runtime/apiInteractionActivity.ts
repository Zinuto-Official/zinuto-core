// SPDX-License-Identifier: GPL-3.0-only

type ApiInteractionActivityTrackerOptions = {
  quietWindowMs: number;
  now?: () => number;
};

export type ApiInteractionActivityTracker = {
  beginRequest: () => () => void;
  isIdle: () => boolean;
};

export const createApiInteractionActivityTracker = ({
  quietWindowMs,
  now = Date.now,
}: ApiInteractionActivityTrackerOptions): ApiInteractionActivityTracker => {
  const normalizedQuietWindowMs = Math.max(
    0,
    Math.floor(Number(quietWindowMs) || 0),
  );
  let activeRequestCount = 0;
  let lastRequestCompletedAtMs = now();

  const beginRequest = (): (() => void) => {
    activeRequestCount += 1;
    let completed = false;
    return () => {
      if (completed) {
        return;
      }
      completed = true;
      activeRequestCount = Math.max(0, activeRequestCount - 1);
      lastRequestCompletedAtMs = now();
    };
  };

  const isIdle = (): boolean =>
    activeRequestCount === 0 &&
    now() - lastRequestCompletedAtMs >= normalizedQuietWindowMs;

  return {
    beginRequest,
    isIdle,
  };
};
