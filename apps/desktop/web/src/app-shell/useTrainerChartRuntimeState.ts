// SPDX-License-Identifier: GPL-3.0-only

import type { SystemMarkerRenderer } from "@/domains/chart/systemMarkerTypes";
import type { ActiveDrawTool, DrawTool, SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import { useCallback, useRef, useState } from 'react';
import type { Chart, KLineData } from 'klinecharts';
import type { SignalIndicatorName } from '@/domains/indicators/core';
import type { SessionSnapshot } from '@/domains/training/types';
import type { TrainerChartSurfacePage } from '@/app-shell/trainerChartSurfacePage';
import type {
  AggregationCacheEntry
} from "@/frontend-kernel/appTypes";

export const useTrainerChartRuntimeState = () => {
  const chartDomRef = useRef<HTMLDivElement | null>(null);
  const chartDomBySurfaceRef = useRef<
    Record<TrainerChartSurfacePage, HTMLDivElement | null>
  >({
    TRAINER: null,
    SPECIAL_TRAINING: null,
  });
  const [trainerChartDomAttachVersion, setTrainerChartDomAttachVersion] =
    useState(0);
  const [
    specialTrainingChartDomAttachVersion,
    setSpecialTrainingChartDomAttachVersion,
  ] = useState(0);
  const chartRef = useRef<Chart | null>(null);
  const chartDataRef = useRef<KLineData[]>([]);
  const liveBarSubscriberRef = useRef<((data: KLineData) => void) | null>(null);
  const barsRef = useRef<ReplayBar[]>([]);
  const barsTsMsRef = useRef<number[]>([]);
  const trainerAggregationCacheRef = useRef<Map<string, AggregationCacheEntry>>(new Map());
  const trainerAggregationTailCacheRef = useRef<Map<string, AggregationCacheEntry>>(new Map());
  const barsOffsetRef = useRef(0);
  const barsTotalRef = useRef(0);
  const snapshotRef = useRef<SessionSnapshot | null>(null);
  const isLoadingMoreBarsRef = useRef(false);
  const isPrefetchingBarsRef = useRef(false);
  const playingLockRef = useRef(false);
  const symbolLoadAbortControllerRef = useRef<AbortController | null>(null);
  const symbolLoadRequestVersionRef = useRef(0);
  const snapshotAbortControllerRef = useRef<AbortController | null>(null);
  const snapshotRequestVersionRef = useRef(0);
  const ensureBarsForwardAbortControllerRef = useRef<AbortController | null>(null);
  const ensureBarsBackwardAbortControllerRef = useRef<AbortController | null>(null);
  const appBootstrapAbortControllerRef = useRef<AbortController | null>(null);
  const activeDrawToolRef = useRef<ActiveDrawTool>('cursor');
  const drawingOverlayIdRef = useRef('');
  const selectedDrawingIdRef = useRef('');
  const rearmTimerRef = useRef<number | null>(null);
  const drawArmEpochRef = useRef(0);
  const armDrawOverlayRef = useRef<(tool: DrawTool) => void>(() => {});
  const sessionIdRef = useRef<string | null>(null);
  const createSystemMarkersRef = useRef<SystemMarkerRenderer | null>(null);
  const signalTopRef = useRef<SignalIndicatorName>('KDJ');
  const signalBottomRef = useRef<SignalIndicatorName>('MACD');
  const showTrainerSubIndicatorsRef = useRef(true);
  const showTrainerVolumePaneRef = useRef(true);
  const signalTopParamsRef = useRef<number[]>([]);
  const signalBottomParamsRef = useRef<number[]>([]);
  const lastScrollSessionRef = useRef('');
  const chartDataRenderSignatureRef = useRef('');
  const chartMarkerHeavyRenderSignatureRef = useRef('');
  const chartMarkerPositionRenderSignatureRef = useRef('');
  const specialTrainingOverlaySignatureRef = useRef('');
  const lastMainIndicatorMountKeyRef = useRef('');
  const lastSignalIndicatorMountKeyRef = useRef('');
  const visibleAggregatedBarsRef = useRef<AggregatedBarItem[]>([]);
  const drawingStoreRef = useRef<SavedDrawingOverlay[]>([]);
  const currentDisplayPeriodRef = useRef<DisplayPeriodKey>('1d');
  const pendingDrawingRebuildPeriodRef = useRef<DisplayPeriodKey | null>(null);
  const aggregationPrewarmTaskRef = useRef<number | null>(null);

  const bindTrainerChartDomRef = useCallback((node: HTMLDivElement | null) => {
    if (chartDomBySurfaceRef.current.TRAINER === node) {
      return;
    }
    chartDomBySurfaceRef.current.TRAINER = node;
    setTrainerChartDomAttachVersion((current) => current + 1);
  }, []);

  const bindSpecialTrainingChartDomRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (chartDomBySurfaceRef.current.SPECIAL_TRAINING === node) {
        return;
      }
      chartDomBySurfaceRef.current.SPECIAL_TRAINING = node;
      setSpecialTrainingChartDomAttachVersion((current) => current + 1);
    },
    [],
  );

  const resolveChartDomForPage = useCallback(
    (page: TrainerChartSurfacePage): HTMLDivElement | null =>
      chartDomBySurfaceRef.current[page],
    [],
  );

  return {
    chartDomRef,
    trainerChartDomAttachVersion,
    specialTrainingChartDomAttachVersion,
    chartRef,
    chartDataRef,
    liveBarSubscriberRef,
    barsRef,
    barsTsMsRef,
    trainerAggregationCacheRef,
    trainerAggregationTailCacheRef,
    barsOffsetRef,
    barsTotalRef,
    snapshotRef,
    isLoadingMoreBarsRef,
    isPrefetchingBarsRef,
    playingLockRef,
    symbolLoadAbortControllerRef,
    symbolLoadRequestVersionRef,
    snapshotAbortControllerRef,
    snapshotRequestVersionRef,
    ensureBarsForwardAbortControllerRef,
    ensureBarsBackwardAbortControllerRef,
    appBootstrapAbortControllerRef,
    activeDrawToolRef,
    drawingOverlayIdRef,
    selectedDrawingIdRef,
    rearmTimerRef,
    drawArmEpochRef,
    armDrawOverlayRef,
    sessionIdRef,
    createSystemMarkersRef,
    signalTopRef,
    signalBottomRef,
    showTrainerSubIndicatorsRef,
    showTrainerVolumePaneRef,
    signalTopParamsRef,
    signalBottomParamsRef,
    lastScrollSessionRef,
    chartDataRenderSignatureRef,
    chartMarkerHeavyRenderSignatureRef,
    chartMarkerPositionRenderSignatureRef,
    specialTrainingOverlaySignatureRef,
    lastMainIndicatorMountKeyRef,
    lastSignalIndicatorMountKeyRef,
    visibleAggregatedBarsRef,
    drawingStoreRef,
    currentDisplayPeriodRef,
    pendingDrawingRebuildPeriodRef,
    aggregationPrewarmTaskRef,
    bindTrainerChartDomRef,
    bindSpecialTrainingChartDomRef,
    resolveChartDomForPage,
  };
};
