// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { resolveSpecialTrainingQuestionEffectiveTimeframe } from "../../src/workspaces/special-training/domain/specialTrainingTimeframes";
import type { Bar } from "../../src/domains/training/types";

const minuteBars: Bar[] = [
  {
    ts: "2026-01-05T14:30:00.000Z",
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1200,
  },
  {
    ts: "2026-01-05T14:31:00.000Z",
    open: 100.5,
    high: 102,
    low: 100,
    close: 101.5,
    volume: 1300,
  },
];

test("special training question timeframe keeps backend 1h truth over raw 1m bars", () => {
  const timeframe = resolveSpecialTrainingQuestionEffectiveTimeframe({
    question: {
      id: "fast-question-1",
      symbol: "AAPL",
      sourceTimeframe: "1m",
      minimumBaseTimeframe: "1m",
      targetTimeframe: "1h",
      effectiveTimeframe: "1h",
    },
    bars: minuteBars,
  });

  assert.equal(timeframe, "1h");
});

test("special training bank timeframe beats raw bars before bar cadence inference", () => {
  const timeframe = resolveSpecialTrainingQuestionEffectiveTimeframe({
    question: {
      id: "fast-question-2",
      symbol: "AAPL",
      sourceTimeframe: "1m",
      minimumBaseTimeframe: "1m",
    },
    bars: minuteBars,
    fallbackTrainingTimeframe: "1h",
    fallbackBaseTimeframe: "1m",
  });

  assert.equal(timeframe, "1h");
});

test("special training question timeframe still infers from bars when backend metadata is absent", () => {
  const timeframe = resolveSpecialTrainingQuestionEffectiveTimeframe({
    question: null,
    bars: minuteBars,
  });

  assert.equal(timeframe, "1m");
});
