// SPDX-License-Identifier: GPL-3.0-only

import type {
  LocalDataSourceSummary,
} from "./types.js";
import type { listLocalDataSourcesCore } from "./sourceQuery.js";
import type {
  clearLocalDataSourcesAndMarketDataCore,
  removeLocalDataSourceCore,
} from "./sourceMutations.js";

type CreateSourceAdminServiceArgs = {
  listLocalDataSourcesCore: typeof listLocalDataSourcesCore;
  clearLocalDataSourcesAndMarketDataCore:
    typeof clearLocalDataSourcesAndMarketDataCore;
  removeLocalDataSourceCore: typeof removeLocalDataSourceCore;
  appError: (
    code: string,
    args?: Record<string, string | number | boolean | null>,
    status?: number,
  ) => Error;
  nowIso: () => string;
  invalidateLocalDataSourcesCache: () => void;
  assertLocalImportOperationAccess: (sourceIdRaw?: string) => Promise<void>;
  listLocalDataSourcesCached: () => Promise<LocalDataSourceSummary[]>;
  listLocalDataSourcesDeps: Parameters<typeof listLocalDataSourcesCore>[0];
  recoverStaleActiveImportJobsIfNeeded: () => void;
  clearLocalDataSourcesAndMarketDataDeps:
    Parameters<typeof clearLocalDataSourcesAndMarketDataCore>[0];
  removeLocalDataSourceDeps:
    Parameters<typeof removeLocalDataSourceCore>[1];
  removeSymbolsFromLocalDataSourceDeps: {
    isSystemResetRunning: () => boolean;
    getSourceById: (
      sourceId: string,
    ) => { id: string; baseTimeframe: "1m" | "5m" | "1h" | "1d" } | undefined;
    countActiveJobsBySource: (sourceId: string) => number;
    listImportedSymbolsBySource: (sourceId: string) => Array<{ symbol: string }>;
    getLocalInstrumentBySymbol: (
      sourceId: string,
      symbol: string,
      baseTimeframe: "1m" | "5m" | "1h" | "1d",
    ) => { id: string } | undefined;
    removeMarketInstrumentData: (instrumentId: string) => Promise<unknown>;
    runDeleteSourceSymbolsTx: (
      sourceId: string,
      symbols: string[],
      instrumentIds: string[],
    ) => { deletedSourceFiles: number; deletedInstruments: number };
    reclaimEmptyMarketStorage: () => Promise<unknown>;
    summarizeSourceBars: (sourceId: string) => Promise<{
      symbolCount: number;
      barCount: number;
      startTs: string | null;
      endTs: string | null;
    }>;
    estimateSourceStorageBytesFromCurrentMarket: (
      barCount: number,
    ) => Promise<number>;
    updateSourceSymbolMutationSummary: (
      totalFiles: number,
      importedFiles: number,
      symbolCount: number,
      barCount: number,
      storageBytes: number,
      startTs: string | null,
      endTs: string | null,
      updatedAt: string,
      sourceId: string,
    ) => boolean;
    beginSourceSymbolMutation: (
      updatedAt: string,
      sourceId: string,
    ) => boolean;
    completeSourceSymbolMutation: (
      updatedAt: string,
      sourceId: string,
    ) => boolean;
    markSourceSymbolMutationFailed: (
      updatedAt: string,
      sourceId: string,
    ) => void;
    verifySourceSymbolsRemoved: (
      sourceId: string,
      symbols: string[],
      instrumentIds: string[],
    ) => Promise<void>;
  };
};

const LOCAL_DATA_PARTIAL_ERROR_CODE =
  "LOCAL_DATA_DESTRUCTIVE_OPERATION_PARTIAL_FAILED";

const normalizePartialFailureCause = (error: unknown): string => {
  if (error && typeof error === "object") {
    const code = String((error as { code?: unknown }).code ?? "").trim();
    if (code) {
      return code;
    }
  }
  if (error instanceof Error) {
    return error.message.trim() || error.name || "UNKNOWN";
  }
  return String(error ?? "").trim() || "UNKNOWN";
};

