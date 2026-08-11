// SPDX-License-Identifier: GPL-3.0-only

import type { AxisCreate, Chart } from 'klinecharts';
import { CHART_STYLE_COLOR_TOKENS } from '@/ui/theme/visualColors';
import {
  INDICATOR_VALUE_DISPLAY_PRECISION,
  createAdaptiveIndicatorTicks,
  type PriceColorMode
} from '@/domains/chart/display';
import { INDICATOR_NONE_VALUE, normalizeIndicatorCalcParams } from '@/domains/indicators/core';
import { resolveIndicatorRuntimeSpec } from '@/domains/indicators/customProfileRegistry';
import { applyMountedIndicatorDisplayPrecision } from '@/domains/indicators/precision';
import { safelyOverrideIndicatorStyle } from '@/domains/indicators/styles';
import { createChartSettingsIndicatorTooltipDataSource } from '@/domains/indicators/tooltipFeature';

export const INDICATOR_IDS = {
  volumeMain: 'volume-main',
  mainNative: 'native-main-indicator',
  signalTop: 'signal-top',
  signalBottom: 'signal-bottom',
  historyVolumeMain: 'volume-main-history',
  historyMainNative: 'native-main-history',
  historySignalTop: 'signal-top-history',
  historySignalBottom: 'signal-bottom-history',
  historyEquityCurve: 'equity-curve-history'
} as const;

export type ChartSettingsModalFocusTarget = 'main' | 'top' | 'bottom';

export const resolveChartSettingsModalFocusTarget = (
  indicatorId?: unknown,
): ChartSettingsModalFocusTarget | null => {
  const normalized = String(indicatorId ?? '').trim();
  switch (normalized) {
    case INDICATOR_IDS.mainNative:
    case INDICATOR_IDS.historyMainNative:
      return 'main';
    case INDICATOR_IDS.signalTop:
    case INDICATOR_IDS.historySignalTop:
      return 'top';
    case INDICATOR_IDS.signalBottom:
    case INDICATOR_IDS.historySignalBottom:
      return 'bottom';
    default:
      return null;
  }
};

export const resolveChartIndicatorPaneId = (
  indicatorId?: unknown,
): string | null => {
  const normalized = String(indicatorId ?? '').trim();
  switch (normalized) {
    case INDICATOR_IDS.mainNative:
    case INDICATOR_IDS.historyMainNative:
      return INDICATOR_PANES.candle;
    case INDICATOR_IDS.volumeMain:
    case INDICATOR_IDS.historyVolumeMain:
      return INDICATOR_PANES.volume;
    case INDICATOR_IDS.signalTop:
    case INDICATOR_IDS.historySignalTop:
      return INDICATOR_PANES.signalTop;
    case INDICATOR_IDS.signalBottom:
    case INDICATOR_IDS.historySignalBottom:
      return INDICATOR_PANES.signalBottom;
    case INDICATOR_IDS.historyEquityCurve:
      return INDICATOR_PANES.historyEquity;
    default:
      return null;
  }
};

export const INDICATOR_PANES = {
  candle: 'candle_pane',
  volume: 'volume_pane',
  signalTop: 'signal_top_pane',
  signalBottom: 'signal_bottom_pane',
  historyEquity: 'history_equity_pane'
} as const;

type SignalPanePreset = 'trainerTop' | 'trainerBottom' | 'historyTop' | 'historyBottom';

type SignalPaneConfig = {
  id: (typeof INDICATOR_PANES)['signalTop'] | (typeof INDICATOR_PANES)['signalBottom'];
  height: number;
  minHeight: number;
};

const SIGNAL_PANE_CONFIG_BY_PRESET: Record<SignalPanePreset, SignalPaneConfig> = {
  trainerTop: { id: INDICATOR_PANES.signalTop, height: 120, minHeight: 78 },
  trainerBottom: { id: INDICATOR_PANES.signalBottom, height: 110, minHeight: 78 },
  historyTop: { id: INDICATOR_PANES.signalTop, height: 88, minHeight: 28 },
  historyBottom: { id: INDICATOR_PANES.signalBottom, height: 88, minHeight: 28 }
};

