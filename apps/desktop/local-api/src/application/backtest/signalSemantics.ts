// SPDX-License-Identifier: GPL-3.0-only

import type { BacktestConflict, BacktestSignal } from './types.js';

type IndicatorOutputs = Record<string, Array<number | null>>;

const RESERVED_SIGNAL_KEYS = ['BUY', 'SELL', 'SHORT', 'COVER'] as const;
type ReservedSignalKey = (typeof RESERVED_SIGNAL_KEYS)[number];

const isSignalActive = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  return Math.abs(value) > 1e-12;
};

const normalizeOutputMap = (outputs: IndicatorOutputs): Record<ReservedSignalKey, Array<number | null>> => {
  const normalizedEntries = Object.entries(outputs).reduce<Record<string, Array<number | null>>>(
    (acc, [key, series]) => {
      acc[key.trim().toUpperCase()] = Array.isArray(series) ? series : [];
      return acc;
    },
    {},
  );
  return {
    BUY: normalizedEntries.BUY ?? [],
    SELL: normalizedEntries.SELL ?? [],
    SHORT: normalizedEntries.SHORT ?? [],
    COVER: normalizedEntries.COVER ?? [],
  };
};

export const deriveBacktestSignals = (
  outputs: IndicatorOutputs,
  barCount: number,
): { signals: BacktestSignal[]; conflicts: BacktestConflict[] } => {
  const normalizedBarCount = Math.max(0, Math.floor(Number(barCount) || 0));
  const seriesBySignal = normalizeOutputMap(outputs);
  const conflicts: BacktestConflict[] = [];
  const signals: BacktestSignal[] = [];

  for (let index = 0; index < normalizedBarCount; index += 1) {
    let buy = isSignalActive(seriesBySignal.BUY[index]);
    const sell = isSignalActive(seriesBySignal.SELL[index]);
    let short = isSignalActive(seriesBySignal.SHORT[index]);
    const cover = isSignalActive(seriesBySignal.COVER[index]);

    if (buy && sell) {
      buy = false;
      conflicts.push({
        barIndex: index,
        code: 'LONG_EXIT_PRIORITY',
      });
    }
    if (short && cover) {
      short = false;
      conflicts.push({
        barIndex: index,
        code: 'SHORT_EXIT_PRIORITY',
      });
    }
    if (buy && short) {
      buy = false;
      short = false;
      conflicts.push({
        barIndex: index,
        code: 'ENTRY_SIDE_CONFLICT',
      });
    }

    signals.push({
      barIndex: index,
      buy,
      sell,
      short,
      cover,
    });
  }

  return { signals, conflicts };
};
