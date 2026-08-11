// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { ReplayBar } from "../../src/domains/trainer/trainerTypes";
import {
  mergeTrainerChartBarsWindow,
  type TrainerChartBarsWindow,
} from "../../src/domains/trainer/trainerChartBarsWindow";

const bar = (displayIndex: number): ReplayBar => ({
  ts: new Date(Date.UTC(2024, 0, displayIndex + 1)).toISOString(),
  open: displayIndex,
  high: displayIndex + 1,
  low: Math.max(0, displayIndex - 1),
  close: displayIndex,
  volume: displayIndex * 100,
  displayPeriod: "1d",
  displayIndex,
  startRawIndex: displayIndex,
  endRawIndex: displayIndex,
});

const bars = (start: number, end: number): ReplayBar[] => {
  const result: ReplayBar[] = [];
  for (let index = start; index <= end; index += 1) {
    result.push(bar(index));
  }
  return result;
};

const displayIndexes = (items: ReplayBar[]): number[] =>
  items.map((item) => Number(item.displayIndex));

const snapshotAt = (startIndex: number, cursorIndex: number) => ({
  session: {
    start_index: startIndex,
    cursor_index: cursorIndex,
  },
}) as never;

const windowOf = (
  offset: number,
  total: number,
  sourceBars: ReplayBar[],
): TrainerChartBarsWindow => ({
  offset,
  total,
  bars: sourceBars,
  timeZone: "Asia/Shanghai",
});

test("trainer chart bars merge appends action frames without replacing resident history", () => {
  const merged = mergeTrainerChartBarsWindow({
    currentWindow: windowOf(0, 240, bars(0, 100)),
    incomingWindow: windowOf(80, 240, bars(80, 180)),
    snapshot: snapshotAt(0, 180),
  });

  assert.equal(merged.offset, 0);
  assert.equal(merged.total, 240);
  assert.equal(merged.bars.length, 181);
  assert.deepEqual(displayIndexes(merged.bars).slice(0, 3), [0, 1, 2]);
  assert.deepEqual(displayIndexes(merged.bars).slice(-3), [178, 179, 180]);
  assert.equal(new Set(displayIndexes(merged.bars)).size, merged.bars.length);
});

test("trainer chart bars merge preserves backward action frames for undo navigation", () => {
  const merged = mergeTrainerChartBarsWindow({
    currentWindow: windowOf(100, 240, bars(100, 180)),
    incomingWindow: windowOf(20, 240, bars(20, 120)),
    snapshot: snapshotAt(20, 120),
  });

  assert.equal(merged.offset, 20);
  assert.equal(merged.bars.length, 161);
  assert.deepEqual(displayIndexes(merged.bars).slice(0, 3), [20, 21, 22]);
  assert.deepEqual(displayIndexes(merged.bars).slice(-3), [178, 179, 180]);
});

test("trainer chart bars merge trims from the head when forward windows exceed resident capacity", () => {
  const merged = mergeTrainerChartBarsWindow({
    currentWindow: windowOf(0, 30, bars(0, 9)),
    incomingWindow: windowOf(10, 30, bars(10, 19)),
    snapshot: snapshotAt(0, 19),
    maxBars: 12,
  });

  assert.equal(merged.offset, 8);
  assert.equal(merged.bars.length, 12);
  assert.deepEqual(displayIndexes(merged.bars), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});
