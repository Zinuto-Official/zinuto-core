// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import type { SystemMarkerRenderer } from "@/domains/chart/systemMarkerTypes";
import {
  useCallback,
  useMemo,
  useRef
} from 'react';
import type { Chart } from 'klinecharts';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import {
  clearChartNoteHover,
  publishChartNoteHover,
} from '@/frontend-kernel/chartNoteHoverStore';
import {
  createSystemMarkerRenderer,
  syncSystemTradeMarkerCompactMode,
  type TradeMarkerCompactState
} from '@/domains/chart/systemMarkerRendering';
import { isReplaySnapshotNoteType } from '@/workspaces/notes/useReplayNotes';

type UseSystemMarkerControllerArgs = {
  tradeMarkerDensityRatio: number;
  tradeAmountIncludesFees: boolean;
  replayNotes: ReplayNote[];
  openReplayNoteFromMarker: (noteId: string) => void;
  formatMoney: (value: number, digits?: number) => string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: unknown[]) => string;
};

export const useSystemMarkerController = ({
  tradeMarkerDensityRatio,
  tradeAmountIncludesFees,
  replayNotes,
  openReplayNoteFromMarker,
  formatMoney,
  tt,
  ttf
}: UseSystemMarkerControllerArgs): {
  syncTradeMarkerCompactMode: (chart: Chart, viewportWidthPx?: number) => void;
  createSystemMarkers: SystemMarkerRenderer;
} => {
  const visibleBarCountCacheRef = useRef<WeakMap<Chart, number>>(new WeakMap());
  const compactStateCacheRef = useRef<WeakMap<Chart, TradeMarkerCompactState>>(new WeakMap());

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
        show: publishChartNoteHover,
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
      formatMoney,
      openReplayNoteFromMarker,
      replayNotes,
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
