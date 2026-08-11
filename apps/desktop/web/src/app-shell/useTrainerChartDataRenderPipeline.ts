// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import type { KLineData } from 'klinecharts';
import {
  buildChartSymbolInfo,
  shouldApplyStableChartSymbolInfo,
} from '@/domains/chart/pricePrecision';
import {
  SYSTEM_NOTE_GROUP,
  SYSTEM_POSITION_OVERLAY_ID,
  SYSTEM_TRADE_GROUP
} from '@/domains/chart/overlays/constants';
import { attachStableElementResizeObserver } from '@/domains/chart/chartStableResize';
import {
  applyFastDecisionChartViewportOffset,
  resolveFastDecisionChartRightOffsetDistance,
  resolveKlineBarSlotPixelWidth,
} from '@/workspaces/special-training/fastDecisionChartViewport';
import { resolveTrainerChartDataUpdateDecision } from '@/app-shell/trainerChartDataUpdatePolicy';
import type {
  AggregatedBarLike,
  ReplayBarLike,
  SessionSnapshotLike,
  UseTrainerChartDataRenderPipelineArgs,
} from '@/app-shell/trainerChartOverlayTypes';
import {
  removeAllSpecialTrainingOverlays,
  renderTradeMarkerOverlays,
  renderDecisionBoundaryOverlays,
  renderRiskDisciplineGuideOverlays,
} from '@/app-shell/trainerChartSpecialOverlayHelpers';
import {
  buildSpecialTrainingOverlaySignature,
  resolveTrainerChartDataRenderStage,
  resolveTrainerChartRenderState,
} from '@/app-shell/trainerChartRenderStateMachine';

export { type UseTrainerChartDataRenderPipelineArgs } from '@/app-shell/trainerChartOverlayTypes';

export const useTrainerChartDataRenderPipeline = <
  TPeriod extends string,
  TSnapshot extends SessionSnapshotLike,
  TBar extends ReplayBarLike,
  TAggregatedBar extends AggregatedBarLike
