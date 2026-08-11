// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { resolveRawDisplayTarget } from "../../src/domains/chart/rawDisplayIndex";

test("raw display target resolves frame-window raw indexes by stored raw ranges", () => {
  const sourceBars = [
    {
      ts: "2024-01-02T09:30:00Z",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 1000,
      startRawIndex: 123_456,
      endRawIndex: 123_456,
    },
    {
      ts: "2024-01-02T09:31:00Z",
      open: 11,
      high: 13,
      low: 10,
      close: 12,
      volume: 1100,
      startRawIndex: 123_457,
      endRawIndex: 123_457,
    },
  ];
  const visibleItems = [
    {
      bucketStartMs: 1_700_000_040_000,
      startRawIndex: 123_456,
      endRawIndex: 123_457,
      ts: "2024-01-02T09:30:00Z",
      open: 10,
      high: 13,
      low: 9,
      close: 12,
      volume: 2100,
    },
  ];

  const target = resolveRawDisplayTarget({
    rawIndex: 123_457,
    sourceBars,
    visibleItems,
  });

  assert.equal(target.sourceBarIndex, 1);
  assert.equal(target.sourceBar?.close, 12);
  assert.equal(target.visibleItemIndex, 0);
  assert.equal(target.visibleItem?.startRawIndex, 123_456);
  assert.equal(target.visibleItem?.endRawIndex, 123_457);
});
