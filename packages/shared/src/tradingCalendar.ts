// SPDX-License-Identifier: GPL-3.0-only

import { Temporal } from "@js-temporal/polyfill";
import {
  getNextTimeZonePeriodStartMs,
  getTimeZonePeriodStartMs,
  type DisplayPeriodKey,
} from "./period.js";
import type { TradingAssetClass } from "./trading.js";
import { resolveMarketPresetTradingCalendarConfig } from "./marketPresets.js";
import { DEFAULT_TIME_ZONE, normalizeTimeZone } from "./timezone.js";

export type TradingCalendarWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TradingSessionRange = {
  startMinute: number;
  endMinute: number;
  crossesMidnight: boolean;
};

export type TradingCalendarConfig = {
  tradingDays: TradingCalendarWeekday[];
  sessions: TradingSessionRange[];
};

export type TradingCalendarSuggestionConfidence = "HIGH" | "MEDIUM" | "LOW";

export type TradingCalendarSuggestionOrigin =
  | "DETECTED"
  | "PRESET_DEFAULT"
  | "EXISTING_SOURCE";

export type TradingCalendarSuggestion = {
  calendar: TradingCalendarConfig;
  confidence: TradingCalendarSuggestionConfidence;
  origin: TradingCalendarSuggestionOrigin;
  sampleCount: number;
  activeDayCount: number;
};

export type TradingCalendarMembership = {
  tradingDate: string;
  tradingWeekday: TradingCalendarWeekday;
  localDate: string;
  localWeekday: TradingCalendarWeekday;
  minuteOfDay: number;
  session: TradingSessionRange;
};

export type TradingCalendarInferenceInput = {
  timestampsMs: readonly number[];
  timeZone?: string | null;
  baseTimeframe?: string | null;
  assetClass?: TradingAssetClass | string | null;
  marketPresetId?: string | null;
  parseableTimestampRowCount?: number | null;
  sampledFileCount?: number | null;
  validFileCount?: number | null;
};

const ALL_ISO_WEEKDAYS: TradingCalendarWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAY_TRADING_DAYS: TradingCalendarWeekday[] = [1, 2, 3, 4, 5];
const DAY_MINUTES = 24 * 60;
const MAX_SESSIONS = 12;
const MAX_GAP_SAMPLE_POINTS = 4096;
const INTRADAY_MEDIUM_MIN_TIMESTAMP_COUNT = 10;
const INTRADAY_HIGH_MIN_TIMESTAMP_COUNT = 50;
const INTRADAY_HIGH_MIN_PARSEABLE_ROW_COUNT = 50;
const INTRADAY_HIGH_MIN_ACTIVE_DAY_COUNT = 3;
const INTRADAY_HIGH_MIN_SAMPLED_FILE_COUNT = 3;
const INTRADAY_HIGH_MIN_FILE_COVERAGE_RATIO = 0.2;

export const DEFAULT_TRADING_CALENDAR_CONFIG: TradingCalendarConfig = {
  tradingDays: WEEKDAY_TRADING_DAYS,
  sessions: [
    {
      startMinute: 0,
      endMinute: DAY_MINUTES,
      crossesMidnight: false,
    },
  ],
};

