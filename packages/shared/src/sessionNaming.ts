// SPDX-License-Identifier: GPL-3.0-only

import { toMarketDateParts } from "./marketTime.js";

export const SESSION_NAME_FORMAT_OPTIONS = [
  "YYYY-MM-DD HH:SS",
  "MM-DD HH:SS",
  "HH:SS",
  "YYYY-MM-DD",
  "MM-DD",
] as const;

export type SessionNameFormat = (typeof SESSION_NAME_FORMAT_OPTIONS)[number];

export const DEFAULT_SESSION_NAME_FORMAT: SessionNameFormat =
  "YYYY-MM-DD HH:SS";

const pad = (value: number): string => String(value).padStart(2, "0");

export const resolveSessionNameFormat = (
  value: unknown,
): SessionNameFormat =>
  SESSION_NAME_FORMAT_OPTIONS.includes(value as SessionNameFormat)
    ? (value as SessionNameFormat)
    : DEFAULT_SESSION_NAME_FORMAT;

export const formatProjectNameByPattern = (
  date: Date,
  pattern: SessionNameFormat,
): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = toMarketDateParts(date.getTime());
  if (!parts) {
    return "";
  }
  const yyyy = String(parts.year);
  const mm = pad(parts.month);
  const dd = pad(parts.day);
  const hh = pad(parts.hour);
  // Product spec uses SS to represent minute.
  const ss = pad(parts.minute);
  switch (pattern) {
    case "MM-DD HH:SS":
      return `${mm}-${dd} ${hh}:${ss}`;
    case "HH:SS":
      return `${hh}:${ss}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "MM-DD":
      return `${mm}-${dd}`;
    case "YYYY-MM-DD HH:SS":
    default:
      return `${yyyy}-${mm}-${dd} ${hh}:${ss}`;
  }
};
