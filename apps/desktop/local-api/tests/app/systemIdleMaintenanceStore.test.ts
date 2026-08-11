// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-idle-store-'));
process.env.ZINUTO_DB_PATH = path.join(tempDir, 'zinuto.db');

const [
  { db, closeLocalDatabase },
  { deleteLocalDataSourceMetadataById, listDeletingLocalDataSourceIds },
  { dataSourceRepository },
  portableDataRepository,
] =
  await Promise.all([
    import('../../src/infrastructure/db/database.js'),
    import('../../src/infrastructure/db/system/systemIdleMaintenanceStore.js'),
    import('../../src/infrastructure/db/dataSource/dataSourceRepository.js'),
    import('../../src/infrastructure/db/portableData/portableDataRepository.js'),
  ]);

test.after(async () => {
  closeLocalDatabase();
  delete process.env.ZINUTO_DB_PATH;
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('source metadata deletion rolls back instrument deletion when the transaction is interrupted', () => {
  const sourceId = 'source-idle-store-transaction';
  const instrumentId = 'instrument-idle-store-transaction';
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,base_timeframe,field_mapping_json,trading_calendar_json,status,
      deletion_state,symbol_count,bar_count,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    'Transaction Source',
    '',
    'UTC',
    '1d',
    '{}',
    '{}',
    'READY',
    'DELETING',
    1,
    1,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,
      time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    instrumentId,
    sourceId,
    'TXN',
    '1d',
    'Transaction Instrument',
    'LOCAL',
    'UTC',
    1,
    1,
    now,
    now,
    'transaction-version',
    now,
  );
  db.exec(
    `CREATE TEMP TRIGGER block_idle_source_delete
       BEFORE DELETE ON local_data_sources
       WHEN OLD.id = '${sourceId}'
       BEGIN
         SELECT RAISE(ABORT, 'blocked source deletion');
       END`,
  );

  assert.throws(
    () => deleteLocalDataSourceMetadataById(sourceId),
    /blocked source deletion/,
  );
  assert.ok(db.prepare('SELECT 1 FROM local_data_sources WHERE id = ?').get(sourceId));
  assert.ok(db.prepare('SELECT 1 FROM instruments WHERE id = ?').get(instrumentId));

  db.exec('DROP TRIGGER block_idle_source_delete');
  deleteLocalDataSourceMetadataById(sourceId);
  assert.equal(db.prepare('SELECT 1 FROM local_data_sources WHERE id = ?').get(sourceId), undefined);
  assert.equal(db.prepare('SELECT 1 FROM instruments WHERE id = ?').get(instrumentId), undefined);
});

test('interrupted symbol mutation is failed safely and never swept as whole-source deletion', () => {
  const sourceId = 'source-idle-store-symbol-mutation';
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,base_timeframe,field_mapping_json,trading_calendar_json,status,
      deletion_state,symbol_count,bar_count,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    'Interrupted Symbol Mutation',
    '',
    'UTC',
    '1d',
    '{}',
    '{}',
    'READY',
    'MUTATING_SYMBOLS',
    1,
    1,
    now,
    now,
  );

  assert.equal(listDeletingLocalDataSourceIds(10).includes(sourceId), false);
  assert.equal(
    dataSourceRepository.recoverInterruptedSourceSymbolMutationsStmt.run(now)
      .changes,
    1,
  );
  assert.deepEqual(
    db
      .prepare(
        'SELECT status, deletion_state AS deletionState FROM local_data_sources WHERE id = ?',
      )
      .get(sourceId),
    { status: 'FAILED', deletionState: 'IDLE' },
  );
});

test('SQLite source mutation lease admits one writer and rejects delete, clear-all, and portable import takeovers', () => {
  const sourceId = 'source-mutation-lease-cas';
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,base_timeframe,field_mapping_json,trading_calendar_json,status,
      deletion_state,symbol_count,bar_count,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    'Mutation Lease CAS',
    '',
    'UTC',
    '1d',
    '{}',
    '{}',
    'READY',
    'IDLE',
    0,
    0,
    now,
    now,
  );

  assert.equal(
    dataSourceRepository.beginSourceSymbolMutationStmt.run(now, sourceId)
      .changes,
    1,
  );
  assert.equal(
    dataSourceRepository.beginSourceSymbolMutationStmt.run(now, sourceId)
      .changes,
    0,
  );
  assert.equal(
    dataSourceRepository.beginSourceDeletionStmt.run(now, sourceId).changes,
    0,
  );
  assert.equal(
    dataSourceRepository.markAllSourcesDeletingIfIdleStmt.run(now).changes,
    0,
  );
  assert.equal(
    portableDataRepository.beginPortableMarketSourceMutation({
      sourceId,
      updatedAt: now,
    }),
    false,
  );
  assert.equal(
    dataSourceRepository.completeSourceSymbolMutationStmt.run(now, sourceId)
      .changes,
    1,
  );
  assert.deepEqual(
    db
      .prepare(
        'SELECT status, deletion_state AS deletionState FROM local_data_sources WHERE id = ?',
      )
      .get(sourceId),
    { status: 'READY', deletionState: 'IDLE' },
  );
});
