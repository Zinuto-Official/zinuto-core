// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TradingCalendarConfig } from "@zinuto/shared/tradingCalendar";
import type { OhlcvBar } from "../../src/domain/models.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-market-diagnostics-timeframe-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const {
  getMarketSymbolDiagnosticsSnapshot,
  replaceMarketBarsForInstrument,
} = await import("../../src/infrastructure/db/marketDatabase.js");

const A_SHARE_HOURLY_CALENDAR: TradingCalendarConfig = {
  tradingDays: [1, 2, 3, 4, 5],
  sessions: [
    { startMinute: 9 * 60 + 30, endMinute: 12 * 60 + 30, crossesMidnight: false },
    { startMinute: 13 * 60, endMinute: 16 * 60, crossesMidnight: false },
  ],
};

const makeBar = (ts: string, close = 1): OhlcvBar => ({
  ts,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

test("hourly diagnostics allow session-start anchored A-share bars", async () => {
  const instrumentId = "diagnostics-hourly-aligned-a-share";
  await replaceMarketBarsForInstrument(
    instrumentId,
    "ASHARE.ALIGNED",
    [
      makeBar("2025-01-06T01:30:00.000Z"),
      makeBar("2025-01-06T02:30:00.000Z"),
      makeBar("2025-01-06T03:30:00.000Z"),
    ],
    { prewarmHotTimelines: false },
  );

  const snapshot = await getMarketSymbolDiagnosticsSnapshot(instrumentId, "1h", {
    timeZone: "Asia/Shanghai",
    tradingCalendar: A_SHARE_HOURLY_CALENDAR,
  });

  assert.deepEqual(snapshot.timeframeMisalignedItems, []);
  assert.deepEqual(snapshot.outOfSessionItems, []);
});

test("hourly diagnostics report in-session bars outside the session grid", async () => {
  const instrumentId = "diagnostics-hourly-misaligned-a-share";
  await replaceMarketBarsForInstrument(
    instrumentId,
    "ASHARE.MISALIGNED",
    [
      makeBar("2025-01-06T01:30:00.000Z"),
      makeBar("2025-01-06T04:10:00.000Z"),
    ],
    { prewarmHotTimelines: false },
  );

  const snapshot = await getMarketSymbolDiagnosticsSnapshot(instrumentId, "1h", {
    timeZone: "Asia/Shanghai",
    tradingCalendar: A_SHARE_HOURLY_CALENDAR,
  });

  assert.equal(snapshot.timeframeMisalignedItems?.length, 1);
  assert.equal(
    snapshot.timeframeMisalignedItems?.[0]?.ts,
    "2025-01-06T04:10:00.000Z",
  );
  assert.deepEqual(snapshot.outOfSessionItems, []);
});

test("timeframe diagnostics keep out-of-session bars separate", async () => {
  const instrumentId = "diagnostics-hourly-out-of-session-a-share";
  await replaceMarketBarsForInstrument(
    instrumentId,
    "ASHARE.OUTSIDE",
    [
      makeBar("2025-01-06T01:30:00.000Z"),
      makeBar("2025-01-06T08:30:00.000Z"),
    ],
    { prewarmHotTimelines: false },
  );

  const snapshot = await getMarketSymbolDiagnosticsSnapshot(instrumentId, "1h", {
    timeZone: "Asia/Shanghai",
    tradingCalendar: A_SHARE_HOURLY_CALENDAR,
  });

  assert.deepEqual(snapshot.timeframeMisalignedItems, []);
  assert.equal(snapshot.outOfSessionItems.length, 1);
  assert.equal(snapshot.outOfSessionItems[0]?.ts, "2025-01-06T08:30:00.000Z");
});

test("daily diagnostics do not report intraday timeframe alignment", async () => {
  const instrumentId = "diagnostics-daily-no-intraday-grid";
  await replaceMarketBarsForInstrument(
    instrumentId,
    "DAILY.NOALIGN",
    [makeBar("2025-01-06T04:10:00.000Z")],
    { prewarmHotTimelines: false },
  );

  const snapshot = await getMarketSymbolDiagnosticsSnapshot(instrumentId, "1d", {
    timeZone: "Asia/Shanghai",
    tradingCalendar: {
      tradingDays: [1, 2, 3, 4, 5],
      sessions: [{ startMinute: 0, endMinute: 24 * 60, crossesMidnight: false }],
    },
  });

  assert.deepEqual(snapshot.timeframeMisalignedItems, []);
  assert.deepEqual(snapshot.outOfSessionItems, []);
});
