// SPDX-License-Identifier: GPL-3.0-only

import os from 'node:os';
import { Worker } from 'node:worker_threads';
import type { OhlcvBar } from '../../domain/models.js';
import { appError } from '../../kernel/appError.js';
import {
  type BacktestInstrumentRunOutcome,
  type CompiledBacktestStrategy,
} from './referenceEngineRunner.js';
import {
  toFailedIssue,
} from './backtestSymbolIssues.js';
import type {
  BacktestConfig,
  BacktestInstrumentCandidate,
} from './types.js';
import {
  awaitBacktestOperation,
  isBacktestCancellationError,
} from './backtestAsyncGuard.js';

const BACKTEST_TS_WORKERS_ENV = 'ZINUTO_BACKTEST_TS_WORKERS';
const BACKTEST_WORKER_INIT_TIMEOUT_MS = 15_000;
const BACKTEST_WORKER_TASK_TIMEOUT_MS = 120_000;
const BACKTEST_READ_BARS_TIMEOUT_MS = 30_000;
const BACKTEST_SYSTEM_TIMEOUT_THRESHOLD = 3;

type ReferenceWorkerPoolOptions = {
  config: BacktestConfig;
  candidates: BacktestInstrumentCandidate[];
  strategySource: string;
  compiled: CompiledBacktestStrategy;
  displayName: string;
  readBars: (
    candidate: BacktestInstrumentCandidate,
    signal: AbortSignal,
  ) => Promise<OhlcvBar[]>;
  isCancelled: () => boolean;
  onProgress: (progress: {
    completed: number;
    total: number;
    symbol: string | null;
  }) => void;
};

type WorkerResultMessage = {
  type: 'RESULT';
  taskId: number;
  outcome: BacktestInstrumentRunOutcome;
};

type WorkerErrorMessage = {
  type: 'ERROR';
  taskId: number | null;
  message: string;
};

type WorkerReadyMessage = {
  type: 'READY';
};

type WorkerMessage = WorkerResultMessage | WorkerErrorMessage | WorkerReadyMessage;

type ActiveTask = {
  taskId: number;
  resolve: (outcome: BacktestInstrumentRunOutcome) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export type ReferenceWorkerRunner = {
  readonly closed: boolean;
  run: (input: {
    config: BacktestConfig;
    instrument: BacktestInstrumentCandidate;
    bars: OhlcvBar[];
  }) => Promise<BacktestInstrumentRunOutcome>;
  terminate: () => void;
};

type ReferenceWorkerSlotCreateInput = {
  strategySource: string;
  parameterInputs?: Record<string, string>;
  displayName: string;
  initializationDeadlineAt: number;
  taskTimeoutMs: number;
  isCancelled: () => boolean;
};

export type ReferenceWorkerPoolRuntime = {
  workerInitTimeoutMs?: number;
  workerTaskTimeoutMs?: number;
  readBarsTimeoutMs?: number;
  systemTimeoutThreshold?: number;
  createWorkerSlot?: (
    input: ReferenceWorkerSlotCreateInput,
  ) => Promise<ReferenceWorkerRunner>;
};

const clampWorkerCount = (value: number): number =>
  Math.max(1, Math.min(8, Math.floor(value)));

export const resolveReferenceWorkerCount = (): number => {
  const raw = Number(process.env[BACKTEST_TS_WORKERS_ENV]);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(1, Math.min(32, Math.floor(raw)));
  }
  const detected = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
  return clampWorkerCount(detected - 2);
};

const resolveWorkerUrl = (): URL => {
  const currentUrl = new URL(import.meta.url);
  if (!currentUrl.pathname.endsWith('.ts')) {
    return new URL('./referenceEngineWorker.js', import.meta.url);
  }
  const workerModuleUrl = new URL('./referenceEngineWorker.ts', import.meta.url);
  const tsxApiUrl = import.meta.resolve('tsx/esm/api');
  const bootstrapSource = [
    `import { tsImport } from ${JSON.stringify(tsxApiUrl)};`,
    `await tsImport(${JSON.stringify(workerModuleUrl.href)}, import.meta.url);`,
  ].join('\n');
  return new URL(`data:text/javascript,${encodeURIComponent(bootstrapSource)}`);
};

