// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCalendarSpanText,
  formatReplaySpanText,
} from "../../src/domains/trainer/replaySpanDisplay";

const labels = {
  empty: "--",
  minute: "m",
  hour: "h",
  day: "d",
};

test("calendar span for daily bars ignores market-time DST offset shifts", () => {
  assert.equal(
    formatCalendarSpanText({
      startTimestamp: "2006-09-08T20:00:00.000Z",
      endTimestamp: "2006-11-16T21:00:00.000Z",
      baseTimeframe: "1d",
      timeZone: "America/New_York",
      labels,
    }),
    "70d",
  );
});

test("calendar span still preserves intraday elapsed wall time", () => {
  assert.equal(
    formatCalendarSpanText({
      startTimestamp: "2025-01-02T14:30:00.000Z",
      endTimestamp: "2025-01-02T15:30:00.000Z",
      baseTimeframe: "1h",
      timeZone: "America/New_York",
      labels,
    }),
    "2h",
  );
});

test("replay span keeps bar-count duration formatting", () => {
  assert.equal(
    formatReplaySpanText({
      durationMs: 3 * 60 * 60 * 1000,
      minimumMs: 60 * 60 * 1000,
      labels,
    }),
    "3h",
  );
});
