// SPDX-License-Identifier: GPL-3.0-only

import type { Chart, OverlayCreate } from 'klinecharts';
import {
  TRAINER_OVERLAY_COLOR_TOKENS,
  resolvePriceColorPalette,
  resolveTradeVisualThemePalette,
  type TradeColorThemeToken
} from '@/ui/theme/visualColors';
import type { PriceColorMode } from '@/domains/chart/display';
import {
  SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_NAME,
  SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
  SYSTEM_TRADE_MARKER_OVERLAY_NAME,
} from '@/domains/chart/overlays/constants';
import { resolveTradeMarkerCompactModeByDensity } from '@/domains/chart/overlays/tradeMarkerDensityRules';
import { resolveSingleBarPixelWidth } from '@/domains/chart/overlays/tradeMarkerViewport';
import { shouldAggregateTradeMarkersByPeriod } from '@/domains/chart/tradeMarkerAggregationMode';
import { buildTradeMarkerOverrideBuckets } from '@/domains/chart/tradeMarkerOverrideAggregation';
import {
  layoutTradeMarkerCandidates,
  resolveTradeMarkerPaneHeight,
  resolveTradeMarkerPixelPoint
} from '@/domains/chart/tradeMarkerLayout';
import { INDICATOR_PANES } from '@/domains/indicators/runtime';
import {
  SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
  SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_ID,
  SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_ID,
  SPECIAL_TRAINING_TRADE_MARKER_ID_PREFIX,
  SPECIAL_TRAINING_MFE_RAY_OVERLAY_ID,
  SPECIAL_TRAINING_MAE_RAY_OVERLAY_ID,
  SPECIAL_TRAINING_MFE_TAG_OVERLAY_ID,
  SPECIAL_TRAINING_MAE_TAG_OVERLAY_ID,
  SPECIAL_TRAINING_RISK_BASELINE_LINE_OVERLAY_ID,
  SPECIAL_TRAINING_RISK_BASELINE_TAG_OVERLAY_ID,
  SPECIAL_TRAINING_RISK_COST_LINE_OVERLAY_ID,
  SPECIAL_TRAINING_RISK_COST_TAG_OVERLAY_ID,
} from '@/app-shell/trainerChartOverlayConstants';
import type { AggregatedBarLike } from '@/app-shell/trainerChartOverlayTypes';

const batchCreateOverlays = (chart: Chart, payloads: unknown[]): void => {
  if (payloads.length === 0) {
    return;
  }
  if (payloads.length === 1) {
    chart.createOverlay(payloads[0] as OverlayCreate);
    return;
  }
  chart.createOverlay(payloads as Array<string | OverlayCreate>);
};

export const removeAllSpecialTrainingOverlays = (chart: Chart): void => {
  // All special training overlays share the same groupId, so a single
  // removeOverlay({ groupId }) removes them all. The individual ID removals
  // that were here previously were redundant no-ops.
  chart.removeOverlay({ groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP });
};

export const renderTradeMarkerOverlays = <
  TAggregatedBar extends AggregatedBarLike
