// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID } from '@zinuto/shared/trading';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-backtest-delete-'));
process.env.ZINUTO_DB_PATH = path.join(tempDir, 'zinuto.db');

const [
  { db, closeLocalDatabase },
  backtestService,
  marketSource,
  resetExecutionState,
] = await Promise.all([
  import('../../src/infrastructure/db/database.js'),
  import('../../src/application/backtest/backtestService.js'),
  import('../../src/infrastructure/db/marketDatabase.js'),
  import('../../src/application/trading/resetExecutionState.js'),
]);

const insertBatch = (id: string, status: 'DRAFT' | 'QUEUED' | 'RUNNING'): void => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO backtest_batches (
      id,name,status,config_json,progress_json,summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(id, id, status, '{}', '{}', '{}', now, now);
};

const isActiveBatchError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'BACKTEST_BATCH_ACTIVE' &&
      (error as { status?: unknown }).status === 409,
  );

const isSystemResetInProgressError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'SYSTEM_RESET_IN_PROGRESS',
  );

test.after(async () => {
  closeLocalDatabase();
  delete process.env.ZINUTO_DB_PATH;
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('system reset execution blocks backtest create, queue, and direct run', async () => {
  const batchId = 'backtest-reset-gate';
  insertBatch(batchId, 'DRAFT');
  assert.equal(resetExecutionState.tryAcquireSystemResetExecution(), true);
  try {
    assert.throws(
      () => backtestService.createBacktestBatch({} as never),
      isSystemResetInProgressError,
    );
    assert.throws(
      () => backtestService.queueBacktestBatchRun(batchId),
      isSystemResetInProgressError,
    );
    await assert.rejects(
      () => backtestService.runBacktestBatchNow(batchId),
      isSystemResetInProgressError,
    );
    assert.equal(
      db.prepare('SELECT status FROM backtest_batches WHERE id = ?').pluck().get(batchId),
      'DRAFT',
    );
  } finally {
    resetExecutionState.releaseSystemResetExecution();
    db.prepare('DELETE FROM backtest_batches WHERE id = ?').run(batchId);
  }
});

test('cancelling a running batch atomically clears every partial run row', () => {
  const instrumentId = 'backtest-cancel-instrument';
  const resultId = 'backtest-cancel-result';
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO instruments (
      id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(instrumentId, 'CANCEL', '1d', 'Cancel test', 'LOCAL', 'UTC', 1, 1, 'v1', now);
  const created = backtestService.createBacktestBatch({
    name: 'Cancellation transaction test',
    config: {
      name: 'Cancellation transaction test',
      strategySource: 'BUY:1;',
      instrumentIds: [instrumentId],
      initialCapital: 1000,
      priceMode: 'NEXT_OPEN',
      signalExecutionMode: 'NEXT_OPEN',
      orderSizing: { mode: 'FIXED_QTY', value: 1 },
      tradingSettings: {
        ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
        initialSecuritiesBalance: 1000,
        tradeSettlementMode: 'T0',
        freeReplayEndSettlementMode: 'FORCE_CLOSE',
      },
    },
  });
  const batchId = created.id;
  db.prepare("UPDATE backtest_batches SET status = 'RUNNING' WHERE id = ?").run(batchId);
  db.prepare(
    `INSERT INTO backtest_results (
      id,batch_id,instrument_id,symbol,timeframe,bars_count,final_equity,total_pnl,profit_rate,
      max_drawdown,win_rate,trade_count,conflict_count,summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    resultId,
    batchId,
    instrumentId,
    'CANCEL',
    '1d',
    1,
    100,
    0,
    0,
    0,
    0,
    0,
    0,
    '{}',
    now,
    now,
  );
  db.prepare(
    `INSERT INTO backtest_fills (
      id,batch_id,result_id,instrument_id,symbol,order_id,fill_index,fill_time,side,
      price,qty,gross,fee,tax,slippage,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'backtest-cancel-fill',
    batchId,
    resultId,
    instrumentId,
    'CANCEL',
    'order-cancel',
    0,
    now,
    'BUY',
    1,
    1,
    1,
    0,
    0,
    0,
    now,
  );
  db.prepare(
    `INSERT INTO backtest_equity_curve (
      id,batch_id,result_id,instrument_id,symbol,bar_index,bar_time,equity,drawdown
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    'backtest-cancel-equity',
    batchId,
    resultId,
    instrumentId,
    'CANCEL',
    0,
    now,
    100,
    0,
  );

  const cancelled = backtestService.cancelBacktestBatch(batchId);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.progress.stage, 'CANCELLED');
  for (const table of ['backtest_results', 'backtest_fills', 'backtest_equity_curve']) {
    assert.equal(
      db.prepare(`SELECT COUNT(*) FROM ${table} WHERE batch_id = ?`).pluck().get(batchId),
      0,
    );
  }
  assert.equal(
    db.prepare('SELECT status FROM backtest_batches WHERE id = ?').pluck().get(batchId),
    'CANCELLED',
  );
});

test('a failed rerun atomically clears rows from the previous success', async () => {
  const instrumentId = 'backtest-cancel-instrument';
  const now = new Date().toISOString();
  const batch = backtestService.createBacktestBatch({
    name: 'Failed rerun transaction test',
    config: {
      name: 'Failed rerun transaction test',
      strategySource: 'BUY:1;',
      instrumentIds: [instrumentId],
      initialCapital: 1000,
      priceMode: 'NEXT_OPEN',
      signalExecutionMode: 'NEXT_OPEN',
      orderSizing: { mode: 'FIXED_QTY', value: 1 },
      tradingSettings: {
        ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
        initialSecuritiesBalance: 1000,
        tradeSettlementMode: 'T0',
        freeReplayEndSettlementMode: 'FORCE_CLOSE',
      },
    },
  });
  db.prepare(
    `INSERT INTO backtest_results (
      id,batch_id,instrument_id,symbol,timeframe,bars_count,final_equity,total_pnl,profit_rate,
      max_drawdown,win_rate,trade_count,conflict_count,summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'backtest-failed-rerun-result', batch.id, instrumentId, 'CANCEL', '1d', 1, 100, 0,
    0, 0, 0, 0, 0, '{}', now, now,
  );
  db.prepare(
    "UPDATE backtest_batches SET status = 'SUCCEEDED', config_json = '{}' WHERE id = ?",
  ).run(batch.id);

  await assert.rejects(backtestService.runBacktestBatchNow(batch.id));
  assert.equal(
    db.prepare('SELECT status FROM backtest_batches WHERE id = ?').pluck().get(batch.id),
    'FAILED',
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) FROM backtest_results WHERE batch_id = ?').pluck().get(batch.id),
    0,
  );
  db.prepare('DELETE FROM backtest_batches WHERE id = ?').run(batch.id);
});

test('a hydration timeout fails the batch instead of continuing symbol by symbol', async () => {
  const batch = backtestService.createBacktestBatch({
    name: 'Hydration timeout test',
    config: {
      name: 'Hydration timeout test',
      strategySource: 'BUY:1;',
      instrumentIds: ['backtest-cancel-instrument'],
      initialCapital: 1000,
      priceMode: 'NEXT_OPEN',
      signalExecutionMode: 'NEXT_OPEN',
      orderSizing: { mode: 'FIXED_QTY', value: 1 },
      tradingSettings: {
        ...DEFAULT_TRADING_MARKET_PRESET_RUNTIME_SETTINGS_BY_ID.A_SHARE,
        initialSecuritiesBalance: 1000,
        tradeSettlementMode: 'T0',
        freeReplayEndSettlementMode: 'FORCE_CLOSE',
      },
    },
  });
  let hydrationReadSignalAborted = false;
  const timeoutMarketData = {
    ...marketSource,
    getMarketBarCount: async (_instrumentId, options) => new Promise<number>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        hydrationReadSignalAborted = true;
        reject(options.signal?.reason);
      }, { once: true });
    }),
  };
  await assert.rejects(
    backtestService.runBacktestBatchNow(batch.id, {
      seedHydrationTimeoutMs: 30,
      marketData: timeoutMarketData,
    }),
    /BACKTEST_SEED_HYDRATION_TIMEOUT/u,
  );
  assert.equal(hydrationReadSignalAborted, true);
  const failed = db.prepare(
    'SELECT status,error_message FROM backtest_batches WHERE id = ?',
  ).get(batch.id) as { status: string; error_message: string };
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.error_message, 'BACKTEST_SEED_HYDRATION_TIMEOUT');
  db.prepare('DELETE FROM backtest_batches WHERE id = ?').run(batch.id);
});

