// SPDX-License-Identifier: GPL-3.0-only

import {
  normalizePreviewLocalDataImportFolderProgress,
  shouldCommitPreviewProgressUpdate,
  type PreviewLocalDataImportFolderProgress,
  type PreviewLocalDataImportFolderProgressReporter,
  type PreviewLocalDataImportFolderProgressStage,
  type PreviewLocalDataImportFolderResult,
  type PreviewProgressCommitState,
} from './folderPreview.js';
import { normalizeCount, normalizeProgressPercent } from './importProgress.js';
import type { LocalDataImportDraftValidation } from './importDraftValidation.js';
import type { PreviewImportSessionStore } from '../ports/infrastructure/db/dataSource/previewSessionStore.js';
import { appError, isAppError } from '../../kernel/appError.js';
import {
  getActiveLocalDataImportPreviewExecutionCount,
  hasActiveLocalDataImportPreviewExecutions,
  isLocalDataImportPreviewRuntimeStopping,
  stopActiveLocalDataImportPreviewExecutions,
  tryReserveLocalDataImportPreviewExecution,
} from './importPreviewExecutionState.js';

export type PreviewLocalDataImportFolderApiResult = Omit<
  PreviewLocalDataImportFolderResult,
  'plans'
> & {
  previewToken: string;
  draftValidation: LocalDataImportDraftValidation;
};

type LocalDataImportPreviewJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
type LocalDataImportPreviewJobStage =
  | 'QUEUED'
  | PreviewLocalDataImportFolderProgressStage;
type LocalDataImportPreviewJobErrorArgs = Record<
  string,
  string | number | boolean | null
>;

