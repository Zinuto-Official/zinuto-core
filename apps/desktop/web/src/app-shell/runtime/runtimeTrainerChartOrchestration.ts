// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { SpecialTrainingChartSyncState } from "@/domains/special-training/specialTrainingContracts";
import type { Bar, SessionSnapshot } from "@/domains/training/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  api,
} from "@/api";
import { useTrainerChartStyleSync } from "@/app-shell/useTrainerChartStyleSync";
import { useTrainerChartSymbolSync } from "@/app-shell/useTrainerChartSymbolSync";
import { useTrainerDisplayPeriodSync } from "@/app-shell/useTrainerDisplayPeriodSync";
import { useTrainerAggregationPrewarm } from "@/app-shell/useTrainerAggregationPrewarm";
import { usePendingDrawingsRestore } from "@/app-shell/usePendingDrawingsRestore";
import { useTrainerChartDataRenderPipeline } from "@/app-shell/useTrainerChartDataRenderPipeline";
import {
  TRAINER_LAUNCH_BACKWARD_BARS,
  TRAINER_LAUNCH_FORWARD_BARS,
  TRAINER_BACKGROUND_FETCH_MAX_BARS,
  isTrainerHydrationPending,
} from "@/domains/trainer/trainerHydration";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import { getDrawingMinPointCount } from "@/domains/chart/chartRuntime";
import { mapBarToKline } from "@/frontend-kernel/valueFormat";
import {
  buildReplayBarTimestampMs,
} from "@/domains/chart/replayAggregation";
import { resolveTrainerPeriodAdvanceMeta } from "@/domains/trainer/trainerPeriodAdvance";
import { buildTrainerDisplayPeriodFrameRequest } from "@/domains/trainer/trainerDisplayPeriodFrameRequest";
import {
  applyIndicatorStyles,
  INDICATOR_IDS,
  isIndicatorNone,
  mountMainIndicator,
} from "@/domains/indicators/runtime";
import {
  isSameNumericArray,
} from "@/domains/indicators/core";
import {
  isDisplayPeriodKey,
} from "@/ui/config/uiConfig";
import { useTrainerBootstrapLifecycle } from "@/domains/trainer/useTrainerBootstrapLifecycle";
import {
  useRuntimeSystemMarkerSignatures,
  useRuntimeTrainerDrawingSyncEffect,
  useRuntimeTrainerSignalIndicatorMountEffect,
  useRuntimeTrainerSignalIndicatorVisibilityEffect,
  useRuntimeTrainerVolumeIndicatorVisibilityEffect,
} from "@/app-shell/runtime/trainer-runtime/useRuntimeTrainerChartEffects";
import { useSpecialTrainingAggregationCache } from "@/app-shell/runtime/useSpecialTrainingAggregationCache";
import { resolveTrainerChartSurfacePage } from "@/app-shell/trainerChartSurfacePage";
import {
  shouldShowVolumePaneForLocalSource,
  shouldShowVolumePaneForReplayBars,
} from "@/domains/chart/volumeAvailability";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
type RuntimeHookScope = AppRootRuntimeProps & ReturnType<typeof useRuntimeStartupState> & ReturnType<typeof useRuntimeStartupHistoryState> & ReturnType<typeof useRuntimeStartupPersistence> & ReturnType<typeof useRuntimeTrainerChartSession> & ReturnType<typeof useRuntimeTrainerMarketSettings> & ReturnType<typeof useRuntimeTrainerPoolChartPipeline> & Record<string, unknown>;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};



const TRAINER_PERIOD_ADVANCE_PREFETCH_MAX_ATTEMPTS = 24;
const EMPTY_CHART_PIPELINE_TRADE_MARKERS_OVERRIDE: Array<{
  rawIndex: number;
  side: "BUY" | "SELL";
  price: number;
  label: string;
}> = [];

type TrainerChartPipelineSurfaceId = "trainer" | "specialTraining" | "idle";

type TrainerChartPipelineSurfaceDefinition = {
  hideLastPriceMark: boolean;
  ownsTrainerSession: boolean;
  acceptsSpecialTrainingChartState: boolean;
};

export const TRAINER_CHART_PIPELINE_SURFACE_DEFINITIONS = {
  trainer: {
    hideLastPriceMark: false,
    ownsTrainerSession: true,
    acceptsSpecialTrainingChartState: false,
  },
  specialTraining: {
    hideLastPriceMark: true,
    ownsTrainerSession: false,
    acceptsSpecialTrainingChartState: true,
  },
  idle: {
    hideLastPriceMark: false,
    ownsTrainerSession: false,
    acceptsSpecialTrainingChartState: false,
  },
} as const satisfies Record<
  TrainerChartPipelineSurfaceId,
  TrainerChartPipelineSurfaceDefinition
