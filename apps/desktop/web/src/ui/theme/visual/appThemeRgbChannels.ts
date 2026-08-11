// SPDX-License-Identifier: GPL-3.0-only

import { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
import { hexToRgbChannels, resolveVisualColorValue } from '@/ui/theme/visual/colorCenter';
import { THEME_TEXT_RGB_CHANNELS } from '@/ui/theme/visual/textColorTokens';
import type { CssVariableMap, ThemeModeToken } from '@/ui/theme/visual/types';

const APP_SURFACE_RGB_CHANNELS: Record<ThemeModeToken, CssVariableMap> = Object.freeze({
  light: {
    '--color-app-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s1),
    '--color-window-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s5),
    '--color-window-toolbar-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s5),
    '--color-panel-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s2),
    '--color-panel-soft-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s6),
    '--color-card-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s2),
    '--color-elevated-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s2),
    '--color-card-border': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s4),
    '--color-subtle-border': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s4),
    '--color-strong-border': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s7),
    '--color-secondary-action': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.actions.a2),
    '--color-locked-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.actions.a4),
    '--color-icon-muted': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.icons.i3),
    '--color-primary': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.actions.a1),
    '--color-primary-hover': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.actions.a5),
    '--color-link': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.brand.b1),
    '--color-link-hover': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.brand.b2),
    '--color-success': hexToRgbChannels(resolveVisualColorValue('ST1-SuccessText', 'light')),
    '--color-danger': hexToRgbChannels(resolveVisualColorValue('ST3-DangerText', 'light')),
    '--color-warning': hexToRgbChannels(resolveVisualColorValue('ST2-WarningText', 'light')),
    '--color-info': hexToRgbChannels(resolveVisualColorValue('ST4-InfoText', 'light')),
    '--color-success-surface': hexToRgbChannels(resolveVisualColorValue('ST7-SuccessSurface', 'light')),
    '--color-warning-surface': hexToRgbChannels(resolveVisualColorValue('ST8-WarningSurface', 'light')),
    '--color-danger-surface': hexToRgbChannels(resolveVisualColorValue('ST9-DangerSurface', 'light')),
    '--color-info-surface': hexToRgbChannels(resolveVisualColorValue('ST10-InfoSurface', 'light')),
    '--color-selected-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.actions.a6),
    '--color-hover-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s3),
    '--color-pressed-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.actions.a6),
    '--color-input-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s6),
    '--color-input-border': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s4),
    '--color-focus-ring': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.brand.b1),
    '--color-chart-grid': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s4),
    '--color-chart-tooltip-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s2),
    '--color-overlay-backdrop': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.text.t1)
  },
  dark: {
    '--color-app-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s1),
    '--color-window-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s5),
    '--color-window-toolbar-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s5),
    '--color-panel-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s2),
    '--color-panel-soft-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s6),
    '--color-card-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s2),
    '--color-elevated-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s2),
    '--color-card-border': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4),
    '--color-subtle-border': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4),
    '--color-strong-border': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s7),
    '--color-secondary-action': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.actions.a2),
    '--color-locked-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.actions.a4),
    '--color-icon-muted': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.icons.i3),
    '--color-primary': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.actions.a1),
    '--color-primary-hover': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.actions.a5),
    '--color-link': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.brand.b1),
    '--color-link-hover': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.brand.b2),
    '--color-success': hexToRgbChannels(resolveVisualColorValue('ST1-SuccessText', 'dark')),
    '--color-danger': hexToRgbChannels(resolveVisualColorValue('ST3-DangerText', 'dark')),
    '--color-warning': hexToRgbChannels(resolveVisualColorValue('ST2-WarningText', 'dark')),
    '--color-info': hexToRgbChannels(resolveVisualColorValue('ST4-InfoText', 'dark')),
    '--color-success-surface': hexToRgbChannels(resolveVisualColorValue('ST7-SuccessSurface', 'dark')),
    '--color-warning-surface': hexToRgbChannels(resolveVisualColorValue('ST8-WarningSurface', 'dark')),
    '--color-danger-surface': hexToRgbChannels(resolveVisualColorValue('ST9-DangerSurface', 'dark')),
    '--color-info-surface': hexToRgbChannels(resolveVisualColorValue('ST10-InfoSurface', 'dark')),
    '--color-selected-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.actions.a6),
    '--color-hover-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s3),
    '--color-pressed-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4),
    '--color-input-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s5),
    '--color-input-border': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4),
    '--color-focus-ring': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.brand.b1),
    '--color-chart-grid': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4),
    '--color-chart-tooltip-bg': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s2),
    '--color-overlay-backdrop': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s1)
  }
});

export const APP_THEME_RGB_CHANNELS: Record<ThemeModeToken, CssVariableMap> = Object.freeze({
  light: {
    ...APP_SURFACE_RGB_CHANNELS.light,
    ...THEME_TEXT_RGB_CHANNELS.light
  },
  dark: {
    ...APP_SURFACE_RGB_CHANNELS.dark,
    ...THEME_TEXT_RGB_CHANNELS.dark
  }
});
