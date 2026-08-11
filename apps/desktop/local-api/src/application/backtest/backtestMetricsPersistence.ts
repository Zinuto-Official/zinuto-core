// SPDX-License-Identifier: GPL-3.0-only

import {
  computeBacktestMetrics,
  toBacktestPersistedMetrics,
} from '@zinuto/shared/analytics';
import type { OhlcvBar } from '../../domain/models.js';
import type {
  BacktestConfig,
  BacktestEngineEquityPoint,
  BacktestInstrumentRunResult,
} from './types.js';

const readFiniteNumber = (
  source: Record<string, unknown>,
  key: string,
): number | null => {
  const value = Number(source[key]);
  return Number.isFinite(value) ? value : null;
};

type BacktestMetricsPersistenceOptions = {
  rawStartIndex?: number | null;
};

const resolveRawStartIndex = (
  options: BacktestMetricsPersistenceOptions,
): number | null => {
  const value = Number(options.rawStartIndex);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
};

const isFiniteCloseBar = (
  bar: OhlcvBar | null | undefined,
): bar is OhlcvBar => bar != null && Number.isFinite(bar.close) && bar.close > 0;

const resolveBenchmarkBarForPoint = (
  point: BacktestEngineEquityPoint,
  bars: readonly OhlcvBar[],
  barsByTime: Map<string, OhlcvBar>,
  rawStartIndex: number | null,
): OhlcvBar | null => {
  const pointIndex = Math.max(0, Math.floor(Number(point.barIndex) || 0));
  const pointTime =
    typeof point.barTime === 'string' && point.barTime.trim()
      ? point.barTime
      : null;
  const rawOffset = rawStartIndex === null ? pointIndex : pointIndex - rawStartIndex;
  const rawBar = rawOffset >= 0 ? bars[rawOffset] : undefined;
  const relativeBar = bars[pointIndex];
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
  bars: readonly OhlcvBar[],
  equity: readonly BacktestEngineEquityPoint[],
  options: BacktestMetricsPersistenceOptions,
): Map<number, number> => {
  const closes = new Map<number, number>();
  const barsByTime = new Map<string, OhlcvBar>();
  bars.forEach((bar) => {
    if (Number.isFinite(bar.close)) {
      barsByTime.set(bar.ts, bar);
    }
  });
  const rawStartIndex = resolveRawStartIndex(options);
  for (const point of equity) {
    const bar = resolveBenchmarkBarForPoint(
      point,
      bars,
      barsByTime,
      rawStartIndex,
    );
    if (isFiniteCloseBar(bar)) {
      closes.set(
        Math.max(0, Math.floor(Number(point.barIndex) || 0)),
        bar.close,
      );
    }
  }
  return closes;
};

export const attachExactBacktestMetrics = (
  item: BacktestInstrumentRunResult,
  config: BacktestConfig,
  bars: readonly OhlcvBar[],
  options: BacktestMetricsPersistenceOptions = {},
): BacktestInstrumentRunResult => {
  const summary = item.result.summary ?? {};
  const metrics = computeBacktestMetrics({
    equity: item.equityCurve.map((point) => ({
      barIndex: point.barIndex,
      barTime: point.barTime,
      equity: point.equity,
      drawdown: point.drawdown,
    })),
    fills: item.fills.map((fill) => ({
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
    initialCapital: config.initialCapital,
    closedTrades: readFiniteNumber(summary, 'closedTrades'),
    winningTrades: readFiniteNumber(summary, 'winningTrades'),
    realizedPnl: readFiniteNumber(summary, 'realizedPnl'),
    benchmarkCloseByBarIndex: buildBenchmarkCloseByBarIndex(
      bars,
      item.equityCurve,
      options,
    ),
    sampled: false,
    timeframe: item.instrument.baseTimeframe,
  });

  return {
    ...item,
    result: {
      ...item.result,
      summary: {
        ...summary,
        metrics: toBacktestPersistedMetrics(metrics),
      },
    },
  };
};
