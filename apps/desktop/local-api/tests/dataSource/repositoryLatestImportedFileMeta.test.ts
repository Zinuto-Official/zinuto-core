// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_TRADING_CALENDAR_CONFIG,
  serializeTradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';

const DEFAULT_TRADING_CALENDAR_JSON = serializeTradingCalendarConfig(
  DEFAULT_TRADING_CALENDAR_CONFIG,
);

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zinuto-repository-latest-meta-'));
const previousDataDir = process.env.ZINUTO_DATA_DIR;
process.env.ZINUTO_DATA_DIR = tempRoot;

const [{ db, closeLocalDatabase }, { dataSourceRepository }] = await Promise.all([
  import('../../src/infrastructure/db/database.js'),
  import('../../src/infrastructure/db/dataSource/dataSourceRepository.js'),
]);

type LatestImportedFileMetaRow = {
  symbol: string;
  instrumentId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileMtimeMs: number;
  fileFingerprint: string;
};

const insertSource = (): void => {
  const now = '2026-05-23T00:00:00.000Z';
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,time_zone_origin,base_timeframe,field_mapping_json,trading_calendar_json,status,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'source-latest-meta',
    'Latest Meta Source',
    '/tmp/source-latest-meta',
    'Etc/UTC',
    'PRESET_DEFAULT',
    '1d',
    '{}',
    DEFAULT_TRADING_CALENDAR_JSON,
    'READY',
    'job-new',
    now,
    now,
  );
};

const insertInstrument = (): void => {
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,created_at
    ) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    'instrument-aapl',
    'source-latest-meta',
    'AAPL',
    '1d',
    'AAPL',
    'LOCAL',
    'Etc/UTC',
    '2026-05-23T00:00:00.000Z',
  );
};

const insertFileLedgerRow = (input: {
  id: string;
  rowsImported: number;
  fileSize: number;
  fileMtimeMs: number;
  fileFingerprint: string;
  createdAt: string;
  updatedAt: string;
}): void => {
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,
      status,rows_total,rows_imported,rows_skipped,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    input.id,
    'source-latest-meta',
    `job-${input.id}`,
    'instrument-aapl',
    'AAPL',
    'AAPL.csv',
    '/tmp/source-latest-meta/AAPL.csv',
    input.fileSize,
    input.fileMtimeMs,
    input.fileFingerprint,
    'IMPORTED',
    100,
    input.rowsImported,
    100 - input.rowsImported,
    input.createdAt,
    input.updatedAt,
  );
};

test.after(async () => {
  closeLocalDatabase();
  if (previousDataDir === undefined) {
    delete process.env.ZINUTO_DATA_DIR;
  } else {
    process.env.ZINUTO_DATA_DIR = previousDataDir;
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('latest imported file metadata includes successful zero-row overlap imports', () => {
  insertSource();
  insertInstrument();
  insertFileLedgerRow({
    id: 'old-positive',
    rowsImported: 100,
    fileSize: 128,
    fileMtimeMs: 1_714_697_200_000,
    fileFingerprint: 'sha256:old-positive',
    createdAt: '2026-05-23T00:01:00.000Z',
    updatedAt: '2026-05-23T00:01:00.000Z',
  });
  insertFileLedgerRow({
    id: 'new-zero-overlap',
    rowsImported: 0,
    fileSize: 256,
    fileMtimeMs: 1_714_700_800_000,
    fileFingerprint: 'sha256:new-zero-overlap',
    createdAt: '2026-05-23T00:02:00.000Z',
    updatedAt: '2026-05-23T00:02:00.000Z',
  });

  const rows = dataSourceRepository.listLatestImportedFileMetaBySourceStmt.all(
    'source-latest-meta',
  ) as LatestImportedFileMetaRow[];

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.symbol, 'AAPL');
  assert.equal(rows[0]?.instrumentId, 'instrument-aapl');
  assert.equal(rows[0]?.fileSize, 256);
  assert.equal(rows[0]?.fileMtimeMs, 1_714_700_800_000);
  assert.equal(rows[0]?.fileFingerprint, 'sha256:new-zero-overlap');
});
