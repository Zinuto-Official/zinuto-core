// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { type KLineData } from "klinecharts";
import { api } from "@/api";
import {
  formatMoney,
} from "@/ui/formatting/format";
import { useSamplePoolDisplayNameResolver } from "@/app-shell/useSamplePoolDisplayNameResolver";
import { useSystemMarkerController } from "@/app-shell/useSystemMarkerController";
import { useReplayNoteMarkerNavigation } from "@/app-shell/useReplayNoteMarkerNavigation";
import { useAppDrawingPersistence } from "@/app-shell/useAppDrawingPersistence";
import {
  TRAINER_BACKGROUND_FETCH_MAX_BARS,
  TRAINER_FORWARD_PREFETCH_TRIGGER_BARS,
  isTrainerHydrationPending,
} from "@/domains/trainer/trainerHydration";
import {
  mergeTrainerChartBarsWindow,
  type TrainerChartBarsWindow,
} from "@/domains/trainer/trainerChartBarsWindow";
import {
  type UiSettings
} from "@/frontend-kernel/appTypes";
import {
  STORAGE_USAGE_REFRESH_MIN_MS,
  waitForDuration,
} from "@/frontend-kernel/runtimeConstants";
import {
  mapBarToKline,
  formatRateInput,
} from "@/frontend-kernel/valueFormat";
import {
  buildCustomSamplePoolsFromDataSources,
} from "@/app-shell/appSamplePools";
import {
  DEFAULT_POOL_LOT_SIZE,
  SAMPLE_POOL_ALL_ID,
  getBuiltInSamplePools,
} from "@/domains/trainer/samplePools";
import { resolveActiveImportCardSourceFolderBySourceId } from "@/app-shell/importCardSourceFolder";
import {
  shouldSyncGlobalTradingSettingsIntoForm,
  useTrainerBootstrapData,
} from "@/domains/trainer/useTrainerBootstrapData";
import { useTrainerSessionOrchestrator } from "@/domains/trainer/useTrainerSessionOrchestrator";
import {
  frameToReplayRange,
  resolveReplayBarLocalIndexForRawIndex,
} from "@/domains/trainer/marketFrameStore";
import type {
  MarketBarFrame,
  ResumableSessionSummary,
} from "@/domains/training/types";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
type RuntimeHookScope = AppRootRuntimeProps &
  ReturnType<typeof useRuntimeStartupState> &
  ReturnType<typeof useRuntimeStartupHistoryState> &
  ReturnType<typeof useRuntimeStartupPersistence> &
  Record<string, unknown>;

const STORAGE_USAGE_FOLLOWUP_INTERVAL_MS = 500;
// Covers one bounded 4s measurement, its 5s backoff, and one complete retry.
const STORAGE_USAGE_FOLLOWUP_DEADLINE_MS = 20_000;

export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};





type TrainerBarsFrameOptions = {
  signal?: AbortSignal;
  instrumentId?: string;
  displayPeriod?: DisplayPeriodKey;
  anchorRawIndex?: number;
  anchorDisplayIndex?: number;
  direction?: "FORWARD" | "BACKWARD";
  before?: number;
  after?: number;
  maxDisplayBars?: number;
};

type ApplyTrainerChartFrameOptions = {
  mode?: "replace" | "merge";
  expectedDisplayPeriod?: DisplayPeriodKey;
};

