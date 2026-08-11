// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';

const BACKTEST_CANCELLATION_POLL_MS = 25;
const BACKTEST_ABORT_DRAIN_TIMEOUT_MS = 250;

type BacktestAsyncGuardOptions = {
  isCancelled: () => boolean;
  timeoutCode?: string;
  timeoutMs?: number;
  deadlineAt?: number;
  abortDrainTimeoutMs?: number;
  batchId?: string;
};

type BacktestOperationOutcome<T> =
  | { kind: 'fulfilled'; value: T }
  | { kind: 'rejected'; error: unknown };

type BacktestGuardOutcome<T> =
  | { kind: 'operation'; outcome: BacktestOperationOutcome<T> }
  | { kind: 'aborted'; error: Error };

const cancellationError = (batchId?: string): Error =>
  appError('BACKTEST_RUN_CANCELLED', batchId ? { batchId } : undefined);

export const isBacktestCancellationError = (error: unknown): boolean =>
  error instanceof Error && error.message === 'BACKTEST_RUN_CANCELLED';

export const throwIfBacktestOperationCancelled = (
  isCancelled: () => boolean,
  batchId?: string,
): void => {
  if (isCancelled()) {
    throw cancellationError(batchId);
  }
};

export const awaitBacktestOperation = async <T>(
  operation: (signal: AbortSignal) => Promise<T> | T,
  options: BacktestAsyncGuardOptions,
): Promise<T> => {
  throwIfBacktestOperationCancelled(options.isCancelled, options.batchId);
  const timeoutMs = options.deadlineAt !== undefined
    ? Math.max(0, options.deadlineAt - Date.now())
    : options.timeoutMs;
  if (timeoutMs !== undefined && timeoutMs <= 0) {
    throw new Error(options.timeoutCode ?? 'BACKTEST_OPERATION_TIMEOUT');
  }

  let cancellationTimer: NodeJS.Timeout | null = null;
  let timeoutTimer: NodeJS.Timeout | null = null;
  const operationAbortController = new AbortController();
  const abortOperation = (error: Error): void => {
    if (!operationAbortController.signal.aborted) {
      operationAbortController.abort(error);
    }
  };
  const operationOutcome: Promise<BacktestOperationOutcome<T>> = Promise.resolve()
    .then(() => operation(operationAbortController.signal))
    .then(
      (value): BacktestOperationOutcome<T> => ({ kind: 'fulfilled', value }),
      (error: unknown): BacktestOperationOutcome<T> => ({ kind: 'rejected', error }),
    );
  const cancellation = new Promise<BacktestGuardOutcome<T>>((resolve) => {
    cancellationTimer = setInterval(() => {
      if (!options.isCancelled()) {
        return;
      }
      const error = cancellationError(options.batchId);
      abortOperation(error);
      resolve({ kind: 'aborted', error });
    }, BACKTEST_CANCELLATION_POLL_MS);
    cancellationTimer.unref?.();
  });
  const guardedOperations: Array<Promise<BacktestGuardOutcome<T>>> = [
    operationOutcome.then((outcome) => ({ kind: 'operation', outcome })),
    cancellation,
  ];
  if (timeoutMs !== undefined) {
    guardedOperations.push(new Promise<BacktestGuardOutcome<T>>((resolve) => {
      timeoutTimer = setTimeout(() => {
        const error = new Error(options.timeoutCode ?? 'BACKTEST_OPERATION_TIMEOUT');
        abortOperation(error);
        resolve({ kind: 'aborted', error });
      }, timeoutMs);
      timeoutTimer.unref?.();
    }));
  }
  const outcome = await Promise.race(guardedOperations);
  if (cancellationTimer) {
    clearInterval(cancellationTimer);
  }
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }

  if (outcome.kind === 'operation') {
    if (outcome.outcome.kind === 'rejected') {
      throw outcome.outcome.error;
    }
    return outcome.outcome.value;
  }

  const abortDrainTimeoutMs = Math.max(
    0,
    options.abortDrainTimeoutMs ?? BACKTEST_ABORT_DRAIN_TIMEOUT_MS,
  );
  if (abortDrainTimeoutMs > 0) {
    let drainTimer: NodeJS.Timeout | null = null;
    await Promise.race([
      operationOutcome,
      new Promise<void>((resolve) => {
        drainTimer = setTimeout(resolve, abortDrainTimeoutMs);
        drainTimer.unref?.();
      }),
    ]);
    if (drainTimer) {
      clearTimeout(drainTimer);
    }
  }
  throw outcome.error;
};
