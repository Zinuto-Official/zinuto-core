// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataImportOutcomeSummary } from "./types.js";
import type {
  ProcessImportJobDeps,
  QueuedImportJob,
} from "./importJobTypes.js";
import {
  buildImportFailureCause,
  buildImportFailureDetails,
  buildImportFailureSummary,
  normalizeImportFailureCode,
  stringifyImportFailurePayload,
} from "./importFailureDiagnostics.js";
import { throwIfOperationAborted } from "./operationAbort.js";
import { resolveCompleteFailureErrorMessage } from "./importJobOutcomeHelpers.js";

type ImportJobSuccessStatus = "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";

export const finalizeQueuedImportJob = async ({
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
}: {
  queuedJob: QueuedImportJob;
  deps: ProcessImportJobDeps;
  signal: AbortSignal;
  sourceTotalFiles: number;
  errorFiles: number;
  successfulFiles: number;
  failedImportErrorCodes: string[];
  failedImportRecords: Array<{ code: string; fileName: string }>;
  outcomeSummary: LocalDataImportOutcomeSummary;
  importedSymbols: Set<string>;
  refreshImportedInstrumentDerivedData: () => Promise<void>;
  enqueueImportedInstrumentTimelinePrewarm: () => void;
  doneFiles: number;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
}): Promise<{ jobStatus: ImportJobSuccessStatus }> => {
  const shouldReconcileExistingSource =
    queuedJob.jobMode === "FULL_IMPORT" &&
    Boolean(queuedJob.replaceExistingSource) &&
    errorFiles <= 0 &&
    ((Array.isArray(queuedJob.changedSymbols) &&
      queuedJob.changedSymbols.length > 0) ||
      (Array.isArray(queuedJob.obsoleteSymbols) &&
        queuedJob.obsoleteSymbols.length > 0));
  if (shouldReconcileExistingSource) {
    throwIfOperationAborted(signal);
    const changedSymbols = Array.from(
      new Set(
        (Array.isArray(queuedJob.changedSymbols)
          ? queuedJob.changedSymbols
          : []
        )
          .map((symbol) =>
            String(symbol ?? "")
              .trim()
              .toUpperCase(),
          )
          .filter((symbol) => Boolean(symbol)),
      ),
    );
    changedSymbols.forEach((symbol) => {
      deps.deleteSourceFilesBySourceSymbolExceptJob(
        queuedJob.sourceId,
        symbol,
        queuedJob.jobId,
      );
    });
    const obsoleteSymbols = Array.from(
      new Set(
        (Array.isArray(queuedJob.obsoleteSymbols)
          ? queuedJob.obsoleteSymbols
          : []
        )
          .map((symbol) =>
            String(symbol ?? "")
              .trim()
              .toUpperCase(),
          )
          .filter((symbol) => Boolean(symbol)),
      ),
    );
    obsoleteSymbols.forEach((symbol) => {
      deps.deleteSourceFilesBySourceSymbol(queuedJob.sourceId, symbol);
    });
    const removableInstrumentIds = obsoleteSymbols
      .map((symbol) => {
        const instrument = deps.getLocalInstrumentBySymbol(
          queuedJob.sourceId,
          symbol,
          queuedJob.baseTimeframe,
        );
        return String(instrument?.id ?? "").trim();
      })
      .filter((instrumentId) => Boolean(instrumentId));
    if (removableInstrumentIds.length > 0) {
      await Promise.all(
        removableInstrumentIds.map((instrumentId) =>
          deps.removeMarketInstrumentData(instrumentId),
        ),
      );
      throwIfOperationAborted(signal);
      removableInstrumentIds.forEach((instrumentId) => {
        deps.deleteInstrumentById(instrumentId);
      });
    }
  }

  const persistedImportedSymbols = (
    deps.listImportedSymbolsBySourceStmt.all(queuedJob.sourceId) as Array<{
      symbol: string;
    }>
  ).map((item) => item.symbol);
  persistedImportedSymbols.forEach((symbol) => importedSymbols.add(symbol));

  await refreshImportedInstrumentDerivedData();
  throwIfOperationAborted(signal);
  const sourceSummary = await deps.summarizeSourceBars(queuedJob.sourceId);
  const existingSourceFullImportFailed =
    queuedJob.jobMode === "FULL_IMPORT" &&
    Boolean(queuedJob.replaceExistingSource) &&
    errorFiles > 0;
  // A replacement import may already have committed some instrument files
  // before another file fails. Never expose that mixed old/new snapshot as a
  // READY source; a successful retry must finish the replacement first.
  const sourceStatus =
    sourceSummary.symbolCount > 0 && !existingSourceFullImportFailed
      ? "READY"
      : "FAILED";
  const hasPartialFailures = errorFiles > 0 && successfulFiles > 0;
  const hasCompleteFailure = errorFiles > 0 && successfulFiles === 0;
  const jobStatus = hasCompleteFailure
    ? "FAILED"
    : hasPartialFailures
      ? "PARTIAL_SUCCESS"
      : "SUCCESS";
  const importedFilesForSource = Math.max(0, sourceTotalFiles - errorFiles);
  const errorMessage = hasCompleteFailure
    ? resolveCompleteFailureErrorMessage(failedImportErrorCodes)
    : hasPartialFailures
      ? "LOCAL_DATA_IMPORT_PARTIAL_FAILED"
      : null;
  const normalizedJobErrorCode = errorMessage
    ? normalizeImportFailureCode(errorMessage, "LOCAL_DATA_IMPORT_JOB_FAILED")
    : null;
  outcomeSummary.addedSymbols.sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  outcomeSummary.updatedSymbols.sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  outcomeSummary.noChanges =
    errorFiles <= 0 &&
    outcomeSummary.addedSymbols.length <= 0 &&
    outcomeSummary.updatedSymbols.length <= 0 &&
    outcomeSummary.prependedRows <= 0 &&
    outcomeSummary.appendedRows <= 0 &&
    outcomeSummary.qualityWarnings.filesWithSkippedRows <= 0 &&
    outcomeSummary.qualityWarnings.invalidRequiredRowsSkipped <= 0 &&
    outcomeSummary.qualityWarnings.invalidOhlcRowsSkipped <= 0 &&
    outcomeSummary.qualityWarnings.duplicateConflictRowsSkipped <= 0 &&
    outcomeSummary.qualityWarnings.duplicateIdenticalRowsDeduped <= 0;
  const outcomeSummaryJson = JSON.stringify(outcomeSummary);
  let compactProgressPercent = 0;
  let compactBeforeBytes = 0;
  let compactAfterBytes = 0;
  let compactReclaimedBytes = 0;

  const persistCompactingProgress = (
    nextCompactProgressPercent: number,
    nextOverallProgressPercent: number,
  ): void => {
    compactProgressPercent = deps.normalizeCompactProgressPercent(
      nextCompactProgressPercent,
    );
    deps.updateJobCompactingProgressStmt.run(
      "FINALIZING",
      deps.normalizeProgressPercent(nextOverallProgressPercent),
      compactProgressPercent,
      doneFiles,
      totalRows,
      importedRows,
      skippedRows,
      errorFiles,
      deps.nowIso(),
      queuedJob.jobId,
    );
  };

  if (importedRows > 0) {
    const activeJobs = Math.max(
      0,
      Math.floor(Number(deps.countActiveJobs()) || 0),
    );
    const shouldCheckpointStorage = activeJobs <= 1;
    try {
      const footprintBefore = await deps.getMarketStorageFootprint();
      compactBeforeBytes = deps.toSafeStorageBytes(footprintBefore.totalBytes);
      if (compactBeforeBytes > 0) {
        deps.updateJobCompactionBaselineStmt.run(
          compactBeforeBytes,
          deps.nowIso(),
          queuedJob.jobId,
        );
      }
    } catch {
      compactBeforeBytes = 0;
    }
    persistCompactingProgress(0, deps.importCompactProgressBasePercent);
    try {
      if (shouldCheckpointStorage) {
        await deps.checkpointMarketStorage().catch(() => undefined);
        throwIfOperationAborted(signal);
      }
      const footprintAfter = await deps.getMarketStorageFootprint();
      compactAfterBytes = deps.toSafeStorageBytes(footprintAfter.totalBytes);
      if (compactBeforeBytes <= 0) {
        compactBeforeBytes = compactAfterBytes;
      }
      compactReclaimedBytes = Math.max(
        0,
        compactBeforeBytes - compactAfterBytes,
      );
      persistCompactingProgress(100, 99);
    } catch {
      persistCompactingProgress(
        compactProgressPercent,
        Math.max(deps.importCompactProgressBasePercent, 98),
      );
    }
    deps.updateJobCompactionResultStmt.run(
      compactBeforeBytes,
      compactAfterBytes,
      compactReclaimedBytes,
      deps.nowIso(),
      queuedJob.jobId,
    );
  }

  const sourceStorageBytes =
    sourceSummary.symbolCount > 0
      ? await deps.estimateSourceStorageBytesFromCurrentMarket(
          sourceSummary.barCount,
          compactAfterBytes > 0 ? compactAfterBytes : undefined,
        )
      : 0;
  throwIfOperationAborted(signal);
  const finishTime = deps.nowIso();
  // Re-check the cancel request immediately before the terminal write. A
  // cancel arriving in the finalization window must not be overwritten by a
  // SUCCESS/PARTIAL_SUCCESS final state.
  const finalControlState = deps.readImportJobControlState(queuedJob.jobId);
  if (finalControlState?.cancelRequested) {
    throw deps.createCanceledImportError();
  }
  deps.updateSourceFinalStmt.run(
    sourceStatus,
    sourceTotalFiles,
    importedFilesForSource,
    errorFiles,
    sourceSummary.symbolCount,
    sourceSummary.barCount,
    sourceStorageBytes,
    sourceSummary.startTs,
    sourceSummary.endTs,
    finishTime,
    queuedJob.sourceId,
  );
  deps.updateSourceStorageBytesStmt.run(
    sourceStorageBytes,
    deps.nowIso(),
    queuedJob.sourceId,
  );
  deps.beforePublishTerminalJob?.();
  deps.updateJobFinalStmt.run(
    jobStatus,
    "DONE",
    100,
    doneFiles,
    totalRows,
    importedRows,
    skippedRows,
    errorFiles,
    errorMessage,
    outcomeSummaryJson,
    finishTime,
    deps.nowIso(),
    queuedJob.jobId,
  );
  deps.updateJobFailureDetails({
    jobId: queuedJob.jobId,
    errorCode: normalizedJobErrorCode,
    causeJson: normalizedJobErrorCode
      ? stringifyImportFailurePayload(
          buildImportFailureCause(normalizedJobErrorCode),
        )
      : null,
    detailsJson: normalizedJobErrorCode
      ? stringifyImportFailurePayload(
          buildImportFailureDetails(normalizedJobErrorCode, {
            totalFiles: queuedJob.files.length,
            errorFiles,
            successfulFiles,
            importedRows,
            skippedRows,
          }),
        )
      : null,
    failureSummaryJson: failedImportRecords.length
      ? stringifyImportFailurePayload(
          buildImportFailureSummary(failedImportRecords),
        )
      : null,
    updatedAt: finishTime,
  });
  enqueueImportedInstrumentTimelinePrewarm();
  if (
    (jobStatus === "SUCCESS" || jobStatus === "PARTIAL_SUCCESS") &&
    deps.onImportJobSucceeded &&
    (queuedJob.jobMode === "FULL_IMPORT" || !outcomeSummary.noChanges)
  ) {
    await deps.onImportJobSucceeded({
      jobId: queuedJob.jobId,
      sourceId: queuedJob.sourceId,
      baseTimeframe: queuedJob.baseTimeframe,
      sourceSummary: {
        symbolCount: sourceSummary.symbolCount,
        barCount: sourceSummary.barCount,
      },
      sourceStorageBytes,
      occurredAt: finishTime,
    });
  }
  return { jobStatus };
};
