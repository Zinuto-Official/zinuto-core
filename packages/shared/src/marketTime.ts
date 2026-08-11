// SPDX-License-Identifier: GPL-3.0-only

const DAY_MS = 24 * 60 * 60 * 1000;

export const MARKET_TIMEZONE = "Asia/Shanghai" as const;
export const MARKET_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

type DateKeyParseResult = {
  year: number;
  month: number;
  day: number;
  utcMs: number;
};

export type MarketDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
  weekday: number;
};

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const COMPACT_DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const COMPACT_MINUTE_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const COMPACT_SECOND_RE = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const NAIVE_DATETIME_RE =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2})(?::?(\d{1,2}))?(?::?(\d{1,2}))?(?:\.(\d{1,3}))?)?$/;
const TZ_SUFFIX_RE = /([zZ]|[+-]\d{2}:?[0-9]{2})$/;
const NAMED_TZ_RE = /\b(?:UTC|GMT)\b/i;

const pad2 = (value: unknown): string =>
  String(Math.trunc(Math.abs(Number(value) || 0))).padStart(2, "0");

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

const parseDateKey = (raw: unknown): DateKeyParseResult | null => {
  const matched = String(raw ?? "").trim().match(DATE_KEY_RE);
  if (!matched) {
    return null;
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day);
  const verify = new Date(utcMs);
  if (
    verify.getUTCFullYear() !== year ||
    verify.getUTCMonth() + 1 !== month ||
    verify.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, utcMs };
};

const parseDatePart = (raw: unknown, min: number, max: number): number => {
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    return Number.NaN;
  }
  return numeric;
};

const parseNaiveMarketTimestampMs = (raw: string): number => {
  const compactDate = raw.match(COMPACT_DATE_RE);
  if (compactDate) {
    const year = parseDatePart(compactDate[1], 1900, 2200);
    const month = parseDatePart(compactDate[2], 1, 12);
    const day = parseDatePart(compactDate[3], 1, 31);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return Number.NaN;
    }
    const utcMs = Date.UTC(year, month - 1, day) - MARKET_TZ_OFFSET_MS;
    const verify = new Date(utcMs + MARKET_TZ_OFFSET_MS);
    if (
      verify.getUTCFullYear() !== year ||
      verify.getUTCMonth() + 1 !== month ||
      verify.getUTCDate() !== day
    ) {
      return Number.NaN;
    }
    return utcMs;
  }

  const compactMinute = raw.match(COMPACT_MINUTE_RE);
  if (compactMinute) {
    const year = parseDatePart(compactMinute[1], 1900, 2200);
    const month = parseDatePart(compactMinute[2], 1, 12);
    const day = parseDatePart(compactMinute[3], 1, 31);
    const hour = parseDatePart(compactMinute[4], 0, 23);
    const minute = parseDatePart(compactMinute[5], 0, 59);
    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      Number.isNaN(day) ||
      Number.isNaN(hour) ||
      Number.isNaN(minute)
    ) {
      return Number.NaN;
    }
    const utcMs =
      Date.UTC(year, month - 1, day, hour, minute, 0, 0) -
      MARKET_TZ_OFFSET_MS;
    const verify = new Date(utcMs + MARKET_TZ_OFFSET_MS);
    if (
      verify.getUTCFullYear() !== year ||
      verify.getUTCMonth() + 1 !== month ||
      verify.getUTCDate() !== day ||
      verify.getUTCHours() !== hour ||
      verify.getUTCMinutes() !== minute
    ) {
      return Number.NaN;
    }
    return utcMs;
  }

  const compactSecond = raw.match(COMPACT_SECOND_RE);
  if (compactSecond) {
    const year = parseDatePart(compactSecond[1], 1900, 2200);
    const month = parseDatePart(compactSecond[2], 1, 12);
    const day = parseDatePart(compactSecond[3], 1, 31);
    const hour = parseDatePart(compactSecond[4], 0, 23);
    const minute = parseDatePart(compactSecond[5], 0, 59);
    const second = parseDatePart(compactSecond[6], 0, 59);
    if (
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      Number.isNaN(day) ||
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      Number.isNaN(second)
    ) {
      return Number.NaN;
    }
    const utcMs =
      Date.UTC(year, month - 1, day, hour, minute, second, 0) -
      MARKET_TZ_OFFSET_MS;
    const verify = new Date(utcMs + MARKET_TZ_OFFSET_MS);
    if (
      verify.getUTCFullYear() !== year ||
      verify.getUTCMonth() + 1 !== month ||
      verify.getUTCDate() !== day ||
      verify.getUTCHours() !== hour ||
      verify.getUTCMinutes() !== minute ||
      verify.getUTCSeconds() !== second
    ) {
      return Number.NaN;
    }
    return utcMs;
  }

  const matched = raw.match(NAIVE_DATETIME_RE);
  if (!matched) {
    return Number.NaN;
  }
  const year = parseDatePart(matched[1], 1900, 2200);
  const month = parseDatePart(matched[2], 1, 12);
  const day = parseDatePart(matched[3], 1, 31);
  const hour = parseDatePart(matched[4] ?? "0", 0, 23);
  const minute = parseDatePart(matched[5] ?? "0", 0, 59);
  const second = parseDatePart(matched[6] ?? "0", 0, 59);
  const msText = String(matched[7] ?? "0").padEnd(3, "0").slice(0, 3);
  const ms = parseDatePart(msText, 0, 999);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second) ||
    Number.isNaN(ms)
  ) {
    return Number.NaN;
  }
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second, ms) -
    MARKET_TZ_OFFSET_MS;
  const verify = new Date(utcMs + MARKET_TZ_OFFSET_MS);
  if (
    verify.getUTCFullYear() !== year ||
    verify.getUTCMonth() + 1 !== month ||
    verify.getUTCDate() !== day ||
    verify.getUTCHours() !== hour ||
    verify.getUTCMinutes() !== minute ||
    verify.getUTCSeconds() !== second ||
    verify.getUTCMilliseconds() !== ms
  ) {
    return Number.NaN;
  }
  return utcMs;
};

