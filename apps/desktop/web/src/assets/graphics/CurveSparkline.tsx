// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { ReplayCurvePoint } from "@/domains/trainer/trainerTypes";
import type { UiLanguage } from "@/frontend-kernel/typography";
import { useId, useMemo, useRef, useState } from 'react';
import { formatMoney, formatRatio, formatSignedMoney } from '@/ui/formatting/format';
import { formatLabelValueText } from '@/ui/formatting/i18nDisplay';
import { CHART_STYLE_COLOR_TOKENS } from '@/ui/theme/visualColors';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import { clamp } from '@/frontend-kernel/math';
import { resolveValueAxisExtent } from '@/workspaces/challenge-stats/charts/valueAxis';
import {
  formatMarketDateByLocale,
  parseTimestampMs,
  toMarketDateKey,
  toMarketDateTime
} from '@zinuto/shared/marketTime';
import { CurveSparklineGraphic } from '@/assets/graphics/CurveSparklineGraphic';

type CurveSparklineProps = {
  points: ReplayCurvePoint[];
  className?: string;
  initialCapital: number;
  baseTimeframe: BaseTimeframe;
  themeMode: 'light' | 'dark';
  language: UiLanguage;
};

type CurveRenderPoint = {
  timestamp: number;
  value: number;
};

type CanvasCurvePoint = {
  x: number;
  y: number;
  timestamp: number;
  value: number;
};

type CanvasGeometry = {
  width: number;
  height: number;
  plotTop: number;
  plotBottom: number;
  baselineY: number;
  points: CanvasCurvePoint[];
};

const CURVE_VIEWBOX_WIDTH = 1000;
const CURVE_VIEWBOX_HEIGHT = 128;
const CURVE_CANVAS_PADDING = Object.freeze({
  top: 10,
  right: 2,
  bottom: 8,
  left: 2
});

const reflectCurveIndex = (index: number, length: number): number => {
  if (length <= 1) {
    return 0;
  }
  let next = index;
  while (next < 0 || next >= length) {
    if (next < 0) {
      next = Math.abs(next);
      continue;
    }
    next = length - 1 - (next - (length - 1));
  }
  return clamp(next, 0, length - 1);
};

const smoothCurveValues = (values: number[]): number[] => {
  if (values.length < 5) {
    return [...values];
  }

  const radius = clamp(Math.round(values.length / 28), 4, 16);
  const sigma = Math.max(1.6, radius / 2.1);
  const weights: number[] = [];
  let totalWeight = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    weights.push(weight);
    totalWeight += weight;
  }

  const convolve = (source: number[]): number[] =>
    source.map((_, index) => {
      let weightedSum = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleIndex = reflectCurveIndex(index + offset, source.length);
        weightedSum += source[sampleIndex] * weights[offset + radius];
      }
      return weightedSum / totalWeight;
    });

  let smoothed = [...values];
  const passes = values.length >= 240 ? 4 : values.length >= 140 ? 3 : 2;
  for (let pass = 0; pass < passes; pass += 1) {
    smoothed = convolve(smoothed);
  }

  smoothed[0] = values[0];
  smoothed[smoothed.length - 1] = values[values.length - 1];
  return smoothed;
};

const normalizeCurvePoints = (points: ReplayCurvePoint[]): CurveRenderPoint[] => {
  const normalized = points
    .map((item, index) => {
      const value = Number(item.value);
      if (!Number.isFinite(value)) {
        return null;
      }
      const timestamp = parseTimestampMs(item.ts);
      return {
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() + index,
        value
      };
    })
    .filter((item): item is CurveRenderPoint => Boolean(item))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (normalized.length < 2) {
    return [];
  }

  const unique: CurveRenderPoint[] = [];
  normalized.forEach((item) => {
    const last = unique[unique.length - 1];
    if (last && last.timestamp === item.timestamp) {
      last.value = item.value;
    } else {
      unique.push({ ...item });
    }
  });

  return unique.length >= 2 ? unique : [];
};

const interpolateCurveValue = (
  points: CurveRenderPoint[],
  leftIndex: number,
  targetTimestamp: number
): number => {
  const left = points[leftIndex];
  const right = points[leftIndex + 1];
  if (!left) {
    return Number.NaN;
  }
  if (!right) {
    return left.value;
  }
  if (targetTimestamp <= left.timestamp) {
    return left.value;
  }
  if (targetTimestamp >= right.timestamp) {
    return right.value;
  }
  const span = right.timestamp - left.timestamp;
  if (!(span > 0)) {
    return right.value;
  }
  const ratio = (targetTimestamp - left.timestamp) / span;
  return left.value + (right.value - left.value) * ratio;
};

