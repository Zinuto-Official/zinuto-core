// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "@/domains/chart/replayAggregation";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import { clamp } from "@/frontend-kernel/math";
import {
  type AggregationCacheEntry
} from "@/frontend-kernel/appTypes";
import {
  aggregateBarsByPeriodCore,
  buildReplayBarTimestampMs,
} from "@/domains/chart/replayAggregation";
import {
  useCallback,
  useEffect,
  useRef,
} from "react";

type UseSpecialTrainingAggregationCacheArgs = {
  enabled: boolean;
  questionId: string;
  bars: ReplayBar[];
  baseTimeframe?: string | null;
  barsTimeZone: string | null;
};

type SpecialTrainingAggregationCacheState = {
  enabled: boolean;
  questionId: string;
  bars: ReplayBar[] | null;
  barsIdentity: number;
  barsLength: number;
  baseTimeframeKey: string;
  timeZoneKey: string;
  timestamps: number[];
  aggregationCache: Map<string, AggregationCacheEntry>;
  aggregationTailCache: Map<string, AggregationCacheEntry>;
};

const MAX_SPECIAL_TRAINING_AGGREGATION_CACHE_ENTRIES = 36;
const MAX_SPECIAL_TRAINING_AGGREGATION_TAIL_CACHE_ENTRIES = 24;

let nextSpecialTrainingBarsIdentity = 1;
const specialTrainingBarsIdentityByRef = new WeakMap<ReplayBar[], number>();

const resolveSpecialTrainingBarsIdentity = (bars: ReplayBar[]): number => {
  const cached = specialTrainingBarsIdentityByRef.get(bars);
  if (cached) {
    return cached;
  }
  const next = nextSpecialTrainingBarsIdentity;
  nextSpecialTrainingBarsIdentity += 1;
  specialTrainingBarsIdentityByRef.set(bars, next);
  return next;
};

const clearSpecialTrainingAggregationCache = (
  cache: SpecialTrainingAggregationCacheState,
) => {
  cache.timestamps = [];
  cache.aggregationCache.clear();
  cache.aggregationTailCache.clear();
};

export const useSpecialTrainingAggregationCache = ({
  enabled,
  questionId,
  bars,
  baseTimeframe,
  barsTimeZone,
}: UseSpecialTrainingAggregationCacheArgs) => {
  const cacheRef = useRef<SpecialTrainingAggregationCacheState>({
    enabled: false,
    questionId: "",
    bars: null,
    barsIdentity: 0,
    barsLength: 0,
    baseTimeframeKey: "",
    timeZoneKey: "",
    timestamps: [],
    aggregationCache: new Map(),
    aggregationTailCache: new Map(),
  });

  const ensureCacheScope = useCallback(() => {
    const cache = cacheRef.current;
    const normalizedQuestionId = String(questionId || "").trim();
    const nextBars = enabled ? bars : null;
    const nextBarsIdentity = enabled && bars.length
      ? resolveSpecialTrainingBarsIdentity(bars)
      : 0;
    const nextBaseTimeframeKey = enabled ? String(baseTimeframe ?? "") : "";
    const nextQuestionId = enabled ? normalizedQuestionId : "";
    const nextTimeZoneKey = enabled ? String(barsTimeZone ?? "") : "";
    const scopeChanged =
      cache.enabled !== enabled ||
      cache.questionId !== nextQuestionId ||
      cache.bars !== nextBars ||
      cache.barsIdentity !== nextBarsIdentity ||
      cache.barsLength !== (enabled ? bars.length : 0) ||
      cache.baseTimeframeKey !== nextBaseTimeframeKey ||
      cache.timeZoneKey !== nextTimeZoneKey;

    if (!scopeChanged) {
      return cache;
    }

    cache.enabled = enabled;
    cache.questionId = nextQuestionId;
    cache.bars = nextBars;
    cache.barsIdentity = nextBarsIdentity;
    cache.barsLength = enabled ? bars.length : 0;
    cache.baseTimeframeKey = nextBaseTimeframeKey;
    cache.timeZoneKey = nextTimeZoneKey;
    clearSpecialTrainingAggregationCache(cache);
    return cache;
  }, [bars, barsTimeZone, baseTimeframe, enabled, questionId]);

  useEffect(() => {
    ensureCacheScope();
  }, [ensureCacheScope]);

  return useCallback(
    (
      period: DisplayPeriodKey,
      startRawIndex: number,
      endRawIndex: number,
    ): AggregatedBarItem[] => {
      const cache = ensureCacheScope();
      const sourceBars = cache.bars;
      if (!cache.enabled || !sourceBars?.length || endRawIndex < startRawIndex) {
        return [];
      }

      if (cache.timestamps.length !== sourceBars.length) {
        cache.timestamps = buildReplayBarTimestampMs(sourceBars);
      }

      const start = clamp(Math.floor(startRawIndex), 0, sourceBars.length - 1);
      const end = clamp(Math.floor(endRawIndex), start, sourceBars.length - 1);
      const cacheKey = [
        cache.questionId,
        cache.barsIdentity,
        cache.baseTimeframeKey,
        cache.timeZoneKey,
        period,
        start,
        end,
      ].join("|");
      const directCached = cache.aggregationCache.get(cacheKey);
      if (directCached) {
        return directCached.items;
      }

      const tailCacheKey = [
        cache.questionId,
        cache.barsIdentity,
        cache.baseTimeframeKey,
        cache.timeZoneKey,
        period,
        start,
      ].join("|");
      const tailCached = cache.aggregationTailCache.get(tailCacheKey);
      let items: AggregatedBarItem[];
      if (tailCached && tailCached.end < end) {
        items = aggregateBarsByPeriodCore(
          sourceBars,
          period,
          tailCached.end + 1,
          end,
          cache.timestamps,
          tailCached.items,
          cache.timeZoneKey || undefined,
        );
      } else {
        items = aggregateBarsByPeriodCore(
          sourceBars,
          period,
          start,
          end,
          cache.timestamps,
          undefined,
          cache.timeZoneKey || undefined,
        );
      }

      const cachedEntry: AggregationCacheEntry = {
        period,
        start,
        end,
        items,
      };
      cache.aggregationCache.set(cacheKey, cachedEntry);

      const previousTail = cache.aggregationTailCache.get(tailCacheKey);
      if (!previousTail || previousTail.end < end) {
        cache.aggregationTailCache.set(tailCacheKey, cachedEntry);
      }

      if (
        cache.aggregationCache.size >
        MAX_SPECIAL_TRAINING_AGGREGATION_CACHE_ENTRIES
      ) {
        const oldestCacheKey = cache.aggregationCache.keys().next().value;
        if (oldestCacheKey) {
          cache.aggregationCache.delete(oldestCacheKey);
        }
      }
      if (
        cache.aggregationTailCache.size >
        MAX_SPECIAL_TRAINING_AGGREGATION_TAIL_CACHE_ENTRIES
      ) {
        const oldestTailKey =
          cache.aggregationTailCache.keys().next().value;
        if (oldestTailKey) {
          cache.aggregationTailCache.delete(oldestTailKey);
        }
      }

      return items;
    },
    [ensureCacheScope],
  );
};
