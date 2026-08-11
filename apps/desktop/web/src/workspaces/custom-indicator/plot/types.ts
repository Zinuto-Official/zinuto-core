// SPDX-License-Identifier: GPL-3.0-only

import type { BooleanSeries, NumericSeries } from '@/domains/custom-indicator/indicator/dataTypes';
import type { FutuCapabilitySupportState } from '@/domains/custom-indicator/indicator/supportTypes';

export type PlotType = 'line' | 'stick' | 'icon' | 'text' | 'number' | 'stickline' | 'drawline' | 'drawsl' | 'kline' | 'band';
export type PlotLineStyle = 'solid' | 'dot';
export type RenderPrimitive =
  | 'line'
  | 'histogram'
  | 'iconMarker'
  | 'textMarker'
  | 'numberMarker'
  | 'segment'
  | 'slopeSegment'
  | 'ohlc'
  | 'band';

export const RENDER_PRIMITIVES = Object.freeze({
  line: 'line',
  histogram: 'histogram',
  iconMarker: 'iconMarker',
  textMarker: 'textMarker',
  numberMarker: 'numberMarker',
  segment: 'segment',
  slopeSegment: 'slopeSegment',
  ohlc: 'ohlc',
  band: 'band',
} satisfies Record<RenderPrimitive, RenderPrimitive>);
export type NormalizedPlotVisibility = 'visible' | 'hidden' | 'draw-null';
export type NormalizedPlotRenderMode = 'line' | 'stick' | 'marker' | 'fill' | 'custom';
export type DirectiveFamilyKind =
  | 'color'
  | 'lineWidth'
  | 'lineStyle'
  | 'visibility'
  | 'renderMode'
  | 'fill';

export type DirectiveFamily = Readonly<{
  family: DirectiveFamilyKind;
  token: string;
  value: string | number | boolean | null;
}>;

export type NormalizedPlotStyle = Readonly<{
  color: string;
  lineWidth: number;
  lineStyle: PlotLineStyle;
  visibility: NormalizedPlotVisibility;
  renderMode: NormalizedPlotRenderMode;
  fillColor: string | null;
  hollow: boolean;
}>;

type RenderInstructionBase = Readonly<{
  name: string;
  primitive: RenderPrimitive;
  style: NormalizedPlotStyle;
  directiveFamilies: readonly DirectiveFamily[];
  visibleMask: BooleanSeries;
  sourceFunction: string | null;
  supportState: FutuCapabilitySupportState;
}>;

export type LineRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'line';
  series: NumericSeries;
}>;

export type HistogramRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'histogram';
  upperSeries: NumericSeries;
  lowerSeries: NumericSeries;
  widthSeries: NumericSeries;
  hollowSeries: BooleanSeries;
}>;

export type IconMarkerRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'iconMarker';
  anchorSeries: NumericSeries;
  iconSeries: NumericSeries;
}>;

export type TextMarkerRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'textMarker';
  anchorSeries: NumericSeries;
  text: string;
}>;

export type NumberMarkerRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'numberMarker';
  anchorSeries: NumericSeries;
  numberSeries: NumericSeries;
}>;

export type SegmentRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'segment';
  startMask: BooleanSeries;
  startSeries: NumericSeries;
  endMask: BooleanSeries;
  endSeries: NumericSeries;
  extend: number;
}>;

export type SlopeSegmentRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'slopeSegment';
  anchorMask: BooleanSeries;
  anchorSeries: NumericSeries;
  slopeSeries: NumericSeries;
  lengthSeries: NumericSeries;
  directSeries: NumericSeries;
}>;

export type OhlcRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'ohlc';
  openSeries: NumericSeries;
  highSeries: NumericSeries;
  lowSeries: NumericSeries;
  closeSeries: NumericSeries;
}>;

export type BandRenderInstruction = RenderInstructionBase & Readonly<{
  primitive: 'band';
  upperSeries: NumericSeries;
  lowerSeries: NumericSeries;
}>;

export type RenderInstruction =
  | LineRenderInstruction
  | HistogramRenderInstruction
  | IconMarkerRenderInstruction
  | TextMarkerRenderInstruction
  | NumberMarkerRenderInstruction
  | SegmentRenderInstruction
  | SlopeSegmentRenderInstruction
  | OhlcRenderInstruction
  | BandRenderInstruction;

export type PlotDirective =
  | 'COLORRED'
  | 'COLORGREEN'
  | 'DOTLINE'
  | 'STICK'
  | 'NODRAW'
  | 'DRAWNULL'
  | `COLOR${string}`
  | `LINETHICK${number}`;
