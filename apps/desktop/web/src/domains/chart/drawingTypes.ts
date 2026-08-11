// SPDX-License-Identifier: GPL-3.0-only

import type { OverlayMode } from "klinecharts";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";

export type KnownDrawTool =
  | "straightLine"
  | "rayLine"
  | "segment"
  | "horizontalStraightLine"
  | "horizontalRayLine"
  | "horizontalSegment"
  | "verticalStraightLine"
  | "verticalRayLine"
  | "verticalSegment"
  | "parallelStraightLine"
  | "priceChannelLine"
  | "fibonacciLine"
  | "priceLine"
  | "simpleTag"
  | "simpleAnnotation";

export type DrawTool = KnownDrawTool | (string & {});
export type ActiveDrawTool = "cursor" | DrawTool;
export type DrawLineType = "solid" | "dashed";

export type SavedDrawingOverlay = {
  id?: string;
  name: string;
  points: Array<{ timestamp: number; value?: number; dataIndex?: number }>;
  sourcePeriod?: DisplayPeriodKey;
  visible?: boolean;
  lock?: boolean;
  zLevel?: number;
  mode?: OverlayMode;
  modeSensitivity?: number;
  needDefaultXAxisFigure?: boolean;
  styles?: unknown;
  extendData?: unknown;
};
