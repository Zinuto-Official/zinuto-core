// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { buildTradeMarkerOverrideBuckets } from "../../src/domains/chart/tradeMarkerOverrideAggregation";

const visibleItems = [
  {
    bucketStartMs: 1_700_000_000_000,
    startRawIndex: 0,
    endRawIndex: 4,
    high: 1.2,
    low: 0.7,
  },
  {
    bucketStartMs: 1_700_086_400_000,
    startRawIndex: 5,
    endRawIndex: 8,
    high: 1.3,
    low: 1.1,
  },
];

test("override trade markers aggregate by visible candle", () => {
  const buckets = buildTradeMarkerOverrideBuckets({
    maxIndex: 8,
    visibleItems,
    aggregateByVisiblePeriod: true,
    markers: [
      { rawIndex: 0, side: "SELL", price: 0.9, label: "S1" },
      { rawIndex: 2, side: "SELL", price: 1.1, label: "S2" },
      { rawIndex: 3, side: "BUY", price: 1, label: "B1" },
      { rawIndex: 6, side: "SELL", price: 1.2, label: "S3" },
    ],
  });

  assert.equal(buckets.length, 2);
  const firstBucket = buckets.find((bucket) => bucket.timestamp === visibleItems[0]!.bucketStartMs);
  assert.ok(firstBucket);
  assert.equal(firstBucket.side, "MIXED");
  assert.equal(firstBucket.displayLabel, "B/S");
  assert.equal(firstBucket.isAggregated, true);
  assert.equal(firstBucket.count, 3);
  assert.equal(firstBucket.price, 1);
  assert.equal(firstBucket.forceDirection, -1);

  const secondBucket = buckets.find(
    (bucket) => bucket.side === "SELL" && bucket.timestamp === visibleItems[1]!.bucketStartMs,
  );
  assert.ok(secondBucket);
  assert.equal(secondBucket.displayLabel, "S3");
});

test("override trade markers keep raw candles independent without period aggregation", () => {
  const buckets = buildTradeMarkerOverrideBuckets({
    maxIndex: 2,
    aggregateByVisiblePeriod: false,
    visibleItems: [
      {
        bucketStartMs: 1_700_000_000_000,
        startRawIndex: 0,
        endRawIndex: 0,
      },
      {
        bucketStartMs: 1_700_000_060_000,
        startRawIndex: 1,
        endRawIndex: 1,
      },
    ],
    markers: [
      { rawIndex: 0, side: "BUY", price: 0.9, label: "B1" },
      { rawIndex: 1, side: "BUY", price: 1.1, label: "B2" },
    ],
  });

  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets.map((bucket) => bucket.displayLabel), ["B1", "B2"]);
  assert.equal(buckets.every((bucket) => bucket.isAggregated === false), true);
});

test("override trade markers anchor to candle edges while retaining execution price", () => {
  const buckets = buildTradeMarkerOverrideBuckets({
    maxIndex: 1,
    aggregateByVisiblePeriod: false,
    visibleItems: [
      {
        bucketStartMs: 1_700_000_000_000,
        startRawIndex: 0,
        endRawIndex: 0,
        high: 12,
        low: 8,
      },
      {
        bucketStartMs: 1_700_000_060_000,
        startRawIndex: 1,
        endRawIndex: 1,
        high: 13,
        low: 9,
      },
    ],
    markers: [
      { rawIndex: 0, side: "BUY", price: 10, label: "B1" },
      { rawIndex: 1, side: "SELL", price: 11, label: "S1" },
    ],
  });

  assert.equal(buckets.length, 2);
  assert.equal(buckets[0]?.price, 10);
  assert.equal(buckets[0]?.markerValue, 8);
  assert.equal(buckets[1]?.price, 11);
  assert.equal(buckets[1]?.markerValue, 13);
});

test("override trade markers do not aggregate one visible period when display period is unchanged", () => {
  const buckets = buildTradeMarkerOverrideBuckets({
    maxIndex: 8,
    visibleItems,
    aggregateByVisiblePeriod: false,
    markers: [
      { rawIndex: 0, side: "SELL", price: 0.9, label: "S1" },
      { rawIndex: 2, side: "SELL", price: 1.1, label: "S2" },
    ],
  });

  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets.map((bucket) => bucket.displayLabel), ["S1", "S2"]);
  assert.equal(buckets.every((bucket) => bucket.isAggregated === false), true);
});
