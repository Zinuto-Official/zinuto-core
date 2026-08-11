// SPDX-License-Identifier: GPL-3.0-only

import type { Chart, Indicator } from 'klinecharts';

export const DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION = 3;
const MAX_INDICATOR_VALUE_DISPLAY_PRECISION = 6;
const INDICATOR_RANGE_TICK_TARGET = 8;

const clampIndicatorPrecision = (
  value: number,
  fallback = DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION,
): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(
    MAX_INDICATOR_VALUE_DISPLAY_PRECISION,
    Math.max(fallback, Math.floor(value)),
  );
};

const resolvePrecisionFromMagnitude = (maxAbsValue: number): number => {
  if (!Number.isFinite(maxAbsValue) || maxAbsValue <= 0) {
    return DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION;
  }
  if (maxAbsValue < 0.001) {
    return 6;
  }
  if (maxAbsValue < 0.01) {
    return 5;
  }
  if (maxAbsValue < 0.1) {
    return 4;
  }
  return DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION;
};

const resolvePrecisionFromRange = (minValue: number, maxValue: number): number => {
  const range = maxValue - minValue;
  if (!Number.isFinite(range) || range <= 0) {
    return DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION;
  }
  const targetTickSize = range / INDICATOR_RANGE_TICK_TARGET;
  if (!Number.isFinite(targetTickSize) || targetTickSize <= 0) {
    return DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION;
  }
  return clampIndicatorPrecision(Math.ceil(-Math.log10(targetTickSize)));
};

export const resolveIndicatorValueDisplayPrecision = (
  values: readonly unknown[],
  fallback = DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION,
): number => {
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  let maxAbsValue = 0;
  let hasValue = false;

  values.forEach((value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    hasValue = true;
    minValue = Math.min(minValue, numericValue);
    maxValue = Math.max(maxValue, numericValue);
    maxAbsValue = Math.max(maxAbsValue, Math.abs(numericValue));
  });

  if (!hasValue) {
    return clampIndicatorPrecision(fallback, fallback);
  }

  return clampIndicatorPrecision(
    Math.max(
      fallback,
      resolvePrecisionFromMagnitude(maxAbsValue),
      resolvePrecisionFromRange(minValue, maxValue),
    ),
    fallback,
  );
};

const collectIndicatorResultValues = (indicator: Indicator): number[] => {
  const values: number[] = [];
  const figureKeys = new Set(
    indicator.figures
      .map((figure) => String(figure.key || '').trim())
      .filter(Boolean),
  );

  indicator.result.forEach((row) => {
    if (typeof row === 'number') {
      if (Number.isFinite(row)) {
        values.push(row);
      }
      return;
    }
    if (!row || typeof row !== 'object') {
      return;
    }
    const source = row as Record<string, unknown>;
    const rawValues = figureKeys.size
      ? Array.from(figureKeys).map((key) => source[key])
      : Object.values(source);
    rawValues.forEach((value) => {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        values.push(numericValue);
      }
    });
  });

  return values;
};

export const resolveIndicatorDisplayPrecision = (
  indicator: Indicator,
  fallback = DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION,
): number =>
  resolveIndicatorValueDisplayPrecision(
    collectIndicatorResultValues(indicator),
    fallback,
  );

export const applyMountedIndicatorDisplayPrecision = (
  chart: Pick<Chart, 'getIndicators' | 'overrideIndicator'>,
  indicatorId: string,
  fallback = DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION,
): Indicator | undefined => {
  const mountedIndicator = chart.getIndicators({ id: indicatorId })[0];
  if (!mountedIndicator) {
    return undefined;
  }

  const precision = resolveIndicatorDisplayPrecision(mountedIndicator, fallback);
  if (precision === mountedIndicator.precision) {
    return mountedIndicator;
  }

  try {
    chart.overrideIndicator({
      id: mountedIndicator.id,
      name: mountedIndicator.name,
      precision,
    });
    return chart.getIndicators({ id: indicatorId })[0] ?? mountedIndicator;
  } catch {
    return mountedIndicator;
  }
};
