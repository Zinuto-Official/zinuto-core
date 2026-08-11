// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { createTabularDuckDbRuntime } from '../../src/application/dataSource/tabularDuckDbRuntime.js';

test('tabular DuckDB runtime retains one instance and leases independent connections', async () => {
  let instanceCreateCalls = 0;
  let instanceCloseCalls = 0;
  let nextConnectionId = 0;
  const closedConnectionIds: number[] = [];
  const runtime = createTabularDuckDbRuntime({
    createInstance: async () => {
      instanceCreateCalls += 1;
      return {
        connect: async () => {
          nextConnectionId += 1;
          const id = nextConnectionId;
          return {
            id,
            closeSync: () => {
              closedConnectionIds.push(id);
            },
          };
        },
        closeSync: () => {
          instanceCloseCalls += 1;
        },
      };
    },
  });

  const connectionIds = await Promise.all(
    Array.from({ length: 12 }, () =>
      runtime.withConnection(async (connection) => connection.id),
    ),
  );

  assert.equal(instanceCreateCalls, 1);
  assert.equal(new Set(connectionIds).size, 12);
  assert.deepEqual(closedConnectionIds.sort((left, right) => left - right), connectionIds);

  await runtime.stop();
  assert.equal(instanceCloseCalls, 1);

  const nextConnectionIdAfterRestart = await runtime.withConnection(
    async (connection) => connection.id,
  );
  assert.equal(instanceCreateCalls, 2);
  assert.equal(nextConnectionIdAfterRestart, 13);
  await runtime.stop();
  assert.equal(instanceCloseCalls, 2);
});

test('tabular DuckDB runtime waits for active leases before closing its instance', async () => {
  let releaseTask!: () => void;
  const taskReleased = new Promise<void>((resolve) => {
    releaseTask = resolve;
  });
  const events: string[] = [];
  const runtime = createTabularDuckDbRuntime({
    createInstance: async () => ({
      connect: async () => ({
        closeSync: () => {
          events.push('connection-closed');
        },
      }),
      closeSync: () => {
        events.push('instance-closed');
      },
    }),
  });

  const taskPromise = runtime.withConnection(async () => {
    events.push('task-started');
    await taskReleased;
    events.push('task-finished');
  });
  while (!events.includes('task-started')) {
    await Promise.resolve();
  }

  const stopPromise = runtime.stop();
  await Promise.resolve();
  assert.deepEqual(events, ['task-started']);

  releaseTask();
  await Promise.all([taskPromise, stopPromise]);
  assert.deepEqual(events, [
    'task-started',
    'task-finished',
    'connection-closed',
    'instance-closed',
  ]);
});

test('tabular DuckDB runtime retries instance creation after a failed attempt', async () => {
  let instanceCreateCalls = 0;
  const runtime = createTabularDuckDbRuntime({
    createInstance: async () => {
      instanceCreateCalls += 1;
      if (instanceCreateCalls === 1) {
        throw new Error('create failed');
      }
      return {
        connect: async () => ({
          closeSync: () => undefined,
        }),
        closeSync: () => undefined,
      };
    },
  });

  await assert.rejects(
    runtime.withConnection(async () => undefined),
    /create failed/,
  );
  await runtime.withConnection(async () => undefined);
  assert.equal(instanceCreateCalls, 2);
  await runtime.stop();
});
