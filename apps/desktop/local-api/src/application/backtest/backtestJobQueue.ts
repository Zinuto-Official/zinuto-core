// SPDX-License-Identifier: GPL-3.0-only

type BacktestJobRunner = (batchId: string) => Promise<unknown>;

const queuedBatchIds = new Set<string>();
const pendingBatchIds: string[] = [];
const pendingRunners = new Map<string, BacktestJobRunner>();
let activeBatchId: string | null = null;
let activeRunPromise: Promise<unknown> | null = null;
let drainScheduled = false;
let stopping = false;

const logBacktestJobRunnerFailure = (batchId: string, error: unknown): void => {
  // eslint-disable-next-line no-console
  console.warn('[backtest-job-queue] batch runner failed', {
    batchId,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
};

export const isBacktestBatchQueued = (batchId: string): boolean =>
  queuedBatchIds.has(batchId);

const scheduleQueueDrain = (): void => {
  if (drainScheduled || activeBatchId) {
    return;
  }
  drainScheduled = true;
  queueMicrotask(() => {
    drainScheduled = false;
    if (activeBatchId) {
      return;
    }
    let batchId: string | undefined;
    let runner: BacktestJobRunner | undefined;
    while (pendingBatchIds.length > 0 && !runner) {
      batchId = pendingBatchIds.shift();
      if (batchId) {
        runner = pendingRunners.get(batchId);
        pendingRunners.delete(batchId);
      }
    }
    if (!batchId || !runner) {
      return;
    }
    activeBatchId = batchId;
    const runPromise = Promise.resolve()
      .then(() => runner(batchId))
      .catch((error) => {
        logBacktestJobRunnerFailure(batchId, error);
      })
      .finally(() => {
        queuedBatchIds.delete(batchId);
        activeBatchId = null;
        activeRunPromise = null;
        if (!stopping) {
          scheduleQueueDrain();
        }
      });
    activeRunPromise = runPromise;
  });
};

export const enqueueBacktestBatchRun = (
  batchId: string,
  runner: BacktestJobRunner,
): void => {
  if (stopping || queuedBatchIds.has(batchId)) {
    return;
  }
  queuedBatchIds.add(batchId);
  pendingRunners.set(batchId, runner);
  pendingBatchIds.push(batchId);
  scheduleQueueDrain();
};

export const forgetBacktestBatchRun = (batchId: string): void => {
  if (activeBatchId === batchId) {
    return;
  }
  pendingRunners.delete(batchId);
  queuedBatchIds.delete(batchId);
};

export const getActiveBacktestBatchId = (): string | null => activeBatchId;

export const stopBacktestJobQueue = async (): Promise<void> => {
  stopping = true;
  for (const batchId of pendingBatchIds) {
    queuedBatchIds.delete(batchId);
  }
  pendingBatchIds.length = 0;
  pendingRunners.clear();
  await (activeRunPromise ?? Promise.resolve());
};
