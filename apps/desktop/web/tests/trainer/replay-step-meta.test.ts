// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateBarsByPeriodCore,
  resolveReplayStepMetaBySelectedTimeframe,
} from "../../src/domains/chart/replayAggregation";
import { resolveTrainerPeriodAdvanceMeta } from "../../src/domains/trainer/trainerPeriodAdvance";
import type { TradingCalendarConfig } from "@zinuto/shared/tradingCalendar";

const NIGHT_SESSION_CALENDAR: TradingCalendarConfig = {
  tradingDays: [5],
  sessions: [
    {
      startMinute: 21 * 60,
      endMinute: 2 * 60 + 30,
      crossesMidnight: true,
    },
  ],
};

const buildMinuteTimestamps = (count: number): number[] => {
  const start = Date.UTC(2025, 0, 1, 9, 0, 0);
  return Array.from({ length: count }, (_, index) => start + index * 60_000);
};

const buildDailyTimestamps = (
  count: number,
  start = Date.UTC(2025, 0, 1, 0, 0, 0),
): number[] =>
  Array.from({ length: count }, (_, index) => start + index * 86_400_000);

test("chart aggregation keeps a cross-midnight night session in one trading-day bucket", () => {
  const result = aggregateBarsByPeriodCore(
    [
      {
        ts: "2026-05-15T13:30:00.000Z",
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
      },
      {
        ts: "2026-05-15T17:30:00.000Z",
        open: 11,
        high: 15,
        low: 8,
        close: 14,
        volume: 200,
      },
    ],
    "1d",
    0,
    1,
    undefined,
    undefined,
    "Asia/Shanghai",
    NIGHT_SESSION_CALENDAR,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.ts, "2026-05-15T13:00:00.000Z");
  assert.equal(result[0]?.open, 10);
  assert.equal(result[0]?.high, 15);
  assert.equal(result[0]?.low, 8);
  assert.equal(result[0]?.close, 14);
  assert.equal(result[0]?.volume, 300);
});

test("selected replay timeframe drives the next bar step across raw bars", () => {
  const timestamps = buildMinuteTimestamps(120);

  assert.deepEqual(
    resolveReplayStepMetaBySelectedTimeframe(timestamps, 59, "1h", "UTC"),
    {
      stepForCurrentClose: 60,
      stepForNextOpen: 60,
      nextOpenDelay: 1,
    },
  );
});

test("selected replay timeframe can finish the current unfinished period first", () => {
  const timestamps = buildMinuteTimestamps(120);

  assert.deepEqual(
    resolveReplayStepMetaBySelectedTimeframe(timestamps, 30, "1h", "UTC"),
    {
      stepForCurrentClose: 29,
      stepForNextOpen: 89,
      nextOpenDelay: 30,
    },
  );
});

test("trainer advance delegates selected-period stepping to the backend", () => {
  const timestamps = buildMinuteTimestamps(120);

  assert.deepEqual(
    resolveTrainerPeriodAdvanceMeta({
      tsMsByIndex: timestamps,
      cursorIndex: 59,
      barsOffset: 0,
      barsTotal: 500,
      allowStep: true,
      displayPeriod: "1h",
      baseTimeframe: "1m",
      timeZone: "UTC",
    }),
    {
      stepForCurrentClose: 1,
      stepForNextOpen: 1,
      nextOpenDelay: 1,
      hasFutureBars: true,
      needsFutureBars: false,
    },
  );
});

test("trainer advance does not block on partial resident future bars", () => {
  const timestamps = buildMinuteTimestamps(80);

  assert.deepEqual(
    resolveTrainerPeriodAdvanceMeta({
      tsMsByIndex: timestamps,
      cursorIndex: 59,
      barsOffset: 0,
      barsTotal: 500,
      allowStep: true,
      displayPeriod: "1h",
      baseTimeframe: "1m",
      timeZone: "UTC",
    }),
    {
      stepForCurrentClose: 1,
      stepForNextOpen: 1,
      nextOpenDelay: 1,
      hasFutureBars: true,
      needsFutureBars: false,
    },
  );
});

