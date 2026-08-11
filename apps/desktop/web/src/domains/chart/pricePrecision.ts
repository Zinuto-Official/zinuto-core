// SPDX-License-Identifier: GPL-3.0-only

import type { KLineData } from 'klinecharts';

export const DEFAULT_CHART_PRICE_PRECISION = 2;
export const DEFAULT_CHART_VOLUME_PRECISION = 0;

const MAX_CHART_PRICE_PRECISION = 6;
const RANGE_TICK_TARGET = 8;
const PRICE_FIELDS = ['open', 'high', 'low', 'close'] as const;

export type ChartSymbolInfo = {
  ticker: string;
  pricePrecision: number;
  volumePrecision: number;
};

const clampPrecision = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_CHART_PRICE_PRECISION;
  }
  return Math.min(
    MAX_CHART_PRICE_PRECISION,
    Math.max(DEFAULT_CHART_PRICE_PRECISION, Math.floor(value)),
  );
};

const resolvePrecisionFromPriceMagnitude = (maxAbsPrice: number): number => {
  if (!Number.isFinite(maxAbsPrice) || maxAbsPrice <= 0) {
    return DEFAULT_CHART_PRICE_PRECISION;
  }
  if (maxAbsPrice < 0.01) {
    return 6;
  }
  if (maxAbsPrice < 0.1) {
    return 5;
  }
  if (maxAbsPrice < 1) {
    return 4;
  }
  if (maxAbsPrice < 10) {
    return 3;
  }
  return DEFAULT_CHART_PRICE_PRECISION;
};

const resolvePrecisionFromVisibleRange = (minPrice: number, maxPrice: number): number => {
  const range = maxPrice - minPrice;
  if (!Number.isFinite(range) || range <= 0) {
    return DEFAULT_CHART_PRICE_PRECISION;
  }
  const targetTickSize = range / RANGE_TICK_TARGET;
  if (!Number.isFinite(targetTickSize) || targetTickSize <= 0) {
    return DEFAULT_CHART_PRICE_PRECISION;
  }
  return clampPrecision(Math.ceil(-Math.log10(targetTickSize)));
};

const collectPriceValues = (dataList: readonly KLineData[]): number[] => {
  const values: number[] = [];
  dataList.forEach((bar) => {
    PRICE_FIELDS.forEach((field) => {
      const numeric = Number(bar[field]);
      if (Number.isFinite(numeric)) {
        values.push(numeric);
      }
    });
  });
  return values;
};

export const resolveKlineDataPricePrecision = (
  dataList: readonly KLineData[],
): number => {
  const values = collectPriceValues(dataList);
  if (!values.length) {
    return DEFAULT_CHART_PRICE_PRECISION;
  }

  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;
  let maxAbsPrice = 0;
  values.forEach((value) => {
    minPrice = Math.min(minPrice, value);
    maxPrice = Math.max(maxPrice, value);
    maxAbsPrice = Math.max(maxAbsPrice, Math.abs(value));
  });

  return clampPrecision(
    Math.max(
      resolvePrecisionFromPriceMagnitude(maxAbsPrice),
      resolvePrecisionFromVisibleRange(minPrice, maxPrice),
    ),
  );
};

export const buildChartSymbolInfo = (
  ticker: string,
  dataList: readonly KLineData[],
): ChartSymbolInfo => ({
  ticker,
  pricePrecision: resolveKlineDataPricePrecision(dataList),
  volumePrecision: DEFAULT_CHART_VOLUME_PRECISION,
});

export const isSameChartSymbolInfo = (
  current: ChartSymbolInfo | null | undefined,
  next: ChartSymbolInfo,
): boolean =>
  Boolean(current) &&
  String(current?.ticker || '').trim().toUpperCase() === next.ticker &&
  Number(current?.pricePrecision) === next.pricePrecision &&
  Number(current?.volumePrecision) === next.volumePrecision;

export const isSameChartTicker = (
  current: Pick<ChartSymbolInfo, "ticker"> | null | undefined,
  nextTicker: string,
): boolean =>
  Boolean(current) &&
  String(current?.ticker || "").trim().toUpperCase() ===
    String(nextTicker || "").trim().toUpperCase();

export const shouldApplyStableChartSymbolInfo = ({
  current,
  next,
  hasRenderedData,
  isSessionSwitched,
}: {
  current: ChartSymbolInfo | null | undefined;
  next: ChartSymbolInfo;
  hasRenderedData: boolean;
  isSessionSwitched: boolean;
}): boolean => {
  if (!isSameChartTicker(current, next.ticker)) {
    return true;
  }
  if (!hasRenderedData || isSessionSwitched) {
    return !isSameChartSymbolInfo(current, next);
  }
  return false;
};
