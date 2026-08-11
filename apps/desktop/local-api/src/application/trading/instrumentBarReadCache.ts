// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';

type InstrumentBarReadCacheDeps = {
  getBarCount: (instrumentId: string) => Promise<number>;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
};

export const createInstrumentBarReadCache = (
  { getBarCount, getBarByIndex }: InstrumentBarReadCacheDeps,
  options?: { maxEntries?: number },
) => {
  const maxEntries = options?.maxEntries ?? 256;
  const barCountCache = new Map<string, number>();
  const barByIndexCache = new Map<string, OhlcvBar | undefined>();

  const getBarCountCached = async (instrumentId: string): Promise<number> => {
    if (barCountCache.has(instrumentId)) {
      return barCountCache.get(instrumentId) ?? 0;
    }
    const resolved = await getBarCount(instrumentId);
    barCountCache.set(instrumentId, resolved);
    return resolved;
  };

  const getBarByIndexCached = async (instrumentId: string, index: number): Promise<OhlcvBar | undefined> => {
    const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
    const cacheKey = `${instrumentId}|${String(safeIndex)}`;
    if (barByIndexCache.has(cacheKey)) {
      const val = barByIndexCache.get(cacheKey);
      barByIndexCache.delete(cacheKey);
      barByIndexCache.set(cacheKey, val);
      return val;
    }
    const resolved = await getBarByIndex(instrumentId, safeIndex);
    barByIndexCache.set(cacheKey, resolved);
    while (barByIndexCache.size > maxEntries) {
      const oldest = barByIndexCache.keys().next().value;
      if (!oldest) break;
      barByIndexCache.delete(oldest);
    }
    return resolved;
  };

  return {
    getBarCountCached,
    getBarByIndexCached
  };
};
