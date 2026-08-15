// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import type { ActiveDrawTool, SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import { DRAW_GROUP_ID } from "@/domains/chart/overlays/constants";
import { isReplaySnapshotNoteType } from "@/workspaces/notes/useReplayNotes";
import { clearChartNoteHover } from "@/frontend-kernel/chartNoteHoverStore";
import {
  resolveDrawToolScopePage,
  type DrawToolScopePage,
} from "@/app-shell/appRootDataConfigUtils";
import type {
  AggregationCacheEntry,
  TrainingProject
} from "@/frontend-kernel/appTypes";
import type { SignalIndicatorName } from "@/domains/indicators/core";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";
import type { Chart } from "klinecharts";
import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { SessionSnapshot } from "@/domains/training/types";

type UseRuntimeTrainerRefSyncEffectsArgs = {
  activePage: WorkspacePage;
  chartRef: MutableRefObject<Chart | null>;
  activeDrawTool: ActiveDrawTool;
  setActiveDrawTool: Dispatch<SetStateAction<ActiveDrawTool>>;
  activeDrawToolRef: MutableRefObject<ActiveDrawTool>;
  drawToolByScopePageRef: MutableRefObject<
    Record<DrawToolScopePage, ActiveDrawTool>
  >;
  lastDrawToolScopePageRef: MutableRefObject<DrawToolScopePage | null>;
  drawingOverlayIdRef: MutableRefObject<string>;
  rearmTimerRef: MutableRefObject<number | null>;
  bars: ReplayBar[];
  barsTsMs: number[];
  barsRef: MutableRefObject<ReplayBar[]>;
  barsTsMsRef: MutableRefObject<number[]>;
  trainerAggregationCacheRef: MutableRefObject<
    Map<string, AggregationCacheEntry>
  >;
  trainerAggregationTailCacheRef: MutableRefObject<
    Map<string, AggregationCacheEntry>
  >;
  barsOffset: number;
  barsOffsetRef: MutableRefObject<number>;
  barsTotal: number;
  barsTotalRef: MutableRefObject<number>;
  snapshot: SessionSnapshot | null;
  snapshotRef: MutableRefObject<SessionSnapshot | null>;
  trainingProjects: TrainingProject[];
  setSelectedHistoryProjectId: Dispatch<SetStateAction<string>>;
  replayNotes: ReplayNote[];
  setSelectedReplayNoteId: Dispatch<SetStateAction<string>>;
  activeTrainingRecordNoteId: string;
  setActiveTrainingRecordNoteId: Dispatch<SetStateAction<string>>;
  sessionId: string;
  sessionIdRef: MutableRefObject<string | null>;
  setSelectedDataIndex: Dispatch<SetStateAction<number | null>>;
  pendingDrawingRebuildPeriodRef: MutableRefObject<DisplayPeriodKey | null>;
  drawingStoreRef: MutableRefObject<SavedDrawingOverlay[]>;
  setPendingRestoreDrawings: Dispatch<
    SetStateAction<SavedDrawingOverlay[] | null>
  >;
  setSelectedDrawingId: Dispatch<SetStateAction<string>>;
  setAllDrawingsVisible: Dispatch<SetStateAction<boolean>>;
  setDrawingCount: Dispatch<SetStateAction<number>>;
  selectedDrawingId: string;
  selectedDrawingIdRef: MutableRefObject<string>;
  signalTopIndicator: SignalIndicatorName;
  signalBottomIndicator: SignalIndicatorName;
  signalTopIndicatorParams: number[];
  signalBottomIndicatorParams: number[];
  signalTopRef: MutableRefObject<SignalIndicatorName>;
  signalBottomRef: MutableRefObject<SignalIndicatorName>;
  signalTopParamsRef: MutableRefObject<number[]>;
  signalBottomParamsRef: MutableRefObject<number[]>;
  showTrainerSubIndicators: boolean;
  showTrainerSubIndicatorsRef: MutableRefObject<boolean>;
};

