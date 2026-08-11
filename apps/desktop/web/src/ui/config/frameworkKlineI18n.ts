// SPDX-License-Identifier: GPL-3.0-only

import { registerLocale, type Locales } from 'klinecharts';
import { formatMessage } from '@zinuto/shared/i18n';
import { APP_UI_BASE_LANGUAGE, APP_UI_LANGUAGES, type AppUiLanguage } from '@/ui/config/uiConfig';

const KLINE_LOCALE_ID_BY_LANGUAGE: Record<AppUiLanguage, string> = {
  en: 'zinuto-en',
  'zh-CN': 'zinuto-zh-CN',
  ja: 'zinuto-ja',
  ko: 'zinuto-ko',
  es: 'zinuto-es'
};

const withKlineValueGap = (label: string): string => {
  const normalized = String(label ?? '').trimEnd();
  return normalized ? `${normalized} ` : '';
};

const t = (language: AppUiLanguage, key: string): string =>
  formatMessage(language, key as never);

const buildKlineLocale = (language: AppUiLanguage): Locales => ({
  time: withKlineValueGap(t(language, 'appText.time')),
  open: withKlineValueGap(t(language, 'appText.open')),
  high: withKlineValueGap(t(language, 'appText.high')),
  low: withKlineValueGap(t(language, 'appText.low')),
  close: withKlineValueGap(t(language, 'appText.close')),
  volume: withKlineValueGap(t(language, 'appText.volume')),
  change: withKlineValueGap(t(language, 'appText.change')),
  turnover: withKlineValueGap(t(language, 'appText.turnover')),
  second: t(language, 'appText.sec'),
  minute: t(language, 'appText.min'),
  hour: t(language, 'appText.hr'),
  day: t(language, 'appText.message0421'),
  week: t(language, 'appText.message0422'),
  month: t(language, 'appText.message0423'),
  year: t(language, 'appText.message0424')
});

const registeredKlineLocales = new Set<AppUiLanguage>();

const ensureKlineLocaleRegistered = (language: AppUiLanguage) => {
  if (registeredKlineLocales.has(language)) {
    return;
  }
  const localeId = KLINE_LOCALE_ID_BY_LANGUAGE[language];
  registerLocale(localeId, buildKlineLocale(language));
  registeredKlineLocales.add(language);
};

export const resolveKlineLocale = (language: AppUiLanguage): string => {
  const resolvedLanguage = APP_UI_LANGUAGES.includes(language)
    ? language
    : APP_UI_BASE_LANGUAGE;
  ensureKlineLocaleRegistered(resolvedLanguage);
  return KLINE_LOCALE_ID_BY_LANGUAGE[resolvedLanguage];
};
