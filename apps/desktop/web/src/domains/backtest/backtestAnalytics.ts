// SPDX-License-Identifier: GPL-3.0-only

import {
  computeBacktestMetrics,
  type BacktestMetricsResult,
  type BacktestPersistedMetricsResult,
} from "@zinuto/shared/analytics";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";

import type { ApiBacktestBar, ApiBacktestResultDetail } from "@/api";

export type BacktestExplainMode = "simple" | "professional";

export type BacktestAnalyticsResult = BacktestMetricsResult;

const readNumber = (
  source: Record<string, unknown> | undefined,
  key: string,
): number | null => {
  const value = Number(source?.[key]);
  return Number.isFinite(value) ? value : null;
};

const readBoolean = (
  source: Record<string, unknown> | undefined,
  key: string,
): boolean => source?.[key] === true;

const readPersistedMetrics = (
  source: Record<string, unknown> | undefined,
): BacktestPersistedMetricsResult | null => {
  const value = source?.metrics;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const metrics = value as Partial<BacktestPersistedMetricsResult>;
  if (
    metrics.exact !== true ||
    metrics.returns === null ||
    typeof metrics.returns !== "object" ||
    metrics.risk === null ||
    typeof metrics.risk !== "object" ||
    metrics.trades === null ||
    typeof metrics.trades !== "object" ||
    metrics.distribution === null ||
    typeof metrics.distribution !== "object" ||
    metrics.series === null ||
    typeof metrics.series !== "object"
  ) {
    return null;
  }
  return metrics as BacktestPersistedMetricsResult;
};

const normalizeTimeframe = (value: string): BaseTimeframe | null => {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "1m" ||
    normalized === "5m" ||
    normalized === "1h" ||
    normalized === "1d"
  ) {
    return normalized;
  }
  return null;
};

const isFiniteBarClose = (
  bar: ApiBacktestBar | null | undefined,
): bar is ApiBacktestBar =>
  bar != null && Number.isFinite(bar.close) && bar.close > 0;

const resolveBenchmarkBarForPoint = (
  point: ApiBacktestResultDetail["equityCurve"][number],
  barsByRawIndex: Map<number, ApiBacktestBar>,
  barsByTime: Map<string, ApiBacktestBar>,
  relativeBars: ApiBacktestBar[],
): ApiBacktestBar | null => {
  const pointIndex = Math.max(0, Math.floor(Number(point.barIndex) || 0));
  const pointTime =
    typeof point.barTime === "string" && point.barTime.trim()
      ? point.barTime
      : null;
  const rawBar = barsByRawIndex.get(pointIndex);
  const relativeBar = relativeBars[pointIndex];
  const timeBar = pointTime ? barsByTime.get(pointTime) : undefined;

  if (pointTime && rawBar?.ts === pointTime) {
    return rawBar;
  }
  if (pointTime && relativeBar?.ts === pointTime) {
    return relativeBar;
  }
  if (timeBar) {
    return timeBar;
  }
  return rawBar ?? relativeBar ?? null;
};

const buildBenchmarkCloseByBarIndex = (
  detail: ApiBacktestResultDetail,
): Map<number, number> => {
  const closes = new Map<number, number>();
  const barsByRawIndex = new Map<number, ApiBacktestBar>();
  const barsByTime = new Map<string, ApiBacktestBar>();
  for (const bar of detail.bars) {
    if (!Number.isFinite(bar.rawIndex) || !Number.isFinite(bar.close)) {
      continue;
    }
    barsByRawIndex.set(Math.max(0, Math.floor(bar.rawIndex)), bar);
    barsByTime.set(bar.ts, bar);
  }
  for (const point of detail.equityCurve) {
    const bar = resolveBenchmarkBarForPoint(
      point,
      barsByRawIndex,
      barsByTime,
      detail.bars,
    );
    if (!isFiniteBarClose(bar)) {
      continue;
    }
    closes.set(Math.max(0, Math.floor(Number(point.barIndex) || 0)), bar.close);
  }
  return closes;
};

const hasBenchmarkComparison = (metrics: BacktestMetricsResult): boolean =>
  Boolean(metrics.benchmark && metrics.series.benchmarkEquity?.length);

export const toBacktestDetailAnalytics = (
  detail: ApiBacktestResultDetail,
): BacktestAnalyticsResult => {
  const summary = detail.result.summary;
  const persistedMetrics = readPersistedMetrics(summary);
  if (persistedMetrics && hasBenchmarkComparison(persistedMetrics)) {
    return persistedMetrics;
  }
  const benchmarkCloseByBarIndex = buildBenchmarkCloseByBarIndex(detail);
  if (
    persistedMetrics &&
    (detail.equityCurve.length < 2 || benchmarkCloseByBarIndex.size < 2)
  ) {
    return persistedMetrics;
  }
  const configInitialCapital = Number(detail.batch.config.initialCapital);
  return computeBacktestMetrics({
    equity: detail.equityCurve.map((point) => ({
      barIndex: point.barIndex,
      barTime: point.barTime,
      equity: point.equity,
      drawdown: point.drawdown,
    })),
    fills: detail.fills.map((fill) => ({
      fillIndex: fill.fillIndex,
      fillTime: fill.fillTime,
      side: fill.side,
      price: fill.price,
      qty: fill.qty,
      gross: fill.gross,
      fee: fill.fee,
      tax: fill.tax,
      slippage: fill.slippage,
    })),
    initialCapital:
      readNumber(detail.batch.summary, "initialCapital") ??
      (Number.isFinite(configInitialCapital) ? configInitialCapital : 0),
    closedTrades: readNumber(summary, "closedTrades"),
    winningTrades: readNumber(summary, "winningTrades"),
    realizedPnl: readNumber(summary, "realizedPnl"),
    benchmarkCloseByBarIndex,
    sampled:
      readBoolean(summary, "equityCurveSampled") ||
      readBoolean(detail.batch.summary, "equityCurveSampled"),
    timeframe: normalizeTimeframe(detail.result.timeframe) ?? detail.result.timeframe,
  });
};
