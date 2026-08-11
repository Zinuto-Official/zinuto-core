// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import Database from 'better-sqlite3';

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'otp-portable-export-'),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const DEFAULT_TRADING_CALENDAR_JSON =
  '{"tradingDays":[1,2,3,4,5],"sessions":[{"startMinute":0,"endMinute":1440,"crossesMidnight":false}]}';

const [
  { db, DEFAULT_USER_ID },
  {
    getMarketBarCount,
    getMarketBarsByInstrumentIdRange,
    removeMarketInstrumentData,
    replaceMarketBarsForInstrument,
  },
  replayRefStoreModule,
  historyServiceModule,
  portableDataContainerModule,
  portableDataServiceModule,
  replayNoteServiceModule,
  dataSourceServiceModule,
] = await Promise.all([
  import('../../src/infrastructure/db/database.js'),
  import('../../src/infrastructure/db/marketDatabase.js'),
  import('../../src/infrastructure/db/history/replayRefStore.js'),
  import('../../src/application/historyService.js'),
  import('../../src/application/portableDataContainer.js'),
  import('../../src/application/portableDataService.js'),
  import('../../src/application/replayNoteService.js'),
  import('../../src/application/dataSourceService.js'),
]);

const { saveTrainingProjectReplayRef } = replayRefStoreModule;
const { getTrainingProjectById } = historyServiceModule;
const { extractPortablePayloadFile, createPortablePackage } =
  portableDataContainerModule;
const {
  executePortableExport,
  executePortableImport,
  inspectPortableImportPackage,
  previewPortableExport,
  recoverPortableImportsAtStartup,
} = portableDataServiceModule;
const { createReplayNote } = replayNoteServiceModule;
const { getLocalDataSourceDiagnostics } = dataSourceServiceModule;

test.after(async () => {
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

const interruptedPortableImportRuntime = (
  interruptedPhase: 'AFTER_MARKET_WRITES' | 'AFTER_COMMITTED',
) => ({
  recoverOnFailure: false,
  onDurablePhase: (phase: string): void => {
    if (phase === interruptedPhase) {
      throw new Error(`PORTABLE_IMPORT_ABRUPT_TERMINATION:${phase}`);
    }
  },
});

const expectAppErrorCode =
  (expectedCode: string) =>
  (error: unknown): boolean => {
    assert.equal(
      (error as { code?: unknown } | null)?.code,
      expectedCode,
      `expected ${expectedCode}, got ${JSON.stringify(error)}`,
    );
    return true;
  };

const upsertUserSettingsForTest = ({
  initialSecuritiesBalance,
  marketPresetId,
}: {
  initialSecuritiesBalance: number;
  marketPresetId: string;
}): void => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO user_settings (user_id, updated_at)
     VALUES (?, ?)`,
  ).run(DEFAULT_USER_ID, now);
  db.prepare(
    `UPDATE user_settings
        SET initial_securities_balance = ?,
            market_preset_id = ?,
            updated_at = ?
      WHERE user_id = ?`,
  ).run(initialSecuritiesBalance, marketPresetId, now, DEFAULT_USER_ID);
};

const readUserSettingsForTest = ():
  | { initialSecuritiesBalance: number; marketPresetId: string }
  | undefined => {
  const row = db
    .prepare(
      `SELECT initial_securities_balance AS initialSecuritiesBalance,
              market_preset_id AS marketPresetId
         FROM user_settings
        WHERE user_id = ?
        LIMIT 1`,
    )
    .get(DEFAULT_USER_ID) as
    | { initialSecuritiesBalance: number; marketPresetId: string }
    | undefined;
  return row;
};

const rewritePortablePayloadForTest = async (
  packagePath: string,
  mutator: (payloadDb: Database.Database) => void,
): Promise<void> => {
  const payloadPath = path.join(
    tempDataDir,
    `portable-payload-${crypto.randomUUID()}.sqlite`,
  );
  try {
    await extractPortablePayloadFile({
      inputPath: packagePath,
      outputPath: payloadPath,
    });
    const payloadDb = new Database(payloadPath);
    try {
      mutator(payloadDb);
    } finally {
      payloadDb.close();
    }
    await createPortablePackage({
      payloadPath,
      outputPath: packagePath,
    });
  } finally {
    await fs.promises.rm(payloadPath, { force: true });
  }
};

const createPortableMarketRecoveryFixture = async (key: string) => {
  const sourceId = `recovery-source-${key}`;
  const instrumentId = `recovery-instrument-${key}`;
  const jobId = `recovery-job-${key}`;
  const symbol = `RECOVERY${key.toUpperCase()}.USD`;
  const createdAt = '2026-07-17T00:00:00.000Z';
  const exportPath = path.join(
    tempDataDir,
    `portable-market-recovery-${key}.otp-package`,
  );
  const bars = [
    {
      ts: '2026-07-16T00:00:00.000Z',
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
    },
    {
      ts: '2026-07-16T00:01:00.000Z',
      open: 11,
      high: 13,
      low: 10,
      close: 12,
      volume: 120,
    },
  ];

  db.prepare('DELETE FROM local_data_source_files WHERE source_id = ?').run(
    sourceId,
  );
  db.prepare('DELETE FROM local_data_import_jobs WHERE source_id = ?').run(
    sourceId,
  );
  db.prepare('DELETE FROM local_data_sources WHERE id = ?').run(sourceId);
  db.prepare('DELETE FROM instruments WHERE id = ? OR symbol = ?').run(
    instrumentId,
    symbol,
  );
  await removeMarketInstrumentData(instrumentId);

  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,source_folder_bookmark_id,time_zone,time_zone_origin,base_timeframe,
      field_mapping_json,trading_calendar_json,status,total_files,imported_files,failed_files,
      symbol_count,bar_count,storage_bytes,time_start_ts,time_end_ts,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    `Recovery Source ${key}`,
    `/private/recovery/${key}`,
    `bookmark-${key}`,
    'Etc/UTC',
    'USER_SELECTED',
    '1m',
    '{}',
    DEFAULT_TRADING_CALENDAR_JSON,
    'READY',
    1,
    1,
    0,
    1,
    bars.length,
    512,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    jobId,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,
      time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    instrumentId,
    sourceId,
    symbol,
    '1m',
    symbol,
    'LOCAL',
    'Etc/UTC',
    1,
    bars.length,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    `recovery-bars-${key}`,
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,job_mode,status,stage,progress_percent,
      compact_progress_percent,compact_before_bytes,compact_after_bytes,compact_reclaimed_bytes,
      total_files,done_files,total_rows,imported_rows,skipped_rows,error_files,current_file_name,
      error_message,outcome_summary_json,created_at,started_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    jobId,
    sourceId,
    `Recovery Source ${key}`,
    'Etc/UTC',
    '1m',
    'FULL_IMPORT',
    'SUCCESS',
    'DONE',
    100,
    100,
    0,
    0,
    0,
    1,
    1,
    bars.length,
    bars.length,
    0,
    0,
    null,
    null,
    null,
    createdAt,
    createdAt,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,
      file_fingerprint,status,rows_total,rows_imported,rows_skipped,error_message,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `recovery-file-${key}`,
    sourceId,
    jobId,
    instrumentId,
    symbol,
    `${key}.csv`,
    `/private/recovery/${key}/${key}.csv`,
    256,
    1_000,
    `sha256:recovery-${key}`,
    'IMPORTED',
    bars.length,
    bars.length,
    0,
    null,
    createdAt,
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
  await executePortableExport({
    outputPath: exportPath,
    domains: ['MARKET_DATA'],
    marketSourceIds: [sourceId],
    appBuildVersion: 'test-build',
    legalConfirmedForMarketData: true,
  });

  db.prepare('DELETE FROM local_data_source_files WHERE source_id = ?').run(
    sourceId,
  );
  db.prepare('DELETE FROM local_data_import_jobs WHERE source_id = ?').run(
    sourceId,
  );
  db.prepare('DELETE FROM local_data_sources WHERE id = ?').run(sourceId);
  db.prepare('DELETE FROM instruments WHERE id = ?').run(instrumentId);
  await removeMarketInstrumentData(instrumentId);

  return { exportPath, bars };
};

test('portable domain selection rejects explicit empty and all-invalid requests', async () => {
  assert.throws(
    () => previewPortableExport({ domains: [] }),
    expectAppErrorCode('PORTABLE_DOMAIN_SELECTION_REQUIRED'),
  );
  assert.throws(
    () => previewPortableExport({ domains: ['UNKNOWN' as never] }),
    expectAppErrorCode('PORTABLE_DOMAIN_SELECTION_REQUIRED'),
  );
  await assert.rejects(
    executePortableExport({
      outputPath: path.join(tempDataDir, 'portable-empty-domain.otp-package'),
      domains: [],
      appBuildVersion: 'test-build',
    }),
    expectAppErrorCode('PORTABLE_DOMAIN_SELECTION_REQUIRED'),
  );
  await assert.rejects(
    executePortableImport({
      inputPath: path.join(tempDataDir, 'portable-empty-domain.otp-package'),
      domains: [],
    }),
    expectAppErrorCode('PORTABLE_DOMAIN_SELECTION_REQUIRED'),
  );
});

test('portable settings import keeps local settings unless replacement is confirmed', async () => {
  const exportPath = path.join(tempDataDir, 'portable-settings-export.otp-package');

  upsertUserSettingsForTest({
    initialSecuritiesBalance: 123456,
    marketPresetId: 'US_STOCK',
  });
  await executePortableExport({
    outputPath: exportPath,
    domains: ['SETTINGS'],
    appBuildVersion: 'test-build',
  });

  upsertUserSettingsForTest({
    initialSecuritiesBalance: 654321,
    marketPresetId: 'A_SHARE',
  });
  const keepPreview = await inspectPortableImportPackage({ inputPath: exportPath });
  assert.equal(
    keepPreview.domains.find((item) => item.domain === 'SETTINGS')?.conflictCount,
    1,
  );
  const kept = await executePortableImport({
    inputPath: exportPath,
    previewGeneration: keepPreview.previewGeneration,
    domains: ['SETTINGS'],
  }, { requirePreviewGeneration: true });
  assert.equal(kept.importedCountByDomain.SETTINGS, 0);
  assert.equal(kept.skippedCountByDomain.SETTINGS, 1);
  assert.equal(readUserSettingsForTest()?.initialSecuritiesBalance, 654321);
  assert.equal(readUserSettingsForTest()?.marketPresetId, 'A_SHARE');

  const replacePreview = await inspectPortableImportPackage({ inputPath: exportPath });
  assert.equal(
    replacePreview.domains.find((item) => item.domain === 'SETTINGS')?.conflictCount,
    1,
  );
  const replaced = await executePortableImport({
    inputPath: exportPath,
    previewGeneration: replacePreview.previewGeneration,
    domains: ['SETTINGS'],
    settingsConflictMode: 'REPLACE_TARGET',
  }, { requirePreviewGeneration: true });
  assert.equal(replaced.importedCountByDomain.SETTINGS, 1);
  assert.equal(replaced.conflictCountByDomain.SETTINGS, 1);
  assert.equal(readUserSettingsForTest()?.initialSecuritiesBalance, 123456);
  assert.equal(readUserSettingsForTest()?.marketPresetId, 'US_STOCK');

  const stalePreview = await inspectPortableImportPackage({ inputPath: exportPath });
  upsertUserSettingsForTest({
    initialSecuritiesBalance: 777777,
    marketPresetId: 'A_SHARE',
  });
  await assert.rejects(
    executePortableImport({
      inputPath: exportPath,
      previewGeneration: stalePreview.previewGeneration,
      domains: ['SETTINGS'],
    }, { requirePreviewGeneration: true }),
    expectAppErrorCode('PORTABLE_IMPORT_PREVIEW_STALE'),
  );
  assert.equal(readUserSettingsForTest()?.initialSecuritiesBalance, 777777);
});

test('portable custom indicator round trip preserves parameters and revisions', async () => {
  const exportPath = path.join(
    tempDataDir,
    'portable-custom-indicators.otp-package',
  );
  const createdAt = '2026-07-20T00:00:00.000Z';
  const updatedAt = '2026-07-21T00:00:00.000Z';
  const parameterInputs = { N: '12', THRESHOLD: '1.5' };
  const revisions = [
    {
      source: 'ROUNDTRIP_OUT: MA(C, N);',
      parameterInputs: { N: '9', THRESHOLD: '1' },
      savedAt: createdAt,
    },
  ];

  db.prepare('DELETE FROM custom_indicator_profiles').run();
  db.prepare(
    `INSERT INTO custom_indicator_profiles (
      id,name,source,parameter_inputs_json,revisions_json,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    'portable-custom-roundtrip',
    'Round Trip Indicator',
    'ROUNDTRIP_OUT: MA(C, N) + THRESHOLD;',
    JSON.stringify(parameterInputs),
    JSON.stringify(revisions),
    createdAt,
    updatedAt,
  );

  await executePortableExport({
    outputPath: exportPath,
    domains: ['CUSTOM_INDICATORS'],
    appBuildVersion: 'test-build',
  });
  db.prepare('DELETE FROM custom_indicator_profiles').run();

  const imported = await executePortableImport({
    inputPath: exportPath,
    domains: ['CUSTOM_INDICATORS'],
  });
  assert.equal(imported.importedCountByDomain.CUSTOM_INDICATORS, 1);
  const row = db.prepare(
    `SELECT parameter_inputs_json,revisions_json
       FROM custom_indicator_profiles
      WHERE id = ?`,
  ).get('portable-custom-roundtrip') as
    | { parameter_inputs_json: string; revisions_json: string }
    | undefined;
  assert.ok(row);
  assert.deepEqual(JSON.parse(row.parameter_inputs_json), parameterInputs);
  assert.deepEqual(JSON.parse(row.revisions_json), revisions);
});

