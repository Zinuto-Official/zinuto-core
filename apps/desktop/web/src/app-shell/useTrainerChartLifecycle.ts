// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import type { UiLanguage } from "@/frontend-kernel/typography";
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  dispose,
  init,
  type Chart,
  type Crosshair,
  type DataLoaderSubscribeBarParams,
  type DataLoaderUnsubscribeBarParams,
  type KLineData,
} from 'klinecharts';
import type { SessionSnapshot } from '@/domains/training/types';
import type { TrainerChartSurfacePage } from '@/app-shell/trainerChartSurfacePage';
import { toKlinePeriod } from '@/domains/chart/chartPeriods';
import {
  registerCustomOverlays
} from '@/domains/chart/chartRuntime';
import {
  attachStableElementResizeObserver,
  whenElementRenderable
} from '@/domains/chart/chartStableResize';
import { findAggregatedBarIndexByRawIndex } from '@/domains/chart/replayIndexing';
import { parseTimestampMs } from '@zinuto/shared/marketTime';
import {
  endTrainerPerfSpan,
  startTrainerPerfSpan,
} from '@/domains/trainer/trainerPerfTrace';
import {
  createMainChartStyles,
  type ChartDisplayEdgeConfig,
  type ChartThemeMode,
  type PriceColorMode
} from '@/domains/chart/display';
import { buildChartSymbolInfo } from '@/domains/chart/pricePrecision';
import { type ChartRenderMode } from '@/domains/chart/chartRenderMode';
import { resolveKlineLocale } from '@/ui/config/frameworkKlineI18n';
import {
  applyIndicatorStyles,
  INDICATOR_IDS,
  isIndicatorNone,
  mountSignalIndicator,
  mountVolumeIndicator,
  resolveChartIndicatorPaneId,
  resolveChartSettingsModalFocusTarget,
} from '@/domains/indicators/runtime';
import { getSupportedIndicatorNameSet } from '@/domains/indicators/catalog';
import { registerCustomIndicators } from '@/domains/indicators/registry';
import {
  resolveChartSettingsIndicatorTooltipLabelTarget,
  resolveChartSettingsIndicatorTooltipTarget,
} from '@/domains/indicators/tooltipFeature';
import { clearIndicatorTooltipFeatureActiveState } from '@/domains/indicators/tooltipFeatureActiveState';
import type { SignalIndicatorName } from '@/domains/indicators/core';
import { formatInputThousands } from '@/ui/formatting/format';

type UseTrainerChartLifecycleArgs = {
  activePage: TrainerChartSurfacePage;
  chartDomAttachVersion: number;
  chartDomRef: MutableRefObject<HTMLDivElement | null>;
  resolveChartDomForPage: (page: TrainerChartSurfacePage) => HTMLDivElement | null;
  chartRef: MutableRefObject<Chart | null>;
  chartDataRef: MutableRefObject<KLineData[]>;
  liveBarSubscriberRef: MutableRefObject<((data: KLineData) => void) | null>;
  barsRef: MutableRefObject<ReplayBar[]>;
  visibleAggregatedBarsRef: MutableRefObject<AggregatedBarItem[]>;
  snapshotRef: MutableRefObject<SessionSnapshot | null>;
  currentDisplayPeriodRef: MutableRefObject<DisplayPeriodKey>;
  signalTopRef: MutableRefObject<SignalIndicatorName>;
  signalBottomRef: MutableRefObject<SignalIndicatorName>;
  signalTopParamsRef: MutableRefObject<number[]>;
  signalBottomParamsRef: MutableRefObject<number[]>;
  showTrainerVolumePaneRef: MutableRefObject<boolean>;
  drawingOverlayIdRef: MutableRefObject<string>;
  rearmTimerRef: MutableRefObject<number | null>;
  chartDataRenderSignatureRef: MutableRefObject<string>;
  chartMarkerHeavyRenderSignatureRef: MutableRefObject<string>;
  chartMarkerPositionRenderSignatureRef: MutableRefObject<string>;
  lastMainIndicatorMountKeyRef: MutableRefObject<string>;
  lastSignalIndicatorMountKeyRef: MutableRefObject<string>;
  language: UiLanguage;
  effectiveThemeMode: ChartThemeMode;
  priceColorMode: PriceColorMode;
  chartRenderMode: ChartRenderMode;
  trainerResponsiveChartEdgeConfig: ChartDisplayEdgeConfig;
  applyTrainerMaxOffsetRightDistance: (chart: Chart) => void;
  syncTradeMarkerCompactMode: (chart: Chart, viewportWidthPx?: number) => void;
  adjustPaneHeights: () => void;
  setSelectedDataIndex: Dispatch<SetStateAction<number | null>>;
  setChartReady: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  chartInitErrorText: string;
  loadMoreTrainerBars?: (direction: 'backward' | 'forward') => Promise<{
    data: KLineData[];
    hasBackward: boolean;
    hasForward: boolean;
  }>;
  onOpenChartSettingsModal?: (indicatorId?: string) => void;
  onOpenIndicatorQuickMenu?: (payload: {
    indicatorId: string;
    target: NonNullable<ReturnType<typeof resolveChartSettingsModalFocusTarget>>;
    anchorLeft: number;
    anchorTop: number;
  }) => void;
};

