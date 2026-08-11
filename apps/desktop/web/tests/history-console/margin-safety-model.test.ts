// SPDX-License-Identifier: GPL-3.0-only

import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_MARGIN_SAFETY_VIEW_MODEL,
  type MarginSafetyViewModel,
} from "../../src/workspaces/history/history-console/marginSafetyModel";

test("margin safety model is a backend-provided view model in desktop web", () => {
  const backendViewModel: MarginSafetyViewModel = {
    dangerSessionShare: 3 / 5,
    dangerSessionCount: 3,
    minSafetyBufferRate: -0.02,
    breachSessionCount: 1,
    sessionSafetyPoints: [
      {
        sessionId: "session-0",
        sequenceIndex: 0,
        sequenceText: "#1",
        symbol: "BTCUSDT",
        minBufferRate: 0.42,
        peakPressureRate: 0.58,
        zone: "SAFE",
        isRepresentative: false,
      },
      {
        sessionId: "session-3",
        sequenceIndex: 3,
        sequenceText: "#4",
        symbol: "BTCUSDT",
        minBufferRate: -0.02,
        peakPressureRate: 1.02,
        zone: "BREACH",
        isRepresentative: true,
      },
    ],
    zoneSummaries: [
      { zone: "BREACH", count: 1, share: 1 / 5 },
      { zone: "DANGER", count: 2, share: 2 / 5 },
      { zone: "CROWDED", count: 1, share: 1 / 5 },
      { zone: "SAFE", count: 1, share: 1 / 5 },
    ],
    worstSessionPoints: [
      {
        sessionId: "session-3",
        sequenceIndex: 3,
        sequenceText: "#4",
        symbol: "BTCUSDT",
        minBufferRate: -0.02,
        peakPressureRate: 1.02,
        zone: "BREACH",
        isRepresentative: true,
      },
    ],
    focusWindow: {
      isDense: false,
      startIndex: 0,
      endIndex: 1,
      startPercent: 0,
      endPercent: 100,
    },
  };

  assert.equal(backendViewModel.breachSessionCount, 1);
  assert.equal(backendViewModel.zoneSummaries[0]?.zone, "BREACH");
  assert.equal(EMPTY_MARGIN_SAFETY_VIEW_MODEL.sessionSafetyPoints.length, 0);
});