test('portable conflict preview and execute agree for missing, same, and different rows in both modes', async () => {
  const id = 'portable-conflict-matrix';
  const exportPath = path.join(tempDataDir, `${id}.otp-package`);
  const source = 'MATRIX_OUT: MA(C, 3);';
  const createdAt = '2026-07-22T00:00:00.000Z';
  const insertProfile = (profileSource: string): void => {
    db.prepare('DELETE FROM custom_indicator_profiles WHERE id = ?').run(id);
    db.prepare(
      `INSERT INTO custom_indicator_profiles (
        id,name,source,parameter_inputs_json,revisions_json,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?)`,
    ).run(id, 'Conflict Matrix', profileSource, '{}', '[]', createdAt, createdAt);
  };
  const readSource = (): string => String(
    (db.prepare('SELECT source FROM custom_indicator_profiles WHERE id = ?').get(id) as
      | { source?: unknown }
      | undefined)?.source ?? '',
  );
  const totalChanges = (): number => Number(
    (db.prepare('SELECT total_changes() AS value').get() as { value?: unknown }).value,
  );

  db.prepare('DELETE FROM custom_indicator_profiles').run();
  insertProfile(source);
  await executePortableExport({
    outputPath: exportPath,
    domains: ['CUSTOM_INDICATORS'],
    appBuildVersion: 'test-build',
  });

  db.prepare('DELETE FROM custom_indicator_profiles WHERE id = ?').run(id);
  const beforeMissingPreview = totalChanges();
  const missingPreview = await inspectPortableImportPackage({ inputPath: exportPath });
  assert.equal(totalChanges(), beforeMissingPreview, 'preview must be side-effect free');
  assert.equal(
    missingPreview.domains.find((item) => item.domain === 'CUSTOM_INDICATORS')?.conflictCount,
    0,
  );
  const missingImport = await executePortableImport({
    inputPath: exportPath,
    previewGeneration: missingPreview.previewGeneration,
    domains: ['CUSTOM_INDICATORS'],
    conflictMode: 'MERGE_KEEP_LOCAL',
  }, { requirePreviewGeneration: true });
  assert.equal(missingImport.conflictCountByDomain.CUSTOM_INDICATORS, 0);
  assert.equal(missingImport.importedCountByDomain.CUSTOM_INDICATORS, 1);
  assert.equal(readSource(), source);

  const beforeSamePreview = totalChanges();
  const samePreview = await inspectPortableImportPackage({ inputPath: exportPath });
  assert.equal(totalChanges(), beforeSamePreview, 'same preview must be side-effect free');
  assert.equal(
    samePreview.domains.find((item) => item.domain === 'CUSTOM_INDICATORS')?.conflictCount,
    0,
  );
  const sameImport = await executePortableImport({
    inputPath: exportPath,
    previewGeneration: samePreview.previewGeneration,
    domains: ['CUSTOM_INDICATORS'],
    conflictMode: 'REPLACE_DOMAIN',
  }, { requirePreviewGeneration: true });
  assert.equal(sameImport.conflictCountByDomain.CUSTOM_INDICATORS, 0);
  assert.equal(sameImport.skippedCountByDomain.CUSTOM_INDICATORS, 1);

  insertProfile('MATRIX_OUT: EMA(C, 9);');
  const beforeKeepPreview = totalChanges();
  const keepPreview = await inspectPortableImportPackage({ inputPath: exportPath });
  assert.equal(totalChanges(), beforeKeepPreview, 'keep preview must be side-effect free');
  assert.equal(
    keepPreview.domains.find((item) => item.domain === 'CUSTOM_INDICATORS')?.conflictCount,
    1,
  );
  const keepImport = await executePortableImport({
    inputPath: exportPath,
    previewGeneration: keepPreview.previewGeneration,
    domains: ['CUSTOM_INDICATORS'],
    conflictMode: 'MERGE_KEEP_LOCAL',
  }, { requirePreviewGeneration: true });
  assert.equal(keepImport.conflictCountByDomain.CUSTOM_INDICATORS, 1);
  assert.equal(keepImport.skippedCountByDomain.CUSTOM_INDICATORS, 1);
  assert.equal(readSource(), 'MATRIX_OUT: EMA(C, 9);');

  const beforeReplacePreview = totalChanges();
  const replacePreview = await inspectPortableImportPackage({ inputPath: exportPath });
  assert.equal(totalChanges(), beforeReplacePreview, 'replace preview must be side-effect free');
  assert.equal(
    replacePreview.domains.find((item) => item.domain === 'CUSTOM_INDICATORS')?.conflictCount,
    1,
  );
  const replaceImport = await executePortableImport({
    inputPath: exportPath,
    previewGeneration: replacePreview.previewGeneration,
    domains: ['CUSTOM_INDICATORS'],
    conflictMode: 'REPLACE_DOMAIN',
  }, { requirePreviewGeneration: true });
  assert.equal(replaceImport.conflictCountByDomain.CUSTOM_INDICATORS, 1);
  assert.equal(replaceImport.importedCountByDomain.CUSTOM_INDICATORS, 1);
  assert.equal(readSource(), source);
});

