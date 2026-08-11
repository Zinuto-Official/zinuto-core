// SPDX-License-Identifier: GPL-3.0-only

import { toUpperHexDirective } from '@/ui/theme/visual/colorCenter';

export const INDICATOR_COLOR_DIRECTIVES = Object.freeze({
  autofill: Object.freeze([
    toUpperHexDirective('IND11-PresetSky'),
    toUpperHexDirective('IND12-PresetGreen'),
    toUpperHexDirective('IND13-PresetOrange'),
    toUpperHexDirective('IND14-PresetPurple'),
    toUpperHexDirective('IND15-PresetRose')
  ]),
  dualMa: Object.freeze({
    fast: toUpperHexDirective('IND21-PresetAmber'),
    slow: toUpperHexDirective('IND11-PresetSky')
  }),
  systemTemplates: Object.freeze({
    warm: toUpperHexDirective('IND18-PresetWarm'),
    teal: toUpperHexDirective('IND19-PresetTeal'),
    pink: toUpperHexDirective('IND20-PresetPink')
  }),
  docs: Object.freeze({
    info: toUpperHexDirective('IND17-PresetCyan'),
    warning: toUpperHexDirective('IND13-PresetOrange'),
    sky: toUpperHexDirective('IND11-PresetSky'),
    purple: toUpperHexDirective('IND14-PresetPurple'),
    green: toUpperHexDirective('IND12-PresetGreen'),
    rose: toUpperHexDirective('IND15-PresetRose'),
    gold: toUpperHexDirective('IND16-PresetGold'),
    amber: toUpperHexDirective('IND21-PresetAmber'),
    alertRed: toUpperHexDirective('IND22-PresetAlertRed')
  })
});
