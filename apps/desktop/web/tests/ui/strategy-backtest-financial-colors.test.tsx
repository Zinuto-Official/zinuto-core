// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatStrategyBacktestRatio,
  resolveStrategyBacktestLossFinancialTone,
  resolveStrategyBacktestProfitFactorFinancialTone,
  resolveStrategyBacktestSignedFinancialTone,
} from "../../src/workspaces/strategy-backtest/strategyBacktestFinancialTone";
import { readCssWithImports } from "./readCssWithImports";

const strategyBacktestCss = readCssWithImports(
  new URL("../../src/styles/workspaces/strategy-backtest.css", import.meta.url),
);

const readSource = (specifier: string): string =>
  readFileSync(new URL(specifier, import.meta.url), "utf8");

test("strategy backtest financial tone helpers map by business meaning", () => {
  assert.equal(resolveStrategyBacktestSignedFinancialTone(0.12), "positive");
  assert.equal(resolveStrategyBacktestSignedFinancialTone(-0.01), "negative");
  assert.equal(resolveStrategyBacktestSignedFinancialTone(0), "neutral");
  assert.equal(resolveStrategyBacktestSignedFinancialTone(null), "neutral");

  assert.equal(resolveStrategyBacktestLossFinancialTone(0.12), "negative");
  assert.equal(resolveStrategyBacktestLossFinancialTone(-0.12), "negative");
  assert.equal(resolveStrategyBacktestLossFinancialTone(0), "neutral");
  assert.equal(resolveStrategyBacktestLossFinancialTone(undefined), "neutral");

  assert.equal(resolveStrategyBacktestProfitFactorFinancialTone(1.2), "positive");
  assert.equal(resolveStrategyBacktestProfitFactorFinancialTone(0.8), "negative");
  assert.equal(resolveStrategyBacktestProfitFactorFinancialTone(1), "neutral");
  assert.equal(
    resolveStrategyBacktestProfitFactorFinancialTone(
      null,
      "POSITIVE_INFINITY",
    ),
    "positive",
  );
  assert.equal(
    resolveStrategyBacktestProfitFactorFinancialTone(
      null,
      "NOT_AVAILABLE",
    ),
    "neutral",
  );
});

test("strategy backtest ratio presentation preserves infinity and missing states", () => {
  const formatRatio = (value: number) => value.toFixed(2);

  assert.equal(
    formatStrategyBacktestRatio(12.345, "FINITE", formatRatio, "N/A"),
    "12.35",
  );
  assert.equal(
    formatStrategyBacktestRatio(
      null,
      "POSITIVE_INFINITY",
      formatRatio,
      "N/A",
    ),
    "∞",
  );
  assert.equal(
    formatStrategyBacktestRatio(null, "NOT_AVAILABLE", formatRatio, "N/A"),
    "N/A",
  );
  assert.equal(
    formatStrategyBacktestRatio(null, "FINITE", formatRatio, "N/A"),
    "N/A",
  );
});

test("strategy backtest financial css derives text colors from price tokens, while trade side uses trade tokens", () => {
  assert.match(
    strategyBacktestCss,
    /--strategy-backtest-financial-positive-text:var\(--price-up-color\);/,
  );
  assert.match(
    strategyBacktestCss,
    /--strategy-backtest-financial-negative-text:var\(--price-down-color\);/,
  );
  assert.match(
    strategyBacktestCss,
    /--strategy-backtest-financial-positive-text:color-mix\(in srgb,var\(--price-up-color\) 72%,var\(--text-strong\)\);/,
  );
  assert.match(
    strategyBacktestCss,
    /--strategy-backtest-financial-negative-text:color-mix\(in srgb,var\(--price-down-color\) 72%,var\(--text-strong\)\);/,
  );
  assert.match(
    strategyBacktestCss,
    /\.strategy-backtest-batch-metric\[data-tone="positive"\] strong\{color:var\(--strategy-backtest-financial-positive-text\);\}/,
  );
  assert.match(
    strategyBacktestCss,
    /\.strategy-backtest-batch-metric\[data-tone="negative"\] strong\{color:var\(--strategy-backtest-financial-negative-text\);\}/,
  );
  assert.match(
    strategyBacktestCss,
    /\.strategy-backtest-secondary-result-row em\[data-tone="positive"\]\{color:var\(--strategy-backtest-financial-positive-text\);\}/,
  );
  assert.match(
    strategyBacktestCss,
    /\.strategy-backtest-secondary-result-row em\[data-tone="negative"\]\{color:var\(--strategy-backtest-financial-negative-text\);\}/,
  );
  assert.match(
    strategyBacktestCss,
    /\.strategy-backtest-fill-row strong\[data-tone="positive"\]\{color:var\(--strategy-backtest-financial-positive-text\);\}/,
  );
  assert.match(
    strategyBacktestCss,
    /\.strategy-backtest-fill-row strong\[data-tone="negative"\]\{color:var\(--strategy-backtest-financial-negative-text\);\}/,
  );
  assert.match(
    strategyBacktestCss,
    /\.strategy-backtest-fill-row span\[data-side="BUY"\]\{[^}]*var\(--trade-buy-color\)/,
  );
  assert.match(
    strategyBacktestCss,
    /\.strategy-backtest-fill-row span\[data-side="SELL"\]\{[^}]*var\(--trade-sell-color\)/,
  );
  assert.doesNotMatch(
    strategyBacktestCss,
    /strategy-backtest-(?:batch-metric|simple-cards|kpi-strip|metric-table-row|distribution-stats)[^{]*(?:tone-danger|data-tone="danger")/,
  );
});

test("strategy backtest detail charts derive financial colors from priceColorMode", () => {
  const chartThemeSource = readSource(
    "../../src/workspaces/strategy-backtest/detail/charts/backtestChartTheme.ts",
  );
  const drawdownChartSource = readSource(
    "../../src/workspaces/strategy-backtest/detail/charts/DrawdownUnderwaterChart.tsx",
  );
  const heatmapChartSource = readSource(
    "../../src/workspaces/strategy-backtest/detail/charts/MonthlyReturnsHeatmap.tsx",
  );

  assert.match(chartThemeSource, /financialPositive:\s*pricePalette\.up/);
  assert.match(chartThemeSource, /financialNegative:\s*pricePalette\.down/);
  assert.match(drawdownChartSource, /color:\s*\[theme\.financialNegative\]/);
  assert.match(
    heatmapChartSource,
    /color:\s*\[theme\.financialNegative,\s*theme\.splitLine,\s*theme\.financialPositive\]/,
  );
  assert.doesNotMatch(
    [chartThemeSource, drawdownChartSource, heatmapChartSource].join("\n"),
    /theme\.(?:positive|negative)\b/,
  );
});

test("strategy backtest detail metrics do not use danger for financial direction", () => {
  const financialMetricSources = [
    "../../src/workspaces/strategy-backtest/detail/BacktestSimpleView.tsx",
    "../../src/workspaces/strategy-backtest/detail/MetricKpiStrip.tsx",
    "../../src/workspaces/strategy-backtest/detail/MetricTable.tsx",
  ]
    .map((sourcePath) => readSource(sourcePath))
    .join("\n");

  assert.match(financialMetricSources, /resolveStrategyBacktestSignedFinancialTone/);
  assert.match(financialMetricSources, /resolveStrategyBacktestLossFinancialTone/);
  assert.match(financialMetricSources, /resolveStrategyBacktestProfitFactorFinancialTone/);
  assert.doesNotMatch(financialMetricSources, /\btone:\s*"danger"|\bdata-tone=\{[^}\n]*"danger"/);
});
