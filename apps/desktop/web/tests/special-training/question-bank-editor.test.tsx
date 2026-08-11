// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SPECIAL_TRAINING_BANK_EDITOR_STEPS,
  resolveSpecialTrainingBankDefaultName,
} from "../../src/workspaces/special-training/specialTrainingBankEditorModel";
import {
  createPendingSpecialTrainingBankEditorReadModel,
  createSpecialTrainingBankEditorPoolReadinessMap,
} from "../../src/workspaces/special-training/banks/specialTrainingBankEditorReadModel";

const bankManagerRuntimeSource = [
  "specialTrainingBankManagerRuntime.ts",
  "specialTrainingBankEditorActionValues.ts",
  "useSpecialTrainingBankManagerInputs.ts",
]
  .map((fileName) =>
    readFileSync(
      new URL(
        `../../src/workspaces/special-training/banks/${fileName}`,
        import.meta.url,
      ),
      "utf8",
    ),
  )
  .join("\n");

test("bank editor uses the two-step flow", () => {
  assert.deepEqual(SPECIAL_TRAINING_BANK_EDITOR_STEPS, [
    "CONFIG",
    "PREVIEW",
  ]);
});

test("default bank name uses the smallest missing localized index", () => {
  assert.equal(
    resolveSpecialTrainingBankDefaultName({
      language: "zh-CN",
      existingNames: ["题库 1", "题库 3", "自定义题库"],
    }),
    "题库 2",
  );
  assert.equal(
    resolveSpecialTrainingBankDefaultName({
      language: "en",
      existingNames: ["Question bank 1", "Question bank 2"],
    }),
    "Question bank 3",
  );
  assert.equal(
    resolveSpecialTrainingBankDefaultName({
      language: "ko",
      existingNames: [],
    }),
    "문제 은행 1",
  );
});

test("bank editor pending read model is disabled until backend readiness arrives", () => {
  const pending = createPendingSpecialTrainingBankEditorReadModel("CONFIG");

  assert.equal(pending.enabled, false);
  assert.equal(pending.readiness.current.enabled, false);
  assert.equal(pending.facts.step, "CONFIG");
});

test("bank editor pool readiness map consumes backend facts", () => {
  const readModel = createPendingSpecialTrainingBankEditorReadModel("CONFIG");
  readModel.facts.poolReadinessById = {
    "pool-1": {
      disabled: true,
      reasonCode: "TARGET_TIMEFRAME_TOO_LOW",
    },
  };

  const readinessById = createSpecialTrainingBankEditorPoolReadinessMap(readModel);
  assert.equal(readinessById.get("pool-1")?.disabled, true);
  assert.equal(
    readinessById.get("pool-1")?.reasonCode,
    "TARGET_TIMEFRAME_TOO_LOW",
  );
});

test("closed bank editor keeps a stable empty selected-pool dependency", () => {
  assert.match(
    bankManagerRuntimeSource,
    /const EMPTY_BANK_EDITOR_SELECTED_POOL_IDS: string\[\] = \[\];/,
  );
  assert.match(
    bankManagerRuntimeSource,
    /bankEditorDraft\?\.poolIds \?\? EMPTY_BANK_EDITOR_SELECTED_POOL_IDS/,
  );
  assert.doesNotMatch(
    bankManagerRuntimeSource,
    /bankEditorDraft\?\.poolIds \?\? \[\]/,
  );
});

test("bank list failures do not reuse per-question data copy", () => {
  assert.match(
    bankManagerRuntimeSource,
    /const bankListFallbackErrorMessage = useMemo\(\s*\(\) => formatMessage\(language, "trainer\.questionBank\.statusError"\)/u,
  );
  assert.match(
    bankManagerRuntimeSource,
    /setSubmitErrorMessage\(resolveBankApiErrorMessage\(error\)\);/u,
  );
});
