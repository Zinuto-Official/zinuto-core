// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { SpecialTrainingDurationEstimateState } from "../../src/workspaces/special-training/domain/specialTrainingTypes";
import { buildPendingDurationEstimateState } from "../../src/workspaces/special-training/session/specialTrainingDurationEstimateState";
import { resolveModePickerDurationEstimateViewModel } from "../../src/workspaces/special-training/view-models/specialTrainingModePickerPanelsViewModel";

const previousEstimate = {
  minMinutes: 4,
  maxMinutes: 7,
  basis: "FORMULA_FALLBACK" as const,
  sampleCount: 0,
};

const buildDurationEstimateState = (
  patch: Partial<SpecialTrainingDurationEstimateState> = {},
): SpecialTrainingDurationEstimateState => ({
  signature: "fast-decision-training|HUMAN|5|40|45",
  estimate: previousEstimate,
  loading: false,
  error: false,
  ...patch,
});

test("duration estimate keeps the last visible range while a new option estimate is pending", () => {
  const viewModel = resolveModePickerDurationEstimateViewModel({
    language: "zh-CN",
    activeDurationEstimateSignature:
      "fast-decision-training|HUMAN|10|40|45",
    durationEstimateState: buildDurationEstimateState(),
  });

  assert.equal(viewModel.estimatedDurationText, "约 4-7 分钟");
});

test("pending duration estimate state preserves the previous visible estimate", () => {
  const pendingState = buildPendingDurationEstimateState(
    buildDurationEstimateState(),
    "fast-decision-training|HUMAN|10|40|45",
  );

  assert.equal(pendingState.signature, "fast-decision-training|HUMAN|10|40|45");
  assert.equal(pendingState.estimate, previousEstimate);
  assert.equal(pendingState.loading, true);
  assert.equal(pendingState.error, false);
});

test("duration estimate still shows loading when no previous estimate exists", () => {
  const viewModel = resolveModePickerDurationEstimateViewModel({
    language: "zh-CN",
    activeDurationEstimateSignature:
      "fast-decision-training|HUMAN|10|40|45",
    durationEstimateState: buildDurationEstimateState({
      signature: "",
      estimate: null,
      loading: false,
    }),
  });

  assert.equal(viewModel.estimatedDurationText, "正在估算预计耗时");
});
