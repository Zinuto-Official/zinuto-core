// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
  type BuiltInTradingMarketPresetId,
} from "@zinuto/shared/trading";

const { calculateTradingCostBreakdown } = await import(
  "../../src/domain/trading/feeModel.js"
);

const settingsFor = (
  presetId: BuiltInTradingMarketPresetId,
  overrides: Record<string, unknown> = {},
) => ({
  ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID[presetId],
  ...overrides,
});

const assertCloseTo = (actual: number, expected: number, epsilon = 0.000000001) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

const assertCostBreakdown = (
  actual: ReturnType<typeof calculateTradingCostBreakdown>,
  expected: ReturnType<typeof calculateTradingCostBreakdown>,
) => {
  assertCloseTo(actual.commission, expected.commission);
  assertCloseTo(actual.transferFee, expected.transferFee);
  assertCloseTo(actual.regulatoryFee, expected.regulatoryFee);
  assertCloseTo(actual.platformFee, expected.platformFee);
  assertCloseTo(actual.transactionLevy, expected.transactionLevy);
  assertCloseTo(actual.fee, expected.fee);
  assertCloseTo(actual.tax, expected.tax);
  assertCloseTo(actual.slippage, expected.slippage);
  assertCloseTo(actual.tradingCost, expected.tradingCost);
};

test("A-share stock fees aggregate commission, transfer, regulatory fee, stamp duty, and slippage", () => {
  const actual = calculateTradingCostBreakdown(
    10_000,
    "SELL",
    settingsFor("A_SHARE", {
      slippageRate: 0.01,
    }),
    100,
  );

  assertCostBreakdown(actual, {
    commission: 5,
    transferFee: 0.1,
    regulatoryFee: 0.341,
    platformFee: 0,
    transactionLevy: 0,
    fee: 5.441,
    tax: 5,
    slippage: 1,
    tradingCost: 11.441,
  });
});

test("HK stock applies platform minimum, transaction levy, regulatory fee, double stamp duty, and slippage", () => {
  const actual = calculateTradingCostBreakdown(
    10_000,
    "BUY",
    settingsFor("HK_STOCK", {
      slippageRate: 0.01,
    }),
    200,
  );

  assertCostBreakdown(actual, {
    commission: 3,
    transferFee: 0.015,
    regulatoryFee: 0.565,
    platformFee: 2,
    transactionLevy: 0.27,
    fee: 5.85,
    tax: 10,
    slippage: 1,
    tradingCost: 16.85,
  });
});

test("US stock charges SEC regulatory and activity fees only on sells", () => {
  const buy = calculateTradingCostBreakdown(
    10_000,
    "BUY",
    settingsFor("US_STOCK", {
      slippageRate: 0.01,
    }),
    100,
  );
  assertCostBreakdown(buy, {
    commission: 0,
    transferFee: 0,
    regulatoryFee: 0,
    platformFee: 0,
    transactionLevy: 0,
    fee: 0,
    tax: 0,
    slippage: 1,
    tradingCost: 1,
  });

  const sell = calculateTradingCostBreakdown(
    10_000,
    "SELL",
    settingsFor("US_STOCK", {
      slippageRate: 0.01,
    }),
    100,
  );
  assertCostBreakdown(sell, {
    commission: 0,
    transferFee: 0,
    regulatoryFee: 0.206,
    platformFee: 0,
    transactionLevy: 0.0195,
    fee: 0.2255,
    tax: 0,
    slippage: 1,
    tradingCost: 1.2255,
  });
});

test("futures fees are per-contract exchange and regulatory costs plus percent slippage", () => {
  const actual = calculateTradingCostBreakdown(
    12_000,
    "BUY",
    settingsFor("FUTURES_COMMODITY", {
      slippageRate: 0.008,
    }),
    3,
  );

  assertCostBreakdown(actual, {
    commission: 5.4,
    transferFee: 0,
    regulatoryFee: 0,
    platformFee: 0,
    transactionLevy: 0,
    fee: 5.4,
    tax: 0,
    slippage: 0.96,
    tradingCost: 6.36,
  });
});

test("futures regulatory fee uses its own per-contract rate", () => {
  const actual = calculateTradingCostBreakdown(
    12_000,
    "BUY",
    settingsFor("FUTURES_COMMODITY", {
      slippageRate: 0.008,
      regulatoryFeeRate: 0.3,
    }),
    3,
  );

  assertCostBreakdown(actual, {
    commission: 5.4,
    transferFee: 0,
    regulatoryFee: 0.9,
    platformFee: 0,
    transactionLevy: 0,
    fee: 6.3,
    tax: 0,
    slippage: 0.96,
    tradingCost: 7.26,
  });
});

test("forex uses commission or maker rate plus spread and slippage in cash terms", () => {
  const makerFallback = calculateTradingCostBreakdown(
    200_000,
    "BUY",
    settingsFor("FOREX_STANDARD_LOT", {
      commissionRate: 0,
      slippageRate: 0.001,
    }),
    2,
  );
  assertCostBreakdown(makerFallback, {
    commission: 7,
    transferFee: 0,
    regulatoryFee: 0,
    platformFee: 0,
    transactionLevy: 0,
    fee: 7,
    tax: 0,
    slippage: 14,
    tradingCost: 21,
  });

  const explicitCommission = calculateTradingCostBreakdown(
    200_000,
    "SELL",
    settingsFor("FOREX_STANDARD_LOT", {
      commissionRate: 0.004,
      slippageRate: 0.001,
    }),
    2,
  );
  assertCloseTo(explicitCommission.commission, 8);
  assertCloseTo(explicitCommission.slippage, 14);
  assertCloseTo(explicitCommission.tradingCost, 22);
});

test("crypto spot and perpetuals use taker fee when present, otherwise maker fee, plus slippage", () => {
  const perp = calculateTradingCostBreakdown(
    5_000,
    "SELL",
    settingsFor("CRYPTO_USDT_PERP"),
    0.25,
  );
  assertCostBreakdown(perp, {
    commission: 2.5,
    transferFee: 0,
    regulatoryFee: 0,
    platformFee: 0,
    transactionLevy: 0,
    fee: 2.5,
    tax: 0,
    slippage: 0.75,
    tradingCost: 3.25,
  });

  const makerFallback = calculateTradingCostBreakdown(
    5_000,
    "BUY",
    settingsFor("CRYPTO_SPOT", {
      makerFeeRate: 0.02,
      takerFeeRate: 0,
      slippageRate: 0.015,
    }),
    0.25,
  );
  assertCostBreakdown(makerFallback, {
    commission: 1,
    transferFee: 0,
    regulatoryFee: 0,
    platformFee: 0,
    transactionLevy: 0,
    fee: 1,
    tax: 0,
    slippage: 0.75,
    tradingCost: 1.75,
  });
});
