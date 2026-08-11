// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { runtimeLimits } from '../../../kernel/runtimeLimits.js';
import { invalidateMarketReadCaches } from '../marketReadCache.js';
import {
  DUCKDB_MEMORY_LIMIT_MB,
  DUCKDB_TEMP_DIR,
  DUCKDB_THREAD_COUNT,
  MARKET_DB_FILE_PATH,
} from './constants.js';
import {
  assertExistingMarketDbSchemaCompatible,
  localMarketDataNeedsAttentionError,
} from './schema.js';
import { initializeCurrentMarketSchema } from './schemaDefinition.js';
import { MARKET_VOLUME_STORAGE_SQL } from './ohlcvSql.js';
import { cleanupMarketStorageArtifacts, removeMarketStorageFiles } from './storageFiles.js';
import { toSafeInt } from './utils.js';
import { isAppError } from '../../../kernel/appError.js';
import { isLocalMarketDataNeedsAttentionError } from './schema.js';

export type MarketDbContext = {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
};

let marketDbContextPromise: Promise<MarketDbContext> | null = null;
let marketDbContextResetPromise: Promise<void> | null = null;
const MARKET_READ_CONNECTION_POOL_SIZE = runtimeLimits.marketReadConnectionPoolSize;

export type MarketDbLockPriority = 'interactive' | 'bulk';

type MarketDbLockWaiter = {
  task: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  abortHandler?: () => void;
  settled: boolean;
};

const marketDbLockQueues: Record<MarketDbLockPriority, MarketDbLockWaiter[]> = {
  interactive: [],
  bulk: [],
};
let marketDbLockActive = false;

type MarketReadConnectionEntry = {
  connection: DuckDBConnection;
  generation: number;
};

type MarketReadConnectionWaiter = {
  generation: number;
  resolve: (entry: MarketReadConnectionEntry) => void;
  reject: (error: unknown) => void;
  timeout: NodeJS.Timeout | null;
  signal?: AbortSignal;
  abortHandler?: () => void;
  settled: boolean;
};

export type MarketReadQueryOptions = {
  signal?: AbortSignal;
};

let marketReadConnectionGeneration = 0;
let marketReadConnectionOpenCount = 0;
const marketReadConnectionIdle: MarketReadConnectionEntry[] = [];
const marketReadConnectionWaiters: MarketReadConnectionWaiter[] = [];
const marketReadConnectionDrainWaiters: Array<() => void> = [];
let marketReadConnectionPoolResetPromise: Promise<void> | null = null;
const MARKET_READ_CONNECTION_WAITER_LIMIT = MARKET_READ_CONNECTION_POOL_SIZE * 64;
const MARKET_READ_CONNECTION_WAIT_TIMEOUT_MS = 10_000;

const marketReadAbortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new Error('MARKET_READ_ABORTED');

const throwIfMarketReadAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw marketReadAbortError(signal);
  }
};

const cleanupMarketReadConnectionWaiter = (waiter: MarketReadConnectionWaiter): void => {
  if (waiter.timeout) {
    clearTimeout(waiter.timeout);
    waiter.timeout = null;
  }
  if (waiter.signal && waiter.abortHandler) {
    waiter.signal.removeEventListener('abort', waiter.abortHandler);
    waiter.abortHandler = undefined;
  }
};

const rejectMarketReadConnectionWaiter = (
  waiter: MarketReadConnectionWaiter,
  error: unknown,
): boolean => {
  if (waiter.settled) {
    return false;
  }
  waiter.settled = true;
  cleanupMarketReadConnectionWaiter(waiter);
  waiter.reject(error);
  return true;
};

const resolveMarketReadConnectionWaiter = (
  waiter: MarketReadConnectionWaiter,
  entry: MarketReadConnectionEntry,
): boolean => {
  if (waiter.settled) {
    return false;
  }
  waiter.settled = true;
  cleanupMarketReadConnectionWaiter(waiter);
  waiter.resolve(entry);
  return true;
};