test('portable import rejects malformed inner manifests, schema drift, and domain JSON', async () => {
  const sourcePath = path.join(
    tempDataDir,
    'portable-strict-inner-validation.otp-package',
  );
  await executePortableExport({
    outputPath: sourcePath,
    domains: ['SETTINGS'],
    appBuildVersion: 'test-build',
  });

  const cases: Array<{
    name: string;
    mutate: (payloadDb: Database.Database) => void;
  }> = [
    {
      name: 'schema-version',
      mutate(payloadDb) {
        const row = payloadDb
          .prepare(
            `SELECT payload_json AS payloadJson
               FROM portable_export_manifest
              WHERE manifest_key = 'MANIFEST'`,
          )
          .get() as { payloadJson: string };
        const manifest = JSON.parse(row.payloadJson) as Record<string, unknown>;
        manifest.schemaVersion = 1;
        payloadDb
          .prepare(
            `UPDATE portable_export_manifest
                SET payload_json = ?
              WHERE manifest_key = 'MANIFEST'`,
          )
          .run(JSON.stringify(manifest));
      },
    },
    {
      name: 'count-mismatch',
      mutate(payloadDb) {
        const row = payloadDb
          .prepare(
            `SELECT payload_json AS payloadJson
               FROM portable_export_manifest
              WHERE manifest_key = 'MANIFEST'`,
          )
          .get() as { payloadJson: string };
        const manifest = JSON.parse(row.payloadJson) as {
          countsByDomain: Record<string, number>;
        };
        manifest.countsByDomain.SETTINGS = 2;
        payloadDb
          .prepare(
            `UPDATE portable_export_manifest
                SET payload_json = ?
              WHERE manifest_key = 'MANIFEST'`,
          )
          .run(JSON.stringify(manifest));
      },
    },
    {
      name: 'extra-table',
      mutate(payloadDb) {
        payloadDb.exec('CREATE TABLE injected_private_state (value TEXT)');
      },
    },
    {
      name: 'malformed-settings-json',
      mutate(payloadDb) {
        payloadDb
          .prepare(
            `UPDATE portable_export_settings
                SET payload_json = '{'
              WHERE domain_key = 'SETTINGS'`,
          )
          .run();
      },
    },
  ];

  for (const item of cases) {
    const candidatePath = path.join(
      tempDataDir,
      `portable-strict-${item.name}.otp-package`,
    );
    await fs.promises.copyFile(sourcePath, candidatePath);
    await rewritePortablePayloadForTest(candidatePath, item.mutate);
    await assert.rejects(
      inspectPortableImportPackage({ inputPath: candidatePath }),
      expectAppErrorCode('PORTABLE_PACKAGE_TAMPERED'),
      item.name,
    );
  }
});

test('portable export returns the canonical output path after creating the target directory', async () => {
  const requestedDir = path.join('/tmp', `otp-portable-canonical-${crypto.randomUUID()}`);
  const requestedPath = path.join(requestedDir, 'canonical.otp-package');
  try {
    const exported = await executePortableExport({
      outputPath: requestedPath,
      domains: ['SETTINGS'],
      appBuildVersion: 'test-build',
    });
    const canonicalDir = await fs.promises.realpath(requestedDir);

    assert.equal(exported.outputPath, path.join(canonicalDir, 'canonical.otp-package'));
    assert.ok(fs.existsSync(exported.outputPath));
  } finally {
    await fs.promises.rm(requestedDir, { recursive: true, force: true });
  }
});

