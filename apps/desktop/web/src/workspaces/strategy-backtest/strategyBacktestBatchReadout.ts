// SPDX-License-Identifier: GPL-3.0-only

import type { ApiBacktestBatch } from "@/api";

export type StrategyBacktestBatchReadout = {
  resultCount: number;
  profitableResultCount: number;
  profitableRate: number | null;
  maxDrawdown: number | null;
  averageProfitRate: number | null;
  bestSymbol: string | null;
  bestProfitRate: number | null;
  totalTrades: number;
};

const readFiniteNumber = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const readText = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

export const EMPTY_STRATEGY_BACKTEST_BATCH_READOUT: StrategyBacktestBatchReadout = {
  resultCount: 0,
  profitableResultCount: 0,
  profitableRate: null,
  maxDrawdown: null,
  averageProfitRate: null,
  bestSymbol: null,
  bestProfitRate: null,
  totalTrades: 0,
};

export const buildStrategyBacktestBatchReadout = (
  batch: ApiBacktestBatch | null,
): StrategyBacktestBatchReadout => {
  const summary = batch?.summary;
  const resultCount = Math.max(0, Math.floor(readFiniteNumber(summary?.totalSymbols) ?? 0));
  const profitableResultCount = Math.max(
    0,
    Math.floor(readFiniteNumber(summary?.profitableResultCount) ?? 0),
  );

  return {
    resultCount,
    profitableResultCount,
    profitableRate: resultCount > 0 ? profitableResultCount / resultCount : null,
    maxDrawdown: readFiniteNumber(summary?.maxDrawdown),
    averageProfitRate: readFiniteNumber(summary?.averageProfitRate),
    bestSymbol: readText(summary?.bestSymbol),
    bestProfitRate: readFiniteNumber(summary?.bestProfitRate),
    totalTrades: Math.max(0, Math.floor(readFiniteNumber(summary?.totalTrades) ?? 0)),
  };
};
