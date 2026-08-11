// SPDX-License-Identifier: GPL-3.0-only

import type { AggregatedBarItem } from "../../src/domains/chart/replayAggregation";
import type { ReplayBar } from "../../src/domains/trainer/trainerTypes";
import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemTradeMarkerBuckets } from "../../src/domains/chart/systemTradeMarkerModel";
import type { Fill } from "../../src/domains/training/types";

const makeFill = (overrides: Partial<Fill>): Fill => ({
  id: "fill",
  order_id: "order",
  session_id: "session",
  instrument_id: "instrument",
  symbol: "TEST",
  side: "BUY",
  fill_index: 0,
  fill_time: "2024-01-02T09:30:00Z",
  fill_price: 10,
  fill_qty: 1,
  contract_multiplier: 1,
  fee: 0,
  tax: 0,
  slippage: 0,
  created_at: "2024-01-02T09:30:00Z",
  ...overrides,
});

const sourceBars: ReplayBar[] = [
  {
    ts: "2024-01-02T09:30:00Z",
    open: 10,
    high: 13,
    low: 9,
    close: 12,
    volume: 1000,
    startRawIndex: 123_456,
    endRawIndex: 123_456,
  },
  {
    ts: "2024-01-02T09:31:00Z",
    open: 12,
    high: 15,
    low: 11,
    close: 14,
    volume: 1200,
    startRawIndex: 123_457,
    endRawIndex: 123_457,
  },
];

const visibleItems: AggregatedBarItem[] = [
  {
    bucketStartMs: 1_700_000_040_000,
    startRawIndex: 123_456,
    endRawIndex: 123_457,
    ts: "2024-01-02T09:30:00Z",
    open: 10,
    high: 15,
    low: 9,
    close: 14,
    volume: 2200,
  },
];

test("trade marker buckets merge mixed visible-period fills into one B/S marker", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars,
    visibleItems,
    tradeAmountIncludesFees: true,
    fills: [
      makeFill({
        id: "hidden-buy",
        fill_index: 1,
        fill_price: 8,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
      makeFill({
        id: "visible-buy-1",
        fill_index: 123_456,
        fill_price: 10,
        fill_qty: 2,
        contract_multiplier: 100,
        fee: 3,
        slippage: 1,
      }),
      makeFill({
        id: "visible-buy-2",
        fill_index: 123_457,
        fill_price: 12,
        fill_qty: 1,
        contract_multiplier: 100,
        fee: 2,
      }),
      makeFill({
        id: "visible-sell",
        side: "SELL",
        fill_index: 123_457,
        fill_price: 14,
        fill_qty: 1,
        contract_multiplier: 100,
        fee: 5,
      }),
    ],
    aggregateByVisiblePeriod: true,
  });

  assert.equal(buckets.length, 1);
  const bucket = buckets[0];
  assert.ok(bucket);
  assert.equal(bucket.side, "MIXED");
  assert.equal(bucket.displayLabel, "B/S");
  assert.equal(bucket.isAggregated, true);
  assert.equal(bucket.totalQty, 4);
  assert.equal(bucket.grossAmount, 4_600);
  assert.equal(bucket.tradingCost, 11);
  assert.equal(bucket.weightedPriceSum / bucket.totalQty, 11.5);
  assert.equal(bucket.markerValue, 14);
  assert.equal(bucket.forceDirection, -1);
  assert.deepEqual(bucket.details.map((detail) => detail.label), ["B2", "B3", "S4"]);
  assert.deepEqual(bucket.details.map((detail) => detail.side), ["BUY", "BUY", "SELL"]);
  assert.deepEqual(bucket.details.map((detail) => detail.price), [10, 12, 14]);
  assert.deepEqual(bucket.details.map((detail) => detail.qty), [2, 1, 1]);
  assert.deepEqual(bucket.details.map((detail) => detail.cashAmount), [2_004, 1_202, 1_395]);
});

