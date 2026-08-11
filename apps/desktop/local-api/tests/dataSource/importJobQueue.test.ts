// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { createImportJobQueue } from "../../src/application/dataSource/importJobQueue.js";

const waitForQueueTurn = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });
};

test("import job queue keeps draining when the error handler fails", async (t) => {
  const previousError = console.error;
  const errorLogs: unknown[] = [];
  console.error = (...args: unknown[]) => {
    errorLogs.push(args);
  };
  t.after(() => {
    console.error = previousError;
  });

  const processed: number[] = [];
  const handled: number[] = [];
  const settled: number[] = [];
  const queue = createImportJobQueue<number>({
    concurrency: 1,
    processJob: async (job) => {
      processed.push(job);
      throw new Error(`process-${job}`);
    },
    handleProcessError: async (job) => {
      handled.push(job);
      if (job === 1) {
        throw new Error("handler-failed");
      }
    },
    onJobSettled: (job) => {
      settled.push(job);
    },
  });

  queue.enqueue(1);
  queue.enqueue(2);

  for (let attempt = 0; attempt < 20 && handled.length < 2; attempt += 1) {
    await waitForQueueTurn();
  }

  assert.deepEqual(processed, [1, 2]);
  assert.deepEqual(handled, [1, 2]);
  assert.deepEqual(settled, [1, 2]);
  assert.equal(errorLogs.length, 1);
});

test("import job queue settles only after terminal success or failure handling", async () => {
  const events: string[] = [];
  const queue = createImportJobQueue<number>({
    concurrency: 1,
    processJob: async (job) => {
      events.push(`process:${job}`);
      if (job === 2) {
        throw new Error("failed");
      }
      events.push(`success:${job}`);
    },
    handleProcessError: async (job) => {
      events.push(`failure:${job}`);
    },
    onJobSettled: (job) => {
      events.push(`settled:${job}`);
    },
  });

  queue.enqueue(1);
  queue.enqueue(2);

  for (
    let attempt = 0;
    attempt < 20 && !events.includes("settled:2");
    attempt += 1
  ) {
    await waitForQueueTurn();
  }

  assert.deepEqual(events, [
    "process:1",
    "success:1",
    "settled:1",
    "process:2",
    "failure:2",
    "settled:2",
  ]);
});

test("import job queue stop clears queued work and waits for active workers", async () => {
  let releaseActiveJob!: () => void;
  const activeJobReleased = new Promise<void>((resolve) => {
    releaseActiveJob = resolve;
  });
  const processed: number[] = [];
  const queue = createImportJobQueue<number>({
    concurrency: 1,
    processJob: async (job) => {
      processed.push(job);
      if (job === 1) {
        await activeJobReleased;
      }
    },
    handleProcessError: async () => undefined,
  });

  queue.enqueue(1);
  queue.enqueue(2);

  for (let attempt = 0; attempt < 20 && processed.length < 1; attempt += 1) {
    await waitForQueueTurn();
  }

  const stopPromise = queue.stop();
  await waitForQueueTurn();
  assert.deepEqual(processed, [1]);
  assert.throws(() => queue.enqueue(3), /IMPORT_JOB_QUEUE_STOPPED/u);

  releaseActiveJob();
  await stopPromise;
  assert.deepEqual(processed, [1]);
});

test("import job queue rejects new queued work above the configured limit", () => {
  const queue = createImportJobQueue<number>({
    concurrency: 1,
    maxQueuedJobs: 1,
    processJob: async () => undefined,
    handleProcessError: async () => undefined,
  });

  queue.enqueue(1);
  assert.throws(() => queue.assertCanEnqueue(), /IMPORT_JOB_QUEUE_FULL/u);
  assert.throws(() => queue.enqueue(2), /IMPORT_JOB_QUEUE_FULL/u);
});
