// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from "../../domain/models.js";
import {
  getBarsByInstrumentIdRange,
  getBarsBySymbolRange,
} from "../trading/core.js";
import {
  normalizeUpperSymbols,
  type SupportedBaseTimeframe,
  type SystemDevSimulationEnabledPool,
} from "../../domain/systemDevSimulation/sharedDomain.js";
import type { TradingAssetClass } from "@zinuto/shared/trading";
import { listSystemDevSimulationFallbackPools } from "./datasetPlanner.js";

export type SpecialTrainingSimulationSymbolGroup = {
  baseTimeframe: SupportedBaseTimeframe;
  assetClass: TradingAssetClass;
  poolIds: string[];
  symbols: string[];
  instrumentIds: string[];
  fallbackOnly?: boolean;
};

const DEFAULT_MAX_CACHED_BAR_WINDOWS = 8;
const BAR_WINDOW_CACHE = new Map<
  string,
  Promise<SystemDevSimulationBarWindow>
>();
let maxCachedBarWindows = DEFAULT_MAX_CACHED_BAR_WINDOWS;

export type SystemDevSimulationBarWindow = {
  symbol: string;
  timeframe: SupportedBaseTimeframe;
  timeZone: string | null;
  total: number;
  offset: number;
  limit: number;
  bars: OhlcvBar[];
};

const buildBarCacheKey = (
  symbol: string,
  baseTimeframe: SupportedBaseTimeframe,
  instrumentId?: string | null,
): string =>
  String(instrumentId || "").trim()
    ? `instrument::${String(instrumentId || "").trim()}`
    : `${String(baseTimeframe || "").trim().toLowerCase()}::${String(symbol || "")
        .trim()
        .toUpperCase()}`;

const normalizeSupportedBaseTimeframe = (
  value: string,
): SupportedBaseTimeframe | null => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1m" ||
    normalized === "5m" ||
    normalized === "1h" ||
    normalized === "1d"
    ? normalized
    : null;
};

const evictBarWindowCacheIfNeeded = (): void => {
  while (BAR_WINDOW_CACHE.size > maxCachedBarWindows) {
    const oldestCacheKey = BAR_WINDOW_CACHE.keys().next().value;
    if (!oldestCacheKey) {
      break;
    }
    BAR_WINDOW_CACHE.delete(oldestCacheKey);
  }
};

export const getBarsWindowCached = async (
  symbol: string,
  baseTimeframe: SupportedBaseTimeframe,
  instrumentId?: string | null,
  offset = 0,
  limit = 1,
): Promise<SystemDevSimulationBarWindow> => {
  const normalizedInstrumentId = String(instrumentId || "").trim();
  const normalizedSymbol = String(symbol || "")
    .trim()
    .toUpperCase();
  const normalizedBaseTimeframe = normalizeSupportedBaseTimeframe(baseTimeframe);
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
  if (!normalizedSymbol || !normalizedBaseTimeframe) {
    return {
      symbol: normalizedSymbol,
      timeframe: normalizedBaseTimeframe ?? "1d",
      timeZone: null,
      total: 0,
      offset: safeOffset,
      limit: safeLimit,
      bars: [],
    };
  }
  const cacheKey = [
    buildBarCacheKey(
      normalizedSymbol,
      normalizedBaseTimeframe,
      normalizedInstrumentId,
    ),
    safeOffset,
    safeLimit,
  ].join("::");
  const cached = BAR_WINDOW_CACHE.get(cacheKey);
  if (cached) {
    // Refresh recency so the hottest few series survive while older ones evict.
    BAR_WINDOW_CACHE.delete(cacheKey);
    BAR_WINDOW_CACHE.set(cacheKey, cached);
    return cached;
  }
  const task = (
    normalizedInstrumentId
      ? getBarsByInstrumentIdRange(
          normalizedInstrumentId,
          safeOffset,
          safeLimit,
        )
      : getBarsBySymbolRange(
          normalizedSymbol,
          normalizedBaseTimeframe,
          safeOffset,
          safeLimit,
        )
  )
    .then(
      (range): SystemDevSimulationBarWindow => ({
        symbol: String(range.symbol || normalizedSymbol).trim().toUpperCase(),
        timeframe:
          normalizeSupportedBaseTimeframe(range.timeframe) ??
          normalizedBaseTimeframe,
        timeZone: range.timeZone,
        total: Math.max(0, Math.floor(Number(range.total) || 0)),
        offset: Math.max(0, Math.floor(Number(range.offset) || 0)),
        limit: Math.max(1, Math.floor(Number(range.limit) || safeLimit)),
        bars: Array.isArray(range.bars) ? range.bars : [],
      }),
    )
    .catch((error) => {
      BAR_WINDOW_CACHE.delete(cacheKey);
      throw error;
    });
  BAR_WINDOW_CACHE.set(cacheKey, task);
  evictBarWindowCacheIfNeeded();
  return task;
};

