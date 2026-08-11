// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import { processQueuedImportJob } from '../../src/application/dataSource/importJobExecutor.js';

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

const createRunStatement = (onRun?: () => void) => {
  const calls: unknown[][] = [];
  return {
    calls,
    run: (...args: unknown[]) => {
      onRun?.();
      calls.push(args);
      return undefined;
    },
  };
};

type ProcessDepsBatchResult = {
  fileName?: string;
  symbol?: string;
  instrumentId?: string;
  rows: number;
  prependedRows?: number;
  appendedRows?: number;
  overlapRowsIgnored?: number;
  internalRangeRowsIgnored?: number;
  conflictRowsIgnored?: number;
  invalidRequiredRowsSkipped?: number;
  invalidOhlcRowsSkipped?: number;
  duplicateConflictRowsSkipped?: number;
  duplicateIdenticalRowsDeduped?: number;
  errorMessage?: string;
};

type ProcessDepsScenario =
  | ProcessDepsBatchResult
  | ProcessDepsBatchResult[]
  | {
      throwError: unknown;
    };

const isThrowScenario = (scenario: ProcessDepsScenario): scenario is { throwError: unknown } =>
  !Array.isArray(scenario) && Object.prototype.hasOwnProperty.call(scenario, 'throwError');

const createProcessDeps = (scenario: ProcessDepsScenario) => {
  const terminalPublicationOrder: string[] = [];
  const importAbortController = new AbortController();
  const updateSourceStatusStmt = createRunStatement();
  const updateJobRunningStmt = createRunStatement();
  const updateJobProgressStmt = createRunStatement();
  const updateFileImportingStmt = createRunStatement();
  const updateFileProgressStmt = createRunStatement();
  const updateFileImportedStmt = createRunStatement();
  const updateFileFailedStmt = createRunStatement();
  const updateSourceFinalStmt = createRunStatement();
  const updateJobFinalStmt = createRunStatement(() => {
    terminalPublicationOrder.push('job-terminal');
  });
  const updateJobCompactingProgressStmt = createRunStatement();
  const updateJobCompactionBaselineStmt = createRunStatement();
  const updateJobCompactionResultStmt = createRunStatement();
  const updateSourceStorageBytesStmt = createRunStatement();
  const updateFileFailureDetailsCalls: Array<{
    fileRowId: string;
    errorCode: string;
    causeJson: string;
    detailsJson: string;
    diagnosticsJson: string;
    updatedAt: string;
  }> = [];
  const updateJobFailureDetailsCalls: Array<{
    jobId: string;
    errorCode: string | null;
    causeJson: string | null;
    detailsJson: string | null;
    failureSummaryJson: string | null;
    updatedAt: string;
  }> = [];

  let importSucceededCalls = 0;
  let checkpointCalls = 0;
  let maintenanceCalls = 0;
  const derivedDataRefreshCalls: string[][] = [];
  const timelinePrewarmCalls: string[][] = [];

  return {
    deps: {
      nowIso: () => '2026-04-10T00:00:00.000Z',
      fileStatusImporting: 'IMPORTING',
      fileStatusImported: 'IMPORTED',
      fileStatusFailed: 'FAILED',
      resolveRuntimeImportParallelFiles: () => 1,
      resolveImportInitialBatchFiles: () => 1,
      normalizeImportFilePath: (filePath: string) => String(filePath || '').trim(),
      removeImportTempFilesByPath: async (_filePaths: string[]) => undefined,
      removeImportTempDirsByPath: async (_dirPaths: string[]) => undefined,
      updateSourceStatusStmt,
      updateJobRunningStmt,
      ensureImportJobControlState: (_jobId: string) => undefined,
      getImportJobAbortSignal: (_jobId: string) => importAbortController.signal,
      abortImportJob: (_jobId: string, reason: unknown) => {
        if (!importAbortController.signal.aborted) {
          importAbortController.abort(reason);
        }
      },
      importJobExecutionDeadlineMs: 60_000,
      calculateRunningImportProgressPercent: () => 50,
      updateJobProgressStmt,
      importCsvFilesBatchedWithProgress: async () => [],
      importCsvFilesIncrementalWithProgress: async () => {
        if (isThrowScenario(scenario)) {
          throw scenario.throwError;
        }
        const scenarioResults = Array.isArray(scenario) ? scenario : [scenario];
        return scenarioResults.map((result) => ({
          fileName: result.fileName ?? 'AAPL_1d.csv',
          symbol: result.symbol ?? 'AAPL',
          instrumentId: result.instrumentId,
          rows: result.rows,
          mapping: {},
          prependedRows: result.prependedRows ?? 0,
          appendedRows: result.appendedRows ?? 0,
          overlapRowsIgnored: result.overlapRowsIgnored ?? 0,
          internalRangeRowsIgnored: result.internalRangeRowsIgnored ?? 0,
          conflictRowsIgnored: result.conflictRowsIgnored ?? 0,
          invalidRequiredRowsSkipped: result.invalidRequiredRowsSkipped ?? 0,
          invalidOhlcRowsSkipped: result.invalidOhlcRowsSkipped ?? 0,
          duplicateConflictRowsSkipped: result.duplicateConflictRowsSkipped ?? 0,
          duplicateIdenticalRowsDeduped: result.duplicateIdenticalRowsDeduped ?? 0,
          errorMessage: result.errorMessage,
        }));
      },
      readImportJobControlState: (_jobId: string) => ({ paused: false, cancelRequested: false }),
      createCanceledImportError: () => new Error('LOCAL_DATA_IMPORT_JOB_CANCELED'),
      isCanceledImportError: (_error: unknown) => false,
      updateFileImportingStmt,
      updateFileProgressStmt,
      updateFileImportedStmt,
      updateFileFailedStmt,
      updateFileFailureDetails: (input: typeof updateFileFailureDetailsCalls[number]) => {
        updateFileFailureDetailsCalls.push(input);
      },
      waitForJobControlRelease: async (_jobId: string) => 'CONTINUE' as const,
      resolveImportBatchSize: () => 1,
      listImportedSymbolsBySourceStmt: {
        all: (_sourceId: string) => [],
      },
      summarizeSourceBars: async (_symbols: string[]) => ({
        symbolCount: 0,
        barCount: 0,
        startTs: null,
        endTs: null,
      }),
      estimateSourceStorageBytesFromCurrentMarket: async (_barCount: number) => 0,
      calculateFileBasedProgressPercent: () => 100,
      updateSourceFinalStmt,
      beforePublishTerminalJob: () => {
        terminalPublicationOrder.push('source-cache-invalidated');
      },
      updateJobFinalStmt,
      updateJobFailureDetails: (input: typeof updateJobFailureDetailsCalls[number]) => {
        updateJobFailureDetailsCalls.push(input);
      },
      checkpointMarketStorage: async () => {
        checkpointCalls += 1;
      },
      clearImportJobControlState: (_jobId: string) => undefined,
      updateJobCompactingProgressStmt,
      importCompactProgressBasePercent: 90,
      normalizeCompactProgressPercent: (progressPercent: number) => progressPercent,
      normalizeProgressPercent: (progressPercent: number) => progressPercent,
      getMarketStorageFootprint: async () => ({ dbBytes: 0, totalBytes: 0 }),
      toSafeStorageBytes: (storageBytes: number) => Math.max(0, Math.floor(Number(storageBytes) || 0)),
      updateJobCompactionBaselineStmt,
      countActiveJobs: () => 0,
      runMarketMaintenance: async () => {
        maintenanceCalls += 1;
        return {
          footprintBefore: { dbBytes: 0, totalBytes: 0 },
          footprintAfter: { dbBytes: 0, totalBytes: 0 },
          reclaimedBytes: 0,
        };
      },
      resolveOverallProgressFromMaintenancePercent: (maintenanceProgressPercent: number) =>
        maintenanceProgressPercent,
      updateJobCompactionResultStmt,
      updateSourceStorageBytesStmt,
      onImportJobSucceeded: async () => {
        importSucceededCalls += 1;
      },
      refreshImportedInstrumentDerivedData: async (instrumentIds: string[]) => {
        derivedDataRefreshCalls.push([...instrumentIds]);
      },
      enqueueImportedInstrumentTimelinePrewarm: (instrumentIds: string[]) => {
        timelinePrewarmCalls.push([...instrumentIds]);
      },
      deleteSourceFilesBySourceSymbolExceptJob: (_sourceId: string, _symbol: string, _currentJobId: string) =>
        0,
      deleteSourceFilesBySourceSymbol: (_sourceId: string, _symbol: string) => 0,
      countImportedSymbolOnOtherSources: (_sourceId: string, _symbol: string, _baseTimeframe: string) => 0,
      getLocalInstrumentBySymbol: (_symbol: string, _baseTimeframe: string) => undefined,
      removeMarketInstrumentData: async (_instrumentId: string) => undefined,
      deleteInstrumentById: (_instrumentId: string) => 0,
    },
    updateJobFinalStmt,
    updateSourceFinalStmt,
    updateFileFailedStmt,
    updateFileFailureDetailsCalls,
    updateJobFailureDetailsCalls,
    getImportSucceededCalls: () => importSucceededCalls,
    getCheckpointCalls: () => checkpointCalls,
    getMaintenanceCalls: () => maintenanceCalls,
    getDerivedDataRefreshCalls: () => derivedDataRefreshCalls,
    getTimelinePrewarmCalls: () => timelinePrewarmCalls,
    getTerminalPublicationOrder: () => terminalPublicationOrder,
  };
};

