// SPDX-License-Identifier: GPL-3.0-only

import type { Chart } from 'klinecharts';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import { TRADE_MARKER_LAYOUT } from '@/domains/chart/overlays/overlayTokens';
import { resolveTradeMarkerVisualScale } from '@/domains/chart/overlays/tradeMarkerVisualScale';

export type TradeMarkerLayoutSide = 'BUY' | 'SELL' | 'MIXED';

export type TradeMarkerLayoutPixelPoint = {
  x: number;
  y: number;
};

export type TradeMarkerLayoutCandidate<TPayload = unknown> = {
  key: string;
  side: TradeMarkerLayoutSide;
  timestamp: number;
  value: number;
  label: string;
  x: number;
  y: number;
  aggregated?: boolean;
  labelOnly?: boolean;
  count?: number;
  weight?: number;
  price?: number;
  hoverText?: string;
  forceDirection?: 1 | -1;
  payload?: TPayload;
};

export type TradeMarkerLayoutResult<TPayload = unknown> = {
  key: string;
  sourceKeys: string[];
  side: TradeMarkerLayoutSide;
  timestamp: number;
  value: number;
  x: number;
  y: number;
  displayLabel: string;
  aggregated: boolean;
  compressed: boolean;
  labelOnly: boolean;
  forceDirection: 1 | -1;
  labelOffsetX: number;
  labelOffsetY: number;
  count: number;
  weight: number;
  price: number;
  hoverText: string;
  payloads: TPayload[];
};

type LayoutOptions = {
  compact?: boolean;
  visibleBarPixelWidth?: number;
  paneHeight?: number | null;
  clusterXGapPx?: number;
  minLabelGapPx?: number;
  maxSegmentShiftPx?: number;
};

type LayoutMetrics = {
  labelDistancePx: number;
  lineGapPx: number;
  primaryTextSize: number;
  secondaryTextSize: number;
  minLabelGapPx: number;
  maxSegmentShiftPx: number;
  clusterXGapPx: number;
  panePaddingPx: number;
};

type NormalizedCandidate<TPayload> = TradeMarkerLayoutCandidate<TPayload> & {
  normalizedLabel: string;
  forceDirection: 1 | -1;
  labelWidth: number;
  labelHeight: number;
  labelCenterX: number;
  labelCenterY: number;
  order: number;
};

type LabelBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeLabel = (side: TradeMarkerLayoutSide, label: string): string => {
  if (side === 'MIXED') {
    return String(label || '').trim() || tt('chart.tradeMarkerMixedSideLabel');
  }
  const sideLabel = side === 'SELL' ? 'S' : 'B';
  const normalized = String(label || '').trim();
  return normalized || `${sideLabel}1`;
};

const resolveMetrics = (options: LayoutOptions, maxLabelWidth: number): LayoutMetrics => {
  const visibleBarPixelWidth = toFiniteNumber(options.visibleBarPixelWidth, 0);
  const compact = Boolean(options.compact);
  const { markerScale, primaryTextSize, secondaryTextSize } = resolveTradeMarkerVisualScale({
    compact,
    visibleBarPixelWidth
  });
  const labelDistancePx =
    TRADE_MARKER_LAYOUT.headSizePx * markerScale +
    TRADE_MARKER_LAYOUT.stemLenPx * markerScale +
    TRADE_MARKER_LAYOUT.labelGapPx * markerScale;
  const lineGapPx = TRADE_MARKER_LAYOUT.lineGapPx * markerScale;
  const minLabelGapPx =
    options.minLabelGapPx ??
    Math.max(6, Math.round(TRADE_MARKER_LAYOUT.minPadding * markerScale * 1.5));
  return {
    labelDistancePx,
    lineGapPx,
    primaryTextSize,
    secondaryTextSize,
    minLabelGapPx,
    maxSegmentShiftPx:
      options.maxSegmentShiftPx ??
      Math.max(14, Math.min(28, visibleBarPixelWidth > 0 ? visibleBarPixelWidth * 1.65 : 18)),
    clusterXGapPx:
      options.clusterXGapPx ??
      Math.max(
        22,
        Math.min(72, maxLabelWidth * 0.82),
        visibleBarPixelWidth > 0 ? visibleBarPixelWidth * 1.25 : 0
      ),
    panePaddingPx: Math.max(4, TRADE_MARKER_LAYOUT.minPadding * markerScale)
  };
};

const estimateLabelWidth = (label: string, primaryTextSize: number): number =>
  Math.max(20, Math.ceil(label.length * Math.max(6, primaryTextSize * 0.66)) + 8);

