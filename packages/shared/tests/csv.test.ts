// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { composeCsvTimestampText, parseCsvTimestampValue } from "../dist/csv.js";
import { detectBaseTimeframeFromTimestamps } from "../dist/timeframe.js";

test("composeCsvTimestampText replaces zero placeholder time in split datetime columns", () => {
  assert.equal(
    composeCsvTimestampText("2025/3/3 00:00", "14:31:00", "SPLIT"),
    "2025/3/3 14:31:00",
  );
  assert.equal(
    composeCsvTimestampText("2025-03-03 00:00:00", "09:30", "SPLIT"),
    "2025-03-03 09:30:00",
  );
  assert.equal(
    composeCsvTimestampText("2025.3.3 00:00:00", "931", "SPLIT"),
    "2025.3.3 09:31:00",
  );
  assert.equal(
    composeCsvTimestampText("2024.01.01", "930", "SPLIT"),
    "2024.01.01 09:30:00",
  );
});

test("composeCsvTimestampText deduplicates matching split datetime times", () => {
  assert.equal(
    composeCsvTimestampText("2025-03-03 14:31:00", "14:31:00", "SPLIT"),
    "2025-03-03 14:31:00",
  );
  assert.equal(
    parseCsvTimestampValue(
      composeCsvTimestampText("2025-03-03 14:31:00", "14:31:00", "SPLIT"),
      "Asia/Shanghai",
    ) !== null,
    true,
  );
});

test("composeCsvTimestampText keeps conflicting split datetime times invalid", () => {
  const composed = composeCsvTimestampText("2025-03-03 10:00", "14:31:00", "SPLIT");

  assert.equal(composed, "2025-03-03 10:00 14:31:00");
  assert.equal(parseCsvTimestampValue(composed, "Asia/Shanghai"), null);
});

test("composeCsvTimestampText preserves compact split timestamp behavior", () => {
  assert.equal(
    composeCsvTimestampText("20250303", "931", "SPLIT"),
    "20250303093100",
  );
  assert.equal(
    composeCsvTimestampText("2025-03-03T09:30:00Z", "", "SPLIT"),
    "2025-03-03T09:30:00Z",
  );
  assert.equal(
    composeCsvTimestampText("2025-03-03T09:30:00Z", "14:31:00", "SPLIT"),
    "2025-03-03T09:30:00Z 14:31:00",
  );
});

test("parseCsvTimestampValue distinguishes compact dates from epoch timestamps", () => {
  assert.equal(
    parseCsvTimestampValue("20120104", "Asia/Shanghai"),
    Date.parse("2012-01-03T16:00:00.000Z"),
  );
  assert.equal(
    parseCsvTimestampValue("20240311093015", "America/New_York"),
    Date.parse("2024-03-11T13:30:15.000Z"),
  );
  assert.equal(parseCsvTimestampValue("1710153015", "Asia/Shanghai"), 1_710_153_015_000);
  assert.equal(parseCsvTimestampValue("1710153015000", "Asia/Shanghai"), 1_710_153_015_000);
});

test("parseCsvTimestampValue strictly validates calendar and subsecond values", () => {
  assert.equal(parseCsvTimestampValue("2024-02-30 09:30:00", "Etc/UTC"), null);
  assert.equal(parseCsvTimestampValue("2024-01-01 24:00:00", "Etc/UTC"), null);
  assert.equal(
    parseCsvTimestampValue("2024-01-01 09:30:00.123456", "Etc/UTC"),
    Date.parse("2024-01-01T09:30:00.123Z"),
  );
});

test("parseCsvTimestampValue matches execution disambiguation at DST fallback", () => {
  assert.equal(
    parseCsvTimestampValue("2024-11-03 01:30:00", "America/New_York"),
    Date.parse("2024-11-03T06:30:00.000Z"),
  );
});

test("timeframe detection ignores a lone coincidental interval in a larger sample", () => {
  const timestamps = [0, 60_000];
  while (timestamps.length < 96) {
    timestamps.push(timestamps[timestamps.length - 1] + 2 * 24 * 60 * 60 * 1000 + 1_234);
  }

  assert.equal(detectBaseTimeframeFromTimestamps(timestamps), null);
});

test("timeframe detection tolerates a market closure in a short daily sample", () => {
  assert.equal(
    detectBaseTimeframeFromTimestamps([
      Date.parse("2024-01-05T00:00:00.000Z"),
      Date.parse("2024-01-08T00:00:00.000Z"),
      Date.parse("2024-01-09T00:00:00.000Z"),
    ]),
    "1d",
  );
});