const pumpMarketDbLockQueue = (): void => {
  if (marketDbLockActive) {
    return;
  }
  const waiter =
    marketDbLockQueues.interactive.shift() ??
    marketDbLockQueues.bulk.shift();
  if (!waiter) {
    return;
  }
  if (waiter.settled) {
    pumpMarketDbLockQueue();
    return;
  }
  waiter.signal?.removeEventListener('abort', waiter.abortHandler!);
  waiter.abortHandler = undefined;
  marketDbLockActive = true;
  void Promise.resolve()
    .then(waiter.task)
    .then(
      (value) => {
        waiter.settled = true;
        waiter.resolve(value);
      },
      (error) => {
        waiter.settled = true;
        waiter.reject(error);
      },
    )
    .finally(() => {
      marketDbLockActive = false;
      pumpMarketDbLockQueue();
    });
};

export const withMarketDbLock = async <T>(
  task: () => Promise<T>,
  options?: { priority?: MarketDbLockPriority; signal?: AbortSignal }
): Promise<T> => {
  const priority = options?.priority === 'interactive' ? 'interactive' : 'bulk';
  const signal = options?.signal;
  if (signal?.aborted) {
    throw signal.reason ?? new Error('MARKET_WRITE_ABORTED');
  }
  return new Promise<T>((resolve, reject) => {
    const waiter: MarketDbLockWaiter = {
      task: async () => {
        if (signal?.aborted) {
          throw signal.reason ?? new Error('MARKET_WRITE_ABORTED');
        }
        return task();
      },
      resolve: resolve as (value: unknown) => void,
      reject,
      signal,
      settled: false,
    };
    waiter.abortHandler = signal ? () => {
      if (waiter.settled) {
        return;
      }
      const queue = marketDbLockQueues[priority];
      const index = queue.indexOf(waiter);
      if (index < 0) {
        return;
      }
      queue.splice(index, 1);
      waiter.settled = true;
      signal.removeEventListener('abort', waiter.abortHandler!);
      waiter.abortHandler = undefined;
      reject(signal.reason ?? new Error('MARKET_WRITE_ABORTED'));
    } : undefined;
    marketDbLockQueues[priority].push(waiter);
    signal?.addEventListener('abort', waiter.abortHandler!, { once: true });
    if (signal?.aborted) {
      waiter.abortHandler?.();
    }
    pumpMarketDbLockQueue();
  });
};

export const closeDuckDbConnectionSafely = (connection: DuckDBConnection): void => {
  try {
    connection.closeSync();
  } catch {
    // ignore close failures
  }
};

const resolveMarketReadConnectionDrainWaitersIfIdle = (): void => {
  if (marketReadConnectionOpenCount > 0) {
    return;
  }
  const waiters = marketReadConnectionDrainWaiters.splice(0);
  waiters.forEach((resolve) => resolve());
};

const decrementMarketReadConnectionOpenCount = (count = 1): void => {
  marketReadConnectionOpenCount = Math.max(0, marketReadConnectionOpenCount - count);
  resolveMarketReadConnectionDrainWaitersIfIdle();
};

const waitForMarketConnectionReset = async (): Promise<void> => {
  while (marketDbContextResetPromise || marketReadConnectionPoolResetPromise) {
    const waits = [
      marketDbContextResetPromise,
      marketReadConnectionPoolResetPromise
    ].filter((promise): promise is Promise<void> => Boolean(promise));
    await Promise.all(waits);
  }
};

