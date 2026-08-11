// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, type MutableRefObject } from 'react';
import type { Chart, KLineData } from 'klinecharts';
import {
  buildChartSymbolInfo,
  isSameChartSymbolInfo,
} from '@/domains/chart/pricePrecision';

const isSameChartSymbol = (
  current: ReturnType<Chart['getSymbol']>,
  nextSymbol: ReturnType<typeof buildChartSymbolInfo>,
): boolean => {
  return isSameChartSymbolInfo(current, nextSymbol);
};

type UseTrainerChartSymbolSyncArgs = {
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  chartDataRef: MutableRefObject<KLineData[]>;
  snapshotSymbol: string | null | undefined;
  selectedSymbol: string;
};

export const useTrainerChartSymbolSync = ({
  chartReady,
  chartRef,
  chartDataRef,
  snapshotSymbol,
  selectedSymbol
}: UseTrainerChartSymbolSyncArgs) => {
  useEffect(() => {
    if (!chartReady) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const baseSymbol = (snapshotSymbol || selectedSymbol || '').trim().toUpperCase();
    if (baseSymbol) {
      const nextSymbol = buildChartSymbolInfo(baseSymbol, chartDataRef.current);
      // klinecharts also compares symbol objects by reference. Skip the setter
      // when the chart is already on the same symbol to avoid extra viewport resets.
      if (isSameChartSymbol(chart.getSymbol(), nextSymbol)) {
        return;
      }
      chart.setSymbol(nextSymbol);
    }
  }, [chartDataRef, chartReady, chartRef, selectedSymbol, snapshotSymbol]);
};
