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
  type MutableRefObject,
} from "react";

const TRAINER_AGGREGATION_CACHE_MAX_ENTRIES = 36;
const TRAINER_AGGREGATION_TAIL_CACHE_MAX_ENTRIES = 24;

type UseRuntimeTrainerAggregationCacheArgs = {
  barsRef: MutableRefObject<ReplayBar[]>;
  barsTsMsRef: MutableRefObject<number[]>;
  trainerAggregationCacheRef: MutableRefObject<
    Map<string, AggregationCacheEntry>
  >;
  trainerAggregationTailCacheRef: MutableRefObject<
    Map<string, AggregationCacheEntry>
  >;
  barsTimeZone?: string | null;
};

const trimCacheMap = <T>(cache: Map<string, T>, maxEntries: number): void => {
  while (cache.size > maxEntries) {
    const oldestCacheKey = cache.keys().next().value;
    if (!oldestCacheKey) {
      break;
    }
    cache.delete(oldestCacheKey);
  }
};

const toRawIndex = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.floor(numeric));
};

const resolveTimestampMsByIndex = (
  bars: ReplayBar[],
  barsTsMs: readonly number[],
): readonly number[] =>
  barsTsMs.length === bars.length ? barsTsMs : buildReplayBarTimestampMs(bars);

export const useRuntimeTrainerAggregationCache = ({
  barsRef,
  barsTsMsRef,
  trainerAggregationCacheRef,
  trainerAggregationTailCacheRef,
  barsTimeZone,
}: UseRuntimeTrainerAggregationCacheArgs) =>
  useCallback(
    (
      period: DisplayPeriodKey,
      startRawIndex: number,
      endRawIndex: number,
    ): AggregatedBarItem[] => {
      const sourceBars = barsRef.current;
      if (!sourceBars.length || endRawIndex < startRawIndex) {
        return [];
      }
      const start = clamp(Math.floor(startRawIndex), 0, sourceBars.length - 1);
      const end = clamp(Math.floor(endRawIndex), start, sourceBars.length - 1);
      const timeZoneKey = String(barsTimeZone || "");
      const displayFrameCacheKey = `display|${period}|${start}|${end}`;
      const directCached =
        trainerAggregationCacheRef.current.get(displayFrameCacheKey);
      if (directCached) {
        return directCached.items;
      }

      const frameItems: AggregatedBarItem[] = [];
      let canUseDisplayFrameItems = true;
      for (let index = start; index <= end; index += 1) {
        const bar = sourceBars[index];
        if (
          !bar ||
          bar.displayPeriod !== period ||
          !Number.isFinite(Number(bar.displayIndex)) ||
          !Number.isFinite(Number(bar.startRawIndex)) ||
          !Number.isFinite(Number(bar.endRawIndex))
        ) {
          canUseDisplayFrameItems = false;
          break;
        }
        const timestampMs = barsTsMsRef.current[index] ?? Date.parse(bar.ts);
        frameItems.push({
          bucketStartMs: Number.isFinite(timestampMs) ? timestampMs : 0,
          startRawIndex: Math.max(0, Math.floor(Number(bar.startRawIndex) || 0)),
          endRawIndex: Math.max(
            Math.max(0, Math.floor(Number(bar.startRawIndex) || 0)),
            Math.floor(Number(bar.endRawIndex) || 0),
          ),
          ts: bar.ts,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        });
      }
      if (canUseDisplayFrameItems) {
        const cachedEntry: AggregationCacheEntry = {
          period,
          start,
          end,
          items: frameItems,
        };
        trainerAggregationCacheRef.current.set(
          displayFrameCacheKey,
          cachedEntry,
        );
        trimCacheMap(
          trainerAggregationCacheRef.current,
          TRAINER_AGGREGATION_CACHE_MAX_ENTRIES,
        );
        return frameItems;
      }

      let canUseRawWindowAggregation = true;
      for (let index = start; index <= end; index += 1) {
        const bar = sourceBars[index];
        const startIndex = toRawIndex(bar?.startRawIndex);
        const endIndex = toRawIndex(bar?.endRawIndex);
        if (
          !bar ||
          startIndex === null ||
          endIndex === null ||
          startIndex !== endIndex
        ) {
          canUseRawWindowAggregation = false;
          break;
        }
      }
      if (!canUseRawWindowAggregation) {
        return [];
      }

      const rawCacheKey = `raw|${timeZoneKey}|${period}|${start}|${end}`;
      const rawCached = trainerAggregationCacheRef.current.get(rawCacheKey);
      if (rawCached) {
        return rawCached.items;
      }

      const timestamps = resolveTimestampMsByIndex(
        sourceBars,
        barsTsMsRef.current,
      );
      const tailCacheKey = `raw-tail|${timeZoneKey}|${period}|${start}`;
      const tailCached =
        trainerAggregationTailCacheRef.current.get(tailCacheKey);
      const canUseTailSeed =
        Boolean(tailCached) &&
        tailCached?.period === period &&
        tailCached.start === start &&
        tailCached.end >= start &&
        tailCached.end < end;
      const seedItems = canUseTailSeed ? tailCached?.items : undefined;
      const aggregateStart = canUseTailSeed
        ? Math.min(end, (tailCached?.end ?? start) + 1)
        : start;
      const items = aggregateBarsByPeriodCore(
        sourceBars,
        period,
        aggregateStart,
        end,
        timestamps,
        seedItems,
        barsTimeZone ?? undefined,
      );
      const cachedEntry: AggregationCacheEntry = {
        period,
        start,
        end,
        items,
      };
      trainerAggregationCacheRef.current.set(rawCacheKey, cachedEntry);
      trainerAggregationTailCacheRef.current.set(tailCacheKey, cachedEntry);
      trimCacheMap(
        trainerAggregationCacheRef.current,
        TRAINER_AGGREGATION_CACHE_MAX_ENTRIES,
      );
      trimCacheMap(
        trainerAggregationTailCacheRef.current,
        TRAINER_AGGREGATION_TAIL_CACHE_MAX_ENTRIES,
      );
      return items;
    },
    [
      barsTimeZone,
      barsRef,
      barsTsMsRef,
      trainerAggregationCacheRef,
      trainerAggregationTailCacheRef,
    ],
  );
