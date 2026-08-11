// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDbDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-manual-undo-"),
);
process.env.ZINUTO_DB_PATH = path.join(tempDbDir, "zinuto.db");

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const { db, listSystemSeedSymbols } = await import("../../src/infrastructure/db/database.js");
const {
  getMarketReadDiagnostics,
  resetMarketReadDiagnostics,
} = await import("../../src/infrastructure/db/marketDatabase.js");
const {
  createOrGetSession,
  getSessionSnapshot,
  setSessionPlayback,
} = await import("../../src/application/trading/sessionService.js");
const {
  executeSessionAction,
} = await import("../../src/application/trading/orderService.js");
const { sessionRouter } = await import("../../src/http/sessionRoutes.js");
const {
  createSpecialTrainingBank,
  executeSpecialTrainingChallengeAction,
  getSpecialTrainingChallengeRuntime,
  startSpecialTrainingChallenge,
} = await import("../../src/application/specialTrainingService.js");

const upsertSource = db.prepare(
  `INSERT INTO local_data_sources (
    id, name, time_zone, base_timeframe, field_mapping_json, trading_calendar_json, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, 'READY', ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    time_zone = excluded.time_zone,
    base_timeframe = excluded.base_timeframe,
    field_mapping_json = excluded.field_mapping_json,
    trading_calendar_json = excluded.trading_calendar_json,
    status = excluded.status,
    updated_at = excluded.updated_at`,
);

const assignInstrumentSource = db.prepare(
  `UPDATE instruments
      SET source_id = ?
    WHERE id = ?`,
);

const symbol = listSystemSeedSymbols()[0] ?? "AAPL";

const readLatestFreeReplayUndoDeltaJson = (sessionId: string): string => {
  const row = db
    .prepare(
      `SELECT undo_delta_json AS undoDeltaJson
         FROM replay_session_undo_entries
        WHERE session_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1`,
    )
    .get(sessionId) as { undoDeltaJson?: string } | undefined;
  return String(row?.undoDeltaJson ?? "");
};

const countSessionFills = (sessionId: string): number =>
  Math.max(
    0,
    Number(
      db
        .prepare("SELECT COUNT(*) FROM sim_fills WHERE session_id = ?")
        .pluck()
        .get(sessionId) ?? 0,
    ),
  );

