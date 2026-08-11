// SPDX-License-Identifier: GPL-3.0-only

import type { Chart } from 'klinecharts';
import { getPriceColorPalette, type PriceColorMode } from '@/domains/chart/display';
import {
  SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_NAME,
  SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
} from '@/domains/chart/overlays';
import type { SpecialTrainingReplayOverlayContext } from '@/domains/chart/overlays/specialTrainingReplayOverlayTypes';
import {
  HISTORY_SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_MAE_RAY_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_MAE_TAG_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_MFE_RAY_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_MFE_TAG_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
  HISTORY_SPECIAL_TRAINING_RISK_BASELINE_LINE_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_RISK_BASELINE_TAG_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_RISK_COST_LINE_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_RISK_COST_TAG_OVERLAY_ID,
  clamp,
} from '@/domains/chart/historyReplayChartRuntimeHelpers';
import type {
  AggregatedBarItem,
  ChartOverlayPayload,
  ReplayBar,
  UiLanguage,
} from '@/domains/chart/HistoryReplayChartTypes';
import { resolveFastDecisionChoiceDisplayText } from '@/workspaces/special-training/domain/specialTrainingDirectionLabels';
import {
  TRAINER_OVERLAY_COLOR_TOKENS,
  resolveTradeVisualThemePalette,
  type TradeColorThemeToken,
} from '@/ui/theme/visualColors';

type RenderHistorySpecialTrainingOverlaysParams = {
  chart: Chart;
  bars: ReplayBar[];
  visibleItems: AggregatedBarItem[];
  overlayContext: SpecialTrainingReplayOverlayContext | null | undefined;
  language: UiLanguage;
  priceColorMode: PriceColorMode;
  themeMode: 'light' | 'dark';
  tradeColorTheme: TradeColorThemeToken | undefined;
};