export const parseTimestampMs = (value: unknown): number => {
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
  if (/^[+-]?\d+$/.test(raw)) {
    const signedDigits = raw.replace(/^[+-]/, "");
    // Compact date shapes (8/12/14 digits) must be parsed as naive market
    // timestamps before the numeric epoch branch, which would otherwise
    // misinterpret e.g. "20250101" as 1970-era epoch milliseconds. When the
    // compact shape is out of range (e.g. a 12-digit epoch millisecond from
    // 1973-1978), fall back to the numeric branch so both parsers agree.
    if (
      COMPACT_DATE_RE.test(raw) ||
      COMPACT_MINUTE_RE.test(raw) ||
      COMPACT_SECOND_RE.test(raw)
    ) {
      const compactParsed = parseNaiveMarketTimestampMs(raw);
      if (Number.isFinite(compactParsed)) {
        return Math.trunc(compactParsed);
      }
    }
    return normalizeNumericTimestamp(Number(raw), signedDigits.length);
  }

  const dateKey = parseDateKey(raw);
  if (dateKey) {
    return dateKey.utcMs - MARKET_TZ_OFFSET_MS;
  }

  const naiveParsed = parseNaiveMarketTimestampMs(raw);
  if (Number.isFinite(naiveParsed)) {
    return Math.trunc(naiveParsed);
  }

  const parsed = Date.parse(raw);
  if (
    Number.isFinite(parsed) &&
    (TZ_SUFFIX_RE.test(raw) || NAMED_TZ_RE.test(raw))
  ) {
    return Math.trunc(parsed);
  }

  const isoLike = raw.includes("T") ? raw : raw.replace(" ", "T");
  const isoNaiveParsed = parseNaiveMarketTimestampMs(isoLike);
  if (Number.isFinite(isoNaiveParsed)) {
    return Math.trunc(isoNaiveParsed);
  }
  const fallback = Date.parse(isoLike);
  if (
    Number.isFinite(fallback) &&
    (TZ_SUFFIX_RE.test(isoLike) || NAMED_TZ_RE.test(isoLike))
  ) {
    return Math.trunc(fallback);
  }
  return Number.NaN;
};

