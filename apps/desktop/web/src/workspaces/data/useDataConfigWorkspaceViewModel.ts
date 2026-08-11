// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import {
  normalizeApiTradingCalendarConfig,
  type ApiTradingCalendarConfig,
} from "@/api";
import type { CsvImportCardState } from "@/domains/data-import/useCsvImportController";
import type { CsvFieldMapping } from "@/domains/data-import/csvHelpers";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import { formatMessageByLanguage } from "@/frontend-kernel/i18n/messageRuntime";
import type { AppUiLanguage } from "@/ui/config/uiConfig";

type CustomSamplePoolLike = {
  id: string;
  name: string;
  sourceFolder: string;
  symbols: string[];
  storageBytes: number;
  baseTimeframe: BaseTimeframe;
  selected: boolean;
};

type BuiltInSamplePoolLike = {
  id: string;
  name: string;
  sourceFolder: string;
  timeZone: string;
  symbols: readonly string[];
  baseTimeframe: BaseTimeframe;
};

export type DataConfigInstrumentMetadataLike = {
  id: string;
  symbol: string;
  baseTimeframe: BaseTimeframe;
  barCount?: number;
  timeStartTs?: string | null;
  timeEndTs?: string | null;
};

type DataConfigInstrumentMetadata = {
  id: string;
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
};

type SourceSymbolStatsLike = {
  instrumentId?: string;
  symbol: string;
  displayLabel?: string;
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
};

type LocalDataSourceSummaryLike = {
  id: string;
  importScopeStrategy: 'FLAT' | 'WITH_PARENT' | null;
  importScopeTopLevelSubfolder: string;
  timeZone: string;
  timeZoneOrigin:
    | "PRESET_DEFAULT"
    | "PRESET_DEFAULT"
    | "INFERRED_DEFAULT"
    | "USER_SELECTED";
  tradingCalendar: ApiTradingCalendarConfig;
  diagnosticProfile?: {
    assetClass?: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
    marketPresetId?: string;
    profileOrigin?: "SYSTEM" | "INFERRED" | "USER";
  };
  status: "IMPORTING" | "READY" | "FAILED";
  symbols?: string[];
  unlockedSymbols?: string[];
  lockedSymbols?: string[];
  lockedSymbolCount?: number;
  requiresSourceFolderRebind?: boolean;
  sourceLocked?: boolean;
  lockReason?: string | null;
  barCount: number;
  symbolStats: SourceSymbolStatsLike[];
  timeStartTs: string | null;
  timeEndTs: string | null;
  storageBytes: number;
  fieldMapping?: CsvFieldMapping | null;
  lastJob?: {
    status?: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'CANCELED';
    finishedAt?: string | null;
  } | null;
};

const normalizeDiagnosticProfile = (
  profile: LocalDataSourceSummaryLike["diagnosticProfile"],
): {
  assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  marketPresetId: string;
  profileOrigin: "SYSTEM" | "INFERRED" | "USER";
} => ({
  assetClass:
    profile?.assetClass === "FUTURES" ||
    profile?.assetClass === "FOREX" ||
    profile?.assetClass === "CRYPTO"
      ? profile.assetClass
      : "STOCK",
  marketPresetId: String(profile?.marketPresetId || "").trim() || "A_SHARE",
  profileOrigin:
    profile?.profileOrigin === "SYSTEM" || profile?.profileOrigin === "USER"
      ? profile.profileOrigin
      : "INFERRED",
});

type UseDataConfigWorkspaceViewModelArgs = {
  language: AppUiLanguage;
  customSamplePools: CustomSamplePoolLike[];
  includeSystemDefaultPool: boolean;
  systemPoolStorageBytesById?: Record<string, number>;
  systemPoolNameOverrides?: Record<string, string>;
  dataConfigPoolOrderByBase?: Partial<Record<BaseTimeframe, string[]>>;
  builtInSamplePools: BuiltInSamplePoolLike[];
  visibleBuiltInPoolSymbolsById: ReadonlyMap<string, string[]>;
  allCustomPoolSymbols: string[];
  resolveSamplePoolDisplayName: (id: string, fallbackName: string) => string;
  csvImportCardStates: CsvImportCardState[];
  localDataSourceSummaries: LocalDataSourceSummaryLike[];
  instruments: DataConfigInstrumentMetadataLike[];
  formatMoney: (value: number, digits?: number) => string;
  formatStorageBytes: (value: number) => string;
};

