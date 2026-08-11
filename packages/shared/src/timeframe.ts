// SPDX-License-Identifier: GPL-3.0-only

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type BaseTimeframe = "1m" | "5m" | "1h" | "1d";

export const TIMEFRAME_MINUTES: Record<BaseTimeframe, number> = {
  "1m": 1,
  "5m": 5,
  "1h": 60,
  "1d": 60 * 24,
};

export const normalizeBaseTimeframe = (
  value: unknown,
): BaseTimeframe | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "1m" ||
    normalized === "5m" ||
    normalized === "1h" ||
    normalized === "1d"
  ) {
    return normalized;
  }
  return null;
};

export const compareBaseTimeframe = (
  left: BaseTimeframe,
  right: BaseTimeframe,
): number => TIMEFRAME_MINUTES[left] - TIMEFRAME_MINUTES[right];

export const resolveEffectiveBaseTimeframe = (
  sourceTimeframe: BaseTimeframe,
  minimumBaseTimeframe: BaseTimeframe,
): BaseTimeframe =>
  compareBaseTimeframe(sourceTimeframe, minimumBaseTimeframe) >= 0
    ? sourceTimeframe
    : minimumBaseTimeframe;

export const detectBaseTimeframeFromTimestamps = (
  timestamps: number[],
): BaseTimeframe | null => {
  if (!Array.isArray(timestamps) || timestamps.length < 3) {
    return null;
  }

  const ordered = Array.from(new Set(timestamps.filter((item) => Number.isFinite(item)))).sort((a, b) => a - b);
  if (ordered.length < 3) {
    return null;
  }

  const diffs = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const diff = ordered[index] - ordered[index - 1];
    if (diff > 0) {
      diffs.push(diff);
    }
  }
  if (!diffs.length) {
    return null;
  }

  // A single coincidental gap must not classify an otherwise unrelated series.
  // Short samples still need one matching interval so small valid files remain
  // importable, while larger samples require a majority of their intervals to
  // support the same cadence.
  const minimumHits =
    diffs.length <= 2 ? 1 : Math.ceil(diffs.length / 2);

  const candidates = [
    { timeframe: "1m" as const, expectedMs: MINUTE_MS, toleranceMs: 15 * 1000 },
    { timeframe: "5m" as const, expectedMs: 5 * MINUTE_MS, toleranceMs: 60 * 1000 },
    { timeframe: "1h" as const, expectedMs: HOUR_MS, toleranceMs: 5 * MINUTE_MS },
    { timeframe: "1d" as const, expectedMs: DAY_MS, toleranceMs: 8 * HOUR_MS },
  ];
  let best:
    | {
        timeframe: BaseTimeframe;
        hits: number;
        nearestDeltaMs: number;
      }
    | null = null;

  for (const candidate of candidates) {
    const hits = diffs.filter((diff) => Math.abs(diff - candidate.expectedMs) <= candidate.toleranceMs);
    if (hits.length < minimumHits) {
      continue;
    }

    const nearestDeltaMs = hits.reduce(
      (minDelta, diff) => Math.min(minDelta, Math.abs(diff - candidate.expectedMs)),
      Number.POSITIVE_INFINITY
    );
    const current = {
      timeframe: candidate.timeframe,
      hits: hits.length,
      nearestDeltaMs
    };
    if (
      !best ||
      current.hits > best.hits ||
      (current.hits === best.hits && current.nearestDeltaMs < best.nearestDeltaMs)
    ) {
      best = current;
    }
  }

  return best?.timeframe ?? null;
};