const resolveIndicatorTooltipTextColor = (chart: Chart): string =>
  chart.getStyles().indicator?.tooltip?.title?.color ||
  chart.getStyles().indicator?.tooltip?.legend?.color ||
  CHART_STYLE_COLOR_TOKENS.main.tickTextDark;

const createNoneIndicatorTooltipDataSource = (
  chart: Chart,
  indicatorId: string,
) =>
  createChartSettingsIndicatorTooltipDataSource({
    indicatorId,
    color: resolveIndicatorTooltipTextColor(chart),
    activeColor: resolveIndicatorTooltipTextColor(chart),
    labelActiveColor:
      resolveIndicatorTooltipTextColor(chart) ===
      CHART_STYLE_COLOR_TOKENS.main.tickTextLight
        ? CHART_STYLE_COLOR_TOKENS.main.overlayPrimaryLight
        : CHART_STYLE_COLOR_TOKENS.main.overlayPrimaryDark,
    backgroundColor: CHART_STYLE_COLOR_TOKENS.curve.transparent,
  });

type MountIndicatorResult = {
  mounted: boolean;
  resolvedParams: number[];
};

type CreateMainIndicatorArgs = {
  chart: Chart;
  indicatorId: string;
  indicatorName: string;
  calcParams?: number[];
  priceColorMode: PriceColorMode;
  precision?: number;
};

type CreateSignalIndicatorArgs = {
  chart: Chart;
  indicatorId: string;
  indicatorName: string;
  calcParams?: number[];
  priceColorMode: PriceColorMode;
  panePreset: SignalPanePreset;
  precision?: number;
};

type CreateVolumeIndicatorArgs = {
  chart: Chart;
  indicatorId: string;
  height: number;
  minHeight: number;
  precision?: number;
};

export const isIndicatorNone = (indicatorName: string): boolean => indicatorName === INDICATOR_NONE_VALUE;

export const DETACHED_INDICATOR_HEADER_TOP_GAP_PX = 48;
const DETACHED_INDICATOR_MIN_PLOT_HEIGHT_PX = 18;

export const resolveDetachedIndicatorPaneMinHeight = (baseMinHeight: number): number =>
  Math.max(baseMinHeight, DETACHED_INDICATOR_HEADER_TOP_GAP_PX + DETACHED_INDICATOR_MIN_PLOT_HEIGHT_PX);

export const createDetachedIndicatorPaneAxis = (
  withAdaptiveTicks = false
): Partial<AxisCreate> => ({
  ...(withAdaptiveTicks ? { createTicks: createAdaptiveIndicatorTicks } : {}),
  gap: {
    top: DETACHED_INDICATOR_HEADER_TOP_GAP_PX,
    bottom: 0
  }
});

export const mountVolumeIndicator = ({
  chart,
  indicatorId,
  height,
  minHeight,
  precision = INDICATOR_VALUE_DISPLAY_PRECISION
}: CreateVolumeIndicatorArgs) => {
  const runtimeSpec = resolveIndicatorRuntimeSpec('VOL', []);
  chart.createIndicator(
    {
      id: indicatorId,
      name: runtimeSpec.runtimeName,
      calcParams: runtimeSpec.calcParams.length ? runtimeSpec.calcParams : [],
      precision
    },
    {
      isStack: false,
      pane: {
        id: INDICATOR_PANES.volume,
        height,
        minHeight: resolveDetachedIndicatorPaneMinHeight(minHeight),
        dragEnabled: true
      }
    }
  );
};

