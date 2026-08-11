// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';
import type { Chart } from 'klinecharts';
import type { SignalIndicatorName } from '@/domains/indicators/core';
import {
  applyTrainerIndicatorPaneLayoutWithLockedVolume,
  isIndicatorNone
} from '@/domains/indicators/runtime';
import {
  DRAW_GROUP_ID,
  USER_DRAWING_Z_LEVEL,
} from '@/domains/chart/overlays/constants';
import {
  getDrawingMinPointCount,
  hasDrawingOverlayInProgress,
  isDrawingOverlayInProgress
} from '@/domains/chart/drawingOverlayLifecycle';
import {
  isSourcePeriodOnlyDrawing,
  projectDrawingPointsForPeriodCore,
  shouldRenderDrawingInDisplayPeriod
} from '@/domains/chart/drawingProjection';
import {
  sanitizeDrawingForArchive
} from '@/app-shell/appDrawingArchive';
import { isDisplayPeriodKey } from '@/ui/config/uiConfig';

type UseAppDrawingPersistenceArgs = {
  chartRef: MutableRefObject<Chart | null>;
  chartDomRef: MutableRefObject<HTMLDivElement | null>;
  visibleAggregatedBarsRef: MutableRefObject<AggregatedBarItem[]>;
  drawingStoreRef: MutableRefObject<SavedDrawingOverlay[]>;
  currentDisplayPeriodRef: MutableRefObject<DisplayPeriodKey>;
  pendingDrawingRebuildPeriodRef: MutableRefObject<DisplayPeriodKey | null>;
  barsTimeZone?: string | null;
  selectedDrawingIdRef: MutableRefObject<string>;
  signalTopRef: MutableRefObject<SignalIndicatorName>;
  signalBottomRef: MutableRefObject<SignalIndicatorName>;
  showTrainerSubIndicatorsRef: MutableRefObject<boolean>;
  showTrainerVolumePaneRef: MutableRefObject<boolean>;
  setDrawingCount: Dispatch<SetStateAction<number>>;
  setAllDrawingsVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedDrawingId: Dispatch<SetStateAction<string>>;
};

