// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey, FreeReplayAdvancePeriod } from "@/domains/training/types";

export const START_POINT_DISPLAY_PERIODS = [
  "1m",
  "5m",
  "1h",
  "1d",
  "1w",
  "1month",
  "1year",
] as const satisfies readonly DisplayPeriodKey[];

const PERIOD_RANK = new Map<DisplayPeriodKey, number>(
  START_POINT_DISPLAY_PERIODS.map((period, index) => [period, index]),
);

export const compareStartPointDisplayPeriods = (
  left: DisplayPeriodKey,
  right: DisplayPeriodKey,
): number => (PERIOD_RANK.get(left) ?? 0) - (PERIOD_RANK.get(right) ?? 0);

export const resolveStartPointDisplayPeriodCandidates = (
  effectiveTimeframe: FreeReplayAdvancePeriod,
): DisplayPeriodKey[] => {
  const startIndex = Math.max(0, PERIOD_RANK.get(effectiveTimeframe) ?? 0);
  return START_POINT_DISPLAY_PERIODS.slice(startIndex);
};

export const chooseCompleteStartPointDisplayPeriod = (
  effectiveTimeframe: FreeReplayAdvancePeriod,
  totalsByPeriod: ReadonlyMap<DisplayPeriodKey, number>,
  limit: number,
): DisplayPeriodKey => {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
  for (const period of resolveStartPointDisplayPeriodCandidates(effectiveTimeframe)) {
    const total = Math.max(0, Math.floor(Number(totalsByPeriod.get(period)) || 0));
    if (total <= safeLimit) {
      return period;
    }
  }
  return "1year";
};

export const isStartPointDisplayPeriodCoarser = (
  displayPeriod: DisplayPeriodKey,
  effectiveTimeframe: FreeReplayAdvancePeriod,
): boolean => compareStartPointDisplayPeriods(displayPeriod, effectiveTimeframe) > 0;

export const resolveNextStartPointDrillDisplayPeriod = (
  currentDisplayPeriod: DisplayPeriodKey,
  effectiveTimeframe: FreeReplayAdvancePeriod,
): DisplayPeriodKey => {
  const currentRank = PERIOD_RANK.get(currentDisplayPeriod) ?? 0;
  const effectiveRank = PERIOD_RANK.get(effectiveTimeframe) ?? currentRank;
  if (currentRank <= effectiveRank) {
    return effectiveTimeframe;
  }
  return START_POINT_DISPLAY_PERIODS[
    Math.max(effectiveRank, currentRank - 1)
  ] as DisplayPeriodKey;
};

export const buildStartPointApplySelection = (bar: {
  applyAnchorIndex: number;
  endTrainingIndex: number;
  ts?: string | null;
}): {
  overviewIndex: number;
  rawAnchorIndex: number;
  anchorTs: string | null;
} => ({
  overviewIndex: Math.max(0, Math.floor(Number(bar.endTrainingIndex) || 0)),
  rawAnchorIndex: Math.max(0, Math.floor(Number(bar.applyAnchorIndex) || 0)),
  anchorTs: bar.ts ?? null,
});

type StartPointAnchorBarLike = {
  startRawIndex: number;
  endRawIndex: number;
  startTrainingIndex: number;
  endTrainingIndex: number;
  ts?: string | null;
  startTs?: string | null;
  endTs?: string | null;
};

const normalizeAnchorIndex = (value: number | null | undefined): number | null =>
  Number.isFinite(value)
    ? Math.max(0, Math.floor(Number(value) || 0))
    : null;

const normalizeTrainingTotal = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

export const isReplayableStartPointOverviewBar = (
  bar: { endTrainingIndex: number } | null | undefined,
  trainingTotal: unknown,
): boolean => {
  const normalizedTotal = normalizeTrainingTotal(trainingTotal);
  if (!bar || normalizedTotal < 2) {
    return false;
  }
  const endTrainingIndex = Math.max(
    0,
    Math.floor(Number(bar.endTrainingIndex) || 0),
  );
  return endTrainingIndex < normalizedTotal - 1;
};

