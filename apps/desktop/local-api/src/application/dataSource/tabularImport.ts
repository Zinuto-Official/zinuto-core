// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import type { CsvImportColumnMapping } from "../ports/infrastructure/db/marketDatabase.js";
import { createId } from "../../kernel/id.js";
import { nowIso } from "../../kernel/time.js";
import { appError, isAppError } from "../../kernel/appError.js";
import type { CsvFieldMapping } from "../../domain/dataSource/csvFieldMappingTypes.js";
import {
  materializeTabularFileToImportCsv,
  readTabularHeadersFromPath,
} from "./tabularFileUtils.js";
import { normalizeTimeZone } from "@zinuto/shared/timezone";
import { buildImportFieldMappingProfile } from "@zinuto/shared/importRules";
import { dataSourceRepository } from "../ports/infrastructure/db/dataSource/dataSourceRepository.js";
import { readAbortReason, throwIfOperationAborted } from "./operationAbort.js";
import {
  createProgressTicker,
  emitProgressEvent,
  normalizeFileProgressPercent,
  resolveMaterializeChunkSize,
  stopProgressTickerForImport,
  toCsvImportErrorCode,
  type CsvImportProgressEvent,
  type ProgressTickerStop,
} from "./tabularImportProgress.js";
import {
  importResolvedTargetsBatch,
  importResolvedTargetsIncrementalBatch,
} from "./tabularImportBatchExecution.js";
export type {
  CsvImportProgressEvent,
  ProgressTickerStop,
} from "./tabularImportProgress.js";
export {
  createProgressTicker,
  resolveMaterializeChunkSize,
  stopProgressTickerForImport,
} from "./tabularImportProgress.js";
export type {
  CsvFieldMapping,
  CsvTimestampMode,
} from "../../domain/dataSource/csvFieldMappingTypes.js";

export type { AppendEdgeBarsForInstrumentsBatchRunner } from "./tabularImportBatchExecution.js";
export {
  DEFAULT_INCREMENTAL_IMPORT_BATCH_RUNNER,
  importResolvedTargetsIncrementalBatch,
} from "./tabularImportBatchExecution.js";

export interface ImportCsvInputFile {
  originalname: string;
  path: string;
  symbol?: string;
  mapping?: CsvFieldMapping;
}

type BaseTimeframe = "1m" | "5m" | "1h" | "1d";

export type CsvBatchImportFileResult = {
  fileName: string;
  symbol: string;
  instrumentId: string;
  rows: number;
  mapping: Record<string, string>;
  invalidRequiredRowsSkipped?: number;
  invalidOhlcRowsSkipped?: number;
  duplicateConflictRowsSkipped?: number;
  duplicateIdenticalRowsDeduped?: number;
  prependedRows?: number;
  appendedRows?: number;
  overlapRowsIgnored?: number;
  internalRangeRowsIgnored?: number;
  conflictRowsIgnored?: number;
  errorMessage?: string;
};

const detectMapping = (headers: string[]): CsvFieldMapping => {
  const profile = buildImportFieldMappingProfile(headers);
  if (!profile.isImportable) {
    throw appError("CSV_FIELD_UNRECOGNIZED", {
      field: profile.conflicts[0] ?? "REQUIRED_FIELD_MISSING",
    });
  }
  return profile.mapping;
};

