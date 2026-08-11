// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  computeBacktestMetrics,
  toBacktestPersistedMetrics,
  type BacktestMetricEquityPoint,
} from "../backtestMetrics.ts";

const YEAR_MS = 365.2425 * 24 * 60 * 60 * 1000;
const BASE_MS = Date.parse("2020-01-01T00:00:00.000Z");

const yearlyDate = (index: number): string =>
  new Date(BASE_MS + index * YEAR_MS).toISOString();

const equityFromReturns = (
  initialCapital: number,
  returns: number[],
): BacktestMetricEquityPoint[] => {
  let equity = initialCapital;
  const points: BacktestMetricEquityPoint[] = [
    {
      barIndex: 0,
      barTime: yearlyDate(0),
      equity,
      drawdown: 0,
    },
  ];
  let peak = equity;
  returns.forEach((value, index) => {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    points.push({
      barIndex: index + 1,
      barTime: yearlyDate(index + 1),
      equity,
      drawdown: peak > 0 ? Math.max(0, (peak - equity) / peak) : 0,
    });
  });
  return points;
};

const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const sampleStd = (values: number[]): number => {
  const avg = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
      (values.length - 1),
  );
};

const covariance = (left: number[], right: number[]): number => {
  const leftMean = mean(left);
  const rightMean = mean(right);
  return (
    left.reduce(
      (sum, value, index) =>
        sum + (value - leftMean) * (right[index]! - rightMean),
      0,
    ) /
    (left.length - 1)
  );
};

const closeTo = (actual: number, expected: number, tolerance = 1e-9): void => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be close to ${expected}`,
  );
};

const assertMetricTreeClose = (
  actual: unknown,
  expected: unknown,
  path = "metrics",
): void => {
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", `${path} must be a number`);
    closeTo(actual, expected);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} must be an array`);
    assert.equal(actual.length, expected.length, `${path} length`);
    expected.forEach((item, index) => {
      assertMetricTreeClose(actual[index], item, `${path}[${index}]`);
    });
    return;
  }
  if (expected !== null && typeof expected === "object") {
    assert.ok(
      actual !== null && typeof actual === "object",
      `${path} must be an object`,
    );
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(actualRecord).sort(),
      Object.keys(expectedRecord).sort(),
      `${path} keys`,
    );
    for (const key of Object.keys(expectedRecord)) {
      assertMetricTreeClose(
        actualRecord[key],
        expectedRecord[key],
        `${path}.${key}`,
      );
    }
    return;
  }
  assert.equal(actual, expected, path);
};

