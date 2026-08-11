// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type MutableRefObject, type RefObject } from 'react';
import type { Chart, KLineData } from 'klinecharts';
import type { BaseTimeframe, DisplayPeriodKey } from '@/domains/chart/chartPeriods';
import type { PriceColorMode } from '@/domains/chart/display';
import {
  DIAGNOSTIC_FOCUS_OVERLAY_NAME,
} from '@/domains/chart/overlays';
import {
  HISTORY_DIAGNOSTIC_FOCUS_OVERLAY_ID,
  HISTORY_ENTRY_BOUNDARY_OVERLAY_GROUP,
  HISTORY_ENTRY_BOUNDARY_OVERLAY_ID,
  HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP,
  clamp,
} from '@/domains/chart/historyReplayChartRuntimeHelpers';
import { renderHistorySpecialTrainingOverlays } from '@/domains/chart/historyReplaySpecialTrainingOverlays';
import type {
  AggregatedBarItem,
  ChartOverlayPayload,
  HistoryReplayChartBindings,
  HistoryReplayChartViewProps,
  ReplayArchiveData,
  ReplayBar,
  SystemMarkerRenderer,
  UiLanguage,
} from '@/domains/chart/HistoryReplayChartTypes';
import { findAggregatedBarIndexByRawIndex } from '@/domains/chart/replayIndexing';
import {
  projectDrawingPointsForPeriodCore,
  shouldRenderDrawingInDisplayPeriod,
} from '@/domains/chart/drawingProjection';
import type { SessionSnapshot } from '@/domains/training/types';
import {
  TRAINER_OVERLAY_COLOR_TOKENS,
  type TradeColorThemeToken,
} from '@/ui/theme/visualColors';

type UseHistoryReplayArchivedOverlaysParams = {
  bindings: HistoryReplayChartBindings;
  chartDomRef: RefObject<HTMLDivElement | null>;
  commitDisplayPeriod: (period: DisplayPeriodKey) => void;
  createSystemMarkersRef: MutableRefObject<SystemMarkerRenderer>;
  focusMarker: HistoryReplayChartViewProps['focusMarker'];
  historyBaseTimeframe: BaseTimeframe;
  historyDisplayPeriod: DisplayPeriodKey;
  language: UiLanguage;
  priceColorMode: PriceColorMode;
  projectId: string | null | undefined;
  replay: ReplayArchiveData | null;
  replayBars: ReplayBar[];
  replayData: KLineData[];
  replaySnapshot: SessionSnapshot | null;
  replaySnapshotSession: SessionSnapshot['session'] | null;
  replayVisibleItems: AggregatedBarItem[];
  showEntryBoundaryLine: boolean;
  showReplayDrawings: boolean;
  systemMarkerMode: 'ALL' | 'TRADE_ONLY';
  themeMode: 'light' | 'dark';
  tradeColorTheme: TradeColorThemeToken | undefined;
};

