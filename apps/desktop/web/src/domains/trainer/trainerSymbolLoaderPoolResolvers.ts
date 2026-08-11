// SPDX-License-Identifier: GPL-3.0-only

import type { BuiltInSamplePoolConfig } from "@/domains/trainer/samplePools";
import type {
  BaseTimeframe,
} from "@/domains/trainer/trainerTypes";

export type CustomSamplePoolLike = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
  symbols: string[];
};

export type TrainingPoolMeta = {
  id: string;
  name: string;
};

export const resolvePoolBaseTimeframe = ({
  symbol,
  poolId,
  fallback = "1d",
  samplePoolAllId,
  customSamplePools,
  findBuiltInSamplePoolById,
  resolveBuiltInPoolBySymbol,
}: {
  symbol: string;
  poolId?: string;
  fallback?: BaseTimeframe;
  samplePoolAllId: string;
  customSamplePools: CustomSamplePoolLike[];
  findBuiltInSamplePoolById: (
    poolId: string,
  ) => BuiltInSamplePoolConfig | undefined;
  resolveBuiltInPoolBySymbol: (
    symbol: string,
  ) => BuiltInSamplePoolConfig | null;
}): BaseTimeframe => {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  const normalizedPoolId = String(poolId || "").trim();
  const builtInPool = findBuiltInSamplePoolById(normalizedPoolId);
  if (builtInPool) {
    return builtInPool.baseTimeframe;
  }
  if (normalizedPoolId && normalizedPoolId !== samplePoolAllId) {
    const matched = customSamplePools.find((pool) => pool.id === normalizedPoolId);
    if (matched) {
      return matched.baseTimeframe;
    }
  }
  const matchedBySymbol = customSamplePools.find((pool) =>
    pool.symbols.includes(normalizedSymbol),
  );
  if (matchedBySymbol) {
    return matchedBySymbol.baseTimeframe;
  }
  const builtInBySymbol = resolveBuiltInPoolBySymbol(normalizedSymbol);
  if (builtInBySymbol) {
    return builtInBySymbol.baseTimeframe;
  }
  return fallback;
};

export const resolveTrainingPoolState = ({
  symbol,
  preferredPoolId,
  preferredPoolName,
  fallbackBaseTimeframe,
  samplePoolAllId,
  samplePoolUnknownId,
  samplePoolUnknownName,
  customSamplePools,
  includeSystemDefaultPool,
  findBuiltInSamplePoolById,
  resolveBuiltInPoolBySymbol,
  resolveSamplePoolDisplayName,
  sanitizeSamplePoolName,
}: {
  symbol: string;
  preferredPoolId: string | undefined;
  preferredPoolName: string | undefined;
  fallbackBaseTimeframe: BaseTimeframe;
  samplePoolAllId: string;
  samplePoolUnknownId: string;
  samplePoolUnknownName: () => string;
  customSamplePools: CustomSamplePoolLike[];
  includeSystemDefaultPool: boolean;
  findBuiltInSamplePoolById: (
    poolId: string,
  ) => BuiltInSamplePoolConfig | undefined;
  resolveBuiltInPoolBySymbol: (
    symbol: string,
  ) => BuiltInSamplePoolConfig | null;
  resolveSamplePoolDisplayName: (
    poolId: string,
    fallbackName?: string,
  ) => string;
  sanitizeSamplePoolName: (raw: string, fallback?: string) => string;
}): {
  poolMeta: TrainingPoolMeta;
  baseTimeframe: BaseTimeframe;
} => {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  const normalizedPreferredPoolId = String(preferredPoolId || "").trim();
  const normalizedPreferredPoolName = preferredPoolName
    ? sanitizeSamplePoolName(preferredPoolName, samplePoolUnknownName())
    : "";
  const builtInPoolBySymbol = resolveBuiltInPoolBySymbol(normalizedSymbol);
  const builtInPoolEnabled = Boolean(builtInPoolBySymbol && includeSystemDefaultPool);
  const builtInPoolAvailable = Boolean(
    builtInPoolBySymbol && builtInPoolEnabled,
  );

  let poolMeta: TrainingPoolMeta = {
    id: samplePoolUnknownId,
    name: samplePoolUnknownName(),
  };
  let baseTimeframe = fallbackBaseTimeframe;

  const preferredBuiltInPool = normalizedPreferredPoolId
    ? findBuiltInSamplePoolById(normalizedPreferredPoolId)
    : null;
  const preferredBuiltInPoolMatches =
    Boolean(preferredBuiltInPool) &&
    preferredBuiltInPool!.symbols.some(
      (item) => item.toUpperCase() === normalizedSymbol,
    ) &&
    includeSystemDefaultPool;

  if (preferredBuiltInPool && preferredBuiltInPoolMatches) {
    return {
      poolMeta: {
        id: preferredBuiltInPool.id,
        name: preferredBuiltInPool.name,
      },
      baseTimeframe: preferredBuiltInPool.baseTimeframe,
    };
  }

  if (
    normalizedPreferredPoolId &&
    normalizedPreferredPoolId !== samplePoolAllId &&
    normalizedPreferredPoolName
  ) {
    return {
      poolMeta: {
        id: normalizedPreferredPoolId,
        name: resolveSamplePoolDisplayName(
          normalizedPreferredPoolId,
          normalizedPreferredPoolName,
        ),
      },
      baseTimeframe: resolvePoolBaseTimeframe({
        symbol: normalizedSymbol,
        poolId: normalizedPreferredPoolId,
        fallback: fallbackBaseTimeframe,
        samplePoolAllId,
        customSamplePools,
        findBuiltInSamplePoolById,
        resolveBuiltInPoolBySymbol,
      }),
    };
  }

  if (
    normalizedPreferredPoolId &&
    normalizedPreferredPoolId !== samplePoolAllId
  ) {
    const matched = customSamplePools.find(
      (pool) =>
        pool.id === normalizedPreferredPoolId &&
        pool.symbols.includes(normalizedSymbol),
    );
    if (matched) {
      poolMeta = {
        id: matched.id,
        name: resolveSamplePoolDisplayName(matched.id, matched.name),
      };
      baseTimeframe = matched.baseTimeframe;
      return { poolMeta, baseTimeframe };
    }
  }

  if (builtInPoolAvailable && builtInPoolBySymbol) {
    return {
      poolMeta: {
        id: builtInPoolBySymbol.id,
        name: builtInPoolBySymbol.name,
      },
      baseTimeframe: builtInPoolBySymbol.baseTimeframe,
    };
  }

  const customPoolBySymbol = customSamplePools.find((pool) =>
    pool.symbols.includes(normalizedSymbol),
  );
  if (customPoolBySymbol) {
    return {
      poolMeta: {
        id: customPoolBySymbol.id,
        name: resolveSamplePoolDisplayName(
          customPoolBySymbol.id,
          customPoolBySymbol.name,
        ),
      },
      baseTimeframe: customPoolBySymbol.baseTimeframe,
    };
  }

  return { poolMeta, baseTimeframe };
};