export const renderHistorySpecialTrainingOverlays = ({
  chart,
  bars,
  visibleItems,
  overlayContext,
  language,
  priceColorMode,
  themeMode,
  tradeColorTheme,
}: RenderHistorySpecialTrainingOverlaysParams): void => {
  chart.removeOverlay({ groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP });
  if (!overlayContext || !bars.length || !visibleItems.length) {
    return;
  }

  const boundaryRawIndex = Number(overlayContext.decisionBoundaryRawIndex);
  if (!Number.isFinite(boundaryRawIndex) || boundaryRawIndex < 0) {
    return;
  }

  const maxIndex = Math.max(0, bars.length - 1);
  const clampedBoundaryRawIndex = clamp(Math.floor(boundaryRawIndex), 0, maxIndex);
  const boundaryItemIndex = visibleItems.findIndex((item) => {
    const itemStartRawIndex = Math.floor(Number(item.startRawIndex));
    const itemEndRawIndex = Math.floor(Number(item.endRawIndex));
    if (!Number.isFinite(itemStartRawIndex) || !Number.isFinite(itemEndRawIndex)) {
      return false;
    }
    return (
      clampedBoundaryRawIndex >= itemStartRawIndex &&
      clampedBoundaryRawIndex <= itemEndRawIndex
    );
  });
  const boundaryItem = boundaryItemIndex >= 0 ? visibleItems[boundaryItemIndex] : null;
  const boundaryClose = Number(boundaryItem?.close);
  if (
    !boundaryItem ||
    !Number.isFinite(boundaryItem.bucketStartMs) ||
    !Number.isFinite(boundaryClose)
  ) {
    return;
  }

  chart.createOverlay({
    id: HISTORY_SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_ID,
    groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
    name: 'verticalStraightLine',
    lock: true,
    zLevel: 860,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    points: [
      {
        timestamp: boundaryItem.bucketStartMs,
        value: boundaryClose,
      },
    ],
    styles: {
      line: {
        style: TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineStyle,
        size: overlayContext.fastDecisionExtremeRay
          ? TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineWidthThick
          : TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineWidthThin,
        color:
          themeMode === 'dark'
            ? TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineColorDark
            : TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineColorLight,
        dashedValue: [...TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineDashedValue],
        smooth: false,
      },
    },
  } as ChartOverlayPayload);

  const pricePalette = getPriceColorPalette(priceColorMode);
  const tradePalette = resolveTradeVisualThemePalette(themeMode, tradeColorTheme);
  const decisionMarkerSelection = overlayContext.decisionMarker?.selection;
  const archivedDecisionMarkerDisplayText = String(
    overlayContext.decisionMarker?.displayText ?? '',
  ).trim();
  const decisionMarkerDisplayText = resolveFastDecisionChoiceDisplayText(
    decisionMarkerSelection,
    language,
    archivedDecisionMarkerDisplayText,
  ).trim();
  let decisionReferenceToneColor =
    themeMode === 'dark'
      ? TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneDark
      : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneLight;
  if (decisionMarkerSelection === 'LONG') {
    decisionReferenceToneColor = tradePalette.buyMarker;
  } else if (decisionMarkerSelection === 'SHORT') {
    decisionReferenceToneColor = tradePalette.sellMarker;
  }
  if (decisionMarkerDisplayText) {
    chart.createOverlay({
      id: HISTORY_SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_ID,
      groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
      name: SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_NAME,
      lock: true,
      zLevel: 861,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        {
          timestamp: boundaryItem.bucketStartMs,
          value: boundaryClose,
        },
      ],
      extendData: {
        text: decisionMarkerDisplayText,
        toneColor: decisionReferenceToneColor,
        textColor: TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.textColor,
      },
    } as ChartOverlayPayload);
  }

  const boundaryNextItem = visibleItems[boundaryItemIndex + 1] ?? null;
  const startTimestamp = Number(boundaryItem.bucketStartMs);
  const nextTimestampRaw = Number(boundaryNextItem?.bucketStartMs);
  const endTimestamp =
    Number.isFinite(nextTimestampRaw) && nextTimestampRaw > startTimestamp
      ? nextTimestampRaw
      : startTimestamp + 1;
  const profitPrice = Number(overlayContext.fastDecisionExtremeRay?.profitPrice);
  const drawdownPrice = Number(overlayContext.fastDecisionExtremeRay?.drawdownPrice);
  const profitTagText = String(
    overlayContext.fastDecisionExtremeRay?.profitTagText ?? '',
  ).trim();
  const drawdownTagText = String(
    overlayContext.fastDecisionExtremeRay?.drawdownTagText ?? '',
  ).trim();
  const profitToneColor = pricePalette.up;
  const drawdownToneColor = pricePalette.down;
  const profitTagPlacement =
    Number.isFinite(drawdownPrice) && profitPrice < drawdownPrice ? 'below' : 'above';
  const drawdownTagPlacement =
    Number.isFinite(profitPrice) && drawdownPrice > profitPrice ? 'above' : 'below';
  if (Number.isFinite(profitPrice)) {
    chart.createOverlay({
      id: HISTORY_SPECIAL_TRAINING_MFE_RAY_OVERLAY_ID,
      groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
      name: 'horizontalRayLine',
      lock: true,
      zLevel: 862,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        { timestamp: startTimestamp, value: profitPrice },
        { timestamp: endTimestamp, value: profitPrice },
      ],
      styles: {
        line: {
          style: 'dashed',
          dashedValue: [6, 4],
          size: 2,
          color: profitToneColor,
          smooth: false,
        },
      },
    } as ChartOverlayPayload);
    if (profitTagText) {
      chart.createOverlay({
        id: HISTORY_SPECIAL_TRAINING_MFE_TAG_OVERLAY_ID,
        groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
        name: SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
        lock: true,
        zLevel: 863,
        needDefaultPointFigure: false,
        needDefaultXAxisFigure: false,
        needDefaultYAxisFigure: false,
        points: [{ timestamp: startTimestamp, value: profitPrice }],
        extendData: {
          text: profitTagText,
          toneColor: profitToneColor,
          offsetX: 12,
          placement: profitTagPlacement,
        },
      } as ChartOverlayPayload);
    }
  }
  if (Number.isFinite(drawdownPrice)) {
    chart.createOverlay({
      id: HISTORY_SPECIAL_TRAINING_MAE_RAY_OVERLAY_ID,
      groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
      name: 'horizontalRayLine',
      lock: true,
      zLevel: 862,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        { timestamp: startTimestamp, value: drawdownPrice },
        { timestamp: endTimestamp, value: drawdownPrice },
      ],
      styles: {
        line: {
          style: 'dashed',
          dashedValue: [6, 4],
          size: 2,
          color: drawdownToneColor,
          smooth: false,
        },
      },
    } as ChartOverlayPayload);
    if (drawdownTagText) {
      chart.createOverlay({
        id: HISTORY_SPECIAL_TRAINING_MAE_TAG_OVERLAY_ID,
        groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
        name: SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
        lock: true,
        zLevel: 863,
        needDefaultPointFigure: false,
        needDefaultXAxisFigure: false,
        needDefaultYAxisFigure: false,
        points: [{ timestamp: startTimestamp, value: drawdownPrice }],
        extendData: {
          text: drawdownTagText,
          toneColor: drawdownToneColor,
          offsetX: 12,
          placement: drawdownTagPlacement,
        },
      } as ChartOverlayPayload);
    }
  }

  const baselinePriceRaw = Number(overlayContext.riskDisciplineGuides?.baselinePrice);
  const currentCostPriceRaw = Number(
    overlayContext.riskDisciplineGuides?.currentCostPrice,
  );
  const baselineTagText = String(
    overlayContext.riskDisciplineGuides?.baselineTagText ?? '',
  ).trim();
  const currentCostTagText = String(
    overlayContext.riskDisciplineGuides?.currentCostTagText ?? '',
  ).trim();
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
    return;
  }

  const baselineToneColor =
    themeMode === 'dark'
      ? TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneDark
      : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneLight;
  if (Number.isFinite(baselinePriceRaw) && baselinePriceRaw > 0) {
    chart.createOverlay({
      id: HISTORY_SPECIAL_TRAINING_RISK_BASELINE_LINE_OVERLAY_ID,
      groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
      name: 'horizontalRayLine',
      lock: true,
      zLevel: 857,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        { timestamp: startTimestamp, value: baselinePriceRaw },
        { timestamp: endTimestamp, value: baselinePriceRaw },
      ],
      styles: {
        line: {
          style: 'dashed',
          dashedValue: [6, 4],
          size: 2,
          color: baselineToneColor,
          smooth: false,
        },
      },
    } as ChartOverlayPayload);
    if (baselineTagText) {
      chart.createOverlay({
        id: HISTORY_SPECIAL_TRAINING_RISK_BASELINE_TAG_OVERLAY_ID,
        groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
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
          offsetY: -14,
        },
      } as ChartOverlayPayload);
    }
  }
  if (Number.isFinite(currentCostPriceRaw) && currentCostPriceRaw > 0) {
    chart.createOverlay({
      id: HISTORY_SPECIAL_TRAINING_RISK_COST_LINE_OVERLAY_ID,
      groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
      name: 'horizontalRayLine',
      lock: true,
      zLevel: 859,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points: [
        { timestamp: startTimestamp, value: currentCostPriceRaw },
        { timestamp: endTimestamp, value: currentCostPriceRaw },
      ],
      styles: {
        line: {
          style: 'dashed',
          dashedValue: [8, 5],
          size: 3,
          color: tradePalette.positionLine,
          smooth: false,
        },
      },
    } as ChartOverlayPayload);
    if (currentCostTagText) {
      chart.createOverlay({
        id: HISTORY_SPECIAL_TRAINING_RISK_COST_TAG_OVERLAY_ID,
        groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
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
          offsetY: 14,
        },
      } as ChartOverlayPayload);
    }
  }
};
