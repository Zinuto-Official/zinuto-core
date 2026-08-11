// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { INPUT_ARRAY_LIMITS, INPUT_LIMITS } from "@zinuto/shared/input-limits";

import { buildSystemSettingsTabItems } from "../../src/workspaces/settings/settings/SystemSettingsTabs";

test("system settings exposes only local product tabs", () => {
  const tabItems = buildSystemSettingsTabItems((key) => key);

  assert.deepEqual(
    tabItems.map((item) => item.key),
    ["GENERAL", "DATA_TRANSFER", "SIMULATION", "ABOUT", "ADVANCED"],
  );
});

test("removed usage-feedback payload limits stay absent from the public contract", () => {
  assert.equal("feedbackDescriptionChars" in INPUT_LIMITS, false);
  assert.equal("feedbackEmailSubjectChars" in INPUT_LIMITS, false);
  assert.equal("feedbackEmailBodyChars" in INPUT_LIMITS, false);
  assert.equal("feedbackDiagnosticEvents" in INPUT_ARRAY_LIMITS, false);
});
