// SPDX-License-Identifier: GPL-3.0-only

import { IntlMessageFormat } from "intl-messageformat";
import {
  I18N_CATALOG_NAMESPACES,
  I18N_MESSAGE_IDS,
  I18N_SOURCE_LOCALES,
} from "./i18n.metadata.generated.js";

export const APP_LOCALES = I18N_SOURCE_LOCALES;
export type AppLocale = (typeof APP_LOCALES)[number];
export const APP_LOCALE_BASE: AppLocale = "en";

export const PSEUDO_LOCALE = "en-XA" as const;
export type PseudoLocale = typeof PSEUDO_LOCALE;
export type SupportedLocale = AppLocale | PseudoLocale;

export const CATALOG_NAMESPACES = I18N_CATALOG_NAMESPACES;
export type CatalogNamespace = (typeof CATALOG_NAMESPACES)[number];

export const MESSAGE_IDS = I18N_MESSAGE_IDS;
export type MessageId = (typeof I18N_MESSAGE_IDS)[number];

export type MessagePrimitive = string | number | boolean | Date | null | undefined;
export type MessageValues = Record<string, MessagePrimitive>;
export type LocaleWidthProfile = "compact" | "expanded";
export type LocaleCatalog = Readonly<
  Record<CatalogNamespace, Readonly<Record<string, string>>>
>;

export type LocalizedMessageToken = {
  id: MessageId;
  values?: MessageValues;
  fallback: string;
};

const installedCatalogs = new Map<AppLocale, LocaleCatalog>();
const COMPACT_LOCALE_SET = new Set<AppLocale>(["zh-CN", "ko", "ja"]);
const formatterCache = new Map<string, IntlMessageFormat>();
const formatWarningCache = new Set<string>();

const GLYPH_MAP = new Map<string, string>([
  ["a", "à"], ["b", "ƀ"], ["c", "ç"], ["d", "ď"], ["e", "ë"], ["f", "ƒ"],
  ["g", "ğ"], ["h", "ĥ"], ["i", "ï"], ["j", "ĵ"], ["k", "ķ"], ["l", "ľ"],
  ["m", "ṁ"], ["n", "ñ"], ["o", "ô"], ["p", "þ"], ["q", "ʠ"], ["r", "ř"],
  ["s", "š"], ["t", "ŧ"], ["u", "ü"], ["v", "ṽ"], ["w", "ŵ"], ["x", "ẋ"],
  ["y", "ÿ"], ["z", "ž"], ["A", "Â"], ["B", "ß"], ["C", "Č"], ["D", "Ď"],
  ["E", "Ë"], ["F", "Ƒ"], ["G", "Ğ"], ["H", "Ħ"], ["I", "Ï"], ["J", "Ĵ"],
  ["K", "Ķ"], ["L", "Ľ"], ["M", "Ṁ"], ["N", "Ñ"], ["O", "Ö"], ["P", "Þ"],
  ["Q", "Ǫ"], ["R", "Ř"], ["S", "Š"], ["T", "Ŧ"], ["U", "Û"], ["V", "Ṽ"],
  ["W", "Ŵ"], ["X", "Ẍ"], ["Y", "Ŷ"], ["Z", "Ž"],
]);

const toPseudoText = (value: string): string => {
  const expanded = String(value ?? "")
    .split(/(\{[^}]+\})/gu)
    .map((segment) =>
      /^\{[^}]+\}$/u.test(segment)
        ? segment
        : segment
            .split("")
            .map((char) => GLYPH_MAP.get(char) ?? char)
            .join(""),
    )
    .join("");
  return `[!! ${expanded}${"~".repeat(Math.max(4, Math.ceil(expanded.length * 0.35)))} !!]`;
};

export const isAppLocale = (value: unknown): value is AppLocale =>
  APP_LOCALES.includes(value as AppLocale);

export const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  value === PSEUDO_LOCALE || isAppLocale(value);

export const resolveLocale = (value: unknown): AppLocale =>
  isAppLocale(value) ? value : APP_LOCALE_BASE;

export const resolveSupportedLocale = (value: unknown): SupportedLocale =>
  value === PSEUDO_LOCALE ? PSEUDO_LOCALE : resolveLocale(value);

export const resolveLocaleWidthProfile = (
  locale: SupportedLocale | string,
): LocaleWidthProfile =>
  locale === PSEUDO_LOCALE || !COMPACT_LOCALE_SET.has(resolveLocale(locale))
    ? "expanded"
    : "compact";

export const installLocaleCatalog = (
  locale: AppLocale,
  catalog: LocaleCatalog,
): void => {
  installedCatalogs.set(locale, catalog);
};

export const isLocaleCatalogLoaded = (
  locale: SupportedLocale | string,
): boolean =>
  installedCatalogs.has(
    locale === PSEUDO_LOCALE ? APP_LOCALE_BASE : resolveLocale(locale),
  );

const resolveInstalledCatalog = (
  locale: SupportedLocale | string,
): LocaleCatalog | null => {
  const resolvedLocale =
    locale === PSEUDO_LOCALE ? APP_LOCALE_BASE : resolveLocale(locale);
  return (
    installedCatalogs.get(resolvedLocale) ??
    installedCatalogs.get(APP_LOCALE_BASE) ??
    null
  );
};

