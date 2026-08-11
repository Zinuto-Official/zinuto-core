// SPDX-License-Identifier: GPL-3.0-only

export type CanvasCurvePoint = {
  x: number;
  y: number;
  timestamp: number;
  value: number;
};

export type CanvasGeometry = {
  width: number;
  height: number;
  plotTop: number;
  plotBottom: number;
  baselineY: number;
  points: CanvasCurvePoint[];
};
