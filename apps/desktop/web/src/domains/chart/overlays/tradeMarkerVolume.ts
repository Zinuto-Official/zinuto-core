// SPDX-License-Identifier: GPL-3.0-only

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const SUBSCRIPT_DIGIT_MAP: Record<string, string> = Object.freeze({
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉'
});

const toSubscriptDigits = (value: number): string => {
  const normalized = Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
  return String(normalized)
    .split('')
    .map((digit) => SUBSCRIPT_DIGIT_MAP[digit] ?? digit)
    .join('');
};

const parseHexColor = (value: string): { r: number; g: number; b: number } | null => {
  const raw = String(value || '').trim();
  if (!raw.startsWith('#')) {
    return null;
  }
  const hex = raw.slice(1);
  const normalized =
    hex.length === 3
      ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
      : hex.length === 6
        ? hex
        : '';
  if (!normalized) {
    return null;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }
  return { r, g, b };
};

const toRgba = (color: string, alpha: number): string => {
  const parsed = parseHexColor(color);
  if (!parsed) {
    return color;
  }
  const normalizedAlpha = clamp(alpha, 0, 1);
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${normalizedAlpha})`;
};

export type TradeMarkerVolumeVisual = {
  lotCount: number;
  sideLabel: 'B' | 'S';
  sideLabelWithSubscript: string;
  lotSubscriptText: string;
  intensity: number;
  markerScaleBoost: number;
  colorAlpha: number;
};

export const resolveTradeMarkerVolumeVisual = ({
  side,
  lots
}: {
  side: 'BUY' | 'SELL';
  lots: number;
}): TradeMarkerVolumeVisual => {
  const lotCountRaw = Number(lots);
  const lotCount = Number.isFinite(lotCountRaw) && lotCountRaw > 0
    ? Math.max(1, Math.round(lotCountRaw))
    : 1;
  const sideLabel: 'B' | 'S' = side === 'SELL' ? 'S' : 'B';
  const intensity = clamp(Math.log2(lotCount) / Math.log2(8), 0, 1);
  const markerScaleBoost = 0.92 + intensity * 0.2;
  const colorAlpha = 0.74 + intensity * 0.26;
  const lotSubscriptText = toSubscriptDigits(lotCount);
  return {
    lotCount,
    sideLabel,
    sideLabelWithSubscript: `${sideLabel}${lotSubscriptText}`,
    lotSubscriptText,
    intensity,
    markerScaleBoost,
    colorAlpha
  };
};

export const applyTradeMarkerVolumeTone = (color: string, visual: TradeMarkerVolumeVisual): string =>
  toRgba(color, visual.colorAlpha);
