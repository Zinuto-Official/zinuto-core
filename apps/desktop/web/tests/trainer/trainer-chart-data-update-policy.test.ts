// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTrainerChartDataUpdateDecision,
} from "../../src/app-shell/trainerChartDataUpdatePolicy";

const bar = (
  timestamp: number,
  close: number,
  symbol = "AAPL",
) => ({
  timestamp,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume: close * 100,
  symbol,
});

const policyInput = (overrides: Partial<Parameters<typeof resolveTrainerChartDataUpdateDecision>[0]> = {}) => ({
  previousData: [bar(1, 10), bar(2, 11)],
  nextData: [bar(1, 10), bar(2, 11)],
  previousRenderSignature: "1d|session-1|first|AAPL",
  nextRenderSignature: "1d|session-1|first|AAPL",
  previousSessionId: "session-1",
  nextSessionId: "session-1",
  realtimeSubscriberAvailable: false,
  ...overrides,
});

test("chart data policy ignores marker-only updates when the kline window is unchanged", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(policyInput()),
    {
      action: "none",
      reason: "same-data",
    },
  );
});

test("chart data policy streams appended bars when realtime subscriber is available", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(
      policyInput({
        nextData: [bar(1, 10), bar(2, 11), bar(3, 12)],
        realtimeSubscriberAvailable: true,
      }),
    ),
    {
      action: "realtime",
      reason: "append",
      updateStartIndex: 2,
    },
  );
});

test("chart data policy streams the last bar update from the realtime boundary", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(
      policyInput({
        nextData: [bar(1, 10), bar(2, 12)],
        realtimeSubscriberAvailable: true,
      }),
    ),
    {
      action: "realtime",
      reason: "last-bar-change",
      updateStartIndex: 1,
    },
  );
});

test("chart data policy resets when the render signature changes", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(
      policyInput({
        nextRenderSignature: "1d|session-1|new-first|AAPL",
        realtimeSubscriberAvailable: true,
      }),
    ),
    {
      action: "reset",
      reason: "render-signature-changed",
    },
  );
});

test("chart data policy streams fast decision reveal appends across render signature changes when allowed", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(
      policyInput({
        nextData: [bar(1, 10), bar(2, 11), bar(3, 12)],
        previousRenderSignature:
          "1d|special-training:q1|start:100|AAPL",
        nextRenderSignature:
          "1d|special-training:q1|start:100:cursor:102|AAPL",
        realtimeSubscriberAvailable: true,
        allowRealtimeWhenRenderSignatureChanges: true,
      }),
    ),
    {
      action: "realtime",
      reason: "append",
      updateStartIndex: 2,
    },
  );
});

test("chart data policy resets when the session changes", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(
      policyInput({
        nextSessionId: "session-2",
        nextRenderSignature: "1d|session-2|first|AAPL",
        realtimeSubscriberAvailable: true,
      }),
    ),
    {
      action: "reset",
      reason: "session-switched",
    },
  );
});

test("chart data policy resets when the visible data window shrinks", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(
      policyInput({
        nextData: [bar(1, 10)],
        realtimeSubscriberAvailable: true,
      }),
    ),
    {
      action: "reset",
      reason: "window-shortened",
    },
  );
});

test("chart data policy resets changed data when realtime subscriber is unavailable", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(
      policyInput({
        nextData: [bar(1, 10), bar(2, 12)],
      }),
    ),
    {
      action: "reset",
      reason: "data-changed-without-realtime-subscriber",
    },
  );
});

test("chart data policy still detects prefix changes when the endpoints match", () => {
  assert.deepEqual(
    resolveTrainerChartDataUpdateDecision(
      policyInput({
        previousData: [bar(1, 10), bar(2, 11), bar(3, 12)],
        nextData: [bar(1, 10), bar(2, 99), bar(3, 12)],
        realtimeSubscriberAvailable: true,
      }),
    ),
    {
      action: "reset",
      reason: "prefix-changed",
    },
  );
});
