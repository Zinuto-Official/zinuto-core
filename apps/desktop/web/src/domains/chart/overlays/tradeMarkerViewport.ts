// SPDX-License-Identifier: GPL-3.0-only

import type { BarSpace, Chart } from 'klinecharts';

const toPositiveFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const resolveSingleBarPixelWidth = (space: Partial<BarSpace> | null | undefined): number => {
  const combinedWidth = toPositiveFiniteNumber(space?.bar) + toPositiveFiniteNumber(space?.gapBar);
  if (combinedWidth > 0) {
    return combinedWidth;
  }

  const combinedHalfWidth =
    (toPositiveFiniteNumber(space?.halfBar) + toPositiveFiniteNumber(space?.halfGapBar)) * 2;
  if (combinedHalfWidth > 0) {
    return combinedHalfWidth;
  }

  return 0;
};

const resolveVisibleRangeBarCount = (chart: Chart): number => {
  try {
    const visibleRange = chart.getVisibleRange?.();
    const fromRaw = Number(visibleRange?.realFrom ?? visibleRange?.from);
    const toRaw = Number(visibleRange?.realTo ?? visibleRange?.to);
    if (!Number.isFinite(fromRaw) || !Number.isFinite(toRaw)) {
      return 0;
    }
    const from = Math.max(0, Math.floor(Math.min(fromRaw, toRaw)));
    const to = Math.max(0, Math.floor(Math.max(fromRaw, toRaw)));
    const count = to - from + 1;
    return count > 0 ? count : 0;
  } catch {
    return 0;
  }
};

const resolveTradeMarkerVisibleBarCount = ({
  chart,
  visibleBarCountCache,
  fallbackCount = 1
}: {
  chart: Chart;
  visibleBarCountCache: WeakMap<Chart, number>;
  fallbackCount?: number;
}): number => {
  const resolvedFromRange = resolveVisibleRangeBarCount(chart);
  if (resolvedFromRange > 0) {
    visibleBarCountCache.set(chart, resolvedFromRange);
    return resolvedFromRange;
  }

  const cached = toPositiveFiniteNumber(visibleBarCountCache.get(chart));
  if (cached > 0) {
    return Math.floor(cached);
  }

  const normalizedFallback = Math.max(1, Math.floor(toPositiveFiniteNumber(fallbackCount) || 1));
  visibleBarCountCache.set(chart, normalizedFallback);
  return normalizedFallback;
};

const resolveTradeMarkerVisibleBarPixelWidth = ({
  chart,
  visibleBarCount,
  viewportWidthPx
}: {
  chart: Chart;
  visibleBarCount: number;
  viewportWidthPx?: number;
}): number => {
  try {
    const widthFromBarSpace = resolveSingleBarPixelWidth(chart.getBarSpace?.());
    if (widthFromBarSpace > 0) {
      return widthFromBarSpace;
    }
  } catch {
    // Ignore bar-space read errors and fall back to viewport approximation.
  }

  const viewportWidth = toPositiveFiniteNumber(viewportWidthPx);
  if (viewportWidth > 0 && visibleBarCount > 0) {
    return viewportWidth / visibleBarCount;
  }
  return 0;
};

export const resolveTradeMarkerViewportMetrics = ({
  chart,
  visibleBarCountCache,
  fallbackCount,
  viewportWidthPx
}: {
  chart: Chart;
  visibleBarCountCache: WeakMap<Chart, number>;
  fallbackCount?: number;
  viewportWidthPx?: number;
}): {
  visibleBarCount: number;
  visibleBarPixelWidth: number;
} => {
  const visibleBarCount = resolveTradeMarkerVisibleBarCount({
    chart,
    visibleBarCountCache,
    fallbackCount
  });
  const visibleBarPixelWidth = resolveTradeMarkerVisibleBarPixelWidth({
    chart,
    visibleBarCount,
    viewportWidthPx
  });
  return {
    visibleBarCount,
    visibleBarPixelWidth
  };
};
