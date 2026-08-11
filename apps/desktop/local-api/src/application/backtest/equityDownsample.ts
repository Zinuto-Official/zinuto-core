// SPDX-License-Identifier: GPL-3.0-only

import type {
  BacktestEngineEquityPoint,
  BacktestInstrumentRunResult,
} from './types.js';

export const DEFAULT_MAX_EQUITY_POINTS_PER_SYMBOL = 2_000;

const resolveMaxDrawdownIndex = (
  points: readonly BacktestEngineEquityPoint[],
): number => {
  let selectedIndex = 0;
  let selectedDrawdown = Number.NEGATIVE_INFINITY;
  points.forEach((point, index) => {
    const drawdown = Number(point.drawdown);
    if (Number.isFinite(drawdown) && drawdown > selectedDrawdown) {
      selectedDrawdown = drawdown;
      selectedIndex = index;
    }
  });
  return selectedIndex;
};

export const downsampleEquityCurve = (
  points: readonly BacktestEngineEquityPoint[],
  targetCount = DEFAULT_MAX_EQUITY_POINTS_PER_SYMBOL,
): { points: BacktestEngineEquityPoint[]; sampled: boolean } => {
  const normalizedTarget = Math.max(2, Math.floor(targetCount));
  if (points.length <= normalizedTarget) {
    return { points: [...points], sampled: false };
  }

  const indexes = new Set<number>([
    0,
    points.length - 1,
    resolveMaxDrawdownIndex(points),
  ]);
  const lastIndex = points.length - 1;
  for (let index = 0; index < normalizedTarget && indexes.size < normalizedTarget; index += 1) {
    indexes.add(Math.round((index * lastIndex) / Math.max(1, normalizedTarget - 1)));
  }
  for (let index = 0; index < points.length && indexes.size < normalizedTarget; index += 1) {
    indexes.add(index);
  }

  let sampledIndexes = Array.from(indexes)
    .filter((index) => index >= 0 && index < points.length)
    .sort((left, right) => left - right);

  if (sampledIndexes.length > normalizedTarget) {
    const required = new Set<number>([
      0,
      lastIndex,
      resolveMaxDrawdownIndex(points),
    ]);
    sampledIndexes = sampledIndexes.filter((index) => required.has(index));
    for (let index = 0; index < normalizedTarget && sampledIndexes.length < normalizedTarget; index += 1) {
      const candidate = Math.round((index * lastIndex) / Math.max(1, normalizedTarget - 1));
      if (!sampledIndexes.includes(candidate)) {
        sampledIndexes.push(candidate);
      }
    }
    sampledIndexes.sort((left, right) => left - right);
  }

  if (sampledIndexes[sampledIndexes.length - 1] !== lastIndex) {
    sampledIndexes[sampledIndexes.length - 1] = lastIndex;
  }

  return {
    points: sampledIndexes.map((index) => points[index]!),
    sampled: true,
  };
};

export const downsampleBacktestResultEquity = (
  item: BacktestInstrumentRunResult,
  targetCount = DEFAULT_MAX_EQUITY_POINTS_PER_SYMBOL,
): BacktestInstrumentRunResult => {
  const sampled = downsampleEquityCurve(item.equityCurve, targetCount);
  if (!sampled.sampled) {
    return item;
  }
  return {
    ...item,
    result: {
      ...item.result,
      summary: {
        ...(item.result.summary ?? {}),
        equityCurveSampled: true,
      },
    },
    equityCurve: sampled.points,
  };
};
