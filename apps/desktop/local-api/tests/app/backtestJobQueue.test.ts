// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enqueueBacktestBatchRun,
  forgetBacktestBatchRun,
  isBacktestBatchQueued,
} from '../../src/application/backtest/backtestJobQueue.js';

const nextTurn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const deferred = (): {
  promise: Promise<void>;
  resolve: () => void;
} => {
  let resolve = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

test('backtest queue runs only one resource-intensive batch at a time', async () => {
  const first = deferred();
  const second = deferred();
  const events: string[] = [];

  enqueueBacktestBatchRun('serial-first', async () => {
    events.push('first:start');
    await first.promise;
    events.push('first:end');
  });
  enqueueBacktestBatchRun('serial-second', async () => {
    events.push('second:start');
    await second.promise;
    events.push('second:end');
  });

  await nextTurn();
  assert.deepEqual(events, ['first:start']);
  assert.equal(isBacktestBatchQueued('serial-second'), true);

  first.resolve();
  await nextTurn();
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start']);

  second.resolve();
  await nextTurn();
  assert.deepEqual(events, [
    'first:start',
    'first:end',
    'second:start',
    'second:end',
  ]);
});

test('forget removes a pending batch before its runner starts', async () => {
  const blocker = deferred();
  const events: string[] = [];

  enqueueBacktestBatchRun('forget-blocker', async () => {
    events.push('blocker:start');
    await blocker.promise;
  });
  enqueueBacktestBatchRun('forget-target', async () => {
    events.push('target:start');
  });
  forgetBacktestBatchRun('forget-target');

  await nextTurn();
  assert.deepEqual(events, ['blocker:start']);
  assert.equal(isBacktestBatchQueued('forget-target'), false);

  blocker.resolve();
  await nextTurn();
  assert.deepEqual(events, ['blocker:start']);
});

test('duplicate enqueue is ignored and a failed runner does not poison the queue', async () => {
  const previousWarn = console.warn;
  console.warn = () => undefined;
  const events: string[] = [];
  try {
    enqueueBacktestBatchRun('duplicate-runner', async () => {
      events.push('duplicate:first');
      throw new Error('expected failure');
    });
    enqueueBacktestBatchRun('duplicate-runner', async () => {
      events.push('duplicate:second');
    });
    enqueueBacktestBatchRun('after-failure', async () => {
      events.push('after-failure');
    });
    await nextTurn();
    await nextTurn();
  } finally {
    console.warn = previousWarn;
  }

  assert.deepEqual(events, ['duplicate:first', 'after-failure']);
});

test('a synchronous runner throw does not leave the queue permanently active', async () => {
  const previousWarn = console.warn;
  console.warn = () => undefined;
  const events: string[] = [];
  try {
    enqueueBacktestBatchRun('sync-throw', () => {
      events.push('sync-throw');
      throw new Error('expected synchronous failure');
    });
    enqueueBacktestBatchRun('after-sync-throw', async () => {
      events.push('after-sync-throw');
    });
    await nextTurn();
    await nextTurn();
  } finally {
    console.warn = previousWarn;
  }

  assert.deepEqual(events, ['sync-throw', 'after-sync-throw']);
});

test('queue shutdown drops pending work and waits for the active runner', async () => {
  const active = deferred();
  const events: string[] = [];
  enqueueBacktestBatchRun('shutdown-active', async () => {
    events.push('active:start');
    await active.promise;
    events.push('active:end');
  });
  enqueueBacktestBatchRun('shutdown-pending', async () => {
    events.push('pending:start');
  });

  await nextTurn();
  let stopped = false;
  const stopPromise = import('../../src/application/backtest/backtestJobQueue.js')
    .then(({ stopBacktestJobQueue }) => stopBacktestJobQueue())
    .then(() => {
      stopped = true;
    });
  await nextTurn();
  assert.equal(stopped, false);
  assert.equal(isBacktestBatchQueued('shutdown-pending'), false);

  active.resolve();
  await stopPromise;
  assert.equal(stopped, true);
  assert.deepEqual(events, ['active:start', 'active:end']);
});
