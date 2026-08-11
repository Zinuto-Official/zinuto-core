// SPDX-License-Identifier: GPL-3.0-only

type CreateImportJobQueueInput<T> = {
  concurrency?: number;
  maxQueuedJobs?: number;
  processJob: (job: T) => Promise<void>;
  handleProcessError: (job: T, error: unknown) => Promise<void>;
  onJobSettled?: (job: T) => void;
};

type ImportJobQueue<T> = {
  assertCanEnqueue: () => void;
  enqueue: (job: T) => void;
  findIndex: (predicate: (job: T, index: number) => boolean) => number;
  removeAt: (index: number) => T | undefined;
  stop: () => Promise<void>;
};

const scheduleMacrotask = (runner: () => void): void => {
  if (typeof setImmediate === 'function') {
    setImmediate(runner);
    return;
  }
  setTimeout(runner, 0);
};

export const createImportJobQueue = <T>({
  concurrency = 1,
  maxQueuedJobs = Number.POSITIVE_INFINITY,
  processJob,
  handleProcessError,
  onJobSettled = () => undefined,
}: CreateImportJobQueueInput<T>): ImportJobQueue<T> => {
  const queuedJobs: T[] = [];
  const maxWorkers = Math.max(1, Math.floor(Number(concurrency) || 1));
  const queueLimit = Math.max(0, Math.floor(Number(maxQueuedJobs)));
  let activeWorkers = 0;
  let stopped = false;
  const idleWaiters: Array<() => void> = [];

  const resolveIdleWaitersIfNeeded = (): void => {
    if (activeWorkers > 0) {
      return;
    }
    const waiters = idleWaiters.splice(0);
    waiters.forEach((resolve) => resolve());
  };

  const runWorker = async (): Promise<void> => {
    try {
      while (!stopped && queuedJobs.length > 0) {
        const job = queuedJobs.shift();
        if (!job) {
          continue;
        }
        await new Promise<void>((resolve) => {
          scheduleMacrotask(resolve);
        });
        try {
          try {
            // eslint-disable-next-line no-await-in-loop
            await processJob(job);
          } catch (error) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await handleProcessError(job, error);
            } catch (handlerError) {
              console.error('[local-data-import] import job error handler failed', {
                errorMessage:
                  handlerError instanceof Error
                    ? handlerError.message
                    : String(handlerError),
              });
            }
          }
        } finally {
          try {
            onJobSettled(job);
          } catch (settledError) {
            console.error('[local-data-import] import job settlement hook failed', {
              errorMessage:
                settledError instanceof Error
                  ? settledError.message
                  : String(settledError),
            });
          }
        }
      }
    } finally {
      activeWorkers = Math.max(0, activeWorkers - 1);
      enqueueWorker();
      resolveIdleWaitersIfNeeded();
    }
  };

  const enqueueWorker = (): void => {
    if (stopped) {
      return;
    }
    while (activeWorkers < maxWorkers && queuedJobs.length > 0) {
      activeWorkers += 1;
      scheduleMacrotask(() => {
        void runWorker().catch((error) => {
          console.error('[local-data-import] import job worker failed', {
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        });
      });
    }
  };

  const assertCanEnqueue = (): void => {
    if (stopped) {
      throw new Error('IMPORT_JOB_QUEUE_STOPPED');
    }
    if (queuedJobs.length >= queueLimit) {
      throw new Error('IMPORT_JOB_QUEUE_FULL');
    }
  };

  const enqueue = (job: T): void => {
    assertCanEnqueue();
    queuedJobs.push(job);
    enqueueWorker();
  };

  const findIndex = (predicate: (job: T, index: number) => boolean): number =>
    queuedJobs.findIndex(predicate);

  const removeAt = (index: number): T | undefined => {
    if (index < 0 || index >= queuedJobs.length) {
      return undefined;
    }
    return queuedJobs.splice(index, 1)[0];
  };

  const stop = async (): Promise<void> => {
    stopped = true;
    queuedJobs.length = 0;
    if (activeWorkers <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      idleWaiters.push(resolve);
      resolveIdleWaitersIfNeeded();
    });
  };

  return {
    assertCanEnqueue,
    enqueue,
    findIndex,
    removeAt,
    stop
  };
};