export const useHistoryReplayArchivedOverlays = ({
  bindings,
  chartDomRef,
  commitDisplayPeriod,
  createSystemMarkersRef,
  focusMarker,
  historyBaseTimeframe,
  historyDisplayPeriod,
  language,
  priceColorMode,
  projectId,
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
}: UseHistoryReplayArchivedOverlaysParams) => {
  const pruneOverlaysToTradeOnly = useCallback(
    (chart: Chart) => {
      chart.removeOverlay({ groupId: bindings.overlayIds.drawGroupId });
      chart.removeOverlay({ groupId: bindings.overlayIds.historyDrawGroupId });
      chart.removeOverlay({ groupId: bindings.overlayIds.systemNoteGroup });
      chart.removeOverlay({ id: bindings.overlayIds.systemPositionOverlayId });
      chart.removeOverlay({ id: HISTORY_DIAGNOSTIC_FOCUS_OVERLAY_ID });

      const keepGroups = new Set<string>([bindings.overlayIds.systemTradeGroup]);
      if (showEntryBoundaryLine) {
        keepGroups.add(HISTORY_ENTRY_BOUNDARY_OVERLAY_GROUP);
      }
      const overlays = chart.getOverlays?.() ?? [];
      overlays.forEach((overlay) => {
        const overlayId = typeof overlay.id === 'string' ? overlay.id.trim() : '';
        const overlayGroupId =
          typeof overlay.groupId === 'string' ? overlay.groupId.trim() : '';
        if (!overlayId || keepGroups.has(overlayGroupId)) {
          return;
        }
        chart.removeOverlay({ id: overlayId });
      });
    },
    [
      bindings.overlayIds.drawGroupId,
      bindings.overlayIds.historyDrawGroupId,
      bindings.overlayIds.systemNoteGroup,
      bindings.overlayIds.systemPositionOverlayId,
      bindings.overlayIds.systemTradeGroup,
      showEntryBoundaryLine,
    ],
  );

  const renderEntryBoundaryLine = useCallback(
    (
      chart: Chart,
      snapshot: SessionSnapshot | null,
      bars: ReplayBar[],
      visibleItems: AggregatedBarItem[],
    ) => {
      chart.removeOverlay({ id: HISTORY_ENTRY_BOUNDARY_OVERLAY_ID });
      if (!showEntryBoundaryLine || !snapshot || !bars.length || !visibleItems.length) {
        return;
      }
      const maxIndex = Math.max(0, bars.length - 1);
      const entryRawIndex = clamp(
        Math.floor(Number(snapshot.session.entry_index)),
        0,
        maxIndex,
      );
      const boundaryItem =
        visibleItems.find((item) => {
          const itemStart = Math.floor(Number(item.startRawIndex));
          const itemEnd = Math.floor(Number(item.endRawIndex));
          if (!Number.isFinite(itemStart) || !Number.isFinite(itemEnd)) {
            return false;
          }
          return entryRawIndex >= itemStart && entryRawIndex <= itemEnd;
        }) ?? null;
      const boundaryClose = Number(boundaryItem?.close);
      if (
        !boundaryItem ||
        !Number.isFinite(boundaryItem.bucketStartMs) ||
        !Number.isFinite(boundaryClose)
      ) {
        return;
      }
      chart.createOverlay({
        id: HISTORY_ENTRY_BOUNDARY_OVERLAY_ID,
        groupId: HISTORY_ENTRY_BOUNDARY_OVERLAY_GROUP,
        name: 'verticalStraightLine',
        lock: true,
        zLevel: 860,
        needDefaultPointFigure: false,
        needDefaultXAxisFigure: false,
        needDefaultYAxisFigure: false,
        points: [
          {
            timestamp: boundaryItem.bucketStartMs,
            value: boundaryClose,
          },
        ],
        styles: {
          line: {
            style: TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineStyle,
            size: TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineWidthThin,
            color:
              themeMode === 'dark'
                ? TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineColorDark
                : TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineColorLight,
            dashedValue: [...TRAINER_OVERLAY_COLOR_TOKENS.decisionBoundary.lineDashedValue],
            smooth: false,
          },
        },
      } as ChartOverlayPayload);
    },
    [showEntryBoundaryLine, themeMode],
  );

  const clearArchivedNonSystemOverlays = useCallback(
    (chart: Chart) => {
      chart.removeOverlay({ groupId: bindings.overlayIds.drawGroupId });
      chart.removeOverlay({ groupId: bindings.overlayIds.historyDrawGroupId });
      chart.removeOverlay({ id: HISTORY_DIAGNOSTIC_FOCUS_OVERLAY_ID });
      chart.removeOverlay({ id: HISTORY_ENTRY_BOUNDARY_OVERLAY_ID });
      chart.removeOverlay({ groupId: HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP });
    },
    [bindings.overlayIds.drawGroupId, bindings.overlayIds.historyDrawGroupId],
  );

  const renderArchivedReplayContextOverlays = useCallback(
    (chart: Chart) => {
      if (showReplayDrawings) {
        const drawingOverlays = Array.isArray(replay?.drawings) ? replay.drawings : [];
        drawingOverlays.forEach((item) => {
          if (!item?.name || !Array.isArray(item.points) || !item.points.length) {
            return;
          }
          if (!shouldRenderDrawingInDisplayPeriod(item, historyDisplayPeriod)) {
            return;
          }
          const projectedPoints = projectDrawingPointsForPeriodCore({
            item,
            period: historyDisplayPeriod,
            visibleBars: replayVisibleItems,
            timeZone: replaySnapshotSession?.timeZone ?? null,
          });
          const minPointCount = bindings.getDrawingMinPointCount(item.name);
          if (projectedPoints.length < minPointCount) {
            return;
          }
          const payload: Record<string, unknown> = {
            name: item.name,
            groupId: bindings.overlayIds.historyDrawGroupId,
            points: projectedPoints,
            needDefaultXAxisFigure: item.needDefaultXAxisFigure ?? false,
            lock: true,
          };
          if (typeof item.id === 'string' && item.id) payload.id = item.id;
          if (typeof item.visible === 'boolean') payload.visible = item.visible;
          if (Number.isFinite(item.zLevel)) payload.zLevel = item.zLevel;
          if (typeof item.mode === 'string') payload.mode = item.mode;
          if (Number.isFinite(item.modeSensitivity)) {
            payload.modeSensitivity = item.modeSensitivity;
          }
          if (item.styles && typeof item.styles === 'object') payload.styles = item.styles;
          if (item.extendData !== undefined) payload.extendData = item.extendData;
          chart.createOverlay(payload as ChartOverlayPayload);
        });
      }
      renderEntryBoundaryLine(chart, replaySnapshot, replayBars, replayVisibleItems);
      renderHistorySpecialTrainingOverlays({
        chart,
        bars: replayBars,
        visibleItems: replayVisibleItems,
        overlayContext: replay?.specialTraining,
        language,
        priceColorMode,
        themeMode,
        tradeColorTheme,
      });
    },
    [
      bindings,
      historyDisplayPeriod,
      language,
      priceColorMode,
      renderEntryBoundaryLine,
      replay?.drawings,
      replay?.specialTraining,
      replayBars,
      replaySnapshot,
      replaySnapshotSession?.timeZone,
      replayVisibleItems,
      showReplayDrawings,
      themeMode,
      tradeColorTheme,
    ],
  );

  const renderDiagnosticFocusOverlay = useCallback(
    (chart: Chart) => {
      try {
        chart.removeOverlay({ id: HISTORY_DIAGNOSTIC_FOCUS_OVERLAY_ID });
      } catch {
        // Best-effort cleanup only.
      }
      if (
        !focusMarker ||
        !Number.isFinite(focusMarker.rawBarIndex) ||
        !replayVisibleItems.length
      ) {
        return;
      }
      const rawIndex = clamp(
        Math.floor(focusMarker.rawBarIndex),
        0,
        Math.max(0, replayBars.length - 1),
      );
      const displayIndex = findAggregatedBarIndexByRawIndex(
        replayVisibleItems,
        rawIndex,
      );
      if (displayIndex < 0) {
        return;
      }
      const visibleItem = replayVisibleItems[displayIndex];
      if (!visibleItem) {
        return;
      }
      const anchorValue = [
        visibleItem.high,
        visibleItem.close,
        visibleItem.open,
        visibleItem.low,
      ].find((value) => Number.isFinite(value) && value > 0);
      if (!Number.isFinite(anchorValue)) {
        return;
      }
      const isDark = themeMode === 'dark';
      const tone = focusMarker.tone ?? 'warning';
      const toneColor =
        typeof focusMarker.toneColor === 'string' && focusMarker.toneColor.trim()
          ? focusMarker.toneColor.trim()
          : tone === 'danger'
            ? (isDark
                ? TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.dangerDark
                : TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.dangerLight)
            : tone === 'primary'
              ? (isDark
                  ? TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.primaryDark
                  : TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.primaryLight)
              : TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.warning;
      const label = String(focusMarker.label ?? '').trim();
      try {
        chart.createOverlay({
          id: HISTORY_DIAGNOSTIC_FOCUS_OVERLAY_ID,
          groupId: bindings.overlayIds.historyDrawGroupId,
          name: DIAGNOSTIC_FOCUS_OVERLAY_NAME,
          lock: true,
          zLevel: 845,
          needDefaultPointFigure: false,
          needDefaultXAxisFigure: false,
          needDefaultYAxisFigure: false,
          points: [
            {
              timestamp: visibleItem.bucketStartMs,
              value: anchorValue,
            },
          ],
          extendData: {
            label,
            tone,
            toneColor,
            fullHeight: Boolean(focusMarker.fullHeight),
          },
        } as ChartOverlayPayload);
      } catch {
        // Ignore overlay creation failures so diagnostic clicks don't crash the whole workspace.
      }
    },
    [
      bindings.overlayIds.historyDrawGroupId,
      focusMarker,
      replayBars.length,
      replayVisibleItems,
      themeMode,
    ],
  );

  const refreshArchivedOverlays = useCallback(
    (chart: Chart): boolean => {
      let hasReplaySnapshot = false;
      try {
        clearArchivedNonSystemOverlays(chart);

        if (
          replaySnapshot &&
          replaySnapshotSession &&
          replayBars.length &&
          replayData.length &&
          replayVisibleItems.length
        ) {
          hasReplaySnapshot = true;
          createSystemMarkersRef.current(
            chart,
            replayData,
            replaySnapshot,
            replayBars,
            replayVisibleItems,
            {
              trainingProjectId: projectId ?? null,
              displayPeriod: historyDisplayPeriod,
              baseDisplayPeriod: historyBaseTimeframe,
              onRequestDisplayPeriod: commitDisplayPeriod,
              chartViewportWidthPx: chartDomRef.current?.clientWidth,
            },
          );
          if (systemMarkerMode === 'TRADE_ONLY') {
            pruneOverlaysToTradeOnly(chart);
          }
        } else {
          chart.removeOverlay({ groupId: bindings.overlayIds.systemTradeGroup });
          chart.removeOverlay({ groupId: bindings.overlayIds.systemNoteGroup });
          chart.removeOverlay({ id: bindings.overlayIds.systemPositionOverlayId });
        }

        if (replaySnapshot && replaySnapshotSession && replayBars.length) {
          renderArchivedReplayContextOverlays(chart);
        }
        renderDiagnosticFocusOverlay(chart);
      } catch (error) {
        // Prevent a malformed archived overlay payload from blanking the whole app.
        console.error('[history-replay-chart] failed to refresh archived overlays', error);
      }
      return hasReplaySnapshot;
    },
    [
      bindings.overlayIds.systemNoteGroup,
      bindings.overlayIds.systemPositionOverlayId,
      bindings.overlayIds.systemTradeGroup,
      chartDomRef,
      clearArchivedNonSystemOverlays,
      commitDisplayPeriod,
      createSystemMarkersRef,
      historyBaseTimeframe,
      historyDisplayPeriod,
      projectId,
      pruneOverlaysToTradeOnly,
      renderArchivedReplayContextOverlays,
      renderDiagnosticFocusOverlay,
      replayBars,
      replayData,
      replaySnapshot,
      replaySnapshotSession,
      replayVisibleItems,
      systemMarkerMode,
    ],
  );

  return {
    refreshArchivedOverlays,
    renderDiagnosticFocusOverlay,
  };
};
