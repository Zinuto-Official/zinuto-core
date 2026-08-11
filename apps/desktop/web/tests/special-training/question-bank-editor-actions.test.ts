// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  SPECIAL_TRAINING_BANK_EDITOR_BACK_ACTION_VARIANT,
  SPECIAL_TRAINING_BANK_EDITOR_CANCEL_ACTION_VARIANT,
  SPECIAL_TRAINING_BANK_EDITOR_PRIMARY_ACTION_VARIANT,
  readSpecialTrainingBankEditorPrimaryCta,
} from "../../src/workspaces/special-training/specialTrainingBankUi";

test("bank editor keeps save as the primary CTA on preview", () => {
  const primaryAction = readSpecialTrainingBankEditorPrimaryCta({
    canSave: true,
    nextDisabled: false,
    saveDisabled: true,
  });

  assert.equal(primaryAction.kind, "SAVE");
  assert.equal(primaryAction.disabled, true);
  assert.equal(primaryAction.variant, SPECIAL_TRAINING_BANK_EDITOR_PRIMARY_ACTION_VARIANT);
  assert.equal(SPECIAL_TRAINING_BANK_EDITOR_BACK_ACTION_VARIANT, "outline");
  assert.equal(SPECIAL_TRAINING_BANK_EDITOR_CANCEL_ACTION_VARIANT, "ghost");
});

test("bank editor keeps next as the primary CTA before preview", () => {
  const primaryAction = readSpecialTrainingBankEditorPrimaryCta({
    canSave: false,
    nextDisabled: true,
    saveDisabled: false,
  });

  assert.equal(primaryAction.kind, "NEXT");
  assert.equal(primaryAction.disabled, true);
  assert.equal(primaryAction.variant, SPECIAL_TRAINING_BANK_EDITOR_PRIMARY_ACTION_VARIANT);
});
