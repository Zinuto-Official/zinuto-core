// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidStrategyBacktestDateInput,
  resolveStrategyBacktestVisibleBarCount,
  resolveStrategyBacktestDatasetRange,
} from "../../src/workspaces/strategy-backtest/strategyBacktestDatasetRange";

test("strategy backtest accepts only complete real calendar dates", () => {
  assert.equal(isValidStrategyBacktestDateInput(""), true);
  assert.equal(isValidStrategyBacktestDateInput("2024-02-29"), true);
  assert.equal(isValidStrategyBacktestDateInput("2024-2-29"), false);
  assert.equal(isValidStrategyBacktestDateInput("2024-02-30"), false);
});

test("strategy backtest defaults to the complete dataset boundary", () => {
  const range = resolveStrategyBacktestDatasetRange({
    id: "pool",
    name: "Pool",
    assetClass: "STOCK",
    assetClassLabel: "Stock",
    marketPresetId: "market",
    baseTimeframe: "1d",
    symbols: ["AAA", "BBB"],
    instruments: [
      {
        instrumentId: "a",
        symbol: "AAA",
        barCount: 20,
        timeStartTs: "2024-02-01T00:00:00.000Z",
        timeEndTs: "2024-02-28T00:00:00.000Z",
      },
      {
        instrumentId: "b",
        symbol: "BBB",
        barCount: 36,
        timeStartTs: "2024-01-15T00:00:00.000Z",
        timeEndTs: "2024-03-08T00:00:00.000Z",
      },
    ],
  });

  assert.equal(range?.startDate, "2024-01-15");
  assert.equal(range?.endDate, "2024-03-08");
  assert.equal(
    resolveStrategyBacktestVisibleBarCount({
      range,
      startDate: range?.startDate ?? "",
      endDate: range?.endDate ?? "",
    }),
    36,
  );
});

test("strategy backtest period count follows a narrowed selection", () => {
  const range = resolveStrategyBacktestDatasetRange({
    id: "pool",
    name: "Pool",
    assetClass: "CRYPTO",
    assetClassLabel: "Crypto",
    marketPresetId: "market",
    baseTimeframe: "1m",
    symbols: ["BTCUSD"],
    instruments: [
      {
        instrumentId: "btc",
        symbol: "BTCUSD",
        barCount: 101,
        timeStartTs: "2024-01-01T00:00:00.000Z",
        timeEndTs: "2024-01-11T00:00:00.000Z",
      },
    ],
  });

  assert.equal(
    resolveStrategyBacktestVisibleBarCount({
      range,
      startDate: "2024-01-01",
      endDate: "2024-01-05",
    }),
    46,
  );
});
