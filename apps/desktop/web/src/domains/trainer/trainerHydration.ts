// SPDX-License-Identifier: GPL-3.0-only

import type { SessionSnapshot } from "@/domains/training/types";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";

export type TrainerHydrationState =
  | "IDLE"
  | "LAUNCHING"
  | "HYDRATING"
  | "READY"
  | "FAILED";

export type TrainerResidentTrimPreference = "HEAD" | "TAIL";

export const TRAINER_LAUNCH_BACKWARD_BARS = 600;
export const TRAINER_LAUNCH_FORWARD_BARS = 80;
export const TRAINER_BACKGROUND_FETCH_MAX_BARS = 800;
export const TRAINER_RESIDENT_BARS_MAX = 3000;
export const TRAINER_FORWARD_PREFETCH_TRIGGER_BARS = 20;
export const TRAINER_RESIDENT_PROTECTED_HISTORY_BARS = 32;
export const TRAINER_RESIDENT_PROTECTED_FUTURE_BARS = 240;
export const TRAINER_BACKWARD_FETCH_TRIGGER_VISIBLE_BARS = 18;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeInteger = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
};

export const isTrainerHydrationPending = (
  state: TrainerHydrationState,
): boolean => state === "LAUNCHING" || state === "HYDRATING";

export const resolveTrainerHydrationBarsWindow = ({
  cursorIndex,
  total,
  backwardBars = TRAINER_LAUNCH_BACKWARD_BARS,
  forwardBars = TRAINER_LAUNCH_FORWARD_BARS,
}: {
  cursorIndex: number;
  total?: number;
  backwardBars?: number;
  forwardBars?: number;
}): {
  requestOffset: number;
  requestLimit: number;
} => {
  const normalizedTotal = Math.max(0, normalizeInteger(total, 0));
  const maxIndex =
    normalizedTotal > 0 ? Math.max(0, normalizedTotal - 1) : Number.MAX_SAFE_INTEGER;
  const normalizedCursorIndex = clamp(normalizeInteger(cursorIndex, 0), 0, maxIndex);
  const requestOffset = Math.max(
    0,
    normalizedCursorIndex - Math.max(0, normalizeInteger(backwardBars, 0)),
  );
  const requestedLimit =
    Math.max(0, normalizeInteger(backwardBars, 0)) +
    Math.max(0, normalizeInteger(forwardBars, 0)) +
    1;
  const requestLimit =
    normalizedTotal > 0
      ? Math.max(1, Math.min(requestedLimit, normalizedTotal - requestOffset))
      : Math.max(1, requestedLimit);
  return {
    requestOffset,
    requestLimit,
  };
};

export const resolveTrainerResidentProtectionWindow = ({
  snapshot,
  bars,
  historyBuffer = TRAINER_RESIDENT_PROTECTED_HISTORY_BARS,
  futureBuffer = TRAINER_RESIDENT_PROTECTED_FUTURE_BARS,
}: {
  snapshot: Pick<SessionSnapshot, "session"> | null;
  bars: ReplayBar[];
  historyBuffer?: number;
  futureBuffer?: number;
}): {
  protectedStartIndex: number;
  protectedEndIndex: number;
} => {
  const maxIndex = Math.max(0, bars.length - 1);
  if (!snapshot || maxIndex <= 0) {
    return {
      protectedStartIndex: 0,
      protectedEndIndex: maxIndex,
    };
  }

  const resolveLocalIndexForRawIndex = (rawIndex: number): number => {
    const normalizedRawIndex = Math.max(0, normalizeInteger(rawIndex, 0));
    let nearestPastIndex = -1;
    for (let index = 0; index < bars.length; index += 1) {
      const bar = bars[index];
      const startRawIndex = Number.isFinite(Number(bar?.startRawIndex))
        ? Math.max(0, normalizeInteger(bar?.startRawIndex, 0))
        : index;
      const endRawIndex = Number.isFinite(Number(bar?.endRawIndex))
        ? Math.max(startRawIndex, normalizeInteger(bar?.endRawIndex, startRawIndex))
        : startRawIndex;
      if (
        normalizedRawIndex >= startRawIndex &&
        normalizedRawIndex <= endRawIndex
      ) {
        return index;
      }
      if (endRawIndex <= normalizedRawIndex) {
        nearestPastIndex = index;
      }
    }
    return clamp(nearestPastIndex >= 0 ? nearestPastIndex : 0, 0, maxIndex);
  };

  const startIndex = resolveLocalIndexForRawIndex(snapshot.session.start_index);
  const cursorIndex = resolveLocalIndexForRawIndex(snapshot.session.cursor_index);
  const leftEdge = Math.min(startIndex, cursorIndex);
  const rightEdge = Math.max(startIndex, cursorIndex);

  return {
    protectedStartIndex: Math.max(
      0,
      leftEdge - Math.max(0, normalizeInteger(historyBuffer, 0)),
    ),
    protectedEndIndex: Math.min(
      maxIndex,
      rightEdge + Math.max(0, normalizeInteger(futureBuffer, 0)),
    ),
  };
};

