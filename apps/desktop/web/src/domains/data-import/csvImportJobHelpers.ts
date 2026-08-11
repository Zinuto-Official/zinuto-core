// SPDX-License-Identifier: GPL-3.0-only

import type { ApiLocalDataImportJob, ApiTradingCalendarConfig } from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { BaseTimeframe } from '@/domains/chart/chartPeriods';
import type { CsvFieldMapping } from '@/domains/data-import/csvHelpers';
import type { CsvImportCardState } from '@/domains/data-import/useCsvImportController';
import { IMPORT_LIMITS } from '@zinuto/shared/input-limits';

export const LOCAL_DATA_IMPORT_JOB_CLIENT_DEADLINE_MS =
  IMPORT_LIMITS.importJobDeadlineMaxMs + IMPORT_LIMITS.clientDeadlineGraceMs;

export const hasLocalDataImportJobExceededClientDeadline = ({
  job,
  monitorStartedAtMs,
  nowMs = Date.now(),
  deadlineMs = LOCAL_DATA_IMPORT_JOB_CLIENT_DEADLINE_MS,
}: {
  job: Pick<ApiLocalDataImportJob, 'createdAt' | 'startedAt'>;
  monitorStartedAtMs: number;
  nowMs?: number;
  deadlineMs?: number;
}): boolean => {
  const serverStartedAtMs = Date.parse(job.startedAt || job.createdAt);
  const effectiveStartedAtMs = Number.isFinite(serverStartedAtMs)
    ? Math.min(serverStartedAtMs, monitorStartedAtMs)
    : monitorStartedAtMs;
  return nowMs - effectiveStartedAtMs >= Math.max(1, deadlineMs);
};

export type CustomSamplePool = {
  id: string;
  name: string;
  sourceFolder: string;
  sourceFolderBookmarkId?: string;
  instruments: Array<{
    instrumentId: string;
    samplePoolId: string;
    symbol: string;
    displayLabel: string;
    sourceTimeframe: BaseTimeframe;
    barCount: number;
  }>;
  symbols: string[];
  sourceLocked?: boolean;
  unlockedSymbols?: string[];
  lockedSymbols?: string[];
  lockedSymbolCount?: number;
  lockReason?: string | null;
  fileCount: number;
  storageBytes: number;
  csvFieldMapping: CsvFieldMapping;
  tradingCalendar: ApiTradingCalendarConfig;
  baseTimeframe: BaseTimeframe;
  selected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ImportCsvOptions = {
  mode?: 'DEFAULT' | 'BATCH' | 'FULL_REIMPORT' | 'INCREMENTAL_UPDATE';
  sourceId?: string;
  sourceFolder?: string;
  sourceFolderBookmarkId?: string;
  sourceFolderUsageMode?: 'BOUND_SOURCE' | 'ONE_OFF';
  importScopeStrategy?: 'FLAT' | 'WITH_PARENT' | null;
  importScopeTopLevelSubfolder?: string;
  timeZone?: string;
  timeZoneOrigin?:
    | 'PRESET_DEFAULT'
    | 'PRESET_DEFAULT'
    | 'INFERRED_DEFAULT'
    | 'USER_SELECTED';
  allowExistingSourceTimeZoneChange?: boolean;
  tradingCalendar?: ApiTradingCalendarConfig;
};

export const resolveImportQualitySkippedRows = (
  jobDetail: ApiLocalDataImportJob,
): number => {
  const qualitySkippedRows = Math.max(
    0,
    Number(jobDetail.outcomeInsight?.qualityRowsSkipped) || 0,
  );
  return Math.max(0, Number(jobDetail.skippedRows) || 0, qualitySkippedRows);
};

export const resolveSymbolLimitSkipHint = (
  _jobDetail: ApiLocalDataImportJob,
  _ttf: (key: AppTextKey, values?: Array<unknown>) => string,
): string => '';

export const isActiveImportJobStatus = (status: ApiLocalDataImportJob['status']): boolean =>
  status === 'QUEUED' || status === 'RUNNING';

export const waitForImportJobPollTick = async (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Import polling was aborted.', 'AbortError'));
      return;
    }
    let timeoutId: number | null = null;
    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      signal.removeEventListener('abort', abort);
    };
    const complete = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Import polling was aborted.', 'AbortError'));
    };
    timeoutId = window.setTimeout(complete, Math.max(0, ms));
    signal.addEventListener('abort', abort, { once: true });
  });

export const buildImportCardPatchFromJob = (
  job: ApiLocalDataImportJob,
  fallbackTotalFiles: number,
): Partial<CsvImportCardState> => ({
  jobId: job.id,
  sourceId: job.sourceId,
  phase: job.phaseFacts.cardPhase,
  progressPercent: Math.max(0, Math.min(100, Number(job.progressPercent) || 0)),
  importProgressPercent: Math.max(0, Math.min(100, Number(job.phaseFacts.importProgressPercent) || 0)),
  compactProgressPercent: Math.max(0, Math.min(100, Number(job.compactProgressPercent) || 0)),
  compactProgressDisplayPercent: Math.max(0, Math.min(100, Number(job.phaseFacts.compactProgressDisplayPercent) || 0)),
  compactBeforeBytes: Math.max(0, Number(job.compactBeforeBytes) || 0),
  compactAfterBytes: Math.max(0, Number(job.compactAfterBytes) || 0),
  compactReclaimedBytes: Math.max(0, Number(job.compactReclaimedBytes) || 0),
  compactAfterDisplayBytes: Math.max(0, Number(job.phaseFacts.compactAfterDisplayBytes) || 0),
  compactReclaimedDisplayBytes: Math.max(0, Number(job.phaseFacts.compactReclaimedDisplayBytes) || 0),
  shouldShowCompactProgress: job.phaseFacts.shouldShowCompactProgress === true,
  doneFiles: Math.max(0, Number(job.doneFiles) || 0),
  totalFiles: Math.max(0, Number(job.totalFiles) || fallbackTotalFiles),
  importedRows: Math.max(0, Number(job.importedRows) || 0),
  skippedRows: Math.max(0, Number(job.skippedRows) || 0),
  totalRows: Math.max(0, Number(job.totalRows) || 0),
  isPaused: Boolean(job.isPaused),
  cancelRequested: Boolean(job.cancelRequested),
  errorMessage: job.status === 'FAILED' ? job.errorMessage || '' : ''
});
