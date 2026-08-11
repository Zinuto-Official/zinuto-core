// SPDX-License-Identifier: GPL-3.0-only

import {
  BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID,
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  isBuiltInTradingMarketPresetId,
  type TradingAssetClass,
} from '@zinuto/shared/trading';
import type {
  LocalDataSourceDiagnosticProfile,
  LocalDataSourceDiagnosticProfileOrigin,
} from './types.js';

const DIAGNOSTIC_ASSET_CLASSES: ReadonlySet<TradingAssetClass> = new Set([
  'STOCK',
  'FUTURES',
  'FOREX',
  'CRYPTO',
]);

export const normalizeDiagnosticAssetClass = (
  value: unknown,
): TradingAssetClass => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return DIAGNOSTIC_ASSET_CLASSES.has(normalized as TradingAssetClass)
    ? (normalized as TradingAssetClass)
    : 'STOCK';
};

export const normalizeDiagnosticProfileOrigin = (
  value: unknown,
): LocalDataSourceDiagnosticProfileOrigin => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (
    normalized === 'SYSTEM' ||
    normalized === 'INFERRED' ||
    normalized === 'USER'
  ) {
    return normalized;
  }
  return 'INFERRED';
};

export const normalizeDiagnosticMarketPresetId = (
  value: unknown,
  assetClass: TradingAssetClass,
): string => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (
    isBuiltInTradingMarketPresetId(normalized) &&
    BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID[normalized] === assetClass
  ) {
    return normalized;
  }
  return DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[assetClass];
};

export const normalizeLocalDataSourceDiagnosticProfile = (
  value: Partial<LocalDataSourceDiagnosticProfile> | null | undefined,
  fallbackOrigin: LocalDataSourceDiagnosticProfileOrigin = 'INFERRED',
): LocalDataSourceDiagnosticProfile => {
  const assetClass = normalizeDiagnosticAssetClass(value?.assetClass);
  return {
    assetClass,
    marketPresetId: normalizeDiagnosticMarketPresetId(
      value?.marketPresetId,
      assetClass,
    ),
    profileOrigin:
      value?.profileOrigin === undefined || value.profileOrigin === null
        ? fallbackOrigin
        : normalizeDiagnosticProfileOrigin(value.profileOrigin),
  };
};

export const createSystemDataSourceDiagnosticProfile = (
  sourceId: string,
): LocalDataSourceDiagnosticProfile => {
  const normalizedSourceId = String(sourceId ?? '').trim().toLowerCase();
  if (normalizedSourceId.includes('fx') || normalizedSourceId.includes('forex')) {
    return {
      assetClass: 'FOREX',
      marketPresetId: 'FOREX_STANDARD_LOT',
      profileOrigin: 'SYSTEM',
    };
  }
  return {
    assetClass: 'STOCK',
    marketPresetId: 'US_STOCK',
    profileOrigin: 'SYSTEM',
  };
};
