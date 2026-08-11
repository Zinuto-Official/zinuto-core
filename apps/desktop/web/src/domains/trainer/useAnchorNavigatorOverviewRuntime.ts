// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import type {
  FreeReplayAdvancePeriod,
  FreeReplayStartPointOverviewRange,
} from "@/domains/training/types";
import type { DisplayPeriodKey } from "@/domains/trainer/trainerTypes";
import {
  buildStartPointApplySelection,
  chooseCompleteStartPointDisplayPeriod,
  isReplayableStartPointOverviewBar,
  isStartPointDisplayPeriodCoarser,
  resolveReplayableStartPointOverviewBarByTrainingIndex,
  resolveStartPointOverviewBarByAnchor,
  resolveNextStartPointDrillDisplayPeriod,
  resolveStartPointDisplayPeriodCandidates,
} from "@/domains/trainer/startPointOverviewDisplay";
import {
  endTrainerPerfSpan,
  startTrainerPerfSpan,
} from "@/domains/trainer/trainerPerfTrace";
import type {
  AnchorNavigatorControlProps,
  AnchorOverviewBar,
  AnchorOverviewWindow,
  DayBucket,
  ViewMode,
} from "@/domains/trainer/anchorNavigatorControlTypes";
import {
  MAP_MAX_BARS,
  START_POINT_OVERVIEW_PAGE_LIMIT,
  buildAnchorOverviewWindow as buildOverviewWindow,
  clamp,
  readCachedOverviewWindow,
  toDateKey,
  writeCachedOverviewWindow,
} from "@/domains/trainer/anchorNavigatorControlModel";

type AnchorNavigatorOverviewRuntimeInput = {
  currentAnchorOverviewIndex: number | null;
  currentAnchorRef: {
    current: {
      rawAnchorIndex: number | null;
      overviewIndex: number | null;
      ts: string | null;
    };
  };
  currentAnchorTs: string | null;
  currentRawAnchorIndex?: number | null;
  effectiveInstrumentId: string;
  effectiveSamplePoolId: string;
  effectiveSymbol: string;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  getOverviewRange: AnchorNavigatorControlProps["getOverviewRange"];
  isEmbedded: boolean;
  isMapDraggingRef: { current: boolean };
  isPanelVisible: boolean;
  loadFailedLabel: string;
  loadRequestIdRef: { current: number };
  onApplyAnchor: AnchorNavigatorControlProps["onApplyAnchor"];
  open: boolean;
  overviewCacheRef: { current: Map<string, AnchorOverviewWindow> };
  rootOverview: AnchorOverviewWindow | null;
  setActiveWindow: Dispatch<SetStateAction<AnchorOverviewWindow | null>>;
  setDraftAnchorBar: Dispatch<SetStateAction<AnchorOverviewBar | null>>;
  setHasDraftAnchorSelection: Dispatch<SetStateAction<boolean>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string>>;
  setMonthPickerOpen: Dispatch<SetStateAction<boolean>>;
  setPanelAlignOffset: Dispatch<SetStateAction<number>>;
  setRootOverview: Dispatch<SetStateAction<AnchorOverviewWindow | null>>;
  setSelectedAnchorIndex: Dispatch<SetStateAction<number | null>>;
  setSelectedDateKey: Dispatch<SetStateAction<string>>;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setWeekStartPickerOpen: Dispatch<SetStateAction<boolean>>;
  setYearPickerOpen: Dispatch<SetStateAction<boolean>>;
  sourceTimeframe: AnchorNavigatorControlProps["sourceTimeframe"];
  triggerAnchorText: string;
};

