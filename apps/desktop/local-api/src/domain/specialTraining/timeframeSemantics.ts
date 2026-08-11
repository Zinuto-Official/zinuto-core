// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";

export type SpecialTrainingBaseTimeframe = BaseTimeframe;

const TIMEFRAME_MINUTES: Record<SpecialTrainingBaseTimeframe, number> = {
  "1m": 1,
  "5m": 5,
  "1h": 60,
  "1d": 60 * 24,
};

export const normalizeSpecialTrainingBaseTimeframe = (
  value: unknown,
): SpecialTrainingBaseTimeframe | null => {
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

export const compareSpecialTrainingBaseTimeframe = (
  left: SpecialTrainingBaseTimeframe,
  right: SpecialTrainingBaseTimeframe,
): number => TIMEFRAME_MINUTES[left] - TIMEFRAME_MINUTES[right];

export const resolveEffectiveTrainingTimeframe = (
  sourceTimeframe: SpecialTrainingBaseTimeframe,
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe,
): SpecialTrainingBaseTimeframe =>
  compareSpecialTrainingBaseTimeframe(sourceTimeframe, minimumBaseTimeframe) >= 0
    ? sourceTimeframe
    : minimumBaseTimeframe;

export const resolveSourceBarsPerEffectiveBar = (
  sourceTimeframe: SpecialTrainingBaseTimeframe,
  effectiveTimeframe: SpecialTrainingBaseTimeframe,
): number => {
  const sourceMinutes = TIMEFRAME_MINUTES[sourceTimeframe];
  const effectiveMinutes = TIMEFRAME_MINUTES[effectiveTimeframe];
  if (!Number.isFinite(sourceMinutes) || !Number.isFinite(effectiveMinutes)) {
    return 1;
  }
  if (effectiveMinutes <= sourceMinutes) {
    return 1;
  }
  return Math.max(1, Math.floor(effectiveMinutes / sourceMinutes));
};

export const convertEffectiveBarsToSourceBars = (
  count: number,
  sourceBarsPerEffectiveBar: number,
): number =>
  Math.max(
    0,
    Math.floor(Number(count) || 0) *
      Math.max(1, Math.floor(Number(sourceBarsPerEffectiveBar) || 1)),
  );

export const convertSourceBarsToEffectiveBars = (
  count: number,
  sourceBarsPerEffectiveBar: number,
): number =>
  Math.max(
    0,
    Math.floor(
      Math.max(0, Math.floor(Number(count) || 0)) /
        Math.max(1, Math.floor(Number(sourceBarsPerEffectiveBar) || 1)),
    ),
  );
