// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { buildTrainerFillDerivedSnapshot } from "../../src/domains/trainer/trainerFillDerivedState";
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

test("trainer fill derived trade-log rows use one session-wide fill sequence", () => {
  const snapshot = buildTrainerFillDerivedSnapshot({
    sessionId: "session",
    fills: [
      makeFill({ id: "buy-1", fill_index: 0 }),
      makeFill({ id: "sell-2", side: "SELL", fill_index: 1 }),
      makeFill({ id: "buy-3", fill_index: 2 }),
    ],
  });

  assert.equal(snapshot.buyCount, 2);
  assert.equal(snapshot.sellCount, 1);
  assert.deepEqual(
    snapshot.tradeLogRows.map((row) => row.sequence),
    ["B3", "S2", "B1"],
  );
});

test("trainer fill derived append path keeps the session-wide sequence", () => {
  const previous = buildTrainerFillDerivedSnapshot({
    sessionId: "session",
    fills: [
      makeFill({ id: "buy-1", fill_index: 0 }),
      makeFill({ id: "sell-2", side: "SELL", fill_index: 1 }),
    ],
  });

  const next = buildTrainerFillDerivedSnapshot({
    sessionId: "session",
    fills: [
      makeFill({ id: "buy-1", fill_index: 0 }),
      makeFill({ id: "sell-2", side: "SELL", fill_index: 1 }),
      makeFill({ id: "buy-3", fill_index: 2 }),
    ],
    previous,
  });

  assert.deepEqual(
    next.tradeLogRows.map((row) => row.sequence),
    ["B3", "S2", "B1"],
  );
});

test("trainer fill derived uses resident start index for capped windows", () => {
  const snapshot = buildTrainerFillDerivedSnapshot({
    sessionId: "session",
    residentFillsStartIndex: 2,
    fills: [
      makeFill({ id: "buy-3", fill_index: 2 }),
      makeFill({ id: "sell-4", side: "SELL", fill_index: 3 }),
    ],
  });

  assert.equal(snapshot.fillCount, 4);
  assert.equal(snapshot.residentFillsStartIndex, 2);
  assert.deepEqual(
    snapshot.tradeLogRows.map((row) => row.sequence),
    ["S4", "B3"],
  );
});

test("trainer fill derived append path continues after a trimmed resident head", () => {
  const previous = buildTrainerFillDerivedSnapshot({
    sessionId: "session",
    fills: [
      makeFill({ id: "buy-1", fill_index: 0 }),
      makeFill({ id: "sell-2", side: "SELL", fill_index: 1 }),
      makeFill({ id: "buy-3", fill_index: 2 }),
    ],
  });

  const next = buildTrainerFillDerivedSnapshot({
    sessionId: "session",
    residentFillsStartIndex: 3,
    fills: [
      makeFill({ id: "sell-4", side: "SELL", fill_index: 3 }),
      makeFill({ id: "buy-5", fill_index: 4 }),
    ],
    previous,
  });

  assert.equal(next.fillCount, 5);
  assert.equal(next.buyCount, 3);
  assert.equal(next.sellCount, 2);
  assert.deepEqual(
    next.tradeLogRows.map((row) => row.sequence),
    ["B5", "S4", "B3", "S2", "B1"],
  );
});
