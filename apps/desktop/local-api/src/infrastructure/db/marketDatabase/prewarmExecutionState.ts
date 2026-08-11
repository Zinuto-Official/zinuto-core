// SPDX-License-Identifier: GPL-3.0-only

export type MarketPrewarmLifecycleErrorCode =
  | 'MARKET_PREWARM_INVALIDATED'
  | 'MARKET_PREWARM_STOPPED'
  | 'MARKET_PREWARM_SUSPENDED';

class MarketPrewarmLifecycleError extends Error {
  readonly code: MarketPrewarmLifecycleErrorCode;

  constructor(code: MarketPrewarmLifecycleErrorCode) {
    super(code);
    this.name = 'MarketPrewarmLifecycleError';
    this.code = code;
  }
}

export type MarketPrewarmTaskContext = {
  signal: AbortSignal;
  epoch: number;
  canPublish: () => boolean;
  assertCanPublish: () => void;
};

export type MarketPrewarmQuiesceLease = {
  release: () => void;
};

type PendingTask = {
  epoch: number;
  execute: (context: MarketPrewarmTaskContext) => Promise<void>;
};

type ActiveTask = {
  controller: AbortController;
  key: string;
  promise: Promise<void>;
};

const pendingTasks = new Map<string, PendingTask>();
const activeTasks = new Map<number, ActiveTask>();
const idleWaiters: Array<() => void> = [];
let activeTaskSequence = 0;
let blocker: (() => boolean) | null = null;
let epoch = 0;
let pumping = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let suspensionDepth = 0;
let stopPromise: Promise<void> | null = null;

const BLOCKED_RETRY_MS = 1000;

const lifecycleError = (
  code: MarketPrewarmLifecycleErrorCode,
): MarketPrewarmLifecycleError => new MarketPrewarmLifecycleError(code);

const isBlocked = (): boolean => {
  if (!blocker) {
    return false;
  }
  try {
    return Boolean(blocker());
  } catch {
    return false;
  }
};

const isIdle = (): boolean =>
  !pumping &&
  !retryTimer &&
  pendingTasks.size === 0 &&
  activeTasks.size === 0;

const resolveIdleWaitersIfIdle = (): void => {
  if (!isIdle()) {
    return;
  }
  idleWaiters.splice(0).forEach((resolve) => resolve());
};

const clearRetryTimer = (): void => {
  if (!retryTimer) {
    return;
  }
  clearTimeout(retryTimer);
  retryTimer = null;
};

const abortActiveTasks = (code: MarketPrewarmLifecycleErrorCode): void => {
  const error = lifecycleError(code);
  activeTasks.forEach(({ controller }) => {
    if (!controller.signal.aborted) {
      controller.abort(error);
    }
  });
};

const schedulePump = (delayMs = 0): void => {
  if (
    stopped ||
    suspensionDepth > 0 ||
    pumping ||
    retryTimer ||
    pendingTasks.size === 0
  ) {
    resolveIdleWaitersIfIdle();
    return;
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void pumpMarketPrewarmTasks();
  }, Math.max(0, Math.floor(Number(delayMs) || 0)));
  retryTimer.unref?.();
};

const pumpMarketPrewarmTasks = async (): Promise<void> => {
  if (pumping || stopped || suspensionDepth > 0) {
    resolveIdleWaitersIfIdle();
    return;
  }
  if (isBlocked()) {
    schedulePump(BLOCKED_RETRY_MS);
    return;
  }
  pumping = true;
  try {
    while (!stopped && suspensionDepth === 0 && pendingTasks.size > 0) {
      if (isBlocked()) {
        schedulePump(BLOCKED_RETRY_MS);
        break;
      }
      const next = pendingTasks.entries().next().value as
        | [string, PendingTask]
        | undefined;
      if (!next) {
        break;
      }
      const [key, task] = next;
      pendingTasks.delete(key);
      if (task.epoch !== epoch) {
        continue;
      }

      activeTaskSequence += 1;
      const taskId = activeTaskSequence;
      const controller = new AbortController();
      const canPublish = (): boolean =>
        !stopped &&
        suspensionDepth === 0 &&
        epoch === task.epoch &&
        !controller.signal.aborted;
      const assertCanPublish = (): void => {
        if (controller.signal.aborted) {
          throw controller.signal.reason ?? lifecycleError('MARKET_PREWARM_INVALIDATED');
        }
        if (!canPublish()) {
          throw lifecycleError('MARKET_PREWARM_INVALIDATED');
        }
      };
      const promise = Promise.resolve().then(() =>
        task.execute({
          signal: controller.signal,
          epoch: task.epoch,
          canPublish,
          assertCanPublish,
        }),
      );
      activeTasks.set(taskId, { controller, key, promise });
      try {
        await promise;
      } catch {
        // Background warmups are opportunistic. Their callers own diagnostics.
      } finally {
        activeTasks.delete(taskId);
      }
    }
  } finally {
    pumping = false;
    if (
      pendingTasks.size > 0 &&
      !stopped &&
      suspensionDepth === 0 &&
      !retryTimer
    ) {
      schedulePump(isBlocked() ? BLOCKED_RETRY_MS : 0);
    }
    resolveIdleWaitersIfIdle();
  }
};

