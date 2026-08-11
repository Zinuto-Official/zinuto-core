// SPDX-License-Identifier: GPL-3.0-only

import { Temporal } from "@js-temporal/polyfill";
import { normalizeTimeZone } from "./timezone.js";
import type { BaseTimeframe } from "./timeframe.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DisplayPeriodKey =
  | "1m"
  | "5m"
  | "1h"
  | "1d"
  | "1w"
  | "1month"
  | "1year";

export const FREE_REPLAY_ADVANCE_PERIODS = [
  "1m",
  "5m",
  "1h",
  "1d",
  "1w",
  "1month",
  "1year",
] as const;

export type FreeReplayAdvancePeriod = (typeof FREE_REPLAY_ADVANCE_PERIODS)[number];

const FREE_REPLAY_ADVANCE_PERIOD_INDEX = new Map<FreeReplayAdvancePeriod, number>(
  FREE_REPLAY_ADVANCE_PERIODS.map((period, index) => [period, index]),
);

export const normalizeFreeReplayAdvancePeriod = (
  value: unknown,
  fallback: FreeReplayAdvancePeriod = "1d",
): FreeReplayAdvancePeriod => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return FREE_REPLAY_ADVANCE_PERIOD_INDEX.has(normalized as FreeReplayAdvancePeriod)
    ? (normalized as FreeReplayAdvancePeriod)
    : fallback;
};

export const listFreeReplayAdvancePeriodsForSource = (
  sourceTimeframe: BaseTimeframe,
): FreeReplayAdvancePeriod[] => {
  const startIndex =
    FREE_REPLAY_ADVANCE_PERIOD_INDEX.get(
      normalizeFreeReplayAdvancePeriod(sourceTimeframe),
    ) ?? FREE_REPLAY_ADVANCE_PERIOD_INDEX.get("1d") ?? 0;
  return FREE_REPLAY_ADVANCE_PERIODS.slice(startIndex, startIndex + 4);
};

export const isFreeReplayAdvancePeriodAllowedForSource = (
  sourceTimeframe: BaseTimeframe,
  advancePeriod: FreeReplayAdvancePeriod,
): boolean =>
  listFreeReplayAdvancePeriodsForSource(sourceTimeframe).includes(advancePeriod);

export const resolveEffectiveFreeReplayAdvancePeriod = (
  sourceTimeframe: BaseTimeframe,
  minimumAdvancePeriod: FreeReplayAdvancePeriod,
): FreeReplayAdvancePeriod => {
  const sourceIndex =
    FREE_REPLAY_ADVANCE_PERIOD_INDEX.get(
      normalizeFreeReplayAdvancePeriod(sourceTimeframe),
    ) ?? 0;
  const minimumIndex =
    FREE_REPLAY_ADVANCE_PERIOD_INDEX.get(minimumAdvancePeriod) ?? sourceIndex;
  return sourceIndex >= minimumIndex ? sourceTimeframe : minimumAdvancePeriod;
};

const isCalendarPeriod = (period: DisplayPeriodKey): boolean =>
  period === "1d" ||
  period === "1w" ||
  period === "1month" ||
  period === "1year";

export const getPeriodStartMs = (
  timestampMs: number,
  period: DisplayPeriodKey,
): number => {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  switch (period) {
    case "1m":
      return Math.floor(timestampMs / minute) * minute;
    case "5m":
      return Math.floor(timestampMs / (5 * minute)) * (5 * minute);
    case "1h":
      return Math.floor(timestampMs / hour) * hour;
    case "1d":
      return Math.floor(timestampMs / DAY_MS) * DAY_MS;
    case "1w": {
      const utcDay = Math.floor(timestampMs / DAY_MS);
      const weekday = (utcDay + 4) % 7;
      return (utcDay - weekday) * DAY_MS;
    }
    case "1month": {
      const date = new Date(timestampMs);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
    }
    case "1year": {
      const date = new Date(timestampMs);
      return Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    }
    default:
      return timestampMs;
  }
};

export const getNextPeriodStartMs = (
  periodStartMs: number,
  period: DisplayPeriodKey,
): number => {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  switch (period) {
    case "1m":
      return periodStartMs + minute;
    case "5m":
      return periodStartMs + 5 * minute;
    case "1h":
      return periodStartMs + hour;
    case "1d":
      return periodStartMs + DAY_MS;
    case "1w":
      return periodStartMs + 7 * DAY_MS;
    case "1month": {
      const date = new Date(periodStartMs);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0);
    }
    case "1year": {
      const date = new Date(periodStartMs);
      return Date.UTC(date.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0);
    }
    default:
      return periodStartMs + minute;
  }
};

