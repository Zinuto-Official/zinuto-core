// SPDX-License-Identifier: GPL-3.0-only

import type {
  DirectiveFamily,
  NormalizedPlotStyle,
  PlotDirective,
  PlotLineStyle,
  RenderInstruction,
} from "@/workspaces/custom-indicator/plot/types";
import { getGlobalPriceColorMode, getPriceColorPalette } from "@/domains/chart/priceColorModeState";
import { resolveTradeVisualThemePalette } from "@/ui/theme/visual/buttonColorTokens";
import { CUSTOM_INDICATOR_COLOR_TOKENS } from "@/ui/theme/visual/chartColorTokens";

type NormalizePlotDirectivesResult = Readonly<{
  style: NormalizedPlotStyle;
  directiveFamilies: readonly DirectiveFamily[];
}>;

const buildDefaultStyle = (): NormalizedPlotStyle => ({
  color: CUSTOM_INDICATOR_COLOR_TOKENS.defaultLine,
  lineWidth: 1,
  lineStyle: "solid",
  visibility: "visible",
  renderMode: "line",
  fillColor: null,
  hollow: false,
});

const resolveSystemTradeColors = () => {
  const mode = getGlobalPriceColorMode();
  const palette = getPriceColorPalette(mode);
  const tradeVisual = resolveTradeVisualThemePalette();
  const isGreenUpRedDown = mode === "GREEN_UP_RED_DOWN";
  return {
    buy: tradeVisual.buyMarker,
    sell: tradeVisual.sellMarker,
    red: isGreenUpRedDown ? palette.down : palette.up,
    green: isGreenUpRedDown ? palette.up : palette.down,
  };
};

const parseColorToken = (directive: string): string | null => {
  const upper = directive.toUpperCase();
  const systemTradeColors = resolveSystemTradeColors();
  if (upper === "COLORRED") {
    return systemTradeColors.red;
  }
  if (upper === "COLORGREEN") {
    return systemTradeColors.green;
  }
  const namedColor = CUSTOM_INDICATOR_COLOR_TOKENS.namedFormulaColors[
    upper as keyof typeof CUSTOM_INDICATOR_COLOR_TOKENS.namedFormulaColors
  ];
  if (namedColor) {
    return namedColor;
  }
  const match = /^COLOR([0-9A-F]{6})$/i.exec(upper);
  return match ? `#${match[1]}` : null;
};

const parseDirectiveFamily = (rawDirective: string): DirectiveFamily | null => {
  const directive = rawDirective.trim().toUpperCase();
  if (!directive) {
    return null;
  }

  const color = parseColorToken(directive);
  if (color) {
    return {
      family: "color",
      token: directive,
      value: color,
    };
  }

  const lineWidthMatch = /^LINETHICK(\d+)$/i.exec(directive);
  if (lineWidthMatch) {
    const numeric = Number(lineWidthMatch[1]);
    return {
      family: "lineWidth",
      token: directive,
      value: Number.isFinite(numeric)
        ? Math.min(12, Math.max(1, Math.floor(numeric)))
        : 1,
    };
  }

  if (directive === "DOTLINE") {
    return {
      family: "lineStyle",
      token: directive,
      value: "dot",
    };
  }
  if (directive === "STICK") {
    return {
      family: "renderMode",
      token: directive,
      value: "stick",
    };
  }
  if (directive === "NODRAW") {
    return {
      family: "visibility",
      token: directive,
      value: "hidden",
    };
  }
  if (directive === "DRAWNULL") {
    return {
      family: "visibility",
      token: directive,
      value: "draw-null",
    };
  }

  return null;
};

export const isSupportedPlotColorDirective = (directive: string): boolean =>
  parseColorToken(directive) !== null;

export const isSupportedPlotDirective = (directive: string): boolean =>
  parseDirectiveFamily(String(directive ?? "")) !== null;

export const normalizePlotDirectives = (
  directives: Array<PlotDirective | string>,
  baseStyle?: Partial<NormalizedPlotStyle>,
): NormalizePlotDirectivesResult => {
  const style = {
    ...buildDefaultStyle(),
    ...(baseStyle ?? {}),
  };
  const directiveFamilies: DirectiveFamily[] = [];

  directives.forEach((rawDirective) => {
    const family = parseDirectiveFamily(String(rawDirective ?? ""));
    if (!family) {
      const token = String(rawDirective ?? "").trim();
      if (token) {
        throw new Error(`Unsupported plot directive: ${token}`);
      }
      return;
    }
    directiveFamilies.push(family);
    switch (family.family) {
      case "color":
        style.color = String(family.value);
        break;
      case "lineWidth":
        style.lineWidth = Number(family.value);
        break;
      case "lineStyle":
        style.lineStyle = String(family.value) as PlotLineStyle;
        break;
      case "renderMode":
        style.renderMode = "stick";
        break;
      case "visibility":
        style.visibility = String(family.value) as NormalizedPlotStyle["visibility"];
        break;
      case "fill":
        style.fillColor = family.value ? String(family.value) : null;
        break;
      default:
        break;
    }
  });

  return {
    style,
    directiveFamilies,
  };
};

export const applyPlotDirectives = (
  directives: Array<PlotDirective | string>,
  baseStyle?: Partial<NormalizedPlotStyle>,
): NormalizedPlotStyle =>
  normalizePlotDirectives(directives, baseStyle).style;

export const isAdvancedRenderInstruction = (
  instruction: RenderInstruction,
): boolean =>
  instruction.primitive === "segment" ||
  instruction.primitive === "slopeSegment" ||
  instruction.primitive === "ohlc" ||
  instruction.primitive === "band";
