// SPDX-License-Identifier: GPL-3.0-only

import { Temporal } from "@js-temporal/polyfill";
import type { BuiltInTradingMarketPresetId } from "./trading.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const COMPACT_DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const COMPACT_MINUTE_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const COMPACT_SECOND_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const NAIVE_DATETIME_RE =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::?(\d{1,2}))?(?::?(\d{1,2}))?(?:\.(\d{1,6}))?)?$/;
const TZ_SUFFIX_RE = /([zZ]|[+-]\d{2}:?[0-9]{2})$/;
const NAMED_TZ_RE = /\b(?:UTC|GMT)\b/i;

export type TimeZoneOrigin =
  | "PRESET_DEFAULT"
  | "INFERRED_DEFAULT"
  | "USER_SELECTED";

export type TimeZoneSuggestionReason =
  | "PRESET_DEFAULT"
  | "RULE_INFERRED"
  | "TIMESTAMP_INFERRED"
  | "EXISTING_SOURCE"
  | "SYSTEM_FALLBACK";

export type TimeZoneDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
  weekday: number;
};

export type TimestampParseOptions = {
  disambiguation?: "compatible" | "earlier" | "later" | "reject";
  overflow?: "constrain" | "reject";
};

export const DEFAULT_TIME_ZONE = "Etc/UTC";
// HistData timestamps are fixed Eastern Standard Time (UTC-05:00) and do not
// observe daylight saving time. IANA's Etc/GMT signs are intentionally
// inverted, so Etc/GMT+5 represents UTC-05:00.
export const FIXED_EST_TIME_ZONE = "Etc/GMT+5";

export const BUILT_IN_TRADING_MARKET_PRESET_TIME_ZONE_BY_ID: Record<
  BuiltInTradingMarketPresetId,
  string
> = {
  A_SHARE: "Asia/Shanghai",
  HK_STOCK: "Asia/Hong_Kong",
  US_STOCK: "America/New_York",
  JP_STOCK: "Asia/Tokyo",
  KR_STOCK: "Asia/Seoul",
  TW_STOCK: "Asia/Taipei",
  FUTURES_COMMODITY: "Etc/UTC",
  FUTURES_FINANCIAL: "Etc/UTC",
  FOREX_STANDARD_LOT: "America/New_York",
  FOREX_MICRO_LOT: "America/New_York",
  CRYPTO_SPOT: "Etc/UTC",
  CRYPTO_USDT_PERP: "Etc/UTC",
};

export const COMMON_IMPORT_TIME_ZONES = [
  "Etc/UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Taipei",
  "America/New_York",
  "America/Chicago",
];

const toCanonicalTimeZone = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: normalized }).resolvedOptions()
        .timeZone || normalized
    );
  } catch {
    return null;
  }
};

const toSafeTemporalTimeZone = (value: unknown): string =>
  toCanonicalTimeZone(value) ?? DEFAULT_TIME_ZONE;

const normalizeNumericTimestamp = (
  numeric: number,
  digitsLength: number,
): number => {
  if (!Number.isFinite(numeric)) {
    return Number.NaN;
  }
  const abs = Math.abs(numeric);
  if (digitsLength >= 11 || abs >= 100_000_000_000) {
    return Math.trunc(numeric);
  }
  if (digitsLength >= 10 || abs >= 1_000_000_000) {
    return Math.trunc(numeric * 1000);
  }
  return Math.trunc(numeric);
};

const parseDatePart = (raw: unknown, min: number, max: number): number => {
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    return Number.NaN;
  }
  return numeric;
};

const buildZonedEpochMs = (
  timeZone: string,
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
  },
  options: TimestampParseOptions = {},
): number => {
  try {
    return Temporal.ZonedDateTime.from(
      {
        timeZone,
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour ?? 0,
        minute: parts.minute ?? 0,
        second: parts.second ?? 0,
        millisecond: parts.millisecond ?? 0,
      },
      {
        disambiguation: options.disambiguation ?? "compatible",
        overflow: options.overflow ?? "constrain",
      },
    ).epochMilliseconds;
  } catch {
    return Number.NaN;
  }
};