const createMarketReadConnectionEntry = async (
  generation: number
): Promise<MarketReadConnectionEntry> => {
  const { instance } = await getCurrentMarketDbContext();
  const connection = await instance.connect();
  return {
    connection,
    generation
  };
};
const pumpMarketReadConnectionWaiters = (): void => {
  if (marketDbContextResetPromise || marketReadConnectionPoolResetPromise) {
    return;
  }
  while (marketReadConnectionWaiters.length && marketReadConnectionIdle.length) {
    const waiter = marketReadConnectionWaiters.shift();
    const entry = marketReadConnectionIdle.pop();
    if (!waiter || !entry) {
      continue;
    }
    if (
      waiter.generation !== marketReadConnectionGeneration ||
      entry.generation !== marketReadConnectionGeneration
    ) {
      closeDuckDbConnectionSafely(entry.connection);
      decrementMarketReadConnectionOpenCount();
      rejectMarketReadConnectionWaiter(waiter, new Error('MARKET_READ_CONNECTION_RESET'));
      continue;
    }
    if (!resolveMarketReadConnectionWaiter(waiter, entry)) {
      closeDuckDbConnectionSafely(entry.connection);
      decrementMarketReadConnectionOpenCount();
    }
  }

  while (
    marketReadConnectionWaiters.length &&
    marketReadConnectionOpenCount < MARKET_READ_CONNECTION_POOL_SIZE
  ) {
    const waiter = marketReadConnectionWaiters.shift();
    if (!waiter) {
      continue;
    }
    if (waiter.generation !== marketReadConnectionGeneration) {
      rejectMarketReadConnectionWaiter(waiter, new Error('MARKET_READ_CONNECTION_RESET'));
      continue;
    }
    marketReadConnectionOpenCount += 1;
    createMarketReadConnectionEntry(waiter.generation)
      .then((entry) => {
        if (!resolveMarketReadConnectionWaiter(waiter, entry)) {
          closeDuckDbConnectionSafely(entry.connection);
          decrementMarketReadConnectionOpenCount();
          pumpMarketReadConnectionWaiters();
        }
      })
      .catch((error) => {
        decrementMarketReadConnectionOpenCount();
        rejectMarketReadConnectionWaiter(waiter, error);
        pumpMarketReadConnectionWaiters();
      });
  }
};

export const acquireMarketReadConnection = async (
  signal?: AbortSignal,
): Promise<MarketReadConnectionEntry> => {
  throwIfMarketReadAborted(signal);
  await waitForMarketConnectionReset();
  throwIfMarketReadAborted(signal);
  const generation = marketReadConnectionGeneration;
  const idle = marketReadConnectionIdle.pop();
  if (idle) {
    if (idle.generation === generation) {
      return idle;
    }
    closeDuckDbConnectionSafely(idle.connection);
    decrementMarketReadConnectionOpenCount();
  }
  if (marketReadConnectionOpenCount < MARKET_READ_CONNECTION_POOL_SIZE) {
    marketReadConnectionOpenCount += 1;
    try {
      const entry = await createMarketReadConnectionEntry(generation);
      if (signal?.aborted) {
        closeDuckDbConnectionSafely(entry.connection);
        throw marketReadAbortError(signal);
      }
      return entry;
    } catch (error) {
      decrementMarketReadConnectionOpenCount();
      pumpMarketReadConnectionWaiters();
      throw error;
    }
  }
  return new Promise<MarketReadConnectionEntry>((resolve, reject) => {
    if (marketReadConnectionWaiters.length >= MARKET_READ_CONNECTION_WAITER_LIMIT) {
      reject(new Error('MARKET_READ_CONNECTION_QUEUE_FULL'));
      return;
    }
    const waiter: MarketReadConnectionWaiter = {
      generation,
      resolve,
      reject,
      timeout: null,
      signal,
      settled: false,
    };
    waiter.abortHandler = signal ? () => {
      const index = marketReadConnectionWaiters.indexOf(waiter);
      if (index >= 0) {
        marketReadConnectionWaiters.splice(index, 1);
      }
      rejectMarketReadConnectionWaiter(waiter, marketReadAbortError(signal));
    } : undefined;
    waiter.timeout = setTimeout(() => {
      const index = marketReadConnectionWaiters.indexOf(waiter);
      if (index >= 0) {
        marketReadConnectionWaiters.splice(index, 1);
      }
      rejectMarketReadConnectionWaiter(waiter, new Error('MARKET_READ_CONNECTION_WAIT_TIMEOUT'));
    }, MARKET_READ_CONNECTION_WAIT_TIMEOUT_MS);
    marketReadConnectionWaiters.push(waiter);
    signal?.addEventListener('abort', waiter.abortHandler!, { once: true });
    if (signal?.aborted) {
      waiter.abortHandler?.();
    }
  });
};

