// SPDX-License-Identifier: GPL-3.0-only

import {
  APP_LOCALES,
  MESSAGE_IDS,
  PSEUDO_LOCALE,
  formatMessage,
  loadLocaleCatalog,
  type AppLocale,
  type CatalogNamespace,
  type MessageValues,
} from "@zinuto/shared/i18n";

const MESSAGE_ID_SET = new Set<string>(MESSAGE_IDS);
const errors: string[] = [];
const ENGLISH_LOCALE: AppLocale = "en";

const SAME_AS_EN_ALLOWED_IDS = new Set<string>([
  "appText.zinutoStocks",
  "appText.zinutoCrypto",
  "appText.zinutoLogo",
  "appText.zinutoInd",
  "appText.zinutoReplay",
  "appText.aboutZinutoCompany",
  "appText.macAppStore",
  "shell.brand.logoAlt",
  "uiLabels.languageOptions.en",
]);
const SAME_AS_EN_ALLOWED_LOCALE_IDS = new Set<string>([
  "es::appText.color",
  "es::uiLabels.ui.color",
]);
const SAME_AS_EN_ALLOWED_PATTERNS = [
  /^Zinuto Core$/u,
  /^(?:macOS|Windows)$/u,
  /^(?:Mac|Apple) App Store$/u,
];

const PLACEHOLDER_REGEX = /\{([a-zA-Z_][a-zA-Z0-9_]*|\d+)(?:,[^}]*)?\}/gu;
const toNamespaceCatalog = (
  value: ReturnType<typeof loadLocaleCatalog>,
): Readonly<Record<string, Readonly<Record<string, string>>>> =>
  value as Readonly<Record<string, Readonly<Record<string, string>>>>;
const toMessageCatalog = (
  value: ReturnType<typeof loadLocaleCatalog>,
): Readonly<Record<string, string>> => value as Readonly<Record<string, string>>;

const buildSampleValues = (template: string): MessageValues => {
  const values: MessageValues = {};
  for (const match of template.matchAll(PLACEHOLDER_REGEX)) {
    const key = match[1];
    if (!key || key in values) {
      continue;
    }
    values[key] = /^\d+$/u.test(key) || /count|total|size|index|value|minutes|seconds/iu.test(key)
      ? 7
      : `${key}-sample`;
  }
  return values;
};

const normalizeText = (value: string): string =>
  String(value ?? "").replace(/\s+/gu, " ").trim();

const isAllowedSameAsEnglish = (locale: AppLocale, id: string, value: string): boolean =>
  SAME_AS_EN_ALLOWED_LOCALE_IDS.has(`${locale}::${id}`) ||
  SAME_AS_EN_ALLOWED_IDS.has(id) ||
  SAME_AS_EN_ALLOWED_PATTERNS.some((pattern) => pattern.test(value));

const looksLikeLocalizableEnglish = (value: string): boolean => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }
  if (!/[A-Za-z]/u.test(normalized)) {
    return false;
  }
  if (/^[A-Z0-9_./:+-]+$/u.test(normalized)) {
    return false;
  }
  if (/^\d+(?:[a-z]+)?$/iu.test(normalized)) {
    return false;
  }
  if (SAME_AS_EN_ALLOWED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  if (/[A-Za-z].*\s+[A-Za-z]/u.test(normalized)) {
    return true;
  }
  return /^[A-Z]?[a-z]{4,}$/u.test(normalized);
};

const collectSameAsEnglishBundleLeaves = (
  params: {
    locale: AppLocale;
    id: string;
    currentValue: unknown;
    englishValue: unknown;
    path: string[];
  },
): void => {
  const { locale, id, currentValue, englishValue, path } = params;
  if (typeof currentValue === "string" && typeof englishValue === "string") {
    const normalizedCurrent = normalizeText(currentValue);
    const normalizedEnglish = normalizeText(englishValue);
    if (
      normalizedCurrent &&
      normalizedCurrent === normalizedEnglish &&
      looksLikeLocalizableEnglish(normalizedCurrent) &&
      !isAllowedSameAsEnglish(
        locale,
        `${id}${path.length ? `#${path.join(".")}` : ""}`,
        normalizedCurrent,
      )
    ) {
      errors.push(
        `[same-as-en] ${locale} ${id}#${path.join(".")} remains identical to en: ${normalizedCurrent}`,
      );
    }
    return;
  }
  if (Array.isArray(currentValue) && Array.isArray(englishValue)) {
    const count = Math.min(currentValue.length, englishValue.length);
    for (let index = 0; index < count; index += 1) {
      collectSameAsEnglishBundleLeaves({
        locale,
        id,
        currentValue: currentValue[index],
        englishValue: englishValue[index],
        path: [...path, String(index)],
      });
    }
    return;
  }
  if (
    currentValue &&
    typeof currentValue === "object" &&
    englishValue &&
    typeof englishValue === "object"
  ) {
    for (const key of Object.keys(englishValue as Record<string, unknown>)) {
      collectSameAsEnglishBundleLeaves({
        locale,
        id,
        currentValue: (currentValue as Record<string, unknown>)[key],
        englishValue: (englishValue as Record<string, unknown>)[key],
        path: [...path, key],
      });
    }
  }
};

