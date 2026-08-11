// SPDX-License-Identifier: GPL-3.0-only

import { resolveVisualColorValue } from '@/ui/theme/visual/colorCenter';
import type { ThemeModeToken, VisualColorArchitecture } from '@/ui/theme/visual/types';

export const GLOBAL_COLOR_ARCHITECTURE: Record<ThemeModeToken, VisualColorArchitecture> = Object.freeze({
  dark: {
    surfaces: {
      s1: resolveVisualColorValue('S1-Base', 'dark'),
      s2: resolveVisualColorValue('S2-Panel', 'dark'),
      s3: resolveVisualColorValue('S3-Hover', 'dark'),
      s4: resolveVisualColorValue('S4-Border', 'dark'),
      s5: resolveVisualColorValue('S5-Shell', 'dark'),
      s6: resolveVisualColorValue('S6-PanelSoft', 'dark'),
      s7: resolveVisualColorValue('S7-BorderStrong', 'dark')
    },
    text: {
      t1: resolveVisualColorValue('T1-Primary', 'dark'),
      t2: resolveVisualColorValue('T2-Secondary', 'dark'),
      t3: resolveVisualColorValue('T3-Disabled', 'dark'),
      t4: resolveVisualColorValue('T4-Inverse', 'dark'),
      t5: resolveVisualColorValue('T5-Muted', 'dark')
    },
    actions: {
      a1: resolveVisualColorValue('A1-Buy', 'dark'),
      a2: resolveVisualColorValue('A2-Sell', 'dark'),
      a3: resolveVisualColorValue('A3-Danger', 'dark'),
      a4: resolveVisualColorValue('A4-Locked', 'dark'),
      a5: resolveVisualColorValue('A5-PrimaryHover', 'dark'),
      a6: resolveVisualColorValue('A6-SelectedSurface', 'dark')
    },
    brand: {
      b1: resolveVisualColorValue('B1-BrandPrimary', 'dark'),
      b2: resolveVisualColorValue('B2-BrandPrimaryHover', 'dark')
    },
    icons: {
      i1: resolveVisualColorValue('I1-Active', 'dark'),
      i2: resolveVisualColorValue('I2-Regular', 'dark'),
      i3: resolveVisualColorValue('I3-Muted', 'dark'),
      accent: resolveVisualColorValue('B1-BrandPrimary', 'dark')
    }
  },
  light: {
    surfaces: {
      s1: resolveVisualColorValue('S1-Base', 'light'),
      s2: resolveVisualColorValue('S2-Panel', 'light'),
      s3: resolveVisualColorValue('S3-Hover', 'light'),
      s4: resolveVisualColorValue('S4-Border', 'light'),
      s5: resolveVisualColorValue('S5-Shell', 'light'),
      s6: resolveVisualColorValue('S6-PanelSoft', 'light'),
      s7: resolveVisualColorValue('S7-BorderStrong', 'light')
    },
    text: {
      t1: resolveVisualColorValue('T1-Primary', 'light'),
      t2: resolveVisualColorValue('T2-Secondary', 'light'),
      t3: resolveVisualColorValue('T3-Disabled', 'light'),
      t4: resolveVisualColorValue('T4-Inverse', 'light'),
      t5: resolveVisualColorValue('T5-Muted', 'light')
    },
    actions: {
      a1: resolveVisualColorValue('A1-Buy', 'light'),
      a2: resolveVisualColorValue('A2-Sell', 'light'),
      a3: resolveVisualColorValue('A3-Danger', 'light'),
      a4: resolveVisualColorValue('A4-Locked', 'light'),
      a5: resolveVisualColorValue('A5-PrimaryHover', 'light'),
      a6: resolveVisualColorValue('A6-SelectedSurface', 'light')
    },
    brand: {
      b1: resolveVisualColorValue('B1-BrandPrimary', 'light'),
      b2: resolveVisualColorValue('B2-BrandPrimaryHover', 'light')
    },
    icons: {
      i1: resolveVisualColorValue('I1-Active', 'light'),
      i2: resolveVisualColorValue('I2-Regular', 'light'),
      i3: resolveVisualColorValue('I3-Muted', 'light'),
      accent: resolveVisualColorValue('B1-BrandPrimary', 'light')
    }
  }
});