test("trade marker buckets compact grouped buy labels without repeating the side prefix", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars,
    visibleItems,
    tradeAmountIncludesFees: true,
    fills: [
      makeFill({
        id: "visible-buy-1",
        fill_index: 123_456,
        fill_price: 10,
        fill_qty: 2,
        contract_multiplier: 100,
        fee: 3,
        slippage: 1,
      }),
      makeFill({
        id: "visible-buy-2",
        fill_index: 123_457,
        fill_price: 12,
        fill_qty: 1,
        contract_multiplier: 100,
        fee: 2,
      }),
    ],
    aggregateByVisiblePeriod: true,
  });

  const buyBucket = buckets.find((bucket) => bucket.side === "BUY");
  assert.ok(buyBucket);
  assert.equal(buyBucket.displayLabel, "B1-2");
  assert.equal(buyBucket.isAggregated, true);
  assert.equal(buyBucket.totalQty, 3);
  assert.equal(buyBucket.grossAmount, 3_200);
  assert.equal(buyBucket.tradingCost, 6);
  assert.equal(buyBucket.weightedPriceSum / buyBucket.totalQty, 32 / 3);
  assert.deepEqual(buyBucket.details.map((detail) => detail.label), ["B1", "B2"]);
  assert.deepEqual(buyBucket.details.map((detail) => detail.cashAmount), [2_004, 1_202]);
});

test("trade marker labels use one session-wide fill sequence across buy and sell sides", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars,
    visibleItems: [
      {
        bucketStartMs: 1_700_000_040_000,
        startRawIndex: 123_456,
        endRawIndex: 123_456,
        ts: "2024-01-02T09:30:00Z",
        open: 10,
        high: 13,
        low: 9,
        close: 12,
        volume: 1000,
      },
      {
        bucketStartMs: 1_700_000_100_000,
        startRawIndex: 123_457,
        endRawIndex: 123_457,
        ts: "2024-01-02T09:31:00Z",
        open: 12,
        high: 15,
        low: 11,
        close: 14,
        volume: 1200,
      },
    ],
    tradeAmountIncludesFees: true,
    fills: [
      makeFill({
        id: "visible-buy-1",
        fill_index: 123_456,
        fill_price: 10,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
      makeFill({
        id: "visible-sell-2",
        side: "SELL",
        fill_index: 123_456,
        fill_price: 11,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
      makeFill({
        id: "visible-buy-3",
        fill_index: 123_457,
        fill_price: 12,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
    ],
    aggregateByVisiblePeriod: false,
  });

  assert.deepEqual(buckets.map((bucket) => bucket.displayLabel), ["B1", "S2", "B3"]);
});

test("trade marker labels include capped resident fill sequence offsets", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars,
    visibleItems: [
      {
        bucketStartMs: 1_700_000_040_000,
        startRawIndex: 123_456,
        endRawIndex: 123_456,
        ts: "2024-01-02T09:30:00Z",
        open: 10,
        high: 13,
        low: 9,
        close: 12,
        volume: 1000,
      },
    ],
    tradeAmountIncludesFees: true,
    fills: [
      makeFill({
        id: "visible-buy-501",
        fill_index: 123_456,
        fill_price: 10,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
    ],
    fillSequenceStartIndex: 500,
  });

  assert.deepEqual(buckets.map((bucket) => bucket.displayLabel), ["B501"]);
});

test("visible-period aggregation keeps sell labels on the session-wide fill sequence", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars: [],
    visibleItems: [
      {
        bucketStartMs: 1_700_000_040_000,
        startRawIndex: 0,
        endRawIndex: 6,
        ts: "2024-01-02T09:30:00Z",
        open: 10,
        high: 15,
        low: 9,
        close: 14,
        volume: 2200,
      },
    ],
    tradeAmountIncludesFees: true,
    fills: [
      makeFill({ id: "buy-1", fill_index: 0, fill_price: 10 }),
      makeFill({ id: "buy-2", fill_index: 1, fill_price: 10 }),
      makeFill({ id: "buy-3", fill_index: 2, fill_price: 10 }),
      makeFill({ id: "buy-4", fill_index: 3, fill_price: 10 }),
      makeFill({ id: "buy-5", fill_index: 4, fill_price: 10 }),
      makeFill({ id: "buy-6", fill_index: 5, fill_price: 10 }),
      makeFill({
        id: "sell-7",
        side: "SELL",
        fill_index: 6,
        fill_price: 14,
      }),
    ],
    aggregateByVisiblePeriod: true,
  });

  assert.equal(buckets.length, 1);
  assert.deepEqual(
    buckets[0]?.details.map((detail) => detail.label),
    ["B1", "B2", "B3", "B4", "B5", "B6", "S7"],
  );
});

