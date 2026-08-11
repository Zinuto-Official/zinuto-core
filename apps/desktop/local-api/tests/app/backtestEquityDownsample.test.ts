// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  downsampleEquityCurve,
} from "../../src/application/backtest/equityDownsample.js";

test("downsampleEquityCurve preserves first last and max drawdown points", () => {
  const points = Array.from({ length: 12 }, (_, index) => ({
    instrumentId: "instrument-1",
    symbol: "AAA",
    barIndex: index,
    barTime: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    equity: 1000 - index * 10,
    drawdown: index === 7 ? 0.42 : index / 100,
  }));

  const sampled = downsampleEquityCurve(points, 5);

  assert.equal(sampled.sampled, true);
  assert.equal(sampled.points.length, 5);
  assert.equal(sampled.points[0]?.barIndex, 0);
  assert.equal(sampled.points.at(-1)?.barIndex, 11);
  assert.ok(
    sampled.points.some((point) => point.barIndex === 7),
    "max drawdown point should be retained",
  );
});

test("downsampleEquityCurve returns a copy without sampling when already under target", () => {
  const points = [
    {
      instrumentId: "instrument-1",
      symbol: "AAA",
      barIndex: 0,
      barTime: "2026-01-01T00:00:00.000Z",
      equity: 1000,
      drawdown: 0,
    },
  ];

  const sampled = downsampleEquityCurve(points, 2);

  assert.equal(sampled.sampled, false);
  assert.deepEqual(sampled.points, points);
  assert.notEqual(sampled.points, points);
});