>;

export const TRAINER_CHART_PIPELINE_SURFACE_BY_PAGE = {
  TRAINER: "trainer",
  SPECIAL_TRAINING: "specialTraining",
} as const satisfies Record<string, TrainerChartPipelineSurfaceId>;

export const resolveTrainerChartPipelineSurfaceId = (
  activePage: string,
): TrainerChartPipelineSurfaceId =>
  TRAINER_CHART_PIPELINE_SURFACE_BY_PAGE[
    activePage as keyof typeof TRAINER_CHART_PIPELINE_SURFACE_BY_PAGE
  ] ?? "idle";

const resolveTrainerChartPipelineAdapterState = ({
  surface,
  specialTrainingChartState,
  bars,
  snapshot,
  sessionId,
  specialTrainingChartBaseTimeframe,
  effectiveTrainingBaseTimeframe,
}: {
  surface: TrainerChartPipelineSurfaceDefinition;
  specialTrainingChartState: SpecialTrainingChartSyncState | null;
  bars: Bar[];
  snapshot: SessionSnapshot | null | undefined;
  sessionId: string;
  specialTrainingChartBaseTimeframe: BaseTimeframe | null | undefined;
  effectiveTrainingBaseTimeframe: BaseTimeframe;
}) => {
  const specialTrainingChartOverride =
    surface.acceptsSpecialTrainingChartState &&
    specialTrainingChartState &&
    specialTrainingChartState.bars.length > 0
      ? specialTrainingChartState
      : null;
  const chartPipelineSnapshot = specialTrainingChartOverride ? null : snapshot ?? null;

  return {
    isSpecialTrainingChartOverrideActive: Boolean(specialTrainingChartOverride),
    specialTrainingChartOverride,
    chartPipelineBars: specialTrainingChartOverride?.bars ?? bars,
    chartPipelineSnapshot,
    chartPipelineSessionId: specialTrainingChartOverride
      ? `special-training:${specialTrainingChartOverride.questionId}`
      : sessionId,
    chartPipelineCursorIndexOverride:
      specialTrainingChartOverride?.cursorIndex ?? null,
    chartPipelineWindowStartIndexOverride:
      specialTrainingChartOverride?.windowStartIndex ?? null,
    chartPipelineDecisionBoundaryRawIndexOverride:
      specialTrainingChartOverride?.decisionBoundaryRawIndex ?? null,
    chartPipelineDecisionMarkerOverride:
      specialTrainingChartOverride?.decisionMarker ?? null,
    chartPipelineTradeMarkersOverride:
      specialTrainingChartOverride?.tradeMarkers ??
      EMPTY_CHART_PIPELINE_TRADE_MARKERS_OVERRIDE,
    chartPipelineFastDecisionExtremeRayOverride:
      specialTrainingChartOverride?.fastDecisionExtremeRay ?? null,
    chartPipelineRiskDisciplineGuidesOverride:
      specialTrainingChartOverride?.riskDisciplineGuides ?? null,
    chartPipelineTooltipSymbolOverride:
      specialTrainingChartOverride?.symbol ?? "",
    chartPipelineTradeMarkerBasePeriod: specialTrainingChartOverride
      ? specialTrainingChartBaseTimeframe
      : chartPipelineSnapshot?.session.minimumBaseTimeframe ??
        chartPipelineSnapshot?.session.timeframe ??
        effectiveTrainingBaseTimeframe,
  };
};


