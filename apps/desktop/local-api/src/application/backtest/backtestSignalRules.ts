// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopBacktestDirectionSignalRule,
  DesktopBacktestSignalRuleCondition,
  DesktopBacktestSignalRuleOperand,
  DesktopBacktestSignalRules,
} from '@zinuto/shared/contracts-desktop/api';

const normalizeRuleOutputKey = (value: string): string => value.trim().toUpperCase();

const buildSignalRuleOperandKey = (
  operand: DesktopBacktestSignalRuleOperand,
): string => {
  switch (operand.kind) {
    case 'OUTPUT':
      return `OUTPUT:${normalizeRuleOutputKey(operand.key)}`;
    case 'PRICE':
      return `PRICE:${operand.field}`;
    case 'CONSTANT':
      return `CONSTANT:${Number(operand.value)}`;
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
};

const buildSignalRuleConditionKey = (
  condition: DesktopBacktestSignalRuleCondition,
): string => [
  buildSignalRuleOperandKey(condition.left),
  condition.operator,
  buildSignalRuleOperandKey(condition.right),
].join('|');

const normalizeDirectionSignalRule = (
  rule: DesktopBacktestDirectionSignalRule | undefined,
): DesktopBacktestDirectionSignalRule | undefined => {
  if (!rule) {
    return undefined;
  }
  const seenConditionKeys = new Set<string>();
  const conditions = rule.conditions.filter((condition) => {
    const conditionKey = buildSignalRuleConditionKey(condition);
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

const buildDirectionSignalRuleKey = (
  rule: DesktopBacktestDirectionSignalRule | undefined,
): string | null => {
  if (!rule?.conditions.length) {
    return null;
  }
  return `${rule.connector}:${rule.conditions.map(buildSignalRuleConditionKey).join('&')}`;
};

export const normalizeBacktestSignalRules = (
  rules: DesktopBacktestSignalRules | undefined,
  allowShortSelling: boolean,
): DesktopBacktestSignalRules | undefined => {
  if (!rules) {
    return undefined;
  }
  const normalized: DesktopBacktestSignalRules = {};
  const buy = normalizeDirectionSignalRule(rules.buy);
  const sell = normalizeDirectionSignalRule(rules.sell);
  const short = allowShortSelling ? normalizeDirectionSignalRule(rules.short) : undefined;
  const cover = allowShortSelling ? normalizeDirectionSignalRule(rules.cover) : undefined;
  if (buy) {
    normalized.buy = buy;
  }
  if (sell) {
    normalized.sell = sell;
  }
  if (short) {
    normalized.short = short;
  }
  if (cover) {
    normalized.cover = cover;
  }
  if (
    normalized.buy
    && normalized.cover
    && buildDirectionSignalRuleKey(normalized.buy) === buildDirectionSignalRuleKey(normalized.cover)
  ) {
    delete normalized.cover;
  }
  if (
    normalized.sell
    && normalized.short
    && buildDirectionSignalRuleKey(normalized.sell) === buildDirectionSignalRuleKey(normalized.short)
  ) {
    delete normalized.sell;
  }
  return normalized.buy || normalized.sell || normalized.short || normalized.cover
    ? normalized
    : undefined;
};
