// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseThemeTransitionDuration,
  resolveThemeRevealGeometry,
} from "../../src/ui/theme/themeTransition";

test("theme reveal starts at the page center and covers each corner", () => {
  const geometry = resolveThemeRevealGeometry({ width: 1280, height: 720 });

  assert.equal(geometry.centerX, 640);
  assert.equal(geometry.centerY, 360);
  assert.ok(geometry.radius > Math.hypot(640, 360));
});

test("theme reveal duration accepts CSS time tokens only", () => {
  assert.equal(parseThemeTransitionDuration("480ms"), 480);
  assert.equal(parseThemeTransitionDuration("0.48s"), 480);
  assert.equal(parseThemeTransitionDuration(".48s"), 480);
  assert.equal(parseThemeTransitionDuration("none"), null);
});
