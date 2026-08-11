// SPDX-License-Identifier: GPL-3.0-only

import type {
  CsvBatchImportFileResult,
  CsvImportProgressEvent,
} from "./tabularImport.js";
import {
  buildImportDiagnosticsForFileFailure,
  buildImportFailureCause,
  buildImportFailureDetails,
  buildImportFailureSummary,
  stringifyImportFailurePayload,
} from "./importFailureDiagnostics.js";
import {
  createOperationDeadline,
  readAbortReason,
  throwIfOperationAborted,
} from "./operationAbort.js";

import type {
  ProcessImportJobDeps,
  QueuedImportFile,
  QueuedImportJob,
} from "./importJobTypes.js";
import { finalizeQueuedImportJob } from "./finalizeQueuedImportJob.js";
import {
  createEmptyOutcomeSummary,
  normalizeImportErrorCode,
  readImportErrorCode,
} from "./importJobOutcomeHelpers.js";

export type { QueuedImportFile, QueuedImportJob } from "./importJobTypes.js";

export const processQueuedImportJob = async (
  queuedJob: QueuedImportJob,
  deps: ProcessImportJobDeps,
): Promise<void> => {
  deps.ensureImportJobControlState(queuedJob.jobId);
  const deadline = createOperationDeadline({
    timeoutMs: deps.importJobExecutionDeadlineMs,
    createTimeoutError: () => {
      const error = new Error("LOCAL_DATA_IMPORT_JOB_TIMEOUT");
      Object.assign(error, {
        code: "LOCAL_DATA_IMPORT_JOB_TIMEOUT",
        args: { timeoutMs: deps.importJobExecutionDeadlineMs },
      });
      return error;
    },
  });
  deadline.signal.addEventListener(
    "abort",
    () => {
      deps.abortImportJob(queuedJob.jobId, readAbortReason(deadline.signal));
    },
    { once: true },
  );
  const signal = AbortSignal.any([
    deps.getImportJobAbortSignal(queuedJob.jobId),
    deadline.signal,
  ]);
  try {
    throwIfOperationAborted(signal);
    const sourceTotalFiles = Math.max(
      0,
      Math.floor(
        Number(queuedJob.sourceTotalFiles ?? queuedJob.files.length) || 0,
      ),
      queuedJob.files.length,
    );
    const jobStartedAtMs = Date.now();
    const startTime = deps.nowIso();
    let doneFiles = 0;
    let successfulFiles = 0;
    let totalRows = 0;
    let importedRows = 0;
    let skippedRows = 0;
    let errorFiles = 0;
    const failedImportErrorCodes: string[] = [];
    const failedImportRecords: Array<{ code: string; fileName: string }> = [];
    let canceled = false;
    let importingStartedAtMs = 0;
    let finalizingStartedAtMs = 0;
    let importBatchCount = 0;
    let importBatchSizeTotal = 0;
    let importBatchSizeMin = Number.POSITIVE_INFINITY;
    let importBatchSizeMax = 0;
    let runtimeParallelTotal = 0;
    let runtimeParallelMin = Number.POSITIVE_INFINITY;
    let runtimeParallelMax = 0;
    const outcomeSummary = createEmptyOutcomeSummary();
    const existingImportedSymbolSet = new Set(
      (Array.isArray(queuedJob.existingImportedSymbols)
        ? queuedJob.existingImportedSymbols
        : []
      )
        .map((symbol) =>
          String(symbol ?? "")
            .trim()
            .toUpperCase(),
        )
        .filter((symbol) => Boolean(symbol)),
    );
    const pendingTempFilePaths = new Set<string>(
      queuedJob.files
        .map((file) => deps.normalizeImportFilePath(file.filePath))
        .filter((item): item is string => Boolean(item)),
    );
    const importedInstrumentIdsForDerivedData = new Set<string>();
    const cleanupPendingTempFiles = async () => {
      await deps.removeImportTempFilesByPath(Array.from(pendingTempFilePaths));
      await deps.removeImportTempDirsByPath(
        Array.isArray(queuedJob.tempDirPaths) ? queuedJob.tempDirPaths : [],
      );
      pendingTempFilePaths.clear();
    };
    const listImportedInstrumentIdsForDerivedData = (): string[] =>
      Array.from(importedInstrumentIdsForDerivedData)
        .map((instrumentId) => String(instrumentId ?? "").trim())
        .filter((instrumentId) => Boolean(instrumentId));
    const refreshImportedInstrumentDerivedData = async (): Promise<void> => {
      const instrumentIds = listImportedInstrumentIdsForDerivedData();
      if (!instrumentIds.length || !deps.refreshImportedInstrumentDerivedData) {
        return;
      }
      await deps.refreshImportedInstrumentDerivedData(instrumentIds);
    };
    const enqueueImportedInstrumentTimelinePrewarm = (): void => {
      const instrumentIds = listImportedInstrumentIdsForDerivedData();
      if (
        !instrumentIds.length ||
        !deps.enqueueImportedInstrumentTimelinePrewarm
      ) {
        return;
      }
      deps.enqueueImportedInstrumentTimelinePrewarm(instrumentIds);
    };
    const emitImportPerformance = (
      outcome: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "CANCELED",
    ): void => {
      if (!deps.logImportPerformance) {
        return;
      }
      const finishedAtMs = Date.now();
      const hasImportingStarted = importingStartedAtMs > 0;
      const hasFinalizingStarted = finalizingStartedAtMs > 0;
      const scanningEndMs = hasImportingStarted
        ? importingStartedAtMs
        : hasFinalizingStarted
          ? finalizingStartedAtMs
          : finishedAtMs;
      const importingEndMs = hasFinalizingStarted
        ? finalizingStartedAtMs
        : finishedAtMs;
      const scanningMs = Math.max(0, scanningEndMs - jobStartedAtMs);
      const importingMs = hasImportingStarted
        ? Math.max(0, importingEndMs - importingStartedAtMs)
        : 0;
      const finalizingMs = hasFinalizingStarted
        ? Math.max(0, finishedAtMs - finalizingStartedAtMs)
        : 0;
      const averageBatchSize =
        importBatchCount > 0 ? importBatchSizeTotal / importBatchCount : 0;
      const averageRuntimeParallel =
        importBatchCount > 0 ? runtimeParallelTotal / importBatchCount : 0;
      deps.logImportPerformance({
        jobId: queuedJob.jobId,
        sourceId: queuedJob.sourceId,
        sourceName: queuedJob.sourceName,
        baseTimeframe: queuedJob.baseTimeframe,
        outcome,
        durationMs: Math.max(0, finishedAtMs - jobStartedAtMs),
        scanningMs,
        importingMs,
        finalizingMs,
        doneFiles,
        totalFiles: queuedJob.files.length,
        successfulFiles,
        errorFiles,
        totalRows,
        importedRows,
        skippedRows,
        importBatchCount,
        avgBatchSize: Number(averageBatchSize.toFixed(2)),
        minBatchSize: Number.isFinite(importBatchSizeMin)
          ? importBatchSizeMin
          : 0,
        maxBatchSize: importBatchSizeMax,
        avgRuntimeParallelFiles: Number(averageRuntimeParallel.toFixed(2)),
        minRuntimeParallelFiles: Number.isFinite(runtimeParallelMin)
          ? runtimeParallelMin
          : 0,
        maxRuntimeParallelFiles: runtimeParallelMax,
      });
    };

    deps.updateSourceStatusStmt.run(
      "IMPORTING",
      deps.nowIso(),
      queuedJob.sourceId,
    );
    deps.updateJobRunningStmt.run(
      "RUNNING",
      "SCANNING",
      1,
      null,
      startTime,
      deps.nowIso(),
      queuedJob.jobId,
    );

    const importedSymbols = new Set<string>();
    const activeFileProgress = new Map<
      string,
      {
        fileName: string;
        rowsTotal: number;
        rowsImported: number;
        rowsSkipped: number;
        fileProgressPercent: number;
        isCompleted: boolean;
        lastPersistAt: number;
      }
    >();
    const pendingFiles = [...queuedJob.files];
    let firstBatchImported = false;

    const summarizeActiveRows = (): {
      totalRows: number;
      importedRows: number;
      skippedRows: number;
      completedFiles: number;
      partialProgressPercent: number;
    } => {
      let pendingTotalRows = 0;
      let pendingImportedRows = 0;
      let pendingSkippedRows = 0;
      let completedFiles = 0;
      let partialProgressPercent = 0;
      activeFileProgress.forEach((state) => {
        pendingTotalRows += state.rowsTotal;
        pendingImportedRows += state.rowsImported;
        pendingSkippedRows += state.rowsSkipped;
        if (state.isCompleted) {
          completedFiles += 1;
        } else {
          partialProgressPercent += Math.max(
            0,
            Math.min(100, Number(state.fileProgressPercent) || 0),
          );
        }
      });
      return {
        totalRows: pendingTotalRows,
        importedRows: pendingImportedRows,
        skippedRows: pendingSkippedRows,
        completedFiles,
        partialProgressPercent,
      };
    };

    const persistJobProgress = (currentFileName: string | null): void => {
      const pendingRows = summarizeActiveRows();
      const hasPendingFiles = pendingFiles.length > 0;
      // Only reserve file units for files not yet submitted to a batch. The
      // final batch must be able to report 100% while its active files are
      // completing instead of being capped at 99 forever.
      const maxProvisionalDoneFiles = Math.max(
        0,
        queuedJob.files.length - (hasPendingFiles ? 1 : 0),
      );
      const provisionalDoneFiles = Math.min(
        maxProvisionalDoneFiles,
        Math.max(doneFiles, doneFiles + pendingRows.completedFiles),
      );
      const provisionalDoneFileUnits = Math.min(
        Math.max(0, queuedJob.files.length - (hasPendingFiles ? 0.01 : 0)),
        Math.max(
          doneFiles,
          doneFiles +
            pendingRows.completedFiles +
            pendingRows.partialProgressPercent / 100,
        ),
      );
      const hasStartedImporting =
        provisionalDoneFileUnits > 0 ||
        activeFileProgress.size > 0 ||
        pendingFiles.length < queuedJob.files.length;
      const progressPercent = deps.calculateRunningImportProgressPercent(
        provisionalDoneFileUnits,
        queuedJob.files.length,
        hasStartedImporting,
      );
      deps.updateJobProgressStmt.run(
        "IMPORTING",
        progressPercent,
        provisionalDoneFiles,
        totalRows + pendingRows.totalRows,
        importedRows + pendingRows.importedRows,
        skippedRows + pendingRows.skippedRows,
        errorFiles,
        currentFileName,
        deps.nowIso(),
        queuedJob.jobId,
      );
    };

    const buildBatchResultKey = (fileName: string, symbol: string): string =>
      `${String(fileName ?? "")}::${String(symbol ?? "")
        .trim()
        .toUpperCase()}`;

    const resolveFileRows = (
      file: QueuedImportFile,
      result: CsvBatchImportFileResult | null,
    ): { rowsTotal: number; rowsImported: number; rowsSkipped: number } => {
      const active = activeFileProgress.get(file.fileRowId);
      const fallbackTotal = Math.max(
        0,
        Math.floor(Number(active?.rowsTotal ?? 0)),
      );
      const fallbackImported = Math.max(
        0,
        Math.floor(Number(active?.rowsImported ?? 0)),
      );
      const fallbackSkipped = Math.max(
        0,
        Math.floor(Number(active?.rowsSkipped ?? 0)),
      );
      const rowsImported = result
        ? Math.max(0, Math.floor(Number(result.rows ?? 0)))
        : fallbackImported;
      const resultSkipped = result
        ? Math.max(
            0,
            Math.floor(Number(result.invalidRequiredRowsSkipped ?? 0)) +
              Math.floor(Number(result.invalidOhlcRowsSkipped ?? 0)) +
              Math.floor(Number(result.duplicateConflictRowsSkipped ?? 0)) +
              Math.floor(Number(result.duplicateIdenticalRowsDeduped ?? 0)) +
              Math.floor(Number(result.overlapRowsIgnored ?? 0)) +
              Math.floor(Number(result.internalRangeRowsIgnored ?? 0)) +
              Math.floor(Number(result.conflictRowsIgnored ?? 0)),
          )
        : fallbackSkipped;
      const rowsTotal = result
        ? Math.max(rowsImported + resultSkipped, fallbackTotal)
        : fallbackTotal;
      const rowsSkipped = Math.max(
        0,
        result
          ? Math.max(resultSkipped, rowsTotal - rowsImported)
          : fallbackSkipped,
      );
      return { rowsTotal, rowsImported, rowsSkipped };
    };

    const importFileBatch = async (
      batchFiles: QueuedImportFile[],
    ): Promise<void> => {
      if (!batchFiles.length || canceled) {
        return;
      }
      throwIfOperationAborted(signal);

      const fileByBatchKey = new Map<string, QueuedImportFile>();
      batchFiles.forEach((file) => {
        fileByBatchKey.set(
          buildBatchResultKey(file.fileName, file.symbol),
          file,
        );
        activeFileProgress.set(file.fileRowId, {
          fileName: file.fileName,
          rowsTotal: 0,
          rowsImported: 0,
          rowsSkipped: 0,
          fileProgressPercent: 0,
          isCompleted: false,
          lastPersistAt: 0,
        });
        deps.updateFileImportingStmt.run(
          deps.fileStatusImporting,
          0,
          0,
          0,
          deps.nowIso(),
          file.fileRowId,
        );
      });
      persistJobProgress(batchFiles[0]?.fileName ?? null);

      const persistFileProgressByEvent = (
        event: CsvImportProgressEvent,
      ): void => {
        throwIfOperationAborted(signal);
        const batchKey = buildBatchResultKey(event.fileName, event.symbol);
        const file = fileByBatchKey.get(batchKey);
        if (!file) {
          return;
        }
        const state = activeFileProgress.get(file.fileRowId);
        if (!state) {
          return;
        }
        state.rowsTotal = Math.max(0, Math.floor(Number(event.rowsTotal ?? 0)));
        state.rowsImported = Math.max(
          0,
          Math.floor(Number(event.rowsImported ?? 0)),
        );
        state.rowsSkipped = Math.max(
          0,
          Math.floor(Number(event.rowsSkipped ?? 0)),
        );
        state.fileProgressPercent = Math.max(
          0,
          Math.min(
            100,
            Math.max(
              Number(state.fileProgressPercent) || 0,
              Number(
                event.fileProgressPercent ?? (event.isCompleted ? 100 : 0),
              ) || 0,
            ),
          ),
        );
        state.isCompleted = state.isCompleted || Boolean(event.isCompleted);
        const nowMs = Date.now();
        if (!event.isCompleted && nowMs - state.lastPersistAt < 350) {
          return;
        }
        state.lastPersistAt = nowMs;
        deps.updateFileProgressStmt.run(
          state.rowsTotal,
          state.rowsImported,
          state.rowsSkipped,
          deps.nowIso(),
          file.fileRowId,
        );
        persistJobProgress(file.fileName);
      };

      try {
        const batchSize = Math.max(1, batchFiles.length);
        const batchResults = await (queuedJob.jobMode === "INCREMENTAL_UPDATE"
          ? deps.importCsvFilesIncrementalWithProgress(
              batchFiles.map((file) => ({
                originalname: file.fileName,
                path: file.filePath,
                symbol: file.symbol,
                mapping: file.mapping,
              })),
              queuedJob.mapping,
              queuedJob.timezone,
              (event: CsvImportProgressEvent) => {
                const control = deps.readImportJobControlState(queuedJob.jobId);
                if (control.cancelRequested) {
                  throw deps.createCanceledImportError();
                }
                persistFileProgressByEvent(event);
              },
              {
                batchSize,
                baseTimeframe: queuedJob.baseTimeframe,
                sourceId: queuedJob.sourceId,
                signal,
              },
            )
          : deps.importCsvFilesBatchedWithProgress(
              batchFiles.map((file) => ({
                originalname: file.fileName,
                path: file.filePath,
                symbol: file.symbol,
                mapping: file.mapping,
              })),
              queuedJob.mapping,
              queuedJob.timezone,
              (event: CsvImportProgressEvent) => {
                const control = deps.readImportJobControlState(queuedJob.jobId);
                if (control.cancelRequested) {
                  throw deps.createCanceledImportError();
                }
                persistFileProgressByEvent(event);
              },
              {
                batchSize,
                baseTimeframe: queuedJob.baseTimeframe,
                sourceId: queuedJob.sourceId,
                signal,
              },
            ));
        throwIfOperationAborted(signal);

        const resultByKey = new Map<string, CsvBatchImportFileResult>();
        batchResults.forEach((result) => {
          resultByKey.set(
            buildBatchResultKey(result.fileName, result.symbol),
            result,
          );
        });

        batchFiles.forEach((file) => {
          const result =
            resultByKey.get(buildBatchResultKey(file.fileName, file.symbol)) ??
            null;
          const rows = resolveFileRows(file, result);
          const prependedRows = Math.max(
            0,
            Math.floor(Number(result?.prependedRows ?? 0)),
          );
          const appendedRows = Math.max(
            0,
            Math.floor(Number(result?.appendedRows ?? 0)),
          );
          const overlapRowsIgnored = Math.max(
            0,
            Math.floor(Number(result?.overlapRowsIgnored ?? 0)),
          );
          const internalRangeRowsIgnored = Math.max(
            0,
            Math.floor(Number(result?.internalRangeRowsIgnored ?? 0)),
          );
          const conflictRowsIgnored = Math.max(
            0,
            Math.floor(Number(result?.conflictRowsIgnored ?? 0)),
          );
          const invalidRequiredRowsSkipped = Math.max(
            0,
            Math.floor(Number(result?.invalidRequiredRowsSkipped ?? 0)),
          );
          const invalidOhlcRowsSkipped = Math.max(
            0,
            Math.floor(Number(result?.invalidOhlcRowsSkipped ?? 0)),
          );
          const duplicateConflictRowsSkipped = Math.max(
            0,
            Math.floor(Number(result?.duplicateConflictRowsSkipped ?? 0)),
          );
          const duplicateIdenticalRowsDeduped = Math.max(
            0,
            Math.floor(Number(result?.duplicateIdenticalRowsDeduped ?? 0)),
          );
          const qualityRowsSkipped =
            invalidRequiredRowsSkipped +
            invalidOhlcRowsSkipped +
            duplicateConflictRowsSkipped +
            duplicateIdenticalRowsDeduped;
          const resultErrorMessage = result?.errorMessage
            ? normalizeImportErrorCode(
                result.errorMessage,
                "CSV_FILE_IMPORT_FAILED",
              )
            : result &&
                queuedJob.jobMode === "INCREMENTAL_UPDATE" &&
                (internalRangeRowsIgnored > 0 || conflictRowsIgnored > 0)
              ? "LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED"
              : "";
          doneFiles += 1;
          totalRows += rows.rowsTotal;
          importedRows += rows.rowsImported;
          skippedRows += rows.rowsSkipped;
          if (qualityRowsSkipped > 0) {
            outcomeSummary.qualityWarnings.filesWithSkippedRows += 1;
            outcomeSummary.qualityWarnings.invalidRequiredRowsSkipped +=
              invalidRequiredRowsSkipped;
            outcomeSummary.qualityWarnings.invalidOhlcRowsSkipped +=
              invalidOhlcRowsSkipped;
            outcomeSummary.qualityWarnings.duplicateConflictRowsSkipped +=
              duplicateConflictRowsSkipped;
            outcomeSummary.qualityWarnings.duplicateIdenticalRowsDeduped +=
              duplicateIdenticalRowsDeduped;
            outcomeSummary.noChanges = false;
          }

          if (result && !resultErrorMessage) {
            successfulFiles += 1;
            if (rows.rowsImported > 0) {
              importedSymbols.add(file.symbol);
              const instrumentId = String(result.instrumentId ?? "").trim();
              if (instrumentId) {
                importedInstrumentIdsForDerivedData.add(instrumentId);
              }
            }
            deps.updateFileImportedStmt.run(
              deps.fileStatusImported,
              String(result?.instrumentId ?? "").trim() || null,
              rows.rowsTotal,
              rows.rowsImported,
              rows.rowsSkipped,
              deps.nowIso(),
              file.fileRowId,
            );
            outcomeSummary.prependedRows += prependedRows;
            outcomeSummary.appendedRows += appendedRows;
            outcomeSummary.overlapRowsIgnored += overlapRowsIgnored;
            outcomeSummary.internalRangeRowsIgnored += internalRangeRowsIgnored;
            outcomeSummary.conflictRowsIgnored += conflictRowsIgnored;
            if (rows.rowsImported > 0) {
              const symbol = String(file.symbol ?? "")
                .trim()
                .toUpperCase();
              if (!symbol) {
                // noop
              } else if (existingImportedSymbolSet.has(symbol)) {
                if (!outcomeSummary.updatedSymbols.includes(symbol)) {
                  outcomeSummary.updatedSymbols.push(symbol);
                }
              } else {
                existingImportedSymbolSet.add(symbol);
                if (!outcomeSummary.addedSymbols.includes(symbol)) {
                  outcomeSummary.addedSymbols.push(symbol);
                }
              }
              outcomeSummary.noChanges = false;
            } else {
              outcomeSummary.unchangedFiles += 1;
            }
          } else {
            errorFiles += 1;
            const message = resultErrorMessage || "CSV_FILE_IMPORT_FAILED";
            failedImportErrorCodes.push(message);
            failedImportRecords.push({
              code: message,
              fileName: file.fileName,
            });
            deps.updateFileFailedStmt.run(
              deps.fileStatusFailed,
              rows.rowsTotal,
              rows.rowsImported,
              rows.rowsSkipped,
              message,
              deps.nowIso(),
              file.fileRowId,
            );
            const failedAt = deps.nowIso();
            deps.updateFileFailureDetails({
              fileRowId: file.fileRowId,
              errorCode: message,
              causeJson:
                stringifyImportFailurePayload(
                  buildImportFailureCause(message),
                ) ?? "{}",
              detailsJson:
                stringifyImportFailurePayload(
                  buildImportFailureDetails(message, {
                    fileName: file.fileName,
                    symbol: file.symbol,
                    rowsTotal: rows.rowsTotal,
                    rowsImported: rows.rowsImported,
                    rowsSkipped: rows.rowsSkipped,
                  }),
                ) ?? "{}",
              diagnosticsJson:
                stringifyImportFailurePayload(
                  buildImportDiagnosticsForFileFailure({
                    code: message,
                    fileName: file.fileName,
                    relativePath: file.fileName,
                    result,
                  }),
                ) ?? "[]",
              updatedAt: failedAt,
            });
          }
          activeFileProgress.delete(file.fileRowId);
        });
      } catch (error) {
        const isCanceledError = deps.isCanceledImportError(error);
        if (!isCanceledError && signal.aborted) {
          throw readAbortReason(signal);
        }
        if (isCanceledError) {
          canceled = true;
        }
        const batchErrorMessage = isCanceledError
          ? "LOCAL_DATA_IMPORT_JOB_CANCELED"
          : readImportErrorCode(error);
        batchFiles.forEach((file) => {
          const rows = resolveFileRows(file, null);
          doneFiles += 1;
          totalRows += rows.rowsTotal;
          importedRows += rows.rowsImported;
          skippedRows += rows.rowsSkipped;
          if (!isCanceledError) {
            errorFiles += 1;
            failedImportErrorCodes.push(batchErrorMessage);
            failedImportRecords.push({
              code: batchErrorMessage,
              fileName: file.fileName,
            });
          }
          deps.updateFileFailedStmt.run(
            deps.fileStatusFailed,
            rows.rowsTotal,
            rows.rowsImported,
            rows.rowsSkipped,
            batchErrorMessage,
            deps.nowIso(),
            file.fileRowId,
          );
          const failedAt = deps.nowIso();
          deps.updateFileFailureDetails({
            fileRowId: file.fileRowId,
            errorCode: batchErrorMessage,
            causeJson:
              stringifyImportFailurePayload(
                buildImportFailureCause(batchErrorMessage),
              ) ?? "{}",
            detailsJson:
              stringifyImportFailurePayload(
                buildImportFailureDetails(batchErrorMessage, {
                  fileName: file.fileName,
                  symbol: file.symbol,
                  rowsTotal: rows.rowsTotal,
                  rowsImported: rows.rowsImported,
                  rowsSkipped: rows.rowsSkipped,
                }),
              ) ?? "{}",
            diagnosticsJson:
              stringifyImportFailurePayload(
                buildImportDiagnosticsForFileFailure({
                  code: batchErrorMessage,
                  fileName: file.fileName,
                  relativePath: file.fileName,
                }),
              ) ?? "[]",
            updatedAt: failedAt,
          });
          activeFileProgress.delete(file.fileRowId);
        });
      } finally {
        persistJobProgress(null);
      }
    };

    while (!canceled) {
      const gateState = await deps.waitForJobControlRelease(
        queuedJob.jobId,
        signal,
      );
      if (gateState === "CANCELED") {
        canceled = true;
        break;
      }
      if (!pendingFiles.length) {
        break;
      }
      const runtimeParallelFiles = Math.max(
        1,
        Math.floor(Number(deps.resolveRuntimeImportParallelFiles()) || 1),
      );
      const initialBatchFiles =
        deps.resolveImportInitialBatchFiles(runtimeParallelFiles);
      const importBatchSize = firstBatchImported
        ? Math.max(
            1,
            Math.min(
              deps.resolveImportBatchSize(pendingFiles, runtimeParallelFiles),
              pendingFiles.length,
            ),
          )
        : Math.max(1, Math.min(initialBatchFiles, pendingFiles.length));
      const batchFiles = pendingFiles.splice(0, importBatchSize);
      if (!batchFiles.length) {
        break;
      }
      if (importingStartedAtMs <= 0) {
        importingStartedAtMs = Date.now();
      }
      importBatchCount += 1;
      importBatchSizeTotal += importBatchSize;
      importBatchSizeMin = Math.min(importBatchSizeMin, importBatchSize);
      importBatchSizeMax = Math.max(importBatchSizeMax, importBatchSize);
      runtimeParallelTotal += runtimeParallelFiles;
      runtimeParallelMin = Math.min(runtimeParallelMin, runtimeParallelFiles);
      runtimeParallelMax = Math.max(runtimeParallelMax, runtimeParallelFiles);
      // eslint-disable-next-line no-await-in-loop
      await importFileBatch(batchFiles);
      throwIfOperationAborted(signal);
      firstBatchImported = true;
    }

    if (canceled && pendingFiles.length) {
      const canceledAt = deps.nowIso();
      pendingFiles.forEach((file) => {
        deps.updateFileFailedStmt.run(
          deps.fileStatusFailed,
          0,
          0,
          0,
          "LOCAL_DATA_IMPORT_JOB_CANCELED",
          canceledAt,
          file.fileRowId,
        );
        deps.updateFileFailureDetails({
          fileRowId: file.fileRowId,
          errorCode: "LOCAL_DATA_IMPORT_JOB_CANCELED",
          causeJson:
            stringifyImportFailurePayload(
              buildImportFailureCause("LOCAL_DATA_IMPORT_JOB_CANCELED"),
            ) ?? "{}",
          detailsJson:
            stringifyImportFailurePayload(
              buildImportFailureDetails("LOCAL_DATA_IMPORT_JOB_CANCELED", {
                fileName: file.fileName,
                symbol: file.symbol,
              }),
            ) ?? "{}",
          diagnosticsJson:
            stringifyImportFailurePayload(
              buildImportDiagnosticsForFileFailure({
                code: "LOCAL_DATA_IMPORT_JOB_CANCELED",
                fileName: file.fileName,
                relativePath: file.fileName,
              }),
            ) ?? "[]",
          updatedAt: canceledAt,
        });
        doneFiles += 1;
      });
      pendingFiles.length = 0;
      persistJobProgress(null);
    }

    if (canceled) {
      const persistedImportedSymbols = (
        deps.listImportedSymbolsBySourceStmt.all(queuedJob.sourceId) as Array<{
          symbol: string;
        }>
      ).map((item) => item.symbol);
      persistedImportedSymbols.forEach((symbol) => importedSymbols.add(symbol));

      await refreshImportedInstrumentDerivedData();
      const sourceSummary = await deps.summarizeSourceBars(queuedJob.sourceId);
      const sourceStorageBytes =
        sourceSummary.barCount > 0
          ? await deps.estimateSourceStorageBytesFromCurrentMarket(
              sourceSummary.barCount,
            )
          : 0;
      const canceledTime = deps.nowIso();
      const failedFiles = Math.max(0, queuedJob.files.length - successfulFiles);
      const importedFilesForSource = Math.max(
        0,
        sourceTotalFiles - failedFiles,
      );
      deps.updateSourceFinalStmt.run(
        "FAILED",
        sourceTotalFiles,
        importedFilesForSource,
        failedFiles,
        sourceSummary.symbolCount,
        sourceSummary.barCount,
        sourceStorageBytes,
        sourceSummary.startTs,
        sourceSummary.endTs,
        deps.nowIso(),
        queuedJob.sourceId,
      );
      deps.beforePublishTerminalJob?.();
      deps.updateJobFinalStmt.run(
        "CANCELED",
        "DONE",
        deps.calculateFileBasedProgressPercent(
          doneFiles,
          queuedJob.files.length,
        ),
        doneFiles,
        totalRows,
        importedRows,
        skippedRows,
        errorFiles,
        "LOCAL_DATA_IMPORT_JOB_CANCELED",
        null,
        canceledTime,
        deps.nowIso(),
        queuedJob.jobId,
      );
      deps.updateJobFailureDetails({
        jobId: queuedJob.jobId,
        errorCode: "LOCAL_DATA_IMPORT_JOB_CANCELED",
        causeJson: stringifyImportFailurePayload(
          buildImportFailureCause("LOCAL_DATA_IMPORT_JOB_CANCELED"),
        ),
        detailsJson: stringifyImportFailurePayload(
          buildImportFailureDetails("LOCAL_DATA_IMPORT_JOB_CANCELED", {
            totalFiles: queuedJob.files.length,
            doneFiles,
          }),
        ),
        failureSummaryJson: stringifyImportFailurePayload(
          buildImportFailureSummary(
            queuedJob.files.map((file) => ({
              code: "LOCAL_DATA_IMPORT_JOB_CANCELED",
              fileName: file.fileName,
            })),
          ),
        ),
        updatedAt: canceledTime,
      });
      if (importedRows > 0) {
        await deps.checkpointMarketStorage().catch(() => undefined);
      }
      await cleanupPendingTempFiles();
      deps.clearImportJobControlState(queuedJob.jobId);
      deps.pruneImportJobHistoryForSource?.(queuedJob.sourceId);
      emitImportPerformance("CANCELED");
      return;
    }

    finalizingStartedAtMs = Date.now();
    throwIfOperationAborted(signal);
    deps.updateJobProgressStmt.run(
      "FINALIZING",
      deps.importCompactProgressBasePercent,
      doneFiles,
      totalRows,
      importedRows,
      skippedRows,
      errorFiles,
      null,
      deps.nowIso(),
      queuedJob.jobId,
    );

    const { jobStatus } = await finalizeQueuedImportJob({
      queuedJob,
      deps,
      signal,
      sourceTotalFiles,
      errorFiles,
      successfulFiles,
      failedImportErrorCodes,
      failedImportRecords,
      outcomeSummary,
      importedSymbols,
      refreshImportedInstrumentDerivedData,
      enqueueImportedInstrumentTimelinePrewarm,
      doneFiles,
      totalRows,
      importedRows,
      skippedRows,
    });
    await cleanupPendingTempFiles();
    deps.clearImportJobControlState(queuedJob.jobId);
    deps.pruneImportJobHistoryForSource?.(queuedJob.sourceId);
    emitImportPerformance(jobStatus);
  } finally {
    deadline.dispose();
  }
};