const estimateLabelHeight = (
  candidate: TradeMarkerLayoutCandidate,
  metrics: Pick<LayoutMetrics, 'lineGapPx' | 'primaryTextSize' | 'secondaryTextSize'>,
  compact: boolean
): number => {
  const labelOnly = Boolean(candidate.labelOnly || candidate.aggregated || compact);
  if (labelOnly) {
    return Math.max(14, metrics.primaryTextSize + 6);
  }
  return Math.max(
    22,
    metrics.primaryTextSize + metrics.secondaryTextSize + metrics.lineGapPx * 0.65 + 6
  );
};

const toBox = (candidate: Pick<NormalizedCandidate<unknown>, 'labelCenterX' | 'labelCenterY' | 'labelWidth' | 'labelHeight'>): LabelBox => ({
  x: candidate.labelCenterX,
  y: candidate.labelCenterY,
  width: candidate.labelWidth,
  height: candidate.labelHeight
});

const boxesOverlap = (a: LabelBox, b: LabelBox, gap: number): boolean =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
  Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap;

const hasAnyOverlap = <TPayload>(
  candidates: readonly NormalizedCandidate<TPayload>[],
  gap: number
): boolean => {
  for (let index = 0; index < candidates.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < candidates.length; nextIndex += 1) {
      if (boxesOverlap(toBox(candidates[index]!), toBox(candidates[nextIndex]!), gap)) {
        return true;
      }
    }
  }
  return false;
};

const createResultFromCandidate = <TPayload>(
  candidate: NormalizedCandidate<TPayload>,
  labelOffsetY: number
): TradeMarkerLayoutResult<TPayload> => ({
  key: candidate.key,
  sourceKeys: [candidate.key],
  side: candidate.side,
  timestamp: candidate.timestamp,
  value: candidate.value,
  x: candidate.x,
  y: candidate.y,
  displayLabel: candidate.normalizedLabel,
  aggregated: Boolean(candidate.aggregated),
  compressed: false,
  labelOnly: Boolean(candidate.labelOnly || candidate.aggregated),
  forceDirection: candidate.forceDirection,
  labelOffsetX: 0,
  labelOffsetY,
  count: Math.max(1, toFiniteNumber(candidate.count, 1)),
  weight: Math.max(1, toFiniteNumber(candidate.weight, candidate.count ?? 1)),
  price: toFiniteNumber(candidate.price, 0),
  hoverText: String(candidate.hoverText ?? ''),
  payloads: candidate.payload === undefined ? [] : [candidate.payload]
});

const packSegmentedCandidates = <TPayload>(
  candidates: readonly NormalizedCandidate<TPayload>[],
  metrics: LayoutMetrics,
  paneHeight: number | null
): Array<{ candidate: NormalizedCandidate<TPayload>; labelOffsetY: number }> | null => {
  const sorted = [...candidates].sort((a, b) => {
    const topA = a.labelCenterY - a.labelHeight / 2;
    const topB = b.labelCenterY - b.labelHeight / 2;
    if (topA !== topB) {
      return topA - topB;
    }
    return a.order - b.order;
  });
  const packed = sorted.map((candidate) => ({
    candidate,
    centerY: candidate.labelCenterY
  }));
  let previousBottom = Number.NEGATIVE_INFINITY;
  packed.forEach((item) => {
    const minCenterY = previousBottom + metrics.minLabelGapPx + item.candidate.labelHeight / 2;
    item.centerY = Math.max(item.centerY, minCenterY);
    previousBottom = item.centerY + item.candidate.labelHeight / 2;
  });

  const originalTop = Math.min(...sorted.map((candidate) => candidate.labelCenterY - candidate.labelHeight / 2));
  const originalBottom = Math.max(...sorted.map((candidate) => candidate.labelCenterY + candidate.labelHeight / 2));
  const packedTop = Math.min(...packed.map((item) => item.centerY - item.candidate.labelHeight / 2));
  const packedBottom = Math.max(...packed.map((item) => item.centerY + item.candidate.labelHeight / 2));
  const recenterShift = (originalTop + originalBottom) / 2 - (packedTop + packedBottom) / 2;
  packed.forEach((item) => {
    item.centerY += recenterShift;
  });

  if (paneHeight !== null && Number.isFinite(paneHeight) && paneHeight > 0) {
    const minTop = Math.min(...packed.map((item) => item.centerY - item.candidate.labelHeight / 2));
    const maxBottom = Math.max(...packed.map((item) => item.centerY + item.candidate.labelHeight / 2));
    const minAllowedTop = metrics.panePaddingPx;
    const maxAllowedBottom = paneHeight - metrics.panePaddingPx;
    if (maxBottom - minTop > maxAllowedBottom - minAllowedTop) {
      return null;
    }
    const clampShift =
      minTop < minAllowedTop
        ? minAllowedTop - minTop
        : maxBottom > maxAllowedBottom
          ? maxAllowedBottom - maxBottom
          : 0;
    packed.forEach((item) => {
      item.centerY += clampShift;
    });
  }

  const maxShift = Math.max(
    ...packed.map((item) => Math.abs(item.centerY - item.candidate.labelCenterY))
  );
  if (maxShift > metrics.maxSegmentShiftPx) {
    return null;
  }

  const shiftedCandidates = packed.map((item) => ({
    ...item.candidate,
    labelCenterY: item.centerY
  }));
  if (hasAnyOverlap(shiftedCandidates, metrics.minLabelGapPx)) {
    return null;
  }

  return packed.map((item) => ({
    candidate: item.candidate,
    labelOffsetY: item.centerY - item.candidate.labelCenterY
  }));
};