export const useRuntimeTrainerChartSession = (scope: RuntimeHookScope) => {
  const {
    activePage,
    appIsMountedRef,
    bars,
    barsOffset,
    barsOffsetRef,
    barsRef,
    barsTimeZone,
    barsTotal,
    barsTotalRef,
    chartDomRef,
    chartRef,
    csvImportCardStates,
    customPoolNameOverrides,
    currentDisplayPeriodRef,
    customSamplePools,
    drawingStoreRef,
    effectiveTrainingBaseTimeframe,
    ensureBarsBackwardAbortControllerRef,
    ensureBarsForwardAbortControllerRef,
    historyRefreshInProgressRef,
    isLoadingMoreBarsRef,
    isPrefetchingBarsRef,
    isPlacingOrderRef,
    isPreparingAction,
    language,
    lastLiveRuntimeSyncAtRef,
    localDataSourceSummaries,
    pendingDrawingRebuildPeriodRef,
    playingLockRef,
    replayNotes,
    selectedDrawingIdRef,
    selectedInstrumentId,
    selectedSymbol,
    sessionId,
    sessionIdRef,
    setActivePage,
    setActiveSamplePoolId,
    setActiveTrainingRecordNoteId,
    setAllDrawingsVisible,
    setAllowLongMarginTrading,
    setAllowShortSelling,
    setBars,
    setBarsOffset,
    setBarsTimeZone,
    setBarsTotal,
    setCommissionMinimumFeeInput,
    setCommissionRateInput,
    setContractMultiplierInput,
    setCustomSamplePools,
    setDrawingCount,
    setEditingSamplePoolId,
    setError,
    setFreeReplayEndSettlementMode,
    setFundingRateInput,
    setHistorySamplePoolFilter,
    setInitialSecuritiesInput,
    setInstruments,
    setIsSystemStorageUsageLoading,
    setLocalDataSourceSummaries,
    setLongFinancingAnnualRateInput,
    setLongInitialMarginRatioInput,
    setLongMaintenanceMarginRatioInput,
    setLotSizeByPool,
    setMakerFeeRateInput,
    setMinTradeStepInput,
    setPlatformFeeMinimumFeeInput,
    setPlatformFeeRateInput,
    setPortableRebindTargetSourceIds,
    setPositionCostMode,
    setRegulatoryFeeRateInput,
    setRequestedSystemSettingsTab,
    setSelectedDrawingId,
    setSelectedReplayNoteId,
    setShortBorrowAnnualRateInput,
    setShortInitialMarginRatioInput,
    setShortMaintenanceMarginRatioInput,
    setSlippageRateInput,
    setSnapshot,
    setStampDutyMode,
    setStampDutyRateInput,
    setSystemStorageUsage,
    setTakerFeeRateInput,
    setTradeAmountIncludesFees,
    setTradeSettlementMode,
    setTradingAssetClass,
    setTradingMarketPresetKey,
    setTradingSettings,
    setTransactionLevyMinimumFeeInput,
    setTransactionLevyRateInput,
    setTransferFeeRateInput,
    showTrainerSubIndicatorsRef,
    signalBottomRef,
    signalTopRef,
    snapshot,
    snapshotAbortControllerRef,
    snapshotRef,
    snapshotRequestVersionRef,
    systemPoolNameOverrides,
    tradeAmountIncludesFees,
    tradeMarkerDensityRatio,
    trainerDisplayPeriod,
    trainerHydrationState,
    showTrainerVolumePaneRef,
    tt,
    ttf,
    visibleAggregatedBarsRef,
  } = scope;
  const activeSessionIdRef = sessionIdRef as MutableRefObject<string | null>;
  const storageUsageFollowupRef = useRef<Promise<void> | null>(null);
  const globalTradingSettingsFormSyncContextRef = useRef({
    activePage,
    sessionId,
    hasSessionTradingSettings: Boolean(snapshot?.sessionTradingSettings),
    isSessionTerminated: Boolean(snapshot?.termination?.isTerminated),
  });
  globalTradingSettingsFormSyncContextRef.current = {
    activePage,
    sessionId,
    hasSessionTradingSettings: Boolean(snapshot?.sessionTradingSettings),
    isSessionTerminated: Boolean(snapshot?.termination?.isTerminated),
  };
  const shouldWriteGlobalTradingSettingsToForm = useCallback(
    () =>
      shouldSyncGlobalTradingSettingsIntoForm(
        globalTradingSettingsFormSyncContextRef.current,
      ),
    [],
  );
  const {
    shouldRenderDrawingInPeriod,
    projectDrawingPointsForPeriod,
    syncDrawingStoreFromChart,
    rebuildDrawingsByPeriod,
    refreshDrawingMeta,
    adjustPaneHeights,
  } = useAppDrawingPersistence({
    chartRef,
    chartDomRef,
    visibleAggregatedBarsRef,
    drawingStoreRef,
    currentDisplayPeriodRef,
    pendingDrawingRebuildPeriodRef,
    barsTimeZone,
    selectedDrawingIdRef,
    signalTopRef,
    signalBottomRef,
    showTrainerSubIndicatorsRef,
    showTrainerVolumePaneRef,
    setDrawingCount,
    setAllDrawingsVisible,
    setSelectedDrawingId,
  });

  const openReplayNoteFromMarker = useReplayNoteMarkerNavigation({
    replayNotes,
    setSelectedReplayNoteId,
    setActiveTrainingRecordNoteId,
    setActivePage,
  });
  const { syncTradeMarkerCompactMode, createSystemMarkers } =
    useSystemMarkerController({
      tradeMarkerDensityRatio,
      tradeAmountIncludesFees,
      replayNotes,
      openReplayNoteFromMarker,
      formatMoney,
      tt,
      ttf,
    });

  const commitTrainerChartBarsWindow = useCallback(
    (window: TrainerChartBarsWindow) => {
      barsOffsetRef.current = window.offset;
      barsTotalRef.current = window.total;
      barsRef.current = window.bars;
      setBarsOffset(window.offset);
      setBarsTotal(window.total);
      setBars(window.bars);
      setBarsTimeZone(window.timeZone ?? null);
    },
    [
      barsOffsetRef,
      barsRef,
      barsTotalRef,
      setBars,
      setBarsOffset,
      setBarsTimeZone,
      setBarsTotal,
    ],
  );

  const applyTrainerChartFrame = useCallback(
    (
      frame?: MarketBarFrame | null,
      options?: ApplyTrainerChartFrameOptions,
    ) => {
      if (!frame) {
        return;
      }
      if (
        options?.expectedDisplayPeriod &&
        frame.displayPeriod !== options.expectedDisplayPeriod
      ) {
        console.warn("[trainer] ignored chart frame for unexpected display period", {
          expectedDisplayPeriod: options.expectedDisplayPeriod,
          frameDisplayPeriod: frame.displayPeriod,
        });
        return;
      }
      const incomingWindow = frameToReplayRange(frame);
      if (options?.mode === "merge") {
        commitTrainerChartBarsWindow(
          mergeTrainerChartBarsWindow({
            currentWindow: {
              offset: barsOffsetRef.current,
              total: barsTotalRef.current,
              bars: barsRef.current,
              timeZone: barsTimeZone,
            },
            incomingWindow,
            snapshot: snapshotRef.current,
          }),
        );
        return;
      }
      commitTrainerChartBarsWindow(incomingWindow);
    },
    [
      barsOffsetRef,
      barsRef,
      barsTimeZone,
      barsTotalRef,
      commitTrainerChartBarsWindow,
      snapshotRef,
    ],
  );

  const getTrainerBarsFrame = useCallback(
    (
      symbol: string,
      timeframe: BaseTimeframe,
      offset: number,
      limit: number,
      options?: TrainerBarsFrameOptions,
    ) =>
      api.getBarsFrame(symbol, timeframe, offset, limit, {
        ...options,
        displayPeriod: options?.displayPeriod ?? trainerDisplayPeriod,
      }),
    [trainerDisplayPeriod],
  );

  const mapReplayBarsToKlineData = useCallback(
    (replayBars: ReplayBar[], symbol: string): KLineData[] =>
      replayBars.map((bar) => ({
        ...mapBarToKline(bar),
        symbol,
      })),
    [],
  );

  const loadMoreTrainerBarsForChart = useCallback(
    async (direction: "backward" | "forward") => {
      const session = snapshotRef.current?.session;
      const symbol = String(session?.symbol || selectedSymbol || "")
        .trim()
        .toUpperCase();
      const instrumentId = String(
        session?.instrument_id || selectedInstrumentId || "",
      ).trim();
      if (!symbol || !instrumentId) {
        return {
          data: [],
          hasBackward: false,
          hasForward: false,
        };
      }

      const currentBars = barsRef.current;
      const currentOffset = Math.max(
        0,
        Math.floor(Number(barsOffsetRef.current) || 0),
      );
      const currentTotal = Math.max(
        0,
        Math.floor(Number(barsTotalRef.current) || 0),
      );
      const currentEndOffset = currentOffset + currentBars.length;
      const requestDisplayPeriod = currentDisplayPeriodRef.current;
      const timeframe = String(
        session?.timeframe || effectiveTrainingBaseTimeframe || "1d",
      )
        .trim()
        .toLowerCase() as BaseTimeframe;
      const requestLimit =
        direction === "backward"
          ? Math.min(TRAINER_BACKGROUND_FETCH_MAX_BARS, currentOffset)
          : Math.min(
              TRAINER_BACKGROUND_FETCH_MAX_BARS,
              currentTotal > 0
                ? Math.max(0, currentTotal - currentEndOffset)
                : TRAINER_BACKGROUND_FETCH_MAX_BARS,
            );
      if (requestLimit <= 0) {
        return {
          data: [],
          hasBackward: currentOffset > 0,
          hasForward:
            currentTotal > 0 ? currentEndOffset < currentTotal : false,
        };
      }

      if (isPrefetchingBarsRef.current) {
        ensureBarsForwardAbortControllerRef.current?.abort();
        isPrefetchingBarsRef.current = false;
      }
      const didMarkCriticalLoad = !isLoadingMoreBarsRef.current;
      isLoadingMoreBarsRef.current = true;
      try {
      const requestOffset =
        direction === "backward"
          ? Math.max(0, currentOffset - requestLimit)
          : currentEndOffset;
      const frame = await getTrainerBarsFrame(
        symbol,
        timeframe,
        requestOffset,
        requestLimit,
        {
          instrumentId,
          displayPeriod: requestDisplayPeriod,
        },
      );
      if (
        requestDisplayPeriod !== currentDisplayPeriodRef.current ||
        frame.displayPeriod !== requestDisplayPeriod
      ) {
        return {
          data: [],
          hasBackward: barsOffsetRef.current > 0,
          hasForward:
            barsTotalRef.current > 0
              ? barsOffsetRef.current + barsRef.current.length <
                barsTotalRef.current
              : false,
        };
      }
      const range = frameToReplayRange(frame);
      const fetchedBars = range.bars;
      if (!fetchedBars.length) {
        const nextTotal = Math.max(currentTotal, range.total);
        return {
          data: [],
          hasBackward: currentOffset > 0,
          hasForward: nextTotal > 0 ? currentEndOffset < nextTotal : false,
        };
      }

      const mergedWindow = mergeTrainerChartBarsWindow({
        currentWindow: {
          offset: currentOffset,
          total: currentTotal,
          bars: currentBars,
          timeZone: barsTimeZone,
        },
        incomingWindow: range,
        snapshot: snapshotRef.current,
      });

      commitTrainerChartBarsWindow({
        offset: mergedWindow.offset,
        total: mergedWindow.total,
        bars: mergedWindow.bars,
        timeZone: mergedWindow.timeZone,
      });

      return {
        data: mapReplayBarsToKlineData(fetchedBars, symbol),
        hasBackward: mergedWindow.offset > 0,
        hasForward: mergedWindow.offset + mergedWindow.bars.length < mergedWindow.total,
      };
      } finally {
        if (didMarkCriticalLoad) {
          isLoadingMoreBarsRef.current = false;
        }
      }
    },
    [
      barsOffsetRef,
      barsRef,
      barsTotalRef,
      barsTimeZone,
      commitTrainerChartBarsWindow,
      currentDisplayPeriodRef,
      ensureBarsForwardAbortControllerRef,
      effectiveTrainingBaseTimeframe,
      getTrainerBarsFrame,
      isLoadingMoreBarsRef,
      isPrefetchingBarsRef,
      mapReplayBarsToKlineData,
      selectedInstrumentId,
      selectedSymbol,
      snapshotRef,
    ],
  );

  const { ensureBarsForward, refreshSnapshot } = useTrainerSessionOrchestrator({
    appIsMountedRef,
    barsRef,
    barsOffsetRef,
    barsTotalRef,
    isLoadingMoreBarsRef,
    isPrefetchingBarsRef,
    ensureBarsForwardAbortControllerRef,
    ensureBarsBackwardAbortControllerRef,
    historyRefreshInProgressRef,
    snapshotRef,
    sessionIdRef: activeSessionIdRef,
    snapshotAbortControllerRef,
    snapshotRequestVersionRef,
    setBars,
    setBarsOffset,
    setBarsTotal,
    setSnapshot,
    getBarsFrame: getTrainerBarsFrame,
    getSnapshot: api.getSnapshot,
  });

  const prefetchTrainerForwardBars = useCallback(async () => {
    const currentSnapshot = snapshotRef.current;
    const session = currentSnapshot?.session;
    const requestSessionId = String(session?.id || "").trim();
    const currentSessionId = String(activeSessionIdRef.current || sessionId || "").trim();
    const symbol = String(session?.symbol || selectedSymbol || "")
      .trim()
      .toUpperCase();
    const instrumentId = String(
      session?.instrument_id || selectedInstrumentId || "",
    ).trim();
    if (
      activePage !== "TRAINER" ||
      isTrainerHydrationPending(trainerHydrationState) ||
      isPreparingAction ||
      playingLockRef.current ||
      isPlacingOrderRef.current ||
      isLoadingMoreBarsRef.current ||
      isPrefetchingBarsRef.current ||
      historyRefreshInProgressRef.current ||
      !session ||
      !requestSessionId ||
      requestSessionId !== currentSessionId ||
      !symbol ||
      !instrumentId
    ) {
      return;
    }

    const currentBars = barsRef.current;
    const currentTotal = Math.max(
      0,
      Math.floor(Number(barsTotalRef.current) || 0),
    );
    const currentEndOffset =
      Math.max(0, Math.floor(Number(barsOffsetRef.current) || 0)) +
      currentBars.length;
    if (!currentBars.length || currentTotal <= 0 || currentEndOffset >= currentTotal) {
      return;
    }

    const cursorLocalIndex = resolveReplayBarLocalIndexForRawIndex(
      currentBars,
      session.cursor_index,
    );
    if (cursorLocalIndex < 0) {
      return;
    }
    const loadedForwardBars = currentBars.length - cursorLocalIndex - 1;
    if (loadedForwardBars > TRAINER_FORWARD_PREFETCH_TRIGGER_BARS) {
      return;
    }

    await ensureBarsForward(
      symbol,
      cursorLocalIndex + 1,
      TRAINER_BACKGROUND_FETCH_MAX_BARS,
      { priority: "prefetch" },
    );
  }, [
    activePage,
    activeSessionIdRef,
    barsOffsetRef,
    barsRef,
    barsTotalRef,
    ensureBarsForward,
    historyRefreshInProgressRef,
    isLoadingMoreBarsRef,
    isPlacingOrderRef,
    isPrefetchingBarsRef,
    isPreparingAction,
    playingLockRef,
    selectedInstrumentId,
    selectedSymbol,
    sessionId,
    snapshotRef,
    trainerHydrationState,
  ]);

  useEffect(() => {
    if (
      activePage !== "TRAINER" ||
      isTrainerHydrationPending(trainerHydrationState) ||
      !String(sessionId || "").trim() ||
      !snapshot
    ) {
      return undefined;
    }
    let cancelled = false;
    const runPrefetch = () => {
      if (!cancelled) {
        void prefetchTrainerForwardBars();
      }
    };
    const runtimeWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof runtimeWindow.requestIdleCallback === "function") {
      const idleHandle = runtimeWindow.requestIdleCallback(runPrefetch, {
        timeout: 500,
      });
      return () => {
        cancelled = true;
        runtimeWindow.cancelIdleCallback?.(idleHandle);
      };
    }
    const timer = window.setTimeout(runPrefetch, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activePage,
    bars.length,
    barsOffset,
    barsTotal,
    prefetchTrainerForwardBars,
    sessionId,
    snapshot,
    snapshot?.session.cursor_index,
    trainerDisplayPeriod,
    trainerHydrationState,
  ]);

  const syncActiveTrainingRuntime = useCallback(async () => {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) {
      return;
    }
    if (activePage !== "TRAINER") {
      return;
    }
    if (isTrainerHydrationPending(trainerHydrationState)) {
      return;
    }
    const now = Date.now();
    if (now - lastLiveRuntimeSyncAtRef.current < 180) {
      return;
    }
    lastLiveRuntimeSyncAtRef.current = now;
    try {
      await refreshSnapshot(normalizedSessionId);
    } catch {
      // Keep current view if refresh fails; next interaction will fetch snapshot again.
    }
  }, [activePage, refreshSnapshot, sessionId, trainerHydrationState]);

  const [latestResumableTrainerSession, setLatestResumableTrainerSession] =
    useState<ResumableSessionSummary | null>(null);
  const hasLiveResumableTrainerSession =
    Boolean(String(sessionId || "").trim()) &&
    !Boolean(snapshot?.termination?.isTerminated);
  const refreshLatestResumableTrainerSession = useCallback(async () => {
    try {
      const latest = await api.getLatestResumableSession();
      if (!appIsMountedRef.current) {
        return null;
      }
      setLatestResumableTrainerSession(latest);
      return latest;
    } catch {
      if (appIsMountedRef.current) {
        setLatestResumableTrainerSession(null);
      }
      return null;
    }
  }, [appIsMountedRef]);

  useEffect(() => {
    if (hasLiveResumableTrainerSession) {
      return;
    }
    void refreshLatestResumableTrainerSession();
  }, [hasLiveResumableTrainerSession, refreshLatestResumableTrainerSession]);

  const resolveSourceFolderOverrideBySourceId = useCallback(
    (sourceId: string) => {
      return resolveActiveImportCardSourceFolderBySourceId(
        sourceId,
        csvImportCardStates,
      );
    },
    [csvImportCardStates],
  );

  const resolveCustomPoolNameOverrideBySourceId = useCallback(
    (sourceId: string): string =>
      customPoolNameOverrides[String(sourceId || "").trim()] || "",
    [customPoolNameOverrides],
  );

  const resolveSourceFolderBookmarkIdBySourceId = useCallback(
    (sourceId: string): string => {
      const normalizedSourceId = String(sourceId || "").trim();
      if (!normalizedSourceId) {
        return "";
      }
      const fromSummary = localDataSourceSummaries.find(
        (item) => String(item.id || "").trim() === normalizedSourceId,
      );
      const summaryBookmarkId = String(
        fromSummary?.sourceFolderBookmarkId || "",
      ).trim();
      return summaryBookmarkId;
    },
    [localDataSourceSummaries],
  );

  const {
    refreshInstruments,
    syncCustomSamplePoolsFromDataSources,
    refreshTradingSettings,
  } = useTrainerBootstrapData({
    appIsMountedRef,
    samplePoolAllId: SAMPLE_POOL_ALL_ID,
    defaultPoolLotSize: DEFAULT_POOL_LOT_SIZE,
    getBuiltInSamplePools,
    buildCustomSamplePoolsFromDataSources,
    listInstruments: api.listInstruments,
    listLocalDataSources: api.listLocalDataSources,
    getTradingSettings: api.getTradingSettings,
    formatMoney,
    formatRateInput,
    setInstruments,
    setCustomSamplePools,
    setLotSizeByPool,
    setEditingSamplePoolId,
    setActiveSamplePoolId,
    setHistorySamplePoolFilter,
    setTradingSettings,
    setInitialSecuritiesInput,
    setTradingAssetClass,
    setTradingMarketPresetKey,
    setMinTradeStepInput,
    setCommissionRateInput,
    setMakerFeeRateInput,
    setTakerFeeRateInput,
    setFundingRateInput,
    setContractMultiplierInput,
    setTransferFeeRateInput,
    setRegulatoryFeeRateInput,
    setPlatformFeeRateInput,
    setTransactionLevyRateInput,
    setSlippageRateInput,
    setStampDutyRateInput,
    setCommissionMinimumFeeInput,
    setPlatformFeeMinimumFeeInput,
    setTransactionLevyMinimumFeeInput,
    setLongFinancingAnnualRateInput,
    setLongInitialMarginRatioInput,
    setLongMaintenanceMarginRatioInput,
    setShortBorrowAnnualRateInput,
    setShortInitialMarginRatioInput,
    setShortMaintenanceMarginRatioInput,
    setStampDutyMode,
    setPositionCostMode,
    setTradeSettlementMode,
    setFreeReplayEndSettlementMode,
    setTradeAmountIncludesFees,
    setAllowLongMarginTrading,
    setAllowShortSelling,
    setLocalDataSourceSummaries,
    resolveSourceFolderOverrideBySourceId,
    resolveCustomPoolNameOverrideBySourceId,
    shouldWriteGlobalTradingSettingsToForm,
  });

  const refreshSystemStorageUsage = useCallback(
    async (options?: { silent?: boolean; forceRefresh?: boolean }) => {
      const silent = Boolean(options?.silent);
      const refreshStartAt = Date.now();
      if (!silent) {
        setIsSystemStorageUsageLoading(true);
      }
      try {
        const usage = await api.getSystemStorageUsage({
          forceRefresh: Boolean(options?.forceRefresh),
        });
        if (!appIsMountedRef.current) {
          return;
        }
        setSystemStorageUsage(usage);
        if (
          usage.measurementState?.status !== "FRESH" &&
          !storageUsageFollowupRef.current
        ) {
          const followup = (async () => {
            const deadlineAt = Date.now() + STORAGE_USAGE_FOLLOWUP_DEADLINE_MS;
            let measurementState = usage.measurementState;
            while (
              appIsMountedRef.current &&
              measurementState &&
              measurementState.status !== "FRESH" &&
              Date.now() < deadlineAt
            ) {
              if (
                !measurementState.refreshPending &&
                !measurementState.nextRetryAt
              ) {
                return;
              }
              const nextRetryAt = Date.parse(measurementState.nextRetryAt ?? "");
              const delayMs = Number.isFinite(nextRetryAt)
                ? Math.max(
                    STORAGE_USAGE_FOLLOWUP_INTERVAL_MS,
                    nextRetryAt - Date.now(),
                  )
                : STORAGE_USAGE_FOLLOWUP_INTERVAL_MS;
              if (Date.now() + delayMs > deadlineAt) {
                return;
              }
              await waitForDuration(delayMs);
              if (!appIsMountedRef.current) {
                return;
              }
              const nextUsage = await api.getSystemStorageUsage().catch(() => null);
              if (!nextUsage || !appIsMountedRef.current) {
                return;
              }
              setSystemStorageUsage(nextUsage);
              measurementState = nextUsage.measurementState;
            }
          })();
          storageUsageFollowupRef.current = followup.finally(() => {
            storageUsageFollowupRef.current = null;
          });
        }
      } catch (err) {
        if (silent || !appIsMountedRef.current) {
          return;
        }
        setError(tt("appText.readStorageUsage"));
      } finally {
        if (!silent && appIsMountedRef.current) {
          const elapsedMs = Date.now() - refreshStartAt;
          await waitForDuration(STORAGE_USAGE_REFRESH_MIN_MS - elapsedMs);
          setIsSystemStorageUsageLoading(false);
        }
      }
    },
    [],
  );

  const openDeviceTransferSettings = useCallback(() => {
    setRequestedSystemSettingsTab("DATA_TRANSFER");
    setActivePage("SETTINGS");
  }, [setActivePage]);
  const openDataWorkspaceForPortableRebind = useCallback(
    (sourceIds: string[]) => {
      const normalized = Array.from(
        new Set(
          (Array.isArray(sourceIds) ? sourceIds : [])
            .map((item) => String(item || "").trim())
            .filter((item) => item.length > 0),
        ),
      );
      setPortableRebindTargetSourceIds(normalized);
      setActivePage("DATA");
    },
    [setActivePage],
  );

  const { samplePoolDisplayNameMap, resolveSamplePoolDisplayName } =
    useSamplePoolDisplayNameResolver({
      customSamplePools,
      language,
      systemPoolNameOverrides,
    });
  return {
    adjustPaneHeights,
    applyTrainerChartFrame,
    commitTrainerChartBarsWindow,
    createSystemMarkers,
    ensureBarsForward,
    getTrainerBarsFrame,
    hasLiveResumableTrainerSession,
    latestResumableTrainerSession,
    loadMoreTrainerBarsForChart,
    mapReplayBarsToKlineData,
    openDataWorkspaceForPortableRebind,
    openDeviceTransferSettings,
    openReplayNoteFromMarker,
    prefetchTrainerForwardBars,
    projectDrawingPointsForPeriod,
    rebuildDrawingsByPeriod,
    refreshDrawingMeta,
    refreshInstruments,
    refreshLatestResumableTrainerSession,
    refreshSnapshot,
    refreshSystemStorageUsage,
    refreshTradingSettings,
    resolveSamplePoolDisplayName,
    resolveSourceFolderBookmarkIdBySourceId,
    resolveSourceFolderOverrideBySourceId,
    samplePoolDisplayNameMap,
    setLatestResumableTrainerSession,
    shouldRenderDrawingInPeriod,
    syncActiveTrainingRuntime,
    syncCustomSamplePoolsFromDataSources,
    syncDrawingStoreFromChart,
    syncTradeMarkerCompactMode,
  };
};