test('portable export/import restores training history as snapshot-only without market bindings', async () => {
  const instrumentId = 'portable-instrument-1';
  const projectId = 'portable-project-1';
  const createdAt = '2026-04-18T08:00:00.000Z';
  const symbol = 'PORTABLEUSD.PERP';
  const exportPath = path.join(tempDataDir, 'portable-training-export.otp-package');
  const bars = [
    {
      ts: '2025-01-02T00:00:00.000Z',
      open: 100,
      high: 104,
      low: 99,
      close: 102,
      volume: 1000,
    },
    {
      ts: '2025-01-02T00:01:00.000Z',
      open: 102,
      high: 106,
      low: 101,
      close: 105,
      volume: 1200,
    },
    {
      ts: '2025-01-02T00:02:00.000Z',
      open: 105,
      high: 107,
      low: 103,
      close: 104,
      volume: 900,
    },
  ];

  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    instrumentId,
    'source-1',
    symbol,
    '1m',
    'Portable Instrument',
    'LOCAL',
    'Etc/UTC',
    0,
    null,
    null,
    'bars-v1',
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,source_folder_bookmark_id,time_zone,time_zone_origin,base_timeframe,field_mapping_json,trading_calendar_json,status,total_files,imported_files,failed_files,symbol_count,bar_count,storage_bytes,time_start_ts,time_end_ts,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'source-1',
    'Portable Source',
    '/private/path/ignored',
    'bookmark-1',
    'Etc/UTC',
    'USER_SELECTED',
    '1m',
    '{}',
    DEFAULT_TRADING_CALENDAR_JSON,
    'READY',
    1,
    1,
    0,
    1,
    bars.length,
    1024,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    null,
    createdAt,
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,job_mode,status,stage,progress_percent,
      compact_progress_percent,compact_before_bytes,compact_after_bytes,compact_reclaimed_bytes,
      total_files,done_files,total_rows,imported_rows,skipped_rows,error_files,current_file_name,
      error_message,outcome_summary_json,created_at,started_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'job-1',
    'source-1',
    'Portable Source',
    'Etc/UTC',
    '1m',
    'FULL_IMPORT',
    'SUCCESS',
    'DONE',
    100,
    100,
    0,
    0,
    0,
    1,
    1,
    bars.length,
    bars.length,
    0,
    0,
    null,
    null,
    null,
    createdAt,
    createdAt,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,status,
      rows_total,rows_imported,rows_skipped,error_message,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'portable-file-1',
    'source-1',
    'job-1',
    instrumentId,
    symbol,
    'portable.csv',
    '/private/path/ignored/portable.csv',
    512,
    1000,
    'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'IMPORTED',
    1,
    1,
    0,
    null,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO training_projects (
      id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,training_date_range,initial_total,total_pnl,profit_rate,duration_days,total_trades,final_equity,equity_return_rate,simulation_batch_id,source_tag,summary_json,operator_summary_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    projectId,
    'Portable Training',
    createdAt,
    createdAt,
    symbol,
    '__portable_pool__',
    'Portable Pool',
    '1m',
    '2025-01-02 ~ 2025-01-02',
    50000,
    800,
    0.016,
    1,
    2,
    50800,
    0.016,
    null,
    'LOCAL_IMPORT',
    JSON.stringify({
      initialAsset: 50000,
      endingAsset: 50800,
      assetReturnRate: 0.016,
      durationDays: 1,
      startDate: '2025-01-02',
      endDate: '2025-01-02',
      buyCount: 1,
      sellCount: 1,
      totalTrades: 2,
      investedAmount: 10000,
      tradingCost: 10,
      realizedPnl: 800,
      unrealizedPnl: 0,
      totalPnl: 800,
      profitRate: 0.016,
      maxDrawdownRate: 0.01,
      maxDrawdownAmount: 500,
      decisionSecondsUsed: 0,
      decisionCount: 0,
    }),
    JSON.stringify({
      operatorKind: 'HUMAN',
      operationMode: null,
      operatorSource: null,
      clientLabel: null,
      modelLabel: null,
      runId: null,
      actionCount: 0,
      orderCount: 0,
      decisionCount: 0,
      decisionSecondsUsed: 0,
      nonTradeActionCount: 0,
      errorActionCount: 0,
      forcedLiquidationCount: 0,
    }),
  );

  const savedReplayRef = saveTrainingProjectReplayRef(
    projectId,
    {
      bars,
      snapshot: {
        session: {
          id: projectId,
          instrument_id: instrumentId,
          symbol,
          entry_index: 1,
          cursor_index: 2,
          history_bars: bars.length,
        },
        fills: [],
        sessionTradingSettings: {
          assetClass: 'CRYPTO',
          marketPresetId: 'CRYPTO',
        },
      },
      drawings: [],
      chartIndicators: null,
      baseTimeframe: '1m',
    },
    createdAt,
  );
  assert.ok(savedReplayRef);

  const exportPreview = previewPortableExport({
    domains: ['TRAINING_HISTORY'],
    dateRange: {
      from: '2026-04-18T00:00:00.000Z',
      to: '2026-04-19T00:00:00.000Z',
    },
  });
  assert.equal(
    exportPreview.domains.find((item) => item.domain === 'TRAINING_HISTORY')
      ?.itemCount,
    1,
  );

  let exported;
  try {
    exported = await executePortableExport({
      outputPath: exportPath,
      domains: ['TRAINING_HISTORY'],
      appBuildVersion: 'test-build',
    });
  } catch (error) {
    throw new Error(`portable export failed: ${JSON.stringify(error)}`);
  }
  assert.equal(exported.manifest.countsByDomain.TRAINING_HISTORY, 1);

  db.prepare('DELETE FROM training_project_portable_previews').run();
  db.prepare('DELETE FROM training_project_replay_refs').run();
  db.prepare('DELETE FROM training_projects').run();
  db.prepare('DELETE FROM local_data_source_files').run();
  db.prepare('DELETE FROM local_data_sources').run();
  db.prepare('DELETE FROM instruments').run();
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'unrelated-portable-instrument',
    'unrelated-source',
    symbol,
    '1m',
    'Unrelated Instrument',
    'LOCAL',
    'Etc/UTC',
    0,
    null,
    null,
    'bars-unrelated',
    createdAt,
  );

  let imported;
  try {
    imported = await executePortableImport({
      inputPath: exportPath,
      domains: ['TRAINING_HISTORY'],
    });
  } catch (error) {
    throw new Error(`portable import failed: ${JSON.stringify(error)}`);
  }
  assert.equal(imported.importedCountByDomain.TRAINING_HISTORY, 1);

  const project = await getTrainingProjectById(projectId);
  assert.ok(project);
  assert.equal(project?.replayHydrationStatus, 'SNAPSHOT_ONLY');
  assert.equal(Array.isArray(project?.replay?.bars), true);
  assert.ok((project?.replay?.bars?.length ?? 0) > 0);
  assert.equal(project?.replay?.bars?.[0]?.ts, bars[0]?.ts);
  const replayRefRow = db
    .prepare(
      `SELECT instrument_id AS instrumentId
         FROM training_project_replay_refs
        WHERE project_id = ?
        LIMIT 1`,
    )
    .get(projectId) as { instrumentId?: string } | undefined;
  assert.equal(String(replayRefRow?.instrumentId ?? ''), '');
  const importedProjectRow = db
    .prepare(
      `SELECT sample_pool_id AS samplePoolId
         FROM training_projects
        WHERE id = ?
        LIMIT 1`,
    )
    .get(projectId) as { samplePoolId?: string } | undefined;
  assert.equal(String(importedProjectRow?.samplePoolId ?? ''), '');
});

