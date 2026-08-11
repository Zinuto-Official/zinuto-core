// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';
import type { Chart, OverlayMode } from 'klinecharts';
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import { SYSTEM_COLOR_TOKENS } from '@/ui/theme/visual/systemColorTokens';
import { CHART_STYLE_COLOR_TOKENS } from '@/ui/theme/visualColors';
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx,
} from '@/frontend-kernel/typography';
import {
  DRAW_GROUP_ID,
  USER_DRAWING_Z_LEVEL,
} from '@/domains/chart/overlays/constants';
import { isDrawingOverlayInProgress } from '@/domains/chart/drawingOverlayLifecycle';

type DrawMagnetMode = OverlayMode;

type OverlayWithStep = {
  id: string;
  name?: string;
  groupId?: string;
  points?: unknown[];
  visible?: boolean;
  currentStep?: unknown;
};

type UseDrawingToolControllerArgs<TDrawTool extends string, TActiveDrawTool extends string> = {
  chartRef: MutableRefObject<Chart | null>;
  chartDomRef: MutableRefObject<HTMLDivElement | null>;
  chartReady: boolean;
  barsLength: number;
  activePage: WorkspacePage;
  activeDrawTool: TActiveDrawTool;
  activeDrawToolRef: MutableRefObject<TActiveDrawTool>;
  drawArmEpochRef: MutableRefObject<number>;
  armDrawOverlayRef: MutableRefObject<(tool: string) => void>;
  drawingOverlayIdRef: MutableRefObject<string>;
  rearmTimerRef: MutableRefObject<number | null>;
  drawingStoreRef: MutableRefObject<Array<{ id?: string }>>;
  drawLineType: 'solid' | 'dashed';
  drawLineWidth: number;
  drawColor: string;
  drawMagnet: DrawMagnetMode;
  drawToolLabels: Partial<Record<TDrawTool, string>>;
  getDrawingMinPointCount: (tool: string) => number;
  refreshDrawingMeta: () => void;
  setActiveDrawTool: Dispatch<SetStateAction<TActiveDrawTool>>;
  setSelectedDrawingId: Dispatch<SetStateAction<string>>;
  setAllDrawingsVisible: Dispatch<SetStateAction<boolean>>;
  setHint: Dispatch<SetStateAction<string>>;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
};

