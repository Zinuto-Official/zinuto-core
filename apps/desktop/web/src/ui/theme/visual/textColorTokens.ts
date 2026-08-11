// SPDX-License-Identifier: GPL-3.0-only

import { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
import { hexToRgbChannels } from '@/ui/theme/visual/colorCenter';
import type { ThemeModeToken } from '@/ui/theme/visual/types';

type ThemeTextRgbChannels = {
  '--color-text-primary': string;
  '--color-text-secondary': string;
  '--color-text-tertiary': string;
  '--color-text-muted': string;
  '--color-text-inverse': string;
  '--color-chart-axis': string;
};

export const THEME_TEXT_RGB_CHANNELS: Record<ThemeModeToken, ThemeTextRgbChannels> = Object.freeze({
  light: {
    '--color-text-primary': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.text.t1),
    '--color-text-secondary': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.text.t2),
    '--color-text-tertiary': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.text.t5),
    '--color-text-muted': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.text.t3),
    '--color-text-inverse': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.text.t4),
    '--color-chart-axis': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.light.text.t2)
  },
  dark: {
    '--color-text-primary': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.text.t1),
    '--color-text-secondary': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.text.t2),
    '--color-text-tertiary': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.text.t5),
    '--color-text-muted': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.text.t3),
    '--color-text-inverse': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.text.t4),
    '--color-chart-axis': hexToRgbChannels(GLOBAL_COLOR_ARCHITECTURE.dark.text.t2)
  }
});
