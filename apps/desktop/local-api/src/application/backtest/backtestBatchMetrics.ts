// SPDX-License-Identifier: GPL-3.0-only

type BacktestResultMetricInput = {
  profitRate: number;
  maxDrawdown: number;
  tradeCount: number;
};

export type BacktestBatchMetricAccumulator = {
  resultCount: number;
  profitableResultCount: number;
  finiteProfitRateCount: number;
  profitRateTotal: number;
  maxDrawdown: number | null;
  totalTrades: number;
};

export type BacktestBatchMetricSummary = {
  profitableResultCount: number;
  averageProfitRate: number | null;
  maxDrawdown: number | null;
  totalTrades: number;
};

export const createBacktestBatchMetricAccumulator = (): BacktestBatchMetricAccumulator => ({
  resultCount: 0,
  profitableResultCount: 0,
  finiteProfitRateCount: 0,
  profitRateTotal: 0,
  maxDrawdown: null,
  totalTrades: 0,
});

export const addBacktestResultMetrics = (
  accumulator: BacktestBatchMetricAccumulator,
  result: BacktestResultMetricInput,
): void => {
  accumulator.resultCount += 1;
  const profitRate = Number(result.profitRate);
  if (Number.isFinite(profitRate)) {
    accumulator.finiteProfitRateCount += 1;
    accumulator.profitRateTotal += profitRate;
    if (profitRate > 0) {
      accumulator.profitableResultCount += 1;
    }
  }
  const maxDrawdown = Number(result.maxDrawdown);
  if (Number.isFinite(maxDrawdown)) {
    accumulator.maxDrawdown = accumulator.maxDrawdown === null
      ? maxDrawdown
      : Math.max(accumulator.maxDrawdown, maxDrawdown);
  }
  const tradeCount = Number(result.tradeCount);
  if (Number.isFinite(tradeCount)) {
    accumulator.totalTrades += Math.max(0, Math.floor(tradeCount));
  }
};

export const finishBacktestBatchMetrics = (
  accumulator: BacktestBatchMetricAccumulator,
): BacktestBatchMetricSummary => ({
  profitableResultCount: accumulator.profitableResultCount,
  averageProfitRate: accumulator.finiteProfitRateCount > 0
    ? accumulator.profitRateTotal / accumulator.finiteProfitRateCount
    : null,
  maxDrawdown: accumulator.maxDrawdown,
  totalTrades: accumulator.totalTrades,
});

export const summarizeBacktestBatchMetrics = (
  results: readonly BacktestResultMetricInput[],
): BacktestBatchMetricSummary => {
  const accumulator = createBacktestBatchMetricAccumulator();
  results.forEach((result) => addBacktestResultMetrics(accumulator, result));
  return finishBacktestBatchMetrics(accumulator);
};
