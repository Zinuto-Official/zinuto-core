// SPDX-License-Identifier: GPL-3.0-only

import type { Bar, NumericSeries, RuntimeSeriesContext } from '../runtime/index.js';

const toFiniteOrNaN = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

const buildSeries = (bars: Bar[], selector: (bar: Bar) => number): NumericSeries =>
  bars.map((bar) => toFiniteOrNaN(selector(bar)));

const resolveAmountValue = (bar: Bar): number => {
  const explicitAmount = Number(bar.amount);
  if (Number.isFinite(explicitAmount)) {
    return explicitAmount;
  }
  const close = Number(bar.close);
  const volume = Number(bar.volume);
  if (Number.isFinite(close) && Number.isFinite(volume)) {
    return close * volume;
  }
  return Number.NaN;
};

export const createRuntimeSeriesContext = (bars: Bar[]): RuntimeSeriesContext => {
  const normalizedBars = Array.isArray(bars) ? bars : [];
  const open = buildSeries(normalizedBars, (bar) => bar.open);
  const high = buildSeries(normalizedBars, (bar) => bar.high);
  const low = buildSeries(normalizedBars, (bar) => bar.low);
  const close = buildSeries(normalizedBars, (bar) => bar.close);
  const volume = buildSeries(normalizedBars, (bar) => bar.volume);
  const amount = buildSeries(normalizedBars, resolveAmountValue);

  return {
    length: normalizedBars.length,
    bars: normalizedBars,
    OPEN: open,
    O: open,
    HIGH: high,
    H: high,
    LOW: low,
    L: low,
    CLOSE: close,
    C: close,
    VOL: volume,
    V: volume,
    AMOUNT: amount
  };
};