export const mountMainIndicator = ({
  chart,
  indicatorId,
  indicatorName,
  calcParams = [],
  priceColorMode,
  precision = INDICATOR_VALUE_DISPLAY_PRECISION
}: CreateMainIndicatorArgs): MountIndicatorResult => {
  const runtimeSpec = resolveIndicatorRuntimeSpec(indicatorName, calcParams);
  try {
    chart.createIndicator(
      {
        id: indicatorId,
        name: runtimeSpec.runtimeName,
        calcParams: runtimeSpec.calcParams.length ? runtimeSpec.calcParams : undefined,
        precision
      },
      {
        isStack: false,
        pane: { id: INDICATOR_PANES.candle }
      }
    );
    safelyOverrideIndicatorStyle(chart, indicatorId, runtimeSpec.runtimeName, priceColorMode);
    const mounted =
      applyMountedIndicatorDisplayPrecision(chart, indicatorId, precision) ??
      chart.getIndicators({ id: indicatorId })[0];
    return {
      mounted: true,
      resolvedParams: normalizeIndicatorCalcParams(mounted?.calcParams)
    };
  } catch {
    return { mounted: false, resolvedParams: [] };
  }
};

export const mountSignalIndicator = ({
  chart,
  indicatorId,
  indicatorName,
  calcParams = [],
  priceColorMode,
  panePreset,
  precision = INDICATOR_VALUE_DISPLAY_PRECISION
}: CreateSignalIndicatorArgs): MountIndicatorResult => {
  const paneConfig = SIGNAL_PANE_CONFIG_BY_PRESET[panePreset];
  const runtimeSpec = resolveIndicatorRuntimeSpec(indicatorName, calcParams);
  try {
    chart.createIndicator(
      {
        id: indicatorId,
        name: runtimeSpec.runtimeName,
        calcParams: runtimeSpec.calcParams.length ? runtimeSpec.calcParams : undefined,
        precision
      },
      {
        isStack: false,
        pane: {
          id: paneConfig.id,
          height: paneConfig.height,
          minHeight: resolveDetachedIndicatorPaneMinHeight(paneConfig.minHeight),
          dragEnabled: true
        }
      }
    );
    safelyOverrideIndicatorStyle(chart, indicatorId, runtimeSpec.runtimeName, priceColorMode);
    const mounted =
      applyMountedIndicatorDisplayPrecision(chart, indicatorId, precision) ??
      chart.getIndicators({ id: indicatorId })[0];
    return {
      mounted: true,
      resolvedParams: normalizeIndicatorCalcParams(mounted?.calcParams)
    };
  } catch {
    return { mounted: false, resolvedParams: [] };
  }
};

export const mountSignalIndicatorNonePlaceholder = ({
  chart,
  indicatorId,
  panePreset,
}: {
  chart: Chart;
  indicatorId: string;
  panePreset: SignalPanePreset;
}): MountIndicatorResult => {
  const paneConfig = SIGNAL_PANE_CONFIG_BY_PRESET[panePreset];
  try {
    chart.createIndicator(
      {
        id: indicatorId,
        name: INDICATOR_NONE_VALUE,
        shortName: INDICATOR_NONE_VALUE,
        calcParams: [],
        precision: 0,
        figures: [],
        calc: (dataList) => dataList.map(() => ({})),
        createTooltipDataSource: createNoneIndicatorTooltipDataSource(
          chart,
          indicatorId,
        ),
      },
      {
        isStack: false,
        pane: {
          id: paneConfig.id,
          height: paneConfig.height,
          minHeight: resolveDetachedIndicatorPaneMinHeight(paneConfig.minHeight),
          dragEnabled: true
        }
      }
    );
    return { mounted: true, resolvedParams: [] };
  } catch {
    return { mounted: false, resolvedParams: [] };
  }
};

export const applyIndicatorStyles = (
  chart: Chart,
  mode: PriceColorMode,
  items: Array<{
    id: string;
    name: string;
    enabled?: boolean;
    enableChartSettingsTooltip?: boolean;
  }>
) => {
  items.forEach(({ id, name, enabled = true, enableChartSettingsTooltip = false }) => {
    if (!enabled) {
      return;
    }
    if (name === INDICATOR_NONE_VALUE) {
      try {
        chart.overrideIndicator({
          id,
          name: INDICATOR_NONE_VALUE,
          shortName: INDICATOR_NONE_VALUE,
          createTooltipDataSource: createNoneIndicatorTooltipDataSource(
            chart,
            id,
          ),
        });
      } catch {
        // Ignore when the placeholder indicator is not mounted yet.
      }
      return;
    }
    const runtimeSpec = resolveIndicatorRuntimeSpec(name, []);
    safelyOverrideIndicatorStyle(chart, id, runtimeSpec.runtimeName, mode, {
      enableChartSettingsTooltip,
    });
  });
};