const getOrCreateLocalInstrument = (
  sourceId: string,
  symbol: string,
  baseTimeframe: BaseTimeframe,
  timeZone: string,
): { instrumentId: string; createdInstrument: boolean } => {
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedSourceId) {
    throw appError("INVALID_PARAMS");
  }
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const found = dataSourceRepository.getLocalInstrumentBySymbolStmt.get(
    normalizedSourceId,
    symbol,
    baseTimeframe,
  ) as { id: string; timeZone?: string | null } | undefined;
  if (found) {
    const storedTimeZone = String(found.timeZone ?? "").trim();
    if (
      !storedTimeZone ||
      normalizeTimeZone(storedTimeZone) !== normalizedTimeZone
    ) {
      dataSourceRepository.updateLocalInstrumentTimeZoneStmt.run(
        normalizedTimeZone,
        found.id,
      );
    }
    return { instrumentId: found.id, createdInstrument: false };
  }

  const id = createId();
  dataSourceRepository.insertLocalInstrumentStmt.run(
    id,
    normalizedSourceId,
    symbol,
    baseTimeframe,
    symbol,
    "LOCAL",
    normalizedTimeZone,
    nowIso(),
  );

  return { instrumentId: id, createdInstrument: true };
};

const readImportFileHeaders = async (
  filePath: string,
  signal?: AbortSignal,
): Promise<string[]> => {
  throwIfOperationAborted(signal);
  if (!fs.existsSync(filePath)) {
    throw appError("CSV_FILE_MISSING", { filePath });
  }
  const { headers } = await readTabularHeadersFromPath(
    filePath,
    appError,
    signal,
  );
  throwIfOperationAborted(signal);
  if (!headers.length) {
    throw appError("CSV_HEADER_READ_FAILED");
  }
  return headers;
};

export type ResolvedBatchImportTarget = {
  fileName: string;
  symbol: string;
  filePath: string;
  importCsvPath: string;
  inputFormat: "csv" | "json" | "parquet";
  instrumentId: string;
  createdInstrument: boolean;
  sourceId: string;
  timezone: string;
  fileProgressPercent: number;
  resolvedMapping: CsvFieldMapping;
  normalizedMapping: CsvImportColumnMapping;
  cleanup: () => Promise<void>;
};

type ImportCsvFilesBatchedOptions = {
  batchSize?: number;
  baseTimeframe?: BaseTimeframe;
  sourceId?: string;
  signal?: AbortSignal;
};

const resolveBatchImportTarget = async (
  file: ImportCsvInputFile,
  mapping?: CsvFieldMapping,
  timezone = "Asia/Shanghai",
  baseTimeframe: BaseTimeframe = "1d",
  sourceId = "",
  signal?: AbortSignal,
): Promise<ResolvedBatchImportTarget> => {
  throwIfOperationAborted(signal);
  const symbol =
    String(file.symbol || "")
      .trim()
      .toUpperCase() ||
    path
      .basename(file.originalname, path.extname(file.originalname))
      .trim()
      .toUpperCase();
  if (!symbol) {
    throw appError("CSV_FILENAME_INVALID", { fileName: file.originalname });
  }
  const resolvedMapping = mapping
    ? mapping
    : detectMapping(await readImportFileHeaders(file.path, signal));
  const materializedImportFile = await materializeTabularFileToImportCsv(
    file.path,
    file.originalname,
    resolvedMapping,
    appError,
    signal,
  );
  throwIfOperationAborted(signal);
  const { instrumentId, createdInstrument } = getOrCreateLocalInstrument(
    sourceId,
    symbol,
    baseTimeframe,
    timezone,
  );
  return {
    fileName: file.originalname,
    symbol,
    filePath: file.path,
    importCsvPath: materializedImportFile.importCsvPath,
    inputFormat: materializedImportFile.inputFormat,
    instrumentId,
    createdInstrument,
    sourceId,
    timezone,
    fileProgressPercent: 0,
    resolvedMapping,
    normalizedMapping: materializedImportFile.normalizedMapping,
    cleanup: materializedImportFile.cleanup,
  };
};

const emitBatchProgress = (
  onProgress: ((event: CsvImportProgressEvent) => void) | undefined,
  payload: CsvImportProgressEvent,
) => {
  emitProgressEvent(onProgress, payload);
};

const buildFileProgressKey = (fileName: string, symbol: string): string =>
  `${String(fileName ?? "")}::${String(symbol ?? "")
    .trim()
    .toUpperCase()}`;