const parseAnchorTimestampMs = (value: string | null | undefined): number | null => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveByInclusiveRange = <TBar>(
  bars: readonly TBar[],
  targetIndex: number,
  readStart: (bar: TBar) => number,
  readEnd: (bar: TBar) => number,
): TBar | null => {
  if (!bars.length) {
    return null;
  }
  const first = bars[0];
  const last = bars[bars.length - 1];
  const clampedTarget = Math.min(
    Math.max(targetIndex, Math.floor(Number(readStart(first)) || 0)),
    Math.floor(Number(readEnd(last)) || 0),
  );
  let left = 0;
  let right = bars.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    const candidate = bars[mid];
    const start = Math.floor(Number(readStart(candidate)) || 0);
    const end = Math.floor(Number(readEnd(candidate)) || start);
    if (start <= clampedTarget && end >= clampedTarget) {
      return candidate;
    }
    if (end < clampedTarget) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  if (left <= 0) {
    return bars[0] ?? null;
  }
  if (left >= bars.length) {
    return bars[bars.length - 1] ?? null;
  }
  const lower = bars[left - 1];
  const upper = bars[left];
  return Math.abs(Math.floor(Number(readEnd(lower)) || 0) - clampedTarget) <=
    Math.abs(Math.floor(Number(readStart(upper)) || 0) - clampedTarget)
    ? lower
    : upper;
};

export const resolveReplayableStartPointOverviewBarByTrainingIndex = <
  TBar extends { startTrainingIndex: number; endTrainingIndex: number },
>(
  bars: readonly TBar[],
  trainingIndex: unknown,
  trainingTotal: unknown,
): TBar | null => {
  const replayableBars = bars.filter((bar) =>
    isReplayableStartPointOverviewBar(bar, trainingTotal),
  );
  if (!replayableBars.length) {
    return null;
  }
  const target = Math.max(0, Math.floor(Number(trainingIndex) || 0));
  return resolveByInclusiveRange(
    replayableBars,
    target,
    (bar) => bar.startTrainingIndex,
    (bar) => bar.endTrainingIndex,
  );
};

export const resolveStartPointOverviewBarByAnchor = <
  TBar extends StartPointAnchorBarLike,
>(
  bars: readonly TBar[],
  anchor: {
    rawAnchorIndex?: number | null;
    anchorTs?: string | null;
    trainingIndex?: number | null;
  },
): TBar | null => {
  if (!bars.length) {
    return null;
  }
  const rawAnchorIndex = normalizeAnchorIndex(anchor.rawAnchorIndex);
  if (rawAnchorIndex !== null) {
    return resolveByInclusiveRange(
      bars,
      rawAnchorIndex,
      (bar) => bar.startRawIndex,
      (bar) => bar.endRawIndex,
    );
  }

  const anchorTsMs = parseAnchorTimestampMs(anchor.anchorTs);
  if (anchorTsMs !== null) {
    const matchedByTime =
      bars.find((bar) => {
        const startMs =
          parseAnchorTimestampMs(bar.startTs) ??
          parseAnchorTimestampMs(bar.ts);
        const endMs =
          parseAnchorTimestampMs(bar.endTs) ??
          parseAnchorTimestampMs(bar.ts) ??
          startMs;
        return (
          startMs !== null &&
          endMs !== null &&
          startMs <= anchorTsMs &&
          endMs >= anchorTsMs
        );
      }) ?? null;
    if (matchedByTime) {
      return matchedByTime;
    }
  }

  const trainingIndex = normalizeAnchorIndex(anchor.trainingIndex);
  if (trainingIndex !== null) {
    return resolveByInclusiveRange(
      bars,
      trainingIndex,
      (bar) => bar.startTrainingIndex,
      (bar) => bar.endTrainingIndex,
    );
  }

  return null;
};
