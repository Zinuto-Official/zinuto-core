// SPDX-License-Identifier: GPL-3.0-only

import { normalizeBaseTimeframe, TIMEFRAME_MINUTES } from "../timeframe.js";

const YEAR_DAYS = 365.2425;
const YEAR_MS = YEAR_DAYS * 24 * 60 * 60 * 1000;
const YEAR_MINUTES = YEAR_DAYS * 24 * 60;
const EPSILON = 1e-12;
const DEFAULT_ROLLING_WINDOW = 20;
const DEFAULT_HISTOGRAM_BINS = 12;
const DEFAULT_PERSISTED_SERIES_POINTS = 400;

import type {
  BacktestBenchmarkPoint,
  BacktestHistogramBin,
  BacktestMetricEquityPoint,
  BacktestMetricFill,
  BacktestMetricsInput,
  BacktestMetricsResult,
  BacktestMonthlyReturn,
  BacktestPeriodExtreme,
  BacktestPersistedMetricsResult,
  BacktestReturnPoint,
  BacktestRollingMetricPoint,
} from "./backtestMetricTypes.js";

export type * from "./backtestMetricTypes.js";

type NormalizedEquityPoint = {
  barIndex: number;
  barTime: string | null;
  timeMs: number | null;
  equity: number;
  drawdown: number;
};

type TradeStats = {
  tradePnl: number[];
  totalCost: number;
  totalFee: number;
  totalTax: number;
  totalSlippage: number;
};

type BenchmarkCloseLookup = (barIndex: number) => number | null;

const finiteOr = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeRatio = (numerator: number, denominator: number): number =>
  Math.abs(denominator) > EPSILON && Number.isFinite(numerator)
    ? numerator / denominator
    : 0;

const clampNonNegativeInteger = (value: unknown): number => {
  const numeric = Math.floor(finiteOr(value, 0));
  return numeric > 0 ? numeric : 0;
};

const parseTimeMs = (value: string | null | undefined): number | null => {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
};

const normalizeEquity = (
  equity: BacktestMetricEquityPoint[],
  initialCapital: number,
): NormalizedEquityPoint[] => {
  const points = equity
    .map((point) => ({
      barIndex: clampNonNegativeInteger(point.barIndex),
      barTime:
        typeof point.barTime === "string" && point.barTime.trim()
          ? point.barTime.trim()
          : null,
      timeMs: parseTimeMs(point.barTime),
      equity: finiteOr(point.equity, Number.NaN),
      drawdown: Math.max(0, finiteOr(point.drawdown, Number.NaN)),
    }))
    .filter((point) => Number.isFinite(point.equity))
    .sort((left, right) => left.barIndex - right.barIndex);

  let peak =
    initialCapital > EPSILON ? initialCapital : (points[0]?.equity ?? 0);
  return points.map((point) => {
    peak = Math.max(peak, point.equity);
    const computedDrawdown =
      peak > EPSILON ? Math.max(0, (peak - point.equity) / peak) : 0;
    return {
      ...point,
      drawdown: Number.isFinite(point.drawdown)
        ? Math.max(point.drawdown, computedDrawdown)
        : computedDrawdown,
    };
  });
};

const buildReturns = (
  points: NormalizedEquityPoint[],
): BacktestReturnPoint[] => {
  const returns: BacktestReturnPoint[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    returns.push({
      barIndex: current.barIndex,
      barTime: current.barTime,
      value:
        Math.abs(previous.equity) > EPSILON
          ? current.equity / previous.equity - 1
          : 0,
    });
  }
  return returns;
};

const resolvePeriodsPerYear = (
  points: NormalizedEquityPoint[],
  timeframe: BacktestMetricsInput["timeframe"],
): number => {
  const timedPoints = points.filter((point) => point.timeMs !== null);
  if (timedPoints.length >= 2) {
    const first = timedPoints[0]!;
    const last = timedPoints[timedPoints.length - 1]!;
    const elapsedYears = ((last.timeMs ?? 0) - (first.timeMs ?? 0)) / YEAR_MS;
    if (elapsedYears > EPSILON) {
      return Math.max(1, (timedPoints.length - 1) / elapsedYears);
    }
  }

  const baseTimeframe = normalizeBaseTimeframe(timeframe);
  if (baseTimeframe) {
    return YEAR_MINUTES / TIMEFRAME_MINUTES[baseTimeframe];
  }
  return 252;
};