export const useRuntimeTrainerChartOrchestration = (scope: RuntimeHookScope) => {
  const { activeDrawToolRef, activePage, activeToolbarSymbol, adjustPaneHeights, aggregationPrewarmTaskRef, appBootstrapAbortControllerRef, appIsMountedRef, applyResolvedTradingSettingsToForm, applyTrainerMaxOffsetRightDistance, armDrawOverlayRef, bars, barsOffsetRef, barsRef, barsTimeZone, barsTotalRef, chartDataRef, chartDataRenderSignatureRef, chartDomRef, chartMarkerHeavyRenderSignatureRef, chartMarkerPositionRenderSignatureRef, chartReady, chartRef, chartRenderMode, closeIndicatorQuickMenu, createSystemMarkers, currentDisplayPeriodRef, currentTrainingPoolMeta, customIndicatorProfileVersionToken, drawingOverlayIdRef, effectiveThemeMode, effectiveTrainingBaseTimeframe, ensureBarsBackwardAbortControllerRef, ensureBarsForward, ensureBarsForwardAbortControllerRef, getCachedTrainerAggregatedBars, groupedSignalIndicatorSelectOptions, indicatorQuickMenuState, isSavingTradingSettings, language, lastMainIndicatorMountKeyRef, lastScrollSessionRef, lastSignalIndicatorMountKeyRef, liveBarSubscriberRef, localDataSourceSummaries, mainIndicatorSelectOptions, mainNativeIndicator, mainNativeIndicatorParams, pendingDrawingRebuildPeriodRef, pendingRestoreDrawings, periodAdvanceMetaState, prefetchWorkspacePageData, priceColorMode, tradeColorTheme, showGlobalDecimals, projectDrawingPointsForPeriod, rebuildDrawingsByPeriod, refreshDrawingMeta, refreshInstruments, refreshSystemStorageUsage, refreshTradingSettings, replayNotes, resolveSessionTradingSettingsByPoolId, selectedInstrumentId, selectedSymbol, sessionId, setError, setHint, setMainNativeIndicator, setMainNativeIndicatorParams, setPendingRestoreDrawings, setSignalBottomIndicator, setSignalBottomIndicatorParams, setSignalTopIndicator, setSignalTopIndicatorParams, setTrainerDisplayPeriod, shouldRenderDrawingInPeriod, showDrawingsAcrossPeriods, showTrainerSubIndicators, showTrainerVolumePaneRef, signalBottomIndicator, signalBottomIndicatorParams, signalTopIndicator, signalTopIndicatorParams, snapshot, snapshotRef, specialTrainingChartBaseTimeframe, specialTrainingChartState, specialTrainingOverlaySignatureRef, supportedIndicatorNameSet, syncActiveTrainingRuntime, syncCustomSamplePoolsFromDataSources, syncDrawingStoreFromChart, tradeAmountIncludesFees, tradeMarkerDensityRatio, tradingSettings, trainerDisplayPeriod, trainerHydrationState, trainerPeriodOptions, trainerResponsiveChartEdgeConfig, tt, visibleAggregatedBarsRef } = scope;
  const { applyTrainerChartFrame } = scope;
  const { displayedWorkspacePage } = scope;
  const displayPeriodFrameRequestVersionRef = useRef(0);
  const displayPeriodFrameAbortControllerRef = useRef<AbortController | null>(null);
  const pendingTrainerDisplayPeriodRef = useRef<DisplayPeriodKey | null>(null);
  const trainerChartSurfacePage = resolveTrainerChartSurfacePage({
    activePage,
    displayedPage: displayedWorkspacePage,
  });
  const chartPipelineSurface =
    TRAINER_CHART_PIPELINE_SURFACE_DEFINITIONS[
      resolveTrainerChartPipelineSurfaceId(trainerChartSurfacePage ?? "")
    ];
  const isTrainerLikePage = chartPipelineSurface.ownsTrainerSession;
  const showTrainerVolumePane = useMemo(() => {
    if (
      chartPipelineSurface.acceptsSpecialTrainingChartState &&
      specialTrainingChartState &&
      specialTrainingChartState.bars.length > 0
    ) {
      return shouldShowVolumePaneForReplayBars(specialTrainingChartState.bars);
    }

    const sourceCandidates = [
      snapshot?.session.samplePoolId,
      currentTrainingPoolMeta.id,
    ]
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0);
    const sourceSummary = localDataSourceSummaries.find((source) => {
      const sourceId = String(source.id || "").trim();
      const samplePoolId = String(source.samplePoolId || "").trim();
      return sourceCandidates.some(
        (candidate) => candidate === sourceId || candidate === samplePoolId,
      );
    });
    if (sourceSummary) {
      return shouldShowVolumePaneForLocalSource(sourceSummary.fieldMapping);
    }
    return true;
  }, [
    chartPipelineSurface.acceptsSpecialTrainingChartState,
    currentTrainingPoolMeta.id,
    localDataSourceSummaries,
    snapshot?.session.samplePoolId,
    specialTrainingChartState,
  ]);
  showTrainerVolumePaneRef.current = showTrainerVolumePane;

  useEffect(() => {
    adjustPaneHeights();
  }, [adjustPaneHeights, showTrainerVolumePane]);

  const cancelPendingTrainerDisplayPeriodFrame = useCallback(() => {
    displayPeriodFrameRequestVersionRef.current += 1;
    pendingTrainerDisplayPeriodRef.current = null;
    displayPeriodFrameAbortControllerRef.current?.abort();
    displayPeriodFrameAbortControllerRef.current = null;
  }, []);

  useEffect(
    () => () => {
      displayPeriodFrameAbortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!isTrainerLikePage) {
      cancelPendingTrainerDisplayPeriodFrame();
    }
  }, [cancelPendingTrainerDisplayPeriodFrame, isTrainerLikePage]);