const cleanupCreatedInstrumentAfterFailedImport = (
  target: ResolvedBatchImportTarget,
): void => {
  if (!target.createdInstrument || !target.instrumentId) {
    return;
  }
  dataSourceRepository.deleteInstrumentByIdStmt.run(target.instrumentId);
};

export const importCsvFilesBatchedWithProgress = async (
  files: ImportCsvInputFile[],
  mapping: CsvFieldMapping | undefined,
  timezone: string,
  onProgress: (event: CsvImportProgressEvent) => void,
  options?: ImportCsvFilesBatchedOptions,
): Promise<CsvBatchImportFileResult[]> => {
  const signal = options?.signal;
  throwIfOperationAborted(signal);
  const effectiveTimezone = normalizeTimeZone(timezone);
  const baseTimeframe = options?.baseTimeframe ?? "1d";
  const sourceId = String(options?.sourceId || "").trim();
  const results: CsvBatchImportFileResult[] = [];
  for (let offset = 0; offset < files.length;) {
    throwIfOperationAborted(signal);
    const materializeChunkSize = resolveMaterializeChunkSize(
      files,
      offset,
      options?.batchSize ?? files.length,
    );
    const fileChunk = files.slice(offset, offset + materializeChunkSize);
    offset += materializeChunkSize;
    if (!fileChunk.length) {
      continue;
    }

    const resolvedTargets: ResolvedBatchImportTarget[] = [];
    const resolvedChunkSettlements = await Promise.allSettled(
      fileChunk.map(async (file) => {
        const symbol =
          String(file.symbol || "")
            .trim()
            .toUpperCase() ||
          path
            .basename(file.originalname, path.extname(file.originalname))
            .trim()
            .toUpperCase();
        const resolvedSymbol =
          symbol ||
          path
            .basename(file.originalname, path.extname(file.originalname))
            .trim()
            .toUpperCase();
        let fileProgressPercent = 1;
        const emitFileProgress = (
          nextFileProgressPercent: number,
          isCompleted: boolean,
          rowsTotal = 0,
          rowsImported = 0,
          rowsSkipped = 0,
        ) => {
          throwIfOperationAborted(signal);
          const normalizedFileProgressPercent = normalizeFileProgressPercent(
            nextFileProgressPercent,
          );
          fileProgressPercent = isCompleted
            ? 100
            : Math.max(fileProgressPercent, normalizedFileProgressPercent);
          emitBatchProgress(onProgress, {
            fileName: file.originalname,
            symbol: resolvedSymbol,
            rowsTotal: Math.max(0, Math.floor(Number(rowsTotal) || 0)),
            rowsImported: Math.max(0, Math.floor(Number(rowsImported) || 0)),
            rowsSkipped: Math.max(0, Math.floor(Number(rowsSkipped) || 0)),
            isCompleted,
            fileProgressPercent: isCompleted ? 100 : fileProgressPercent,
          });
        };
        emitFileProgress(1, false);
        const stopResolveTicker = createProgressTicker(
          (nextPercent) => emitFileProgress(nextPercent, false),
          fileProgressPercent,
          56,
          2,
          80,
        );
        try {
          const target = await resolveBatchImportTarget(
            file,
            file.mapping ?? mapping,
            effectiveTimezone,
            baseTimeframe,
            sourceId,
            signal,
          );
          stopProgressTickerForImport(stopResolveTicker, 60);
          target.fileProgressPercent = fileProgressPercent;
          return {
            target,
            resolutionErrorResult: null as CsvBatchImportFileResult | null,
          };
        } catch (error) {
          stopProgressTickerForImport(stopResolveTicker);
          emitFileProgress(100, true);
          return {
            target: null as ResolvedBatchImportTarget | null,
            resolutionErrorResult: {
              fileName: file.originalname,
              symbol: resolvedSymbol,
              instrumentId: "",
              rows: 0,
              mapping: file.mapping
                ? { ...file.mapping }
                : mapping
                  ? { ...mapping }
                  : {},
              errorMessage: toCsvImportErrorCode(error),
            } satisfies CsvBatchImportFileResult,
          };
        }
      }),
    );
    const resolutionFailure = resolvedChunkSettlements.find(
      (settlement): settlement is PromiseRejectedResult =>
        settlement.status === "rejected",
    );
    if (resolutionFailure || signal?.aborted) {
      const fulfilledTargets = resolvedChunkSettlements.flatMap((settlement) =>
        settlement.status === "fulfilled" && settlement.value.target
          ? [settlement.value.target]
          : [],
      );
      fulfilledTargets.forEach(cleanupCreatedInstrumentAfterFailedImport);
      await Promise.all(
        fulfilledTargets.map((target) =>
          target.cleanup().catch(() => undefined),
        ),
      );
      if (signal?.aborted) {
        throw readAbortReason(signal);
      }
      throw resolutionFailure?.reason;
    }
    const resolvedChunkOutcomes = resolvedChunkSettlements.map(
      (settlement) =>
        (
          settlement as PromiseFulfilledResult<{
            target: ResolvedBatchImportTarget | null;
            resolutionErrorResult: CsvBatchImportFileResult | null;
          }>
        ).value,
    );
    throwIfOperationAborted(signal);
    resolvedChunkOutcomes.forEach((outcome) => {
      if (outcome.target) {
        resolvedTargets.push(outcome.target);
      }
      if (outcome.resolutionErrorResult) {
        results.push(outcome.resolutionErrorResult);
      }
    });

    if (!resolvedTargets.length) {
      continue;
    }

    const importTickerStopByKey = new Map<string, ProgressTickerStop>();
    try {
      resolvedTargets.forEach((target) => {
        target.fileProgressPercent = Math.max(
          62,
          normalizeFileProgressPercent(target.fileProgressPercent),
        );
        emitBatchProgress(onProgress, {
          fileName: target.fileName,
          symbol: target.symbol,
          rowsTotal: 0,
          rowsImported: 0,
          rowsSkipped: 0,
          isCompleted: false,
          fileProgressPercent: target.fileProgressPercent,
        });
        const tickerStop = createProgressTicker(
          (nextPercent) => {
            target.fileProgressPercent = Math.max(
              target.fileProgressPercent,
              normalizeFileProgressPercent(nextPercent),
            );
            emitBatchProgress(onProgress, {
              fileName: target.fileName,
              symbol: target.symbol,
              rowsTotal: 0,
              rowsImported: 0,
              rowsSkipped: 0,
              isCompleted: false,
              fileProgressPercent: target.fileProgressPercent,
            });
          },
          target.fileProgressPercent,
          92,
          2,
          120,
        );
        importTickerStopByKey.set(
          buildFileProgressKey(target.fileName, target.symbol),
          tickerStop,
        );
      });

      try {
        const rowsByFileKey = await importResolvedTargetsBatch(
          resolvedTargets,
          signal,
        );
        throwIfOperationAborted(signal);
        resolvedTargets.forEach((target) => {
          const progressKey = buildFileProgressKey(
            target.fileName,
            target.symbol,
          );
          const stopTicker = importTickerStopByKey.get(progressKey);
          if (stopTicker) {
            stopProgressTickerForImport(stopTicker, 98);
          }
          importTickerStopByKey.delete(progressKey);
          const fileKey = `${target.instrumentId}::${path.resolve(target.importCsvPath)}`;
          const batchResult = rowsByFileKey.get(fileKey);
          const errorMessage = batchResult?.errorMessage;
          const rowsImported = Math.max(0, batchResult?.importedRows ?? 0);
          const rowsSkipped = Math.max(0, batchResult?.skippedRows ?? 0);
          const rowsTotal = rowsImported + rowsSkipped;
          emitBatchProgress(onProgress, {
            fileName: target.fileName,
            symbol: target.symbol,
            rowsTotal,
            rowsImported,
            rowsSkipped,
            isCompleted: true,
            fileProgressPercent: 100,
          });
          if (rowsImported <= 0) {
            cleanupCreatedInstrumentAfterFailedImport(target);
            results.push({
              fileName: target.fileName,
              symbol: target.symbol,
              instrumentId: target.instrumentId,
              rows: 0,
              mapping: target.resolvedMapping,
              invalidRequiredRowsSkipped: Math.max(
                0,
                batchResult?.invalidRequiredRowsSkipped ?? 0,
              ),
              invalidOhlcRowsSkipped: Math.max(
                0,
                batchResult?.invalidOhlcRowsSkipped ?? 0,
              ),
              duplicateConflictRowsSkipped: Math.max(
                0,
                batchResult?.duplicateConflictRowsSkipped ?? 0,
              ),
              duplicateIdenticalRowsDeduped: Math.max(
                0,
                batchResult?.duplicateIdenticalRowsDeduped ?? 0,
              ),
              errorMessage: errorMessage ?? "CSV_NO_VALID_BARS",
            });
            return;
          }
          results.push({
            fileName: target.fileName,
            symbol: target.symbol,
            instrumentId: target.instrumentId,
            rows: rowsImported,
            mapping: target.resolvedMapping,
            invalidRequiredRowsSkipped: Math.max(
              0,
              batchResult?.invalidRequiredRowsSkipped ?? 0,
            ),
            invalidOhlcRowsSkipped: Math.max(
              0,
              batchResult?.invalidOhlcRowsSkipped ?? 0,
            ),
            duplicateConflictRowsSkipped: Math.max(
              0,
              batchResult?.duplicateConflictRowsSkipped ?? 0,
            ),
            duplicateIdenticalRowsDeduped: Math.max(
              0,
              batchResult?.duplicateIdenticalRowsDeduped ?? 0,
            ),
            errorMessage,
          });
        });
        continue;
      } catch (error) {
        if (signal?.aborted) {
          throw readAbortReason(signal);
        }
        if (
          isAppError(error) &&
          error.code === "LOCAL_DATA_IMPORT_JOB_CANCELED"
        ) {
          throw error;
        }
        resolvedTargets.forEach((target) => {
          const progressKey = buildFileProgressKey(
            target.fileName,
            target.symbol,
          );
          const stopTicker = importTickerStopByKey.get(progressKey);
          if (stopTicker) {
            stopProgressTickerForImport(stopTicker, 100);
          }
          importTickerStopByKey.delete(progressKey);
          emitBatchProgress(onProgress, {
            fileName: target.fileName,
            symbol: target.symbol,
            rowsTotal: 0,
            rowsImported: 0,
            rowsSkipped: 0,
            isCompleted: true,
            fileProgressPercent: 100,
          });
          cleanupCreatedInstrumentAfterFailedImport(target);
          results.push({
            fileName: target.fileName,
            symbol: target.symbol,
            instrumentId: target.instrumentId,
            rows: 0,
            mapping: target.resolvedMapping,
            errorMessage: toCsvImportErrorCode(error),
          });
        });
        continue;
      }
    } finally {
      importTickerStopByKey.forEach((stopTicker) => {
        stopTicker();
      });
      importTickerStopByKey.clear();
      await Promise.all(
        resolvedTargets.map(async (target) =>
          target.cleanup().catch(() => undefined),
        ),
      );
    }
  }

  throwIfOperationAborted(signal);
  return results;
};