export type LocalDataImportPreviewJobDetail = {
  id: string;
  status: LocalDataImportPreviewJobStatus;
  stage: LocalDataImportPreviewJobStage;
  progressPercent: number;
  processedFiles: number;
  totalFiles: number;
  result: PreviewLocalDataImportFolderApiResult | null;
  errorMessage: string | null;
  errorCode: string | null;
  errorArgs: LocalDataImportPreviewJobErrorArgs | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type StoredLocalDataImportPreviewJob = LocalDataImportPreviewJobDetail & {
  createdAtMs: number;
  finishedAtMs: number | null;
};

type CreateLocalDataImportPreviewJobServiceOptions = {
  normalizeImportFilePath: (path: string) => string;
  assertManagedImportTempPath: (path: string) => void;
  assertLocalImportPreviewAccess: (sourceId: string) => Promise<void>;
  previewLocalDataImportFolder: (
    folderPathRaw: string,
    sourceIdRaw?: string,
    localeRaw?: string,
    sourceFolderNameRaw?: string,
    onProgress?: PreviewLocalDataImportFolderProgressReporter,
    signal?: AbortSignal,
  ) => Promise<PreviewLocalDataImportFolderApiResult>;
  previewImportSessionStore: PreviewImportSessionStore;
  readDistinctFilePaths: (rows: Array<{ filePath: string | null }>) => string[];
  listAllFilePaths: () => Array<{ filePath: string | null }>;
  acquireImportTempDirLease: (paths: string[]) => () => void;
  removeImportTempDirsByPath: (dirPaths: string[]) => Promise<void>;
  createId: () => string;
  nowIso: () => string;
  previewDeadlineMs?: number;
  maxConcurrentPreviewJobs?: number;
  isSystemResetRunning?: () => boolean;
};

const LOCAL_DATA_IMPORT_PREVIEW_JOB_RETENTION_MS = 30 * 60 * 1000;
const LOCAL_DATA_IMPORT_PREVIEW_JOB_LIMIT = 100;

const toLocalDataImportPreviewJobDetail = (
  job: StoredLocalDataImportPreviewJob,
): LocalDataImportPreviewJobDetail => ({
  id: job.id,
  status: job.status,
  stage: job.stage,
  progressPercent: normalizeProgressPercent(job.progressPercent),
  processedFiles: normalizeCount(job.processedFiles),
  totalFiles: normalizeCount(job.totalFiles),
  result: job.result,
  errorMessage: job.errorMessage,
  errorCode: job.errorCode,
  errorArgs: job.errorArgs,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
});

const toLocalDataImportPreviewJobError = (
  error: unknown,
): Pick<
  LocalDataImportPreviewJobDetail,
  'errorMessage' | 'errorCode' | 'errorArgs'
> => {
  if (isAppError(error)) {
    return {
      errorMessage: error.code,
      errorCode: error.code,
      errorArgs: error.args ?? null,
    };
  }
  return {
    errorMessage: 'LOCAL_DATA_IMPORT_PREVIEW_FAILED',
    errorCode: 'LOCAL_DATA_IMPORT_PREVIEW_FAILED',
    errorArgs: null,
  };
};

export const createLocalDataImportPreviewJobService = ({
  normalizeImportFilePath,
  assertManagedImportTempPath,
  assertLocalImportPreviewAccess,
  previewLocalDataImportFolder,
  previewImportSessionStore,
  readDistinctFilePaths,
  listAllFilePaths,
  acquireImportTempDirLease,
  removeImportTempDirsByPath,
  createId,
  nowIso,
  previewDeadlineMs: previewDeadlineMsRaw,
  maxConcurrentPreviewJobs: maxConcurrentPreviewJobsRaw,
  isSystemResetRunning = () => false,
}: CreateLocalDataImportPreviewJobServiceOptions) => {
  const previewDeadlineMs = Math.max(
    1,
    Math.floor(Number(previewDeadlineMsRaw ?? 15 * 60 * 1000) || 0),
  );
  const maxConcurrentPreviewJobs = Math.max(
    1,
    Math.floor(Number(maxConcurrentPreviewJobsRaw ?? 2) || 0),
  );
  const localDataImportPreviewJobs = new Map<
    string,
    StoredLocalDataImportPreviewJob
  >();

  const pruneLocalDataImportPreviewJobs = (): void => {
    const nowMs = Date.now();
    for (const [jobId, job] of localDataImportPreviewJobs.entries()) {
      if (
        job.finishedAtMs !== null &&
        nowMs - job.finishedAtMs > LOCAL_DATA_IMPORT_PREVIEW_JOB_RETENTION_MS
      ) {
        localDataImportPreviewJobs.delete(jobId);
      }
    }
    while (localDataImportPreviewJobs.size > LOCAL_DATA_IMPORT_PREVIEW_JOB_LIMIT) {
      const oldestFinished =
        Array.from(localDataImportPreviewJobs.entries())
          .filter(([, job]) => job.finishedAtMs !== null)
          .sort(
            (left, right) =>
              (left[1].finishedAtMs ?? 0) - (right[1].finishedAtMs ?? 0),
          )[0] ?? null;
      const removable = oldestFinished;
      if (!removable) {
        return;
      }
      localDataImportPreviewJobs.delete(removable[0]);
    }
  };

  const updateLocalDataImportPreviewJob = (
    jobId: string,
    updater: (job: StoredLocalDataImportPreviewJob) => void,
  ): void => {
    const job = localDataImportPreviewJobs.get(jobId);
    if (!job) {
      return;
    }
    updater(job);
  };

  const transitionLocalDataImportPreviewJobToTerminal = (
    jobId: string,
    updater: (job: StoredLocalDataImportPreviewJob) => void,
  ): boolean => {
    const job = localDataImportPreviewJobs.get(jobId);
    if (!job || job.status === 'FAILED' || job.status === 'SUCCESS') {
      return false;
    }
    updater(job);
    return true;
  };

  const runLocalDataImportPreviewJob = async (
    jobId: string,
    folderPathRaw: string,
    sourceIdRaw: string,
    localeRaw: string,
    sourceFolderNameRaw: string,
    releaseAcquiredLease: () => void,
    abortController: AbortController,
  ): Promise<void> => {
    const timeoutError = appError(
      'LOCAL_DATA_IMPORT_PREVIEW_TIMEOUT',
      { timeoutMs: previewDeadlineMs },
      408,
    );
    const deadlineTimer = setTimeout(() => {
      const transitioned = transitionLocalDataImportPreviewJobToTerminal(jobId, (job) => {
        const finishedAt = nowIso();
        job.status = 'FAILED';
        job.stage = 'DONE';
        job.errorMessage = timeoutError.code;
        job.errorCode = timeoutError.code;
        job.errorArgs = timeoutError.args ?? null;
        job.finishedAt = finishedAt;
        job.finishedAtMs = Date.now();
      });
      if (transitioned && !abortController.signal.aborted) {
        abortController.abort(timeoutError);
      }
    }, previewDeadlineMs);
    deadlineTimer.unref?.();
    const progressCommitState: PreviewProgressCommitState = {
      lastCommittedAtMs: null,
      lastProgress: null,
    };
    let leaseReleased = false;
    const releaseLease = (): void => {
      if (leaseReleased) {
        return;
      }
      leaseReleased = true;
      releaseAcquiredLease();
    };
    const commitPreviewProgress = (
      progressRaw: PreviewLocalDataImportFolderProgress,
    ): void => {
      const nowMs = Date.now();
      const progress = normalizePreviewLocalDataImportFolderProgress(progressRaw);
      if (!shouldCommitPreviewProgressUpdate(progressCommitState, progress, nowMs)) {
        return;
      }
      updateLocalDataImportPreviewJob(jobId, (job) => {
        if (job.status === 'FAILED' || job.status === 'SUCCESS') {
          return;
        }
        job.status = 'RUNNING';
        job.stage = progress.stage;
        job.progressPercent = progress.progressPercent;
        job.processedFiles = normalizeCount(progress.processedFiles);
        job.totalFiles = normalizeCount(progress.totalFiles);
      });
      progressCommitState.lastCommittedAtMs = nowMs;
      progressCommitState.lastProgress = progress;
    };

    try {
      updateLocalDataImportPreviewJob(jobId, (job) => {
        job.status = 'RUNNING';
        job.stage = 'SCANNING_FILES';
        job.startedAt = nowIso();
        job.progressPercent = 0;
        job.processedFiles = 0;
        job.totalFiles = 0;
      });
      const result = await previewLocalDataImportFolder(
        folderPathRaw,
        sourceIdRaw,
        localeRaw,
        sourceFolderNameRaw,
        (progress: PreviewLocalDataImportFolderProgress) => {
          commitPreviewProgress(progress);
        },
        abortController.signal,
      );
      const transitioned = transitionLocalDataImportPreviewJobToTerminal(jobId, (job) => {
        const finishedAt = nowIso();
        job.status = 'SUCCESS';
        job.stage = 'DONE';
        job.progressPercent = 100;
        job.processedFiles = result.totalFiles;
        job.totalFiles = result.totalFiles;
        job.result = result;
        job.errorMessage = null;
        job.errorCode = null;
        job.errorArgs = null;
        job.finishedAt = finishedAt;
        job.finishedAtMs = Date.now();
      });
      if (!transitioned) {
        previewImportSessionStore.discard(result.previewToken, { cleanupFolder: false });
      }
    } catch (error) {
      const failure = toLocalDataImportPreviewJobError(error);
      transitionLocalDataImportPreviewJobToTerminal(jobId, (job) => {
        const finishedAt = nowIso();
        job.status = 'FAILED';
        job.stage = 'DONE';
        job.errorMessage = failure.errorMessage;
        job.errorCode = failure.errorCode;
        job.errorArgs = failure.errorArgs;
        job.finishedAt = finishedAt;
        job.finishedAtMs = Date.now();
      });
    } finally {
      clearTimeout(deadlineTimer);
      try {
        releaseLease();
      } catch {
        // Terminal job state must not be lost because lease cleanup failed.
      }
      await removeImportTempDirsByPath([folderPathRaw]).catch(() => undefined);
    }
  };

  const startLocalDataImportPreviewJob = async (
    folderPathRaw: string,
    sourceIdRaw = '',
    localeRaw = '',
    sourceFolderNameRaw = '',
  ): Promise<LocalDataImportPreviewJobDetail> => {
    if (isLocalDataImportPreviewRuntimeStopping() || isSystemResetRunning()) {
      throw appError('SYSTEM_RESET_IN_PROGRESS');
    }
    const executionReservation =
      tryReserveLocalDataImportPreviewExecution(maxConcurrentPreviewJobs);
    if (!executionReservation) {
      throw appError(
        'LOCAL_DATA_IMPORT_PREVIEW_BUSY',
        { limit: maxConcurrentPreviewJobs },
        429,
      );
    }
    const abortController = executionReservation.controller;
    let normalizedFolderPath = '';
    let isManagedTempPreviewPath = false;
    let releaseAcquiredLease = (): void => undefined;
    try {
      normalizedFolderPath = normalizeImportFilePath(folderPathRaw);
      try {
        assertManagedImportTempPath(normalizedFolderPath);
        isManagedTempPreviewPath = true;
      } catch {
        isManagedTempPreviewPath = false;
      }
      releaseAcquiredLease = acquireImportTempDirLease([
        normalizedFolderPath,
      ]);
      await assertLocalImportPreviewAccess(sourceIdRaw);
      if (abortController.signal.aborted) {
        throw abortController.signal.reason ??
          appError('LOCAL_DATA_IMPORT_PREVIEW_INTERRUPTED');
      }
      if (isLocalDataImportPreviewRuntimeStopping() || isSystemResetRunning()) {
        throw appError('SYSTEM_RESET_IN_PROGRESS');
      }
      pruneLocalDataImportPreviewJobs();
      if (localDataImportPreviewJobs.size >= LOCAL_DATA_IMPORT_PREVIEW_JOB_LIMIT) {
        throw appError(
          'LOCAL_DATA_IMPORT_PREVIEW_BUSY',
          { limit: LOCAL_DATA_IMPORT_PREVIEW_JOB_LIMIT },
          429,
        );
      }
      const jobId = createId();
      const createdAt = nowIso();
      localDataImportPreviewJobs.set(jobId, {
        id: jobId,
        status: 'QUEUED',
        stage: 'QUEUED',
        progressPercent: 0,
        processedFiles: 0,
        totalFiles: 0,
        result: null,
        errorMessage: null,
        errorCode: null,
        errorArgs: null,
        createdAt,
        startedAt: null,
        finishedAt: null,
        createdAtMs: Date.now(),
        finishedAtMs: null,
      });
      const queuedJob = toLocalDataImportPreviewJobDetail(
        localDataImportPreviewJobs.get(jobId)!,
      );
      const executionPromise = runLocalDataImportPreviewJob(
        jobId,
        normalizedFolderPath,
        sourceIdRaw,
        localeRaw,
        sourceFolderNameRaw,
        releaseAcquiredLease,
        abortController,
      )
        .catch(() => undefined);
      executionReservation.track(executionPromise);
      return queuedJob;
    } catch (error) {
      executionReservation.complete();
      releaseAcquiredLease();
      if (isManagedTempPreviewPath) {
        await removeImportTempDirsByPath([normalizedFolderPath]);
      }
      throw error;
    }
  };

  const getLocalDataImportPreviewJob = (
    jobIdRaw: string,
  ): LocalDataImportPreviewJobDetail => {
    pruneLocalDataImportPreviewJobs();
    const jobId = String(jobIdRaw || '').trim();
    const job = jobId ? localDataImportPreviewJobs.get(jobId) : null;
    if (!job) {
      throw appError('LOCAL_DATA_IMPORT_PREVIEW_EXPIRED', { jobId }, 404);
    }
    return toLocalDataImportPreviewJobDetail(job);
  };

  const discardLocalDataImportPreview = async (
    previewTokenRaw: string,
  ): Promise<void> => {
    const previewToken = String(previewTokenRaw || '').trim();
    if (!previewToken) {
      return;
    }
    const previewPlans = previewImportSessionStore.listPlans(previewToken);
    if (!previewPlans.length) {
      previewImportSessionStore.discard(previewToken, { cleanupFolder: false });
      return;
    }
    const previewFilePaths = readDistinctFilePaths(
      previewPlans.flatMap((plan) =>
        (Array.isArray(plan.files) ? plan.files : []).map((file) => ({
          filePath: String(file.path ?? '').trim()
            ? String(file.path ?? '')
            : null,
        })),
      ),
    );
    const trackedFilePaths = new Set(readDistinctFilePaths(listAllFilePaths()));
    const cleanupFolder = !previewFilePaths.some((filePath) =>
      trackedFilePaths.has(filePath),
    );
    previewImportSessionStore.discard(previewToken, { cleanupFolder });
  };

  const stopLocalDataImportPreviewJobs = async (): Promise<void> => {
    const interruptionError = appError('LOCAL_DATA_IMPORT_PREVIEW_INTERRUPTED');
    await stopActiveLocalDataImportPreviewExecutions(interruptionError);
  };

  return {
    discardLocalDataImportPreview,
    getActiveLocalDataImportPreviewExecutionCount,
    getLocalDataImportPreviewJob,
    hasActiveLocalDataImportPreviewExecutions,
    startLocalDataImportPreviewJob,
    stopLocalDataImportPreviewJobs,
  };
};
