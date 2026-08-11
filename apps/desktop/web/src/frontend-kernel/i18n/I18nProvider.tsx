// SPDX-License-Identifier: GPL-3.0-only

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  formatDateTime,
  formatList,
  formatMessage,
  formatNumber,
  resolveLocaleWidthProfile,
  type LocaleWidthProfile,
  type MessageId,
  type MessageValues,
  type SupportedLocale,
} from "@zinuto/shared/i18n";

type I18nContextValue = {
  locale: SupportedLocale;
  widthProfile: LocaleWidthProfile;
  t: (id: MessageId, values?: MessageValues) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDateTime: (
    value: string | number | Date,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatList: (values: ReadonlyArray<string>, options?: Intl.ListFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider = ({
  locale,
  children,
}: {
  locale: SupportedLocale;
  children: ReactNode;
}) => {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      widthProfile: resolveLocaleWidthProfile(locale),
      t: (id, values) => formatMessage(locale, id, values),
      formatNumber: (value, options) => formatNumber(locale, value, options),
      formatDateTime: (value, options) => formatDateTime(locale, value, options),
      formatList: (values, options) => formatList(locale, values, options),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
};