export const useTrainerChartLifecycle = ({
  activePage,
  chartDomAttachVersion,
  chartDomRef,
  resolveChartDomForPage,
  chartRef,
  chartDataRef,
  liveBarSubscriberRef,
  barsRef,
  visibleAggregatedBarsRef,
  snapshotRef,
  currentDisplayPeriodRef,
  signalTopRef,
  signalBottomRef,
  signalTopParamsRef,
  signalBottomParamsRef,
  showTrainerVolumePaneRef,
  drawingOverlayIdRef,
  rearmTimerRef,
  chartDataRenderSignatureRef,
  chartMarkerHeavyRenderSignatureRef,
  chartMarkerPositionRenderSignatureRef,
  lastMainIndicatorMountKeyRef,
  lastSignalIndicatorMountKeyRef,
  language,
  effectiveThemeMode,
  priceColorMode,
  chartRenderMode,
  trainerResponsiveChartEdgeConfig,
  applyTrainerMaxOffsetRightDistance,
  syncTradeMarkerCompactMode,
  adjustPaneHeights,
  setSelectedDataIndex,
  setChartReady,
  setError,
  chartInitErrorText,
  loadMoreTrainerBars,
  onOpenChartSettingsModal,
  onOpenIndicatorQuickMenu
}: UseTrainerChartLifecycleArgs) => {
  const onOpenChartSettingsModalRef = useRef(onOpenChartSettingsModal);
  const onOpenIndicatorQuickMenuRef = useRef(onOpenIndicatorQuickMenu);

  useEffect(() => {
    onOpenChartSettingsModalRef.current = onOpenChartSettingsModal;
  }, [onOpenChartSettingsModal]);

  useEffect(() => {
    onOpenIndicatorQuickMenuRef.current = onOpenIndicatorQuickMenu;
  }, [onOpenIndicatorQuickMenu]);

  useEffect(() => {
    if (activePage !== 'TRAINER' && activePage !== 'SPECIAL_TRAINING') {
      return undefined;
    }

    registerCustomOverlays();
    registerCustomIndicators();

    const dom = resolveChartDomForPage(activePage);
    if (!dom) {
      return;
    }
    chartDomRef.current = dom;

    const runChartInit = (dom: HTMLDivElement): (() => void) | undefined => {
    startTrainerPerfSpan('trainer-chart-init', {
      activePage,
    });
    const chart = init(dom, {
      locale: resolveKlineLocale(language),
      timezone: snapshotRef.current?.session.timeZone ?? 'Asia/Shanghai',
      styles: createMainChartStyles(
        effectiveThemeMode,
        priceColorMode,
        trainerResponsiveChartEdgeConfig,
        chartRenderMode,
        language
      ) as Parameters<Chart['setStyles']>[0]
    });

    if (!chart) {
      setError(chartInitErrorText);
      return;
    }

    chartRef.current = chart;
    chart.setRightMinVisibleBarCount(trainerResponsiveChartEdgeConfig.minRightVisibleBars);
    applyTrainerMaxOffsetRightDistance(chart);

    chart.setThousandsSeparator({
      sign: ',',
      format: (value) => formatInputThousands(String(value))
    });

    const initialLoadMoreState = {
      forward: false,
      backward: false,
    };

    const initialTrainerTicker = (snapshotRef.current?.session.symbol || '').trim().toUpperCase();
    if (initialTrainerTicker) {
      chart.setSymbol(buildChartSymbolInfo(initialTrainerTicker, chartDataRef.current));
    }
    chart.setPeriod(toKlinePeriod(currentDisplayPeriodRef.current));

    chart.setDataLoader({
      getBars: async ({ type, callback }) => {
        if (type === 'init') {
          callback(chartDataRef.current, initialLoadMoreState);
          return;
        }
        if (
          (type === 'backward' || type === 'forward') &&
          loadMoreTrainerBars
        ) {
          try {
            const result = await loadMoreTrainerBars(type);
            callback(result.data, {
              backward: result.hasBackward,
              forward: result.hasForward,
            });
            return;
          } catch {
            callback(chartDataRef.current, initialLoadMoreState);
            return;
          }
        }
        callback(chartDataRef.current, initialLoadMoreState);
      },
      subscribeBar: ({ callback }: DataLoaderSubscribeBarParams) => {
        liveBarSubscriberRef.current = callback;
      },
      unsubscribeBar: (_params: DataLoaderUnsubscribeBarParams) => {
        liveBarSubscriberRef.current = null;
      }
    });

    const findVisibleEndRawIndexByTimestamp = (items: AggregatedBarItem[], timestampMs: number): number => {
      let left = 0;
      let right = items.length - 1;
      while (left <= right) {
        const middle = (left + right) >> 1;
        const item = items[middle];
        if (timestampMs < item.bucketStartMs) {
          right = middle - 1;
          continue;
        }
        if (timestampMs > item.bucketStartMs) {
          left = middle + 1;
          continue;
        }
        return item.endRawIndex;
      }
      return -1;
    };

    const findRawBarIndexByTimestamp = (bars: ReplayBar[], timestampMs: number): number => {
      let left = 0;
      let right = bars.length - 1;
      while (left <= right) {
        const middle = (left + right) >> 1;
        const middleTsMs = parseTimestampMs(bars[middle]?.ts ?? '');
        if (!Number.isFinite(middleTsMs)) {
          break;
        }
        if (timestampMs < middleTsMs) {
          right = middle - 1;
          continue;
        }
        if (timestampMs > middleTsMs) {
          left = middle + 1;
          continue;
        }
        return middle;
      }
      return -1;
    };

    const resolveRawIndexByTimestamp = (
      items: AggregatedBarItem[],
      bars: ReplayBar[],
      timestampMs: number
    ): number | null => {
      const visibleRawIndex = findVisibleEndRawIndexByTimestamp(items, timestampMs);
      if (visibleRawIndex >= 0) {
        return visibleRawIndex;
      }
      const rawIndex = findRawBarIndexByTimestamp(bars, timestampMs);
      return rawIndex >= 0 ? rawIndex : null;
    };

    let cachedBarsRef: ReplayBar[] | null = null;
    let cachedMaxIndex = 0;

    const resolveVisibleItemByDisplayIndex = (
      items: AggregatedBarItem[],
      displayIndex: unknown,
    ): AggregatedBarItem | null => {
      if (!items.length || !Number.isFinite(Number(displayIndex))) {
        return null;
      }
      const index = Math.max(
        0,
        Math.min(Math.floor(Number(displayIndex)), items.length - 1),
      );
      return items[index] ?? null;
    };

    const resolveVisibleItemByRawIndex = (
      items: AggregatedBarItem[],
      rawIndex: number | null,
    ): AggregatedBarItem | null => {
      if (rawIndex === null) {
        return null;
      }
      const displayIndex = findAggregatedBarIndexByRawIndex(items, rawIndex);
      return displayIndex >= 0 ? items[displayIndex] ?? null : null;
    };

    const normalizeSelectedRawIndex = (
      liveBars: ReplayBar[],
      nextIndex: number | null,
    ): number | null => {
      if (cachedBarsRef !== liveBars) {
        cachedBarsRef = liveBars;
        let maxIndex = 0;
        for (let index = 0; index < liveBars.length; index += 1) {
          const bar = liveBars[index];
          const endRawIndex = Number(bar?.endRawIndex);
          const resolvedIndex = Number.isFinite(endRawIndex)
            ? Math.max(0, Math.floor(endRawIndex))
            : index;
          if (resolvedIndex > maxIndex) {
            maxIndex = resolvedIndex;
          }
        }
        cachedMaxIndex = maxIndex;
      }
      return nextIndex === null
        ? null
        : Math.max(0, Math.min(nextIndex, cachedMaxIndex));
    };

    const commitSelectedVisibleItem = (
      liveBars: ReplayBar[],
      item: AggregatedBarItem | null,
    ) => {
      const normalized = normalizeSelectedRawIndex(
        liveBars,
        item?.endRawIndex ?? null,
      );
      setSelectedDataIndex((current) => current === normalized ? current : normalized);
    };

    const handleCrosshairChange = (raw?: unknown) => {
      const liveBars = barsRef.current;
      const visibleItems = visibleAggregatedBarsRef.current;
      const payload = (raw ?? {}) as Partial<Crosshair>;

      let selectedItem: AggregatedBarItem | null = null;
      if (Number.isFinite(payload.dataIndex)) {
        selectedItem = resolveVisibleItemByDisplayIndex(
          visibleItems,
          payload.dataIndex,
        );
      } else if (payload.kLineData && Number.isFinite(payload.kLineData.timestamp)) {
        selectedItem = resolveVisibleItemByRawIndex(
          visibleItems,
          resolveRawIndexByTimestamp(
            visibleItems,
            liveBars,
            payload.kLineData.timestamp as number,
          ),
        );
      } else if (Number.isFinite(payload.timestamp)) {
        selectedItem = resolveVisibleItemByRawIndex(
          visibleItems,
          resolveRawIndexByTimestamp(
            visibleItems,
            liveBars,
            payload.timestamp as number,
          ),
        );
      } else if (Number.isFinite(payload.x)) {
        const pointerY = Number.isFinite(payload.y) ? payload.y as number : 0;
        const pointToConvert = {
          x: payload.x as number,
          y: pointerY
        };
        const convertedPoints = chart.convertFromPixel([pointToConvert], { paneId: 'candle_pane' }) as
          | Array<{ dataIndex?: number }>
          | { dataIndex?: number };
        const point = Array.isArray(convertedPoints) ? convertedPoints[0] : convertedPoints;
        selectedItem = resolveVisibleItemByDisplayIndex(
          visibleItems,
          point?.dataIndex,
        );
      }

      commitSelectedVisibleItem(liveBars, selectedItem);
    };

    const resolveSelectedItemFromMouse = (event: MouseEvent) => {
      const liveBars = barsRef.current;
      const visibleItems = visibleAggregatedBarsRef.current;
      if (!visibleItems.length) {
        return;
      }
      const rect = dom.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const convertedPoints = chart.convertFromPixel([{ x, y }], {
        paneId: 'candle_pane',
      }) as Array<{ dataIndex?: number }> | { dataIndex?: number };
      const point = Array.isArray(convertedPoints)
        ? convertedPoints[0]
        : convertedPoints;
      const selectedItem = resolveVisibleItemByDisplayIndex(
        visibleItems,
        point?.dataIndex,
      );
      if (!selectedItem) {
        return;
      }
      commitSelectedVisibleItem(liveBars, selectedItem);
    };

    chart.subscribeAction('onCrosshairChange', handleCrosshairChange);
    const handleMouseMove = (event: MouseEvent) => resolveSelectedItemFromMouse(event);
    const handleMouseEnter = (event: MouseEvent) => resolveSelectedItemFromMouse(event);
    const handleMouseLeave = () => {
      setSelectedDataIndex(null);
    };
    dom.addEventListener('mousemove', handleMouseMove);
    dom.addEventListener('mouseenter', handleMouseEnter);
    dom.addEventListener('mouseleave', handleMouseLeave);
    let viewportMarkerRaf = 0;
    let viewportMarkerSettleTimer = 0;
    let viewportMarkerSyncPending = false;
    const runViewportTradeMarkerSync = () => {
      syncTradeMarkerCompactMode(chart, chartDomRef.current?.clientWidth);
    };
    const flushViewportTradeMarkerSync = () => {
      viewportMarkerRaf = 0;
      viewportMarkerSyncPending = false;
      runViewportTradeMarkerSync();
      if (viewportMarkerSettleTimer) {
        window.clearTimeout(viewportMarkerSettleTimer);
      }
      viewportMarkerSettleTimer = window.setTimeout(() => {
        viewportMarkerSettleTimer = 0;
        runViewportTradeMarkerSync();
        if (viewportMarkerSyncPending && !viewportMarkerRaf) {
          viewportMarkerRaf = window.requestAnimationFrame(flushViewportTradeMarkerSync);
        }
      }, 36);
    };
    const scheduleViewportTradeMarkerSync = () => {
      viewportMarkerSyncPending = true;
      if (viewportMarkerRaf) {
        return;
      }
      viewportMarkerRaf = window.requestAnimationFrame(flushViewportTradeMarkerSync);
    };
    const handleZoom = () => {
      scheduleViewportTradeMarkerSync();
    };
    const handleVisibleRangeChange = () => {
      scheduleViewportTradeMarkerSync();
    };
    chart.subscribeAction('onZoom', handleZoom);
    chart.subscribeAction('onVisibleRangeChange', handleVisibleRangeChange);

    if (showTrainerVolumePaneRef.current) {
      mountVolumeIndicator({
        chart,
        indicatorId: INDICATOR_IDS.volumeMain,
        height: 110,
        minHeight: 78
      });
    }

    const initialSupportedIndicators = getSupportedIndicatorNameSet();
    if (!isIndicatorNone(signalTopRef.current) && initialSupportedIndicators.has(signalTopRef.current)) {
      mountSignalIndicator({
        chart,
        indicatorId: INDICATOR_IDS.signalTop,
        indicatorName: signalTopRef.current,
        calcParams: signalTopParamsRef.current,
        priceColorMode,
        panePreset: 'trainerTop'
      });
    }
    if (!isIndicatorNone(signalBottomRef.current) && initialSupportedIndicators.has(signalBottomRef.current)) {
      mountSignalIndicator({
        chart,
        indicatorId: INDICATOR_IDS.signalBottom,
        indicatorName: signalBottomRef.current,
        calcParams: signalBottomParamsRef.current,
        priceColorMode,
        panePreset: 'trainerBottom'
      });
    }

    applyIndicatorStyles(chart, priceColorMode, [
      { id: INDICATOR_IDS.volumeMain, name: 'VOL', enabled: showTrainerVolumePaneRef.current },
      {
        id: INDICATOR_IDS.signalTop,
        name: signalTopRef.current,
        enabled: !isIndicatorNone(signalTopRef.current),
        enableChartSettingsTooltip: true
      },
      {
        id: INDICATOR_IDS.signalBottom,
        name: signalBottomRef.current,
        enabled: !isIndicatorNone(signalBottomRef.current),
        enableChartSettingsTooltip: true
      }
    ]);

    const ensureLockedIndicators = () => {
      if (!isIndicatorNone(signalTopRef.current) && chart.getIndicators({ id: INDICATOR_IDS.signalTop }).length === 0) {
        const supported = getSupportedIndicatorNameSet();
        if (supported.has(signalTopRef.current)) {
          mountSignalIndicator({
            chart,
            indicatorId: INDICATOR_IDS.signalTop,
            indicatorName: signalTopRef.current,
            calcParams: signalTopParamsRef.current,
            priceColorMode,
            panePreset: 'trainerTop'
          });
        }
      }

      if (!isIndicatorNone(signalBottomRef.current) && chart.getIndicators({ id: INDICATOR_IDS.signalBottom }).length === 0) {
        const supported = getSupportedIndicatorNameSet();
        if (supported.has(signalBottomRef.current)) {
          mountSignalIndicator({
            chart,
            indicatorId: INDICATOR_IDS.signalBottom,
            indicatorName: signalBottomRef.current,
            calcParams: signalBottomParamsRef.current,
            priceColorMode,
            panePreset: 'trainerBottom'
          });
        }
      }

      adjustPaneHeights();
    };

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
      window.setTimeout(() => {
        ensureLockedIndicators();
        if (indicatorSelectTarget) {
          const focusTarget =
            resolveChartSettingsModalFocusTarget(indicatorSelectTarget);
          const fallbackPaneId =
            resolveChartIndicatorPaneId(indicatorSelectTarget);
          const mountedIndicator = chart.getIndicators({
            id: indicatorSelectTarget,
          })[0] as { paneId?: unknown } | undefined;
          const paneId =
            typeof mountedIndicator?.paneId === 'string' &&
            mountedIndicator.paneId.trim()
              ? mountedIndicator.paneId.trim()
              : fallbackPaneId;
          const bounding =
            (paneId ? chart.getSize(paneId, 'main') : null) ??
            (paneId ? chart.getSize(paneId) : null);
          if (focusTarget && bounding) {
            onOpenIndicatorQuickMenuRef.current?.({
              indicatorId: indicatorSelectTarget,
              target: focusTarget,
              anchorLeft: Math.max(10, Math.round(bounding.left + 10)),
              anchorTop: Math.max(10, Math.round(bounding.top + 10)),
            });
          }
          clearIndicatorTooltipFeatureActiveState(chart, paneId || null);
          return;
        }
        if (chartSettingsTarget) {
          onOpenChartSettingsModalRef.current?.(chartSettingsTarget);
          clearIndicatorTooltipFeatureActiveState(chart, paneId || null);
        }
      }, 0);
    };

    chart.subscribeAction('onIndicatorTooltipFeatureClick', handleIndicatorFeatureClick);

    const resize = () => {
      chart.resize();
      applyTrainerMaxOffsetRightDistance(chart);
      syncTradeMarkerCompactMode(chart, chartDomRef.current?.clientWidth);
      adjustPaneHeights();
    };

    const resizeObserverHandle = attachStableElementResizeObserver(dom, resize);
    let stablePaintRaf = 0;
    stablePaintRaf = window.requestAnimationFrame(() => {
      endTrainerPerfSpan('trainer-chart-init', {
        activePage,
      });
    });
    setChartReady(true);

    return () => {
      if (stablePaintRaf) {
        window.cancelAnimationFrame(stablePaintRaf);
      }
      if (viewportMarkerRaf) {
        window.cancelAnimationFrame(viewportMarkerRaf);
      }
      if (viewportMarkerSettleTimer) {
        window.clearTimeout(viewportMarkerSettleTimer);
      }
      chart.unsubscribeAction('onCrosshairChange', handleCrosshairChange);
      dom.removeEventListener('mousemove', handleMouseMove);
      dom.removeEventListener('mouseenter', handleMouseEnter);
      dom.removeEventListener('mouseleave', handleMouseLeave);
      chart.unsubscribeAction('onZoom', handleZoom);
      chart.unsubscribeAction('onVisibleRangeChange', handleVisibleRangeChange);
      chart.unsubscribeAction('onIndicatorTooltipFeatureClick', handleIndicatorFeatureClick);
      resizeObserverHandle.disconnect();
      setChartReady(false);
      drawingOverlayIdRef.current = '';
      if (rearmTimerRef.current !== null) {
        window.clearTimeout(rearmTimerRef.current);
        rearmTimerRef.current = null;
      }
      chartDataRenderSignatureRef.current = '';
      chartMarkerHeavyRenderSignatureRef.current = '';
      chartMarkerPositionRenderSignatureRef.current = '';
      liveBarSubscriberRef.current = null;
      lastMainIndicatorMountKeyRef.current = '';
      lastSignalIndicatorMountKeyRef.current = '';
      dispose(chart);
      chartRef.current = null;
      if (chartDomRef.current === dom) {
        chartDomRef.current = null;
      }
    };
    };

    return whenElementRenderable(dom, () => runChartInit(dom));
  }, [
    activePage,
    adjustPaneHeights,
    applyTrainerMaxOffsetRightDistance,
    chartDomAttachVersion,
    chartDataRef,
    liveBarSubscriberRef,
    chartDomRef,
    chartMarkerHeavyRenderSignatureRef,
    chartMarkerPositionRenderSignatureRef,
    chartRef,
    chartDataRenderSignatureRef,
    barsRef,
    currentDisplayPeriodRef,
    drawingOverlayIdRef,
    effectiveThemeMode,
    language,
    lastMainIndicatorMountKeyRef,
    lastSignalIndicatorMountKeyRef,
    priceColorMode,
    rearmTimerRef,
    resolveChartDomForPage,
    setChartReady,
    setError,
    setSelectedDataIndex,
    signalBottomParamsRef,
    signalBottomRef,
    signalTopParamsRef,
    signalTopRef,
    showTrainerVolumePaneRef,
    snapshotRef,
    syncTradeMarkerCompactMode,
    trainerResponsiveChartEdgeConfig,
    visibleAggregatedBarsRef,
    chartInitErrorText
  ]);
};
