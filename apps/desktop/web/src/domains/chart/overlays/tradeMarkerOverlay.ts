// SPDX-License-Identifier: GPL-3.0-only

import { getOverlayClass, registerOverlay } from 'klinecharts';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import { SYSTEM_COLOR_TOKENS } from '@/ui/theme/visual/systemColorTokens';
import { resolveTradeVisualThemePalette } from '@/ui/theme/visualColors';
import { formatMoney } from '@/ui/formatting/format';
import { SYSTEM_TRADE_MARKER_OVERLAY_NAME } from '@/domains/chart/overlays/constants';
import { OVERLAY_IGNORED_EVENTS, TRADE_MARKER_LAYOUT } from '@/domains/chart/overlays/overlayTokens';
import { applyTradeMarkerVolumeTone, resolveTradeMarkerVolumeVisual } from '@/domains/chart/overlays/tradeMarkerVolume';
import { resolveTradeMarkerVisualScale } from '@/domains/chart/overlays/tradeMarkerVisualScale';
import { resolveSingleBarPixelWidth } from '@/domains/chart/overlays/tradeMarkerViewport';

type TradeMarkerExtendData = {
  side: 'BUY' | 'SELL' | 'MIXED';
  price?: number;
  lots?: number;
  spent?: number;
  received?: number;
  compact?: boolean;
  compactCount?: number;
  compactLabel?: string;
  aggregated?: boolean;
  labelOnly?: boolean;
  labelOffsetX?: number;
  labelOffsetY?: number;
  forceDirection?: 1 | -1;
  hidden?: boolean;
};

