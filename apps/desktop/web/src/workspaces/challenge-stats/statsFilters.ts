// SPDX-License-Identifier: GPL-3.0-only

export type StatsFilterState = {
  from: string;
  to: string;
  samplePoolId: string;
  symbol: string;
  timeframe: string;
  tag: string;
  profitability: 'ALL' | 'PROFIT' | 'LOSS';
  comparePoolA: string;
  comparePoolB: string;
};

export const ALL_VALUE = '__all__';
export const SAMPLE_POOL_ALL_TOKEN = '__sample_pool_all__';
export const SAMPLE_POOL_UNKNOWN_TOKEN = '__sample_pool_unknown__';

export const normalizeStatsSamplePoolFilterValue = (value: string): string => {
  const normalized = (value || '').trim();
  if (!normalized) {
    return ALL_VALUE;
  }
  const normalizedLower = normalized.toLowerCase();
  if (normalizedLower === ALL_VALUE || normalizedLower === SAMPLE_POOL_ALL_TOKEN) {
    return ALL_VALUE;
  }
  return normalized;
};

export const normalizeStatsComparePoolValue = (value: string): string => {
  const normalized = normalizeStatsSamplePoolFilterValue(value);
  return normalized === ALL_VALUE ? '' : normalized;
};

export const buildInitialFilters = (): StatsFilterState => ({
  from: '',
  to: '',
  samplePoolId: ALL_VALUE,
  symbol: ALL_VALUE,
  timeframe: ALL_VALUE,
  tag: '',
  profitability: 'ALL',
  comparePoolA: '',
  comparePoolB: ''
});

export const ensureDateInput = (value: string): string => {
  const text = (value || '').trim();
  if (!text) {
    return '';
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};
