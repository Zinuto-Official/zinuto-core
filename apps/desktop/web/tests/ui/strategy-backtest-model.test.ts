// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { buildStrategyBacktestBatchReadout } from "../../src/workspaces/strategy-backtest/strategyBacktestBatchReadout";
import { parseMoneyInput } from "../../src/workspaces/strategy-backtest/strategyBacktestDisplay";
import { buildDefaultSignalRules } from "../../src/workspaces/strategy-backtest/strategyBacktestSignalRuleDefaults";
import { sanitizeSignalRules } from "../../src/workspaces/strategy-backtest/strategyBacktestSignalRules";

test("strategy backtest money inputs preserve localized decimal and grouping semantics", () => {
  assert.equal(parseMoneyInput("100,000.50", 1), 100000.5);
  assert.equal(parseMoneyInput("100.000,50", 1), 100000.5);
  assert.equal(parseMoneyInput("100,000", 1), 100000);
  assert.equal(parseMoneyInput("100.000", 1), 100000);
  assert.equal(parseMoneyInput("1.234.567,89", 1), 1234567.89);
  assert.equal(parseMoneyInput("1,234,567.89", 1), 1234567.89);
  assert.equal(parseMoneyInput("0,5", 1), 0.5);
  assert.equal(parseMoneyInput("-100", 42), 42);
  assert.equal(parseMoneyInput("not money", 42), 42);
});

test("strategy backtest default signal rules fill visible editable cards", () => {
  const outputLines = [
    { key: "FAST", title: "Fast" },
    { key: "SLOW", title: "Slow" },
  ];

  const longOnlyRules = buildDefaultSignalRules({
    outputLines,
    allowShortSelling: false,
    indicatorReservedKeys: [],
  });
  assert.deepEqual(Object.keys(longOnlyRules), ["buy", "sell"]);
  assert.equal(longOnlyRules.buy?.conditions[0]?.operator, "CROSS_ABOVE");
  assert.equal(longOnlyRules.sell?.conditions[0]?.operator, "CROSS_BELOW");

  const shortEnabledRules = buildDefaultSignalRules({
    outputLines,
    allowShortSelling: true,
    indicatorReservedKeys: [],
  });
  assert.deepEqual(Object.keys(shortEnabledRules), ["buy", "short"]);
  assert.equal(shortEnabledRules.buy?.conditions[0]?.operator, "CROSS_ABOVE");
  assert.equal(shortEnabledRules.short?.conditions[0]?.operator, "CROSS_BELOW");

  const reservedRules = buildDefaultSignalRules({
    outputLines,
    allowShortSelling: true,
    indicatorReservedKeys: ["BUY", "SELL"],
  });
  assert.deepEqual(Object.keys(reservedRules), ["short"]);
});

test("strategy backtest signal rules remove duplicate conditions and directions", () => {
  const outputLines = [
    { key: "DIF", title: "DIF" },
    { key: "DEA", title: "DEA" },
  ];
  const bullishCondition = {
    left: { kind: "OUTPUT" as const, key: "DIF" },
    operator: "CROSS_ABOVE" as const,
    right: { kind: "OUTPUT" as const, key: "DEA" },
  };
  const bearishCondition = {
    left: { kind: "OUTPUT" as const, key: "DIF" },
    operator: "CROSS_BELOW" as const,
    right: { kind: "OUTPUT" as const, key: "DEA" },
  };

  const sanitized = sanitizeSignalRules(
    {
      buy: { connector: "AND", conditions: [bullishCondition, bullishCondition] },
      cover: { connector: "AND", conditions: [bullishCondition] },
      sell: { connector: "AND", conditions: [bearishCondition] },
      short: { connector: "AND", conditions: [bearishCondition, bearishCondition] },
    },
    outputLines,
    [],
    true,
  );

  assert.equal(sanitized.buy?.conditions.length, 1);
  assert.equal(sanitized.cover, undefined);
  assert.equal(sanitized.sell, undefined);
  assert.equal(sanitized.short?.conditions.length, 1);

  const longOnlySanitized = sanitizeSignalRules(
    {
      buy: { connector: "AND", conditions: [bullishCondition] },
      short: { connector: "AND", conditions: [bearishCondition] },
      cover: { connector: "AND", conditions: [bullishCondition] },
    },
    outputLines,
    [],
    false,
  );
  assert.deepEqual(Object.keys(longOnlySanitized), ["buy"]);
});

test("strategy backtest batch readout aggregates result success and risk", () => {
  const batch = {
    summary: {
      totalSymbols: 3,
      profitableResultCount: 2,
      averageProfitRate: (0.12 - 0.03 + 0.2) / 3,
      maxDrawdown: 0.11,
      bestSymbol: "SUMMARY",
      bestProfitRate: 0.31,
      totalTrades: 9,
    },
  };
  const readout = buildStrategyBacktestBatchReadout(batch as never);

  assert.equal(readout.resultCount, 3);
  assert.equal(readout.profitableResultCount, 2);
  assert.equal(readout.profitableRate, 2 / 3);
  assert.equal(readout.maxDrawdown, 0.11);
  assert.equal(readout.averageProfitRate, (0.12 - 0.03 + 0.2) / 3);
  assert.equal(readout.bestSymbol, "SUMMARY");
  assert.equal(readout.bestProfitRate, 0.31);
  assert.equal(readout.totalTrades, 9);

  const emptyReadout = buildStrategyBacktestBatchReadout({
    summary: {
      bestSymbol: "SUMMARY",
      bestProfitRate: 0.31,
    },
  } as never);
  assert.equal(emptyReadout.resultCount, 0);
  assert.equal(emptyReadout.profitableRate, null);
  assert.equal(emptyReadout.bestSymbol, "SUMMARY");
  assert.equal(emptyReadout.bestProfitRate, 0.31);
});
