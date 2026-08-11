// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-tabular-import-batching-'));
const tempDataDir = path.join(tempRoot, 'data');
await fs.mkdir(tempDataDir, { recursive: true });

const previousDataDir = process.env.ZINUTO_DATA_DIR;
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [{
  DEFAULT_INCREMENTAL_IMPORT_BATCH_RUNNER,
  createProgressTicker,
  importResolvedTargetsIncrementalBatch,
  resolveMaterializeChunkSize,
  stopProgressTickerForImport,
}, {
  appendEdgeBarsForInstrumentsFromCsvFilesBatch,
}, { closeLocalDatabase }] = await Promise.all([
  import('../../src/application/dataSource/tabularImport.js'),
  import('../../src/application/ports/infrastructure/db/marketDatabase.js'),
  import('../../src/infrastructure/db/database.js'),
]);

type IncrementalTarget = Parameters<
  typeof importResolvedTargetsIncrementalBatch
>[0][number];

const normalizedMapping: IncrementalTarget['normalizedMapping'] = {
  timestampMode: 'SINGLE',
  date: 'timestamp',
  time: '',
  open: 'open',
  high: 'high',
  low: 'low',
  close: 'close',
  volume: 'volume',
};

const createIncrementalTarget = (
  instrumentId: string,
  symbol: string,
  importCsvPath: string,
): IncrementalTarget => ({
  fileName: path.basename(importCsvPath),
  symbol,
  filePath: importCsvPath,
  importCsvPath,
  inputFormat: 'csv',
  instrumentId,
  createdInstrument: false,
  sourceId: 'batching-source',
  timezone: 'UTC',
  fileProgressPercent: 0,
  resolvedMapping: normalizedMapping,
  normalizedMapping,
  cleanup: async () => undefined,
});

const successResultForInput = (
  input: Parameters<
    NonNullable<Parameters<typeof importResolvedTargetsIncrementalBatch>[2]>
  >[0][number],
  importedRows: number,
) => ({
  instrumentId: input.instrumentId,
  symbol: input.symbol,
  filePath: input.filePath,
  validRows: importedRows,
  importedRows,
  prependedRows: 0,
  appendedRows: importedRows,
  overlapRowsIgnored: 0,
  internalRangeRowsIgnored: 0,
  conflictRowsIgnored: 0,
  skippedRows: 0,
  invalidRequiredRowsSkipped: 0,
  invalidOhlcRowsSkipped: 0,
  duplicateConflictRowsSkipped: 0,
  duplicateIdenticalRowsDeduped: 0,
});

