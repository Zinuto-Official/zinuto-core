// SPDX-License-Identifier: GPL-3.0-only

import type { SavedDrawingOverlay } from "../../src/domains/chart/drawingTypes";
import assert from "node:assert/strict";
import test from "node:test";

import {
  projectDrawingPointsForPeriodCore,
  shouldRenderDrawingInDisplayPeriod,
} from "../../src/domains/chart/drawingProjection";

const makeDrawing = (
  points: SavedDrawingOverlay["points"],
  sourcePeriod: SavedDrawingOverlay["sourcePeriod"] = "1d",
): SavedDrawingOverlay => ({
  id: "drawing",
  name: "straightLine",
  sourcePeriod,
  points,
});

test("drawing projection survives daily to weekly period changes", () => {
  const firstWeek = Date.parse("2024-01-01T05:00:00.000Z");
  const secondWeek = Date.parse("2024-01-08T05:00:00.000Z");
  const projected = projectDrawingPointsForPeriodCore({
    item: makeDrawing([
      { timestamp: Date.parse("2024-01-02T15:30:00.000Z"), value: 10 },
      { timestamp: Date.parse("2024-01-09T15:30:00.000Z"), value: 12 },
    ]),
    period: "1w",
    timeZone: "America/New_York",
    visibleBars: [
      { bucketStartMs: firstWeek },
      { bucketStartMs: secondWeek },
    ],
  });

  assert.deepEqual(projected, [
    { timestamp: firstWeek, value: 10, dataIndex: 0 },
    { timestamp: secondWeek, value: 12, dataIndex: 1 },
  ]);
});

test("drawing projection keeps a visible span when points collapse into one monthly bucket", () => {
  const january = Date.parse("2024-01-01T05:00:00.000Z");
  const february = Date.parse("2024-02-01T05:00:00.000Z");
  const projected = projectDrawingPointsForPeriodCore({
    item: makeDrawing([
      { timestamp: Date.parse("2024-01-02T15:30:00.000Z"), value: 10 },
      { timestamp: Date.parse("2024-01-09T15:30:00.000Z"), value: 10 },
    ]),
    period: "1month",
    timeZone: "America/New_York",
    visibleBars: [
      { bucketStartMs: january },
      { bucketStartMs: february },
    ],
  });

  assert.deepEqual(projected, [
    { timestamp: january, value: 10, dataIndex: 0 },
    { timestamp: february, value: 10, dataIndex: 1 },
  ]);
});

test("drawing projection uses market timezone instead of the UTC fallback", () => {
  const newYorkWeekStart = Date.parse("2024-02-26T05:00:00.000Z");
  const utcWeekStart = Date.parse("2024-03-04T00:00:00.000Z");
  const projected = projectDrawingPointsForPeriodCore({
    item: makeDrawing([
      { timestamp: Date.parse("2024-03-04T02:00:00.000Z"), value: 10 },
    ]),
    period: "1w",
    timeZone: "America/New_York",
    visibleBars: [
      { bucketStartMs: newYorkWeekStart },
      { bucketStartMs: Date.parse("2024-03-04T05:00:00.000Z") },
    ],
  });

  assert.equal(projected[0]?.timestamp, newYorkWeekStart);
  assert.notEqual(projected[0]?.timestamp, utcWeekStart);
  assert.equal(projected[0]?.dataIndex, 0);
});

test("source-period-only annotations render only on their source period", () => {
  const annotation = makeDrawing(
    [{ timestamp: Date.parse("2024-01-02T15:30:00.000Z"), value: 10 }],
    "1d",
  );
  const line = makeDrawing(
    [
      { timestamp: Date.parse("2024-01-02T15:30:00.000Z"), value: 10 },
      { timestamp: Date.parse("2024-01-03T15:30:00.000Z"), value: 11 },
    ],
    "1d",
  );

  assert.equal(
    shouldRenderDrawingInDisplayPeriod({ ...annotation, name: "simpleAnnotation" }, "1d"),
    true,
  );
  assert.equal(
    shouldRenderDrawingInDisplayPeriod({ ...annotation, name: "simpleAnnotation" }, "1w"),
    false,
  );
  assert.equal(shouldRenderDrawingInDisplayPeriod(line, "1w"), true);
});
