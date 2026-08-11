// SPDX-License-Identifier: GPL-3.0-only

type ActiveJobRow = { id: string };

export const createDataSourceRuntimeLifecycle = ({
  previewSessionTtlMs,
  cleanupPreviewSessions,
  clearPreviewSessions,
  markActiveJobsAsInterrupted,
  pruneRetainedImportJobs,
  cleanupStaleImportUploadTempFiles,
  cleanupUntrackedImportUploadTempFiles,
  stopTabularDuckDbRuntime,
}: {
  previewSessionTtlMs: number;
  cleanupPreviewSessions: () => void;
  clearPreviewSessions: () => void;
  markActiveJobsAsInterrupted: () => void;
  pruneRetainedImportJobs: () => void;
  cleanupStaleImportUploadTempFiles: () => Promise<void>;
  cleanupUntrackedImportUploadTempFiles: () => Promise<void>;
  stopTabularDuckDbRuntime: () => Promise<void>;
}) => {
  let runtimeStarted = false;
  let previewCleanupTimer: NodeJS.Timeout | null = null;
  let startupCleanupPromise: Promise<void> | null = null;

  const runStartupCleanup = (): Promise<void> =>
    Promise.allSettled([
      cleanupStaleImportUploadTempFiles(),
      cleanupUntrackedImportUploadTempFiles(),
    ]).then(() => undefined);

  const startDataSourceRuntime = (): void => {
    if (runtimeStarted) {
      return;
    }
    runtimeStarted = true;
    if (!previewCleanupTimer) {
      previewCleanupTimer = setInterval(() => {
        cleanupPreviewSessions();
      }, Math.min(previewSessionTtlMs, 60 * 1000));
      previewCleanupTimer.unref?.();
    }
    clearPreviewSessions();
    markActiveJobsAsInterrupted();
    pruneRetainedImportJobs();
    startupCleanupPromise = runStartupCleanup().finally(() => {
      startupCleanupPromise = null;
    });
  };

  const stopDataSourceRuntime = async (): Promise<void> => {
    runtimeStarted = false;
    if (previewCleanupTimer) {
      clearInterval(previewCleanupTimer);
      previewCleanupTimer = null;
    }
    await startupCleanupPromise;
    await stopTabularDuckDbRuntime();
  };

  return {
    startDataSourceRuntime,
    stopDataSourceRuntime,
  };
};

export const recoverStaleActiveImportJobsIfNeeded = ({
  listActiveJobs,
  hasImportJobControlState,
  markActiveJobsAsInterrupted,
}: {
  listActiveJobs: () => ActiveJobRow[];
  hasImportJobControlState: (jobId: string) => boolean;
  markActiveJobsAsInterrupted: () => void;
}): void => {
  const activeJobs = listActiveJobs();
  if (!activeJobs.length) {
    return;
  }
  const hasRuntimeControlledJob = activeJobs.some((job) =>
    hasImportJobControlState(String(job.id ?? '').trim()),
  );
  if (hasRuntimeControlledJob) {
    return;
  }
  markActiveJobsAsInterrupted();
};
