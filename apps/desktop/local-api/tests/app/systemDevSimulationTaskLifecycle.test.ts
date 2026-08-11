// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-system-dev-task-lifecycle-"),
);
const previousDataDir = process.env.ZINUTO_DATA_DIR;
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [
  { db },
  { appError },
  {
    cleanupSystemDevSimulationData,
    startSystemDevSimulationJob,
    stopSystemDevSimulationJobRuntime,
  },
  { runSystemDevSimulationTimedTask },
  {
    hasActiveSystemDevSimulationTaskExecution,
    throwIfSystemDevSimulationTaskAborted,
    waitForSystemDevSimulationTaskExecutions,
  },
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/kernel/appError.js"),
  import("../../src/application/systemDevSimulationService.js"),
  import("../../src/application/systemDevSimulation/workloads/executionHelpers.js"),
  import("../../src/application/systemDevSimulation/taskExecutionState.js"),
]);

const pendingTaskReleases = new Set<() => void>();

const createTimedWriteFixture = async () => {
  let releaseTask = (): void => undefined;
  const taskGate = new Promise<void>((resolve) => {
    releaseTask = resolve;
  });
  pendingTaskReleases.add(releaseTask);
  let receivedSignal: AbortSignal | null = null;
  let persistedWrites = 0;

  await assert.rejects(
    () =>
      runSystemDevSimulationTimedTask({
        task: async (signal) => {
          receivedSignal = signal;
          await taskGate;
          throwIfSystemDevSimulationTaskAborted(signal);
          persistedWrites += 1;
        },
        timeoutMs: 5,
        phase: "FREE_REPLAY",
        workload: "FREE_REPLAY",
        index: 0,
        target: 1,
        timeoutReason: "ITEM_TIMEOUT",
      }),
    (error) => {
      const failure = error as {
        code?: string;
        args?: Record<string, unknown>;
      };
      assert.equal(failure.code, "SYSTEM_DEV_SIMULATION_FAILED");
      assert.equal(failure.args?.reason, "ITEM_TIMEOUT");
      return true;
    },
  );

  assert.equal(receivedSignal?.aborted, true);
  assert.equal(hasActiveSystemDevSimulationTaskExecution(), true);
  return {
    getPersistedWrites: () => persistedWrites,
    release: () => {
      pendingTaskReleases.delete(releaseTask);
      releaseTask();
    },
  };
};

test.after(async () => {
  for (const release of pendingTaskReleases) {
    release();
  }
  pendingTaskReleases.clear();
  await waitForSystemDevSimulationTaskExecutions();
  db.close();
  if (previousDataDir === undefined) {
    delete process.env.ZINUTO_DATA_DIR;
  } else {
    process.env.ZINUTO_DATA_DIR = previousDataDir;
  }
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test("timed simulation tasks abort before a delayed persistent write", async () => {
  const fixture = await createTimedWriteFixture();

  fixture.release();
  await waitForSystemDevSimulationTaskExecutions();

  assert.equal(fixture.getPersistedWrites(), 0);
  assert.equal(hasActiveSystemDevSimulationTaskExecution(), false);
});

test("a parent stop signal aborts the active task and prevents later writes", async () => {
  const controller = new AbortController();
  let releaseTask = (): void => undefined;
  const taskGate = new Promise<void>((resolve) => {
    releaseTask = resolve;
  });
  pendingTaskReleases.add(releaseTask);
  let childSignal: AbortSignal | null = null;
  let persistedWrites = 0;

  const running = runSystemDevSimulationTimedTask({
    task: async (signal) => {
      childSignal = signal;
      await taskGate;
      throwIfSystemDevSimulationTaskAborted(signal);
      persistedWrites += 1;
    },
    signal: controller.signal,
    timeoutMs: 30_000,
    phase: "DESKTOP_MUTABLE",
    workload: "DESKTOP_MUTABLE",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort(
    appError("SYSTEM_DEV_SIMULATION_INTERRUPTED", {
      reason: "RUNTIME_STOPPED",
    }),
  );

  await assert.rejects(
    running,
    (error: unknown) =>
      (error as { code?: string }).code === "SYSTEM_DEV_SIMULATION_INTERRUPTED",
  );
  assert.equal(childSignal?.aborted, true);
  assert.equal(hasActiveSystemDevSimulationTaskExecution(), true);

  pendingTaskReleases.delete(releaseTask);
  releaseTask();
  await waitForSystemDevSimulationTaskExecutions();
  assert.equal(persistedWrites, 0);
});

test("a same-turn abort cannot promote a resolved task to success", async () => {
  const controller = new AbortController();
  let successValueCommitted = false;

  await assert.rejects(
    async () => {
      const value = await runSystemDevSimulationTimedTask({
        task: async () => {
          queueMicrotask(() => {
            controller.abort(
              appError("SYSTEM_DEV_SIMULATION_INTERRUPTED", {
                reason: "RUNTIME_STOPPED",
              }),
            );
          });
          return 42;
        },
        signal: controller.signal,
        timeoutMs: 30_000,
        phase: "VERIFYING",
        workload: "VERIFYING",
      });
      successValueCommitted = value === 42;
    },
    (error: unknown) =>
      (error as { code?: string }).code === "SYSTEM_DEV_SIMULATION_INTERRUPTED",
  );

  assert.equal(successValueCommitted, false);
});

test("an undrained timed task blocks simulation cleanup and replacement jobs", async () => {
  const fixture = await createTimedWriteFixture();

  await assert.rejects(
    () => cleanupSystemDevSimulationData(),
    (error: unknown) =>
      (error as { code?: string }).code === "SYSTEM_DEV_SIMULATION_JOB_ACTIVE",
  );
  await assert.rejects(
    () => startSystemDevSimulationJob({ profileId: "REALISTIC" }),
    (error: unknown) =>
      (error as { code?: string }).code === "SYSTEM_DEV_SIMULATION_JOB_ACTIVE",
  );

  fixture.release();
  await waitForSystemDevSimulationTaskExecutions();
  assert.equal(fixture.getPersistedWrites(), 0);
});

test("runtime shutdown waits for an undrained timed task to settle", async () => {
  const fixture = await createTimedWriteFixture();
  let shutdownSettled = false;
  const shutdown = stopSystemDevSimulationJobRuntime().then(() => {
    shutdownSettled = true;
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(shutdownSettled, false);

  fixture.release();
  await shutdown;
  assert.equal(shutdownSettled, true);
  assert.equal(fixture.getPersistedWrites(), 0);
});
