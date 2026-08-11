// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-market-prewarm-queue-'));
const tempDataDir = path.join(tempRoot, 'data');
await fs.mkdir(tempDataDir, { recursive: true });

const previousDataDir = process.env.ZINUTO_DATA_DIR;
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [{
  closeMarketDatabase,
  ensureMarketTimelinePeriodsReady,
}, { closeLocalDatabase }, { marketDatabaseHarness }] =
  await Promise.all([
    import('../../src/infrastructure/db/marketDatabase.js'),
    import('../../src/infrastructure/db/database.js'),
    import('../support/marketDatabaseHarness.js'),
  ]);

test.afterEach(() => {
  marketDatabaseHarness.resetTimelinePrewarmQueue();
});

test.after(async () => {
  marketDatabaseHarness.resetTimelinePrewarmQueue();
  await closeMarketDatabase();
  closeLocalDatabase();
  if (previousDataDir === undefined) {
    delete process.env.ZINUTO_DATA_DIR;
  } else {
    process.env.ZINUTO_DATA_DIR = previousDataDir;
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('timeline prewarm queue is nonblocking, deduped, and serialized', async () => {
  let releaseFirstRun!: () => void;
  let firstRunStarted!: () => void;
  const firstRunStartedPromise = new Promise<void>((resolve) => {
    firstRunStarted = resolve;
  });
  const releaseFirstRunPromise = new Promise<void>((resolve) => {
    releaseFirstRun = resolve;
  });
  const runs: string[][] = [];

  marketDatabaseHarness.setTimelinePrewarmRunner(async (instrumentIds) => {
    runs.push([...instrumentIds]);
    if (runs.length === 1) {
      firstRunStarted();
      await releaseFirstRunPromise;
    }
  });

  marketDatabaseHarness.enqueueTimelinePrewarm(['instrument-a', 'instrument-a', 'instrument-b']);
  assert.deepEqual(marketDatabaseHarness.getTimelinePrewarmQueueState().pendingInstrumentIds, [
    'instrument-a',
    'instrument-b',
  ]);

  await firstRunStartedPromise;
  marketDatabaseHarness.enqueueTimelinePrewarm(['instrument-b', 'instrument-c']);
  releaseFirstRun();
  await marketDatabaseHarness.awaitTimelinePrewarmIdle();

  assert.deepEqual(runs, [
    ['instrument-a', 'instrument-b'],
    ['instrument-b', 'instrument-c'],
  ]);
  assert.deepEqual(marketDatabaseHarness.getTimelinePrewarmQueueState(), {
    pendingInstrumentIds: [],
    running: false,
    scheduled: false,
    idleWaiterCount: 0,
  });
});

test('timeline build rejects a cancelled foreground request before entering DuckDB work', async () => {
  const controller = new AbortController();
  const reason = new Error('TEST_REQUEST_DISCONNECTED');
  controller.abort(reason);
  await assert.rejects(
    ensureMarketTimelinePeriodsReady(
      {
        instrumentId: 'cancelled-request-instrument',
        versionToken: 'cancelled-request-version',
        baseTimeframe: '1d',
        signal: controller.signal,
      },
      ['1d'],
      { signal: controller.signal },
    ),
    (error: unknown) => error === reason,
  );
});

test('timeline prewarm waits while import jobs are active', async () => {
  const runs: string[][] = [];
  let importActive = true;
  marketDatabaseHarness.setTimelinePrewarmRunner(async (instrumentIds) => {
    runs.push([...instrumentIds]);
  });
  marketDatabaseHarness.setTimelinePrewarmBlocker(() => importActive);

  marketDatabaseHarness.enqueueTimelinePrewarm(['instrument-active']);
  await marketDatabaseHarness.drainTimelinePrewarmQueue();

  assert.deepEqual(runs, []);
  assert.deepEqual(
    marketDatabaseHarness.getTimelinePrewarmQueueState().pendingInstrumentIds,
    ['instrument-active'],
  );

  importActive = false;
  await marketDatabaseHarness.drainTimelinePrewarmQueue();
  await marketDatabaseHarness.awaitTimelinePrewarmIdle();

  assert.deepEqual(runs, [['instrument-active']]);
  assert.deepEqual(marketDatabaseHarness.getTimelinePrewarmQueueState(), {
    pendingInstrumentIds: [],
    running: false,
    scheduled: false,
    idleWaiterCount: 0,
  });
});

test('timeline prewarm stop clears blocked retry work', async () => {
  const runs: string[][] = [];
  marketDatabaseHarness.setTimelinePrewarmRunner(async (instrumentIds) => {
    runs.push([...instrumentIds]);
  });
  marketDatabaseHarness.setTimelinePrewarmBlocker(() => true);

  marketDatabaseHarness.enqueueTimelinePrewarm(['instrument-stopped']);
  await marketDatabaseHarness.drainTimelinePrewarmQueue();
  assert.deepEqual(marketDatabaseHarness.getTimelinePrewarmQueueState(), {
    pendingInstrumentIds: ['instrument-stopped'],
    running: false,
    scheduled: true,
    idleWaiterCount: 0,
  });

  await marketDatabaseHarness.stopTimelinePrewarmQueue();
  assert.deepEqual(marketDatabaseHarness.getTimelinePrewarmQueueState(), {
    pendingInstrumentIds: [],
    running: false,
    scheduled: false,
    idleWaiterCount: 0,
  });
  assert.deepEqual(runs, []);
});

test('timeline prewarm stop waits for active runner before reporting idle', async () => {
  let releaseRunner!: () => void;
  let runnerStarted!: () => void;
  const runnerStartedPromise = new Promise<void>((resolve) => {
    runnerStarted = resolve;
  });
  const releaseRunnerPromise = new Promise<void>((resolve) => {
    releaseRunner = resolve;
  });
  let stopResolved = false;

  marketDatabaseHarness.setTimelinePrewarmRunner(async () => {
    runnerStarted();
    await releaseRunnerPromise;
  });

  marketDatabaseHarness.enqueueTimelinePrewarm(['instrument-running']);
  await runnerStartedPromise;

  const stopPromise = marketDatabaseHarness
    .stopTimelinePrewarmQueue()
    .then(() => {
      stopResolved = true;
    });
  await Promise.resolve();
  assert.equal(stopResolved, false);

  releaseRunner();
  await stopPromise;
  assert.equal(stopResolved, true);
  assert.deepEqual(marketDatabaseHarness.getTimelinePrewarmQueueState(), {
    pendingInstrumentIds: [],
    running: false,
    scheduled: false,
    idleWaiterCount: 0,
  });
});

test('prewarm quiesce aborts and truly drains every background task before reset work can continue', async () => {
  let taskStarted!: () => void;
  let releaseTask!: () => void;
  const taskStartedPromise = new Promise<void>((resolve) => {
    taskStarted = resolve;
  });
  const releaseTaskPromise = new Promise<void>((resolve) => {
    releaseTask = resolve;
  });
  let observedAbort = false;
  let observedCanPublishAfterAbort = true;

  assert.equal(
    marketDatabaseHarness.schedulePrewarmTask(
      'frame:old-epoch',
      async (context) => {
        taskStarted();
        await new Promise<void>((resolve) => {
          context.signal.addEventListener('abort', () => {
            observedAbort = true;
            resolve();
          }, { once: true });
        });
        observedCanPublishAfterAbort = context.canPublish();
        await releaseTaskPromise;
      },
    ),
    true,
  );
  await taskStartedPromise;

  let leaseResolved = false;
  const leasePromise = marketDatabaseHarness
    .acquirePrewarmQuiesceLease()
    .then((lease) => {
      leaseResolved = true;
      return lease;
    });
  await Promise.resolve();

  assert.equal(observedAbort, true);
  assert.equal(observedCanPublishAfterAbort, false);
  assert.equal(leaseResolved, false);
  assert.equal(
    marketDatabaseHarness.schedulePrewarmTask(
      'timeline:rejected-during-reset',
      async () => undefined,
    ),
    false,
  );

  releaseTask();
  const lease = await leasePromise;
  assert.equal(leaseResolved, true);
  assert.equal(marketDatabaseHarness.getPrewarmExecutionState().activeTaskCount, 0);
  assert.equal(
    marketDatabaseHarness.schedulePrewarmTask(
      'frame:still-suspended',
      async () => undefined,
    ),
    false,
  );

  lease.release();
  let newEpochRan = false;
  assert.equal(
    marketDatabaseHarness.schedulePrewarmTask(
      'frame:new-epoch',
      async (context) => {
        context.assertCanPublish();
        newEpochRan = true;
      },
    ),
    true,
  );
  await marketDatabaseHarness.drainTimelinePrewarmQueue();
  assert.equal(newEpochRan, true);
});
