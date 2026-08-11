// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs } from '@zinuto/shared/marketTime';

export type CsvImportBaseTimeframe = '1m' | '5m' | '1h' | '1d';

export const resolveBarsBaseTimeframe = (bars: readonly Pick<{ ts: unknown }, 'ts'>[]): CsvImportBaseTimeframe | null => {
  if (!Array.isArray(bars) || bars.length < 2) {
    return null;
  }
  let previousTsMs = Number.NaN;
  let minPositiveDeltaMs = Number.POSITIVE_INFINITY;
  for (const bar of bars) {
    const tsMs = parseTimestampMs(String(bar?.ts ?? ''));
    if (!Number.isFinite(tsMs)) {
      continue;
    }
    if (Number.isFinite(previousTsMs)) {
      const deltaMs = tsMs - previousTsMs;
      if (Number.isFinite(deltaMs) && deltaMs > 0) {
        minPositiveDeltaMs = Math.min(minPositiveDeltaMs, deltaMs);
      }
    }
    previousTsMs = tsMs;
  }
  if (!Number.isFinite(minPositiveDeltaMs)) {
    return null;
  }
  if (minPositiveDeltaMs <= 2 * 60 * 1000) {
    return '1m';
  }
  if (minPositiveDeltaMs <= 15 * 60 * 1000) {
    return '5m';
  }
  if (minPositiveDeltaMs <= 2 * 60 * 60 * 1000) {
    return '1h';
  }
  return '1d';
};
