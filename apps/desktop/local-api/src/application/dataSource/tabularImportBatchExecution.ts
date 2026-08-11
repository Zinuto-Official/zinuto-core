// SPDX-License-Identifier: GPL-3.0-only

import path from "node:path";
import {
  appendEdgeBarsForInstrumentsFromCsvFilesBatch,
  replaceMarketBarsForInstrumentsFromCsvFilesBatch,
} from "../ports/infrastructure/db/marketDatabase.js";
import { readAbortReason, throwIfOperationAborted } from "./operationAbort.js";
import { toCsvImportErrorCode } from "./tabularImportProgress.js";
import type { ResolvedBatchImportTarget } from "./tabularImport.js";

export type AppendEdgeBarsForInstrumentsBatchRunner =
  typeof appendEdgeBarsForInstrumentsFromCsvFilesBatch;

export const DEFAULT_INCREMENTAL_IMPORT_BATCH_RUNNER =
  appendEdgeBarsForInstrumentsFromCsvFilesBatch;

type FullBatchRowResult = {
  importedRows: number;
  skippedRows: number;
  invalidRequiredRowsSkipped: number;
  invalidOhlcRowsSkipped: number;
  duplicateConflictRowsSkipped: number;
  duplicateIdenticalRowsDeduped: number;
  errorMessage?: string;
};

export const importResolvedTargetsBatch = async (
  targets: ResolvedBatchImportTarget[],
  signal?: AbortSignal,
): Promise<Map<string, FullBatchRowResult>> => {
  throwIfOperationAborted(signal);
  const rowsByFileKey = new Map<string, FullBatchRowResult>();
  const toBatchInput = (target: ResolvedBatchImportTarget) => ({
    instrumentId: target.instrumentId,
    symbol: target.symbol,
    filePath: target.importCsvPath,
    inputFormat: target.inputFormat,
    mapping: target.normalizedMapping,
    timezone: target.timezone,
  });
  const putBatchItem = (item: {
    instrumentId: string;
    filePath: string;
    importedRows?: unknown;
    skippedRows?: unknown;
    invalidRequiredRowsSkipped?: unknown;
    invalidOhlcRowsSkipped?: unknown;
    duplicateConflictRowsSkipped?: unknown;
    duplicateIdenticalRowsDeduped?: unknown;
  }) => {
    rowsByFileKey.set(`${item.instrumentId}::${path.resolve(item.filePath)}`, {
      importedRows: Math.max(0, Math.floor(Number(item.importedRows ?? 0))),
      skippedRows: Math.max(0, Math.floor(Number(item.skippedRows ?? 0))),
      invalidRequiredRowsSkipped: Math.max(
        0,
        Math.floor(Number(item.invalidRequiredRowsSkipped ?? 0)),
      ),
      invalidOhlcRowsSkipped: Math.max(
        0,
        Math.floor(Number(item.invalidOhlcRowsSkipped ?? 0)),
      ),
      duplicateConflictRowsSkipped: Math.max(
        0,
        Math.floor(Number(item.duplicateConflictRowsSkipped ?? 0)),
      ),
      duplicateIdenticalRowsDeduped: Math.max(
        0,
        Math.floor(Number(item.duplicateIdenticalRowsDeduped ?? 0)),
      ),
    });
  };
  try {
    const batchResults = await replaceMarketBarsForInstrumentsFromCsvFilesBatch(
      targets.map(toBatchInput),
      { signal },
    );
    throwIfOperationAborted(signal);
    batchResults.forEach(putBatchItem);
  } catch {
    if (signal?.aborted) {
      throw readAbortReason(signal);
    }
    const isolatedResults = await Promise.all(
      targets.map(async (target) => {
        try {
          const [item] = await replaceMarketBarsForInstrumentsFromCsvFilesBatch(
            [toBatchInput(target)],
            { signal },
          );
          return { target, item, errorMessage: "" };
        } catch (error) {
          return {
            target,
            item: null,
            errorMessage: toCsvImportErrorCode(error),
          };
        }
      }),
    );
    if (signal?.aborted) {
      throw readAbortReason(signal);
    }
    isolatedResults.forEach(({ target, item, errorMessage }) => {
      if (item) {
        putBatchItem(item);
        return;
      }
      rowsByFileKey.set(
        `${target.instrumentId}::${path.resolve(target.importCsvPath)}`,
        {
          importedRows: 0,
          skippedRows: 0,
          invalidRequiredRowsSkipped: 0,
          invalidOhlcRowsSkipped: 0,
          duplicateConflictRowsSkipped: 0,
          duplicateIdenticalRowsDeduped: 0,
          errorMessage: errorMessage || "CSV_FILE_IMPORT_FAILED",
        },
      );
    });
  }
  return rowsByFileKey;
};

export const importResolvedTargetsIncrementalBatch = async (
  targets: ResolvedBatchImportTarget[],
  signal?: AbortSignal,
  appendBatch: AppendEdgeBarsForInstrumentsBatchRunner = DEFAULT_INCREMENTAL_IMPORT_BATCH_RUNNER,
): Promise<
  Map<
    string,
    {
      validRows: number;
      importedRows: number;
      prependedRows: number;
      appendedRows: number;
      overlapRowsIgnored: number;
      internalRangeRowsIgnored: number;
      conflictRowsIgnored: number;
      skippedRows: number;
      invalidRequiredRowsSkipped: number;
      invalidOhlcRowsSkipped: number;
      duplicateConflictRowsSkipped: number;
      duplicateIdenticalRowsDeduped: number;
      errorMessage?: string;
    }
  >