export const releaseMarketReadConnection = (
  entry: MarketReadConnectionEntry,
  reusable: boolean
): void => {
  if (
    reusable &&
    entry.generation === marketReadConnectionGeneration &&
    marketReadConnectionIdle.length < MARKET_READ_CONNECTION_POOL_SIZE
  ) {
    marketReadConnectionIdle.push(entry);
    pumpMarketReadConnectionWaiters();
    return;
  }
  closeDuckDbConnectionSafely(entry.connection);
  decrementMarketReadConnectionOpenCount();
  pumpMarketReadConnectionWaiters();
};

const closeMarketReadConnectionPool = async (): Promise<void> => {
  if (marketReadConnectionPoolResetPromise) {
    await marketReadConnectionPoolResetPromise;
    return;
  }

  let resolveResetPromise: () => void = () => undefined;
  marketReadConnectionPoolResetPromise = new Promise<void>((resolve) => {
    resolveResetPromise = resolve;
  });

  try {
    marketReadConnectionGeneration += 1;
    const idle = marketReadConnectionIdle.splice(0);
    idle.forEach((entry) => {
      closeDuckDbConnectionSafely(entry.connection);
    });
    decrementMarketReadConnectionOpenCount(idle.length);
    const waiters = marketReadConnectionWaiters.splice(0);
    waiters.forEach((waiter) => {
      rejectMarketReadConnectionWaiter(waiter, new Error('MARKET_READ_CONNECTION_RESET'));
    });
    if (marketReadConnectionOpenCount > 0) {
      await new Promise<void>((resolve) => {
        marketReadConnectionDrainWaiters.push(resolve);
        resolveMarketReadConnectionDrainWaitersIfIdle();
      });
    }
  } finally {
    marketReadConnectionPoolResetPromise = null;
    resolveResetPromise();
    pumpMarketReadConnectionWaiters();
  }
};

export const ensureMarketBarsStageTable = async (connection: DuckDBConnection): Promise<void> => {
  await connection.run('DROP TABLE IF EXISTS market_bars_stage');
  await connection.run(`
    CREATE TEMP TABLE market_bars_stage (
      instrument_id VARCHAR NOT NULL,
      ts_ms BIGINT NOT NULL,
      open DOUBLE NOT NULL,
      high DOUBLE NOT NULL,
      low DOUBLE NOT NULL,
      close DOUBLE NOT NULL,
      volume ${MARKET_VOLUME_STORAGE_SQL} NOT NULL
    )
  `);
};

