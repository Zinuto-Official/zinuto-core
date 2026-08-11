// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import type { ApiLocalDataImportPreviewJob } from '../../src/api';
import {
  waitForLocalDataImportPreviewJobResult,
} from '../../src/app-shell/dataSourceMaintenanceHelpers';
import {
  hasLocalDataImportJobExceededClientDeadline,
} from '../../src/domains/data-import/csvImportJobHelpers';
import { tt } from '../../src/frontend-kernel/i18n/messageRuntime';
import { setCurrentUiLanguage } from '../../src/frontend-kernel/i18n/localeState';

const createPreviewJob = (
  status: ApiLocalDataImportPreviewJob['status'],
): ApiLocalDataImportPreviewJob => ({
  id: 'preview-job-1',
  status,
  stage: status === 'QUEUED' ? 'QUEUED' : 'DONE',
  progressPercent: status === 'SUCCESS' ? 100 : 0,
  processedFiles: status === 'SUCCESS' ? 1 : 0,
  totalFiles: 1,
  result:
    status === 'SUCCESS'
      ? ({ previewToken: 'preview-token-1' } as ApiLocalDataImportPreviewJob['result'])
      : null,
  errorMessage: null,
  errorCode: null,
  errorArgs: null,
  createdAt: '2026-07-16T00:00:00.000Z',
  startedAt: status === 'QUEUED' ? null : '2026-07-16T00:00:00.010Z',
  finishedAt: status === 'SUCCESS' ? '2026-07-16T00:00:00.020Z' : null,
});

beforeEach(() => {
  setCurrentUiLanguage('en', { source: 'USER', storage: null });
});

test('preview polling has an independent client deadline', async () => {
  let nowMs = 0;
  let loadCount = 0;
  await assert.rejects(
    waitForLocalDataImportPreviewJobResult(
      createPreviewJob('QUEUED'),
      'preview failed',
      undefined,
      {
        deadlineMs: 100,
        now: () => nowMs,
        waitForPollInterval: async () => {
          nowMs = 100;
        },
        loadJob: async () => {
          loadCount += 1;
          return createPreviewJob('RUNNING');
        },
      },
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === tt('appText.requestTimedOutTryAgainLater'),
  );
  assert.equal(loadCount, 0);
});

test('preview polling forwards cancellation and request timeout budget', async () => {
  const abortController = new AbortController();
  let requestedTimeoutMs = 0;
  const result = await waitForLocalDataImportPreviewJobResult(
    createPreviewJob('RUNNING'),
    'preview failed',
    undefined,
    {
      signal: abortController.signal,
      deadlineMs: 20_000,
      now: () => 1_000,
      waitForPollInterval: async () => undefined,
      loadJob: async (_jobId, options) => {
        assert.equal(options?.signal, abortController.signal);
        requestedTimeoutMs = options?.timeoutMs ?? 0;
        return createPreviewJob('SUCCESS');
      },
    },
  );
  assert.equal(result?.previewToken, 'preview-token-1');
  assert.equal(requestedTimeoutMs, 15_000);
});

test('preview polling stops before another request when already aborted', async () => {
  const abortController = new AbortController();
  const abortError = new Error('preview navigation stopped');
  abortController.abort(abortError);
  await assert.rejects(
    waitForLocalDataImportPreviewJobResult(
      createPreviewJob('RUNNING'),
      'preview failed',
      undefined,
      {
        signal: abortController.signal,
        loadJob: async () => {
          assert.fail('aborted preview polling must not request another snapshot');
        },
      },
    ),
    abortError,
  );
});

test('import job monitoring uses the server start time with a bounded safety deadline', () => {
  const job = {
    createdAt: '2026-07-16T00:00:00.000Z',
    startedAt: '2026-07-16T00:01:00.000Z',
  };
  const serverStartedAtMs = Date.parse(job.startedAt);
  assert.equal(
    hasLocalDataImportJobExceededClientDeadline({
      job,
      monitorStartedAtMs: serverStartedAtMs + 1_000,
      nowMs: serverStartedAtMs + 10_000,
      deadlineMs: 10_001,
    }),
    false,
  );
  assert.equal(
    hasLocalDataImportJobExceededClientDeadline({
      job,
      monitorStartedAtMs: serverStartedAtMs + 1_000,
      nowMs: serverStartedAtMs + 10_001,
      deadlineMs: 10_001,
    }),
    true,
  );
});