const parseNaiveTimestampMs = (
  raw: string,
  timeZone: string,
  options: TimestampParseOptions = {},
): number => {
  const compactDate = raw.match(COMPACT_DATE_RE);
  if (compactDate) {
    return buildZonedEpochMs(timeZone, {
      year: parseDatePart(compactDate[1], 1900, 2200),
      month: parseDatePart(compactDate[2], 1, 12),
      day: parseDatePart(compactDate[3], 1, 31),
    }, options);
  }

  const compactMinute = raw.match(COMPACT_MINUTE_RE);
  if (compactMinute) {
    return buildZonedEpochMs(timeZone, {
      year: parseDatePart(compactMinute[1], 1900, 2200),
      month: parseDatePart(compactMinute[2], 1, 12),
      day: parseDatePart(compactMinute[3], 1, 31),
      hour: parseDatePart(compactMinute[4], 0, 23),
      minute: parseDatePart(compactMinute[5], 0, 59),
    }, options);
  }

  const compactSecond = raw.match(COMPACT_SECOND_RE);
  if (compactSecond) {
    return buildZonedEpochMs(timeZone, {
      year: parseDatePart(compactSecond[1], 1900, 2200),
      month: parseDatePart(compactSecond[2], 1, 12),
      day: parseDatePart(compactSecond[3], 1, 31),
      hour: parseDatePart(compactSecond[4], 0, 23),
      minute: parseDatePart(compactSecond[5], 0, 59),
      second: parseDatePart(compactSecond[6], 0, 59),
    }, options);
  }

  const matched = raw.match(NAIVE_DATETIME_RE);
  if (!matched) {
    return Number.NaN;
  }
  return buildZonedEpochMs(timeZone, {
    year: parseDatePart(matched[1], 1900, 2200),
    month: parseDatePart(matched[2], 1, 12),
    day: parseDatePart(matched[3], 1, 31),
    hour: parseDatePart(matched[4] ?? "0", 0, 23),
    minute: parseDatePart(matched[5] ?? "0", 0, 59),
    second: parseDatePart(matched[6] ?? "0", 0, 59),
    millisecond: parseDatePart(
      String(matched[7] ?? "0").padEnd(3, "0").slice(0, 3),
      0,
      999,
    ),
  }, options);
};

export const canonicalizeTimeZone = (value: unknown): string | null =>
  toCanonicalTimeZone(value);

export const isValidTimeZone = (value: unknown): boolean =>
  Boolean(toCanonicalTimeZone(value));

export const normalizeTimeZone = (
  value: unknown,
  fallback = DEFAULT_TIME_ZONE,
): string => toCanonicalTimeZone(value) ?? toCanonicalTimeZone(fallback) ?? DEFAULT_TIME_ZONE;

export const normalizeTimeZoneOrigin = (
  value: unknown,
  fallback: TimeZoneOrigin = "PRESET_DEFAULT",
): TimeZoneOrigin =>
  value === "PRESET_DEFAULT" ||
  value === "INFERRED_DEFAULT" ||
  value === "USER_SELECTED"
    ? value
    : fallback;

export const resolveSystemTimeZone = (
  fallback = DEFAULT_TIME_ZONE,
): string => {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return normalizeTimeZone(resolved, fallback);
  } catch {
    return normalizeTimeZone(fallback);
  }
};

export const listSupportedTimeZones = (): string[] => {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  }).supportedValuesOf;
  const resolved = Array.from(
    new Set(
      [
        ...COMMON_IMPORT_TIME_ZONES,
        ...(typeof supportedValuesOf === "function"
          ? supportedValuesOf("timeZone")
          : []),
      ]
        .map((item) => normalizeTimeZone(item))
        .filter((item) => Boolean(item)),
    ),
  );
  return resolved.sort((left, right) => left.localeCompare(right, "en"));
};

export const resolveDefaultImportTimeZoneByMarketPreset = (
  marketPresetId: string,
): string | null => {
  const normalized = String(marketPresetId ?? "").trim();
  if (!normalized) {
    return null;
  }
  return toCanonicalTimeZone(
    BUILT_IN_TRADING_MARKET_PRESET_TIME_ZONE_BY_ID[
      normalized as BuiltInTradingMarketPresetId
    ],
  );
};

