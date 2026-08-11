// SPDX-License-Identifier: GPL-3.0-only

import {
  DuckDBInstance,
  type DuckDBConnection,
} from '@duckdb/node-api';

type ClosableDuckDbConnection = {
  closeSync: () => void;
};

type ClosableDuckDbInstance<TConnection extends ClosableDuckDbConnection> = {
  connect: () => Promise<TConnection>;
  closeSync: () => void;
};

type CreateTabularDuckDbRuntimeInput<TConnection extends ClosableDuckDbConnection> = {
  createInstance: () => Promise<ClosableDuckDbInstance<TConnection>>;
};

export const createTabularDuckDbRuntime = <
  TConnection extends ClosableDuckDbConnection,
>({
  createInstance,
}: CreateTabularDuckDbRuntimeInput<TConnection>) => {
  let instancePromise: Promise<ClosableDuckDbInstance<TConnection>> | null = null;
  let closePromise: Promise<void> | null = null;
  let activeConnectionCount = 0;
  let resolveConnectionsDrained: (() => void) | null = null;

  const getOrCreateInstance = (): Promise<ClosableDuckDbInstance<TConnection>> => {
    if (!instancePromise) {
      const trackedInstance = createInstance().catch((error) => {
        if (instancePromise === trackedInstance) {
          instancePromise = null;
        }
        throw error;
      });
      instancePromise = trackedInstance;
    }
    return instancePromise;
  };

  const waitForConnectionsToDrain = (): Promise<void> => {
    if (activeConnectionCount <= 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const previousResolve = resolveConnectionsDrained;
      resolveConnectionsDrained = () => {
        previousResolve?.();
        resolve();
      };
    });
  };

  const withConnection = async <T>(
    task: (connection: TConnection) => Promise<T>,
  ): Promise<T> => {
    while (closePromise) {
      await closePromise;
    }
    activeConnectionCount += 1;
    let connection: TConnection | null = null;
    try {
      const instance = await getOrCreateInstance();
      connection = await instance.connect();
      return await task(connection);
    } finally {
      try {
        connection?.closeSync();
      } finally {
        activeConnectionCount = Math.max(0, activeConnectionCount - 1);
        if (activeConnectionCount === 0) {
          const resolve = resolveConnectionsDrained;
          resolveConnectionsDrained = null;
          resolve?.();
        }
      }
    }
  };

  const stop = (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }
    const pendingClose = (async () => {
      await waitForConnectionsToDrain();
      const pendingInstance = instancePromise;
      instancePromise = null;
      if (!pendingInstance) {
        return;
      }
      const instance = await pendingInstance;
      instance.closeSync();
    })();
    closePromise = pendingClose.finally(() => {
      closePromise = null;
    });
    return closePromise;
  };

  return {
    withConnection,
    stop,
  };
};

const tabularDuckDbRuntime = createTabularDuckDbRuntime<DuckDBConnection>({
  createInstance: () => DuckDBInstance.create(':memory:'),
});

export const withTabularDuckDbConnection =
  tabularDuckDbRuntime.withConnection;

export const stopTabularDuckDbRuntime =
  tabularDuckDbRuntime.stop;
