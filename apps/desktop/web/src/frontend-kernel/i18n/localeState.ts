// SPDX-License-Identifier: GPL-3.0-only

import { useSyncExternalStore } from "react";
import {
  APP_UI_BASE_LANGUAGE,
  APP_UI_LANGUAGES,
  type AppUiLanguage,
} from "@/ui/config/appUiLanguage";

const UI_LANGUAGE_CHANGE_EVENT = "zinuto:ui-language-change";
const UI_LANGUAGE_STORAGE_KEY = "zinuto:ui-language";
const UI_LANGUAGE_SOURCE_STORAGE_KEY = "zinuto:ui-language-source";

export type UiLanguagePreferenceSource = "SYSTEM" | "USER";

type UiLanguageChangeDetail = {
  language: AppUiLanguage;
};

type UiLanguageChangeListener = (language: AppUiLanguage) => void;
export type UiLanguageStorage = Pick<Storage, "getItem" | "setItem">;
export type UiLanguagePreference = {
  language: AppUiLanguage;
  source: UiLanguagePreferenceSource;
};
export type SetCurrentUiLanguageOptions = {
  source?: UiLanguagePreferenceSource;
  storage?: UiLanguageStorage | null;
};

const isAppUiLanguage = (value: unknown): value is AppUiLanguage =>
  typeof value === "string" &&
  APP_UI_LANGUAGES.includes(value as AppUiLanguage);

const readUiLanguageStorage = (): UiLanguageStorage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

export const resolveUiLanguageTag = (value: unknown): AppUiLanguage | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === "en" || raw.startsWith("en-")) {
    return "en";
  }
  if (raw === "zh" || raw === "zh-cn" || raw.startsWith("zh-hans")) {
    return "zh-CN";
  }
  if (raw === "ja" || raw.startsWith("ja-")) {
    return "ja";
  }
  if (raw === "ko" || raw.startsWith("ko-")) {
    return "ko";
  }
  if (raw === "es" || raw.startsWith("es-")) {
    return "es";
  }
  return null;
};

const resolveNavigatorUiLanguage = (): AppUiLanguage | null => {
  if (typeof navigator === "undefined") {
    return null;
  }
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];
  for (const candidate of candidates) {
    const resolved = resolveUiLanguageTag(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};

const resolveUiLanguagePreferenceSource = (
  value: unknown,
): UiLanguagePreferenceSource =>
  value === "USER" ? "USER" : "SYSTEM";

const resolveStoredUiLanguagePreferenceSource = (
  value: unknown,
): UiLanguagePreferenceSource | null =>
  value === "USER" || value === "SYSTEM" ? value : null;

export const resolveNextUiLanguagePreference = ({
  currentSource,
  requestedLanguage,
  requestedSource,
}: {
  currentSource: UiLanguagePreferenceSource;
  requestedLanguage: unknown;
  requestedSource?: unknown;
}): UiLanguagePreference | null => {
  const nextSource = resolveUiLanguagePreferenceSource(requestedSource);
  if (currentSource === "USER" && nextSource === "SYSTEM") {
    return null;
  }
  return {
    language: isAppUiLanguage(requestedLanguage)
      ? requestedLanguage
      : APP_UI_BASE_LANGUAGE,
    source: nextSource,
  };
};

export const resolveInitialUiLanguagePreference = (
  storage: UiLanguageStorage | null = readUiLanguageStorage(),
): UiLanguagePreference => {
  try {
    const persistedSource = resolveStoredUiLanguagePreferenceSource(
      storage?.getItem(UI_LANGUAGE_SOURCE_STORAGE_KEY),
    );
    const persistedLanguage = storage?.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (
      persistedSource === "USER" ||
      (!persistedSource &&
        persistedLanguage !== null &&
        persistedLanguage !== undefined)
    ) {
      return {
        language: isAppUiLanguage(persistedLanguage)
          ? persistedLanguage
          : APP_UI_BASE_LANGUAGE,
        source: "USER",
      };
    }
    return {
      language: resolveNavigatorUiLanguage() ?? APP_UI_BASE_LANGUAGE,
      source: "SYSTEM",
    };
  } catch {
    return {
      language: resolveNavigatorUiLanguage() ?? APP_UI_BASE_LANGUAGE,
      source: "SYSTEM",
    };
  }
};

export const resolveInitialUiLanguage = (
  storage: UiLanguageStorage | null = readUiLanguageStorage(),
): AppUiLanguage => resolveInitialUiLanguagePreference(storage).language;

const persistUiLanguage = (
  language: AppUiLanguage,
  source: UiLanguagePreferenceSource,
  storage: UiLanguageStorage | null = readUiLanguageStorage(),
): void => {
  try {
    storage?.setItem(UI_LANGUAGE_STORAGE_KEY, language);
    storage?.setItem(UI_LANGUAGE_SOURCE_STORAGE_KEY, source);
  } catch {
    // Ignore storage write failures and keep the in-memory state authoritative.
  }
};

const initialUiLanguagePreference = resolveInitialUiLanguagePreference();
let currentUiLanguage: AppUiLanguage = initialUiLanguagePreference.language;
let currentUiLanguageSource: UiLanguagePreferenceSource =
  initialUiLanguagePreference.source;
const uiLanguageListeners = new Set<UiLanguageChangeListener>();

const notifyUiLanguageListeners = (language: AppUiLanguage): void => {
  for (const listener of uiLanguageListeners) {
    listener(language);
  }
};

const dispatchUiLanguageChange = (language: AppUiLanguage): void => {
  notifyUiLanguageListeners(language);
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent !== "function"
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<UiLanguageChangeDetail>(UI_LANGUAGE_CHANGE_EVENT, {
      detail: { language },
    }),
  );
};

export const getCurrentUiLanguage = (): AppUiLanguage => currentUiLanguage;

export const getCurrentUiLanguageSource = (): UiLanguagePreferenceSource =>
  currentUiLanguageSource;

export const setCurrentUiLanguage = (
  language: AppUiLanguage,
  options: SetCurrentUiLanguageOptions = {},
): void => {
  const nextPreference = resolveNextUiLanguagePreference({
    currentSource: currentUiLanguageSource,
    requestedLanguage: language,
    requestedSource: options.source,
  });
  if (!nextPreference) {
    return;
  }
  const { language: nextLanguage, source: nextSource } = nextPreference;
  currentUiLanguageSource = nextSource;
  if (currentUiLanguageSource === "USER") {
    persistUiLanguage(nextLanguage, currentUiLanguageSource, options.storage);
  }
  if (nextLanguage === currentUiLanguage) {
    return;
  }
  currentUiLanguage = nextLanguage;
  dispatchUiLanguageChange(currentUiLanguage);
};

export const onCurrentUiLanguageChange = (
  listener: (language: AppUiLanguage) => void,
): (() => void) => {
  uiLanguageListeners.add(listener);
  return () => {
    uiLanguageListeners.delete(listener);
  };
};

const subscribeCurrentUiLanguage = (
  listener: () => void,
): (() => void) =>
  onCurrentUiLanguageChange(() => {
    listener();
  });

export const useCurrentUiLanguage = (): AppUiLanguage =>
  useSyncExternalStore(
    subscribeCurrentUiLanguage,
    getCurrentUiLanguage,
    getCurrentUiLanguage,
  );