const buildRenderSeries = (points: ReplayCurvePoint[]): CurveRenderPoint[] => {
  const unique = normalizeCurvePoints(points);
  if (unique.length < 2) {
    return [];
  }

  const firstTs = unique[0].timestamp;
  const lastTs = unique[unique.length - 1].timestamp;
  if (!(lastTs > firstTs) || unique.length >= 240) {
    return unique;
  }

  const targetCount = Math.max(240, Math.min(720, unique.length * 12));
  const series: CurveRenderPoint[] = [];
  let leftIndex = 0;
  let lastOutputTs = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < targetCount; index += 1) {
    const ratio = targetCount === 1 ? 0 : index / (targetCount - 1);
    const rawTs = firstTs + (lastTs - firstTs) * ratio;
    while (leftIndex + 1 < unique.length && unique[leftIndex + 1].timestamp < rawTs) {
      leftIndex += 1;
    }
    let timestamp = Math.round(rawTs);
    if (timestamp <= lastOutputTs) {
      timestamp = lastOutputTs + 1;
    }
    lastOutputTs = timestamp;
    series.push({
      timestamp,
      value: interpolateCurveValue(unique, leftIndex, rawTs)
    });
  }
  return series;
};

const resolveCurveVerticalExtent = (
  displayValues: number[],
  initialCapital: number
): { min: number; max: number } => {
  const finiteValues = displayValues.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return { min: 0, max: 1 };
  }

  const curveMin = Math.min(...finiteValues);
  const curveMax = Math.max(...finiteValues);
  const baseline = Number.isFinite(initialCapital) ? initialCapital : 0;
  const combinedMin = Math.min(curveMin, baseline);
  const combinedMax = Math.max(curveMax, baseline);
  const range = Math.max(combinedMax - combinedMin, Math.abs(combinedMax) * 0.02, 1);
  const epsilon = Math.max(1e-6, range * 0.001);
  const hasLossRegion = curveMin < baseline - epsilon;
  const hasProfitRegion = curveMax > baseline + epsilon;

  const resolveDelta = (ratio: number) => Math.max(range * ratio, Math.abs(baseline) * 0.0025, 1);

  if (!hasLossRegion && hasProfitRegion) {
    return {
      min: baseline - resolveDelta(0.025),
      max: curveMax + resolveDelta(0.16)
    };
  }

  if (hasLossRegion && !hasProfitRegion) {
    return {
      min: curveMin - resolveDelta(0.16),
      max: baseline + resolveDelta(0.025)
    };
  }

  if (!hasLossRegion && !hasProfitRegion) {
    return resolveValueAxisExtent([baseline], {
      paddingMode: 'range',
      paddingTopRatio: 0.12,
      paddingBottomRatio: 0.08
    });
  }

  return {
    min: combinedMin - resolveDelta(0.08),
    max: combinedMax + resolveDelta(0.1)
  };
};

const resolveInteractionBucketKey = (
  timestamp: number,
  baseTimeframe: BaseTimeframe
): string => {
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  return baseTimeframe === '1d' ? toMarketDateKey(timestamp) : toMarketDateTime(timestamp);
};

const buildRepresentativeIndexByRenderIndex = (
  renderSeries: CurveRenderPoint[],
  baseTimeframe: BaseTimeframe
): number[] => {
  if (!renderSeries.length) {
    return [];
  }

  const representativeIndexByRenderIndex = new Array<number>(renderSeries.length).fill(0);
  let groupStartIndex = 0;
  let currentKey = resolveInteractionBucketKey(renderSeries[0].timestamp, baseTimeframe);
  for (let index = 1; index <= renderSeries.length; index += 1) {
    const nextKey =
      index < renderSeries.length
        ? resolveInteractionBucketKey(renderSeries[index].timestamp, baseTimeframe)
        : '';
    if (index < renderSeries.length && nextKey === currentKey) {
      continue;
    }

    const groupEndIndex = index - 1;
    const representativeIndex = Math.floor((groupStartIndex + groupEndIndex) / 2);
    for (let fillIndex = groupStartIndex; fillIndex <= groupEndIndex; fillIndex += 1) {
      representativeIndexByRenderIndex[fillIndex] = representativeIndex;
    }

    groupStartIndex = index;
    currentKey = nextKey;
  }

  return representativeIndexByRenderIndex;
};

