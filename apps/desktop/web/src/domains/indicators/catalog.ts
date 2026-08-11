// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_SIGNAL_BOTTOM_INDICATOR,
  DEFAULT_SIGNAL_TOP_INDICATOR,
  INDICATOR_NONE_VALUE,
  MAIN_NATIVE_INDICATOR_WHITELIST
} from '@/domains/indicators/core';
import { getCustomProfileIndicatorKeySet, getCustomProfileIndicatorOptions } from '@/domains/indicators/customProfileRegistry';

export type IndicatorSelectOption = {
  key: string;
  label: string;
};

export type IndicatorSelectOptionGroup = {
  key: 'system' | 'custom';
  label: string;
  options: IndicatorSelectOption[];
};

export type GroupedSignalIndicatorSelectOptions = {
  noneOption: IndicatorSelectOption;
  groups: IndicatorSelectOptionGroup[];
  flatOptions: IndicatorSelectOption[];
};

const INTERNAL_INDICATOR_NAME_SET = new Set<string>(['__ZINUTO_CUSTOM_FORMULA_PREVIEW__']);
const INTERNAL_INDICATOR_NAME_PREFIXES = ['ZINUTO_SCRIPT_', 'ZINUTO_SYS_'];
const FORCED_CUSTOM_INDICATOR_NAMES = new Set<string>(['GS', 'AITOP']);
const FALLBACK_NATIVE_SIGNAL_INDICATOR_NAMES = Object.freeze([
  DEFAULT_SIGNAL_TOP_INDICATOR,
  DEFAULT_SIGNAL_BOTTOM_INDICATOR,
  'RSI',
  'BOLL',
  'WR',
  'CCI',
  'PSY',
  'DMA',
  'TRIX',
  'OBV'
]);
let cachedNativeSignalIndicatorNames: string[] | null = null;

const normalizeIndicatorName = (value: unknown): string => String(value ?? '').trim();

const isInternalIndicatorName = (name: string): boolean =>
  INTERNAL_INDICATOR_NAME_SET.has(name) || INTERNAL_INDICATOR_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));

const isForcedCustomIndicatorName = (name: string): boolean =>
  FORCED_CUSTOM_INDICATOR_NAMES.has(normalizeIndicatorName(name).toUpperCase());

const dedupeIndicatorOptionsByKey = (options: IndicatorSelectOption[]): IndicatorSelectOption[] => {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = normalizeIndicatorName(option.key);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const normalizeNativeSignalIndicatorNames = (
  values: readonly unknown[],
): string[] => {
  const normalizedNativeNames = Array.from(
    new Set(
      values
        .map((item) => normalizeIndicatorName(item))
        .filter((name) => Boolean(name) && !isInternalIndicatorName(name)),
    ),
  );
  const source =
    normalizedNativeNames.length > 0
      ? normalizedNativeNames
      : Array.from(FALLBACK_NATIVE_SIGNAL_INDICATOR_NAMES);
  return source.sort((left, right) => left.localeCompare(right, 'en'));
};

const getNativeSignalIndicatorNames = (
  nativeNames?: readonly string[] | null,
): string[] =>
  normalizeNativeSignalIndicatorNames(
    nativeNames ?? cachedNativeSignalIndicatorNames ?? FALLBACK_NATIVE_SIGNAL_INDICATOR_NAMES,
  );

export const loadNativeSignalIndicatorNames = async (): Promise<string[]> => {
  const { getSupportedIndicators } = await import('klinecharts');
  cachedNativeSignalIndicatorNames = normalizeNativeSignalIndicatorNames(
    getSupportedIndicators(),
  );
  return cachedNativeSignalIndicatorNames;
};

export const getSystemDefaultIndicatorNames = (): string[] => {
  const nativeSignalNames = getNativeSignalIndicatorNames().filter((name) => !isForcedCustomIndicatorName(name));
  const merged = Array.from(new Set([...MAIN_NATIVE_INDICATOR_WHITELIST, ...nativeSignalNames]));
  return merged.sort((left, right) => left.localeCompare(right, 'en'));
};

const getSupportedIndicatorNames = (): string[] => {
  const nativeNames = getNativeSignalIndicatorNames();
  const customKeys = Array.from(getCustomProfileIndicatorKeySet());
  return Array.from(new Set([...nativeNames, ...customKeys])).sort((left, right) => left.localeCompare(right, 'en'));
};

export const getSupportedIndicatorNameSet = (): Set<string> =>
  new Set(getSupportedIndicatorNames());

const getSystemSignalIndicatorOptions = (
  nativeNames?: readonly string[] | null,
): IndicatorSelectOption[] =>
  getNativeSignalIndicatorNames(nativeNames)
    .filter((name) => !isForcedCustomIndicatorName(name))
    .map((name) => ({ key: name, label: name }));

const getForcedCustomSignalIndicatorOptions = (
  nativeNames?: readonly string[] | null,
): IndicatorSelectOption[] =>
  getNativeSignalIndicatorNames(nativeNames)
    .filter((name) => isForcedCustomIndicatorName(name))
    .map((name) => ({ key: name, label: name }));

const getCustomSignalIndicatorOptions = (
  nativeNames?: readonly string[] | null,
): IndicatorSelectOption[] =>
  dedupeIndicatorOptionsByKey([
    ...getForcedCustomSignalIndicatorOptions(nativeNames),
    ...getCustomProfileIndicatorOptions().map((option) => ({
      key: option.key,
      label: option.label,
    })),
  ])
    .sort((left, right) => left.label.localeCompare(right.label, 'en'));

export const buildGroupedSignalIndicatorSelectOptions = (
  noneLabel: string,
  systemGroupLabel: string,
  customGroupLabel: string,
  nativeNames?: readonly string[] | null,
): GroupedSignalIndicatorSelectOptions => {
  const noneOption: IndicatorSelectOption = { key: INDICATOR_NONE_VALUE, label: noneLabel };
  const systemOptions = getSystemSignalIndicatorOptions(nativeNames);
  const customOptions = getCustomSignalIndicatorOptions(nativeNames);

  const groups: IndicatorSelectOptionGroup[] = [
    {
      key: 'system',
      label: systemGroupLabel,
      options: systemOptions
    }
  ];
  if (customOptions.length) {
    groups.push({
      key: 'custom',
      label: customGroupLabel,
      options: customOptions
    });
  }

  return {
    noneOption,
    groups,
    flatOptions: [noneOption, ...systemOptions, ...customOptions]
  };
};

export const buildMainIndicatorSelectOptions = (noneLabel: string): IndicatorSelectOption[] => [
  { key: INDICATOR_NONE_VALUE, label: noneLabel },
  ...MAIN_NATIVE_INDICATOR_WHITELIST.map((name) => ({ key: name, label: name }))
];

export const buildSupportedIndicatorNameSet = (options: IndicatorSelectOption[]): Set<string> =>
  new Set(
    options
      .filter((option) => option.key !== INDICATOR_NONE_VALUE)
      .map((option) => option.key),
  );
