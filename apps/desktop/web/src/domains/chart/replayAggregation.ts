// SPDX-License-Identifier: GPL-3.0-only

import type { AppDisplayPeriodKey } from '@/ui/config/uiConfig';
import {
  getNextTimeZonePeriodStartMs,
  getTimeZonePeriodStartMs
} from '@zinuto/shared/period';
import { parseTimestampMs } from '@zinuto/shared/marketTime';
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from '@zinuto/shared/timezone';
import { detectBaseTimeframeFromTimestamps, type BaseTimeframe } from '@zinuto/shared/timeframe';
import {
  getTradingCalendarPeriodStartMs,
  type TradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';

type ReplayBarLike = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  startRawIndex?: number;
  endRawIndex?: number;
};

export type AggregatedBarItem = {
  bucketStartMs: number;
  startRawIndex: number;
  endRawIndex: number;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ReplayStepMeta = {
  stepForCurrentClose: number;
  stepForNextOpen: number;
  nextOpenDelay: number;
};

const parseReplayBarTimestampMs = (bar: ReplayBarLike): number => parseTimestampMs(bar.ts);

const replayBarTimestampCache = new WeakMap<ReplayBarLike[], number[]>();

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveRawIndex = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numeric));
};

const cloneAggregatedBar = (item: AggregatedBarItem): AggregatedBarItem => ({
  bucketStartMs: item.bucketStartMs,
  startRawIndex: item.startRawIndex,
  endRawIndex: item.endRawIndex,
  ts: item.ts,
  open: item.open,
  high: item.high,
  low: item.low,
  close: item.close,
  volume: item.volume,
});

export const buildReplayBarTimestampMs = <T extends ReplayBarLike>(bars: T[]): number[] => {
  const cached = replayBarTimestampCache.get(bars);
  if (cached) {
    return cached;
  }
  const next = bars.map((bar) => parseReplayBarTimestampMs(bar));
  replayBarTimestampCache.set(bars, next);
  return next;
};

export const getPeriodStartMs = (
  timestampMs: number,
  period: AppDisplayPeriodKey,
  timeZone = DEFAULT_TIME_ZONE
): number => getTimeZonePeriodStartMs(timestampMs, period, normalizeTimeZone(timeZone));

const getNextPeriodStartMs = (
  periodStartMs: number,
  period: AppDisplayPeriodKey,
  timeZone = DEFAULT_TIME_ZONE
): number => getNextTimeZonePeriodStartMs(periodStartMs, period, normalizeTimeZone(timeZone));

export const aggregateBarsByPeriodCore = <T extends ReplayBarLike>(
  bars: T[],
  period: AppDisplayPeriodKey,
  startRawIndex = 0,
  endRawIndex = bars.length - 1,
  tsMsByIndex?: readonly number[],
  seedItems?: readonly AggregatedBarItem[],
  timeZone = DEFAULT_TIME_ZONE,
  tradingCalendar?: TradingCalendarConfig | null,
): AggregatedBarItem[] => {
  if (!bars.length || endRawIndex < startRawIndex) {
    return seedItems ? [...seedItems] : [];
  }

  const start = clamp(Math.floor(startRawIndex), 0, bars.length - 1);
  const end = clamp(Math.floor(endRawIndex), start, bars.length - 1);
  const result: AggregatedBarItem[] = seedItems ? [...seedItems] : [];
  let current: AggregatedBarItem | null = null;
  const normalizedTimeZone = normalizeTimeZone(timeZone);

  if (result.length) {
    const tail = result.pop();
    if (tail) {
      current = cloneAggregatedBar(tail);
    }
  }

  for (let index = start; index <= end; index += 1) {
    const bar = bars[index];
    const tsMs = tsMsByIndex?.[index] ?? parseReplayBarTimestampMs(bar);
    if (!Number.isFinite(tsMs)) {
      continue;
    }
    const bucketStartMs = tradingCalendar
      ? getTradingCalendarPeriodStartMs(
          tsMs,
          period,
          normalizedTimeZone,
          tradingCalendar,
        )
      : getTimeZonePeriodStartMs(tsMs, period, normalizedTimeZone);
    if (!current || current.bucketStartMs !== bucketStartMs) {
      if (current) {
        result.push(current);
      }
      current = {
        bucketStartMs,
        startRawIndex: resolveRawIndex(bar.startRawIndex, index),
        endRawIndex: resolveRawIndex(bar.endRawIndex, index),
        ts: new Date(bucketStartMs).toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };
      continue;
    }
    current.endRawIndex = resolveRawIndex(bar.endRawIndex, index);
    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.close = bar.close;
    current.volume += bar.volume;
  }

  if (current) {
    result.push(current);
  }
  return result;
};

