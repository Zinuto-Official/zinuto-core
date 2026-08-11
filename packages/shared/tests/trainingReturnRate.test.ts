// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveUnifiedReturnRate,
} from "../dist/domain-calculations/training-return-rate.js";

test("training return rate uses total pnl over initial total first", () => {
  assert.equal(
    resolveUnifiedReturnRate(200, 25, 0.5, 0.4, 0.3),
    0.125,
  );
});

test("training return rate falls back through stored rate priorities", () => {
  assert.equal(
    resolveUnifiedReturnRate(0, 25, 0.5, 0.4, 0.3),
    0.5,
  );
  assert.equal(
    resolveUnifiedReturnRate(0, 25, Number.NaN, 0.4, 0.3),
    0.4,
  );
  assert.equal(
    resolveUnifiedReturnRate(0, 25, Number.NaN, Number.NaN, 0.3),
    0.3,
  );
});

test("training return rate falls back to zero when no finite rate exists", () => {
  assert.equal(
    resolveUnifiedReturnRate(0, 25, Number.NaN, Number.NaN, Number.NaN),
    0,
  );
});
