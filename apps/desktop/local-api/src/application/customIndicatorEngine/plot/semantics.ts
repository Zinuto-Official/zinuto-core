// SPDX-License-Identifier: GPL-3.0-only

import type { BooleanOperand, BooleanSeries, NumericOperand, NumericSeries } from '../runtime/index.js';
import type {
  BandRenderInstruction,
  DirectiveFamily,
  HistogramRenderInstruction,
  IconMarkerRenderInstruction,
  LineRenderInstruction,
  NormalizedPlotStyle,
  NumberMarkerRenderInstruction,
  OhlcRenderInstruction,
  PlotDirective,
  PlotLineStyle,
  RenderInstruction,
  SlopeSegmentRenderInstruction,
  SegmentRenderInstruction,
  TextMarkerRenderInstruction,
} from '../plot/types.js';
import { resolveFutuSupportState, type FutuCapabilitySupportState } from '../futu/futuSupportMatrix.js';

const DEFAULT_LINE_COLOR = '#60A5FA';
const NAMED_FORMULA_COLORS = Object.freeze({
  COLORWHITE: '#F8FAFC',
  COLORBLACK: '#0F172A',
  COLORBLUE: '#3B82F6',
  COLORYELLOW: '#FBBF24',
  COLORCYAN: '#22D3EE',
  COLORMAGENTA: '#F472B6',
  COLORGRAY: '#94A3B8',
  COLORGREY: '#94A3B8',
  COLORPURPLE: '#A78BFA',
  COLORORANGE: '#FB923C',
});

type SystemTradeColors = {
  buy: string;
  sell: string;
  red: string;
  green: string;
};

type NormalizePlotDirectivesResult = Readonly<{
  style: NormalizedPlotStyle;
  directiveFamilies: readonly DirectiveFamily[];
}>;

type RenderInstructionMeta = Readonly<{
  sourceFunction: string | null;
  supportState: FutuCapabilitySupportState;
}>;

const resolveSystemTradeColors = (): SystemTradeColors => {
  return {
    buy: '#1F6BFF',
    sell: '#E8EEF5',
    red: '#F23645',
    green: '#089981',
  };
};

const buildDefaultStyle = (): NormalizedPlotStyle => ({
  color: DEFAULT_LINE_COLOR,
  lineWidth: 1,
  lineStyle: 'solid',
  visibility: 'visible',
  renderMode: 'line',
  fillColor: null,
  hollow: false,
});


const inferLength = (...operands: unknown[]): number => {
  let length = 0;
  operands.forEach((operand) => {
    if (Array.isArray(operand)) {
      length = Math.max(length, operand.length);
    }
  });
  return length;
};

const toNumericSeries = (operand: NumericOperand, length: number): NumericSeries => {
  if (Array.isArray(operand)) {
    const series = new Array<number>(length).fill(Number.NaN);
    for (let index = 0; index < length; index += 1) {
      const numeric = Number(operand[index]);
      series[index] = Number.isFinite(numeric) ? numeric : Number.NaN;
    }
    return series;
  }
  const numeric = Number(operand);
  return new Array<number>(length).fill(Number.isFinite(numeric) ? numeric : Number.NaN);
};

const toBooleanSeries = (operand: BooleanOperand | NumericOperand, length: number): BooleanSeries => {
  if (Array.isArray(operand)) {
    const series = new Array<boolean>(length).fill(false);
    for (let index = 0; index < length; index += 1) {
      const value = operand[index];
      if (typeof value === 'boolean') {
        series[index] = value;
        continue;
      }
      const numeric = Number(value);
      series[index] = Number.isFinite(numeric) && numeric !== 0;
    }
    return series;
  }
  if (typeof operand === 'boolean') {
    return new Array<boolean>(length).fill(operand);
  }
  const numeric = Number(operand);
  return new Array<boolean>(length).fill(Number.isFinite(numeric) && numeric !== 0);
};

const toConstantBooleanSeries = (value: boolean, length: number): BooleanSeries =>
  new Array<boolean>(length).fill(value);

const toConstantNumericSeries = (value: number, length: number): NumericSeries =>
  new Array<number>(length).fill(value);

const resolveInstructionMeta = (sourceFunction?: string | null): RenderInstructionMeta => {
  const normalized = String(sourceFunction ?? '').trim().toUpperCase();
  if (!normalized) {
    return {
      sourceFunction: null,
      supportState: 'full',
    };
  }
  return {
    sourceFunction: normalized,
    supportState: resolveFutuSupportState(normalized),
  };
};

