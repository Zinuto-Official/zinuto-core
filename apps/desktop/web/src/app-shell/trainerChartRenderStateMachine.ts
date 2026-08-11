// SPDX-License-Identifier: GPL-3.0-only

import type { TrainerChartDataUpdateDecision } from '@/app-shell/trainerChartDataUpdatePolicy';

type SpecialTrainingDecisionMarker = {
  selection: 'LONG' | 'SHORT' | 'OBSERVE';
  label: string;
  displayText: string;
} | null;

type SpecialTrainingTradeMarker = {
  rawIndex: number;
  side: 'BUY' | 'SELL';
  price: number;
  label: string;
};

type SpecialTrainingExtremeRay = {
  profitPrice: number;
  drawdownPrice: number;
  baselinePrice: number;
  profitRatio: number;
  drawdownRatio: number;
  profitTagText: string;
  drawdownTagText: string;
} | null;

type SpecialTrainingRiskGuides = {
  baselinePrice: number | null;
  currentCostPrice: number | null;
  baselineTagText: string;
  currentCostTagText: string;
} | null;

export type TrainerChartDataRenderStage = 'stable' | 'realtime' | 'reset';

type TrainerChartRenderStateInput = {
  dataStage: TrainerChartDataRenderStage;
  previousSpecialTrainingOverlaySignature: string;
  nextSpecialTrainingOverlaySignature: string;
  deferSystemMarkers: boolean;
  previousSystemMarkerHeavySignature: string;
  nextSystemMarkerHeavySignature: string;
  previousSystemMarkerPositionSignature: string;
  nextSystemMarkerPositionSignature: string;
  pendingDrawingRebuildPeriod: string | null;
  trainerDisplayPeriod: string;
};

export type TrainerChartRenderState = {
  dataStage: TrainerChartDataRenderStage;
  shouldResetData: boolean;
  shouldRefreshSpecialTrainingOverlays: boolean;
  shouldRefreshTradeAndNoteMarkers: boolean;
  shouldRefreshPositionMarker: boolean;
  shouldRefreshSystemMarkers: boolean;
  shouldRebuildDrawingsForPeriod: boolean;
  shouldScheduleOverlayFrame: boolean;
  shouldQueuePaneAdjustWithoutOverlay: boolean;
};

const normalizedNumberSignature = (value: unknown): string => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? String(normalized) : 'null';
};

const nullableTextSignature = (value: unknown): string =>
  value === null || value === undefined ? 'null' : String(value);

export const buildSpecialTrainingOverlaySignature = ({
  decisionBoundaryRawIndexOverride,
  decisionMarkerOverride,
  tradeMarkersOverride,
  tradeMarkerBasePeriod,
  tradeMarkerDensityRatio,
  fastDecisionExtremeRayOverride,
  riskDisciplineGuidesOverride,
  maxIndex,
  firstBucketStartMs,
  lastBucketStartMs,
  priceColorMode,
  tradeColorTheme,
  showGlobalDecimals,
  chartThemeMode,
}: {
  decisionBoundaryRawIndexOverride: number | null | undefined;
  decisionMarkerOverride: SpecialTrainingDecisionMarker;
  tradeMarkersOverride: SpecialTrainingTradeMarker[];
  tradeMarkerBasePeriod: string | null | undefined;
  tradeMarkerDensityRatio: number;
  fastDecisionExtremeRayOverride: SpecialTrainingExtremeRay;
  riskDisciplineGuidesOverride: SpecialTrainingRiskGuides;
  maxIndex: number | null;
  firstBucketStartMs: number | null | undefined;
  lastBucketStartMs: number | null | undefined;
  priceColorMode: string;
  tradeColorTheme: string;
  showGlobalDecimals: boolean;
  chartThemeMode: string;
}): string => {
  const decisionMarkerSignature = decisionMarkerOverride
    ? [
        decisionMarkerOverride.selection,
        decisionMarkerOverride.label,
        decisionMarkerOverride.displayText,
      ].join('~')
    : 'null';
  const tradeMarkersSignature = tradeMarkersOverride.length
    ? tradeMarkersOverride
        .map((marker) => [
          normalizedNumberSignature(marker.rawIndex),
          marker.side,
          normalizedNumberSignature(marker.price),
          marker.label,
        ].join('~'))
        .join(';')
    : 'empty';
  const extremeRaySignature = fastDecisionExtremeRayOverride
    ? [
        normalizedNumberSignature(fastDecisionExtremeRayOverride.profitPrice),
        normalizedNumberSignature(fastDecisionExtremeRayOverride.drawdownPrice),
        normalizedNumberSignature(fastDecisionExtremeRayOverride.baselinePrice),
        normalizedNumberSignature(fastDecisionExtremeRayOverride.profitRatio),
        normalizedNumberSignature(fastDecisionExtremeRayOverride.drawdownRatio),
        fastDecisionExtremeRayOverride.profitTagText,
        fastDecisionExtremeRayOverride.drawdownTagText,
      ].join('~')
    : 'null';
  const riskGuideSignature = riskDisciplineGuidesOverride
    ? [
        normalizedNumberSignature(riskDisciplineGuidesOverride.baselinePrice),
        normalizedNumberSignature(riskDisciplineGuidesOverride.currentCostPrice),
        riskDisciplineGuidesOverride.baselineTagText,
        riskDisciplineGuidesOverride.currentCostTagText,
      ].join('~')
    : 'null';

  return [
    normalizedNumberSignature(decisionBoundaryRawIndexOverride),
    decisionMarkerSignature,
    tradeMarkersSignature,
    nullableTextSignature(tradeMarkerBasePeriod),
    normalizedNumberSignature(tradeMarkerDensityRatio),
    extremeRaySignature,
    riskGuideSignature,
    normalizedNumberSignature(maxIndex),
    normalizedNumberSignature(firstBucketStartMs),
    normalizedNumberSignature(lastBucketStartMs),
    priceColorMode,
    tradeColorTheme,
    showGlobalDecimals ? '1' : '0',
    chartThemeMode,
  ].join('|');
};