export const useAppDrawingPersistence = ({
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
  setSelectedDrawingId
}: UseAppDrawingPersistenceArgs) => {
  const shouldRenderDrawingInPeriod = useCallback(
    (item: SavedDrawingOverlay, period: DisplayPeriodKey): boolean =>
      shouldRenderDrawingInDisplayPeriod(item, period),
    []
  );

  const projectDrawingPointsForPeriod = useCallback(
    (item: SavedDrawingOverlay, period: DisplayPeriodKey): Array<{ timestamp: number; value?: number; dataIndex?: number }> => {
      if (!Array.isArray(item.points) || !item.points.length) {
        return [];
      }
      const visibleBars = visibleAggregatedBarsRef.current;
      return projectDrawingPointsForPeriodCore({
        item,
        period,
        visibleBars,
        timeZone: barsTimeZone
      });
    },
    [barsTimeZone, visibleAggregatedBarsRef]
  );

  const syncDrawingStoreFromChart = useCallback(
    (activePeriod: DisplayPeriodKey = currentDisplayPeriodRef.current) => {
      const chart = chartRef.current;
      if (!chart) {
        return;
      }

      const existing = drawingStoreRef.current.map((item) => ({
        ...item,
        sourcePeriod: isDisplayPeriodKey(item.sourcePeriod) ? item.sourcePeriod : activePeriod
      }));
      const existingById = new Map(
        existing
          .filter((item) => typeof item.id === 'string' && item.id)
          .map((item) => [item.id as string, item])
      );
      const overlays = chart
        .getOverlays({ groupId: DRAW_GROUP_ID })
        .filter((overlay) => !isDrawingOverlayInProgress(overlay));
      const activeVisibleBars = visibleAggregatedBarsRef.current;
      const visibleItems = overlays
        .map((raw) => {
          const rawOverlay = raw as unknown as Record<string, unknown>;
          const rawPoints = Array.isArray(rawOverlay.points) ? rawOverlay.points : null;
          if (!rawPoints || !rawPoints.length) {
            return raw;
          }
          const patchedPoints = rawPoints.map((point) => {
            if (!point || typeof point !== 'object') {
              return point;
            }
            const source = point as Record<string, unknown>;
            const timestamp = Number(source.timestamp);
            if (Number.isFinite(timestamp)) {
              return point;
            }
            const dataIndex = Number(source.dataIndex);
            if (!Number.isFinite(dataIndex)) {
              return point;
            }
            const matched = activeVisibleBars[Math.max(0, Math.floor(dataIndex))];
            if (!matched) {
              return point;
            }
            return {
              ...source,
              timestamp: matched.bucketStartMs
            };
          });
          return {
            ...rawOverlay,
            points: patchedPoints
          };
        })
        .map((item) => sanitizeDrawingForArchive(item))
        .filter((item): item is SavedDrawingOverlay => Boolean(item))
        .map((item) => {
          const existingItem = existingById.get(item.id ?? '');
          const sourcePeriod = isDisplayPeriodKey(item.sourcePeriod)
            ? item.sourcePeriod
            : isDisplayPeriodKey(existingItem?.sourcePeriod)
              ? (existingItem.sourcePeriod as DisplayPeriodKey)
              : activePeriod;
          const keepCanonicalPoints =
            Boolean(existingItem?.points?.length) &&
            sourcePeriod !== activePeriod &&
            !isSourcePeriodOnlyDrawing(item.name);
          return {
            ...item,
            points: keepCanonicalPoints ? existingItem?.points ?? item.points : item.points,
            sourcePeriod
          };
        });

      const visibleIds = new Set(
        visibleItems
          .map((item) => item.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      );
      const hiddenItems = existing.filter((item) => {
        if (item.id && visibleIds.has(item.id)) {
          return false;
        }
        if (pendingDrawingRebuildPeriodRef.current !== null) {
          return true;
        }
        const sourcePeriod = isDisplayPeriodKey(item.sourcePeriod) ? item.sourcePeriod : activePeriod;
        if (sourcePeriod !== activePeriod) {
          return true;
        }
        return !shouldRenderDrawingInPeriod(item, activePeriod);
      });
      drawingStoreRef.current = [...hiddenItems, ...visibleItems];
    },
    [
      chartRef,
      currentDisplayPeriodRef,
      drawingStoreRef,
      pendingDrawingRebuildPeriodRef,
      shouldRenderDrawingInPeriod,
      visibleAggregatedBarsRef
    ]
  );

  const rebuildDrawingsByPeriod = useCallback(
    (period: DisplayPeriodKey): boolean => {
      const chart = chartRef.current;
      if (!chart) {
        return false;
      }
      const overlays = chart.getOverlays({ groupId: DRAW_GROUP_ID });
      if (hasDrawingOverlayInProgress(overlays)) {
        return false;
      }
      chart.removeOverlay({ groupId: DRAW_GROUP_ID });
      drawingStoreRef.current.forEach((item) => {
        if (!shouldRenderDrawingInPeriod(item, period) || !item?.name || !Array.isArray(item.points)) {
          return;
        }
        const projectedPoints = projectDrawingPointsForPeriod(item, period);
        if (projectedPoints.length < getDrawingMinPointCount(item.name)) {
          return;
        }
        const payload: Record<string, unknown> = {
          name: item.name,
          groupId: DRAW_GROUP_ID,
          points: projectedPoints,
          needDefaultXAxisFigure: item.needDefaultXAxisFigure ?? false,
          zLevel: Number.isFinite(item.zLevel) ? item.zLevel : USER_DRAWING_Z_LEVEL
        };
        if (typeof item.id === 'string' && item.id) payload.id = item.id;
        if (typeof item.visible === 'boolean') payload.visible = item.visible;
        if (typeof item.lock === 'boolean') payload.lock = item.lock;
        if (typeof item.mode === 'string') payload.mode = item.mode;
        if (Number.isFinite(item.modeSensitivity)) payload.modeSensitivity = item.modeSensitivity;
        if (item.styles && typeof item.styles === 'object') payload.styles = item.styles;
        if (item.extendData !== undefined) payload.extendData = item.extendData;
        chart.createOverlay(payload as Parameters<Chart['createOverlay']>[0]);
      });
      return true;
    },
    [chartRef, drawingStoreRef, projectDrawingPointsForPeriod, shouldRenderDrawingInPeriod]
  );

  const refreshDrawingMeta = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    syncDrawingStoreFromChart();
    let overlays = chart.getOverlays({ groupId: DRAW_GROUP_ID });
    const pendingRebuildPeriod = pendingDrawingRebuildPeriodRef.current;
    if (
      pendingRebuildPeriod !== null &&
      !hasDrawingOverlayInProgress(overlays) &&
      rebuildDrawingsByPeriod(pendingRebuildPeriod)
    ) {
      pendingDrawingRebuildPeriodRef.current = null;
      overlays = chart.getOverlays({ groupId: DRAW_GROUP_ID });
    }
    const completedOverlays = overlays.filter((overlay) => !isDrawingOverlayInProgress(overlay));
    setDrawingCount(completedOverlays.length);
    setAllDrawingsVisible(
      completedOverlays.length === 0 || completedOverlays.every((overlay) => overlay.visible !== false)
    );

    const activeSelectedId = selectedDrawingIdRef.current;
    if (activeSelectedId) {
      const selected = chart.getOverlays({ id: activeSelectedId })[0];
      if (!selected || selected.groupId !== DRAW_GROUP_ID) {
        setSelectedDrawingId('');
      }
    }
  }, [
    chartRef,
    pendingDrawingRebuildPeriodRef,
    rebuildDrawingsByPeriod,
    selectedDrawingIdRef,
    setAllDrawingsVisible,
    setDrawingCount,
    setSelectedDrawingId,
    syncDrawingStoreFromChart
  ]);

  const adjustPaneHeights = useCallback(() => {
    const chart = chartRef.current;
    const dom = chartDomRef.current;
    if (!chart || !dom) {
      return;
    }

    const hasTop = !isIndicatorNone(signalTopRef.current);
    const hasBottom = !isIndicatorNone(signalBottomRef.current);
    applyTrainerIndicatorPaneLayoutWithLockedVolume(
      chart,
      dom.clientHeight,
      hasTop,
      hasBottom,
      showTrainerSubIndicatorsRef.current,
      showTrainerVolumePaneRef.current
    );
  }, [chartDomRef, chartRef, showTrainerSubIndicatorsRef, showTrainerVolumePaneRef, signalBottomRef, signalTopRef]);

  return {
    shouldRenderDrawingInPeriod,
    projectDrawingPointsForPeriod,
    syncDrawingStoreFromChart,
    rebuildDrawingsByPeriod,
    refreshDrawingMeta,
    adjustPaneHeights
  };
};
