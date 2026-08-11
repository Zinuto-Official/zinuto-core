// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  getTradingCalendarPeriodStartMs,
  inferTradingCalendarFromTimestamps,
  isTimestampInTradingCalendar,
  normalizeTradingCalendarConfig,
  resolveTradingCalendarMembership,
  type TradingCalendarConfig,
} from "../dist/tradingCalendar.js";
import {
  MARKET_PRESET_CALENDAR_DEFINITIONS,
  resolveMarketPresetTimeZone,
} from "../dist/marketPresets.js";
import { resolveDefaultImportTimeZoneByMarketPreset } from "../dist/timezone.js";

const ms = (iso: string): number => Date.parse(iso);

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

const buildShanghaiWeekdayIntradaySamples = (): number[] => {
  const timestampsMs: number[] = [];
  for (const day of [11, 12, 13, 14, 15]) {
    for (let minute = 9 * 60 + 30; minute < 11 * 60 + 30; minute += 5) {
      const hourText = String(Math.floor(minute / 60)).padStart(2, "0");
      const minuteText = String(minute % 60).padStart(2, "0");
      timestampsMs.push(
        ms(`2026-05-${String(day).padStart(2, "0")}T${hourText}:${minuteText}:00+08:00`),
      );
    }
    for (let minute = 13 * 60; minute < 15 * 60; minute += 5) {
      const hourText = String(Math.floor(minute / 60)).padStart(2, "0");
      const minuteText = String(minute % 60).padStart(2, "0");
      timestampsMs.push(
        ms(`2026-05-${String(day).padStart(2, "0")}T${hourText}:${minuteText}:00+08:00`),
      );
    }
  }
  return timestampsMs;
};

test("trading calendar normalization deduplicates weekdays and merges overlapping sessions", () => {
  assert.deepEqual(
    normalizeTradingCalendarConfig({
      tradingDays: [5, 1, 1, 8, 0],
      sessions: [
        { startMinute: 9 * 60 + 30, endMinute: 11 * 60 + 30, crossesMidnight: false },
        { startMinute: 13 * 60, endMinute: 14 * 60, crossesMidnight: false },
        { startMinute: 13 * 60 + 30, endMinute: 15 * 60, crossesMidnight: false },
      ],
    }),
    {
      tradingDays: [1, 5],
      sessions: [
        { startMinute: 570, endMinute: 690, crossesMidnight: false },
        { startMinute: 780, endMinute: 900, crossesMidnight: false },
      ],
    },
  );
});

test("cross-midnight session membership is assigned to the opening trading day", () => {
  const membership = resolveTradingCalendarMembership(
    ms("2026-05-15T17:30:00.000Z"),
    "Asia/Shanghai",
    NIGHT_SESSION_CALENDAR,
  );

  assert.ok(membership);
  assert.equal(membership.tradingDate, "2026-05-15");
  assert.equal(membership.tradingWeekday, 5);
  assert.equal(membership.localDate, "2026-05-16");
  assert.equal(membership.localWeekday, 6);
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-15T19:00:00.000Z"),
      "Asia/Shanghai",
      NIGHT_SESSION_CALENDAR,
    ),
    false,
  );
});

test("cross-midnight session membership includes the close boundary", () => {
  const membership = resolveTradingCalendarMembership(
    ms("2026-05-15T18:30:00.000Z"),
    "Asia/Shanghai",
    NIGHT_SESSION_CALENDAR,
  );

  assert.ok(membership);
  assert.equal(membership.tradingDate, "2026-05-15");
  assert.equal(membership.localDate, "2026-05-16");
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-15T18:30:00.000Z"),
      "Asia/Shanghai",
      NIGHT_SESSION_CALENDAR,
    ),
    true,
  );
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-15T18:31:00.000Z"),
      "Asia/Shanghai",
      NIGHT_SESSION_CALENDAR,
    ),
    false,
  );
});

test("daily and weekly calendar buckets use the trading day instead of the local calendar date", () => {
  assert.equal(
    new Date(
      getTradingCalendarPeriodStartMs(
        ms("2026-05-15T17:30:00.000Z"),
        "1d",
        "Asia/Shanghai",
        NIGHT_SESSION_CALENDAR,
      ),
    ).toISOString(),
    "2026-05-15T13:00:00.000Z",
  );

  assert.equal(
    new Date(
      getTradingCalendarPeriodStartMs(
        ms("2026-05-15T17:30:00.000Z"),
        "1w",
        "Asia/Shanghai",
        NIGHT_SESSION_CALENDAR,
      ),
    ).toISOString(),
    "2026-05-11T13:00:00.000Z",
  );
});