export const CRYPTO_TRADING_CALENDAR_CONFIG: TradingCalendarConfig = {
  tradingDays: ALL_ISO_WEEKDAYS,
  sessions: [
    {
      startMinute: 0,
      endMinute: DAY_MINUTES,
      crossesMidnight: false,
    },
  ],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cloneTradingCalendarConfig = (
  calendar: TradingCalendarConfig,
): TradingCalendarConfig => ({
  tradingDays: [...calendar.tradingDays],
  sessions: calendar.sessions.map((session) => ({ ...session })),
});

const normalizeWeekday = (value: unknown): TradingCalendarWeekday | null => {
  const parsed = Math.floor(Number(value));
  return parsed >= 1 && parsed <= 7 ? (parsed as TradingCalendarWeekday) : null;
};

const toMinute = (value: unknown): number | null => {
  const parsed = Math.floor(Number(value));
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= DAY_MINUTES
    ? parsed
    : null;
};

const normalizeTradingSession = (
  value: unknown,
): TradingSessionRange | null => {
  if (!isRecord(value)) {
    return null;
  }
  const startMinute = toMinute(value.startMinute);
  const endMinute = toMinute(value.endMinute);
  if (startMinute === null || endMinute === null) {
    return null;
  }
  if (startMinute >= DAY_MINUTES) {
    return null;
  }
  if (startMinute === 0 && endMinute === DAY_MINUTES) {
    return { startMinute: 0, endMinute: DAY_MINUTES, crossesMidnight: false };
  }
  if (endMinute > DAY_MINUTES || startMinute === endMinute) {
    return null;
  }
  const crossesMidnight =
    Boolean(value.crossesMidnight) || endMinute < startMinute;
  if (!crossesMidnight && endMinute <= startMinute) {
    return null;
  }
  return {
    startMinute,
    endMinute,
    crossesMidnight,
  };
};

const sessionDurationMinutes = (session: TradingSessionRange): number => {
  if (!session.crossesMidnight) {
    return session.endMinute - session.startMinute;
  }
  return DAY_MINUTES - session.startMinute + session.endMinute;
};

const mergeTradingSessions = (
  sessions: TradingSessionRange[],
): TradingSessionRange[] => {
  const intervals = sessions
    .map((session) => {
      const end =
        session.crossesMidnight || session.endMinute <= session.startMinute
          ? session.endMinute + DAY_MINUTES
          : session.endMinute;
      return {
        start: session.startMinute,
        end,
      };
    })
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: Array<{ start: number; end: number }> = [];
  intervals.forEach((interval) => {
    const tail = merged[merged.length - 1];
    if (!tail || interval.start > tail.end) {
      merged.push({ ...interval });
      return;
    }
    tail.end = Math.max(tail.end, interval.end);
  });

  const normalized = merged
    .map((interval): TradingSessionRange => {
      const duration = interval.end - interval.start;
      if (duration >= DAY_MINUTES) {
        return {
          startMinute: 0,
          endMinute: DAY_MINUTES,
          crossesMidnight: false,
        };
      }
      if (interval.end > DAY_MINUTES) {
        return {
          startMinute: interval.start,
          endMinute: interval.end - DAY_MINUTES,
          crossesMidnight: true,
        };
      }
      return {
        startMinute: interval.start,
        endMinute: interval.end,
        crossesMidnight: false,
      };
    })
    .filter((session) => sessionDurationMinutes(session) > 0);

  return normalized.slice(0, MAX_SESSIONS);
};

export const parseTradingCalendarConfig = (
  value: unknown,
): TradingCalendarConfig | null => {
  if (!isRecord(value)) {
    return null;
  }
  const tradingDays = Array.from(
    new Set(
      (Array.isArray(value.tradingDays) ? value.tradingDays : [])
        .map((item) => normalizeWeekday(item))
        .filter((item): item is TradingCalendarWeekday => item !== null),
    ),
  ).sort((left, right) => left - right);
  const sessions = mergeTradingSessions(
    (Array.isArray(value.sessions) ? value.sessions : [])
      .map((item) => normalizeTradingSession(item))
      .filter((item): item is TradingSessionRange => item !== null),
  );
  if (!tradingDays.length || !sessions.length) {
    return null;
  }
  return { tradingDays, sessions };
};

export const normalizeTradingCalendarConfig = (
  value: unknown,
  fallback: TradingCalendarConfig = DEFAULT_TRADING_CALENDAR_CONFIG,
): TradingCalendarConfig =>
  parseTradingCalendarConfig(value) ?? cloneTradingCalendarConfig(fallback);

export const assertTradingCalendarConfig = (
  value: unknown,
): TradingCalendarConfig => {
  const parsed = parseTradingCalendarConfig(value);
  if (!parsed) {
    throw new Error("TRADING_CALENDAR_INVALID");
  }
  return parsed;
};

export const serializeTradingCalendarConfig = (
  value: unknown,
): string => JSON.stringify(assertTradingCalendarConfig(value));

export const parseStoredTradingCalendarConfig = (
  value: unknown,
): TradingCalendarConfig => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("TRADING_CALENDAR_STORED_INVALID");
  }
  return assertTradingCalendarConfig(JSON.parse(value));
};

export const resolveDefaultTradingCalendarConfig = (
  assetClass?: TradingAssetClass | string | null,
): TradingCalendarConfig =>
  String(assetClass ?? "").trim().toUpperCase() === "CRYPTO"
    ? cloneTradingCalendarConfig(CRYPTO_TRADING_CALENDAR_CONFIG)
    : cloneTradingCalendarConfig(DEFAULT_TRADING_CALENDAR_CONFIG);

