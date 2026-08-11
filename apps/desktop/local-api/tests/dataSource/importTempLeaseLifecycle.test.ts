// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DEFAULT_TRADING_CALENDAR_CONFIG } from '@zinuto/shared/tradingCalendar';
import { createLocalDataImportPreviewJobService } from '../../src/application/dataSource/importPreviewJobService.js';
import { createPreviewImportPlanningService } from '../../src/application/dataSource/previewImportPlanning.js';
import {
  createImportTempDirLeaseStore,
  createImportTempFileTools,
  createProtectedImportTempDirRemover,
} from '../../src/application/dataSource/tempFiles.js';
import type {
  LocalDataImportJobDetail,
  StartLocalDataImportInput,
} from '../../src/application/dataSource/types.js';
import { createPreviewImportSessionStore } from '../../src/infrastructure/db/dataSource/previewSessionStore.js';

const DEFAULT_MAPPING = {
  timestampMode: 'SINGLE',
  date: 'date',
  time: '',
  open: 'open',
  high: 'high',
  low: 'low',
  close: 'close',
  volume: 'volume',
} as const;

const NO_SYMBOL_LIMIT = {
  limitApplied: false,
  maxSymbols: null,
  selectedSymbols: ['AAPL'],
  skippedSymbols: [],
  skippedSymbolCount: 0,
  reason: null,
} as const;

const createAppError = (code: string): Error =>
  Object.assign(new Error(code), { code });

const createDeferred = <Value = void>() => {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const exists = async (filePath: string): Promise<boolean> =>
  fs.stat(filePath).then(() => true, () => false);

const buildJobDetail = (): LocalDataImportJobDetail => ({
  id: 'job-1',
  sourceId: 'source-1',
  sourceName: 'source',
  timeZone: 'Etc/UTC',
  baseTimeframe: '1d',
  jobMode: 'FULL_IMPORT',
  status: 'QUEUED',
  stage: 'QUEUED',
  progressPercent: 0,
  compactProgressPercent: 0,
  compactBeforeBytes: 0,
  compactAfterBytes: 0,
  compactReclaimedBytes: 0,
  totalFiles: 1,
  doneFiles: 0,
  totalRows: 0,
  importedRows: 0,
  skippedRows: 0,
  errorFiles: 0,
  currentFileName: null,
  errorMessage: null,
  createdAt: '2026-07-15T00:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  isPaused: false,
  cancelRequested: false,
  outcomeSummary: null,
  failedFiles: [],
});

const waitForPreviewJobStatus = async (
  readStatus: () => string,
  expectedStatus: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (readStatus() === expectedStatus) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail(`preview job did not reach ${expectedStatus}`);
};

test('confirm keeps the staged root leased when the preview expires during file resolution', async (t) => {
  const uploadTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-confirm-ttl-lease-'),
  );
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const stagedRoot = path.join(uploadTempDir, 'staged-confirm');
  const stagedFilePath = path.join(stagedRoot, 'AAPL.csv');
  await fs.mkdir(stagedRoot, { recursive: true });
  await fs.writeFile(stagedFilePath, 'date,open\n2024-01-01,1\n', 'utf8');

  const tempFileTools = createImportTempFileTools(
    uploadTempDir,
    (code) => createAppError(code),
  );
  const leaseStore = createImportTempDirLeaseStore({
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
  });
  let nowMs = 0;
  let activeFilePaths: string[] = [];
  let expirationCleanup = Promise.resolve();
  let removeImportTempDirsByPath: (dirPaths: string[]) => Promise<void> =
    async () => undefined;
  const previewStore = createPreviewImportSessionStore({
    ttlMs: 10,
    maxEntries: 4,
    nowMs: () => nowMs,
    createToken: () => 'preview-token',
    onDiscardFolder: (folderPath) => {
      expirationCleanup = removeImportTempDirsByPath([folderPath]);
    },
  });
  removeImportTempDirsByPath = createProtectedImportTempDirRemover({
    listActiveFilePathRows: () =>
      activeFilePaths.map((filePath) => ({ filePath })),
    listRetainedTempDirPaths: previewStore.listFolderPaths,
    listLeasedTempDirPaths: leaseStore.listLeasedTempDirPaths,
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
    removeImportTempDirsByPathUnchecked:
      tempFileTools.removeImportTempDirsByPath,
  });

  const previewToken = previewStore.save({
    folderPath: stagedRoot,
    plans: [
      {
        id: 'plan-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        symbolCount: 1,
        fileCount: 1,
        files: [
          {
            originalname: 'AAPL.csv',
            path: stagedFilePath,
            size: 32,
            mtimeMs: 1,
            symbol: 'AAPL',
            relativePath: 'AAPL.csv',
            detectedTimeframe: '1d',
            headers: ['date', 'open', 'high', 'low', 'close', 'volume'],
            mapping: DEFAULT_MAPPING,
          },
        ],
      },
    ],
  });
  const resolverEntered = createDeferred();
  const allowResolverToFinish = createDeferred();
  const service = createPreviewImportPlanningService({
    assertLocalImportPreviewAccess: async () => undefined,
    assertLocalImportMutationAccess: async () => undefined,
    previewStore,
    resolveImportFilesFromPreviewPlan: async () => {
      resolverEntered.resolve();
      await allowResolverToFinish.promise;
      return {
        files: [
          {
            originalname: 'AAPL.csv',
            path: stagedFilePath,
            size: 32,
            symbol: 'AAPL',
            mapping: DEFAULT_MAPPING,
          },
        ],
        tempDirPaths: [stagedRoot],
        sourceFolder: '/source',
        snapshotSymbols: ['AAPL'],
        sourceTotalFiles: 1,
        symbolLimit: { ...NO_SYMBOL_LIMIT },
      };
    },
    startLocalDataImportJob: async (
      _input: StartLocalDataImportInput,
    ) => {
      activeFilePaths = [stagedFilePath];
      return buildJobDetail();
    },
    invalidateLocalDataSourcesCache: () => undefined,
    listLocalDataSources: async () => [],
    listImportedSymbolsBySource: () => [],
    resolveLocalImportSymbolLimit: async () => null,
    acquireImportTempDirLease: leaseStore.acquireImportTempDirLease,
    removeImportTempDirsByPath,
    appError: (code) => createAppError(code),
  });

  const startPromise = service.startLocalDataImportJobFromPreviewPlan({
    previewToken,
    previewPlanId: 'plan-1',
    userOverrides: {
      sourceName: 'source',
      sourceFolder: '/source',
      timeZone: 'Etc/UTC',
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
    },
  });
  await resolverEntered.promise;

  nowMs = 10;
  previewStore.cleanupExpiredSessions();
  await expirationCleanup;
  assert.equal(await exists(stagedFilePath), true);

  allowResolverToFinish.resolve();
  await startPromise;
  assert.equal(await exists(stagedFilePath), true);

  activeFilePaths = [];
  await removeImportTempDirsByPath([stagedRoot]);
  assert.equal(await exists(stagedRoot), false);
});

