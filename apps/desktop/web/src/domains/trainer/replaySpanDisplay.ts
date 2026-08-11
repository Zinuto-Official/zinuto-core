// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import {
  countDateKeysBetween,
  shiftDateKey,
  toTimeZoneDateKey,
  toTimeZoneDateParts,
} from "@zinuto/shared/timezone";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const BASE_TIMEFRAME_MS: Record<BaseTimeframe, number> = {
  "1m": MINUTE_MS,
  "5m": 5 * MINUTE_MS,
  "1h": HOUR_MS,
  "1d": DAY_MS,
};

type ReplaySpanLabels = {
  empty: string;
  minute: string;
  hour: string;
  day: string;
};

const toFiniteDuration = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
};

const roundToMinute = (durationMs: number): number => {
  const normalized = toFiniteDuration(durationMs);
  if (normalized <= 0) {
    return 0;
  }
  return Math.max(MINUTE_MS, Math.round(normalized / MINUTE_MS) * MINUTE_MS);
};

export const resolveBaseTimeframeDurationMs = (
  baseTimeframe: BaseTimeframe,
): number => {
  return BASE_TIMEFRAME_MS[baseTimeframe];
};

export const formatReplaySpanText = ({
  durationMs,
  minimumMs,
  labels,
}: {
  durationMs: number;
  minimumMs: number;
  labels: ReplaySpanLabels;
}): string => {
  const roundedDurationMs = roundToMinute(durationMs);
  const roundedMinimumMs = roundToMinute(minimumMs);
  const normalizedDurationMs = Math.max(roundedMinimumMs, roundedDurationMs);
  if (!(normalizedDurationMs > 0)) {
    return labels.empty;
  }

  if (normalizedDurationMs >= DAY_MS) {
    const days = Math.floor(normalizedDurationMs / DAY_MS);
    const hours = Math.floor((normalizedDurationMs % DAY_MS) / HOUR_MS);
    return hours > 0
      ? `${days}${labels.day} ${hours}${labels.hour}`
      : `${days}${labels.day}`;
  }

  if (normalizedDurationMs >= HOUR_MS) {
    const hours = Math.floor(normalizedDurationMs / HOUR_MS);
    const minutes = Math.floor((normalizedDurationMs % HOUR_MS) / MINUTE_MS);
    return minutes > 0
      ? `${hours}${labels.hour} ${minutes}${labels.minute}`
      : `${hours}${labels.hour}`;
  }

  const minutes = Math.max(1, Math.floor(normalizedDurationMs / MINUTE_MS));
  return `${minutes}${labels.minute}`;
};

const toLocalTimeOfDayMs = (
  timestamp: unknown,
  timeZone?: string,
): number => {
  const parts = toTimeZoneDateParts(timestamp, timeZone);
  if (!parts) {
    return Number.NaN;
  }
  return (
    parts.hour * HOUR_MS +
    parts.minute * MINUTE_MS +
    parts.second * 1000 +
    parts.ms
  );
};

const resolveLocalEndBoundary = ({
  timestamp,
  baseTimeframe,
  timeZone,
}: {
  timestamp: unknown;
  baseTimeframe: BaseTimeframe;
  timeZone?: string;
}): { dateKey: string; timeOfDayMs: number } | null => {
  const dateKey = toTimeZoneDateKey(timestamp, timeZone);
  const timeOfDayMs = toLocalTimeOfDayMs(timestamp, timeZone);
  if (!dateKey || !Number.isFinite(timeOfDayMs)) {
    return null;
  }

  if (baseTimeframe === "1d") {
    const nextDateKey = shiftDateKey(dateKey, 1);
    return nextDateKey ? { dateKey: nextDateKey, timeOfDayMs } : null;
  }

  const rawEndTimeOfDayMs =
    timeOfDayMs + resolveBaseTimeframeDurationMs(baseTimeframe);
  const dayOffset = Math.floor(rawEndTimeOfDayMs / DAY_MS);
  const endDateKey = shiftDateKey(dateKey, dayOffset);
  if (!endDateKey) {
    return null;
  }
  return {
    dateKey: endDateKey,
    timeOfDayMs: rawEndTimeOfDayMs - dayOffset * DAY_MS,
  };
};

export const resolveCalendarSpanDurationMs = ({
  startTimestamp,
  endTimestamp,
  baseTimeframe,
  timeZone,
}: {
  startTimestamp: unknown;
  endTimestamp: unknown;
  baseTimeframe: BaseTimeframe;
  timeZone?: string;
}): number => {
  const startDateKey = toTimeZoneDateKey(startTimestamp, timeZone);
  const startTimeOfDayMs = toLocalTimeOfDayMs(startTimestamp, timeZone);
  const endBoundary = resolveLocalEndBoundary({
    timestamp: endTimestamp,
    baseTimeframe,
    timeZone,
  });
  if (
    !startDateKey ||
    !Number.isFinite(startTimeOfDayMs) ||
    !endBoundary
  ) {
    return Number.NaN;
  }

  const daySpan = countDateKeysBetween(startDateKey, endBoundary.dateKey);
  if (!Number.isFinite(daySpan)) {
    return Number.NaN;
  }
  return Math.max(
    0,
    daySpan * DAY_MS + endBoundary.timeOfDayMs - startTimeOfDayMs,
  );
};

export const formatCalendarSpanText = ({
  startTimestamp,
  endTimestamp,
  baseTimeframe,
  timeZone,
  labels,
}: {
  startTimestamp: unknown;
  endTimestamp: unknown;
  baseTimeframe: BaseTimeframe;
  timeZone?: string;
  labels: ReplaySpanLabels;
}): string => {
  const durationMs = resolveCalendarSpanDurationMs({
    startTimestamp,
    endTimestamp,
    baseTimeframe,
    timeZone,
  });
  if (!Number.isFinite(durationMs)) {
    return labels.empty;
  }
  return formatReplaySpanText({
    durationMs,
    minimumMs: resolveBaseTimeframeDurationMs(baseTimeframe),
    labels,
  });
};