const resolveCanonicalTradingCalendarConfig = ({
  marketPresetId,
  assetClass,
  baseTimeframe,
}: {
  marketPresetId?: string | null;
  assetClass?: TradingAssetClass | string | null;
  baseTimeframe?: string | null;
}): TradingCalendarConfig | null => {
  const presetCalendar = resolveMarketPresetTradingCalendarConfig(marketPresetId);
  if (!presetCalendar) {
    return null;
  }
  if (timeframeStepMinutes(baseTimeframe) < DAY_MINUTES) {
    return presetCalendar;
  }
  return {
    tradingDays: [...presetCalendar.tradingDays],
    sessions: cloneTradingCalendarConfig(
      resolveDefaultTradingCalendarConfig(assetClass),
    ).sessions,
  };
};

const toZonedDateTime = (
  timestampMs: number,
  timeZone: string,
): Temporal.ZonedDateTime =>
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

const plainDateKey = (date: Temporal.PlainDate): string =>
  `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(
    2,
    "0",
  )}-${String(date.day).padStart(2, "0")}`;

const toPlainDate = (value: string): Temporal.PlainDate =>
  Temporal.PlainDate.from(value);

const minuteOfDay = (zoned: Temporal.ZonedDateTime): number =>
  zoned.hour * 60 + zoned.minute;

const includesTradingDay = (
  calendar: TradingCalendarConfig,
  weekday: number,
): weekday is TradingCalendarWeekday =>
  calendar.tradingDays.includes(weekday as TradingCalendarWeekday);

const sessionContainsMinute = (
  session: TradingSessionRange,
  minute: number,
): boolean => {
  if (!session.crossesMidnight) {
    return minute >= session.startMinute && minute <= session.endMinute;
  }
  return minute >= session.startMinute || minute <= session.endMinute;
};

export const resolveTradingCalendarMembership = (
  timestampMs: number,
  timeZone: string,
  calendarInput: TradingCalendarConfig,
): TradingCalendarMembership | null => {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  const calendar = normalizeTradingCalendarConfig(calendarInput);
  const zoned = toZonedDateTime(timestampMs, timeZone);
  const minute = minuteOfDay(zoned);
  const localDate = Temporal.PlainDate.from({
    year: zoned.year,
    month: zoned.month,
    day: zoned.day,
  });
  for (const session of calendar.sessions) {
    if (!sessionContainsMinute(session, minute)) {
      continue;
    }
    const tradingDate =
      session.crossesMidnight && minute <= session.endMinute
        ? localDate.subtract({ days: 1 })
        : localDate;
    if (!includesTradingDay(calendar, tradingDate.dayOfWeek)) {
      continue;
    }
    return {
      tradingDate: plainDateKey(tradingDate),
      tradingWeekday: tradingDate.dayOfWeek as TradingCalendarWeekday,
      localDate: plainDateKey(localDate),
      localWeekday: zoned.dayOfWeek as TradingCalendarWeekday,
      minuteOfDay: minute,
      session: { ...session },
    };
  }
  return null;
};

export const isTimestampInTradingCalendar = (
  timestampMs: number,
  timeZone: string,
  calendar: TradingCalendarConfig,
): boolean =>
  resolveTradingCalendarMembership(timestampMs, timeZone, calendar) !== null;

const getTradingDateForTimestamp = (
  timestampMs: number,
  timeZone: string,
  calendar: TradingCalendarConfig,
): Temporal.PlainDate => {
  const membership = resolveTradingCalendarMembership(
    timestampMs,
    timeZone,
    calendar,
  );
  if (membership) {
    return toPlainDate(membership.tradingDate);
  }
  const zoned = toZonedDateTime(timestampMs, timeZone);
  return Temporal.PlainDate.from({
    year: zoned.year,
    month: zoned.month,
    day: zoned.day,
  });
};

const getFirstSessionStartMinute = (
  calendarInput: TradingCalendarConfig,
): number => {
  const calendar = normalizeTradingCalendarConfig(calendarInput);
  return calendar.sessions.reduce(
    (minimum, session) => Math.min(minimum, session.startMinute),
    DAY_MINUTES,
  ) % DAY_MINUTES;
};

const getTradingDateStartMs = (
  date: Temporal.PlainDate,
  timeZone: string,
  calendar: TradingCalendarConfig,
): number => {
  const startMinute = getFirstSessionStartMinute(calendar);
  return buildZonedDateTime(timeZone, {
    year: date.year,
    month: date.month,
    day: date.day,
    hour: Math.floor(startMinute / 60),
    minute: startMinute % 60,
  }).epochMilliseconds;
};