const initMarketDb = async (): Promise<MarketDbContext> => {
  const existingMarketDb = fs.existsSync(MARKET_DB_FILE_PATH);

  // Transient lock/IO failures (file locked by a concurrent DuckDB process,
  // antivirus scanning, slow volume) must not be reported as corruption.
  // Retry with exponential backoff before mapping a persistent failure to
  // DATABASE_CORRUPTED. Magic-byte corruption is reported immediately.
  const isTransientMarketDbError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return (
      /(?:could not set lock on file|locked|in use|another process|i\/o error|io error|temporarily unavailable|busy|timeout)/iu.test(message) &&
      !/magic bytes|not a valid database|does not start with|file header/i.test(message)
    );
  };
  const isCorruptMarketDbError = (error: unknown): boolean =>
    /magic bytes|not a valid database|does not start with|file header|checksum/i.test(
      error instanceof Error ? error.message : String(error ?? ''),
    );
  const isNeedsAttentionError = (error: unknown): boolean =>
    isAppError(error) && isLocalMarketDataNeedsAttentionError(error);
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms).unref());

  const openMarketDbOnce = async (): Promise<MarketDbContext> => {
    const instance = await DuckDBInstance.fromCache(MARKET_DB_FILE_PATH, {
      temp_directory: DUCKDB_TEMP_DIR,
      threads: String(DUCKDB_THREAD_COUNT)
    });
    let connection: DuckDBConnection;
    try {
      connection = await instance.connect();
    } catch (error) {
      try {
        instance.closeSync();
      } catch {
        // ignore close failures
      }
      throw error;
    }

    try {
      try {
        await connection.run(`SET memory_limit='${String(DUCKDB_MEMORY_LIMIT_MB)}MB'`);
      } catch {
        // Keep default memory policy when engine doesn't support dynamic memory_limit.
      }
      try {
        await connection.run('SET preserve_insertion_order=false');
      } catch {
        // Keep default insertion order policy when unsupported.
      }
      if (runtimeLimits.duckdbObjectCacheEnabled) {
        try {
          await connection.run('SET enable_object_cache = true');
        } catch {
          // Keep default object cache policy when unsupported.
        }
      }
      await assertExistingMarketDbSchemaCompatible(connection, existingMarketDb);

      await initializeCurrentMarketSchema(connection);
      await ensureMarketBarsStageTable(connection);

      return {
        instance,
        connection
      };
    } catch (error) {
      closeDuckDbConnectionSafely(connection);
      try {
        instance.closeSync();
      } catch {
        // ignore close failures
      }
      throw error;
    }
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await sleep(200 * 2 ** (attempt - 1));
    }
    try {
      return await openMarketDbOnce();
    } catch (error) {
      if (isCorruptMarketDbError(error) || isNeedsAttentionError(error)) {
        throw error;
      }
      if (!isTransientMarketDbError(error)) {
        if (existingMarketDb) {
          throw localMarketDataNeedsAttentionError('DATABASE_CORRUPTED');
        }
        throw error;
      }
      lastError = error;
    }
  }
  if (existingMarketDb) {
    throw localMarketDataNeedsAttentionError('DATABASE_CORRUPTED');
  }
  throw lastError ?? new Error('MARKET_DB_OPEN_FAILED');
};

const getCurrentMarketDbContext = async (): Promise<MarketDbContext> => {
  if (!marketDbContextPromise) {
    marketDbContextPromise = initMarketDb();
  }
  return marketDbContextPromise;
};

export const getMarketDbContext = async (): Promise<MarketDbContext> => {
  await waitForMarketConnectionReset();
  return getCurrentMarketDbContext();
};

const withMarketReadConnection = async <T>(
  task: (connection: DuckDBConnection) => Promise<T>,
  options: MarketReadQueryOptions = {},
): Promise<T> => {
  const entry = await acquireMarketReadConnection(options.signal);
  let reusable = false;
  let interrupted = false;
  const interrupt = (): void => {
    interrupted = true;
    try {
      entry.connection.interrupt();
    } catch {
      // The connection is still discarded below when interruption races completion.
    }
  };
  options.signal?.addEventListener('abort', interrupt, { once: true });
  try {
    if (options.signal?.aborted) {
      interrupt();
      throw marketReadAbortError(options.signal);
    }
    const result = await task(entry.connection);
    throwIfMarketReadAborted(options.signal);
    reusable = true;
    return result;
  } finally {
    options.signal?.removeEventListener('abort', interrupt);
    releaseMarketReadConnection(entry, reusable && !interrupted);
  }
};

export const queryRowsWithConnection = async <TRow extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params: unknown[] = []
): Promise<TRow[]> => {
  const result = await connection.run(sql, params as never[]);
  const rows = await result.getRowObjectsJS();
  return rows as TRow[];
};

export const queryRows = async <TRow extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  options: MarketReadQueryOptions = {},
): Promise<TRow[]> => {
  return withMarketReadConnection(async (connection) => {
    const result = await connection.run(sql, params as never[]);
    const rows = await result.getRowObjectsJS();
    return rows as TRow[];
  }, options);
};

export const queryRow = async <TRow extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  options: MarketReadQueryOptions = {},
): Promise<TRow | undefined> => {
  const rows = await queryRows<TRow>(sql, params, options);
  return rows[0];
};