const checkSameAsEnglish = (
  locale: AppLocale,
  namespace: CatalogNamespace,
  key: string,
  template: string,
): void => {
  if (locale === ENGLISH_LOCALE) {
    return;
  }
  const messageId = `${namespace}.${key}`;
  const englishCatalog = toMessageCatalog(loadLocaleCatalog(ENGLISH_LOCALE, namespace));
  const englishTemplate = englishCatalog[key];
  if (typeof englishTemplate !== "string") {
    return;
  }
  if (key.endsWith(".bundle")) {
    try {
      collectSameAsEnglishBundleLeaves({
        locale,
        id: messageId,
        currentValue: JSON.parse(template),
        englishValue: JSON.parse(englishTemplate),
        path: [],
      });
    } catch (error) {
      errors.push(
        `[bundle-parse] ${locale} ${messageId}: ${(error as Error).message}`,
      );
    }
    return;
  }
  const normalizedCurrent = normalizeText(template);
  const normalizedEnglish = normalizeText(englishTemplate);
  if (
    normalizedCurrent &&
    normalizedCurrent === normalizedEnglish &&
    looksLikeLocalizableEnglish(normalizedCurrent) &&
    !isAllowedSameAsEnglish(locale, messageId, normalizedCurrent)
  ) {
    errors.push(
      `[same-as-en] ${locale} ${messageId} remains identical to en: ${normalizedCurrent}`,
    );
  }
};

for (const locale of APP_LOCALES) {
  const catalog = toNamespaceCatalog(loadLocaleCatalog(locale));
  for (const namespace of Object.keys(catalog)) {
    for (const [key, template] of Object.entries(catalog[namespace as keyof typeof catalog] ?? {})) {
      const messageId = `${namespace}.${key}`;
      if (!MESSAGE_ID_SET.has(messageId)) {
        errors.push(`[missing-id] ${locale} defines unknown message id ${messageId}`);
        continue;
      }
      if (messageId.endsWith(".bundle")) {
        continue;
      }
      try {
        void formatMessage(locale, messageId as (typeof MESSAGE_IDS)[number], buildSampleValues(template));
      } catch (error) {
        errors.push(`[format-error] ${locale} ${messageId}: ${(error as Error).message}`);
      }
      checkSameAsEnglish(locale, namespace as CatalogNamespace, key, template);
    }
  }
}

for (const messageId of MESSAGE_IDS) {
  if (messageId.endsWith(".bundle")) {
    continue;
  }
  try {
    const dotIndex = messageId.indexOf(".");
    const namespace = messageId.slice(0, dotIndex);
    const key = messageId.slice(dotIndex + 1);
    const baseTemplate =
      toMessageCatalog(loadLocaleCatalog("en", namespace as never))[key] ??
      toMessageCatalog(loadLocaleCatalog("zh-CN", namespace as never))[key] ??
      "";
    const pseudoText = formatMessage(
      PSEUDO_LOCALE,
      messageId,
      buildSampleValues(baseTemplate),
    );
    if (!pseudoText.startsWith("[!! ")) {
      errors.push(`[pseudo-locale] ${messageId} did not produce pseudo-localized output`);
    }
  } catch (error) {
    errors.push(`[pseudo-locale] ${messageId}: ${(error as Error).message}`);
  }
}

if (errors.length) {
  console.error("i18n runtime check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `i18n runtime check passed: locales=${APP_LOCALES.length}, messages=${MESSAGE_IDS.length}`,
);