>({
  chartReady,
  chartRef,
  chartDomRef,
  bars,
  snapshot,
  cursorIndexOverride = null,
  windowStartIndexOverride = null,
  decisionBoundaryRawIndexOverride = null,
  decisionMarkerOverride = null,
  tradeMarkersOverride = [],
  tradeMarkerBasePeriod = null,
  deferSystemMarkers = false,
  tradeMarkerDensityRatio,
  fastDecisionExtremeRayOverride = null,
  riskDisciplineGuidesOverride = null,
  chartThemeMode,
  priceColorMode,
  tradeColorTheme,
  showGlobalDecimals,
  tooltipSymbolOverride = '',
  trainerDisplayPeriod,
  activeToolbarSymbol,
  sessionId,
  trainerResponsiveChartEdgeConfig,
  chartDataRef,
  liveBarSubscriberRef,
  visibleAggregatedBarsRef,
  chartDataRenderSignatureRef,
  chartMarkerHeavyRenderSignatureRef,
  chartMarkerPositionRenderSignatureRef,
  specialTrainingOverlaySignatureRef,
  systemMarkerHeavySignature,
  systemMarkerPositionSignature,
  lastScrollSessionRef,
  pendingDrawingRebuildPeriodRef,
  activeDrawToolRef,
  drawingOverlayIdRef,
  armDrawOverlayRef,
  adjustPaneHeights,
  refreshDrawingMeta,
  rebuildDrawingsByPeriod,
  getCachedTrainerAggregatedBars,
  mapVisibleItemToKline,
  createSystemMarkers,
  setTrainerDisplayPeriod
}: UseTrainerChartDataRenderPipelineArgs<TPeriod, TSnapshot, TBar, TAggregatedBar>) => {
  const barsRef = useRef(bars);
  barsRef.current = bars;

  useEffect(() => {
    if (
      !chartReady ||
      !Number.isFinite(decisionBoundaryRawIndexOverride) ||
      Number(decisionBoundaryRawIndexOverride) < 0
    ) {
      return undefined;
    }

    const chart = chartRef.current;
    const dom = chartDomRef.current;
    if (!chart || !dom) {
      return undefined;
    }

    const applySettledViewportOffset = () => {
      const visibleBarCount = chart.getDataList().length || chartDataRef.current.length;
      if (visibleBarCount <= 0) {
        return;
      }
      chart.resize();
      applyFastDecisionChartViewportOffset({
        chart,
        chartViewportWidth: dom.clientWidth,
        visibleBarCount,
        edgeConfig: trainerResponsiveChartEdgeConfig,
      });
    };

    const resizeObserverHandle = attachStableElementResizeObserver(dom, applySettledViewportOffset);

    return () => {
      resizeObserverHandle.disconnect();
    };
  }, [
    chartDataRef,
    chartDomRef,
    chartReady,
    chartRef,
    decisionBoundaryRawIndexOverride,
    sessionId,
    trainerResponsiveChartEdgeConfig,
  ]);

  useEffect(() => {
    const bars = barsRef.current;
    const chart = chartRef.current;
    if (!chartReady || !chart || !bars.length) {
      if (chart) {
        removeAllSpecialTrainingOverlays(chart);
      }
      visibleAggregatedBarsRef.current = [];
      chartDataRef.current = [];
      chartDataRenderSignatureRef.current = '';
      chartMarkerHeavyRenderSignatureRef.current = '';
      chartMarkerPositionRenderSignatureRef.current = '';
      specialTrainingOverlaySignatureRef.current = '';
      return;
    }

    const resolveLocalIndexForRawIndex = (rawIndex: number): number => {
      const normalizedRawIndex = Math.max(0, Math.floor(Number(rawIndex) || 0));
      let low = 0;
      let high = bars.length - 1;
      let nearestPastIndex = 0;
      while (low <= high) {
        const index = Math.floor((low + high) / 2);
        const bar = bars[index];
        const start = Number.isFinite(Number(bar.startRawIndex))
          ? Math.max(0, Math.floor(Number(bar.startRawIndex)))
          : index;
        const end = Number.isFinite(Number(bar.endRawIndex))
          ? Math.max(start, Math.floor(Number(bar.endRawIndex)))
          : start;
        if (normalizedRawIndex < start) {
          high = index - 1;
          continue;
        }
        nearestPastIndex = index;
        if (normalizedRawIndex <= end) {
          return index;
        }
        low = index + 1;
      }
      return Math.max(0, Math.min(nearestPastIndex, bars.length - 1));
    };

    const hasCursorOverride = Number.isFinite(cursorIndexOverride);
    const maxIndex = hasCursorOverride
      ? resolveLocalIndexForRawIndex(Number(cursorIndexOverride))
      : snapshot
        ? resolveLocalIndexForRawIndex(snapshot.session.cursor_index)
        : Math.max(0, bars.length - 1);
    const hasWindowStartIndexOverride = Number.isFinite(windowStartIndexOverride);
    const windowStartIndex = hasWindowStartIndexOverride
      ? Math.max(0, Math.min(resolveLocalIndexForRawIndex(Number(windowStartIndexOverride)), maxIndex))
      : snapshot
        ? Math.max(0, Math.min(resolveLocalIndexForRawIndex(snapshot.session.start_index), maxIndex))
        : 0;

    const visibleItems = getCachedTrainerAggregatedBars(trainerDisplayPeriod, windowStartIndex, maxIndex);
    const trainerTooltipSymbol = (tooltipSymbolOverride || snapshot?.session.symbol || activeToolbarSymbol || '')
      .trim()
      .toUpperCase();
    visibleAggregatedBarsRef.current = visibleItems;
    const firstVisibleItem = visibleItems[0];
    const firstVisibleData = firstVisibleItem
      ? {
          ...mapVisibleItemToKline(firstVisibleItem),
          symbol: trainerTooltipSymbol
        }
      : null;

    const firstVisibleIdentity = hasCursorOverride || hasWindowStartIndexOverride
      ? [
          firstVisibleItem?.bucketStartMs ?? firstVisibleData?.timestamp ?? 0,
          firstVisibleItem?.startRawIndex ?? windowStartIndex
        ].join(':')
      : [
          firstVisibleData?.timestamp ?? 0,
          firstVisibleData?.open ?? 0,
          firstVisibleData?.high ?? 0,
          firstVisibleData?.low ?? 0,
          firstVisibleData?.close ?? 0,
          firstVisibleData?.volume ?? 0
        ].join(':');
    const nextRenderSignature = [
      trainerDisplayPeriod,
      sessionId || '',
      firstVisibleIdentity,
      trainerTooltipSymbol
    ].join('|');
    const previousData = chartDataRef.current;
    const previousDataLength = previousData.length;
    const mapVisibleItemWithSymbol = (item: TAggregatedBar): KLineData => ({
      ...mapVisibleItemToKline(item),
      symbol: trainerTooltipSymbol
    });
    const visibleData = visibleItems.map((item) => mapVisibleItemWithSymbol(item));
    const isSessionSwitched = Boolean(sessionId) && lastScrollSessionRef.current !== sessionId;
    if (trainerTooltipSymbol) {
      const nextSymbol = buildChartSymbolInfo(trainerTooltipSymbol, visibleData);
      if (shouldApplyStableChartSymbolInfo({
        current: chart.getSymbol(),
        next: nextSymbol,
        hasRenderedData: previousDataLength > 0,
        isSessionSwitched,
      })) {
        chart.setSymbol(nextSymbol);
      }
    }
    const isFastDecisionViewport =
      Number.isFinite(decisionBoundaryRawIndexOverride) &&
      Number(decisionBoundaryRawIndexOverride) >= 0;
    const resolveCurrentVisibleBarPixelWidth = (): number => {
      try {
        return resolveKlineBarSlotPixelWidth(chart.getBarSpace?.());
      } catch {
        return 0;
      }
    };
    const resolveFastDecisionViewportOffset = (): number =>
      resolveFastDecisionChartRightOffsetDistance({
        chartViewportWidth: chartDomRef.current?.clientWidth ?? 0,
        visibleBarCount: visibleData.length,
        visibleBarPixelWidth: resolveCurrentVisibleBarPixelWidth(),
        fallbackRightOffset: trainerResponsiveChartEdgeConfig.rightOffset,
      });
    const applyFastDecisionViewportOffset = (): number =>
      applyFastDecisionChartViewportOffset({
        chart,
        chartViewportWidth: chartDomRef.current?.clientWidth ?? 0,
        visibleBarCount: visibleData.length,
        edgeConfig: trainerResponsiveChartEdgeConfig,
      });
    const dataUpdateDecision = resolveTrainerChartDataUpdateDecision({
      previousData,
      nextData: visibleData,
      previousRenderSignature: chartDataRenderSignatureRef.current,
      nextRenderSignature,
      previousSessionId: lastScrollSessionRef.current,
      nextSessionId: sessionId,
      realtimeSubscriberAvailable: Boolean(liveBarSubscriberRef.current),
      allowRealtimeWhenRenderSignatureChanges: isFastDecisionViewport,
    });
    let realtimeApplied: boolean | null = null;
    const tryApplyRealtimeDelta = (): boolean => {
      if (dataUpdateDecision.action !== 'realtime') {
        return false;
      }
      const pushBar = liveBarSubscriberRef.current;
      if (!pushBar) {
        return false;
      }
      for (let index = dataUpdateDecision.updateStartIndex; index < visibleData.length; index += 1) {
        const item = visibleData[index];
        if (!item || !Number.isFinite(Number(item.timestamp))) {
          return false;
        }
      }
      for (let index = dataUpdateDecision.updateStartIndex; index < visibleData.length; index += 1) {
        pushBar({ ...visibleData[index] });
      }
      chartDataRef.current = visibleData;
      chartDataRenderSignatureRef.current = nextRenderSignature;
      lastScrollSessionRef.current = sessionId;
      return true;
    };

    if (dataUpdateDecision.action === 'realtime') {
      realtimeApplied = tryApplyRealtimeDelta();
    }
    const dataStage = resolveTrainerChartDataRenderStage({
      dataUpdateDecision,
      realtimeApplied,
    });
    const shouldResetData = dataStage === 'reset';

    if (dataUpdateDecision.action === 'none') {
      chartDataRenderSignatureRef.current = nextRenderSignature;
      lastScrollSessionRef.current = sessionId;
    }

    if (!shouldResetData && isFastDecisionViewport) {
      applyFastDecisionViewportOffset();
    }

    if (shouldResetData) {
      const previousOffsetRightDistance = chart.getOffsetRightDistance();
      const nextOffsetRightDistance = isFastDecisionViewport
        ? resolveFastDecisionViewportOffset()
        : trainerResponsiveChartEdgeConfig.rightOffset;

      chartDataRef.current = visibleData;
      chart.resetData();

      if (isSessionSwitched || previousDataLength <= 0 || isFastDecisionViewport) {
        if (isFastDecisionViewport) {
          applyFastDecisionViewportOffset();
        } else {
          chart.setOffsetRightDistance(nextOffsetRightDistance);
        }
        chart.scrollToRealTime(0);
      } else {
        chart.setOffsetRightDistance(
          Math.max(nextOffsetRightDistance, previousOffsetRightDistance)
        );
      }

      lastScrollSessionRef.current = sessionId;
      chartDataRenderSignatureRef.current = nextRenderSignature;
    }

    // Special training overlay rendering
    const shouldBindSpecialTrainingOverlaysToVisibleRange =
      tradeMarkersOverride.length > 0 || Boolean(riskDisciplineGuidesOverride);
    const specialTrainingOverlaySignature = buildSpecialTrainingOverlaySignature({
      decisionBoundaryRawIndexOverride: Number.isFinite(decisionBoundaryRawIndexOverride) ? Number(decisionBoundaryRawIndexOverride) : null,
      decisionMarkerOverride: decisionMarkerOverride ?? null,
      tradeMarkersOverride,
      tradeMarkerBasePeriod,
      tradeMarkerDensityRatio,
      fastDecisionExtremeRayOverride: fastDecisionExtremeRayOverride ?? null,
      riskDisciplineGuidesOverride: riskDisciplineGuidesOverride ?? null,
      maxIndex: shouldBindSpecialTrainingOverlaysToVisibleRange ? maxIndex : null,
      firstBucketStartMs: visibleItems[0]?.bucketStartMs ?? null,
      lastBucketStartMs: shouldBindSpecialTrainingOverlaysToVisibleRange
        ? visibleItems[visibleItems.length - 1]?.bucketStartMs ?? null
        : null,
      priceColorMode,
      tradeColorTheme,
      showGlobalDecimals,
      chartThemeMode
    });
    const renderState = resolveTrainerChartRenderState({
      dataStage,
      previousSpecialTrainingOverlaySignature:
        specialTrainingOverlaySignatureRef.current,
      nextSpecialTrainingOverlaySignature: specialTrainingOverlaySignature,
      deferSystemMarkers,
      previousSystemMarkerHeavySignature:
        chartMarkerHeavyRenderSignatureRef.current,
      nextSystemMarkerHeavySignature: systemMarkerHeavySignature,
      previousSystemMarkerPositionSignature:
        chartMarkerPositionRenderSignatureRef.current,
      nextSystemMarkerPositionSignature: systemMarkerPositionSignature,
      pendingDrawingRebuildPeriod: pendingDrawingRebuildPeriodRef.current,
      trainerDisplayPeriod,
    });
    if (renderState.shouldRefreshSpecialTrainingOverlays) {
      removeAllSpecialTrainingOverlays(chart);
    }
    if (renderState.shouldRefreshSpecialTrainingOverlays && tradeMarkersOverride.length > 0) {
      renderTradeMarkerOverlays(
        chart,
        chartDomRef.current,
        tradeMarkersOverride,
        visibleItems,
        maxIndex,
        tradeMarkerDensityRatio,
        trainerDisplayPeriod,
        tradeMarkerBasePeriod,
      );
    }
    if (
      renderState.shouldRefreshSpecialTrainingOverlays &&
      Number.isFinite(decisionBoundaryRawIndexOverride) &&
      Number(decisionBoundaryRawIndexOverride) >= 0
    ) {
      renderDecisionBoundaryOverlays(
        chart,
        visibleItems,
        maxIndex,
        Number(decisionBoundaryRawIndexOverride),
        decisionMarkerOverride,
        fastDecisionExtremeRayOverride,
        chartThemeMode,
        priceColorMode,
        tradeColorTheme,
      );
    }
    if (renderState.shouldRefreshSpecialTrainingOverlays && riskDisciplineGuidesOverride) {
      renderRiskDisciplineGuideOverlays(
        chart,
        visibleItems,
        riskDisciplineGuidesOverride,
        chartThemeMode,
        tradeColorTheme,
      );
    }

    let rafOverlay = 0;
    let rafPane = 0;

    const queuePaneAdjust = () => {
      rafPane = window.requestAnimationFrame(() => {
        adjustPaneHeights();
      });
    };

    const runOverlayAndDrawingUpdates = () => {
      if (deferSystemMarkers) {
        chart.removeOverlay({ groupId: SYSTEM_TRADE_GROUP });
        chart.removeOverlay({ groupId: SYSTEM_NOTE_GROUP });
        chart.removeOverlay({ id: SYSTEM_POSITION_OVERLAY_ID });
        chartMarkerHeavyRenderSignatureRef.current = '';
        chartMarkerPositionRenderSignatureRef.current = '';
      }
      if (renderState.shouldRefreshSystemMarkers) {
        if (snapshot) {
          createSystemMarkers(chart, visibleData, snapshot, bars, visibleItems, {
            trainingProjectId: sessionId || null,
            displayPeriod: trainerDisplayPeriod,
            onRequestDisplayPeriod: (period) => setTrainerDisplayPeriod(period),
            chartViewportWidthPx: chartDomRef.current?.clientWidth,
            refreshTradesAndNotes: renderState.shouldRefreshTradeAndNoteMarkers
          });
        } else {
          chart.removeOverlay({ groupId: SYSTEM_TRADE_GROUP });
          chart.removeOverlay({ groupId: SYSTEM_NOTE_GROUP });
          chart.removeOverlay({ id: SYSTEM_POSITION_OVERLAY_ID });
        }
        chartMarkerHeavyRenderSignatureRef.current = systemMarkerHeavySignature;
        chartMarkerPositionRenderSignatureRef.current = systemMarkerPositionSignature;
      }
      if (renderState.shouldRefreshSpecialTrainingOverlays) {
        specialTrainingOverlaySignatureRef.current = specialTrainingOverlaySignature;
      }

      let shouldRearmActiveDrawTool = false;
      if (renderState.shouldRebuildDrawingsForPeriod) {
        const didRebuildDrawingsForPeriod = rebuildDrawingsByPeriod(trainerDisplayPeriod);
        if (didRebuildDrawingsForPeriod) {
          shouldRearmActiveDrawTool = true;
          pendingDrawingRebuildPeriodRef.current = null;
        }
      }

      if (renderState.shouldRebuildDrawingsForPeriod || shouldRearmActiveDrawTool) {
        refreshDrawingMeta();
      }

      if (shouldRearmActiveDrawTool) {
        const activeTool = activeDrawToolRef.current;
        if (activeTool !== 'cursor') {
          drawingOverlayIdRef.current = '';
          armDrawOverlayRef.current(activeTool);
        }
      }

      if (
        renderState.shouldResetData ||
        renderState.shouldRebuildDrawingsForPeriod ||
        renderState.shouldRefreshSpecialTrainingOverlays
      ) {
        queuePaneAdjust();
      }
    };

    if (renderState.shouldScheduleOverlayFrame) {
      rafOverlay = window.requestAnimationFrame(runOverlayAndDrawingUpdates);
    } else if (renderState.shouldQueuePaneAdjustWithoutOverlay) {
      queuePaneAdjust();
    }

    return () => {
      if (rafOverlay) {
        window.cancelAnimationFrame(rafOverlay);
      }
      if (rafPane) {
        window.cancelAnimationFrame(rafPane);
      }
    };
  }, [
    activeDrawToolRef,
    activeToolbarSymbol,
    adjustPaneHeights,
    armDrawOverlayRef,
    chartDataRef,
    liveBarSubscriberRef,
    chartDataRenderSignatureRef,
    chartDomRef,
    chartMarkerHeavyRenderSignatureRef,
    chartMarkerPositionRenderSignatureRef,
    deferSystemMarkers,
    specialTrainingOverlaySignatureRef,
    systemMarkerHeavySignature,
    systemMarkerPositionSignature,
    chartReady,
    chartRef,
    createSystemMarkers,
    drawingOverlayIdRef,
    getCachedTrainerAggregatedBars,
    lastScrollSessionRef,
    mapVisibleItemToKline,
    pendingDrawingRebuildPeriodRef,
    rebuildDrawingsByPeriod,
    refreshDrawingMeta,
    cursorIndexOverride,
    windowStartIndexOverride,
    decisionBoundaryRawIndexOverride,
    decisionMarkerOverride,
    tradeMarkersOverride,
    tradeMarkerBasePeriod,
    tradeMarkerDensityRatio,
    fastDecisionExtremeRayOverride,
    riskDisciplineGuidesOverride,
    chartThemeMode,
    priceColorMode,
    tradeColorTheme,
    showGlobalDecimals,
    tooltipSymbolOverride,
    sessionId,
    setTrainerDisplayPeriod,
    snapshot,
    trainerDisplayPeriod,
    trainerResponsiveChartEdgeConfig,
    visibleAggregatedBarsRef
  ]);
};
