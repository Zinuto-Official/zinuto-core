// SPDX-License-Identifier: GPL-3.0-only

import { type AppDisplayPeriodKey } from '@/ui/config/uiConfig';

export type BaseTimeframe = '1m' | '5m' | '1h' | '1d';
export type DisplayPeriodKey = AppDisplayPeriodKey;
export type KlinePeriod = {
  type: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  span: number;
};

export const PERIOD_OPTIONS_BY_BASE_TIMEFRAME: Record<BaseTimeframe, DisplayPeriodKey[]> = {
  '1m': ['1m', '5m', '1h', '1d'],
  '5m': ['5m', '1h', '1d', '1w'],
  '1h': ['1h', '1d', '1w', '1month'],
  '1d': ['1d', '1w', '1month', '1year']
};

export const DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE: Record<BaseTimeframe, DisplayPeriodKey[]> = {
  '1m': ['1m', '5m', '1h', '1d'],
  '5m': ['5m', '1h', '1d', '1w'],
  '1h': ['1h', '1d', '1w', '1month'],
  '1d': ['1d', '1w', '1month', '1year']
};

export const DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE: Record<BaseTimeframe, DisplayPeriodKey> = {
  '1m': '1m',
  '5m': '5m',
  '1h': '1h',
  '1d': '1d'
};

export const toKlinePeriod = (period: DisplayPeriodKey): KlinePeriod => {
  switch (period) {
    case '1m':
      return { type: 'minute', span: 1 };
    case '5m':
      return { type: 'minute', span: 5 };
    case '1h':
      return { type: 'hour', span: 1 };
    case '1w':
      return { type: 'week', span: 1 };
    case '1month':
      return { type: 'month', span: 1 };
    case '1year':
      return { type: 'year', span: 1 };
    case '1d':
    default:
      return { type: 'day', span: 1 };
  }
};
