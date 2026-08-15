// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import type { Chart, KLineData, OverlayMode } from "klinecharts";
import type { SessionSnapshot } from "@/domains/training/types";
import type { BaseTimeframe, DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type {
  ChartDisplayEdgeConfig,
  PriceColorMode,
} from "@/domains/chart/display";
import type { ChartRenderMode } from "@/domains/chart/chartRenderMode";
import type {
  HistoryReplayCustomScriptIndicatorInput,
} from "@/domains/chart/useHistoryReplayCustomScriptIndicator";
import type { HistoryReplayEquityPane } from "@/domains/chart/historyReplayEquityPane";
import type { ChartOverlayIds } from "@/domains/chart/overlays";
import type { SignalIndicatorName } from "@/domains/indicators";
import type { SpecialTrainingReplayOverlayContext } from "@/domains/chart/overlays/specialTrainingReplayOverlayTypes";
import type { TradeColorThemeToken } from "@/ui/theme/visualColors";

export type UiLanguage = "en" | "zh-CN" | "ja" | "ko" | "es";

export type ReplayBar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type AggregatedBarItem = {
  bucketStartMs: number;
  startRawIndex: number;
  endRawIndex: number;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ReplayDrawing = {
  id?: string;
  name: string;
  points: Array<{ timestamp: number; value?: number; dataIndex?: number }>;
  sourcePeriod?: DisplayPeriodKey;
  visible?: boolean;
  lock?: boolean;
  zLevel?: number;
  mode?: OverlayMode;
  modeSensitivity?: number;
  needDefaultXAxisFigure?: boolean;
  styles?: unknown;
  extendData?: unknown;
};

export type ReplayChartIndicators = {
  mainNativeIndicator?: string;
  mainNativeIndicatorParams?: number[];
  signalTopIndicator?: SignalIndicatorName;
  signalTopIndicatorParams?: number[];
  signalBottomIndicator?: SignalIndicatorName;
  signalBottomIndicatorParams?: number[];
};

export type HistorySubIndicatorOverride = {
  signalTopIndicator: SignalIndicatorName;
  signalTopIndicatorParams: number[];
  signalBottomIndicator: SignalIndicatorName;
  signalBottomIndicatorParams: number[];
};

export type ReplayArchiveData = {
  bars?: ReplayBar[];
  previewBars?: ReplayBar[];
  barWindow?: {
    startRawIndex?: number;
    endRawIndex?: number;
    totalBars?: number;
    hasBackward?: boolean;
    hasForward?: boolean;
    limited?: boolean;
  };
  snapshot?: SessionSnapshot | null;
  baseTimeframe?: BaseTimeframe;
  displayPeriod?: DisplayPeriodKey;
  chartIndicators?: ReplayChartIndicators;
  drawings?: ReplayDrawing[];
  specialTraining?: SpecialTrainingReplayOverlayContext | null;
};

export type HistoryReplayProject = {
  id: string;
  symbol: string;
  replay?: ReplayArchiveData;
};

export const resolveReplaySnapshotSession = (
  snapshot: SessionSnapshot | null | undefined,
): SessionSnapshot["session"] | null => {
  const session = (snapshot as { session?: unknown } | null | undefined)
    ?.session;
  return session && typeof session === "object" && !Array.isArray(session)
    ? (session as SessionSnapshot["session"])
    : null;
};

export type KlinePeriod = {
  type: "minute" | "hour" | "day" | "week" | "month" | "year";
  span: number;
};

export type ChartOverlayPayload = Parameters<Chart["createOverlay"]>[0];
export type ChartStylesPayload = Parameters<Chart["setStyles"]>[0];

export type HistoryReplayChartDataWindow = {
  klineData: KLineData[];
  bars: ReplayBar[];
  visibleItems: AggregatedBarItem[];
  hasBackward: boolean;
  hasForward: boolean;
};

export type SystemMarkerRenderer = (
  chart: Chart,
  visibleData: KLineData[],
  currentSnapshot: SessionSnapshot,
  sourceBars: ReplayBar[],
  visibleItems: AggregatedBarItem[],
  context?: {
    trainingProjectId?: string | null;
    displayPeriod?: DisplayPeriodKey;
    baseDisplayPeriod?: DisplayPeriodKey | string | null;
    onRequestDisplayPeriod?: (period: DisplayPeriodKey) => void;
    chartViewportWidthPx?: number;
    refreshTradesAndNotes?: boolean;
  },
) => void;

export type HistoryReplayChartBindings = {
  periodOptionsByBaseTimeframe: Record<BaseTimeframe, DisplayPeriodKey[]>;
  defaultTrainerPeriodOptionsByBase: Record<BaseTimeframe, DisplayPeriodKey[]>;
  defaultTrainerDisplayPeriodByBase: Record<BaseTimeframe, DisplayPeriodKey>;
  inferBaseTimeframeFromBars: (bars: ReplayBar[]) => BaseTimeframe;
  aggregateBarsByPeriod: (
    bars: ReplayBar[],
    period: DisplayPeriodKey,
    startRawIndex: number,
    endRawIndex: number,
  ) => AggregatedBarItem[];
  toKlinePeriod: (period: DisplayPeriodKey) => KlinePeriod;
  getDrawingMinPointCount: (name: string) => number;
  registerCustomOverlays: () => void;
  overlayIds: ChartOverlayIds;
};

export type HistoryReplayChartViewProps = {
  project: HistoryReplayProject | null;
  themeMode: "light" | "dark";
  isActive?: boolean;
  showGlobalDecimals?: boolean;
  priceColorMode: PriceColorMode;
  tradeColorTheme?: TradeColorThemeToken;
  createSystemMarkers: SystemMarkerRenderer;
  language: UiLanguage;
  trainerPeriodOptionsByBase: Record<BaseTimeframe, DisplayPeriodKey[]>;
  displayPeriod?: DisplayPeriodKey;
  bindings: HistoryReplayChartBindings;
  initialDisplayPeriod?: DisplayPeriodKey;
  edgeConfig?: ChartDisplayEdgeConfig;
  onDisplayPeriodChange?: (period: DisplayPeriodKey) => void;
  onOpenChartSettings?: () => void;
  isChartSettingsActive?: boolean;
  disableIndicators?: boolean;
  customScriptIndicator?: HistoryReplayCustomScriptIndicatorInput | null;
  equityCurvePane?: HistoryReplayEquityPane | null;
  showChartRenderModeSwitch?: boolean;
  showIndicatorButton?: boolean;
  showPeriodSwitch?: boolean;
  showSubIndicatorToggle?: boolean;
  defaultShowSubIndicators?: boolean;
  chartRenderMode?: ChartRenderMode;
  onChartRenderModeChange?: (mode: ChartRenderMode) => void;
  focusRawBarIndex?: number | null;
  focusRequestNonce?: number;
  focusBehavior?: "scroll-and-select" | "select-only";
  focusMarker?: {
    rawBarIndex: number;
    label: string;
    tone?: "primary" | "warning" | "danger";
    toneColor?: string;
    fullHeight?: boolean;
  } | null;
  toolbarLeadingContent?: ReactNode;
  changeBubblePlacement?: "float" | "origin-left" | "toolbar-left" | "toolbar-right";
  hideLastPriceLine?: boolean;
  hideNativeTooltip?: boolean;
  showReplayDrawings?: boolean;
  systemMarkerMode?: "ALL" | "TRADE_ONLY";
  showEntryBoundaryLine?: boolean;
  showVolumePane?: boolean;
  volumePaneRatio?: number;
};
