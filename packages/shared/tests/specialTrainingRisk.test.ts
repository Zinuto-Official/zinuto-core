// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRiskDisciplineRuntimeSeed,
  executeSpecialTrainingRiskOrder,
  resolveSpecialTrainingRiskOrderEstimate,
} from "../dist/domain-calculations/special-training-risk.js";

test("risk discipline seed no longer carries a fixed failure asset", () => {
  const seed = buildRiskDisciplineRuntimeSeed({
    bars: [
      { high: 10, low: 9, close: 9.5 },
      { high: 10.5, low: 9.5, close: 10 },
      { high: 11, low: 10, close: 10.5 },
    ],
    startIndex: 2,
    minTradeStep: 1,
  });

  assert.ok(seed);
  assert.equal("failureAsset" in seed, false);
  assert.equal("totalLossFailureRatio" in seed, false);
  assert.equal(seed.challengeStartAsset, seed.cashBalance + seed.currentPositionValue);
});

test("risk trade execution uses the same simplified quantized estimate without fees or slippage", () => {
  const runtime = {
    cashBalance: 1000,
    positionQty: 0,
    entryPrice: Number.NaN,
    usedOperations: 0,
    openCount: 0,
  };
  const estimate = resolveSpecialTrainingRiskOrderEstimate({
    side: "BUY",
    runtime,
    order: {
      inputMode: "RATIO",
      ratioInput: "50",
    },
    currentPrice: 10,
    tradeStep: 10,
  });
  const result = executeSpecialTrainingRiskOrder({
    runtime,
    side: "BUY",
    qty: estimate.qty ?? 0,
    executionPrice: estimate.executionPrice ?? 10,
  });

  assert.equal(estimate.qty, 50);
  assert.equal(estimate.executionPrice, 10);
  assert.equal(estimate.fee, 0);
  assert.equal(result.tradeChanged, true);
  assert.equal(result.estimate.qty, estimate.qty);
  assert.equal(result.estimate.cashEffect, estimate.cashEffect);
  assert.equal(result.runtime.positionQty, 50);
  assert.equal(result.runtime.cashBalance, 500);
});

test("risk trade execution enforces operation and entry limits", () => {
  const runtime = {
    cashBalance: 1000,
    positionQty: 0,
    entryPrice: Number.NaN,
    usedOperations: 1,
    openCount: 1,
  };
  const limitedResult = executeSpecialTrainingRiskOrder({
    runtime,
    side: "BUY",
    qty: 10,
    executionPrice: 10,
    tradeStep: 10,
    maxOperations: 1,
  });
  assert.equal(limitedResult.tradeChanged, false);
  assert.equal(limitedResult.estimate.qty, null);
  assert.equal(limitedResult.runtime.positionQty, 0);

  const entryLimited = executeSpecialTrainingRiskOrder({
    runtime: { ...runtime, usedOperations: 0 },
    side: "BUY",
    qty: 10,
    executionPrice: 10,
    tradeStep: 10,
    maxOperations: 2,
    maxEntries: 1,
  });
  assert.equal(entryLimited.tradeChanged, false);
  assert.equal(entryLimited.estimate.qty, null);

  const allowed = executeSpecialTrainingRiskOrder({
    runtime: { ...runtime, usedOperations: 0, openCount: 0 },
    side: "BUY",
    qty: 10,
    executionPrice: 10,
    tradeStep: 10,
    maxOperations: 2,
    maxEntries: 2,
  });
  assert.equal(allowed.tradeChanged, true);
  assert.equal(allowed.estimate.qty, 10);
  assert.equal(allowed.runtime.positionQty, 10);
  assert.equal(allowed.runtime.usedOperations, 1);
});

test("risk trade execution quantizes against the trade step", () => {
  const runtime = {
    cashBalance: 1000,
    positionQty: 0,
    entryPrice: Number.NaN,
    usedOperations: 0,
    openCount: 0,
  };
  const result = executeSpecialTrainingRiskOrder({
    runtime,
    side: "BUY",
    qty: 23,
    executionPrice: 10,
    tradeStep: 10,
  });
  assert.equal(result.tradeChanged, true);
  assert.equal(result.estimate.qty, 20);
  assert.equal(result.runtime.positionQty, 20);
});

test("risk sell estimate respects min step and never opens a simplified short", () => {
  const closeRuntime = {
    cashBalance: 0,
    positionQty: 95,
    entryPrice: 8,
    usedOperations: 0,
    openCount: 1,
  };
  const closeEstimate = resolveSpecialTrainingRiskOrderEstimate({
    side: "SELL",
    runtime: closeRuntime,
    order: {
      inputMode: "RATIO",
      ratioInput: "50",
    },
    tradeStep: 10,
    currentPrice: 10,
  });
  const closeResult = executeSpecialTrainingRiskOrder({
    runtime: closeRuntime,
    side: "SELL",
    qty: closeEstimate.qty ?? 0,
    executionPrice: closeEstimate.executionPrice ?? 10,
  });
  assert.equal(closeResult.estimate.qty, 40);
  assert.equal(closeResult.estimate.cashEffect, 400);
  assert.equal(closeResult.estimate.fee, 0);
  assert.equal(closeResult.runtime.positionQty, 55);
  assert.equal(closeResult.runtime.cashBalance, 400);

  const flatRuntime = {
    cashBalance: 1000,
    positionQty: 0,
    entryPrice: Number.NaN,
    usedOperations: 0,
    openCount: 0,
  };
  assert.equal(
    resolveSpecialTrainingRiskOrderEstimate({
      side: "SELL",
      runtime: flatRuntime,
      order: {
        inputMode: "RATIO",
        ratioInput: "100",
      },
      currentPrice: 10,
      tradeStep: 10,
    }).qty,
    null,
  );

  const shortResult = executeSpecialTrainingRiskOrder({
    runtime: flatRuntime,
    side: "SELL",
    qty: 0,
    executionPrice: 10,
  });
  assert.equal(shortResult.tradeChanged, false);
  assert.equal(shortResult.estimate.qty, null);
  assert.equal(shortResult.runtime.positionQty, 0);
  assert.equal(shortResult.runtime.cashBalance, 1000);
});
