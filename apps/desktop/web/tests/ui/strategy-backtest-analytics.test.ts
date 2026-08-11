// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeBacktestMetrics,
  toBacktestPersistedMetrics,
} from "@zinuto/shared/analytics";
import type { ApiBacktestResultDetail } from "../../src/api/backtest";
import { toBacktestDetailAnalytics } from "../../src/domains/backtest/backtestAnalytics";

const firstBarTime = "2026-01-01T00:00:00.000Z";
const secondBarTime = "2026-01-02T00:00:00.000Z";

test("strategy backtest detail recomputes stale persisted metrics without benchmark", () => {
  const staleMetrics = toBacktestPersistedMetrics(
    computeBacktestMetrics({
      equity: [
        {
          barIndex: 0,
          barTime: firstBarTime,
          equity: 1000,
          drawdown: 0,
        },
        {
          barIndex: 1,
          barTime: secondBarTime,
          equity: 1010,
          drawdown: 0,
        },
      ],
      fills: [],
      initialCapital: 1000,
      timeframe: "1d",
    }),
  );
  const detail = {
    batch: {
      config: {
        initialCapital: 1000,
      },
      summary: {},
    },
    result: {
      timeframe: "1d",
      summary: {
        metrics: staleMetrics,
      },
    },
    fills: [
      {
        fillIndex: 40,
        fillTime: firstBarTime,
        side: "BUY",
        price: 10,
        qty: 10,
        gross: 100,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
      {
        fillIndex: 41,
        fillTime: secondBarTime,
        side: "SELL",
        price: 11,
        qty: 10,
        gross: 110,
        fee: 0,
        tax: 0,
        slippage: 0,
      },
    ],
    equityCurve: [
      {
        barIndex: 40,
        barTime: firstBarTime,
        equity: 1000,
        drawdown: 0,
      },
      {
        barIndex: 41,
        barTime: secondBarTime,
        equity: 1010,
        drawdown: 0,
      },
    ],
    bars: [
      {
        rawIndex: 40,
        ts: firstBarTime,
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        volume: 1000,
      },
      {
        rawIndex: 41,
        ts: secondBarTime,
        open: 11,
        high: 12,
        low: 10,
        close: 12,
        volume: 1000,
      },
    ],
  } as unknown as ApiBacktestResultDetail;

  const metrics = toBacktestDetailAnalytics(detail);

  assert.ok(metrics.benchmark);
  assert.equal(metrics.series.benchmarkEquity?.length, 2);
  assert.equal(metrics.trades.totalTrades, 1);
  assert.equal(metrics.series.benchmarkEquity?.[1]?.benchmarkEquity, 1200);
});
