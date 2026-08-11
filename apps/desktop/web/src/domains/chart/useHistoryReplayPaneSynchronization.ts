// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, type MutableRefObject } from 'react';
import type { Chart } from 'klinecharts';
import {
  createMainChartStyles,
  getPriceColorPalette,
  type ChartDisplayEdgeConfig,
  type PriceColorMode,
} from '@/domains/chart/display';
import {
  applyIndicatorStyles,
  INDICATOR_IDS,
  INDICATOR_PANES,
  isIndicatorNone,
  mountMainIndicator,
  mountSignalIndicator,
  mountVolumeIndicator,
  type SignalIndicatorName,
} from '@/domains/indicators';
import {
  applyHistoryCandlePaneAxisOptions,
  applyHistoryChartStyleOverrides,
} from '@/domains/chart/historyReplayChartRuntimeHelpers';
import type {
  ChartStylesPayload,
  HistoryReplayChartBindings,
  HistoryReplayChartViewProps,
  UiLanguage,
} from '@/domains/chart/HistoryReplayChartTypes';
import {
  mountHistoryEquityPaneIndicator,
} from '@/domains/chart/historyReplayEquityPane';
import type { StableElementResizeObserverHandle } from '@/domains/chart/chartStableResize';

type UseHistoryReplayPaneSynchronizationParams = {
  adjustPaneHeights: () => void;
  applyMaxOffsetRightDistance: (chart: Chart) => void;
  archivedHistoryMainIndicator: SignalIndicatorName;
  archivedHistoryMainIndicatorParams: number[];
  bindings: HistoryReplayChartBindings;
  chartReadyVersion: number;
  chartRef: MutableRefObject<Chart | null>;
  chartRenderMode: NonNullable<HistoryReplayChartViewProps['chartRenderMode']>;
  chartTypographySignature: string;
  edgeConfig: ChartDisplayEdgeConfig;
  effectiveShowVolumePane: boolean;
  equityPaneRows: readonly { equity: number | null }[];
  equityPaneSignature: string;
  equityPaneTitle: string;
  hasBottomSubIndicator: boolean;
  hasEquityCurvePane: boolean;
  hasTopSubIndicator: boolean;
  hideLastPriceLine: boolean;
  hideNativeTooltip: boolean;
  historyBottomIndicator: SignalIndicatorName;
  historyBottomIndicatorParams: number[];
  historyDisplayPeriod: HistoryReplayChartViewProps['displayPeriod'];
  historyTopIndicator: SignalIndicatorName;
  historyTopIndicatorParams: number[];
  isChartSettingsIndicatorClickEnabled: boolean;
  language: UiLanguage;
  lastHistoryEquityPaneKeyRef: MutableRefObject<string>;
  lastHistoryMainIndicatorMountKeyRef: MutableRefObject<string>;
  lastHistoryVolumePaneKeyRef: MutableRefObject<string>;
  priceColorMode: PriceColorMode;
  resizeObserverHandleRef: MutableRefObject<StableElementResizeObserverHandle | null>;
  showSubIndicators: boolean;
  suppressNativeIndicators: boolean;
  themeMode: 'light' | 'dark';
};

