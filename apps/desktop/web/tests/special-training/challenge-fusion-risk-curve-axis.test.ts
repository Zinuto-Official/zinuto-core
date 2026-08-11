// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { resolveRiskCurveAxisExtents } from "../../src/workspaces/challenge-stats/challengeFusionDashboardModel";

test("risk curve comparison x axis follows visible progress instead of a fixed 60 bars", () => {
  const extents = resolveRiskCurveAxisExtents([
    {
      curvePoints: [
        [0, -6],
        [8, -12],
        [20, 3],
      ],
    },
  ]);

  assert.equal(extents.maxX, 20);
  assert.equal(extents.labelDigits, 0);
});

test("risk curve comparison falls back to a compact axis for empty series", () => {
  const extents = resolveRiskCurveAxisExtents([]);

  assert.equal(extents.maxX, 1);
  assert.equal(extents.labelDigits, 0);
});
