// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveFastDecisionChartRightOffsetDistance,
  resolveKlineBarSlotPixelWidth,
} from "../../src/workspaces/special-training/fastDecisionChartViewport";

test("fast decision chart offsets balance sparse visible bars away from the right edge", () => {
  const sparseOffset = resolveFastDecisionChartRightOffsetDistance({
    chartViewportWidth: 1000,
    visibleBarCount: 40,
    visibleBarPixelWidth: 6,
    fallbackRightOffset: 0,
  });
  const fullOffset = resolveFastDecisionChartRightOffsetDistance({
    chartViewportWidth: 1000,
    visibleBarCount: 100,
    visibleBarPixelWidth: 6,
    fallbackRightOffset: 0,
  });

  assert.equal(sparseOffset, 441);
  assert.equal(fullOffset, 320);
  assert.ok(sparseOffset > fullOffset);
});

test("fast decision chart offset keeps a real fallback when the viewport is not measurable", () => {
  assert.equal(
    resolveFastDecisionChartRightOffsetDistance({
      chartViewportWidth: 0,
      visibleBarCount: 40,
      visibleBarPixelWidth: 6,
      fallbackRightOffset: 12,
    }),
    12,
  );
});

test("fast decision chart uses the kline slot width without adding the candle gap twice", () => {
  assert.equal(
    resolveKlineBarSlotPixelWidth({
      bar: 6,
      halfBar: 3,
      gapBar: 5,
      halfGapBar: 2,
    }),
    6,
  );
});
