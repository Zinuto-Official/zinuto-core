// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatReplayRatioMultiplier,
  resolveReplayProfitFactorTone,
} from "../../src/workspaces/history/history-console/replayRatioPresentation";

test("replay ratio presentation distinguishes finite, infinite, and unavailable", () => {
  assert.equal(
    formatReplayRatioMultiplier(1.2345, "FINITE", "N/A"),
    "1.23x",
  );
  assert.equal(
    formatReplayRatioMultiplier(null, "POSITIVE_INFINITY", "N/A"),
    "∞",
  );
  assert.equal(
    formatReplayRatioMultiplier(null, "NOT_AVAILABLE", "N/A"),
    "N/A",
  );
  assert.equal(formatReplayRatioMultiplier(null, "FINITE", "N/A"), "N/A");

  assert.equal(resolveReplayProfitFactorTone(1.2, "FINITE"), "up");
  assert.equal(resolveReplayProfitFactorTone(0.8, "FINITE"), "down");
  assert.equal(
    resolveReplayProfitFactorTone(null, "POSITIVE_INFINITY"),
    "up",
  );
  assert.equal(resolveReplayProfitFactorTone(null, "NOT_AVAILABLE"), "flat");
});

test("replay report surfaces consume ratio state without a 9.99 display cap", () => {
  const source = [
    "../../src/workspaces/history/history-console/ReplayReviewConsoleHelpers.tsx",
    "../../src/workspaces/history/history-console/ReplayReviewConsolePresentation.tsx",
    "../../src/workspaces/history/history-console/ReplayReviewConsoleWorkspace.tsx",
    "../../src/workspaces/history/history-console/ReplayReviewTrendCard.tsx",
    "../../src/workspaces/history/history-console/useReplayReviewArchiveRows.ts",
  ]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");

  assert.match(source, /profitFactorState/);
  assert.match(source, /sessionProfitFactorState/);
  assert.match(source, /profitLossRatioState/);
  assert.doesNotMatch(source, /PROFIT_FACTOR_DISPLAY_CAP|Math\.min\([^)]*9\.99/);
});