const mean = (values: number[]): number =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const variance = (values: number[], sample = true): number => {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  const divisor = sample ? values.length - 1 : values.length;
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / divisor;
};

const standardDeviation = (values: number[], sample = true): number =>
  Math.sqrt(Math.max(0, variance(values, sample)));

const covariance = (left: number[], right: number[]): number => {
  const count = Math.min(left.length, right.length);
  if (count < 2) {
    return 0;
  }
  const leftMean = mean(left.slice(0, count));
  const rightMean = mean(right.slice(0, count));
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    sum += (left[index]! - leftMean) * (right[index]! - rightMean);
  }
  return sum / (count - 1);
};

const percentile = (values: number[], probability: number): number => {
  if (!values.length) {
    return 0;
  }
  const ordered = [...values].sort((left, right) => left - right);
  const position = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(probability * ordered.length) - 1),
  );
  return ordered[position] ?? 0;
};

const compoundReturn = (values: number[]): number =>
  values.reduce((product, value) => product * (1 + value), 1) - 1;

const annualizedArithmeticReturn = (
  values: number[],
  periodsPerYear: number,
): number => mean(values) * periodsPerYear;

const annualizedGeometricReturn = (
  totalReturn: number,
  periodCount: number,
  periodsPerYear: number,
): number => {
  if (periodCount <= 0 || 1 + totalReturn <= 0) {
    return 0;
  }
  return (1 + totalReturn) ** (periodsPerYear / periodCount) - 1;
};

const computeDownsideDeviation = (
  returns: number[],
  riskFreeRate: number,
  periodsPerYear: number,
): { period: number; annualized: number } => {
  if (!returns.length) {
    return { period: 0, annualized: 0 };
  }
  const periodRiskFreeRate = (1 + riskFreeRate) ** (1 / periodsPerYear) - 1;
  const downsideSquares = returns.map(
    (value) => Math.min(0, value - periodRiskFreeRate) ** 2,
  );
  const period = Math.sqrt(mean(downsideSquares));
  return {
    period,
    annualized: period * Math.sqrt(periodsPerYear),
  };
};

const maxDrawdownDuration = (drawdowns: number[]): number => {
  let current = 0;
  let maximum = 0;
  for (const drawdown of drawdowns) {
    if (drawdown > EPSILON) {
      current += 1;
      maximum = Math.max(maximum, current);
      continue;
    }
    current = 0;
  }
  return maximum;
};

const buildHistogram = (
  values: number[],
  targetBins = DEFAULT_HISTOGRAM_BINS,
): BacktestHistogramBin[] => {
  if (!values.length) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (Math.abs(max - min) <= EPSILON) {
    return [{ min, max, mid: min, count: values.length }];
  }
  const binCount = Math.min(
    targetBins,
    Math.max(4, Math.ceil(Math.sqrt(values.length))),
  );
  const step = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    min: min + index * step,
    max: index === binCount - 1 ? max : min + (index + 1) * step,
    mid: min + (index + 0.5) * step,
    count: 0,
  }));
  for (const value of values) {
    const index = Math.min(
      binCount - 1,
      Math.max(0, Math.floor((value - min) / step)),
    );
    bins[index]!.count += 1;
  }
  return bins;
};

const computeShape = (
  values: number[],
): { skewness: number; kurtosis: number } => {
  if (values.length < 2) {
    return { skewness: 0, kurtosis: 0 };
  }
  const avg = mean(values);
  const populationStd = standardDeviation(values, false);
  if (populationStd <= EPSILON) {
    return { skewness: 0, kurtosis: 0 };
  }
  const moments = values.reduce(
    (acc, value) => {
      const z = (value - avg) / populationStd;
      acc.third += z ** 3;
      acc.fourth += z ** 4;
      return acc;
    },
    { third: 0, fourth: 0 },
  );
  return {
    skewness: moments.third / values.length,
    kurtosis: moments.fourth / values.length - 3,
  };
};

const findExtreme = (
  returns: BacktestReturnPoint[],
  direction: "best" | "worst",
): BacktestPeriodExtreme => {
  if (!returns.length) {
    return null;
  }
  return returns.reduce((selected, item) =>
    direction === "best"
      ? item.value > selected.value
        ? item
        : selected
      : item.value < selected.value
        ? item
        : selected,
  );
};