test("trade marker buckets compact grouped sell labels without repeating the side prefix", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars,
    visibleItems,
    tradeAmountIncludesFees: true,
    fills: [
      makeFill({
        id: "visible-sell-1",
        side: "SELL",
        fill_index: 123_456,
        fill_price: 13,
        fill_qty: 2,
        contract_multiplier: 100,
        fee: 4,
      }),
      makeFill({
        id: "visible-sell-2",
        side: "SELL",
        fill_index: 123_457,
        fill_price: 14,
        fill_qty: 1,
        contract_multiplier: 100,
        fee: 5,
      }),
    ],
    aggregateByVisiblePeriod: true,
  });

  const sellBucket = buckets.find((bucket) => bucket.side === "SELL");
  assert.ok(sellBucket);
  assert.equal(sellBucket.displayLabel, "S1-2");
  assert.equal(sellBucket.isAggregated, true);
  assert.equal(sellBucket.totalQty, 3);
  assert.deepEqual(sellBucket.details.map((detail) => detail.label), ["S1", "S2"]);
  assert.deepEqual(sellBucket.details.map((detail) => detail.cashAmount), [2_596, 1_395]);
});

test("trade marker buckets keep adjacent visible candles independent", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars,
    visibleItems: [
      {
        bucketStartMs: 1_700_000_040_000,
        startRawIndex: 123_456,
        endRawIndex: 123_456,
        ts: "2024-01-02T09:30:00Z",
        open: 10,
        high: 13,
        low: 9,
        close: 12,
        volume: 1000,
      },
      {
        bucketStartMs: 1_700_000_100_000,
        startRawIndex: 123_457,
        endRawIndex: 123_457,
        ts: "2024-01-02T09:31:00Z",
        open: 12,
        high: 15,
        low: 11,
        close: 14,
        volume: 1200,
      },
    ],
    tradeAmountIncludesFees: true,
    fills: [
      makeFill({
        id: "visible-buy-1",
        fill_index: 123_456,
        fill_price: 10,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
      makeFill({
        id: "visible-buy-2",
        fill_index: 123_457,
        fill_price: 12,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
    ],
    aggregateByVisiblePeriod: true,
  });

  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets.map((bucket) => bucket.displayLabel), ["B1", "B2"]);
  assert.equal(buckets.every((bucket) => bucket.isAggregated === false), true);
  assert.deepEqual(buckets.map((bucket) => bucket.timestamp), [1_700_000_040_000, 1_700_000_100_000]);
});

test("trade marker buckets keep one visible period unaggregated when the chart period is unchanged", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars,
    visibleItems,
    tradeAmountIncludesFees: true,
    aggregateByVisiblePeriod: false,
    fills: [
      makeFill({
        id: "visible-buy-1",
        fill_index: 123_456,
        fill_price: 10,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
      makeFill({
        id: "visible-buy-2",
        fill_index: 123_457,
        fill_price: 12,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
    ],
  });

  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets.map((bucket) => bucket.displayLabel), ["B1", "B2"]);
  assert.equal(buckets.every((bucket) => bucket.isAggregated === false), true);
});

test("trade marker buckets do not aggregate repeated trades on one raw candle", () => {
  const buckets = buildSystemTradeMarkerBuckets({
    sourceBars,
    visibleItems: [
      {
        bucketStartMs: 1_700_000_040_000,
        startRawIndex: 123_456,
        endRawIndex: 123_456,
        ts: "2024-01-02T09:30:00Z",
        open: 10,
        high: 13,
        low: 9,
        close: 12,
        volume: 1000,
      },
    ],
    tradeAmountIncludesFees: true,
    fills: [
      makeFill({
        id: "visible-buy-1",
        fill_index: 123_456,
        fill_price: 10,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
      makeFill({
        id: "visible-buy-2",
        fill_index: 123_456,
        fill_price: 11,
        fill_qty: 1,
        contract_multiplier: 100,
      }),
    ],
    aggregateByVisiblePeriod: false,
  });

  assert.equal(buckets.length, 2);
  assert.deepEqual(buckets.map((bucket) => bucket.displayLabel), ["B1", "B2"]);
  assert.equal(buckets.every((bucket) => bucket.isAggregated === false), true);
});
