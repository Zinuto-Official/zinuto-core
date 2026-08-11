// SPDX-License-Identifier: GPL-3.0-only

import { Worker } from 'node:worker_threads';

import type {
  SystemStorageMeasurementWorkerInput,
  SystemStorageMeasurementWorkerMessage,
  SystemStorageMeasurementWorkerResult,
} from './systemStorageMeasurementTypes.js';

const DEFAULT_MEASUREMENT_TIMEOUT_MS = 4_000;

type ActiveMeasurement = {
  worker: Worker;
  promise: Promise<SystemStorageMeasurementWorkerResult>;
  cancel: (error: Error) => void;
};

type MeasurementOutcome =
  | { ok: true; value: SystemStorageMeasurementWorkerResult }
  | { ok: false; error: Error };

let activeMeasurement: ActiveMeasurement | null = null;

const resolveWorkerUrl = (): URL => {
  const currentUrl = new URL(import.meta.url);
  if (!currentUrl.pathname.endsWith('.ts')) {
    return new URL('./systemStorageMeasurementWorker.js', import.meta.url);
  }
  const workerModuleUrl = new URL(
    './systemStorageMeasurementWorker.ts',
    import.meta.url,
  );
  const tsxApiUrl = import.meta.resolve('tsx/esm/api');
  const bootstrapSource = [
    `import { tsImport } from ${JSON.stringify(tsxApiUrl)};`,
    `await tsImport(${JSON.stringify(workerModuleUrl.href)}, import.meta.url);`,
  ].join('\n');
  return new URL(`data:text/javascript,${encodeURIComponent(bootstrapSource)}`);
};

const createAbortError = (): Error => {
  const error = new Error('system storage measurement aborted');
  error.name = 'AbortError';
  return error;
};

const createTimeoutError = (timeoutMs: number): Error => {
  const error = new Error(
    `system storage measurement exceeded ${String(timeoutMs)}ms`,
  );
  error.name = 'SystemStorageMeasurementTimeoutError';
  return error;
};

const startMeasurement = (
  input: SystemStorageMeasurementWorkerInput,
  timeoutMs: number,
): ActiveMeasurement => {
  const worker = new Worker(resolveWorkerUrl(), { workerData: input });
  let settled = false;
  let outcome: MeasurementOutcome | null = null;
  let terminationRequested = false;
  let resolveResult!: (value: SystemStorageMeasurementWorkerResult) => void;
  let rejectResult!: (error: Error) => void;
  const promise = new Promise<SystemStorageMeasurementWorkerResult>(
    (resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    },
  );
  const finishAfterExit = (
    exitOutcome: MeasurementOutcome,
  ): void => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    if (exitOutcome.ok) {
      resolveResult(exitOutcome.value);
    } else {
      rejectResult(exitOutcome.error);
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
    terminateWith(createTimeoutError(timeoutMs));
  }, timeoutMs);
  const task: ActiveMeasurement = {
    worker,
    promise,
    cancel: terminateWith,
  };
  worker.on('message', (message: SystemStorageMeasurementWorkerMessage) => {
    if (terminationRequested) {
      return;
    }
    if (message.type === 'RESULT') {
      outcome = { ok: true, value: message.value };
    } else {
      outcome = { ok: false, error: new Error(message.message) };
    }
  });
  worker.on('error', (error) => {
    if (terminationRequested) {
      return;
    }
    outcome = {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  });
  worker.on('exit', (code) => {
    const exitOutcome =
      outcome ??
      ({
        ok: false,
        error: new Error(
          `system storage measurement worker exited ${String(code)} without a result`,
        ),
      } satisfies MeasurementOutcome);
    if (activeMeasurement === task) {
      activeMeasurement = null;
    }
    finishAfterExit(exitOutcome);
  });
  return task;
};

export const measureSystemStorageUsageInWorker = ({
  input,
  signal,
  timeoutMs = DEFAULT_MEASUREMENT_TIMEOUT_MS,
}: {
  input: SystemStorageMeasurementWorkerInput;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<SystemStorageMeasurementWorkerResult> => {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  const normalizedTimeoutMs = Math.max(1, Math.floor(timeoutMs));
  const task =
    activeMeasurement ?? startMeasurement(input, normalizedTimeoutMs);
  activeMeasurement = task;
  if (!signal) {
    return task.promise;
  }
  const abort = (): void => task.cancel(createAbortError());
  signal.addEventListener('abort', abort, { once: true });
  return task.promise.finally(() => {
    signal.removeEventListener('abort', abort);
  });
};
