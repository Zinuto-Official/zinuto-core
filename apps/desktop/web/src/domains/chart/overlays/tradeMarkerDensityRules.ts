// SPDX-License-Identifier: GPL-3.0-only

type TradeMarkerDensityLevel = 1 | 2 | 3 | 4 | 5;

type TradeMarkerDensityOption = {
  level: TradeMarkerDensityLevel;
  ratio: number;
};

type TradeMarkerCompactWidthOption = {
  level: TradeMarkerDensityLevel;
  maxBarWidthPx: number;
};

export const TRADE_MARKER_DENSITY_LEVELS: readonly TradeMarkerDensityOption[] = Object.freeze([
  Object.freeze({ level: 1, ratio: 0.01 }),
  Object.freeze({ level: 2, ratio: 0.02 }),
  Object.freeze({ level: 3, ratio: 0.03 }),
  Object.freeze({ level: 4, ratio: 0.04 }),
  Object.freeze({ level: 5, ratio: 0.05 })
]);

const TRADE_MARKER_COMPACT_WIDTH_LEVELS: readonly TradeMarkerCompactWidthOption[] = Object.freeze([
  // Level 1: switch to compact earliest (even relatively wide candles already compact)
  Object.freeze({ level: 1, maxBarWidthPx: 32 }),
  Object.freeze({ level: 2, maxBarWidthPx: 22 }),
  Object.freeze({ level: 3, maxBarWidthPx: 14 }),
  Object.freeze({ level: 4, maxBarWidthPx: 8 }),
  // Level 5: switch to compact latest (must zoom out much further)
  Object.freeze({ level: 5, maxBarWidthPx: 4 })
]);

const TRADE_MARKER_DENSITY_DEFAULT_LEVEL: TradeMarkerDensityLevel = 1;
const TRADE_MARKER_DENSITY_RULES = Object.freeze({
  densityMinRatio: TRADE_MARKER_DENSITY_LEVELS[TRADE_MARKER_DENSITY_DEFAULT_LEVEL - 1].ratio
});
export const TRADE_MARKER_DENSITY_DEFAULT_RATIO = TRADE_MARKER_DENSITY_RULES.densityMinRatio;

type TradeMarkerDensityCompactDecisionInput = {
  visibleBarPixelWidth: number;
  densityMinRatio?: number;
};

const toSafePositiveNumber = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

const resolveNearestDensityOption = (ratio: number): TradeMarkerDensityOption => {
  let nearest = TRADE_MARKER_DENSITY_LEVELS[0];
  let nearestDiff = Math.abs(ratio - nearest.ratio);
  for (let index = 1; index < TRADE_MARKER_DENSITY_LEVELS.length; index += 1) {
    const option = TRADE_MARKER_DENSITY_LEVELS[index];
    const diff = Math.abs(ratio - option.ratio);
    if (diff < nearestDiff) {
      nearest = option;
      nearestDiff = diff;
    }
  }
  return nearest;
};

const resolveCompactWidthThresholdByRatio = (ratio: unknown): number => {
  const normalizedLevel = resolveNearestDensityOption(normalizeTradeMarkerDensityRatio(ratio)).level;
  const matched = TRADE_MARKER_COMPACT_WIDTH_LEVELS.find((option) => option.level === normalizedLevel);
  return matched?.maxBarWidthPx ?? TRADE_MARKER_COMPACT_WIDTH_LEVELS[1].maxBarWidthPx;
};

export const normalizeTradeMarkerDensityRatio = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return TRADE_MARKER_DENSITY_DEFAULT_RATIO;
  }
  return resolveNearestDensityOption(parsed).ratio;
};

export const resolveTradeMarkerDensityLevel = (ratio: unknown): TradeMarkerDensityLevel =>
  resolveNearestDensityOption(normalizeTradeMarkerDensityRatio(ratio)).level;

export const resolveTradeMarkerCompactModeByDensity = ({
  visibleBarPixelWidth,
  densityMinRatio
}: TradeMarkerDensityCompactDecisionInput): boolean => {
  const safeVisibleBarPixelWidth = toSafePositiveNumber(visibleBarPixelWidth);
  if (safeVisibleBarPixelWidth <= 0) {
    return false;
  }
  const compactWidthThreshold = resolveCompactWidthThresholdByRatio(densityMinRatio);
  return safeVisibleBarPixelWidth <= compactWidthThreshold;
};
