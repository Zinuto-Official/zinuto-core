// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-import-job-retention-'),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [{ db }, importJobRetention] = await Promise.all([
  import('../../src/infrastructure/db/database.js'),
  import('../../src/infrastructure/db/dataSource/importJobRetentionStore.js'),
]);

const { pruneLocalDataImportJobsForSource } = importJobRetention;

const countRows = (tableName: string, whereSql = '1 = 1', ...params: unknown[]): number => {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereSql}`)
    .get(...params) as { count?: unknown } | undefined;
  return Math.max(0, Math.floor(Number(row?.count ?? 0)));
};

const seedSource = (): void => {
  const now = '2026-05-16T00:00:00.000Z';
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,time_zone,time_zone_origin,base_timeframe,field_mapping_json,trading_calendar_json,status,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'source-retention',
    'Retention Source',
    '',
    'Etc/UTC',
    'PRESET_DEFAULT',
    '1d',
    '{}',
    DEFAULT_TRADING_CALENDAR_JSON,
    'READY',
    'job-00',
    now,
    now,
  );
};

const seedJob = (index: number): void => {
  const suffix = String(index).padStart(2, '0');
  const timestamp = `2026-05-16T00:${suffix}:00.000Z`;
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,status,stage,total_files,done_files,
      total_rows,imported_rows,skipped_rows,error_files,created_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `job-${suffix}`,
    'source-retention',
    'Retention Source',
    'Etc/UTC',
    '1d',
    'SUCCESS',
    'DONE',
    10 + index,
    10 + index,
    100 + index,
    90 + index,
    10,
    index % 2,
    timestamp,
    timestamp,
    timestamp,
  );
};

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test('local import job retention caps terminal jobs and preserves source file ledger', () => {
  seedSource();
  for (let index = 0; index < 6; index += 1) {
    seedJob(index);
  }
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,
      status,rows_total,rows_imported,rows_skipped,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'file-pruned-job',
    'source-retention',
    'job-01',
    'AAPL',
    'AAPL.csv',
    '/tmp/AAPL.csv',
    128,
    0,
    'fingerprint',
    'IMPORTED',
    101,
    91,
    10,
    '2026-05-16T00:01:00.000Z',
    '2026-05-16T00:01:00.000Z',
  );

  const result = pruneLocalDataImportJobsForSource('source-retention', 2);

  assert.equal(result.deletedJobs, 3);
  assert.equal(countRows('local_data_import_jobs', 'source_id = ?', 'source-retention'), 3);
  assert.equal(countRows('local_data_import_jobs', 'id = ?', 'job-00'), 1);
  assert.equal(countRows('local_data_import_jobs', 'id = ?', 'job-05'), 1);
  assert.equal(countRows('local_data_import_jobs', 'id = ?', 'job-04'), 1);
  assert.equal(countRows('local_data_import_jobs', 'id = ?', 'job-01'), 0);
  assert.equal(countRows('local_data_source_files', 'id = ?', 'file-pruned-job'), 1);

  const source = db
    .prepare(
      `SELECT pruned_import_job_count AS jobs,
              pruned_import_file_count AS files,
              pruned_import_total_rows AS totalRows,
              pruned_import_imported_rows AS importedRows,
              pruned_import_skipped_rows AS skippedRows
         FROM local_data_sources
        WHERE id = ?`,
    )
    .get('source-retention') as
    | {
        jobs?: number;
        files?: number;
        totalRows?: number;
        importedRows?: number;
        skippedRows?: number;
      }
    | undefined;
  assert.equal(source?.jobs, 3);
  assert.equal(source?.files, 36);
  assert.equal(source?.totalRows, 306);
  assert.equal(source?.importedRows, 276);
  assert.equal(source?.skippedRows, 30);
});
