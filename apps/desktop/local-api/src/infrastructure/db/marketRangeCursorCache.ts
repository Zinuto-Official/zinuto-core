// SPDX-License-Identifier: GPL-3.0-only

type MarketRangeCursorCacheEntry = {
  instrumentId: string;
  loadedAt: number;
  nextOffset: number;
  lastTsMs: bigint;
};

const MARKET_RANGE_CURSOR_CACHE_LIMIT = 256;
const MARKET_RANGE_CURSOR_CACHE_TTL_MS = 90 * 1000;
const MARKET_RANGE_CURSOR_MAX_LOOKBACK = 200_000;

const marketRangeCursorCache = new Map<string, MarketRangeCursorCacheEntry>();

const buildCacheKey = (instrumentId: string, nextOffset: number): string =>
  `${instrumentId}|${String(Math.max(0, Math.floor(nextOffset)))}`;

const touchMarketRangeCursorCache = (cacheKey: string, entry: MarketRangeCursorCacheEntry): void => {
  marketRangeCursorCache.delete(cacheKey);
  marketRangeCursorCache.set(cacheKey, entry);
};

export const getMarketRangeCursor = (
  instrumentId: string,
  expectedOffset: number
): MarketRangeCursorCacheEntry | null => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  const normalizedExpectedOffset = Math.max(0, Math.floor(expectedOffset));
  if (!normalizedInstrumentId) {
    return null;
  }
  let bestKey = '';
  let bestEntry: MarketRangeCursorCacheEntry | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  const now = Date.now();
  for (const [cacheKey, entry] of marketRangeCursorCache.entries()) {
    if (now - entry.loadedAt > MARKET_RANGE_CURSOR_CACHE_TTL_MS) {
      marketRangeCursorCache.delete(cacheKey);
      continue;
    }
    if (entry.instrumentId !== normalizedInstrumentId) {
      continue;
    }
    if (entry.nextOffset > normalizedExpectedOffset) {
      continue;
    }
    const delta = normalizedExpectedOffset - entry.nextOffset;
    if (delta > MARKET_RANGE_CURSOR_MAX_LOOKBACK) {
      continue;
    }
    if (delta < bestDelta) {
      bestDelta = delta;
      bestEntry = entry;
      bestKey = cacheKey;
      if (delta === 0) {
        break;
      }
    }
  }
  if (!bestEntry || !bestKey) {
    return null;
  }
  touchMarketRangeCursorCache(bestKey, bestEntry);
  return bestEntry;
};

export const pruneExpiredMarketRangeCursors = (now = Date.now()): void => {
  for (const [cacheKey, entry] of marketRangeCursorCache.entries()) {
    if (now - entry.loadedAt > MARKET_RANGE_CURSOR_CACHE_TTL_MS) {
      marketRangeCursorCache.delete(cacheKey);
    }
  }
};

export const setMarketRangeCursor = (instrumentId: string, nextOffset: number, lastTsMs: bigint): void => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId || nextOffset < 0) {
    return;
  }
  pruneExpiredMarketRangeCursors();
  const normalizedNextOffset = Math.max(0, Math.floor(nextOffset));
  const cacheKey = buildCacheKey(normalizedInstrumentId, normalizedNextOffset);
  touchMarketRangeCursorCache(cacheKey, {
    instrumentId: normalizedInstrumentId,
    loadedAt: Date.now(),
    nextOffset: normalizedNextOffset,
    lastTsMs
  });
  while (marketRangeCursorCache.size > MARKET_RANGE_CURSOR_CACHE_LIMIT) {
    const oldestKey = marketRangeCursorCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    marketRangeCursorCache.delete(oldestKey);
  }
};

export const clearMarketRangeCursor = (instrumentId: string): void => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return;
  }
  const keyPrefix = `${normalizedInstrumentId}|`;
  for (const cacheKey of marketRangeCursorCache.keys()) {
    if (cacheKey.startsWith(keyPrefix)) {
      marketRangeCursorCache.delete(cacheKey);
    }
  }
};

export const clearAllMarketRangeCursors = (): void => {
  marketRangeCursorCache.clear();
};
