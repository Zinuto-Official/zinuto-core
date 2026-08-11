// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { useMemo } from 'react';
import { findAggregatedBarIndexByRawIndex } from '@/domains/chart/replayIndexing';
import { resolveCurrentBarChangeRatio } from '@/domains/chart/barChangeRatio';
import { resolveReplayBarLocalIndexForRawIndex } from '@/domains/trainer/marketFrameStore';

type SnapshotLike = {
  session: {
    cursor_index: number;
    start_index: number;
  };
};

type ReplayBarLike = {
  close: number;
  startRawIndex?: number;
  endRawIndex?: number;
};

type SelectedBarChange = {
  ratio: number;
} | null;

type UseSelectedBarChangeArgs = {
  bars: ReplayBarLike[];
  snapshot: SnapshotLike | null;
  selectedDataIndex: number | null;
  trainerDisplayPeriod: DisplayPeriodKey;
  getCachedTrainerAggregatedBars: (
    period: DisplayPeriodKey,
    startRawIndex: number,
    endRawIndex: number
  ) => AggregatedBarItem[];
};

export const useSelectedBarChange = ({
  bars,
  snapshot,
  selectedDataIndex,
  trainerDisplayPeriod,
  getCachedTrainerAggregatedBars
}: UseSelectedBarChangeArgs): SelectedBarChange =>
  useMemo(() => {
    if (!bars.length) {
      return null;
    }

    const cursorLocalIndex = snapshot
      ? resolveReplayBarLocalIndexForRawIndex(bars, snapshot.session.cursor_index)
      : Math.max(0, bars.length - 1);
    const maxLocalIndex = Math.max(0, Math.min(cursorLocalIndex, bars.length - 1));
    const windowStartIndex = snapshot
      ? Math.max(
          0,
          Math.min(
            resolveReplayBarLocalIndexForRawIndex(bars, snapshot.session.start_index),
            maxLocalIndex,
          ),
        )
      : 0;
    const visibleItems = getCachedTrainerAggregatedBars(trainerDisplayPeriod, windowStartIndex, maxLocalIndex);
    if (!visibleItems.length) {
      return null;
    }

    const activeRawIndex =
      selectedDataIndex === null
        ? visibleItems[visibleItems.length - 1]?.endRawIndex ?? maxLocalIndex
        : Math.max(0, Math.floor(selectedDataIndex));
    const displayIndex = findAggregatedBarIndexByRawIndex(visibleItems, activeRawIndex);
    const index = displayIndex >= 0 ? displayIndex : Math.max(0, visibleItems.length - 1);
    const ratio = resolveCurrentBarChangeRatio(visibleItems, index);
    if (ratio === null || !Number.isFinite(ratio)) {
      return null;
    }

    return {
      ratio
    };
  }, [bars, getCachedTrainerAggregatedBars, selectedDataIndex, snapshot, trainerDisplayPeriod]);