const rebuildSessionMetricTotalsForTest = (sessionId: string): void => {
  const fills = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(fee), 0) AS feeTotal,
              COALESCE(SUM(tax), 0) AS taxTotal,
              COALESCE(SUM(slippage), 0) AS slippageTotal
         FROM sim_fills
        WHERE session_id = ?`,
    )
    .get(sessionId) as {
    count?: number;
    feeTotal?: number;
    taxTotal?: number;
    slippageTotal?: number;
  };
  const longFinancingTotal = Number(
    db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) FROM sim_accrual_events WHERE session_id = ? AND kind IN ('LONG_FINANCING','FUNDING')",
      )
      .pluck()
      .get(sessionId) ?? 0,
  );
  const shortBorrowTotal = Number(
    db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) FROM sim_accrual_events WHERE session_id = ? AND kind = 'SHORT_BORROW'",
      )
      .pluck()
      .get(sessionId) ?? 0,
  );
  db.prepare(
    `INSERT INTO replay_session_metric_totals (
       session_id,fills_count,fill_fee_total,fill_tax_total,fill_slippage_total,
       long_financing_total,short_borrow_total,updated_at
     ) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id) DO UPDATE SET
       fills_count = excluded.fills_count,
       fill_fee_total = excluded.fill_fee_total,
       fill_tax_total = excluded.fill_tax_total,
       fill_slippage_total = excluded.fill_slippage_total,
       long_financing_total = excluded.long_financing_total,
       short_borrow_total = excluded.short_borrow_total,
       updated_at = excluded.updated_at`,
  ).run(
    sessionId,
    Math.max(0, Math.floor(Number(fills.count ?? 0) || 0)),
    Number(fills.feeTotal ?? 0) || 0,
    Number(fills.taxTotal ?? 0) || 0,
    Number(fills.slippageTotal ?? 0) || 0,
    longFinancingTotal,
    shortBorrowTotal,
    new Date().toISOString(),
  );
};

const countSessionOrdersByStatus = (sessionId: string, status: string): number =>
  Math.max(
    0,
    Number(
      db
        .prepare("SELECT COUNT(*) FROM sim_orders WHERE session_id = ? AND status = ?")
        .pluck()
        .get(sessionId, status) ?? 0,
    ),
  );

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DB_PATH;
  await fs.promises.rm(tempDbDir, { recursive: true, force: true });
});

test("free replay composite actions keep a five-step undo stack and restore pre-action state", async () => {
  const session = await createOrGetSession(symbol, "1d", true);
  const initialSnapshot = await getSessionSnapshot(session.id, 0);
  const initialCursor = initialSnapshot.session.cursor_index;

  assert.equal(initialSnapshot.actionState?.canUndo, false);
  assert.equal(initialSnapshot.actionState?.undoAvailableSteps, 0);

  assert.equal(initialSnapshot.actionState?.allowStep, true);

  await executeSessionAction(session.id, {
    action: "STEP",
    displayPeriod: "1d",
  });
  const steppedSnapshot = await getSessionSnapshot(session.id, 0);
  assert.ok(steppedSnapshot.session.cursor_index > initialCursor);
  assert.equal(steppedSnapshot.actionState?.canUndo, true);
  assert.equal(steppedSnapshot.actionState?.undoAvailableSteps, 1);
  assert.equal(steppedSnapshot.actionState?.lastUndoableAction, "STEP");
  const stepUndoDeltaJson = readLatestFreeReplayUndoDeltaJson(session.id);
  const stepUndoDelta = JSON.parse(stepUndoDeltaJson) as {
    fills?: unknown;
    orders?: unknown;
    rowidCutoffs?: unknown;
  };
  assert.equal(Object.hasOwn(stepUndoDelta, "fills"), false);
  assert.equal(Object.hasOwn(stepUndoDelta, "orders"), false);
  assert.ok(stepUndoDeltaJson.length < 6000);
  assert.ok(stepUndoDelta.rowidCutoffs);

  await executeSessionAction(session.id, { action: "UNDO" });
  const restoredStepSnapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(restoredStepSnapshot.session.cursor_index, initialCursor);
  assert.equal(restoredStepSnapshot.actionState?.undoAvailableSteps, 0);
  assert.equal(restoredStepSnapshot.actionState?.lastUndoableAction, null);

  const beforeBuySnapshot = await getSessionSnapshot(session.id, 0);
  const beforeBuyCursor = beforeBuySnapshot.session.cursor_index;
  const beforeBuyCash = Number(beforeBuySnapshot.accounts[0]?.balance ?? 0);
  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
    displayPeriod: "1d",
  });
  const afterBuySnapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(afterBuySnapshot.actionState?.undoAvailableSteps, 1);
  assert.equal(afterBuySnapshot.actionState?.lastUndoableAction, "BUY");
  assert.ok(afterBuySnapshot.session.cursor_index > beforeBuyCursor);
  assert.ok((afterBuySnapshot.fillsTotal ?? 0) > (beforeBuySnapshot.fillsTotal ?? 0));
  assert.notEqual(Number(afterBuySnapshot.accounts[0]?.balance ?? 0), beforeBuyCash);

  await executeSessionAction(session.id, { action: "UNDO" });
  const restoredBuySnapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(restoredBuySnapshot.session.cursor_index, beforeBuyCursor);
  assert.equal(Number(restoredBuySnapshot.accounts[0]?.balance ?? 0), beforeBuyCash);
  assert.equal(restoredBuySnapshot.fillsTotal ?? 0, beforeBuySnapshot.fillsTotal ?? 0);
  assert.equal(restoredBuySnapshot.actionState?.undoAvailableSteps, 0);

  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
    displayPeriod: "1d",
  });
  const beforeSellSnapshot = await getSessionSnapshot(session.id, 0);
  const beforeSellCursor = beforeSellSnapshot.session.cursor_index;
  const beforeSellCash = Number(beforeSellSnapshot.accounts[0]?.balance ?? 0);
  const beforeSellQty = Number(
    beforeSellSnapshot.positions.find((position) => position.instrumentId === session.instrument_id)?.qty ?? 0,
  );
  await executeSessionAction(session.id, {
    action: "SELL",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "CUR_CLOSE",
    displayPeriod: "1d",
  });
  const afterSellSnapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(afterSellSnapshot.actionState?.lastUndoableAction, "SELL");
  assert.ok((afterSellSnapshot.fillsTotal ?? 0) > (beforeSellSnapshot.fillsTotal ?? 0));
  assert.notEqual(Number(afterSellSnapshot.accounts[0]?.balance ?? 0), beforeSellCash);

  await executeSessionAction(session.id, { action: "UNDO" });
  const restoredSellSnapshot = await getSessionSnapshot(session.id, 0);
  const restoredSellQty = Number(
    restoredSellSnapshot.positions.find((position) => position.instrumentId === session.instrument_id)?.qty ?? 0,
  );
  assert.equal(restoredSellSnapshot.session.cursor_index, beforeSellCursor);
  assert.equal(Number(restoredSellSnapshot.accounts[0]?.balance ?? 0), beforeSellCash);
  assert.equal(restoredSellSnapshot.fillsTotal ?? 0, beforeSellSnapshot.fillsTotal ?? 0);
  assert.equal(restoredSellQty, beforeSellQty);

  const beforeNextOpenSnapshot = await getSessionSnapshot(session.id, 0);
  const beforeNextOpenCursor = beforeNextOpenSnapshot.session.cursor_index;
  const beforeNextOpenCash = Number(beforeNextOpenSnapshot.accounts[0]?.balance ?? 0);
  const beforeNextOpenFillsTotal = beforeNextOpenSnapshot.fillsTotal ?? 0;
  const pendingOrdersBeforeNextOpen = countSessionOrdersByStatus(session.id, "PENDING");
  await executeSessionAction(session.id, {
    action: "BUY",
    inputMode: "LOT",
    lotInput: 1,
    priceMode: "NEXT_OPEN",
    displayPeriod: "1d",
  });
  const afterNextOpenSnapshot = await getSessionSnapshot(session.id, 0);
  assert.ok(afterNextOpenSnapshot.session.cursor_index > beforeNextOpenCursor);
  assert.ok((afterNextOpenSnapshot.fillsTotal ?? 0) > beforeNextOpenFillsTotal);
  assert.equal(
    countSessionOrdersByStatus(session.id, "PENDING"),
    pendingOrdersBeforeNextOpen,
  );

  await executeSessionAction(session.id, { action: "UNDO" });
  const restoredNextOpenSnapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(restoredNextOpenSnapshot.session.cursor_index, beforeNextOpenCursor);
  assert.equal(Number(restoredNextOpenSnapshot.accounts[0]?.balance ?? 0), beforeNextOpenCash);
  assert.equal(restoredNextOpenSnapshot.fillsTotal ?? 0, beforeNextOpenFillsTotal);
  assert.equal(
    countSessionOrdersByStatus(session.id, "PENDING"),
    pendingOrdersBeforeNextOpen,
  );

  for (let index = 0; index < 6; index += 1) {
    await executeSessionAction(session.id, {
      action: "STEP",
      displayPeriod: "1d",
    });
  }
  const limitedSnapshot = await getSessionSnapshot(session.id, 0);
  assert.equal(limitedSnapshot.actionState?.undoAvailableSteps, 5);
  assert.equal(limitedSnapshot.actionState?.lastUndoableAction, "STEP");
});

test("free replay step undo delta stays bounded with large trade history", async () => {
  const session = await createOrGetSession(symbol, "1d", true);
  const insertOrder = db.prepare(
    `INSERT INTO sim_orders (
       id,session_id,instrument_id,side,qty,amount,price_mode,submit_index,status,auto_step_next,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertFill = db.prepare(
    `INSERT INTO sim_fills (
       id,order_id,session_id,instrument_id,side,fill_index,fill_time,fill_trade_day,fill_price,fill_qty,
       contract_multiplier,fee,tax,slippage,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const now = new Date().toISOString();
  const seedHistory = db.transaction(() => {
    for (let index = 0; index < 1500; index += 1) {
      const orderId = `undo-history-order-${session.id}-${index}`;
      insertOrder.run(
        orderId,
        session.id,
        session.instrument_id,
        index % 2 === 0 ? "BUY" : "SELL",
        1,
        null,
        "CUR_CLOSE",
        index,
        "FILLED",
        0,
        now,
      );
      insertFill.run(
        `undo-history-fill-${session.id}-${index}`,
        orderId,
        session.id,
        session.instrument_id,
        index % 2 === 0 ? "BUY" : "SELL",
        index,
        `2025-01-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
        "2025-01-01",
        100 + (index % 10),
        1,
        1,
        0,
        0,
        0,
        now,
      );
    }
  });
  seedHistory();
  rebuildSessionMetricTotalsForTest(session.id);

  const beforeFillCount = countSessionFills(session.id);
  await executeSessionAction(session.id, {
    action: "STEP",
    displayPeriod: "1d",
  });
  const undoDeltaJson = readLatestFreeReplayUndoDeltaJson(session.id);
  const undoDelta = JSON.parse(undoDeltaJson) as {
    fills?: unknown;
    existingOrders?: unknown;
    rowidCutoffs?: { fills?: number };
  };
  assert.equal(beforeFillCount, 1500);
  assert.equal(Object.hasOwn(undoDelta, "fills"), false);
  // FILLED orders are captured so restore re-establishes the pre-step order
  // book state; the delta scales with order count, not the full fill log.
  assert.equal(Array.isArray(undoDelta.existingOrders), true);
  assert.equal((undoDelta.existingOrders as unknown[]).length, 1500);
  assert.ok((undoDelta.rowidCutoffs?.fills ?? 0) >= beforeFillCount);
  assert.ok(undoDeltaJson.length < 1_000_000);

  await executeSessionAction(session.id, { action: "UNDO" });
  assert.equal(countSessionFills(session.id), beforeFillCount);
});