export const getTradingCalendarPeriodStartMs = (
  timestampMs: number,
  period: DisplayPeriodKey,
  timeZone: string,
  calendarInput: TradingCalendarConfig,
): number => {
  if (period === "1m" || period === "5m" || period === "1h") {
    return getTimeZonePeriodStartMs(timestampMs, period, timeZone);
  }
  const calendar = normalizeTradingCalendarConfig(calendarInput);
  const tradingDate = getTradingDateForTimestamp(timestampMs, timeZone, calendar);
  if (period === "1d") {
    return getTradingDateStartMs(tradingDate, timeZone, calendar);
  }
  if (period === "1w") {
    const monday = tradingDate.subtract({ days: tradingDate.dayOfWeek - 1 });
    return getTradingDateStartMs(monday, timeZone, calendar);
  }
  if (period === "1month") {
    const monthStart = Temporal.PlainDate.from({
      year: tradingDate.year,
      month: tradingDate.month,
      day: 1,
    });
    return getTradingDateStartMs(monthStart, timeZone, calendar);
  }
  if (period === "1year") {
    const yearStart = Temporal.PlainDate.from({
      year: tradingDate.year,
      month: 1,
      day: 1,
    });
    return getTradingDateStartMs(yearStart, timeZone, calendar);
  }
  return getTimeZonePeriodStartMs(timestampMs, period, timeZone);
};

export const getNextTradingCalendarPeriodStartMs = (
  periodStartMs: number,
  period: DisplayPeriodKey,
  timeZone: string,
  calendarInput: TradingCalendarConfig,
): number => {
  if (period === "1m" || period === "5m" || period === "1h") {
    return getNextTimeZonePeriodStartMs(periodStartMs, period, timeZone);
  }
  const calendar = normalizeTradingCalendarConfig(calendarInput);
  const tradingDate = getTradingDateForTimestamp(
    periodStartMs,
    timeZone,
    calendar,
  );
  if (period === "1d") {
    return getTradingDateStartMs(tradingDate.add({ days: 1 }), timeZone, calendar);
  }
  if (period === "1w") {
    return getTradingDateStartMs(tradingDate.add({ weeks: 1 }), timeZone, calendar);
  }
  if (period === "1month") {
    return getTradingDateStartMs(tradingDate.add({ months: 1 }), timeZone, calendar);
  }
  if (period === "1year") {
    return getTradingDateStartMs(tradingDate.add({ years: 1 }), timeZone, calendar);
  }
  return getNextTimeZonePeriodStartMs(periodStartMs, period, timeZone);
};

export const isExpectedTradingCalendarGap = ({
  missingStartMs,
  missingEndMs,
  timeZone = DEFAULT_TIME_ZONE,
  calendar,
  stepMs,
}: {
  missingStartMs: number;
  missingEndMs: number;
  timeZone?: string | null;
  calendar: TradingCalendarConfig;
  stepMs?: number;
}): boolean => {
  if (
    !Number.isFinite(missingStartMs) ||
    !Number.isFinite(missingEndMs) ||
    missingEndMs < missingStartMs
  ) {
    return false;
  }
  const rangeMs = missingEndMs - missingStartMs;
  const requestedStepMs = Math.max(
    60_000,
    Math.floor(Number(stepMs) || 60_000),
  );
  const sampleStepMs = Math.max(
    requestedStepMs,
    Math.ceil(rangeMs / MAX_GAP_SAMPLE_POINTS),
  );
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  let cursor = missingStartMs;
  let guard = 0;
  while (cursor <= missingEndMs && guard <= MAX_GAP_SAMPLE_POINTS + 1) {
    if (isTimestampInTradingCalendar(cursor, normalizedTimeZone, calendar)) {
      return false;
    }
    cursor += sampleStepMs;
    guard += 1;
  }
  if (isTimestampInTradingCalendar(missingEndMs, normalizedTimeZone, calendar)) {
    return false;
  }
  return true;
};

export const stableTradingCalendarKey = (
  value: unknown,
): string => {
  const calendar = assertTradingCalendarConfig(value);
  const json = JSON.stringify(calendar);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `tc_${(hash >>> 0).toString(36)}`;
};

const timeframeStepMinutes = (baseTimeframe?: string | null): number => {
  const normalized = String(baseTimeframe ?? "").trim().toLowerCase();
  if (normalized === "1m") {
    return 1;
  }
  if (normalized === "5m") {
    return 5;
  }
  if (normalized === "1h") {
    return 60;
  }
  return DAY_MINUTES;
};

