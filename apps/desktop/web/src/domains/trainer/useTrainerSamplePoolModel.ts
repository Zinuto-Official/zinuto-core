// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo } from 'react';
import type { BuiltInSamplePoolConfig } from '@/domains/trainer/samplePools';
import type { BaseTimeframe } from '@/domains/trainer/trainerTypes';
type InstrumentLike = {
  id: string;
  symbol: string;
  baseTimeframe: BaseTimeframe;
  name: string | null;
  barCount: number;
  timeStartTs?: string | null;
  timeEndTs?: string | null;
  scopeKind?: "SYSTEM" | "LOCAL";
  sourceId?: string | null;
  sourceName?: string | null;
  displayLabel?: string;
};
type CustomSamplePoolLike = {
  id: string;
  name: string;
  instruments: Array<{
    instrumentId: string;
    samplePoolId: string;
    symbol: string;
    displayLabel: string;
    sourceTimeframe: BaseTimeframe;
    scopeKind?: "SYSTEM" | "LOCAL";
    sourceId?: string | null;
    sourceName?: string | null;
    barCount: number;
    timeStartTs?: string | null;
    timeEndTs?: string | null;
  }>;
  symbols: string[];
  baseTimeframe: BaseTimeframe;
  selected: boolean;
};
type TrainerSamplePoolOption = {
  id: string;
  name: string;
  symbolCount: number;
  disabled?: boolean;
  sourceLocked?: boolean;
  lockReason?: string | null;
};
type LocalDataSourceSummaryLike = {
  id: string;
  name?: string;
  instruments?: Array<{
    instrumentId: string;
    samplePoolId?: string;
    symbol: string;
    displayLabel: string;
    sourceTimeframe?: BaseTimeframe;
    scopeKind?: "SYSTEM" | "LOCAL";
    sourceId?: string | null;
    sourceName?: string | null;
    barCount?: number;
    timeStartTs?: string | null;
    timeEndTs?: string | null;
  }>;
  unlockedSymbols: string[];
  lockedSymbols: string[];
  lockedSymbolCount: number;
  sourceLocked: boolean;
  lockReason?: string | null;
};
type DataConfigPoolOrderByBase = Partial<Record<BaseTimeframe, string[]>>;
export type TrainerInstrumentOption = {
  instrumentId: string;
  symbol: string;
  label: string;
  baseTimeframe: BaseTimeframe;
  poolId: string;
  poolName: string;
  scopeKind: "SYSTEM" | "LOCAL";
  sourceId: string | null;
  sourceName: string | null;
  barCount: number;
  timeStartTs?: string | null;
  timeEndTs?: string | null;
  locked?: boolean;
  lockReason?: string | null;
};
const BASE_TIMEFRAME_ORDER: Record<BaseTimeframe, number> = {
  '1m': 0,
  '5m': 1,
  '1h': 2,
  '1d': 3
};
const buildInstrumentIdentityKey = (symbol: string, baseTimeframe: BaseTimeframe): string =>
  `${String(baseTimeframe || '').trim().toLowerCase()}::${String(symbol || '').trim().toUpperCase()}`;

const normalizePoolSymbol = (symbol: string): string =>
  String(symbol || "").trim().toUpperCase();

const normalizeSymbolSet = (symbols: readonly string[] | undefined): Set<string> =>
  new Set(
    (symbols ?? [])
      .map((symbol) => normalizePoolSymbol(symbol))
      .filter((symbol) => symbol.length > 0),
  );