test('active backtest batches cannot be deleted individually or by bulk clear', () => {
  insertBatch('backtest-delete-draft', 'DRAFT');
  insertBatch('backtest-delete-queued', 'QUEUED');
  insertBatch('backtest-delete-running', 'RUNNING');

  assert.equal(backtestService.isBacktestRuntimeIdle(), false);

  assert.throws(
    () => backtestService.deleteBacktestBatch('backtest-delete-queued'),
    isActiveBatchError,
  );
  assert.throws(
    () => backtestService.deleteBacktestBatch('backtest-delete-running'),
    isActiveBatchError,
  );
  assert.throws(() => backtestService.clearBacktestBatches(), isActiveBatchError);
  assert.equal(
    Number(
      (db.prepare('SELECT COUNT(*) AS count FROM backtest_batches').get() as { count: number })
        .count,
    ),
    4,
  );

  db.prepare(
    `UPDATE backtest_batches
        SET status = 'FAILED'
      WHERE status IN ('QUEUED', 'RUNNING')`,
  ).run();
  assert.equal(backtestService.isBacktestRuntimeIdle(), true);
  const cleared = backtestService.clearBacktestBatches();
  assert.equal(cleared.deletedBatchCount, 4);
  assert.equal(
    Number(
      (db.prepare('SELECT COUNT(*) AS count FROM backtest_batches').get() as { count: number })
        .count,
    ),
    0,
  );
});
