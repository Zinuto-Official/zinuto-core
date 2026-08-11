// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import { isTableRowSelectionActivationKey } from "../../src/ui/a11y/tableRowSelection";

test("selectable table rows use Enter and Space without hijacking navigation keys", () => {
  assert.equal(isTableRowSelectionActivationKey("Enter"), true);
  assert.equal(isTableRowSelectionActivationKey(" "), true);
  assert.equal(isTableRowSelectionActivationKey("Tab"), false);
  assert.equal(isTableRowSelectionActivationKey("ArrowDown"), false);
});