test('a failed preview cannot delete a shared staged root while another preview awaits local access', async (t) => {
  const uploadTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-preview-concurrent-lease-'),
  );
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });

  const stagedRoot = path.join(uploadTempDir, 'staged-preview');
  const stagedFilePath = path.join(stagedRoot, 'AAPL.csv');
  await fs.mkdir(stagedRoot, { recursive: true });
  await fs.writeFile(stagedFilePath, 'date,open\n2024-01-01,1\n', 'utf8');

  const tempFileTools = createImportTempFileTools(
    uploadTempDir,
    (code) => createAppError(code),
  );
  const leaseStore = createImportTempDirLeaseStore({
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
  });
  const previewStore = createPreviewImportSessionStore({
    ttlMs: 1000,
    maxEntries: 4,
    nowMs: () => 0,
    createToken: () => 'unused-preview-token',
  });
  const removeImportTempDirsByPath = createProtectedImportTempDirRemover({
    listActiveFilePathRows: () => [],
    listRetainedTempDirPaths: previewStore.listFolderPaths,
    listLeasedTempDirPaths: leaseStore.listLeasedTempDirPaths,
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
    removeImportTempDirsByPathUnchecked:
      tempFileTools.removeImportTempDirsByPath,
  });
  const firstAccess = createDeferred();
  const secondAccess = createDeferred();
  const scanEntered = createDeferred();
  const allowScanToFail = createDeferred();
  let accessCalls = 0;
  let idCounter = 0;
  const service = createLocalDataImportPreviewJobService({
    normalizeImportFilePath: tempFileTools.normalizeImportFilePath,
    assertManagedImportTempPath: tempFileTools.assertManagedImportTempPath,
    assertLocalImportPreviewAccess: async () => {
      accessCalls += 1;
      await (accessCalls === 1 ? firstAccess.promise : secondAccess.promise);
    },
    previewLocalDataImportFolder: async () => {
      scanEntered.resolve();
      await allowScanToFail.promise;
      throw createAppError('LOCAL_DATA_IMPORT_PREVIEW_FAILED');
    },
    previewImportSessionStore: previewStore,
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    listAllFilePaths: () => [],
    acquireImportTempDirLease: leaseStore.acquireImportTempDirLease,
    removeImportTempDirsByPath,
    createId: () => `preview-job-${idCounter += 1}`,
    nowIso: () => '2026-07-15T00:00:00.000Z',
  });

  const firstStart = service.startLocalDataImportPreviewJob(stagedRoot);
  const secondStart = service.startLocalDataImportPreviewJob(stagedRoot);
  const firstRejected = assert.rejects(
    firstStart,
    (error) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'LOCAL_DATA_IMPORT_PREVIEW_BUSY',
  );

  firstAccess.reject(createAppError('LOCAL_DATA_IMPORT_PREVIEW_BUSY'));
  await firstRejected;
  assert.equal(await exists(stagedFilePath), true);

  secondAccess.resolve();
  const secondJob = await secondStart;
  await scanEntered.promise;
  assert.equal(await exists(stagedFilePath), true);

  allowScanToFail.resolve();
  await waitForPreviewJobStatus(
    () => service.getLocalDataImportPreviewJob(secondJob.id).status,
    'FAILED',
  );
  await service.stopLocalDataImportPreviewJobs();
  assert.equal(service.hasActiveLocalDataImportPreviewExecutions(), false);
  assert.equal(await exists(stagedRoot), false);
});

