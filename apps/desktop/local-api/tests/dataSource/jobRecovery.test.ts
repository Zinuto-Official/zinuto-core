// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { markActiveImportJobsAsInterruptedCore } from '../../src/application/dataSource/jobRecovery.js';

const createDeps = ({
  activeJobs,
  fileSummary,
}: {
  activeJobs: Array<{
    id: string;
    sourceId: string;
    status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'CANCELED';
    stage: 'QUEUED' | 'SCANNING' | 'IMPORTING' | 'FINALIZING' | 'DONE';
    sourceStatus: 'IMPORTING' | 'READY' | 'FAILED' | null;
    totalFiles: number;
    doneFiles: number;
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    errorFiles: number;
  }>;
  fileSummary: Record<string, { totalFiles: number; importedFiles: number; failedFiles: number }>;
}) => {
  const failedFiles: Array<{ jobId: string; failedAt: string }> = [];
  const recoveredJobs: Array<{ jobId: string; status: 'SUCCESS' | 'PARTIAL_SUCCESS'; errorMessage: string | null }> = [];
  const failedJobs: Array<{ jobId: string; errorFiles: number }> = [];
  const failedSources: string[] = [];

  return {
    deps: {
      listActiveJobsDetail: () => activeJobs,
      nowIso: () => '2026-05-18T00:00:00.000Z',
      withTransaction: (runner: () => void) => runner(),
      failActiveFilesByJob: (jobId: string, failedAt: string) => {
        failedFiles.push({ jobId, failedAt });
      },
      summarizeJobFiles: (jobId: string) => fileSummary[jobId],
      normalizeCount: (value: unknown) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
      },
      calculateFileBasedProgressPercent: (doneFiles: number, totalFiles: number) =>
        totalFiles > 0 ? Math.round((doneFiles / totalFiles) * 100) : 0,
      updateJobFinalFailedInterrupted: ({ jobId, errorFiles }: { jobId: string; errorFiles: number }) => {
        failedJobs.push({ jobId, errorFiles });
      },
      updateJobFinalRecoveredSuccess: ({
        jobId,
        status,
        errorMessage,
      }: {
        jobId: string;
        status: 'SUCCESS' | 'PARTIAL_SUCCESS';
        errorMessage: string | null;
      }) => {
        recoveredJobs.push({ jobId, status, errorMessage });
      },
      updateSourceStatusFailed: (sourceId: string) => {
        failedSources.push(sourceId);
      },
    },
    failedFiles,
    recoveredJobs,
    failedJobs,
    failedSources,
  };
};

test('recovers completed finalizing import job as success', () => {
  const { deps, failedFiles, recoveredJobs, failedJobs, failedSources } = createDeps({
    activeJobs: [
      {
        id: 'job-1',
        sourceId: 'source-1',
        status: 'RUNNING',
        stage: 'FINALIZING',
        sourceStatus: 'READY',
        totalFiles: 444,
        doneFiles: 444,
        totalRows: 5_146_488,
        importedRows: 5_146_488,
        skippedRows: 0,
        errorFiles: 0,
      },
    ],
    fileSummary: {
      'job-1': { totalFiles: 444, importedFiles: 444, failedFiles: 0 },
    },
  });

  markActiveImportJobsAsInterruptedCore(deps);

  assert.deepEqual(recoveredJobs, [{ jobId: 'job-1', status: 'SUCCESS', errorMessage: null }]);
  assert.deepEqual(failedFiles, []);
  assert.deepEqual(failedJobs, []);
  assert.deepEqual(failedSources, []);
});

test('recovers completed finalizing import job with failed files as partial success', () => {
  const { deps, failedFiles, recoveredJobs, failedJobs, failedSources } = createDeps({
    activeJobs: [
      {
        id: 'job-partial',
        sourceId: 'source-1',
        status: 'RUNNING',
        stage: 'FINALIZING',
        sourceStatus: 'READY',
        totalFiles: 3,
        doneFiles: 3,
        totalRows: 10,
        importedRows: 8,
        skippedRows: 0,
        errorFiles: 1,
      },
    ],
    fileSummary: {
      'job-partial': { totalFiles: 3, importedFiles: 2, failedFiles: 1 },
    },
  });

  markActiveImportJobsAsInterruptedCore(deps);

  assert.deepEqual(recoveredJobs, [
    {
      jobId: 'job-partial',
      status: 'PARTIAL_SUCCESS',
      errorMessage: 'LOCAL_DATA_IMPORT_PARTIAL_FAILED',
    },
  ]);
  assert.deepEqual(failedFiles, []);
  assert.deepEqual(failedJobs, []);
  assert.deepEqual(failedSources, []);
});

test('marks incomplete active import job as interrupted', () => {
  const { deps, failedFiles, recoveredJobs, failedJobs, failedSources } = createDeps({
    activeJobs: [
      {
        id: 'job-2',
        sourceId: 'source-2',
        status: 'RUNNING',
        stage: 'IMPORTING',
        sourceStatus: 'IMPORTING',
        totalFiles: 10,
        doneFiles: 4,
        totalRows: 100,
        importedRows: 80,
        skippedRows: 0,
        errorFiles: 0,
      },
    ],
    fileSummary: {
      'job-2': { totalFiles: 10, importedFiles: 4, failedFiles: 0 },
    },
  });

  markActiveImportJobsAsInterruptedCore(deps);

  assert.deepEqual(recoveredJobs, []);
  assert.deepEqual(failedFiles, [{ jobId: 'job-2', failedAt: '2026-05-18T00:00:00.000Z' }]);
  assert.deepEqual(failedJobs, [{ jobId: 'job-2', errorFiles: 0 }]);
  assert.deepEqual(failedSources, ['source-2']);
});
