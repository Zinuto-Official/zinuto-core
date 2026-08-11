// SPDX-License-Identifier: GPL-3.0-only

import { getCurrentUiLanguage } from '@/frontend-kernel/i18n/localeState';
import { formatMessage } from '@zinuto/shared/i18n';

// Formatters are cached per language because they are created on every call
// from the current UI language, which may change at runtime.
const decimalFormatterCache = new Map<string, Intl.NumberFormat>();

const getDecimalFormatter = (digits: 0 | 2): Intl.NumberFormat => {
  const language = getCurrentUiLanguage();
  const cacheKey = `${language}:${digits}`;
  let formatter = decimalFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
    decimalFormatterCache.set(cacheKey, formatter);
  }
  return formatter;
};

let showGlobalDecimals = true;

export const setGlobalDecimalDisplay = (enabled: boolean): void => {
  showGlobalDecimals = enabled;
};

const resolveDisplayDigits = (requestedDigits: number): 0 | 2 => {
  const normalizedDigits = Number.isFinite(requestedDigits) ? Math.floor(requestedDigits) : 2;
  if (normalizedDigits <= 0) {
    return 0;
  }
  return showGlobalDecimals ? 2 : 0;
};

// Both money formatters share the same precision semantics: requested digits
// below 1 produce 0 decimals, otherwise the global decimal display setting
// decides between 0 and 2 decimals.
export const formatMoneyFixed = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return getDecimalFormatter(resolveDisplayDigits(digits)).format(value);
};

export const formatMoney = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return getDecimalFormatter(resolveDisplayDigits(digits)).format(value);
};

export const formatRatio = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const percentValue = value * 100;
  const language = getCurrentUiLanguage();
  return `${getDecimalFormatter(resolveDisplayDigits(2)).format(percentValue)}${formatMessage(language, 'common.symbol.percent')}`;
};

export const sanitizeNumericInput = (input: string): string => {
  let result = input.replace(/[^\d.]/g, '');
  const dotIndex = result.indexOf('.');
  if (dotIndex >= 0) {
    result = `${result.slice(0, dotIndex + 1)}${result.slice(dotIndex + 1).replace(/\./g, '')}`;
  }
  return result;
};

export const sanitizeSignedNumericInput = (input: string): string => {
  const raw = String(input ?? '');
  const isNegative = raw.trimStart().startsWith('-');
  const unsigned = sanitizeNumericInput(raw);
  if (!unsigned) {
    return isNegative ? '-' : '';
  }
  return isNegative ? `-${unsigned}` : unsigned;
};

export const formatInputThousands = (input: string): string => {
  if (!input) {
    return '';
  }
  const [rawInt, rawDecimal] = input.split('.');
  const intClean = rawInt.replace(/^0+(?=\d)/, '') || '0';
  const intPart = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rawDecimal !== undefined ? `${intPart}.${rawDecimal}` : intPart;
};

export const parseNumeric = (input: string): number => {
  if (!input) {
    return 0;
  }
  const value = Number(input.replace(/,/g, ''));
  return Number.isFinite(value) ? value : 0;
};

export const formatSignedMoney = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const abs = formatMoney(Math.abs(value), digits);
  if (value > 0) {
    return `+${abs}`;
  }
  if (value < 0) {
    return `-${abs}`;
  }
  return abs;
};