class ReferenceWorkerSlot {
  #worker: Worker;
  #activeTask: ActiveTask | null = null;
  #nextTaskId = 1;
  #closed = false;
  #taskTimeoutMs: number;

  private constructor(worker: Worker, taskTimeoutMs: number) {
    this.#worker = worker;
    this.#taskTimeoutMs = taskTimeoutMs;
  }

  static async create(input: ReferenceWorkerSlotCreateInput): Promise<ReferenceWorkerSlot> {
    const workerUrl = resolveWorkerUrl();
    const worker = new Worker(workerUrl);
    const slot = new ReferenceWorkerSlot(worker, input.taskTimeoutMs);
    await slot.#initialize(input, input.initializationDeadlineAt, input.isCancelled);
    return slot;
  }

  #initialize(input: {
    strategySource: string;
    parameterInputs?: Record<string, string>;
    displayName: string;
  }, initializationDeadlineAt: number, isCancelled: () => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutMs = Math.max(0, initializationDeadlineAt - Date.now());
      const timeout = setTimeout(() => {
        failInitialization(new Error('BACKTEST_WORKER_INIT_TIMEOUT'));
      }, timeoutMs);
      const cancellationTimer = setInterval(() => {
        if (isCancelled()) {
          failInitialization(appError('BACKTEST_RUN_CANCELLED'));
        }
      }, 25);
      cancellationTimer.unref?.();
      const handleMessage = (message: WorkerMessage): void => {
        if (message.type === 'READY') {
          cleanup();
          this.#wireRuntimeHandlers();
          resolve();
          return;
        }
        if (message.type === 'ERROR') {
          failInitialization(
            new Error(message.message || 'BACKTEST_WORKER_INIT_FAILED'),
          );
        }
      };
      const handleError = (error: Error): void => {
        failInitialization(error);
      };
      const handleExit = (code: number): void => {
        failInitialization(new Error(`BACKTEST_WORKER_EXIT_${code}`));
      };
      const cleanup = (): void => {
        clearTimeout(timeout);
        clearInterval(cancellationTimer);
        this.#worker.off('message', handleMessage);
        this.#worker.off('error', handleError);
        this.#worker.off('exit', handleExit);
      };
      const failInitialization = (error: Error): void => {
        cleanup();
        this.#closed = true;
        void this.#worker.terminate();
        reject(error);
      };
      this.#worker.on('message', handleMessage);
      this.#worker.on('error', handleError);
      this.#worker.on('exit', handleExit);
      this.#worker.postMessage({
        type: 'INIT',
        strategySource: input.strategySource,
        parameterInputs: input.parameterInputs,
        displayName: input.displayName,
      });
    });
  }

  #wireRuntimeHandlers(): void {
    this.#worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'RESULT' && this.#activeTask?.taskId === message.taskId) {
        const activeTask = this.#activeTask;
        this.#activeTask = null;
        clearTimeout(activeTask.timeout);
        activeTask.resolve(message.outcome);
        return;
      }
      if (message.type === 'ERROR' && this.#activeTask) {
        const activeTask = this.#activeTask;
        this.#activeTask = null;
        clearTimeout(activeTask.timeout);
        activeTask.reject(new Error(message.message || 'BACKTEST_WORKER_TASK_FAILED'));
      }
    });
    this.#worker.on('error', (error) => {
      this.#closed = true;
      this.#rejectActive(error instanceof Error ? error : new Error(String(error)));
    });
    this.#worker.on('exit', (code) => {
      this.#closed = true;
      this.#rejectActive(new Error(`BACKTEST_WORKER_EXIT_${code}`));
    });
  }

  #rejectActive(error: Error): void {
    if (!this.#activeTask) {
      return;
    }
    const activeTask = this.#activeTask;
    this.#activeTask = null;
    clearTimeout(activeTask.timeout);
    activeTask.reject(error);
  }

  get closed(): boolean {
    return this.#closed;
  }

  run(input: {
    config: BacktestConfig;
    instrument: BacktestInstrumentCandidate;
    bars: OhlcvBar[];
  }): Promise<BacktestInstrumentRunOutcome> {
    if (this.#closed) {
      return Promise.reject(new Error('BACKTEST_WORKER_CLOSED'));
    }
    if (this.#activeTask) {
      return Promise.reject(new Error('BACKTEST_WORKER_BUSY'));
    }
    const taskId = this.#nextTaskId;
    this.#nextTaskId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.#activeTask?.taskId !== taskId) {
          return;
        }
        const activeTask = this.#activeTask;
        this.#activeTask = null;
        this.#closed = true;
        void this.#worker.terminate();
        activeTask.reject(new Error('BACKTEST_WORKER_TASK_TIMEOUT'));
      }, this.#taskTimeoutMs);
      this.#activeTask = { taskId, resolve, reject, timeout };
      this.#worker.postMessage({
        type: 'TASK',
        taskId,
        config: input.config,
        instrument: input.instrument,
        bars: input.bars,
      });
    });
  }

  terminate(): void {
    this.#closed = true;
    this.#rejectActive(new Error('BACKTEST_WORKER_TERMINATED'));
    void this.#worker.terminate();
  }
}