test('portable export/import restores market data and binds replay to imported instrument', async () => {
  const sourceId = 'market-source-1';
  const instrumentId = 'market-instrument-1';
  const projectId = 'market-project-1';
  const createdAt = '2026-04-18T09:00:00.000Z';
  const symbol = 'MARKETUSD.PERP';
  const exportPath = path.join(tempDataDir, 'portable-market-export.otp-package');
  const bars = [
    {
      ts: '2025-02-02T00:00:00.000Z',
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
    },
    {
      ts: '2025-02-02T00:01:00.000Z',
      open: 11,
      high: 13,
      low: 10,
      close: 12,
      volume: 120,
    },
  ];

  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    instrumentId,
    sourceId,
    symbol,
    '1m',
    symbol,
    'LOCAL',
    'Etc/UTC',
    1,
    bars.length,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    'market-bars-v1',
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,source_folder_bookmark_id,time_zone,time_zone_origin,base_timeframe,field_mapping_json,trading_calendar_json,status,total_files,imported_files,failed_files,symbol_count,bar_count,storage_bytes,time_start_ts,time_end_ts,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    'Market Source',
    '/private/path/market',
    'bookmark-market',
    'Etc/UTC',
    'USER_SELECTED',
    '1m',
    '{}',
    DEFAULT_TRADING_CALENDAR_JSON,
    'READY',
    1,
    1,
    0,
    1,
    bars.length,
    2048,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    null,
    createdAt,
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,job_mode,status,stage,progress_percent,
      compact_progress_percent,compact_before_bytes,compact_after_bytes,compact_reclaimed_bytes,
      total_files,done_files,total_rows,imported_rows,skipped_rows,error_files,current_file_name,
      error_message,outcome_summary_json,created_at,started_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'job-market',
    sourceId,
    'Market Source',
    'Etc/UTC',
    '1m',
    'FULL_IMPORT',
    'SUCCESS',
    'DONE',
    100,
    100,
    0,
    0,
    0,
    1,
    1,
    bars.length,
    bars.length,
    0,
    0,
    null,
    null,
    null,
    createdAt,
    createdAt,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,status,
      rows_total,rows_imported,rows_skipped,error_message,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'market-file-1',
    sourceId,
    'job-market',
    instrumentId,
    symbol,
    'market.csv',
    '/private/path/market/market.csv',
    1024,
    2000,
    'sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    'IMPORTED',
    1,
    1,
    0,
    null,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO training_projects (
      id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,training_date_range,initial_total,total_pnl,profit_rate,duration_days,total_trades,final_equity,equity_return_rate,simulation_batch_id,source_tag,summary_json,operator_summary_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    projectId,
    'Market Training',
    createdAt,
    createdAt,
    symbol,
    sourceId,
    'Market Source',
    '1m',
    '2025-02-02 ~ 2025-02-02',
    1000,
    100,
    0.1,
    1,
    1,
    1100,
    0.1,
    null,
    'LOCAL_IMPORT',
    '{}',
    'null',
  );
  const savedReplayRef = saveTrainingProjectReplayRef(
    projectId,
    {
      bars,
      snapshot: {
        session: {
          id: projectId,
          instrument_id: instrumentId,
          symbol,
          entry_index: 0,
          cursor_index: 1,
          history_bars: bars.length,
        },
        fills: [],
        sessionTradingSettings: {
          assetClass: 'CRYPTO',
          marketPresetId: 'CRYPTO',
        },
      },
      drawings: [{ id: 'drawing-1', name: 'line' }],
      chartIndicators: { main: [] },
      baseTimeframe: '1m',
    },
    createdAt,
  );
  assert.ok(savedReplayRef);
  db.prepare('DELETE FROM replay_note_context_archives WHERE note_id = ?').run('market-note-1');
  db.prepare('DELETE FROM replay_note_context_refs WHERE note_id = ?').run('market-note-1');
  db.prepare('DELETE FROM replay_note_contents WHERE note_id = ?').run('market-note-1');
  db.prepare('DELETE FROM replay_note_meta WHERE note_id = ?').run('market-note-1');
  db.prepare('DELETE FROM replay_notes WHERE id = ?').run('market-note-1');
  await createReplayNote({
    id: 'market-note-1',
    title: 'Market Context Note',
    type: 'FREE_REPLAY',
    trainingProjectId: projectId,
    contextSessionId: projectId,
    contextCursorIndex: 1,
    contextReplay: {
      snapshot: {
        session: {
          id: projectId,
          instrument_id: instrumentId,
          symbol,
          cursor_index: 1,
        },
      },
    },
    contentDocument: {
      schemaVersion: 1,
      blocks: [
        {
          blockKind: 'PARAGRAPH',
          children: [{ inlineKind: 'TEXT', text: 'market note body' }],
        },
      ],
    },
    createdAt,
    updatedAt: createdAt,
  });

  await executePortableExport({
    outputPath: exportPath,
    domains: ['TRAINING_HISTORY', 'MARKET_DATA', 'NOTES'],
    marketSourceIds: [sourceId],
    appBuildVersion: 'test-build',
    legalConfirmedForMarketData: true,
  });

  const forgedFingerprintPath = path.join(
    tempDataDir,
    'portable-market-forged-fingerprint.otp-package',
  );
  await fs.promises.copyFile(exportPath, forgedFingerprintPath);
  await rewritePortablePayloadForTest(forgedFingerprintPath, (payloadDb) => {
    const row = payloadDb
      .prepare(
        `SELECT payload_json AS payloadJson
           FROM portable_export_market_sources
          WHERE source_id = ?`,
      )
      .get(sourceId) as { payloadJson?: string } | undefined;
    assert.ok(row?.payloadJson);
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    payload.fingerprintHash = '0'.repeat(64);
    payloadDb
      .prepare(
        `UPDATE portable_export_market_sources
            SET payload_json = ?
          WHERE source_id = ?`,
      )
      .run(JSON.stringify(payload), sourceId);
  });
  await assert.rejects(
    executePortableImport({
      inputPath: forgedFingerprintPath,
      domains: ['MARKET_DATA'],
      legalConfirmedForMarketData: true,
    }),
    expectAppErrorCode('PORTABLE_PACKAGE_TAMPERED'),
  );

  db.prepare('DELETE FROM replay_note_context_archives').run();
  db.prepare('DELETE FROM replay_note_context_refs').run();
  db.prepare('DELETE FROM replay_note_contents').run();
  db.prepare('DELETE FROM replay_note_meta').run();
  db.prepare('DELETE FROM replay_notes').run();
  db.prepare('DELETE FROM training_project_portable_previews').run();
  db.prepare('DELETE FROM training_project_replay_refs').run();
  db.prepare('DELETE FROM training_projects').run();
  db.prepare('DELETE FROM local_data_source_files').run();
  db.prepare('DELETE FROM local_data_sources').run();
  db.prepare('DELETE FROM instruments').run();

  const imported = await executePortableImport({
    inputPath: exportPath,
    domains: ['TRAINING_HISTORY', 'MARKET_DATA', 'NOTES'],
    legalConfirmedForMarketData: true,
  });
  assert.equal(imported.marketImport.importedSources, 1);
  assert.equal(imported.marketImport.importedBars, bars.length);
  assert.equal(imported.marketImport.pendingRebindSourceIds.length, 1);

  const importedProject = await getTrainingProjectById(projectId);
  assert.ok(importedProject);
  assert.equal(importedProject?.replayHydrationStatus, 'READY');
  assert.equal(importedProject?.replay?.bars?.[0]?.ts, bars[0]?.ts);
  const importedProjectRow = db
    .prepare(
      `SELECT sample_pool_id AS samplePoolId
         FROM training_projects
        WHERE id = ?
        LIMIT 1`,
    )
    .get(projectId) as { samplePoolId?: string } | undefined;
  assert.equal(
    String(importedProjectRow?.samplePoolId ?? ''),
    imported.marketImport.pendingRebindSourceIds[0],
  );

  const importedSourceRow = db
    .prepare(
      `SELECT source_folder AS sourceFolder,
              status,
              deletion_state AS deletionState
         FROM local_data_sources
        WHERE id = ?
        LIMIT 1`,
    )
    .get(imported.marketImport.pendingRebindSourceIds[0]) as
    | { sourceFolder?: string; status?: string; deletionState?: string }
    | undefined;
  assert.equal(String(importedSourceRow?.sourceFolder ?? ''), '');
  assert.equal(importedSourceRow?.status, 'READY');
  assert.equal(importedSourceRow?.deletionState, 'IDLE');

  const importedReplayRefRow = db
    .prepare(
      `SELECT instrument_id AS instrumentId
         FROM training_project_replay_refs
        WHERE project_id = ?
        LIMIT 1`,
    )
    .get(projectId) as { instrumentId?: string } | undefined;
  const importedNoteRow = db
    .prepare(
      `SELECT training_project_id AS trainingProjectId,
              context_session_id AS contextSessionId
         FROM replay_notes
        WHERE id = ?
        LIMIT 1`,
    )
    .get('market-note-1') as
    | { trainingProjectId?: string | null; contextSessionId?: string | null }
    | undefined;
  const importedNoteContextRef = db
    .prepare(
      `SELECT training_project_id AS trainingProjectId
         FROM replay_note_context_refs
        WHERE note_id = ?
        LIMIT 1`,
    )
    .get('market-note-1') as { trainingProjectId?: string | null } | undefined;
  const importedArchiveRow = db
    .prepare(
      `SELECT archive_payload AS archivePayload
         FROM replay_note_context_archives
        WHERE note_id = ?
        LIMIT 1`,
    )
    .get('market-note-1') as { archivePayload?: Buffer } | undefined;
  assert.equal(importedNoteRow?.trainingProjectId, projectId);
  assert.equal(importedNoteRow?.contextSessionId, projectId);
  assert.equal(importedNoteContextRef?.trainingProjectId, projectId);
  assert.ok(importedArchiveRow?.archivePayload);
  const importedArchive = JSON.parse(
    gunzipSync(importedArchiveRow.archivePayload).toString('utf8'),
  ) as { snapshot?: { session?: { instrument_id?: string } } };
  assert.equal(
    importedArchive.snapshot?.session?.instrument_id,
    importedReplayRefRow?.instrumentId,
  );
  assert.notEqual(importedArchive.snapshot?.session?.instrument_id, instrumentId);

  const immediateDiagnostics = await getLocalDataSourceDiagnostics(
    imported.marketImport.pendingRebindSourceIds[0] ?? '',
  );
  assert.equal(immediateDiagnostics.status, 'READY');
  assert.equal(immediateDiagnostics.scannedSymbols, 1);

  const importedSourceId = imported.marketImport.pendingRebindSourceIds[0] ?? '';
  db.prepare(
    `UPDATE local_data_sources
        SET deletion_state = 'MUTATING_SYMBOLS'
      WHERE id = ?`,
  ).run(importedSourceId);
  await assert.rejects(
    () =>
      executePortableImport({
        inputPath: exportPath,
        domains: ['MARKET_DATA'],
        legalConfirmedForMarketData: true,
      }),
    expectAppErrorCode('LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS'),
  );
  db.prepare(
    `UPDATE local_data_sources
        SET deletion_state = 'IDLE'
      WHERE id = ?`,
  ).run(importedSourceId);

  const reusedInstrumentId = String(importedReplayRefRow?.instrumentId ?? '');
  const sourceBeforeFailedReuse = db
    .prepare(
      `SELECT bar_count AS barCount, storage_bytes AS storageBytes
         FROM local_data_sources
        WHERE id = ?`,
    )
    .get(importedSourceId) as { barCount: number; storageBytes: number };
  const barsBeforeFailedReuse = await getMarketBarsByInstrumentIdRange(
    reusedInstrumentId,
    0,
    100,
  );
  await rewritePortablePayloadForTest(exportPath, (payloadDb) => {
    const row = payloadDb
      .prepare(
        `SELECT payload_json AS payloadJson
           FROM portable_export_training_projects
          WHERE id = ?`,
      )
      .get(projectId) as { payloadJson: string };
    const bundle = JSON.parse(row.payloadJson) as {
      project?: Record<string, unknown>;
    };
    bundle.project = { ...(bundle.project ?? {}), name: 'x'.repeat(1000) };
    payloadDb
      .prepare(
        `UPDATE portable_export_training_projects
            SET payload_json = ?
          WHERE id = ?`,
      )
      .run(JSON.stringify(bundle), projectId);
  });
  await assert.rejects(
    executePortableImport({
      inputPath: exportPath,
      domains: ['MARKET_DATA', 'TRAINING_HISTORY'],
      legalConfirmedForMarketData: true,
    }),
    (error: unknown): boolean => {
      assert.match(String(error), /CHECK constraint failed|constraint/i);
      return true;
    },
  );
  const sourceAfterFailedReuse = db
    .prepare(
      `SELECT bar_count AS barCount, storage_bytes AS storageBytes
         FROM local_data_sources
        WHERE id = ?`,
    )
    .get(importedSourceId) as { barCount: number; storageBytes: number };
  assert.deepEqual(sourceAfterFailedReuse, sourceBeforeFailedReuse);
  assert.deepEqual(
    await getMarketBarsByInstrumentIdRange(reusedInstrumentId, 0, 100),
    barsBeforeFailedReuse,
  );
  await rewritePortablePayloadForTest(exportPath, (payloadDb) => {
    const row = payloadDb
      .prepare(
        `SELECT payload_json AS payloadJson
           FROM portable_export_training_projects
          WHERE id = ?`,
      )
      .get(projectId) as { payloadJson: string };
    const bundle = JSON.parse(row.payloadJson) as {
      project?: Record<string, unknown>;
    };
    bundle.project = { ...(bundle.project ?? {}), name: 'Market Training' };
    payloadDb
      .prepare(
        `UPDATE portable_export_training_projects
            SET payload_json = ?
          WHERE id = ?`,
      )
      .run(JSON.stringify(bundle), projectId);
  });

  const secondImport = await executePortableImport({
    inputPath: exportPath,
    domains: ['TRAINING_HISTORY', 'MARKET_DATA', 'NOTES'],
    legalConfirmedForMarketData: true,
  });
  assert.equal(secondImport.marketImport.importedSources, 0);
  assert.equal(secondImport.marketImport.reusedSources, 1);
  const duplicateSourceCount = db
    .prepare('SELECT COUNT(*) AS count FROM local_data_sources WHERE name = ?')
    .get('Market Source') as { count: number };
  const duplicateProjectCount = db
    .prepare('SELECT COUNT(*) AS count FROM training_projects WHERE name = ?')
    .get('Market Training') as { count: number };
  const duplicateNoteCount = db
    .prepare('SELECT COUNT(*) AS count FROM replay_notes WHERE title LIKE ?')
    .get('Market Context Note%') as { count: number };
  assert.equal(duplicateSourceCount.count, 1);
  assert.equal(duplicateProjectCount.count, 1);
  assert.equal(duplicateNoteCount.count, 1);

  const importWithDiagnosticFailure = await executePortableImport(
    {
      inputPath: exportPath,
      domains: ['MARKET_DATA'],
      legalConfirmedForMarketData: true,
    },
    {
      ensureDiagnosticsCache: async () => {
        throw new Error('diagnostic-cache-unavailable');
      },
    },
  );
  assert.equal(importWithDiagnosticFailure.marketImport.reusedSources, 1);
  assert.deepEqual(
    await getMarketBarsByInstrumentIdRange(reusedInstrumentId, 0, 100),
    barsBeforeFailedReuse,
  );
});

