// SPDX-License-Identifier: GPL-3.0-only

import type { QueuedImportJob } from './importJobExecutor.js';
import {
  buildImportFailureCause,
  buildImportFailureDetails,
  stringifyImportFailurePayload,
} from './importFailureDiagnostics.js';

type JobSummaryRow = {
  totalFiles: number | null;
  importedFiles: number | null;
  failedFiles: number | null;
};

type JobRow = {
  totalFiles: number;
  doneFiles: number;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorFiles: number;
};

type SourceSummary = {
  symbolCount: number;
  barCount: number;
  startTs: string | null;
  endTs: string | null;
};

type FailImportJobUnexpectedlyDeps = {
  nowIso: () => string;
  normalizeCount: (value: unknown) => number;
  calculateFileBasedProgressPercent: (doneFiles: number, totalFiles: number) => number;
  failActiveFilesByJob: (jobId: string, errorMessage: string, failedAt: string) => void;
  summarizeJobFiles: (jobId: string) => JobSummaryRow | undefined;
  getJobRow: (jobId: string) => JobRow | undefined;
  summarizeSourceBars: (sourceId: string) => Promise<SourceSummary>;
  estimateSourceStorageBytesFromCurrentMarket: (barCount: number) => Promise<number>;
  updateSourceFinalFailed: (payload: {
    sourceId: string;
    totalFiles: number;
    importedFiles: number;
    failedFiles: number;
    symbolCount: number;
    barCount: number;
    storageBytes: number;
    startTs: string | null;
    endTs: string | null;
    failedAt: string;
  }) => void;
  updateJobFinalFailed: (payload: {
    jobId: string;
    progressPercent: number;
    doneFiles: number;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errorFiles: number;
    errorMessage: string;
    failedAt: string;
  }) => void;
  updateSourceStatusFailed: (sourceId: string, failedAt: string) => void;
  updateJobFinalFailedFallback: (jobId: string, errorMessage: string, failedAt: string) => void;
  updateJobFailureDetails: (payload: {
    jobId: string;
    errorCode: string;
    causeJson: string | null;
    detailsJson: string | null;
    updatedAt: string;
  }) => void;
  clearImportJobControlState: (jobId: string) => void;
  normalizeImportFilePath: (filePath: string) => string | null;
  removeImportTempFilesByPath: (filePaths: string[]) => Promise<void>;
  removeImportTempDirsByPath: (dirPaths: string[]) => Promise<void>;
};

const ERROR_CODE_REGEX = /^[A-Z][A-Z0-9_]*$/;

const normalizeFailureCode = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const code = String((error as { code?: unknown }).code ?? '').trim();
    if (ERROR_CODE_REGEX.test(code)) {
      return code;
    }
  }
  if (error instanceof Error) {
    const messageCode = String(error.message || '').trim();
    if (ERROR_CODE_REGEX.test(messageCode)) {
      return messageCode;
    }
  }
  return 'LOCAL_DATA_IMPORT_JOB_FAILED';
};

const readFailureArgs = (
  error: unknown,
): Record<string, string | number | boolean | null> => {
  if (!error || typeof error !== 'object') {
    return {};
  }
  const args = (error as { args?: unknown }).args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(args as Record<string, unknown>)
      .filter(([, value]) =>
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) as Array<[string, string | number | boolean | null]>,
  );
};

const logUnexpectedImportJobError = (jobId: string, sourceId: string, error: unknown): void => {
  // eslint-disable-next-line no-console
  console.error('[zinuto-import] unexpected import job failure', {
    jobId,
    sourceId,
    errorType: error instanceof Error ? error.name : typeof error
  });
  if (error instanceof Error) {
    // eslint-disable-next-line no-console
    console.error(error.stack || error.message);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(error);
};

export const failImportJobUnexpectedlyCore = async (
  queuedJob: QueuedImportJob,
  error: unknown,
  deps: FailImportJobUnexpectedlyDeps
): Promise<void> => {
  const failedAt = deps.nowIso();
  const normalizedErrorCode = normalizeFailureCode(error);
  const failureArgs = readFailureArgs(error);
  logUnexpectedImportJobError(queuedJob.jobId, queuedJob.sourceId, error);

  try {
    deps.failActiveFilesByJob(queuedJob.jobId, normalizedErrorCode, failedAt);

    const fileSummary = deps.summarizeJobFiles(queuedJob.jobId);
    const jobRow = deps.getJobRow(queuedJob.jobId);

    const totalFiles = Math.max(
      0,
      deps.normalizeCount(jobRow?.totalFiles ?? 0),
      deps.normalizeCount(fileSummary?.totalFiles ?? 0),
      deps.normalizeCount(queuedJob.sourceTotalFiles ?? 0),
      queuedJob.files.length
    );
    const importedFiles = deps.normalizeCount(fileSummary?.importedFiles ?? 0);
    const failedFiles = Math.max(deps.normalizeCount(fileSummary?.failedFiles ?? 0), totalFiles - importedFiles);
    const doneFiles = Math.min(totalFiles, Math.max(deps.normalizeCount(jobRow?.doneFiles ?? 0), importedFiles + failedFiles));

    const totalRows = deps.normalizeCount(jobRow?.totalRows ?? 0);
    const importedRows = deps.normalizeCount(jobRow?.importedRows ?? 0);
    const skippedRows = deps.normalizeCount(jobRow?.skippedRows ?? 0);
    const errorFiles = Math.max(deps.normalizeCount(jobRow?.errorFiles ?? 0), failedFiles);

    const sourceSummary = await deps.summarizeSourceBars(queuedJob.sourceId);
    const sourceStorageBytes =
      sourceSummary.symbolCount > 0 ?
        await deps.estimateSourceStorageBytesFromCurrentMarket(sourceSummary.barCount) :
        0;

    deps.updateSourceFinalFailed({
      sourceId: queuedJob.sourceId,
      totalFiles,
      importedFiles,
      failedFiles,
      symbolCount: sourceSummary.symbolCount,
      barCount: sourceSummary.barCount,
      storageBytes: sourceStorageBytes,
      startTs: sourceSummary.startTs,
      endTs: sourceSummary.endTs,
      failedAt
    });

    deps.updateJobFinalFailed({
      jobId: queuedJob.jobId,
      progressPercent: deps.calculateFileBasedProgressPercent(doneFiles, totalFiles),
      doneFiles,
      totalRows,
      importedRows,
      skippedRows,
      errorFiles,
      errorMessage: normalizedErrorCode,
      failedAt
    });
    deps.updateJobFailureDetails({
      jobId: queuedJob.jobId,
      errorCode: normalizedErrorCode,
      causeJson: stringifyImportFailurePayload(
        buildImportFailureCause(normalizedErrorCode),
      ),
      detailsJson: stringifyImportFailurePayload(
        buildImportFailureDetails(normalizedErrorCode, failureArgs),
      ),
      updatedAt: failedAt,
    });
  } catch {
    deps.updateSourceStatusFailed(queuedJob.sourceId, failedAt);
    deps.updateJobFinalFailedFallback(queuedJob.jobId, normalizedErrorCode, failedAt);
  } finally {
    deps.clearImportJobControlState(queuedJob.jobId);
    const pendingFilePaths = queuedJob.files
      .map((file) => deps.normalizeImportFilePath(file.filePath))
      .filter((item): item is string => Boolean(item));
    await deps.removeImportTempFilesByPath(pendingFilePaths);
    await deps.removeImportTempDirsByPath(Array.isArray(queuedJob.tempDirPaths) ? queuedJob.tempDirPaths : []);
  }
};
