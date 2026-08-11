// SPDX-License-Identifier: GPL-3.0-only

import {
  clearAllMarketRangeCursors,
  clearMarketRangeCursor
} from './marketRangeCursorCache.js';
import type { MarketBarFrame, OhlcvBar } from '../../domain/models.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';

const MARKET_BAR_CHUNK_CACHE_LIMIT = 192;
const MARKET_BAR_CHUNK_CACHE_TTL_MS = 8 * 60 * 1000;
const MARKET_BAR_COUNT_CACHE_LIMIT = runtimeLimits.marketBarCountCacheMaxEntries;
const MARKET_BAR_COUNT_CACHE_TTL_MS = runtimeLimits.marketBarCountCacheTtlMs;
const MARKET_BAR_FRAME_CACHE_LIMIT = 48;
const MARKET_BAR_FRAME_CACHE_TTL_MS = 3 * 60 * 1000;

type MarketBarChunkCacheEntry = {
  loadedAt: number;
  bars: OhlcvBar[];
};

type MarketBarCountCacheEntry = {
  loadedAt: number;
  count: number;
};

type MarketBarFrameCacheEntry = {
  loadedAt: number;
  frame: MarketBarFrame;
};

type MarketBarFrameCacheKeyInput = {
  instrumentId: string;
  versionToken: string;
  displayPeriod: string;
  timeZone: string | null;
  displayStart: number;
  limit: number;
};

const marketBarChunkCache = new Map<string, MarketBarChunkCacheEntry>();
const marketBarCountCache = new Map<string, MarketBarCountCacheEntry>();
const marketBarFrameCache = new Map<string, MarketBarFrameCacheEntry>();
const marketBarFrameInFlight = new Map<string, Promise<MarketBarFrame>>();
let marketBarFrameCacheGeneration = 0;

const buildMarketBarChunkCacheKey = (instrumentId: string, chunkStart: number): string =>
  `${instrumentId}|${String(chunkStart)}`;

const touchMarketBarChunkCache = (key: string, entry: MarketBarChunkCacheEntry): void => {
  marketBarChunkCache.delete(key);
  marketBarChunkCache.set(key, entry);
};

const touchMarketBarCountCache = (key: string, entry: MarketBarCountCacheEntry): void => {
  marketBarCountCache.delete(key);
  marketBarCountCache.set(key, entry);
};

const touchMarketBarFrameCache = (key: string, entry: MarketBarFrameCacheEntry): void => {
  marketBarFrameCache.delete(key);
  marketBarFrameCache.set(key, entry);
};

const pruneExpiredMarketBarChunkCache = (now: number): void => {
  for (const [cacheKey, entry] of marketBarChunkCache.entries()) {
    if (now - entry.loadedAt > MARKET_BAR_CHUNK_CACHE_TTL_MS) {
      marketBarChunkCache.delete(cacheKey);
    }
  }
};

const pruneExpiredMarketBarCountCache = (now: number): void => {
  for (const [cacheKey, entry] of marketBarCountCache.entries()) {
    if (now - entry.loadedAt > MARKET_BAR_COUNT_CACHE_TTL_MS) {
      marketBarCountCache.delete(cacheKey);
    }
  }
};

const pruneExpiredMarketBarFrameCache = (now: number): void => {
  for (const [cacheKey, entry] of marketBarFrameCache.entries()) {
    if (now - entry.loadedAt > MARKET_BAR_FRAME_CACHE_TTL_MS) {
      marketBarFrameCache.delete(cacheKey);
    }
  }
};

export const pruneExpiredMarketReadCaches = (now = Date.now()): void => {
  pruneExpiredMarketBarChunkCache(now);
  pruneExpiredMarketBarCountCache(now);
  pruneExpiredMarketBarFrameCache(now);
};

export const getCachedMarketBarChunk = (
  instrumentId: string,
  chunkStart: number
): OhlcvBar[] | null => {
  const key = buildMarketBarChunkCacheKey(instrumentId, chunkStart);
  const entry = marketBarChunkCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.loadedAt > MARKET_BAR_CHUNK_CACHE_TTL_MS) {
    marketBarChunkCache.delete(key);
    return null;
  }
  touchMarketBarChunkCache(key, entry);
  return entry.bars;
};

export const setCachedMarketBarChunk = (
  instrumentId: string,
  chunkStart: number,
  bars: OhlcvBar[]
): void => {
  pruneExpiredMarketBarChunkCache(Date.now());
  const key = buildMarketBarChunkCacheKey(instrumentId, chunkStart);
  touchMarketBarChunkCache(key, {
    loadedAt: Date.now(),
    bars
  });
  while (marketBarChunkCache.size > MARKET_BAR_CHUNK_CACHE_LIMIT) {
    const oldestKey = marketBarChunkCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    marketBarChunkCache.delete(oldestKey);
  }
};

export const getCachedMarketBarCount = (instrumentId: string): number | null => {
  const entry = marketBarCountCache.get(instrumentId);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.loadedAt > MARKET_BAR_COUNT_CACHE_TTL_MS) {
    marketBarCountCache.delete(instrumentId);
    return null;
  }
  touchMarketBarCountCache(instrumentId, entry);
  return entry.count;
};

