// SPDX-License-Identifier: GPL-3.0-only

import type { FastDecisionCapitalReview } from "@zinuto/shared/domain-calculations/fast-decision-capital-review";

export const FAST_DECISION_CAPITAL_CHART_GRID = {
  top: 10,
  right: 10,
  bottom: 18,
  left: 8,
} as const;

export type FastDecisionCapitalCurveLayout = {
  grid: typeof FAST_DECISION_CAPITAL_CHART_GRID;
  maxX: number;
  xInterval: number;
  minY: number;
  maxY: number;
  ySplitNumber: number;
};

const FAST_DECISION_CAPITAL_Y_SPLITS = 4;

const toFiniteLayoutNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const resolveNiceInterval = (rawInterval: number): number => {
  const normalized = Math.max(Number.EPSILON, Math.abs(rawInterval));
  const exponent = Math.floor(Math.log10(normalized));
  const magnitude = 10 ** exponent;
  const fraction = normalized / magnitude;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;

  return niceFraction * magnitude;
};

const resolveAdaptiveAxisBounds = (value: {
  min: number;
  max: number;
  minimumSpan: number;
}): { min: number; max: number } => {
  const safeMin = toFiniteLayoutNumber(value.min, 0);
  const safeMax = toFiniteLayoutNumber(value.max, safeMin);
  const minimumSpan = Math.max(1, toFiniteLayoutNumber(value.minimumSpan, 1));
  const rawMin = Math.min(safeMin, safeMax);
  const rawMax = Math.max(safeMin, safeMax);
  const rawSpan = rawMax - rawMin;
  const span = Math.max(rawSpan, minimumSpan);
  const center = rawMin + rawSpan / 2;

  return {
    min: center - span / 2,
    max: center + span / 2,
  };
};

export const resolveFastDecisionCapitalCurveLayout = (
  review: FastDecisionCapitalReview,
): FastDecisionCapitalCurveLayout | null => {
  const curve = Array.isArray(review?.curve) ? review.curve : [];
  if (curve.length < 2) {
    return null;
  }

  const assets = curve.map((point) => point.asset);
  const minAsset = assets.length ? Math.min(...assets) : review.initialAsset;
  const maxAsset = assets.length ? Math.max(...assets) : review.initialAsset;
  const initialAsset = Math.max(
    1,
    toFiniteLayoutNumber(review.initialAsset, minAsset || 10000),
  );
  const assetRange = Math.max(0, maxAsset - minAsset);
  const minimumVisibleSpan = Math.max(40, initialAsset * 0.004);
  const rangePadding = Math.max(12, assetRange * 0.14, initialAsset * 0.0012);
  const paddedRange = Math.max(
    minimumVisibleSpan,
    assetRange + rangePadding * 2,
  );
  const yAxis = resolveAdaptiveAxisBounds({
    min: minAsset,
    max: maxAsset,
    minimumSpan: paddedRange,
  });
  const dataMaxX = Math.max(1, curve[curve.length - 1]?.orderIndex ?? 1);
  const xInterval = Math.max(1, resolveNiceInterval(dataMaxX / 4));

  return {
    grid: FAST_DECISION_CAPITAL_CHART_GRID,
    maxX: Math.max(dataMaxX, Math.ceil(dataMaxX / xInterval) * xInterval),
    xInterval,
    minY: yAxis.min,
    maxY: yAxis.max,
    ySplitNumber: FAST_DECISION_CAPITAL_Y_SPLITS,
  };
};
