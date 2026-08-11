// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertNativeBacktestDifferentialParity,
  BACKTEST_EVALUATOR_SEMANTICS_VERSION,
} from '../../src/application/backtest/nativeDifferentialParity.js';
import type { BacktestInstrumentRunResult } from '../../src/application/backtest/types.js';

const buildResult = (
  profitRate = 0.1,
  engine = 'TS_REFERENCE',
): BacktestInstrumentRunResult => ({
  instrument: {
    instrumentId: 'instrument-1',
    sourceId: null,
    symbol: 'AAA',
    baseTimeframe: '1d',
    name: null,
    market: null,
    barCount: 1,
    timeZone: null,
    barsVersionToken: null,
  },
  result: {
    instrumentId: 'instrument-1',
    symbol: 'AAA',
    timeframe: '1d',
    barsCount: 1,
    finalEquity: 110,
    totalPnl: 10,
    profitRate,
    maxDrawdown: 0,
    winRate: 1,
    tradeCount: 1,
    conflictCount: 0,
    summary: {
      realizedPnl: 10,
      closedTrades: 1,
      winningTrades: 1,
      endingPositionQty: 0,
      endingAvgCost: 0,
      engine,
      engineVersion: engine === 'TS_REFERENCE' ? undefined : 'native-build-1',
    },
  },
  fills: [{
    instrumentId: 'instrument-1',
    symbol: 'AAA',
    orderId: 'order-1',
    fillIndex: 0,
    fillTime: '2026-01-01T00:00:00.000Z',
    side: 'BUY',
    price: 10,
    qty: 1,
    gross: 10,
    fee: 0,
    tax: 0,
    slippage: 0,
  }],
  equityCurve: [{
    instrumentId: 'instrument-1',
    symbol: 'AAA',
    barIndex: 0,
    barTime: '2026-01-01T00:00:00.000Z',
    equity: 110,
    drawdown: 0,
  }],
  conflicts: [],
});

test('native differential parity ignores provenance metadata but requires exact trading bytes', () => {
  assert.equal(BACKTEST_EVALUATOR_SEMANTICS_VERSION, 'backtest-evaluator-v1');
  assert.doesNotThrow(() => assertNativeBacktestDifferentialParity({
    nativeResults: [buildResult(0.1, 'RUST_DUCKDB_BATCH')],
    referenceOutcomes: [{ status: 'COMPLETED', result: buildResult() }],
  }));
  assert.throws(
    () => assertNativeBacktestDifferentialParity({
      nativeResults: [buildResult(0.10000001, 'RUST_DUCKDB_BATCH')],
      referenceOutcomes: [{ status: 'COMPLETED', result: buildResult() }],
    }),
    (error: unknown) => {
      assert.equal(
        (error as { code?: unknown }).code,
        'BACKTEST_NATIVE_DIFFERENTIAL_MISMATCH',
      );
      return true;
    },
  );
});

test('native results remain staged until the reference differential gate passes', () => {
  const source = readFileSync(
    new URL('../../src/application/backtest/nativeBatchRun.ts', import.meta.url),
    'utf8',
  );
  const parityIndex = source.indexOf('assertNativeBacktestDifferentialParity({');
  const persistenceIndex = source.indexOf(
    'clearBacktestRunRows(options.batchId);',
    parityIndex,
  );
  assert.ok(parityIndex > 0);
  assert.ok(persistenceIndex > parityIndex);
  const nativeResultCallback = source.slice(
    source.indexOf('onResult: async (item)'),
    source.indexOf('const referenceOutcomes'),
  );
  assert.match(nativeResultCallback, /stagedNativeResults\.push\(itemWithMetrics\)/u);
  assert.doesNotMatch(nativeResultCallback, /appendBacktestRunResultsChunk/u);
});