export const useAnchorNavigatorOverviewRuntime = ({
  currentAnchorOverviewIndex,
  currentAnchorRef,
  currentAnchorTs,
  currentRawAnchorIndex,
  effectiveInstrumentId,
  effectiveSamplePoolId,
  effectiveSymbol,
  effectiveTimeframe,
  getOverviewRange,
  isEmbedded,
  isMapDraggingRef,
  isPanelVisible,
  loadFailedLabel,
  loadRequestIdRef,
  onApplyAnchor,
  open,
  overviewCacheRef,
  rootOverview,
  setActiveWindow,
  setDraftAnchorBar,
  setHasDraftAnchorSelection,
  setIsLoading,
  setLoadError,
  setMonthPickerOpen,
  setPanelAlignOffset,
  setRootOverview,
  setSelectedAnchorIndex,
  setSelectedDateKey,
  setViewMode,
  setWeekStartPickerOpen,
  setYearPickerOpen,
  sourceTimeframe,
  triggerAnchorText,
}: AnchorNavigatorOverviewRuntimeInput) => {
  const loadOverviewRange = useCallback(
    (
      minimumBaseTimeframe: FreeReplayAdvancePeriod,
      offset?: number,
      limit?: number,
      range?: {
        rawStartIndex?: number;
        rawEndIndex?: number;
        displayPeriod?: DisplayPeriodKey;
      },
    ) => {
      const normalizedOffset = Number.isFinite(offset)
        ? Math.max(0, Math.floor(Number(offset)))
        : 0;
      const requestedLimit = Number.isFinite(limit)
        ? Math.max(1, Math.floor(Number(limit)))
        : START_POINT_OVERVIEW_PAGE_LIMIT;
      return getOverviewRange(
        effectiveInstrumentId,
        effectiveSamplePoolId,
        minimumBaseTimeframe,
        normalizedOffset,
        Math.min(requestedLimit, START_POINT_OVERVIEW_PAGE_LIMIT),
        range,
      );
    },
    [effectiveInstrumentId, effectiveSamplePoolId, getOverviewRange],
  );
  const triggerLabel = triggerAnchorText;
  const hasIntraday =
    effectiveTimeframe === "1m" ||
    effectiveTimeframe === "5m" ||
    effectiveTimeframe === "1h";
  const currentAnchorSyncKey = Number.isFinite(currentRawAnchorIndex)
    ? `raw:${Math.max(0, Math.floor(Number(currentRawAnchorIndex)))}`
    : Number.isFinite(currentAnchorOverviewIndex)
    ? `index:${Math.max(0, Math.floor(Number(currentAnchorOverviewIndex)))}`
    : currentAnchorTs
      ? `ts:${currentAnchorTs}`
      : "";
  useEffect(() => {
    currentAnchorRef.current = {
      rawAnchorIndex: currentRawAnchorIndex ?? null,
      overviewIndex: currentAnchorOverviewIndex,
      ts: currentAnchorTs,
    };
  }, [currentRawAnchorIndex, currentAnchorOverviewIndex, currentAnchorTs]);
  const dateTimeLabel = tt("appText.dateTime");
  const dateOnlyLabel =
    dateTimeLabel.split(/[\\/／]/)[0]?.trim() || dateTimeLabel;
  const calendarTabLabel = hasIntraday ? dateTimeLabel : dateOnlyLabel;
  const weekStartPrefixLabel = tt("appText.weekStarts");

  const isReplayableLeafAnchorBar = useCallback(
    (
      bar: AnchorOverviewBar | null | undefined,
      sourceOverview: AnchorOverviewWindow | null,
    ): boolean => {
      if (!bar) {
        return false;
      }
      if (isStartPointDisplayPeriodCoarser(bar.displayPeriod, effectiveTimeframe)) {
        return true;
      }
      return isReplayableStartPointOverviewBar(
        bar,
        sourceOverview?.trainingTotal ?? 0,
      );
    },
    [effectiveTimeframe],
  );

  const resolveSafeAnchorBarInWindow = useCallback(
    (
      windowData: AnchorOverviewWindow,
      targetTrainingIndex: number,
    ): AnchorOverviewBar | null => {
      if (isStartPointDisplayPeriodCoarser(windowData.displayPeriod, effectiveTimeframe)) {
        return (
          resolveStartPointOverviewBarByAnchor(windowData.bars, {
            trainingIndex: targetTrainingIndex,
          }) ??
          windowData.bars[windowData.bars.length - 1] ??
          null
        );
      }
      return resolveReplayableStartPointOverviewBarByTrainingIndex(
        windowData.bars,
        targetTrainingIndex,
        windowData.trainingTotal,
      );
    },
    [effectiveTimeframe],
  );

  const resolveAnchorInWindow = useCallback(
    (windowData: AnchorOverviewWindow): number | null => {
      if (!windowData.bars.length) {
        return null;
      }
      const minIndex = windowData.offset;
      const maxIndex = windowData.offset + windowData.bars.length - 1;
      const matched = resolveStartPointOverviewBarByAnchor(windowData.bars, {
        rawAnchorIndex: currentAnchorRef.current.rawAnchorIndex,
        anchorTs: currentAnchorRef.current.ts,
        trainingIndex: currentAnchorRef.current.overviewIndex,
      });
      if (matched && isReplayableLeafAnchorBar(matched, windowData)) {
        return clamp(matched.index, minIndex, maxIndex);
      }
      const fallbackBar =
        matched
          ? resolveSafeAnchorBarInWindow(
              windowData,
              matched.endTrainingIndex,
            )
          : isEmbedded
            ? null
            : resolveSafeAnchorBarInWindow(
                windowData,
                windowData.bars[windowData.bars.length - 1]?.endTrainingIndex ??
                  maxIndex,
              );
      return fallbackBar ? clamp(fallbackBar.index, minIndex, maxIndex) : null;
    },
    [isEmbedded, isReplayableLeafAnchorBar, resolveSafeAnchorBarInWindow],
  );

  const measurePanelAlignOffset = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const triggerEl =
      (document.querySelector(
        '.anchor-nav-trigger[aria-expanded="true"]',
      ) as HTMLElement | null) ??
      (document.querySelector(".anchor-nav-trigger") as HTMLElement | null);
    if (!triggerEl) {
      setPanelAlignOffset(0);
      return;
    }
    const workspaceRoot = triggerEl.closest(".trainer-chart-workspace");
    const drawToolbar =
      (workspaceRoot?.querySelector(
        ".chart-layout > .draw-toolbar",
      ) as HTMLElement | null) ??
      (document.querySelector(
        ".trainer-chart-workspace > .chart-layout > .draw-toolbar",
      ) as HTMLElement | null);
    if (!drawToolbar) {
      setPanelAlignOffset(0);
      return;
    }
    const triggerLeft = triggerEl.getBoundingClientRect().left;
    const drawLeft = drawToolbar.getBoundingClientRect().left;
    const nextOffset = Math.round(drawLeft - triggerLeft);
    setPanelAlignOffset((current) =>
      current === nextOffset ? current : nextOffset,
    );
  }, []);


  const resolveNearestOverviewBarByTrainingIndex = useCallback(
    (
      targetIndex: number,
      sourceOverview: AnchorOverviewWindow | null = rootOverview,
    ): AnchorOverviewBar | null => {
      const bars = sourceOverview?.bars ?? [];
      if (!bars.length) {
        return null;
      }
      if (
        sourceOverview &&
        !isStartPointDisplayPeriodCoarser(
          sourceOverview.displayPeriod,
          effectiveTimeframe,
        )
      ) {
        return resolveReplayableStartPointOverviewBarByTrainingIndex(
          bars,
          targetIndex,
          sourceOverview.trainingTotal,
        );
      }
      const clampedTarget = clamp(
        Math.floor(Number(targetIndex) || 0),
        bars[0]?.startTrainingIndex ?? 0,
        bars[bars.length - 1]?.endTrainingIndex ?? 0,
      );
      let left = 0;
      let right = bars.length - 1;
      while (left <= right) {
        const mid = left + Math.floor((right - left) / 2);
        const candidate = bars[mid];
        if (
          candidate.startTrainingIndex <= clampedTarget &&
          candidate.endTrainingIndex >= clampedTarget
        ) {
          return candidate;
        }
        if (candidate.endTrainingIndex < clampedTarget) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
      if (left <= 0) {
        return bars[0] ?? null;
      }
      if (left >= bars.length) {
        return bars[bars.length - 1] ?? null;
      }
      const lower = bars[left - 1];
      const upper = bars[left];
      return Math.abs(lower.endTrainingIndex - clampedTarget) <=
        Math.abs(upper.startTrainingIndex - clampedTarget)
        ? lower
        : upper;
    },
    [effectiveTimeframe, rootOverview],
  );

  const resolveStatusTrackAnchorByClientPoint = useCallback(
    (clientX: number, host: HTMLElement): AnchorOverviewBar | null => {
      const sourceOverview = rootOverview;
      const total = Math.max(
        0,
        Math.floor(Number(sourceOverview?.trainingTotal) || 0),
      );
      if (total <= 0) {
        return null;
      }
      const rect = host.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || rect.width <= 0) {
        return null;
      }
      const localX = clamp(clientX - rect.left, 0, rect.width);
      const ratio = rect.width <= 0 ? 0 : localX / rect.width;
      const roughTrainingIndex = clamp(
        Math.round(ratio * Math.max(0, total - 1)),
        0,
        Math.max(0, total - 1),
      );
      return resolveNearestOverviewBarByTrainingIndex(
        roughTrainingIndex,
        sourceOverview,
      );
    },
    [rootOverview, resolveNearestOverviewBarByTrainingIndex],
  );

  const applyOverviewWindow = useCallback(
    (nextWindow: AnchorOverviewWindow) => {
      setRootOverview(nextWindow);
      setActiveWindow(nextWindow);
      const resolvedAnchor = resolveAnchorInWindow(nextWindow);
      setSelectedAnchorIndex(resolvedAnchor);
      const anchorBar =
        resolvedAnchor === null
          ? null
          : nextWindow.bars[Math.max(0, resolvedAnchor - nextWindow.offset)] ??
            null;
      setDraftAnchorBar(anchorBar);
      setHasDraftAnchorSelection(false);
      setSelectedDateKey(anchorBar ? toDateKey(anchorBar.ts) : "");
    },
    [resolveAnchorInWindow],
  );

  const loadDetailWindowForBucket = useCallback(
    async (
      bucket: DayBucket,
      options: {
        commitAfterLoad?: boolean;
        preferredAnchorIndex?: number | null;
      } = {},
    ) => {
      if (!effectiveInstrumentId) {
        return;
      }
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      const isActiveRequest = () => requestId === loadRequestIdRef.current;
      setIsLoading(true);
      setLoadError("");
      try {
        let activeBucket = bucket;
        let preferredAnchorIndex = options.preferredAnchorIndex;
        for (;;) {
          const nextDisplayPeriod = resolveNextStartPointDrillDisplayPeriod(
            activeBucket.displayPeriod,
            effectiveTimeframe,
          );
          const range = await loadOverviewRange(
            effectiveTimeframe,
            0,
            START_POINT_OVERVIEW_PAGE_LIMIT,
            {
              rawStartIndex: activeBucket.startRawIndex,
              rawEndIndex: activeBucket.endRawIndex,
              displayPeriod: nextDisplayPeriod,
            },
          );
          if (!isActiveRequest()) {
            return;
          }
          const nextWindow = buildOverviewWindow(range, range.offset);
          setActiveWindow(nextWindow);
          setSelectedDateKey(activeBucket.date);
          const minIndex = nextWindow.offset;
          const maxIndex =
            nextWindow.offset + Math.max(0, nextWindow.bars.length - 1);
          const safeFallbackBar = resolveSafeAnchorBarInWindow(
            nextWindow,
            nextWindow.bars[nextWindow.bars.length - 1]?.endTrainingIndex ??
              maxIndex,
          );
          const preferredAnchor = Number.isFinite(preferredAnchorIndex)
            ? Number(preferredAnchorIndex)
            : safeFallbackBar?.index ?? maxIndex;
          const resolvedAnchor =
            nextWindow.bars.length > 0
              ? clamp(preferredAnchor, minIndex, maxIndex)
              : null;
          setSelectedAnchorIndex(resolvedAnchor);
          setHasDraftAnchorSelection(true);
          const target =
            resolvedAnchor === null
              ? null
              : nextWindow.bars[
                  Math.max(0, resolvedAnchor - nextWindow.offset)
                ] ?? null;
          if (target) {
            setDraftAnchorBar(target);
            setSelectedDateKey(toDateKey(target.startTs || target.ts));
          }
          if (!options.commitAfterLoad || !target) {
            return;
          }
          if (isStartPointDisplayPeriodCoarser(target.displayPeriod, effectiveTimeframe)) {
            activeBucket = {
              date: toDateKey(target.startTs || target.ts),
              startIndex: target.index,
              endIndex: target.index,
              displayPeriod: target.displayPeriod,
              startRawIndex: target.startRawIndex,
              endRawIndex: target.endRawIndex,
              count: Math.max(
                1,
                target.endTrainingIndex - target.startTrainingIndex + 1,
              ),
              anchorIndexes: [target.index],
            };
            preferredAnchorIndex = null;
            continue;
          }
          if (!isReplayableLeafAnchorBar(target, nextWindow)) {
            return;
          }
          await onApplyAnchor(buildStartPointApplySelection(target));
          return;
        }
      } catch {
        if (isActiveRequest()) {
          setLoadError(loadFailedLabel);
        }
      } finally {
        if (isActiveRequest()) {
          setIsLoading(false);
        }
      }
    },
    [
      buildOverviewWindow,
      effectiveInstrumentId,
      effectiveTimeframe,
      isReplayableLeafAnchorBar,
      loadFailedLabel,
      loadOverviewRange,
      onApplyAnchor,
      resolveSafeAnchorBarInWindow,
    ],
  );

  const loadOverviewWindow = useCallback(
    async () => {
      if (!effectiveInstrumentId) {
        setRootOverview(null);
        setActiveWindow(null);
        setDraftAnchorBar(null);
        setLoadError("");
        setSelectedAnchorIndex(null);
        setSelectedDateKey("");
        return;
      }

      const cacheKey = `${effectiveSamplePoolId}|${effectiveInstrumentId}|${sourceTimeframe}|${effectiveTimeframe}`;
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      const isActiveRequest = () => requestId === loadRequestIdRef.current;

      setIsLoading(true);
      setLoadError("");
      startTrainerPerfSpan("anchor-overview-first-usable", {
        symbol: effectiveSymbol,
        timeframe: effectiveTimeframe,
      });
      try {
        const totalsByPeriod = new Map<DisplayPeriodKey, number>();
        const probes: FreeReplayStartPointOverviewRange[] = [];
        for (const period of resolveStartPointDisplayPeriodCandidates(effectiveTimeframe)) {
          const probe = await loadOverviewRange(effectiveTimeframe, 0, 1, {
            displayPeriod: period,
          });
          if (!isActiveRequest()) {
            return;
          }
          probes.push(probe);
          totalsByPeriod.set(
            period,
            Math.max(0, Math.floor(Number(probe.total) || 0)),
          );
        }
        const selectedDisplayPeriod = chooseCompleteStartPointDisplayPeriod(
          effectiveTimeframe,
          totalsByPeriod,
          START_POINT_OVERVIEW_PAGE_LIMIT,
        );
        const selectedTotal = Math.max(
          0,
          Math.floor(Number(totalsByPeriod.get(selectedDisplayPeriod)) || 0),
        );
        if (selectedTotal <= 0) {
          const emptyWindow: AnchorOverviewWindow = {
            offset: 0,
            total: 0,
            trainingTotal:
              probes.find((item) => item.displayPeriod === selectedDisplayPeriod)
                ?.trainingTotal ?? 0,
            displayPeriod: selectedDisplayPeriod,
            bars: [],
            isComplete: true,
          };
          applyOverviewWindow(emptyWindow);
          endTrainerPerfSpan("anchor-overview-first-usable", {
            symbol: effectiveSymbol,
            timeframe: effectiveTimeframe,
            displayPeriod: selectedDisplayPeriod,
            loadedBars: 0,
            totalBars: 0,
            complete: true,
          });
          return;
        }
        const firstProbe =
          probes.find((item) => item.displayPeriod === selectedDisplayPeriod) ??
          null;
        const fullRange =
          firstProbe && firstProbe.total <= 1 && selectedTotal <= 1
            ? firstProbe
            : await loadOverviewRange(
                effectiveTimeframe,
                0,
                selectedTotal,
                {
                  displayPeriod: selectedDisplayPeriod,
                },
              );
        if (!isActiveRequest()) {
          return;
        }
        const nextWindow = buildOverviewWindow(fullRange, 0, selectedTotal);
        writeCachedOverviewWindow(
          overviewCacheRef.current,
          cacheKey,
          nextWindow,
        );
        applyOverviewWindow(nextWindow);
        endTrainerPerfSpan("anchor-overview-first-usable", {
          symbol: effectiveSymbol,
          timeframe: effectiveTimeframe,
          displayPeriod: selectedDisplayPeriod,
          loadedBars: nextWindow.bars.length,
          totalBars: nextWindow.trainingTotal,
          complete: nextWindow.isComplete,
        });
      } catch {
        if (!isActiveRequest()) {
          return;
        }
        endTrainerPerfSpan("anchor-overview-first-usable", {
          symbol: effectiveSymbol,
          timeframe: effectiveTimeframe,
          status: "failed",
        });
        const message = loadFailedLabel;
        setLoadError(message);
      } finally {
        if (isActiveRequest()) {
          setIsLoading(false);
        }
      }
    },
    [
      applyOverviewWindow,
      buildOverviewWindow,
      effectiveTimeframe,
      effectiveInstrumentId,
      effectiveSamplePoolId,
      effectiveSymbol,
      loadFailedLabel,
      loadOverviewRange,
      sourceTimeframe,
    ],
  );

  useEffect(() => {
    if (!isPanelVisible) {
      loadRequestIdRef.current += 1;
      setYearPickerOpen(false);
      setMonthPickerOpen(false);
      setWeekStartPickerOpen(false);
      setHasDraftAnchorSelection(false);
      return;
    }
    if (!isEmbedded) {
      setViewMode("CALENDAR");
    }
    setYearPickerOpen(false);
    setMonthPickerOpen(false);
    setWeekStartPickerOpen(false);
    isMapDraggingRef.current = false;
    const cacheKey = `${effectiveSamplePoolId}|${effectiveInstrumentId}|${sourceTimeframe}|${effectiveTimeframe}`;
    const cached = readCachedOverviewWindow(overviewCacheRef.current, cacheKey);
    if (cached && cached.total <= MAP_MAX_BARS) {
      setLoadError("");
      setIsLoading(false);
      applyOverviewWindow(cached);
      return;
    }
    void loadOverviewWindow();
  }, [
    applyOverviewWindow,
    effectiveTimeframe,
    effectiveInstrumentId,
    effectiveSamplePoolId,
    isEmbedded,
    isPanelVisible,
    loadOverviewWindow,
    sourceTimeframe,
  ]);

  useEffect(() => {
    if (isEmbedded || !open) {
      return;
    }
    let rafId = window.requestAnimationFrame(() => {
      measurePanelAlignOffset();
    });
    const handleResize = () => {
      measurePanelAlignOffset();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
    };
  }, [isEmbedded, measurePanelAlignOffset, open]);

  return {
    calendarTabLabel,
    currentAnchorSyncKey,
    hasIntraday,
    isReplayableLeafAnchorBar,
    loadDetailWindowForBucket,
    resolveAnchorInWindow,
    resolveNearestOverviewBarByTrainingIndex,
    resolveStatusTrackAnchorByClientPoint,
    triggerLabel,
    weekStartPrefixLabel,
  };
};
