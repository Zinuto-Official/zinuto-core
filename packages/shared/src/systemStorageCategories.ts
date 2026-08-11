// SPDX-License-Identifier: GPL-3.0-only

export const SYSTEM_STORAGE_CATEGORY_KEYS = [
  "training",
  "replayNotes",
  "marketData",
  "systemSettings",
  "stats",
  "other",
] as const;

export type SystemStorageCategoryKey =
  (typeof SYSTEM_STORAGE_CATEGORY_KEYS)[number];

const SYSTEM_STORAGE_CATEGORY_KEY_SET = new Set<string>(
  SYSTEM_STORAGE_CATEGORY_KEYS,
);

export const isSystemStorageCategoryKey = (
  value: unknown,
): value is SystemStorageCategoryKey =>
  typeof value === "string" && SYSTEM_STORAGE_CATEGORY_KEY_SET.has(value);

export const normalizeSystemStorageCategoryKey = (
  value: unknown,
): SystemStorageCategoryKey =>
  isSystemStorageCategoryKey(value) ? value : "other";
