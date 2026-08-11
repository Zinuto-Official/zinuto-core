// SPDX-License-Identifier: GPL-3.0-only

import { parentPort, workerData } from 'node:worker_threads';
import type { HistoryRetentionJob } from '../domain/historyRetentionTypes.js';

type WorkerInput =
  | {
      mode: 'AUTOMATIC';
      minimumIntervalMs: number;
      deadlineAtMs: number;
    }
  | {
      mode: 'MANUAL';
      deadlineAtMs: number;
    };

type WorkerProgress = Pick<HistoryRetentionJob, 'stage' | 'progressPercent'>;
type WorkerMessage =
  | { type: 'PROGRESS'; value: WorkerProgress }
  | { type: 'RESULT'; value: unknown }
  | { type: 'ERROR'; message: string; name?: string };

const post = (message: WorkerMessage): void => {
  parentPort?.postMessage(message);
};

const postProgress = (
  stage: WorkerProgress['stage'],
  progressPercent: number,
): void => {
  post({ type: 'PROGRESS', value: { stage, progressPercent } });
};

const normalizeInput = (): WorkerInput => {
  const input = workerData as
    | {
        mode?: unknown;
        minimumIntervalMs?: unknown;
        deadlineAtMs?: unknown;
      }
    | undefined;
  const deadlineAtMs = Math.floor(Number(input?.deadlineAtMs) || 0);
  if (input?.mode === 'MANUAL') {
    return { mode: 'MANUAL', deadlineAtMs };
  }
  return {
    mode: 'AUTOMATIC',
    minimumIntervalMs: Math.max(
      0,
      Math.floor(Number(input?.minimumIntervalMs) || 0),
    ),
    deadlineAtMs,
  };
};

const createDeadlineGuard = (deadlineAtMs: number): (() => void) => () => {
  if (deadlineAtMs > 0 && Date.now() >= deadlineAtMs) {
    const error = new Error('HISTORY_RETENTION_MAINTENANCE_TIMEOUT');
    error.name = 'HistoryRetentionMaintenanceTimeoutError';
    throw error;
  }
};

// This must be set before importing the database graph. The worker needs an
// isolated write connection to the existing schema, never schema/seed init.
process.env.ZINUTO_SKIP_DATABASE_AUTO_INIT = '1';

try {
  const input = normalizeInput();
  const assertCanContinue = createDeadlineGuard(input.deadlineAtMs);
  assertCanContinue();
  const [historyRetentionExecution, { closeLocalDatabase }] = await Promise.all([
    import('../application/historyRetentionExecution.js'),
    import('../infrastructure/db/database.js'),
  ]);
  let value: unknown;
  try {
    assertCanContinue();
    if (input.mode === 'MANUAL') {
      postProgress('PREVIEWING', 5);
      postProgress('FREE_REPLAY', 20);
      postProgress('CHALLENGE', 45);
      postProgress('NOTES', 80);
      value = historyRetentionExecution.applyHistoryRetentionPolicyForManualMaintenance({
        assertCanContinue,
      });
      postProgress('FINALIZING', 95);
    } else {
      value = historyRetentionExecution.applyHistoryRetentionPolicyForIdleMaintenance({
        minimumIntervalMs: input.minimumIntervalMs,
        assertCanContinue,
      });
    }
    assertCanContinue();
  } finally {
    closeLocalDatabase();
  }
  post({ type: 'RESULT', value });
} catch (error) {
  post({
    type: 'ERROR',
    name: error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
  });
}
