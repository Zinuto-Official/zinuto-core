// SPDX-License-Identifier: GPL-3.0-only

import { getOverlayClass, registerOverlay } from 'klinecharts';
import { TRAINER_OVERLAY_COLOR_TOKENS } from '@/ui/theme/visualColors';
import { resolveDomThemeMode } from '@/ui/theme/visual/domThemeMode';
import { DIAGNOSTIC_FOCUS_OVERLAY_NAME } from '@/domains/chart/overlays/constants';
import { OVERLAY_IGNORED_EVENTS } from '@/domains/chart/overlays/overlayTokens';

type DiagnosticFocusTone = 'primary' | 'warning' | 'danger';

type DiagnosticFocusExtendData = {
  tone?: DiagnosticFocusTone;
  toneColor?: string;
  fullHeight?: boolean;
  label?: string;
};

const resolveDiagnosticFocusColor = (tone: DiagnosticFocusTone | undefined): string => {
  const themeMode = resolveDomThemeMode();
  const isDark = themeMode === 'dark';
  if (tone === 'primary') {
    return isDark ?
      TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.primaryDark :
      TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.primaryLight;
  }
  if (tone === 'danger') {
    return isDark ?
      TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.dangerDark :
      TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.dangerLight;
  }
  return TRAINER_OVERLAY_COLOR_TOKENS.diagnosticFocus.warning;
};

export const registerDiagnosticFocusOverlay = (): void => {
  if (getOverlayClass(DIAGNOSTIC_FOCUS_OVERLAY_NAME)) {
    return;
  }

  registerOverlay<DiagnosticFocusExtendData>({
    name: DIAGNOSTIC_FOCUS_OVERLAY_NAME,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      const point = coordinates?.[0];
      if (!point) {
        return [];
      }
      const anchorX = Number(point.x);
      if (!Number.isFinite(anchorX)) {
        return [];
      }

      const tone = overlay.extendData?.tone;
      const customToneColor = String(overlay.extendData?.toneColor ?? '').trim();
      const isFullHeight = Boolean(overlay.extendData?.fullHeight);
      const resolvedToneColor = customToneColor || resolveDiagnosticFocusColor(tone);
      const color = isFullHeight ? resolvedToneColor : resolvedToneColor;

      if (isFullHeight) {
        const paneHeightRaw = Number(bounding?.height);
        const paneHeight = Number.isFinite(paneHeightRaw) && paneHeightRaw > 0 ? paneHeightRaw : null;
        if (paneHeight === null) {
          return [];
        }
        const paneWidthRaw = Number(bounding?.width);
        const paneWidth = Number.isFinite(paneWidthRaw) && paneWidthRaw > 0 ? paneWidthRaw : null;
        const clampedX = paneWidth === null ? anchorX : Math.max(0, Math.min(paneWidth, anchorX));
        const yTop = 0;
        const yBottom = paneHeight;
        return [
          {
            type: 'line',
            attrs: {
              coordinates: [
                { x: clampedX, y: yBottom },
                { x: clampedX, y: yTop }
              ]
            },
            styles: {
              style: 'dashed',
              size: 3,
              color,
              dashedValue: [4, 4],
              smooth: false
            },
            ignoreEvent: OVERLAY_IGNORED_EVENTS as any
          }
        ];
      }

      const anchorY = Number(point.y);
      if (!Number.isFinite(anchorY)) {
        return [];
      }

      const paneHeightRaw = Number(bounding?.height);
      const paneHeight = Number.isFinite(paneHeightRaw) && paneHeightRaw > 0 ? paneHeightRaw : null;
      const markerSpan = 64;
      const minPadding = 8;
      const canPlaceUp = paneHeight === null ? true : anchorY >= markerSpan + minPadding;
      const direction: 1 | -1 = canPlaceUp ? -1 : 1;
      const lineStartY = anchorY + direction * 4;
      const lineEndY = anchorY + direction * 48;

      const arrowHeadHalfWidth = 4.6;
      const arrowHeadLength = 8;
      const arrowBaseY = lineStartY + direction * arrowHeadLength;

      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: anchorX, y: lineStartY },
              { x: anchorX, y: lineEndY }
            ]
          },
          styles: {
            style: 'dashed',
            size: 2,
            color,
            dashedValue: [7, 5],
            smooth: false
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        },
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: anchorX, y: lineStartY },
              { x: anchorX - arrowHeadHalfWidth, y: arrowBaseY },
              { x: anchorX + arrowHeadHalfWidth, y: arrowBaseY }
            ]
          },
          styles: {
            style: 'solid',
            color
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        }
      ];
    }
  });
};
