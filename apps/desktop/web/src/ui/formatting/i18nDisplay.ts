// SPDX-License-Identifier: GPL-3.0-only

import type { AppUiLanguage } from '@/ui/config/uiConfig';
import { formatMessage } from '@zinuto/shared/i18n';
import { formatMoneyFixed } from '@/ui/formatting/format';

const normalizeDisplayParts = (
  parts: ReadonlyArray<string | number | null | undefined>
): string[] =>
  parts
    .map((part) => String(part ?? '').trim())
    .filter((part) => part.length > 0);

const COMPACT_SCRIPT_LANGUAGES = new Set<AppUiLanguage>(['zh-CN', 'ko', 'ja']);

export const isCompactScriptLanguage = (language: AppUiLanguage): boolean => COMPACT_SCRIPT_LANGUAGES.has(language);

const SLASH_JOINER_BY_LANGUAGE = (language: AppUiLanguage): string => {
  const delimiter = formatMessage(language, 'app.joiner.slash').trim() || '/';
  return isCompactScriptLanguage(language) ? delimiter : ` ${delimiter} `;
};

const LIST_JOINER_BY_LANGUAGE = (language: AppUiLanguage): string =>
  isCompactScriptLanguage(language)
    ? formatMessage(language, 'app.joiner.list').trim() || '、'
    : `${formatMessage(language, 'app.joiner.list').trim() || ','} `;

export const formatSlashJoinedText = (
  language: AppUiLanguage,
  parts: ReadonlyArray<string | number | null | undefined>
): string =>
  normalizeDisplayParts(parts).join(SLASH_JOINER_BY_LANGUAGE(language));

export const formatDotJoinedText = (
  language: AppUiLanguage,
  parts: ReadonlyArray<string | number | null | undefined>
): string =>
  normalizeDisplayParts(parts).join(` ${formatMessage(language, 'common.symbol.middleDot').trim() || '·'} `);

export const formatListJoinedText = (
  language: AppUiLanguage,
  parts: ReadonlyArray<string | number | null | undefined>
): string =>
  normalizeDisplayParts(parts).join(LIST_JOINER_BY_LANGUAGE(language));

export const prependClauseText = (
  language: AppUiLanguage,
  value: string | number | null | undefined
): string => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  const delimiter = formatMessage(language, 'app.joiner.clause').trim() || ',';
  return isCompactScriptLanguage(language) ? `${delimiter}${normalized}` : `${delimiter} ${normalized}`;
};

export const formatLabelValueText = (
  language: AppUiLanguage,
  label: string,
  value: string | number
): string => {
  const left = String(label ?? '').trimEnd();
  const right = typeof value === 'number'
    ? formatMoneyFixed(value, Number.isInteger(value) ? 0 : 2)
    : String(value ?? '');
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  const trimmedValue = right.trim();
  const isDateTimeLikeValue =
    /^\d{1,2}:\d{2}(?::\d{2})?$/.test(trimmedValue) ||
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(trimmedValue) ||
    /^\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(trimmedValue);

  const separator = isDateTimeLikeValue ? ' ' : isCompactScriptLanguage(language) ? '' : ' ';
  return `${left}${separator}${right}`;
};

export const formatCountWithUnitText = (
  language: AppUiLanguage,
  count: string | number,
  unit: string
): string => {
  const countText = typeof count === 'number'
    ? formatMoneyFixed(count, Number.isInteger(count) ? 0 : 2)
    : String(count ?? '');
  const unitText = String(unit ?? '').trim();
  if (!unitText) {
    return countText;
  }
  return isCompactScriptLanguage(language) ? `${countText}${unitText}` : `${countText} ${unitText}`;
};

export const formatLotsAndSharesText = (
  language: AppUiLanguage,
  lots: string | number,
  lotUnit: string,
  shares: string | number,
  shareUnit: string
): string => {
  const lotsText = formatCountWithUnitText(language, lots, lotUnit);
  const sharesText = formatCountWithUnitText(language, shares, shareUnit);
  return formatSlashJoinedText(language, [lotsText, sharesText]);
};

export const formatBuySellCountText = (
  language: AppUiLanguage,
  buyLabel: string,
  sellLabel: string,
  buyCount: string | number,
  sellCount: string | number,
  compactUnit: string
): string => {
  if (isCompactScriptLanguage(language)) {
    const unit = String(compactUnit ?? '').trim();
    return formatSlashJoinedText(language, [`${buyLabel}${buyCount}${unit}`, `${sellLabel}${sellCount}${unit}`]);
  }
  return formatSlashJoinedText(language, [`${buyLabel} ${buyCount}`, `${sellLabel} ${sellCount}`]);
};
