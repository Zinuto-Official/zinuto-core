// SPDX-License-Identifier: GPL-3.0-only

import type { BacktestRatioState } from "@zinuto/shared/analytics";

export type StrategyBacktestFinancialTone = "positive" | "negative" | "neutral";

export const formatStrategyBacktestRatio = (
  value: number | null | undefined,
  state: BacktestRatioState,
  formatRatio: (finiteValue: number) => string,
  notAvailableLabel: string,
): string => {
  if (state === "POSITIVE_INFINITY") {
    return "∞";
  }
  if (
    state !== "FINITE" ||
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return notAvailableLabel;
  }
  return formatRatio(value);
};

const readFiniteNumber = (value: number | null | undefined): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const resolveStrategyBacktestSignedFinancialTone = (
  value: number | null | undefined,
): StrategyBacktestFinancialTone => {
  const numeric = readFiniteNumber(value);
  if (numeric === null || numeric === 0) {
    return "neutral";
  }
  return numeric > 0 ? "positive" : "negative";
};

export const resolveStrategyBacktestLossFinancialTone = (
  value: number | null | undefined,
): StrategyBacktestFinancialTone => {
  const numeric = readFiniteNumber(value);
  return numeric === null || numeric === 0 ? "neutral" : "negative";
};

export const resolveStrategyBacktestProfitFactorFinancialTone = (
  value: number | null | undefined,
  state: BacktestRatioState = "FINITE",
): StrategyBacktestFinancialTone => {
  if (state === "POSITIVE_INFINITY") {
    return "positive";
  }
  if (state !== "FINITE") {
    return "neutral";
  }
  const numeric = readFiniteNumber(value);
  if (numeric === null || numeric === 1) {
    return "neutral";
  }
  return numeric > 1 ? "positive" : "negative";
};
