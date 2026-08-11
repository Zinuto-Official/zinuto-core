// SPDX-License-Identifier: GPL-3.0-only

export type SourceDiagnosticsLifecycleErrorCode =
  | 'SOURCE_DIAGNOSTICS_INVALIDATED'
  | 'SOURCE_DIAGNOSTICS_STOPPED'
  | 'SOURCE_DIAGNOSTICS_SUSPENDED';

class SourceDiagnosticsLifecycleError extends Error {
  readonly code: SourceDiagnosticsLifecycleErrorCode;

  constructor(code: SourceDiagnosticsLifecycleErrorCode) {
    super(code);
    this.name = 'SourceDiagnosticsLifecycleError';
    this.code = code;
  }
}

export const isSourceDiagnosticsLifecycleError = (
  error: unknown,
): error is Error & { code: SourceDiagnosticsLifecycleErrorCode } =>
  error instanceof SourceDiagnosticsLifecycleError;

export type SourceDiagnosticsTaskContext = {
  signal: AbortSignal;
  epoch: number;
  canPublish: () => boolean;
  assertCanPublish: () => void;
};

export type SourceDiagnosticsQuiesceLease = {
  release: () => void;
};

type ActiveTask = {
  controller: AbortController;
  promise: Promise<unknown>;
};

const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new SourceDiagnosticsLifecycleError(
    'SOURCE_DIAGNOSTICS_INVALIDATED',
  );

export const createSourceDiagnosticsExecutionState = () => {
  const activeTasks = new Map<number, ActiveTask>();
  let nextTaskId = 1;
  let epoch = 0;
  let suspensionDepth = 0;
  let stopped = false;
  let stopPromise: Promise<void> | null = null;

  const canStartTask = (): boolean => !stopped && suspensionDepth === 0;

  const abortActiveTasks = (
    code: SourceDiagnosticsLifecycleErrorCode,
  ): void => {
    const error = new SourceDiagnosticsLifecycleError(code);
    activeTasks.forEach(({ controller }) => {
      if (!controller.signal.aborted) {
        controller.abort(error);
      }
    });
  };

  const waitForIdle = async (): Promise<void> => {
    while (activeTasks.size > 0) {
      await Promise.allSettled(
        [...activeTasks.values()].map(({ promise }) => promise),
      );
    }
  };

  const tryStartTask = <T>(
    execute: (context: SourceDiagnosticsTaskContext) => Promise<T>,
  ): Promise<T> | null => {
    if (!canStartTask()) {
      return null;
    }
    const taskId = nextTaskId;
    nextTaskId += 1;
    const taskEpoch = epoch;
    const controller = new AbortController();
    const canPublish = (): boolean =>
      !stopped &&
      suspensionDepth === 0 &&
      epoch === taskEpoch &&
      !controller.signal.aborted;
    const assertCanPublish = (): void => {
      if (controller.signal.aborted) {
        throw abortError(controller.signal);
      }
      if (!canPublish()) {
        throw new SourceDiagnosticsLifecycleError(
          'SOURCE_DIAGNOSTICS_INVALIDATED',
        );
      }
    };
    const promise = Promise.resolve().then(() =>
      execute({
        signal: controller.signal,
        epoch: taskEpoch,
        canPublish,
        assertCanPublish,
      }),
    );
    activeTasks.set(taskId, { controller, promise });
    void promise.then(
      () => {
        activeTasks.delete(taskId);
      },
      () => {
        activeTasks.delete(taskId);
      },
    );
    return promise;
  };

  const startTask = <T>(
    execute: (context: SourceDiagnosticsTaskContext) => Promise<T>,
  ): Promise<T> => {
    const task = tryStartTask(execute);
    if (task) {
      return task;
    }
    return Promise.reject(
      new SourceDiagnosticsLifecycleError(
        stopped
          ? 'SOURCE_DIAGNOSTICS_STOPPED'
          : 'SOURCE_DIAGNOSTICS_SUSPENDED',
      ),
    );
  };

  const invalidate = (): void => {
    epoch += 1;
    abortActiveTasks('SOURCE_DIAGNOSTICS_INVALIDATED');
  };

  const acquireQuiesceLease = async (): Promise<SourceDiagnosticsQuiesceLease> => {
    if (stopped) {
      throw new SourceDiagnosticsLifecycleError('SOURCE_DIAGNOSTICS_STOPPED');
    }
    suspensionDepth += 1;
    epoch += 1;
    abortActiveTasks('SOURCE_DIAGNOSTICS_SUSPENDED');
    await waitForIdle();
    if (stopped) {
      suspensionDepth = Math.max(0, suspensionDepth - 1);
      throw new SourceDiagnosticsLifecycleError('SOURCE_DIAGNOSTICS_STOPPED');
    }
    let released = false;
    return {
      release: () => {
        if (released) {
          return;
        }
        released = true;
        suspensionDepth = Math.max(0, suspensionDepth - 1);
      },
    };
  };

  const stop = (): Promise<void> => {
    if (stopPromise) {
      return stopPromise;
    }
    stopped = true;
    epoch += 1;
    abortActiveTasks('SOURCE_DIAGNOSTICS_STOPPED');
    stopPromise = waitForIdle();
    return stopPromise;
  };

  const getState = () => ({
    activeTaskCount: activeTasks.size,
    epoch,
    stopped,
    suspended: suspensionDepth > 0,
  });

  return {
    tryStartTask,
    startTask,
    invalidate,
    acquireQuiesceLease,
    waitForIdle,
    stop,
    getState,
  };
};