const processSideGroup = <TPayload>(
  candidates: readonly NormalizedCandidate<TPayload>[],
  metrics: LayoutMetrics,
  paneHeight: number | null
): TradeMarkerLayoutResult<TPayload>[] => {
  if (candidates.length <= 1 || !hasAnyOverlap(candidates, metrics.minLabelGapPx)) {
    return candidates.map((candidate) => createResultFromCandidate(candidate, 0));
  }
  const packed = packSegmentedCandidates(candidates, metrics, paneHeight);
  if (packed) {
    return packed.map((item) => createResultFromCandidate(item.candidate, item.labelOffsetY));
  }
  return candidates.map((candidate) => createResultFromCandidate(candidate, 0));
};

const resultToBox = (
  result: TradeMarkerLayoutResult,
  metrics: LayoutMetrics,
  compact: boolean
): LabelBox => {
  const labelWidth = estimateLabelWidth(result.displayLabel, metrics.primaryTextSize);
  const labelHeight = result.labelOnly || compact
    ? Math.max(14, metrics.primaryTextSize + 6)
    : Math.max(22, metrics.primaryTextSize + metrics.secondaryTextSize + metrics.lineGapPx * 0.65 + 6);
  const centerY =
    result.y +
    result.forceDirection * metrics.labelDistancePx +
    result.labelOffsetY;
  return {
    x: result.x + result.labelOffsetX,
    y: centerY,
    width: labelWidth,
    height: labelHeight
  };
};

const separateOppositeSides = <TPayload>(
  results: TradeMarkerLayoutResult<TPayload>[],
  metrics: LayoutMetrics,
  compact: boolean
): TradeMarkerLayoutResult<TPayload>[] => {
  const adjusted = results.map((result) => ({ ...result }));
  for (let sellIndex = 0; sellIndex < adjusted.length; sellIndex += 1) {
    const sell = adjusted[sellIndex];
    if (!sell || sell.side !== 'SELL') {
      continue;
    }
    for (let buyIndex = 0; buyIndex < adjusted.length; buyIndex += 1) {
      const buy = adjusted[buyIndex];
      if (!buy || buy.side !== 'BUY') {
        continue;
      }
      const sellBox = resultToBox(sell, metrics, compact);
      const buyBox = resultToBox(buy, metrics, compact);
      if (!boxesOverlap(sellBox, buyBox, metrics.minLabelGapPx)) {
        continue;
      }
      const requiredGap =
        (sellBox.height + buyBox.height) / 2 +
        metrics.minLabelGapPx -
        Math.abs(sellBox.y - buyBox.y);
      const shift = Math.max(0, requiredGap / 2);
      sell.labelOffsetY -= shift;
      buy.labelOffsetY += shift;
    }
  }
  return adjusted;
};

