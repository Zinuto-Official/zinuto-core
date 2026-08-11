// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { ApiSpecialTrainingBank } from "@/api";
import { compareSpecialTrainingBaseTimeframes } from "@/workspaces/special-training/domain/specialTrainingTimeframes";
import type {
  EnabledSamplePoolInput,
  NormalizedEnabledSamplePool,
} from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";

export const mergeSpecialTrainingBankPageItems = ({
  currentBanks,
  incomingBanks,
  append,
}: {
  currentBanks: ApiSpecialTrainingBank[];
  incomingBanks: ApiSpecialTrainingBank[];
  append: boolean;
}): ApiSpecialTrainingBank[] => {
  if (!append) {
    return incomingBanks;
  }

  const nextById = new Map(currentBanks.map((bank) => [bank.id, bank]));
  incomingBanks.forEach((bank) => {
    nextById.set(bank.id, bank);
  });
  return Array.from(nextById.values());
};

export const canLoadMoreSpecialTrainingBanks = ({
  nextCursor,
  isLoadingMoreBanks,
}: {
  nextCursor: string | null | undefined;
  isLoadingMoreBanks: boolean;
}): boolean =>
  String(nextCursor ?? "").trim().length > 0 && !isLoadingMoreBanks;

export const normalizeEnabledSamplePools = (
  enabledSamplePools: EnabledSamplePoolInput[],
): NormalizedEnabledSamplePool[] =>
  enabledSamplePools.map((pool) => ({
    id: String(pool.id || "").trim(),
    name: String(pool.name || "").trim(),
    assetClass:
      pool.assetClass === "FUTURES" ||
      pool.assetClass === "FOREX" ||
      pool.assetClass === "CRYPTO"
        ? pool.assetClass
        : "STOCK",
    assetClassLabel: String(pool.assetClassLabel || "").trim(),
    marketPresetId: String(pool.marketPresetId || "").trim(),
    baseTimeframe:
      pool.baseTimeframe === "1m" ||
      pool.baseTimeframe === "5m" ||
      pool.baseTimeframe === "1h" ||
      pool.baseTimeframe === "1d"
        ? pool.baseTimeframe
        : "1d",
    symbols: Array.from(
      new Set(
        (Array.isArray(pool.symbols) ? pool.symbols : [])
          .map((symbol) =>
            String(symbol || "")
              .trim()
              .toUpperCase(),
          )
          .filter((symbol) => symbol.length > 0),
      ),
    ),
    instruments: Array.from(
      new Map(
        (Array.isArray(pool.instruments) ? pool.instruments : [])
          .map((entry) => ({
            instrumentId: String(entry.instrumentId || "").trim(),
            symbol: String(entry.symbol || "")
              .trim()
              .toUpperCase(),
          }))
          .filter(
            (entry) =>
              entry.instrumentId.length > 0 && entry.symbol.length > 0,
          )
          .map((entry) => [entry.instrumentId, entry] as const),
      ).values(),
    ),
    questionBankRevisionToken: String(
      pool.questionBankRevisionToken || "",
    ).trim(),
  }));

export const createEnabledSamplePoolById = (
  normalizedEnabledSamplePools: NormalizedEnabledSamplePool[],
) =>
  new Map(
    normalizedEnabledSamplePools
      .filter((pool) => pool.id.length > 0)
      .map((pool) => [pool.id, pool] as const),
  );

export const resolveDefaultCreateBankTargetTimeframe = (
  normalizedEnabledSamplePools: NormalizedEnabledSamplePool[],
): BaseTimeframe => {
  if (!normalizedEnabledSamplePools.length) {
    return "1d";
  }
  return (
    normalizedEnabledSamplePools.reduce<BaseTimeframe>(
      (current, pool) =>
        compareSpecialTrainingBaseTimeframes(pool.baseTimeframe, current) > 0
          ? pool.baseTimeframe
          : current,
      normalizedEnabledSamplePools[0]?.baseTimeframe ?? "1d",
    ) ?? "1d"
  );
};

export const resolveDefaultSelectedPoolIds = (
  normalizedEnabledSamplePools: NormalizedEnabledSamplePool[],
) => {
  const dailyPoolIds = normalizedEnabledSamplePools
    .filter((pool) => pool.baseTimeframe === "1d")
    .map((pool) => pool.id)
    .filter((poolId) => poolId.length > 0);
  if (dailyPoolIds.length > 0) {
    return dailyPoolIds;
  }
  return normalizedEnabledSamplePools
    .filter((pool) => pool.baseTimeframe !== "1d")
    .map((pool) => pool.id)
    .filter((poolId) => poolId.length > 0);
};

export const normalizeEnabledSymbols = ({
  enabledSamplePoolSymbols,
  normalizedEnabledSamplePools,
}: {
  enabledSamplePoolSymbols: string[];
  normalizedEnabledSamplePools: NormalizedEnabledSamplePool[];
}) => {
  const symbolsFromPools = Array.from(
    new Set(normalizedEnabledSamplePools.flatMap((pool) => pool.symbols)),
  );
  if (symbolsFromPools.length) {
    return symbolsFromPools;
  }
  return Array.from(
    new Set(
      enabledSamplePoolSymbols
        .map((symbol) =>
          String(symbol || "")
            .trim()
            .toUpperCase(),
        )
        .filter((symbol) => symbol.length > 0),
    ),
  );
};

export const resolvePoolsByIds = (
  poolIds: string[],
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>,
) =>
  poolIds.flatMap((poolId) => {
    const pool = enabledSamplePoolById.get(poolId);
    return pool ? [pool] : [];
  });

export const resolveSymbolsFromPools = (
  pools: readonly NormalizedEnabledSamplePool[],
) => Array.from(new Set(pools.flatMap((pool) => pool.symbols)));

export const resolveMissingPoolIds = (
  poolIds: readonly string[],
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>,
) => poolIds.filter((poolId) => !enabledSamplePoolById.has(poolId));

export const resolveInstrumentIdsForPoolIds = (
  poolIds: readonly string[],
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>,
) =>
  Array.from(
    new Set(
      poolIds.flatMap((poolId) =>
        (enabledSamplePoolById.get(poolId)?.instruments ?? []).map(
          (entry) => entry.instrumentId,
        ),
      ),
    ),
  );

export const resolveAssetClassForPoolIds = (
  poolIds: readonly string[],
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>,
): ApiSpecialTrainingBank["assetClass"] =>
  poolIds.flatMap((poolId) => {
    const assetClass = enabledSamplePoolById.get(poolId)?.assetClass;
    return assetClass ? [assetClass] : [];
  })[0] ?? "STOCK";

export const filterSpecialTrainingBanks = ({
  banks,
  enabledSamplePoolById,
  normalizedBankSearchQuery,
}: {
  banks: ApiSpecialTrainingBank[];
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>;
  normalizedBankSearchQuery: string;
}) =>
  normalizedBankSearchQuery.length <= 0
    ? banks
    : banks.filter((bank) => {
        const bankName = String(bank.name || "").trim().toUpperCase();
        const poolNames = bank.scope.poolIds
          .flatMap((poolId) => enabledSamplePoolById.get(poolId)?.name ?? [])
          .join(" ")
          .toUpperCase();
        return (
          bankName.includes(normalizedBankSearchQuery) ||
          poolNames.includes(normalizedBankSearchQuery)
        );
      });
