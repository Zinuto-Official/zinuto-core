// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { createDataSourceRuntimeLifecycle } from "../../src/application/dataSource/runtimeLifecycle.js";

test("data source runtime stop waits for startup cleanup tasks", async () => {
  let releaseCleanup!: () => void;
  const cleanupReleased = new Promise<void>((resolve) => {
    releaseCleanup = resolve;
  });
  let staleCleanupStarted = false;
  let tabularRuntimeStopped = false;
  let stopped = false;

  const runtime = createDataSourceRuntimeLifecycle({
    previewSessionTtlMs: 60_000,
    cleanupPreviewSessions: () => undefined,
    clearPreviewSessions: () => undefined,
    markActiveJobsAsInterrupted: () => undefined,
    pruneRetainedImportJobs: () => undefined,
    cleanupStaleImportUploadTempFiles: async () => {
      staleCleanupStarted = true;
      await cleanupReleased;
    },
    cleanupUntrackedImportUploadTempFiles: async () => undefined,
    stopTabularDuckDbRuntime: async () => {
      tabularRuntimeStopped = true;
    },
  });

  runtime.startDataSourceRuntime();
  assert.equal(staleCleanupStarted, true);

  const stopPromise = runtime.stopDataSourceRuntime().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  assert.equal(tabularRuntimeStopped, false);

  releaseCleanup();
  await stopPromise;
  assert.equal(stopped, true);
  assert.equal(tabularRuntimeStopped, true);
});
