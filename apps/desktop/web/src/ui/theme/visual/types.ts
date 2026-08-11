// SPDX-License-Identifier: GPL-3.0-only

export type PriceColorModeToken = 'RED_UP_GREEN_DOWN' | 'GREEN_UP_RED_DOWN';
export type TradeColorThemeToken = 'INSTITUTIONAL' | 'CRYPTO' | 'ACCESSIBLE';
export type ThemeModeToken = 'light' | 'dark';

export type CssVariableMap = Record<`--${string}`, string>;

export type PriceColorPalette = {
  up: string;
  down: string;
  upLight: string;
  downLight: string;
  upDark: string;
  downDark: string;
};

export type TradeVisualThemePalette = {
  buyButtonBg: string;
  buyButtonText: string;
  buyMarker: string;
  sellButtonBg: string;
  sellButtonBorder: string;
  sellButtonText: string;
  sellMarker: string;
  sellMarkerOutline: string;
  positionLine: string;
};

export type IconVisualThemePalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  accent: string;
  disabled: string;
};

export type SurfaceColorSet = {
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  s6: string;
  s7: string;
};

export type TextColorSet = {
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  t5: string;
};

export type ActionColorSet = {
  a1: string;
  a2: string;
  a3: string;
  a4: string;
  a5: string;
  a6: string;
};

export type IconColorSet = {
  i1: string;
  i2: string;
  i3: string;
  accent: string;
};

export type BrandColorSet = {
  b1: string;
  b2: string;
};

export type VisualColorArchitecture = {
  surfaces: SurfaceColorSet;
  text: TextColorSet;
  actions: ActionColorSet;
  icons: IconColorSet;
  brand: BrandColorSet;
};