export const parseTimestampMsInTimeZone = (
  value: unknown,
  timeZone = DEFAULT_TIME_ZONE,
  options: TimestampParseOptions = {},
): number => {
  if (typeof value === "number") {
    return normalizeNumericTimestamp(value, 0);
  }
  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : Number.NaN;
  }
  const raw = String(value ?? "").trim();
  if (!raw) {
    return Number.NaN;
  }

  const resolvedTimeZone = toSafeTemporalTimeZone(timeZone);
  if (
    COMPACT_DATE_RE.test(raw) ||
    COMPACT_MINUTE_RE.test(raw) ||
    COMPACT_SECOND_RE.test(raw)
  ) {
    const compactParsed = parseNaiveTimestampMs(raw, resolvedTimeZone, options);
    if (Number.isFinite(compactParsed)) {
      return compactParsed;
    }
    // Out-of-range compact shapes (e.g. a 12-digit epoch millisecond from
    // 1973-1978) fall through to the numeric branch for consistency with
    // marketTime.parseTimestampMs.
  }
  if (/^[+-]?\d+$/.test(raw)) {
    const signedDigits = raw.replace(/^[+-]/, "");
    return normalizeNumericTimestamp(Number(raw), signedDigits.length);
  }

  const matchedDateKey = raw.match(DATE_KEY_RE);
  if (matchedDateKey) {
    return buildZonedEpochMs(resolvedTimeZone, {
      year: parseDatePart(matchedDateKey[1], 1900, 2200),
      month: parseDatePart(matchedDateKey[2], 1, 12),
      day: parseDatePart(matchedDateKey[3], 1, 31),
    }, options);
  }

  const absoluteParsed =
    TZ_SUFFIX_RE.test(raw) || NAMED_TZ_RE.test(raw)
      ? (() => {
          try {
            return Temporal.Instant.from(raw).epochMilliseconds;
          } catch {
            const fallbackParsed = Date.parse(raw);
            return Number.isFinite(fallbackParsed)
              ? Math.trunc(fallbackParsed)
              : Number.NaN;
          }
        })()
      : Number.NaN;
  if (Number.isFinite(absoluteParsed)) {
    return Math.trunc(absoluteParsed);
  }

  const naiveParsed = parseNaiveTimestampMs(raw, resolvedTimeZone, options);
  if (Number.isFinite(naiveParsed)) {
    return Math.trunc(naiveParsed);
  }

  const isoLike = raw.includes("T") ? raw : raw.replace(" ", "T");
  const isoNaiveParsed = parseNaiveTimestampMs(isoLike, resolvedTimeZone, options);
  if (Number.isFinite(isoNaiveParsed)) {
    return Math.trunc(isoNaiveParsed);
  }

  return Number.NaN;
};

export const toTimeZoneDateParts = (
  value: unknown,
  timeZone = DEFAULT_TIME_ZONE,
): TimeZoneDateParts | null => {
  const timestampMs = parseTimestampMsInTimeZone(value, timeZone);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  try {
    const zoned = Temporal.Instant.fromEpochMilliseconds(
      Math.trunc(timestampMs),
    ).toZonedDateTimeISO(toSafeTemporalTimeZone(timeZone));
    return {
      year: zoned.year,
      month: zoned.month,
      day: zoned.day,
      hour: zoned.hour,
      minute: zoned.minute,
      second: zoned.second,
      ms: zoned.millisecond,
      weekday: zoned.dayOfWeek % 7,
    };
  } catch {
    return null;
  }
};

const pad2 = (value: unknown): string =>
  String(Math.trunc(Math.abs(Number(value) || 0))).padStart(2, "0");