const resolvePaneHeights = (containerHeight: number, lowerRatio = 0.3) => {
  const lowerTotal = Math.max(1, Math.floor(containerHeight * lowerRatio));
  const candleHeight = Math.max(1, containerHeight - lowerTotal);
  return { lowerTotal, candleHeight };
};

const KLINE_X_AXIS_PANE_ID = 'x_axis_pane';
const KLINE_X_AXIS_FALLBACK_HEIGHT = 28;
const KLINE_SEPARATOR_FALLBACK_SIZE = 1;

const resolveHistoryDrawablePaneHeight = (
  chart: Chart,
  containerHeight: number,
  paneCount: number
): number => {
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) {
    return 0;
  }

  const xAxisHeightRaw = Number(chart.getSize(KLINE_X_AXIS_PANE_ID)?.height);
  const xAxisHeight =
    Number.isFinite(xAxisHeightRaw) && xAxisHeightRaw > 0
      ? xAxisHeightRaw
      : KLINE_X_AXIS_FALLBACK_HEIGHT;
  const separatorSizeRaw = Number(
    (chart.getStyles() as { separator?: { size?: number } }).separator?.size
  );
  const separatorSize =
    Number.isFinite(separatorSizeRaw) && separatorSizeRaw >= 0
      ? separatorSizeRaw
      : KLINE_SEPARATOR_FALLBACK_SIZE;
  const separatorTotal = Math.max(0, paneCount - 1) * separatorSize;

  return Math.max(1, Math.round(containerHeight - xAxisHeight - separatorTotal));
};

const resolveHistoryLowerRatio = (ratio?: number): number => {
  const parsed = Number(ratio);
  if (!Number.isFinite(parsed)) {
    return 0.3;
  }
  return Math.min(0.45, Math.max(0.12, parsed));
};

const resolveTrainerLowerRatio = (hasTopIndicator: boolean, hasBottomIndicator: boolean): number => {
  const indicatorCount = Number(hasTopIndicator) + Number(hasBottomIndicator);
  if (indicatorCount >= 2) {
    return 0.24;
  }
  if (indicatorCount === 1) {
    return 0.2;
  }
  return 0.16;
};