test("trainer advance leaves incomplete-period decisions to the backend timeline", () => {
  const timestamps = buildMinuteTimestamps(50);

  assert.deepEqual(
    resolveTrainerPeriodAdvanceMeta({
      tsMsByIndex: timestamps,
      cursorIndex: 30,
      barsOffset: 0,
      barsTotal: 500,
      allowStep: true,
      displayPeriod: "1h",
      baseTimeframe: "1m",
      timeZone: "UTC",
    }),
    {
      stepForCurrentClose: 1,
      stepForNextOpen: 1,
      nextOpenDelay: 1,
      hasFutureBars: true,
      needsFutureBars: false,
    },
  );
});

test("trainer advance remains display-window agnostic at the dataset tail", () => {
  const timestamps = buildMinuteTimestamps(80);

  assert.deepEqual(
    resolveTrainerPeriodAdvanceMeta({
      tsMsByIndex: timestamps,
      cursorIndex: 59,
      barsOffset: 0,
      barsTotal: 80,
      allowStep: true,
      displayPeriod: "1h",
      baseTimeframe: "1m",
      timeZone: "UTC",
    }),
    {
      stepForCurrentClose: 1,
      stepForNextOpen: 1,
      nextOpenDelay: 1,
      hasFutureBars: true,
      needsFutureBars: false,
    },
  );
});

test("selected weekly replay timeframe drives both close and next-open stepping", () => {
  const timestamps = buildDailyTimestamps(15, Date.UTC(2025, 0, 6, 0, 0, 0));

  assert.deepEqual(
    resolveReplayStepMetaBySelectedTimeframe(timestamps, 4, "1w", "UTC"),
    {
      stepForCurrentClose: 2,
      stepForNextOpen: 9,
      nextOpenDelay: 3,
    },
  );
});

test("selected monthly replay timeframe drives both close and next-open stepping", () => {
  const timestamps = buildDailyTimestamps(40);

  assert.deepEqual(
    resolveReplayStepMetaBySelectedTimeframe(timestamps, 29, "1month", "UTC"),
    {
      stepForCurrentClose: 1,
      stepForNextOpen: 10,
      nextOpenDelay: 2,
    },
  );
});

test("trainer advance stays available when future bars are outside the resident window", () => {
  const timestamps = buildDailyTimestamps(10);

  assert.deepEqual(
    resolveTrainerPeriodAdvanceMeta({
      tsMsByIndex: timestamps,
      cursorIndex: 9,
      barsOffset: 100,
      barsTotal: 500,
      allowStep: true,
      displayPeriod: "1d",
      baseTimeframe: "1d",
      timeZone: "UTC",
    }),
    {
      stepForCurrentClose: 1,
      stepForNextOpen: 1,
      nextOpenDelay: 1,
      hasFutureBars: true,
      needsFutureBars: false,
    },
  );
});

test("higher timeframe trainer advance still delegates future-window decisions", () => {
  const timestamps = buildDailyTimestamps(10);

  assert.deepEqual(
    resolveTrainerPeriodAdvanceMeta({
      tsMsByIndex: timestamps,
      cursorIndex: 9,
      barsOffset: 100,
      barsTotal: 500,
      allowStep: true,
      displayPeriod: "1w",
      baseTimeframe: "1d",
      timeZone: "UTC",
    }),
    {
      stepForCurrentClose: 1,
      stepForNextOpen: 1,
      nextOpenDelay: 1,
      hasFutureBars: true,
      needsFutureBars: false,
    },
  );
});

test("resident window edge remains blocked at the real dataset end", () => {
  const timestamps = buildDailyTimestamps(10);

  assert.deepEqual(
    resolveTrainerPeriodAdvanceMeta({
      tsMsByIndex: timestamps,
      cursorIndex: 9,
      barsOffset: 100,
      barsTotal: 110,
      allowStep: false,
      displayPeriod: "1d",
      baseTimeframe: "1d",
      timeZone: "UTC",
    }),
    {
      stepForCurrentClose: 0,
      stepForNextOpen: 0,
      nextOpenDelay: 0,
      hasFutureBars: false,
      needsFutureBars: false,
    },
  );
});