test('portable import does not reuse an existing source when time-zone semantics differ', async () => {
  const sourceId = 'tz-source-1';
  const instrumentId = 'tz-instrument-1';
  const createdAt = '2026-04-18T10:00:00.000Z';
  const symbol = 'TZUSD.PERP';
  const exportPath = path.join(tempDataDir, 'portable-timezone-export.otp-package');
  const bars = [
    {
      ts: '2025-03-02T00:00:00.000Z',
      open: 20,
      high: 22,
      low: 19,
      close: 21,
      volume: 50,
    },
  ];

  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    instrumentId,
    sourceId,
    symbol,
    '1m',
    symbol,
    'LOCAL',
    'Asia/Shanghai',
    1,
    bars.length,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    'tz-bars-v1',
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,source_folder_bookmark_id,time_zone,time_zone_origin,base_timeframe,field_mapping_json,trading_calendar_json,status,total_files,imported_files,failed_files,symbol_count,bar_count,storage_bytes,time_start_ts,time_end_ts,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    'Timezone Source',
    '/private/path/timezone',
    'bookmark-timezone',
    'Asia/Shanghai',
    'USER_SELECTED',
    '1m',
    '{"ts":"time"}',
    DEFAULT_TRADING_CALENDAR_JSON,
    'READY',
    1,
    1,
    0,
    1,
    bars.length,
    1024,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    null,
    createdAt,
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,job_mode,status,stage,progress_percent,
      compact_progress_percent,compact_before_bytes,compact_after_bytes,compact_reclaimed_bytes,
      total_files,done_files,total_rows,imported_rows,skipped_rows,error_files,current_file_name,
      error_message,outcome_summary_json,created_at,started_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'job-tz',
    sourceId,
    'Timezone Source',
    'Asia/Shanghai',
    '1m',
    'FULL_IMPORT',
    'SUCCESS',
    'DONE',
    100,
    100,
    0,
    0,
    0,
    1,
    1,
    bars.length,
    bars.length,
    0,
    0,
    null,
    null,
    null,
    createdAt,
    createdAt,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,status,
      rows_total,rows_imported,rows_skipped,error_message,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'tz-file-1',
    sourceId,
    'job-tz',
    instrumentId,
    symbol,
    'timezone.csv',
    '/private/path/timezone/timezone.csv',
    100,
    3000,
    'sha256:timezone-fingerprint',
    'IMPORTED',
    1,
    1,
    0,
    null,
    createdAt,
    createdAt,
  );

  await executePortableExport({
    outputPath: exportPath,
    domains: ['MARKET_DATA'],
    marketSourceIds: [sourceId],
    appBuildVersion: 'test-build',
    legalConfirmedForMarketData: true,
  });

  db.prepare('DELETE FROM local_data_source_files').run();
  db.prepare('DELETE FROM local_data_import_jobs').run();
  db.prepare('DELETE FROM local_data_sources').run();
  db.prepare('DELETE FROM instruments').run();

  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,source_folder_bookmark_id,time_zone,time_zone_origin,base_timeframe,field_mapping_json,trading_calendar_json,status,total_files,imported_files,failed_files,symbol_count,bar_count,storage_bytes,time_start_ts,time_end_ts,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'existing-local-source',
    'Existing Local Source',
    '/private/path/existing',
    'bookmark-existing',
    'Etc/UTC',
    'USER_SELECTED',
    '1m',
    '{"ts":"time"}',
    DEFAULT_TRADING_CALENDAR_JSON,
    'READY',
    1,
    1,
    0,
    1,
    bars.length,
    1024,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    null,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'existing-local-instrument',
    'existing-local-source',
    symbol,
    '1m',
    symbol,
    'LOCAL',
    'Etc/UTC',
    1,
    bars.length,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    'existing-bars',
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,job_mode,status,stage,progress_percent,
      compact_progress_percent,compact_before_bytes,compact_after_bytes,compact_reclaimed_bytes,
      total_files,done_files,total_rows,imported_rows,skipped_rows,error_files,current_file_name,
      error_message,outcome_summary_json,created_at,started_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'existing-job',
    'existing-local-source',
    'Existing Local Source',
    'Etc/UTC',
    '1m',
    'FULL_IMPORT',
    'SUCCESS',
    'DONE',
    100,
    100,
    0,
    0,
    0,
    1,
    1,
    bars.length,
    bars.length,
    0,
    0,
    null,
    null,
    null,
    createdAt,
    createdAt,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,status,
      rows_total,rows_imported,rows_skipped,error_message,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'existing-file-1',
    'existing-local-source',
    'existing-job',
    'existing-local-instrument',
    symbol,
    'timezone.csv',
    '/private/path/existing/timezone.csv',
    100,
    3000,
    'sha256:timezone-fingerprint',
    'IMPORTED',
    1,
    1,
    0,
    null,
    createdAt,
    createdAt,
  );

  const imported = await executePortableImport({
    inputPath: exportPath,
    domains: ['MARKET_DATA'],
    legalConfirmedForMarketData: true,
  });

  assert.equal(imported.marketImport.reusedSources, 0);
  assert.equal(imported.marketImport.importedSources, 1);
});

test('portable export/import restores replay note colors', async () => {
  const createdAt = '2026-04-22T08:00:00.000Z';
  const exportPath = path.join(tempDataDir, 'portable-notes-export.otp-package');

  db.prepare('DELETE FROM replay_note_colors').run();
  db.prepare('DELETE FROM replay_note_contents').run();
  db.prepare('DELETE FROM replay_note_meta').run();
  db.prepare('DELETE FROM replay_note_context_archives').run();
  db.prepare('DELETE FROM replay_notes_fts').run();
  db.prepare('DELETE FROM replay_notes').run();

  await createReplayNote({
    id: 'portable-note-1',
    title: 'Portable Note',
    type: 'CUSTOM',
    contentDocument: {
      schemaVersion: 1,
      blocks: [
        {
          blockKind: 'PARAGRAPH',
          children: [{ inlineKind: 'TEXT', text: 'portable note body' }],
        },
      ],
    },
    sourceKind: 'CUSTOM',
    colorTokens: ['RED', 'BLUE'],
    createdAt,
    updatedAt: createdAt,
  });

  const preview = previewPortableExport({ domains: ['NOTES'] });
  assert.equal(
    preview.domains.find((item) => item.domain === 'NOTES')?.itemCount,
    1,
  );

  const exported = await executePortableExport({
    outputPath: exportPath,
    domains: ['NOTES'],
    appBuildVersion: 'test-build',
  });
  assert.equal(exported.manifest.countsByDomain.NOTES, 1);

  db.prepare('DELETE FROM replay_note_colors').run();
  db.prepare('DELETE FROM replay_note_contents').run();
  db.prepare('DELETE FROM replay_note_meta').run();
  db.prepare('DELETE FROM replay_note_context_archives').run();
  db.prepare('DELETE FROM replay_notes_fts').run();
  db.prepare('DELETE FROM replay_notes').run();

  const imported = await executePortableImport({
    inputPath: exportPath,
    domains: ['NOTES'],
  });

  assert.equal(imported.importedCountByDomain.NOTES, 1);
  const importedNote = db
    .prepare('SELECT type FROM replay_notes WHERE id = ? LIMIT 1')
    .get('portable-note-1') as { type: string } | undefined;
  assert.equal(importedNote?.type, 'CUSTOM');
  const importedColors = db
    .prepare(
      `SELECT color_token
         FROM replay_note_colors
        WHERE note_id = ?
        ORDER BY sort_index ASC, color_token ASC`,
    )
    .all('portable-note-1') as Array<{ color_token: string }>;
  assert.deepEqual(
    importedColors.map((row) => row.color_token),
    ['RED', 'BLUE'],
  );
});

