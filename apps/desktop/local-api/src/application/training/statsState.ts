// SPDX-License-Identifier: GPL-3.0-only

import { normalizeIsoDate, normalizeTimeframe, type TrainingStatsFilters } from '../../domain/training/statsDomain.js';

const STATS_REPORT_CACHE_TTL_MS = 60_000;
const STATS_REPORT_CACHE_MAX = 32;

const trainingStatsReportCache = new Map<string, { expiresAt: number; payload: unknown }>();
let trainingStatsAggregatesDirty = true;
let trainingStatsDerivedVersion = 0;

export const isTrainingStatsAggregatesDirty = (): boolean => trainingStatsAggregatesDirty;

export const setTrainingStatsAggregatesDirty = (next: boolean): void => {
  trainingStatsAggregatesDirty = next;
};

export const getTrainingStatsDerivedVersion = (): number => trainingStatsDerivedVersion;

export const clearTrainingStatsReportCache = (): void => {
  trainingStatsReportCache.clear();
};

export const buildTrainingStatsReportCacheKey = (filters: TrainingStatsFilters): string =>
  JSON.stringify({
    version: trainingStatsDerivedVersion,
    from: normalizeIsoDate(filters.from ?? '', false),
    to: normalizeIsoDate(filters.to ?? '', true),
    samplePoolId: (filters.samplePoolId || '').trim() || '__all__',
    symbol: (filters.symbol || '').trim().toUpperCase() || '__all__',
    timeframe: normalizeTimeframe((filters.timeframe || '').trim() || '__all__'),
    tag: (filters.tag || '').trim().toLowerCase(),
    profitability: filters.profitability ?? 'ALL',
    comparePoolA: (filters.comparePoolA || '').trim(),
    comparePoolB: (filters.comparePoolB || '').trim()
  });

export const getCachedTrainingStatsReport = (key: string): unknown | null => {
  const cached = trainingStatsReportCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    trainingStatsReportCache.delete(key);
    return null;
  }
  trainingStatsReportCache.delete(key);
  trainingStatsReportCache.set(key, cached);
  return cached.payload;
};

export const setCachedTrainingStatsReport = (key: string, payload: unknown): void => {
  const now = Date.now();
  for (const [cacheKey, item] of trainingStatsReportCache.entries()) {
    if (item.expiresAt <= now) {
      trainingStatsReportCache.delete(cacheKey);
    }
  }
  if (trainingStatsReportCache.size >= STATS_REPORT_CACHE_MAX) {
    const oldest = trainingStatsReportCache.keys().next();
    if (!oldest.done) {
      trainingStatsReportCache.delete(oldest.value);
    }
  }
  trainingStatsReportCache.set(key, { expiresAt: now + STATS_REPORT_CACHE_TTL_MS, payload });
};

export const markTrainingStatsDerivedDirty = (): void => {
  trainingStatsAggregatesDirty = true;
  trainingStatsDerivedVersion += 1;
};