export const resolveTrainerChartDataRenderStage = ({
  dataUpdateDecision,
  realtimeApplied,
}: {
  dataUpdateDecision: TrainerChartDataUpdateDecision;
  realtimeApplied: boolean | null;
}): TrainerChartDataRenderStage => {
  if (dataUpdateDecision.action === 'none') {
    return 'stable';
  }
  if (dataUpdateDecision.action === 'reset') {
    return 'reset';
  }
  return realtimeApplied ? 'realtime' : 'reset';
};

export const resolveTrainerChartRenderState = ({
  dataStage,
  previousSpecialTrainingOverlaySignature,
  nextSpecialTrainingOverlaySignature,
  deferSystemMarkers,
  previousSystemMarkerHeavySignature,
  nextSystemMarkerHeavySignature,
  previousSystemMarkerPositionSignature,
  nextSystemMarkerPositionSignature,
  pendingDrawingRebuildPeriod,
  trainerDisplayPeriod,
}: TrainerChartRenderStateInput): TrainerChartRenderState => {
  const shouldResetData = dataStage === 'reset';
  const shouldRefreshSpecialTrainingOverlays =
    shouldResetData ||
    previousSpecialTrainingOverlaySignature !== nextSpecialTrainingOverlaySignature;
  const shouldRefreshTradeAndNoteMarkers =
    !deferSystemMarkers &&
    (shouldResetData ||
      previousSystemMarkerHeavySignature !== nextSystemMarkerHeavySignature);
  const shouldRefreshPositionMarker =
    !deferSystemMarkers &&
    (shouldResetData ||
      previousSystemMarkerPositionSignature !== nextSystemMarkerPositionSignature);
  const shouldRefreshSystemMarkers =
    shouldRefreshTradeAndNoteMarkers || shouldRefreshPositionMarker;
  const shouldRebuildDrawingsForPeriod =
    pendingDrawingRebuildPeriod === trainerDisplayPeriod;
  const shouldScheduleOverlayFrame =
    shouldRefreshSystemMarkers ||
    shouldRebuildDrawingsForPeriod ||
    shouldRefreshSpecialTrainingOverlays;
  return {
    dataStage,
    shouldResetData,
    shouldRefreshSpecialTrainingOverlays,
    shouldRefreshTradeAndNoteMarkers,
    shouldRefreshPositionMarker,
    shouldRefreshSystemMarkers,
    shouldRebuildDrawingsForPeriod,
    shouldScheduleOverlayFrame,
    shouldQueuePaneAdjustWithoutOverlay:
      !shouldScheduleOverlayFrame && shouldResetData,
  };
};
