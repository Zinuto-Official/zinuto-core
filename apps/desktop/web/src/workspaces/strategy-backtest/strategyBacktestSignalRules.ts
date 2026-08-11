// SPDX-License-Identifier: GPL-3.0-only

import type { ApiCompiledScriptState } from "@/api";
import type {
  DesktopBacktestDirectionSignalRule,
  DesktopBacktestSignalRuleCondition,
  DesktopBacktestSignalRuleOperand,
  DesktopBacktestSignalRules,
} from "@zinuto/shared/contracts-desktop/api";
import type { SignalRuleOutputLine } from "@/workspaces/strategy-backtest/strategyBacktestSignalRuleDefaults";

const RESERVED_SIGNAL_KEYS = ["BUY", "SELL", "SHORT", "COVER"] as const;
type ReservedSignalKey = (typeof RESERVED_SIGNAL_KEYS)[number];
type SignalDirection = keyof DesktopBacktestSignalRules;

export type IndicatorSignalMetadata = {
  outputLines: SignalRuleOutputLine[];
  reservedKeys: ReservedSignalKey[];
  isLoading: boolean;
};

export const EMPTY_INDICATOR_SIGNAL_METADATA: IndicatorSignalMetadata = {
  outputLines: [],
  reservedKeys: [],
  isLoading: false,
};

const isReservedSignalKey = (key: string): key is ReservedSignalKey =>
  RESERVED_SIGNAL_KEYS.includes(key as ReservedSignalKey);

const normalizeSignalKey = (key: string): string => key.trim().toUpperCase();

export const buildIndicatorSignalMetadata = (
  compiled: ApiCompiledScriptState["compiled"],
): Omit<IndicatorSignalMetadata, "isLoading"> => {
  const outputDefinitionByKey = new Map(
    compiled.definition.outputs.map((output) => [
      normalizeSignalKey(output.key),
      output,
    ]),
  );
  const reservedKeys: ReservedSignalKey[] = [];
  const outputLines: SignalRuleOutputLine[] = [];
  const seenOutputKeys = new Set<string>();

  compiled.outputKeys.forEach((rawKey) => {
    const key = normalizeSignalKey(rawKey);
    if (!key) {
      return;
    }
    if (isReservedSignalKey(key)) {
      reservedKeys.push(key);
      return;
    }
    if (seenOutputKeys.has(key)) {
      return;
    }
    seenOutputKeys.add(key);
    const definition = outputDefinitionByKey.get(key);
    outputLines.push({
      key,
      title: definition?.title?.trim() || key,
    });
  });

  return {
    outputLines,
    reservedKeys: Array.from(new Set(reservedKeys)),
  };
};

const signalRuleUsesKnownOutputs = (
  condition: DesktopBacktestSignalRuleCondition,
  outputKeys: Set<string>,
): boolean => {
  const operands: DesktopBacktestSignalRuleOperand[] = [condition.left, condition.right];
  return operands.every((operand) =>
    operand.kind !== "OUTPUT" || outputKeys.has(normalizeSignalKey(operand.key)),
  );
};

const isFiniteCondition = (
  condition: DesktopBacktestSignalRuleCondition,
): boolean => {
  const operands: DesktopBacktestSignalRuleOperand[] = [condition.left, condition.right];
  return operands.every((operand) =>
    operand.kind !== "CONSTANT" || Number.isFinite(operand.value),
  );
};

const buildOperandKey = (operand: DesktopBacktestSignalRuleOperand): string => {
  switch (operand.kind) {
    case "OUTPUT":
      return `OUTPUT:${normalizeSignalKey(operand.key)}`;
    case "PRICE":
      return `PRICE:${operand.field}`;
    case "CONSTANT":
      return `CONSTANT:${Number(operand.value)}`;
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
};

const buildConditionKey = (condition: DesktopBacktestSignalRuleCondition): string =>
  [
    buildOperandKey(condition.left),
    condition.operator,
    buildOperandKey(condition.right),
  ].join("|");

const normalizeDirectionRule = (
  rule: DesktopBacktestDirectionSignalRule | undefined,
  outputKeys: Set<string>,
): DesktopBacktestDirectionSignalRule | undefined => {
  if (!rule) {
    return undefined;
  }
  const seenConditionKeys = new Set<string>();
  const conditions = rule.conditions.filter((condition) => {
    if (
      !signalRuleUsesKnownOutputs(condition, outputKeys) ||
      !isFiniteCondition(condition)
    ) {
      return false;
    }
    const conditionKey = buildConditionKey(condition);
    if (seenConditionKeys.has(conditionKey)) {
      return false;
    }
    seenConditionKeys.add(conditionKey);
    return true;
  });
  return conditions.length
    ? {
      connector: rule.connector,
      conditions,
    }
    : undefined;
};

const buildDirectionRuleKey = (
  rule: DesktopBacktestDirectionSignalRule | undefined,
): string | null => {
  if (!rule?.conditions.length) {
    return null;
  }
  return `${rule.connector}:${rule.conditions.map(buildConditionKey).join("&")}`;
};

const pruneDuplicateDirectionRules = (
  rules: DesktopBacktestSignalRules,
): DesktopBacktestSignalRules => {
  const next: DesktopBacktestSignalRules = { ...rules };
  if (
    next.buy &&
    next.cover &&
    buildDirectionRuleKey(next.buy) === buildDirectionRuleKey(next.cover)
  ) {
    delete next.cover;
  }
  if (
    next.sell &&
    next.short &&
    buildDirectionRuleKey(next.sell) === buildDirectionRuleKey(next.short)
  ) {
    delete next.sell;
  }
  return next;
};

export const sanitizeSignalRules = (
  rules: DesktopBacktestSignalRules,
  outputLines: readonly SignalRuleOutputLine[],
  reservedKeys: readonly string[],
  allowShortSelling: boolean,
): DesktopBacktestSignalRules => {
  const outputKeys = new Set(outputLines.map((line) => normalizeSignalKey(line.key)));
  const reservedSignalKeys = new Set(reservedKeys.map(normalizeSignalKey));
  const directionEntries: Array<[SignalDirection, ReservedSignalKey, boolean]> = [
    ["buy", "BUY", true],
    ["sell", "SELL", true],
    ["short", "SHORT", allowShortSelling],
    ["cover", "COVER", allowShortSelling],
  ];
  const sanitized = directionEntries.reduce<DesktopBacktestSignalRules>(
    (acc, [direction, signalKey, isAllowed]) => {
      if (!isAllowed || reservedSignalKeys.has(signalKey)) {
        return acc;
      }
      const rule = normalizeDirectionRule(rules[direction], outputKeys);
      if (rule) {
        acc[direction] = rule;
      }
      return acc;
    },
    {},
  );
  return pruneDuplicateDirectionRules(sanitized);
};

export const signalRulesEqual = (
  left: DesktopBacktestSignalRules,
  right: DesktopBacktestSignalRules,
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const hasSignalRules = (rules: DesktopBacktestSignalRules): boolean =>
  Boolean(rules.buy || rules.sell || rules.short || rules.cover);