const runWorkerTaskWithCancellation = async (
  slot: ReferenceWorkerRunner,
  input: Parameters<ReferenceWorkerRunner['run']>[0],
  isCancelled: () => boolean,
): Promise<BacktestInstrumentRunOutcome> => {
  try {
    return await awaitBacktestOperation(
      () => slot.run(input),
      { isCancelled },
    );
  } finally {
    if (isCancelled()) {
      slot.terminate();
    }
  }
};

const normalizePositiveRuntimeValue = (
  value: number | undefined,
  fallback: number,
): number => Number.isFinite(value) && Number(value) > 0
  ? Math.max(1, Math.floor(Number(value)))
  : fallback;

const isSystemTimeoutError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('_TIMEOUT');

export const runReferenceBatchParallel = async (
  options: ReferenceWorkerPoolOptions,
  runtime: ReferenceWorkerPoolRuntime = {},
): Promise<BacktestInstrumentRunOutcome[]> => {
  const workerCount = resolveReferenceWorkerCount();
  if (options.candidates.length === 0) {
    return [];
  }

  const workerInitTimeoutMs = normalizePositiveRuntimeValue(
    runtime.workerInitTimeoutMs,
    BACKTEST_WORKER_INIT_TIMEOUT_MS,
  );
  const workerTaskTimeoutMs = normalizePositiveRuntimeValue(
    runtime.workerTaskTimeoutMs,
    BACKTEST_WORKER_TASK_TIMEOUT_MS,
  );
  const readBarsTimeoutMs = normalizePositiveRuntimeValue(
    runtime.readBarsTimeoutMs,
    BACKTEST_READ_BARS_TIMEOUT_MS,
  );
  const systemTimeoutThreshold = normalizePositiveRuntimeValue(
    runtime.systemTimeoutThreshold,
    BACKTEST_SYSTEM_TIMEOUT_THRESHOLD,
  );
  const createWorkerSlot = runtime.createWorkerSlot ?? ReferenceWorkerSlot.create;
  const outcomes = new Array<BacktestInstrumentRunOutcome | undefined>(options.candidates.length);
  const liveSlots = new Set<ReferenceWorkerRunner>();
  const terminateLiveSlots = (): void => {
    liveSlots.forEach((slot) => slot.terminate());
    liveSlots.clear();
  };
  const createSlot = async (initializationDeadlineAt: number): Promise<ReferenceWorkerRunner> => {
    const slot = await awaitBacktestOperation(
      () => createWorkerSlot({
        strategySource: options.strategySource,
        parameterInputs: options.config.parameterInputs,
        displayName: options.displayName,
        initializationDeadlineAt,
        taskTimeoutMs: workerTaskTimeoutMs,
        isCancelled: options.isCancelled,
      }),
      {
        isCancelled: options.isCancelled,
        deadlineAt: initializationDeadlineAt,
        timeoutCode: 'BACKTEST_WORKER_INIT_TIMEOUT',
      },
    );
    liveSlots.add(slot);
    return slot;
  };
  const initialWorkerCount = Math.min(workerCount, options.candidates.length);
  const sharedInitializationDeadlineAt = Date.now() + workerInitTimeoutMs;
  const initializationResults = await Promise.allSettled(
    Array.from(
      { length: initialWorkerCount },
      () => createSlot(sharedInitializationDeadlineAt),
    ),
  );
  const initializationFailure = initializationResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (initializationFailure) {
    terminateLiveSlots();
    throw initializationFailure.reason;
  }
  const initialSlots = initializationResults.map(
    (result) => (result as PromiseFulfilledResult<ReferenceWorkerRunner>).value,
  );

  let nextIndex = 0;
  let completed = 0;
  let systemTimeoutCount = 0;
  let fatalError: Error | null = null;
  const abortForSystemTimeouts = (error: unknown): Error | null => {
    if (!isSystemTimeoutError(error)) {
      return null;
    }
    systemTimeoutCount += 1;
    if (systemTimeoutCount < systemTimeoutThreshold) {
      return null;
    }
    fatalError = new Error('BACKTEST_SYSTEM_TIMEOUT_THRESHOLD');
    terminateLiveSlots();
    return fatalError;
  };
  const nextCandidateIndex = (): number | null => {
    if (
      nextIndex >= options.candidates.length ||
      options.isCancelled() ||
      fatalError
    ) {
      return null;
    }
    const index = nextIndex;
    nextIndex += 1;
    return index;
  };

  const runSlotLoop = async (slot: ReferenceWorkerRunner): Promise<void> => {
    let currentSlot: ReferenceWorkerRunner = slot;
    try {
      while (true) {
        const index = nextCandidateIndex();
        if (index === null) {
          break;
        }
        const candidate = options.candidates[index]!;
        let outcomeCompleted = false;
        try {
          const bars = await awaitBacktestOperation(
            (signal) => options.readBars(candidate, signal),
            {
              isCancelled: options.isCancelled,
              timeoutCode: 'BACKTEST_READ_BARS_TIMEOUT',
              timeoutMs: readBarsTimeoutMs,
            },
          );
          outcomes[index] = await runWorkerTaskWithCancellation(currentSlot, {
            config: options.config,
            instrument: candidate,
            bars,
          }, options.isCancelled);
          outcomeCompleted = true;
        } catch (error) {
          if (isBacktestCancellationError(error) || options.isCancelled()) {
            throw appError('BACKTEST_RUN_CANCELLED');
          }
          if (fatalError) {
            throw fatalError;
          }
          const timeoutFatal = abortForSystemTimeouts(error);
          if (timeoutFatal) {
            throw timeoutFatal;
          }
          outcomes[index] = {
            status: 'FAILED',
            issue: toFailedIssue(
              candidate,
              'RUNTIME_ERROR',
              error instanceof Error ? error.message.slice(0, 240) : 'BACKTEST_WORKER_FAILED',
            ),
          };
          outcomeCompleted = true;
          if (currentSlot.closed) {
            liveSlots.delete(currentSlot);
            currentSlot = await createSlot(Date.now() + workerInitTimeoutMs);
          }
        } finally {
          if (outcomeCompleted) {
            completed += 1;
            options.onProgress({
              completed,
              total: options.candidates.length,
              symbol: candidate.symbol,
            });
          }
        }
      }
    } finally {
      liveSlots.delete(currentSlot);
      currentSlot.terminate();
    }
  };

  try {
    await Promise.all(initialSlots.map((slot) => runSlotLoop(slot)));
  } finally {
    terminateLiveSlots();
  }
  if (options.isCancelled()) {
    throw appError('BACKTEST_RUN_CANCELLED');
  }
  if (fatalError) {
    throw fatalError;
  }
  return outcomes.flatMap((outcome) => outcome ? [outcome] : []);
};
