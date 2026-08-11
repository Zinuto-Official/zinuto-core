// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFreeReplayEnvironmentRuleCardFacts,
} from "../../src/application/trading/freeReplayPrepReadModel.js";

test("free replay prep read model exposes A-share environment rule facts", () => {
  const cards = buildFreeReplayEnvironmentRuleCardFacts({
    assetClass: "STOCK",
    marketPresetId: "A_SHARE",
  });

  assert.deepEqual(cards.map((card) => card.id), [
    "settlement",
    "direction",
    "longPermission",
    "minTradeStep",
    "commissionRate",
    "commissionMinimumFee",
    "platformFeeRate",
    "platformFeeMinimumFee",
    "transactionLevyRate",
    "transactionLevyMinimumFee",
    "transferFeeRate",
    "regulatoryFeeRate",
    "stampDutyRate",
    "stampDutyMode",
    "slippageRate",
  ]);
  assert.deepEqual(cards.slice(0, 4), [
    { id: "settlement", valueKind: "TRADE_SETTLEMENT_MODE", value: "T1" },
    { id: "direction", valueKind: "DIRECTION", value: "LONG_ONLY" },
    { id: "longPermission", valueKind: "LONG_MARGIN_PERMISSION", value: "DISALLOW" },
    { id: "minTradeStep", valueKind: "MIN_TRADE_STEP", value: "100" },
  ]);
  assert.equal(
    cards.find((card) => card.id === "commissionRate")?.value,
    "0.03%",
  );
  assert.equal(
    cards.find((card) => card.id === "transferFeeRate")?.value,
    "0.001%",
  );
  assert.equal(
    cards.find((card) => card.id === "stampDutyMode")?.value,
    "SELL",
  );
});

test("free replay prep read model exposes crypto bilateral environment facts", () => {
  const cards = buildFreeReplayEnvironmentRuleCardFacts({
    assetClass: "CRYPTO",
    marketPresetId: "CRYPTO_USDT_PERP",
  });

  assert.deepEqual(cards.map((card) => card.id), [
    "settlement",
    "direction",
    "longPermission",
    "minTradeStep",
    "makerFeeRate",
    "takerFeeRate",
    "fundingRate",
    "slippageRate",
    "contractMultiplier",
    "longInitialMargin",
    "longMaintenanceMargin",
    "longFinancing",
    "shortInitialMargin",
    "shortMaintenanceMargin",
    "shortBorrow",
  ]);
  assert.deepEqual(cards.slice(0, 4), [
    { id: "settlement", valueKind: "TRADE_SETTLEMENT_MODE", value: "T0" },
    { id: "direction", valueKind: "DIRECTION", value: "BOTH" },
    { id: "longPermission", valueKind: "LONG_MARGIN_PERMISSION", value: "ALLOW" },
    { id: "minTradeStep", valueKind: "MIN_TRADE_STEP", value: "0.001" },
  ]);
  assert.equal(cards.find((card) => card.id === "makerFeeRate")?.value, "0.02%");
  assert.equal(cards.find((card) => card.id === "fundingRate")?.value, "0.01%");
  assert.equal(cards.find((card) => card.id === "shortInitialMargin")?.value, "10%");
});