>(
  chart: Chart,
  chartDom: HTMLDivElement | null,
  tradeMarkersOverride: Array<{ rawIndex: number; side: 'BUY' | 'SELL'; price: number; label: string }>,
  visibleItems: TAggregatedBar[],
  maxIndex: number,
  tradeMarkerDensityRatio: number,
  trainerDisplayPeriod: string,
  tradeMarkerBasePeriod: string | null | undefined,
): void => {
  const visibleBarPixelWidth = (() => {
    try {
      const widthFromBarSpace = resolveSingleBarPixelWidth(chart.getBarSpace?.());
      if (widthFromBarSpace > 0) {
        return widthFromBarSpace;
      }
    } catch {
      // ignore read errors and fall back to viewport approximation
    }
    const viewportWidth = Number(chartDom?.clientWidth);
    return Number.isFinite(viewportWidth) && viewportWidth > 0 && visibleItems.length > 0
      ? viewportWidth / visibleItems.length
      : 0;
  })();
  const useCompactTradeMarker = resolveTradeMarkerCompactModeByDensity({
    visibleBarPixelWidth,
    densityMinRatio: tradeMarkerDensityRatio
  });
  const markerBuckets = buildTradeMarkerOverrideBuckets({
    markers: tradeMarkersOverride,
    visibleItems,
    maxIndex,
    aggregateByVisiblePeriod: shouldAggregateTradeMarkersByPeriod(
      trainerDisplayPeriod,
      tradeMarkerBasePeriod
    )
  });
  const layoutMarkers = layoutTradeMarkerCandidates({
    compact: useCompactTradeMarker,
    visibleBarPixelWidth,
    paneHeight: resolveTradeMarkerPaneHeight({
      chart,
      paneId: INDICATOR_PANES.candle
    }),
    candidates: markerBuckets.flatMap((marker) => {
      const pixelPoint = resolveTradeMarkerPixelPoint({
        chart,
        timestamp: marker.timestamp,
        value: marker.markerValue,
        paneId: INDICATOR_PANES.candle
      });
      if (!pixelPoint) {
        return [];
      }
      return [{
        key: marker.key,
        side: marker.side,
        timestamp: marker.timestamp,
        value: marker.markerValue,
        label: marker.displayLabel,
        x: pixelPoint.x,
        y: pixelPoint.y,
        aggregated: marker.isAggregated,
        labelOnly: marker.isAggregated,
        count: marker.count,
        weight: marker.count,
        price: marker.price,
        forceDirection: marker.forceDirection,
        payload: marker
      }];
    })
  });
  const layoutMarkerKeys = new Set(layoutMarkers.flatMap((marker) => marker.sourceKeys));
  const tradeOverlays: unknown[] = [];
  layoutMarkers.forEach((marker) => {
    tradeOverlays.push({
      id: `${SPECIAL_TRAINING_TRADE_MARKER_ID_PREFIX}-${marker.key}`,
      groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
      name: SYSTEM_TRADE_MARKER_OVERLAY_NAME,
      lock: true,
      zLevel: 864,
      points: [
        {
          timestamp: marker.timestamp,
          value: marker.value
        }
      ],
      extendData: {
        side: marker.side,
        price: marker.price,
        lots: marker.count,
        spent: 0,
        received: 0,
        compact: useCompactTradeMarker,
        aggregated: marker.aggregated,
        labelOnly: marker.labelOnly,
        labelOffsetX: marker.labelOffsetX,
        labelOffsetY: marker.labelOffsetY,
        forceDirection: marker.forceDirection,
        compressed: marker.compressed,
        hidden: false,
        compactLabel: marker.displayLabel
      }
    });
  });
  markerBuckets
    .filter((marker) => !layoutMarkerKeys.has(marker.key))
    .forEach((marker) => {
      tradeOverlays.push({
        id: `${SPECIAL_TRAINING_TRADE_MARKER_ID_PREFIX}-${marker.key}`,
        groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
        name: SYSTEM_TRADE_MARKER_OVERLAY_NAME,
        lock: true,
        zLevel: 864,
        points: [
          {
            timestamp: marker.timestamp,
            value: marker.markerValue
          }
        ],
        extendData: {
          side: marker.side,
          price: marker.price,
          lots: marker.count,
          spent: 0,
          received: 0,
          compact: useCompactTradeMarker,
          aggregated: marker.isAggregated,
          labelOnly: marker.isAggregated,
          forceDirection: marker.forceDirection,
          hidden: false,
          compactLabel: marker.displayLabel
        }
      });
    });
  batchCreateOverlays(chart, tradeOverlays);
};

export const renderDecisionBoundaryOverlays = <
  TAggregatedBar extends AggregatedBarLike
