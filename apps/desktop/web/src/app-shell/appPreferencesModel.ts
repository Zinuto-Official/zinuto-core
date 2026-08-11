// SPDX-License-Identifier: GPL-3.0-only

import type { ApiAppPreferences } from "@/api";
import type { UiSettings } from "@/frontend-kernel/appTypes";

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const normalizeStringArrayRecord = (
  value: unknown,
): Record<string, string[]> => {
  const record = toRecord(value);
  if (!record) {
    return {};
  }
  const normalized: Record<string, string[]> = {};
  Object.entries(record).forEach(([rawKey, rawValue]) => {
    const key = String(rawKey ?? "").trim();
    if (!key || !Array.isArray(rawValue)) {
      return;
    }
    const values = Array.from(
      new Set(
        rawValue
          .map((item) => String(item ?? "").trim().toUpperCase())
          .filter((item) => item.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right, "en"));
    if (!values.length) {
      return;
    }
    normalized[key] = values;
  });
  return normalized;
};

export type NormalizedAppPreferences = {
  uiSettings: UiSettings;
  dataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
};

const APP_PREFERENCES_BOOT_CACHE_KEY = "zinuto.appPreferences.boot.v1";
export const APP_THEME_MODE_BOOT_CACHE_KEY = "zinuto.themeMode.boot.v1";

export type CachedAppThemeMode = "dark" | "light" | "system";

export const normalizeCachedAppThemeMode = (
  value: unknown,
): CachedAppThemeMode | null =>
  value === "dark" || value === "light" || value === "system"
    ? value
    : null;

export const resolveAppStartupTheme = ({
  systemTheme,
  themeMode,
}: {
  systemTheme: "dark" | "light";
  themeMode: unknown;
}): "dark" | "light" => {
  const normalizedThemeMode = normalizeCachedAppThemeMode(themeMode);
  if (normalizedThemeMode === "system") {
    return systemTheme;
  }
  return normalizedThemeMode === "dark" ? "dark" : "light";
};

export const normalizeAppPreferences = (
  value: ApiAppPreferences | null | undefined,
): NormalizedAppPreferences => {
  return {
    uiSettings: (toRecord(value?.uiSettings) ?? {}) as UiSettings,
    dataPoolRemovedSymbolsBySourceId: normalizeStringArrayRecord(
      value?.dataPoolRemovedSymbolsBySourceId,
    ),
  };
};

export const createEmptyAppPreferencesSnapshot = (): NormalizedAppPreferences => ({
  uiSettings: {},
  dataPoolRemovedSymbolsBySourceId: {},
});

const readLocalStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

export const readCachedAppPreferencesSnapshot =
  (): NormalizedAppPreferences | null => {
    const storage = readLocalStorage();
    if (!storage) {
      return null;
    }
    try {
      const raw = storage.getItem(APP_PREFERENCES_BOOT_CACHE_KEY);
      if (!raw) {
        return null;
      }
      return normalizeAppPreferences(JSON.parse(raw) as ApiAppPreferences);
    } catch {
      storage.removeItem(APP_PREFERENCES_BOOT_CACHE_KEY);
      return null;
    }
  };

export const readCachedAppThemeMode = (): CachedAppThemeMode | null => {
  const storage = readLocalStorage();
  if (!storage) {
    return null;
  }
  try {
    return normalizeCachedAppThemeMode(
      storage.getItem(APP_THEME_MODE_BOOT_CACHE_KEY),
    );
  } catch {
    return null;
  }
};

export const writeCachedAppThemeMode = (themeMode: unknown): void => {
  const storage = readLocalStorage();
  if (!storage) {
    return;
  }
  const normalizedThemeMode = normalizeCachedAppThemeMode(themeMode);
  try {
    if (normalizedThemeMode) {
      storage.setItem(APP_THEME_MODE_BOOT_CACHE_KEY, normalizedThemeMode);
    } else {
      storage.removeItem(APP_THEME_MODE_BOOT_CACHE_KEY);
    }
  } catch {
    // The complete preference snapshot remains the fallback startup source.
  }
};

export const writeCachedAppPreferencesSnapshot = (
  preferences: NormalizedAppPreferences,
): void => {
  const storage = readLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(
      APP_PREFERENCES_BOOT_CACHE_KEY,
      JSON.stringify(preferences),
    );
    writeCachedAppThemeMode(preferences.uiSettings.themeMode);
  } catch {
    // Startup cache is opportunistic; backend preferences remain the truth.
  }
};

export const writeCachedAppUiSettingsSnapshot = (
  uiSettings: UiSettings,
): void => {
  const current = readCachedAppPreferencesSnapshot() ??
    createEmptyAppPreferencesSnapshot();
  writeCachedAppPreferencesSnapshot({
    ...current,
    uiSettings,
  });
};

export const writeCachedRemovedSymbolsSnapshot = (
  dataPoolRemovedSymbolsBySourceId: Record<string, string[]>,
): void => {
  const current = readCachedAppPreferencesSnapshot() ??
    createEmptyAppPreferencesSnapshot();
  writeCachedAppPreferencesSnapshot({
    ...current,
    dataPoolRemovedSymbolsBySourceId: normalizeStringArrayRecord(
      dataPoolRemovedSymbolsBySourceId,
    ),
  });
};
