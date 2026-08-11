// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo } from "react";
import type { AnchorNavigatorControlViewModel } from "@/domains/trainer/anchorNavigatorControlTypes";
import {
  MAP_SVG_HEIGHT,
  MAP_SVG_WIDTH,
  STATUS_TREND_SVG_HEIGHT,
  buildMapPath,
  clamp,
  formatAnchorTs,
} from "@/domains/trainer/anchorNavigatorControlModel";

export const useAnchorNavigatorViewState = (
  model: AnchorNavigatorControlViewModel,
) => {
  const {
    activeStatusPointerIdRef,
    availableYears,
    canInteract,
    commitAnchorTarget,
    committedAnchorIndex,
    currentWindowAnchorRatio,
    effectiveAnchorBar,
    effectiveAnchorSourceWindow,
    effectiveViewMode,
    isApplying,
    isBusy,
    isDisabled,
    isHistoryPreview,
    isLoading,
    isPanelVisible,
    isReplayableLeafAnchorBar,
    isStatusDraggingRef,
    language,
    loadError,
    mapBars,
    noneLabel,
    onPreviewStatusChange,
    previewAnchorTarget,
    previewStats,
    progressText,
    remainingText,
    resolveNearestMapSampleIndex,
    resolveStatusTrackAnchorByClientPoint,
    rootOverview,
    selectedYearIndex,
    statusTrackRef,
    ui,
  } = model;
  const hasOverviewData =
    !isLoading && !loadError && Boolean(rootOverview && rootOverview.total > 0);

  useEffect(() => {
    if (!isPanelVisible || !hasOverviewData) {
      return;
    }
    const track = statusTrackRef.current;
    if (!track) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (
        (event.pointerType === "mouse" && event.button !== 0) ||
        !canInteract
      ) {
        return;
      }
      event.preventDefault();
      isStatusDraggingRef.current = true;
      activeStatusPointerIdRef.current = event.pointerId;
      track.setPointerCapture(event.pointerId);
      previewAnchorTarget(
        resolveStatusTrackAnchorByClientPoint(event.clientX, track),
      );
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (
        !isStatusDraggingRef.current ||
        (activeStatusPointerIdRef.current !== null &&
          event.pointerId !== activeStatusPointerIdRef.current)
      ) {
        return;
      }
      previewAnchorTarget(
        resolveStatusTrackAnchorByClientPoint(event.clientX, track),
      );
    };
    const finishPointerDrag = (event: PointerEvent, shouldCommit: boolean) => {
      if (
        !isStatusDraggingRef.current ||
        (activeStatusPointerIdRef.current !== null &&
          event.pointerId !== activeStatusPointerIdRef.current)
      ) {
        return;
      }
      if (shouldCommit) {
        commitAnchorTarget(
          resolveStatusTrackAnchorByClientPoint(event.clientX, track),
        );
      }
      isStatusDraggingRef.current = false;
      activeStatusPointerIdRef.current = null;
      if (track.hasPointerCapture(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }
    };
    const handlePointerUp = (event: PointerEvent) =>
      finishPointerDrag(event, true);
    const handlePointerCancel = (event: PointerEvent) =>
      finishPointerDrag(event, false);

    track.addEventListener("pointerdown", handlePointerDown);
    track.addEventListener("pointermove", handlePointerMove);
    track.addEventListener("pointerup", handlePointerUp);
    track.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      track.removeEventListener("pointerdown", handlePointerDown);
      track.removeEventListener("pointermove", handlePointerMove);
      track.removeEventListener("pointerup", handlePointerUp);
      track.removeEventListener("pointercancel", handlePointerCancel);
      isStatusDraggingRef.current = false;
      activeStatusPointerIdRef.current = null;
    };
  }, [
    activeStatusPointerIdRef,
    canInteract,
    commitAnchorTarget,
    hasOverviewData,
    isPanelVisible,
    isStatusDraggingRef,
    previewAnchorTarget,
    resolveStatusTrackAnchorByClientPoint,
    statusTrackRef,
  ]);

  const mapAnchorRatio = useMemo(() => {
    if (!mapBars.length || !effectiveAnchorBar) {
      return 0;
    }
    const sampleIndex = clamp(
      resolveNearestMapSampleIndex(
        Math.floor(Number(effectiveAnchorBar.endTrainingIndex) || 0),
      ),
      0,
      mapBars.length - 1,
    );
    return mapBars.length <= 1 ? 0 : sampleIndex / (mapBars.length - 1);
  }, [effectiveAnchorBar, mapBars, resolveNearestMapSampleIndex]);
  const mapSvgShape = useMemo(
    () => buildMapPath(mapBars, MAP_SVG_WIDTH, MAP_SVG_HEIGHT),
    [mapBars],
  );
  const statusTrendShape = useMemo(
    () => buildMapPath(mapBars, MAP_SVG_WIDTH, STATUS_TREND_SVG_HEIGHT),
    [mapBars],
  );
  const leftMaskWidthPercent =
    effectiveViewMode === "MAP"
      ? clamp(mapAnchorRatio * 100, 0, 100)
      : Number.isFinite(currentWindowAnchorRatio)
        ? clamp(currentWindowAnchorRatio * 100, 0, 100)
        : 0;
  const anchorDateLabel = effectiveAnchorBar
    ? formatAnchorTs(
        effectiveAnchorBar.ts,
        language,
        effectiveAnchorBar.displayPeriod,
      )
    : noneLabel;
  const anchorStartText = `${ui.startPoint}: ${anchorDateLabel}`;
  const historyPercent =
    previewStats.totalBars > 0
      ? clamp((previewStats.historyBars / previewStats.totalBars) * 100, 0, 100)
      : 0;
  const remainingWarning =
    previewStats.remainingBars <=
    Math.max(10, Math.floor(previewStats.totalBars * 0.05));
  const canUseEffectiveAnchor =
    effectiveAnchorBar &&
    isReplayableLeafAnchorBar(effectiveAnchorBar, effectiveAnchorSourceWindow);
  const canApply =
    Number.isFinite(committedAnchorIndex) &&
    Boolean(canUseEffectiveAnchor) &&
    !isApplying &&
    !isBusy &&
    !isDisabled;

  useEffect(() => {
    if (!onPreviewStatusChange) {
      return;
    }
    if (!isHistoryPreview || !rootOverview || rootOverview.total <= 0) {
      onPreviewStatusChange(null);
      return;
    }
    onPreviewStatusChange({
      progressText,
      remainingText,
      anchorText: anchorDateLabel,
    });
  }, [
    anchorDateLabel,
    isHistoryPreview,
    onPreviewStatusChange,
    progressText,
    remainingText,
    rootOverview,
  ]);

  return {
    anchorDateLabel,
    anchorStartText,
    canApply,
    canMoveToNextYear:
      selectedYearIndex >= 0 && selectedYearIndex < availableYears.length - 1,
    canMoveToPrevYear: selectedYearIndex > 0,
    hasOverviewData,
    historyPercent,
    leftMaskWidthPercent,
    mapSvgShape,
    mapTooltipText: anchorDateLabel,
    remainingWarning,
    statusAnchorLeftPercent: historyPercent,
    statusTrendShape,
  };
};
