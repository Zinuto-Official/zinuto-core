// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import type { FreeReplayAdvancePeriod } from "@/domains/training/types";
import {
  buildStartPointApplySelection,
  isStartPointDisplayPeriodCoarser,
  resolveReplayableStartPointOverviewBarByTrainingIndex,
} from "@/domains/trainer/startPointOverviewDisplay";
import type {
  AnchorOverviewBar,
  AnchorOverviewWindow,
  DayBucket,
  ViewMode,
} from "@/domains/trainer/anchorNavigatorControlTypes";
import {
  clamp,
  toDateKey,
} from "@/domains/trainer/anchorNavigatorControlModel";

type LoadDetailWindowForBucket = (
  bucket: DayBucket,
  options?: {
    commitAfterLoad?: boolean;
    preferredAnchorIndex?: number | null;
  },
) => Promise<void>;

type AnchorNavigatorInteractionsInput = {
  activeWindow: AnchorOverviewWindow | null;
  barMap: Map<number, AnchorOverviewBar>;
  canInteract: boolean;
  commitMode: "explicit" | "immediate";
  effectiveAnchorBar: AnchorOverviewBar | null;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  effectiveViewMode: ViewMode;
  isEmbedded: boolean;
  isPanelVisible: boolean;
  isRangeOverviewTarget: (target: AnchorOverviewBar) => boolean;
  isReplayableLeafAnchorBar: (
    bar: AnchorOverviewBar | null | undefined,
    sourceOverview: AnchorOverviewWindow | null,
  ) => boolean;
  loadDetailWindowForBucket: LoadDetailWindowForBucket;
  mapBarsRef: { current: AnchorOverviewBar[] };
  mapCanvasRef: { current: HTMLDivElement | null };
  mapCursorHandleRef: { current: HTMLDivElement | null };
  isMapDraggingRef: { current: boolean };
  mapPointerRafRef: { current: number };
  pendingMapPointerTargetRef: {
    current: {
      target: AnchorOverviewBar;
      select: boolean;
      hover: boolean;
    } | null;
  };
  onApplyAnchor: (
    selection: ReturnType<typeof buildStartPointApplySelection>,
  ) => Promise<void> | void;
  overview: AnchorOverviewWindow | null;
  requestDialogClose: (() => void) | null | undefined;
  resolveDayBucketForNavigationBar: (
    target: AnchorOverviewBar,
  ) => DayBucket | null;
  resolveNearestOverviewBarByTrainingIndex: (
    targetIndex: number,
    sourceOverview?: AnchorOverviewWindow | null,
  ) => AnchorOverviewBar | null;
  rootOverview: AnchorOverviewWindow | null;
  setDraftAnchorBar: Dispatch<SetStateAction<AnchorOverviewBar | null>>;
  setHasDraftAnchorSelection: Dispatch<SetStateAction<boolean>>;
  setIsApplying: Dispatch<SetStateAction<boolean>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedAnchorIndex: Dispatch<SetStateAction<number | null>>;
  setSelectedDateKey: Dispatch<SetStateAction<string>>;
};

