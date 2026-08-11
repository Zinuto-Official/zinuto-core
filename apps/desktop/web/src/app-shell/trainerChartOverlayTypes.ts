// SPDX-License-Identifier: GPL-3.0-only

import type { MutableRefObject } from 'react';
import type { Chart, KLineData } from 'klinecharts';
import type { PriceColorMode } from '@/domains/chart/display';
import type { TradeColorThemeToken } from "@/ui/theme/visualColors";

export type TrainerSessionLike = {
  cursor_index: number;
  start_index: number;
  symbol: string;
};

export type SessionSnapshotLike = {
  session: TrainerSessionLike;
};

export type ReplayBarLike = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  startRawIndex?: number;
  endRawIndex?: number;
};

export type AggregatedBarLike = {
  bucketStartMs: number;
  startRawIndex: number;
  endRawIndex: number;
  close: number;
};

export type ChartEdgeConfigLike = {
  xAxisSize: number;
  yAxisSize: number;
  rightOffset: number;
  minRightVisibleBars: number;
  maxRightOffsetMultiplier: number;
};

export type MarkerContext<TPeriod extends string> = {
  trainingProjectId: string | null;
  displayPeriod: TPeriod;
  onRequestDisplayPeriod: (period: TPeriod) => void;
  chartViewportWidthPx: number | undefined;
  refreshTradesAndNotes?: boolean;
};

export type UseTrainerChartDataRenderPipelineArgs<
  TPeriod extends string,
  TSnapshot extends SessionSnapshotLike,
  TBar extends ReplayBarLike,
  TAggregatedBar extends AggregatedBarLike
> = {
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  chartDomRef: MutableRefObject<HTMLDivElement | null>;
  bars: TBar[];
  snapshot: TSnapshot | null;
  cursorIndexOverride?: number | null;
  windowStartIndexOverride?: number | null;
  decisionBoundaryRawIndexOverride?: number | null;
  decisionMarkerOverride?: {
    selection: 'LONG' | 'SHORT' | 'OBSERVE';
    label: string;
    displayText: string;
  } | null;
  tradeMarkersOverride?: Array<{
    rawIndex: number;
    side: 'BUY' | 'SELL';
    price: number;
    label: string;
  }>;
  tradeMarkerBasePeriod?: TPeriod | string | null;
  deferSystemMarkers?: boolean;
  tradeMarkerDensityRatio: number;
  fastDecisionExtremeRayOverride?: {
    profitPrice: number;
    drawdownPrice: number;
    baselinePrice: number;
    profitRatio: number;
    drawdownRatio: number;
    profitTagText: string;
    drawdownTagText: string;
  } | null;
  riskDisciplineGuidesOverride?: {
    baselinePrice: number | null;
    currentCostPrice: number | null;
    baselineTagText: string;
    currentCostTagText: string;
  } | null;
  chartThemeMode: 'light' | 'dark';
  priceColorMode: PriceColorMode;
  tradeColorTheme: TradeColorThemeToken;
  showGlobalDecimals: boolean;
  tooltipSymbolOverride?: string;
  trainerDisplayPeriod: TPeriod;
  activeToolbarSymbol: string;
  sessionId: string;
  trainerResponsiveChartEdgeConfig: ChartEdgeConfigLike;
  chartDataRef: MutableRefObject<KLineData[]>;
  liveBarSubscriberRef: MutableRefObject<((data: KLineData) => void) | null>;
  visibleAggregatedBarsRef: MutableRefObject<TAggregatedBar[]>;
  chartDataRenderSignatureRef: MutableRefObject<string>;
  chartMarkerHeavyRenderSignatureRef: MutableRefObject<string>;
  chartMarkerPositionRenderSignatureRef: MutableRefObject<string>;
  specialTrainingOverlaySignatureRef: MutableRefObject<string>;
  systemMarkerHeavySignature: string;
  systemMarkerPositionSignature: string;
  lastScrollSessionRef: MutableRefObject<string>;
  pendingDrawingRebuildPeriodRef: MutableRefObject<TPeriod | null>;
  activeDrawToolRef: MutableRefObject<string>;
  drawingOverlayIdRef: MutableRefObject<string>;
  armDrawOverlayRef: MutableRefObject<(tool: string) => void>;
  adjustPaneHeights: () => void;
  refreshDrawingMeta: () => void;
  rebuildDrawingsByPeriod: (period: TPeriod) => boolean;
  getCachedTrainerAggregatedBars: (period: TPeriod, startRawIndex: number, endRawIndex: number) => TAggregatedBar[];
  mapVisibleItemToKline: (item: TAggregatedBar) => KLineData;
  createSystemMarkers: (
    chart: Chart,
    visibleData: KLineData[],
    snapshot: TSnapshot,
    bars: TBar[],
    visibleItems: TAggregatedBar[],
    context: MarkerContext<TPeriod>
  ) => void;
  setTrainerDisplayPeriod: (period: TPeriod) => void;
};