export const scheduleMarketPrewarmTask = (
  keyRaw: string,
  execute: (context: MarketPrewarmTaskContext) => Promise<void>,
): boolean => {
  const key = String(keyRaw ?? '').trim();
  if (!key || stopped || suspensionDepth > 0) {
    return false;
  }
  pendingTasks.set(key, { epoch, execute });
  schedulePump();
  return true;
};

export const setMarketPrewarmBlocker = (
  nextBlocker: (() => boolean) | null,
): void => {
  blocker = nextBlocker;
  if (!isBlocked()) {
    clearRetryTimer();
    schedulePump();
  }
};

export const waitForMarketPrewarmIdle = async (): Promise<void> => {
  if (isIdle()) {
    return;
  }
  await new Promise<void>((resolve) => {
    idleWaiters.push(resolve);
  });
};

const beginQuiesce = (
  code: MarketPrewarmLifecycleErrorCode,
): void => {
  epoch += 1;
  clearRetryTimer();
  pendingTasks.clear();
  abortActiveTasks(code);
};

export const acquireMarketPrewarmExecutionQuiesceLease = async (
): Promise<MarketPrewarmQuiesceLease> => {
  if (stopped) {
    throw lifecycleError('MARKET_PREWARM_STOPPED');
  }
  suspensionDepth += 1;
  beginQuiesce('MARKET_PREWARM_SUSPENDED');
  await waitForMarketPrewarmIdle();
  if (stopped) {
    suspensionDepth = Math.max(0, suspensionDepth - 1);
    throw lifecycleError('MARKET_PREWARM_STOPPED');
  }
  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      suspensionDepth = Math.max(0, suspensionDepth - 1);
      schedulePump();
    },
  };
};

export const invalidateMarketPrewarmExecutionState = async (): Promise<void> => {
  beginQuiesce('MARKET_PREWARM_INVALIDATED');
  await waitForMarketPrewarmIdle();
};

export const stopMarketPrewarmExecutionState = (): Promise<void> => {
  if (stopPromise) {
    return stopPromise;
  }
  stopped = true;
  beginQuiesce('MARKET_PREWARM_STOPPED');
  blocker = null;
  stopPromise = waitForMarketPrewarmIdle();
  return stopPromise;
};

export const getMarketPrewarmExecutionState = () => ({
  activeKeys: Array.from(activeTasks.values(), ({ key }) => key),
  activeTaskCount: activeTasks.size,
  epoch,
  idleWaiterCount: idleWaiters.length,
  pendingKeys: Array.from(pendingTasks.keys()),
  pumping,
  scheduled: Boolean(retryTimer),
  stopped,
  suspended: suspensionDepth > 0,
});

export const drainMarketPrewarmTasks = async (): Promise<void> => {
  clearRetryTimer();
  await pumpMarketPrewarmTasks();
};

export const resetMarketPrewarmExecutionState = (): void => {
  clearRetryTimer();
  pendingTasks.clear();
  activeTasks.clear();
  idleWaiters.splice(0).forEach((resolve) => resolve());
  blocker = null;
  epoch = 0;
  pumping = false;
  stopped = false;
  suspensionDepth = 0;
  stopPromise = null;
};
