// SPDX-License-Identifier: GPL-3.0-only

import { getOverlayClass, registerOverlay } from 'klinecharts';
import { SYSTEM_COLOR_TOKENS } from '@/ui/theme/visual/systemColorTokens';
import { resolveTradeVisualThemePalette } from '@/ui/theme/visualColors';
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx,
} from '@/frontend-kernel/typography';

type PositionLineExtendData = {
  text: string;
  side?: 'BUY' | 'SELL';
  tone?: 'up' | 'down' | 'flat';
};

const POSITION_LINE_OVERLAY_NAME = 'positionLine';

export const registerPositionLineOverlay = (): void => {
  if (getOverlayClass(POSITION_LINE_OVERLAY_NAME)) {
    return;
  }

  registerOverlay<PositionLineExtendData>({
    name: POSITION_LINE_OVERLAY_NAME,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      const text = overlay.extendData?.text ?? '';
      const tradeVisual = resolveTradeVisualThemePalette();
      const side = overlay.extendData?.side;
      const lineColor =
        side === 'SELL'
          ? tradeVisual.sellMarker
          : side === 'BUY'
            ? tradeVisual.buyMarker
            : tradeVisual.positionLine;
      const y = coordinates[0].y;

      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: bounding.width, y }
            ]
          },
          styles: {
            style: 'dashed',
            size: 1.5,
            color: lineColor,
            dashedValue: [8, 4],
            smooth: false
          },
          ignoreEvent: true
        },
        {
          type: 'text',
          attrs: {
            x: 10,
            y: y - 13,
            text,
            align: 'left',
            baseline: 'middle'
          },
          styles: {
            color: lineColor,
            size: getGlobalTypographyReferencePx("r2"),
            weight: 700,
            family: getGlobalTypographyFontFamily('ui'),
            style: 'fill',
            borderStyle: 'solid',
            borderDashedValue: [0, 0],
            borderSize: 0,
            borderColor: SYSTEM_COLOR_TOKENS.transparent,
            borderRadius: 0,
            backgroundColor: SYSTEM_COLOR_TOKENS.transparent,
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0
          },
          ignoreEvent: true
        }
      ];
    }
  });
};
