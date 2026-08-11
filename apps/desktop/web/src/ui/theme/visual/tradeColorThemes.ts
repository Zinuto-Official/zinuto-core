// SPDX-License-Identifier: GPL-3.0-only

import { resolveVisualColorValue } from '@/ui/theme/visual/colorCenter';
import type { ThemeModeToken, TradeColorThemeToken } from '@/ui/theme/visual/types';

type TradeColorThemePair = {
  buy: string;
  sell: string;
};

const TRADE_COLOR_THEME_COLOR_CENTER_IDS: Record<TradeColorThemeToken, { buy: string; sell: string }> = Object.freeze({
  INSTITUTIONAL: {
    buy: 'TP3-CryptoBull',
    sell: 'TP4-CryptoBear'
  },
  CRYPTO: {
    buy: 'TP4-CryptoBear',
    sell: 'TP3-CryptoBull'
  },
  ACCESSIBLE: {
    buy: 'TP5-AccessibleBull',
    sell: 'TP6-AccessibleBear'
  }
});

export const DEFAULT_TRADE_COLOR_THEME: TradeColorThemeToken = 'ACCESSIBLE';

let globalTradeColorTheme: TradeColorThemeToken = DEFAULT_TRADE_COLOR_THEME;

export const isTradeColorThemeToken = (value: unknown): value is TradeColorThemeToken =>
  value === 'INSTITUTIONAL' || value === 'CRYPTO' || value === 'ACCESSIBLE';

export const setGlobalTradeColorTheme = (value: TradeColorThemeToken): void => {
  globalTradeColorTheme = value;
};

export const getGlobalTradeColorTheme = (): TradeColorThemeToken => globalTradeColorTheme;

export const resolveTradeColorThemePair = (
  tradeColorTheme: TradeColorThemeToken,
  themeMode: ThemeModeToken
): TradeColorThemePair => {
  const entryIds = TRADE_COLOR_THEME_COLOR_CENTER_IDS[tradeColorTheme];
  return {
    buy: resolveVisualColorValue(entryIds.buy, themeMode),
    sell: resolveVisualColorValue(entryIds.sell, themeMode)
  };
};

export const resolveTradeColorThemeSwatches = (
  tradeColorTheme: TradeColorThemeToken
): TradeColorThemePair => resolveTradeColorThemePair(tradeColorTheme, 'light');