test('failed replacement import never exposes a mixed old/new source as ready', async () => {
  const scenario = [
    {
      fileName: 'AAPL.csv',
      symbol: 'AAPL',
      rows: 0,
      invalidRequiredRowsSkipped: 1,
      errorMessage: 'CSV_NO_VALID_BARS',
    },
    {
      fileName: 'MSFT.csv',
      symbol: 'MSFT',
      instrumentId: 'instrument-msft',
      rows: 2,
    },
  ];
  const { deps, updateSourceFinalStmt } = createProcessDeps(scenario);
  deps.importCsvFilesBatchedWithProgress = deps.importCsvFilesIncrementalWithProgress;
  deps.resolveRuntimeImportParallelFiles = () => 2;
  deps.resolveImportInitialBatchFiles = () => 2;
  deps.resolveImportBatchSize = () => 2;
  deps.summarizeSourceBars = async () => ({
    symbolCount: 2,
    barCount: 10,
    startTs: '2024-01-01T00:00:00.000Z',
    endTs: '2024-01-10T00:00:00.000Z',
  });

  await processQueuedImportJob(
    {
      ...baseQueuedJob,
      jobMode: 'FULL_IMPORT',
      replaceExistingSource: true,
      files: [
        baseQueuedJob.files[0]!,
        {
          fileRowId: 'file-row-2',
          fileName: 'MSFT.csv',
          filePath: '/tmp/MSFT.csv',
          fileSize: 100,
          symbol: 'MSFT',
        },
      ],
    },
    deps,
  );

  const sourceFinalCall = updateSourceFinalStmt.calls.at(-1);
  assert.ok(sourceFinalCall);
  assert.equal(sourceFinalCall[0], 'FAILED');
});