export const execute = async (sql: string, params: unknown[] = []): Promise<number> => {
  const { connection } = await getMarketDbContext();
  const result = await connection.run(sql, params as never[]);
  return toSafeInt(result.rowsChanged);
};

export const executeWithConnection = async (
  connection: DuckDBConnection,
  sql: string,
  params: unknown[] = []
): Promise<number> => {
  const result = await connection.run(sql, params as never[]);
  return toSafeInt(result.rowsChanged);
};

export const resetMarketDbContext = async (options?: {
  removeStorageFiles?: boolean;
  cleanupArtifacts?: boolean;
}): Promise<void> => {
  if (marketDbContextResetPromise) {
    await marketDbContextResetPromise;
    if (options?.removeStorageFiles || options?.cleanupArtifacts) {
      await resetMarketDbContext(options);
    }
    return;
  }
  const contextPromise = marketDbContextPromise;
  const shouldRemoveStorageFiles = Boolean(options?.removeStorageFiles);
  const shouldCleanupArtifacts = Boolean(options?.cleanupArtifacts);
  if (!contextPromise && !shouldRemoveStorageFiles && !shouldCleanupArtifacts) {
    return;
  }

  let resolveResetPromise: () => void = () => undefined;
  marketDbContextResetPromise = new Promise<void>((resolve) => {
    resolveResetPromise = resolve;
  });

  try {
    await closeMarketReadConnectionPool();
    if (contextPromise) {
      try {
        const context = await contextPromise;
        try {
          context.connection.closeSync();
        } catch {
          // ignore close failures
        }
        try {
          context.instance.closeSync();
        } catch {
          // ignore close failures
        }
      } catch {
        // ignore failed initialization during reset
      }
    }
    if (shouldRemoveStorageFiles) {
      await removeMarketStorageFiles();
    }
    if (shouldCleanupArtifacts) {
      await cleanupMarketStorageArtifacts();
    }
  } catch {
    // ignore close failures
  } finally {
    if (marketDbContextPromise === contextPromise) {
      marketDbContextPromise = null;
    }
    marketDbContextResetPromise = null;
    resolveResetPromise();
    invalidateMarketReadCaches();
  }
};

export const closeMarketDbContext = async (): Promise<void> => {
  await resetMarketDbContext();
};

export const closeMarketDatabase = async (): Promise<void> => {
  await withMarketDbLock(async () => {
    await closeMarketDbContext();
  });
};

export const getMarketReadConnectionPoolState = () => ({
  openCount: marketReadConnectionOpenCount,
  idleCount: marketReadConnectionIdle.length,
  waiterCount: marketReadConnectionWaiters.length,
  drainWaiterCount: marketReadConnectionDrainWaiters.length,
  poolResetting: Boolean(marketReadConnectionPoolResetPromise),
  contextResetting: Boolean(marketDbContextResetPromise)
});

/**
 * Pre-warm the DuckDB instance and connection pool.
 * Call this during backend startup to avoid cold-start latency on first market data query.
 */
export const warmUpMarketDatabase = async (
  options: {
    signal?: AbortSignal;
    canPublish?: () => boolean;
  } = {},
): Promise<void> => {
  let readEntry: MarketReadConnectionEntry | null = null;
  let reusable = false;
  try {
    throwIfMarketReadAborted(options.signal);
    const { connection } = await getMarketDbContext();
    throwIfMarketReadAborted(options.signal);
    // Pre-warm a read connection for the pool
    readEntry = await acquireMarketReadConnection(options.signal);
    throwIfMarketReadAborted(options.signal);
    // Verify the connection is functional with a lightweight query
    await connection.run('SELECT 1');
    throwIfMarketReadAborted(options.signal);
    reusable = options.canPublish?.() ?? true;
  } catch (error) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? error;
    }
    // Warmup failures are non-fatal — log and continue
    console.warn('[zinuto-backend] DuckDB warmup failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (readEntry) {
      releaseMarketReadConnection(readEntry, reusable);
    }
  }
};
