// SPDX-License-Identifier: GPL-3.0-only

import { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
import { resolveVisualColorValue } from '@/ui/theme/visual/colorCenter';
import { TRADE_VISUAL_THEME_PALETTES } from '@/ui/theme/visual/buttonColorTokens';
import type { ThemeModeToken } from '@/ui/theme/visual/types';

export type SystemColorTokens = {
  white: string;
  black: string;
  transparent: string;
  blackShort: string;
  brandInkBase: string;
  brandInkElevated: string;
  brandInkSoft: string;
  brandPorcelain: string;
  brandIvoryLine: string;
  brandMist: string;
  darkMixBase: string;
  darkMixAlt: string;
  tooltipBorderBase: string;
  flatValue: string;
  dangerAccent: string;
  brandGradientStart: string;
  brandGradientEnd: string;
  warningText: string;
  warningAccent: string;
  warningAccentSoft: string;
  dangerSolid: string;
  dangerSolidHover: string;
  dangerBorderSoft: string;
  dangerText: string;
  primaryTintA: string;
  primaryTintB: string;
  trainerPanelStart: string;
  trainerPanelEnd: string;
  trainerChartBackground: string;
  tooltipBackground: string;
  tooltipShadowTint: string;
  mutedStrongRgb: string;
  historyPreviewBg: string;
  historyPreviewGlassBg: string;
  tradeBuy: string;
  tradeSell: string;
};

const SYSTEM_COLOR_COMMON = Object.freeze({
  white: resolveVisualColorValue('C1-White', 'light'),
  black: resolveVisualColorValue('C2-Black', 'light'),
  transparent: resolveVisualColorValue('C3-Transparent', 'light'),
  blackShort: resolveVisualColorValue('C2-Black', 'light')
});

const SYSTEM_COLOR_THEME_TOKENS: Record<ThemeModeToken, Omit<SystemColorTokens, keyof typeof SYSTEM_COLOR_COMMON>> = Object.freeze({
  light: {
    brandInkBase: resolveVisualColorValue('BR5-CommunityObsidian', 'light'),
    brandInkElevated: resolveVisualColorValue('BR6-CommunityGraphite', 'light'),
    brandInkSoft: resolveVisualColorValue('BR7-CommunityCharcoal', 'light'),
    brandPorcelain: resolveVisualColorValue('BR8-CommunityPorcelain', 'light'),
    brandIvoryLine: resolveVisualColorValue('BR9-CommunityIvoryLine', 'light'),
    brandMist: resolveVisualColorValue('BR10-CommunityMist', 'light'),
    darkMixBase: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s1,
    darkMixAlt: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s2,
    tooltipBorderBase: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s4,
    flatValue: GLOBAL_COLOR_ARCHITECTURE.light.text.t2,
    dangerAccent: resolveVisualColorValue('ST3-DangerText', 'light'),
    brandGradientStart: resolveVisualColorValue('BR5-CommunityObsidian', 'light'),
    brandGradientEnd: resolveVisualColorValue('BR7-CommunityCharcoal', 'light'),
    warningText: resolveVisualColorValue('ST2-WarningText', 'light'),
    warningAccent: resolveVisualColorValue('ST2-WarningText', 'light'),
    warningAccentSoft: resolveVisualColorValue('ST8-WarningSurface', 'light'),
    dangerSolid: resolveVisualColorValue('ST5-DangerSolid', 'light'),
    dangerSolidHover: resolveVisualColorValue('ST6-DangerSolidHover', 'light'),
    dangerBorderSoft: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s4,
    dangerText: resolveVisualColorValue('ST3-DangerText', 'light'),
    primaryTintA: GLOBAL_COLOR_ARCHITECTURE.light.actions.a6,
    primaryTintB: GLOBAL_COLOR_ARCHITECTURE.light.brand.b1,
    trainerPanelStart: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s2,
    trainerPanelEnd: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s6,
    trainerChartBackground: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s1,
    tooltipBackground: resolveVisualColorValue('OV1-TooltipBg', 'light'),
    tooltipShadowTint: resolveVisualColorValue('OV2-TooltipShadowTint', 'light'),
    mutedStrongRgb: resolveVisualColorValue('T3-Disabled', 'light'),
    historyPreviewBg: 'rgb(var(--color-panel-soft-bg))',
    historyPreviewGlassBg: 'rgb(var(--color-card-bg) / 0.64)',
    tradeBuy: TRADE_VISUAL_THEME_PALETTES.light.buyButtonBg,
    tradeSell: TRADE_VISUAL_THEME_PALETTES.light.sellButtonBg
  },
  dark: {
    brandInkBase: resolveVisualColorValue('BR5-CommunityObsidian', 'dark'),
    brandInkElevated: resolveVisualColorValue('BR6-CommunityGraphite', 'dark'),
    brandInkSoft: resolveVisualColorValue('BR7-CommunityCharcoal', 'dark'),
    brandPorcelain: resolveVisualColorValue('BR8-CommunityPorcelain', 'dark'),
    brandIvoryLine: resolveVisualColorValue('BR9-CommunityIvoryLine', 'dark'),
    brandMist: resolveVisualColorValue('BR10-CommunityMist', 'dark'),
    darkMixBase: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s1,
    darkMixAlt: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s2,
    tooltipBorderBase: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4,
    flatValue: GLOBAL_COLOR_ARCHITECTURE.dark.text.t2,
    dangerAccent: resolveVisualColorValue('ST3-DangerText', 'dark'),
    brandGradientStart: resolveVisualColorValue('BR5-CommunityObsidian', 'dark'),
    brandGradientEnd: resolveVisualColorValue('BR7-CommunityCharcoal', 'dark'),
    warningText: resolveVisualColorValue('ST2-WarningText', 'dark'),
    warningAccent: resolveVisualColorValue('ST2-WarningText', 'dark'),
    warningAccentSoft: resolveVisualColorValue('ST8-WarningSurface', 'dark'),
    dangerSolid: resolveVisualColorValue('ST5-DangerSolid', 'dark'),
    dangerSolidHover: resolveVisualColorValue('ST6-DangerSolidHover', 'dark'),
    dangerBorderSoft: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4,
    dangerText: resolveVisualColorValue('ST3-DangerText', 'dark'),
    primaryTintA: GLOBAL_COLOR_ARCHITECTURE.dark.actions.a6,
    primaryTintB: GLOBAL_COLOR_ARCHITECTURE.dark.brand.b1,
    trainerPanelStart: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s2,
    trainerPanelEnd: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s6,
    trainerChartBackground: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s1,
    tooltipBackground: resolveVisualColorValue('OV1-TooltipBg', 'dark'),
    tooltipShadowTint: resolveVisualColorValue('OV2-TooltipShadowTint', 'dark'),
    mutedStrongRgb: resolveVisualColorValue('T2-Secondary', 'dark'),
    historyPreviewBg: 'rgb(var(--color-panel-soft-bg))',
    historyPreviewGlassBg: 'rgb(var(--color-card-bg) / 0.66)',
    tradeBuy: TRADE_VISUAL_THEME_PALETTES.dark.buyButtonBg,
    tradeSell: TRADE_VISUAL_THEME_PALETTES.dark.sellButtonBg
  }
});

export const resolveSystemColorTokens = (themeMode: ThemeModeToken): SystemColorTokens => ({
  ...SYSTEM_COLOR_COMMON,
  ...SYSTEM_COLOR_THEME_TOKENS[themeMode]
});

export const SYSTEM_COLOR_TOKENS = Object.freeze({
  ...SYSTEM_COLOR_COMMON
});
