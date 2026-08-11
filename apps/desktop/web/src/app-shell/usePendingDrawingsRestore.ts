// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Chart } from 'klinecharts';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import {
  DRAW_GROUP_ID,
  USER_DRAWING_Z_LEVEL,
} from '@/domains/chart/overlays/constants';

type PendingDrawingOverlayLike = {
  id?: string;
  name?: string;
  points?: Array<{ timestamp?: number; value?: number; dataIndex?: number }>;
  needDefaultXAxisFigure?: boolean;
  visible?: boolean;
  lock?: boolean;
  zLevel?: number;
  mode?: string;
  modeSensitivity?: number;
  styles?: unknown;
  extendData?: unknown;
};

type UsePendingDrawingsRestoreArgs<
  TDrawing,
  TPeriod extends string
> = {
  activePage: WorkspacePage;
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  pendingRestoreDrawings: TDrawing[] | null;
  trainerDisplayPeriod: TPeriod;
  shouldRenderDrawingInPeriod: (item: TDrawing, period: TPeriod) => boolean;
  projectDrawingPointsForPeriod: (
    item: TDrawing,
    period: TPeriod
  ) => Array<{ timestamp: number; value?: number; dataIndex?: number }>;
  getDrawingMinPointCount: (name: string) => number;
  setPendingRestoreDrawings: Dispatch<SetStateAction<TDrawing[] | null>>;
  refreshDrawingMeta: () => void;
};

export const usePendingDrawingsRestore = <
  TDrawing,
  TPeriod extends string
>({
  activePage,
  chartReady,
  chartRef,
  pendingRestoreDrawings,
  trainerDisplayPeriod,
  shouldRenderDrawingInPeriod,
  projectDrawingPointsForPeriod,
  getDrawingMinPointCount,
  setPendingRestoreDrawings,
  refreshDrawingMeta
}: UsePendingDrawingsRestoreArgs<TDrawing, TPeriod>) => {
  useEffect(() => {
    if ((activePage !== 'TRAINER' && activePage !== 'SPECIAL_TRAINING') || !chartReady || pendingRestoreDrawings === null) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    chart.removeOverlay({ groupId: DRAW_GROUP_ID });
    pendingRestoreDrawings.forEach((item) => {
      const drawing = item as PendingDrawingOverlayLike;
      if (!drawing?.name || !Array.isArray(drawing.points) || !drawing.points.length) {
        return;
      }
      if (!shouldRenderDrawingInPeriod(item, trainerDisplayPeriod)) {
        return;
      }
      const projectedPoints = projectDrawingPointsForPeriod(item, trainerDisplayPeriod);
      if (projectedPoints.length < getDrawingMinPointCount(drawing.name)) {
        return;
      }
      const payload: Record<string, unknown> = {
        name: drawing.name,
        groupId: DRAW_GROUP_ID,
        points: projectedPoints,
        needDefaultXAxisFigure: drawing.needDefaultXAxisFigure ?? false,
        zLevel: Number.isFinite(drawing.zLevel) ? drawing.zLevel : USER_DRAWING_Z_LEVEL
      };
      if (typeof drawing.id === 'string' && drawing.id) payload.id = drawing.id;
      if (typeof drawing.visible === 'boolean') payload.visible = drawing.visible;
      if (typeof drawing.lock === 'boolean') payload.lock = drawing.lock;
      if (typeof drawing.mode === 'string') payload.mode = drawing.mode;
      if (Number.isFinite(drawing.modeSensitivity)) payload.modeSensitivity = drawing.modeSensitivity;
      if (drawing.styles && typeof drawing.styles === 'object') payload.styles = drawing.styles;
      if (drawing.extendData !== undefined) payload.extendData = drawing.extendData;
      chart.createOverlay(payload as any);
    });

    setPendingRestoreDrawings(null);
    refreshDrawingMeta();
  }, [
    activePage,
    chartReady,
    chartRef,
    pendingRestoreDrawings,
    projectDrawingPointsForPeriod,
    refreshDrawingMeta,
    getDrawingMinPointCount,
    setPendingRestoreDrawings,
    shouldRenderDrawingInPeriod,
    trainerDisplayPeriod
  ]);
};