test("free replay session snapshots return the resident fill tail with global sequence offset", async () => {
  const session = await createOrGetSession(symbol, "1d", true);
  const orderId = `snapshot-page-order-${session.id}`;
  db.prepare(
    `INSERT INTO sim_orders (
       id,session_id,instrument_id,side,qty,amount,price_mode,submit_index,status,auto_step_next,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    orderId,
    session.id,
    session.instrument_id,
    "BUY",
    1,
    null,
    "CUR_CLOSE",
    0,
    "FILLED",
    0,
    new Date().toISOString(),
  );
  const insertFill = db.prepare(
    `INSERT INTO sim_fills (
       id,order_id,session_id,instrument_id,side,fill_index,fill_time,fill_trade_day,fill_price,fill_qty,
       contract_multiplier,fee,tax,slippage,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const now = new Date().toISOString();
  const seedFills = db.transaction(() => {
    for (let index = 0; index < 505; index += 1) {
      insertFill.run(
        `snapshot-page-fill-${session.id}-${index}`,
        orderId,
        session.id,
        session.instrument_id,
        index % 2 === 0 ? "BUY" : "SELL",
        index,
        `2025-02-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
        "2025-02-01",
        100 + (index % 10),
        1,
        1,
        0,
        0,
        0,
        now,
      );
    }
  });
  seedFills();
  rebuildSessionMetricTotalsForTest(session.id);

  const tailPage = await getSessionSnapshot(session.id, null);
  assert.equal(tailPage.fillsTotal, 505);
  assert.equal(tailPage.fills.length, 500);
  assert.equal(tailPage.residentFillsStartIndex, 5);
  assert.equal(tailPage.fills[0]?.id, `snapshot-page-fill-${session.id}-5`);
  assert.equal(tailPage.fills.at(-1)?.id, `snapshot-page-fill-${session.id}-504`);
  assert.equal(typeof tailPage.nextFillCursor, "string");

  const incrementalPage = await getSessionSnapshot(session.id, tailPage.nextFillCursor);
  assert.equal(incrementalPage.fillsTotal, 505);
  assert.equal(incrementalPage.fills.length, 0);
  assert.equal(incrementalPage.residentFillsStartIndex, 505);
  assert.equal(typeof incrementalPage.nextFillCursor, "string");
});

test("free replay action route returns backend runtime delta and chart frame", async () => {
  const session = await createOrGetSession(symbol, "1d", true);
  const app = express();
  app.use(express.json());
  app.use(sessionRouter);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/training/free-replay/sessions/${encodeURIComponent(session.id)}/actions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "STEP",
          displayPeriod: "1d",
          fillCursor: null,
        }),
      },
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("x-zinuto-hot-action-timing") ?? "",
      /access;dur=\d+\.\d+, action;dur=\d+\.\d+, delta;dur=\d+\.\d+, chartFrame;dur=\d+\.\d+, serialize;dur=\d+\.\d+, total;dur=\d+\.\d+/,
    );
    const body = (await response.json()) as {
      ok?: boolean;
      data?: {
        snapshot?: unknown;
        runtimeDelta?: {
          action?: string;
          previousCursorRawIndex?: number;
          cursorRawIndex?: number;
          displayIndex?: number;
        };
        chartFrame?: { rawStartIndex?: number; rawEndIndex?: number };
        advanceState?: {
          cursorRawIndex?: number;
          displayStartIndex?: number;
          displayEndIndex?: number;
        };
      };
    };
    assert.equal(body.ok, true);
    assert.equal(Object.hasOwn(body.data ?? {}, "snapshot"), false);
    assert.ok(body.data?.runtimeDelta);
    assert.equal(body.data.runtimeDelta.action, "STEP");
    assert.ok(body.data.chartFrame);
    assert.equal(Object.hasOwn(body.data ?? {}, "chartFrameDecision"), false);
    assert.equal(
      Number(body.data?.advanceState?.cursorRawIndex),
      Number(body.data.runtimeDelta.cursorRawIndex),
    );

    const residentCursor = Number(body.data.runtimeDelta.cursorRawIndex);
    const residentWindowResponse = await fetch(
      `http://127.0.0.1:${address.port}/training/free-replay/sessions/${encodeURIComponent(session.id)}/actions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "STEP",
          displayPeriod: "1d",
          fillCursor: null,
        }),
      },
    );
    assert.equal(residentWindowResponse.status, 200);
    const residentWindowBody = (await residentWindowResponse.json()) as {
      ok?: boolean;
      data?: {
        runtimeDelta?: {
          previousCursorRawIndex?: number;
          cursorRawIndex?: number;
          displayIndex?: number;
        };
        chartFrame?: unknown;
        advanceState?: { cursorRawIndex?: number };
      };
    };
    assert.equal(residentWindowBody.ok, true);
    assert.ok(residentWindowBody.data?.runtimeDelta);
    assert.ok(residentWindowBody.data.chartFrame);
    assert.equal(Object.hasOwn(residentWindowBody.data ?? {}, "chartFrameDecision"), false);
    assert.equal(
      Number(residentWindowBody.data.runtimeDelta.previousCursorRawIndex),
      residentCursor,
    );
    assert.ok(
      Number(residentWindowBody.data.runtimeDelta.cursorRawIndex) > residentCursor,
    );
    assert.equal(
      Number(residentWindowBody.data.advanceState?.cursorRawIndex),
      Number(residentWindowBody.data.runtimeDelta.cursorRawIndex),
    );

    const outsideWindowCursor = Number(residentWindowBody.data.runtimeDelta.cursorRawIndex);
    resetMarketReadDiagnostics();
    const windowMissResponse = await fetch(
      `http://127.0.0.1:${address.port}/training/free-replay/sessions/${encodeURIComponent(session.id)}/actions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "STEP",
          displayPeriod: "1d",
          fillCursor: null,
        }),
      },
    );
    assert.equal(windowMissResponse.status, 200);
    const windowMissBody = (await windowMissResponse.json()) as {
      ok?: boolean;
      data?: {
        runtimeDelta?: { previousCursorRawIndex?: number; cursorRawIndex?: number };
        chartFrame?: { rawStartIndex?: number; rawEndIndex?: number };
        advanceState?: { cursorRawIndex?: number };
      };
    };
    assert.equal(windowMissBody.ok, true);
    assert.ok(windowMissBody.data?.runtimeDelta);
    assert.ok(windowMissBody.data?.chartFrame);
    const windowMissDiagnostics = getMarketReadDiagnostics();
    assert.ok(windowMissDiagnostics.displayContainingReadCount <= 2);
    assert.ok(windowMissDiagnostics.displayIndexReadCount <= 2);
    assert.equal(
      Number(windowMissBody.data.runtimeDelta.previousCursorRawIndex),
      outsideWindowCursor,
    );
    assert.ok(
      Number(windowMissBody.data.runtimeDelta.cursorRawIndex) > outsideWindowCursor,
    );
    assert.equal(Object.hasOwn(windowMissBody.data ?? {}, "chartFrameDecision"), false);
    assert.ok(
      Number(windowMissBody.data.chartFrame.rawStartIndex) <=
        Number(windowMissBody.data.runtimeDelta.cursorRawIndex),
    );
    assert.ok(
      Number(windowMissBody.data.chartFrame.rawEndIndex) >=
        Number(windowMissBody.data.runtimeDelta.cursorRawIndex),
    );

    const undoResponse = await fetch(
      `http://127.0.0.1:${address.port}/training/free-replay/sessions/${encodeURIComponent(session.id)}/actions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "UNDO",
          displayPeriod: "1d",
          fillCursor: null,
        }),
      },
    );
    assert.equal(undoResponse.status, 200);
    assert.match(
      undoResponse.headers.get("x-zinuto-hot-action-timing") ?? "",
      /access;dur=\d+\.\d+, action;dur=\d+\.\d+, delta;dur=\d+\.\d+, chartFrame;dur=\d+\.\d+, serialize;dur=\d+\.\d+, total;dur=\d+\.\d+/,
    );
    const undoBody = (await undoResponse.json()) as {
      ok?: boolean;
      data?: {
        snapshot?: unknown;
        runtimeDelta?: { action?: string };
        chartFrame?: unknown;
      };
    };
    assert.equal(undoBody.ok, true);
    assert.equal(Object.hasOwn(undoBody.data ?? {}, "snapshot"), false);
    assert.equal(undoBody.data?.runtimeDelta?.action, "UNDO");
    assert.ok(undoBody.data?.chartFrame);
    assert.equal(Object.hasOwn(undoBody.data ?? {}, "chartFrameDecision"), false);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("free replay playback tick is serialized by backend playback state", async () => {
  const session = await createOrGetSession(symbol, "1d", true);
  const initialSnapshot = await getSessionSnapshot(session.id, 0);
  const initialCursor = initialSnapshot.session.cursor_index;

  const pausedTick = await executeSessionAction(session.id, {
    action: "PLAYBACK_TICK",
    displayPeriod: "1d",
  });
  assert.equal(pausedTick.session.cursor_index, initialCursor);
  assert.equal(pausedTick.session.is_paused, 1);

  const instrument = db
    .prepare("SELECT bar_count AS barCount FROM instruments WHERE id = ?")
    .get(session.instrument_id) as { barCount?: number } | undefined;
  const tailCursor = Math.max(0, Math.floor(Number(instrument?.barCount ?? 1)) - 1);
  assert.ok(tailCursor >= 4);
  const activeStartCursor = Math.max(0, Math.min(initialCursor, tailCursor - 3));
  db.prepare("UPDATE replay_sessions SET cursor_index = ?, is_paused = 0 WHERE id = ?").run(
    activeStartCursor,
    session.id,
  );
  await setSessionPlayback(session.id, 500, false);
  const activeBeforeSnapshot = await getSessionSnapshot(session.id, 0);
  const activeTick1 = await executeSessionAction(session.id, {
    action: "PLAYBACK_TICK",
    displayPeriod: "1d",
  });
  const activeTick2 = await executeSessionAction(session.id, {
    action: "PLAYBACK_TICK",
    displayPeriod: "1d",
  });
  const activeTick3 = await executeSessionAction(session.id, {
    action: "PLAYBACK_TICK",
    displayPeriod: "1d",
  });
  assert.ok(activeTick1.session.cursor_index > activeBeforeSnapshot.session.cursor_index);
  assert.ok(activeTick2.session.cursor_index > activeTick1.session.cursor_index);
  assert.ok(activeTick3.session.cursor_index > activeTick2.session.cursor_index);
  assert.equal(activeTick1.session.is_paused, 0);
  assert.equal(activeTick2.session.is_paused, 0);
  assert.equal(activeTick3.session.is_paused, 0);

  db.prepare("UPDATE replay_sessions SET cursor_index = ?, is_paused = 0 WHERE id = ?").run(
    tailCursor,
    session.id,
  );
  const tailTick = await executeSessionAction(session.id, {
    action: "PLAYBACK_TICK",
    displayPeriod: "1d",
  });
  assert.equal(tailTick.session.cursor_index, tailCursor);
  assert.equal(tailTick.session.is_paused, 1);
});

test("free replay repeated STEP actions advance the cursor continuously", async () => {
  const session = await createOrGetSession(symbol, "1d", true);
  const initialSnapshot = await getSessionSnapshot(session.id, 0);

  const step1 = await executeSessionAction(session.id, {
    action: "STEP",
    displayPeriod: "1d",
  });
  const step2 = await executeSessionAction(session.id, {
    action: "STEP",
    displayPeriod: "1d",
  });
  const step3 = await executeSessionAction(session.id, {
    action: "STEP",
    displayPeriod: "1d",
  });

  assert.ok(step1.session.cursor_index > initialSnapshot.session.cursor_index);
  assert.ok(step2.session.cursor_index > step1.session.cursor_index);
  assert.ok(step3.session.cursor_index > step2.session.cursor_index);
});

test("risk discipline challenge actions record and restore the latest five manual steps", async () => {
  const riskSeedSymbols = Array.from(
    new Set([symbol, ...listSystemSeedSymbols()]),
  ).slice(0, 5);
  const seededSessions = await Promise.all(
    riskSeedSymbols.map((seedSymbol) => createOrGetSession(seedSymbol, "1d", true)),
  );
  const originalRandom = Math.random;
  Math.random = () => 0.999999;
  let challenge;
  try {
    const enabledInstrumentIds = seededSessions
      .map((session) => String(session.instrument_id ?? "").trim())
      .filter((instrumentId) => instrumentId.length > 0);
    const now = new Date().toISOString();
    upsertSource.run(
      "manual-undo-risk",
      "manual-undo-risk",
      "UTC",
      "1d",
      "{}",
      DEFAULT_TRADING_CALENDAR_JSON,
      now,
      now,
    );
    for (const instrumentId of enabledInstrumentIds) {
      assignInstrumentSource.run("manual-undo-risk", instrumentId);
    }
    const bank = createSpecialTrainingBank({
      name: "manual-undo-risk",
      assetClass: "STOCK",
      targetTimeframe: "1d",
      poolIds: ["manual-undo-risk"],
    });
    challenge = await startSpecialTrainingChallenge({
      bankId: bank.id,
      modeId: "risk-discipline-training",
      questionCount: 5,
      horizonBars: 10,
    });
    assert.equal(Object.hasOwn(challenge, "questions"), false);
    assert.ok(Array.isArray(challenge.runtime.question?.bars));
  } finally {
    Math.random = originalRandom;
  }

  const initialRuntime = await getSpecialTrainingChallengeRuntime(challenge.challengeId);
  assert.equal(initialRuntime.actionState?.undo.allowed, false);
  assert.equal(initialRuntime.actionState?.undo.blockedReasonCode, "UNDO_EMPTY");
  assert.equal(initialRuntime.actionState?.undo.availableSteps, 0);
  assert.equal(initialRuntime.actionState?.buyAdvance.allowed, true);
  assert.equal(initialRuntime.actionState?.sellAdvance.allowed, true);
  assert.equal(initialRuntime.actionState?.nextBar.allowed, true);
  assert.ok(initialRuntime.cursorIndex !== null);

  const buyAndAdvanceResult = await executeSpecialTrainingChallengeAction(
    challenge.challengeId,
    {
      action: "BUY_AND_ADVANCE",
      inputMode: "RATIO",
      ratioInput: "25",
      priceMode: "CUR_CLOSE",
    },
  );
  assert.ok(Array.isArray(buyAndAdvanceResult.runtime.question?.bars));
  assert.equal(
    buyAndAdvanceResult.runtime.question?.bars?.length,
    initialRuntime.question?.bars?.length,
  );
  assert.equal(buyAndAdvanceResult.runtime.actionState?.undo.allowed, true);
  assert.equal(
    buyAndAdvanceResult.runtime.actionState?.undo.availableSteps,
    1,
  );
  assert.equal(
    buyAndAdvanceResult.runtime.actionState?.undo.lastUndoableAction,
    "BUY_AND_ADVANCE",
  );
  assert.ok(
    (buyAndAdvanceResult.runtime.cursorIndex ?? 0) >
      (initialRuntime.cursorIndex ?? 0),
  );
  assert.equal(buyAndAdvanceResult.runtime.tradeActions.length, 1);
  assert.equal(
    buyAndAdvanceResult.runtime.actionState?.sellAdvance.allowed,
    true,
  );

  const nextBarResult = await executeSpecialTrainingChallengeAction(
    challenge.challengeId,
    {
      action: "NEXT_BAR",
    },
  );
  assert.ok(Array.isArray(nextBarResult.runtime.question?.bars));
  assert.equal(nextBarResult.runtime.actionState?.undo.availableSteps, 2);
  assert.equal(
    nextBarResult.runtime.actionState?.undo.lastUndoableAction,
    "NEXT_BAR",
  );

  const undoNextBarResult = await executeSpecialTrainingChallengeAction(
    challenge.challengeId,
    {
      action: "UNDO",
    },
  );
  assert.ok(Array.isArray(undoNextBarResult.runtime.question?.bars));
  assert.equal(
    undoNextBarResult.runtime.cursorIndex,
    buyAndAdvanceResult.runtime.cursorIndex,
  );
  assert.equal(
    undoNextBarResult.runtime.tradeActions.length,
    buyAndAdvanceResult.runtime.tradeActions.length,
  );
  assert.equal(undoNextBarResult.runtime.actionState?.undo.availableSteps, 1);
  assert.equal(
    undoNextBarResult.runtime.actionState?.undo.lastUndoableAction,
    "BUY_AND_ADVANCE",
  );

  const maxBuyResult = await executeSpecialTrainingChallengeAction(
    challenge.challengeId,
    {
      action: "BUY_AND_ADVANCE",
      inputMode: "RATIO",
      ratioInput: "100",
      priceMode: "CUR_CLOSE",
    },
  );
  assert.equal(
    maxBuyResult.runtime.actionState?.buyAdvance.blockedReasonCode,
    "QUANTITY_ZERO",
  );
  assert.equal(maxBuyResult.runtime.actionState?.sellAdvance.allowed, true);

  const flatSellResult = await executeSpecialTrainingChallengeAction(
    challenge.challengeId,
    {
      action: "SELL_AND_ADVANCE",
      inputMode: "RATIO",
      ratioInput: "100",
      priceMode: "CUR_CLOSE",
    },
  );
  assert.equal(
    flatSellResult.runtime.actionState?.sellAdvance.blockedReasonCode,
    "POSITION_EMPTY",
  );

  let runtime = flatSellResult.runtime;
  let stepsRecorded = runtime.actionState?.undo.availableSteps ?? 0;
  let peakUndoSteps = runtime.actionState?.undo.availableSteps ?? 0;
  while (stepsRecorded < 5 && runtime.actionState?.nextBar.allowed) {
    const commandResult = await executeSpecialTrainingChallengeAction(
      challenge.challengeId,
      {
        action: "NEXT_BAR",
      },
    );
    runtime = commandResult.runtime;
    stepsRecorded = runtime.actionState?.undo.availableSteps ?? 0;
    peakUndoSteps = Math.max(
      peakUndoSteps,
      runtime.actionState?.undo.availableSteps ?? 0,
    );
  }

  assert.equal(peakUndoSteps, 5);
  while (runtime.actionState?.nextBar.allowed) {
    runtime = (await executeSpecialTrainingChallengeAction(challenge.challengeId, {
      action: "NEXT_BAR",
    })).runtime;
  }
  assert.ok(
    runtime.actionState?.nextBar.blockedReasonCode === "NO_ACTIONABLE_BARS" ||
      runtime.actionState?.nextBar.blockedReasonCode === "NO_ACTIVE_QUESTION",
  );
});
