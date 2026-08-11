// SPDX-License-Identifier: GPL-3.0-only

import {
  formatMessage,
  type MessageId,
  type MessageValues,
  type SupportedLocale,
} from "@zinuto/shared/i18n";
import {
  getCurrentUiLanguage,
  onCurrentUiLanguageChange,
  setCurrentUiLanguage,
} from "@/frontend-kernel/i18n/localeState";
import type { AppUiLanguage } from "@/ui/config/appUiLanguage";

export type AppTextKey = MessageId;
export type UiMessageId = MessageId;

export const getTextLanguage = (): AppUiLanguage => getCurrentUiLanguage();

export const onTextLanguageChange = (
  listener: (language: AppUiLanguage) => void,
): (() => void) => onCurrentUiLanguageChange(listener);

export const setTextLanguage = (language: AppUiLanguage): void => {
  setCurrentUiLanguage(language);
};

const toMessageValue = (
  value: unknown,
): string | number | boolean | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
};

export const toIndexedMessageValues = (
  values: Array<unknown> = [],
): MessageValues =>
  Object.fromEntries(
    values.map((value, index) => [String(index), toMessageValue(value)]),
  ) as MessageValues;

export const formatMessageByLanguage = (
  language: SupportedLocale,
  id: MessageId,
  values: Array<unknown> = [],
): string => formatMessage(language, id, toIndexedMessageValues(values));

export const formatCurrentMessage = (
  id: MessageId,
  values: Array<unknown> = [],
): string => formatMessageByLanguage(getCurrentUiLanguage(), id, values);

export const ttByLanguage = (
  language: SupportedLocale,
  id: MessageId,
): string => formatMessageByLanguage(language, id);

export const ttfByLanguage = (
  language: SupportedLocale,
  id: MessageId,
  values: Array<unknown> = [],
): string => formatMessageByLanguage(language, id, values);

export const tt = (id: MessageId): string => formatCurrentMessage(id);

export const ttf = (
  id: MessageId,
  values: Array<unknown> = [],
): string => formatCurrentMessage(id, values);