test.after(async () => {
  closeLocalDatabase();
  if (previousDataDir === undefined) {
    delete process.env.ZINUTO_DATA_DIR;
  } else {
    process.env.ZINUTO_DATA_DIR = previousDataDir;
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('incremental imports default to the edge append writer', () => {
  assert.equal(
    DEFAULT_INCREMENTAL_IMPORT_BATCH_RUNNER,
    appendEdgeBarsForInstrumentsFromCsvFilesBatch,
  );
});

test('tabular import progress ticker turns async progress failures into import-visible errors', async () => {
  const progressError = new Error('LOCAL_DATA_IMPORT_JOB_CANCELED');
  let tickCount = 0;
  const stopTicker = createProgressTicker(
    () => {
      tickCount += 1;
      throw progressError;
    },
    0,
    10,
    2,
    10,
  );

  await new Promise<void>((resolve) => setTimeout(resolve, 80));

  assert.equal(tickCount, 1);
  assert.equal(stopTicker.getError(), progressError);
  stopTicker();
  assert.equal(stopTicker.getError(), progressError);
  assert.throws(
    () => stopProgressTickerForImport(stopTicker),
    (error) => {
      assert.equal(error, progressError);
      return true;
    },
  );

  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  assert.equal(tickCount, 1);
});

test('incremental tabular import appends all resolved files in one batch call', async () => {
  const firstPath = path.join(tempRoot, 'first.csv');
  const secondPath = path.join(tempRoot, 'second.csv');
  const calls: string[][] = [];
  const appendBatch = async (inputs: Parameters<
    NonNullable<Parameters<typeof importResolvedTargetsIncrementalBatch>[2]>
  >[0]) => {
    calls.push(inputs.map((input) => path.basename(input.filePath)));
    return inputs.map((input, index) => successResultForInput(input, index + 1));
  };

  const results = await importResolvedTargetsIncrementalBatch(
    [
      createIncrementalTarget('instrument-1', 'AAA', firstPath),
      createIncrementalTarget('instrument-2', 'BBB', secondPath),
    ],
    undefined,
    appendBatch,
  );

  assert.deepEqual(calls, [['first.csv', 'second.csv']]);
  assert.equal(results.get(`instrument-1::${path.resolve(firstPath)}`)?.importedRows, 1);
  assert.equal(results.get(`instrument-2::${path.resolve(secondPath)}`)?.importedRows, 2);
});

test('incremental tabular import isolates files only after a batch-level append failure', async () => {
  const goodPath = path.join(tempRoot, 'good.csv');
  const badPath = path.join(tempRoot, 'bad.csv');
  const calls: string[][] = [];
  const appendBatch = async (inputs: Parameters<
    NonNullable<Parameters<typeof importResolvedTargetsIncrementalBatch>[2]>
  >[0]) => {
    calls.push(inputs.map((input) => path.basename(input.filePath)));
    if (inputs.length > 1) {
      throw new Error('CSV_BATCH_FAILED');
    }
    const input = inputs[0];
    if (input?.symbol === 'BAD') {
      throw new Error('CSV_FILE_IMPORT_FAILED');
    }
    return input ? [successResultForInput(input, 7)] : [];
  };

  const results = await importResolvedTargetsIncrementalBatch(
    [
      createIncrementalTarget('instrument-good', 'GOOD', goodPath),
      createIncrementalTarget('instrument-bad', 'BAD', badPath),
    ],
    undefined,
    appendBatch,
  );

  assert.deepEqual(calls, [['good.csv', 'bad.csv'], ['good.csv'], ['bad.csv']]);
  assert.equal(results.get(`instrument-good::${path.resolve(goodPath)}`)?.importedRows, 7);
  assert.equal(
    results.get(`instrument-bad::${path.resolve(badPath)}`)?.errorMessage,
    'CSV_FILE_IMPORT_FAILED',
  );
});

test('incremental isolation waits for every aborted writer to drain', async () => {
  const firstPath = path.join(tempRoot, 'drain-first.csv');
  const secondPath = path.join(tempRoot, 'drain-second.csv');
  const drainResolvers: Array<() => void> = [];
  let isolatedStarted = 0;
  const appendBatch: NonNullable<
    Parameters<typeof importResolvedTargetsIncrementalBatch>[2]
  > = async (inputs, options) => {
      if (inputs.length > 1) {
        throw new Error('CSV_BATCH_FAILED');
      }
      isolatedStarted += 1;
      return new Promise((resolve, reject) => {
        const drain = new Promise<void>((resolveDrain) => {
          drainResolvers.push(resolveDrain);
        });
        const onAbort = (): void => {
          void drain.then(() => reject(options?.signal?.reason));
        };
        options?.signal?.addEventListener('abort', onAbort, { once: true });
        if (options?.signal?.aborted) {
          onAbort();
        }
      });
    };
  const controller = new AbortController();
  const timeoutError = Object.assign(new Error('LOCAL_DATA_IMPORT_JOB_TIMEOUT'), {
    code: 'LOCAL_DATA_IMPORT_JOB_TIMEOUT',
  });
  let settled = false;
  const observed = importResolvedTargetsIncrementalBatch(
      [
        createIncrementalTarget('instrument-drain-1', 'DRA', firstPath),
        createIncrementalTarget('instrument-drain-2', 'DRB', secondPath),
      ],
      controller.signal,
      appendBatch,
    )
    .then(
      () => {
        settled = true;
        return null;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
  while (isolatedStarted < 2) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  controller.abort(timeoutError);
  drainResolvers[0]?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);

  drainResolvers[1]?.();
  const error = await observed;
  assert.equal(error, timeoutError);
});

test('materialize chunk sizing keeps xlsx files single-file', () => {
  const files = [
    { originalname: 'first.xlsx', path: '/tmp/first.xlsx' },
    { originalname: 'second.csv', path: '/tmp/second.csv' },
  ];

  assert.equal(
    resolveMaterializeChunkSize(files, 0, 8),
    1,
  );
});

test('materialize chunk sizing stops before an xlsx file in a mixed batch', () => {
  const files = [
    { originalname: 'first.csv', path: '/tmp/first.csv' },
    { originalname: 'second.parquet', path: '/tmp/second.parquet' },
    { originalname: 'third.xlsx', path: '/tmp/third.xlsx' },
  ];

  assert.equal(
    resolveMaterializeChunkSize(files, 0, 8),
    2,
  );
});
