// SPDX-License-Identifier: GPL-3.0-only

type ImportJobControlPublicState = {
  paused: boolean;
  cancelRequested: boolean;
};

type ImportJobControlState = ImportJobControlPublicState & {
  abortController: AbortController;
};

type ImportJobControlGateState = 'CONTINUE' | 'CANCELED';

type ImportJobControlStore = {
  readImportJobControlState: (jobId: string) => ImportJobControlPublicState;
  ensureImportJobControlState: (jobId: string) => ImportJobControlState;
  hasImportJobControlState: (jobId: string) => boolean;
  clearImportJobControlState: (jobId: string) => void;
  getImportJobAbortSignal: (jobId: string) => AbortSignal;
  abortImportJob: (jobId: string, reason: unknown) => void;
  requestCancelImportJob: (jobId: string, reason: unknown) => void;
  requestCancelAllImportJobs: () => void;
  waitForJobControlRelease: (jobId: string, signal?: AbortSignal) => Promise<ImportJobControlGateState>;
};

type CreateImportJobControlStoreInput = {
  pollIntervalMs?: number;
};

export const createImportJobControlStore = ({
  // Reduce timer object churn: 1s interval instead of 220ms avoids ~16k
  // setTimeout callbacks when a job is paused for an hour.
  pollIntervalMs = 1000
}: CreateImportJobControlStoreInput = {}): ImportJobControlStore => {
  const importJobControlStateById = new Map<string, ImportJobControlState>();

  const readImportJobControlState = (jobId: string): ImportJobControlPublicState =>
    importJobControlStateById.get(jobId) ?? {
      paused: false,
      cancelRequested: false
    };

  const ensureImportJobControlState = (jobId: string): ImportJobControlState => {
    const current = importJobControlStateById.get(jobId);
    if (current) {
      return current;
    }
    const next: ImportJobControlState = {
      paused: false,
      cancelRequested: false,
      abortController: new AbortController(),
    };
    importJobControlStateById.set(jobId, next);
    return next;
  };

  const hasImportJobControlState = (jobId: string): boolean => importJobControlStateById.has(jobId);

  const clearImportJobControlState = (jobId: string): void => {
    importJobControlStateById.delete(jobId);
  };

  const getImportJobAbortSignal = (jobId: string): AbortSignal =>
    ensureImportJobControlState(jobId).abortController.signal;

  const abortImportJob = (jobId: string, reason: unknown): void => {
    const state = ensureImportJobControlState(jobId);
    if (!state.abortController.signal.aborted) {
      state.abortController.abort(reason);
    }
  };

  const requestCancelImportJob = (jobId: string, reason: unknown): void => {
    const state = ensureImportJobControlState(jobId);
    state.cancelRequested = true;
    state.paused = false;
    abortImportJob(jobId, reason);
  };

  const requestCancelAllImportJobs = (): void => {
    importJobControlStateById.forEach((_state, jobId) => {
      requestCancelImportJob(jobId, new Error('LOCAL_DATA_IMPORT_JOB_CANCELED'));
    });
  };

  const waitForJobControlRelease = async (
    jobId: string,
    signal?: AbortSignal,
  ): Promise<ImportJobControlGateState> => {
    while (true) {
      const state = readImportJobControlState(jobId);
      if (state.cancelRequested) {
        return 'CANCELED';
      }
      if (signal?.aborted) {
        throw signal.reason ?? new Error('LOCAL_DATA_IMPORT_JOB_ABORTED');
      }
      if (!state.paused) {
        return 'CONTINUE';
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        const timer = setTimeout(finish, pollIntervalMs);
        const abort = (): void => finish();
        function finish(): void {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          resolve();
        }
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) {
          finish();
        }
      });
    }
  };

  return {
    abortImportJob,
    readImportJobControlState,
    ensureImportJobControlState,
    hasImportJobControlState,
    clearImportJobControlState,
    getImportJobAbortSignal,
    requestCancelImportJob,
    requestCancelAllImportJobs,
    waitForJobControlRelease
  };
};
