// SPDX-License-Identifier: GPL-3.0-only

import { GLOBAL_COLOR_ARCHITECTURE } from '@/ui/theme/visual/colorArchitecture';
import { resolveVisualColorValue } from '@/ui/theme/visual/colorCenter';
import { TRADE_VISUAL_THEME_PALETTES } from '@/ui/theme/visual/buttonColorTokens';

export const CHART_STYLE_COLOR_TOKENS = Object.freeze({
  curve: {
    areaLineDark: resolveVisualColorValue('CH1-CurveAreaLine', 'dark'),
    areaLineLight: resolveVisualColorValue('CH1-CurveAreaLine', 'light'),
    areaBackgroundDark: resolveVisualColorValue('CH2-CurveAreaFill', 'dark'),
    areaBackgroundLight: resolveVisualColorValue('CH2-CurveAreaFill', 'light'),
    gridLineDark: resolveVisualColorValue('CH3-CurveGrid', 'dark'),
    gridLineLight: resolveVisualColorValue('CH3-CurveGrid', 'light'),
    baselineLineDark: resolveVisualColorValue('CH4-CurveBaseline', 'dark'),
    baselineLineLight: resolveVisualColorValue('CH4-CurveBaseline', 'light'),
    benchmarkLineDark: resolveVisualColorValue('CH5-CurveCrosshair', 'dark'),
    benchmarkLineLight: resolveVisualColorValue('CH5-CurveCrosshair', 'light'),
    crosshairLineDark: resolveVisualColorValue('CH5-CurveCrosshair', 'dark'),
    crosshairLineLight: resolveVisualColorValue('CH5-CurveCrosshair', 'light'),
    transparent: resolveVisualColorValue('C3-Transparent', 'light')
  },
  main: {
    gridHorizontalDark: resolveVisualColorValue('CH6-MainGridHorizontal', 'dark'),
    gridHorizontalLight: resolveVisualColorValue('CH6-MainGridHorizontal', 'light'),
    gridVerticalDark: resolveVisualColorValue('CH7-MainGridVertical', 'dark'),
    gridVerticalLight: resolveVisualColorValue('CH7-MainGridVertical', 'light'),
    noChangeDark: GLOBAL_COLOR_ARCHITECTURE.dark.text.t2,
    noChangeLight: GLOBAL_COLOR_ARCHITECTURE.light.text.t2,
    axisLineDark: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4,
    axisLineLight: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s4,
    tickLineDark: GLOBAL_COLOR_ARCHITECTURE.dark.surfaces.s4,
    tickLineLight: GLOBAL_COLOR_ARCHITECTURE.light.surfaces.s4,
    tickTextDark: GLOBAL_COLOR_ARCHITECTURE.dark.text.t2,
    tickTextLight: GLOBAL_COLOR_ARCHITECTURE.light.text.t2,
    overlayPrimaryDark: resolveVisualColorValue('A1-Buy', 'dark'),
    overlayPrimaryLight: resolveVisualColorValue('A1-Buy', 'light')
  }
});

export const TRAINER_OVERLAY_COLOR_TOKENS = Object.freeze({
  decisionBoundary: {
    lineColorLight: resolveVisualColorValue('C2-Black', 'light'),
    lineColorDark: resolveVisualColorValue('C1-White', 'dark'),
    lineWidthThin: 1,
    lineWidthThick: 2,
    lineStyle: 'dashed' as const,
    lineDashedValue: [1, 4] as const
  },
  decisionMark: {
    fontWeight: 800,
    anchorY: 64,
    neutralLight: resolveVisualColorValue('C2-Black', 'light'),
    neutralDark: resolveVisualColorValue('C1-White', 'dark')
  },
  decisionReference: {
    lineStyle: 'dashed' as const,
    lineSize: 1.5,
    lineDashedValue: [6, 4] as const,
    observeToneLight: GLOBAL_COLOR_ARCHITECTURE.light.text.t3,
    observeToneDark: GLOBAL_COLOR_ARCHITECTURE.dark.text.t3,
    textColor: resolveVisualColorValue('C1-White', 'light'),
    labelFontWeight: 700,
    labelRadius: 8,
    labelPaddingX: 10,
    labelPaddingY: 5,
    labelInsetRight: 10
  },
  compactTradeMarker: {
    buy: {
      fillLight: TRADE_VISUAL_THEME_PALETTES.light.buyMarker,
      fillDark: TRADE_VISUAL_THEME_PALETTES.dark.buyMarker,
      border: resolveVisualColorValue('OV3-CompactTradeBuyBorder', 'light'),
      text: resolveVisualColorValue('OV5-CompactTradeText', 'light')
    },
    sell: {
      fillLight: TRADE_VISUAL_THEME_PALETTES.light.sellMarker,
      fillDark: TRADE_VISUAL_THEME_PALETTES.dark.sellMarker,
      border: resolveVisualColorValue('OV4-CompactTradeSellBorder', 'light'),
      text: resolveVisualColorValue('OV5-CompactTradeText', 'light')
    }
  },
  positionLineFlatLight: TRADE_VISUAL_THEME_PALETTES.light.positionLine,
  positionLineFlatDark: TRADE_VISUAL_THEME_PALETTES.dark.positionLine,
  noteMarker: {
    fill: resolveVisualColorValue('OV6-NoteMarkerFill', 'light'),
    border: resolveVisualColorValue('OV7-NoteMarkerBorder', 'light'),
    text: resolveVisualColorValue('OV8-NoteMarkerText', 'light')
  },
  diagnosticFocus: {
    primaryLight: resolveVisualColorValue('A1-Buy', 'light'),
    primaryDark: resolveVisualColorValue('A1-Buy', 'dark'),
    warning: resolveVisualColorValue('OV9-DiagnosticWarning', 'light'),
    dangerLight: resolveVisualColorValue('A3-Danger', 'light'),
    dangerDark: resolveVisualColorValue('A3-Danger', 'dark')
  }
});

export const CUSTOM_INDICATOR_COLOR_TOKENS = Object.freeze({
  defaultLine: resolveVisualColorValue('IND1-DefaultLine', 'light'),
  namedFormulaColors: Object.freeze({
    COLORWHITE: resolveVisualColorValue('IND2-FormulaWhite', 'light'),
    COLORBLACK: resolveVisualColorValue('IND3-FormulaBlack', 'light'),
    COLORBLUE: resolveVisualColorValue('IND4-FormulaBlue', 'light'),
    COLORYELLOW: resolveVisualColorValue('IND5-FormulaYellow', 'light'),
    COLORCYAN: resolveVisualColorValue('IND6-FormulaCyan', 'light'),
    COLORMAGENTA: resolveVisualColorValue('IND7-FormulaMagenta', 'light'),
    COLORGRAY: resolveVisualColorValue('IND8-FormulaGray', 'light'),
    COLORGREY: resolveVisualColorValue('IND8-FormulaGray', 'light'),
    COLORPURPLE: resolveVisualColorValue('IND9-FormulaPurple', 'light'),
    COLORORANGE: resolveVisualColorValue('IND10-FormulaOrange', 'light')
  })
});
