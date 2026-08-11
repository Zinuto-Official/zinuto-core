// SPDX-License-Identifier: GPL-3.0-only

import { Worker } from 'node:worker_threads';
import type {
  AutomaticHistoryRetentionResult,
} from '../application/historyRetentionExecution.js';
import type {
  HistoryRetentionApplyResult,
  HistoryRetentionJob,
} from '../domain/historyRetentionTypes.js';
import { isSystemResetExecutionActive } from '../application/trading/resetExecutionState.js';

const AUTOMATIC_HISTORY_RETENTION_WORKER_TIMEOUT_MS = 60_000;
const MANUAL_HISTORY_RETENTION_WORKER_TIMEOUT_MS = 120_000;

type HistoryRetentionWorkerMode = 'AUTOMATIC' | 'MANUAL';
type HistoryRetentionWorkerResult =
  | AutomaticHistoryRetentionResult
  | HistoryRetentionApplyResult;

export type HistoryRetentionWorkerProgress = Pick<
  HistoryRetentionJob,
  'stage' | 'progressPercent'
>;


type WorkerStartInput =
  | { mode: 'AUTOMATIC'; minimumIntervalMs: number }
  | { mode: 'MANUAL' };

type WorkerMessage =
  | { type: 'PROGRESS'; value: HistoryRetentionWorkerProgress }
  | { type: 'RESULT'; value: HistoryRetentionWorkerResult }
  | { type: 'ERROR'; message: string; name?: string };

type ActiveTask = {
  mode: HistoryRetentionWorkerMode;
  worker: Worker;
  promise: Promise<HistoryRetentionWorkerResult>;
  cancel: (error: Error) => void;
};

type TaskOutcome =
  | { ok: true; value: HistoryRetentionWorkerResult }
  | { ok: false; error: Error };

let activeTask: ActiveTask | null = null;

const resolveWorkerUrl = (): URL => {
  const currentUrl = new URL(import.meta.url);
  if (!currentUrl.pathname.endsWith('.ts')) {
    return new URL('./historyRetentionMaintenanceWorker.js', import.meta.url);
  }
  const workerModuleUrl = new URL(
    './historyRetentionMaintenanceWorker.ts',
    import.meta.url,
  );
  const tsxApiUrl = import.meta.resolve('tsx/esm/api');
  const bootstrapSource = [
    `import { tsImport } from ${JSON.stringify(tsxApiUrl)};`,
    `await tsImport(${JSON.stringify(workerModuleUrl.href)}, import.meta.url);`,
  ].join('\n');
  return new URL(`data:text/javascript,${encodeURIComponent(bootstrapSource)}`);
};

const createNamedError = (name: string, message: string): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

const cancellationError = (): Error =>
  createNamedError('AbortError', 'HISTORY_RETENTION_MAINTENANCE_CANCELLED');

const busyError = (): Error =>
  createNamedError(
    'HistoryRetentionMaintenanceBusyError',
    'HISTORY_RETENTION_MAINTENANCE_BUSY',
  );

const resetActiveError = (): Error =>
  createNamedError(
    'SystemResetExecutionActiveError',
    'SYSTEM_RESET_IN_PROGRESS',
  );

const timeoutError = (mode: HistoryRetentionWorkerMode): Error =>
  createNamedError(
    'HistoryRetentionMaintenanceTimeoutError',
    mode === 'MANUAL'
      ? 'HISTORY_RETENTION_JOB_TIMEOUT'
      : 'HISTORY_RETENTION_MAINTENANCE_TIMEOUT',
  );

const normalizeTimeoutMs = (value: number | undefined, fallback: number): number =>
  Math.max(1, Math.floor(Number(value) || fallback));

