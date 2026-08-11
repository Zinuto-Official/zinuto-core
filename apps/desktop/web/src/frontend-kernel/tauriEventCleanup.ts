// SPDX-License-Identifier: GPL-3.0-only

export type TauriUnlistenFn = () => unknown;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as PromiseLike<unknown>).then === "function";

export const runTauriUnlistenSafely = (
  unlisten: TauriUnlistenFn | null | undefined,
): void => {
  if (typeof unlisten !== "function") {
    return;
  }
  try {
    const result = unlisten();
    if (isPromiseLike(result)) {
      void result.then(undefined, () => undefined);
    }
  } catch {
    // Tauri unregisters frontend listeners synchronously before native cleanup.
  }
};

export const createTauriUnlistenCleanup = (
  unlisten: TauriUnlistenFn | null | undefined,
): (() => void) => {
  let disposed = false;
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    runTauriUnlistenSafely(unlisten);
  };
};

export const installTauriListenerWithinDeadline = (
  install: () => Promise<TauriUnlistenFn>,
  listenerName: string,
  deadlineMs: number,
): Promise<TauriUnlistenFn> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timerId = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`TAURI_LISTENER_${listenerName}_TIMEOUT`));
    }, Math.max(0, deadlineMs));

    Promise.resolve()
      .then(install)
      .then(
        (unlisten) => {
          if (settled) {
            // A native listener that registers after its caller has already
            // timed out must not remain as an invisible duplicate.
            runTauriUnlistenSafely(unlisten);
            return;
          }
          settled = true;
          globalThis.clearTimeout(timerId);
          resolve(unlisten);
        },
        (error) => {
          if (settled) {
            return;
          }
          settled = true;
          globalThis.clearTimeout(timerId);
          reject(error);
        },
      );
  });

/**
 * Tauri can accept an event subscription only after its native event bridge
 * becomes responsive. A cold desktop start may therefore exceed one bounded
 * registration attempt even though the next attempt succeeds. Keep the
 * deadline, but retry a small, explicit number of times so secondary-window
 * actions do not fail permanently on that transient startup race.
 */
export const installTauriListenerWithRetry = async (
  install: () => Promise<TauriUnlistenFn>,
  listenerName: string,
  deadlineMs: number,
  maxAttempts = 2,
): Promise<TauriUnlistenFn> => {
  const attempts = Math.max(1, Math.trunc(maxAttempts));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await installTauriListenerWithinDeadline(
        install,
        listenerName,
        deadlineMs,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

export const settleTauriTaskWithinDeadline = <T,>(
  task: Promise<T>,
  taskName: string,
  deadlineMs: number,
): Promise<T> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timerId = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`TAURI_TASK_${taskName}_TIMEOUT`));
    }, Math.max(0, deadlineMs));
    task.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        globalThis.clearTimeout(timerId);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        globalThis.clearTimeout(timerId);
        reject(error);
      },
    );
  });