test("intraday inference returns split weekday sessions from dense samples", () => {
  const timestampsMs = buildShanghaiWeekdayIntradaySamples();

  const suggestion = inferTradingCalendarFromTimestamps({
    timestampsMs,
    timeZone: "Asia/Shanghai",
    baseTimeframe: "5m",
    assetClass: "STOCK",
  });

  assert.equal(suggestion.origin, "DETECTED");
  assert.equal(suggestion.confidence, "HIGH");
  assert.deepEqual(suggestion.calendar.tradingDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(suggestion.calendar.sessions, [
    { startMinute: 570, endMinute: 685, crossesMidnight: false },
    { startMinute: 780, endMinute: 895, crossesMidnight: false },
  ]);
});

test("intraday inference does not return high confidence when samples cover too little of the file set", () => {
  const timestampsMs = buildShanghaiWeekdayIntradaySamples();

  const suggestion = inferTradingCalendarFromTimestamps({
    timestampsMs,
    timeZone: "Asia/Shanghai",
    baseTimeframe: "5m",
    assetClass: "STOCK",
    parseableTimestampRowCount: timestampsMs.length,
    sampledFileCount: 6,
    validFileCount: 405,
  });

  assert.equal(suggestion.origin, "DETECTED");
  assert.equal(suggestion.confidence, "MEDIUM");
  assert.deepEqual(suggestion.calendar.tradingDays, [1, 2, 3, 4, 5]);
});

test("intraday inference returns high confidence when dense samples cover enough files and days", () => {
  const timestampsMs = buildShanghaiWeekdayIntradaySamples();

  const suggestion = inferTradingCalendarFromTimestamps({
    timestampsMs,
    timeZone: "Asia/Shanghai",
    baseTimeframe: "5m",
    assetClass: "STOCK",
    parseableTimestampRowCount: timestampsMs.length,
    sampledFileCount: 5,
    validFileCount: 5,
  });

  assert.equal(suggestion.origin, "DETECTED");
  assert.equal(suggestion.confidence, "HIGH");
  assert.deepEqual(suggestion.calendar.tradingDays, [1, 2, 3, 4, 5]);
});

test("market preset registry covers all built-in calendar definitions", () => {
  assert.deepEqual(Object.keys(MARKET_PRESET_CALENDAR_DEFINITIONS).sort(), [
    "A_SHARE",
    "CRYPTO_SPOT",
    "CRYPTO_USDT_PERP",
    "FOREX_MICRO_LOT",
    "FOREX_STANDARD_LOT",
    "FUTURES_COMMODITY",
    "FUTURES_FINANCIAL",
    "HK_STOCK",
    "JP_STOCK",
    "KR_STOCK",
    "TW_STOCK",
    "US_STOCK",
  ]);
  assert.equal(resolveMarketPresetTimeZone("A_SHARE"), "Asia/Shanghai");
});

test("A-share preset includes minute-bar close boundaries", () => {
  const calendar = MARKET_PRESET_CALENDAR_DEFINITIONS.A_SHARE.calendar;

  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-11T11:30:00+08:00"),
      "Asia/Shanghai",
      calendar,
    ),
    true,
  );
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-11T15:00:00+08:00"),
      "Asia/Shanghai",
      calendar,
    ),
    true,
  );
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-11T15:01:00+08:00"),
      "Asia/Shanghai",
      calendar,
    ),
    false,
  );
});

test("forex presets use the New York 24x5 trading week", () => {
  const calendar = MARKET_PRESET_CALENDAR_DEFINITIONS.FOREX_STANDARD_LOT.calendar;

  assert.equal(resolveMarketPresetTimeZone("FOREX_STANDARD_LOT"), "America/New_York");
  assert.equal(
    resolveDefaultImportTimeZoneByMarketPreset("FOREX_STANDARD_LOT"),
    "America/New_York",
  );
  assert.deepEqual(calendar.tradingDays, [7, 1, 2, 3, 4]);
  assert.deepEqual(calendar.sessions, [
    { startMinute: 17 * 60, endMinute: 16 * 60 + 59, crossesMidnight: true },
  ]);
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-10T17:00:00-04:00"),
      "America/New_York",
      calendar,
    ),
    true,
  );
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-15T16:59:00-04:00"),
      "America/New_York",
      calendar,
    ),
    true,
  );
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-15T17:00:00-04:00"),
      "America/New_York",
      calendar,
    ),
    false,
  );
  assert.equal(
    isTimestampInTradingCalendar(
      ms("2026-05-10T16:59:00-04:00"),
      "America/New_York",
      calendar,
    ),
    false,
  );
});

test("intraday inference uses canonical sessions from a confident market preset", () => {
  const timestampsMs = [
    ms("2026-05-11T09:30:00+08:00"),
    ms("2026-05-11T09:31:00+08:00"),
    ms("2026-05-11T09:32:00+08:00"),
  ];

  const suggestion = inferTradingCalendarFromTimestamps({
    timestampsMs,
    timeZone: "Asia/Shanghai",
    baseTimeframe: "1m",
    assetClass: "STOCK",
    marketPresetId: "A_SHARE",
  });

  assert.equal(suggestion.origin, "PRESET_DEFAULT");
  assert.equal(suggestion.confidence, "HIGH");
  assert.deepEqual(suggestion.calendar.tradingDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(suggestion.calendar.sessions, [
    { startMinute: 570, endMinute: 690, crossesMidnight: false },
    { startMinute: 780, endMinute: 900, crossesMidnight: false },
  ]);
});

test("daily inference keeps preset trading days but uses full-day sessions", () => {
  const suggestion = inferTradingCalendarFromTimestamps({
    timestampsMs: [
      ms("2026-05-11T00:00:00+08:00"),
      ms("2026-05-12T00:00:00+08:00"),
    ],
    timeZone: "Asia/Shanghai",
    baseTimeframe: "1d",
    assetClass: "STOCK",
    marketPresetId: "A_SHARE",
  });

  assert.equal(suggestion.origin, "PRESET_DEFAULT");
  assert.deepEqual(suggestion.calendar.tradingDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(suggestion.calendar.sessions, [
    { startMinute: 0, endMinute: 1440, crossesMidnight: false },
  ]);
});