export const useDrawingToolController = <TDrawTool extends string, TActiveDrawTool extends string>({
  chartRef,
  chartDomRef,
  chartReady,
  barsLength,
  activePage,
  activeDrawTool,
  activeDrawToolRef,
  drawArmEpochRef,
  armDrawOverlayRef,
  drawingOverlayIdRef,
  rearmTimerRef,
  drawingStoreRef,
  drawLineType,
  drawLineWidth,
  drawColor,
  drawMagnet,
  drawToolLabels,
  getDrawingMinPointCount,
  refreshDrawingMeta,
  setActiveDrawTool,
  setSelectedDrawingId,
  setAllDrawingsVisible,
  setHint,
  tt,
  ttf
}: UseDrawingToolControllerArgs<TDrawTool, TActiveDrawTool>) => {
  const createDrawingStyles = useCallback((_toolName?: string) => {
    const resolvedColor = drawColor;
    const dashedValue = drawLineType === 'dashed' ? [8, 4] : [0, 0];
    return {
      line: {
        style: drawLineType,
        size: drawLineWidth,
        color: resolvedColor,
        dashedValue,
        smooth: false
      },
      polygon: {
        style: 'stroke' as const,
        color: CHART_STYLE_COLOR_TOKENS.curve.transparent,
        borderColor: resolvedColor,
        borderSize: drawLineWidth,
        borderStyle: drawLineType,
        borderDashedValue: dashedValue
      },
      text: {
        color: resolvedColor,
        size: getGlobalTypographyReferencePx("r3"),
        family: getGlobalTypographyFontFamily('ui'),
        weight: 600,
        style: 'fill' as const,
        borderStyle: 'solid' as const,
        borderDashedValue: [0, 0],
        borderSize: 0,
        borderColor: SYSTEM_COLOR_TOKENS.transparent,
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
        paddingBottom: 1,
        borderRadius: 0,
        backgroundColor: SYSTEM_COLOR_TOKENS.transparent
      }
    };
  }, [drawColor, drawLineType, drawLineWidth]);

  const applyDrawingStyleToOverlay = useCallback(
    (overlayId: string) => {
      const chart = chartRef.current;
      if (!chart || !overlayId) {
        return;
      }

      const target = chart.getOverlays({ id: overlayId })[0] as OverlayWithStep | undefined;
      if (!target || target.groupId !== DRAW_GROUP_ID) {
        return;
      }
      const targetToolName = typeof target.name === 'string' ? target.name : '';

      chart.overrideOverlay({
        id: overlayId,
        styles: createDrawingStyles(targetToolName) as unknown as Record<string, unknown>,
        mode: drawMagnet,
        modeSensitivity: drawMagnet === 'weak_magnet' ? 12 : 4
      });
    },
    [chartRef, createDrawingStyles, drawMagnet]
  );

  const armDrawOverlay = useCallback(
    (tool: TDrawTool) => {
      const chart = chartRef.current;
      if (!chart) {
        return;
      }
      const armEpoch = drawArmEpochRef.current;

      const overlayId = chart.createOverlay({
        name: tool,
        groupId: DRAW_GROUP_ID,
        zLevel: USER_DRAWING_Z_LEVEL,
        needDefaultXAxisFigure: false,
        mode: drawMagnet,
        modeSensitivity: drawMagnet === 'weak_magnet' ? 12 : 4,
        styles: createDrawingStyles(String(tool)) as unknown as Record<string, unknown>,
        onDrawStart: (event) => {
          drawingOverlayIdRef.current = event.overlay.id;
        },
        onDrawing: (event) => {
          drawingOverlayIdRef.current = event.overlay.id;
        },
        onDrawEnd: (event) => {
          if (drawingOverlayIdRef.current === event.overlay.id) {
            drawingOverlayIdRef.current = '';
          }
          setSelectedDrawingId(event.overlay.id);
          refreshDrawingMeta();

          const active = activeDrawToolRef.current;
          if (String(active) === String(tool) && drawArmEpochRef.current === armEpoch) {
            if (rearmTimerRef.current !== null) {
              window.clearTimeout(rearmTimerRef.current);
            }
            rearmTimerRef.current = window.setTimeout(() => {
              rearmTimerRef.current = null;
              if (drawArmEpochRef.current !== armEpoch) {
                return;
              }
              if (String(activeDrawToolRef.current) === String(tool) && !drawingOverlayIdRef.current) {
                armDrawOverlayRef.current(tool);
              }
            }, 24);
          }
        },
        onRightClick: () => {
          const active = activeDrawToolRef.current;
          if (active !== 'cursor' && rearmTimerRef.current === null && drawArmEpochRef.current === armEpoch) {
            rearmTimerRef.current = window.setTimeout(() => {
              rearmTimerRef.current = null;
              if (drawArmEpochRef.current !== armEpoch) {
                return;
              }
              if (activeDrawToolRef.current !== 'cursor' && !drawingOverlayIdRef.current) {
                armDrawOverlayRef.current(activeDrawToolRef.current as string);
              }
            }, 24);
          }
        },
        onSelected: (event) => {
          setSelectedDrawingId(event.overlay.id);
        },
        onDeselected: (event) => {
          setSelectedDrawingId((current) => (current === event.overlay.id ? '' : current));
        },
        onRemoved: (event) => {
          if (drawingOverlayIdRef.current === event.overlay.id) {
            drawingOverlayIdRef.current = '';
          }
          setSelectedDrawingId((current) => (current === event.overlay.id ? '' : current));
          refreshDrawingMeta();
        }
      });

      if (typeof overlayId === 'string') {
        drawingOverlayIdRef.current = overlayId;
        applyDrawingStyleToOverlay(overlayId);
      }
    },
    [
      activeDrawToolRef,
      applyDrawingStyleToOverlay,
      armDrawOverlayRef,
      chartRef,
      createDrawingStyles,
      drawArmEpochRef,
      drawMagnet,
      drawingOverlayIdRef,
      rearmTimerRef,
      refreshDrawingMeta,
      setSelectedDrawingId
    ]
  );

  useEffect(() => {
    armDrawOverlayRef.current = (tool) => armDrawOverlay(tool as TDrawTool);
  }, [armDrawOverlay, armDrawOverlayRef]);

  const handleDrawToolSelect = useCallback(
    (tool: TActiveDrawTool) => {
      setActiveDrawTool(tool);
      activeDrawToolRef.current = tool;
      drawArmEpochRef.current += 1;

      const chart = chartRef.current;
      if (!chart) {
        return;
      }

      if (rearmTimerRef.current !== null) {
        window.clearTimeout(rearmTimerRef.current);
        rearmTimerRef.current = null;
      }

      const pendingOverlayId = drawingOverlayIdRef.current;
      if (pendingOverlayId) {
        chart.removeOverlay({ id: pendingOverlayId });
      }

      const activeOverlays = chart.getOverlays({ groupId: DRAW_GROUP_ID }) as OverlayWithStep[];
      activeOverlays.forEach((overlay) => {
        const isDrawing = isDrawingOverlayInProgress(overlay);
        if (isDrawing) {
          chart.removeOverlay({ id: overlay.id });
          return;
        }
        const pointCount = Array.isArray(overlay.points) ? overlay.points.length : 0;
        const minPointCount = overlay.name ? getDrawingMinPointCount(String(overlay.name)) : Number.POSITIVE_INFINITY;
        if (pointCount < minPointCount) {
          chart.removeOverlay({ id: overlay.id });
        }
      });
      drawingOverlayIdRef.current = '';

      if (tool === 'cursor') {
        setHint(tt('appText.switchedCursorMode'));
        return;
      }

      armDrawOverlayRef.current(tool as string);
      setHint(ttf('appText.activatedDrawingValue0', [drawToolLabels[tool] ?? tool]));
    },
    [
      activeDrawToolRef,
      armDrawOverlayRef,
      chartRef,
      drawArmEpochRef,
      drawToolLabels,
      drawingOverlayIdRef,
      getDrawingMinPointCount,
      rearmTimerRef,
      setActiveDrawTool,
      setHint,
      tt,
      ttf
    ]
  );

  useEffect(() => {
    if ((activePage !== 'TRAINER' && activePage !== 'SPECIAL_TRAINING') || !chartReady || activeDrawTool !== 'cursor') {
      return;
    }
    const pendingOverlayId = drawingOverlayIdRef.current;
    if (!pendingOverlayId) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.removeOverlay({ id: pendingOverlayId });
    drawingOverlayIdRef.current = '';
  }, [activeDrawTool, activePage, chartReady, chartRef, drawingOverlayIdRef]);

  useEffect(() => {
    if ((activePage !== 'TRAINER' && activePage !== 'SPECIAL_TRAINING') || !chartReady || !barsLength) {
      return;
    }
    const activeTool = activeDrawToolRef.current;
    if (activeTool === 'cursor') {
      return;
    }

    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    const pendingOverlayId = drawingOverlayIdRef.current;
    if (pendingOverlayId) {
      const target = chart.getOverlays({ id: pendingOverlayId })[0] as OverlayWithStep | undefined;
      if (target && target.groupId === DRAW_GROUP_ID && isDrawingOverlayInProgress(target)) {
        applyDrawingStyleToOverlay(pendingOverlayId);
        return;
      }
      chart.removeOverlay({ id: pendingOverlayId });
      drawingOverlayIdRef.current = '';
    }

    const activeOverlays = chart.getOverlays({ groupId: DRAW_GROUP_ID }) as OverlayWithStep[];
    const hasInProgressOverlay = activeOverlays.some((overlay) => isDrawingOverlayInProgress(overlay));
    if (!hasInProgressOverlay) {
      armDrawOverlayRef.current(activeTool as string);
    }
  }, [
    activeDrawTool,
    activeDrawToolRef,
    activePage,
    applyDrawingStyleToOverlay,
    armDrawOverlayRef,
    barsLength,
    chartReady,
    chartRef,
    drawingOverlayIdRef,
  ]);

  useEffect(() => {
    const chartDom = chartDomRef.current;
    if (!chartDom) {
      return;
    }

    const onContextMenu = (event: MouseEvent) => {
      if (activeDrawToolRef.current === 'cursor') {
        return;
      }
      event.preventDefault();
      if (rearmTimerRef.current !== null) {
        window.clearTimeout(rearmTimerRef.current);
      }
      const armEpoch = drawArmEpochRef.current;
      rearmTimerRef.current = window.setTimeout(() => {
        rearmTimerRef.current = null;
        if (drawArmEpochRef.current !== armEpoch) {
          return;
        }
        const active = activeDrawToolRef.current;
        if (active !== 'cursor' && !drawingOverlayIdRef.current) {
          armDrawOverlayRef.current(active as string);
        }
      }, 24);
    };

    chartDom.addEventListener('contextmenu', onContextMenu);
    return () => {
      chartDom.removeEventListener('contextmenu', onContextMenu);
    };
  }, [activeDrawToolRef, armDrawOverlayRef, chartDomRef, drawArmEpochRef, drawingOverlayIdRef, rearmTimerRef]);

  useEffect(() => {
    if (drawingOverlayIdRef.current) {
      applyDrawingStyleToOverlay(drawingOverlayIdRef.current);
    }
  }, [applyDrawingStyleToOverlay, drawingOverlayIdRef]);

  const toggleAllDrawingVisible = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const overlays = chart.getOverlays({ groupId: DRAW_GROUP_ID });
    if (!overlays.length) {
      setAllDrawingsVisible(true);
      return;
    }
    const shouldShow = overlays.some((overlay) => overlay.visible === false);
    overlays.forEach((overlay) => {
      chart.overrideOverlay({ id: overlay.id, visible: shouldShow });
    });
    setAllDrawingsVisible(shouldShow);
    refreshDrawingMeta();
  }, [chartRef, refreshDrawingMeta, setAllDrawingsVisible]);

  const clearDrawings = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    drawingStoreRef.current = [];
    chart.removeOverlay({ groupId: DRAW_GROUP_ID });
    drawingOverlayIdRef.current = '';
    setSelectedDrawingId('');
    refreshDrawingMeta();
  }, [chartRef, drawingOverlayIdRef, drawingStoreRef, refreshDrawingMeta, setSelectedDrawingId]);

  return {
    handleDrawToolSelect,
    toggleAllDrawingVisible,
    clearDrawings
  };
};
