// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTrainerFillEnvelopeToSnapshot,
  mergeTrainerFillEnvelope,
} from "../../src/domains/trainer/trainerFillEnvelope";
import type { Fill, SessionSnapshot } from "../../src/domains/training/types";

const makeFill = (index: number): Fill => ({
  id: `fill-${index}`,
  order_id: `order-${index}`,
  session_id: "session",
  instrument_id: "instrument",
  symbol: "TEST",
  side: index % 2 === 0 ? "SELL" : "BUY",
  fill_index: index - 1,
  fill_time: "2024-01-02T09:30:00Z",
  fill_price: 10,
  fill_qty: 1,
  contract_multiplier: 1,
  fee: 0,
  tax: 0,
  slippage: 0,
  created_at: "2024-01-02T09:30:00Z",
});

const makeSnapshot = (
  fills: Fill[],
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot =>
  ({
    session: {
      id: "session",
      user_id: "user",
      instrument_id: "instrument",
      samplePoolId: "pool",
      sourceTimeframe: "1d",
      timeframe: "1d",
      minimumBaseTimeframe: "1d",
      start_index: 0,
      entry_index: 0,
      history_bars: 0,
      cursor_index: 0,
      autoplay_interval_ms: 0,
      is_paused: 0,
      created_at: "2024-01-02T09:30:00Z",
      symbol: "TEST",
    },
    accounts: [],
    positions: [],
    fills,
    fillsTotal: fills.length,
    nextFillCursor: fills.length ? `${fills.length - 1}:${fills.length}` : null,
    drawings: [],
    ...overrides,
  }) as SessionSnapshot;

test("trainer fill envelope keeps only the bounded resident tail", () => {
  const previousSnapshot = makeSnapshot(
    [makeFill(1), makeFill(2), makeFill(3)],
    {
      fillsTotal: 3,
      nextFillCursor: "2:3",
      residentFillsStartIndex: 0,
    },
  );

  const envelope = mergeTrainerFillEnvelope({
    sessionId: "session",
    previousSnapshot,
    incomingFills: [makeFill(4), makeFill(5)],
    incomingFillsTotal: 5,
    incomingNextFillCursor: "4:5",
    appendFromPrevious: true,
    maxResidentFills: 3,
  });

  assert.equal(envelope.fillsTotal, 5);
  assert.equal(envelope.nextFillCursor, "4:5");
  assert.equal(envelope.residentFillsStartIndex, 2);
  assert.deepEqual(
    envelope.fills.map((fill) => fill.id),
    ["fill-3", "fill-4", "fill-5"],
  );
});

test("trainer fill envelope reuses the previous resident array when no fills arrived", () => {
  const residentFills = [makeFill(1), makeFill(2)];
  const previousSnapshot = makeSnapshot(residentFills, {
    fillsTotal: 2,
    nextFillCursor: "1:2",
    residentFillsStartIndex: 0,
  });

  const envelope = mergeTrainerFillEnvelope({
    sessionId: "session",
    previousSnapshot,
    incomingFills: [],
    incomingFillsTotal: 2,
    incomingNextFillCursor: "1:2",
    appendFromPrevious: true,
    maxResidentFills: 3,
  });

  assert.equal(envelope.fills, residentFills);
  assert.equal(envelope.residentFillsStartIndex, 0);
});

test("trainer fill envelope replaces resident fills for undo full snapshots", () => {
  const previousSnapshot = makeSnapshot(
    [makeFill(1), makeFill(2), makeFill(3)],
    {
      fillsTotal: 3,
      nextFillCursor: "2:3",
      residentFillsStartIndex: 0,
    },
  );

  const envelope = mergeTrainerFillEnvelope({
    sessionId: "session",
    previousSnapshot,
    incomingFills: [makeFill(1), makeFill(2)],
    incomingFillsTotal: 2,
    incomingNextFillCursor: "1:2",
    appendFromPrevious: false,
    maxResidentFills: 10,
  });

  assert.equal(envelope.fillsTotal, 2);
  assert.equal(envelope.nextFillCursor, "1:2");
  assert.equal(envelope.residentFillsStartIndex, 0);
  assert.deepEqual(
    envelope.fills.map((fill) => fill.id),
    ["fill-1", "fill-2"],
  );
});

test("trainer snapshot envelope normalizes bootstrap payloads without previous state", () => {
  const snapshot = applyTrainerFillEnvelopeToSnapshot(
    makeSnapshot([makeFill(1), makeFill(2), makeFill(3), makeFill(4)], {
      fillsTotal: 4,
      nextFillCursor: "3:4",
    }),
  );

  assert.equal(snapshot.fillsTotal, 4);
  assert.equal(snapshot.nextFillCursor, "3:4");
  assert.equal(snapshot.residentFillsStartIndex, 0);
  assert.deepEqual(
    snapshot.fills.map((fill) => fill.id),
    ["fill-1", "fill-2", "fill-3", "fill-4"],
  );
});

test("trainer snapshot envelope preserves backend resident fill offsets", () => {
  const snapshot = applyTrainerFillEnvelopeToSnapshot(
    makeSnapshot([makeFill(501), makeFill(502), makeFill(503)], {
      fillsTotal: 503,
      nextFillCursor: "502:503",
      residentFillsStartIndex: 500,
    }),
  );

  assert.equal(snapshot.fillsTotal, 503);
  assert.equal(snapshot.nextFillCursor, "502:503");
  assert.equal(snapshot.residentFillsStartIndex, 500);
  assert.deepEqual(
    snapshot.fills.map((fill) => fill.id),
    ["fill-501", "fill-502", "fill-503"],
  );
});