const groupActiveMinuteBuckets = (
  minutes: readonly number[],
  stepMinutes: number,
): Array<{ startMinute: number; endMinute: number }> => {
  const sorted = Array.from(
    new Set(
      minutes
        .map((item) => Math.floor(Number(item)))
        .filter((item) => item >= 0 && item < DAY_MINUTES),
    ),
  ).sort((left, right) => left - right);
  if (!sorted.length) {
    return [];
  }
  const gapThreshold = Math.max(1, Math.min(180, stepMinutes * 2));
  const groups: Array<{ startMinute: number; endMinute: number }> = [];
  const resolveEndMinute = (startMinute: number, previousMinute: number) =>
    startMinute === previousMinute
      ? Math.min(DAY_MINUTES, previousMinute + 1)
      : previousMinute;
  let start = sorted[0] ?? 0;
  let previous = start;
  sorted.slice(1).forEach((minute) => {
    if (minute - previous > gapThreshold) {
      groups.push({
        startMinute: start,
        endMinute: resolveEndMinute(start, previous),
      });
      start = minute;
    }
    previous = minute;
  });
  groups.push({
    startMinute: start,
    endMinute: resolveEndMinute(start, previous),
  });
  return groups;
};

const combineCrossMidnightGroups = (
  groups: Array<{ startMinute: number; endMinute: number }>,
  stepMinutes: number,
): TradingSessionRange[] => {
  if (!groups.length) {
    return [];
  }
  const tolerance = Math.max(1, Math.min(120, stepMinutes * 2));
  const sorted = [...groups].sort(
    (left, right) => left.startMinute - right.startMinute,
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const sessions = sorted.map((group) => ({
    startMinute: group.startMinute,
    endMinute: group.endMinute,
    crossesMidnight: false,
  }));
  if (
    first &&
    last &&
    sorted.length >= 2 &&
    first.startMinute <= tolerance &&
    last.endMinute >= DAY_MINUTES - tolerance
  ) {
    sessions.shift();
    sessions.pop();
    sessions.push({
      startMinute: last.startMinute,
      endMinute: first.endMinute,
      crossesMidnight: true,
    });
  }
  return mergeTradingSessions(sessions);
};

const normalizeOptionalNonNegativeInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
};

const hasEnoughInferenceFileCoverage = (
  sampledFileCountRaw: number | null | undefined,
  validFileCountRaw: number | null | undefined,
): boolean => {
  const validFileCount = normalizeOptionalNonNegativeInteger(validFileCountRaw);
  const sampledFileCount = normalizeOptionalNonNegativeInteger(sampledFileCountRaw);
  if (validFileCount === null || validFileCount <= 1) {
    return true;
  }
  if (sampledFileCount === null) {
    return true;
  }
  const cappedSampledFileCount = Math.min(sampledFileCount, validFileCount);
  if (
    cappedSampledFileCount <
    Math.min(validFileCount, INTRADAY_HIGH_MIN_SAMPLED_FILE_COUNT)
  ) {
    return false;
  }
  return cappedSampledFileCount / validFileCount >= INTRADAY_HIGH_MIN_FILE_COVERAGE_RATIO;
};

const resolveIntradayInferenceConfidence = ({
  timestampCount,
  parseableTimestampRowCount,
  sampledFileCount,
  validFileCount,
  activeDayCount,
}: {
  timestampCount: number;
  parseableTimestampRowCount?: number | null;
  sampledFileCount?: number | null;
  validFileCount?: number | null;
  activeDayCount: number;
}): TradingCalendarSuggestionConfidence => {
  const parseableRows =
    normalizeOptionalNonNegativeInteger(parseableTimestampRowCount) ?? timestampCount;
  if (
    timestampCount >= INTRADAY_HIGH_MIN_TIMESTAMP_COUNT &&
    parseableRows >= INTRADAY_HIGH_MIN_PARSEABLE_ROW_COUNT &&
    activeDayCount >= INTRADAY_HIGH_MIN_ACTIVE_DAY_COUNT &&
    hasEnoughInferenceFileCoverage(sampledFileCount, validFileCount)
  ) {
    return "HIGH";
  }
  return timestampCount >= INTRADAY_MEDIUM_MIN_TIMESTAMP_COUNT ? "MEDIUM" : "LOW";
};