export const getMarketPeriodStartMs = (
  timestampMs: number,
  period: DisplayPeriodKey,
  marketTzOffsetMs = 0,
): number => {
  if (!isCalendarPeriod(period)) {
    return getPeriodStartMs(timestampMs, period);
  }
  const shifted = timestampMs + marketTzOffsetMs;
  return getPeriodStartMs(shifted, period) - marketTzOffsetMs;
};

export const getNextMarketPeriodStartMs = (
  periodStartMs: number,
  period: DisplayPeriodKey,
  marketTzOffsetMs = 0,
): number => {
  if (!isCalendarPeriod(period)) {
    return getNextPeriodStartMs(periodStartMs, period);
  }
  const shifted = periodStartMs + marketTzOffsetMs;
  return getNextPeriodStartMs(shifted, period) - marketTzOffsetMs;
};

const toZonedDateTime = (timestampMs: number, timeZone: string): Temporal.ZonedDateTime =>
  Temporal.Instant.fromEpochMilliseconds(Math.trunc(timestampMs)).toZonedDateTimeISO(
    normalizeTimeZone(timeZone),
  );

const buildZonedDateTime = (
  timeZone: string,
  value: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
  },
): Temporal.ZonedDateTime =>
  Temporal.ZonedDateTime.from({
    timeZone: normalizeTimeZone(timeZone),
    year: value.year,
    month: value.month,
    day: value.day,
    hour: value.hour ?? 0,
    minute: value.minute ?? 0,
    second: 0,
    millisecond: 0,
  });

const withLocalFloor = (
  zoned: Temporal.ZonedDateTime,
  next: { hour?: number; minute?: number },
): Temporal.ZonedDateTime =>
  buildZonedDateTime(zoned.timeZoneId, {
    year: zoned.year,
    month: zoned.month,
    day: zoned.day,
    hour: next.hour ?? zoned.hour,
    minute: next.minute ?? zoned.minute,
  });

export const getTimeZonePeriodStartMs = (
  timestampMs: number,
  period: DisplayPeriodKey,
  timeZone: string,
): number => {
  const zoned = toZonedDateTime(timestampMs, timeZone);
  switch (period) {
    case "1m":
      return withLocalFloor(zoned, { minute: zoned.minute }).epochMilliseconds;
    case "5m":
      return withLocalFloor(zoned, {
        minute: Math.floor(zoned.minute / 5) * 5,
      }).epochMilliseconds;
    case "1h":
      return withLocalFloor(zoned, { minute: 0 }).epochMilliseconds;
    case "1d":
      return buildZonedDateTime(timeZone, {
        year: zoned.year,
        month: zoned.month,
        day: zoned.day,
      }).epochMilliseconds;
    case "1w": {
      const monday = Temporal.PlainDate.from({
        year: zoned.year,
        month: zoned.month,
        day: zoned.day,
      }).subtract({ days: zoned.dayOfWeek - 1 });
      return buildZonedDateTime(timeZone, {
        year: monday.year,
        month: monday.month,
        day: monday.day,
      }).epochMilliseconds;
    }
    case "1month":
      return buildZonedDateTime(timeZone, {
        year: zoned.year,
        month: zoned.month,
        day: 1,
      }).epochMilliseconds;
    case "1year":
      return buildZonedDateTime(timeZone, {
        year: zoned.year,
        month: 1,
        day: 1,
      }).epochMilliseconds;
    default:
      return timestampMs;
  }
};

export const getNextTimeZonePeriodStartMs = (
  periodStartMs: number,
  period: DisplayPeriodKey,
  timeZone: string,
): number => {
  const zoned = toZonedDateTime(periodStartMs, timeZone);
  switch (period) {
    case "1m":
      return zoned.add({ minutes: 1 }).epochMilliseconds;
    case "5m":
      return zoned.add({ minutes: 5 }).epochMilliseconds;
    case "1h":
      return zoned.add({ hours: 1 }).epochMilliseconds;
    case "1d":
      return zoned.add({ days: 1 }).epochMilliseconds;
    case "1w":
      return zoned.add({ weeks: 1 }).epochMilliseconds;
    case "1month":
      return zoned.add({ months: 1 }).epochMilliseconds;
    case "1year":
      return zoned.add({ years: 1 }).epochMilliseconds;
    default:
      return periodStartMs + 60 * 1000;
  }
};
