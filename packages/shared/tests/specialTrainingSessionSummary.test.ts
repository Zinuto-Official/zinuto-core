// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveRiskDisciplineSurvived,
  summarizeRiskDisciplineSession,
  type RiskDisciplineSettlementLike,
} from "../dist/domain-calculations/special-training-session-summary.js";

const makeRiskSettlement = (
  overrides: Partial<RiskDisciplineSettlementLike>,
): RiskDisciplineSettlementLike => ({
  passed: false,
  totalPnl: -120,
  finalTotalAsset: 99880,
  alpha: 0,
  usedOperations: 0,
  startIndex: 10,
  settleToIndex: 20,
  tradeActions: [],
  riskReview: null,
  ...overrides,
});

test("risk discipline summary does not count no-op freeze as survived", () => {
  const noOp = makeRiskSettlement({
    passed: true,
    totalPnl: -50,
    finalTotalAsset: 99950,
    alpha: 0,
    usedOperations: 0,
    tradeActions: [],
  });

  assert.equal(resolveRiskDisciplineSurvived(noOp), false);

  const summary = summarizeRiskDisciplineSession([noOp]);
  assert.equal(summary.passCount, 0);
  assert.equal(summary.survivalCount, 0);
  assert.equal(summary.survivalRate, 0);
  assert.equal(summary.behaviorStats.FREEZE.survivalRate, 0);
});

test("risk discipline summary counts effective improved actions as survived", () => {
  const effective = makeRiskSettlement({
    passed: true,
    totalPnl: 80,
    finalTotalAsset: 100080,
    alpha: 0.02,
    usedOperations: 1,
    tradeActions: [{ type: "SELL", barIndex: 12 }],
  });

  const summary = summarizeRiskDisciplineSession([effective]);
  assert.equal(resolveRiskDisciplineSurvived(effective), true);
  assert.equal(summary.passCount, 1);
  assert.equal(summary.survivalRate, 1);
  assert.equal(summary.averageAlpha, 0.02);
});

test("risk discipline summary preserves a first action at bar zero", () => {
  const settlement = makeRiskSettlement({
    passed: true,
    totalPnl: 10,
    finalTotalAsset: 100010,
    usedOperations: 1,
    startIndex: 0,
    settleToIndex: 2,
    tradeActions: [{ type: "SELL", barIndex: 0 }],
  });

  const summary = summarizeRiskDisciplineSession([settlement]);
  assert.equal(summary.behaviorStats.CUT_LOSS.count, 1);
  assert.equal(summary.behaviorStats.CUT_LOSS.averageFirstActionBars, 0);
  assert.equal(summary.behaviorStats.FREEZE.count, 0);
});
