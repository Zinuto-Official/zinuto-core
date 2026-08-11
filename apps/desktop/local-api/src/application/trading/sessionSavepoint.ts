// SPDX-License-Identifier: GPL-3.0-only

import { AsyncLocalStorage } from 'node:async_hooks';

type CreateSessionSavepointRunnerDeps = {
  exec: (sql: string) => void;
  namePrefix?: string;
};

export const createSessionSavepointRunner = ({
  exec,
  namePrefix = 'session_ops_sp',
}: CreateSessionSavepointRunnerDeps) => {
  let savepointCounter = 0;
  let savepointQueue: Promise<void> = Promise.resolve();
  const savepointContext = new AsyncLocalStorage<number>();

  const withSavepoint = async <T>(runner: () => Promise<T>): Promise<T> => {
    const nestedDepth = savepointContext.getStore() ?? 0;
    const runWithinSavepoint = async (): Promise<T> => {
      savepointCounter += 1;
      const savepointName = `${namePrefix}_${savepointCounter}`;
      exec(`SAVEPOINT ${savepointName}`);
      try {
        return await savepointContext.run(nestedDepth + 1, runner);
      } catch (error) {
        try {
          exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        } finally {
          exec(`RELEASE SAVEPOINT ${savepointName}`);
        }
        throw error;
      } finally {
        try {
          exec(`RELEASE SAVEPOINT ${savepointName}`);
        } catch {
          // Nested rollback path already released the savepoint.
        }
      }
    };

    if (nestedDepth > 0) {
      return runWithinSavepoint();
    }

    const previousQueue = savepointQueue;
    let releaseQueue!: () => void;
    savepointQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await previousQueue;
    try {
      return await runWithinSavepoint();
    } finally {
      releaseQueue();
    }
  };

  return {
    withSavepoint,
  };
};
