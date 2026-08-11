// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import type {
  DesktopBacktestDirectionSignalRule,
  DesktopBacktestSignalRuleCondition,
} from "@zinuto/shared/contracts-desktop/api";
import {
  formatSignalRuleSummary,
  formatSignalRuleConditionSummary,
  formatSignalRuleOperandSummary,
  type SignalRuleSummaryLabels,
} from "../../src/workspaces/strategy-backtest/strategyBacktestSignalRuleDisplay";

const labels: SignalRuleSummaryLabels = {
  connectors: {
    AND: "且",
    OR: "或",
  },
  operators: {
    CROSS_ABOVE: "上穿",
    CROSS_BELOW: "下穿",
    GREATER: "大于",
    GREATER_EQUAL: "大于等于",
    LESS: "小于",
    LESS_EQUAL: "小于等于",
    EQUAL: "等于",
  },
  prices: {
    CLOSE: "收盘价",
    OPEN: "开盘价",
    HIGH: "最高价",
    LOW: "最低价",
    VOLUME: "成交量",
  },
  moreConditions: (count) => `+${count} 条`,
};

const outputLines = [
  { key: "DIF", title: "DIF" },
  { key: "DEA", title: "DEA" },
  { key: "FAST", title: "快线" },
];

test("strategy signal rule summary formats operands and operators", () => {
  assert.equal(
    formatSignalRuleOperandSummary({ kind: "OUTPUT", key: "FAST" }, outputLines, labels),
    "快线",
  );
  assert.equal(
    formatSignalRuleOperandSummary({ kind: "OUTPUT", key: "UNKNOWN" }, outputLines, labels),
    "UNKNOWN",
  );
  assert.equal(
    formatSignalRuleOperandSummary({ kind: "PRICE", field: "CLOSE" }, outputLines, labels),
    "收盘价",
  );
  assert.equal(
    formatSignalRuleOperandSummary({ kind: "CONSTANT", value: 12.3456789 }, outputLines, labels),
    "12.345679",
  );
});

test("strategy signal rule summary keeps a single condition compact", () => {
  const condition: DesktopBacktestSignalRuleCondition = {
    left: { kind: "OUTPUT", key: "DIF" },
    operator: "CROSS_ABOVE",
    right: { kind: "OUTPUT", key: "DEA" },
  };
  const rule: DesktopBacktestDirectionSignalRule = {
    connector: "AND",
    conditions: [condition],
  };

  assert.equal(
    formatSignalRuleConditionSummary(condition, outputLines, labels),
    "DIF 上穿 DEA",
  );
  assert.deepEqual(formatSignalRuleSummary(rule, outputLines, labels), {
    text: "DIF 上穿 DEA",
    title: "DIF 上穿 DEA",
    connectorLabel: null,
    conditions: [
      {
        left: "DIF",
        operator: "上穿",
        right: "DEA",
        text: "DIF 上穿 DEA",
      },
    ],
    conditionCount: 1,
    extraConditionCount: 0,
  });
});

test("strategy signal rule summary compresses multiple AND conditions", () => {
  const rule: DesktopBacktestDirectionSignalRule = {
    connector: "AND",
    conditions: [
      {
        left: { kind: "OUTPUT", key: "DIF" },
        operator: "CROSS_ABOVE",
        right: { kind: "OUTPUT", key: "DEA" },
      },
      {
        left: { kind: "PRICE", field: "CLOSE" },
        operator: "GREATER",
        right: { kind: "CONSTANT", value: 10 },
      },
    ],
  };

  assert.deepEqual(formatSignalRuleSummary(rule, outputLines, labels), {
    text: "DIF 上穿 DEA · 且 · +1 条",
    title: "DIF 上穿 DEA 且 收盘价 大于 10",
    connectorLabel: "且",
    conditions: [
      {
        left: "DIF",
        operator: "上穿",
        right: "DEA",
        text: "DIF 上穿 DEA",
      },
      {
        left: "收盘价",
        operator: "大于",
        right: "10",
        text: "收盘价 大于 10",
      },
    ],
    conditionCount: 2,
    extraConditionCount: 1,
  });
});

test("strategy signal rule summary compresses multiple OR conditions", () => {
  const rule: DesktopBacktestDirectionSignalRule = {
    connector: "OR",
    conditions: [
      {
        left: { kind: "OUTPUT", key: "DIF" },
        operator: "CROSS_BELOW",
        right: { kind: "OUTPUT", key: "DEA" },
      },
      {
        left: { kind: "PRICE", field: "VOLUME" },
        operator: "GREATER_EQUAL",
        right: { kind: "CONSTANT", value: 1000 },
      },
      {
        left: { kind: "PRICE", field: "LOW" },
        operator: "LESS_EQUAL",
        right: { kind: "CONSTANT", value: 8 },
      },
    ],
  };

  assert.deepEqual(formatSignalRuleSummary(rule, outputLines, labels), {
    text: "DIF 下穿 DEA · 或 · +2 条",
    title: "DIF 下穿 DEA 或 成交量 大于等于 1000 或 最低价 小于等于 8",
    connectorLabel: "或",
    conditions: [
      {
        left: "DIF",
        operator: "下穿",
        right: "DEA",
        text: "DIF 下穿 DEA",
      },
      {
        left: "成交量",
        operator: "大于等于",
        right: "1000",
        text: "成交量 大于等于 1000",
      },
      {
        left: "最低价",
        operator: "小于等于",
        right: "8",
        text: "最低价 小于等于 8",
      },
    ],
    conditionCount: 3,
    extraConditionCount: 2,
  });
});
