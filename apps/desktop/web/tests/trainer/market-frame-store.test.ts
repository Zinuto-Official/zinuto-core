// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { DESKTOP_API_LIMITS } from "@zinuto/shared/input-limits";
import { frameToReplayRange } from "../../src/domains/trainer/marketFrameStore";
import type { MarketBarFrame } from "../../src/domains/training/types";

const buildSyntheticFrame = (length: number): MarketBarFrame => ({
  schemaVersion: "zinuto-market-frame-v2",
  instrumentId: "instrument-10m",
  symbol: "TENM",
  baseTimeframe: "1m",
  timeframe: "1m",
  displayPeriod: "1m",
  timeZone: "UTC",
  totalRaw: 10_000_000,
  totalDisplay: 10_000_000,
  rawStartIndex: 4_000_000,
  rawEndIndex: 4_000_000 + length - 1,
  displayStartIndex: 4_000_000,
  displayEndIndex: 4_000_000 + length - 1,
  limit: length,
  hasBackward: true,
  hasForward: true,
  versionToken: "10m-v1",
  timestampMs: Array.from({ length }, (_, index) => 1_700_000_000_000 + index * 60_000),
  open: Array.from({ length }, (_, index) => 100 + index * 0.01),
  high: Array.from({ length }, (_, index) => 101 + index * 0.01),
  low: Array.from({ length }, (_, index) => 99 + index * 0.01),
  close: Array.from({ length }, (_, index) => 100.5 + index * 0.01),
  volume: Array.from({ length }, (_, index) => 1000 + index),
  displayIndex: Array.from({ length }, (_, index) => 4_000_000 + index),
  startRawIndex: Array.from({ length }, (_, index) => 4_000_000 + index),
  endRawIndex: Array.from({ length }, (_, index) => 4_000_000 + index),
});

test("market frame store materializes only the current frame window", () => {
  const frame: MarketBarFrame = {
    schemaVersion: "zinuto-market-frame-v2",
    instrumentId: "instrument-aapl",
    symbol: "AAPL",
    baseTimeframe: "1m",
    timeframe: "1m",
    displayPeriod: "1m",
    timeZone: "America/New_York",
    totalRaw: 10_000_000,
    totalDisplay: 10_000_000,
    rawStartIndex: 123_456,
    rawEndIndex: 123_457,
    displayStartIndex: 123_456,
    displayEndIndex: 123_457,
    limit: 1200,
    hasBackward: true,
    hasForward: true,
    versionToken: "v1",
    timestampMs: [1_700_000_040_000, 1_700_000_100_000],
    open: [10, 11],
    high: [12, 13],
    low: [9, 10],
    close: [11, 12],
    volume: [1000, 1100],
    displayIndex: [123_456, 123_457],
    startRawIndex: [123_456, 123_457],
    endRawIndex: [123_456, 123_457],
  };

  const range = frameToReplayRange(frame);

  assert.equal(range.offset, 123_456);
  assert.equal(range.total, 10_000_000);
  assert.equal(range.bars.length, 2);
  assert.deepEqual(range.bars.map((bar) => bar.close), [11, 12]);
  assert.equal(range.bars[0]?.ts, "2023-11-14T22:14:00.000Z");
  assert.equal(range.bars[0]?.startRawIndex, 123_456);
  assert.equal(range.bars[1]?.endRawIndex, 123_457);
});

test("market frame store keeps 10M metadata out of chart materialization", () => {
  const frame = buildSyntheticFrame(1441);

  const range = frameToReplayRange(frame);

  assert.equal(range.total, 10_000_000);
  assert.equal(range.offset, 4_000_000);
  assert.equal(range.bars.length, 1441);
  assert.notEqual(range.bars.length, range.total);
  assert.equal(range.bars[0]?.displayIndex, 4_000_000);
  assert.equal(range.bars.at(-1)?.endRawIndex, 4_001_440);
});

test("market frame store rejects oversized frame arrays before chart data is built", () => {
  const frame = buildSyntheticFrame(DESKTOP_API_LIMITS.marketFrameBarsMax + 1);

  assert.throws(() => frameToReplayRange(frame), /MARKET_FRAME_WINDOW_TOO_LARGE/);
});

test("market frame store rejects mismatched columnar frames", () => {
  const frame: MarketBarFrame = {
    schemaVersion: "zinuto-market-frame-v2",
    instrumentId: "instrument-aapl",
    symbol: "AAPL",
    baseTimeframe: "1m",
    timeframe: "1m",
    displayPeriod: "1m",
    timeZone: "America/New_York",
    totalRaw: 10_000_000,
    totalDisplay: 10_000_000,
    rawStartIndex: 123_456,
    rawEndIndex: 123_457,
    displayStartIndex: 123_456,
    displayEndIndex: 123_457,
    limit: 1200,
    hasBackward: true,
    hasForward: true,
    versionToken: "v1",
    timestampMs: [1_700_000_040_000, 1_700_000_100_000],
    open: [10, 11],
    high: [12, 13],
    low: [9, 10],
    close: [11, 12],
    volume: [1000],
    displayIndex: [123_456, 123_457],
    startRawIndex: [123_456, 123_457],
    endRawIndex: [123_456, 123_457],
  };

  assert.throws(() => frameToReplayRange(frame), {
    message: "MARKET_FRAME_COLUMN_LENGTH_MISMATCH",
  });
});

test("market frame store rejects oversized frame windows", () => {
  const length = DESKTOP_API_LIMITS.marketFrameBarsMax + 1;
  const makeNumbers = (value: number) => Array.from({ length }, () => value);
  const frame: MarketBarFrame = {
    schemaVersion: "zinuto-market-frame-v2",
    instrumentId: "instrument-aapl",
    symbol: "AAPL",
    baseTimeframe: "1m",
    timeframe: "1m",
    displayPeriod: "1m",
    timeZone: "America/New_York",
    totalRaw: 10_000_000,
    totalDisplay: 10_000_000,
    rawStartIndex: 0,
    rawEndIndex: length - 1,
    displayStartIndex: 0,
    displayEndIndex: length - 1,
    limit: length,
    hasBackward: false,
    hasForward: true,
    versionToken: "v1",
    timestampMs: makeNumbers(1_700_000_040_000),
    open: makeNumbers(10),
    high: makeNumbers(12),
    low: makeNumbers(9),
    close: makeNumbers(11),
    volume: makeNumbers(1000),
    displayIndex: makeNumbers(0),
    startRawIndex: makeNumbers(0),
    endRawIndex: makeNumbers(0),
  };

  assert.throws(() => frameToReplayRange(frame), {
    message: "MARKET_FRAME_WINDOW_TOO_LARGE",
  });
});