export const useHistoryReplayPaneSynchronization = ({
  adjustPaneHeights,
  applyMaxOffsetRightDistance,
  archivedHistoryMainIndicator,
  archivedHistoryMainIndicatorParams,
  bindings,
  chartReadyVersion,
  chartRef,
  chartRenderMode,
  chartTypographySignature,
  edgeConfig,
  effectiveShowVolumePane,
  equityPaneRows,
  equityPaneSignature,
  equityPaneTitle,
  hasBottomSubIndicator,
  hasEquityCurvePane,
  hasTopSubIndicator,
  hideLastPriceLine,
  hideNativeTooltip,
  historyBottomIndicator,
  historyBottomIndicatorParams,
  historyDisplayPeriod,
  historyTopIndicator,
  historyTopIndicatorParams,
  isChartSettingsIndicatorClickEnabled,
  language,
  lastHistoryEquityPaneKeyRef,
  lastHistoryMainIndicatorMountKeyRef,
  lastHistoryVolumePaneKeyRef,
  priceColorMode,
  resizeObserverHandleRef,
  showSubIndicators,
  suppressNativeIndicators,
  themeMode,
}: UseHistoryReplayPaneSynchronizationParams): void => {
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const nextVolumePaneKey = effectiveShowVolumePane ? 'visible' : 'hidden';
    if (lastHistoryVolumePaneKeyRef.current === nextVolumePaneKey) {
      return;
    }
    lastHistoryVolumePaneKeyRef.current = nextVolumePaneKey;
    chart.removeIndicator({ id: INDICATOR_IDS.historyVolumeMain });
    if (effectiveShowVolumePane) {
      mountVolumeIndicator({
        chart,
        indicatorId: INDICATOR_IDS.historyVolumeMain,
        height: 92,
        minHeight: 28,
      });
    }
    applyIndicatorStyles(chart, priceColorMode, [
      { id: INDICATOR_IDS.historyVolumeMain, name: 'VOL', enabled: effectiveShowVolumePane },
    ]);
    adjustPaneHeights();
  }, [
    adjustPaneHeights,
    chartReadyVersion,
    chartRef,
    effectiveShowVolumePane,
    lastHistoryVolumePaneKeyRef,
    priceColorMode,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const nextEquityPaneKey = hasEquityCurvePane
      ? `${equityPaneSignature}|${priceColorMode}`
      : 'hidden';
    if (lastHistoryEquityPaneKeyRef.current === nextEquityPaneKey) {
      return;
    }
    lastHistoryEquityPaneKeyRef.current = nextEquityPaneKey;
    chart.removeIndicator({ id: INDICATOR_IDS.historyEquityCurve });
    if (!hasEquityCurvePane) {
      adjustPaneHeights();
      return;
    }
    mountHistoryEquityPaneIndicator({
      chart,
      title: equityPaneTitle,
      rows: equityPaneRows,
      color: getPriceColorPalette(priceColorMode).up,
    });
    adjustPaneHeights();
    resizeObserverHandleRef.current?.force();
  }, [
    adjustPaneHeights,
    chartReadyVersion,
    chartRef,
    equityPaneRows,
    equityPaneSignature,
    equityPaneTitle,
    hasEquityCurvePane,
    lastHistoryEquityPaneKeyRef,
    priceColorMode,
    resizeObserverHandleRef,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const mainIndicatorMountKey = [
      archivedHistoryMainIndicator,
      archivedHistoryMainIndicatorParams.join(','),
      suppressNativeIndicators ? 'disabled' : 'enabled',
    ].join('|');
    if (lastHistoryMainIndicatorMountKeyRef.current === mainIndicatorMountKey) {
      return;
    }
    lastHistoryMainIndicatorMountKeyRef.current = mainIndicatorMountKey;
    chart.removeIndicator({ id: INDICATOR_IDS.historyMainNative });
    if (!suppressNativeIndicators && !isIndicatorNone(archivedHistoryMainIndicator)) {
      mountMainIndicator({
        chart,
        indicatorId: INDICATOR_IDS.historyMainNative,
        indicatorName: archivedHistoryMainIndicator,
        calcParams: archivedHistoryMainIndicatorParams,
        priceColorMode,
      });
    }
    applyIndicatorStyles(chart, priceColorMode, [
      {
        id: INDICATOR_IDS.historyMainNative,
        name: archivedHistoryMainIndicator,
        enabled:
          !suppressNativeIndicators && !isIndicatorNone(archivedHistoryMainIndicator),
        enableChartSettingsTooltip: isChartSettingsIndicatorClickEnabled,
      },
    ]);
  }, [
    archivedHistoryMainIndicator,
    archivedHistoryMainIndicatorParams,
    chartReadyVersion,
    chartRef,
    isChartSettingsIndicatorClickEnabled,
    lastHistoryMainIndicatorMountKeyRef,
    priceColorMode,
    suppressNativeIndicators,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !historyDisplayPeriod) {
      return;
    }
    chart.setPeriod(bindings.toKlinePeriod(historyDisplayPeriod));
    applyHistoryCandlePaneAxisOptions(chart);
  }, [bindings, chartReadyVersion, chartRef, historyDisplayPeriod]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.setStyles(
      applyHistoryChartStyleOverrides(
        createMainChartStyles(
          themeMode,
          priceColorMode,
          edgeConfig,
          chartRenderMode,
          language,
        ) as ChartStylesPayload,
        { hideLastPriceLine, hideNativeTooltip },
      ),
    );
    chart.setRightMinVisibleBarCount(edgeConfig.minRightVisibleBars);
    applyHistoryCandlePaneAxisOptions(chart);
    applyIndicatorStyles(chart, priceColorMode, [
      { id: INDICATOR_IDS.historyVolumeMain, name: 'VOL', enabled: effectiveShowVolumePane },
      {
        id: INDICATOR_IDS.historyMainNative,
        name: archivedHistoryMainIndicator,
        enabled: !isIndicatorNone(archivedHistoryMainIndicator),
        enableChartSettingsTooltip: isChartSettingsIndicatorClickEnabled,
      },
      {
        id: INDICATOR_IDS.historySignalTop,
        name: historyTopIndicator,
        enabled: hasTopSubIndicator,
        enableChartSettingsTooltip: isChartSettingsIndicatorClickEnabled,
      },
      {
        id: INDICATOR_IDS.historySignalBottom,
        name: historyBottomIndicator,
        enabled: hasBottomSubIndicator,
        enableChartSettingsTooltip: isChartSettingsIndicatorClickEnabled,
      },
    ]);
    applyMaxOffsetRightDistance(chart);
    adjustPaneHeights();
  }, [
    adjustPaneHeights,
    applyMaxOffsetRightDistance,
    archivedHistoryMainIndicator,
    bindings,
    chartReadyVersion,
    chartRef,
    chartRenderMode,
    chartTypographySignature,
    edgeConfig,
    edgeConfig.minRightVisibleBars,
    effectiveShowVolumePane,
    hasBottomSubIndicator,
    hasTopSubIndicator,
    hideLastPriceLine,
    hideNativeTooltip,
    historyBottomIndicator,
    historyTopIndicator,
    isChartSettingsIndicatorClickEnabled,
    language,
    priceColorMode,
    themeMode,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    chart.removeIndicator({ paneId: INDICATOR_PANES.signalTop });
    chart.removeIndicator({ paneId: INDICATOR_PANES.signalBottom });

    if (showSubIndicators) {
      if (hasTopSubIndicator) {
        mountSignalIndicator({
          chart,
          indicatorId: INDICATOR_IDS.historySignalTop,
          indicatorName: historyTopIndicator,
          calcParams: historyTopIndicatorParams,
          priceColorMode,
          panePreset: 'historyTop',
        });
      }

      if (hasBottomSubIndicator) {
        mountSignalIndicator({
          chart,
          indicatorId: INDICATOR_IDS.historySignalBottom,
          indicatorName: historyBottomIndicator,
          calcParams: historyBottomIndicatorParams,
          priceColorMode,
          panePreset: 'historyBottom',
        });
      }
    }

    applyIndicatorStyles(chart, priceColorMode, [
      { id: INDICATOR_IDS.historyVolumeMain, name: 'VOL', enabled: effectiveShowVolumePane },
      {
        id: INDICATOR_IDS.historySignalTop,
        name: historyTopIndicator,
        enabled: showSubIndicators && hasTopSubIndicator,
        enableChartSettingsTooltip: isChartSettingsIndicatorClickEnabled,
      },
      {
        id: INDICATOR_IDS.historySignalBottom,
        name: historyBottomIndicator,
        enabled: showSubIndicators && hasBottomSubIndicator,
        enableChartSettingsTooltip: isChartSettingsIndicatorClickEnabled,
      },
    ]);
    adjustPaneHeights();
  }, [
    adjustPaneHeights,
    chartReadyVersion,
    chartRef,
    effectiveShowVolumePane,
    hasBottomSubIndicator,
    hasTopSubIndicator,
    historyBottomIndicator,
    historyBottomIndicatorParams,
    historyTopIndicator,
    historyTopIndicatorParams,
    isChartSettingsIndicatorClickEnabled,
    priceColorMode,
    showSubIndicators,
  ]);
};
