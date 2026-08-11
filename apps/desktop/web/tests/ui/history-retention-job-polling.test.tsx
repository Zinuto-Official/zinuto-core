// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import type { ApiHistoryRetentionJob } from '../../src/api';
import {
  HISTORY_RETENTION_JOB_POLL_REQUEST_TIMEOUT_MS,
  pollHistoryRetentionJobUntilTerminal,
} from '../../src/workspaces/settings/historyRetentionJobPolling';

const createJob = (
  status: ApiHistoryRetentionJob['status'],
): ApiHistoryRetentionJob => ({
  id: 'history-retention-job-1',
  status,
  stage: status === 'SUCCESS' ? 'DONE' : 'PREVIEWING',
  progressPercent: status === 'SUCCESS' ? 100 : 5,
  startedAt: '2026-07-16T00:00:00.000Z',
  finishedAt: status === 'SUCCESS' ? '2026-07-16T00:00:01.000Z' : null,
  errorCode: null,
  errorArgs: null,
  result: null,
});

test('history retention polling is recursive single-flight with a bounded request timeout', async () => {
  const abortController = new AbortController();
  const statuses: ApiHistoryRetentionJob['status'][] = [
    'RUNNING',
    'RUNNING',
    'SUCCESS',
  ];
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  let requestCount = 0;
  const seenTimeouts: number[] = [];

  const result = await pollHistoryRetentionJobUntilTerminal({
    initialJob: createJob('QUEUED'),
    signal: abortController.signal,
    waitForPollTick: async () => true,
    isRetryableError: () => false,
    onFailure: () => assert.fail('successful polling must not report failure'),
    onJob: () => undefined,
    loadJob: async (_jobId, options) => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      seenTimeouts.push(options.timeoutMs ?? 0);
      await Promise.resolve();
      const next = createJob(statuses[requestCount] ?? 'SUCCESS');
      requestCount += 1;
      activeRequests -= 1;
      return next;
    },
  });

  assert.equal(result.status, 'COMPLETED');
  assert.equal(requestCount, 3);
  assert.equal(maximumActiveRequests, 1);
  assert.deepEqual(seenTimeouts, [
    HISTORY_RETENTION_JOB_POLL_REQUEST_TIMEOUT_MS,
    HISTORY_RETENTION_JOB_POLL_REQUEST_TIMEOUT_MS,
    HISTORY_RETENTION_JOB_POLL_REQUEST_TIMEOUT_MS,
  ]);
});

test('continuous polling failures stop visibly and can be retried by the caller', async () => {
  const failures: boolean[] = [];
  let requestCount = 0;
  const result = await pollHistoryRetentionJobUntilTerminal({
    initialJob: createJob('RUNNING'),
    signal: new AbortController().signal,
    waitForPollTick: async () => true,
    isRetryableError: () => true,
    onJob: () => assert.fail('failed polling must not publish a job'),
    onFailure: ({ willRetry }) => failures.push(willRetry),
    loadJob: async () => {
      requestCount += 1;
      throw new Error('BACKEND_TRANSPORT_UNAVAILABLE');
    },
  });

  assert.equal(result.status, 'FAILED');
  assert.equal(requestCount, 3);
  assert.deepEqual(failures, [true, true, false]);
});

test('non-retryable polling failures stop after one visible failure', async () => {
  const failures: boolean[] = [];
  let requestCount = 0;
  const result = await pollHistoryRetentionJobUntilTerminal({
    initialJob: createJob('RUNNING'),
    signal: new AbortController().signal,
    waitForPollTick: async () => true,
    isRetryableError: () => false,
    onJob: () => assert.fail('failed polling must not publish a job'),
    onFailure: ({ willRetry }) => failures.push(willRetry),
    loadJob: async () => {
      requestCount += 1;
      throw new Error('HISTORY_RETENTION_JOB_NOT_FOUND');
    },
  });

  assert.equal(result.status, 'FAILED');
  assert.equal(requestCount, 1);
  assert.deepEqual(failures, [false]);
});

test('unmount cancellation stops polling before another request starts', async () => {
  const abortController = new AbortController();
  let requestCount = 0;
  const result = await pollHistoryRetentionJobUntilTerminal({
    initialJob: createJob('RUNNING'),
    signal: abortController.signal,
    waitForPollTick: async () => {
      abortController.abort();
      return false;
    },
    isRetryableError: () => false,
    onJob: () => undefined,
    onFailure: () => undefined,
    loadJob: async () => {
      requestCount += 1;
      return createJob('SUCCESS');
    },
  });

  assert.equal(result.status, 'CANCELLED');
  assert.equal(requestCount, 0);
});