export const applyTrainerIndicatorPaneLayoutWithLockedVolume = (
  chart: Chart,
  containerHeight: number,
  hasTopIndicatorConfigured: boolean,
  hasBottomIndicatorConfigured: boolean,
  showSubIndicators: boolean,
  showVolumePane = true
) => {
  if (containerHeight <= 0) {
    return;
  }

  if (!showVolumePane) {
    const showTopIndicator = showSubIndicators && hasTopIndicatorConfigured;
    const showBottomIndicator = showSubIndicators && hasBottomIndicatorConfigured;
    const indicatorCount = Number(showTopIndicator) + Number(showBottomIndicator);
    const lowerRatio = indicatorCount >= 2 ? 0.24 : indicatorCount === 1 ? 0.2 : 0;
    const indicatorTotalHeight = Math.max(0, Math.floor(containerHeight * lowerRatio));
    const indicatorHeight = indicatorCount > 0 ? Math.max(1, Math.floor(indicatorTotalHeight / indicatorCount)) : 0;
    const candleHeight = Math.max(1, containerHeight - indicatorHeight * indicatorCount);

    chart.setPaneOptions({
      id: INDICATOR_PANES.candle,
      state: 'normal',
      height: candleHeight,
      minHeight: 72,
      dragEnabled: true
    });
    chart.setPaneOptions({
      id: INDICATOR_PANES.volume,
      state: 'minimize',
      height: 1,
      minHeight: 1,
      dragEnabled: false
    });
    chart.setPaneOptions({
      id: INDICATOR_PANES.signalTop,
      state: showTopIndicator ? 'normal' : 'minimize',
      height: showTopIndicator ? indicatorHeight : 1,
      minHeight: showTopIndicator ? Math.min(resolveDetachedIndicatorPaneMinHeight(22), indicatorHeight) : 1,
      dragEnabled: showTopIndicator,
      axis: createDetachedIndicatorPaneAxis(true)
    });
    chart.setPaneOptions({
      id: INDICATOR_PANES.signalBottom,
      state: showBottomIndicator ? 'normal' : 'minimize',
      height: showBottomIndicator ? indicatorHeight : 1,
      minHeight: showBottomIndicator ? Math.min(resolveDetachedIndicatorPaneMinHeight(22), indicatorHeight) : 1,
      dragEnabled: showBottomIndicator,
      axis: createDetachedIndicatorPaneAxis(true)
    });
    return;
  }

  const { lowerTotal } = resolvePaneHeights(
    containerHeight,
    resolveTrainerLowerRatio(hasTopIndicatorConfigured, hasBottomIndicatorConfigured)
  );
  const configuredIndicatorCount = Number(hasTopIndicatorConfigured) + Number(hasBottomIndicatorConfigured);
  const baselineLowerPaneCount = Math.max(1, 1 + configuredIndicatorCount);
  const each = Math.max(1, Math.floor(lowerTotal / baselineLowerPaneCount));
  const remainder = lowerTotal - each * baselineLowerPaneCount;
  const volumeHeight = each + remainder;
  const indicatorHeight = each;
  const showTopIndicator = showSubIndicators && hasTopIndicatorConfigured;
  const showBottomIndicator = showSubIndicators && hasBottomIndicatorConfigured;
  const candleHeight = Math.max(
    1,
    containerHeight - volumeHeight - (showTopIndicator ? indicatorHeight : 0) - (showBottomIndicator ? indicatorHeight : 0)
  );

  chart.setPaneOptions({
    id: INDICATOR_PANES.candle,
    state: 'normal',
    height: candleHeight,
    minHeight: 72,
    dragEnabled: true
  });
  chart.setPaneOptions({
    id: INDICATOR_PANES.volume,
    state: 'normal',
    height: volumeHeight,
    minHeight: Math.min(resolveDetachedIndicatorPaneMinHeight(22), volumeHeight),
    dragEnabled: true,
    axis: createDetachedIndicatorPaneAxis()
  });
  chart.setPaneOptions({
    id: INDICATOR_PANES.signalTop,
    state: showTopIndicator ? 'normal' : 'minimize',
    height: showTopIndicator ? indicatorHeight : 1,
    minHeight: showTopIndicator ? Math.min(resolveDetachedIndicatorPaneMinHeight(22), indicatorHeight) : 1,
    dragEnabled: showTopIndicator,
    axis: createDetachedIndicatorPaneAxis(true)
  });
  chart.setPaneOptions({
    id: INDICATOR_PANES.signalBottom,
    state: showBottomIndicator ? 'normal' : 'minimize',
    height: showBottomIndicator ? indicatorHeight : 1,
    minHeight: showBottomIndicator ? Math.min(resolveDetachedIndicatorPaneMinHeight(22), indicatorHeight) : 1,
    dragEnabled: showBottomIndicator,
    axis: createDetachedIndicatorPaneAxis(true)
  });
};