export const inferBaseTimeframeFromBars = <T extends ReplayBarLike>(bars: T[]): BaseTimeframe => {
  if (bars.length < 3) {
    return '1d';
  }

  const timestamps = bars
    .map((bar) => parseReplayBarTimestampMs(bar))
    .filter((value) => Number.isFinite(value));
  const detected = detectBaseTimeframeFromTimestamps(timestamps);
  return detected ?? '1d';
};

export const aggregateBarsByPeriod = <T extends ReplayBarLike>(
  bars: T[],
  period: AppDisplayPeriodKey,
  startRawIndex = 0,
  endRawIndex = bars.length - 1,
  timeZone = DEFAULT_TIME_ZONE
): AggregatedBarItem[] => aggregateBarsByPeriodCore(bars, period, startRawIndex, endRawIndex, undefined, undefined, timeZone);

export const resolveReplayStepMetaBySelectedTimeframe = (
  tsMsByIndex: readonly number[],
  cursorIndex: number,
  period: AppDisplayPeriodKey,
  timeZone = DEFAULT_TIME_ZONE
): ReplayStepMeta => {
  if (tsMsByIndex.length <= 1) {
    return { stepForCurrentClose: 0, stepForNextOpen: 0, nextOpenDelay: 0 };
  }
  const cursor = Math.max(
    0,
    Math.min(Math.floor(cursorIndex), tsMsByIndex.length - 1)
  );
  if (cursor >= tsMsByIndex.length - 1) {
    return { stepForCurrentClose: 0, stepForNextOpen: 0, nextOpenDelay: 0 };
  }

  const cursorMs = tsMsByIndex[cursor];
  if (!Number.isFinite(cursorMs)) {
    return { stepForCurrentClose: 0, stepForNextOpen: 0, nextOpenDelay: 0 };
  }

  const currentPeriodStartMs = getPeriodStartMs(cursorMs, period, timeZone);
  const currentPeriodEndMs = getNextPeriodStartMs(
    currentPeriodStartMs,
    period,
    timeZone
  );
  let barsUntilCurrentPeriodEnd = 0;
  let nextPeriodFirstIndex = -1;

  for (let index = cursor + 1; index < tsMsByIndex.length; index += 1) {
    const tsMs = tsMsByIndex[index];
    if (!Number.isFinite(tsMs)) {
      continue;
    }
    if (tsMs < currentPeriodEndMs) {
      barsUntilCurrentPeriodEnd += 1;
      continue;
    }
    nextPeriodFirstIndex = index;
    break;
  }

  if (nextPeriodFirstIndex < 0) {
    return {
      stepForCurrentClose: Math.max(0, barsUntilCurrentPeriodEnd),
      stepForNextOpen: 0,
      nextOpenDelay: 0
    };
  }

  const nextOpenDelay = Math.max(1, nextPeriodFirstIndex - cursor);
  const nextStartMs = tsMsByIndex[nextPeriodFirstIndex];
  if (!Number.isFinite(nextStartMs)) {
    return {
      stepForCurrentClose:
        barsUntilCurrentPeriodEnd > 0 ? barsUntilCurrentPeriodEnd : nextOpenDelay,
      stepForNextOpen: nextOpenDelay,
      nextOpenDelay
    };
  }

  const nextPeriodStartMs = getPeriodStartMs(nextStartMs, period, timeZone);
  const nextPeriodEndMs = getNextPeriodStartMs(
    nextPeriodStartMs,
    period,
    timeZone
  );
  let barsInsideNextPeriodAfterFirst = 0;
  for (
    let index = nextPeriodFirstIndex + 1;
    index < tsMsByIndex.length;
    index += 1
  ) {
    const tsMs = tsMsByIndex[index];
    if (!Number.isFinite(tsMs)) {
      continue;
    }
    if (tsMs >= nextPeriodEndMs) {
      break;
    }
    barsInsideNextPeriodAfterFirst += 1;
  }

  const stepForNextOpen = nextOpenDelay + barsInsideNextPeriodAfterFirst;
  const stepForCurrentClose =
    barsUntilCurrentPeriodEnd > 0 ? barsUntilCurrentPeriodEnd : stepForNextOpen;
  return {
    stepForCurrentClose: Math.max(0, stepForCurrentClose),
    stepForNextOpen: Math.max(0, stepForNextOpen),
    nextOpenDelay: Math.max(0, nextOpenDelay)
  };
};
