// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cancelNativeBacktestBatch,
  runBacktestNativeBatch,
  type BacktestNativeBatchInput,
} from '../../src/application/backtest/nativeEngine.js';

const previousNativeEngine = process.env.ZINUTO_BACKTEST_ENGINE_BIN;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-native-cancel-'));
const enginePath = path.join(tempDir, 'fake-native-engine.mjs');
const markerPath = path.join(tempDir, 'spawned.marker');
const timeoutPidPath = path.join(tempDir, 'timeout.pid');

await fs.writeFile(enginePath, `#!${process.execPath}
import fs from 'node:fs/promises';
import path from 'node:path';
await fs.writeFile(${JSON.stringify(markerPath)}, 'spawned');
const inputFlagIndex = process.argv.indexOf('--input');
const request = JSON.parse(await fs.readFile(process.argv[inputFlagIndex + 1], 'utf8'));
if (request.batchId === 'native-timeout-reap') {
  await fs.writeFile(${JSON.stringify(timeoutPidPath)}, String(process.pid));
  await new Promise(() => setInterval(() => undefined, 1000));
}
const committedPath = path.join(request.outputDir, 'committed');
const instrumentResultsPath = path.join(request.outputDir, 'instrument-results.jsonl');
await fs.writeFile(committedPath, 'ok');
const line = (instrumentId, symbol) => JSON.stringify({
  instrument: {
    instrumentId,
    sourceId: null,
    symbol,
    baseTimeframe: '1d',
    name: null,
    market: 'LOCAL',
    barCount: 1,
    timeZone: 'UTC',
    barsVersionToken: 'test'
  },
  result: {
    instrumentId,
    symbol,
    timeframe: '1d',
    barsCount: 1,
    finalEquity: 1000,
    totalPnl: 0,
    profitRate: 0,
    maxDrawdown: 0,
    winRate: 0,
    tradeCount: 0,
    conflictCount: 0,
    summary: {}
  },
  fills: [],
  equityCurve: [],
  conflicts: []
});
await fs.writeFile(instrumentResultsPath, [line('native-one', 'ONE'), line('native-two', 'TWO')].join('\\n'));
process.stdout.write(JSON.stringify({
  engine: 'RUST_DUCKDB_BATCH',
  engineVersion: 'test',
  batchId: request.batchId,
  totalSymbols: 2,
  completedSymbols: 2,
  skippedSymbols: 0,
  output: {
    resultsPath: instrumentResultsPath,
    fillsPath: instrumentResultsPath,
    equityPath: instrumentResultsPath,
    instrumentResultsPath,
    committedPath
  }
}));
`, 'utf8');
await fs.chmod(enginePath, 0o755);
process.env.ZINUTO_BACKTEST_ENGINE_BIN = enginePath;

const createInput = (batchId: string): BacktestNativeBatchInput => ({
  batchId,
  config: {} as BacktestNativeBatchInput['config'],
  instruments: [],
  marketDbPath: path.join(tempDir, 'market.duckdb'),
  signalPlan: {
    version: 1,
    semanticsVersion: 'backtest-evaluator-v1',
    program: {},
    parameterOverrides: {},
    outputKeys: [],
  },
  priceMode: 'NEXT_OPEN',
});

const isCancellationError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'BACKTEST_RUN_CANCELLED',
  );

const isNativeTimeoutError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'BACKTEST_NATIVE_BATCH_TIMEOUT',
  );

test.after(async () => {
  if (previousNativeEngine === undefined) {
    delete process.env.ZINUTO_BACKTEST_ENGINE_BIN;
  } else {
    process.env.ZINUTO_BACKTEST_ENGINE_BIN = previousNativeEngine;
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('native cancellation requested before spawn prevents the child from starting', {
  skip: process.platform === 'win32',
}, async () => {
  const batchId = 'native-pre-spawn-cancel';
  await fs.rm(markerPath, { force: true });
  cancelNativeBacktestBatch(batchId);
  await assert.rejects(
    runBacktestNativeBatch(createInput(batchId)),
    isCancellationError,
  );
  await assert.rejects(fs.stat(markerPath), { code: 'ENOENT' });
});

test('native artifact import stops immediately when cancellation arrives', {
  skip: process.platform === 'win32',
}, async () => {
  const batchId = 'native-artifact-cancel';
  const importedSymbols: string[] = [];
  await assert.rejects(
    runBacktestNativeBatch(createInput(batchId), {
      onResult: async (result) => {
        importedSymbols.push(result.instrument.symbol);
        cancelNativeBacktestBatch(batchId);
      },
    }),
    isCancellationError,
  );
  assert.deepEqual(importedSymbols, ['ONE']);
});

test('native timeout waits until the killed child has closed', {
  skip: process.platform === 'win32',
}, async () => {
  await fs.rm(timeoutPidPath, { force: true });
  await assert.rejects(
    runBacktestNativeBatch(createInput('native-timeout-reap'), {
      engineTimeoutMs: 250,
    }),
    isNativeTimeoutError,
  );
  const childPid = Number(await fs.readFile(timeoutPidPath, 'utf8'));
  assert.ok(Number.isInteger(childPid) && childPid > 0);
  assert.throws(
    () => process.kill(childPid, 0),
    (error: unknown) => Boolean(
      error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ESRCH'
    ),
  );
});
