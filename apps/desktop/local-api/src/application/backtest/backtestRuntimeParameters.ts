// SPDX-License-Identifier: GPL-3.0-only

import { desktopBacktestConfigSchema } from '@zinuto/shared/contracts-desktop/api';
import {
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS,
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
  isBuiltInTradingMarketPresetId,
  type TradingSettings,
} from '@zinuto/shared/trading';
import type { z } from 'zod';

export const buildParameterOverrides = (
  parameterInputs: Record<string, string> | undefined,
): Record<string, number> => {
  const entries = Object.entries(parameterInputs ?? {}).flatMap(([key, value]) => {
    const normalizedKey = key.trim().toUpperCase();
    const numeric = Number(value);
    return normalizedKey && Number.isFinite(numeric)
      ? [[normalizedKey, numeric] as const]
      : [];
  });
  return Object.fromEntries(entries);
};

export const normalizeBacktestTradingSettings = (
  rawSettings: z.infer<typeof desktopBacktestConfigSchema>['tradingSettings'],
  initialCapital: number,
): TradingSettings => {
  const assetClass = rawSettings.assetClass;
  const requestedPresetId = String(rawSettings.marketPresetId || '').trim();
  const fallbackPresetId = DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[assetClass];
  const presetId = isBuiltInTradingMarketPresetId(requestedPresetId)
    ? requestedPresetId
    : fallbackPresetId;
  const presetSettings = DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[presetId];
  const passthroughSettings = rawSettings as Partial<TradingSettings>;
  return {
    ...presetSettings,
    ...passthroughSettings,
    assetClass,
    marketPresetId: String(rawSettings.marketPresetId || presetSettings.marketPresetId).trim() || presetSettings.marketPresetId,
    initialSecuritiesBalance: Number(rawSettings.initialSecuritiesBalance || initialCapital),
    minTradeStep: Number(rawSettings.minTradeStep || presetSettings.minTradeStep),
    allowShortSelling: Boolean(rawSettings.allowShortSelling),
    allowLongMarginTrading: Boolean(
      passthroughSettings.allowLongMarginTrading ?? presetSettings.allowLongMarginTrading,
    ),
    positionCostMode: passthroughSettings.positionCostMode ?? 'DILUTED',
    tradeSettlementMode: rawSettings.tradeSettlementMode,
    freeReplayEndSettlementMode: rawSettings.freeReplayEndSettlementMode,
    tradeAmountIncludesFees: Boolean(passthroughSettings.tradeAmountIncludesFees ?? false),
  };
};