export const createSourceAdminService = ({
  listLocalDataSourcesCore,
  clearLocalDataSourcesAndMarketDataCore,
  removeLocalDataSourceCore,
  appError,
  nowIso,
  invalidateLocalDataSourcesCache,
  assertLocalImportOperationAccess,
  listLocalDataSourcesDeps,
  recoverStaleActiveImportJobsIfNeeded,
  clearLocalDataSourcesAndMarketDataDeps,
  removeLocalDataSourceDeps,
  removeSymbolsFromLocalDataSourceDeps,
}: CreateSourceAdminServiceArgs) => {
  const listLocalDataSources = async (): Promise<LocalDataSourceSummary[]> => {
    const items = await listLocalDataSourcesCore(listLocalDataSourcesDeps);
    return items;
  };

  const clearLocalDataSourcesAndMarketData = async () => {
    // Local cleanup stays available while no import or mutation lock is active.
    recoverStaleActiveImportJobsIfNeeded();
    const result = await clearLocalDataSourcesAndMarketDataCore(
      clearLocalDataSourcesAndMarketDataDeps,
    );
    invalidateLocalDataSourcesCache();
    return result;
  };

  const removeLocalDataSource = async (sourceIdRaw: string) => {
    // Users still need to be able to delete retained local imports after
    // downgrading, so single-source removal must not reuse import-limit guards.
    recoverStaleActiveImportJobsIfNeeded();
    const result = await removeLocalDataSourceCore(
      sourceIdRaw,
      removeLocalDataSourceDeps,
    );
    invalidateLocalDataSourcesCache();
    return result;
  };

  const removeSymbolsFromLocalDataSource = async (
    sourceIdRaw: string,
    symbolsRaw: string[],
  ) => {
    await assertLocalImportOperationAccess(sourceIdRaw);
    const sourceId = String(sourceIdRaw ?? "").trim();
    const requestedSymbols = Array.from(
      new Set(
        (Array.isArray(symbolsRaw) ? symbolsRaw : [])
          .map((symbol) => String(symbol ?? "").trim().toUpperCase())
          .filter((symbol) => Boolean(symbol)),
      ),
    );
    if (!sourceId || !requestedSymbols.length) {
      throw appError("INVALID_PARAMS");
    }
    if (removeSymbolsFromLocalDataSourceDeps.isSystemResetRunning()) {
      throw appError("SYSTEM_RESET_IN_PROGRESS");
    }
    const sourceExists = removeSymbolsFromLocalDataSourceDeps.getSourceById(sourceId);
    if (!sourceExists) {
      throw appError("LOCAL_DATA_SOURCE_NOT_FOUND", { sourceId }, 404);
    }
    const activeJobs =
      removeSymbolsFromLocalDataSourceDeps.countActiveJobsBySource(sourceId);
    if (Number.isFinite(activeJobs) && activeJobs > 0) {
      throw appError("LOCAL_DATA_IMPORT_JOB_ACTIVE");
    }
    const mutationStarted =
      removeSymbolsFromLocalDataSourceDeps.beginSourceSymbolMutation(
        nowIso(),
        sourceId,
      );
    if (!mutationStarted) {
      throw appError(
        "LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS",
        { sourceId },
        409,
      );
    }
    invalidateLocalDataSourcesCache();
    try {
      const importedSymbolSet = new Set(
        removeSymbolsFromLocalDataSourceDeps
          .listImportedSymbolsBySource(sourceId)
          .map((item) => String(item.symbol ?? "").trim().toUpperCase())
          .filter((symbol) => Boolean(symbol)),
      );
      const removedSymbols = requestedSymbols.filter((symbol) =>
        importedSymbolSet.has(symbol),
      );
      const skippedSymbols = requestedSymbols.filter(
        (symbol) => !importedSymbolSet.has(symbol),
      );

      const removableInstrumentIds: string[] = [];
      removedSymbols.forEach((symbol) => {
        const instrument =
          removeSymbolsFromLocalDataSourceDeps.getLocalInstrumentBySymbol(
            sourceId,
            symbol,
            sourceExists.baseTimeframe,
          );
        const instrumentId = String(instrument?.id ?? "").trim();
        if (!instrumentId) {
          return;
        }
        removableInstrumentIds.push(instrumentId);
      });

      await Promise.all(
        removableInstrumentIds.map((instrumentId) =>
          removeSymbolsFromLocalDataSourceDeps.removeMarketInstrumentData(
            instrumentId,
          ),
        ),
      );

      const deleteResult =
        removeSymbolsFromLocalDataSourceDeps.runDeleteSourceSymbolsTx(
          sourceId,
          removedSymbols,
          removableInstrumentIds,
        );

      const remainingSymbols = Array.from(
        new Set(
          removeSymbolsFromLocalDataSourceDeps
            .listImportedSymbolsBySource(sourceId)
            .map((item) => String(item.symbol ?? "").trim().toUpperCase())
            .filter((symbol) => Boolean(symbol)),
        ),
      );
      const sourceSummary =
        await removeSymbolsFromLocalDataSourceDeps.summarizeSourceBars(sourceId);
      const sourceStorageBytes =
        await removeSymbolsFromLocalDataSourceDeps.estimateSourceStorageBytesFromCurrentMarket(
          sourceSummary.barCount,
        );
      const updatedAt = nowIso();
      const summaryUpdated =
        removeSymbolsFromLocalDataSourceDeps.updateSourceSymbolMutationSummary(
          remainingSymbols.length,
          remainingSymbols.length,
          sourceSummary.symbolCount,
          sourceSummary.barCount,
          sourceStorageBytes,
          sourceSummary.startTs,
          sourceSummary.endTs,
          updatedAt,
          sourceId,
        );
      if (!summaryUpdated) {
        throw appError("LOCAL_DATA_SOURCE_MUTATION_OWNERSHIP_LOST", {
          sourceId,
        });
      }
      if (deleteResult.deletedInstruments > 0) {
        await removeSymbolsFromLocalDataSourceDeps.reclaimEmptyMarketStorage();
      }
      await removeSymbolsFromLocalDataSourceDeps.verifySourceSymbolsRemoved(
        sourceId,
        removedSymbols,
        removableInstrumentIds,
      );
      if (
        !removeSymbolsFromLocalDataSourceDeps.completeSourceSymbolMutation(
          updatedAt,
          sourceId,
        )
      ) {
        throw appError("LOCAL_DATA_SOURCE_MUTATION_OWNERSHIP_LOST", {
          sourceId,
        });
      }

      invalidateLocalDataSourcesCache();
      return {
        sourceId,
        requestedSymbols,
        removedSymbols,
        skippedSymbols,
        deletedSourceFiles: deleteResult.deletedSourceFiles,
        deletedInstruments: deleteResult.deletedInstruments,
        summary: {
          symbolCount: sourceSummary.symbolCount,
          barCount: sourceSummary.barCount,
          timeStartTs: sourceSummary.startTs,
          timeEndTs: sourceSummary.endTs,
          storageBytes: sourceStorageBytes,
          totalFiles: remainingSymbols.length,
          importedFiles: remainingSymbols.length,
          failedFiles: 0,
        },
        updatedAt,
      };
    } catch (error) {
      const cause = normalizePartialFailureCause(error);
      try {
        removeSymbolsFromLocalDataSourceDeps.markSourceSymbolMutationFailed(
          nowIso(),
          sourceId,
        );
        invalidateLocalDataSourcesCache();
      } catch {
        // Keep the original destructive-operation failure. A process restart
        // performs the same fail-safe recovery for interrupted symbol work.
      }
      if (cause === LOCAL_DATA_PARTIAL_ERROR_CODE) {
        throw error;
      }
      throw appError("LOCAL_DATA_DESTRUCTIVE_OPERATION_PARTIAL_FAILED", {
        operation: "REMOVE_LOCAL_DATA_SOURCE_SYMBOLS",
        sourceId,
        cause,
      });
    }
  };

  return {
    listLocalDataSources,
    clearLocalDataSourcesAndMarketData,
    removeLocalDataSource,
    removeSymbolsFromLocalDataSource,
  };
};
