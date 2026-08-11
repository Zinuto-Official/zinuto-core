// SPDX-License-Identifier: GPL-3.0-only

import { APP_THEME_RGB_CHANNELS } from '@/ui/theme/visual/appThemeRgbChannels';
import { resolveTradeVisualThemePalette } from '@/ui/theme/visual/buttonColorTokens';
import {
  resolveVisualColorValue
} from '@/ui/theme/visual/colorCenter';
import { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
import { resolveIconVisualThemePalette } from '@/ui/theme/visual/iconColorTokens';
import {
  PRICE_COLOR_PALETTES,
  resolvePriceTextColors
} from '@/ui/theme/visual/priceColorTokens';
import { resolveSystemColorTokens } from '@/ui/theme/visual/systemColorTokens';
import type {
  CssVariableMap,
  PriceColorModeToken,
  ThemeModeToken,
  TradeColorThemeToken
} from '@/ui/theme/visual/types';

export type {
  ThemeModeToken,
  TradeColorThemeToken
} from '@/ui/theme/visual/types';

export {
  resolveTradeVisualThemePalette
} from '@/ui/theme/visual/buttonColorTokens';
export {
  DEFAULT_TRADE_COLOR_THEME,
  isTradeColorThemeToken,
  resolveTradeColorThemeSwatches,
  setGlobalTradeColorTheme
} from '@/ui/theme/visual/tradeColorThemes';
export {
  CHART_STYLE_COLOR_TOKENS,
  CUSTOM_INDICATOR_COLOR_TOKENS,
  TRAINER_OVERLAY_COLOR_TOKENS
} from '@/ui/theme/visual/chartColorTokens';
export {
  resolveVisualColorValue
} from '@/ui/theme/visual/colorCenter';
export { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
export {
  DRAW_COLOR_OPTIONS_BY_THEME,
  SIMPLE_ANNOTATION_DRAW_COLOR,
  isDrawColorOption,
  resolveDrawColorOptions,
  resolvePriceColorPalette,
  resolvePriceTextColors
} from '@/ui/theme/visual/priceColorTokens';

export const buildGlobalVisualCssVariables = (
  themeMode: ThemeModeToken,
  priceColorMode: PriceColorModeToken,
  tradeColorTheme: TradeColorThemeToken
): CssVariableMap => {
  const priceColors = resolvePriceTextColors(priceColorMode, themeMode);
  const tradeVisual = resolveTradeVisualThemePalette(themeMode, tradeColorTheme);
  const iconVisual = resolveIconVisualThemePalette(themeMode);
  const architecture = GLOBAL_COLOR_ARCHITECTURE[themeMode];
  const systemTokens = resolveSystemColorTokens(themeMode);
  return {
    ...APP_THEME_RGB_CHANNELS[themeMode],
    '--surface-s1': architecture.surfaces.s1,
    '--surface-s2': architecture.surfaces.s2,
    '--surface-s3': architecture.surfaces.s3,
    '--surface-s4': architecture.surfaces.s4,
    '--surface-s5': architecture.surfaces.s5,
    '--surface-s6': architecture.surfaces.s6,
    '--surface-s7': architecture.surfaces.s7,
    '--text-t1': architecture.text.t1,
    '--text-t2': architecture.text.t2,
    '--text-t3': architecture.text.t5,
    '--text-t4': architecture.text.t4,
    '--text-t5': architecture.text.t5,
    '--action-a1': architecture.actions.a1,
    '--action-a2': architecture.actions.a2,
    '--action-a3': architecture.actions.a3,
    '--action-a4': architecture.actions.a4,
    '--action-a5': architecture.actions.a5,
    '--action-a6': architecture.actions.a6,
    '--icon-i1': architecture.icons.i1,
    '--icon-i2': architecture.icons.i2,
    '--icon-i3': architecture.icons.i3,
    '--icon-accent': architecture.brand.b1,
    '--price-up-color': priceColors.up,
    '--price-down-color': priceColors.down,
    '--trade-buy-color': tradeVisual.buyButtonBg,
    '--trade-buy-text-color': tradeVisual.buyButtonText,
    '--trade-buy-marker-color': tradeVisual.buyMarker,
    '--trade-sell-color': tradeVisual.sellButtonBg,
    '--trade-sell-border-color': tradeVisual.sellButtonBorder,
    '--trade-sell-text-color': tradeVisual.sellButtonText,
    '--trade-sell-marker-color': tradeVisual.sellMarker,
    '--trade-sell-marker-outline-color': tradeVisual.sellMarkerOutline,
    '--trade-position-line-color': tradeVisual.positionLine,
    '--icon-color-primary': iconVisual.primary,
    '--icon-color-secondary': iconVisual.secondary,
    '--icon-color-tertiary': iconVisual.tertiary,
    '--icon-color-accent': iconVisual.accent,
    '--icon-color-disabled': iconVisual.disabled,
    '--accent': iconVisual.accent,
    '--hover': 'var(--rail-hover-bg)',
    '--panel-hover': 'var(--surface-control-hover)',
    '--history-preview-bg': 'rgb(var(--color-panel-soft-bg))',
    '--history-preview-glass-bg': themeMode === 'dark' ? 'rgb(var(--color-card-bg) / 0.66)' : 'rgb(var(--color-card-bg) / 0.64)',
    '--history-preview-glass-edge': '10px',
    '--chrome-start': 'rgb(var(--color-panel-bg))',
    '--chrome-end': 'rgb(var(--color-panel-soft-bg))',
    '--visual-price-green-up-light': PRICE_COLOR_PALETTES.GREEN_UP_RED_DOWN.up,
    '--visual-price-green-down-light': PRICE_COLOR_PALETTES.GREEN_UP_RED_DOWN.down,
    '--visual-price-green-up-dark': PRICE_COLOR_PALETTES.GREEN_UP_RED_DOWN.upDark,
    '--visual-price-green-down-dark': PRICE_COLOR_PALETTES.GREEN_UP_RED_DOWN.downDark,
    '--visual-white': systemTokens.white,
    '--visual-black': systemTokens.black,
    '--visual-black-short': systemTokens.blackShort,
    '--visual-transparent': systemTokens.transparent,
    '--visual-dark-mix-base': systemTokens.darkMixBase,
    '--visual-dark-mix-alt': systemTokens.darkMixAlt,
    '--visual-brand-ink-base': systemTokens.brandInkBase,
    '--visual-brand-ink-elevated': systemTokens.brandInkElevated,
    '--visual-brand-ink-soft': systemTokens.brandInkSoft,
    '--visual-brand-porcelain': systemTokens.brandPorcelain,
    '--visual-brand-ivory-line': systemTokens.brandIvoryLine,
    '--visual-brand-mist': systemTokens.brandMist,
    '--visual-tooltip-border-base': systemTokens.tooltipBorderBase,
    '--visual-flat-value': systemTokens.flatValue,
    '--visual-danger-accent': systemTokens.dangerAccent,
    '--visual-brand-gradient-start': systemTokens.brandGradientStart,
    '--visual-brand-gradient-end': systemTokens.brandGradientEnd,
    '--visual-accent-base': architecture.actions.a1,
    '--visual-accent-hover': architecture.actions.a5,
    '--visual-link-accent': architecture.brand.b1,
    '--visual-link-accent-hover': architecture.brand.b2,
    '--visual-accent-soft': themeMode === 'dark' ? 'rgb(var(--color-primary) / 0.18)' : 'rgb(var(--color-primary) / 0.12)',
    '--visual-accent-surface': 'rgb(var(--color-selected-bg))',
    '--visual-accent-contrast': architecture.text.t4,
    '--visual-accent-ring': themeMode === 'dark' ? 'rgb(var(--color-focus-ring) / 0.3)' : 'rgb(var(--color-focus-ring) / 0.22)',
    '--visual-warning-text': systemTokens.warningText,
    '--visual-warning-accent': systemTokens.warningAccent,
    '--visual-warning-accent-soft': systemTokens.warningAccentSoft,
    '--visual-danger-solid': systemTokens.dangerSolid,
    '--visual-danger-solid-hover': systemTokens.dangerSolidHover,
    '--visual-danger-border-soft': systemTokens.dangerBorderSoft,
    '--visual-danger-text': systemTokens.dangerText,
    '--challenge-risk-mode-accent': systemTokens.brandMist,
    '--challenge-risk-mode-accent-solid': architecture.actions.a1,
    '--success': resolveVisualColorValue('ST1-SuccessText', themeMode),
    '--success-soft': resolveVisualColorValue('ST7-SuccessSurface', themeMode),
    '--warning': resolveVisualColorValue('ST2-WarningText', themeMode),
    '--warning-soft': resolveVisualColorValue('ST8-WarningSurface', themeMode),
    '--danger': resolveVisualColorValue('ST3-DangerText', themeMode),
    '--danger-soft': resolveVisualColorValue('ST9-DangerSurface', themeMode),
    '--info': resolveVisualColorValue('ST4-InfoText', themeMode),
    '--info-soft': resolveVisualColorValue('ST10-InfoSurface', themeMode),
    '--note-color-red': resolveVisualColorValue('NT1-Red', themeMode),
    '--note-color-orange': resolveVisualColorValue('NT2-Orange', themeMode),
    '--note-color-yellow': resolveVisualColorValue('NT3-Yellow', themeMode),
    '--note-color-green': resolveVisualColorValue('NT4-Green', themeMode),
    '--note-color-blue': resolveVisualColorValue('NT5-Blue', themeMode),
    '--visual-primary-tint-a': systemTokens.primaryTintA,
    '--visual-primary-tint-b': systemTokens.primaryTintB,
    '--visual-trainer-panel-start': systemTokens.trainerPanelStart,
    '--visual-trainer-panel-end': systemTokens.trainerPanelEnd,
    '--visual-trainer-chart-background': systemTokens.trainerChartBackground,
    '--visual-tooltip-bg': systemTokens.tooltipBackground,
    '--visual-tooltip-shadow': `0 8px 20px ${systemTokens.tooltipShadowTint}`,
    '--visual-muted-strong-rgb': systemTokens.mutedStrongRgb
  };
};
