// SPDX-License-Identifier: GPL-3.0-only

import { getOverlayClass, registerOverlay } from 'klinecharts';
import { SYSTEM_COLOR_TOKENS } from '@/ui/theme/visual/systemColorTokens';
import { TRAINER_OVERLAY_COLOR_TOKENS } from '@/ui/theme/visualColors';
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx,
} from '@/frontend-kernel/typography';
import { SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_NAME } from '@/domains/chart/overlays/constants';

type SpecialTrainingDecisionReferenceExtendData = {
  text?: string;
  toneColor?: string;
  textColor?: string;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const registerSpecialTrainingDecisionReferenceOverlay = (): void => {
  if (getOverlayClass(SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_NAME)) {
    return;
  }

  registerOverlay<SpecialTrainingDecisionReferenceExtendData>({
    name: SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_NAME,
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

      const width = Number.isFinite(bounding?.width) ? Number(bounding.width) : 0;
      const height = Number.isFinite(bounding?.height) ? Number(bounding.height) : 0;
      const y = clamp(Number(point.y), 8, Math.max(8, height - 8));
      const toneColor = String(overlay.extendData?.toneColor ?? '').trim() ||
        TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneDark;

      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: width, y }
            ]
          },
          styles: {
            style: TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.lineStyle,
            size: TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.lineSize,
            color: toneColor,
            dashedValue: [...TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.lineDashedValue],
            smooth: false
          },
          ignoreEvent: true
        }
      ];
    },
    createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
      const point = coordinates?.[0];
      if (!point) {
        return [];
      }
      const text = String(overlay.extendData?.text ?? '').trim();
      if (!text) {
        return [];
      }
      const toneColor = String(overlay.extendData?.toneColor ?? '').trim() ||
        TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.observeToneDark;
      const textColor = String(overlay.extendData?.textColor ?? '').trim() ||
        TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.textColor;
      const lastPriceTextStyle = chart.getStyles?.()?.candle?.priceMark?.last?.text;
      const textStyle = {
        style: String(lastPriceTextStyle?.style ?? 'fill'),
        color: String(lastPriceTextStyle?.color ?? textColor),
        size: Number.isFinite(Number(lastPriceTextStyle?.size))
          ? Number(lastPriceTextStyle?.size)
          : getGlobalTypographyReferencePx("r3"),
        family: String(lastPriceTextStyle?.family ?? getGlobalTypographyFontFamily('ui')),
        weight: String(lastPriceTextStyle?.weight ?? 'normal'),
        borderStyle: String(lastPriceTextStyle?.borderStyle ?? 'solid'),
        borderDashedValue: Array.isArray(lastPriceTextStyle?.borderDashedValue)
          ? [...lastPriceTextStyle.borderDashedValue]
          : [2, 2],
        borderSize: Number.isFinite(Number(lastPriceTextStyle?.borderSize))
          ? Number(lastPriceTextStyle?.borderSize)
          : 0,
        borderColor: String(lastPriceTextStyle?.borderColor ?? SYSTEM_COLOR_TOKENS.transparent),
        borderRadius: Number.isFinite(Number(lastPriceTextStyle?.borderRadius))
          ? Number(lastPriceTextStyle?.borderRadius)
          : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.labelRadius,
        paddingLeft: Number.isFinite(Number(lastPriceTextStyle?.paddingLeft))
          ? Number(lastPriceTextStyle?.paddingLeft)
          : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.labelPaddingX,
        paddingRight: Number.isFinite(Number(lastPriceTextStyle?.paddingRight))
          ? Number(lastPriceTextStyle?.paddingRight)
          : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.labelPaddingX,
        paddingTop: Number.isFinite(Number(lastPriceTextStyle?.paddingTop))
          ? Number(lastPriceTextStyle?.paddingTop)
          : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.labelPaddingY,
        paddingBottom: Number.isFinite(Number(lastPriceTextStyle?.paddingBottom))
          ? Number(lastPriceTextStyle?.paddingBottom)
          : TRAINER_OVERLAY_COLOR_TOKENS.decisionReference.labelPaddingY
      };
      const isFromZero = Boolean(yAxis?.isFromZero?.());
      const x = isFromZero ? 0 : Number.isFinite(bounding?.width) ? Number(bounding.width) : 0;
      const align = isFromZero ? 'left' as const : 'right' as const;
      const y = clamp(Number(point.y), 8, Math.max(8, (Number(bounding?.height) || 0) - 8));

      return {
        type: 'text',
        attrs: {
          x,
          y,
          text,
          align,
          baseline: 'middle'
        },
        styles: {
          color: textStyle.color,
          size: textStyle.size,
          weight: textStyle.weight,
          family: textStyle.family,
          style: textStyle.style,
          borderStyle: textStyle.borderStyle,
          borderDashedValue: [...textStyle.borderDashedValue],
          borderSize: textStyle.borderSize,
          borderColor: textStyle.borderColor,
          borderRadius: textStyle.borderRadius,
          backgroundColor: toneColor,
          paddingLeft: textStyle.paddingLeft,
          paddingRight: textStyle.paddingRight,
          paddingTop: textStyle.paddingTop,
          paddingBottom: textStyle.paddingBottom
        },
        ignoreEvent: true
      };
    }
  });
};
