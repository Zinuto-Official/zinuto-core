// SPDX-License-Identifier: GPL-3.0-only

import type { MarketBarFrame } from "@/domains/training/types";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import { DESKTOP_API_LIMITS } from "@zinuto/shared/input-limits";

type ReplayBarFrameIndexLike = {
  displayIndex?: unknown;
  startRawIndex?: unknown;
  endRawIndex?: unknown;
};

export type MarketFrameReplayRange = {
  symbol: string;
  timeframe: string;
  timeZone: string | null;
  offset: number;
  total: number;
  limit: number;
  versionToken: string;
  bars: ReplayBar[];
};

const normalizeNonNegativeInteger = (
  value: unknown,
  fallback = 0,
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.floor(parsed))
    : Math.max(0, Math.floor(fallback));
};

const resolveFrameArrayLength = (frame: MarketBarFrame): number => {
  const lengths = [
    frame.timestampMs.length,
    frame.open.length,
    frame.high.length,
    frame.low.length,
    frame.close.length,
    frame.volume.length,
    frame.displayIndex.length,
    frame.startRawIndex.length,
    frame.endRawIndex.length,
  ];
  const [firstLength = 0] = lengths;
  if (lengths.some((length) => length !== firstLength)) {
    throw new Error("MARKET_FRAME_COLUMN_LENGTH_MISMATCH");
  }
  if (firstLength > DESKTOP_API_LIMITS.marketFrameBarsMax) {
    throw new Error("MARKET_FRAME_WINDOW_TOO_LARGE");
  }
  return firstLength;
};

const resolveReplayBarRawRange = (
  bar: ReplayBarFrameIndexLike | null | undefined,
  fallbackIndex: number,
): { start: number; end: number } => {
  const fallback = normalizeNonNegativeInteger(fallbackIndex);
  const start = Number.isFinite(Number(bar?.startRawIndex))
    ? normalizeNonNegativeInteger(bar?.startRawIndex)
    : fallback;
  const end = Number.isFinite(Number(bar?.endRawIndex))
    ? Math.max(start, normalizeNonNegativeInteger(bar?.endRawIndex, start))
    : start;
  return { start, end };
};

export const resolveReplayBarLocalIndexForRawIndex = <
  TBar extends ReplayBarFrameIndexLike,
>(
  bars: readonly TBar[],
  rawIndex: unknown,
): number => {
  if (!bars.length) {
    return -1;
  }
  const normalizedRawIndex = normalizeNonNegativeInteger(rawIndex);
  let low = 0;
  let high = bars.length - 1;
  let nearestPastIndex = 0;
  while (low <= high) {
    const index = Math.floor((low + high) / 2);
    const { start, end } = resolveReplayBarRawRange(bars[index], index);
    if (normalizedRawIndex < start) {
      high = index - 1;
      continue;
    }
    nearestPastIndex = index;
    if (normalizedRawIndex <= end) {
      return index;
    }
    low = index + 1;
  }
  return Math.max(0, Math.min(nearestPastIndex, bars.length - 1));
};

export const resolveReplayBarDisplayIndex = (
  bar: ReplayBarFrameIndexLike | null | undefined,
  localIndex: unknown,
  offset: unknown = 0,
): number => {
  if (Number.isFinite(Number(bar?.displayIndex))) {
    return normalizeNonNegativeInteger(bar?.displayIndex);
  }
  return (
    normalizeNonNegativeInteger(offset) +
    normalizeNonNegativeInteger(localIndex)
  );
};

export const materializeReplayBarsFromFrame = (
  frame: MarketBarFrame,
): ReplayBar[] => {
  const length = resolveFrameArrayLength(frame);
  const bars = new Array<ReplayBar>(length);
  for (let i = 0; i < length; i += 1) {
    bars[i] = {
      ts: new Date(Math.floor(Number(frame.timestampMs[i]) || 0)).toISOString(),
      open: Number(frame.open[i]),
      high: Number(frame.high[i]),
      low: Number(frame.low[i]),
	      close: Number(frame.close[i]),
	      volume: Number(frame.volume[i]),
	      displayPeriod: frame.displayPeriod,
	      displayIndex: Math.max(0, Math.floor(Number(frame.displayIndex[i]) || 0)),
	      startRawIndex: Math.max(0, Math.floor(Number(frame.startRawIndex[i]) || 0)),
      endRawIndex: Math.max(0, Math.floor(Number(frame.endRawIndex[i]) || 0)),
    };
  }
  return bars;
};

export const frameToReplayRange = (
  frame: MarketBarFrame,
): MarketFrameReplayRange => ({
  symbol: frame.symbol,
  timeframe: frame.timeframe,
  timeZone:
    typeof frame.timeZone === "string" && frame.timeZone.trim()
      ? frame.timeZone
      : null,
	  offset: Math.max(0, Math.floor(Number(frame.displayStartIndex) || 0)),
	  total: Math.max(0, Math.floor(Number(frame.totalDisplay) || 0)),
  limit: Math.max(1, Math.floor(Number(frame.limit) || 1)),
  versionToken: String(frame.versionToken || "").trim(),
  bars: materializeReplayBarsFromFrame(frame),
});