export const useRuntimeTrainerRefSyncEffects = ({
  activePage,
  chartRef,
  activeDrawTool,
  setActiveDrawTool,
  activeDrawToolRef,
  drawToolByScopePageRef,
  lastDrawToolScopePageRef,
  drawingOverlayIdRef,
  rearmTimerRef,
  bars,
  barsTsMs,
  barsRef,
  barsTsMsRef,
  trainerAggregationCacheRef,
  trainerAggregationTailCacheRef,
  barsOffset,
  barsOffsetRef,
  barsTotal,
  barsTotalRef,
  snapshot,
  snapshotRef,
  trainingProjects,
  setSelectedHistoryProjectId,
  replayNotes,
  setSelectedReplayNoteId,
  activeTrainingRecordNoteId,
  setActiveTrainingRecordNoteId,
  sessionId,
  sessionIdRef,
  setSelectedDataIndex,
  pendingDrawingRebuildPeriodRef,
  drawingStoreRef,
  setPendingRestoreDrawings,
  setSelectedDrawingId,
  setAllDrawingsVisible,
  setDrawingCount,
  selectedDrawingId,
  selectedDrawingIdRef,
  signalTopIndicator,
  signalBottomIndicator,
  signalTopIndicatorParams,
  signalBottomIndicatorParams,
  signalTopRef,
  signalBottomRef,
  signalTopParamsRef,
  signalBottomParamsRef,
  showTrainerSubIndicators,
  showTrainerSubIndicatorsRef,
}: UseRuntimeTrainerRefSyncEffectsArgs) => {
  useEffect(() => {
    const nextScopePage = resolveDrawToolScopePage(activePage);
    if (!nextScopePage) {
      return;
    }
    const previousScopePage = lastDrawToolScopePageRef.current;
    const nextTool = drawToolByScopePageRef.current[nextScopePage] ?? "cursor";
    if (previousScopePage && previousScopePage !== nextScopePage) {
      drawToolByScopePageRef.current[previousScopePage] =
        activeDrawToolRef.current;
      if (activeDrawToolRef.current !== nextTool) {
        const chart = chartRef.current;
        const pendingOverlayId = drawingOverlayIdRef.current;
        if (chart && pendingOverlayId) {
          chart.removeOverlay({ id: pendingOverlayId });
          drawingOverlayIdRef.current = "";
        }
        if (rearmTimerRef.current !== null) {
          window.clearTimeout(rearmTimerRef.current);
          rearmTimerRef.current = null;
        }
        activeDrawToolRef.current = nextTool;
        setActiveDrawTool(nextTool);
      }
    }
    lastDrawToolScopePageRef.current = nextScopePage;
  }, [
    activeDrawToolRef,
    activePage,
    chartRef,
    drawToolByScopePageRef,
    drawingOverlayIdRef,
    lastDrawToolScopePageRef,
    rearmTimerRef,
    setActiveDrawTool,
  ]);

  useEffect(() => {
    barsRef.current = bars;
    const nextTsMs = barsTsMs;
    const previousTsMs = barsTsMsRef.current;
    const isAppendOnly =
      previousTsMs.length > 0 &&
      nextTsMs.length >= previousTsMs.length &&
      previousTsMs.every((value, index) => nextTsMs[index] === value);
    barsTsMsRef.current = nextTsMs;
    if (!isAppendOnly || !nextTsMs.length) {
      trainerAggregationCacheRef.current.clear();
      trainerAggregationTailCacheRef.current.clear();
    }
  }, [
    bars,
    barsRef,
    barsTsMs,
    barsTsMsRef,
    trainerAggregationCacheRef,
    trainerAggregationTailCacheRef,
  ]);

  useEffect(() => {
    barsOffsetRef.current = barsOffset;
  }, [barsOffset, barsOffsetRef]);

  useEffect(() => {
    barsTotalRef.current = barsTotal;
  }, [barsTotal, barsTotalRef]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot, snapshotRef]);

  useEffect(() => {
    sessionIdRef.current = String(sessionId || "").trim() || null;
  }, [sessionId, sessionIdRef]);

  useEffect(() => {
    if (!trainingProjects.length) {
      setSelectedHistoryProjectId("");
      return;
    }
    setSelectedHistoryProjectId((current) =>
      trainingProjects.some((item) => item.id === current)
        ? current
        : trainingProjects[0].id,
    );
  }, [setSelectedHistoryProjectId, trainingProjects]);

  useEffect(() => {
    if (!replayNotes.length) {
      setSelectedReplayNoteId("");
      setActiveTrainingRecordNoteId("");
      return;
    }
    setSelectedReplayNoteId((current) => {
      if (current && replayNotes.some((item) => item.id === current)) {
        return current;
      }
      const latestNote = [...replayNotes].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )[0];
      return latestNote?.id ?? "";
    });
  }, [
    replayNotes,
    setActiveTrainingRecordNoteId,
    setSelectedReplayNoteId,
  ]);

  useEffect(() => {
    if (!activeTrainingRecordNoteId) {
      return;
    }
    const active = replayNotes.find(
      (note) => note.id === activeTrainingRecordNoteId,
    );
    if (!active || !isReplaySnapshotNoteType(active.type)) {
      setActiveTrainingRecordNoteId("");
    }
  }, [activeTrainingRecordNoteId, replayNotes, setActiveTrainingRecordNoteId]);

  useEffect(() => {
    if (
      activePage !== "TRAINER" &&
      activePage !== "SPECIAL_TRAINING" &&
      activePage !== "HISTORY"
    ) {
      clearChartNoteHover();
    }
  }, [activePage]);

  useEffect(() => {
    setSelectedDataIndex(null);
  }, [sessionId, setSelectedDataIndex]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      chart.removeOverlay({ groupId: DRAW_GROUP_ID });
    }
    pendingDrawingRebuildPeriodRef.current = null;
    drawingStoreRef.current = [];
    setPendingRestoreDrawings(null);
    drawingOverlayIdRef.current = "";
    setSelectedDrawingId("");
    setAllDrawingsVisible(true);
    setDrawingCount(0);
  }, [
    chartRef,
    drawingOverlayIdRef,
    drawingStoreRef,
    pendingDrawingRebuildPeriodRef,
    sessionId,
    setAllDrawingsVisible,
    setDrawingCount,
    setPendingRestoreDrawings,
    setSelectedDrawingId,
  ]);

  useEffect(() => {
    setSelectedDataIndex(null);
  }, [setSelectedDataIndex, snapshot?.session.cursor_index]);

  useEffect(() => {
    activeDrawToolRef.current = activeDrawTool;
    const scopePage = resolveDrawToolScopePage(activePage);
    if (scopePage) {
      drawToolByScopePageRef.current[scopePage] = activeDrawTool;
    }
  }, [
    activeDrawTool,
    activeDrawToolRef,
    activePage,
    drawToolByScopePageRef,
  ]);

  useEffect(() => {
    selectedDrawingIdRef.current = selectedDrawingId;
  }, [selectedDrawingId, selectedDrawingIdRef]);

  useEffect(() => {
    signalTopRef.current = signalTopIndicator;
    signalBottomRef.current = signalBottomIndicator;
    signalTopParamsRef.current = signalTopIndicatorParams;
    signalBottomParamsRef.current = signalBottomIndicatorParams;
  }, [
    signalBottomIndicator,
    signalBottomIndicatorParams,
    signalBottomRef,
    signalBottomParamsRef,
    signalTopIndicator,
    signalTopIndicatorParams,
    signalTopRef,
    signalTopParamsRef,
  ]);

  useEffect(() => {
    showTrainerSubIndicatorsRef.current = showTrainerSubIndicators;
  }, [
    showTrainerSubIndicators,
    showTrainerSubIndicatorsRef,
  ]);

  useEffect(() => {
    return () => {
      if (rearmTimerRef.current !== null) {
        window.clearTimeout(rearmTimerRef.current);
      }
    };
  }, [rearmTimerRef]);
};
