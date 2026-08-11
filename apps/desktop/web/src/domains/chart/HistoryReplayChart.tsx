// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dispose, init, type Chart, type Crosshair, type KLineData, type Point } from 'klinecharts';
import {
  CHART_RENDER_MODE_GROUP_LABEL_BY_LANGUAGE,
  CHART_RENDER_MODE_LABELS_BY_LANGUAGE,
  INDICATOR_LABEL_BY_LANGUAGE,
  PERIOD_ORIGIN_PREFIX_BY_LANGUAGE,
  PERIOD_TITLE_BY_LANGUAGE,
  getDisplayPeriodLabel,
  isDisplayPeriodKey } from
'@/ui/config/uiConfig';
import { formatInputThousands, formatRatio } from '@/ui/formatting/format';
import type { BaseTimeframe, DisplayPeriodKey } from '@/domains/chart/chartPeriods';
import {
  HISTORY_PREVIEW_CHART_EDGE_CONFIG,
  createMainChartStyles,
  resolveMaxOffsetRightDistanceByVisibleBars } from
'@/domains/chart/display';
import { buildChartSymbolInfo } from '@/domains/chart/pricePrecision';
import {
  applyHistoryIndicatorPaneLayout,
  applyHistoryIndicatorPaneLayoutWithLockedVolume,
  clearIndicatorTooltipFeatureActiveState,
  createDetachedIndicatorPaneAxis,
  INDICATOR_PANES,
  registerCustomIndicators,
  resolveChartSettingsIndicatorTooltipLabelTarget,
  resolveChartSettingsIndicatorTooltipTarget,
} from '@/domains/indicators';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import { resolveKlineLocale } from '@/ui/config/frameworkKlineI18n';
import { ReplayChartViewport } from '@/domains/chart/ReplayChartViewport';
import { findAggregatedBarIndexByRawIndex } from '@/domains/chart/replayIndexing';
import { shouldShowVolumePaneForReplayBars } from '@/domains/chart/volumeAvailability';
import { resolveCurrentBarChangeRatio } from '@/domains/chart/barChangeRatio';
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx
} from '@/frontend-kernel/typography';
import {
  constrainReplayArchiveRecordForFrontend,
} from '@/api';
import {
  attachStableElementResizeObserver,
  whenElementRenderable,
  type StableElementResizeObserverHandle
} from '@/domains/chart/chartStableResize';
import {
  HISTORY_REPLAY_CUSTOM_SCRIPT_PANE_ID,
  useHistoryReplayCustomScriptIndicator,
} from '@/domains/chart/useHistoryReplayCustomScriptIndicator';
import {
  buildHistoryEquityPaneRows,
  buildHistoryEquityPaneSignature,
} from '@/domains/chart/historyReplayEquityPane';
import {
  resolveReplaySnapshotSession,
  type AggregatedBarItem,
  type ChartStylesPayload,
  type HistoryReplayChartDataWindow,
  type HistoryReplayChartViewProps,
  type HistorySubIndicatorOverride,
  type ReplayArchiveData,
  type ReplayBar,
} from '@/domains/chart/HistoryReplayChartTypes';
import {
  buildReplayDrawingOverlaySignature,
  buildReplaySystemMarkerSignature,
} from '@/domains/chart/historyReplayChartSignatures';
import {
  applyHistoryCandlePaneAxisOptions,
  applyHistoryChartStyleOverrides,
  clamp,
  mapBarToKline,
  resolveVisibleRangeBarCount,
} from '@/domains/chart/historyReplayChartRuntimeHelpers';
import { useHistoryReplayArchivedOverlays } from '@/domains/chart/useHistoryReplayArchivedOverlays';
import { useHistoryReplayPaneSynchronization } from '@/domains/chart/useHistoryReplayPaneSynchronization';
import { useHistoryReplayIndicatorState } from '@/domains/chart/useHistoryReplayIndicatorState';
import { useHistoryReplayIndicatorToggle } from '@/domains/chart/useHistoryReplayIndicatorToggle';
import { resolveDetachedLowerRatio } from '@/domains/chart/historyReplayChartLayout';

export type {
  HistoryReplayChartBindings,
  HistoryReplayChartViewProps,
} from '@/domains/chart/HistoryReplayChartTypes';

