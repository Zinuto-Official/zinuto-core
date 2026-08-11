// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_TRADING_CALENDAR_CONFIG,
  normalizeTradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';
import type {
  ApiLocalDataImportFolderPreview,
  ApiTradingCalendarConfig,
} from '@/api/localDataTypes';
import { toTrimmedString } from './localDataNormalizationCommon';

export const normalizeTimeZoneSuggestionReason = (
  value: unknown,
): ApiLocalDataImportFolderPreview["suggestedTimeZoneReason"] => {
  const raw = toTrimmedString(value);
  return raw === "RULE_INFERRED" ||
    raw === "TIMESTAMP_INFERRED" ||
    raw === "EXISTING_SOURCE" ||
    raw === "SYSTEM_FALLBACK" ||
    raw === "PRESET_DEFAULT"
    ? raw
    : "PRESET_DEFAULT";
};


export const normalizeApiTradingCalendarConfig = (
  value: unknown,
): ApiTradingCalendarConfig =>
  normalizeTradingCalendarConfig(value, DEFAULT_TRADING_CALENDAR_CONFIG);
