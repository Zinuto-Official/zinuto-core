// SPDX-License-Identifier: GPL-3.0-only

export type StaleWhileRevalidateStatus = 'WARMING' | 'FRESH' | 'STALE';

export type StaleWhileRevalidateRead<T> = {
  value: T;
  status: StaleWhileRevalidateStatus;
  refreshedAt: number | null;
  refreshPending: boolean;
  nextRetryAt: number | null;
};

export type StaleWhileRevalidateSnapshot<T> = {
  read: () => T;
  readState: () => StaleWhileRevalidateRead<T>;
  refresh: () => Promise<T>;
  write: (value: T) => void;
  invalidate: () => void;
};

const DEFAULT_REFRESH_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_BASE_MS = 2_000;
const DEFAULT_RETRY_MAX_MS = 60_000;

const toNonNegativeDuration = (value: number, fallback: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;

const resolveRetryDelay = ({
  failureCount,
  retryBaseMs,
  retryMaxMs,
}: {
  failureCount: number;
  retryBaseMs: number;
  retryMaxMs: number;
}): number => {
  const exponent = Math.max(0, Math.min(20, failureCount - 1));
  return Math.min(retryMaxMs, retryBaseMs * 2 ** exponent);
};

const createRefreshTimeoutError = (timeoutMs: number): Error => {
  const error = new Error(`snapshot refresh exceeded ${String(timeoutMs)}ms`);
  error.name = 'SnapshotRefreshTimeoutError';
  return error;
};

export const createStaleWhileRevalidateSnapshot = <T>({
  load,
  createFallback,
  maxAgeMs,
  refreshTimeoutMs = DEFAULT_REFRESH_TIMEOUT_MS,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryMaxMs = DEFAULT_RETRY_MAX_MS,
  now = Date.now,
  schedule = setImmediate,
  onRefreshError,
}: {
  load: (signal: AbortSignal) => Promise<T>;
  createFallback: () => T;
  maxAgeMs: number;
  refreshTimeoutMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  now?: () => number;
  schedule?: (task: () => void) => unknown;
  onRefreshError?: (error: unknown) => void;
}): StaleWhileRevalidateSnapshot<T> => {
  const effectiveMaxAgeMs = toNonNegativeDuration(maxAgeMs, 0);
  const effectiveRefreshTimeoutMs = toNonNegativeDuration(
    refreshTimeoutMs,
    DEFAULT_REFRESH_TIMEOUT_MS,
  );
  const effectiveRetryBaseMs = toNonNegativeDuration(
    retryBaseMs,
    DEFAULT_RETRY_BASE_MS,
  );
  const effectiveRetryMaxMs = Math.max(
    effectiveRetryBaseMs,
    toNonNegativeDuration(retryMaxMs, DEFAULT_RETRY_MAX_MS),
  );

  let fallbackValue!: T;
  let fallbackCreated = false;
  let snapshot: { value: T; refreshedAt: number } | null = null;
  let refreshPromise: Promise<T> | null = null;
  let refreshScheduled = false;
  let writeRevision = 0;
  let refreshAttempt = 0;
  let consecutiveFailures = 0;
  let nextRetryAt = 0;

  const fallback = (): T => {
    if (!fallbackCreated) {
      fallbackValue = createFallback();
      fallbackCreated = true;
    }
    return fallbackValue;
  };

  const currentValue = (): T => snapshot?.value ?? fallback();

  const refresh = (): Promise<T> => {
    if (refreshPromise) {
      return refreshPromise;
    }
    const revisionAtStart = writeRevision;
    const attempt = ++refreshAttempt;
    const abortController = new AbortController();
    let timeout: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        abortController.abort();
        reject(createRefreshTimeoutError(effectiveRefreshTimeoutMs));
      }, effectiveRefreshTimeoutMs);
    });
    const loadPromise = Promise.resolve().then(() => load(abortController.signal));

    const activePromise = Promise.race([loadPromise, timeoutPromise])
      .then((value) => {
        if (attempt === refreshAttempt && revisionAtStart === writeRevision) {
          snapshot = { value, refreshedAt: now() };
          consecutiveFailures = 0;
          nextRetryAt = 0;
        }
        return currentValue();
      })
      .catch((error: unknown) => {
        if (attempt === refreshAttempt) {
          consecutiveFailures += 1;
          nextRetryAt =
            now() +
            resolveRetryDelay({
              failureCount: consecutiveFailures,
              retryBaseMs: effectiveRetryBaseMs,
              retryMaxMs: effectiveRetryMaxMs,
            });
          try {
            onRefreshError?.(error);
          } catch {
            // Observability must never turn a recoverable refresh into a rejection.
          }
        }
        return currentValue();
      })
      .finally(() => {
        if (timeout) {
          clearTimeout(timeout);
        }
        if (attempt === refreshAttempt) {
          refreshPromise = null;
        }
      });
    refreshPromise = activePromise;
    return activePromise;
  };

  const shouldRefresh = (): boolean =>
    (!snapshot || now() - snapshot.refreshedAt >= effectiveMaxAgeMs) &&
    now() >= nextRetryAt;

  const scheduleRefresh = (): void => {
    if (refreshScheduled || refreshPromise || !shouldRefresh()) {
      return;
    }
    refreshScheduled = true;
    schedule(() => {
      refreshScheduled = false;
      if (shouldRefresh()) {
        void refresh();
      }
    });
  };

  const readState = (): StaleWhileRevalidateRead<T> => {
    const readAt = now();
    const status: StaleWhileRevalidateStatus = !snapshot
      ? 'WARMING'
      : readAt - snapshot.refreshedAt < effectiveMaxAgeMs
        ? 'FRESH'
        : 'STALE';
    scheduleRefresh();
    return {
      value: currentValue(),
      status,
      refreshedAt: snapshot?.refreshedAt ?? null,
      refreshPending: refreshScheduled || refreshPromise !== null,
      nextRetryAt: nextRetryAt > readAt ? nextRetryAt : null,
    };
  };

  return {
    read: () => readState().value,
    readState,
    refresh,
    write: (value) => {
      writeRevision += 1;
      consecutiveFailures = 0;
      nextRetryAt = 0;
      snapshot = { value, refreshedAt: now() };
    },
    invalidate: () => {
      if (snapshot) {
        snapshot.refreshedAt = 0;
      }
    },
  };
};