export const toTimeZoneDateKey = (
  value: unknown,
  timeZone = DEFAULT_TIME_ZONE,
): string => {
  const parts = toTimeZoneDateParts(value, timeZone);
  if (!parts) {
    return "";
  }
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

export const toTimeZoneTimeKey = (
  value: unknown,
  timeZone = DEFAULT_TIME_ZONE,
  includeSeconds = false,
): string => {
  const parts = toTimeZoneDateParts(value, timeZone);
  if (!parts) {
    return "";
  }
  if (includeSeconds) {
    return `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  }
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
};

export const toTimeZoneDateTime = (
  value: unknown,
  timeZone = DEFAULT_TIME_ZONE,
  includeSeconds = false,
): string => {
  const dateKey = toTimeZoneDateKey(value, timeZone);
  if (!dateKey) {
    return "";
  }
  return `${dateKey} ${toTimeZoneTimeKey(value, timeZone, includeSeconds)}`;
};

export const toTimeZoneDayStartMs = (
  value: unknown,
  timeZone = DEFAULT_TIME_ZONE,
): number => {
  const dateKey = toTimeZoneDateKey(value, timeZone);
  if (!dateKey) {
    return Number.NaN;
  }
  return parseTimestampMsInTimeZone(dateKey, timeZone);
};

export const shiftDateKey = (dateKey: string, dayOffset: number): string => {
  try {
    return Temporal.PlainDate.from(dateKey)
      .add({
        days: Number.isFinite(dayOffset) ? Math.trunc(dayOffset) : 0,
      })
      .toString();
  } catch {
    return "";
  }
};

export const compareDateKeys = (left: string, right: string): number => {
  try {
    const leftDate = Temporal.PlainDate.from(left);
    const rightDate = Temporal.PlainDate.from(right);
    return Temporal.PlainDate.compare(leftDate, rightDate);
  } catch {
    return Number.NaN;
  }
};

export const countDateKeysBetween = (
  fromDateKey: string,
  toDateKey: string,
): number => {
  try {
    const fromDate = Temporal.PlainDate.from(fromDateKey);
    const toDate = Temporal.PlainDate.from(toDateKey);
    return Math.trunc(
      (toDate.toString() === fromDate.toString()
        ? 0
        : toDate.since(fromDate, { largestUnit: "day" }).days),
    );
  } catch {
    return Number.NaN;
  }
};

export const formatDateByLocaleInTimeZone = (
  value: unknown,
  locale: string,
  timeZone = DEFAULT_TIME_ZONE,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const timestampMs = parseTimestampMsInTimeZone(value, timeZone);
  if (!Number.isFinite(timestampMs)) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat(locale || "en-US", {
      ...options,
      timeZone: toSafeTemporalTimeZone(timeZone),
    }).format(new Date(timestampMs));
  } catch {
    return toTimeZoneDateTime(timestampMs, timeZone, false);
  }
};

export const getDateKeyFromTimestampMs = (
  timestampMs: number,
  timeZone = DEFAULT_TIME_ZONE,
): string => toTimeZoneDateKey(timestampMs, timeZone);

export const getDateKeyStartMs = (
  dateKey: string,
  timeZone = DEFAULT_TIME_ZONE,
): number => parseTimestampMsInTimeZone(dateKey, timeZone);

export const getDateKeyEndExclusiveMs = (
  dateKey: string,
  timeZone = DEFAULT_TIME_ZONE,
): number => {
  const startMs = getDateKeyStartMs(dateKey, timeZone);
  if (!Number.isFinite(startMs)) {
    return Number.NaN;
  }
  const nextDateKey = shiftDateKey(dateKey, 1);
  return getDateKeyStartMs(nextDateKey, timeZone);
};

export const normalizeTimeZoneLabel = (value: string): string =>
  String(value ?? "").trim() || DEFAULT_TIME_ZONE;

export const isUtcLikeTimeZone = (value: string): boolean => {
  const normalized = normalizeTimeZone(value);
  return (
    normalized === "Etc/UTC" ||
    normalized === "UTC" ||
    normalized === "Etc/GMT"
  );
};

export const getTimeZoneDaySpanMs = (
  timestampMs: number,
  timeZone = DEFAULT_TIME_ZONE,
): number => {
  const dayStart = toTimeZoneDayStartMs(timestampMs, timeZone);
  const nextDayStart = getDateKeyStartMs(
    shiftDateKey(toTimeZoneDateKey(timestampMs, timeZone), 1),
    timeZone,
  );
  if (!Number.isFinite(dayStart) || !Number.isFinite(nextDayStart)) {
    return DAY_MS;
  }
  return Math.max(1, nextDayStart - dayStart);
};