export const loadLocaleCatalog = (
  locale: SupportedLocale | string,
  namespace?: CatalogNamespace,
): Readonly<Record<string, string>> | LocaleCatalog => {
  const catalog = resolveInstalledCatalog(locale);
  if (!catalog) {
    return {};
  }
  return namespace ? (catalog[namespace] ?? {}) : catalog;
};

const splitMessageId = (
  value: string,
): { namespace: CatalogNamespace; key: string } | null => {
  const dotIndex = value.indexOf(".");
  if (dotIndex <= 0 || dotIndex >= value.length - 1) {
    return null;
  }
  const namespace = value.slice(0, dotIndex);
  if (!CATALOG_NAMESPACES.includes(namespace as CatalogNamespace)) {
    return null;
  }
  return {
    namespace: namespace as CatalogNamespace,
    key: value.slice(dotIndex + 1),
  };
};

export const isMessageId = (value: unknown): value is MessageId => {
  if (typeof value !== "string") {
    return false;
  }
  const parts = splitMessageId(value);
  if (!parts) {
    return false;
  }
  for (const catalog of installedCatalogs.values()) {
    if (typeof catalog[parts.namespace]?.[parts.key] === "string") {
      return true;
    }
  }
  return false;
};

const resolveTemplateForLocale = (
  locale: AppLocale,
  id: MessageId,
): string | null => {
  const parts = splitMessageId(id);
  if (!parts) {
    return null;
  }
  return installedCatalogs.get(locale)?.[parts.namespace]?.[parts.key] ?? null;
};

const resolveTemplate = (locale: SupportedLocale, id: MessageId): string => {
  const template =
    resolveTemplateForLocale(resolveLocale(locale), id) ??
    resolveTemplateForLocale(APP_LOCALE_BASE, id) ??
    id;
  return locale === PSEUDO_LOCALE ? toPseudoText(template) : template;
};

const stringifyMessageValue = (value: MessagePrimitive): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value === undefined || value === null ? "" : String(value);
};

const interpolateTemplateFallback = (
  template: string,
  values: MessageValues,
): string =>
  template.replace(/\{([^{}]+)\}/gu, (token, rawKey) => {
    const key = String(rawKey ?? "").trim();
    return key && key in values ? stringifyMessageValue(values[key]) : token;
  });

const warnFormatFailure = (params: {
  locale: SupportedLocale;
  id: MessageId;
  template: string;
  error: unknown;
}): void => {
  const cacheKey = `${params.locale}::${params.id}::${params.template}`;
  if (formatWarningCache.has(cacheKey)) {
    return;
  }
  formatWarningCache.add(cacheKey);
  if (typeof console === "undefined" || typeof console.warn !== "function") {
    return;
  }
  const message =
    params.error instanceof Error
      ? params.error.message
      : String(params.error ?? "Unknown i18n formatting error");
  console.warn(
    `[i18n] Falling back while formatting ${params.id} for ${params.locale}: ${message}`,
  );
};

const renderTemplate = (
  locale: SupportedLocale,
  id: MessageId,
  template: string,
  values: MessageValues,
): string => {
  const cacheKey = `${locale}::${id}::${template}`;
  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new IntlMessageFormat(
      template,
      locale === PSEUDO_LOCALE ? "en" : locale,
    );
    formatterCache.set(cacheKey, formatter);
  }
  const rendered = formatter.format(values);
  return Array.isArray(rendered) ? rendered.join("") : String(rendered);
};

export const formatMessage = (
  locale: SupportedLocale | string,
  id: MessageId,
  values: MessageValues = {},
): string => {
  const resolvedLocale = resolveSupportedLocale(locale);
  const template = resolveTemplate(resolvedLocale, id);
  try {
    return renderTemplate(resolvedLocale, id, template, values);
  } catch (error) {
    warnFormatFailure({ locale: resolvedLocale, id, template, error });
    const baseTemplate = resolveTemplateForLocale(APP_LOCALE_BASE, id);
    if (baseTemplate && baseTemplate !== template) {
      try {
        return renderTemplate(APP_LOCALE_BASE, id, baseTemplate, values);
      } catch {
        // Fall through to plain interpolation.
      }
    }
    return interpolateTemplateFallback(template, values);
  }
};

export const formatNumber = (
  locale: SupportedLocale | string,
  value: number,
  options: Intl.NumberFormatOptions = {},
): string =>
  new Intl.NumberFormat(
    resolveSupportedLocale(locale) === PSEUDO_LOCALE ? "en" : resolveLocale(locale),
    options,
  ).format(value);

export const formatDateTime = (
  locale: SupportedLocale | string,
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }
  return new Intl.DateTimeFormat(
    resolveSupportedLocale(locale) === PSEUDO_LOCALE ? "en" : resolveLocale(locale),
    options,
  ).format(date);
};

export const formatList = (
  locale: SupportedLocale | string,
  values: ReadonlyArray<string>,
  options: Intl.ListFormatOptions = {},
): string =>
  new Intl.ListFormat(
    resolveSupportedLocale(locale) === PSEUDO_LOCALE ? "en" : resolveLocale(locale),
    options,
  ).format(values.map((value) => String(value ?? "")));

export const formatLocalizedMessageToken = (
  locale: SupportedLocale | string,
  token: LocalizedMessageToken | null | undefined,
): string => {
  if (!token || !isMessageId(token.id)) {
    return token?.fallback ?? "";
  }
  try {
    return formatMessage(locale, token.id, token.values ?? {});
  } catch {
    return token.fallback;
  }
};
