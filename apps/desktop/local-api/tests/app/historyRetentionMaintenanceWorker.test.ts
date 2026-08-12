// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-retention-worker-'),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [
  { db },
  { DB_SCHEMA_VERSION },
  historyRetentionWorkerClient,
  historyRetentionService,
  resetExecutionState,
] =
  await Promise.all([
    import('../../src/infrastructure/db/database.js'),
    import('../../src/infrastructure/db/database/constants.js'),
    import('../../src/runtime/historyRetentionMaintenanceWorkerClient.js'),
    import('../../src/application/historyRetentionService.js'),
    import('../../src/application/trading/resetExecutionState.js'),
  ]);

const {
  hasActiveHistoryRetentionMaintenanceExecution,
  runAutomaticHistoryRetentionInWorker,
  runManualHistoryRetentionInWorker,
  stopHistoryRetentionMaintenanceWorker,
} = historyRetentionWorkerClient;

test.after(async () => {
  await stopHistoryRetentionMaintenanceWorker();
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

const waitForJobTerminal = async (jobId: string): Promise<void> => {
  const deadlineAt = Date.now() + 5_000;
  while (Date.now() < deadlineAt) {
    const job = historyRetentionService.getHistoryRetentionJob(jobId);
    if (job.status === 'SUCCESS' || job.status === 'FAILED') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('history retention job did not become terminal');
};

test('manual retention has an absolute worker deadline and drains after timeout', async () => {
  const task = runManualHistoryRetentionInWorker({ timeoutMs: 1 });
  await assert.rejects(
    task,
    (error: unknown) =>
      error instanceof Error &&
      error.name === 'HistoryRetentionMaintenanceTimeoutError',
  );
  assert.equal(hasActiveHistoryRetentionMaintenanceExecution(), false);
});

test('shutdown cancellation waits for the isolated retention worker to exit', async () => {
  const task = runManualHistoryRetentionInWorker({ timeoutMs: 60_000 });
  assert.equal(hasActiveHistoryRetentionMaintenanceExecution(), true);
  await stopHistoryRetentionMaintenanceWorker();
  await assert.rejects(
    task,
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
  assert.equal(hasActiveHistoryRetentionMaintenanceExecution(), false);
});

test('manual history retention start returns a queued HTTP-safe snapshot', async () => {
  const job = historyRetentionService.startHistoryRetentionJob();

  assert.equal(job.status, 'QUEUED');
  await waitForJobTerminal(job.id);
  assert.equal(historyRetentionService.getHistoryRetentionJob(job.id).status, 'SUCCESS');
});

test('system reset blocks both manual and automatic retention starts', async () => {
  assert.equal(resetExecutionState.tryAcquireSystemResetExecution(), true);
  try {
    assert.throws(
      () => historyRetentionService.startHistoryRetentionJob(),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === 'object' &&
            (error as { code?: unknown }).code === 'SYSTEM_RESET_IN_PROGRESS',
        ),
    );
    await assert.rejects(
      runAutomaticHistoryRetentionInWorker({
        minimumIntervalMs: 0,
        signal: new AbortController().signal,
      }),
      (error: unknown) =>
        error instanceof Error && error.message === 'SYSTEM_RESET_IN_PROGRESS',
    );
  } finally {
    resetExecutionState.releaseSystemResetExecution();
  }
  assert.equal(hasActiveHistoryRetentionMaintenanceExecution(), false);
});

test('user-triggered deletion paths never invoke synchronous database reclaim', () => {
  const sourceUrls = [
    '../../src/application/historyRetentionService.ts',
    '../../src/application/historyRetentionExecution.ts',
    '../../src/application/historyService.ts',
    '../../src/application/specialTrainingStatsService.ts',
    '../../src/application/systemStorageService.ts',
    '../../src/infrastructure/db/history/historyRetentionStore.ts',
  ];
  for (const sourceUrl of sourceUrls) {
    const source = fs.readFileSync(new URL(sourceUrl, import.meta.url), 'utf8');
    assert.doesNotMatch(
      source,
      /\b(?:reclaimDatabaseStorage|runDatabaseMaintenance)\s*\(/u,
      sourceUrl,
    );
  }
});
