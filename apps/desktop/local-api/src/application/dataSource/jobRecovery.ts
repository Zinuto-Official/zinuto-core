// SPDX-License-Identifier: GPL-3.0-only

import type {
  LocalDataImportJobStage,
  LocalDataImportJobStatus,
  LocalDataSourceStatus,
} from './types.js';

type ActiveJobRow = {
  id: string;
  sourceId: string;
  status: LocalDataImportJobStatus;
  stage: LocalDataImportJobStage;
  sourceStatus: LocalDataSourceStatus | null;
  totalFiles: number;
  doneFiles: number;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorFiles: number;
};

type JobFileSummary = {
  totalFiles: number | null;
  importedFiles: number | null;
  failedFiles: number | null;
};

type MarkActiveImportJobsInterruptedDeps = {
  listActiveJobsDetail: () => ActiveJobRow[];
  nowIso: () => string;
  withTransaction: (runner: () => void) => void;
  failActiveFilesByJob: (jobId: string, interruptedAt: string) => void;
  summarizeJobFiles: (jobId: string) => JobFileSummary | undefined;
  normalizeCount: (value: unknown) => number;
  calculateFileBasedProgressPercent: (doneFiles: number, totalFiles: number) => number;
  updateJobFinalFailedInterrupted: (payload: {
    jobId: string;
    progressPercent: number;
    doneFiles: number;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errorFiles: number;
    interruptedAt: string;
  }) => void;
  updateJobFinalRecoveredSuccess: (payload: {
    jobId: string;
    status: 'SUCCESS' | 'PARTIAL_SUCCESS';
    doneFiles: number;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errorFiles: number;
    errorMessage: string | null;
    recoveredAt: string;
  }) => void;
  updateSourceStatusFailed: (sourceId: string, interruptedAt: string) => void;
};

export const markActiveImportJobsAsInterruptedCore = (deps: MarkActiveImportJobsInterruptedDeps): void => {
  const activeJobs = deps.listActiveJobsDetail();
  if (!activeJobs.length) {
    return;
  }

  const interruptedAt = deps.nowIso();
  deps.withTransaction(() => {
    const touchedSources = new Set<string>();
    activeJobs.forEach((job) => {
      const fileSummary = deps.summarizeJobFiles(job.id);
      const totalFiles = Math.max(deps.normalizeCount(job.totalFiles), deps.normalizeCount(fileSummary?.totalFiles ?? 0));
      const importedFiles = deps.normalizeCount(fileSummary?.importedFiles ?? 0);
      const failedFiles = deps.normalizeCount(fileSummary?.failedFiles ?? 0);
      const completedFiles = importedFiles + failedFiles;
      const isCompletedFinalizingJob =
        job.stage === 'FINALIZING' &&
        job.sourceStatus === 'READY' &&
        totalFiles > 0 &&
        importedFiles > 0 &&
        completedFiles >= totalFiles &&
        deps.normalizeCount(job.doneFiles) >= totalFiles;
      if (isCompletedFinalizingJob) {
        deps.updateJobFinalRecoveredSuccess({
          jobId: job.id,
          doneFiles: totalFiles,
          totalRows: deps.normalizeCount(job.totalRows),
          importedRows: deps.normalizeCount(job.importedRows),
          skippedRows: deps.normalizeCount(job.skippedRows),
          errorFiles: failedFiles,
          status: failedFiles > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
          errorMessage: failedFiles > 0 ? 'LOCAL_DATA_IMPORT_PARTIAL_FAILED' : null,
          recoveredAt: interruptedAt,
        });
        return;
      }

      touchedSources.add(job.sourceId);
      deps.failActiveFilesByJob(job.id, interruptedAt);
      const doneFiles = Math.min(totalFiles, importedFiles + failedFiles);
      deps.updateJobFinalFailedInterrupted({
        jobId: job.id,
        progressPercent: deps.calculateFileBasedProgressPercent(doneFiles, totalFiles),
        doneFiles,
        totalRows: deps.normalizeCount(job.totalRows),
        importedRows: deps.normalizeCount(job.importedRows),
        skippedRows: deps.normalizeCount(job.skippedRows),
        errorFiles: Math.max(deps.normalizeCount(job.errorFiles), failedFiles),
        interruptedAt
      });
    });
    touchedSources.forEach((sourceId) => {
      deps.updateSourceStatusFailed(sourceId, interruptedAt);
    });
  });
};
