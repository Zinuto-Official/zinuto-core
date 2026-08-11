// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { useEffect, type MutableRefObject } from 'react';
import type { Chart } from 'klinecharts';
import { toKlinePeriod } from '@/domains/chart/chartPeriods';

const isSameChartPeriod = (
  left: ReturnType<Chart['getPeriod']>,
  right: ReturnType<typeof toKlinePeriod>,
): boolean => {
  if (!left) {
    return false;
  }
  return left.type === right.type && Number(left.span) === Number(right.span);
};

type UseTrainerDisplayPeriodSyncArgs = {
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  trainerDisplayPeriod: DisplayPeriodKey;
  currentDisplayPeriodRef: MutableRefObject<DisplayPeriodKey>;
  pendingDrawingRebuildPeriodRef: MutableRefObject<DisplayPeriodKey | null>;
  drawingOverlayIdRef: MutableRefObject<string>;
  syncDrawingStoreFromChart: (period: DisplayPeriodKey) => void;
  showDrawingsAcrossPeriods: boolean;
};

export const useTrainerDisplayPeriodSync = ({
  chartReady,
  chartRef,
  trainerDisplayPeriod,
  currentDisplayPeriodRef,
  pendingDrawingRebuildPeriodRef,
  drawingOverlayIdRef,
  syncDrawingStoreFromChart,
  showDrawingsAcrossPeriods
}: UseTrainerDisplayPeriodSyncArgs) => {
  useEffect(() => {
    const chart = chartRef.current;
    if (!chartReady || !chart) {
      currentDisplayPeriodRef.current = trainerDisplayPeriod;
      pendingDrawingRebuildPeriodRef.current = null;
      return;
    }
    const previousPeriod = currentDisplayPeriodRef.current;
    const nextChartPeriod = toKlinePeriod(trainerDisplayPeriod);
    const chartAlreadyAtTargetPeriod = isSameChartPeriod(
      chart.getPeriod(),
      nextChartPeriod,
    );
    // klinecharts compares period objects by reference, so sending a fresh
    // object with the same value still resets the viewport.
    if (previousPeriod === trainerDisplayPeriod) {
      currentDisplayPeriodRef.current = trainerDisplayPeriod;
      pendingDrawingRebuildPeriodRef.current = null;
      if (!chartAlreadyAtTargetPeriod) {
        chart.setPeriod(nextChartPeriod);
      }
      return;
    }
    syncDrawingStoreFromChart(previousPeriod);
    drawingOverlayIdRef.current = '';
    currentDisplayPeriodRef.current = trainerDisplayPeriod;
    if (!chartAlreadyAtTargetPeriod) {
      chart.setPeriod(nextChartPeriod);
    }
    pendingDrawingRebuildPeriodRef.current = showDrawingsAcrossPeriods
      ? null
      : trainerDisplayPeriod;
  }, [
    chartReady,
    chartRef,
    currentDisplayPeriodRef,
    drawingOverlayIdRef,
    pendingDrawingRebuildPeriodRef,
    showDrawingsAcrossPeriods,
    syncDrawingStoreFromChart,
    trainerDisplayPeriod
  ]);
};