export const importCsvFilesIncrementalWithProgress = async (
  files: ImportCsvInputFile[],
  mapping: CsvFieldMapping | undefined,
  timezone: string,
  onProgress: (event: CsvImportProgressEvent) => void,
  options?: ImportCsvFilesBatchedOptions,
): Promise<CsvBatchImportFileResult[]> => {
  const signal = options?.signal;
  throwIfOperationAborted(signal);
  const effectiveTimezone = normalizeTimeZone(timezone);
  const baseTimeframe = options?.baseTimeframe ?? "1d";
  const sourceId = String(options?.sourceId || "").trim();
  const results: CsvBatchImportFileResult[] = [];
  for (let offset = 0; offset < files.length;) {
    throwIfOperationAborted(signal);
    const materializeChunkSize = resolveMaterializeChunkSize(
      files,
      offset,
      options?.batchSize ?? files.length,
    );
    const fileChunk = files.slice(offset, offset + materializeChunkSize);
    offset += materializeChunkSize;
    if (!fileChunk.length) {
      continue;
    }

    const resolvedTargets: ResolvedBatchImportTarget[] = [];
    const resolvedChunkSettlements = await Promise.allSettled(
      fileChunk.map(async (file) => {
        const symbol =
          String(file.symbol || "")
            .trim()
            .toUpperCase() ||
          path
            .basename(file.originalname, path.extname(file.originalname))
            .trim()
            .toUpperCase();
        const resolvedSymbol =
          symbol ||
          path
            .basename(file.originalname, path.extname(file.originalname))
            .trim()
            .toUpperCase();
        let fileProgressPercent = 1;
        const emitFileProgress = (
          nextFileProgressPercent: number,
          isCompleted: boolean,
          rowsTotal = 0,
          rowsImported = 0,
          rowsSkipped = 0,
        ) => {
          throwIfOperationAborted(signal);
          const normalizedFileProgressPercent = normalizeFileProgressPercent(
            nextFileProgressPercent,
          );
          fileProgressPercent = isCompleted
            ? 100
            : Math.max(fileProgressPercent, normalizedFileProgressPercent);
          emitBatchProgress(onProgress, {
            fileName: file.originalname,
            symbol: resolvedSymbol,
            rowsTotal: Math.max(0, Math.floor(Number(rowsTotal) || 0)),
            rowsImported: Math.max(0, Math.floor(Number(rowsImported) || 0)),
            rowsSkipped: Math.max(0, Math.floor(Number(rowsSkipped) || 0)),
            isCompleted,
            fileProgressPercent: isCompleted ? 100 : fileProgressPercent,
          });
        };
        emitFileProgress(1, false);
        const stopResolveTicker = createProgressTicker(
          (nextPercent) => emitFileProgress(nextPercent, false),
          fileProgressPercent,
          56,
          2,
          80,
        );
        try {
          const target = await resolveBatchImportTarget(
            file,
            file.mapping ?? mapping,
            effectiveTimezone,
            baseTimeframe,
            sourceId,
            signal,
          );
          stopProgressTickerForImport(stopResolveTicker, 60);
          target.fileProgressPercent = fileProgressPercent;
          return {
            target,
            resolutionErrorResult: null as CsvBatchImportFileResult | null,
          };
        } catch (error) {
          stopProgressTickerForImport(stopResolveTicker);
          emitFileProgress(100, true);
          return {
            target: null as ResolvedBatchImportTarget | null,
            resolutionErrorResult: {
              fileName: file.originalname,
              symbol: resolvedSymbol,
              instrumentId: "",
              rows: 0,
              mapping: file.mapping
                ? { ...file.mapping }
                : mapping
                  ? { ...mapping }
                  : {},
              errorMessage: toCsvImportErrorCode(error),
            } satisfies CsvBatchImportFileResult,
          };
        }
      }),
    );
    const resolutionFailure = resolvedChunkSettlements.find(
      (settlement): settlement is PromiseRejectedResult =>
        settlement.status === "rejected",
    );
    if (resolutionFailure || signal?.aborted) {
      const fulfilledTargets = resolvedChunkSettlements.flatMap((settlement) =>
        settlement.status === "fulfilled" && settlement.value.target
          ? [settlement.value.target]
          : [],
      );
      fulfilledTargets.forEach(cleanupCreatedInstrumentAfterFailedImport);
      await Promise.all(
        fulfilledTargets.map((target) =>
          target.cleanup().catch(() => undefined),
        ),
      );
      if (signal?.aborted) {
        throw readAbortReason(signal);
      }
      throw resolutionFailure?.reason;
    }
    const resolvedChunkOutcomes = resolvedChunkSettlements.map(
      (settlement) =>
        (
          settlement as PromiseFulfilledResult<{
            target: ResolvedBatchImportTarget | null;
            resolutionErrorResult: CsvBatchImportFileResult | null;
          }>
        ).value,
    );
    throwIfOperationAborted(signal);
    resolvedChunkOutcomes.forEach((outcome) => {
      if (outcome.target) {
        resolvedTargets.push(outcome.target);
      }
      if (outcome.resolutionErrorResult) {
        results.push(outcome.resolutionErrorResult);
      }
    });

    if (!resolvedTargets.length) {
      continue;
    }

    const importTickerStopByKey = new Map<string, ProgressTickerStop>();
    try {
      resolvedTargets.forEach((target) => {
        target.fileProgressPercent = Math.max(
          62,
          normalizeFileProgressPercent(target.fileProgressPercent),
        );
        emitBatchProgress(onProgress, {
          fileName: target.fileName,
          symbol: target.symbol,
          rowsTotal: 0,
          rowsImported: 0,
          rowsSkipped: 0,
          isCompleted: false,
          fileProgressPercent: target.fileProgressPercent,
        });
        const tickerStop = createProgressTicker(
          (nextPercent) => {
            target.fileProgressPercent = Math.max(
              target.fileProgressPercent,
              normalizeFileProgressPercent(nextPercent),
            );
            emitBatchProgress(onProgress, {
              fileName: target.fileName,
              symbol: target.symbol,
              rowsTotal: 0,
              rowsImported: 0,
              rowsSkipped: 0,
              isCompleted: false,
              fileProgressPercent: target.fileProgressPercent,
            });
          },
          target.fileProgressPercent,
          92,
          2,
          120,
        );
        importTickerStopByKey.set(
          buildFileProgressKey(target.fileName, target.symbol),
          tickerStop,
        );
      });

      try {
        const resultByFileKey = await importResolvedTargetsIncrementalBatch(
          resolvedTargets,
          signal,
        );
        throwIfOperationAborted(signal);
        resolvedTargets.forEach((target) => {
          const progressKey = buildFileProgressKey(
            target.fileName,
            target.symbol,
          );
          const stopTicker = importTickerStopByKey.get(progressKey);
          if (stopTicker) {
            stopProgressTickerForImport(stopTicker, 98);
          }
          importTickerStopByKey.delete(progressKey);
          const fileKey = `${target.instrumentId}::${path.resolve(target.importCsvPath)}`;
          const batchResult = resultByFileKey.get(fileKey);
          const validRows = Math.max(0, batchResult?.validRows ?? 0);
          const rowsImported = Math.max(0, batchResult?.importedRows ?? 0);
          const overlapRowsIgnored = Math.max(
            0,
            batchResult?.overlapRowsIgnored ?? 0,
          );
          const internalRangeRowsIgnored = Math.max(
            0,
            batchResult?.internalRangeRowsIgnored ?? 0,
          );
          const conflictRowsIgnored = Math.max(
            0,
            batchResult?.conflictRowsIgnored ?? 0,
          );
          const prependedRows = Math.max(0, batchResult?.prependedRows ?? 0);
          const appendedRows = Math.max(0, batchResult?.appendedRows ?? 0);
          const qualityRowsSkipped = Math.max(0, batchResult?.skippedRows ?? 0);
          const errorMessage = batchResult?.errorMessage;
          const rowsSkipped = Math.max(
            0,
            qualityRowsSkipped +
              overlapRowsIgnored +
              internalRangeRowsIgnored +
              conflictRowsIgnored,
          );
          emitBatchProgress(onProgress, {
            fileName: target.fileName,
            symbol: target.symbol,
            rowsTotal: validRows + qualityRowsSkipped,
            rowsImported,
            rowsSkipped,
            isCompleted: true,
            fileProgressPercent: 100,
          });
          if (validRows <= 0) {
            cleanupCreatedInstrumentAfterFailedImport(target);
            results.push({
              fileName: target.fileName,
              symbol: target.symbol,
              instrumentId: target.instrumentId,
              rows: 0,
              mapping: target.resolvedMapping,
              invalidRequiredRowsSkipped: Math.max(
                0,
                batchResult?.invalidRequiredRowsSkipped ?? 0,
              ),
              invalidOhlcRowsSkipped: Math.max(
                0,
                batchResult?.invalidOhlcRowsSkipped ?? 0,
              ),
              duplicateConflictRowsSkipped: Math.max(
                0,
                batchResult?.duplicateConflictRowsSkipped ?? 0,
              ),
              duplicateIdenticalRowsDeduped: Math.max(
                0,
                batchResult?.duplicateIdenticalRowsDeduped ?? 0,
              ),
              errorMessage: errorMessage ?? "CSV_NO_VALID_BARS",
            });
            return;
          }
          results.push({
            fileName: target.fileName,
            symbol: target.symbol,
            instrumentId: target.instrumentId,
            rows: rowsImported,
            mapping: target.resolvedMapping,
            invalidRequiredRowsSkipped: Math.max(
              0,
              batchResult?.invalidRequiredRowsSkipped ?? 0,
            ),
            invalidOhlcRowsSkipped: Math.max(
              0,
              batchResult?.invalidOhlcRowsSkipped ?? 0,
            ),
            duplicateConflictRowsSkipped: Math.max(
              0,
              batchResult?.duplicateConflictRowsSkipped ?? 0,
            ),
            duplicateIdenticalRowsDeduped: Math.max(
              0,
              batchResult?.duplicateIdenticalRowsDeduped ?? 0,
            ),
            prependedRows,
            appendedRows,
            overlapRowsIgnored,
            internalRangeRowsIgnored,
            conflictRowsIgnored,
            errorMessage,
          });
        });
        continue;
      } catch (error) {
        if (signal?.aborted) {
          throw readAbortReason(signal);
        }
        if (
          isAppError(error) &&
          error.code === "LOCAL_DATA_IMPORT_JOB_CANCELED"
        ) {
          throw error;
        }
        resolvedTargets.forEach((target) => {
          const progressKey = buildFileProgressKey(
            target.fileName,
            target.symbol,
          );
          const stopTicker = importTickerStopByKey.get(progressKey);
          if (stopTicker) {
            stopProgressTickerForImport(stopTicker, 100);
          }
          importTickerStopByKey.delete(progressKey);
          emitBatchProgress(onProgress, {
            fileName: target.fileName,
            symbol: target.symbol,
            rowsTotal: 0,
            rowsImported: 0,
            rowsSkipped: 0,
            isCompleted: true,
            fileProgressPercent: 100,
          });
          cleanupCreatedInstrumentAfterFailedImport(target);
          results.push({
            fileName: target.fileName,
            symbol: target.symbol,
            instrumentId: target.instrumentId,
            rows: 0,
            mapping: target.resolvedMapping,
            errorMessage: toCsvImportErrorCode(error),
          });
        });
        continue;
      }
    } finally {
      importTickerStopByKey.forEach((stopTicker) => {
        stopTicker();
      });
      importTickerStopByKey.clear();
      await Promise.all(
        resolvedTargets.map(async (target) =>
          target.cleanup().catch(() => undefined),
        ),
      );
    }
  }

  throwIfOperationAborted(signal);
  return results;
};