const startTask = ({
  input,
  timeoutMs,
  onProgress,
}: {
  input: WorkerStartInput;
  timeoutMs: number;
  onProgress?: (progress: HistoryRetentionWorkerProgress) => void;
}): ActiveTask => {
  if (activeTask) {
    throw busyError();
  }
  const mode = input.mode;
  const deadlineAtMs = Date.now() + timeoutMs;
  const worker = new Worker(resolveWorkerUrl(), {
    workerData: { ...input, deadlineAtMs },
  });
  let settled = false;
  let outcome: TaskOutcome | null = null;
  let terminationRequested = false;
  let resolveTask!: (value: HistoryRetentionWorkerResult) => void;
  let rejectTask!: (error: Error) => void;
  const promise = new Promise<HistoryRetentionWorkerResult>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });
  const finishAfterExit = (exitOutcome: TaskOutcome): void => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    if (exitOutcome.ok) {
      resolveTask(exitOutcome.value);
    } else {
      rejectTask(exitOutcome.error);
    }
  };
  const terminateWith = (error: Error): void => {
    if (settled) {
      return;
    }
    outcome = { ok: false, error };
    if (terminationRequested) {
      return;
    }
    terminationRequested = true;
    // The job promise settles only after the worker exit event. Closing the
    // isolated connection rolls back any open SQLite transaction first.
    void worker.terminate().catch((terminationError: unknown) => {
      outcome = {
        ok: false,
        error:
          terminationError instanceof Error
            ? terminationError
            : new Error(String(terminationError)),
      };
    });
  };
  const timeout = setTimeout(() => {
    terminateWith(timeoutError(mode));
  }, Math.max(1, deadlineAtMs - Date.now()));
  const task: ActiveTask = {
    mode,
    worker,
    promise,
    cancel: terminateWith,
  };
  activeTask = task;
  worker.on('message', (message: WorkerMessage) => {
    if (terminationRequested) {
      return;
    }
    if (message.type === 'PROGRESS') {
      try {
        onProgress?.(message.value);
      } catch (error) {
        terminateWith(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      return;
    }
    if (message.type === 'RESULT') {
      outcome = { ok: true, value: message.value };
      return;
    }
    outcome = {
      ok: false,
      error: createNamedError(
        message.name || 'HistoryRetentionMaintenanceWorkerError',
        message.message,
      ),
    };
  });
  worker.on('error', (error) => {
    if (!terminationRequested) {
      outcome = {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  });
  worker.on('exit', (code) => {
    const exitOutcome =
      outcome ??
      ({
        ok: false,
        error: createNamedError(
          'HistoryRetentionMaintenanceWorkerExitError',
          `HISTORY_RETENTION_WORKER_EXIT_${String(code)}`,
        ),
      } satisfies TaskOutcome);
    if (activeTask === task) {
      activeTask = null;
    }
    finishAfterExit(exitOutcome);
  });
  return task;
};

export const hasActiveHistoryRetentionMaintenanceExecution = (): boolean =>
  activeTask !== null;

export const stopHistoryRetentionMaintenanceWorker = async (): Promise<void> => {
  const task = activeTask;
  if (!task) {
    return;
  }
  task.cancel(cancellationError());
  await task.promise.catch(() => undefined);
};

export const runAutomaticHistoryRetentionInWorker = ({
  minimumIntervalMs,
  signal,
}: {
  minimumIntervalMs: number;
  signal: AbortSignal;
}): Promise<AutomaticHistoryRetentionResult> => {
  if (signal.aborted) {
    return Promise.reject(cancellationError());
  }
  if (isSystemResetExecutionActive()) {
    return Promise.reject(resetActiveError());
  }
  if (activeTask?.mode === 'MANUAL') {
    return Promise.reject(busyError());
  }
  const task =
    activeTask ??
    startTask({
      input: {
        mode: 'AUTOMATIC',
        minimumIntervalMs: Math.max(0, Math.floor(minimumIntervalMs)),
      },
      timeoutMs: AUTOMATIC_HISTORY_RETENTION_WORKER_TIMEOUT_MS,
    });
  const abort = (): void => task.cancel(cancellationError());
  signal.addEventListener('abort', abort, { once: true });
  return (task.promise as Promise<AutomaticHistoryRetentionResult>).finally(() => {
    signal.removeEventListener('abort', abort);
  });
};

export const runManualHistoryRetentionInWorker = ({
  onProgress,
  timeoutMs,
}: {
  onProgress?: (progress: HistoryRetentionWorkerProgress) => void;
  timeoutMs?: number;
} = {}): Promise<HistoryRetentionApplyResult> => {
  if (isSystemResetExecutionActive()) {
    return Promise.reject(resetActiveError());
  }
  const task = startTask({
    input: { mode: 'MANUAL' },
    timeoutMs: normalizeTimeoutMs(
      timeoutMs,
      MANUAL_HISTORY_RETENTION_WORKER_TIMEOUT_MS,
    ),
    onProgress,
  });
  return task.promise as Promise<HistoryRetentionApplyResult>;
};
