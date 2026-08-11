// SPDX-License-Identifier: GPL-3.0-only

import { getOverlayClass, registerOverlay } from 'klinecharts';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import { SYSTEM_COLOR_TOKENS } from '@/ui/theme/visual/systemColorTokens';
import { TRAINER_OVERLAY_COLOR_TOKENS } from '@/ui/theme/visualColors';
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx,
} from '@/frontend-kernel/typography';
import { OVERLAY_IGNORED_EVENTS } from '@/domains/chart/overlays/overlayTokens';

type NoteMarkerExtendData = {
  count?: number;
};

const NOTE_MARKER_OVERLAY_NAME = 'noteMarker';

export const registerNoteMarkerOverlay = (): void => {
  if (getOverlayClass(NOTE_MARKER_OVERLAY_NAME)) {
    return;
  }

  registerOverlay<NoteMarkerExtendData>({
    name: NOTE_MARKER_OVERLAY_NAME,
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

      const paneHeightRaw = Number(bounding?.height);
      const paneHeight = Number.isFinite(paneHeightRaw) && paneHeightRaw > 0 ? paneHeightRaw : null;
      const anchorY = paneHeight === null ? Number(point.y) : Math.max(12, paneHeight - 12);
      if (!Number.isFinite(anchorY)) {
        return [];
      }

      const countRaw = Number(overlay.extendData?.count ?? 1);
      const count = Number.isFinite(countRaw) && countRaw > 1 ? Math.max(2, Math.floor(countRaw)) : 1;
      const label = count > 1 ? String(Math.min(99, count)) : tt('appText.message0665');
      const labelScale = getGlobalTypographyReferencePx("r2") / 12;
      const labelSize = (count >= 10 ? 8.8 : count > 1 ? 9.6 : 10.2) * labelScale;
      const labelOffsetX = count > 1 ? (count >= 10 ? 0.16 : 0.08) : 0.42;
      const labelOffsetY = count > 1 ? 0.28 : 0.34;

      return [
        {
          type: 'circle',
          attrs: {
            x: anchorX,
            y: anchorY,
            r: 9
          },
          styles: {
            style: 'fill',
            color: TRAINER_OVERLAY_COLOR_TOKENS.noteMarker.fill
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        },
        {
          type: 'circle',
          attrs: {
            x: anchorX,
            y: anchorY,
            r: 9
          },
          styles: {
            style: 'stroke',
            color: TRAINER_OVERLAY_COLOR_TOKENS.noteMarker.border,
            borderColor: TRAINER_OVERLAY_COLOR_TOKENS.noteMarker.border,
            borderSize: 1.2,
            borderStyle: 'solid',
            borderDashedValue: [0, 0]
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        },
        {
          type: 'text',
          attrs: {
            x: anchorX + labelOffsetX,
            y: anchorY + labelOffsetY,
            text: label,
            align: 'center',
            baseline: 'middle'
          },
          styles: {
            color: TRAINER_OVERLAY_COLOR_TOKENS.noteMarker.text,
            size: labelSize,
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
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        }
      ];
    }
  });
};