type UseTrainerSamplePoolModelParams = {
  instruments: InstrumentLike[];
  customSamplePools: CustomSamplePoolLike[];
  localDataSourceSummaries?: LocalDataSourceSummaryLike[];
  includeSystemDefaultPool: boolean;
  activeSamplePoolId: string;
  samplePoolAllId: string;
  samplePoolSystemId: string;
  dataConfigPoolOrderByBase?: DataConfigPoolOrderByBase;
  resolveSamplePoolDisplayName: (poolId: string, fallbackName?: string) => string;
  findBuiltInSamplePoolById: (poolId: string) => BuiltInSamplePoolConfig | undefined;
  getBuiltInSamplePools: () => BuiltInSamplePoolConfig[];
  isBuiltInSamplePoolId: (poolId: string) => boolean;
};
export const useTrainerSamplePoolModel = ({
  instruments,
  customSamplePools,
  localDataSourceSummaries = [],
  includeSystemDefaultPool,
  activeSamplePoolId,
  samplePoolAllId,
  samplePoolSystemId,
  dataConfigPoolOrderByBase,
  resolveSamplePoolDisplayName,
  findBuiltInSamplePoolById,
  getBuiltInSamplePools,
  isBuiltInSamplePoolId
}: UseTrainerSamplePoolModelParams) => {
  const instrumentIdentitySet = useMemo(() => {
    const set = new Set<string>();
    instruments.forEach((item) => {
      set.add(buildInstrumentIdentityKey(item.symbol, (item.baseTimeframe as BaseTimeframe) || '1d'));
    });
    return set;
  }, [instruments]);

  const instrumentMetaMap = useMemo(() => {
    const map = new Map<string, { symbol: string; name: string | null; barCount: number }>();
    instruments.forEach((item) => {
      const symbol = item.symbol.toUpperCase();
      const existing = map.get(symbol);
      if (!existing || item.barCount > existing.barCount) {
        map.set(symbol, item);
      }
    });
    return map;
  }, [instruments]);

  const allCustomPoolSymbols = useMemo(
    () => Array.from(new Set(customSamplePools.flatMap((pool) => pool.symbols.map((symbol) => symbol.toUpperCase())))),
    [customSamplePools]
  );

  const localDataSourceSummaryById = useMemo(() => {
    const map = new Map<string, LocalDataSourceSummaryLike>();
    localDataSourceSummaries.forEach((source) => {
      const sourceId = String(source.id || '').trim();
      if (!sourceId) {
        return;
      }
      map.set(sourceId, source);
    });
    return map;
  }, [localDataSourceSummaries]);

  const selectedCustomSamplePools = useMemo(() => customSamplePools, [customSamplePools]);

  const visibleCustomPoolSymbolsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    selectedCustomSamplePools.forEach((pool) => {
      const sourceSummary = localDataSourceSummaryById.get(pool.id);
      const sourceInstruments = sourceSummary?.instruments ?? pool.instruments;
      const declaredSymbols =
        Array.isArray(sourceSummary?.unlockedSymbols) ||
        Array.isArray(sourceSummary?.lockedSymbols)
          ? [
              ...(sourceSummary?.unlockedSymbols ?? []),
              ...(sourceSummary?.lockedSymbols ?? []),
            ]
          : pool.symbols;
      const declaredSymbolSet = normalizeSymbolSet(declaredSymbols);
      const normalized = sourceInstruments
        .filter((instrument) => String(instrument.instrumentId || "").trim())
        .map((instrument) => normalizePoolSymbol(instrument.symbol))
        .filter(
          (symbol) =>
            symbol.length > 0 &&
            (!declaredSymbolSet.size || declaredSymbolSet.has(symbol)),
        );
      map.set(pool.id, Array.from(new Set(normalized)));
    });
    return map;
  }, [localDataSourceSummaryById, selectedCustomSamplePools]);

  const visibleCustomPoolInstrumentOptionsMap = useMemo(() => {
    const map = new Map<string, TrainerInstrumentOption[]>();
    selectedCustomSamplePools.forEach((pool) => {
      const sourceSummary = localDataSourceSummaryById.get(pool.id);
      const unlockedSymbols = normalizeSymbolSet(
        Array.isArray(sourceSummary?.unlockedSymbols)
          ? sourceSummary?.unlockedSymbols
          : pool.symbols,
      );
      const lockedSymbols = normalizeSymbolSet(sourceSummary?.lockedSymbols);
      const hasExplicitLockLists =
        Array.isArray(sourceSummary?.unlockedSymbols) ||
        Array.isArray(sourceSummary?.lockedSymbols);
      const sourceInstruments = sourceSummary?.instruments ?? pool.instruments;
      const entries = sourceInstruments
        .map((instrument) => ({
          instrumentId: String(instrument.instrumentId || "").trim(),
          symbol: normalizePoolSymbol(instrument.symbol),
          label: String(instrument.displayLabel || instrument.symbol || "").trim(),
          baseTimeframe: (instrument.sourceTimeframe as BaseTimeframe) ?? pool.baseTimeframe,
          poolId: pool.id,
          poolName: pool.name,
          scopeKind: instrument.scopeKind ?? "LOCAL",
          sourceId: instrument.sourceId ?? pool.id,
          sourceName: instrument.sourceName ?? pool.name,
          barCount: Math.max(0, Number(instrument.barCount) || 0),
          timeStartTs: instrument.timeStartTs ?? null,
          timeEndTs: instrument.timeEndTs ?? null,
        }))
        .filter((instrument) => instrument.instrumentId.length > 0)
        .map((instrument) => {
          const locked =
            Boolean(sourceSummary?.sourceLocked) ||
            lockedSymbols.has(instrument.symbol) ||
            (hasExplicitLockLists && !unlockedSymbols.has(instrument.symbol));
          return {
            ...instrument,
            locked,
            lockReason: locked ? sourceSummary?.lockReason ?? null : null,
          };
        });
      map.set(pool.id, entries);
    });
    return map;
  }, [localDataSourceSummaryById, selectedCustomSamplePools]);

  const selectedCustomPoolSymbolsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    visibleCustomPoolInstrumentOptionsMap.forEach((entries, poolId) => {
      map.set(
        poolId,
        Array.from(
          new Set(
            entries
              .filter((instrument) => !instrument.locked)
              .map((instrument) => instrument.symbol),
          ),
        ),
      );
    });
    return map;
  }, [visibleCustomPoolInstrumentOptionsMap]);

  const selectedCustomPoolInstrumentOptionsMap = useMemo(() => {
    const map = new Map<string, TrainerInstrumentOption[]>();
    visibleCustomPoolInstrumentOptionsMap.forEach((entries, poolId) => {
      map.set(
        poolId,
        entries.filter((instrument) => !instrument.locked),
      );
    });
    return map;
  }, [visibleCustomPoolInstrumentOptionsMap]);

  const enabledCustomPoolSymbols = useMemo(
    () => Array.from(new Set(Array.from(selectedCustomPoolSymbolsMap.values()).flat())),
    [selectedCustomPoolSymbolsMap]
  );

  const visibleBuiltInPoolSymbolsById = useMemo(() => {
    const map = new Map<string, string[]>();
    getBuiltInSamplePools().forEach((pool) => {
      const symbols = pool.symbols
        .map((symbol) => symbol.toUpperCase())
        .filter((symbol) => instrumentIdentitySet.has(buildInstrumentIdentityKey(symbol, pool.baseTimeframe)));
      if (symbols.length) {
        map.set(pool.id, symbols);
      }
    });
    return map;
  }, [
    getBuiltInSamplePools,
    instrumentIdentitySet,
  ]);

  const availableBuiltInPoolInstrumentOptionsById = useMemo(() => {
    const map = new Map<string, TrainerInstrumentOption[]>();
    getBuiltInSamplePools().forEach((pool) => {
      const allowedSymbols = new Set(
        pool.symbols
          .map((symbol) => String(symbol || "").trim().toUpperCase())
          .filter((symbol) => symbol.length > 0),
      );
      const entries = instruments
        .filter(
          (instrument) =>
            instrument.scopeKind === "SYSTEM" &&
            instrument.baseTimeframe === pool.baseTimeframe &&
            allowedSymbols.has(String(instrument.symbol || "").trim().toUpperCase()),
        )
        .map((instrument) => ({
          instrumentId: String(instrument.id || "").trim(),
          symbol: String(instrument.symbol || "").trim().toUpperCase(),
          label: String(instrument.displayLabel || instrument.symbol || "").trim(),
          baseTimeframe: pool.baseTimeframe,
          poolId: pool.id,
          poolName: pool.name,
          scopeKind: instrument.scopeKind ?? "SYSTEM",
          sourceId: instrument.sourceId ?? null,
          sourceName: instrument.sourceName ?? null,
          barCount: Math.max(0, Number(instrument.barCount) || 0),
          timeStartTs: instrument.timeStartTs ?? null,
          timeEndTs: instrument.timeEndTs ?? null,
        }))
        .filter((instrument) => instrument.instrumentId.length > 0);
      if (entries.length > 0) {
        map.set(pool.id, entries);
      }
    });
    return map;
  }, [getBuiltInSamplePools, instruments]);

  const availableBuiltInPoolSymbolsById = useMemo(() => {
    const map = new Map<string, string[]>();
    visibleBuiltInPoolSymbolsById.forEach((symbols, poolId) => {
      if (!includeSystemDefaultPool || !symbols.length) {
        return;
      }
      map.set(poolId, symbols);
    });
    return map;
  }, [
    includeSystemDefaultPool,
    samplePoolSystemId,
    visibleBuiltInPoolSymbolsById
  ]);

  const visibleSystemDailyPoolSymbols = useMemo(
    () => visibleBuiltInPoolSymbolsById.get(samplePoolSystemId) ?? [],
    [samplePoolSystemId, visibleBuiltInPoolSymbolsById]
  );

  const availableBuiltInPoolSymbols = useMemo(
    () => Array.from(new Set(Array.from(availableBuiltInPoolSymbolsById.values()).flat())),
    [availableBuiltInPoolSymbolsById]
  );

  const combinedEnabledPoolInstrumentOptions = useMemo(
    () =>
      Array.from(
        new Map(
          [
            ...Array.from(availableBuiltInPoolInstrumentOptionsById.values()).flat(),
            ...Array.from(selectedCustomPoolInstrumentOptionsMap.values()).flat(),
          ].map((item) => [item.instrumentId, item]),
        ).values(),
      ),
    [availableBuiltInPoolInstrumentOptionsById, selectedCustomPoolInstrumentOptionsMap],
  );

  const combinedEnabledPoolSymbols = useMemo(
    () => Array.from(new Set<string>([...availableBuiltInPoolSymbols, ...enabledCustomPoolSymbols])),
    [availableBuiltInPoolSymbols, enabledCustomPoolSymbols]
  );

  const resolveSamplePoolBaseTimeframe = useCallback(
    (poolId: string): BaseTimeframe => {
      const normalizedPoolId = (poolId || '').trim();
      const builtInPool = findBuiltInSamplePoolById(normalizedPoolId);
      if (builtInPool) {
        return builtInPool.baseTimeframe;
      }
      if (normalizedPoolId && normalizedPoolId !== samplePoolAllId) {
        const matched = customSamplePools.find((pool) => pool.id === normalizedPoolId);
        return matched?.baseTimeframe ?? '1d';
      }
      const enabledTimeframes = new Set<BaseTimeframe>();
      if (includeSystemDefaultPool) {
        getBuiltInSamplePools().forEach((pool) => {
          enabledTimeframes.add(pool.baseTimeframe);
        });
      }
      customSamplePools.forEach((pool) => {
        enabledTimeframes.add(pool.baseTimeframe);
      });
      if (enabledTimeframes.size === 1) {
        return Array.from(enabledTimeframes)[0]!;
      }
      return '1d';
    },
    [
      customSamplePools,
      findBuiltInSamplePoolById,
      getBuiltInSamplePools,
      includeSystemDefaultPool,
      samplePoolAllId
    ]
  );

  const trainerSamplePoolOptions = useMemo(() => {
    const options: Array<TrainerSamplePoolOption & { baseTimeframe: BaseTimeframe | null; sourceIndex: number }> = [
      {
        id: samplePoolAllId,
        name: resolveSamplePoolDisplayName(samplePoolAllId),
        symbolCount: combinedEnabledPoolSymbols.length,
        baseTimeframe: null,
        sourceIndex: 0
      }
    ];
    let sourceIndex = 1;

    getBuiltInSamplePools().forEach((pool) => {
      const symbols = availableBuiltInPoolSymbolsById.get(pool.id) ?? [];
      if (!symbols.length) {
        return;
      }
      options.push({
        id: pool.id,
        name: resolveSamplePoolDisplayName(pool.id, pool.name),
        symbolCount: symbols.length,
        baseTimeframe: pool.baseTimeframe,
        sourceIndex
      });
      sourceIndex += 1;
    });

    selectedCustomSamplePools.forEach((pool) => {
      const sourceSummary = localDataSourceSummaryById.get(pool.id);
      const visibleCount = (visibleCustomPoolSymbolsMap.get(pool.id) ?? []).length;
      options.push({
        id: pool.id,
        name: resolveSamplePoolDisplayName(pool.id, pool.name),
        symbolCount: visibleCount,
        baseTimeframe: pool.baseTimeframe,
        sourceIndex,
        disabled: Boolean(sourceSummary?.sourceLocked),
        sourceLocked: Boolean(sourceSummary?.sourceLocked),
        lockReason: sourceSummary?.lockReason ?? null,
      });
      sourceIndex += 1;
    });

    const uniqueById = new Map<string, TrainerSamplePoolOption & { baseTimeframe: BaseTimeframe | null; sourceIndex: number }>();
    options.forEach((option) => {
      const normalizedId = (option.id || '').trim();
      if (!normalizedId) {
        return;
      }
      if (!uniqueById.has(normalizedId)) {
        uniqueById.set(normalizedId, {
          ...option,
          id: normalizedId
        });
      }
    });
    const orderLookupByBase = new Map<BaseTimeframe, Map<string, number>>();
    (['1m', '5m', '1h', '1d'] as const).forEach((baseTimeframe) => {
      const orderList = dataConfigPoolOrderByBase?.[baseTimeframe];
      if (!Array.isArray(orderList) || !orderList.length) {
        return;
      }
      const orderMap = new Map<string, number>();
      orderList.forEach((poolId, index) => {
        const normalizedPoolId = String(poolId || '').trim();
        if (!normalizedPoolId || orderMap.has(normalizedPoolId)) {
          return;
        }
        orderMap.set(normalizedPoolId, index);
      });
      if (orderMap.size > 0) {
        orderLookupByBase.set(baseTimeframe, orderMap);
      }
    });

    const sorted = Array.from(uniqueById.values()).sort((left, right) => {
      if (left.id === samplePoolAllId && right.id !== samplePoolAllId) {
        return -1;
      }
      if (right.id === samplePoolAllId && left.id !== samplePoolAllId) {
        return 1;
      }
      if (left.id === samplePoolAllId && right.id === samplePoolAllId) {
        return 0;
      }

      if (left.baseTimeframe && right.baseTimeframe && left.baseTimeframe !== right.baseTimeframe) {
        return BASE_TIMEFRAME_ORDER[left.baseTimeframe] - BASE_TIMEFRAME_ORDER[right.baseTimeframe];
      }

      const baseTimeframe = left.baseTimeframe ?? right.baseTimeframe ?? '1d';
      const orderLookup = orderLookupByBase.get(baseTimeframe);
      if (orderLookup) {
        const leftOrder = orderLookup.get(left.id) ?? Number.POSITIVE_INFINITY;
        const rightOrder = orderLookup.get(right.id) ?? Number.POSITIVE_INFINITY;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
      }
      return left.sourceIndex - right.sourceIndex;
    });

    return sorted.map(({ baseTimeframe: _baseTimeframe, sourceIndex: _sourceIndex, ...option }) => option);
  }, [
    availableBuiltInPoolSymbolsById,
    combinedEnabledPoolSymbols.length,
    dataConfigPoolOrderByBase,
    getBuiltInSamplePools,
    localDataSourceSummaryById,
    resolveSamplePoolDisplayName,
    samplePoolAllId,
    selectedCustomSamplePools,
    visibleCustomPoolSymbolsMap
  ]);

  const randomSymbolPool = useMemo(() => {
    if (isBuiltInSamplePoolId(activeSamplePoolId)) {
      return [...(availableBuiltInPoolSymbolsById.get(activeSamplePoolId) ?? [])];
    }
    if (activeSamplePoolId === samplePoolAllId) {
      return [...combinedEnabledPoolSymbols];
    }
    return [...(selectedCustomPoolSymbolsMap.get(activeSamplePoolId) ?? [])];
  }, [
    activeSamplePoolId,
    availableBuiltInPoolSymbolsById,
    combinedEnabledPoolSymbols,
    isBuiltInSamplePoolId,
    samplePoolAllId,
    selectedCustomPoolSymbolsMap
  ]);

  const activeSamplePoolBaseTimeframe = useMemo<BaseTimeframe>(
    () => resolveSamplePoolBaseTimeframe(activeSamplePoolId),
    [activeSamplePoolId, resolveSamplePoolBaseTimeframe]
  );

  return {
    instrumentMetaMap,
    allCustomPoolSymbols,
    selectedCustomSamplePools,
    visibleCustomPoolSymbolsMap,
    visibleCustomPoolInstrumentOptionsMap,
    selectedCustomPoolSymbolsMap,
    selectedCustomPoolInstrumentOptionsMap,
    availableBuiltInPoolSymbolsById,
    availableBuiltInPoolInstrumentOptionsById,
    visibleBuiltInPoolSymbolsById,
    visibleSystemDailyPoolSymbols,
    combinedEnabledPoolSymbols,
    combinedEnabledPoolInstrumentOptions,
    resolveSamplePoolBaseTimeframe,
    trainerSamplePoolOptions,
    randomSymbolPool,
    activeSamplePoolBaseTimeframe
  };
};