export const applyHistoryIndicatorPaneLayout = (
  chart: Chart,
  containerHeight: number,
  hasTopIndicator: boolean,
  hasBottomIndicator: boolean,
  lowerRatio?: number
) => {
  if (containerHeight <= 0) {
    return;
  }

  const visibleIndicators = Number(hasTopIndicator) + Number(hasBottomIndicator);
  const lowerPaneCount = Math.max(1, 1 + visibleIndicators);
  const drawableHeight = resolveHistoryDrawablePaneHeight(chart, containerHeight, 1 + lowerPaneCount);
  const { lowerTotal, candleHeight } = resolvePaneHeights(drawableHeight, resolveHistoryLowerRatio(lowerRatio));
  const each = Math.max(1, Math.floor(lowerTotal / lowerPaneCount));
  const remainder = lowerTotal - each * lowerPaneCount;
  const volumeHeight = each + remainder;
  const indicatorHeight = each;

  chart.setPaneOptions({
    id: INDICATOR_PANES.candle,
    state: 'normal',
    height: candleHeight,
    minHeight: 60,
    dragEnabled: true
  });
  chart.setPaneOptions({
    id: INDICATOR_PANES.volume,
    state: 'normal',
    height: volumeHeight,
    minHeight: Math.min(resolveDetachedIndicatorPaneMinHeight(30), volumeHeight),
    dragEnabled: true,
    axis: createDetachedIndicatorPaneAxis()
  });

  if (hasTopIndicator) {
    chart.setPaneOptions({
      id: INDICATOR_PANES.signalTop,
      state: 'normal',
      height: indicatorHeight,
      minHeight: Math.min(resolveDetachedIndicatorPaneMinHeight(30), indicatorHeight),
      dragEnabled: true,
      axis: createDetachedIndicatorPaneAxis(true)
    });
  }

  if (hasBottomIndicator) {
    chart.setPaneOptions({
      id: INDICATOR_PANES.signalBottom,
      state: 'normal',
      height: indicatorHeight,
      minHeight: Math.min(resolveDetachedIndicatorPaneMinHeight(30), indicatorHeight),
      dragEnabled: true,
      axis: createDetachedIndicatorPaneAxis(true)
    });
  }
};

export const applyHistoryIndicatorPaneLayoutWithLockedVolume = (
  chart: Chart,
  containerHeight: number,
  hasTopIndicatorConfigured: boolean,
  hasBottomIndicatorConfigured: boolean,
  showSubIndicators: boolean,
  lowerRatio?: number
) => {
  if (containerHeight <= 0) {
    return;
  }

  const configuredIndicatorCount = Number(hasTopIndicatorConfigured) + Number(hasBottomIndicatorConfigured);
  const baselineLowerPaneCount = Math.max(1, 1 + configuredIndicatorCount);
  const drawableHeight = resolveHistoryDrawablePaneHeight(chart, containerHeight, 1 + baselineLowerPaneCount);
  const { lowerTotal } = resolvePaneHeights(drawableHeight, resolveHistoryLowerRatio(lowerRatio));
  const each = Math.max(1, Math.floor(lowerTotal / baselineLowerPaneCount));
  const remainder = lowerTotal - each * baselineLowerPaneCount;
  const volumeHeight = each + remainder;
  const indicatorHeight = each;
  const showTopIndicator = showSubIndicators && hasTopIndicatorConfigured;
  const showBottomIndicator = showSubIndicators && hasBottomIndicatorConfigured;
  const candleHeight = Math.max(
    1,
    drawableHeight - volumeHeight - (showTopIndicator ? indicatorHeight : 0) - (showBottomIndicator ? indicatorHeight : 0)
  );

  chart.setPaneOptions({
    id: INDICATOR_PANES.candle,
    state: 'normal',
    height: candleHeight,
    minHeight: 60,
    dragEnabled: true
  });
  chart.setPaneOptions({
    id: INDICATOR_PANES.volume,
    state: 'normal',
    height: volumeHeight,
    minHeight: Math.min(resolveDetachedIndicatorPaneMinHeight(30), volumeHeight),
    dragEnabled: true,
    axis: createDetachedIndicatorPaneAxis()
  });
  chart.setPaneOptions({
    id: INDICATOR_PANES.signalTop,
    state: showTopIndicator ? 'normal' : 'minimize',
    height: showTopIndicator ? indicatorHeight : 1,
    minHeight: showTopIndicator ? Math.min(resolveDetachedIndicatorPaneMinHeight(30), indicatorHeight) : 1,
    dragEnabled: showTopIndicator,
    axis: createDetachedIndicatorPaneAxis(true)
  });
  chart.setPaneOptions({
    id: INDICATOR_PANES.signalBottom,
    state: showBottomIndicator ? 'normal' : 'minimize',
    height: showBottomIndicator ? indicatorHeight : 1,
    minHeight: showBottomIndicator ? Math.min(resolveDetachedIndicatorPaneMinHeight(30), indicatorHeight) : 1,
    dragEnabled: showBottomIndicator,
    axis: createDetachedIndicatorPaneAxis(true)
  });
};
