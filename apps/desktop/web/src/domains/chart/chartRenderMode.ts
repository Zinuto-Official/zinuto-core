// SPDX-License-Identifier: GPL-3.0-only

import type { CandleType } from 'klinecharts';

export const CHART_RENDER_MODES = ['CANDLE', 'LINE', 'OHLC'] as const;

export type ChartRenderMode = (typeof CHART_RENDER_MODES)[number];

const DEFAULT_CHART_RENDER_MODE: ChartRenderMode = 'CANDLE';

const CANDLE_TYPE_BY_RENDER_MODE: Record<ChartRenderMode, CandleType> = {
  CANDLE: 'candle_solid',
  LINE: 'area',
  OHLC: 'ohlc'
};

export const normalizeChartRenderMode = (value: unknown): ChartRenderMode => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'LINE') {
    return 'LINE';
  }
  if (normalized === 'OHLC') {
    return 'OHLC';
  }
  return DEFAULT_CHART_RENDER_MODE;
};

export const resolveKlineCandleTypeByRenderMode = (mode: ChartRenderMode): CandleType => {
  const normalized = normalizeChartRenderMode(mode);
  return CANDLE_TYPE_BY_RENDER_MODE[normalized];
};