export const registerTradeMarkerOverlay = (): void => {
  if (getOverlayClass(SYSTEM_TRADE_MARKER_OVERLAY_NAME)) {
    return;
  }

  registerOverlay<TradeMarkerExtendData>({
    name: SYSTEM_TRADE_MARKER_OVERLAY_NAME,
    totalStep: 1,
    createPointFigures: ({ chart, overlay, coordinates, bounding }) => {
      if (overlay.extendData?.hidden) {
        return [];
      }

      const point = coordinates?.[0];
      if (!point) {
        return [];
      }

      const anchorX = Number(point.x);
      const anchorY = Number(point.y);
      if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
        return [];
      }

      const side: 'BUY' | 'SELL' | 'MIXED' =
        overlay.extendData?.side === 'SELL'
          ? 'SELL'
          : overlay.extendData?.side === 'MIXED'
            ? 'MIXED'
            : 'BUY';
      const isBuy = side === 'BUY';
      const isSell = side === 'SELL';
      const tradeVisual = resolveTradeVisualThemePalette();
      const color = isBuy
        ? tradeVisual.buyMarker
        : isSell
          ? tradeVisual.sellMarker
          : tradeVisual.positionLine;
      const compact = Boolean(overlay.extendData?.compact);
      const aggregated = Boolean(overlay.extendData?.aggregated);
      const labelOnly = aggregated || Boolean(overlay.extendData?.labelOnly);
      const labelOffsetXRaw = Number(overlay.extendData?.labelOffsetX);
      const labelOffsetYRaw = Number(overlay.extendData?.labelOffsetY);
      const labelOffsetX = Number.isFinite(labelOffsetXRaw) ? labelOffsetXRaw : 0;
      const labelOffsetY = Number.isFinite(labelOffsetYRaw) ? labelOffsetYRaw : 0;
      const forcedDirectionRaw = Number(overlay.extendData?.forceDirection);
      const forcedDirection: 1 | -1 | null =
        forcedDirectionRaw === 1 ? 1 : forcedDirectionRaw === -1 ? -1 : null;
      const price = Number(overlay.extendData?.price ?? 0);
      const lots = Number(overlay.extendData?.lots ?? 0);
      const markerVolumeVisual = resolveTradeMarkerVolumeVisual({
        side: isSell ? 'SELL' : 'BUY',
        lots
      });
      const detailColor = applyTradeMarkerVolumeTone(color, markerVolumeVisual);

      let visibleBarPixelWidth = 0;
      try {
        visibleBarPixelWidth = resolveSingleBarPixelWidth(chart.getBarSpace?.());
      } catch {
        visibleBarPixelWidth = 0;
      }
      const { markerScale: baseMarkerScale, primaryTextSize, secondaryTextSize } = resolveTradeMarkerVisualScale({
        compact,
        visibleBarPixelWidth
      });
      const markerScale = Math.max(0.58, baseMarkerScale * markerVolumeVisual.markerScaleBoost);
      const headSizePx = TRADE_MARKER_LAYOUT.headSizePx * markerScale;
      const stemLenPx = TRADE_MARKER_LAYOUT.stemLenPx * markerScale;
      const headHalfWidth = TRADE_MARKER_LAYOUT.headHalfWidth * markerScale;
      const labelGapPx = TRADE_MARKER_LAYOUT.labelGapPx * markerScale;
      const lineGapPx = TRADE_MARKER_LAYOUT.lineGapPx * markerScale;
      const minPadding = TRADE_MARKER_LAYOUT.minPadding * markerScale;
      const primaryLabelSize = compact ? Math.max(8, primaryTextSize) : primaryTextSize;
      const secondaryLabelSize = compact ? Math.max(7, secondaryTextSize) : secondaryTextSize;
      const markerLineSize = compact ? Math.max(0.95, 1.7 * markerScale) : 1.8;

      const priceLine = Number.isFinite(price) && price > 0 ? formatMoney(price, 3) : tt('appText.message0367');
      const compactCustomLabelRaw = String(overlay.extendData?.compactLabel ?? '').trim();
      const normalizedMarkerLabel = compactCustomLabelRaw.length > 0
        ? compactCustomLabelRaw
        : markerVolumeVisual.sideLabelWithSubscript;
      const compactMainLabel = compactCustomLabelRaw.length > 0
        ? compactCustomLabelRaw.slice(0, 1)
        : markerVolumeVisual.sideLabel;
      const compactSubLabel = compactCustomLabelRaw.length > 1
        ? compactCustomLabelRaw.slice(1)
        : markerVolumeVisual.lotSubscriptText;
      const textLines = labelOnly ? [normalizedMarkerLabel] : compact ? [compactMainLabel] : [normalizedMarkerLabel, priceLine];
      const textSpanPx = textLines.length > 0
        ? labelGapPx + (textLines.length - 1) * lineGapPx
        : 0;

      const markerSpanPx =
        headSizePx +
        stemLenPx +
        textSpanPx;
      const paneHeightRaw = Number(bounding?.height);
      let paneHeight = Number.isFinite(paneHeightRaw) && paneHeightRaw > 0 ? paneHeightRaw : null;
      if (paneHeight === null) {
        try {
          const fallbackHeightRaw = Number(chart.getSize?.()?.height);
          if (Number.isFinite(fallbackHeightRaw) && fallbackHeightRaw > 0) {
            paneHeight = fallbackHeightRaw;
          }
        } catch {
          paneHeight = null;
        }
      }
      const preferredDir: 1 | -1 = isSell ? -1 : 1;
      const canPlaceDown =
        paneHeight === null ? true : anchorY <= paneHeight - markerSpanPx - minPadding;
      const canPlaceUp = paneHeight === null ? true : anchorY >= markerSpanPx + minPadding;
      const dir: 1 | -1 =
        forcedDirection ??
        (preferredDir === 1
          ? canPlaceDown
            ? 1
            : canPlaceUp
              ? -1
              : 1
          : canPlaceUp
            ? -1
            : canPlaceDown
              ? 1
              : -1);

      let tipY = anchorY;
      if (paneHeight !== null) {
        if (dir === 1) {
          const minTip = minPadding;
          const maxTip = paneHeight - markerSpanPx - minPadding;
          tipY = maxTip > minTip ? Math.min(Math.max(tipY, minTip), maxTip) : paneHeight * 0.5;
        } else {
          const minTip = markerSpanPx + minPadding;
          const maxTip = paneHeight - minPadding;
          tipY = maxTip > minTip ? Math.min(Math.max(tipY, minTip), maxTip) : paneHeight * 0.5;
        }
      }

      const headBaseY = tipY + dir * headSizePx;
      const shaftStartY = headBaseY + dir * stemLenPx;
      const leftHeadX = anchorX - headHalfWidth;
      const rightHeadX = anchorX + headHalfWidth;
      const lineYs = textLines.map((_, index) => {
        const visualIndex = dir === 1 ? index : textLines.length - 1 - index;
        return shaftStartY + dir * (labelGapPx + visualIndex * lineGapPx) + labelOffsetY;
      });

      const textFigures = lineYs.map((y, index) => ({
        type: 'text',
        attrs: {
          x: anchorX + labelOffsetX,
          y,
          text: textLines[index] ?? '',
          align: 'center',
          baseline: 'middle'
        },
        styles: {
          color: detailColor,
          size: index === 0 ? primaryLabelSize : secondaryLabelSize,
          weight: compact ? (index === 0 ? 740 : 690) : index === 0 ? 760 : 680,
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
      }));
      const compactSubscriptFigure =
        compact && !labelOnly && compactSubLabel
          ? {
              type: 'text' as const,
              attrs: {
                x: anchorX + labelOffsetX + Math.max(4, Math.round(primaryLabelSize * 0.44)),
                y: (lineYs[0] ?? shaftStartY + dir * labelGapPx) + Math.max(2, Math.round(primaryLabelSize * 0.28)),
                text: compactSubLabel,
                align: 'left',
                baseline: 'middle'
              },
              styles: {
                color: detailColor,
                size: Math.max(6, Math.round(primaryLabelSize * 0.58)),
                weight: 760,
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
              ignoreEvent: OVERLAY_IGNORED_EVENTS as unknown as string[]
            }
          : null;

      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: anchorX, y: shaftStartY },
              { x: anchorX, y: headBaseY }
            ]
          },
          styles: {
            style: 'solid',
            size: markerLineSize,
            color: detailColor,
            dashedValue: [0, 0],
            smooth: false
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        },
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: anchorX, y: tipY },
              { x: leftHeadX, y: headBaseY },
              { x: rightHeadX, y: headBaseY }
            ]
          },
          styles: {
            style: 'solid',
            color: detailColor
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        },
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: leftHeadX, y: headBaseY },
              { x: rightHeadX, y: headBaseY }
            ]
          },
          styles: {
            style: 'solid',
            size: markerLineSize,
            color: detailColor,
            dashedValue: [0, 0],
            smooth: false
          },
          ignoreEvent: OVERLAY_IGNORED_EVENTS as any
        },
        ...textFigures,
        ...(compactSubscriptFigure ? [compactSubscriptFigure] : [])
      ];
    }
  });
};
