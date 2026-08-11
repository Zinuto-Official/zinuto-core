// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, type MutableRefObject } from 'react';
import type { SessionSnapshot } from '@/domains/training/types';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';

const DEFAULT_TRAINER_AGGREGATION_PREWARM_DELAY_MS = 1200;
const FALLBACK_PREWARM_SLICE_BUDGET_MS = 8;

type UseTrainerAggregationPrewarmArgs<TPeriod extends string> = {
  activePage: WorkspacePage;
  enabled?: boolean;
  startupDelayMs?: number;
  chartReady: boolean;
  barsLength: number;
  snapshot: SessionSnapshot | null;
  trainerDisplayPeriod: TPeriod;
  trainerPeriodOptions: TPeriod[];
  getCachedTrainerAggregatedBars: (period: TPeriod, startRawIndex: number, endRawIndex: number) => unknown[];
  aggregationPrewarmTaskRef: MutableRefObject<number | null>;
};

export const useTrainerAggregationPrewarm = <TPeriod extends string>({
  activePage,
  enabled = true,
  startupDelayMs = DEFAULT_TRAINER_AGGREGATION_PREWARM_DELAY_MS,
  chartReady,
  barsLength,
  snapshot,
  trainerDisplayPeriod,
  trainerPeriodOptions,
  getCachedTrainerAggregatedBars,
  aggregationPrewarmTaskRef
}: UseTrainerAggregationPrewarmArgs<TPeriod>) => {
  useEffect(() => {
    if (!enabled || (activePage !== 'TRAINER' && activePage !== 'SPECIAL_TRAINING') || !chartReady || barsLength <= 0) {
      return;
    }
    const maxIndex = snapshot ?
      Math.max(0, Math.min(snapshot.session.cursor_index, barsLength - 1)) :
      Math.max(0, barsLength - 1);
    const windowStartIndex = snapshot ?
      Math.max(0, Math.min(snapshot.session.start_index, maxIndex)) :
      0;
    const prewarmPeriods = trainerPeriodOptions
      .filter((period) => period !== trainerDisplayPeriod)
      .slice(0, 3);
    if (!prewarmPeriods.length) {
      return;
    }
    let disposed = false;
    let startupDelayTimer: number | null = null;
    let idleTaskHandle: number | null = null;
    let fallbackTimer: number | null = null;
    let nextPeriodIndex = 0;
    const readNowMs = (): number =>
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const runOnePrewarmPeriod = () => {
      if (disposed) {
        return;
      }
      const period = prewarmPeriods[nextPeriodIndex];
      if (!period) {
        return;
      }
      nextPeriodIndex += 1;
      getCachedTrainerAggregatedBars(period, windowStartIndex, maxIndex);
    };
    const runtimeWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const scheduleIdlePrewarm = () => {
      if (disposed || nextPeriodIndex >= prewarmPeriods.length) {
        aggregationPrewarmTaskRef.current = null;
        return;
      }
      idleTaskHandle = runtimeWindow.requestIdleCallback?.((deadline) => {
        idleTaskHandle = null;
        aggregationPrewarmTaskRef.current = null;
        while (
          !disposed &&
          nextPeriodIndex < prewarmPeriods.length &&
          (deadline.timeRemaining() > 2 || deadline.didTimeout)
        ) {
          runOnePrewarmPeriod();
          if (deadline.didTimeout || deadline.timeRemaining() <= 2) {
            break;
          }
        }
        scheduleIdlePrewarm();
      }, { timeout: 800 }) ?? null;
      aggregationPrewarmTaskRef.current = idleTaskHandle;
    };
    const runFallbackPrewarmSlice = () => {
      fallbackTimer = null;
      aggregationPrewarmTaskRef.current = null;
      const sliceStartedAtMs = readNowMs();
      while (
        !disposed &&
        nextPeriodIndex < prewarmPeriods.length &&
        readNowMs() - sliceStartedAtMs < FALLBACK_PREWARM_SLICE_BUDGET_MS
      ) {
        runOnePrewarmPeriod();
      }
      if (!disposed && nextPeriodIndex < prewarmPeriods.length) {
        fallbackTimer = window.setTimeout(runFallbackPrewarmSlice, 16);
        aggregationPrewarmTaskRef.current = fallbackTimer;
      }
    };
    startupDelayTimer = window.setTimeout(() => {
      if (disposed) {
        return;
      }
      if (typeof runtimeWindow.requestIdleCallback === 'function') {
        scheduleIdlePrewarm();
        return;
      }
      fallbackTimer = window.setTimeout(runFallbackPrewarmSlice, 16);
      aggregationPrewarmTaskRef.current = fallbackTimer;
    }, Math.max(0, Math.floor(Number(startupDelayMs) || 0)));
    return () => {
      disposed = true;
      if (startupDelayTimer !== null) {
        window.clearTimeout(startupDelayTimer);
      }
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
      if (idleTaskHandle !== null && typeof runtimeWindow.cancelIdleCallback === 'function') {
        runtimeWindow.cancelIdleCallback(idleTaskHandle);
      }
      aggregationPrewarmTaskRef.current = null;
    };
  }, [
    activePage,
    aggregationPrewarmTaskRef,
    barsLength,
    chartReady,
    enabled,
    getCachedTrainerAggregatedBars,
    snapshot,
    startupDelayMs,
    trainerDisplayPeriod,
    trainerPeriodOptions
  ]);
};