const computeMonthlyReturns = (
  returns: BacktestReturnPoint[],
): BacktestMonthlyReturn[] => {
  const grouped = new Map<
    string,
    { year: number; month: number; values: number[] }
  >();
  for (const item of returns) {
    const timestamp = parseTimeMs(item.barTime);
    if (timestamp === null) {
      continue;
    }
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const key = `${year}-${month}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.values.push(item.value);
    } else {
      grouped.set(key, { year, month, values: [item.value] });
    }
  }
  return Array.from(grouped.values())
    .sort((left, right) => left.year - right.year || left.month - right.month)
    .map((item) => ({
      year: item.year,
      month: item.month,
      value: compoundReturn(item.values),
    }));
};

const buildRollingSeries = (
  returns: BacktestReturnPoint[],
  periodsPerYear: number,
  riskFreeRate: number,
  rollingWindow: number,
): {
  rollingSharpe: BacktestRollingMetricPoint[];
  rollingVolatility: BacktestRollingMetricPoint[];
} => {
  const periodRiskFreeRate = (1 + riskFreeRate) ** (1 / periodsPerYear) - 1;
  const window = Math.max(2, Math.floor(rollingWindow));
  const rollingSharpe: BacktestRollingMetricPoint[] = [];
  const rollingVolatility: BacktestRollingMetricPoint[] = [];
  for (let index = 0; index < returns.length; index += 1) {
    const item = returns[index]!;
    const start = Math.max(0, index - window + 1);
    const sample = returns.slice(start, index + 1).map((point) => point.value);
    const volatility =
      sample.length >= 2
        ? standardDeviation(sample) * Math.sqrt(periodsPerYear)
        : 0;
    const sharpe =
      volatility > EPSILON
        ? (mean(sample.map((value) => value - periodRiskFreeRate)) /
            standardDeviation(sample)) *
          Math.sqrt(periodsPerYear)
        : 0;
    rollingSharpe.push({
      barIndex: item.barIndex,
      barTime: item.barTime,
      value: sample.length >= 2 ? sharpe : null,
    });
    rollingVolatility.push({
      barIndex: item.barIndex,
      barTime: item.barTime,
      value: sample.length >= 2 ? volatility : null,
    });
  }
  return { rollingSharpe, rollingVolatility };
};

const normalizeFill = (fill: BacktestMetricFill): BacktestMetricFill => ({
  fillIndex: clampNonNegativeInteger(fill.fillIndex),
  fillTime:
    typeof fill.fillTime === "string" && fill.fillTime.trim()
      ? fill.fillTime.trim()
      : null,
  side: fill.side === "SELL" ? "SELL" : "BUY",
  price: Math.max(0, finiteOr(fill.price, 0)),
  qty: Math.max(0, finiteOr(fill.qty, 0)),
  gross: finiteOr(fill.gross, 0),
  fee: Math.max(0, finiteOr(fill.fee, 0)),
  tax: Math.max(0, finiteOr(fill.tax, 0)),
  slippage: Math.max(0, finiteOr(fill.slippage, 0)),
});

const computeTradeStats = (fills: BacktestMetricFill[]): TradeStats => {
  const ordered = fills
    .map(normalizeFill)
    .sort(
      (left, right) =>
        left.fillIndex - right.fillIndex ||
        String(left.fillTime ?? "").localeCompare(String(right.fillTime ?? "")),
    );
  let positionQty = 0;
  let avgCost = 0;
  let openCost = 0;
  const tradePnl: number[] = [];
  const totals = ordered.reduce(
    (sum, fill) => ({
      totalFee: sum.totalFee + fill.fee,
      totalTax: sum.totalTax + fill.tax,
      totalSlippage: sum.totalSlippage + fill.slippage,
    }),
    { totalFee: 0, totalTax: 0, totalSlippage: 0 },
  );

  for (const fill of ordered) {
    if (fill.qty <= EPSILON || fill.price <= EPSILON) {
      continue;
    }
    const multiplier =
      Math.abs(fill.gross) > EPSILON
        ? Math.abs(fill.gross) / Math.max(fill.qty * fill.price, EPSILON)
        : 1;
    const signedQty = fill.side === "BUY" ? fill.qty : -fill.qty;
    const cost = fill.fee + fill.tax + fill.slippage;
    const previousQty = positionQty;

    if (
      Math.abs(previousQty) <= EPSILON ||
      Math.sign(previousQty) === Math.sign(signedQty)
    ) {
      const nextQty = previousQty + signedQty;
      avgCost =
        Math.abs(nextQty) > EPSILON
          ? (Math.abs(previousQty) * avgCost +
              Math.abs(signedQty) * fill.price) /
            Math.abs(nextQty)
          : 0;
      positionQty = nextQty;
      openCost = Math.max(0, openCost + cost);
      continue;
    }

    const closedQty = Math.min(Math.abs(previousQty), Math.abs(signedQty));
    const entryCost = openCost * safeRatio(closedQty, Math.abs(previousQty));
    const closeCost = cost * safeRatio(closedQty, fill.qty);
    const pnl =
      previousQty > 0
        ? (fill.price - avgCost) * closedQty * multiplier -
          entryCost -
          closeCost
        : (avgCost - fill.price) * closedQty * multiplier -
          entryCost -
          closeCost;
    tradePnl.push(pnl);

    const remainingSignedQty = previousQty + signedQty;
    if (Math.abs(remainingSignedQty) <= EPSILON) {
      positionQty = 0;
      avgCost = 0;
      openCost = 0;
    } else if (Math.sign(remainingSignedQty) === Math.sign(previousQty)) {
      positionQty = remainingSignedQty;
      openCost = Math.max(0, openCost - entryCost);
    } else {
      positionQty = remainingSignedQty;
      avgCost = fill.price;
      openCost = Math.max(0, cost - closeCost);
    }
  }

  return {
    tradePnl,
    totalCost: totals.totalFee + totals.totalTax + totals.totalSlippage,
    ...totals,
  };
};

const computeStreaks = (
  tradePnl: number[],
): {
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
} => {
  let winStreak = 0;
  let lossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  for (const pnl of tradePnl) {
    if (pnl > EPSILON) {
      winStreak += 1;
      lossStreak = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, winStreak);
    } else if (pnl < -EPSILON) {
      lossStreak += 1;
      winStreak = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, lossStreak);
    } else {
      winStreak = 0;
      lossStreak = 0;
    }
  }
  return { maxConsecutiveWins, maxConsecutiveLosses };
};

const computeExposure = (
  points: NormalizedEquityPoint[],
  fills: BacktestMetricFill[],
): number => {
  if (points.length < 2) {
    return 0;
  }
  const fillsByIndex = new Map<number, BacktestMetricFill[]>();
  for (const fill of fills.map(normalizeFill)) {
    const current = fillsByIndex.get(fill.fillIndex) ?? [];
    current.push(fill);
    fillsByIndex.set(fill.fillIndex, current);
  }

  let positionQty = 0;
  let exposedPeriods = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const pointFills = fillsByIndex.get(point.barIndex) ?? [];
    for (const fill of pointFills) {
      positionQty += fill.side === "BUY" ? fill.qty : -fill.qty;
    }
    if (Math.abs(positionQty) > EPSILON) {
      exposedPeriods += 1;
    }
  }
  return exposedPeriods / (points.length - 1);
};

const buildBenchmarkLookup = (
  source: BacktestMetricsInput["benchmarkCloseByBarIndex"],
): BenchmarkCloseLookup => {
  if (source instanceof Map) {
    return (barIndex) => {
      const value = source.get(barIndex);
      return Number.isFinite(value) ? Number(value) : null;
    };
  }
  if (source && typeof source === "object") {
    return (barIndex) => {
      const value = source[String(barIndex)];
      return Number.isFinite(value) ? Number(value) : null;
    };
  }
  return () => null;
};

const computeBenchmark = (
  points: NormalizedEquityPoint[],
  returns: BacktestReturnPoint[],
  initialCapital: number,
  totalReturn: number,
  periodsPerYear: number,
  riskFreeRate: number,
  benchmarkCloseByBarIndex: BacktestMetricsInput["benchmarkCloseByBarIndex"],
): {
  metrics?: BacktestMetricsResult["benchmark"];
  benchmarkEquity?: BacktestBenchmarkPoint[];
} => {
  const lookup = buildBenchmarkLookup(benchmarkCloseByBarIndex);
  const aligned = points
    .map((point, index) => ({
      point,
      close: lookup(point.barIndex) ?? lookup(index),
    }))
    .filter(
      (item): item is { point: NormalizedEquityPoint; close: number } =>
        typeof item.close === "number" &&
        Number.isFinite(item.close) &&
        item.close > EPSILON,
    );
  if (aligned.length < 2) {
    return {};
  }

  const startClose = aligned[0]!.close;
  const startEquity = aligned[0]!.point.equity;
  const benchmarkEquity: BacktestBenchmarkPoint[] = aligned.map((item) => ({
    barIndex: item.point.barIndex,
    barTime: item.point.barTime,
    strategyEquity: item.point.equity,
    benchmarkEquity: initialCapital * (item.close / startClose),
    strategyReturn:
      Math.abs(startEquity) > EPSILON ? item.point.equity / startEquity - 1 : 0,
    benchmarkReturn: item.close / startClose - 1,
  }));

  const returnByBarIndex = new Map(
    returns.map((item) => [item.barIndex, item.value]),
  );
  const strategyReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  for (let index = 1; index < aligned.length; index += 1) {
    const previous = aligned[index - 1]!;
    const current = aligned[index]!;
    const strategyReturn = returnByBarIndex.get(current.point.barIndex);
    if (!Number.isFinite(strategyReturn)) {
      continue;
    }
    strategyReturns.push(strategyReturn ?? 0);
    benchmarkReturns.push(current.close / previous.close - 1);
  }
  if (strategyReturns.length < 2 || benchmarkReturns.length < 2) {
    const benchmarkReturn = aligned[aligned.length - 1]!.close / startClose - 1;
    return {
      benchmarkEquity,
      metrics: {
        benchmarkReturn,
        excessReturn: totalReturn - benchmarkReturn,
        alpha: 0,
        beta: 0,
        informationRatio: 0,
        correlation: 0,
        trackingError: 0,
      },
    };
  }

  const benchmarkReturn = aligned[aligned.length - 1]!.close / startClose - 1;
  const activeReturns = strategyReturns.map(
    (value, index) => value - benchmarkReturns[index]!,
  );
  const benchmarkVariance = variance(benchmarkReturns);
  const beta =
    benchmarkVariance > EPSILON
      ? covariance(strategyReturns, benchmarkReturns) / benchmarkVariance
      : 0;
  const strategyAnnualReturn = annualizedArithmeticReturn(
    strategyReturns,
    periodsPerYear,
  );
  const benchmarkAnnualReturn = annualizedArithmeticReturn(
    benchmarkReturns,
    periodsPerYear,
  );
  const trackingError =
    standardDeviation(activeReturns) * Math.sqrt(periodsPerYear);
  const strategyStd = standardDeviation(strategyReturns);
  const benchmarkStd = standardDeviation(benchmarkReturns);
  return {
    benchmarkEquity,
    metrics: {
      benchmarkReturn,
      excessReturn: totalReturn - benchmarkReturn,
      alpha:
        strategyAnnualReturn -
        (riskFreeRate + beta * (benchmarkAnnualReturn - riskFreeRate)),
      beta,
      informationRatio:
        trackingError > EPSILON
          ? (mean(activeReturns) / standardDeviation(activeReturns)) *
            Math.sqrt(periodsPerYear)
          : 0,
      correlation:
        strategyStd > EPSILON && benchmarkStd > EPSILON
          ? covariance(strategyReturns, benchmarkReturns) /
            (strategyStd * benchmarkStd)
          : 0,
      trackingError,
    },
  };
};

export const computeBacktestMetrics = (
  input: BacktestMetricsInput,
): BacktestMetricsResult => {
  const initialCapital = Math.max(0, finiteOr(input.initialCapital, 0));
  const points = normalizeEquity(input.equity, initialCapital);
  const returns = buildReturns(points);
  const returnValues = returns
    .map((item) => item.value)
    .filter(Number.isFinite);
  const periodsPerYear = resolvePeriodsPerYear(points, input.timeframe);
  const riskFreeRate = finiteOr(input.riskFreeRate, 0);
  const finalEquity = points[points.length - 1]?.equity ?? initialCapital;
  const totalReturn =
    initialCapital > EPSILON ? finalEquity / initialCapital - 1 : 0;
  const annualizedReturn = annualizedArithmeticReturn(
    returnValues,
    periodsPerYear,
  );
  const cagr = annualizedGeometricReturn(
    totalReturn,
    returnValues.length,
    periodsPerYear,
  );
  const returnStd = standardDeviation(returnValues);
  const annualVolatility = returnStd * Math.sqrt(periodsPerYear);
  const periodRiskFreeRate = (1 + riskFreeRate) ** (1 / periodsPerYear) - 1;
  const excessReturns = returnValues.map((value) => value - periodRiskFreeRate);
  const sharpe =
    returnStd > EPSILON
      ? (mean(excessReturns) / returnStd) * Math.sqrt(periodsPerYear)
      : 0;
  const downside = computeDownsideDeviation(
    returnValues,
    riskFreeRate,
    periodsPerYear,
  );
  const sortino =
    downside.period > EPSILON
      ? (mean(excessReturns) / downside.period) * Math.sqrt(periodsPerYear)
      : 0;
  const drawdowns = points.map((point) => point.drawdown);
  const maxDrawdown = drawdowns.length ? Math.max(...drawdowns) : 0;
  const avgDrawdown = mean(drawdowns.filter((value) => value > EPSILON));
  const ulcerIndex = Math.sqrt(mean(drawdowns.map((value) => value ** 2)));
  const tradeStats = computeTradeStats(input.fills);
  const grossProfit = tradeStats.tradePnl
    .filter((value) => value > EPSILON)
    .reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(
    tradeStats.tradePnl
      .filter((value) => value < -EPSILON)
      .reduce((sum, value) => sum + value, 0),
  );
  const wins = tradeStats.tradePnl.filter((value) => value > EPSILON);
  const losses = tradeStats.tradePnl.filter((value) => value < -EPSILON);
  const summaryClosedTrades = clampNonNegativeInteger(input.closedTrades);
  const summaryWinningTrades = clampNonNegativeInteger(input.winningTrades);
  const totalTrades = summaryClosedTrades || tradeStats.tradePnl.length;
  const winningTrades = summaryClosedTrades
    ? summaryWinningTrades
    : wins.length;
  const realizedPnl = Number.isFinite(Number(input.realizedPnl))
    ? Number(input.realizedPnl)
    : tradeStats.tradePnl.reduce((sum, value) => sum + value, 0);
  const streaks = computeStreaks(tradeStats.tradePnl);
  const profitFactor =
    grossLoss > EPSILON
      ? {
          value: grossProfit / grossLoss,
          state: "FINITE" as const,
        }
      : grossProfit > EPSILON
        ? {
            value: null,
            state: "POSITIVE_INFINITY" as const,
          }
        : {
            value: null,
            state: "NOT_AVAILABLE" as const,
          };
  const payoffRatio = losses.length
    ? {
        value: mean(wins) / Math.abs(mean(losses)),
        state: "FINITE" as const,
      }
    : wins.length
      ? {
          value: null,
          state: "POSITIVE_INFINITY" as const,
        }
      : {
          value: null,
          state: "NOT_AVAILABLE" as const,
        };
  const benchmark = computeBenchmark(
    points,
    returns,
    initialCapital,
    totalReturn,
    periodsPerYear,
    riskFreeRate,
    input.benchmarkCloseByBarIndex,
  );
  const rollingWindow =
    clampNonNegativeInteger(input.rollingWindow) || DEFAULT_ROLLING_WINDOW;
  const rolling = buildRollingSeries(
    returns,
    periodsPerYear,
    riskFreeRate,
    rollingWindow,
  );
  const shape = computeShape(returnValues);
  const sampled = Boolean(input.sampled);

  return {
    periodsPerYear,
    sampled,
    returns: {
      totalReturn,
      CAGR: cagr,
      annualizedReturn,
    },
    risk: {
      annualVolatility,
      sharpe,
      sortino,
      calmar: maxDrawdown > EPSILON ? cagr / maxDrawdown : 0,
      downsideDeviation: downside.annualized,
      VaR95: percentile(returnValues, 0.05),
      maxDrawdown,
      avgDrawdown,
      maxDrawdownDuration: maxDrawdownDuration(drawdowns),
      ulcerIndex,
      sampled,
    },
    trades: {
      totalTrades,
      winRate: totalTrades > 0 ? winningTrades / totalTrades : 0,
      profitFactor: profitFactor.value,
      profitFactorState: profitFactor.state,
      payoffRatio: payoffRatio.value,
      payoffRatioState: payoffRatio.state,
      grossProfit,
      grossLoss,
      expectancy: tradeStats.tradePnl.length ? mean(tradeStats.tradePnl) : 0,
      avgWin: mean(wins),
      avgLoss: losses.length ? mean(losses) : 0,
      largestWin: wins.length ? Math.max(...wins) : 0,
      largestLoss: losses.length ? Math.min(...losses) : 0,
      maxConsecutiveWins: streaks.maxConsecutiveWins,
      maxConsecutiveLosses: streaks.maxConsecutiveLosses,
      exposure: computeExposure(points, input.fills),
      totalCost: tradeStats.totalCost,
      totalFee: tradeStats.totalFee,
      totalTax: tradeStats.totalTax,
      totalSlippage: tradeStats.totalSlippage,
      realizedPnl,
    },
    ...(benchmark.metrics ? { benchmark: benchmark.metrics } : {}),
    distribution: {
      histogram: buildHistogram(returnValues),
      skewness: shape.skewness,
      kurtosis: shape.kurtosis,
      bestPeriod: findExtreme(returns, "best"),
      worstPeriod: findExtreme(returns, "worst"),
    },
    series: {
      returns,
      drawdown: points.map((point) => ({
        barIndex: point.barIndex,
        barTime: point.barTime,
        value: -Math.abs(point.drawdown),
      })),
      rollingSharpe: rolling.rollingSharpe,
      rollingVolatility: rolling.rollingVolatility,
      monthly: computeMonthlyReturns(returns),
      ...(benchmark.benchmarkEquity
        ? { benchmarkEquity: benchmark.benchmarkEquity }
        : {}),
    },
  };
};

const downsampleSeries = <T>(
  points: readonly T[],
  targetCount = DEFAULT_PERSISTED_SERIES_POINTS,
): T[] => {
  const normalizedTarget = Math.max(2, Math.floor(targetCount));
  if (points.length <= normalizedTarget) {
    return [...points];
  }
  const result: T[] = [];
  const lastIndex = points.length - 1;
  const denominator = normalizedTarget - 1;
  for (let index = 0; index < normalizedTarget; index += 1) {
    const sourceIndex = Math.round((index * lastIndex) / denominator);
    result.push(points[sourceIndex]!);
  }
  return result;
};

const assertPersistedJsonNumbers = <T>(value: T): T => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("BACKTEST_METRICS_NON_FINITE_NUMBER");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => assertPersistedJsonNumbers(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        assertPersistedJsonNumbers(entryValue),
      ]),
    ) as T;
  }
  return value;
};

export const toBacktestPersistedMetrics = (
  metrics: BacktestMetricsResult,
  maxSeriesPoints = DEFAULT_PERSISTED_SERIES_POINTS,
): BacktestPersistedMetricsResult => {
  const returns = downsampleSeries(metrics.series.returns, maxSeriesPoints);
  const drawdown = downsampleSeries(metrics.series.drawdown, maxSeriesPoints);
  const rollingSharpe = downsampleSeries(
    metrics.series.rollingSharpe,
    maxSeriesPoints,
  );
  const rollingVolatility = downsampleSeries(
    metrics.series.rollingVolatility,
    maxSeriesPoints,
  );
  const benchmarkEquity = metrics.series.benchmarkEquity
    ? downsampleSeries(metrics.series.benchmarkEquity, maxSeriesPoints)
    : undefined;
  const seriesSampled =
    returns.length < metrics.series.returns.length ||
    drawdown.length < metrics.series.drawdown.length ||
    rollingSharpe.length < metrics.series.rollingSharpe.length ||
    rollingVolatility.length < metrics.series.rollingVolatility.length ||
    (benchmarkEquity
      ? benchmarkEquity.length < (metrics.series.benchmarkEquity?.length ?? 0)
      : false);

  return assertPersistedJsonNumbers({
    ...metrics,
    exact: true,
    sampled: false,
    seriesSampled,
    risk: {
      ...metrics.risk,
      sampled: false,
    },
    series: {
      ...metrics.series,
      returns,
      drawdown,
      rollingSharpe,
      rollingVolatility,
      ...(benchmarkEquity ? { benchmarkEquity } : {}),
    },
  });
};