export const isMarketDateKey = (value: unknown): boolean =>
  Boolean(parseDateKey(value));

export const toMarketDateParts = (value: unknown): MarketDateParts | null => {
  const dateKey = parseDateKey(value);
  if (dateKey) {
    const shifted = dateKey.utcMs;
    const date = new Date(shifted);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
      ms: 0,
      weekday: date.getUTCDay(),
    };
  }
  const timestampMs = parseTimestampMs(value);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  const shifted = timestampMs + MARKET_TZ_OFFSET_MS;
  const date = new Date(shifted);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    ms: date.getUTCMilliseconds(),
    weekday: date.getUTCDay(),
  };
};

export const toMarketDateKey = (value: unknown): string => {
  const parts = toMarketDateParts(value);
  if (!parts) {
    return "";
  }
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

export const toMarketTimeKey = (
  value: unknown,
  includeSeconds = false,
): string => {
  const parts = toMarketDateParts(value);
  if (!parts) {
    return "";
  }
  if (includeSeconds) {
    return `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  }
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
};

export const toMarketDateTime = (
  value: unknown,
  includeSeconds = false,
): string => {
  const dateKey = toMarketDateKey(value);
  if (!dateKey) {
    return "";
  }
  return `${dateKey} ${toMarketTimeKey(value, includeSeconds)}`;
};

export const toMarketDayStartMs = (value: unknown): number => {
  const dateKey = parseDateKey(value);
  if (dateKey) {
    return dateKey.utcMs - MARKET_TZ_OFFSET_MS;
  }
  const timestampMs = parseTimestampMs(value);
  if (!Number.isFinite(timestampMs)) {
    return Number.NaN;
  }
  return (
    Math.floor((timestampMs + MARKET_TZ_OFFSET_MS) / DAY_MS) * DAY_MS -
    MARKET_TZ_OFFSET_MS
  );
};

const dateKeyToUtcMs = (value: string): number => {
  const parsed = parseDateKey(value);
  return parsed ? parsed.utcMs : Number.NaN;
};

const utcMsToDateKey = (utcMs: number): string => {
  if (!Number.isFinite(utcMs)) {
    return "";
  }
  const date = new Date(utcMs);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;
};

export const shiftMarketDateKey = (
  dateKey: string,
  dayOffset: number,
): string => {
  const base = dateKeyToUtcMs(dateKey);
  if (!Number.isFinite(base)) {
    return "";
  }
  const normalizedOffset = Number.isFinite(dayOffset) ? Math.trunc(dayOffset) : 0;
  return utcMsToDateKey(base + normalizedOffset * DAY_MS);
};

export const compareMarketDateKeys = (left: string, right: string): number => {
  const leftMs = dateKeyToUtcMs(left);
  const rightMs = dateKeyToUtcMs(right);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) {
    return Number.NaN;
  }
  if (leftMs === rightMs) {
    return 0;
  }
  return leftMs < rightMs ? -1 : 1;
};

export const countMarketDaysBetween = (
  fromDateKey: string,
  toDateKey: string,
): number => {
  const fromMs = dateKeyToUtcMs(fromDateKey);
  const toMs = dateKeyToUtcMs(toDateKey);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return Number.NaN;
  }
  return Math.trunc((toMs - fromMs) / DAY_MS);
};

export const formatMarketDateByLocale = (
  value: unknown,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const timestampMs = parseTimestampMs(value);
  if (!Number.isFinite(timestampMs)) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat(locale || "en-US", {
      ...options,
      timeZone: MARKET_TIMEZONE,
    }).format(new Date(timestampMs));
  } catch {
    return toMarketDateTime(timestampMs, false);
  }
};