const normalizeDataConfigTimestamp = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

export const buildDataConfigInstrumentMetadataBySymbolAndTimeframe = (
  instruments: DataConfigInstrumentMetadataLike[],
): Map<string, DataConfigInstrumentMetadata> => {
  const map = new Map<string, DataConfigInstrumentMetadata>();
  instruments.forEach((instrument) => {
    const symbol = String(instrument.symbol || "").trim().toUpperCase();
    const instrumentId = String(instrument.id || "").trim();
    const baseTimeframe = instrument.baseTimeframe;
    if (!symbol || !instrumentId || !baseTimeframe) {
      return;
    }
    map.set(`${baseTimeframe}:${symbol}`, {
      id: instrumentId,
      barCount: Math.max(0, Math.floor(Number(instrument.barCount ?? 0))),
      timeStartTs: normalizeDataConfigTimestamp(instrument.timeStartTs),
      timeEndTs: normalizeDataConfigTimestamp(instrument.timeEndTs),
    });
  });
  return map;
};

export const readDataConfigSystemPoolInstrumentFacts = ({
  symbols,
  baseTimeframe,
  metadataBySymbolAndTimeframe,
}: {
  symbols: string[];
  baseTimeframe: BaseTimeframe;
  metadataBySymbolAndTimeframe: Map<string, DataConfigInstrumentMetadata>;
}) => {
  let timeStartTs: string | null = null;
  let timeEndTs: string | null = null;
  const symbolBarCountBySymbol: Record<string, number> = {};
  const symbolInstrumentIdBySymbol: Record<string, string> = {};
  const symbolTimeRangeBySymbol: Record<
    string,
    { timeStartTs: string | null; timeEndTs: string | null }
  > = {};

  symbols.forEach((symbol) => {
    const normalizedSymbol = String(symbol || "").trim().toUpperCase();
    const metadata =
      metadataBySymbolAndTimeframe.get(`${baseTimeframe}:${normalizedSymbol}`) ??
      null;
    const symbolBarCount = Math.max(
      0,
      Math.floor(Number(metadata?.barCount ?? 0)),
    );
    const symbolTimeStartTs = metadata?.timeStartTs ?? null;
    const symbolTimeEndTs = metadata?.timeEndTs ?? null;

    symbolBarCountBySymbol[symbol] = symbolBarCount;
    symbolInstrumentIdBySymbol[symbol] = metadata?.id ?? "";
    symbolTimeRangeBySymbol[symbol] = {
      timeStartTs: symbolTimeStartTs,
      timeEndTs: symbolTimeEndTs,
    };
    if (symbolTimeStartTs && (!timeStartTs || symbolTimeStartTs < timeStartTs)) {
      timeStartTs = symbolTimeStartTs;
    }
    if (symbolTimeEndTs && (!timeEndTs || symbolTimeEndTs > timeEndTs)) {
      timeEndTs = symbolTimeEndTs;
    }
  });

  return {
    barCount: symbols.reduce(
      (total, symbol) => total + Math.max(0, symbolBarCountBySymbol[symbol] ?? 0),
      0,
    ),
    symbolBarCountBySymbol,
    symbolInstrumentIdBySymbol,
    symbolTimeRangeBySymbol,
    timeStartTs,
    timeEndTs,
  };
};

