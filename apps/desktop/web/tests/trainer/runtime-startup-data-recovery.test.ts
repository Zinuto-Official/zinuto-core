// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  connectRuntimeDataRecoveryToBackendLifecycle,
  createRuntimeDataRecoveryCoordinator,
  runRuntimeStartupDataRecovery,
  runRuntimeStartupTaskWithRetry,
  type RuntimeBackendLifecycleStatus,
} from "../../src/domains/trainer/runtimeStartupDataRecovery";

test("startup data recovers after the local backend restarts", async () => {
  const abortController = new AbortController();
  let instrumentAttempts = 0;
  let dataSourceAttempts = 0;
  const retryDelays: number[] = [];

  const result = await runRuntimeStartupDataRecovery({
    signal: abortController.signal,
    isActive: () => true,
    retryDelaysMs: [10, 20, 30],
    waitForRetry: async (delayMs) => {
      retryDelays.push(delayMs);
      return true;
    },
    refreshInstruments: async () => {
      instrumentAttempts += 1;
      if (instrumentAttempts < 3) {
        throw new Error("backend restarting");
      }
      return [{ symbol: "600000", instrumentId: "instrument-a" }];
    },
    syncCustomSamplePoolsFromDataSources: async () => {
      dataSourceAttempts += 1;
      if (dataSourceAttempts < 2) {
        throw new Error("backend restarting");
      }
      return [{ id: "pool-a" }];
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.attempts, 3);
  if (result.status === "ready") {
    assert.deepEqual(result.value, {
      instruments: [{ symbol: "600000", instrumentId: "instrument-a" }],
      samplePools: [{ id: "pool-a" }],
    });
  }
  assert.equal(instrumentAttempts, 3);
  assert.equal(dataSourceAttempts, 3);
  assert.deepEqual(retryDelays, [10, 20]);
});

test("startup data recovery remains bounded on a permanent failure", async () => {
  const abortController = new AbortController();
  let attempts = 0;

  const result = await runRuntimeStartupTaskWithRetry({
    signal: abortController.signal,
    isActive: () => true,
    retryDelaysMs: [1, 2],
    waitForRetry: async () => true,
    task: async () => {
      attempts += 1;
      throw new Error("still unavailable");
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.attempts, 3);
  assert.equal(attempts, 3);
});

test("startup data recovery stops when its lifecycle is aborted", async () => {
  const abortController = new AbortController();
  let attempts = 0;

  const result = await runRuntimeStartupTaskWithRetry({
    signal: abortController.signal,
    isActive: () => true,
    retryDelaysMs: [1, 2],
    waitForRetry: async () => {
      abortController.abort();
      return false;
    },
    task: async () => {
      attempts += 1;
      throw new Error("backend restarting");
    },
  });

  assert.equal(result.status, "aborted");
  assert.equal(result.attempts, 1);
  assert.equal(attempts, 1);
});

test("backend lifecycle subscription recovers once for READY to PENDING to READY", async () => {
  const reasons: string[] = [];
  let lifecycleHandler:
    | ((status: RuntimeBackendLifecycleStatus) => void)
    | undefined;
  let unlistenCount = 0;
  const coordinator = createRuntimeDataRecoveryCoordinator({
    run: async ({ reason }) => {
      reasons.push(reason);
    },
  });
  const unlisten = await connectRuntimeDataRecoveryToBackendLifecycle({
    coordinator,
    subscribe: async (handler) => {
      lifecycleHandler = handler;
      return () => {
        unlistenCount += 1;
      };
    },
  });

  assert.ok(lifecycleHandler);
  lifecycleHandler({ state: "READY", checkedAtMs: 100 });
  lifecycleHandler({ state: "READY", checkedAtMs: 100 });
  lifecycleHandler({ state: "PENDING", checkedAtMs: 120 });
  lifecycleHandler({ state: "READY", checkedAtMs: 140 });
  lifecycleHandler({ state: "READY", checkedAtMs: 140 });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(reasons, ["backend-ready"]);
  unlisten();
  assert.equal(unlistenCount, 1);
  coordinator.dispose();
});

test("a newer recovery request aborts the previous generation", async () => {
  const signals: AbortSignal[] = [];
  let releaseFirstRun: () => void = () => undefined;
  const firstRunGate = new Promise<void>((resolve) => {
    releaseFirstRun = resolve;
  });
  const coordinator = createRuntimeDataRecoveryCoordinator({
    run: ({ signal }) => {
      signals.push(signal);
      if (signals.length === 1) {
        return firstRunGate;
      }
      return Promise.resolve();
    },
  });

  const firstRun = coordinator.request("mount");
  await Promise.resolve();
  const secondRun = coordinator.request("backend-ready");
  await Promise.resolve();
  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals[1]?.aborted, false);
  releaseFirstRun();
  await Promise.all([firstRun, secondRun]);
  coordinator.dispose();
});
