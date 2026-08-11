// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import type { LocalDataImportJobControlAction, LocalDataImportJobStatus } from './types.js';

type JobStatusRow = {
  id: string;
  sourceId: string;
  status: LocalDataImportJobStatus;
};

type FileSummaryRow = {
  totalFiles: number | null;
  importedFiles: number | null;
  failedFiles: number | null;
};

type ImportControlState = {
  paused: boolean;
  cancelRequested: boolean;
};

type QueuedImportJob = {
  sourceId: string;
  tempDirPaths?: string[];
  files: Array<{
    fileRowId: string;
    filePath: string;
  }>;
};

type ControlJobDeps<TJobDetail> = {
  getJobStatusById: (jobId: string) => JobStatusRow | undefined;
  toJobDetail: (jobId: string) => TJobDetail;
  hasImportJobControlState: (jobId: string) => boolean;
  ensureImportJobControlState: (jobId: string) => ImportControlState;
  requestCancelImportJob: (jobId: string) => ImportControlState;
  clearImportJobControlState: (jobId: string) => void;
  nowIso: () => string;
  importJobQueue: {
    findIndex: (predicate: (item: { jobId: string }) => boolean) => number;
    removeAt: (index: number) => QueuedImportJob | null | undefined;
  };
  updateFileFailed: (fileRowId: string, canceledAt: string) => void;
  removeImportTempFile: (filePath: string) => void;
  removeImportTempDirs: (dirPaths: string[]) => void;
  updateSourceFinalFailedCanceled: (sourceId: string, totalFiles: number, canceledAt: string) => void;
  updateJobFinalCanceled: (jobId: string, progressPercent: number, doneFiles: number, failedFiles: number, canceledAt: string) => void;
  failActiveFilesByJob: (jobId: string, canceledAt: string) => void;
  summarizeJobFiles: (jobId: string) => FileSummaryRow | undefined;
  updateSourceStatusFailed: (sourceId: string, canceledAt: string) => void;
  normalizeCount: (value: unknown) => number;
  calculateFileBasedProgressPercent: (doneFiles: number, totalFiles: number) => number;
};

export const controlLocalDataImportJobCore = <TJobDetail>(
  jobId: string,
  action: LocalDataImportJobControlAction,
  deps: ControlJobDeps<TJobDetail>
): TJobDetail => {
  const normalizedJobId = String(jobId ?? '').trim();
  if (!normalizedJobId) {
    throw appError('LOCAL_DATA_IMPORT_JOB_NOT_FOUND', { jobId }, 404);
  }
  if (action !== 'PAUSE' && action !== 'RESUME' && action !== 'CANCEL') {
    throw appError('LOCAL_DATA_IMPORT_JOB_CONTROL_INVALID', { action });
  }

  const jobRow = deps.getJobStatusById(normalizedJobId);
  if (!jobRow) {
    throw appError('LOCAL_DATA_IMPORT_JOB_NOT_FOUND', { jobId: normalizedJobId }, 404);
  }

  if (
    jobRow.status === 'SUCCESS' ||
    jobRow.status === 'PARTIAL_SUCCESS' ||
    jobRow.status === 'FAILED' ||
    jobRow.status === 'CANCELED'
  ) {
    return deps.toJobDetail(normalizedJobId);
  }

  const hadControlState = deps.hasImportJobControlState(normalizedJobId);
  const control = deps.ensureImportJobControlState(normalizedJobId);
  if (action === 'PAUSE') {
    control.paused = true;
    return deps.toJobDetail(normalizedJobId);
  }
  if (action === 'RESUME') {
    control.paused = false;
    return deps.toJobDetail(normalizedJobId);
  }

  deps.requestCancelImportJob(normalizedJobId);

  const queuedIndex = deps.importJobQueue.findIndex((item) => item.jobId === normalizedJobId);
  const canceledAt = deps.nowIso();
  if (queuedIndex >= 0) {
    const queuedJob = deps.importJobQueue.removeAt(queuedIndex);
    if (!queuedJob) {
      return deps.toJobDetail(normalizedJobId);
    }
    queuedJob.files.forEach((file) => {
      deps.updateFileFailed(file.fileRowId, canceledAt);
      deps.removeImportTempFile(file.filePath);
    });
    deps.removeImportTempDirs(Array.isArray(queuedJob.tempDirPaths) ? queuedJob.tempDirPaths : []);
    deps.updateSourceFinalFailedCanceled(queuedJob.sourceId, queuedJob.files.length, canceledAt);
    deps.updateJobFinalCanceled(normalizedJobId, 0, 0, 0, canceledAt);
    deps.clearImportJobControlState(normalizedJobId);
    return deps.toJobDetail(normalizedJobId);
  }

  if (!hadControlState && (jobRow.status === 'QUEUED' || jobRow.status === 'RUNNING')) {
    deps.failActiveFilesByJob(normalizedJobId, canceledAt);
    const fileSummary = deps.summarizeJobFiles(normalizedJobId);
    const totalFiles = Math.max(deps.normalizeCount(fileSummary?.totalFiles ?? 0), 1);
    const importedFiles = deps.normalizeCount(fileSummary?.importedFiles ?? 0);
    const failedFiles = deps.normalizeCount(fileSummary?.failedFiles ?? 0);
    const doneFiles = Math.min(totalFiles, importedFiles + failedFiles);
    deps.updateSourceStatusFailed(jobRow.sourceId, canceledAt);
    deps.updateJobFinalCanceled(
      normalizedJobId,
      deps.calculateFileBasedProgressPercent(doneFiles, totalFiles),
      doneFiles,
      failedFiles,
      canceledAt
    );
    deps.clearImportJobControlState(normalizedJobId);
  }

  return deps.toJobDetail(normalizedJobId);
};
