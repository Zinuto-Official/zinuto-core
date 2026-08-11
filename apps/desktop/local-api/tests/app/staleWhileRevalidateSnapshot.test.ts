// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { createStaleWhileRevalidateSnapshot } from '../../src/application/staleWhileRevalidateSnapshot.js';

const waitForScheduledRefresh = async (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));

test('cold snapshot is explicitly warming and coalesces background refreshes', async () => {
  let now = 1_000;
  let resolveLoad: ((value: string) => void) | null = null;
  let loadCalls = 0;
  const cache = createStaleWhileRevalidateSnapshot({
    load: () => {
      loadCalls += 1;
      return new Promise<string>((resolve) => {
        resolveLoad = resolve;
      });
    },
    createFallback: () => 'fallback',
    maxAgeMs: 100,
    now: () => now,
  });

  assert.deepEqual(cache.readState(), {
    value: 'fallback',
    status: 'WARMING',
    refreshedAt: null,
    refreshPending: true,
    nextRetryAt: null,
  });
  assert.equal(cache.read(), 'fallback');
  assert.equal(loadCalls, 0);
  await waitForScheduledRefresh();
  assert.equal(loadCalls, 1);
  const refresh = cache.refresh();
  assert.equal(loadCalls, 1);
  assert.ok(resolveLoad);
  resolveLoad('fresh');
  assert.equal(await refresh, 'fresh');
  assert.equal(cache.readState().status, 'FRESH');

  now += 101;
  const stale = cache.readState();
  assert.equal(stale.value, 'fresh');
  assert.equal(stale.status, 'STALE');
  assert.equal(stale.refreshPending, true);
  await waitForScheduledRefresh();
  assert.equal(loadCalls, 2);
  assert.ok(resolveLoad);
  resolveLoad('newer');
  assert.equal(await cache.refresh(), 'newer');
});

test('failed refresh preserves last-good data and backs off background retries', async () => {
  let now = 2_000;
  let shouldFail = false;
  let loadCalls = 0;
  let refreshError: unknown = null;
  const cache = createStaleWhileRevalidateSnapshot({
    load: async () => {
      loadCalls += 1;
      if (shouldFail) {
        throw new Error('storage unavailable');
      }
      return { bytes: 42 };
    },
    createFallback: () => ({ bytes: 0 }),
    maxAgeMs: 100,
    retryBaseMs: 500,
    retryMaxMs: 2_000,
    now: () => now,
    onRefreshError: (error) => {
      refreshError = error;
    },
  });

  assert.deepEqual(await cache.refresh(), { bytes: 42 });
  now += 101;
  shouldFail = true;
  assert.deepEqual(await cache.refresh(), { bytes: 42 });
  assert.match(String(refreshError), /storage unavailable/);

  const backedOff = cache.readState();
  assert.equal(backedOff.status, 'STALE');
  assert.deepEqual(backedOff.value, { bytes: 42 });
  assert.equal(backedOff.refreshPending, false);
  assert.equal(backedOff.nextRetryAt, now + 500);
  await waitForScheduledRefresh();
  assert.equal(loadCalls, 2);

  now += 500;
  assert.equal(cache.readState().refreshPending, true);
  await waitForScheduledRefresh();
  assert.equal(loadCalls, 3);
  assert.deepEqual(await cache.refresh(), { bytes: 42 });
});

test('timed-out refresh releases the gate and a late result cannot replace a newer snapshot', async () => {
  let now = 3_000;
  let loadCalls = 0;
  let resolveHungLoad: ((value: string) => void) | null = null;
  const refreshErrors: unknown[] = [];
  const cache = createStaleWhileRevalidateSnapshot({
    load: async () => {
      loadCalls += 1;
      if (loadCalls === 1) {
        return new Promise<string>((resolve) => {
          resolveHungLoad = resolve;
        });
      }
      return 'recovered';
    },
    createFallback: () => 'fallback',
    maxAgeMs: 100,
    refreshTimeoutMs: 15,
    retryBaseMs: 20,
    retryMaxMs: 20,
    now: () => now,
    onRefreshError: (error) => refreshErrors.push(error),
  });

  assert.equal(await cache.refresh(), 'fallback');
  assert.equal(loadCalls, 1);
  assert.equal(cache.readState().refreshPending, false);
  assert.match(String(refreshErrors[0]), /exceeded 15ms/);

  now += 20;
  assert.equal(cache.readState().refreshPending, true);
  await waitForScheduledRefresh();
  await Promise.resolve();
  assert.equal(cache.read(), 'recovered');
  assert.equal(loadCalls, 2);

  assert.ok(resolveHungLoad);
  resolveHungLoad('late-stale-value');
  await Promise.resolve();
  assert.equal(cache.read(), 'recovered');
});