test('preview deadline is terminal immediately but execution stays tracked until abort drain completes', async (t) => {
  const uploadTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'zinuto-preview-deadline-'),
  );
  t.after(async () => {
    await fs.rm(uploadTempDir, { recursive: true, force: true });
  });
  const stagedRoot = path.join(uploadTempDir, 'staged-preview');
  await fs.mkdir(stagedRoot, { recursive: true });
  await fs.writeFile(
    path.join(stagedRoot, 'AAPL.csv'),
    'date,open\n2024-01-01,1\n',
    'utf8',
  );

  const tempFileTools = createImportTempFileTools(
    uploadTempDir,
    (code) => createAppError(code),
  );
  const leaseStore = createImportTempDirLeaseStore({
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
  });
  const previewStore = createPreviewImportSessionStore({
    ttlMs: 1000,
    maxEntries: 4,
    nowMs: () => 0,
    createToken: () => 'unused-preview-token',
  });
  const removeImportTempDirsByPath = createProtectedImportTempDirRemover({
    listActiveFilePathRows: () => [],
    listRetainedTempDirPaths: previewStore.listFolderPaths,
    listLeasedTempDirPaths: leaseStore.listLeasedTempDirPaths,
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    readDistinctImportTempDirPaths:
      tempFileTools.readDistinctImportTempDirPaths,
    removeImportTempDirsByPathUnchecked:
      tempFileTools.removeImportTempDirsByPath,
  });
  const abortObserved = createDeferred();
  const releaseAbortDrain = createDeferred();
  const service = createLocalDataImportPreviewJobService({
    normalizeImportFilePath: tempFileTools.normalizeImportFilePath,
    assertManagedImportTempPath: tempFileTools.assertManagedImportTempPath,
    assertLocalImportPreviewAccess: async () => undefined,
    previewLocalDataImportFolder: async (
      _folderPath,
      _sourceId,
      _locale,
      _sourceFolderName,
      _onProgress,
      signal,
    ) => new Promise((resolve, reject) => {
      const onAbort = (): void => {
        abortObserved.resolve();
        void releaseAbortDrain.promise.then(() => reject(signal?.reason));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
      }
    }),
    previewImportSessionStore: previewStore,
    readDistinctFilePaths: tempFileTools.readDistinctFilePaths,
    listAllFilePaths: () => [],
    acquireImportTempDirLease: leaseStore.acquireImportTempDirLease,
    removeImportTempDirsByPath,
    createId: () => 'preview-deadline-job',
    nowIso: () => '2026-07-16T00:00:00.000Z',
    previewDeadlineMs: 10,
    maxConcurrentPreviewJobs: 1,
  });

  const queued = await service.startLocalDataImportPreviewJob(stagedRoot);
  await abortObserved.promise;
  const failed = service.getLocalDataImportPreviewJob(queued.id);
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.stage, 'DONE');
  assert.equal(failed.errorCode, 'LOCAL_DATA_IMPORT_PREVIEW_TIMEOUT');
  assert.deepEqual(failed.errorArgs, { timeoutMs: 10 });
  assert.equal(service.hasActiveLocalDataImportPreviewExecutions(), true);
  assert.equal(await exists(stagedRoot), true);

  let stopSettled = false;
  const stopPromise = service.stopLocalDataImportPreviewJobs().then(() => {
    stopSettled = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(stopSettled, false);

  releaseAbortDrain.resolve();
  await stopPromise;
  assert.equal(service.hasActiveLocalDataImportPreviewExecutions(), false);
  assert.equal(await exists(stagedRoot), false);
});
