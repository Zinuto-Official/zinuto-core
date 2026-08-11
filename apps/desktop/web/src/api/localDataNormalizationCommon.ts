// SPDX-License-Identifier: GPL-3.0-only

import type { CsvTimestampMode } from '@/api/localDataTypes';

export const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const toTrimmedString = (value: unknown): string => String(value ?? "").trim();

export const toPreservedPathString = (value: unknown): string => {
  const raw = String(value ?? "");
  return raw.trim() ? raw : "";
};

export const toPreservedRelativePathString = (value: unknown): string => {
  const raw = toPreservedPathString(value);
  return raw ? raw.replace(/^\/+/, "") : "";
};

export const requireTrimmedString = (value: unknown, fieldName: string): string => {
  const normalized = toTrimmedString(value);
  if (!normalized) {
    throw new Error(`Invalid local data import preview ${fieldName}`);
  }
  return normalized;
};

export const toNullableTrimmedString = (value: unknown): string | null => {
  const normalized = toTrimmedString(value);
  return normalized || null;
};

export const toNonNegativeInt = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
};

export const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const toNonNegativeNumber = (value: unknown): number =>
  Math.max(0, toFiniteNumber(value));

export const normalizeBaseTimeframeValue = (
  value: unknown,
): "1m" | "5m" | "1h" | "1d" | null => {
  const normalized = toTrimmedString(value);
  if (
    normalized === "1m" ||
    normalized === "5m" ||
    normalized === "1h" ||
    normalized === "1d"
  ) {
    return normalized;
  }
  return null;
};

export const normalizeBaseTimeframe = (value: unknown): "1m" | "5m" | "1h" | "1d" => {
  const normalized = normalizeBaseTimeframeValue(value);
  if (normalized) {
    return normalized;
  }
  return "1d";
};

export const requireBaseTimeframe = (
  value: unknown,
  fieldName: string,
): "1m" | "5m" | "1h" | "1d" => {
  const normalized = normalizeBaseTimeframeValue(value);
  if (!normalized) {
    throw new Error(`Invalid local data import preview ${fieldName}`);
  }
  return normalized;
};

export const requireImportScopeStrategy = (
  value: unknown,
  fieldName: string,
): "FLAT" | "WITH_PARENT" => {
  const normalized = toTrimmedString(value);
  if (normalized === "FLAT" || normalized === "WITH_PARENT") {
    return normalized;
  }
  throw new Error(`Invalid local data import preview ${fieldName}`);
};

export const normalizeTimeZoneOrigin = (
  value: unknown,
): "PRESET_DEFAULT" | "INFERRED_DEFAULT" | "USER_SELECTED" => {
  const normalized = toTrimmedString(value);
  return normalized === "PRESET_DEFAULT" || normalized === "USER_SELECTED"
    ? normalized
    : "INFERRED_DEFAULT";
};

export const toNullableTimeZoneOrigin = (
  value: unknown,
): "PRESET_DEFAULT" | "INFERRED_DEFAULT" | "USER_SELECTED" | null => {
  const normalized = toTrimmedString(value);
  return normalized === "PRESET_DEFAULT" ||
    normalized === "INFERRED_DEFAULT" ||
    normalized === "USER_SELECTED"
    ? normalized
    : null;
};

export const normalizeCsvTimestampMode = (value: unknown): CsvTimestampMode =>
  toTrimmedString(value).toUpperCase() === "SPLIT" ? "SPLIT" : "SINGLE";
