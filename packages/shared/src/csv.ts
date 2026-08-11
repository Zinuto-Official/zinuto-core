// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMsInTimeZone } from "./timezone.js";

export type CsvTimestampMode = "SINGLE" | "SPLIT";

const normalizeSplitTimeDigits = (rawValue: unknown): string => {
  const digits = String(rawValue || "").trim();
  if (!/^\d{1,6}$/.test(digits)) {
    return digits;
  }
  if (digits.length <= 2) {
    return `${digits.padStart(2, "0")}0000`;
  }
  if (digits.length <= 4) {
    return `${digits.padStart(4, "0")}00`;
  }
  return digits.padStart(6, "0");
};

type SplitDateTimeParts = {
  dateText: string;
  timeText: string | null;
};

const readSplitDateTimeParts = (rawValue: string): SplitDateTimeParts | null => {
  const match = rawValue.match(/^(\d{4}([./-])\d{1,2}\2\d{1,2})(?:[T\s]+(.+))?$/);
  if (!match) {
    return null;
  }
  return {
    dateText: match[1] ?? "",
    timeText: match[3]?.trim() || null,
  };
};

const normalizeClockTimeText = (rawValue: string): string | null => {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }
  const digitText = normalizeSplitTimeDigits(value);
  const digitMatch = digitText.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (digitMatch) {
    const hour = Number(digitMatch[1]);
    const minute = Number(digitMatch[2]);
    const second = Number(digitMatch[3]);
    if (hour > 23 || minute > 59 || second > 59) {
      return null;
    }
    return `${digitMatch[1]}:${digitMatch[2]}:${digitMatch[3]}`;
  }

  const clockMatch = value.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2})(\.\d+)?)?$/);
  if (!clockMatch) {
    return null;
  }
  const hour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2]);
  const second = Number(clockMatch[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const trimmedFraction = clockMatch[4]?.replace(/0+$/, "") ?? "";
  const fraction = trimmedFraction === "." ? "" : trimmedFraction;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${fraction}`;
};

const isZeroClockTimeText = (rawValue: string): boolean => {
  const normalized = normalizeClockTimeText(rawValue);
  return normalized !== null && /^00:00:00(?:\.0*)?$/.test(normalized);
};

export const parseCsvTimestampValue = (
  rawValue: string,
  timeZone?: string,
): number | null => {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }
  const parsed = parseTimestampMsInTimeZone(value, timeZone, {
    // DuckDB resolves a repeated wall-clock time to the later instant. The
    // preview must make the same choice or the confirmed rows change at write.
    disambiguation: "later",
    overflow: "reject",
  });
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

export const composeCsvTimestampText = (
  dateRaw: string,
  timeRaw: string,
  timestampMode: CsvTimestampMode,
): string => {
  const dateText = String(dateRaw || "").trim();
  const timeText = String(timeRaw || "").trim();
  if (!dateText) {
    return "";
  }
  if (timestampMode !== "SPLIT") {
    return dateText;
  }
  if (!timeText) {
    return dateText;
  }
  if (/^\d{8}$/.test(dateText) && /^\d{1,6}$/.test(timeText)) {
    return `${dateText}${normalizeSplitTimeDigits(timeText)}`;
  }
  const normalizedSplitTime = normalizeClockTimeText(timeText);
  const splitDateTime = readSplitDateTimeParts(dateText);
  if (splitDateTime?.timeText) {
    const dateColumnTime = normalizeClockTimeText(splitDateTime.timeText);
    if (
      dateColumnTime &&
      normalizedSplitTime &&
      (isZeroClockTimeText(splitDateTime.timeText) || dateColumnTime === normalizedSplitTime)
    ) {
      return `${splitDateTime.dateText} ${normalizedSplitTime}`;
    }
  }
  if (splitDateTime && !splitDateTime.timeText && normalizedSplitTime) {
    return `${splitDateTime.dateText} ${normalizedSplitTime}`;
  }
  return `${dateText} ${timeText}`;
};