test('portable market import cleans written rows when a later selected domain fails', async () => {
  const sourceId = 'cleanup-source-1';
  const instrumentId = 'cleanup-instrument-1';
  const projectId = 'cleanup-project-1';
  const createdAt = '2026-04-25T08:00:00.000Z';
  const symbol = 'CLEANUPUSD.PERP';
  const exportPath = path.join(tempDataDir, 'portable-market-cleanup.otp-package');
  const bars = [
    {
      ts: '2025-04-02T00:00:00.000Z',
      open: 30,
      high: 33,
      low: 29,
      close: 32,
      volume: 200,
    },
  ];

  db.prepare('DELETE FROM training_project_portable_previews WHERE project_id = ?').run(
    projectId,
  );
  db.prepare('DELETE FROM training_project_replay_refs WHERE project_id = ?').run(
    projectId,
  );
  db.prepare('DELETE FROM training_projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM local_data_source_files WHERE source_id = ? OR instrument_id = ?').run(
    sourceId,
    instrumentId,
  );
  db.prepare('DELETE FROM local_data_import_jobs WHERE source_id = ?').run(sourceId);
  db.prepare('DELETE FROM local_data_sources WHERE id = ?').run(sourceId);
  db.prepare('DELETE FROM instruments WHERE id = ? OR symbol = ?').run(
    instrumentId,
    symbol,
  );
  await removeMarketInstrumentData(instrumentId);

  db.prepare(
    `INSERT INTO instruments (
      id,source_id,symbol,base_timeframe,name,market,time_zone,min_trade_step,bar_count,time_start_ts,time_end_ts,bars_version_token,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    instrumentId,
    sourceId,
    symbol,
    '1m',
    symbol,
    'LOCAL',
    'Etc/UTC',
    1,
    bars.length,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    'cleanup-bars-v1',
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_sources (
      id,name,source_folder,source_folder_bookmark_id,time_zone,time_zone_origin,base_timeframe,field_mapping_json,trading_calendar_json,status,total_files,imported_files,failed_files,symbol_count,bar_count,storage_bytes,time_start_ts,time_end_ts,last_job_id,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    sourceId,
    'Cleanup Market Source',
    '/private/path/cleanup',
    'bookmark-cleanup',
    'Etc/UTC',
    'USER_SELECTED',
    '1m',
    '{}',
    DEFAULT_TRADING_CALENDAR_JSON,
    'READY',
    1,
    1,
    0,
    1,
    bars.length,
    1024,
    bars[0]?.ts,
    bars[bars.length - 1]?.ts,
    null,
    createdAt,
    createdAt,
  );
  await replaceMarketBarsForInstrument(instrumentId, symbol, bars);
  db.prepare(
    `INSERT INTO local_data_import_jobs (
      id,source_id,source_name,time_zone,base_timeframe,job_mode,status,stage,progress_percent,
      compact_progress_percent,compact_before_bytes,compact_after_bytes,compact_reclaimed_bytes,
      total_files,done_files,total_rows,imported_rows,skipped_rows,error_files,current_file_name,
      error_message,outcome_summary_json,created_at,started_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'job-cleanup',
    sourceId,
    'Cleanup Market Source',
    'Etc/UTC',
    '1m',
    'FULL_IMPORT',
    'SUCCESS',
    'DONE',
    100,
    100,
    0,
    0,
    0,
    1,
    1,
    bars.length,
    bars.length,
    0,
    0,
    null,
    null,
    null,
    createdAt,
    createdAt,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO local_data_source_files (
      id,source_id,job_id,instrument_id,symbol,file_name,file_path,file_size,file_mtime_ms,file_fingerprint,status,
      rows_total,rows_imported,rows_skipped,error_message,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'cleanup-file-1',
    sourceId,
    'job-cleanup',
    instrumentId,
    symbol,
    'cleanup.csv',
    '/private/path/cleanup/cleanup.csv',
    100,
    4000,
    'sha256:cleanup-fingerprint',
    'IMPORTED',
    1,
    1,
    0,
    null,
    createdAt,
    createdAt,
  );
  db.prepare(
    `INSERT INTO training_projects (
      id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,training_date_range,initial_total,total_pnl,profit_rate,duration_days,total_trades,final_equity,equity_return_rate,simulation_batch_id,source_tag,summary_json,operator_summary_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    projectId,
    'Cleanup Training',
    createdAt,
    createdAt,
    symbol,
    sourceId,
    'Cleanup Market Pool',
    '1m',
    '2025-04-02 ~ 2025-04-02',
    1000,
    0,
    0,
    1,
    0,
    1000,
    0,
    null,
    'LOCAL_IMPORT',
    '{}',
    'null',
  );
  assert.ok(
    saveTrainingProjectReplayRef(
      projectId,
      {
        bars,
        snapshot: {
          session: {
            id: projectId,
            instrument_id: instrumentId,
            symbol,
            entry_index: 0,
            cursor_index: 0,
            history_bars: bars.length,
          },
          fills: [],
          sessionTradingSettings: {
            assetClass: 'CRYPTO',
            marketPresetId: 'CRYPTO',
          },
        },
        drawings: [],
        chartIndicators: null,
        baseTimeframe: '1m',
      },
      createdAt,
    ),
  );

  await executePortableExport({
    outputPath: exportPath,
    domains: ['MARKET_DATA', 'TRAINING_HISTORY'],
    marketSourceIds: [sourceId],
    appBuildVersion: 'test-build',
    legalConfirmedForMarketData: true,
  });

  await rewritePortablePayloadForTest(exportPath, (payloadDb) => {
    const row = payloadDb
      .prepare(
        `SELECT payload_json AS payloadJson
           FROM portable_export_training_projects
          WHERE id = ?
          LIMIT 1`,
      )
      .get(projectId) as { payloadJson: string } | undefined;
    assert.ok(row);
    const bundle = JSON.parse(row.payloadJson) as {
      project?: Record<string, unknown>;
    };
    bundle.project = {
      ...(bundle.project ?? {}),
      name: 'x'.repeat(1000),
    };
    payloadDb
      .prepare(
        `UPDATE portable_export_training_projects
            SET payload_json = ?
          WHERE id = ?`,
      )
      .run(JSON.stringify(bundle), projectId);
  });

  db.prepare('DELETE FROM training_project_portable_previews WHERE project_id = ?').run(
    projectId,
  );
  db.prepare('DELETE FROM training_project_replay_refs WHERE project_id = ?').run(
    projectId,
  );
  db.prepare('DELETE FROM training_projects WHERE id = ?').run(projectId);
  db.prepare('DELETE FROM local_data_source_files WHERE source_id = ? OR instrument_id = ?').run(
    sourceId,
    instrumentId,
  );
  db.prepare('DELETE FROM local_data_import_jobs WHERE source_id = ?').run(sourceId);
  db.prepare('DELETE FROM local_data_sources WHERE id = ?').run(sourceId);
  db.prepare('DELETE FROM instruments WHERE id = ? OR symbol = ?').run(
    instrumentId,
    symbol,
  );
  await removeMarketInstrumentData(instrumentId);

  await assert.rejects(
    executePortableImport({
      inputPath: exportPath,
      domains: ['MARKET_DATA', 'TRAINING_HISTORY'],
      legalConfirmedForMarketData: true,
    }),
    (error: unknown): boolean => {
      assert.match(String(error), /CHECK constraint failed|constraint/i);
      return true;
    },
  );

  const sourceCount = db
    .prepare('SELECT COUNT(*) AS count FROM local_data_sources WHERE name = ?')
    .get('Cleanup Market Source') as { count: number };
  const jobCount = db
    .prepare('SELECT COUNT(*) AS count FROM local_data_import_jobs WHERE source_name = ?')
    .get('Cleanup Market Source') as { count: number };
  const fileCount = db
    .prepare('SELECT COUNT(*) AS count FROM local_data_source_files WHERE symbol = ?')
    .get(symbol) as { count: number };
  const instrumentRows = db
    .prepare('SELECT id FROM instruments WHERE symbol = ? AND market = ?')
    .all(symbol, 'LOCAL') as Array<{ id: string }>;
  const manifestCount = db
    .prepare(
      'SELECT COUNT(*) AS count FROM portable_source_manifests WHERE source_name = ?',
    )
    .get('Cleanup Market Source') as { count: number };

  assert.equal(sourceCount.count, 0);
  assert.equal(jobCount.count, 0);
  assert.equal(fileCount.count, 0);
  assert.equal(instrumentRows.length, 0);
  assert.equal(manifestCount.count, 0);
  assert.equal(await getMarketBarCount(instrumentId), 0);
});

test('portable startup recovery retries an interrupted market import and is idempotent', async () => {
  const { exportPath, bars } = await createPortableMarketRecoveryFixture(
    'retry',
  );
  await assert.rejects(
    executePortableImport(
      {
        inputPath: exportPath,
        domains: ['MARKET_DATA'],
        legalConfirmedForMarketData: true,
      },
      interruptedPortableImportRuntime('AFTER_MARKET_WRITES'),
    ),
    (error: unknown): boolean => {
      assert.match(
        String(error),
        /PORTABLE_IMPORT_ABRUPT_TERMINATION:AFTER_MARKET_WRITES/u,
      );
      return true;
    },
  );

  const interruptedJournal = db
    .prepare(
      `SELECT id, state,
              created_source_ids_json AS createdSourceIdsJson,
              created_instrument_ids_json AS createdInstrumentIdsJson,
              recovery_attempts AS recoveryAttempts
         FROM portable_import_recovery_journal
        LIMIT 1`,
    )
    .get() as {
    id: string;
    state: string;
    createdSourceIdsJson: string;
    createdInstrumentIdsJson: string;
    recoveryAttempts: number;
  };
  assert.equal(interruptedJournal.state, 'PENDING');
  const [createdSourceId] = JSON.parse(
    interruptedJournal.createdSourceIdsJson,
  ) as string[];
  const [createdInstrumentId] = JSON.parse(
    interruptedJournal.createdInstrumentIdsJson,
  ) as string[];
  assert.ok(createdSourceId);
  assert.ok(createdInstrumentId);
  assert.equal(
    Number(
      db
        .prepare('SELECT COUNT(*) FROM local_data_sources WHERE id = ?')
        .pluck()
        .get(createdSourceId),
    ),
    1,
  );
  assert.equal(
    db
      .prepare(
        'SELECT deletion_state FROM local_data_sources WHERE id = ?',
      )
      .pluck()
      .get(createdSourceId),
    'MUTATING_SYMBOLS',
  );
  assert.equal(
    Number(
      db
        .prepare('SELECT COUNT(*) FROM instruments WHERE id = ?')
        .pluck()
        .get(createdInstrumentId),
    ),
    1,
  );
  assert.equal(await getMarketBarCount(createdInstrumentId), bars.length);

  const failedRecovery = await recoverPortableImportsAtStartup({
    cleanupMarketInstrument: async () => {
      throw new Error('simulated-market-cleanup-failure');
    },
  });
  assert.deepEqual(failedRecovery, {
    scanned: 1,
    recovered: 0,
    committedJournalsCleared: 0,
    failed: 1,
  });
  const retainedJournal = db
    .prepare(
      `SELECT recovery_attempts AS recoveryAttempts,
              last_recovery_error AS lastRecoveryError
         FROM portable_import_recovery_journal
        WHERE id = ?`,
    )
    .get(interruptedJournal.id) as {
    recoveryAttempts: number;
    lastRecoveryError: string | null;
  };
  assert.equal(retainedJournal.recoveryAttempts, 1);
  assert.match(
    retainedJournal.lastRecoveryError ?? '',
    /simulated-market-cleanup-failure/u,
  );
  assert.equal(
    db
      .prepare(
        'SELECT deletion_state FROM local_data_sources WHERE id = ?',
      )
      .pluck()
      .get(createdSourceId),
    'MUTATING_SYMBOLS',
  );
  assert.equal(await getMarketBarCount(createdInstrumentId), bars.length);

  const recovered = await recoverPortableImportsAtStartup();
  assert.deepEqual(recovered, {
    scanned: 1,
    recovered: 1,
    committedJournalsCleared: 0,
    failed: 0,
  });
  assert.equal(
    Number(
      db
        .prepare('SELECT COUNT(*) FROM portable_import_recovery_journal')
        .pluck()
        .get(),
    ),
    0,
  );
  assert.equal(
    Number(
      db
        .prepare('SELECT COUNT(*) FROM local_data_sources WHERE id = ?')
        .pluck()
        .get(createdSourceId),
    ),
    0,
  );
  assert.equal(
    Number(
      db
        .prepare('SELECT COUNT(*) FROM instruments WHERE id = ?')
        .pluck()
        .get(createdInstrumentId),
    ),
    0,
  );
  assert.equal(await getMarketBarCount(createdInstrumentId), 0);
  assert.deepEqual(await recoverPortableImportsAtStartup(), {
    scanned: 0,
    recovered: 0,
    committedJournalsCleared: 0,
    failed: 0,
  });
});

test('portable startup recovery only clears a committed journal after an abrupt termination', async () => {
  const { exportPath, bars } = await createPortableMarketRecoveryFixture(
    'committed',
  );
  await assert.rejects(
    executePortableImport(
      {
        inputPath: exportPath,
        domains: ['MARKET_DATA'],
        legalConfirmedForMarketData: true,
      },
      interruptedPortableImportRuntime('AFTER_COMMITTED'),
    ),
    (error: unknown): boolean => {
      assert.match(
        String(error),
        /PORTABLE_IMPORT_ABRUPT_TERMINATION:AFTER_COMMITTED/u,
      );
      return true;
    },
  );

  const committedJournal = db
    .prepare(
      `SELECT state,
              created_source_ids_json AS createdSourceIdsJson,
              created_instrument_ids_json AS createdInstrumentIdsJson
         FROM portable_import_recovery_journal
        LIMIT 1`,
    )
    .get() as {
    state: string;
    createdSourceIdsJson: string;
    createdInstrumentIdsJson: string;
  };
  assert.equal(committedJournal.state, 'COMMITTED');
  const [createdSourceId] = JSON.parse(
    committedJournal.createdSourceIdsJson,
  ) as string[];
  const [createdInstrumentId] = JSON.parse(
    committedJournal.createdInstrumentIdsJson,
  ) as string[];
  assert.ok(createdSourceId);
  assert.ok(createdInstrumentId);
  assert.equal(await getMarketBarCount(createdInstrumentId), bars.length);
  assert.equal(
    db
      .prepare(
        'SELECT deletion_state FROM local_data_sources WHERE id = ?',
      )
      .pluck()
      .get(createdSourceId),
    'IDLE',
  );

  assert.deepEqual(await recoverPortableImportsAtStartup(), {
    scanned: 1,
    recovered: 0,
    committedJournalsCleared: 1,
    failed: 0,
  });
  assert.equal(
    Number(
      db
        .prepare('SELECT COUNT(*) FROM local_data_sources WHERE id = ?')
        .pluck()
        .get(createdSourceId),
    ),
    1,
  );
  assert.equal(
    Number(
      db
        .prepare('SELECT COUNT(*) FROM instruments WHERE id = ?')
        .pluck()
        .get(createdInstrumentId),
    ),
    1,
  );
  assert.equal(await getMarketBarCount(createdInstrumentId), bars.length);
  assert.deepEqual(await recoverPortableImportsAtStartup(), {
    scanned: 0,
    recovered: 0,
    committedJournalsCleared: 0,
    failed: 0,
  });

  await removeMarketInstrumentData(createdInstrumentId);
  db.prepare(
    'DELETE FROM portable_source_manifests WHERE source_id = ?',
  ).run(createdSourceId);
  db.prepare('DELETE FROM local_data_source_files WHERE source_id = ?').run(
    createdSourceId,
  );
  db.prepare('DELETE FROM local_data_import_jobs WHERE source_id = ?').run(
    createdSourceId,
  );
  db.prepare('DELETE FROM instruments WHERE id = ?').run(createdInstrumentId);
  db.prepare('DELETE FROM local_data_sources WHERE id = ?').run(
    createdSourceId,
  );
});
