// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopBacktestDirectionSignalRule,
  DesktopBacktestSignalRuleCondition,
  DesktopBacktestSignalRuleOperand,
  DesktopBacktestSignalRuleOperator,
} from "@zinuto/shared/contracts-desktop/api";
import type { SignalRuleOutputLine } from "@/workspaces/strategy-backtest/strategyBacktestSignalRuleDefaults";

export type SignalRulePriceField = Extract<
  DesktopBacktestSignalRuleOperand,
  { kind: "PRICE" }
>["field"];

export type SignalRuleSummaryLabels = {
  connectors: Record<DesktopBacktestDirectionSignalRule["connector"], string>;
  operators: Record<DesktopBacktestSignalRuleOperator, string>;
  prices: Record<SignalRulePriceField, string>;
  moreConditions: (count: number) => string;
};

export type SignalRuleConditionSummary = {
  left: string;
  operator: string;
  right: string;
  text: string;
};

export type SignalRuleSummary = {
  text: string;
  title: string;
  connectorLabel: string | null;
  conditions: SignalRuleConditionSummary[];
  conditionCount: number;
  extraConditionCount: number;
};

const formatConstantOperand = (value: number): string =>
  Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(6)));

export const formatSignalRuleOperandSummary = (
  operand: DesktopBacktestSignalRuleOperand,
  outputLines: readonly SignalRuleOutputLine[],
  labels: Pick<SignalRuleSummaryLabels, "prices">,
): string => {
  switch (operand.kind) {
    case "OUTPUT": {
      const outputLine = outputLines.find(
        (line) => line.key.trim().toUpperCase() === operand.key.trim().toUpperCase(),
      );
      return outputLine?.title?.trim() || outputLine?.key || operand.key;
    }
    case "PRICE":
      return labels.prices[operand.field];
    case "CONSTANT":
      return formatConstantOperand(operand.value);
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
};

const formatSignalRuleConditionParts = (
  condition: DesktopBacktestSignalRuleCondition,
  outputLines: readonly SignalRuleOutputLine[],
  labels: Pick<SignalRuleSummaryLabels, "operators" | "prices">,
): SignalRuleConditionSummary => {
  const left = formatSignalRuleOperandSummary(condition.left, outputLines, labels);
  const operator = labels.operators[condition.operator];
  const right = formatSignalRuleOperandSummary(condition.right, outputLines, labels);
  return {
    left,
    operator,
    right,
    text: [left, operator, right].join(" "),
  };
};

export const formatSignalRuleConditionSummary = (
  condition: DesktopBacktestSignalRuleCondition,
  outputLines: readonly SignalRuleOutputLine[],
  labels: Pick<SignalRuleSummaryLabels, "operators" | "prices">,
): string => formatSignalRuleConditionParts(condition, outputLines, labels).text;

export const formatSignalRuleSummary = (
  rule: DesktopBacktestDirectionSignalRule,
  outputLines: readonly SignalRuleOutputLine[],
  labels: SignalRuleSummaryLabels,
): SignalRuleSummary => {
  const conditions = rule.conditions.map((condition) =>
    formatSignalRuleConditionParts(condition, outputLines, labels),
  );
  const connectorLabel = rule.conditions.length > 1
    ? labels.connectors[rule.connector]
    : null;
  const extraConditionCount = Math.max(0, conditions.length - 1);
  const firstCondition = conditions[0]?.text ?? "";
  const text = extraConditionCount > 0
    ? `${firstCondition} · ${labels.connectors[rule.connector]} · ${labels.moreConditions(extraConditionCount)}`
    : firstCondition;

  return {
    text,
    title: connectorLabel
      ? conditions.map((condition) => condition.text).join(` ${connectorLabel} `)
      : firstCondition,
    connectorLabel,
    conditions,
    conditionCount: conditions.length,
    extraConditionCount,
  };
};