const baseQueuedJob = {
  sourceId: 'source-1',
  sourceName: 'source-1',
  baseTimeframe: '1d' as const,
  jobMode: 'INCREMENTAL_UPDATE' as const,
  sourceFolderUsageMode: 'BOUND_SOURCE' as const,
  timezone: 'Etc/UTC',
  jobId: 'job-1',
  mapping: DEFAULT_MAPPING,
  files: [
    {
      fileRowId: 'file-row-1',
      fileName: 'AAPL_1d.csv',
      filePath: '/tmp/AAPL_1d.csv',
      fileSize: 100,
      symbol: 'AAPL',
    },
  ],
};

test('incremental job outcome summary accumulates edge counters from importer results', async () => {
  const {
    deps,
    updateJobFinalStmt,
    getImportSucceededCalls,
    getCheckpointCalls,
    getMaintenanceCalls,
    getTerminalPublicationOrder,
  } = createProcessDeps({
    rows: 5,
    prependedRows: 2,
    appendedRows: 3,
    overlapRowsIgnored: 4,
  });

  await processQueuedImportJob(baseQueuedJob, deps);

  const finalCall = updateJobFinalStmt.calls.at(-1);
  assert.ok(finalCall);
  const outcomeSummaryJson = finalCall?.[9];
  assert.equal(typeof outcomeSummaryJson, 'string');
  const outcomeSummary = JSON.parse(String(outcomeSummaryJson));

  assert.equal(outcomeSummary.prependedRows, 2);
  assert.equal(outcomeSummary.appendedRows, 3);
  assert.equal(outcomeSummary.overlapRowsIgnored, 4);
  assert.equal(outcomeSummary.internalRangeRowsIgnored, 0);
  assert.equal(outcomeSummary.conflictRowsIgnored, 0);
  assert.deepEqual(outcomeSummary.qualityWarnings, {
    filesWithSkippedRows: 0,
    invalidRequiredRowsSkipped: 0,
    invalidOhlcRowsSkipped: 0,
    duplicateConflictRowsSkipped: 0,
    duplicateIdenticalRowsDeduped: 0,
  });
  assert.equal(outcomeSummary.noChanges, false);
  assert.equal(getImportSucceededCalls(), 1);
  assert.equal(getCheckpointCalls(), 1);
  assert.equal(getMaintenanceCalls(), 0);
  assert.deepEqual(getTerminalPublicationOrder(), [
    'source-cache-invalidated',
    'job-terminal',
  ]);
});

