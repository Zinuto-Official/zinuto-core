// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('startup recovery terminalizes every interrupted backtest batch', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-backtest-recovery-'));
  const previousDbPath = process.env.ZINUTO_DB_PATH;
  process.env.ZINUTO_DB_PATH = path.join(tempDir, 'zinuto.db');

  const { db, closeLocalDatabase } = await import('../../src/infrastructure/db/database.js');
  const { recoverInterruptedBacktestBatches } = await import(
    '../../src/application/backtest/backtestService.js'
  );

  t.after(async () => {
    closeLocalDatabase();
    if (previousDbPath === undefined) {
      delete process.env.ZINUTO_DB_PATH;
    } else {
      process.env.ZINUTO_DB_PATH = previousDbPath;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const insert = db.prepare(
    `INSERT INTO backtest_batches (
      id,name,status,config_json,progress_json,summary_json,created_at,updated_at,started_at,finished_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const now = '2026-07-16T00:00:00.000Z';
  const instrumentId = 'backtest-recovery-instrument';
  const insertRunRows = (batchId: string, suffix: string): void => {
    const resultId = `backtest-recovery-result-${suffix}`;
    db.prepare(
      `INSERT INTO backtest_results (
        id,batch_id,instrument_id,symbol,timeframe,bars_count,final_equity,total_pnl,profit_rate,
        max_drawdown,win_rate,trade_count,conflict_count,summary_json,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      resultId,
      batchId,
      instrumentId,
      'RECOVERY',
      '1d',
      10,
      101,
      1,
      0.01,
      0.02,
      0.5,
      1,
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
      `backtest-recovery-fill-${suffix}`,
      batchId,
      resultId,
      instrumentId,
      'RECOVERY',
      `order-${suffix}`,
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
      `backtest-recovery-equity-${suffix}`,
      batchId,
      resultId,
      instrumentId,
      'RECOVERY',
      0,
      now,
      101,
      0,
    );
  };
  db.transaction(() => {
    db.prepare(
      `INSERT INTO instruments (
        id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,bars_version_token,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      instrumentId,
      'RECOVERY',
      '1d',
      'Recovery Instrument',
      'SYSTEM',
      'UTC',
      1,
      10,
      'recovery-version',
      now,
    );
    for (let index = 0; index < 505; index += 1) {
      const status = index % 2 === 0 ? 'QUEUED' : 'RUNNING';
      insert.run(
        `backtest-recovery-active-${index}`,
        `Interrupted ${index}`,
        status,
        '{}',
        JSON.stringify({ stage: status }),
        '{}',
        now,
        now,
        status === 'RUNNING' ? now : null,
        null,
      );
    }
    for (const status of ['DRAFT', 'SUCCEEDED']) {
      insert.run(
        `backtest-recovery-${status.toLowerCase()}`,
        status,
        status,
        '{}',
        JSON.stringify({ stage: status }),
        '{}',
        now,
        now,
        null,
        status === 'SUCCEEDED' ? now : null,
      );
    }
    insertRunRows('backtest-recovery-active-1', 'interrupted');
    insertRunRows('backtest-recovery-succeeded', 'succeeded');
  })();

  const firstRecovery = recoverInterruptedBacktestBatches();
  assert.equal(firstRecovery.recoveredBatchIds.length, 505);
  assert.equal(
    db.prepare("SELECT COUNT(*) FROM backtest_batches WHERE status IN ('QUEUED','RUNNING')").pluck().get(),
    0,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) FROM backtest_batches WHERE status = 'FAILED'").pluck().get(),
    505,
  );
  assert.equal(
    db.prepare("SELECT status FROM backtest_batches WHERE id = 'backtest-recovery-draft'").pluck().get(),
    'DRAFT',
  );
  assert.equal(
    db.prepare("SELECT status FROM backtest_batches WHERE id = 'backtest-recovery-succeeded'").pluck().get(),
    'SUCCEEDED',
  );
  for (const table of [
    'backtest_results',
    'backtest_fills',
    'backtest_equity_curve',
  ]) {
    assert.equal(
      db
        .prepare(`SELECT COUNT(*) FROM ${table} WHERE batch_id = ?`)
        .pluck()
        .get('backtest-recovery-active-1'),
      0,
    );
    assert.equal(
      db
        .prepare(`SELECT COUNT(*) FROM ${table} WHERE batch_id = ?`)
        .pluck()
        .get('backtest-recovery-succeeded'),
      1,
    );
  }

  assert.deepEqual(recoverInterruptedBacktestBatches().recoveredBatchIds, []);
});