export const useDataConfigWorkspaceViewModel = ({
  language,
  customSamplePools,
  includeSystemDefaultPool,
  systemPoolStorageBytesById,
  systemPoolNameOverrides,
  dataConfigPoolOrderByBase,
  builtInSamplePools,
  visibleBuiltInPoolSymbolsById,
  allCustomPoolSymbols,
  resolveSamplePoolDisplayName,
  csvImportCardStates,
  localDataSourceSummaries,
  instruments,
  formatMoney,
  formatStorageBytes,
}: UseDataConfigWorkspaceViewModelArgs) => {
  const tt = (key: Parameters<typeof formatMessageByLanguage>[1]): string =>
    formatMessageByLanguage(language, key);
  const ttf = (
    key: Parameters<typeof formatMessageByLanguage>[1],
    values: Array<unknown> = [],
  ): string => formatMessageByLanguage(language, key, values);

  const availableBuiltInCount = useMemo(
    () =>
      Array.from(
        new Set(Array.from(visibleBuiltInPoolSymbolsById.values()).flat()),
      ).length,
    [visibleBuiltInPoolSymbolsById],
  );
  const headerSymbolCount = useMemo(
    () => allCustomPoolSymbols.length + availableBuiltInCount,
    [allCustomPoolSymbols.length, availableBuiltInCount],
  );

  const localDataSourceById = useMemo(() => {
    const map = new Map<string, LocalDataSourceSummaryLike>();
    localDataSourceSummaries.forEach((source) => {
      const normalizedId = String(source.id || "").trim();
      if (!normalizedId) {
        return;
      }
      map.set(normalizedId, source);
    });
    return map;
  }, [localDataSourceSummaries]);
  const instrumentMetadataBySymbolAndTimeframe = useMemo(
    () => buildDataConfigInstrumentMetadataBySymbolAndTimeframe(instruments),
    [instruments],
  );

  const poolSettingsRows = useMemo(() => {
    const rows: Array<{
      id: string;
      name: string;
      sourceFolder: string;
      importScopeStrategy: 'FLAT' | 'WITH_PARENT' | null;
      importScopeTopLevelSubfolder: string;
      timeZone: string;
      timeZoneOrigin:
        | "PRESET_DEFAULT"
        | "PRESET_DEFAULT"
        | "INFERRED_DEFAULT"
        | "USER_SELECTED";
      tradingCalendar: ApiTradingCalendarConfig;
      symbols: string[];
      symbolCount: number;
      barCount: number;
      symbolBarCountBySymbol: Record<string, number>;
      symbolInstrumentIdBySymbol: Record<string, string>;
      symbolTimeRangeBySymbol: Record<
        string,
        { timeStartTs: string | null; timeEndTs: string | null }
      >;
      timeStartTs: string | null;
      timeEndTs: string | null;
      lastSyncedAt: string | null;
      storageBytes: number | null;
      csvFieldMapping: CsvFieldMapping | null;
      baseTimeframe: BaseTimeframe;
      diagnosticProfile: ReturnType<typeof normalizeDiagnosticProfile>;
      selected: boolean;
      status: "READY" | "IMPORTING" | "FAILED";
      isSystem: boolean;
      requiresSourceFolderRebind: boolean;
      sourceLocked: boolean;
      unlockedSymbols: string[];
      lockedSymbols: string[];
      lockedSymbolCount: number;
      lockReason: string | null;
    }> = [];

    builtInSamplePools.forEach((pool) => {
      const symbols = visibleBuiltInPoolSymbolsById.get(pool.id) ?? [];
      if (!symbols.length) {
        return;
      }
      const systemPoolSourceSummary =
        localDataSourceById.get(pool.id) ?? null;
      const systemPoolStorageBytes = Number(
        systemPoolStorageBytesById?.[pool.id] ?? Number.NaN,
      );
      const systemInstrumentSummary =
        readDataConfigSystemPoolInstrumentFacts({
          symbols,
          baseTimeframe: pool.baseTimeframe,
          metadataBySymbolAndTimeframe: instrumentMetadataBySymbolAndTimeframe,
        });
      rows.push({
        id: pool.id,
        name: resolveSamplePoolDisplayName(
          pool.id,
          String(systemPoolNameOverrides?.[pool.id] || "").trim() ||
            pool.name,
        ),
        sourceFolder: pool.sourceFolder || tt("appText.systemDefault"),
        importScopeStrategy: systemPoolSourceSummary?.importScopeStrategy ?? null,
        importScopeTopLevelSubfolder:
          systemPoolSourceSummary?.importScopeTopLevelSubfolder ?? '',
        timeZone: systemPoolSourceSummary?.timeZone ?? pool.timeZone,
        timeZoneOrigin: systemPoolSourceSummary?.timeZoneOrigin ?? 'PRESET_DEFAULT',
        tradingCalendar: normalizeApiTradingCalendarConfig(
          systemPoolSourceSummary?.tradingCalendar,
        ),
        symbols,
        symbolCount: symbols.length,
        barCount: systemInstrumentSummary.barCount,
        symbolBarCountBySymbol: systemInstrumentSummary.symbolBarCountBySymbol,
        symbolInstrumentIdBySymbol:
          systemInstrumentSummary.symbolInstrumentIdBySymbol,
        symbolTimeRangeBySymbol:
          systemInstrumentSummary.symbolTimeRangeBySymbol,
        timeStartTs: systemInstrumentSummary.timeStartTs,
        timeEndTs: systemInstrumentSummary.timeEndTs,
        lastSyncedAt: systemPoolSourceSummary?.lastJob?.finishedAt ?? null,
        storageBytes:
          Number.isFinite(systemPoolStorageBytes) && systemPoolStorageBytes >= 0
            ? Math.floor(systemPoolStorageBytes)
            : systemPoolSourceSummary?.storageBytes ?? null,
        csvFieldMapping: systemPoolSourceSummary?.fieldMapping ?? null,
        baseTimeframe: pool.baseTimeframe,
        diagnosticProfile: normalizeDiagnosticProfile(
          systemPoolSourceSummary?.diagnosticProfile ?? {
            assetClass: pool.id.toLowerCase().includes("fx") ? "FOREX" : "STOCK",
            marketPresetId: pool.id.toLowerCase().includes("fx")
              ? "FOREX_STANDARD_LOT"
              : "US_STOCK",
            profileOrigin: "SYSTEM",
          },
        ),
        selected: includeSystemDefaultPool,
        status: "READY" as const,
        isSystem: true as const,
        requiresSourceFolderRebind: false,
        sourceLocked: false,
        unlockedSymbols: symbols,
        lockedSymbols: [],
        lockedSymbolCount: 0,
        lockReason: null,
      });
    });

    rows.push(
      ...customSamplePools
      .map((pool) => {
        const sourceSummary = localDataSourceById.get(pool.id);
        if (!sourceSummary) {
          return null;
        }
        const preferredSymbols: string[] =
          Array.isArray(sourceSummary?.symbols) && sourceSummary.symbols.length > 0
            ? sourceSummary.symbols
            : [];
        const normalizedSymbols = Array.from(
          new Set(
            preferredSymbols
              .map((symbol: string) => String(symbol || "").trim().toUpperCase())
              .filter((symbol) => Boolean(symbol)),
          ),
        );
        if (!normalizedSymbols.length) {
          return null;
        }
        const sourceSymbolStatsBySymbol = new Map<
          string,
          {
            barCount: number;
            timeStartTs: string | null;
            timeEndTs: string | null;
            instrumentId: string;
          }
        >();
        (Array.isArray(sourceSummary?.symbolStats)
          ? sourceSummary?.symbolStats
          : []
        ).forEach((item) => {
          const symbol = String(item?.symbol ?? "")
            .trim()
            .toUpperCase();
          if (!symbol) {
            return;
          }
          sourceSymbolStatsBySymbol.set(symbol, {
            instrumentId: String(item?.instrumentId || "").trim(),
            barCount: Math.max(0, Number(item?.barCount || 0)),
            timeStartTs: item?.timeStartTs ?? null,
            timeEndTs: item?.timeEndTs ?? null,
          });
        });
        const fallbackSourceTimeStartTs = sourceSummary?.timeStartTs ?? null;
        const fallbackSourceTimeEndTs = sourceSummary?.timeEndTs ?? null;
        return {
          id: pool.id,
          name: resolveSamplePoolDisplayName(pool.id, pool.name),
          sourceFolder: pool.sourceFolder || tt("appText.unknown"),
          importScopeStrategy: sourceSummary?.importScopeStrategy ?? null,
          importScopeTopLevelSubfolder: String(
            sourceSummary?.importScopeTopLevelSubfolder || '',
          ).trim(),
          timeZone: String(sourceSummary.timeZone || '').trim() || 'Asia/Shanghai',
          timeZoneOrigin: sourceSummary?.timeZoneOrigin ?? 'PRESET_DEFAULT',
          tradingCalendar: normalizeApiTradingCalendarConfig(
            sourceSummary.tradingCalendar,
          ),
          symbols: normalizedSymbols,
          symbolCount: normalizedSymbols.length,
          barCount: Math.max(0, Number(sourceSummary.barCount || 0)),
          symbolBarCountBySymbol: Object.fromEntries(
            normalizedSymbols.map((symbol) => [
              symbol,
              Math.max(
                0,
                Number(
                  sourceSymbolStatsBySymbol.get(symbol)?.barCount ?? 0,
                ),
              ),
            ]),
          ) as Record<string, number>,
          symbolInstrumentIdBySymbol: Object.fromEntries(
            normalizedSymbols.map((symbol) => [
              symbol,
              sourceSymbolStatsBySymbol.get(symbol)?.instrumentId ?? "",
            ]),
          ) as Record<string, string>,
          symbolTimeRangeBySymbol: Object.fromEntries(
            normalizedSymbols.map((symbol) => [
              symbol,
              {
                timeStartTs:
                  sourceSymbolStatsBySymbol.get(symbol)?.timeStartTs ??
                  fallbackSourceTimeStartTs,
                timeEndTs:
                  sourceSymbolStatsBySymbol.get(symbol)?.timeEndTs ??
                  fallbackSourceTimeEndTs,
              },
            ]),
          ) as Record<
            string,
            { timeStartTs: string | null; timeEndTs: string | null }
          >,
          timeStartTs: sourceSummary?.timeStartTs ?? null,
          timeEndTs: sourceSummary?.timeEndTs ?? null,
          lastSyncedAt: sourceSummary?.lastJob?.finishedAt ?? null,
          storageBytes: Math.max(0, Number(sourceSummary.storageBytes || 0)),
          csvFieldMapping: sourceSummary.fieldMapping ?? null,
          baseTimeframe: pool.baseTimeframe,
          diagnosticProfile: normalizeDiagnosticProfile(
            sourceSummary.diagnosticProfile,
          ),
          selected: true,
          status: sourceSummary.status,
          isSystem: false as const,
          requiresSourceFolderRebind: Boolean(
            sourceSummary?.requiresSourceFolderRebind,
          ),
          sourceLocked: Boolean(sourceSummary?.sourceLocked),
          unlockedSymbols: Array.isArray(sourceSummary?.unlockedSymbols)
            ? Array.from(
                new Set(
                  sourceSummary.unlockedSymbols.map((symbol) =>
                    String(symbol || "").trim().toUpperCase(),
                  ),
                ),
              )
            : normalizedSymbols,
          lockedSymbols: Array.isArray(sourceSummary?.lockedSymbols)
            ? Array.from(
                new Set(
                  sourceSummary.lockedSymbols.map((symbol) =>
                    String(symbol || "").trim().toUpperCase(),
                  ),
                ),
              )
            : [],
          lockedSymbolCount: Math.max(
            0,
            Number(sourceSummary?.lockedSymbolCount ?? 0),
          ),
          lockReason: sourceSummary?.lockReason ?? null,
        };
      })
      .filter((pool): pool is NonNullable<typeof pool> => Boolean(pool)),
    );

    const normalizedOrderMap = new Map<BaseTimeframe, Map<string, number>>();
    (["1m", "5m", "1h", "1d"] as const).forEach((baseTimeframe) => {
      const orderList = dataConfigPoolOrderByBase?.[baseTimeframe];
      if (!Array.isArray(orderList) || !orderList.length) {
        return;
      }
      const orderIndexById = new Map<string, number>();
      orderList.forEach((poolId, index) => {
        const normalizedPoolId = String(poolId || "").trim();
        if (!normalizedPoolId || orderIndexById.has(normalizedPoolId)) {
          return;
        }
        orderIndexById.set(normalizedPoolId, index);
      });
      if (orderIndexById.size > 0) {
        normalizedOrderMap.set(baseTimeframe, orderIndexById);
      }
    });

    return rows.sort((left, right) => {
      if (left.baseTimeframe !== right.baseTimeframe) {
        return 0;
      }
      const orderIndexById = normalizedOrderMap.get(left.baseTimeframe);
      if (!orderIndexById) {
        return 0;
      }
      const leftOrder =
        orderIndexById.get(String(left.id || "").trim()) ??
        Number.POSITIVE_INFINITY;
      const rightOrder =
        orderIndexById.get(String(right.id || "").trim()) ??
        Number.POSITIVE_INFINITY;
      if (leftOrder === rightOrder) {
        return 0;
      }
      return leftOrder - rightOrder;
    });
  }, [
    builtInSamplePools,
    visibleBuiltInPoolSymbolsById,
    customSamplePools,
    dataConfigPoolOrderByBase,
    includeSystemDefaultPool,
    instrumentMetadataBySymbolAndTimeframe,
    language,
    localDataSourceById,
    resolveSamplePoolDisplayName,
    systemPoolStorageBytesById,
    systemPoolNameOverrides,
  ]);

  const csvImportCardViews = useMemo(
    () =>
      csvImportCardStates.map((cardState) => {
        const totalFiles = Math.max(0, Number(cardState.totalFiles) || 0);
        const doneFiles = Math.max(0, Number(cardState.doneFiles) || 0);
        const importedRows = Math.max(0, Number(cardState.importedRows) || 0);
        const skippedRows = Math.max(0, Number(cardState.skippedRows) || 0);
        const totalRows = Math.max(0, Number(cardState.totalRows) || 0);
        const progressPercent = Math.max(
          0,
          Math.min(100, Number(cardState.progressPercent) || 0),
        );
        const importProgressPercent = Math.max(
          0,
          Math.min(100, Number(cardState.importProgressPercent) || 0),
        );
        const compactProgressPercent = Math.max(
          0,
          Math.min(100, Number(cardState.compactProgressPercent) || 0),
        );
        const compactProgressDisplayPercent = Math.max(
          0,
          Math.min(100, Number(cardState.compactProgressDisplayPercent) || 0),
        );
        const compactBeforeBytes = Math.max(
          0,
          Number(cardState.compactBeforeBytes) || 0,
        );
        const compactAfterBytes = Math.max(
          0,
          Number(cardState.compactAfterBytes) || 0,
        );
        const compactReclaimedBytes = Math.max(
          0,
          Number(cardState.compactReclaimedBytes) || 0,
        );
        const shouldShowCompactProgress =
          cardState.shouldShowCompactProgress === true;
        const compactAfterDisplayBytes =
          Math.max(0, Number(cardState.compactAfterDisplayBytes) || 0);
        const compactReclaimedDisplayBytes =
          Math.max(0, Number(cardState.compactReclaimedDisplayBytes) || 0);

        const progressLabelText = ttf("appText.progressValue0Value1", [
          formatMoney(doneFiles, 0),
          formatMoney(totalFiles, 0),
        ]);
        const compactProgressLabelText = ttf("appText.compactionProgressValue0Percent", [
          formatMoney(compactProgressDisplayPercent, 0),
        ]);
        const compactSizeSummaryText =
          compactBeforeBytes > 0
            ? `${formatStorageBytes(compactBeforeBytes)} ${tt("appText.message0697")} ${formatStorageBytes(compactAfterDisplayBytes)}`
            : "";
        const compactEffectText =
          compactBeforeBytes > 0
            ? ttf("appText.compactionResultValue0Value1SavedValue2", [
                formatStorageBytes(compactBeforeBytes),
                formatStorageBytes(compactAfterDisplayBytes),
                formatStorageBytes(compactReclaimedDisplayBytes),
              ])
            : "";
        const skippedRowsLabelText =
          skippedRows > 0
            ? ttf("appText.importSkippedProblemRowsValue0", [
                formatMoney(skippedRows, 0),
              ])
            : "";
        return {
          ...cardState,
          totalFiles,
          doneFiles,
          importedRows,
          skippedRows,
          totalRows,
          progressPercent,
          importProgressPercent,
          compactProgressPercent,
          compactProgressDisplayPercent,
          compactBeforeBytes,
          compactAfterBytes,
          compactReclaimedBytes,
          progressLabelText,
          compactProgressLabelText,
          compactSizeSummaryText,
          shouldShowCompactProgress,
          compactEffectText,
          skippedRowsLabelText,
        };
      }),
    [
      csvImportCardStates,
      formatMoney,
      formatStorageBytes,
      language,
    ],
  );

  const enabledPoolGroupCount = useMemo(
    () =>
      selectedPoolCount(customSamplePools) +
      (includeSystemDefaultPool
        ? builtInSamplePools.filter((pool) => (visibleBuiltInPoolSymbolsById.get(pool.id) ?? []).length > 0).length
        : 0),
    [
      builtInSamplePools,
      customSamplePools,
      includeSystemDefaultPool,
      visibleBuiltInPoolSymbolsById,
    ],
  );

  const totalPoolGroupCount = useMemo(
    () =>
      customSamplePools.length +
      builtInSamplePools.filter((pool) => (visibleBuiltInPoolSymbolsById.get(pool.id) ?? []).length > 0).length,
    [
      builtInSamplePools,
      customSamplePools.length,
      visibleBuiltInPoolSymbolsById,
    ],
  );

  return {
    headerSymbolCount,
    poolSettingsRows,
    csvImportCardViews,
    enabledPoolGroupCount,
    totalPoolGroupCount,
  };
};

const selectedPoolCount = (customSamplePools: CustomSamplePoolLike[]): number =>
  customSamplePools.length;