export const HistoryReplayChartView = ({
  project,
  themeMode,
  showGlobalDecimals = true,
  priceColorMode,
  tradeColorTheme,
  createSystemMarkers,
  language,
  trainerPeriodOptionsByBase,
  displayPeriod,
  bindings,
  initialDisplayPeriod,
  edgeConfig = HISTORY_PREVIEW_CHART_EDGE_CONFIG,
  onDisplayPeriodChange,
  onOpenChartSettings,
  isChartSettingsActive = false,
  disableIndicators = false,
  customScriptIndicator = null,
  equityCurvePane = null,
  showChartRenderModeSwitch = true,
  showIndicatorButton = true,
  showPeriodSwitch = true,
  showSubIndicatorToggle = false,
  defaultShowSubIndicators = true,
  chartRenderMode = 'CANDLE',
  onChartRenderModeChange,
  focusRawBarIndex = null,
  focusRequestNonce = 0,
  focusBehavior = 'scroll-and-select',
  focusMarker = null,
  toolbarLeadingContent,
  changeBubblePlacement = 'float',
  hideLastPriceLine = false,
  hideNativeTooltip = false,
  showReplayDrawings = true,
  systemMarkerMode = 'ALL',
  showEntryBoundaryLine = false,
  showVolumePane = true,
  volumePaneRatio
}: HistoryReplayChartViewProps) => {
  const chartDomRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const historyReplayDataWindowRef = useRef<HistoryReplayChartDataWindow>({
    klineData: [],
    bars: [],
    visibleItems: [],
    hasBackward: false,
    hasForward: false,
  });
  const replayBarsRef = useRef<ReplayBar[]>([]);
  const replayVisibleItemsRef = useRef<AggregatedBarItem[]>([]);
  const createSystemMarkersRef = useRef(createSystemMarkers);
  const onDisplayPeriodChangeRef = useRef(onDisplayPeriodChange);
  const onOpenChartSettingsRef = useRef(onOpenChartSettings);
  const refreshArchivedOverlaysRef = useRef<() => void>(() => undefined);
  const adjustPaneHeightsRef = useRef<() => void>(() => undefined);
  const applyMaxOffsetRightDistanceRef = useRef<(chart: Chart) => void>(
    () => undefined,
  );
  const resizeObserverHandleRef = useRef<StableElementResizeObserverHandle | null>(null);
  const lastViewportKeyRef = useRef('');
  const chartDataSignatureRef = useRef('');
  const chartOverlaySignatureRef = useRef('');
  const lastHistoryVolumePaneKeyRef = useRef('');
  const lastHistoryEquityPaneKeyRef = useRef('');
  const lastHistoryMainIndicatorMountKeyRef = useRef('');
  const lastAppliedFocusSignatureRef = useRef('');
  const projectReplay = project?.replay ?? null;
  const replay = useMemo<ReplayArchiveData | null>(
    () =>
      constrainReplayArchiveRecordForFrontend(
        projectReplay as (ReplayArchiveData & Record<string, unknown>) | null,
      ) as ReplayArchiveData | null,
    [projectReplay],
  );
  const replayDisplayPeriod = isDisplayPeriodKey(replay?.displayPeriod)
    ? replay.displayPeriod
    : undefined;
  const [selectedDataIndex, setSelectedDataIndex] = useState<number | null>(null);
  const [chartReadyVersion, setChartReadyVersion] = useState(0);
  const chartTypographySignature = `${getGlobalTypographyFontFamily('ui')}|${getGlobalTypographyFontFamily('mono')}|${getGlobalTypographyReferencePx("r1")}`;
  const [historySubIndicatorOverride, setHistorySubIndicatorOverride] =
    useState<HistorySubIndicatorOverride | null>(null);
  const [historyDisplayPeriod, setHistoryDisplayPeriod] = useState<DisplayPeriodKey>(() =>
    isDisplayPeriodKey(displayPeriod)
      ? displayPeriod
      : isDisplayPeriodKey(initialDisplayPeriod)
        ? initialDisplayPeriod
        : replayDisplayPeriod ?? '1d'
  );
  const [showSubIndicators, setShowSubIndicators] = useState(defaultShowSubIndicators);
  const hasCustomScriptIndicator = String(customScriptIndicator?.source ?? '').trim().length > 0;
  const suppressNativeIndicators = disableIndicators || hasCustomScriptIndicator;
  const isChartSettingsIndicatorClickEnabled =
    !suppressNativeIndicators &&
    showIndicatorButton &&
    typeof onOpenChartSettings === 'function';
  const commitDisplayPeriod = useCallback((period: DisplayPeriodKey) => {
    setHistoryDisplayPeriod(period);
    onDisplayPeriodChangeRef.current?.(period);
  }, []);

  const replayBars = useMemo(() => Array.isArray(replay?.bars) ? replay.bars : [], [replay]);
  const effectiveShowVolumePane = showVolumePane && shouldShowVolumePaneForReplayBars(replayBars);
  const replaySnapshot = replay?.snapshot ?? null;
  const replaySnapshotSession = useMemo(
    () => resolveReplaySnapshotSession(replaySnapshot),
    [replaySnapshot]
  );
  const replaySystemMarkerSignature = useMemo(
    () => buildReplaySystemMarkerSignature(replaySnapshot),
    [replaySnapshot]
  );

  const historyBaseTimeframe = useMemo<BaseTimeframe>(() => {
    const raw = replay?.baseTimeframe;
    if (raw === '1m' || raw === '5m' || raw === '1h' || raw === '1d') {
      return raw;
    }
    return bindings.inferBaseTimeframeFromBars(replayBars);
  }, [bindings, replay?.baseTimeframe, replayBars]);

  const historyPeriodOptions = useMemo<DisplayPeriodKey[]>(() => {
    const allowed = bindings.periodOptionsByBaseTimeframe[historyBaseTimeframe];
    const fallback = bindings.defaultTrainerPeriodOptionsByBase[historyBaseTimeframe];
    const primary = bindings.defaultTrainerDisplayPeriodByBase[historyBaseTimeframe];
    const configured = Array.isArray(trainerPeriodOptionsByBase[historyBaseTimeframe]) ?
    trainerPeriodOptionsByBase[historyBaseTimeframe].filter((item) => allowed.includes(item)) :
    [...fallback];
    const merged = configured.length ? [...configured] : [...fallback];
    if (!merged.includes(primary)) {
      merged.unshift(primary);
    }
    return merged;
  }, [bindings, historyBaseTimeframe, trainerPeriodOptionsByBase]);

  useEffect(() => {
    createSystemMarkersRef.current = createSystemMarkers;
  }, [createSystemMarkers]);

  useEffect(() => {
    onDisplayPeriodChangeRef.current = onDisplayPeriodChange;
  }, [onDisplayPeriodChange]);

  useEffect(() => {
    onOpenChartSettingsRef.current = onOpenChartSettings;
  }, [onOpenChartSettings]);

  useEffect(() => {
    if (isDisplayPeriodKey(displayPeriod)) {
      setHistoryDisplayPeriod((current) => current === displayPeriod ? current : displayPeriod);
    }
  }, [displayPeriod, project?.id]);

  useEffect(() => {
    if (isDisplayPeriodKey(displayPeriod)) {
      return;
    }
    if (!isDisplayPeriodKey(initialDisplayPeriod)) {
      return;
    }
    setHistoryDisplayPeriod((current) => current === initialDisplayPeriod ? current : initialDisplayPeriod);
  }, [displayPeriod, initialDisplayPeriod, project?.id]);

  useEffect(() => {
    if (isDisplayPeriodKey(displayPeriod) || isDisplayPeriodKey(initialDisplayPeriod) || !replayDisplayPeriod) {
      return;
    }
    setHistoryDisplayPeriod((current) => current === replayDisplayPeriod ? current : replayDisplayPeriod);
  }, [displayPeriod, initialDisplayPeriod, project?.id, replayDisplayPeriod]);

  useEffect(() => {
    setHistoryDisplayPeriod((current) => {
      if (historyPeriodOptions.includes(current)) {
        return current;
      }
      const fallback = historyPeriodOptions[0] ?? bindings.defaultTrainerDisplayPeriodByBase[historyBaseTimeframe];
      onDisplayPeriodChangeRef.current?.(fallback);
      return fallback;
    });
  }, [bindings, historyBaseTimeframe, historyPeriodOptions]);

  const replayVisibleItems = useMemo<AggregatedBarItem[]>(
    () => bindings.aggregateBarsByPeriod(replayBars, historyDisplayPeriod, 0, replayBars.length - 1),
    [bindings, historyDisplayPeriod, replayBars]
  );

  const historyTooltipSymbol = useMemo(
    () => (project?.symbol || replaySnapshotSession?.symbol || '').trim().toUpperCase(),
    [project?.symbol, replaySnapshotSession?.symbol]
  );

  const replayData = useMemo<KLineData[]>(
    () => replayVisibleItems.map((item) => ({ ...mapBarToKline(item), symbol: historyTooltipSymbol })),
    [historyTooltipSymbol, replayVisibleItems]
  );
  const replayDataWindow = useMemo<HistoryReplayChartDataWindow>(
    () => ({
      klineData: replayData,
      bars: replayBars,
      visibleItems: replayVisibleItems,
      hasBackward: Boolean(replay?.barWindow?.hasBackward),
      hasForward: Boolean(replay?.barWindow?.hasForward),
    }),
    [
      replay?.barWindow?.hasBackward,
      replay?.barWindow?.hasForward,
      replayBars,
      replayData,
      replayVisibleItems,
    ],
  );
  const equityPaneRows = useMemo(
    () => buildHistoryEquityPaneRows(equityCurvePane?.points, replayVisibleItems),
    [equityCurvePane?.points, replayVisibleItems],
  );
  const equityPaneTitle =
    String(equityCurvePane?.title ?? '').trim() || tt('uiLabels.ui.statsEquityCurveTitle');
  const hasEquityCurvePane = equityPaneRows.some((row) => Number.isFinite(row.equity));
  const equityPaneSignature = useMemo(
    () => buildHistoryEquityPaneSignature(equityPaneTitle, equityPaneRows),
    [equityPaneRows, equityPaneTitle],
  );

  const {
    archivedHistoryBottomIndicator,
    archivedHistoryBottomIndicatorParams,
    archivedHistorySignalConfigKey,
    archivedHistoryTopIndicator,
    archivedHistoryTopIndicatorParams,
    hasAnySubIndicator,
    hasBottomSubIndicator,
    hasTopSubIndicator,
    historyBottomIndicator,
    historyBottomIndicatorParams,
    historyMainIndicator,
    historyMainIndicatorParams,
    historyTopIndicator,
    historyTopIndicatorParams,
  } = useHistoryReplayIndicatorState({
    suppressNativeIndicators,
    chartIndicators: replay?.chartIndicators,
    historySubIndicatorOverride,
  });
  useEffect(() => {
    setShowSubIndicators(defaultShowSubIndicators);
  }, [defaultShowSubIndicators, project?.id]);

  useEffect(() => {
    setHistorySubIndicatorOverride(null);
  }, [archivedHistorySignalConfigKey, project?.id]);

  useEffect(() => {
    replayBarsRef.current = replayBars;
  }, [replayBars]);

  useEffect(() => {
    replayVisibleItemsRef.current = replayVisibleItems;
  }, [replayVisibleItems]);

  useEffect(() => {
    historyReplayDataWindowRef.current = replayDataWindow;
  }, [replayDataWindow]);

  const adjustPaneHeights = useCallback(() => {
    const chart = chartRef.current;
    const dom = chartDomRef.current;
    if (!chart || !dom) {
      return;
    }
    applyHistoryCandlePaneAxisOptions(chart);
    if (!effectiveShowVolumePane) {
      const showTopIndicator = showSubIndicatorToggle ? showSubIndicators && hasTopSubIndicator : hasTopSubIndicator;
      const showBottomIndicator = showSubIndicatorToggle ? showSubIndicators && hasBottomSubIndicator : hasBottomSubIndicator;
      const showEquityPane = hasEquityCurvePane;
      const customScriptPaneHeight = Number(
        chart.getSize(HISTORY_REPLAY_CUSTOM_SCRIPT_PANE_ID)?.height,
      );
      const showCustomScriptPane =
        hasCustomScriptIndicator &&
        Number.isFinite(customScriptPaneHeight) &&
        customScriptPaneHeight > 0;
      const indicatorCount =
        Number(showTopIndicator) +
        Number(showBottomIndicator) +
        Number(showEquityPane) +
        Number(showCustomScriptPane);
      const indicatorRatio = resolveDetachedLowerRatio(indicatorCount, volumePaneRatio);
      const indicatorTotalHeight = Math.max(0, Math.floor(dom.clientHeight * indicatorRatio));
      const indicatorHeight = indicatorCount > 0 ? Math.max(1, Math.floor(indicatorTotalHeight / indicatorCount)) : 0;
      const candleHeight = Math.max(1, dom.clientHeight - indicatorHeight * indicatorCount);

      chart.setPaneOptions({
        id: INDICATOR_PANES.candle,
        state: 'normal',
        height: candleHeight,
        minHeight: 60,
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
        minHeight: showTopIndicator ? 30 : 1,
        dragEnabled: showTopIndicator
      });
      chart.setPaneOptions({
        id: INDICATOR_PANES.signalBottom,
        state: showBottomIndicator ? 'normal' : 'minimize',
        height: showBottomIndicator ? indicatorHeight : 1,
        minHeight: showBottomIndicator ? 30 : 1,
        dragEnabled: showBottomIndicator
      });
      chart.setPaneOptions({
        id: HISTORY_REPLAY_CUSTOM_SCRIPT_PANE_ID,
        state: showCustomScriptPane ? 'normal' : 'minimize',
        height: showCustomScriptPane ? indicatorHeight : 1,
        minHeight: showCustomScriptPane ? Math.min(30, indicatorHeight) : 1,
        dragEnabled: showCustomScriptPane,
        axis: createDetachedIndicatorPaneAxis(true)
      });
      chart.setPaneOptions({
        id: INDICATOR_PANES.historyEquity,
        state: showEquityPane ? 'normal' : 'minimize',
        height: showEquityPane ? indicatorHeight : 1,
        minHeight: showEquityPane ? 30 : 1,
        dragEnabled: showEquityPane,
        axis: createDetachedIndicatorPaneAxis(true)
      });
      applyHistoryCandlePaneAxisOptions(chart);
      return;
    }
    if (showSubIndicatorToggle) {
      applyHistoryIndicatorPaneLayoutWithLockedVolume(
        chart,
        dom.clientHeight,
        hasTopSubIndicator,
        hasBottomSubIndicator,
        showSubIndicators,
        volumePaneRatio
      );
      applyHistoryCandlePaneAxisOptions(chart);
      return;
    }
    applyHistoryIndicatorPaneLayout(chart, dom.clientHeight, hasTopSubIndicator, hasBottomSubIndicator, volumePaneRatio);
    applyHistoryCandlePaneAxisOptions(chart);
  }, [
    hasBottomSubIndicator,
    hasTopSubIndicator,
    effectiveShowVolumePane,
    hasEquityCurvePane,
    hasCustomScriptIndicator,
    showSubIndicatorToggle,
    showSubIndicators,
    volumePaneRatio
  ]);

  const applyMaxOffsetRightDistance = useCallback((chart: Chart) => {
    chart.setMaxOffsetRightDistance(
      resolveMaxOffsetRightDistanceByVisibleBars(chart, edgeConfig, 50)
    );
  }, [edgeConfig]);

  useEffect(() => {
    adjustPaneHeightsRef.current = adjustPaneHeights;
  }, [adjustPaneHeights]);

  useEffect(() => {
    applyMaxOffsetRightDistanceRef.current = applyMaxOffsetRightDistance;
  }, [applyMaxOffsetRightDistance]);

  const scrollHistoryChartToCursorIndex = useCallback(
    (
      chart: Chart,
      rawIndex: number | null | undefined,
      animateDuration = 0,
    ) => {
      if (!replayVisibleItems.length || !Number.isFinite(rawIndex)) {
        return;
      }
      const normalizedRawIndex = clamp(
        Math.floor(rawIndex as number),
        0,
        Math.max(0, replayBars.length - 1),
      );
      const displayIndex = findAggregatedBarIndexByRawIndex(
        replayVisibleItems,
        normalizedRawIndex,
      );
      if (displayIndex < 0) {
        return;
      }
      const rightVisiblePadding = Math.max(
        0,
        Math.floor(edgeConfig.minRightVisibleBars),
      );
      const scrollTargetIndex = clamp(
        displayIndex + rightVisiblePadding,
        0,
        Math.max(0, replayVisibleItems.length - 1),
      );
      try {
        chart.scrollToDataIndex(scrollTargetIndex, animateDuration);
      } catch {
        // Ignore transient viewport sync failures so note switches stay alive.
      }
    },
    [edgeConfig.minRightVisibleBars, replayBars.length, replayVisibleItems],
  );

  const { refreshArchivedOverlays, renderDiagnosticFocusOverlay } =
    useHistoryReplayArchivedOverlays({
      bindings,
      chartDomRef,
      commitDisplayPeriod,
      createSystemMarkersRef,
      focusMarker,
      historyBaseTimeframe,
      historyDisplayPeriod,
      language,
      priceColorMode,
      projectId: project?.id ?? null,
      replay,
      replayBars,
      replayData,
      replaySnapshot,
      replaySnapshotSession,
      replayVisibleItems,
      showEntryBoundaryLine,
      showReplayDrawings,
      systemMarkerMode,
      themeMode,
      tradeColorTheme,
    });

  useEffect(() => {
    refreshArchivedOverlaysRef.current = () => {
      const chart = chartRef.current;
      if (!chart) {
        return;
      }
      refreshArchivedOverlays(chart);
    };
  }, [refreshArchivedOverlays]);

  useEffect(() => {
    bindings.registerCustomOverlays();
    registerCustomIndicators();

    const dom = chartDomRef.current;
    if (!dom) {
      return;
    }

    const runHistoryChartInit = (dom: HTMLDivElement): (() => void) | undefined => {
    const chart = init(dom, {
      locale: resolveKlineLocale(language),
      timezone: 'Asia/Shanghai',
      styles: applyHistoryChartStyleOverrides(
        createMainChartStyles(themeMode, priceColorMode, edgeConfig, chartRenderMode, language) as ChartStylesPayload,
        { hideLastPriceLine, hideNativeTooltip }
      )
    });
    if (!chart) {
      return;
    }

    chartRef.current = chart;
    setChartReadyVersion((current) => current + 1);
    applyHistoryCandlePaneAxisOptions(chart);
    chart.setZoomEnabled(true);
    chart.setScrollEnabled(true);
    chart.setRightMinVisibleBarCount(edgeConfig.minRightVisibleBars);
    applyMaxOffsetRightDistanceRef.current(chart);
    chart.setThousandsSeparator({
      sign: ',',
      format: (value) => formatInputThousands(String(value))
    });
    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        const currentWindow = historyReplayDataWindowRef.current;
        const loadMoreState = {
          backward: currentWindow.hasBackward,
          forward: currentWindow.hasForward,
        };
        if (type === 'init') {
          callback(currentWindow.klineData, loadMoreState);
          return;
        }
        callback([], loadMoreState);
      }
    });

    const handleCrosshair = (raw?: unknown) => {
      const payload = (raw ?? {}) as Partial<Crosshair>;
      let nextIndex: number | null = null;
      if (Number.isFinite(payload.dataIndex)) {
        const displayIndex = Math.floor(payload.dataIndex as number);
        const visibleItems = replayVisibleItemsRef.current;
        const clampedDisplay = clamp(displayIndex, 0, Math.max(0, visibleItems.length - 1));
        nextIndex = visibleItems[clampedDisplay]?.endRawIndex ?? null;
      } else if (payload.kLineData && Number.isFinite(payload.kLineData.timestamp)) {
        const ts = payload.kLineData.timestamp as number;
        const found = replayVisibleItemsRef.current.findIndex((item) => item.bucketStartMs === ts);
        if (found >= 0) {
          nextIndex = replayVisibleItemsRef.current[found].endRawIndex;
        }
      }
      if (nextIndex === null) {
        return;
      }
      const normalized = clamp(nextIndex, 0, Math.max(0, replayBarsRef.current.length - 1));
      setSelectedDataIndex(normalized);
    };

    chart.subscribeAction('onCrosshairChange', handleCrosshair);
    const handleIndicatorFeatureClick = (payload?: unknown) => {
      const featureId =
        typeof (payload as { feature?: { id?: unknown } })?.feature?.id === 'string'
          ? String((payload as { feature?: { id?: string } }).feature?.id)
          : '';
      const paneId =
        typeof (payload as { paneId?: unknown })?.paneId === 'string'
          ? String((payload as { paneId?: string }).paneId).trim()
          : '';
      const indicatorSelectTarget =
        resolveChartSettingsIndicatorTooltipLabelTarget(featureId);
      const chartSettingsTarget =
        resolveChartSettingsIndicatorTooltipTarget(featureId);
      if (!chartSettingsTarget && !indicatorSelectTarget) {
        return;
      }
      onOpenChartSettingsRef.current?.();
      clearIndicatorTooltipFeatureActiveState(chart, paneId || null);
    };
    chart.subscribeAction('onIndicatorTooltipFeatureClick', handleIndicatorFeatureClick);
    let zoomMarkerRaf = 0;
    const handleZoom = () => {
      if (zoomMarkerRaf) {
        window.cancelAnimationFrame(zoomMarkerRaf);
      }
      zoomMarkerRaf = window.requestAnimationFrame(() => {
        zoomMarkerRaf = 0;
        refreshArchivedOverlaysRef.current();
      });
    };
    chart.subscribeAction('onZoom', handleZoom);

    const resolveIndexFromMouse = (event: MouseEvent) => {
      const bars = replayBarsRef.current;
      if (!bars.length) {
        return;
      }
      const rect = dom.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const result = chart.convertFromPixel([{ x, y }], { paneId: INDICATOR_PANES.candle });
      const first = Array.isArray(result) ? result[0] : result;
      const idx = Number((first as Partial<Point> | undefined)?.dataIndex);
      if (!Number.isFinite(idx)) {
        return;
      }
      const visibleItems = replayVisibleItemsRef.current;
      if (!visibleItems.length) {
        return;
      }
      const displayIndex = clamp(Math.floor(idx), 0, Math.max(0, visibleItems.length - 1));
      setSelectedDataIndex(clamp(visibleItems[displayIndex].endRawIndex, 0, Math.max(0, bars.length - 1)));
    };

    const handleMouseMove = (event: MouseEvent) => resolveIndexFromMouse(event);
    const handleMouseEnter = (event: MouseEvent) => resolveIndexFromMouse(event);
    const handleMouseLeave = () => setSelectedDataIndex(null);
    dom.addEventListener('mousemove', handleMouseMove);
    dom.addEventListener('mouseenter', handleMouseEnter);
    dom.addEventListener('mouseleave', handleMouseLeave);

    const applyStableLayout = () => {
      chart.resize();
      applyMaxOffsetRightDistanceRef.current(chart);
      adjustPaneHeightsRef.current();
      refreshArchivedOverlaysRef.current();
      applyHistoryCandlePaneAxisOptions(chart);
    };
    const resizeObserverHandle = attachStableElementResizeObserver(dom, applyStableLayout);
    resizeObserverHandleRef.current = resizeObserverHandle;

    return () => {
      if (zoomMarkerRaf) {
        window.cancelAnimationFrame(zoomMarkerRaf);
      }
      chart.unsubscribeAction('onCrosshairChange', handleCrosshair);
      chart.unsubscribeAction('onIndicatorTooltipFeatureClick', handleIndicatorFeatureClick);
      chart.unsubscribeAction('onZoom', handleZoom);
      dom.removeEventListener('mousemove', handleMouseMove);
      dom.removeEventListener('mouseenter', handleMouseEnter);
      dom.removeEventListener('mouseleave', handleMouseLeave);
      resizeObserverHandle.disconnect();
      if (resizeObserverHandleRef.current === resizeObserverHandle) {
        resizeObserverHandleRef.current = null;
      }
      dispose(chart);
      chartRef.current = null;
    };
    };

    return whenElementRenderable(dom, () => runHistoryChartInit(dom));
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.setLocale(resolveKlineLocale(language));
    chart.setTimezone('Asia/Shanghai');
  }, [chartReadyVersion, language]);

  useHistoryReplayPaneSynchronization({
    adjustPaneHeights,
    applyMaxOffsetRightDistance,
    archivedHistoryMainIndicator: historyMainIndicator,
    archivedHistoryMainIndicatorParams: historyMainIndicatorParams,
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
  });

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const ticker = (project?.symbol || replaySnapshotSession?.symbol || '').trim().toUpperCase();
    if (ticker) {
      chart.setSymbol(buildChartSymbolInfo(ticker, replayData));
    }
    const nextDataSignature = JSON.stringify({
      projectId: project?.id ?? '',
      historyDisplayPeriod,
      ticker,
      visibleLength: replayVisibleItems.length,
      firstBucketStartMs: replayVisibleItems[0]?.bucketStartMs ?? null,
      lastBucketStartMs: replayVisibleItems[replayVisibleItems.length - 1]?.bucketStartMs ?? null
    });
    const shouldResetData = chartDataSignatureRef.current !== nextDataSignature;
    const previousOffsetRightDistance = chart.getOffsetRightDistance();
    const viewportKey = `${project?.id ?? 'unknown'}:${historyDisplayPeriod}`;
    const shouldResetViewport = lastViewportKeyRef.current !== viewportKey;
    if (shouldResetData) {
      chart.resetData();
      applyHistoryCandlePaneAxisOptions(chart);
      if (shouldResetViewport) {
        chart.setOffsetRightDistance(edgeConfig.rightOffset);
        if (replaySnapshotSession) {
          scrollHistoryChartToCursorIndex(chart, replaySnapshotSession.cursor_index);
        } else {
          chart.scrollToRealTime(0);
        }
      } else {
        chart.setOffsetRightDistance(Math.max(edgeConfig.rightOffset, previousOffsetRightDistance));
      }
      chartDataSignatureRef.current = nextDataSignature;
    }
    lastViewportKeyRef.current = viewportKey;
    const nextOverlaySignature = JSON.stringify({
      projectId: project?.id ?? '',
      historyDisplayPeriod,
      systemMarkerMode,
      showReplayDrawings,
      replaySnapshotCursorIndex: replaySnapshotSession?.cursor_index ?? null,
      replaySystemMarkerSignature,
      drawingsSignature: buildReplayDrawingOverlaySignature(replay?.drawings),
      specialTraining: replay?.specialTraining ?? null,
      showGlobalDecimals,
      visibleLength: replayVisibleItems.length,
      firstBucketStartMs: replayVisibleItems[0]?.bucketStartMs ?? null,
      lastBucketStartMs: replayVisibleItems[replayVisibleItems.length - 1]?.bucketStartMs ?? null
    });
    const shouldRefreshOverlays = shouldResetData || chartOverlaySignatureRef.current !== nextOverlaySignature;
    if (shouldRefreshOverlays) {
      refreshArchivedOverlays(chart);
      chartOverlaySignatureRef.current = nextOverlaySignature;
      const hasReplaySnapshot = Boolean(
        replaySnapshot &&
        replaySnapshotSession &&
        replayBars.length &&
        replayData.length &&
        replayVisibleItems.length
      );
      if (hasReplaySnapshot && replaySnapshotSession && replayBars.length) {
        const defaultIndex = clamp(replaySnapshotSession.cursor_index, 0, Math.max(0, replayBars.length - 1));
        setSelectedDataIndex(defaultIndex);
        if (shouldResetData) {
          resizeObserverHandleRef.current?.force();
        }
        return;
      }
      setSelectedDataIndex(replayBars.length ? replayBars.length - 1 : null);
    }
    if (shouldResetData) {
      resizeObserverHandleRef.current?.force();
    }
  }, [
    historyDisplayPeriod,
    chartReadyVersion,
    project?.id,
    project?.symbol,
    replayBars,
    replayData,
    replayDataWindow,
    replaySnapshotSession,
    replaySystemMarkerSignature,
    replayVisibleItems,
    adjustPaneHeights,
    applyMaxOffsetRightDistance,
    refreshArchivedOverlays,
    scrollHistoryChartToCursorIndex,
    edgeConfig.rightOffset,
    showGlobalDecimals,
  ]);

  const handleCustomScriptIndicatorMountedLayout = useCallback(() => {
    adjustPaneHeights();
    resizeObserverHandleRef.current?.force();
  }, [adjustPaneHeights]);

  useHistoryReplayCustomScriptIndicator({
    chartReadyVersion,
    chartRef,
    customScriptIndicator,
    language,
    replayData,
    onMountedLayout: handleCustomScriptIndicatorMountedLayout,
  });

  useEffect(() => {
    if (!Number.isFinite(focusRawBarIndex)) {
      lastAppliedFocusSignatureRef.current = '';
      return;
    }
    const chart = chartRef.current;
    if (!chart || !replayVisibleItems.length) {
      return;
    }
    const rawIndex = clamp(Math.floor(focusRawBarIndex as number), 0, Math.max(0, replayBars.length - 1));
    const focusSignature = JSON.stringify({
      projectId: project?.id ?? '',
      historyDisplayPeriod,
      focusBehavior,
      focusRequestNonce,
      rawIndex,
      replayBarsLength: replayBars.length,
      visibleLength: replayVisibleItems.length,
      firstBucketStartMs: replayVisibleItems[0]?.bucketStartMs ?? null,
      lastBucketStartMs: replayVisibleItems[replayVisibleItems.length - 1]?.bucketStartMs ?? null
    });
    if (lastAppliedFocusSignatureRef.current === focusSignature) {
      return;
    }
    if (focusBehavior === 'select-only') {
      setSelectedDataIndex(rawIndex);
      lastAppliedFocusSignatureRef.current = focusSignature;
      return;
    }
    const displayIndex = findAggregatedBarIndexByRawIndex(replayVisibleItems, rawIndex);
    if (displayIndex < 0) {
      return;
    }
    const visibleBarCount = resolveVisibleRangeBarCount(chart);
    const centerShift = visibleBarCount > 0 ? Math.max(0, Math.floor(visibleBarCount * 0.5)) : 0;
    const scrollTargetIndex = clamp(
      displayIndex + centerShift,
      0,
      Math.max(0, replayVisibleItems.length - 1)
    );
    try {
      chart.scrollToDataIndex(scrollTargetIndex, 260);
      setSelectedDataIndex(rawIndex);
      lastAppliedFocusSignatureRef.current = focusSignature;
    } catch {
      // Keep the page alive even if the chart instance rejects a transient focus request.
    }
  }, [
    focusBehavior,
    focusRawBarIndex,
    focusRequestNonce,
    chartReadyVersion,
    historyDisplayPeriod,
    project?.id,
    replayBars.length,
    replayVisibleItems
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    renderDiagnosticFocusOverlay(chart);
  }, [chartReadyVersion, renderDiagnosticFocusOverlay]);

  if (!project || !replayBars.length) {
    return <div className="empty-text history-preview-empty history-preview-watermark">{tt("appText.previewHistoricalQuotes")}</div>;
  }

  const cursorIndex = clamp(replaySnapshotSession?.cursor_index ?? replayBars.length - 1, 0, replayBars.length - 1);
  const currentIndex = selectedDataIndex === null ? cursorIndex : clamp(selectedDataIndex, 0, replayBars.length - 1);
  const selectedDisplayIndex = findAggregatedBarIndexByRawIndex(replayVisibleItems, currentIndex);
  const selectedResolvedDisplayIndex = selectedDisplayIndex >= 0 ? selectedDisplayIndex : replayVisibleItems.length - 1;
  const selectedChangeRatio =
    selectedResolvedDisplayIndex >= 0
      ? resolveCurrentBarChangeRatio(replayVisibleItems, selectedResolvedDisplayIndex)
      : null;
  const selectedChangeClass = selectedChangeRatio === null ? 'flat' : selectedChangeRatio > 0 ? 'up' : selectedChangeRatio < 0 ? 'down' : 'flat';
  const handleToggleHistorySubIndicators = useHistoryReplayIndicatorToggle({
    showSubIndicators,
    historyTopIndicator,
    historyTopIndicatorParams,
    historyBottomIndicator,
    historyBottomIndicatorParams,
    archivedHistoryTopIndicator,
    archivedHistoryTopIndicatorParams,
    archivedHistoryBottomIndicator,
    archivedHistoryBottomIndicatorParams,
    setShowSubIndicators,
    setHistorySubIndicatorOverride,
  });

  return (
    <div className="history-preview-chart history-preview-chart-no-info">
      <ReplayChartViewport
        chartDomRef={chartDomRef}
        periodTitle={PERIOD_TITLE_BY_LANGUAGE[language]}
        chartRenderMode={chartRenderMode}
        onChartRenderModeChange={onChartRenderModeChange}
        chartRenderModeLabels={CHART_RENDER_MODE_LABELS_BY_LANGUAGE[language]}
        chartRenderModeGroupLabel={CHART_RENDER_MODE_GROUP_LABEL_BY_LANGUAGE[language]}
        periodOptions={historyPeriodOptions}
        selectedPeriod={historyDisplayPeriod}
        onPeriodChange={(period) => {
          if (!isDisplayPeriodKey(period)) {
            return;
          }
          commitDisplayPeriod(period);
        }}
        getPeriodLabel={(period) => getDisplayPeriodLabel(period as DisplayPeriodKey, language)}
        periodOriginPrefix={PERIOD_ORIGIN_PREFIX_BY_LANGUAGE[language]}
        basePeriod={bindings.defaultTrainerDisplayPeriodByBase[historyBaseTimeframe]}
        indicatorLabel={INDICATOR_LABEL_BY_LANGUAGE[language]}
        showChartRenderModeSwitch={showChartRenderModeSwitch}
        showPeriodSwitch={showPeriodSwitch}
        showIndicatorButton={!suppressNativeIndicators && showIndicatorButton}
        isIndicatorButtonActive={isChartSettingsActive}
        onOpenChartSettings={onOpenChartSettings}
        showSubIndicatorToggle={showSubIndicatorToggle}
        hasAnySubIndicator={hasAnySubIndicator}
        showSubIndicators={showSubIndicators}
        onToggleSubIndicators={suppressNativeIndicators ? undefined : handleToggleHistorySubIndicators}
        subIndicatorToggleTitle={`${showSubIndicators ? tt("appText.hide") : tt("appText.show")} ${tt("appText.figure1")} ${tt("appText.message0940")} ${tt("appText.figure2")}`}
        toolbarLeadingContent={toolbarLeadingContent}
        toolbarClassName="history-preview-period-toolbar"
        canvasWrapClassName="history-preview-canvas-wrap"
        canvasClassName="history-preview-canvas"
        changeBubbleText={selectedChangeRatio !== null ? formatRatio(selectedChangeRatio) : null}
        changeBubbleClassName={selectedChangeRatio !== null ? `history-preview-change ${selectedChangeClass}` : undefined}
        changeBubbleTitle={tt("appText.barChange")}
        changeBubblePlacement={changeBubblePlacement}
      />
    </div>);

};
