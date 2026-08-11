// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import type { LocalDataImportJobDetail } from './types.js';
import {
  buildImportDiagnosticsForFileFailure,
  buildImportFailureCause,
  buildImportFailureDetails,
  buildImportFailureSummary,
  normalizeImportFailureCode,
  parseImportFailureJson,
  type ImportDiagnostic,
  type ImportFailureCause,
  type ImportFailureDetails,
  type ImportFailureSummary,
} from './importFailureDiagnostics.js';
import {
  buildLocalDataImportJobPhaseFacts,
  buildLocalDataImportOutcomeInsight,
} from './importJobFacts.js';

export type JobDetailRow = Omit<
  LocalDataImportJobDetail,
  | 'isPaused'
  | 'cancelRequested'
  | 'failedFiles'
  | 'outcomeSummary'
  | 'outcomeInsight'
  | 'phaseFacts'
  | 'symbolLimit'
  | 'cause'
  | 'details'
  | 'failureSummary'
> & {
  outcomeSummaryJson?: string | null;
  symbolLimitJson?: string | null;
  errorCauseJson?: string | null;
  errorDetailsJson?: string | null;
  failureSummaryJson?: string | null;
};

export type FailedFileRow = Omit<LocalDataImportJobDetail['failedFiles'][number], 'errorMessage'> & {
  errorMessage: string | null;
  errorCode?: string | null;
  errorCauseJson?: string | null;
  errorDetailsJson?: string | null;
  diagnosticsJson?: string | null;
};

const createEmptySymbolLimit = (): LocalDataImportJobDetail['symbolLimit'] => ({
  limitApplied: false,
  maxSymbols: null,
  selectedSymbols: [],
  skippedSymbols: [],
  skippedSymbolCount: 0,
  reason: null,
});

const parseSymbolLimit = (
  _raw: unknown
): LocalDataImportJobDetail['symbolLimit'] => createEmptySymbolLimit();

type ImportJobControlState = {
  paused: boolean;
  cancelRequested: boolean;
};

type BuildImportJobDetailDeps = {
  getJobRow: (jobId: string) => JobDetailRow | undefined;
  listFailedFileRows: (jobId: string, failedStatus: string) => FailedFileRow[];
  readImportJobControlState: (jobId: string) => ImportJobControlState;
  failedFileStatus: string;
  normalizeProgressPercent: (value: number) => number;
  normalizeCompactProgressPercent: (value: number) => number;
  toSafeStorageBytes: (value: unknown) => number;
};

const parseOutcomeSummary = (
  raw: unknown
): LocalDataImportJobDetail['outcomeSummary'] => {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const toSymbolList = (value: unknown): string[] =>
      Array.isArray(value)
        ? Array.from(
            new Set(
              value
                .map((item) => String(item ?? '').trim().toUpperCase())
                .filter((item) => item.length > 0)
            )
          )
        : [];
    const toCount = (value: unknown): number =>
      Math.max(0, Math.floor(Number(value) || 0));
    const qualityWarnings =
      parsed.qualityWarnings && typeof parsed.qualityWarnings === 'object'
        ? parsed.qualityWarnings as Record<string, unknown>
        : {};
    return {
      noChanges: Boolean(parsed.noChanges),
      addedSymbols: toSymbolList(parsed.addedSymbols),
      updatedSymbols: toSymbolList(parsed.updatedSymbols),
      unchangedFiles: toCount(parsed.unchangedFiles),
      prependedRows: toCount(parsed.prependedRows),
      appendedRows: toCount(parsed.appendedRows),
      overlapRowsIgnored: toCount(parsed.overlapRowsIgnored),
      internalRangeRowsIgnored: toCount(parsed.internalRangeRowsIgnored),
      conflictRowsIgnored: toCount(parsed.conflictRowsIgnored),
      qualityWarnings: {
        filesWithSkippedRows: toCount(qualityWarnings.filesWithSkippedRows),
        invalidRequiredRowsSkipped: toCount(qualityWarnings.invalidRequiredRowsSkipped),
        invalidOhlcRowsSkipped: toCount(qualityWarnings.invalidOhlcRowsSkipped),
        duplicateConflictRowsSkipped: toCount(qualityWarnings.duplicateConflictRowsSkipped),
        duplicateIdenticalRowsDeduped: toCount(qualityWarnings.duplicateIdenticalRowsDeduped)
      }
    };
  } catch {
    return null;
  }
};

