// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  compactReplayFillsForArchive,
  deriveReplayProfitFactor,
  deriveReplayTradeRounds,
} from "../dist/replay.js";

const fill = (
  side: "BUY" | "SELL",
  fillPrice: number,
  overrides: Record<string, unknown> = {},
) => ({
  side,
  fill_index: 0,
  fill_time: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  fill_price: fillPrice,
  fill_qty: 1,
  contract_multiplier: 1,
  fee: 0,
  tax: 0,
  slippage: 0,
  ...overrides,
});

test("trade-round return uses net pnl over gross entry notional", () => {
  const rounds = deriveReplayTradeRounds({
    bars: [],
    fills: [
      fill("BUY", 100, {
        contract_multiplier: 10,
        fee: 8,
      }),
      fill("SELL", 101, {
        fill_index: 1,
        contract_multiplier: 10,
        fee: 8,
      }),
    ],
  });

  assert.equal(rounds.length, 1);
  assert.equal(rounds[0]!.grossPnl, 10);
  assert.equal(rounds[0]!.pnl, -6);
  assert.equal(rounds[0]!.returnRate, -0.006);
});

test("same-coordinate fills retain sell-buy and buy-sell execution order", () => {
  const sellThenBuy = deriveReplayTradeRounds({
    bars: [],
    fills: [fill("SELL", 100), fill("BUY", 90)],
  });
  assert.equal(sellThenBuy.length, 1);
  assert.equal(sellThenBuy[0]!.direction, "SHORT");
  assert.equal(sellThenBuy[0]!.pnl, 10);

  const buyThenSell = deriveReplayTradeRounds({
    bars: [],
    fills: [fill("BUY", 100), fill("SELL", 90)],
  });
  assert.equal(buyThenSell.length, 1);
  assert.equal(buyThenSell[0]!.direction, "LONG");
  assert.equal(buyThenSell[0]!.pnl, -10);
});

test("archive compaction aggregates same-coordinate same-side fills across an opposite-side execution", () => {
  const compacted = compactReplayFillsForArchive([
    fill("SELL", 100),
    fill("BUY", 90),
    fill("SELL", 80),
  ]);

  // The two SELL fills share one fill_index and side, so they collapse into
  // a single bucket even though a BUY reversal sits between them.
  assert.deepEqual(
    compacted.map((item) => item.side),
    ["SELL", "BUY"],
  );
  assert.equal(compacted.length, 2);
  assert.equal(new Set(compacted.map((item) => item.id)).size, 2);
  const sellBucket = compacted.find((item) => item.side === "SELL");
  assert.equal(sellBucket?.fill_qty, 2);
  assert.equal(sellBucket?.fill_price, 90);
});

test("MFE and MAE exclude unexposed entry-close and exit-open bar extremes", () => {
  const rounds = deriveReplayTradeRounds({
    bars: [
      {
        ts: "2026-01-01T00:00:00.000Z",
        open: 50,
        high: 200,
        low: 1,
        close: 100,
      },
      {
        ts: "2026-01-02T00:00:00.000Z",
        open: 110,
        high: 300,
        low: 2,
        close: 200,
      },
    ],
    fills: [
      fill("BUY", 100),
      fill("SELL", 110, {
        fill_index: 1,
        fill_time: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-02T00:00:00.000Z",
      }),
    ],
  });

  assert.equal(rounds.length, 1);
  assert.equal(rounds[0]!.mfeRate, 0);
  assert.equal(rounds[0]!.maeRate, 0);
});

test("MFE and MAE include bars proven exposed from open entry through close exit", () => {
  const rounds = deriveReplayTradeRounds({
    bars: [
      {
        ts: "2026-01-01T00:00:00.000Z",
        open: 100,
        high: 120,
        low: 90,
        close: 110,
      },
      {
        ts: "2026-01-02T00:00:00.000Z",
        open: 105,
        high: 130,
        low: 80,
        close: 110,
      },
    ],
    fills: [
      fill("BUY", 100),
      fill("SELL", 110, {
        fill_index: 1,
        fill_time: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-02T00:00:00.000Z",
      }),
    ],
  });

  assert.equal(rounds.length, 1);
  assert.equal(rounds[0]!.mfeRate, 0.3);
  assert.equal(rounds[0]!.maeRate, 0.2);
});

test("profit factor has explicit finite, infinite, and unavailable states", () => {
  assert.deepEqual(deriveReplayProfitFactor(12, -3), {
    value: 4,
    state: "FINITE",
    grossProfit: 12,
    grossLoss: 3,
  });
  assert.deepEqual(deriveReplayProfitFactor(12, 0), {
    value: null,
    state: "POSITIVE_INFINITY",
    grossProfit: 12,
    grossLoss: 0,
  });
  assert.deepEqual(deriveReplayProfitFactor(0, 0), {
    value: null,
    state: "NOT_AVAILABLE",
    grossProfit: 0,
    grossLoss: 0,
  });
});
