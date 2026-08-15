// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { parseThemeTransitionDuration } from "../../src/ui/theme/themeTransition";

test("theme reveal duration accepts CSS time tokens only", () => {
  assert.equal(parseThemeTransitionDuration("480ms"), 480);
  assert.equal(parseThemeTransitionDuration("0.48s"), 480);
  assert.equal(parseThemeTransitionDuration(".48s"), 480);
  assert.equal(parseThemeTransitionDuration("none"), null);
});
