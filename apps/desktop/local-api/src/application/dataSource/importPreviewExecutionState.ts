// SPDX-License-Identifier: GPL-3.0-only

type ActivePreviewExecution = {
  controller: AbortController;
  settled: Promise<void>;
  resolveSettled: () => void;
};

export type LocalDataImportPreviewExecutionReservation = {
  controller: AbortController;
  complete: () => void;
  track: (promise: Promise<unknown>) => void;
};

const activePreviewExecutions = new Map<number, ActivePreviewExecution>();
let nextExecutionId = 0;
let previewRuntimeStopping = false;

export const getActiveLocalDataImportPreviewExecutionCount = (): number =>
  activePreviewExecutions.size;

export const hasActiveLocalDataImportPreviewExecutions = (): boolean =>
  getActiveLocalDataImportPreviewExecutionCount() > 0;

export const isLocalDataImportPreviewRuntimeStopping = (): boolean =>
  previewRuntimeStopping;

export const tryReserveLocalDataImportPreviewExecution = (
  maxConcurrentExecutions: number,
): LocalDataImportPreviewExecutionReservation | null => {
  const normalizedLimit = Math.max(
    1,
    Math.floor(Number(maxConcurrentExecutions) || 0),
  );
  if (
    previewRuntimeStopping ||
    activePreviewExecutions.size >= normalizedLimit
  ) {
    return null;
  }

  nextExecutionId += 1;
  const executionId = nextExecutionId;
  const controller = new AbortController();
  let resolveSettled = (): void => undefined;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  activePreviewExecutions.set(executionId, {
    controller,
    settled,
    resolveSettled,
  });
  let completed = false;
  const complete = (): void => {
    if (completed) {
      return;
    }
    completed = true;
    const execution = activePreviewExecutions.get(executionId);
    activePreviewExecutions.delete(executionId);
    execution?.resolveSettled();
  };

  return {
    controller,
    complete,
    track: (promise) => {
      void promise.finally(complete).catch(() => undefined);
    },
  };
};

export const stopActiveLocalDataImportPreviewExecutions = async (
  reason: unknown,
): Promise<void> => {
  previewRuntimeStopping = true;
  const executions = Array.from(activePreviewExecutions.values());
  executions.forEach(({ controller }) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  });
  try {
    await Promise.allSettled(executions.map(({ settled }) => settled));
  } finally {
    previewRuntimeStopping = false;
  }
};