const readNextOpenPersistedGolden = (): unknown =>
  JSON.parse(
    readFileSync(
      new URL(
        "../__fixtures__/next_open_basic.persisted-metrics.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

const nextOpenFixtureMetrics = () =>
  toBacktestPersistedMetrics(
    computeBacktestMetrics({
      equity: [
        {
          barIndex: 0,
          barTime: "2026-01-01T00:00:00.000Z",
          equity: 1000,
          drawdown: 0,
        },
        {
          barIndex: 1,
          barTime: "2026-01-02T00:00:00.000Z",
          equity: 1010,
          drawdown: 0,
        },
        {
          barIndex: 2,
          barTime: "2026-01-03T00:00:00.000Z",
          equity: 1030,
          drawdown: 0,
        },
        {
          barIndex: 3,
          barTime: "2026-01-04T00:00:00.000Z",
          equity: 1040,
          drawdown: 0,
        },
      ],
      fills: [
        {
          fillIndex: 1,
          fillTime: "2026-01-02T00:00:00.000Z",
          side: "BUY",
          price: 10,
          qty: 100,
          gross: 1000,
          fee: 0,
          tax: 0,
          slippage: 0,
        },
        {
          fillIndex: 3,
          fillTime: "2026-01-04T00:00:00.000Z",
          side: "SELL",
          price: 10.4,
          qty: 100,
          gross: 1040,
          fee: 0,
          tax: 0,
          slippage: 0,
        },
      ],
      initialCapital: 1000,
      closedTrades: 1,
      winningTrades: 1,
      realizedPnl: 40,
      timeframe: "1d",
    }),
  );

test("computes institutional return, risk, trade, and benchmark metrics", () => {
  const strategyReturns = [0.1, -0.05, 0.2, -0.02];
  const benchmarkReturns = [0.08, -0.05, 0.2, -0.02];
  const equity = equityFromReturns(100, strategyReturns);
  let close = 100;
  const benchmarkCloseByBarIndex = new Map<number, number>([[0, close]]);
  benchmarkReturns.forEach((value, index) => {
    close *= 1 + value;
    benchmarkCloseByBarIndex.set(index + 1, close);
  });

  const result = computeBacktestMetrics({
    equity,
    fills: [
      {
        fillIndex: 0,
        fillTime: yearlyDate(0),
        side: "BUY",
        price: 10,
        qty: 10,
        gross: 100,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 1,
        fillTime: yearlyDate(1),
        side: "SELL",
        price: 12,
        qty: 10,
        gross: 120,
        fee: 1,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 2,
        fillTime: yearlyDate(2),
        side: "BUY",
        price: 10,
        qty: 10,
        gross: 100,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 3,
        fillTime: yearlyDate(3),
        side: "SELL",
        price: 9,
        qty: 10,
        gross: 90,
        fee: 1,
        tax: 0,
        slippage: 0,
      },
    ],
    initialCapital: 100,
    closedTrades: 2,
    winningTrades: 1,
    realizedPnl: 8,
    benchmarkCloseByBarIndex,
    riskFreeRate: 0,
  });

  const totalReturn = equity[equity.length - 1]!.equity / 100 - 1;
  const expectedSharpe = mean(strategyReturns) / sampleStd(strategyReturns);
  const downside = Math.sqrt(
    mean(strategyReturns.map((value) => Math.min(0, value) ** 2)),
  );
  const expectedBeta =
    covariance(strategyReturns, benchmarkReturns) /
    sampleStd(benchmarkReturns) ** 2;
  const expectedBenchmarkAnnual = mean(benchmarkReturns);
  const expectedStrategyAnnual = mean(strategyReturns);
  const activeReturns = strategyReturns.map(
    (value, index) => value - benchmarkReturns[index]!,
  );
  const expectedTrackingError = sampleStd(activeReturns);

  closeTo(result.returns.totalReturn, totalReturn);
  closeTo(result.risk.sharpe, expectedSharpe);
  closeTo(result.risk.sortino, mean(strategyReturns) / downside);
  closeTo(result.risk.maxDrawdown, 0.05);
  closeTo(result.risk.calmar, result.returns.CAGR / 0.05);
  closeTo(result.trades.profitFactor, 19 / 11);
  closeTo(result.trades.payoffRatio, 19 / 11);
  closeTo(result.trades.expectancy, 4);
  assert.equal(result.trades.maxConsecutiveWins, 1);
  assert.equal(result.trades.maxConsecutiveLosses, 1);
  assert.ok(result.benchmark);
  closeTo(result.benchmark!.beta, expectedBeta);
  closeTo(
    result.benchmark!.alpha,
    expectedStrategyAnnual - expectedBeta * expectedBenchmarkAnnual,
  );
  closeTo(result.benchmark!.trackingError, expectedTrackingError);
  assert.equal(result.series.monthly.length, 4);
  assert.equal(
    result.distribution.histogram.reduce((sum, bin) => sum + bin.count, 0),
    4,
  );
});

test("keeps gross annualized return separate from risk-free adjustments", () => {
  const strategyReturns = [0.12, -0.03, 0.09];
  const benchmarkReturns = [0.08, -0.01, 0.04];
  const equity = equityFromReturns(100, strategyReturns);
  let close = 100;
  const benchmarkCloseByBarIndex = new Map<number, number>([[0, close]]);
  benchmarkReturns.forEach((value, index) => {
    close *= 1 + value;
    benchmarkCloseByBarIndex.set(index + 1, close);
  });
  const riskFreeRate = 0.04;
  const result = computeBacktestMetrics({
    equity,
    fills: [],
    initialCapital: 100,
    benchmarkCloseByBarIndex,
    riskFreeRate,
  });
  const expectedStrategyAnnual =
    mean(strategyReturns) * result.periodsPerYear;
  const expectedBenchmarkAnnual =
    mean(benchmarkReturns) * result.periodsPerYear;
  const expectedBeta =
    covariance(strategyReturns, benchmarkReturns) /
    sampleStd(benchmarkReturns) ** 2;
  const periodRiskFreeRate =
    (1 + riskFreeRate) ** (1 / result.periodsPerYear) - 1;
  const expectedSharpe =
    (mean(strategyReturns) - periodRiskFreeRate) /
    sampleStd(strategyReturns) *
    Math.sqrt(result.periodsPerYear);

  closeTo(result.returns.annualizedReturn, expectedStrategyAnnual);
  closeTo(result.risk.sharpe, expectedSharpe);
  closeTo(
    result.benchmark!.alpha,
    expectedStrategyAnnual -
      (riskFreeRate +
        expectedBeta * (expectedBenchmarkAnnual - riskFreeRate)),
  );
});

test("allocates scaled-entry costs across partial closes", () => {
  const result = computeBacktestMetrics({
    equity: equityFromReturns(1000, [0, 0, 0]),
    fills: [
      {
        fillIndex: 0,
        side: "BUY",
        price: 100,
        qty: 4,
        gross: 400,
        fee: 4,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 1,
        side: "BUY",
        price: 110,
        qty: 6,
        gross: 660,
        fee: 6,
        tax: 2,
        slippage: 4,
      },
      {
        fillIndex: 2,
        side: "SELL",
        price: 108,
        qty: 5,
        gross: 540,
        fee: 2,
        tax: 1,
        slippage: 2,
      },
      {
        fillIndex: 3,
        side: "SELL",
        price: 108,
        qty: 5,
        gross: 540,
        fee: 2,
        tax: 1,
        slippage: 2,
      },
    ],
    initialCapital: 1000,
  });

  assert.equal(result.trades.totalTrades, 2);
  assert.equal(result.trades.winRate, 0);
  closeTo(result.trades.expectancy, -3);
  closeTo(result.trades.avgLoss, -3);
  closeTo(result.trades.realizedPnl, -6);
  closeTo(result.trades.totalCost, 26);
});

test("splits reversal-fill costs between closing and newly opened positions", () => {
  const result = computeBacktestMetrics({
    equity: equityFromReturns(1000, [0, 0]),
    fills: [
      {
        fillIndex: 0,
        side: "BUY",
        price: 100,
        qty: 10,
        gross: 1000,
        fee: 6,
        tax: 0,
        slippage: 4,
      },
      {
        fillIndex: 1,
        side: "SELL",
        price: 110,
        qty: 16,
        gross: 1760,
        fee: 8,
        tax: 4,
        slippage: 4,
      },
      {
        fillIndex: 2,
        side: "BUY",
        price: 105,
        qty: 6,
        gross: 630,
        fee: 4,
        tax: 0,
        slippage: 2,
      },
    ],
    initialCapital: 1000,
  });

  assert.equal(result.trades.totalTrades, 2);
  assert.equal(result.trades.winRate, 1);
  closeTo(result.trades.expectancy, 49);
  closeTo(result.trades.avgWin, 49);
  closeTo(result.trades.realizedPnl, 98);
  closeTo(result.trades.totalCost, 32);
});

test("computes buy-and-hold benchmark from relative closes for raw equity bars", () => {
  const result = computeBacktestMetrics({
    equity: [
      {
        barIndex: 20,
        barTime: yearlyDate(0),
        equity: 100,
        drawdown: 0,
      },
      {
        barIndex: 21,
        barTime: yearlyDate(1),
        equity: 105,
        drawdown: 0,
      },
    ],
    fills: [
      {
        fillIndex: 20,
        fillTime: yearlyDate(0),
        side: "BUY",
        price: 10,
        qty: 1,
        gross: 10,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 21,
        fillTime: yearlyDate(1),
        side: "SELL",
        price: 11,
        qty: 1,
        gross: 11,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
    ],
    initialCapital: 100,
    benchmarkCloseByBarIndex: new Map<number, number>([
      [0, 50],
      [1, 55],
    ]),
    timeframe: "1d",
  });

  assert.ok(result.benchmark);
  assert.equal(result.series.benchmarkEquity?.length, 2);
  closeTo(result.benchmark!.benchmarkReturn, 0.1);
  closeTo(result.series.benchmarkEquity![1]!.benchmarkEquity, 110);
});

test("handles zero volatility, no closed trades, and sampled input", () => {
  const result = computeBacktestMetrics({
    equity: equityFromReturns(100, [0, 0, 0]),
    fills: [],
    initialCapital: 100,
    sampled: true,
    timeframe: "1d",
  });

  assert.equal(result.sampled, true);
  assert.equal(result.risk.sampled, true);
  assert.equal(result.risk.annualVolatility, 0);
  assert.equal(result.risk.sharpe, 0);
  assert.equal(result.risk.sortino, 0);
  assert.equal(result.trades.totalTrades, 0);
  assert.equal(result.trades.profitFactor, null);
  assert.equal(result.trades.profitFactorState, "NOT_AVAILABLE");
  assert.equal(result.trades.payoffRatio, null);
  assert.equal(result.trades.payoffRatioState, "NOT_AVAILABLE");
});

test("reports all-win trade edge and single-bar boundaries", () => {
  const allWin = computeBacktestMetrics({
    equity: equityFromReturns(100, [0.1, 0.1]),
    fills: [
      {
        fillIndex: 0,
        side: "BUY",
        price: 10,
        qty: 1,
        gross: 10,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 1,
        side: "SELL",
        price: 12,
        qty: 1,
        gross: 12,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 1,
        side: "BUY",
        price: 10,
        qty: 1,
        gross: 10,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 2,
        side: "SELL",
        price: 11,
        qty: 1,
        gross: 11,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
    ],
    initialCapital: 100,
  });

  assert.equal(allWin.trades.totalTrades, 2);
  assert.equal(allWin.trades.winRate, 1);
  assert.equal(allWin.trades.profitFactor, null);
  assert.equal(allWin.trades.profitFactorState, "POSITIVE_INFINITY");
  assert.equal(allWin.trades.payoffRatio, null);
  assert.equal(allWin.trades.payoffRatioState, "POSITIVE_INFINITY");
  assert.equal(allWin.trades.maxConsecutiveWins, 2);

  const singleBar = computeBacktestMetrics({
    equity: [{ barIndex: 0, barTime: yearlyDate(0), equity: 100, drawdown: 0 }],
    fills: [],
    initialCapital: 100,
  });
  assert.equal(singleBar.returns.totalReturn, 0);
  assert.equal(singleBar.series.returns.length, 0);
  assert.equal(singleBar.risk.maxDrawdownDuration, 0);
});

test("persists finite JSON metrics for all-win trade edges", () => {
  const allWin = computeBacktestMetrics({
    equity: equityFromReturns(100, [0.1, 0.1]),
    fills: [
      {
        fillIndex: 0,
        side: "BUY",
        price: 10,
        qty: 1,
        gross: 10,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 1,
        side: "SELL",
        price: 12,
        qty: 1,
        gross: 12,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
    ],
    initialCapital: 100,
  });
  const persisted = toBacktestPersistedMetrics(allWin);

  assert.equal(allWin.trades.profitFactor, null);
  assert.equal(allWin.trades.profitFactorState, "POSITIVE_INFINITY");
  assert.equal(persisted.trades.profitFactor, null);
  assert.equal(persisted.trades.profitFactorState, "POSITIVE_INFINITY");
  assert.equal(persisted.trades.payoffRatio, null);
  assert.equal(persisted.trades.payoffRatioState, "POSITIVE_INFINITY");
});

test("matches the shared next-open persisted metrics golden fixture", () => {
  assertMetricTreeClose(
    nextOpenFixtureMetrics(),
    readNextOpenPersistedGolden(),
  );
});
