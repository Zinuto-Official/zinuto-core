// SPDX-License-Identifier: GPL-3.0-only

import { resolveVisualColorValue } from '@/ui/theme/visual/colorCenter';
import type { PriceColorModeToken, PriceColorPalette } from '@/ui/theme/visual/types';
import type { ThemeModeToken } from '@/ui/theme/visual/types';

export const PRICE_COLOR_PALETTES: Record<PriceColorModeToken, PriceColorPalette> = Object.freeze({
  GREEN_UP_RED_DOWN: {
    up: resolveVisualColorValue('P1-Up', 'light'),
    down: resolveVisualColorValue('P2-Down', 'light'),
    upLight: resolveVisualColorValue('P3-UpSoft', 'light'),
    downLight: resolveVisualColorValue('P4-DownSoft', 'light'),
    upDark: resolveVisualColorValue('P1-Up', 'dark'),
    downDark: resolveVisualColorValue('P2-Down', 'dark')
  },
  RED_UP_GREEN_DOWN: {
    up: resolveVisualColorValue('P2-Down', 'light'),
    down: resolveVisualColorValue('P1-Up', 'light'),
    upLight: resolveVisualColorValue('P4-DownSoft', 'light'),
    downLight: resolveVisualColorValue('P3-UpSoft', 'light'),
    upDark: resolveVisualColorValue('P2-Down', 'dark'),
    downDark: resolveVisualColorValue('P1-Up', 'dark')
  }
});

export const resolvePriceColorPalette = (mode: PriceColorModeToken): PriceColorPalette =>
  PRICE_COLOR_PALETTES[mode];

export const resolvePriceTextColors = (
  mode: PriceColorModeToken,
  themeMode: ThemeModeToken
): { up: string; down: string } => {
  const palette = resolvePriceColorPalette(mode);
  return themeMode === 'dark'
    ? { up: palette.upDark, down: palette.downDark }
    : { up: palette.up, down: palette.down };
};

export const DRAW_COLOR_OPTIONS_BY_THEME = Object.freeze({
  light: [
    resolveVisualColorValue('AN1-Neutral', 'light'),
    resolveVisualColorValue('AN2-Warning', 'light'),
    resolveVisualColorValue('AN3-Info', 'light'),
    resolveVisualColorValue('AN4-Magenta', 'light')
  ],
  dark: [
    resolveVisualColorValue('AN1-Neutral', 'dark'),
    resolveVisualColorValue('AN2-Warning', 'dark'),
    resolveVisualColorValue('AN3-Info', 'dark'),
    resolveVisualColorValue('AN4-Magenta', 'dark')
  ]
} as const);

type DrawColorToken =
  | (typeof DRAW_COLOR_OPTIONS_BY_THEME.light)[number]
  | (typeof DRAW_COLOR_OPTIONS_BY_THEME.dark)[number];

const DRAW_COLOR_TOKEN_SET = new Set<DrawColorToken>([
  ...DRAW_COLOR_OPTIONS_BY_THEME.light,
  ...DRAW_COLOR_OPTIONS_BY_THEME.dark
]);

export const resolveDrawColorOptions = (themeMode: ThemeModeToken): readonly DrawColorToken[] =>
  DRAW_COLOR_OPTIONS_BY_THEME[themeMode];

export const isDrawColorOption = (value: string): value is DrawColorToken =>
  DRAW_COLOR_TOKEN_SET.has(value as DrawColorToken);

export const SIMPLE_ANNOTATION_DRAW_COLOR: DrawColorToken = DRAW_COLOR_OPTIONS_BY_THEME.light[1];