test('successful source stays importing until finalization has drained', async () => {
  const {
    deps,
    updateSourceFinalStmt,
    updateJobFinalStmt,
  } = createProcessDeps({
    rows: 5,
    instrumentId: 'instrument-aapl',
  });
  let releaseCheckpoint!: () => void;
  const checkpointReleased = new Promise<void>((resolve) => {
    releaseCheckpoint = resolve;
  });
  let checkpointStarted = false;
  deps.checkpointMarketStorage = async () => {
    checkpointStarted = true;
    await checkpointReleased;
  };

  const processing = processQueuedImportJob(baseQueuedJob, deps);
  while (!checkpointStarted) {
    await Promise.resolve();
  }

  assert.equal(updateSourceFinalStmt.calls.length, 0);
  assert.equal(updateJobFinalStmt.calls.length, 0);

  releaseCheckpoint();
  await processing;
  assert.equal(updateSourceFinalStmt.calls.length, 1);
  assert.equal(updateJobFinalStmt.calls.length, 1);
});

test('import deadline preserves timeout reason and waits for importer drain before rejecting', async () => {
  const { deps, updateJobFinalStmt } = createProcessDeps({ rows: 1 });
  deps.importJobExecutionDeadlineMs = 10;
  let resolveAbortObserved = (): void => undefined;
  const abortObserved = new Promise<void>((resolve) => {
    resolveAbortObserved = resolve;
  });
  let releaseImporterDrain = (): void => undefined;
  const importerDrain = new Promise<void>((resolve) => {
    releaseImporterDrain = resolve;
  });
  deps.importCsvFilesIncrementalWithProgress = async (
    _files: unknown[],
    _mapping: unknown,
    _timezone: string,
    _onProgress: unknown,
    options: { signal?: AbortSignal },
  ) => new Promise((resolve, reject) => {
    const onAbort = (): void => {
      resolveAbortObserved();
      void importerDrain.then(() => reject(options.signal?.reason));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
    }
  });

  let processingSettled = false;
  const observed = processQueuedImportJob(baseQueuedJob, deps).then(
    () => {
      processingSettled = true;
      return null;
    },
    (error: unknown) => {
      processingSettled = true;
      return error;
    },
  );

  await abortObserved;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(processingSettled, false);
  assert.equal(updateJobFinalStmt.calls.length, 0);

  releaseImporterDrain();
  const error = await observed;
  assert.equal((error as { code?: unknown }).code, 'LOCAL_DATA_IMPORT_JOB_TIMEOUT');
  assert.deepEqual((error as { args?: unknown }).args, { timeoutMs: 10 });
  assert.equal(updateJobFinalStmt.calls.length, 0);
});