> => {
  throwIfOperationAborted(signal);
  const resultByFileKey = new Map<
    string,
    {
      validRows: number;
      importedRows: number;
      prependedRows: number;
      appendedRows: number;
      overlapRowsIgnored: number;
      internalRangeRowsIgnored: number;
      conflictRowsIgnored: number;
      skippedRows: number;
      invalidRequiredRowsSkipped: number;
      invalidOhlcRowsSkipped: number;
      duplicateConflictRowsSkipped: number;
      duplicateIdenticalRowsDeduped: number;
      errorMessage?: string;
    }
  >();
  const putResult = (
    target: ResolvedBatchImportTarget,
    item: {
      validRows?: unknown;
      importedRows?: unknown;
      prependedRows?: unknown;
      appendedRows?: unknown;
      overlapRowsIgnored?: unknown;
      internalRangeRowsIgnored?: unknown;
      conflictRowsIgnored?: unknown;
      skippedRows?: unknown;
      invalidRequiredRowsSkipped?: unknown;
      invalidOhlcRowsSkipped?: unknown;
      duplicateConflictRowsSkipped?: unknown;
      duplicateIdenticalRowsDeduped?: unknown;
      errorMessage?: string;
    },
  ) => {
    resultByFileKey.set(
      `${target.instrumentId}::${path.resolve(target.importCsvPath)}`,
      {
        validRows: Math.max(0, Math.floor(Number(item.validRows ?? 0))),
        importedRows: Math.max(0, Math.floor(Number(item.importedRows ?? 0))),
        prependedRows: Math.max(0, Math.floor(Number(item.prependedRows ?? 0))),
        appendedRows: Math.max(0, Math.floor(Number(item.appendedRows ?? 0))),
        overlapRowsIgnored: Math.max(
          0,
          Math.floor(Number(item.overlapRowsIgnored ?? 0)),
        ),
        internalRangeRowsIgnored: Math.max(
          0,
          Math.floor(Number(item.internalRangeRowsIgnored ?? 0)),
        ),
        conflictRowsIgnored: Math.max(
          0,
          Math.floor(Number(item.conflictRowsIgnored ?? 0)),
        ),
        skippedRows: Math.max(0, Math.floor(Number(item.skippedRows ?? 0))),
        invalidRequiredRowsSkipped: Math.max(
          0,
          Math.floor(Number(item.invalidRequiredRowsSkipped ?? 0)),
        ),
        invalidOhlcRowsSkipped: Math.max(
          0,
          Math.floor(Number(item.invalidOhlcRowsSkipped ?? 0)),
        ),
        duplicateConflictRowsSkipped: Math.max(
          0,
          Math.floor(Number(item.duplicateConflictRowsSkipped ?? 0)),
        ),
        duplicateIdenticalRowsDeduped: Math.max(
          0,
          Math.floor(Number(item.duplicateIdenticalRowsDeduped ?? 0)),
        ),
        errorMessage: item.errorMessage,
      },
    );
  };
  const toBatchInput = (target: ResolvedBatchImportTarget) => ({
    instrumentId: target.instrumentId,
    symbol: target.symbol,
    filePath: target.importCsvPath,
    inputFormat: target.inputFormat,
    mapping: target.normalizedMapping,
    timezone: target.timezone,
  });
  const targetByFileKey = new Map(
    targets.map((target) => [
      `${target.instrumentId}::${path.resolve(target.importCsvPath)}`,
      target,
    ]),
  );
  try {
    const batchResults = await appendBatch(targets.map(toBatchInput), {
      signal,
    });
    throwIfOperationAborted(signal);
    const resolvedFileKeys = new Set<string>();
    batchResults.forEach((item) => {
      const fileKey = `${item.instrumentId}::${path.resolve(item.filePath)}`;
      const target = targetByFileKey.get(fileKey);
      if (!target) {
        return;
      }
      resolvedFileKeys.add(fileKey);
      putResult(target, item);
    });
    targets.forEach((target) => {
      const fileKey = `${target.instrumentId}::${path.resolve(target.importCsvPath)}`;
      if (!resolvedFileKeys.has(fileKey)) {
        putResult(target, { errorMessage: "CSV_FILE_IMPORT_FAILED" });
      }
    });
  } catch {
    if (signal?.aborted) {
      throw readAbortReason(signal);
    }
    const isolatedResults = await Promise.all(
      targets.map(async (target) => {
        try {
          const [item] = await appendBatch([toBatchInput(target)], { signal });
          return {
            target,
            item: item ?? { errorMessage: "CSV_FILE_IMPORT_FAILED" },
          };
        } catch (error) {
          return {
            target,
            item: { errorMessage: toCsvImportErrorCode(error) },
          };
        }
      }),
    );
    if (signal?.aborted) {
      throw readAbortReason(signal);
    }
    isolatedResults.forEach(({ target, item }) => putResult(target, item));
  }
  return resultByFileKey;
};