export const layoutTradeMarkerCandidates = <TPayload = unknown>({
  candidates,
  compact = false,
  visibleBarPixelWidth = 0,
  paneHeight = null,
  clusterXGapPx,
  minLabelGapPx,
  maxSegmentShiftPx
}: {
  candidates: readonly TradeMarkerLayoutCandidate<TPayload>[];
} & LayoutOptions): TradeMarkerLayoutResult<TPayload>[] => {
  const preMetrics = resolveMetrics(
    { compact, visibleBarPixelWidth, paneHeight, clusterXGapPx, minLabelGapPx, maxSegmentShiftPx },
    24
  );
  const validCandidates = candidates
    .map((candidate, order): NormalizedCandidate<TPayload> | null => {
      const x = toFiniteNumber(candidate.x, Number.NaN);
      const y = toFiniteNumber(candidate.y, Number.NaN);
      const timestamp = toFiniteNumber(candidate.timestamp, Number.NaN);
      const value = toFiniteNumber(candidate.value, Number.NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(timestamp) || !Number.isFinite(value)) {
        return null;
      }
      const side: TradeMarkerLayoutSide =
        candidate.side === 'SELL'
          ? 'SELL'
          : candidate.side === 'MIXED'
            ? 'MIXED'
            : 'BUY';
      const normalizedLabel = normalizeLabel(side, candidate.label);
      const candidateForceDirection = Number(candidate.forceDirection);
      const forceDirection: 1 | -1 =
        candidateForceDirection === -1 || candidateForceDirection === 1
          ? candidateForceDirection
          : side === 'SELL'
            ? -1
            : 1;
      const labelWidth = estimateLabelWidth(normalizedLabel, preMetrics.primaryTextSize);
      const labelHeight = estimateLabelHeight(candidate, preMetrics, compact);
      return {
        ...candidate,
        side,
        timestamp,
        value,
        x,
        y,
        normalizedLabel,
        forceDirection,
        labelWidth,
        labelHeight,
        labelCenterX: x,
        labelCenterY: y + forceDirection * preMetrics.labelDistancePx,
        order
      };
    })
    .filter((candidate): candidate is NormalizedCandidate<TPayload> => Boolean(candidate));

  if (validCandidates.length <= 0) {
    return [];
  }

  const maxLabelWidth = Math.max(...validCandidates.map((candidate) => candidate.labelWidth));
  const metrics = resolveMetrics(
    { compact, visibleBarPixelWidth, paneHeight, clusterXGapPx, minLabelGapPx, maxSegmentShiftPx },
    maxLabelWidth
  );
  const sortedByX = [...validCandidates].sort((a, b) => a.x - b.x || a.order - b.order);
  const clusters: Array<NormalizedCandidate<TPayload>[]> = [];
  sortedByX.forEach((candidate) => {
    const cluster = clusters[clusters.length - 1];
    if (!cluster) {
      clusters.push([candidate]);
      return;
    }
    const maxX = Math.max(...cluster.map((item) => item.x));
    if (Math.abs(candidate.x - maxX) <= metrics.clusterXGapPx) {
      cluster.push(candidate);
      return;
    }
    clusters.push([candidate]);
  });

  const results = clusters.flatMap((cluster) => {
    const sellCandidates = cluster.filter((candidate) => candidate.side === 'SELL');
    const mixedCandidates = cluster.filter((candidate) => candidate.side === 'MIXED');
    const buyCandidates = cluster.filter((candidate) => candidate.side === 'BUY');
    return [
      ...processSideGroup(sellCandidates, metrics, paneHeight),
      ...processSideGroup(mixedCandidates, metrics, paneHeight),
      ...processSideGroup(buyCandidates, metrics, paneHeight)
    ];
  });

  const sideOrder = (side: TradeMarkerLayoutSide): number =>
    side === 'SELL' ? 0 : side === 'MIXED' ? 1 : 2;

  return separateOppositeSides(results, metrics, compact).sort((a, b) => {
    if (a.x !== b.x) {
      return a.x - b.x;
    }
    if (a.side !== b.side) {
      return sideOrder(a.side) - sideOrder(b.side);
    }
    return a.displayLabel.localeCompare(b.displayLabel);
  });
};

export const resolveTradeMarkerPixelPoint = ({
  chart,
  timestamp,
  value,
  paneId
}: {
  chart: Chart;
  timestamp: number;
  value: number;
  paneId: string;
}): TradeMarkerLayoutPixelPoint | null => {
  try {
    const converted = chart.convertToPixel({ timestamp, value }, { paneId });
    const point = Array.isArray(converted) ? converted[0] : converted;
    const x = toFiniteNumber((point as { x?: unknown } | undefined)?.x, Number.NaN);
    const y = toFiniteNumber((point as { y?: unknown } | undefined)?.y, Number.NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
  } catch {
    return null;
  }
  return null;
};

export const resolveTradeMarkerPaneHeight = ({
  chart,
  paneId
}: {
  chart: Chart;
  paneId: string;
}): number | null => {
  try {
    const size = chart.getSize(paneId, 'main') ?? chart.getSize(paneId);
    const height = toFiniteNumber(size?.height, Number.NaN);
    return Number.isFinite(height) && height > 0 ? height : null;
  } catch {
    return null;
  }
};