const parseColorToken = (directive: string): string | null => {
  const upper = directive.toUpperCase();
  const systemTradeColors = resolveSystemTradeColors();
  if (upper === 'COLORRED') {
    return systemTradeColors.red;
  }
  if (upper === 'COLORGREEN') {
    return systemTradeColors.green;
  }
  const namedColor = NAMED_FORMULA_COLORS[
    upper as keyof typeof NAMED_FORMULA_COLORS
  ];
  if (namedColor) {
    return namedColor;
  }
  const match = /^COLOR([0-9A-F]{6})$/i.exec(upper);
  if (!match) {
    return null;
  }
  return `#${match[1]}`;
};

const parseDirectiveFamily = (rawDirective: string): DirectiveFamily | null => {
  const directive = rawDirective.trim().toUpperCase();
  if (!directive) {
    return null;
  }

  const color = parseColorToken(directive);
  if (color) {
    return {
      family: 'color',
      token: directive,
      value: color,
    };
  }

  const lineWidthMatch = /^LINETHICK(\d+)$/i.exec(directive);
  if (lineWidthMatch) {
    const numeric = Number(lineWidthMatch[1]);
    return {
      family: 'lineWidth',
      token: directive,
      value: Number.isFinite(numeric) ? Math.min(12, Math.max(1, Math.floor(numeric))) : 1,
    };
  }

  if (directive === 'DOTLINE') {
    return {
      family: 'lineStyle',
      token: directive,
      value: 'dot',
    };
  }
  if (directive === 'STICK') {
    return {
      family: 'renderMode',
      token: directive,
      value: 'stick',
    };
  }
  if (directive === 'NODRAW') {
    return {
      family: 'visibility',
      token: directive,
      value: 'hidden',
    };
  }
  if (directive === 'DRAWNULL') {
    return {
      family: 'visibility',
      token: directive,
      value: 'draw-null',
    };
  }

  return null;
};

export const isSupportedPlotColorDirective = (directive: string): boolean =>
  parseColorToken(directive) !== null;

