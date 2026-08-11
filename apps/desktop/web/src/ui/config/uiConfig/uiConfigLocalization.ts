// SPDX-License-Identifier: GPL-3.0-only

import {
  formatMessage,
  loadLocaleCatalog,
  type MessageId,
} from "@zinuto/shared/i18n";
import {
  APP_UI_LANGUAGES,
  type AppUiLanguage,
} from "@/ui/config/appUiLanguage";

export const uiConfigMessageId = (key: string): MessageId =>
  `uiConfig.${key}` as MessageId;

export const formatUiConfigMessage = (
  language: AppUiLanguage,
  key: string,
  values?: Record<string, string | number | boolean | null | undefined>,
): string => formatMessage(language, uiConfigMessageId(key), values);

export const readUiConfigCatalogValue = (
  language: AppUiLanguage,
  key: string,
): string => {
  const catalog = loadLocaleCatalog(language, "uiConfig" as never) as Record<
    string,
    string
  >;
  const value = catalog[key];
  if (typeof value !== "string") {
    throw new Error(`Missing uiConfig bundle "${key}" for ${language}`);
  }
  return value;
};

export const buildLocalizedRecord = <T>(
  builder: (language: AppUiLanguage) => T,
): Record<AppUiLanguage, T> => {
  const cache = new Map<AppUiLanguage, T>();
  const isLanguageKey = (value: PropertyKey): value is AppUiLanguage =>
    typeof value === "string" &&
    APP_UI_LANGUAGES.includes(value as AppUiLanguage);

  return new Proxy({} as Record<AppUiLanguage, T>, {
    get: (_target, property) => {
      if (!isLanguageKey(property)) {
        return undefined;
      }
      if (!cache.has(property)) {
        cache.set(property, builder(property));
      }
      return cache.get(property);
    },
    set: (_target, property, value) => {
      if (!isLanguageKey(property)) {
        return false;
      }
      cache.set(property, value as T);
      return true;
    },
    has: (_target, property) => isLanguageKey(property),
    ownKeys: () => [...APP_UI_LANGUAGES],
    getOwnPropertyDescriptor: (_target, property) =>
      isLanguageKey(property)
        ? { configurable: true, enumerable: true }
        : undefined,
  });
};

export const normalizeTradingCopyText = (
  _language: AppUiLanguage,
  value: string,
): string => value;

export const normalizeTradingCopyTree = <T>(
  language: AppUiLanguage,
  value: T,
): T => {
  if (typeof value === "string") {
    return normalizeTradingCopyText(language, value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTradingCopyTree(language, item)) as T;
  }
  if (value && typeof value === "object") {
    const nextEntries = Object.entries(value as Record<string, unknown>).map(
      ([key, nested]) => [key, normalizeTradingCopyTree(language, nested)],
    );
    return Object.fromEntries(nextEntries) as T;
  }
  return value;
};

export const parseUiConfigJsonBundle = <T>(
  language: AppUiLanguage,
  key: string,
  _fallback: T,
): T => {
  const raw = readUiConfigCatalogValue(language, key);
  const parsed = JSON.parse(raw) as T;
  return normalizeTradingCopyTree(language, parsed);
};
