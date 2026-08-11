// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { formatTrainerTradingQuantityText } from "../../src/domains/trainer/trainerTradingAssetUi";
import { resolveTrainerTradingCapacityDisplay } from "../../src/domains/trainer/trainerTradingCapacityDisplay";
import type { TradeCapacitySummary } from "../../src/domains/training/types";

const buildTradeCapacity = (
  buyQuantity: number,
  sellQuantity: number,
  sellKind: TradeCapacitySummary["ratioBases"]["sell"]["kind"] = "SHORT_OPEN_CAPACITY",
): TradeCapacitySummary => ({
  availableCash: 0,
  longBuyingPowerQty: buyQuantity,
  longBuyingPowerAmount: buyQuantity * 10,
  longFinancingAmount: buyQuantity * 4,
  shortOpenCapacityQty: sellQuantity,
  shortOpenCapacityAmount: sellQuantity * 10,
  ratioBases: {
    buy: {
      kind: "LONG_BUYING_POWER",
      quantity: buyQuantity,
      amount: 0,
    },
    sell: {
      kind: sellKind,
      quantity: sellQuantity,
      amount: 0,
    },
  },
});

test("forex quantity formatter shows lots together with contract-size units", () => {
  assert.equal(
    formatTrainerTradingQuantityText({
      language: "zh-CN",
      quantity: 0.01,
      tradeStep: 0.01,
      secondaryQuantityMultiplier: 100000,
      lotStepUnitLabel: "手",
      tradeQtyUnit: "单位",
      secondaryTradeQtyUnit: "单位",
      displayMode: "LOTS_AND_QTY",
    }),
    "1手/1000单位",
  );
});

test("quantity formatter can hide secondary quantity units for compact execution text", () => {
  assert.equal(
    formatTrainerTradingQuantityText({
      language: "zh-CN",
      quantity: 427,
      tradeStep: 1,
      lotStepUnitLabel: "手",
      tradeQtyUnit: "股",
      secondaryTradeQtyUnit: "股",
      displayMode: "LOTS_AND_QTY",
      includeSecondaryQuantity: false,
    }),
    "427手",
  );
});

test("capacity display hides margin and short-open capacity when those rules are disabled", () => {
  const tt = (key: string) => key;
  const formatMoney = (value: number, digits = 0) => `${value.toFixed(digits)} CNY`;
  const formatQuantity = (quantity: number) => `${quantity} shares`;

  const disabled = resolveTrainerTradingCapacityDisplay({
    assetClass: "STOCK",
    allowLongMarginTrading: false,
    allowShortSelling: false,
    tradeCapacity: buildTradeCapacity(200, 100, "CLOSE_LONG"),
    formatMoney,
    formatTradingQuantityText: formatQuantity,
    tt,
  });

  assert.equal(disabled.long.label, "appText.longOpenCapacity");
  assert.equal(disabled.long.value, "2000 CNY");
  assert.equal(disabled.long.showsMarginCapacity, false);
  assert.equal(disabled.short.label, "appText.sellableHolding");
  assert.equal(disabled.short.value, "100 shares");
  assert.equal(disabled.short.showsShortOpenCapacity, false);

  const noSellableHolding = resolveTrainerTradingCapacityDisplay({
    assetClass: "STOCK",
    allowLongMarginTrading: false,
    allowShortSelling: false,
    tradeCapacity: buildTradeCapacity(200, 0),
    formatMoney,
    formatTradingQuantityText: formatQuantity,
    tt,
  });

  assert.equal(noSellableHolding.short.label, "appText.sellablePosition");
  assert.equal(noSellableHolding.short.value, "0 shares");

  const enabled = resolveTrainerTradingCapacityDisplay({
    assetClass: "STOCK",
    allowLongMarginTrading: true,
    allowShortSelling: true,
    tradeCapacity: buildTradeCapacity(200, 100),
    formatMoney,
    formatTradingQuantityText: formatQuantity,
    tt,
  });

  assert.equal(enabled.long.label, "appText.longBuyingPower");
  assert.equal(enabled.long.value, "800 CNY");
  assert.equal(enabled.short.label, "appText.shortSellCapacity");
  assert.equal(enabled.short.value, "100 shares");
});
