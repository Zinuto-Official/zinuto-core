// SPDX-License-Identifier: GPL-3.0-only

import { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
import { resolveDomThemeMode } from '@/ui/theme/visual/domThemeMode';
import type { IconVisualThemePalette, ThemeModeToken } from '@/ui/theme/visual/types';

const ICON_VISUAL_THEME_PALETTES: Record<ThemeModeToken, IconVisualThemePalette> = Object.freeze({
  light: {
    primary: GLOBAL_COLOR_ARCHITECTURE.light.icons.i1,
    secondary: GLOBAL_COLOR_ARCHITECTURE.light.icons.i2,
    tertiary: GLOBAL_COLOR_ARCHITECTURE.light.icons.i3,
    accent: GLOBAL_COLOR_ARCHITECTURE.light.icons.accent,
    disabled: GLOBAL_COLOR_ARCHITECTURE.light.icons.i3
  },
  dark: {
    primary: GLOBAL_COLOR_ARCHITECTURE.dark.icons.i1,
    secondary: GLOBAL_COLOR_ARCHITECTURE.dark.icons.i2,
    tertiary: GLOBAL_COLOR_ARCHITECTURE.dark.icons.i3,
    accent: GLOBAL_COLOR_ARCHITECTURE.dark.icons.accent,
    disabled: GLOBAL_COLOR_ARCHITECTURE.dark.icons.i3
  }
});

export const resolveIconVisualThemePalette = (themeMode?: ThemeModeToken): IconVisualThemePalette =>
  ICON_VISUAL_THEME_PALETTES[themeMode ?? resolveDomThemeMode()];