export const fitTrainerResidentBarsWindow = ({
  bars,
  offset,
  total,
  protectedStartIndex,
  protectedEndIndex,
  preferredTrimSide,
  maxBars = TRAINER_RESIDENT_BARS_MAX,
}: {
  bars: ReplayBar[];
  offset: number;
  total: number;
  protectedStartIndex: number;
  protectedEndIndex: number;
  preferredTrimSide: TrainerResidentTrimPreference;
  maxBars?: number;
}): {
  bars: ReplayBar[];
  offset: number;
  total: number;
  trimmedHeadCount: number;
  trimmedTailCount: number;
} => {
  const normalizedMaxBars = Math.max(1, normalizeInteger(maxBars, 1));
  if (bars.length <= normalizedMaxBars) {
    return {
      bars,
      offset: Math.max(0, normalizeInteger(offset, 0)),
      total: Math.max(0, normalizeInteger(total, 0)),
      trimmedHeadCount: 0,
      trimmedTailCount: 0,
    };
  }

  const maxIndex = Math.max(0, bars.length - 1);
  const protectedStart = clamp(
    normalizeInteger(protectedStartIndex, 0),
    0,
    maxIndex,
  );
  const protectedEnd = clamp(
    normalizeInteger(protectedEndIndex, maxIndex),
    protectedStart,
    maxIndex,
  );

  let remainingOverflow = bars.length - normalizedMaxBars;
  let trimmedHeadCount = 0;
  let trimmedTailCount = 0;

  const consumeHead = () => {
    if (remainingOverflow <= 0) {
      return;
    }
    const maxHeadTrim = Math.max(0, protectedStart - trimmedHeadCount);
    const nextTrim = Math.min(remainingOverflow, maxHeadTrim);
    trimmedHeadCount += nextTrim;
    remainingOverflow -= nextTrim;
  };

  const consumeTail = () => {
    if (remainingOverflow <= 0) {
      return;
    }
    const currentLength = bars.length - trimmedHeadCount - trimmedTailCount;
    const currentProtectedEnd = Math.max(
      0,
      Math.min(currentLength - 1, protectedEnd - trimmedHeadCount),
    );
    const maxTailTrim = Math.max(0, currentLength - currentProtectedEnd - 1);
    const nextTrim = Math.min(remainingOverflow, maxTailTrim);
    trimmedTailCount += nextTrim;
    remainingOverflow -= nextTrim;
  };

  if (preferredTrimSide === "HEAD") {
    consumeHead();
    consumeTail();
  } else {
    consumeTail();
    consumeHead();
  }

  if (remainingOverflow > 0) {
    if (preferredTrimSide === "HEAD") {
      trimmedHeadCount += remainingOverflow;
    } else {
      trimmedTailCount += remainingOverflow;
    }
    remainingOverflow = 0;
  }

  const nextBars = bars.slice(
    trimmedHeadCount,
    Math.max(trimmedHeadCount, bars.length - trimmedTailCount),
  );

  return {
    bars: nextBars,
    offset: Math.max(0, normalizeInteger(offset, 0) + trimmedHeadCount),
    total: Math.max(0, normalizeInteger(total, 0)),
    trimmedHeadCount,
    trimmedTailCount,
  };
};
