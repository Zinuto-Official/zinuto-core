// SPDX-License-Identifier: GPL-3.0-only

import type { BarSpace, Chart } from 'klinecharts';
import {
  resolveMaxOffsetRightDistanceByVisibleBars,
  type ChartDisplayEdgeConfig,
} from '@/domains/chart/display';

const FAST_DECISION_CHART_RIGHT_OFFSET_MIN_RATIO = 0.32;
const FAST_DECISION_CHART_RIGHT_OFFSET_BALANCE_RATIO = 0.58;
const FAST_DECISION_CHART_RIGHT_OFFSET_MAX_RATIO = 0.58;
const FAST_DECISION_MAX_RIGHT_OFFSET_VISIBLE_BARS = 140;

const toPositiveFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const resolveKlineBarSlotPixelWidth = (
  space: Partial<BarSpace> | null | undefined,
): number => {
  const barWidth = toPositiveFiniteNumber(space?.bar);
  if (barWidth > 0) {
    return barWidth;
  }

  const halfBarWidth = toPositiveFiniteNumber(space?.halfBar);
  if (halfBarWidth > 0) {
    return halfBarWidth * 2;
  }

  return 0;
};

export const resolveFastDecisionChartRightOffsetDistance = ({
  chartViewportWidth,
  visibleBarCount,
  visibleBarPixelWidth,
  fallbackRightOffset,
}: {
  chartViewportWidth: number;
  visibleBarCount: number;
  visibleBarPixelWidth: number;
  fallbackRightOffset: number;
}): number => {
  const safeFallback = Math.max(0, Math.round(Number(fallbackRightOffset) || 0));
  const safeViewportWidth = Math.max(0, Math.round(Number(chartViewportWidth) || 0));
  if (safeViewportWidth <= 0) {
    return safeFallback;
  }

  const safeVisibleBarCount = Math.max(0, Math.floor(Number(visibleBarCount) || 0));
  const safeVisibleBarPixelWidth = Math.max(0, Number(visibleBarPixelWidth) || 0);
  const estimatedDataWidth = Math.max(
    0,
    Math.round(safeVisibleBarCount * safeVisibleBarPixelWidth),
  );
  const emptyWidth = Math.max(0, safeViewportWidth - estimatedDataWidth);
  const balancedRightOffset = Math.round(
    emptyWidth * FAST_DECISION_CHART_RIGHT_OFFSET_BALANCE_RATIO,
  );
  const minRightOffset = Math.round(
    safeViewportWidth * FAST_DECISION_CHART_RIGHT_OFFSET_MIN_RATIO,
  );
  const maxRightOffset = Math.round(
    safeViewportWidth * FAST_DECISION_CHART_RIGHT_OFFSET_MAX_RATIO,
  );
  const resolvedOffset = Math.max(
    safeFallback,
    minRightOffset,
    balancedRightOffset,
  );
  const maxAllowedOffset = Math.max(safeFallback, maxRightOffset);
  return Math.min(maxAllowedOffset, resolvedOffset);
};

const resolveChartBarSlotPixelWidth = (chart: Chart): number => {
  try {
    return resolveKlineBarSlotPixelWidth(chart.getBarSpace?.());
  } catch {
    return 0;
  }
};

export const applyFastDecisionChartViewportOffset = ({
  chart,
  chartViewportWidth,
  visibleBarCount,
  edgeConfig,
}: {
  chart: Chart;
  chartViewportWidth: number;
  visibleBarCount: number;
  edgeConfig: ChartDisplayEdgeConfig;
}): number => {
  const nextOffsetRightDistance = resolveFastDecisionChartRightOffsetDistance({
    chartViewportWidth,
    visibleBarCount,
    visibleBarPixelWidth: resolveChartBarSlotPixelWidth(chart),
    fallbackRightOffset: edgeConfig.rightOffset,
  });

  chart.setMaxOffsetRightDistance(
    Math.max(
      nextOffsetRightDistance,
      resolveMaxOffsetRightDistanceByVisibleBars(
        chart,
        edgeConfig,
        FAST_DECISION_MAX_RIGHT_OFFSET_VISIBLE_BARS,
      ),
    ),
  );

  if (Math.abs(chart.getOffsetRightDistance() - nextOffsetRightDistance) > 1) {
    chart.setOffsetRightDistance(nextOffsetRightDistance);
  }

  return nextOffsetRightDistance;
};
