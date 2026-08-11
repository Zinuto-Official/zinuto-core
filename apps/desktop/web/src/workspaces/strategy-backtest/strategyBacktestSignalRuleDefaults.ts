// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopBacktestDirectionSignalRule,
  DesktopBacktestSignalRuleCondition,
  DesktopBacktestSignalRuleOperand,
  DesktopBacktestSignalRuleOperator,
  DesktopBacktestSignalRules,
} from "@zinuto/shared/contracts-desktop/api";
import type { MessageId } from "@zinuto/shared/i18n";

export type SignalRuleOutputLine = {
  key: string;
  title: string;
};

export type SignalDirection = "buy" | "sell" | "short" | "cover";

export type StrategySignalDirectionConfig = {
  key: SignalDirection;
  signalKey: "BUY" | "SELL" | "SHORT" | "COVER";
  labelKey: MessageId;
  defaultOperator: DesktopBacktestSignalRuleOperator;
  requiresShortSelling: boolean;
};

export const STRATEGY_SIGNAL_DIRECTION_CONFIGS: readonly StrategySignalDirectionConfig[] = [
  {
    key: "buy",
    signalKey: "BUY",
    labelKey: "trainer.strategyBacktest.signalRule.direction.buy",
    defaultOperator: "CROSS_ABOVE",
    requiresShortSelling: false,
  },
  {
    key: "sell",
    signalKey: "SELL",
    labelKey: "trainer.strategyBacktest.signalRule.direction.sell",
    defaultOperator: "CROSS_BELOW",
    requiresShortSelling: false,
  },
  {
    key: "short",
    signalKey: "SHORT",
    labelKey: "trainer.strategyBacktest.signalRule.direction.short",
    defaultOperator: "CROSS_BELOW",
    requiresShortSelling: true,
  },
  {
    key: "cover",
    signalKey: "COVER",
    labelKey: "trainer.strategyBacktest.signalRule.direction.cover",
    defaultOperator: "CROSS_ABOVE",
    requiresShortSelling: true,
  },
];

const createOutputOperand = (key: string): DesktopBacktestSignalRuleOperand => ({
  kind: "OUTPUT",
  key,
});

export const createDefaultSignalRuleCondition = (
  outputLines: readonly SignalRuleOutputLine[],
  direction: StrategySignalDirectionConfig,
): DesktopBacktestSignalRuleCondition => {
  const hasPair = outputLines.length >= 2;
  return {
    left: outputLines[0] ? createOutputOperand(outputLines[0].key) : { kind: "PRICE", field: "CLOSE" },
    operator: hasPair ? direction.defaultOperator : direction.defaultOperator === "CROSS_ABOVE" ? "GREATER" : "LESS",
    right: hasPair && outputLines[1]
      ? createOutputOperand(outputLines[1].key)
      : { kind: "CONSTANT", value: 0 },
  };
};

export const pruneSignalRules = (rules: DesktopBacktestSignalRules): DesktopBacktestSignalRules => {
  const next: DesktopBacktestSignalRules = {};
  STRATEGY_SIGNAL_DIRECTION_CONFIGS.forEach(({ key }) => {
    const rule: DesktopBacktestDirectionSignalRule | undefined = rules[key];
    if (rule?.conditions.length) {
      next[key] = rule;
    }
  });
  return next;
};

export const buildDefaultSignalRules = (options: {
  outputLines: readonly SignalRuleOutputLine[];
  allowShortSelling: boolean;
  indicatorReservedKeys: readonly string[];
}): DesktopBacktestSignalRules => {
  const reservedKeys = new Set(options.indicatorReservedKeys.map((key) => key.trim().toUpperCase()));
  const defaultDirections = options.allowShortSelling
    ? STRATEGY_SIGNAL_DIRECTION_CONFIGS.filter(({ key }) => key === "buy" || key === "short")
    : STRATEGY_SIGNAL_DIRECTION_CONFIGS.filter(({ key }) => key === "buy" || key === "sell");
  return defaultDirections.reduce<DesktopBacktestSignalRules>((rules, direction) => {
    if (!options.outputLines.length || reservedKeys.has(direction.signalKey)) {
      return rules;
    }
    rules[direction.key] = {
      connector: "AND",
      conditions: [createDefaultSignalRuleCondition(options.outputLines, direction)],
    };
    return rules;
  }, {});
};