>(
  chart: Chart,
  visibleItems: TAggregatedBar[],
  maxIndex: number,
  decisionBoundaryRawIndexOverride: number,
  decisionMarkerOverride: { selection: 'LONG' | 'SHORT' | 'OBSERVE'; label: string; displayText: string } | null,
  fastDecisionExtremeRayOverride: { profitPrice: number; drawdownPrice: number; baselinePrice: number; profitRatio: number; drawdownRatio: number; profitTagText: string; drawdownTagText: string } | null,
  chartThemeMode: 'light' | 'dark',
  priceColorMode: PriceColorMode,
  tradeColorTheme: TradeColorThemeToken,
): void => {
  const boundaryRawIndex = Math.max(
    0,
    Math.min(Math.floor(Number(decisionBoundaryRawIndexOverride)), maxIndex)
  );
  const boundaryItemIndex = visibleItems.findIndex((item) => {
    const itemStartRawIndex = Math.floor(Number(item.startRawIndex));
    const itemEndRawIndex = Math.floor(Number(item.endRawIndex));
    if (!Number.isFinite(itemStartRawIndex) || !Number.isFinite(itemEndRawIndex)) {
      return false;
    }
    return boundaryRawIndex >= itemStartRawIndex && boundaryRawIndex <= itemEndRawIndex;
  });
  const boundaryItem = boundaryItemIndex >= 0 ? visibleItems[boundaryItemIndex] : null;
  const boundaryClose = Number(boundaryItem?.close);
  if (!boundaryItem || !Number.isFinite(boundaryItem.bucketStartMs) || !Number.isFinite(boundaryClose)) {
    return;
  }

  const boundaryOverlays: unknown[] = [];

  boundaryOverlays.push({
    id: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_ID,
    groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
    name: 'verticalStraightLine',
    lock: true,
    zLevel: 860,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    points: [
      {
        timestamp: boundaryItem.bucketStartMs,
        value: boundaryClose
      }
    ],
    styles: {
      line: {
        style: TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineStyle,
        size:
          fastDecisionExtremeRayOverride
            ? TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineWidthThick
            : TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineWidthThin,
        color:
          chartThemeMode === 'dark'
            ? TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineColorDark
            : TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineColorLight,
        dashedValue: [...TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineDashedValue],
        smooth: false
      }
    }
  });

  const pricePalette = resolvePriceColorPalette(priceColorMode);
  const tradePalette = resolveTradeVisualThemePalette(chartThemeMode, tradeColorTheme);
  const decisionMarkerSelection = decisionMarkerOverride?.selection;
  const decisionMarkerDisplayText = String(decisionMarkerOverride?.displayText ?? '').trim();
  let decisionReferenceToneColor =
    chartThemeMode === 'dark'
      ? TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneDark
      : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneLight;
  if (decisionMarkerSelection === 'LONG') {
    decisionReferenceToneColor = tradePalette.buyMarker;
  } else if (decisionMarkerSelection === 'SHORT') {
    decisionReferenceToneColor = tradePalette.sellMarker;
  }
  if (decisionMarkerDisplayText) {
    boundaryOverlays.push({
      id: SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_ID,
      groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
      name: SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_NAME,
      lock: true,
      zLevel: 861,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        {
          timestamp: boundaryItem.bucketStartMs,
          value: boundaryClose
        }
      ],
      extendData: {
        text: decisionMarkerDisplayText,
        toneColor: decisionReferenceToneColor,
        textColor: TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.textColor
      }
    });
  }

  const boundaryNextItem = visibleItems[boundaryItemIndex + 1] ?? null;
  const startTimestamp = Number(boundaryItem.bucketStartMs);
  const nextTimestampRaw = Number(boundaryNextItem?.bucketStartMs);
  const endTimestamp =
    Number.isFinite(nextTimestampRaw) && nextTimestampRaw > startTimestamp
      ? nextTimestampRaw
      : startTimestamp + 1;
  const profitPrice = Number(fastDecisionExtremeRayOverride?.profitPrice);
  const drawdownPrice = Number(fastDecisionExtremeRayOverride?.drawdownPrice);
  const profitTagText = String(fastDecisionExtremeRayOverride?.profitTagText ?? '').trim();
  const drawdownTagText = String(fastDecisionExtremeRayOverride?.drawdownTagText ?? '').trim();
  const profitToneColor = pricePalette.up;
  const drawdownToneColor = pricePalette.down;
  const profitTagPlacement =
    Number.isFinite(drawdownPrice) && profitPrice < drawdownPrice ? 'below' : 'above';
  const drawdownTagPlacement =
    Number.isFinite(profitPrice) && drawdownPrice > profitPrice ? 'above' : 'below';

  if (Number.isFinite(profitPrice)) {
    boundaryOverlays.push({
      id: SPECIAL_TRAINING_MFE_RAY_OVERLAY_ID,
      groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
      name: 'horizontalRayLine',
      lock: true,
      zLevel: 862,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        { timestamp: startTimestamp, value: profitPrice },
        { timestamp: endTimestamp, value: profitPrice }
      ],
      styles: {
        line: {
          style: 'dashed',
          dashedValue: [6, 4],
          size: 2,
          color: profitToneColor,
          smooth: false
        }
      }
    });
    if (profitTagText) {
      boundaryOverlays.push({
        id: SPECIAL_TRAINING_MFE_TAG_OVERLAY_ID,
        groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
        name: SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
        lock: true,
        zLevel: 863,
        needDefaultPointFigure: false,
        needDefaultXAxisFigure: false,
        needDefaultYAxisFigure: false,
        points: [
          { timestamp: startTimestamp, value: profitPrice }
        ],
        extendData: {
          text: profitTagText,
          toneColor: profitToneColor,
          offsetX: 12,
          placement: profitTagPlacement
        }
      });
    }
  }
  if (Number.isFinite(drawdownPrice)) {
    boundaryOverlays.push({
      id: SPECIAL_TRAINING_MAE_RAY_OVERLAY_ID,
      groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
      name: 'horizontalRayLine',
      lock: true,
      zLevel: 862,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        { timestamp: startTimestamp, value: drawdownPrice },
        { timestamp: endTimestamp, value: drawdownPrice }
      ],
      styles: {
        line: {
          style: 'dashed',
          dashedValue: [6, 4],
          size: 2,
          color: drawdownToneColor,
          smooth: false
        }
      }
    });
    if (drawdownTagText) {
      boundaryOverlays.push({
        id: SPECIAL_TRAINING_MAE_TAG_OVERLAY_ID,
        groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
        name: SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
        lock: true,
        zLevel: 863,
        needDefaultPointFigure: false,
        needDefaultXAxisFigure: false,
        needDefaultYAxisFigure: false,
        points: [
          { timestamp: startTimestamp, value: drawdownPrice }
        ],
        extendData: {
          text: drawdownTagText,
          toneColor: drawdownToneColor,
          offsetX: 12,
          placement: drawdownTagPlacement
        }
      });
    }
  }
  batchCreateOverlays(chart, boundaryOverlays);
};

