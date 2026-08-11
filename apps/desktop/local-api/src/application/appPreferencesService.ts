// SPDX-License-Identifier: GPL-3.0-only

import { nowIso } from "../kernel/time.js";
import {
  readAppPreferencesRow,
  updateAppUiSettingsJson,
  updateDataPoolRemovedSymbolsJson,
  type AppPreferencesRow,
} from "./ports/infrastructure/db/preferences/appPreferencesStore.js";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AppPreferences = {
  uiSettings: Record<string, JsonValue>;
  dataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const toJsonValue = (value: unknown): JsonValue | undefined => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    const normalizedItems: JsonValue[] = [];
    value.forEach((item) => {
      const normalized = toJsonValue(item);
      if (normalized !== undefined) {
        normalizedItems.push(normalized);
      }
    });
    return normalizedItems;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const normalizedObject: Record<string, JsonValue> = {};
  Object.entries(value).forEach(([key, item]) => {
    const normalized = toJsonValue(item);
    if (normalized !== undefined) {
      normalizedObject[key] = normalized;
    }
  });
  return normalizedObject;
};

export const sanitizeAppUiSettings = (
  value: unknown,
): Record<string, JsonValue> => {
  if (!isPlainObject(value)) {
    return {};
  }
  const normalized = toJsonValue(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return {};
  }
  return normalized as Record<string, JsonValue>;
};

export const sanitizeDataPoolRemovedSymbolsBySourceId = (
  value: unknown,
): Record<string, string[]> => {
  if (!isPlainObject(value)) {
    return {};
  }
  const normalizedEntries: Array<[string, string[]]> = [];
  Object.entries(value).forEach(([rawSourceId, rawSymbols]) => {
    const sourceId = String(rawSourceId || "").trim();
    if (!sourceId || !Array.isArray(rawSymbols)) {
      return;
    }
    const symbols = Array.from(
      new Set(
        rawSymbols
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toUpperCase())
          .filter((item) => item.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right, "en"));
    if (!symbols.length) {
      return;
    }
    normalizedEntries.push([sourceId, symbols]);
  });
  normalizedEntries.sort((left, right) => left[0].localeCompare(right[0], "en"));
  return Object.fromEntries(normalizedEntries);
};

const parseJsonObject = (
  encoded: unknown,
): Record<string, unknown> => {
  const normalized = String(encoded ?? "").trim();
  if (!normalized) {
    return {};
  }
  try {
    const parsed = JSON.parse(normalized) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const mapPreferencesRow = (row: AppPreferencesRow): AppPreferences => {
  const uiSettings = sanitizeAppUiSettings(parseJsonObject(row.ui_settings_json));
  const dataPoolRemovedSymbolsBySourceId =
    sanitizeDataPoolRemovedSymbolsBySourceId(
      parseJsonObject(row.data_pool_removed_symbols_json),
    );
  return {
    uiSettings,
    dataPoolRemovedSymbolsBySourceId,
  };
};

export const getAppPreferences = (): AppPreferences => {
  return mapPreferencesRow(readAppPreferencesRow(nowIso()));
};

export const setAppUiSettings = (
  uiSettingsInput: unknown,
): Record<string, JsonValue> => {
  const uiSettings = sanitizeAppUiSettings(uiSettingsInput);
  updateAppUiSettingsJson(JSON.stringify(uiSettings), nowIso());
  return getAppPreferences().uiSettings;
};

export const setDataPoolRemovedSymbolsBySourceId = (
  input: unknown,
): Record<string, string[]> => {
  const normalized = sanitizeDataPoolRemovedSymbolsBySourceId(input);
  updateDataPoolRemovedSymbolsJson(JSON.stringify(normalized), nowIso());
  return getAppPreferences().dataPoolRemovedSymbolsBySourceId;
};