test('incremental job refreshes imported instrument derived data once after all batches', async () => {
  const { deps, getDerivedDataRefreshCalls, getTimelinePrewarmCalls } = createProcessDeps({
    rows: 1,
    appendedRows: 1,
  });
  deps.resolveRuntimeImportParallelFiles = () => 1;
  deps.resolveImportInitialBatchFiles = () => 1;
  deps.resolveImportBatchSize = () => 1;
  deps.importCsvFilesIncrementalWithProgress = async (
    files: Array<{ originalname: string; symbol?: string }>
  ) =>
    files.map((file) => {
      const symbol = String(file.symbol || '').trim().toUpperCase();
      return {
        fileName: file.originalname,
        symbol,
        instrumentId: `instrument-${symbol.toLowerCase()}`,
        rows: 1,
        mapping: {},
        appendedRows: 1,
      };
    });

  await processQueuedImportJob(
    {
      ...baseQueuedJob,
      files: [
        baseQueuedJob.files[0]!,
        {
          fileRowId: 'file-row-2',
          fileName: 'MSFT_1d.csv',
          filePath: '/tmp/MSFT_1d.csv',
          fileSize: 100,
          symbol: 'MSFT',
        },
      ],
    },
    deps,
  );

  assert.deepEqual(getDerivedDataRefreshCalls(), [['instrument-aapl', 'instrument-msft']]);
  assert.deepEqual(getTimelinePrewarmCalls(), [['instrument-aapl', 'instrument-msft']]);
});

test('incremental job keeps noChanges=true when run contains exact overlap only', async () => {
  const { deps, updateJobFinalStmt, getImportSucceededCalls, getCheckpointCalls, getMaintenanceCalls } = createProcessDeps({
    rows: 0,
    prependedRows: 0,
    appendedRows: 0,
    overlapRowsIgnored: 7,
    internalRangeRowsIgnored: 0,
    conflictRowsIgnored: 0,
  });

  await processQueuedImportJob(baseQueuedJob, deps);

  const finalCall = updateJobFinalStmt.calls.at(-1);
  assert.ok(finalCall);
  const outcomeSummaryJson = finalCall?.[9];
  assert.equal(typeof outcomeSummaryJson, 'string');
  const outcomeSummary = JSON.parse(String(outcomeSummaryJson));

  assert.equal(outcomeSummary.prependedRows, 0);
  assert.equal(outcomeSummary.appendedRows, 0);
  assert.equal(outcomeSummary.overlapRowsIgnored, 7);
  assert.equal(outcomeSummary.internalRangeRowsIgnored, 0);
  assert.equal(outcomeSummary.conflictRowsIgnored, 0);
  assert.equal(outcomeSummary.qualityWarnings.filesWithSkippedRows, 0);
  assert.equal(outcomeSummary.noChanges, true);
  assert.equal(getImportSucceededCalls(), 0);
  assert.equal(getCheckpointCalls(), 0);
  assert.equal(getMaintenanceCalls(), 0);
});

test('incremental job outcome summary aggregates skipped-row quality warnings', async () => {
  const { deps, updateJobFinalStmt, getImportSucceededCalls, getCheckpointCalls, getMaintenanceCalls } = createProcessDeps({
    rows: 2,
    appendedRows: 2,
    invalidRequiredRowsSkipped: 3,
    invalidOhlcRowsSkipped: 4,
    duplicateConflictRowsSkipped: 5,
    duplicateIdenticalRowsDeduped: 6,
  });

  await processQueuedImportJob(baseQueuedJob, deps);

  const finalCall = updateJobFinalStmt.calls.at(-1);
  assert.ok(finalCall);
  assert.equal(finalCall[6], 18);
  const outcomeSummary = JSON.parse(String(finalCall[9]));
  assert.deepEqual(outcomeSummary.qualityWarnings, {
    filesWithSkippedRows: 1,
    invalidRequiredRowsSkipped: 3,
    invalidOhlcRowsSkipped: 4,
    duplicateConflictRowsSkipped: 5,
    duplicateIdenticalRowsDeduped: 6,
  });
  assert.equal(outcomeSummary.noChanges, false);
  assert.equal(getImportSucceededCalls(), 1);
  assert.equal(getCheckpointCalls(), 1);
  assert.equal(getMaintenanceCalls(), 0);
});

