// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "../timeframe.js";

export type BacktestMetricEquityPoint = {
  barIndex: number;
  barTime?: string | null;
  equity: number;
  drawdown?: number | null;
};

export type BacktestMetricFill = {
  fillIndex: number;
  fillTime?: string | null;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  gross: number;
  fee: number;
  tax: number;
  slippage: number;
};

export type BacktestMetricsInput = {
  equity: BacktestMetricEquityPoint[];
  fills: BacktestMetricFill[];
  initialCapital: number;
  closedTrades?: number | null;
  winningTrades?: number | null;
  realizedPnl?: number | null;
  benchmarkCloseByBarIndex?:
    Map<number, number> | Record<string, number> | null;
  riskFreeRate?: number | null;
  sampled?: boolean | null;
  timeframe?: BaseTimeframe | string | null;
  rollingWindow?: number | null;
};

export type BacktestReturnPoint = {
  barIndex: number;
  barTime: string | null;
  value: number;
};

export type BacktestDrawdownPoint = {
  barIndex: number;
  barTime: string | null;
  value: number;
};

export type BacktestRollingMetricPoint = {
  barIndex: number;
  barTime: string | null;
  value: number | null;
};

export type BacktestMonthlyReturn = {
  year: number;
  month: number;
  value: number;
};

export type BacktestHistogramBin = {
  min: number;
  max: number;
  mid: number;
  count: number;
};

export type BacktestPeriodExtreme = {
  barIndex: number;
  barTime: string | null;
  value: number;
} | null;

export type BacktestBenchmarkPoint = {
  barIndex: number;
  barTime: string | null;
  strategyEquity: number;
  benchmarkEquity: number;
  strategyReturn: number;
  benchmarkReturn: number;
};

export type BacktestRatioState =
  "FINITE" | "POSITIVE_INFINITY" | "NOT_AVAILABLE";

export type BacktestMetricsResult = {
  periodsPerYear: number;
  sampled: boolean;
  seriesSampled?: boolean;
  returns: {
    totalReturn: number;
    CAGR: number;
    annualizedReturn: number;
  };
  risk: {
    annualVolatility: number;
    sharpe: number;
    sortino: number;
    calmar: number;
    downsideDeviation: number;
    VaR95: number;
    maxDrawdown: number;
    avgDrawdown: number;
    maxDrawdownDuration: number;
    ulcerIndex: number;
    sampled: boolean;
  };
  trades: {
    totalTrades: number;
    winRate: number;
    profitFactor: number | null;
    profitFactorState: BacktestRatioState;
    payoffRatio: number | null;
    payoffRatioState: BacktestRatioState;
    grossProfit: number;
    grossLoss: number;
    expectancy: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    exposure: number;
    totalCost: number;
    totalFee: number;
    totalTax: number;
    totalSlippage: number;
    realizedPnl: number;
  };
  benchmark?: {
    benchmarkReturn: number;
    excessReturn: number;
    alpha: number;
    beta: number;
    informationRatio: number;
    correlation: number;
    trackingError: number;
  };
  distribution: {
    histogram: BacktestHistogramBin[];
    skewness: number;
    kurtosis: number;
    bestPeriod: BacktestPeriodExtreme;
    worstPeriod: BacktestPeriodExtreme;
  };
  series: {
    returns: BacktestReturnPoint[];
    drawdown: BacktestDrawdownPoint[];
    rollingSharpe: BacktestRollingMetricPoint[];
    rollingVolatility: BacktestRollingMetricPoint[];
    monthly: BacktestMonthlyReturn[];
    benchmarkEquity?: BacktestBenchmarkPoint[];
  };
};

export type BacktestPersistedMetricsResult = BacktestMetricsResult & {
  exact: true;
  seriesSampled: boolean;
};