const formatCurveTimestamp = (
  timestamp: number,
  language: UiLanguage,
  baseTimeframe: BaseTimeframe
): string => {
  if (!Number.isFinite(timestamp)) {
    return tt('appText.message0367');
  }
  if (baseTimeframe === '1d') {
    return toMarketDateKey(timestamp) || tt('appText.message0367');
  }
  const localized = formatMarketDateByLocale(timestamp, language, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return localized || toMarketDateTime(timestamp) || tt('appText.message0367');
};

const buildCanvasGeometry = (
  width: number,
  height: number,
  renderSeries: CurveRenderPoint[],
  displayValues: number[],
  initialCapital: number
): CanvasGeometry | null => {
  if (width <= 0 || height <= 0 || renderSeries.length < 2 || displayValues.length < 2) {
    return null;
  }

  const plotWidth = Math.max(1, width - CURVE_CANVAS_PADDING.left - CURVE_CANVAS_PADDING.right);
  const plotHeight = Math.max(1, height - CURVE_CANVAS_PADDING.top - CURVE_CANVAS_PADDING.bottom);
  const extent = resolveCurveVerticalExtent(displayValues, initialCapital);
  const valueSpan = Math.max(1e-6, extent.max - extent.min);
  const firstTs = renderSeries[0]?.timestamp ?? 0;
  const lastTs = renderSeries[renderSeries.length - 1]?.timestamp ?? firstTs;
  const tsSpan = Math.max(1, lastTs - firstTs);
  const plotTop = CURVE_CANVAS_PADDING.top;
  const plotBottom = CURVE_CANVAS_PADDING.top + plotHeight;
  const toY = (value: number): number =>
    plotTop + ((extent.max - value) / valueSpan) * plotHeight;

  const points = renderSeries.map((item, index) => ({
    x:
      CURVE_CANVAS_PADDING.left +
      (((item.timestamp - firstTs) / tsSpan) || (renderSeries.length <= 1 ? 0 : index / (renderSeries.length - 1))) * plotWidth,
    y: toY(displayValues[index] ?? item.value),
    timestamp: item.timestamp,
    value: item.value
  }));

  return {
    width,
    height,
    plotTop,
    plotBottom,
    baselineY: toY(initialCapital),
    points
  };
};

const formatSvgCoordinate = (value: number): string => Number(value.toFixed(2)).toString();

const buildSmoothCurveTail = (points: CanvasCurvePoint[]): string => {
  if (!points.length) {
    return '';
  }
  if (points.length === 1) {
    return `L ${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`;
  }
  if (points.length === 2) {
    return [
      `L ${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`,
      `L ${formatSvgCoordinate(points[1].x)} ${formatSvgCoordinate(points[1].y)}`,
    ].join(' ');
  }

  const commands = [`L ${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    commands.push(
      `Q ${formatSvgCoordinate(current.x)} ${formatSvgCoordinate(current.y)} ${formatSvgCoordinate(midX)} ${formatSvgCoordinate(midY)}`,
    );
  }

  const penultimate = points[points.length - 2];
  const last = points[points.length - 1];
  commands.push(
    `Q ${formatSvgCoordinate(penultimate.x)} ${formatSvgCoordinate(penultimate.y)} ${formatSvgCoordinate(last.x)} ${formatSvgCoordinate(last.y)}`,
  );
  return commands.join(' ');
};

const buildCurveLinePath = (points: CanvasCurvePoint[]): string =>
  points.length
    ? `M ${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(points[0].y)} ${buildSmoothCurveTail(points)}`
    : '';

const buildCurveAreaPath = (points: CanvasCurvePoint[], plotBottom: number): string =>
  points.length
    ? [
        `M ${formatSvgCoordinate(points[0].x)} ${formatSvgCoordinate(plotBottom)}`,
        buildSmoothCurveTail(points),
        `L ${formatSvgCoordinate(points[points.length - 1].x)} ${formatSvgCoordinate(plotBottom)}`,
        'Z',
      ].join(' ')
    : '';

const findNearestPointIndex = (points: CanvasCurvePoint[], x: number): number => {
  if (!points.length) {
    return 0;
  }
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].x < x) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const rightIndex = clamp(low, 0, points.length - 1);
  const leftIndex = clamp(rightIndex - 1, 0, points.length - 1);
  return Math.abs(points[rightIndex].x - x) <= Math.abs(points[leftIndex].x - x) ? rightIndex : leftIndex;
};

export const CurveSparkline = ({
  points,
  className,
  initialCapital,
  baseTimeframe,
  themeMode,
  language
}: CurveSparklineProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientId = useId().replace(/[:]/g, '');

  const renderSeries = useMemo<CurveRenderPoint[]>(() => buildRenderSeries(points), [points]);
  const displayValues = useMemo(() => smoothCurveValues(renderSeries.map((item) => item.value)), [renderSeries]);
  const representativeIndexByRenderIndex = useMemo(
    () => buildRepresentativeIndexByRenderIndex(renderSeries, baseTimeframe),
    [baseTimeframe, renderSeries]
  );
  const values = useMemo(() => renderSeries.map((item) => item.value), [renderSeries]);
  const defaultRenderIndex = Math.max(0, renderSeries.length - 1);
  const hoveredRenderIndex = hoverIndex === null ? defaultRenderIndex : clamp(hoverIndex, 0, Math.max(0, renderSeries.length - 1));
  const activeIndex = representativeIndexByRenderIndex[hoveredRenderIndex] ?? hoveredRenderIndex;

  const geometry = useMemo(
    () =>
      buildCanvasGeometry(
        CURVE_VIEWBOX_WIDTH,
        CURVE_VIEWBOX_HEIGHT,
        renderSeries,
        displayValues,
        Math.max(0, initialCapital)
      ),
    [displayValues, initialCapital, renderSeries]
  );

  if (renderSeries.length < 2 || !geometry?.points.length) {
    return <div className="curve-empty">{tt('appText.curveDataYet')}</div>;
  }

  const lineColor =
    themeMode === 'dark'
      ? CHART_STYLE_COLOR_TOKENS.curve.areaLineDark
      : CHART_STYLE_COLOR_TOKENS.curve.areaLineLight;
  const fillColor =
    themeMode === 'dark'
      ? CHART_STYLE_COLOR_TOKENS.curve.areaBackgroundDark
      : CHART_STYLE_COLOR_TOKENS.curve.areaBackgroundLight;
  const gridColor =
    themeMode === 'dark'
      ? CHART_STYLE_COLOR_TOKENS.curve.gridLineDark
      : CHART_STYLE_COLOR_TOKENS.curve.gridLineLight;
  const baselineColor =
    themeMode === 'dark'
      ? CHART_STYLE_COLOR_TOKENS.curve.baselineLineDark
      : CHART_STYLE_COLOR_TOKENS.curve.baselineLineLight;
  const crosshairColor =
    themeMode === 'dark'
      ? CHART_STYLE_COLOR_TOKENS.curve.crosshairLineDark
      : CHART_STYLE_COLOR_TOKENS.curve.crosshairLineLight;
  const baseline = Math.max(0, initialCapital);
  const activeValue = values[activeIndex] ?? baseline;
  const amount = activeValue - baseline;
  const ratio = baseline > 0 ? amount / baseline : 0;
  const toneClass = amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat';
  const ratioDisplay = formatRatio(ratio);
  const amountDisplay = formatSignedMoney(amount);
  const dateDisplay = renderSeries[activeIndex]?.timestamp
    ? formatCurveTimestamp(renderSeries[activeIndex].timestamp, language, baseTimeframe)
    : tt('appText.message0367');
  const totalDisplay = formatMoney(activeValue);
  const activePoint = geometry.points[clamp(activeIndex, 0, geometry.points.length - 1)];
  const linePath = buildCurveLinePath(geometry.points);
  const areaPath = buildCurveAreaPath(geometry.points, geometry.plotBottom);

  const handlePointerMove = (clientX: number) => {
    const container = containerRef.current;
    if (!container || !geometry.points.length) {
      return;
    }
    const rect = container.getBoundingClientRect();
    if (!(rect.width > 0)) {
      return;
    }
    const clampedRatio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextIndex = findNearestPointIndex(geometry.points, clampedRatio * geometry.width);
    setHoverIndex(nextIndex);
  };

  const transparentColor = CHART_STYLE_COLOR_TOKENS.curve.transparent;

  return (
    <div className="curve-wrap">
      <div className="curve-meta-row">
        <span className="curve-meta-date">{dateDisplay}</span>
        <span className="curve-meta-total">{formatLabelValueText(language, tt('appText.total'), totalDisplay)}</span>
        <span className={`curve-meta-amount ${toneClass}`}>
          {amountDisplay} {tt('appText.message0694')}{ratioDisplay}{tt('appText.message0695')}
        </span>
      </div>
      <CurveSparklineGraphic
        className={className}
        geometry={geometry}
        gradientId={gradientId}
        lineColor={lineColor}
        fillColor={fillColor}
        gridColor={gridColor}
        baselineColor={baselineColor}
        crosshairColor={crosshairColor}
        transparentColor={transparentColor}
        linePath={linePath}
        areaPath={areaPath}
        activePoint={activePoint}
        containerRef={containerRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      />
    </div>
  );
};
