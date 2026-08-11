// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { formatMessage } from "../dist/i18n.js";

test("formatMessage does not throw when a required named value is missing", () => {
  assert.equal(
    formatMessage("en", "settings.general.globalFont.description", {}),
    "Global Font: {value}",
  );
});

test("formatMessage still renders normally when values are present", () => {
  assert.equal(
    formatMessage("en", "settings.general.globalFont.description", {
      value: "Standard",
    }),
    "Global Font: Standard",
  );
});
