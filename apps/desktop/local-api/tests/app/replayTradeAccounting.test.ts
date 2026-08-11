// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  calcSessionTradeAnalytics,
  parseReplayFills,
  type ReplayFill,
  type ReplayPayload,
} from "../../src/domain/training/statsDomain.js";

const fill = (
  side: "BUY" | "SELL",
  fillPrice: number,
  overrides: Partial<ReplayFill> = {},
): ReplayFill => ({
  side,
  fill_index: 0,
  fill_time: "2026-01-01T00:00:00.000Z",
  fill_price: fillPrice,
  fill_qty: 1,
  contract_multiplier: 1,
  fee: 0,
  tax: 0,
  slippage: 0,
  ...overrides,
});

test("fallback trade analytics uses net return for high-cost trades", () => {
  const analytics = calcSessionTradeAnalytics(
    [
      fill("BUY", 100, { fee: 2 }),
      fill("SELL", 101, { fill_index: 1, fee: 2 }),
    ],
    100,
  );

  assert.equal(analytics.records.length, 1);
  assert.equal(analytics.records[0]!.pnl, -3);
  assert.equal(analytics.records[0]!.returnRate, -0.03);
  assert.equal(analytics.averageStopLossRate, 0.03);
});

test("replay fill parsing preserves same-coordinate reversal sequence", () => {
  const run = (fills: ReplayFill[]) => {
    const replay: ReplayPayload = { snapshot: { fills } };
    const parsed = parseReplayFills(replay);
    return {
      sides: parsed.map((item) => item.side),
      records: calcSessionTradeAnalytics(parsed, 100).records,
    };
  };

  const sellThenBuy = run([fill("SELL", 100), fill("BUY", 90)]);
  assert.deepEqual(sellThenBuy.sides, ["SELL", "BUY"]);
  assert.equal(sellThenBuy.records[0]!.direction, "SHORT");
  assert.equal(sellThenBuy.records[0]!.pnl, 10);

  const buyThenSell = run([fill("BUY", 100), fill("SELL", 90)]);
  assert.deepEqual(buyThenSell.sides, ["BUY", "SELL"]);
  assert.equal(buyThenSell.records[0]!.direction, "LONG");
  assert.equal(buyThenSell.records[0]!.pnl, -10);
});
