// SPDX-License-Identifier: GPL-3.0-only

import {
  type ApiChallengeStatsProjectDetail,
  type ApiTrainingStatsReport,
} from "@/api";
import {
  ALL_VALUE,
  buildInitialFilters,
  ensureDateInput,
  normalizeStatsComparePoolValue,
  normalizeStatsSamplePoolFilterValue,
  type StatsFilterState,
} from "@/workspaces/challenge-stats/statsFilters";
import {
  CHALLENGE_STATS_DEFAULT_TAG,
} from "@/workspaces/challenge-stats/challengeStatsModeRegistry";

export type TrainingStatsPageViewMode = "training" | "challenge";

export type StatsViewCacheEntry = {
  pendingFilters: StatsFilterState;
  filters: StatsFilterState;
  report: ApiTrainingStatsReport | null;
  challengeDetailsById: Record<string, ApiChallengeStatsProjectDetail>;
  filtersKey: string;
  selectedSessionId: string;
};

export const cloneStatsFilters = (
  value: StatsFilterState,
): StatsFilterState => ({
  ...value,
});

export const buildInitialFiltersByViewMode = (
  viewMode: TrainingStatsPageViewMode,
): StatsFilterState => {
  const next = buildInitialFilters();
  if (viewMode === "challenge") {
    next.tag = CHALLENGE_STATS_DEFAULT_TAG;
  }
  return next;
};

const createStatsViewCacheEntry = (
  viewMode: TrainingStatsPageViewMode,
): StatsViewCacheEntry => {
  const initial = buildInitialFiltersByViewMode(viewMode);
  return {
    pendingFilters: cloneStatsFilters(initial),
    filters: cloneStatsFilters(initial),
    report: null,
    challengeDetailsById: {},
    filtersKey: "",
    selectedSessionId: "",
  };
};

const cloneStatsViewCacheEntry = (
  entry: StatsViewCacheEntry,
): StatsViewCacheEntry => ({
  pendingFilters: cloneStatsFilters(entry.pendingFilters),
  filters: cloneStatsFilters(entry.filters),
  report: entry.report,
  challengeDetailsById: { ...entry.challengeDetailsById },
  filtersKey: entry.filtersKey,
  selectedSessionId: entry.selectedSessionId,
});

const sharedStatsViewCache: Record<
  TrainingStatsPageViewMode,
  StatsViewCacheEntry
> = {
  training: createStatsViewCacheEntry("training"),
  challenge: createStatsViewCacheEntry("challenge"),
};

const statsViewPrefetchTaskCache = new Map<string, Promise<void>>();

export const buildStatsApiFilters = (nextFilters: StatsFilterState) => {
  const normalizedSamplePoolId = normalizeStatsSamplePoolFilterValue(
    nextFilters.samplePoolId,
  );
  const normalizedComparePoolA = normalizeStatsComparePoolValue(
    nextFilters.comparePoolA,
  );
  const normalizedComparePoolB = normalizeStatsComparePoolValue(
    nextFilters.comparePoolB,
  );
  return {
    from: ensureDateInput(nextFilters.from) || undefined,
    to: ensureDateInput(nextFilters.to) || undefined,
    samplePoolId:
      normalizedSamplePoolId !== ALL_VALUE
        ? normalizedSamplePoolId
        : undefined,
    symbol: nextFilters.symbol !== ALL_VALUE ? nextFilters.symbol : undefined,
    timeframe:
      nextFilters.timeframe !== ALL_VALUE ? nextFilters.timeframe : undefined,
    tag: nextFilters.tag.trim() || undefined,
    profitability: nextFilters.profitability,
    comparePoolA: normalizedComparePoolA || undefined,
    comparePoolB: normalizedComparePoolB || undefined,
  };
};

export const buildStatsFiltersCacheKey = (
  nextFilters: StatsFilterState,
): string => JSON.stringify(buildStatsApiFilters(nextFilters));

export const resolveNextSelectedSessionId = (
  current: string,
  nextReport: ApiTrainingStatsReport,
): string => {
  if (
    current &&
    nextReport.recentSessions.some((item) => item.id === current)
  ) {
    return current;
  }
  return nextReport.recentSessions[0]?.id ?? "";
};

export const readSharedStatsViewCacheEntry = (
  viewMode: TrainingStatsPageViewMode,
): StatsViewCacheEntry => cloneStatsViewCacheEntry(sharedStatsViewCache[viewMode]);

export const updateSharedStatsViewCacheEntry = (
  viewMode: TrainingStatsPageViewMode,
  patch: Partial<StatsViewCacheEntry>,
): void => {
  sharedStatsViewCache[viewMode] = {
    ...sharedStatsViewCache[viewMode],
    ...patch,
    pendingFilters: patch.pendingFilters
      ? cloneStatsFilters(patch.pendingFilters)
      : sharedStatsViewCache[viewMode].pendingFilters,
    filters: patch.filters
      ? cloneStatsFilters(patch.filters)
      : sharedStatsViewCache[viewMode].filters,
    challengeDetailsById: patch.challengeDetailsById
      ? { ...patch.challengeDetailsById }
      : sharedStatsViewCache[viewMode].challengeDetailsById,
  };
};

export const resetSharedStatsViewCache = (
  viewMode?: TrainingStatsPageViewMode,
): void => {
  const targetModes = viewMode ? [viewMode] : (["training", "challenge"] as const);
  targetModes.forEach((mode) => {
    sharedStatsViewCache[mode] = createStatsViewCacheEntry(mode);
  });
  Array.from(statsViewPrefetchTaskCache.keys()).forEach((key) => {
    if (!viewMode || key.startsWith(`${viewMode}:`)) {
      statsViewPrefetchTaskCache.delete(key);
    }
  });
};

const buildStatsViewTaskKey = (
  viewMode: TrainingStatsPageViewMode,
  cacheKey: string,
): string => `${viewMode}:${cacheKey}`;

export const readStatsViewPrefetchTask = (
  viewMode: TrainingStatsPageViewMode,
  cacheKey: string,
): Promise<void> | undefined =>
  statsViewPrefetchTaskCache.get(buildStatsViewTaskKey(viewMode, cacheKey));

export const writeStatsViewPrefetchTask = (
  viewMode: TrainingStatsPageViewMode,
  cacheKey: string,
  task: Promise<void>,
): void => {
  statsViewPrefetchTaskCache.set(buildStatsViewTaskKey(viewMode, cacheKey), task);
};

export const clearStatsViewPrefetchTask = (
  viewMode: TrainingStatsPageViewMode,
  cacheKey: string,
): void => {
  statsViewPrefetchTaskCache.delete(buildStatsViewTaskKey(viewMode, cacheKey));
};