export const inferTradingCalendarFromTimestamps = ({
  timestampsMs,
  timeZone = DEFAULT_TIME_ZONE,
  baseTimeframe,
  assetClass,
  marketPresetId,
  parseableTimestampRowCount,
  sampledFileCount,
  validFileCount,
}: TradingCalendarInferenceInput): TradingCalendarSuggestion => {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const finiteTimestamps = Array.from(
    new Set(
      (Array.isArray(timestampsMs) ? timestampsMs : [])
        .map((item) => Math.trunc(Number(item)))
        .filter((item) => Number.isFinite(item)),
    ),
  ).sort((left, right) => left - right);
  const fallback = resolveDefaultTradingCalendarConfig(assetClass);
  const canonicalCalendar = resolveCanonicalTradingCalendarConfig({
    marketPresetId,
    assetClass,
    baseTimeframe,
  });
  if (canonicalCalendar) {
    return {
      calendar: canonicalCalendar,
      confidence: "HIGH",
      origin: "PRESET_DEFAULT",
      sampleCount: finiteTimestamps.length,
      activeDayCount: canonicalCalendar.tradingDays.length,
    };
  }
  if (!finiteTimestamps.length) {
    return {
      calendar: fallback,
      confidence: "LOW",
      origin: "PRESET_DEFAULT",
      sampleCount: 0,
      activeDayCount: fallback.tradingDays.length,
    };
  }

  const stepMinutes = timeframeStepMinutes(baseTimeframe);
  const localParts = finiteTimestamps.map((timestampMs) => {
    const zoned = toZonedDateTime(timestampMs, normalizedTimeZone);
    return {
      timestampMs,
      minute: minuteOfDay(zoned),
      weekday: zoned.dayOfWeek as TradingCalendarWeekday,
    };
  });
  const localWeekdays = Array.from(
    new Set(localParts.map((part) => part.weekday)),
  ).sort((left, right) => left - right);

  if (stepMinutes >= DAY_MINUTES) {
    const tradingDays = localWeekdays.length ? localWeekdays : fallback.tradingDays;
    return {
      calendar: {
        tradingDays,
        sessions: cloneTradingCalendarConfig(fallback).sessions,
      },
      confidence: finiteTimestamps.length >= 20 ? "MEDIUM" : "LOW",
      origin: "DETECTED",
      sampleCount: finiteTimestamps.length,
      activeDayCount: tradingDays.length,
    };
  }

  const minuteGroups = groupActiveMinuteBuckets(
    localParts.map((part) => part.minute),
    stepMinutes,
  );
  const activeMinuteCount = new Set(localParts.map((part) => part.minute)).size;
  const coversAllDay =
    activeMinuteCount >= Math.floor(DAY_MINUTES / Math.max(1, stepMinutes) * 0.7) ||
    (minuteGroups.length === 1 &&
      (minuteGroups[0]?.endMinute ?? 0) - (minuteGroups[0]?.startMinute ?? 0) >=
        DAY_MINUTES * 0.8);
  const sessions = coversAllDay
    ? cloneTradingCalendarConfig(fallback).sessions
    : combineCrossMidnightGroups(minuteGroups, stepMinutes);
  if (!sessions.length) {
    return {
      calendar: fallback,
      confidence: "LOW",
      origin: "PRESET_DEFAULT",
      sampleCount: finiteTimestamps.length,
      activeDayCount: fallback.tradingDays.length,
    };
  }

  const allDaysCalendar = {
    tradingDays: ALL_ISO_WEEKDAYS,
    sessions,
  };
  const tradingDaySet = new Set<TradingCalendarWeekday>();
  finiteTimestamps.forEach((timestampMs) => {
    const membership = resolveTradingCalendarMembership(
      timestampMs,
      normalizedTimeZone,
      allDaysCalendar,
    );
    if (membership) {
      tradingDaySet.add(membership.tradingWeekday);
    }
  });
  const tradingDays = Array.from(tradingDaySet).sort(
    (left, right) => left - right,
  );
  const calendar = assertTradingCalendarConfig({
    tradingDays: tradingDays.length ? tradingDays : localWeekdays,
    sessions,
  });
  return {
    calendar,
    confidence: resolveIntradayInferenceConfidence({
      timestampCount: finiteTimestamps.length,
      parseableTimestampRowCount,
      sampledFileCount,
      validFileCount,
      activeDayCount: calendar.tradingDays.length,
    }),
    origin: "DETECTED",
    sampleCount: finiteTimestamps.length,
    activeDayCount: calendar.tradingDays.length,
  };
};
