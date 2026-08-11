// SPDX-License-Identifier: GPL-3.0-only

import type { ActiveDrawTool, DrawLineType } from "@/domains/chart/drawingTypes";
import { useEffect, useMemo, useState } from 'react';
import type { OverlayMode } from 'klinecharts';
import { DRAW_COLOR_OPTIONS_BY_THEME, isDrawColorOption, resolveDrawColorOptions } from '@/ui/theme/visualColors';
import type {
  UiSettings
} from "@/frontend-kernel/appTypes";
import type { ThemeModeToken } from '@/ui/theme/visualColors';

type UseDrawingToolbarStateArgs = {
  persistedUi: UiSettings;
  themeMode: ThemeModeToken;
};

export const useDrawingToolbarState = ({ persistedUi, themeMode }: UseDrawingToolbarStateArgs) => {
  const drawColors = useMemo(() => resolveDrawColorOptions(themeMode), [themeMode]);
  const defaultDrawColor = drawColors[1] ?? drawColors[0];
  const isThemeNeutralDrawColor = (value: string) =>
    value === DRAW_COLOR_OPTIONS_BY_THEME.light[0] || value === DRAW_COLOR_OPTIONS_BY_THEME.dark[0];
  const [drawLineWidth, setDrawLineWidth] = useState(() => {
    const value = Number(persistedUi.drawLineWidth);
    return Number.isFinite(value) ? Math.max(1, Math.min(8, Math.floor(value))) : 2;
  });
  const [drawLineType, setDrawLineType] = useState<DrawLineType>(() =>
    persistedUi.drawLineType === 'solid' ? 'solid' : 'dashed'
  );
  const [drawColor, setDrawColor] = useState<string>(() => {
    const persistedColor = String(persistedUi.drawColor ?? '').trim();
    if (isDrawColorOption(persistedColor)) {
      if (drawColors.includes(persistedColor)) {
        return persistedColor;
      }
      if (isThemeNeutralDrawColor(persistedColor)) {
        return drawColors[0] ?? defaultDrawColor;
      }
    }
    return defaultDrawColor;
  });
  const [drawMagnet, setDrawMagnet] = useState<OverlayMode>(() =>
    persistedUi.drawMagnet === 'strong_magnet' ? 'strong_magnet' : 'weak_magnet'
  );
  const [activeDrawTool, setActiveDrawTool] = useState<ActiveDrawTool>('cursor');
  const [selectedDrawingId, setSelectedDrawingId] = useState('');
  const [allDrawingsVisible, setAllDrawingsVisible] = useState(true);
  const [drawingCount, setDrawingCount] = useState(0);

  useEffect(() => {
    setDrawColor((current) => {
      if (isDrawColorOption(current) && drawColors.includes(current)) {
        return current;
      }
      if (isThemeNeutralDrawColor(current)) {
        return drawColors[0] ?? defaultDrawColor;
      }
      return defaultDrawColor;
    });
  }, [defaultDrawColor, drawColors]);

  return {
    drawColors,
    drawLineWidth,
    setDrawLineWidth,
    drawLineType,
    setDrawLineType,
    drawColor,
    setDrawColor,
    drawMagnet,
    setDrawMagnet,
    activeDrawTool,
    setActiveDrawTool,
    selectedDrawingId,
    setSelectedDrawingId,
    allDrawingsVisible,
    setAllDrawingsVisible,
    drawingCount,
    setDrawingCount
  };
};
