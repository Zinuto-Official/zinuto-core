// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type { ApiFreeReplayEnvironmentRuleCard } from "../../src/api";
import { toFreeReplayEnvironmentRuleCardDisplays } from "../../src/domains/trainer/freeReplayEnvironmentRuleCardDisplay";
import { getTradingSettingsText } from "../../src/ui/config/uiConfig";

const aShareRuleCards: ApiFreeReplayEnvironmentRuleCard[] = [
  { id: "settlement", valueKind: "TRADE_SETTLEMENT_MODE", value: "T1" },
  { id: "direction", valueKind: "DIRECTION", value: "LONG_ONLY" },
  { id: "longPermission", valueKind: "LONG_MARGIN_PERMISSION", value: "DISALLOW" },
  { id: "minTradeStep", valueKind: "MIN_TRADE_STEP", value: "100" },
  { id: "commissionRate", valueKind: "TEXT", value: "0.03%" },
  { id: "commissionMinimumFee", valueKind: "TEXT", value: "5" },
  { id: "platformFeeRate", valueKind: "TEXT", value: "0%" },
  { id: "platformFeeMinimumFee", valueKind: "TEXT", value: "0" },
  { id: "transactionLevyRate", valueKind: "TEXT", value: "0%" },
  { id: "transactionLevyMinimumFee", valueKind: "TEXT", value: "0" },
  { id: "transferFeeRate", valueKind: "TEXT", value: "0.001%" },
  { id: "regulatoryFeeRate", valueKind: "TEXT", value: "0.00341%" },
  { id: "stampDutyRate", valueKind: "TEXT", value: "0.05%" },
  { id: "stampDutyMode", valueKind: "STAMP_DUTY_MODE", value: "SELL" },
  { id: "slippageRate", valueKind: "TEXT", value: "0.01%" },
];

test("free replay environment displays backend A-share rule card facts", () => {
  const tradingSettingsText = getTradingSettingsText("zh-CN");
  const cards = toFreeReplayEnvironmentRuleCardDisplays(
    aShareRuleCards,
    "STOCK",
    tradingSettingsText,
  );

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
  assert.equal(cards[0]?.value, "T+1");
  assert.equal(cards[1]?.value, "仅做多");
  assert.equal(cards[2]?.value, "关闭");
  assert.equal(cards[3]?.value, "100 股");
  assert.equal(
    cards.find((card) => card.id === "commissionRate")?.value,
    "0.03%",
  );
  assert.equal(
    cards.find((card) => card.id === "stampDutyRate")?.value,
    "0.05%",
  );
  assert.equal(
    cards.find((card) => card.id === "stampDutyMode")?.value,
    "卖出收税",
  );
});

test("free replay environment display keeps backend crypto bilateral facts", () => {
  const tradingSettingsText = getTradingSettingsText("en");
  const cards = toFreeReplayEnvironmentRuleCardDisplays(
    [
      { id: "settlement", valueKind: "TRADE_SETTLEMENT_MODE", value: "T0" },
      { id: "direction", valueKind: "DIRECTION", value: "BOTH" },
      { id: "longPermission", valueKind: "LONG_MARGIN_PERMISSION", value: "ALLOW" },
      { id: "minTradeStep", valueKind: "MIN_TRADE_STEP", value: "0.001" },
      { id: "makerFeeRate", valueKind: "TEXT", value: "0.02%" },
      { id: "takerFeeRate", valueKind: "TEXT", value: "0.05%" },
      { id: "fundingRate", valueKind: "TEXT", value: "0.01%" },
      { id: "slippageRate", valueKind: "TEXT", value: "0.015%" },
      { id: "contractMultiplier", valueKind: "TEXT", value: "1" },
      { id: "longInitialMargin", valueKind: "TEXT", value: "10%" },
      { id: "longMaintenanceMargin", valueKind: "TEXT", value: "5%" },
      { id: "longFinancing", valueKind: "TEXT", value: "0%" },
      { id: "shortInitialMargin", valueKind: "TEXT", value: "10%" },
      { id: "shortMaintenanceMargin", valueKind: "TEXT", value: "5%" },
      { id: "shortBorrow", valueKind: "TEXT", value: "0%" },
    ],
    "CRYPTO",
    tradingSettingsText,
  );

  assert.equal(cards[0]?.value, "T+0");
  assert.equal(
    cards[1]?.value,
    tradingSettingsText.importRuleSummaryDirectionLabels.BOTH,
  );
  assert.equal(
    cards.find((card) => card.id === "minTradeStep")?.value,
    `0.001 ${tradingSettingsText.minTradeStepUnitPlaceholderByAssetClass.CRYPTO}`,
  );
  assert.equal(
    cards.find((card) => card.id === "fundingRate")?.label,
    tradingSettingsText.fundingRateLabelByAssetClass.CRYPTO,
  );
  assert.equal(cards.find((card) => card.id === "fundingRate")?.value, "0.01%");
  assert.equal(
    cards.find((card) => card.id === "shortInitialMargin")?.value,
    "10%",
  );
});
