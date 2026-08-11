// SPDX-License-Identifier: GPL-3.0-only

import {
  BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID,
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
  isBuiltInTradingMarketPresetId,
} from '@zinuto/shared/trading';
import { appError } from '../../kernel/appError.js';
import type { TradingSettings } from '../../domain/trading/types.js';

export type FreeReplayTradingEnvironment = {
  assetClass: TradingSettings['assetClass'];
  marketPresetId: string;
};

const normalizeAssetClass = (
  value: unknown,
): TradingSettings['assetClass'] | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'STOCK' ||
    normalized === 'FUTURES' ||
    normalized === 'FOREX' ||
    normalized === 'CRYPTO'
    ? normalized
    : null;
};

export const resolveFreeReplaySessionTradingSettings = (
  currentSettings: TradingSettings,
  environment: FreeReplayTradingEnvironment,
): TradingSettings => {
  const assetClass = normalizeAssetClass(environment.assetClass);
  if (!assetClass) {
    throw appError('TRADING_ASSET_CLASS_INVALID', {
      assetClass: String(environment.assetClass ?? ''),
    });
  }

  const marketPresetId = String(environment.marketPresetId ?? '').trim();
  if (
    !marketPresetId ||
    !isBuiltInTradingMarketPresetId(marketPresetId) ||
    BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID[marketPresetId] !== assetClass
  ) {
    throw appError('TRADING_MARKET_PRESET_INVALID', {
      assetClass,
      marketPresetId,
    });
  }

  return {
    ...currentSettings,
    ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[marketPresetId],
  };
};
