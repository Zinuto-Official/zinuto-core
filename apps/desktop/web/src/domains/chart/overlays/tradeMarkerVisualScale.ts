// SPDX-License-Identifier: GPL-3.0-only

import { getGlobalTypographyReferencePx } from '@/frontend-kernel/typography';

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export const resolveTradeMarkerVisualScale = ({
  compact,
  visibleBarPixelWidth
}: {
  compact: boolean;
  visibleBarPixelWidth: number;
}): {
  markerScale: number;
  detailScale: number;
  primaryTextSize: number;
  secondaryTextSize: number;
} => {
  const normalizedBarWidth = Number.isFinite(visibleBarPixelWidth) && visibleBarPixelWidth > 0 ? visibleBarPixelWidth : 0;
  const compactMarkerScale = clamp(normalizedBarWidth / 12, 0.62, 1);
  const compactDetailScale = clamp(normalizedBarWidth / 14, 0.66, 1);
  const detailScale = compact ? compactDetailScale : clamp(normalizedBarWidth / 10, 1, 1.32);
  const markerScale = compact ? compactMarkerScale : clamp(normalizedBarWidth / 10, 1, 1.3);
  const typographyScale = getGlobalTypographyReferencePx("r2") / 12;
  return {
    markerScale,
    detailScale,
    primaryTextSize: compact
      ? Math.max(8, Math.round(10 * detailScale * typographyScale))
      : Math.max(10, Math.round(10 * detailScale * typographyScale)),
    secondaryTextSize: compact
      ? Math.max(7, Math.round(9 * detailScale * typographyScale))
      : Math.max(9, Math.round(9 * detailScale * typographyScale))
  };
};