export const useAnchorNavigatorInteractions = ({
  activeWindow,
  barMap,
  canInteract,
  commitMode,
  effectiveAnchorBar,
  effectiveTimeframe,
  effectiveViewMode,
  isEmbedded,
  isMapDraggingRef,
  isPanelVisible,
  isRangeOverviewTarget,
  isReplayableLeafAnchorBar,
  loadDetailWindowForBucket,
  mapBarsRef,
  mapCanvasRef,
  mapCursorHandleRef,
  mapPointerRafRef,
  onApplyAnchor,
  overview,
  pendingMapPointerTargetRef,
  requestDialogClose,
  resolveDayBucketForNavigationBar,
  resolveNearestOverviewBarByTrainingIndex,
  rootOverview,
  setDraftAnchorBar,
  setHasDraftAnchorSelection,
  setIsApplying,
  setOpen,
  setSelectedAnchorIndex,
  setSelectedDateKey,
}: AnchorNavigatorInteractionsInput) => {
  const handleApply = useCallback(async () => {
    const anchorBar = effectiveAnchorBar;
    if (!anchorBar) {
      return;
    }
    setIsApplying(true);
    let shouldClose = false;
    try {
      if (isStartPointDisplayPeriodCoarser(anchorBar.displayPeriod, effectiveTimeframe)) {
        await loadDetailWindowForBucket({
          date: toDateKey(anchorBar.startTs || anchorBar.ts),
          startIndex: anchorBar.index,
          endIndex: anchorBar.index,
          displayPeriod: anchorBar.displayPeriod,
          startRawIndex: anchorBar.startRawIndex,
          endRawIndex: anchorBar.endRawIndex,
          count: Math.max(
            1,
            anchorBar.endTrainingIndex - anchorBar.startTrainingIndex + 1,
          ),
          anchorIndexes: [anchorBar.index],
        });
        return;
      }
      if (!isReplayableLeafAnchorBar(anchorBar, activeWindow ?? rootOverview ?? overview)) {
        return;
      }
      await onApplyAnchor(buildStartPointApplySelection(anchorBar));
      shouldClose = true;
    } finally {
      setIsApplying(false);
    }
    if (shouldClose) {
      if (requestDialogClose) {
        requestDialogClose();
      } else if (!isEmbedded) {
        setOpen(false);
      }
    }
  }, [
    activeWindow,
    effectiveAnchorBar,
    effectiveTimeframe,
    isEmbedded,
    isReplayableLeafAnchorBar,
    loadDetailWindowForBucket,
    onApplyAnchor,
    overview,
    requestDialogClose,
    rootOverview,
    setIsApplying,
    setOpen,
  ]);

  const handleCancel = useCallback(() => {
    if (requestDialogClose) {
      requestDialogClose();
      return;
    }
    if (!isEmbedded) {
      setOpen(false);
    }
  }, [isEmbedded, requestDialogClose, setOpen]);

  const resolveNearestMapSampleIndex = useCallback(
    (trainingIndex: number): number => {
      const bars = mapBarsRef.current;
      if (!bars.length) {
        return 0;
      }
      const targetIndex = Math.floor(Number(trainingIndex) || 0);
      let left = 0;
      let right = bars.length - 1;
      while (left <= right) {
        const mid = left + Math.floor((right - left) / 2);
        const candidate = bars[mid];
        if (
          candidate.startTrainingIndex <= targetIndex &&
          candidate.endTrainingIndex >= targetIndex
        ) {
          return mid;
        }
        if (candidate.endTrainingIndex < targetIndex) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
      if (left <= 0) {
        return 0;
      }
      if (left >= bars.length) {
        return bars.length - 1;
      }
      const lower = bars[left - 1];
      const upper = bars[left];
      return Math.abs(lower.endTrainingIndex - targetIndex) <=
        Math.abs(upper.startTrainingIndex - targetIndex)
        ? left - 1
        : left;
    },
    [mapBarsRef],
  );

  const resolveMapAnchorByClientPoint = useCallback(
    (clientX: number, host: HTMLElement): AnchorOverviewBar | null => {
      const total = Math.max(
        0,
        Math.floor(Number(rootOverview?.trainingTotal) || 0),
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
        rootOverview,
      );
    },
    [rootOverview, resolveNearestOverviewBarByTrainingIndex],
  );

  const flushPendingMapPointerTarget = useCallback(() => {
    mapPointerRafRef.current = 0;
    const pending = pendingMapPointerTargetRef.current;
    pendingMapPointerTargetRef.current = null;
    if (!pending) {
      return;
    }
    const { target, select, hover } = pending;
    if (select || hover) {
      setDraftAnchorBar(target);
      setHasDraftAnchorSelection(true);
      if (barMap.get(target.index) === target) {
        setSelectedAnchorIndex((current) =>
          current === target.index ? current : target.index,
        );
      }
      const nextDateKey = toDateKey(target.ts);
      setSelectedDateKey((current) =>
        current === nextDateKey ? current : nextDateKey,
      );
    }
  }, [
    barMap,
    mapPointerRafRef,
    pendingMapPointerTargetRef,
    setDraftAnchorBar,
    setHasDraftAnchorSelection,
    setSelectedAnchorIndex,
    setSelectedDateKey,
  ]);

  const queueMapPointerTarget = useCallback(
    (target: AnchorOverviewBar, select: boolean, hover: boolean) => {
      pendingMapPointerTargetRef.current = { target, select, hover };
      if (mapPointerRafRef.current) {
        return;
      }
      mapPointerRafRef.current = window.requestAnimationFrame(() => {
        flushPendingMapPointerTarget();
      });
    },
    [flushPendingMapPointerTarget, mapPointerRafRef, pendingMapPointerTargetRef],
  );

  const commitAnchorTarget = useCallback(
    (target: AnchorOverviewBar | null) => {
      if (!target || !canInteract) {
        return;
      }
      const sourceOverview = activeWindow ?? rootOverview ?? overview;
      const commitTarget =
        isStartPointDisplayPeriodCoarser(target.displayPeriod, effectiveTimeframe)
          ? target
          : sourceOverview
            ? resolveReplayableStartPointOverviewBarByTrainingIndex(
                sourceOverview.bars,
                target.endTrainingIndex,
                sourceOverview.trainingTotal,
              )
            : target;
      if (!commitTarget || !isReplayableLeafAnchorBar(commitTarget, sourceOverview)) {
        return;
      }
      setDraftAnchorBar(commitTarget);
      setHasDraftAnchorSelection(true);
      if (barMap.get(commitTarget.index) === commitTarget) {
        setSelectedAnchorIndex((current) =>
          current === commitTarget.index ? current : commitTarget.index,
        );
      }
      const nextDateKey = toDateKey(commitTarget.startTs || commitTarget.ts);
      setSelectedDateKey((current) =>
        current === nextDateKey ? current : nextDateKey,
      );
      if (isRangeOverviewTarget(commitTarget)) {
        const targetIsCurrentOverviewBar =
          barMap.get(commitTarget.index) === commitTarget;
        const bucket = targetIsCurrentOverviewBar
          ? resolveDayBucketForNavigationBar(commitTarget)
          : null;
        if (bucket) {
          void loadDetailWindowForBucket(bucket, {
            commitAfterLoad: commitMode === "immediate",
          });
        } else {
          void loadDetailWindowForBucket(
            {
              date: toDateKey(commitTarget.startTs || commitTarget.ts),
              startIndex: commitTarget.index,
              endIndex: commitTarget.index,
              displayPeriod: commitTarget.displayPeriod,
              startRawIndex: commitTarget.startRawIndex,
              endRawIndex: commitTarget.endRawIndex,
              count: Math.max(
                1,
                commitTarget.endTrainingIndex - commitTarget.startTrainingIndex + 1,
              ),
              anchorIndexes: [commitTarget.index],
            },
            { commitAfterLoad: commitMode === "immediate" },
          );
        }
        return;
      }
      if (commitMode === "immediate") {
        void (async () => {
          setIsApplying(true);
          try {
            await onApplyAnchor(buildStartPointApplySelection(commitTarget));
          } finally {
            setIsApplying(false);
          }
        })();
      }
    },
    [
      activeWindow,
      barMap,
      canInteract,
      commitMode,
      effectiveTimeframe,
      isRangeOverviewTarget,
      isReplayableLeafAnchorBar,
      loadDetailWindowForBucket,
      onApplyAnchor,
      overview,
      resolveDayBucketForNavigationBar,
      rootOverview,
      setDraftAnchorBar,
      setHasDraftAnchorSelection,
      setIsApplying,
      setSelectedAnchorIndex,
      setSelectedDateKey,
    ],
  );

  const previewAnchorTarget = useCallback(
    (target: AnchorOverviewBar | null) => {
      if (!target) {
        return;
      }
      setDraftAnchorBar(target);
      setHasDraftAnchorSelection(true);
      if (isRangeOverviewTarget(target)) {
        const targetIsCurrentOverviewBar = barMap.get(target.index) === target;
        const bucket = targetIsCurrentOverviewBar
          ? resolveDayBucketForNavigationBar(target)
          : null;
        setSelectedDateKey(
          bucket?.date ?? toDateKey(target.startTs || target.ts),
        );
        return;
      }
      if (barMap.get(target.index) === target) {
        setSelectedAnchorIndex((current) =>
          current === target.index ? current : target.index,
        );
      }
      const nextDateKey = toDateKey(target.ts);
      setSelectedDateKey((current) =>
        current === nextDateKey ? current : nextDateKey,
      );
    },
    [
      barMap,
      isRangeOverviewTarget,
      resolveDayBucketForNavigationBar,
      setDraftAnchorBar,
      setHasDraftAnchorSelection,
      setSelectedAnchorIndex,
      setSelectedDateKey,
    ],
  );

  const handleStatusTrackKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!canInteract || !rootOverview || !effectiveAnchorBar) {
        return;
      }
      const currentIndex = Math.floor(
        Number(effectiveAnchorBar.endTrainingIndex) || 0,
      );
      const largeStep = Math.max(
        1,
        Math.floor(Math.max(1, rootOverview.trainingTotal) / 20),
      );
      const maxIndex = Math.max(
        0,
        Math.floor(Number(rootOverview.trainingTotal) || 0) - 1,
      );
      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown":
          nextIndex = currentIndex - 1;
          break;
        case "ArrowRight":
        case "ArrowUp":
          nextIndex = currentIndex + 1;
          break;
        case "PageDown":
          nextIndex = currentIndex - largeStep;
          break;
        case "PageUp":
          nextIndex = currentIndex + largeStep;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = maxIndex;
          break;
        default:
          return;
      }
      event.preventDefault();
      commitAnchorTarget(
        resolveNearestOverviewBarByTrainingIndex(
          clamp(nextIndex, 0, maxIndex),
          rootOverview,
        ),
      );
    },
    [
      canInteract,
      commitAnchorTarget,
      effectiveAnchorBar,
      rootOverview,
      resolveNearestOverviewBarByTrainingIndex,
    ],
  );

  useEffect(() => {
    if (!isPanelVisible || effectiveViewMode !== "MAP") {
      return;
    }
    const dom = mapCanvasRef.current;
    const handle = mapCursorHandleRef.current;
    if (!dom || !handle) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || !canInteract) {
        return;
      }
      event.preventDefault();
      isMapDraggingRef.current = true;
      const target = resolveMapAnchorByClientPoint(event.clientX, dom);
      if (target) {
        queueMapPointerTarget(target, false, true);
      }
    };
    const handleWindowMouseMove = (event: MouseEvent) => {
      if (!isMapDraggingRef.current) {
        return;
      }
      const target = resolveMapAnchorByClientPoint(event.clientX, dom);
      if (target) {
        queueMapPointerTarget(target, false, true);
      }
    };
    const handleWindowMouseUp = (event: MouseEvent) => {
      if (!isMapDraggingRef.current) {
        return;
      }
      commitAnchorTarget(resolveMapAnchorByClientPoint(event.clientX, dom));
      isMapDraggingRef.current = false;
    };

    handle.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      handle.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      pendingMapPointerTargetRef.current = null;
      if (mapPointerRafRef.current) {
        window.cancelAnimationFrame(mapPointerRafRef.current);
        mapPointerRafRef.current = 0;
      }
      isMapDraggingRef.current = false;
    };
  }, [
    canInteract,
    commitAnchorTarget,
    effectiveViewMode,
    isMapDraggingRef,
    isPanelVisible,
    mapCanvasRef,
    mapCursorHandleRef,
    mapPointerRafRef,
    pendingMapPointerTargetRef,
    queueMapPointerTarget,
    resolveMapAnchorByClientPoint,
  ]);

  return {
    commitAnchorTarget,
    handleApply,
    handleCancel,
    handleStatusTrackKeyDown,
    previewAnchorTarget,
    resolveNearestMapSampleIndex,
  };
};