export const renderRiskDisciplineGuideOverlays = <
  TAggregatedBar extends AggregatedBarLike
>(
  chart: Chart,
  visibleItems: TAggregatedBar[],
  riskDisciplineGuidesOverride: {
    baselinePrice: number | null;
    currentCostPrice: number | null;
    baselineTagText: string;
    currentCostTagText: string;
  },
  chartThemeMode: 'light' | 'dark',
  tradeColorTheme: TradeColorThemeToken,
): void => {
  const firstVisibleItem = visibleItems[0] ?? null;
  const lastVisibleItem = visibleItems[visibleItems.length - 1] ?? null;
  const previousVisibleItem = visibleItems.length > 1 ? visibleItems[visibleItems.length - 2] : null;
  const startTimestamp = Number(firstVisibleItem?.bucketStartMs);
  const endTimestampRaw = Number(lastVisibleItem?.bucketStartMs);
  const endTimestamp =
    Number.isFinite(endTimestampRaw) && Number.isFinite(startTimestamp)
      ? Math.max(startTimestamp + 1, endTimestampRaw)
      : Number.NaN;
  const endReferenceTimestamp = Number.isFinite(endTimestamp)
    ? endTimestamp
    : Number(previousVisibleItem?.bucketStartMs) + 1;
  const tradePalette = resolveTradeVisualThemePalette(chartThemeMode, tradeColorTheme);
  const baselinePriceRaw = Number(riskDisciplineGuidesOverride.baselinePrice);
  const currentCostPriceRaw = Number(riskDisciplineGuidesOverride.currentCostPrice);
  const baselineTagText = String(riskDisciplineGuidesOverride.baselineTagText ?? '').trim();
  const currentCostTagText = String(riskDisciplineGuidesOverride.currentCostTagText ?? '').trim();

  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endReferenceTimestamp)) {
    return;
  }

  const baselineToneColor =
    chartThemeMode === 'dark'
      ? TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneDark
      : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneLight;

  const riskOverlays: unknown[] = [];

  if (Number.isFinite(baselinePriceRaw) && baselinePriceRaw > 0) {
    riskOverlays.push({
      id: SPECIAL_TRAINING_RISK_BASELINE_LINE_OVERLAY_ID,
      groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
      name: 'horizontalRayLine',
      lock: true,
      zLevel: 857,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        { timestamp: startTimestamp, value: baselinePriceRaw },
        { timestamp: endReferenceTimestamp, value: baselinePriceRaw }
      ],
      styles: {
        line: {
          style: 'dashed',
          dashedValue: [6, 4],
          size: 2,
          color: baselineToneColor,
          smooth: false
        }
      }
    });
    if (baselineTagText) {
      riskOverlays.push({
        id: SPECIAL_TRAINING_RISK_BASELINE_TAG_OVERLAY_ID,
        groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
        name: SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
        lock: true,
        zLevel: 858,
        needDefaultPointFigure: false,
        needDefaultXAxisFigure: false,
        needDefaultYAxisFigure: false,
        points: [{ timestamp: startTimestamp, value: baselinePriceRaw }],
        extendData: {
          text: baselineTagText,
          toneColor: baselineToneColor,
          offsetX: 12,
          offsetY: -14
        }
      });
    }
  }

  if (Number.isFinite(currentCostPriceRaw) && currentCostPriceRaw > 0) {
    riskOverlays.push({
      id: SPECIAL_TRAINING_RISK_COST_LINE_OVERLAY_ID,
      groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
      name: 'horizontalRayLine',
      lock: true,
      zLevel: 859,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        { timestamp: startTimestamp, value: currentCostPriceRaw },
        { timestamp: endReferenceTimestamp, value: currentCostPriceRaw }
      ],
      styles: {
        line: {
          style: 'dashed',
          dashedValue: [8, 5],
          size: 3,
          color: tradePalette.positionLine,
          smooth: false
        }
      }
    });
    if (currentCostTagText) {
      riskOverlays.push({
        id: SPECIAL_TRAINING_RISK_COST_TAG_OVERLAY_ID,
        groupId: SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_GROUP,
        name: SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
        lock: true,
        zLevel: 860,
        needDefaultPointFigure: false,
        needDefaultXAxisFigure: false,
        needDefaultYAxisFigure: false,
        points: [{ timestamp: startTimestamp, value: currentCostPriceRaw }],
        extendData: {
          text: currentCostTagText,
          toneColor: tradePalette.positionLine,
          offsetX: 12,
          offsetY: 14
        }
      });
    }
  }
  batchCreateOverlays(chart, riskOverlays);
};