export const setCachedMarketBarCount = (instrumentId: string, count: number): void => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  if (!normalizedInstrumentId) {
    return;
  }
  pruneExpiredMarketBarCountCache(Date.now());
  touchMarketBarCountCache(normalizedInstrumentId, {
    loadedAt: Date.now(),
    count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  });
  while (marketBarCountCache.size > MARKET_BAR_COUNT_CACHE_LIMIT) {
    const oldestKey = marketBarCountCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    marketBarCountCache.delete(oldestKey);
  }
};

export const buildMarketBarFrameCacheKey = ({
  instrumentId,
  versionToken,
  displayPeriod,
  timeZone,
  displayStart,
  limit,
}: MarketBarFrameCacheKeyInput): string =>
  [
    String(instrumentId ?? '').trim(),
    String(versionToken ?? '').trim(),
    String(displayPeriod ?? '').trim(),
    String(timeZone ?? '').trim(),
    String(Math.max(0, Math.floor(Number(displayStart) || 0))),
    String(Math.max(0, Math.floor(Number(limit) || 0))),
  ].join('\u0000');

export const getCachedMarketBarFrame = (key: string): MarketBarFrame | null => {
  const normalizedKey = String(key ?? '');
  if (!normalizedKey) {
    return null;
  }
  const entry = marketBarFrameCache.get(normalizedKey);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.loadedAt > MARKET_BAR_FRAME_CACHE_TTL_MS) {
    marketBarFrameCache.delete(normalizedKey);
    return null;
  }
  touchMarketBarFrameCache(normalizedKey, entry);
  return entry.frame;
};

export const setCachedMarketBarFrame = (
  key: string,
  frame: MarketBarFrame
): void => {
  const normalizedKey = String(key ?? '');
  if (!normalizedKey) {
    return;
  }
  pruneExpiredMarketBarFrameCache(Date.now());
  touchMarketBarFrameCache(normalizedKey, {
    loadedAt: Date.now(),
    frame
  });
  while (marketBarFrameCache.size > MARKET_BAR_FRAME_CACHE_LIMIT) {
    const oldestKey = marketBarFrameCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    marketBarFrameCache.delete(oldestKey);
  }
};

export const getOrLoadCachedMarketBarFrame = async (
  key: string,
  loader: () => Promise<MarketBarFrame>,
  options: {
    canPublish?: () => boolean;
    shareInFlight?: boolean;
  } = {},
): Promise<MarketBarFrame> => {
  const normalizedKey = String(key ?? '');
  if (!normalizedKey) {
    return loader();
  }
  const cached = getCachedMarketBarFrame(normalizedKey);
  if (cached) {
    return cached;
  }
  const shareInFlight = options.shareInFlight ?? true;
  if (shareInFlight) {
    const inFlight = marketBarFrameInFlight.get(normalizedKey);
    if (inFlight) {
      return inFlight;
    }
  }
  const generation = marketBarFrameCacheGeneration;
  const promise = loader().then((frame) => {
    if (
      marketBarFrameCacheGeneration === generation &&
      (options.canPublish?.() ?? true)
    ) {
      setCachedMarketBarFrame(normalizedKey, frame);
    }
    return frame;
  });
  if (shareInFlight) {
    marketBarFrameInFlight.set(normalizedKey, promise);
  }
  try {
    return await promise;
  } finally {
    if (shareInFlight && marketBarFrameInFlight.get(normalizedKey) === promise) {
      marketBarFrameInFlight.delete(normalizedKey);
    }
  }
};

export const getMarketBarFrameCacheStats = (): {
  size: number;
  inFlight: number;
} => ({
  size: marketBarFrameCache.size,
  inFlight: marketBarFrameInFlight.size,
});

export const invalidateMarketReadCaches = (instrumentId?: string): void => {
  const normalizedInstrumentId = String(instrumentId ?? '').trim();
  marketBarFrameCacheGeneration += 1;
  if (!normalizedInstrumentId) {
    marketBarChunkCache.clear();
    marketBarCountCache.clear();
    marketBarFrameCache.clear();
    marketBarFrameInFlight.clear();
    clearAllMarketRangeCursors();
    return;
  }
  marketBarCountCache.delete(normalizedInstrumentId);
  clearMarketRangeCursor(normalizedInstrumentId);
  const prefix = `${normalizedInstrumentId}|`;
  for (const key of marketBarChunkCache.keys()) {
    if (key.startsWith(prefix)) {
      marketBarChunkCache.delete(key);
    }
  }
  for (const key of marketBarFrameCache.keys()) {
    if (key.startsWith(`${normalizedInstrumentId}\u0000`)) {
      marketBarFrameCache.delete(key);
    }
  }
  for (const key of marketBarFrameInFlight.keys()) {
    if (key.startsWith(`${normalizedInstrumentId}\u0000`)) {
      marketBarFrameInFlight.delete(key);
    }
  }
};
