// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { Indicator } from "klinecharts";
import {
  resolveIndicatorDisplayPrecision,
  resolveIndicatorValueDisplayPrecision,
} from "../../src/domains/indicators/precision";

test("indicator precision expands tiny MACD-style values", () => {
  assert.equal(
    resolveIndicatorValueDisplayPrecision([-0.0000123, -0.0000201, 0.0000345]),
    6,
  );
});

test("indicator precision keeps oscillator values compact", () => {
  assert.equal(resolveIndicatorValueDisplayPrecision([45.123456, 52.654321, 60.2]), 3);
});

test("indicator precision reads mounted figure result values", () => {
  const indicator = {
    precision: 3,
    figures: [
      { key: "dif" },
      { key: "dea" },
      { key: "macd" },
    ],
    result: [
      { dif: -0.0000123, dea: -0.0000098, macd: -0.000005 },
      { dif: 0.0000345, dea: 0.0000212, macd: 0.0000133 },
    ],
  } as Indicator;

  assert.equal(resolveIndicatorDisplayPrecision(indicator), 6);
});
