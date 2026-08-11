// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import type { SystemMarkerRenderer } from "@/domains/chart/systemMarkerTypes";
import {
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction
} from 'react';
import type { Chart } from 'klinecharts';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import {
  createSystemMarkerRenderer,
  syncSystemTradeMarkerCompactMode,
  type ChartMarkerHover,
  type TradeMarkerCompactState
} from '@/domains/chart/systemMarkerRendering';
import { isReplaySnapshotNoteType } from '@/workspaces/notes/useReplayNotes';

type ChartNoteHover = ChartMarkerHover | null;

type UseSystemMarkerControllerArgs = {
  tradeMarkerDensityRatio: number;
  tradeAmountIncludesFees: boolean;
  replayNotes: ReplayNote[];
  openReplayNoteFromMarker: (noteId: string) => void;
  setChartNoteHover: Dispatch<SetStateAction<ChartNoteHover>>;
  formatMoney: (value: number, digits?: number) => string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: unknown[]) => string;
};

export const useSystemMarkerController = ({
  tradeMarkerDensityRatio,
  tradeAmountIncludesFees,
  replayNotes,
  openReplayNoteFromMarker,
  setChartNoteHover,
  formatMoney,
  tt,
  ttf
}: UseSystemMarkerControllerArgs): {
  syncTradeMarkerCompactMode: (chart: Chart, viewportWidthPx?: number) => void;
  createSystemMarkers: SystemMarkerRenderer;
} => {
  const visibleBarCountCacheRef = useRef<WeakMap<Chart, number>>(new WeakMap());
  const compactStateCacheRef = useRef<WeakMap<Chart, TradeMarkerCompactState>>(new WeakMap());

  const showChartNoteHover = useCallback(
    (hover: ChartMarkerHover) => {
      setChartNoteHover((current) => {
        if (
          current &&
          current.title === hover.title &&
          current.pageX === hover.pageX &&
          current.pageY === hover.pageY
        ) {
          return current;
        }
        return hover;
      });
    },
    [setChartNoteHover]
  );

  const clearChartNoteHover = useCallback(
    () => {
      setChartNoteHover((current) => (current ? null : current));
    },
    [setChartNoteHover]
  );

  const syncTradeMarkerCompactMode = useCallback(
    (chart: Chart, viewportWidthPx?: number) => {
      syncSystemTradeMarkerCompactMode({
        chart,
        viewportWidthPx,
        tradeMarkerDensityRatio,
        visibleBarCountCache: visibleBarCountCacheRef.current,
        compactStateCache: compactStateCacheRef.current
      });
    },
    [tradeMarkerDensityRatio]
  );

  const createSystemMarkers = useMemo<SystemMarkerRenderer>(
    () => createSystemMarkerRenderer({
      tradeMarkerDensityRatio,
      resolveTradeAmountIncludesFees: () => tradeAmountIncludesFees,
      replayNotes,
      isReplaySnapshotNote: (note) => isReplaySnapshotNoteType(note.type),
      openReplayNoteFromMarker,
      hoverController: {
        show: showChartNoteHover,
        clear: clearChartNoteHover
      },
      formatMoney,
      tt,
      ttf,
      caches: {
        visibleBarCountCache: visibleBarCountCacheRef.current,
        compactStateCache: compactStateCacheRef.current
      }
    }),
    [
      clearChartNoteHover,
      formatMoney,
      openReplayNoteFromMarker,
      replayNotes,
      showChartNoteHover,
      tradeAmountIncludesFees,
      tradeMarkerDensityRatio,
      tt,
      ttf
    ]
  );

  return {
    syncTradeMarkerCompactMode,
    createSystemMarkers
  };
};
