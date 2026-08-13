// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { discoverTrackedTests } from "./run-tracked-js-tests.mjs";

test("every tracked test belongs to exactly one execution suite", () => {
  const { suites, unclassified } = discoverTrackedTests();
  assert.deepEqual(unclassified, []);
  assert.equal(suites.governance.includes("tools/quality/run-quality-for-impact.test.mjs"), true);
  assert.equal(suites.governance.includes("tools/release/validate-native-runtime.test.mjs"), true);
  assert.equal(suites.shared.includes("packages/shared/tests/marketTimestampParsing.test.ts"), true);
  assert.equal(
    suites["web-unit"].includes(
      "apps/desktop/web/tests/challenge-stats/challenge-stats-read-model-facts.test.ts",
    ),
    true,
  );
  assert.equal(suites["web-browser"].length, 5);
  assert.equal(suites["rust-integration"].includes("apps/desktop/backtest-engine/tests/golden.rs"), true);
  assert.equal(suites["rust-integration"].includes("apps/desktop/shell/tests/hs_core_017.rs"), true);
  assert.equal(suites["rust-integration"].includes("apps/desktop/shell/tests/hs_core_019.rs"), true);
});
