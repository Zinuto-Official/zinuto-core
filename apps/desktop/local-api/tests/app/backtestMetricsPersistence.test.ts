// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID,
} from "@zinuto/shared/trading";
import { attachExactBacktestMetrics } from "../../src/application/backtest/backtestMetricsPersistence.js";
import type {
  BacktestConfig,
  BacktestInstrumentRunResult,
} from "../../src/application/backtest/types.js";
import type { OhlcvBar } from "../../src/domain/models.js";
import type { TradingSettings } from "../../src/domain/trading/types.js";

const firstBarTime = "2026-01-03T09:30:00.000Z";
const secondBarTime = "2026-01-04T09:30:00.000Z";

type PersistedMetrics = {
  benchmark?: {
    benchmarkReturn?: number;
  };
  series?: {
    benchmarkEquity?: Array<{
      benchmarkEquity: number;
    }>;
  };
};

const assertCloseTo = (actual: number | undefined, expected: number): void => {
  assert.equal(typeof actual, "number");
  assert.ok(
    Math.abs(actual - expected) <= 1e-8,
    `expected ${actual} to be close to ${expected}`,
  );
};

const zeroFeeAshareSettings = (): TradingSettings => ({
  ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
  commissionRate: 0,
  makerFeeRate: 0,
  takerFeeRate: 0,
  fundingRate: 0,
  transferFeeRate: 0,
  regulatoryFeeRate: 0,
  platformFeeRate: 0,
  transactionLevyRate: 0,
  slippageRate: 0,
  stampDutyRate: 0,
  commissionMinimumFee: 0,
  platformFeeMinimumFee: 0,
  transactionLevyMinimumFee: 0,
  minTradeStep: 1,
  tradeSettlementMode: "T0",
  freeReplayEndSettlementMode: "FORCE_CLOSE",
  tradeAmountIncludesFees: false,
  allowLongMarginTrading: false,
  allowShortSelling: false,
  initialSecuritiesBalance: 1000,
  positionCostMode: "DILUTED",
});

const baseConfig = (startIndex: number): BacktestConfig => ({
  strategySource: "BUY:1; SELL:2;",
  startIndex,
  initialCapital: 1000,
  priceMode: "CUR_CLOSE",
  signalExecutionMode: "CUR_CLOSE",
  orderSizing: {
    mode: "FIXED_QTY",
    value: 1,
  },
  tradingSettings: zeroFeeAshareSettings(),
});

const bars: OhlcvBar[] = [
  {
    ts: firstBarTime,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    volume: 1000,
  },
  {
    ts: secondBarTime,
    open: 12,
    high: 13,
    low: 11,
    close: 12,
    volume: 1000,
  },
];

const baseResult = (
  firstBarIndex: number,
  secondBarIndex: number,
): BacktestInstrumentRunResult => ({
  instrument: {
    instrumentId: "instrument-1",
    sourceId: null,
    symbol: "AAA",
    baseTimeframe: "1d",
    name: null,
    market: null,
    barCount: 4,
    timeZone: null,
    barsVersionToken: null,
  },
  result: {
    instrumentId: "instrument-1",
    symbol: "AAA",
    timeframe: "1d",
    barsCount: 2,
    finalEquity: 1010,
    totalPnl: 10,
    profitRate: 0.01,
    maxDrawdown: 0,
    winRate: 1,
    tradeCount: 2,
    conflictCount: 0,
    summary: {
      closedTrades: 1,
      winningTrades: 1,
      realizedPnl: 10,
    },
  },
  fills: [
    {
      instrumentId: "instrument-1",
      symbol: "AAA",
      orderId: "order-1",
      fillIndex: firstBarIndex,
      fillTime: firstBarTime,
      side: "BUY",
      price: 10,
      qty: 1,
      gross: 10,
      fee: 0,
      tax: 0,
      slippage: 0,
    },
    {
      instrumentId: "instrument-1",
      symbol: "AAA",
      orderId: "order-2",
      fillIndex: secondBarIndex,
      fillTime: secondBarTime,
      side: "SELL",
      price: 12,
      qty: 1,
      gross: 12,
      fee: 0,
      tax: 0,
      slippage: 0,
    },
  ],
  equityCurve: [
    {
      instrumentId: "instrument-1",
      symbol: "AAA",
      barIndex: firstBarIndex,
      barTime: firstBarTime,
      equity: 1000,
      drawdown: 0,
    },
    {
      instrumentId: "instrument-1",
      symbol: "AAA",
      barIndex: secondBarIndex,
      barTime: secondBarTime,
      equity: 1010,
      drawdown: 0,
    },
  ],
  conflicts: [],
});

const metricsFrom = (
  result: BacktestInstrumentRunResult,
): PersistedMetrics =>
  result.result.summary.metrics as PersistedMetrics;

test("exact backtest metrics persist benchmark series for raw bar indexes", () => {
  const result = attachExactBacktestMetrics(
    baseResult(2, 3),
    baseConfig(2),
    bars,
    { rawStartIndex: 2 },
  );
  const metrics = metricsFrom(result);

  assert.ok(metrics.benchmark);
  assert.equal(metrics.series?.benchmarkEquity?.length, 2);
  assertCloseTo(metrics.benchmark?.benchmarkReturn, 0.2);
  assertCloseTo(metrics.series?.benchmarkEquity?.[1]?.benchmarkEquity, 1200);
});

test("exact backtest metrics persist benchmark series for relative bar indexes", () => {
  const result = attachExactBacktestMetrics(
    baseResult(0, 1),
    baseConfig(2),
    bars,
    { rawStartIndex: 2 },
  );
  const metrics = metricsFrom(result);

  assert.ok(metrics.benchmark);
  assert.equal(metrics.series?.benchmarkEquity?.length, 2);
  assertCloseTo(metrics.benchmark?.benchmarkReturn, 0.2);
  assertCloseTo(metrics.series?.benchmarkEquity?.[1]?.benchmarkEquity, 1200);
});

test("native batch attaches exact metrics before persisting result rows", () => {
  const source = readFileSync(
    new URL(
      "../../src/application/backtest/nativeBatchRun.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /attachExactBacktestMetrics/);
  assert.match(source, /getMarketBarsByInstrumentIdRange/);
  assert.match(source, /rawStartIndex/);
  assert.match(
    source,
    /buildInsertRowsForBacktestResult\(\s*options\.batchId,\s*itemWithMetrics,/,
  );
});