export const getBarCountCached = async (
  symbol: string,
  baseTimeframe: SupportedBaseTimeframe,
  instrumentId?: string | null,
): Promise<number> => {
  const range = await getBarsWindowCached(
    symbol,
    baseTimeframe,
    instrumentId,
    0,
    1,
  );
  return Math.max(0, Math.floor(Number(range.total) || 0));
};

export const setSystemDevSimulationBarCacheMaxSeries = (nextMax: number): void => {
  maxCachedBarWindows = Math.max(
    1,
    Math.floor(
      Number.isFinite(nextMax) ? nextMax : DEFAULT_MAX_CACHED_BAR_WINDOWS,
    ),
  );
  evictBarWindowCacheIfNeeded();
};

export const clearSystemDevSimulationBarCache = (): void => {
  BAR_WINDOW_CACHE.clear();
};

export const buildSpecialTrainingSymbolGroupsFromPools = (
  enabledSamplePools: SystemDevSimulationEnabledPool[],
  options: { fallbackOnly?: boolean } = {},
): SpecialTrainingSimulationSymbolGroup[] => {
  const groupsByTimeframe = new Map<
    string,
    {
      baseTimeframe: SupportedBaseTimeframe;
      assetClass: TradingAssetClass;
      poolIds: string[];
      symbols: string[];
      instrumentIds: string[];
    }
  >();
  enabledSamplePools.forEach((pool) => {
    const normalizedSymbols = normalizeUpperSymbols([
      ...pool.symbols,
      ...(pool.instruments ?? []).map((instrument) => instrument.symbol),
    ]);
    const normalizedInstrumentIds = Array.from(
      new Set(
        (pool.instruments ?? [])
          .map((instrument) => String(instrument.instrumentId || "").trim())
          .filter((instrumentId) => instrumentId.length > 0),
      ),
    );
    if (!normalizedSymbols.length) {
      return;
    }
    const groupKey = `${pool.baseTimeframe}::${pool.assetClass}`;
    const current = groupsByTimeframe.get(groupKey) ?? {
      baseTimeframe: pool.baseTimeframe,
      assetClass: pool.assetClass,
      poolIds: [],
      symbols: [],
      instrumentIds: [],
    };
    current.poolIds.push(pool.id);
    current.symbols.push(...normalizedSymbols);
    current.instrumentIds.push(...normalizedInstrumentIds);
    groupsByTimeframe.set(groupKey, current);
  });

  return (["1m", "5m", "1h", "1d"] as const).flatMap((baseTimeframe) => {
    const groups = Array.from(groupsByTimeframe.values()).filter(
      (group) => group.baseTimeframe === baseTimeframe,
    );
    return groups.flatMap((group) => {
      const groupedSymbols = Array.from(new Set(group.symbols));
      if (!groupedSymbols.length) {
        return [];
      }
      return [
      {
        baseTimeframe: group.baseTimeframe,
        assetClass: group.assetClass,
        poolIds: Array.from(
          new Set(
            group.poolIds
              .map((poolId) => String(poolId || "").trim())
              .filter((poolId) => poolId.length > 0),
          ),
        ).sort((left, right) => left.localeCompare(right, "en")),
        symbols: [...groupedSymbols].sort((left, right) =>
          left.localeCompare(right, "en"),
        ),
        instrumentIds: Array.from(
          new Set(
            group.instrumentIds
              .map((instrumentId) => String(instrumentId || "").trim())
              .filter((instrumentId) => instrumentId.length > 0),
          ),
        ).sort((left, right) => left.localeCompare(right, "en")),
        fallbackOnly: Boolean(options.fallbackOnly),
      } satisfies SpecialTrainingSimulationSymbolGroup,
      ];
    });
  });
};

export const resolveSpecialTrainingSymbolGroups = async (
  enabledSamplePools: SystemDevSimulationEnabledPool[],
): Promise<SpecialTrainingSimulationSymbolGroup[]> => {
  const primaryGroups = buildSpecialTrainingSymbolGroupsFromPools(
    enabledSamplePools,
  );
  const primaryAlreadyUsesSystemData = enabledSamplePools.some((pool) =>
    (pool.instruments ?? []).some(
      (instrument) => instrument.sourceKind === "SYSTEM",
    ),
  );
  if (primaryAlreadyUsesSystemData) {
    return primaryGroups;
  }
  const fallbackGroups = buildSpecialTrainingSymbolGroupsFromPools(
    listSystemDevSimulationFallbackPools(),
    { fallbackOnly: true },
  );
  return [...primaryGroups, ...fallbackGroups];
};