export const isSupportedPlotDirective = (directive: string): boolean =>
  parseDirectiveFamily(String(directive ?? '')) !== null;

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
    const family = parseDirectiveFamily(String(rawDirective ?? ''));
    if (!family) {
      const token = String(rawDirective ?? '').trim();
      if (token) {
        throw new Error('CUSTOM_INDICATOR_UNSUPPORTED_PLOT_DIRECTIVE');
      }
      return;
    }
    directiveFamilies.push(family);
    switch (family.family) {
      case 'color':
        style.color = String(family.value);
        break;
      case 'lineWidth':
        style.lineWidth = Number(family.value);
        break;
      case 'lineStyle':
        style.lineStyle = String(family.value) as PlotLineStyle;
        break;
      case 'renderMode':
        style.renderMode = 'stick';
        break;
      case 'visibility':
        style.visibility = String(family.value) as NormalizedPlotStyle['visibility'];
        break;
      case 'fill':
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

const buildVisibleMask = (
  length: number,
  conditionMask: BooleanSeries,
  requiredSeries: readonly NumericSeries[],
  visibility: NormalizedPlotStyle['visibility'],
): BooleanSeries => {
  if (visibility === 'hidden') {
    return new Array<boolean>(length).fill(false);
  }
  return Array.from({ length }, (_item, index) => {
    if (!conditionMask[index]) {
      return false;
    }
    return requiredSeries.every((series) => Number.isFinite(series[index]));
  });
};

const createBaseInstruction = (
  name: string,
  style: NormalizedPlotStyle,
  directiveFamilies: readonly DirectiveFamily[],
  visibleMask: BooleanSeries,
  sourceFunction?: string | null,
): RenderInstructionMeta & Readonly<{
  name: string;
  style: NormalizedPlotStyle;
  directiveFamilies: readonly DirectiveFamily[];
  visibleMask: BooleanSeries;
}> => ({
  name,
  style,
  directiveFamilies,
  visibleMask,
  ...resolveInstructionMeta(sourceFunction),
});

export const createLinePlotDescriptor = (
  name: string,
  inputSeries: NumericOperand,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): LineRenderInstruction | HistogramRenderInstruction => {
  const length = inferLength(inputSeries);
  const series = toNumericSeries(inputSeries, length);
  const { style, directiveFamilies } = normalizePlotDirectives(directives, baseStyle);
  const conditionMask = toConstantBooleanSeries(true, length);
  const visibleMask = buildVisibleMask(length, conditionMask, [series], style.visibility);
  const base = createBaseInstruction(name, style, directiveFamilies, visibleMask);

  if (style.renderMode === 'stick') {
    return {
      ...base,
      primitive: 'histogram',
      upperSeries: series,
      lowerSeries: toConstantNumericSeries(0, length),
      widthSeries: toConstantNumericSeries(style.lineWidth, length),
      hollowSeries: toConstantBooleanSeries(style.hollow, length),
    };
  }

  return {
    ...base,
    primitive: 'line',
    series,
  };
};

export const createDrawIconDescriptor = (
  name: string,
  condition: BooleanOperand | NumericOperand,
  priceSeries: NumericOperand,
  iconType: NumericOperand,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): IconMarkerRenderInstruction => {
  const length = inferLength(condition, priceSeries, iconType);
  const anchorSeries = toNumericSeries(priceSeries, length);
  const iconSeries = toNumericSeries(iconType, length);
  const conditionMask = toBooleanSeries(condition, length);
  const { style, directiveFamilies } = normalizePlotDirectives(directives, {
    renderMode: 'marker',
    ...baseStyle,
  });
  const visibleMask = buildVisibleMask(length, conditionMask, [anchorSeries], style.visibility);
  return {
    ...createBaseInstruction(name, style, directiveFamilies, visibleMask, 'DRAWICON'),
    primitive: 'iconMarker',
    anchorSeries,
    iconSeries,
  };
};

export const createDrawTextDescriptor = (
  name: string,
  condition: BooleanOperand | NumericOperand,
  priceSeries: NumericOperand,
  text: string,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): TextMarkerRenderInstruction => {
  const length = inferLength(condition, priceSeries);
  const anchorSeries = toNumericSeries(priceSeries, length);
  const conditionMask = toBooleanSeries(condition, length);
  const { style, directiveFamilies } = normalizePlotDirectives(directives, {
    renderMode: 'marker',
    ...baseStyle,
  });
  const visibleMask = buildVisibleMask(length, conditionMask, [anchorSeries], style.visibility);
  return {
    ...createBaseInstruction(name, style, directiveFamilies, visibleMask, 'DRAWTEXT'),
    primitive: 'textMarker',
    anchorSeries,
    text,
  };
};

export const createDrawNumberDescriptor = (
  name: string,
  condition: BooleanOperand | NumericOperand,
  priceSeries: NumericOperand,
  numberSeriesInput: NumericOperand,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): NumberMarkerRenderInstruction => {
  const length = inferLength(condition, priceSeries, numberSeriesInput);
  const anchorSeries = toNumericSeries(priceSeries, length);
  const numberSeries = toNumericSeries(numberSeriesInput, length);
  const conditionMask = toBooleanSeries(condition, length);
  const { style, directiveFamilies } = normalizePlotDirectives(directives, {
    renderMode: 'marker',
    ...baseStyle,
  });
  const visibleMask = buildVisibleMask(length, conditionMask, [anchorSeries, numberSeries], style.visibility);
  return {
    ...createBaseInstruction(name, style, directiveFamilies, visibleMask, 'DRAWNUMBER'),
    primitive: 'numberMarker',
    anchorSeries,
    numberSeries,
  };
};

export const createStickLineDescriptor = (
  name: string,
  condition: BooleanOperand | NumericOperand,
  price1: NumericOperand,
  price2: NumericOperand,
  width: NumericOperand,
  empty: NumericOperand,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): HistogramRenderInstruction => {
  const length = inferLength(condition, price1, price2, width, empty);
  const upperSeries = toNumericSeries(price1, length);
  const lowerSeries = toNumericSeries(price2, length);
  const widthSeries = toNumericSeries(width, length);
  const emptySeries = toNumericSeries(empty, length);
  const conditionMask = toBooleanSeries(condition, length);
  const { style, directiveFamilies } = normalizePlotDirectives(directives, {
    renderMode: 'stick',
    ...baseStyle,
  });
  const hollowSeries = emptySeries.map((value) => Number.isFinite(value) && value !== 0);
  const visibleMask = buildVisibleMask(length, conditionMask, [upperSeries, lowerSeries], style.visibility);
  return {
    ...createBaseInstruction(name, style, directiveFamilies, visibleMask, 'STICKLINE'),
    primitive: 'histogram',
    upperSeries,
    lowerSeries,
    widthSeries,
    hollowSeries,
  };
};

export const createDrawLineDescriptor = (
  name: string,
  condition1: BooleanOperand | NumericOperand,
  price1: NumericOperand,
  condition2: BooleanOperand | NumericOperand,
  price2: NumericOperand,
  extend: NumericOperand,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): SegmentRenderInstruction => {
  const length = inferLength(condition1, price1, condition2, price2, extend);
  const startMask = toBooleanSeries(condition1, length);
  const startSeries = toNumericSeries(price1, length);
  const endMask = toBooleanSeries(condition2, length);
  const endSeries = toNumericSeries(price2, length);
  const extendSeries = toNumericSeries(extend, length);
  const extendValue = extendSeries.find((value) => Number.isFinite(value));
  const { style, directiveFamilies } = normalizePlotDirectives(directives, {
    renderMode: 'custom',
    ...baseStyle,
  });
  const visibleMask = startMask.map((value, index) => value || endMask[index]);
  return {
    ...createBaseInstruction(name, style, directiveFamilies, visibleMask, 'DRAWLINE'),
    primitive: 'segment',
    startMask,
    startSeries,
    endMask,
    endSeries,
    extend: Number.isFinite(extendValue) ? Number(extendValue) : 0,
  };
};

export const createDrawSlDescriptor = (
  name: string,
  condition: BooleanOperand | NumericOperand,
  price: NumericOperand,
  slope: NumericOperand,
  lengthValue: NumericOperand,
  direct: NumericOperand,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): SlopeSegmentRenderInstruction => {
  const length = inferLength(condition, price, slope, lengthValue, direct);
  const anchorMask = toBooleanSeries(condition, length);
  const anchorSeries = toNumericSeries(price, length);
  const slopeSeries = toNumericSeries(slope, length);
  const lengthSeries = toNumericSeries(lengthValue, length);
  const directSeries = toNumericSeries(direct, length);
  const { style, directiveFamilies } = normalizePlotDirectives(directives, {
    renderMode: 'custom',
    ...baseStyle,
  });
  const visibleMask = buildVisibleMask(length, anchorMask, [anchorSeries], style.visibility);
  return {
    ...createBaseInstruction(name, style, directiveFamilies, visibleMask, 'DRAWSL'),
    primitive: 'slopeSegment',
    anchorMask,
    anchorSeries,
    slopeSeries,
    lengthSeries,
    directSeries,
  };
};

export const createDrawKLineDescriptor = (
  name: string,
  high: NumericOperand,
  open: NumericOperand,
  low: NumericOperand,
  close: NumericOperand,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): OhlcRenderInstruction => {
  const length = inferLength(high, open, low, close);
  const highSeries = toNumericSeries(high, length);
  const openSeries = toNumericSeries(open, length);
  const lowSeries = toNumericSeries(low, length);
  const closeSeries = toNumericSeries(close, length);
  const { style, directiveFamilies } = normalizePlotDirectives(directives, {
    renderMode: 'custom',
    ...baseStyle,
  });
  const visibleMask = buildVisibleMask(length, toConstantBooleanSeries(true, length), [highSeries, openSeries, lowSeries, closeSeries], style.visibility);
  return {
    ...createBaseInstruction(name, style, directiveFamilies, visibleMask, 'DRAWKLINE'),
    primitive: 'ohlc',
    openSeries,
    highSeries,
    lowSeries,
    closeSeries,
  };
};

export const createBandDescriptor = (
  name: string,
  upper: NumericOperand,
  lower: NumericOperand,
  directives: Array<PlotDirective | string> = [],
  baseStyle?: Partial<NormalizedPlotStyle>,
): BandRenderInstruction => {
  const length = inferLength(upper, lower);
  const upperSeries = toNumericSeries(upper, length);
  const lowerSeries = toNumericSeries(lower, length);
  const { style, directiveFamilies } = normalizePlotDirectives(directives, {
    renderMode: 'fill',
    fillColor: baseStyle?.fillColor ?? baseStyle?.color ?? DEFAULT_LINE_COLOR,
    ...baseStyle,
  });
  const visibleMask = buildVisibleMask(length, toConstantBooleanSeries(true, length), [upperSeries, lowerSeries], style.visibility);
  return {
    ...createBaseInstruction(name, style, directiveFamilies, visibleMask, 'DRAWBAND'),
    primitive: 'band',
    upperSeries,
    lowerSeries,
  };
};

export const isAdvancedRenderInstruction = (instruction: RenderInstruction): boolean =>
  instruction.primitive === 'segment' ||
  instruction.primitive === 'slopeSegment' ||
  instruction.primitive === 'ohlc' ||
  instruction.primitive === 'band';