test('incremental job rejects internal or conflicting overlap results as full-reimport-required', async () => {
  const { deps, updateJobFinalStmt, updateFileFailedStmt, getImportSucceededCalls, getCheckpointCalls, getMaintenanceCalls } =
    createProcessDeps({
      rows: 0,
      prependedRows: 0,
      appendedRows: 0,
      overlapRowsIgnored: 7,
      internalRangeRowsIgnored: 8,
      conflictRowsIgnored: 9,
    });

  await processQueuedImportJob(baseQueuedJob, deps);

  const failedFileCall = updateFileFailedStmt.calls.at(-1);
  assert.ok(failedFileCall);
  assert.equal(failedFileCall[4], 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');

  const finalCall = updateJobFinalStmt.calls.at(-1);
  assert.ok(finalCall);
  assert.equal(finalCall[0], 'FAILED');
  assert.equal(finalCall[7], 1);
  assert.equal(finalCall[8], 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');
  assert.equal(typeof finalCall[9], 'string');
  const outcomeSummary = JSON.parse(String(finalCall[9]));
  assert.equal(outcomeSummary.noChanges, false);
  assert.equal(getImportSucceededCalls(), 0);
  assert.equal(getCheckpointCalls(), 0);
  assert.equal(getMaintenanceCalls(), 0);
});

test('incremental job keeps successful files when another result requires full reimport', async () => {
  const { deps, updateJobFinalStmt, updateFileFailedStmt, getImportSucceededCalls, getCheckpointCalls } =
    createProcessDeps([
      {
        fileName: 'AAPL_1d.csv',
        symbol: 'AAPL',
        rows: 0,
        internalRangeRowsIgnored: 1,
        errorMessage: 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED',
      },
      {
        fileName: 'MSFT_1d.csv',
        symbol: 'MSFT',
        instrumentId: 'instrument-msft',
        rows: 2,
        appendedRows: 2,
      },
    ]);
  deps.resolveRuntimeImportParallelFiles = () => 2;
  deps.resolveImportInitialBatchFiles = () => 2;
  deps.resolveImportBatchSize = () => 2;

  await processQueuedImportJob(
    {
      ...baseQueuedJob,
      existingImportedSymbols: ['AAPL'],
      files: [
        baseQueuedJob.files[0]!,
        {
          fileRowId: 'file-row-2',
          fileName: 'MSFT_1d.csv',
          filePath: '/tmp/MSFT_1d.csv',
          fileSize: 100,
          symbol: 'MSFT',
        },
      ],
    },
    deps,
  );

  const failedFileCall = updateFileFailedStmt.calls.at(-1);
  assert.ok(failedFileCall);
  assert.equal(failedFileCall[4], 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');

  const finalCall = updateJobFinalStmt.calls.at(-1);
  assert.ok(finalCall);
  assert.equal(finalCall[0], 'PARTIAL_SUCCESS');
  assert.equal(finalCall[5], 2);
  assert.equal(finalCall[7], 1);
  assert.equal(finalCall[8], 'LOCAL_DATA_IMPORT_PARTIAL_FAILED');
  const outcomeSummary = JSON.parse(String(finalCall[9]));
  assert.equal(outcomeSummary.noChanges, false);
  assert.deepEqual(outcomeSummary.addedSymbols, ['MSFT']);
  assert.equal(outcomeSummary.appendedRows, 2);
  assert.equal(getImportSucceededCalls(), 1);
  assert.equal(getCheckpointCalls(), 1);
});

test('incremental job keeps successful files when another file has no valid bars', async () => {
  const {
    deps,
    updateJobFinalStmt,
    updateFileFailedStmt,
    updateFileFailureDetailsCalls,
    updateJobFailureDetailsCalls,
    getImportSucceededCalls,
    getCheckpointCalls
  } =
    createProcessDeps([
      {
        fileName: 'AAPL_1d.csv',
        symbol: 'AAPL',
        rows: 0,
        invalidRequiredRowsSkipped: 5,
        errorMessage: 'CSV_NO_VALID_BARS',
      },
      {
        fileName: 'MSFT_1d.csv',
        symbol: 'MSFT',
        instrumentId: 'instrument-msft',
        rows: 2,
        appendedRows: 2,
      },
    ]);
  deps.resolveRuntimeImportParallelFiles = () => 2;
  deps.resolveImportInitialBatchFiles = () => 2;
  deps.resolveImportBatchSize = () => 2;

  await processQueuedImportJob(
    {
      ...baseQueuedJob,
      files: [
        baseQueuedJob.files[0]!,
        {
          fileRowId: 'file-row-2',
          fileName: 'MSFT_1d.csv',
          filePath: '/tmp/MSFT_1d.csv',
          fileSize: 100,
          symbol: 'MSFT',
        },
      ],
    },
    deps,
  );

  const failedFileCall = updateFileFailedStmt.calls.at(-1);
  assert.ok(failedFileCall);
  assert.equal(failedFileCall[4], 'CSV_NO_VALID_BARS');
  const failedFileDetails = updateFileFailureDetailsCalls.at(-1);
  assert.ok(failedFileDetails);
  assert.equal(failedFileDetails.errorCode, 'CSV_NO_VALID_BARS');
  assert.equal(JSON.parse(failedFileDetails.causeJson).stage, 'VALIDATING_ROWS');
  assert.equal(JSON.parse(failedFileDetails.detailsJson).fileName, 'AAPL_1d.csv');
  const diagnostics = JSON.parse(failedFileDetails.diagnosticsJson);
  assert.equal(diagnostics[0].code, 'CSV_NO_VALID_BARS');
  assert.equal(diagnostics[0].fileName, 'AAPL_1d.csv');

  const finalCall = updateJobFinalStmt.calls.at(-1);
  assert.ok(finalCall);
  assert.equal(finalCall[0], 'PARTIAL_SUCCESS');
  assert.equal(finalCall[5], 2);
  assert.equal(finalCall[7], 1);
  assert.equal(finalCall[8], 'LOCAL_DATA_IMPORT_PARTIAL_FAILED');
  const outcomeSummary = JSON.parse(String(finalCall[9]));
  assert.equal(outcomeSummary.noChanges, false);
  assert.deepEqual(outcomeSummary.addedSymbols, ['MSFT']);
  assert.equal(outcomeSummary.appendedRows, 2);
  assert.equal(outcomeSummary.qualityWarnings.invalidRequiredRowsSkipped, 5);
  const jobFailureDetails = updateJobFailureDetailsCalls.at(-1);
  assert.ok(jobFailureDetails);
  assert.equal(jobFailureDetails.errorCode, 'LOCAL_DATA_IMPORT_PARTIAL_FAILED');
  const failureSummary = JSON.parse(String(jobFailureDetails.failureSummaryJson));
  assert.equal(failureSummary.totalFailedFiles, 1);
  assert.equal(failureSummary.primaryCode, 'CSV_NO_VALID_BARS');
  assert.equal(getImportSucceededCalls(), 1);
  assert.equal(getCheckpointCalls(), 1);
});

test('incremental job preserves no-valid-bars code when every file is invalid', async () => {
  const { deps, updateJobFinalStmt, updateFileFailedStmt, updateJobFailureDetailsCalls } = createProcessDeps({
    rows: 0,
    invalidRequiredRowsSkipped: 5,
    errorMessage: 'CSV_NO_VALID_BARS',
  });

  await processQueuedImportJob(baseQueuedJob, deps);

  const failedFileCall = updateFileFailedStmt.calls.at(-1);
  assert.ok(failedFileCall);
  assert.equal(failedFileCall[4], 'CSV_NO_VALID_BARS');

  const finalCall = updateJobFinalStmt.calls.at(-1);
  assert.ok(finalCall);
  assert.equal(finalCall[0], 'FAILED');
  assert.equal(finalCall[8], 'CSV_NO_VALID_BARS');
  const jobFailureDetails = updateJobFailureDetailsCalls.at(-1);
  assert.ok(jobFailureDetails);
  assert.equal(jobFailureDetails.errorCode, 'CSV_NO_VALID_BARS');
  assert.equal(JSON.parse(String(jobFailureDetails.causeJson)).code, 'CSV_NO_VALID_BARS');
  assert.equal(JSON.parse(String(jobFailureDetails.failureSummaryJson)).primaryCode, 'CSV_NO_VALID_BARS');
});

test('incremental job preserves full-reimport-required thrown as an Error message', async () => {
  const { deps, updateJobFinalStmt, updateFileFailedStmt } = createProcessDeps({
    throwError: new Error('LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED'),
  });

  await processQueuedImportJob(baseQueuedJob, deps);

  const failedFileCall = updateFileFailedStmt.calls.at(-1);
  assert.ok(failedFileCall);
  assert.equal(failedFileCall[4], 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');

  const finalCall = updateJobFinalStmt.calls.at(-1);
  assert.ok(finalCall);
  assert.equal(finalCall[0], 'FAILED');
  assert.equal(finalCall[8], 'LOCAL_DATA_INCREMENTAL_REIMPORT_REQUIRED');
});