export const toLocalDataImportJobDetail = (
  jobId: string,
  deps: BuildImportJobDetailDeps
): LocalDataImportJobDetail => {
  const row = deps.getJobRow(jobId);
  if (!row) {
    throw appError('LOCAL_DATA_IMPORT_JOB_NOT_FOUND', { jobId }, 404);
  }

  const failedRows = deps.listFailedFileRows(jobId, deps.failedFileStatus);
  const controlState = deps.readImportJobControlState(jobId);
  const isJobActive = row.status === 'QUEUED' || row.status === 'RUNNING';
  const failedFiles = failedRows.map((item) => {
    const errorCode = normalizeImportFailureCode(item.errorCode || item.errorMessage || row.errorCode || row.errorMessage);
    const cause = parseImportFailureJson<ImportFailureCause>(
      item.errorCauseJson,
      buildImportFailureCause(errorCode),
    );
    const details = parseImportFailureJson<ImportFailureDetails>(
      item.errorDetailsJson,
      buildImportFailureDetails(errorCode, {
        fileName: item.fileName,
        symbol: item.symbol,
        rowsTotal: item.rowsTotal,
        rowsImported: item.rowsImported,
        rowsSkipped: item.rowsSkipped,
      }),
    );
    const diagnostics = parseImportFailureJson<ImportDiagnostic[]>(
      item.diagnosticsJson,
      buildImportDiagnosticsForFileFailure({
        code: errorCode,
        fileName: item.fileName,
        result: {
          fileName: item.fileName,
          symbol: item.symbol,
          instrumentId: '',
          rows: item.rowsImported,
          mapping: {},
        },
      }),
    );
    return {
      id: item.id,
      fileName: item.fileName,
      symbol: item.symbol,
      rowsTotal: Math.max(0, Math.floor(Number(item.rowsTotal ?? 0))),
      rowsImported: Math.max(0, Math.floor(Number(item.rowsImported ?? 0))),
      rowsSkipped: Math.max(0, Math.floor(Number(item.rowsSkipped ?? 0))),
      errorMessage: item.errorMessage || errorCode,
      errorCode,
      cause,
      details,
      diagnostics,
      updatedAt: item.updatedAt
    };
  });
  const jobErrorCode = row.errorCode || row.errorMessage
    ? normalizeImportFailureCode(row.errorCode || row.errorMessage)
    : null;
  const outcomeSummary = parseOutcomeSummary((row as { outcomeSummaryJson?: unknown }).outcomeSummaryJson);
  const phaseFacts = buildLocalDataImportJobPhaseFacts({
    status: row.status,
    stage: row.stage,
    progressPercent: deps.normalizeProgressPercent(Number(row.progressPercent ?? 0)),
    compactProgressPercent: deps.normalizeCompactProgressPercent(Number(row.compactProgressPercent ?? 0)),
    compactBeforeBytes: deps.toSafeStorageBytes(row.compactBeforeBytes),
    compactAfterBytes: deps.toSafeStorageBytes(row.compactAfterBytes),
    compactReclaimedBytes: deps.toSafeStorageBytes(row.compactReclaimedBytes),
    doneFiles: Math.max(0, Math.floor(Number(row.doneFiles ?? 0))),
    totalFiles: Math.max(0, Math.floor(Number(row.totalFiles ?? 0))),
  });

  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    timeZone: row.timeZone,
    baseTimeframe: row.baseTimeframe,
    jobMode: row.jobMode === 'INCREMENTAL_UPDATE' ? 'INCREMENTAL_UPDATE' : 'FULL_IMPORT',
    status: row.status,
    stage: row.stage,
    progressPercent: deps.normalizeProgressPercent(Number(row.progressPercent ?? 0)),
    compactProgressPercent: deps.normalizeCompactProgressPercent(Number(row.compactProgressPercent ?? 0)),
    compactBeforeBytes: deps.toSafeStorageBytes(row.compactBeforeBytes),
    compactAfterBytes: deps.toSafeStorageBytes(row.compactAfterBytes),
    compactReclaimedBytes: deps.toSafeStorageBytes(row.compactReclaimedBytes),
    totalFiles: Math.max(0, Math.floor(Number(row.totalFiles ?? 0))),
    doneFiles: Math.max(0, Math.floor(Number(row.doneFiles ?? 0))),
    totalRows: Math.max(0, Math.floor(Number(row.totalRows ?? 0))),
    importedRows: Math.max(0, Math.floor(Number(row.importedRows ?? 0))),
    skippedRows: Math.max(0, Math.floor(Number(row.skippedRows ?? 0))),
    errorFiles: Math.max(0, Math.floor(Number(row.errorFiles ?? 0))),
    currentFileName: row.currentFileName || null,
    errorMessage: row.errorMessage || null,
    errorCode: jobErrorCode,
    cause: jobErrorCode
      ? parseImportFailureJson<ImportFailureCause>(
          (row as { errorCauseJson?: unknown }).errorCauseJson,
          buildImportFailureCause(jobErrorCode),
        )
      : null,
    details: jobErrorCode
      ? parseImportFailureJson<ImportFailureDetails>(
          (row as { errorDetailsJson?: unknown }).errorDetailsJson,
          buildImportFailureDetails(jobErrorCode, {
            totalFiles: row.totalFiles,
            errorFiles: row.errorFiles,
          }),
        )
      : null,
    failureSummary: parseImportFailureJson<ImportFailureSummary>(
      (row as { failureSummaryJson?: unknown }).failureSummaryJson,
      buildImportFailureSummary(failedFiles.map((item) => ({ code: item.errorCode, fileName: item.fileName }))),
    ),
    createdAt: row.createdAt,
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null,
    isPaused: isJobActive ? Boolean(controlState.paused) : false,
    cancelRequested: isJobActive ? Boolean(controlState.cancelRequested) : row.status === 'CANCELED',
    outcomeSummary,
    outcomeInsight: buildLocalDataImportOutcomeInsight(outcomeSummary),
    phaseFacts,
    symbolLimit: parseSymbolLimit((row as { symbolLimitJson?: unknown }).symbolLimitJson),
    failedFiles
  };
};
