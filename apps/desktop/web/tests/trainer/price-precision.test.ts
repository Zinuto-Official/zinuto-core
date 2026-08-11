// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChartSymbolInfo,
  resolveKlineDataPricePrecision,
  shouldApplyStableChartSymbolInfo,
} from "../../src/domains/chart/pricePrecision";

test("chart price precision displays sub-dollar prices with four decimals", () => {
  const data = [
    { timestamp: 1, open: 0.62959999, high: 0.63059999, low: 0.62859999, close: 0.62999999 },
    { timestamp: 2, open: 0.62999999, high: 0.63119999, low: 0.62949999, close: 0.63029999 },
  ];

  assert.equal(resolveKlineDataPricePrecision(data), 4);
});

test("chart price precision expands for flat sub-dollar ranges", () => {
  const data = [
    { timestamp: 1, open: 0.9085, high: 0.91, low: 0.9075, close: 0.9092 },
    { timestamp: 2, open: 0.9092, high: 0.911, low: 0.9087, close: 0.9104 },
  ];

  assert.equal(resolveKlineDataPricePrecision(data), 4);
});

test("chart price precision keeps ordinary equities at two decimals", () => {
  const data = [
    { timestamp: 1, open: 101.12, high: 102.34, low: 100.98, close: 101.75 },
    { timestamp: 2, open: 101.75, high: 103.4, low: 101.4, close: 102.9 },
  ];

  assert.equal(resolveKlineDataPricePrecision(data), 2);
});

test("chart price precision follows price magnitude tiers", () => {
  assert.equal(resolveKlineDataPricePrecision([
    { timestamp: 1, open: 1.2, high: 1.9, low: 1.1, close: 1.5 },
  ]), 3);
  assert.equal(resolveKlineDataPricePrecision([
    { timestamp: 1, open: 0.12, high: 0.19, low: 0.11, close: 0.15 },
  ]), 4);
  assert.equal(resolveKlineDataPricePrecision([
    { timestamp: 1, open: 0.012, high: 0.019, low: 0.011, close: 0.015 },
  ]), 5);
  assert.equal(resolveKlineDataPricePrecision([
    { timestamp: 1, open: 0.0012, high: 0.0019, low: 0.0011, close: 0.0015 },
  ]), 6);
});

test("chart price precision ignores raw decimal tails", () => {
  const data = [
    { timestamp: 1, open: 0.62959999, high: 0.63059999, low: 0.62859999, close: 0.62999999 },
  ];

  assert.notEqual(resolveKlineDataPricePrecision(data), 8);
});

test("chart price precision caps extremely narrow ranges", () => {
  const data = [
    { timestamp: 1, open: 0.62959999, high: 0.62960001, low: 0.62959989, close: 0.62959995 },
  ];

  assert.equal(resolveKlineDataPricePrecision(data), 6);
});

test("chart symbol info carries inferred price precision", () => {
  const data = [
    { timestamp: 1, open: 1.23456, high: 1.23501, low: 1.23395, close: 1.23472 },
  ];

  assert.deepEqual(buildChartSymbolInfo("EURUSD", data), {
    ticker: "EURUSD",
    pricePrecision: 4,
    volumePrecision: 0,
  });
});

test("stable chart symbol info does not reset rendered data for same-session precision drift", () => {
  assert.equal(
    shouldApplyStableChartSymbolInfo({
      current: {
        ticker: "EURUSD",
        pricePrecision: 4,
        volumePrecision: 0,
      },
      next: {
        ticker: "EURUSD",
        pricePrecision: 5,
        volumePrecision: 0,
      },
      hasRenderedData: true,
      isSessionSwitched: false,
    }),
    false,
  );
});

test("stable chart symbol info still refreshes on first render and session switches", () => {
  const current = {
    ticker: "EURUSD",
    pricePrecision: 2,
    volumePrecision: 0,
  };
  const next = {
    ticker: "EURUSD",
    pricePrecision: 4,
    volumePrecision: 0,
  };

  assert.equal(
    shouldApplyStableChartSymbolInfo({
      current,
      next,
      hasRenderedData: false,
      isSessionSwitched: false,
    }),
    true,
  );
  assert.equal(
    shouldApplyStableChartSymbolInfo({
      current,
      next,
      hasRenderedData: true,
      isSessionSwitched: true,
    }),
    true,
  );
});
