// SPDX-License-Identifier: GPL-3.0-only

export const REPLAY_DRAW_TOOL_INTERNAL_NAMES = [
  "tradeMarker",
  "positionLine",
  "noteMarker",
  "specialTrainingTradeMarker",
] as const;

export const REPLAY_DRAW_TOOL_EXCLUDED_NATIVE_NAMES = [
  "verticalSegment",
  "verticalRayLine",
  "simpleTag",
  "textLabel",
  "specialTrainingTradeMarker",
] as const;

export const REPLAY_DRAW_TOOL_PREFERRED_ORDER = [
  "segment",
  "rayLine",
  "straightLine",
  "parallelStraightLine",
  "priceChannelLine",
  "simpleAnnotation",
  "horizontalStraightLine",
  "horizontalRayLine",
  "horizontalSegment",
  "verticalStraightLine",
  "fibonacciLine",
  "priceLine",
  "simpleTag",
  "verticalRayLine",
  "verticalSegment",
] as const;

export type ReplayDrawToolName =
  (typeof REPLAY_DRAW_TOOL_PREFERRED_ORDER)[number];

export const REPLAY_DRAW_TOOL_MIN_POINT_COUNT_BY_NAME = {
  segment: 2,
  rayLine: 2,
  straightLine: 2,
  parallelStraightLine: 3,
  priceChannelLine: 3,
  simpleAnnotation: 1,
  horizontalStraightLine: 1,
  horizontalRayLine: 1,
  horizontalSegment: 2,
  verticalStraightLine: 1,
  fibonacciLine: 2,
  priceLine: 1,
  simpleTag: 1,
  verticalRayLine: 1,
  verticalSegment: 2,
} as const satisfies Record<ReplayDrawToolName, number>;

const INTERNAL_DRAW_TOOLS = new Set<string>(REPLAY_DRAW_TOOL_INTERNAL_NAMES);
const EXCLUDED_NATIVE_DRAW_TOOLS = new Set<string>(
  REPLAY_DRAW_TOOL_EXCLUDED_NATIVE_NAMES,
);

export type ReplayVisibleDrawToolName = Exclude<
  ReplayDrawToolName,
  (typeof REPLAY_DRAW_TOOL_EXCLUDED_NATIVE_NAMES)[number]
>;

export const REPLAY_DRAW_TOOL_VISIBLE_NAMES =
  REPLAY_DRAW_TOOL_PREFERRED_ORDER.filter(
    (name): name is ReplayVisibleDrawToolName =>
      !INTERNAL_DRAW_TOOLS.has(name) && !EXCLUDED_NATIVE_DRAW_TOOLS.has(name),
  );

export const isReplayVisibleDrawToolName = (
  value: unknown,
): value is ReplayVisibleDrawToolName =>
  typeof value === "string" &&
  REPLAY_DRAW_TOOL_VISIBLE_NAMES.includes(
    value as ReplayVisibleDrawToolName,
  );
