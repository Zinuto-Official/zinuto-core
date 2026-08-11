// SPDX-License-Identifier: GPL-3.0-only

import { getOverlayClass, registerOverlay } from 'klinecharts';
import { TRAINER_OVERLAY_COLOR_TOKENS } from '@/ui/theme/visualColors';
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx,
} from '@/frontend-kernel/typography';
import { SPECIAL_TRAINING_DECISION_MARK_OVERLAY_NAME } from '@/domains/chart/overlays/constants';

type SpecialTrainingDecisionMarkExtendData = {
  text?: string;
  toneColor?: string;
  anchorY?: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const registerSpecialTrainingDecisionMarkOverlay = (): void => {
  if (getOverlayClass(SPECIAL_TRAINING_DECISION_MARK_OVERLAY_NAME)) {
    return;
  }

  registerOverlay<SpecialTrainingDecisionMarkExtendData>({
    name: SPECIAL_TRAINING_DECISION_MARK_OVERLAY_NAME,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      const point = coordinates?.[0];
      if (!point) {
        return [];
      }
      const rawText = String(overlay.extendData?.text ?? '').trim().toUpperCase();
      if (!rawText) {
        return [];
      }

      const baseX = Number(point.x);
      const anchorYRaw = Number(overlay.extendData?.anchorY);
      const baseY = Number.isFinite(anchorYRaw) ? anchorYRaw : TRAINER_OVERLAY_COLOR_TOKENS.decisionMark.anchorY;
      const maxX = Number.isFinite(bounding?.width) && Number(bounding.width) > 0 ? Number(bounding.width) - 8 : baseX;
      const maxY = Number.isFinite(bounding?.height) && Number(bounding.height) > 0 ? Number(bounding.height) - 8 : baseY;
      const x = clamp(baseX, 8, Math.max(8, maxX));
      const y = clamp(baseY, 8, Math.max(8, maxY));
      const toneColor = String(overlay.extendData?.toneColor ?? '').trim() ||
        TRAINER_OVERLAY_COLOR_TOKENS.decisionMark.neutralDark;

      return [
        {
          type: 'text',
          attrs: {
            x,
            y,
            text: rawText,
            align: 'center',
            baseline: 'middle'
          },
          styles: {
            color: toneColor,
            size: getGlobalTypographyReferencePx("r7"),
            weight: TRAINER_OVERLAY_COLOR_TOKENS.decisionMark.fontWeight,
            family: getGlobalTypographyFontFamily('display'),
            style: 'fill'
          }
        }
      ];
    }
  });
};
