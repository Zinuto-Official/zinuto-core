// SPDX-License-Identifier: GPL-3.0-only

import {
  registerFigure,
  registerOverlay,
  utils,
} from 'klinecharts';
import { SYSTEM_COLOR_TOKENS } from '@/ui/theme/visual/systemColorTokens';
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx,
} from '@/frontend-kernel/typography';
import { SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME } from '@/domains/chart/overlays/constants';
import { OVERLAY_IGNORED_EVENTS } from '@/domains/chart/overlays/overlayTokens';

type SpecialTrainingExtremeTagExtendData = {
  text?: string;
  toneColor?: string;
  offsetX?: number;
  offsetY?: number;
  placement?: 'above' | 'below';
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const EDGE_GAP_PX = 8;
const LINE_GAP_PX = 5;
const TAG_PADDING_X_PX = 7;
const TAG_PADDING_Y_PX = 2;
const SPECIAL_TRAINING_CENTERED_TAG_TEXT_FIGURE_NAME = 'specialTrainingCenteredTagText';
const TAG_TEXT_FALLBACK_BASELINE_OFFSET_RATIO = 0.34;

type CenteredTagTextFigureAttrs = {
  x: number;
  y: number;
  text: string;
  maxWidth: number;
};

type CenteredTagTextFigureStyles = {
  color?: string;
  size?: number;
  weight?: number | string;
  family?: string;
};

const resolveCenteredAlphabeticBaselineY = (
  ctx: CanvasRenderingContext2D,
  text: string,
  centerY: number,
  fontSize: number
): number => {
  const metrics = ctx.measureText(text);
  const ascent = Number(metrics.actualBoundingBoxAscent);
  const descent = Number(metrics.actualBoundingBoxDescent);
  if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0) {
    return centerY + (ascent - descent) / 2;
  }
  return centerY + fontSize * TAG_TEXT_FALLBACK_BASELINE_OFFSET_RATIO;
};

const registerCenteredTagTextFigure = (): void => {
  registerFigure<CenteredTagTextFigureAttrs, CenteredTagTextFigureStyles>({
    name: SPECIAL_TRAINING_CENTERED_TAG_TEXT_FIGURE_NAME,
    checkEventOn: () => false,
    draw: (ctx, attrs, styles) => {
      const text = String(attrs.text ?? '').trim();
      if (!text) {
        return;
      }

      const fallbackFontSize = getGlobalTypographyReferencePx('r1');
      const resolvedFontSize = Number(styles.size ?? fallbackFontSize);
      const fontSize =
        Number.isFinite(resolvedFontSize) && resolvedFontSize > 0
          ? resolvedFontSize
          : fallbackFontSize;
      const fontWeight = styles.weight ?? 'normal';
      const fontFamily = styles.family ?? 'sans-serif';
      const maxWidth = Math.max(0, Number(attrs.maxWidth ?? 0));

      ctx.save();
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = styles.color ?? SYSTEM_COLOR_TOKENS.white;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(
        text,
        attrs.x,
        resolveCenteredAlphabeticBaselineY(ctx, text, attrs.y, fontSize),
        maxWidth
      );
      ctx.restore();
    },
  });
};

export const registerSpecialTrainingExtremeTagOverlay = (): void => {
  registerCenteredTagTextFigure();

  registerOverlay<SpecialTrainingExtremeTagExtendData>({
    name: SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME,
    totalStep: 1,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      const point = coordinates?.[0];
      if (!point) {
        return [];
      }
      const text = String(overlay.extendData?.text ?? '').trim();
      if (!text) {
        return [];
      }

      const fontSize = getGlobalTypographyReferencePx('r1');
      const fontWeight = 600;
      const fontFamily = getGlobalTypographyFontFamily('ui');
      const textWidth = utils.calcTextWidth(text, fontSize, fontWeight, fontFamily);
      const tagWidth = textWidth + TAG_PADDING_X_PX * 2 + 2;
      const tagHeight = fontSize + TAG_PADDING_Y_PX * 2 + 2;
      const offsetX = Number(overlay.extendData?.offsetX ?? 10);
      const offsetY = Number(overlay.extendData?.offsetY ?? 0);
      const placement =
        overlay.extendData?.placement === 'above' || overlay.extendData?.placement === 'below'
          ? overlay.extendData.placement
          : offsetY < 0
            ? 'above'
            : 'below';
      const baseX = Number(point.x) + offsetX + tagWidth / 2;
      const baseY =
        placement === 'above'
          ? Number(point.y) - LINE_GAP_PX - tagHeight / 2
          : Number(point.y) + LINE_GAP_PX + tagHeight / 2;
      const maxX =
        Number.isFinite(bounding?.width) && Number(bounding.width) > 0
          ? Number(bounding.width) - EDGE_GAP_PX - tagWidth / 2
          : baseX;
      const maxY =
        Number.isFinite(bounding?.height) && Number(bounding.height) > 0
          ? Number(bounding.height) - EDGE_GAP_PX - tagHeight / 2
          : baseY;
      const minX = EDGE_GAP_PX + tagWidth / 2;
      const minY = EDGE_GAP_PX + tagHeight / 2;
      const x = clamp(baseX, minX, Math.max(minX, maxX));
      const y = clamp(baseY, minY, Math.max(minY, maxY));
      const toneColor =
        String(overlay.extendData?.toneColor ?? '').trim() || SYSTEM_COLOR_TOKENS.white;

      return [
        {
          type: 'rect',
          attrs: {
            x: x - tagWidth / 2,
            y: y - tagHeight / 2,
            width: tagWidth,
            height: tagHeight
          },
          styles: {
            style: 'stroke_fill',
            color: toneColor,
            borderStyle: 'solid',
            borderDashedValue: [0, 0],
            borderSize: 1,
            borderColor: toneColor,
            borderRadius: 8
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        },
        {
          type: SPECIAL_TRAINING_CENTERED_TAG_TEXT_FIGURE_NAME,
          attrs: {
            x,
            y,
            text,
            maxWidth: Math.max(0, tagWidth - TAG_PADDING_X_PX * 2)
          },
          styles: {
            color: SYSTEM_COLOR_TOKENS.white,
            size: fontSize,
            weight: fontWeight,
            family: fontFamily
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        }
      ];
    }
  });
};
