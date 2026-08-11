// SPDX-License-Identifier: GPL-3.0-only

import { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
import { resolveVisualColorValue } from '@/ui/theme/visual/colorCenter';
import { resolveDomThemeMode } from '@/ui/theme/visual/domThemeMode';
import {
  DEFAULT_TRADE_COLOR_THEME,
  getGlobalTradeColorTheme,
  resolveTradeColorThemePair
} from '@/ui/theme/visual/tradeColorThemes';
import type { ThemeModeToken, TradeColorThemeToken, TradeVisualThemePalette } from '@/ui/theme/visual/types';

const LIGHT_TEXT_COLOR = resolveVisualColorValue('C1-White', 'light');
const DARK_TEXT_COLOR = resolveVisualColorValue('T1-Primary', 'light');

const resolveLinearColorChannel = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const resolveRelativeLuminance = (red: number, green: number, blue: number): number => {
  const r = resolveLinearColorChannel(red);
  const g = resolveLinearColorChannel(green);
  const b = resolveLinearColorChannel(blue);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};

const resolveHexLuminance = (hexColor: string): number | null => {
  const normalized = hexColor.slice(1);
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return resolveRelativeLuminance(
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  );
};

const resolveContrastRatio = (first: number, second: number): number =>
  (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);

const resolveReadableTextColor = (backgroundColor: string): string => {
  const backgroundLuminance = resolveHexLuminance(backgroundColor);
  const lightTextLuminance = resolveHexLuminance(LIGHT_TEXT_COLOR);
  const darkTextLuminance = resolveHexLuminance(DARK_TEXT_COLOR);
  if (
    backgroundLuminance === null ||
    lightTextLuminance === null ||
    darkTextLuminance === null
  ) {
    return LIGHT_TEXT_COLOR;
  }
  return resolveContrastRatio(darkTextLuminance, backgroundLuminance) >=
    resolveContrastRatio(lightTextLuminance, backgroundLuminance)
    ? DARK_TEXT_COLOR
    : LIGHT_TEXT_COLOR;
};

const buildTradeVisualThemePalette = (
  themeMode: ThemeModeToken,
  tradeColorTheme: TradeColorThemeToken
): TradeVisualThemePalette => {
  const tradePair = resolveTradeColorThemePair(tradeColorTheme, themeMode);
  return {
    buyButtonBg: tradePair.buy,
    buyButtonText: resolveReadableTextColor(tradePair.buy),
    buyMarker: tradePair.buy,
    sellButtonBg: tradePair.sell,
    sellButtonBorder: tradePair.sell,
    sellButtonText: resolveReadableTextColor(tradePair.sell),
    sellMarker: tradePair.sell,
    sellMarkerOutline:
      themeMode === 'dark' ? GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s1 : resolveVisualColorValue('C3-Transparent', 'light'),
    positionLine: tradePair.buy
  };
};

export const TRADE_VISUAL_THEME_PALETTES: Record<ThemeModeToken, TradeVisualThemePalette> = Object.freeze({
  light: buildTradeVisualThemePalette('light', DEFAULT_TRADE_COLOR_THEME),
  dark: buildTradeVisualThemePalette('dark', DEFAULT_TRADE_COLOR_THEME)
});

export const resolveTradeVisualThemePalette = (
  themeMode?: ThemeModeToken,
  tradeColorTheme?: TradeColorThemeToken
): TradeVisualThemePalette =>
  buildTradeVisualThemePalette(
    themeMode ?? resolveDomThemeMode(),
    tradeColorTheme ?? getGlobalTradeColorTheme()
  );