const resolveCurrentPeriodAdvance = useCallback(
    () => periodAdvanceMetaState,
    [periodAdvanceMetaState],
  );
  const resolveCurrentPeriodAdvanceFromRefs = useCallback(() => {
    const currentSnapshot = snapshotRef.current;
    if (!currentSnapshot) {
      return resolveTrainerPeriodAdvanceMeta({
        tsMsByIndex: [],
        cursorIndex: 0,
        barsOffset: barsOffsetRef.current,
        barsTotal: barsTotalRef.current,
        allowStep: false,
        displayPeriod: trainerDisplayPeriod,
        baseTimeframe: effectiveTrainingBaseTimeframe,
        timeZone: barsTimeZone ?? undefined,
      });
    }
    return resolveTrainerPeriodAdvanceMeta({
      tsMsByIndex: buildReplayBarTimestampMs(barsRef.current),
      cursorIndex: currentSnapshot.session.cursor_index,
      barsOffset: barsOffsetRef.current,
      barsTotal: barsTotalRef.current,
      allowStep: Boolean(currentSnapshot.actionState?.allowStep),
      displayPeriod: trainerDisplayPeriod,
      baseTimeframe: effectiveTrainingBaseTimeframe,
      timeZone: barsTimeZone ?? undefined,
    });
  }, [
    barsOffsetRef,
    barsRef,
    barsTimeZone,
    barsTotalRef,
    effectiveTrainingBaseTimeframe,
    snapshotRef,
    trainerDisplayPeriod,
  ]);
  const ensureCurrentPeriodAdvance = useCallback(async () => {
    let current = resolveCurrentPeriodAdvanceFromRefs();
    const canUseCurrent = () =>
      current.stepForCurrentClose > 0 ||
      !current.hasFutureBars ||
      !current.needsFutureBars;
    if (canUseCurrent()) {
      return current;
    }
    const currentSnapshot = snapshotRef.current;
    const symbol = String(currentSnapshot?.session.symbol || "").trim().toUpperCase();
    if (!currentSnapshot || !symbol) {
      return current;
    }
    const cursorIndex = Math.max(
      0,
      Math.floor(Number(currentSnapshot.session.cursor_index) || 0),
    );
    let prefetch = TRAINER_BACKGROUND_FETCH_MAX_BARS;
    for (
      let attempt = 0;
      attempt < TRAINER_PERIOD_ADVANCE_PREFETCH_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const previousLoadedEnd =
        barsOffsetRef.current + Math.max(0, barsRef.current.length - 1);
      await ensureBarsForward(symbol, cursorIndex + 1, prefetch);
      current = resolveCurrentPeriodAdvanceFromRefs();
      if (canUseCurrent()) {
        return current;
      }
      const nextLoadedEnd =
        barsOffsetRef.current + Math.max(0, barsRef.current.length - 1);
      if (nextLoadedEnd <= previousLoadedEnd) {
        return current;
      }
      prefetch += TRAINER_BACKGROUND_FETCH_MAX_BARS;
    }
    return resolveCurrentPeriodAdvanceFromRefs();
  }, [
    barsOffsetRef,
    barsRef,
    ensureBarsForward,
    resolveCurrentPeriodAdvanceFromRefs,
    snapshotRef,
  ]);

  useTrainerBootstrapLifecycle({
    appIsMountedRef,
    appBootstrapAbortControllerRef,
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshTradingSettings,
    shouldDeferLowPriorityFollowUps: () =>
      isTrainerHydrationPending(trainerHydrationState),
    setHint,
    setError,
    tt,
  });

  useEffect(() => {
    void syncActiveTrainingRuntime();
  }, [customIndicatorProfileVersionToken, syncActiveTrainingRuntime, tradingSettings]);

  useEffect(() => {
    void syncActiveTrainingRuntime();
  }, [localDataSourceSummaries, syncActiveTrainingRuntime]);

  useEffect(() => {
    if (activePage === "COMMAND_CENTER" || activePage === "HISTORY" || activePage === "NOTES" || activePage === "CHALLENGE_STATS") {
      prefetchWorkspacePageData(activePage);
    }
  }, [activePage, prefetchWorkspacePageData]);

  useEffect(() => {
    if (activePage !== "SETTINGS") {
      return;
    }
    void refreshSystemStorageUsage();
  }, [activePage, refreshSystemStorageUsage]);

  useTrainerChartStyleSync({
    chartReady,
    chartRef,
    effectiveThemeMode,
    priceColorMode,
    chartRenderMode,
    language,
    trainerResponsiveChartEdgeConfig,
    applyTrainerMaxOffsetRightDistance,
    adjustPaneHeights,
    mainNativeIndicator,
    signalTopIndicator,
    signalBottomIndicator,
    supportedIndicatorNameSet,
    showVolumePane: showTrainerVolumePane,
    hideLastPriceMark: chartPipelineSurface.hideLastPriceMark,
  });

  useEffect(() => {
    if (!chartReady) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const mainIndicatorMountKey = [
      mainNativeIndicator,
      mainNativeIndicatorParams.join(","),
      supportedIndicatorNameSet.has(mainNativeIndicator) ? "1" : "0",
      customIndicatorProfileVersionToken,
    ].join("|");
    if (lastMainIndicatorMountKeyRef.current === mainIndicatorMountKey) {
      return;
    }
    lastMainIndicatorMountKeyRef.current = mainIndicatorMountKey;
    chart.removeIndicator({ id: INDICATOR_IDS.mainNative });
    if (isIndicatorNone(mainNativeIndicator) || !supportedIndicatorNameSet.has(mainNativeIndicator)) {
      if (mainNativeIndicatorParams.length) {
        setMainNativeIndicatorParams([]);
      }
      return;
    }
    const { mounted, resolvedParams } = mountMainIndicator({
      chart,
      indicatorId: INDICATOR_IDS.mainNative,
      indicatorName: mainNativeIndicator,
      calcParams: mainNativeIndicatorParams,
      priceColorMode,
    });
    applyIndicatorStyles(chart, priceColorMode, [
      {
        id: INDICATOR_IDS.mainNative,
        name: mainNativeIndicator,
        enabled: mounted,
        enableChartSettingsTooltip: true,
      },
    ]);
    if (mounted && !isSameNumericArray(resolvedParams, mainNativeIndicatorParams)) {
      setMainNativeIndicatorParams(resolvedParams);
    }
  }, [chartReady, customIndicatorProfileVersionToken, mainNativeIndicator, mainNativeIndicatorParams, priceColorMode, supportedIndicatorNameSet]);

  const {
    isSpecialTrainingChartOverrideActive,
    specialTrainingChartOverride,
    chartPipelineBars,
    chartPipelineSnapshot,
    chartPipelineSessionId,
    chartPipelineCursorIndexOverride,
    chartPipelineWindowStartIndexOverride,
    chartPipelineDecisionBoundaryRawIndexOverride,
    chartPipelineDecisionMarkerOverride,
    chartPipelineTradeMarkersOverride,
    chartPipelineFastDecisionExtremeRayOverride,
    chartPipelineRiskDisciplineGuidesOverride,
    chartPipelineTooltipSymbolOverride,
    chartPipelineTradeMarkerBasePeriod,
  } = resolveTrainerChartPipelineAdapterState({
    surface: chartPipelineSurface,
    specialTrainingChartState,
    bars,
    snapshot,
    sessionId,
    specialTrainingChartBaseTimeframe,
    effectiveTrainingBaseTimeframe,
  });
  const getCachedSpecialTrainingAggregatedBars = useSpecialTrainingAggregationCache({
    enabled: isSpecialTrainingChartOverrideActive,
    questionId: specialTrainingChartOverride?.questionId ?? "",
    bars: chartPipelineBars,
    baseTimeframe: specialTrainingChartBaseTimeframe,
    barsTimeZone,
  });
  const getChartPipelineAggregatedBars = useCallback(
    (period: DisplayPeriodKey, startRawIndex: number, endRawIndex: number): AggregatedBarItem[] => {
      if (!isSpecialTrainingChartOverrideActive) {
        return getCachedTrainerAggregatedBars(period, startRawIndex, endRawIndex);
      }
      return getCachedSpecialTrainingAggregatedBars(period, startRawIndex, endRawIndex);
    },
    [
      getCachedSpecialTrainingAggregatedBars,
      getCachedTrainerAggregatedBars,
      isSpecialTrainingChartOverrideActive,
    ],
  );

  const requestTrainerDisplayPeriodChange = useCallback(
    (period: DisplayPeriodKey) => {
      if (!isDisplayPeriodKey(period)) {
        return;
      }

      const targetPeriod = period;
      if (!isTrainerLikePage || isSpecialTrainingChartOverrideActive) {
        cancelPendingTrainerDisplayPeriodFrame();
        setTrainerDisplayPeriod(targetPeriod);
        return;
      }

      const pendingPeriod = pendingTrainerDisplayPeriodRef.current;
      if (pendingPeriod === targetPeriod) {
        return;
      }
      if (targetPeriod === trainerDisplayPeriod) {
        cancelPendingTrainerDisplayPeriodFrame();
        return;
      }

      const currentSnapshot = snapshotRef.current;
      const normalizedSessionId = String(currentSnapshot?.session.id || sessionId || "").trim();
      if (!currentSnapshot) {
        if (!normalizedSessionId) {
          cancelPendingTrainerDisplayPeriodFrame();
          setTrainerDisplayPeriod(targetPeriod);
        }
        return;
      }

      const session = currentSnapshot.session;
      const symbol = String(session.symbol || selectedSymbol || "").trim().toUpperCase();
      const instrumentId = String(session.instrument_id || selectedInstrumentId || "").trim();
      const timeframe = (
        String(session.timeframe || effectiveTrainingBaseTimeframe || "1d")
          .trim()
          .toLowerCase()
      ) as BaseTimeframe;
      if (!symbol || !instrumentId) {
        return;
      }

      syncDrawingStoreFromChart(currentDisplayPeriodRef.current);
      const currentBars = barsRef.current;
      if (
        currentBars.length > 0 &&
        currentBars[0]?.displayPeriod === targetPeriod &&
        currentBars[currentBars.length - 1]?.displayPeriod === targetPeriod
      ) {
        cancelPendingTrainerDisplayPeriodFrame();
        setTrainerDisplayPeriod(targetPeriod);
        return;
      }

      ensureBarsForwardAbortControllerRef.current?.abort();
      ensureBarsBackwardAbortControllerRef.current?.abort();
      displayPeriodFrameAbortControllerRef.current?.abort();

      const requestVersion = displayPeriodFrameRequestVersionRef.current + 1;
      displayPeriodFrameRequestVersionRef.current = requestVersion;
      pendingTrainerDisplayPeriodRef.current = targetPeriod;
      const abortController = new AbortController();
      displayPeriodFrameAbortControllerRef.current = abortController;
      const frameRequest = buildTrainerDisplayPeriodFrameRequest({
        sourceTimeframe: timeframe,
        targetDisplayPeriod: targetPeriod,
        anchorRawIndex: session.cursor_index,
        before: TRAINER_LAUNCH_BACKWARD_BARS,
        after: TRAINER_LAUNCH_FORWARD_BARS,
      });

      void (async () => {
        try {
          const frame = await api.getBarsFrame(symbol, frameRequest.timeframe, 0, frameRequest.maxDisplayBars, {
            signal: abortController.signal,
            instrumentId,
            displayPeriod: frameRequest.displayPeriod,
            anchorRawIndex: frameRequest.anchorRawIndex,
            before: frameRequest.before,
            after: frameRequest.after,
            maxDisplayBars: frameRequest.maxDisplayBars,
          });
          if (
            abortController.signal.aborted ||
            displayPeriodFrameRequestVersionRef.current !== requestVersion ||
            pendingTrainerDisplayPeriodRef.current !== targetPeriod ||
            frame.displayPeriod !== frameRequest.displayPeriod ||
            frame.timestampMs.length <= 0
          ) {
            return;
          }
          applyTrainerChartFrame(frame, { expectedDisplayPeriod: targetPeriod });
          setTrainerDisplayPeriod(targetPeriod);
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.warn("[trainer] failed to load display period frame", error);
          }
        } finally {
          if (displayPeriodFrameRequestVersionRef.current === requestVersion) {
            pendingTrainerDisplayPeriodRef.current = null;
          }
          if (displayPeriodFrameAbortControllerRef.current === abortController) {
            displayPeriodFrameAbortControllerRef.current = null;
          }
        }
      })();
    },
    [
      applyTrainerChartFrame,
      barsRef,
      cancelPendingTrainerDisplayPeriodFrame,
      currentDisplayPeriodRef,
      effectiveTrainingBaseTimeframe,
      ensureBarsBackwardAbortControllerRef,
      ensureBarsForwardAbortControllerRef,
      isSpecialTrainingChartOverrideActive,
      isTrainerLikePage,
      selectedInstrumentId,
      selectedSymbol,
      sessionId,
      setTrainerDisplayPeriod,
      snapshotRef,
      syncDrawingStoreFromChart,
      trainerDisplayPeriod,
    ],
  );

  useTrainerChartSymbolSync({
    chartReady,
    chartRef,
    chartDataRef,
    snapshotSymbol: chartPipelineTooltipSymbolOverride || snapshot?.session.symbol,
    selectedSymbol: chartPipelineTooltipSymbolOverride || selectedSymbol,
  });

  useTrainerDisplayPeriodSync({
    chartReady,
    chartRef,
    trainerDisplayPeriod,
    currentDisplayPeriodRef,
    pendingDrawingRebuildPeriodRef,
    drawingOverlayIdRef,
    syncDrawingStoreFromChart,
    showDrawingsAcrossPeriods,
  });

  useRuntimeTrainerDrawingSyncEffect({
    activePage,
    chartReady,
    chartRef,
    currentDisplayPeriodRef,
    pendingDrawingRebuildPeriodRef,
    syncDrawingStoreFromChart,
    rebuildDrawingsByPeriod,
    refreshDrawingMeta,
  });

  useRuntimeTrainerSignalIndicatorMountEffect({
    chartReady,
    chartRef,
    lastSignalIndicatorMountKeyRef,
    signalTopIndicator,
    signalTopIndicatorParams,
    setSignalTopIndicatorParams,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    setSignalBottomIndicatorParams,
    supportedIndicatorNameSet,
    customIndicatorProfileVersionToken,
    priceColorMode,
    adjustPaneHeights,
  });

  useRuntimeTrainerVolumeIndicatorVisibilityEffect({
    chartReady,
    chartRef,
    showVolumePane: showTrainerVolumePane,
    priceColorMode,
    adjustPaneHeights,
  });

  useRuntimeTrainerSignalIndicatorVisibilityEffect({
    chartReady,
    chartRef,
    showTrainerSubIndicators,
    showVolumePane: showTrainerVolumePane,
    signalTopIndicator,
    signalTopIndicatorParams,
    signalBottomIndicator,
    signalBottomIndicatorParams,
    supportedIndicatorNameSet,
    priceColorMode,
    adjustPaneHeights,
  });

  const { systemMarkerHeavySignature, systemMarkerPositionSignature } =
    useRuntimeSystemMarkerSignatures({
      snapshot,
      replayNotes,
      currentTrainingProjectId: chartPipelineSessionId,
      currentTrainingPoolId: currentTrainingPoolMeta.id,
      tradeAmountIncludesFees,
      tradeMarkerDensityRatio,
    });
  const trainerChartIndicatorQuickMenu = useMemo(() => {
    if (!indicatorQuickMenuState) {
      return null;
    }

    if (indicatorQuickMenuState.target === "main") {
      const [noneOption, ...options] = mainIndicatorSelectOptions;
      return {
        open: true,
        anchorLeft: indicatorQuickMenuState.anchorLeft,
        anchorTop: indicatorQuickMenuState.anchorTop,
        currentValue: mainNativeIndicator,
        noneOption: noneOption ?? null,
        options,
        groups: [],
        onOpenChange: (open: boolean) => {
          if (!open) {
            closeIndicatorQuickMenu();
          }
        },
        onSelect: (value: string) => {
          setMainNativeIndicator(value);
          closeIndicatorQuickMenu();
        },
      };
    }

    return {
      open: true,
      anchorLeft: indicatorQuickMenuState.anchorLeft,
      anchorTop: indicatorQuickMenuState.anchorTop,
      currentValue:
        indicatorQuickMenuState.target === "top"
          ? signalTopIndicator
          : signalBottomIndicator,
      noneOption: groupedSignalIndicatorSelectOptions.noneOption,
      options: [],
      groups: groupedSignalIndicatorSelectOptions.groups,
      onOpenChange: (open: boolean) => {
        if (!open) {
          closeIndicatorQuickMenu();
        }
      },
      onSelect: (value: string) => {
        if (indicatorQuickMenuState.target === "top") {
          setSignalTopIndicator(value as typeof signalTopIndicator);
        } else {
          setSignalBottomIndicator(value as typeof signalBottomIndicator);
        }
        closeIndicatorQuickMenu();
      },
    };
  }, [
    closeIndicatorQuickMenu,
    groupedSignalIndicatorSelectOptions.groups,
    groupedSignalIndicatorSelectOptions.noneOption,
    indicatorQuickMenuState,
    mainIndicatorSelectOptions,
    mainNativeIndicator,
    setMainNativeIndicator,
    setSignalBottomIndicator,
    setSignalTopIndicator,
    signalBottomIndicator,
    signalTopIndicator,
  ]);

  useTrainerChartDataRenderPipeline({
    chartReady,
    chartRef,
    chartDomRef,
    bars: chartPipelineBars,
    snapshot: chartPipelineSnapshot,
    cursorIndexOverride: chartPipelineCursorIndexOverride,
    windowStartIndexOverride: chartPipelineWindowStartIndexOverride,
    decisionBoundaryRawIndexOverride: chartPipelineDecisionBoundaryRawIndexOverride,
    decisionMarkerOverride: chartPipelineDecisionMarkerOverride,
    tradeMarkersOverride: chartPipelineTradeMarkersOverride,
    tradeMarkerBasePeriod: chartPipelineTradeMarkerBasePeriod,
    deferSystemMarkers:
      isTrainerLikePage &&
      isTrainerHydrationPending(trainerHydrationState),
    tradeMarkerDensityRatio,
    fastDecisionExtremeRayOverride: chartPipelineFastDecisionExtremeRayOverride,
    riskDisciplineGuidesOverride: chartPipelineRiskDisciplineGuidesOverride,
    chartThemeMode: effectiveThemeMode,
    priceColorMode,
    tradeColorTheme,
    showGlobalDecimals,
    tooltipSymbolOverride: chartPipelineTooltipSymbolOverride,
    trainerDisplayPeriod,
    activeToolbarSymbol,
    sessionId: chartPipelineSessionId,
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
    getCachedTrainerAggregatedBars: getChartPipelineAggregatedBars,
    mapVisibleItemToKline: mapBarToKline,
    createSystemMarkers,
    setTrainerDisplayPeriod: requestTrainerDisplayPeriodChange,
  });

  useTrainerAggregationPrewarm({
    activePage,
    enabled:
      !(isTrainerLikePage &&
        isTrainerHydrationPending(trainerHydrationState)),
    chartReady,
    barsLength: chartPipelineBars.length,
    snapshot: chartPipelineSnapshot,
    trainerDisplayPeriod,
    trainerPeriodOptions,
    getCachedTrainerAggregatedBars: getChartPipelineAggregatedBars,
    aggregationPrewarmTaskRef,
  });

  usePendingDrawingsRestore({
    activePage,
    chartReady,
    chartRef,
    pendingRestoreDrawings,
    trainerDisplayPeriod,
    shouldRenderDrawingInPeriod,
    projectDrawingPointsForPeriod,
    getDrawingMinPointCount,
    setPendingRestoreDrawings,
    refreshDrawingMeta,
  });

  const activeSessionTradingSettings = useMemo(() => {
    return (
      snapshot?.sessionTradingSettings ??
      resolveSessionTradingSettingsByPoolId(currentTrainingPoolMeta.id) ??
      tradingSettings
    );
  }, [
    currentTrainingPoolMeta.id,
    resolveSessionTradingSettingsByPoolId,
    snapshot?.sessionTradingSettings,
    tradingSettings,
  ]);
  const lastTrainerSessionTradingSettingsSyncSignatureRef = useRef("");
  useEffect(() => {
    const normalizedSessionId = String(sessionId || "").trim();
    if (
      !isTrainerLikePage ||
      !normalizedSessionId ||
      !snapshot?.sessionTradingSettings ||
      isSavingTradingSettings
    ) {
      if (!normalizedSessionId) {
        lastTrainerSessionTradingSettingsSyncSignatureRef.current = "";
      }
      return;
    }
    if (trainerHydrationState !== "READY") {
      return;
    }
    const nextSignature = `${normalizedSessionId}|${JSON.stringify(snapshot.sessionTradingSettings)}`;
    if (lastTrainerSessionTradingSettingsSyncSignatureRef.current === nextSignature) {
      return;
    }
    lastTrainerSessionTradingSettingsSyncSignatureRef.current = nextSignature;
    applyResolvedTradingSettingsToForm(snapshot.sessionTradingSettings);
  }, [
    applyResolvedTradingSettingsToForm,
    isTrainerLikePage,
    isSavingTradingSettings,
    sessionId,
    snapshot?.sessionTradingSettings,
    trainerHydrationState,
  ]);
  const isInitialSecuritiesEditable =
    !String(sessionId || "").trim() ||
    Math.max(
      0,
      Number(snapshot?.fillsTotal ?? snapshot?.fills.length ?? 0),
    ) <= 0;
  const initialSecuritiesLockedReason = tt("appText.replayAlreadyFilledTradesInitialAvailableFundsChanged");
  return { activeSessionTradingSettings, chartPipelineBars, chartPipelineCursorIndexOverride, chartPipelineDecisionBoundaryRawIndexOverride, chartPipelineDecisionMarkerOverride, chartPipelineFastDecisionExtremeRayOverride, chartPipelineRiskDisciplineGuidesOverride, chartPipelineSessionId, chartPipelineSnapshot, chartPipelineTooltipSymbolOverride, chartPipelineTradeMarkersOverride, chartPipelineWindowStartIndexOverride, ensureCurrentPeriodAdvance, getCachedSpecialTrainingAggregatedBars, getChartPipelineAggregatedBars, initialSecuritiesLockedReason, isInitialSecuritiesEditable, isSpecialTrainingChartOverrideActive, isTrainerLikePage, lastTrainerSessionTradingSettingsSyncSignatureRef, requestTrainerDisplayPeriodChange, resolveCurrentPeriodAdvance, resolveCurrentPeriodAdvanceFromRefs, specialTrainingChartOverride, systemMarkerHeavySignature, systemMarkerPositionSignature, trainerChartIndicatorQuickMenu };
};
