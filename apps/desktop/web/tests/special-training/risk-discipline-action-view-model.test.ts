// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { ApiSpecialTrainingRiskActionState } from "../../src/api/specialTraining";
import { buildRiskDisciplineActionViewModel } from "../../src/workspaces/special-training/view-models/specialTrainingRiskDisciplineActionViewModel";

const baseInput = {
  riskRuntimeActionState: null,
  resolveRiskActionBlockedReasonText: (
    code: string | null,
    fallbackReason?: string | null,
  ) => fallbackReason ?? code,
  tt: (key: string) => key,
  nextBarLabel: "Next",
};

test("risk action view model waits for backend action state without inventing a reason", () => {
  const viewModel = buildRiskDisciplineActionViewModel(baseInput);

  assert.equal(viewModel.buyAndAdvanceDisabled, true);
  assert.equal(viewModel.riskBuyAdvanceActionState.blockedReasonCode, null);
  assert.equal(viewModel.riskBuyAdvanceActionState.blockedReason, null);
});

test("risk action view model uses backend action state over local cash and cursor facts", () => {
  const actionState: ApiSpecialTrainingRiskActionState = {
    buyAdvance: {
      allowed: false,
      blockedReasonCode: "BUYING_POWER_EMPTY",
      blockedReason: "server buying power",
    },
    sellAdvance: {
      allowed: false,
      blockedReasonCode: "POSITION_EMPTY",
      blockedReason: "server position empty",
    },
    nextBar: {
      allowed: true,
      blockedReasonCode: null,
      blockedReason: null,
    },
    undo: {
      allowed: false,
      blockedReasonCode: "UNDO_EMPTY",
      blockedReason: "server undo empty",
      availableSteps: 0,
      maxSteps: 5,
      lastUndoableAction: null,
    },
  };

  const viewModel = buildRiskDisciplineActionViewModel({
    ...baseInput,
    riskRuntimeActionState: actionState,
  });

  assert.equal(viewModel.buyAndAdvanceDisabled, true);
  assert.equal(
    viewModel.riskBuyAdvanceActionState.blockedReasonCode,
    "BUYING_POWER_EMPTY",
  );
  assert.equal(viewModel.riskBuyAdvanceActionState.blockedReason, "server buying power");
  assert.equal(viewModel.nextBarDisabled, false);
});
