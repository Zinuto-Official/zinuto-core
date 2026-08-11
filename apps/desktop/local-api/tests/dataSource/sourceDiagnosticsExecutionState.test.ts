// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSourceDiagnosticsExecutionState,
  isSourceDiagnosticsLifecycleError,
} from '../../src/application/dataSource/sourceDiagnosticsExecutionState.js';

const deferred = <T>() => {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
};

test('source diagnostics quiesce aborts active work and waits for real settlement', async () => {
  const state = createSourceDiagnosticsExecutionState();
  const started = deferred<void>();
  const abortObserved = deferred<void>();
  const allowSettle = deferred<void>();
  const task = state.startTask(async ({ signal }) => {
    started.resolve();
    signal.addEventListener('abort', () => abortObserved.resolve(), {
      once: true,
    });
    await allowSettle.promise;
  });
  await started.promise;

  let quiesced = false;
  const leasePromise = state.acquireQuiesceLease().then((lease) => {
    quiesced = true;
    return lease;
  });
  await abortObserved.promise;
  await Promise.resolve();
  assert.equal(quiesced, false);
  assert.equal(state.getState().activeTaskCount, 1);

  allowSettle.resolve();
  const lease = await leasePromise;
  await task;
  assert.equal(quiesced, true);
  assert.equal(state.getState().activeTaskCount, 0);
  assert.equal(state.getState().suspended, true);
  lease.release();
  assert.equal(state.getState().suspended, false);
});

test('source diagnostics rejects new execution while a quiesce lease is held', async () => {
  const state = createSourceDiagnosticsExecutionState();
  const lease = await state.acquireQuiesceLease();

  assert.equal(state.tryStartTask(async () => undefined), null);
  await assert.rejects(
    state.startTask(async () => undefined),
    (error: unknown) =>
      isSourceDiagnosticsLifecycleError(error) &&
      error.code === 'SOURCE_DIAGNOSTICS_SUSPENDED',
  );

  lease.release();
  await state.startTask(async () => undefined);
});

test('source diagnostics epoch prevents stale post-reset cache publication', async () => {
  const state = createSourceDiagnosticsExecutionState();
  const started = deferred<void>();
  const allowPublication = deferred<void>();
  let systemCacheValue = 'current-generation';
  const task = state.startTask(async (context) => {
    started.resolve();
    await allowPublication.promise;
    if (context.canPublish()) {
      systemCacheValue = 'stale-generation';
    }
    context.assertCanPublish();
  });
  await started.promise;

  const leasePromise = state.acquireQuiesceLease();
  allowPublication.resolve();
  await assert.rejects(
    task,
    (error: unknown) =>
      isSourceDiagnosticsLifecycleError(error) &&
      error.code === 'SOURCE_DIAGNOSTICS_SUSPENDED',
  );
  const lease = await leasePromise;

  assert.equal(systemCacheValue, 'current-generation');
  lease.release();
});

test('source diagnostics stop aborts, drains, and permanently closes scheduling', async () => {
  const state = createSourceDiagnosticsExecutionState();
  const started = deferred<void>();
  const abortObserved = deferred<void>();
  const allowSettle = deferred<void>();
  const task = state.startTask(async ({ signal }) => {
    started.resolve();
    signal.addEventListener('abort', () => abortObserved.resolve(), {
      once: true,
    });
    await allowSettle.promise;
  });
  await started.promise;

  let stopped = false;
  const stopPromise = state.stop().then(() => {
    stopped = true;
  });
  await abortObserved.promise;
  await Promise.resolve();
  assert.equal(stopped, false);
  allowSettle.resolve();
  await stopPromise;
  await task;

  assert.deepEqual(state.getState(), {
    activeTaskCount: 0,
    epoch: 1,
    stopped: true,
    suspended: false,
  });
  assert.equal(state.tryStartTask(async () => undefined), null);
  await assert.rejects(
    state.startTask(async () => undefined),
    (error: unknown) =>
      isSourceDiagnosticsLifecycleError(error) &&
      error.code === 'SOURCE_DIAGNOSTICS_STOPPED',
  );
});
