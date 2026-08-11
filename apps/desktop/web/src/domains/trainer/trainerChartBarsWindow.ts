// SPDX-License-Identifier: GPL-3.0-only

import type { SessionSnapshot } from "@/domains/training/types";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import {
  fitTrainerResidentBarsWindow,
  resolveTrainerResidentProtectionWindow,
  type TrainerResidentTrimPreference,
} from "@/domains/trainer/trainerHydration";

export type TrainerChartBarsWindow = {
  offset: number;
  total: number;
  bars: ReplayBar[];
  timeZone?: string | null;
};

type TrainerChartBarsMergeDirection = "backward" | "forward";

const normalizeNonNegativeInteger = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(0, Math.floor(numeric))
    : Math.max(0, Math.floor(fallback));
};

const resolveReplayBarKey = (
  bar: ReplayBar,
  fallbackIndex: number,
): string => {
  if (Number.isFinite(Number(bar.displayIndex))) {
    return `display:${normalizeNonNegativeInteger(bar.displayIndex)}`;
  }
  if (
    Number.isFinite(Number(bar.startRawIndex)) ||
    Number.isFinite(Number(bar.endRawIndex))
  ) {
    return `raw:${normalizeNonNegativeInteger(bar.startRawIndex)}:${normalizeNonNegativeInteger(
      bar.endRawIndex,
    )}`;
  }
  return `fallback:${bar.ts}:${fallbackIndex}`;
};

const resolveReplayBarSortIndex = (
  bar: ReplayBar,
  fallbackIndex: number,
): number => {
  if (Number.isFinite(Number(bar.displayIndex))) {
    return normalizeNonNegativeInteger(bar.displayIndex);
  }
  if (Number.isFinite(Number(bar.startRawIndex))) {
    return normalizeNonNegativeInteger(bar.startRawIndex);
  }
  return fallbackIndex;
};

const resolveWindowEndOffset = (window: TrainerChartBarsWindow): number =>
  normalizeNonNegativeInteger(window.offset) + window.bars.length;

const resolveMergeDirection = (
  currentWindow: TrainerChartBarsWindow,
  incomingWindow: TrainerChartBarsWindow,
): TrainerChartBarsMergeDirection => {
  const currentOffset = normalizeNonNegativeInteger(currentWindow.offset);
  const incomingOffset = normalizeNonNegativeInteger(incomingWindow.offset);
  if (incomingOffset < currentOffset) {
    return "backward";
  }
  if (resolveWindowEndOffset(incomingWindow) < resolveWindowEndOffset(currentWindow)) {
    return "backward";
  }
  return "forward";
};

const mergeReplayBars = (
  currentBars: ReplayBar[],
  incomingBars: ReplayBar[],
): ReplayBar[] => {
  const byKey = new Map<string, ReplayBar>();
  [...currentBars, ...incomingBars].forEach((bar, index) => {
    byKey.set(resolveReplayBarKey(bar, index), bar);
  });
  return Array.from(byKey.values()).sort(
    (left, right) =>
      resolveReplayBarSortIndex(left, 0) -
      resolveReplayBarSortIndex(right, 0),
  );
};

export const mergeTrainerChartBarsWindow = ({
  currentWindow,
  incomingWindow,
  snapshot,
  maxBars,
}: {
  currentWindow: TrainerChartBarsWindow;
  incomingWindow: TrainerChartBarsWindow;
  snapshot: Pick<SessionSnapshot, "session"> | null;
  maxBars?: number;
}): TrainerChartBarsWindow => {
  if (!currentWindow.bars.length) {
    return incomingWindow;
  }
  if (!incomingWindow.bars.length) {
    return currentWindow;
  }

  const direction = resolveMergeDirection(currentWindow, incomingWindow);
  const mergedBars = mergeReplayBars(currentWindow.bars, incomingWindow.bars);
  const nextOffset = Math.min(
    normalizeNonNegativeInteger(currentWindow.offset),
    normalizeNonNegativeInteger(incomingWindow.offset),
  );
  const nextTotal = Math.max(
    normalizeNonNegativeInteger(currentWindow.total),
    normalizeNonNegativeInteger(incomingWindow.total),
    nextOffset + mergedBars.length,
  );
  const protectionWindow = resolveTrainerResidentProtectionWindow({
    snapshot,
    bars: mergedBars,
  });
  const preferredTrimSide: TrainerResidentTrimPreference =
    direction === "backward" ? "TAIL" : "HEAD";
  const fitted = fitTrainerResidentBarsWindow({
    bars: mergedBars,
    offset: nextOffset,
    total: nextTotal,
    protectedStartIndex: protectionWindow.protectedStartIndex,
    protectedEndIndex: protectionWindow.protectedEndIndex,
    preferredTrimSide,
    maxBars,
  });

  return {
    offset: fitted.offset,
    total: fitted.total,
    bars: fitted.bars,
    timeZone: incomingWindow.timeZone ?? currentWindow.timeZone ?? null,
  };
};
