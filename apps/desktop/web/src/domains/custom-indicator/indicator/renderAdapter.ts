// SPDX-License-Identifier: GPL-3.0-only

import type { IndicatorDrawCallback } from 'klinecharts';
import { getGlobalPriceColorMode, getPriceColorPalette } from '@/domains/chart/display';
import { CUSTOM_INDICATOR_COLOR_TOKENS } from '@/ui/theme/visualColors';
import { isAdvancedRenderInstruction } from '@/workspaces/custom-indicator/plot/semantics';
import type { RenderInstruction } from '@/workspaces/custom-indicator/plot/types';

type IndicatorResultRow = Record<string, number | null>;

export type IndicatorRenderExtendData = Readonly<{
  renderInstructions: readonly RenderInstruction[];
}>;

const DEFAULT_BAND_ALPHA = 0.18;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const withAlpha = (color: string, alpha: number): string => {
  const normalized = String(color ?? '').trim();
  const safeAlpha = clamp(alpha, 0, 1);
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(safeAlpha)})`;
  }
  return normalized || CUSTOM_INDICATOR_COLOR_TOKENS.defaultLine;
};

const getRenderInstructionsFromExtendData = (
  extendData: unknown,
): readonly RenderInstruction[] => {
  if (!extendData || typeof extendData !== 'object') {
    return [];
  }
  const raw = (extendData as { renderInstructions?: unknown }).renderInstructions;
  return Array.isArray(raw) ? (raw as RenderInstruction[]) : [];
};

const applyStrokeStyle = (
  ctx: CanvasRenderingContext2D,
  instruction: RenderInstruction,
) => {
  ctx.strokeStyle = instruction.style.color;
  ctx.lineWidth = Math.max(1, instruction.style.lineWidth);
  ctx.setLineDash(instruction.style.lineStyle === 'dot' ? [4, 4] : []);
};

const applyFillStyle = (
  ctx: CanvasRenderingContext2D,
  instruction: RenderInstruction,
) => {
  const fillColor =
    instruction.style.fillColor ||
    withAlpha(instruction.style.color, DEFAULT_BAND_ALPHA);
  ctx.fillStyle = fillColor;
};

const isDirectionalZeroBasedHistogram = (
  instruction: Extract<RenderInstruction, { primitive: 'histogram' }>,
): boolean =>
  instruction.sourceFunction === null &&
  instruction.directiveFamilies.some(
    (family) =>
      family.family === 'color' &&
      (family.token === 'COLORRED' || family.token === 'COLORGREEN'),
  ) &&
  instruction.directiveFamilies.some(
    (family) => family.family === 'renderMode' && family.token === 'STICK',
  );

const resolveDirectionalHistogramColor = (
  instruction: Extract<RenderInstruction, { primitive: 'histogram' }>,
  index: number,
): string => {
  if (!isDirectionalZeroBasedHistogram(instruction)) {
    return instruction.style.color;
  }
  const upper = instruction.upperSeries[index];
  const lower = instruction.lowerSeries[index];
  if (!isFiniteNumber(upper) || !isFiniteNumber(lower) || upper === lower) {
    return instruction.style.color;
  }
  const palette = getPriceColorPalette(getGlobalPriceColorMode());
  return upper > lower ? palette.up : palette.down;
};

const resolveHistogramWidthPx = (
  widthValue: number,
  fallbackWidth: number,
  barWidth: number,
  halfGapBar: number,
): number => {
  const normalizedWidth = Number.isFinite(widthValue) && widthValue > 0
    ? widthValue
    : fallbackWidth;
  return clamp(
    normalizedWidth * Math.max(1, halfGapBar),
    1,
    Math.max(1, barWidth),
  );
};

const drawHistogramInstruction = (
  ctx: CanvasRenderingContext2D,
  instruction: Extract<RenderInstruction, { primitive: 'histogram' }>,
  xAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['xAxis'],
  yAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['yAxis'],
  barWidth: number,
  halfGapBar: number,
) => {
  applyStrokeStyle(ctx, instruction);

  for (let index = 0; index < instruction.visibleMask.length; index += 1) {
    if (!instruction.visibleMask[index]) {
      continue;
    }
    const x = xAxis.convertToPixel(index);
    const upper = instruction.upperSeries[index];
    const lower = instruction.lowerSeries[index];
    if (!isFiniteNumber(x) || !isFiniteNumber(upper) || !isFiniteNumber(lower)) {
      continue;
    }
    const upperY = yAxis.convertToPixel(upper);
    const lowerY = yAxis.convertToPixel(lower);
    const widthPx = resolveHistogramWidthPx(
      instruction.widthSeries[index] ?? instruction.style.lineWidth,
      instruction.style.lineWidth,
      barWidth,
      halfGapBar,
    );
    const rectX = x - widthPx / 2;
    const rectY = Math.min(upperY, lowerY);
    const rectHeight = Math.max(1, Math.abs(upperY - lowerY));
    const hollow = Boolean(instruction.hollowSeries[index]);
    const color = resolveDirectionalHistogramColor(instruction, index);

    ctx.strokeStyle = color;
    ctx.fillStyle = instruction.style.fillColor || withAlpha(color, DEFAULT_BAND_ALPHA);

    if (rectHeight <= 1) {
      ctx.beginPath();
      ctx.moveTo(rectX, rectY);
      ctx.lineTo(rectX + widthPx, rectY);
      ctx.stroke();
      continue;
    }

    if (hollow) {
      ctx.strokeRect(rectX, rectY, widthPx, rectHeight);
    } else {
      ctx.fillRect(rectX, rectY, widthPx, rectHeight);
      ctx.strokeRect(rectX, rectY, widthPx, rectHeight);
    }
  }
};

const resolveExtendMode = (value: number): { left: boolean; right: boolean } => {
  switch (Math.round(value)) {
    case 1:
      return { left: false, right: true };
    case 2:
      return { left: true, right: false };
    case 3:
      return { left: true, right: true };
    default:
      return { left: false, right: false };
  }
};

const drawSegmentInstruction = (
  ctx: CanvasRenderingContext2D,
  instruction: Extract<RenderInstruction, { primitive: 'segment' }>,
  xAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['xAxis'],
  yAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['yAxis'],
  lastIndex: number,
) => {
  applyStrokeStyle(ctx, instruction);
  let searchStart = 0;
  for (let index = 0; index < instruction.startMask.length; index += 1) {
    if (!instruction.startMask[index] || !isFiniteNumber(instruction.startSeries[index])) {
      continue;
    }
    let endIndex = Math.max(searchStart, index);
    while (
      endIndex < instruction.endMask.length &&
      (!instruction.endMask[endIndex] || !isFiniteNumber(instruction.endSeries[endIndex]))
    ) {
      endIndex += 1;
    }
    if (endIndex >= instruction.endMask.length) {
      break;
    }

    searchStart = endIndex + 1;
    const startValue = instruction.startSeries[index];
    const endValue = instruction.endSeries[endIndex];
    const segmentPoints = [
      { index, value: startValue },
      { index: endIndex, value: endValue },
    ];
    const extendMode = resolveExtendMode(instruction.extend);
    const deltaIndex = Math.max(1, endIndex - index);
    const slope = (endValue - startValue) / deltaIndex;
    if (extendMode.left) {
      segmentPoints.unshift({
        index: 0,
        value: startValue - slope * index,
      });
    }
    if (extendMode.right) {
      segmentPoints.push({
        index: lastIndex,
        value: startValue + slope * (lastIndex - index),
      });
    }

    ctx.beginPath();
    segmentPoints.forEach((point, pointIndex) => {
      const x = xAxis.convertToPixel(point.index);
      const y = yAxis.convertToPixel(point.value);
      if (pointIndex === 0) {
        ctx.moveTo(x, y);
        return;
      }
      ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
};

const resolveSlopeDirection = (value: number): { left: boolean; right: boolean } => {
  switch (Math.round(value)) {
    case 1:
      return { left: true, right: false };
    case 2:
      return { left: true, right: true };
    default:
      return { left: false, right: true };
  }
};

const drawSlopeSegmentInstruction = (
  ctx: CanvasRenderingContext2D,
  instruction: Extract<RenderInstruction, { primitive: 'slopeSegment' }>,
  xAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['xAxis'],
  yAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['yAxis'],
  lastIndex: number,
) => {
  applyStrokeStyle(ctx, instruction);

  for (let index = 0; index < instruction.anchorMask.length; index += 1) {
    if (!instruction.anchorMask[index] || !isFiniteNumber(instruction.anchorSeries[index])) {
      continue;
    }
    const anchorValue = instruction.anchorSeries[index];
    const slopeValue = isFiniteNumber(instruction.slopeSeries[index]) ? instruction.slopeSeries[index] : 0;
    const lengthBars = Math.max(1, Math.floor(Math.abs(instruction.lengthSeries[index] ?? 0)));
    const direction = resolveSlopeDirection(instruction.directSeries[index] ?? 0);

    const startIndex = direction.left ? Math.max(0, index - lengthBars) : index;
    const endIndex = direction.right ? Math.min(lastIndex, index + lengthBars) : index;
    const startValue = direction.left
      ? anchorValue - slopeValue * (index - startIndex)
      : anchorValue;
    const endValue = direction.right
      ? anchorValue + slopeValue * (endIndex - index)
      : anchorValue;

    ctx.beginPath();
    ctx.moveTo(xAxis.convertToPixel(startIndex), yAxis.convertToPixel(startValue));
    ctx.lineTo(xAxis.convertToPixel(endIndex), yAxis.convertToPixel(endValue));
    ctx.stroke();
  }
};

const drawOhlcInstruction = (
  ctx: CanvasRenderingContext2D,
  instruction: Extract<RenderInstruction, { primitive: 'ohlc' }>,
  xAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['xAxis'],
  yAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['yAxis'],
  barWidth: number,
) => {
  const palette = getPriceColorPalette(getGlobalPriceColorMode());
  const bodyWidth = clamp(barWidth * 0.72, 1, Math.max(1, barWidth));

  for (let index = 0; index < instruction.visibleMask.length; index += 1) {
    if (!instruction.visibleMask[index]) {
      continue;
    }
    const open = instruction.openSeries[index];
    const high = instruction.highSeries[index];
    const low = instruction.lowSeries[index];
    const close = instruction.closeSeries[index];
    if (![open, high, low, close].every((value) => isFiniteNumber(value))) {
      continue;
    }
    const x = xAxis.convertToPixel(index);
    const highY = yAxis.convertToPixel(high);
    const lowY = yAxis.convertToPixel(low);
    const openY = yAxis.convertToPixel(open);
    const closeY = yAxis.convertToPixel(close);
    const up = close >= open;
    const color =
      instruction.style.color !== CUSTOM_INDICATOR_COLOR_TOKENS.defaultLine
        ? instruction.style.color
        : (up ? palette.up : palette.down);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, instruction.style.lineWidth);
    ctx.setLineDash(instruction.style.lineStyle === 'dot' ? [4, 4] : []);

    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    const bodyY = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(closeY - openY));
    const bodyX = x - bodyWidth / 2;
    if (bodyHeight <= 1) {
      ctx.beginPath();
      ctx.moveTo(bodyX, bodyY);
      ctx.lineTo(bodyX + bodyWidth, bodyY);
      ctx.stroke();
    } else if (instruction.style.hollow) {
      ctx.strokeRect(bodyX, bodyY, bodyWidth, bodyHeight);
    } else {
      ctx.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
      ctx.strokeRect(bodyX, bodyY, bodyWidth, bodyHeight);
    }
    ctx.restore();
  }
};

const drawBandInstruction = (
  ctx: CanvasRenderingContext2D,
  instruction: Extract<RenderInstruction, { primitive: 'band' }>,
  xAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['xAxis'],
  yAxis: Parameters<IndicatorDrawCallback<IndicatorResultRow, number, IndicatorRenderExtendData>>[0]['yAxis'],
) => {
  let startIndex = -1;
  const flushSegment = (endIndexExclusive: number) => {
    if (startIndex < 0 || endIndexExclusive - startIndex < 2) {
      startIndex = -1;
      return;
    }
    ctx.save();
    applyStrokeStyle(ctx, instruction);
    applyFillStyle(ctx, instruction);
    ctx.beginPath();
    for (let index = startIndex; index < endIndexExclusive; index += 1) {
      const x = xAxis.convertToPixel(index);
      const y = yAxis.convertToPixel(instruction.upperSeries[index]);
      if (index === startIndex) {
        ctx.moveTo(x, y);
        continue;
      }
      ctx.lineTo(
        x,
        y,
      );
    }
    for (let index = endIndexExclusive - 1; index >= startIndex; index -= 1) {
      ctx.lineTo(
        xAxis.convertToPixel(index),
        yAxis.convertToPixel(instruction.lowerSeries[index]),
      );
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    startIndex = -1;
  };

  for (let index = 0; index <= instruction.visibleMask.length; index += 1) {
    const isVisible =
      index < instruction.visibleMask.length &&
      instruction.visibleMask[index] &&
      isFiniteNumber(instruction.upperSeries[index]) &&
      isFiniteNumber(instruction.lowerSeries[index]);
    if (isVisible) {
      if (startIndex < 0) {
        startIndex = index;
      }
      continue;
    }
    flushSegment(index);
  }
};

export const buildCompiledIndicatorDrawCallback = (): IndicatorDrawCallback<
  IndicatorResultRow,
  number,
  IndicatorRenderExtendData
> => {
  return ({ chart, ctx, indicator, xAxis, yAxis }) => {
    const renderInstructions = getRenderInstructionsFromExtendData(
      indicator.extendData,
    );
    if (!renderInstructions.length) {
      return false;
    }

    const advancedInstructions = renderInstructions.filter((instruction) =>
      isAdvancedRenderInstruction(instruction) || instruction.primitive === 'histogram',
    );
    if (!advancedInstructions.length) {
      return false;
    }

    const barSpace = chart.getBarSpace();
    const lastIndex = Math.max(0, indicator.result.length - 1);

    advancedInstructions.forEach((instruction) => {
      switch (instruction.primitive) {
        case 'histogram':
          drawHistogramInstruction(ctx, instruction, xAxis, yAxis, barSpace.bar, barSpace.halfGapBar);
          break;
        case 'segment':
          drawSegmentInstruction(ctx, instruction, xAxis, yAxis, lastIndex);
          break;
        case 'slopeSegment':
          drawSlopeSegmentInstruction(ctx, instruction, xAxis, yAxis, lastIndex);
          break;
        case 'ohlc':
          drawOhlcInstruction(ctx, instruction, xAxis, yAxis, barSpace.bar);
          break;
        case 'band':
          drawBandInstruction(ctx, instruction, xAxis, yAxis);
          break;
        default:
          break;
      }
    });

    return false;
  };
};
