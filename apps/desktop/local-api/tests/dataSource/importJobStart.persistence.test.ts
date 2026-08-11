// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_TRADING_CALENDAR_CONFIG,
  serializeTradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';
import { startLocalDataImportJobCore } from '../../src/application/dataSource/importJobStart.js';

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
const DEFAULT_TRADING_CALENDAR_JSON = serializeTradingCalendarConfig(
  DEFAULT_TRADING_CALENDAR_CONFIG,
);

const buildJobDetail = (jobId: string, sourceId: string) => ({
  id: jobId,
  sourceId,
  sourceName: 'source',
  timeZone: 'Etc/UTC',
  baseTimeframe: '1d' as const,
  jobMode: 'INCREMENTAL_UPDATE' as const,
  status: 'QUEUED' as const,
  stage: 'QUEUED' as const,
  progressPercent: 0,
  compactProgressPercent: 0,
  compactBeforeBytes: 0,
  compactAfterBytes: 0,
  compactReclaimedBytes: 0,
  totalFiles: 0,
  doneFiles: 0,
  totalRows: 0,
  importedRows: 0,
  skippedRows: 0,
  errorFiles: 0,
  currentFileName: null,
  errorMessage: null,
  createdAt: '2026-04-10T00:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  isPaused: false,
  cancelRequested: false,
  outcomeSummary: null,
  failedFiles: [],
});

const createDeps = () => {
  const updateIncrementalCalls: Array<Record<string, unknown>> = [];
  const insertSourceCalls: Array<Record<string, unknown>> = [];
  const updateSyncCalls: Array<Record<string, unknown>> = [];
  const insertJobCalls: Array<Record<string, unknown>> = [];
  const insertFileCalls: Array<Record<string, unknown>> = [];
  const enqueuedJobs: Array<Record<string, unknown>> = [];
  const mutationAccessCalls: Array<string | undefined> = [];
  const transactionOrder: string[] = [];
  let idCursor = 0;

  const deps = {
    normalizeSourceName: (rawName: string) => String(rawName || '').trim() || 'source',
    nowIso: () => '2026-04-10T00:00:00.000Z',
    createId: () => `id-${++idCursor}`,
    normalizeFileSize: (size: unknown) => Math.max(0, Math.floor(Number(size) || 0)),
    assertManagedImportTempPath: (_filePath: string) => undefined,
    parseSymbolFromFileName: (fileName: string) =>
      String(fileName || '')
        .split('.')
        .shift()
        ?.toUpperCase() || 'UNKNOWN',
    isSystemResetRunning: () => false,
    getSourceImportConfigById: (sourceId: string) =>
      sourceId === 'source-1'
        ? {
            id: 'source-1',
            name: 'source-1',
            sourceFolder: '/bound/source',
            sourceFolderBookmarkId: 'bookmark-old',
            importScopeStrategy: 'WITH_PARENT' as const,
            importScopeTopLevelSubfolder: 'group-us',
            timeZone: 'America/New_York',
            timeZoneOrigin: 'PRESET_DEFAULT' as const,
            tradingCalendarJson: DEFAULT_TRADING_CALENDAR_JSON,
            diagnosticAssetClass: 'STOCK',
            diagnosticMarketPresetId: 'US_STOCK',
            diagnosticProfileOrigin: 'INFERRED',
          }
        : undefined,
    countActiveJobsBySource: (_sourceId: string) => 0,
    listImportedSymbolsBySource: (_sourceId: string) => [{ symbol: 'AAPL' }],
    withTransaction: (runner: () => void) => {
      transactionOrder.push('begin');
      runner();
      transactionOrder.push('end');
    },
    assertMutationAccessForSource: (sourceIdRaw?: string) => {
      transactionOrder.push('assert-mutation-access');
      mutationAccessCalls.push(sourceIdRaw);
    },
    insertSource: (payload: Record<string, unknown>) => {
      transactionOrder.push('insert-source');
      insertSourceCalls.push(payload);
    },
    updateSourceForSyncImport: (payload: Record<string, unknown>) => {
      transactionOrder.push('update-source-sync');
      updateSyncCalls.push(payload);
      return true;
    },
    updateSourceForIncrementalImport: (payload: Record<string, unknown>) => {
      transactionOrder.push('update-source-incremental');
      updateIncrementalCalls.push(payload);
      return true;
    },
    insertJob: (payload: Record<string, unknown>) => {
      insertJobCalls.push(payload);
    },
    insertFile: (payload: Record<string, unknown>) => {
      insertFileCalls.push(payload);
    },
    ensureImportJobControlState: (_jobId: string) => undefined,
    assertImportQueueCapacity: () => undefined,
    enqueueImportJob: (job: Record<string, unknown>) => {
      enqueuedJobs.push(job);
    },
    toJobDetail: (jobId: string) => buildJobDetail(jobId, 'source-1'),
  };

  return {
    deps,
    insertSourceCalls,
    updateSyncCalls,
    updateIncrementalCalls,
    insertJobCalls,
    insertFileCalls,
    enqueuedJobs,
    mutationAccessCalls,
    transactionOrder,
  };
};

test('import job persistence and queue preserve exact source and staged file paths', () => {
  const {
    deps,
    insertSourceCalls,
    insertFileCalls,
    enqueuedJobs,
  } = createDeps();
  const sourceFolder = '/source folder ';
  const fileName = ' group /AAPL .csv ';
  const filePath = `/tmp/staged import /${fileName}`;

  startLocalDataImportJobCore(
    {
      sourceName: 'source',
      sourceFolder,
      sourceFolderUsageMode: 'BOUND_SOURCE',
      importScopeStrategy: 'WITH_PARENT',
      importScopeTopLevelSubfolder: ' group ',
      baseTimeframe: '1d',
      jobMode: 'FULL_IMPORT',
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      mapping: DEFAULT_MAPPING,
      files: [{
        originalname: fileName,
        path: filePath,
        size: 100,
        symbol: 'AAPL',
      }],
    },
    deps,
  );

  assert.equal(insertSourceCalls[0]?.sourceFolder, sourceFolder);
  assert.equal(insertSourceCalls[0]?.importScopeTopLevelSubfolder, ' group ');
  assert.equal(insertFileCalls[0]?.fileName, fileName);
  assert.equal(insertFileCalls[0]?.filePath, filePath);
  assert.equal(
    (enqueuedJobs[0]?.files as Array<Record<string, unknown>> | undefined)?.[0]
      ?.filePath,
    filePath,
  );
});

const assertNoTradingBindingFields = (payload: Record<string, unknown>) => {
  assert.equal('assetClass' in payload, false);
  assert.equal('marketPresetId' in payload, false);
};

test('queue capacity is checked before creating import job rows', () => {
  const fixture = createDeps();
  fixture.deps.assertImportQueueCapacity = () => {
    throw new Error('IMPORT_JOB_QUEUE_FULL');
  };

  assert.throws(
    () =>
      startLocalDataImportJobCore(
        {
          sourceName: 'source',
          sourceFolder: '/source',
          sourceFolderBookmarkId: 'bookmark',
          sourceFolderUsageMode: 'BOUND_SOURCE',
          importScopeStrategy: 'FLAT',
          importScopeTopLevelSubfolder: '',
          baseTimeframe: '1d',
          jobMode: 'FULL_IMPORT',
          tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
          mapping: DEFAULT_MAPPING,
          files: [
            {
              originalname: 'AAPL_1d.csv',
              path: '/tmp/AAPL_1d.csv',
              size: 100,
              symbol: 'AAPL',
            },
          ],
        },
        fixture.deps,
      ),
    /IMPORT_JOB_QUEUE_FULL/u,
  );

  assert.deepEqual(fixture.transactionOrder, []);
  assert.equal(fixture.insertJobCalls.length, 0);
  assert.equal(fixture.enqueuedJobs.length, 0);
});

test('import cannot take over a source while a destructive mutation lease is active', () => {
  const fixture = createDeps();
  fixture.deps.updateSourceForIncrementalImport = () => false;

  assert.throws(
    () =>
      startLocalDataImportJobCore(
        {
          sourceId: 'source-1',
          sourceName: '',
          sourceFolder: '/one-off/source',
          sourceFolderUsageMode: 'ONE_OFF',
          baseTimeframe: '1d',
          jobMode: 'INCREMENTAL_UPDATE',
          mapping: DEFAULT_MAPPING,
          files: [
            {
              originalname: 'AAPL_1d.csv',
              path: '/tmp/AAPL_1d.csv',
              size: 100,
              symbol: 'AAPL',
            },
          ],
        },
        fixture.deps,
      ),
    (error: unknown) =>
      Boolean(error) &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code ===
        'LOCAL_DATA_SOURCE_MUTATION_IN_PROGRESS',
  );

  assert.equal(fixture.insertJobCalls.length, 0);
  assert.equal(fixture.insertFileCalls.length, 0);
  assert.equal(fixture.enqueuedJobs.length, 0);
});

test('ONE_OFF incremental update does not rewrite bound folder/bookmark in source persistence payload', () => {
  const { deps, updateIncrementalCalls, enqueuedJobs } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceId: 'source-1',
      sourceName: '',
      sourceFolder: '/one-off/source',
      sourceFolderBookmarkId: 'bookmark-new',
      sourceFolderUsageMode: 'ONE_OFF',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
      baseTimeframe: '1d',
      jobMode: 'INCREMENTAL_UPDATE',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'AAPL_1d.csv',
          path: '/tmp/AAPL_1d.csv',
          size: 100,
          symbol: 'AAPL',
        },
      ],
    },
    deps
  );

  assert.equal(updateIncrementalCalls.length, 1);
  assert.equal(updateIncrementalCalls[0]?.sourceFolder, undefined);
  assert.equal(updateIncrementalCalls[0]?.sourceFolderBookmarkId, undefined);
  assert.equal(enqueuedJobs[0]?.sourceFolderUsageMode, 'ONE_OFF');
});

test('BOUND_SOURCE incremental update can persist recovered folder/bookmark values', () => {
  const { deps, updateIncrementalCalls, enqueuedJobs } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceId: 'source-1',
      sourceName: '',
      sourceFolder: '/rebound/source',
      sourceFolderBookmarkId: 'bookmark-rebound',
      sourceFolderUsageMode: 'BOUND_SOURCE',
      baseTimeframe: '1d',
      jobMode: 'INCREMENTAL_UPDATE',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'AAPL_1d.csv',
          path: '/tmp/AAPL_1d.csv',
          size: 100,
          symbol: 'AAPL',
        },
      ],
    },
    deps
  );

  assert.equal(updateIncrementalCalls.length, 1);
  assert.equal(updateIncrementalCalls[0]?.sourceFolder, '/rebound/source');
  assert.equal(updateIncrementalCalls[0]?.sourceFolderBookmarkId, 'bookmark-rebound');
  assert.equal(enqueuedJobs[0]?.sourceFolderUsageMode, 'BOUND_SOURCE');
});

test('ONE_OFF incremental update does not persist scope or timezone fields on the source record', () => {
  const { deps, updateIncrementalCalls } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceId: 'source-1',
      sourceName: '',
      sourceFolder: '/one-off/source',
      sourceFolderBookmarkId: 'bookmark-new',
      sourceFolderUsageMode: 'ONE_OFF',
      importScopeStrategy: 'WITH_PARENT',
      importScopeTopLevelSubfolder: 'group-us',
      baseTimeframe: '1d',
      jobMode: 'INCREMENTAL_UPDATE',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'AAPL_1d.csv',
          path: '/tmp/AAPL_1d.csv',
          size: 100,
          symbol: 'AAPL',
        },
      ],
    },
    deps
  );

  assert.equal(updateIncrementalCalls.length, 1);
  const updatePayload = updateIncrementalCalls[0] ?? {};
  assert.equal('importScopeStrategy' in updatePayload, false);
  assert.equal('importScopeTopLevelSubfolder' in updatePayload, false);
  assert.equal('timeZone' in updatePayload, false);
});

test('incremental update always uses saved source timezone and calendar metadata', () => {
  const { deps, updateIncrementalCalls, insertJobCalls, enqueuedJobs } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceId: 'source-1',
      sourceName: '',
      sourceFolder: '/one-off/source',
      sourceFolderBookmarkId: 'bookmark-new',
      sourceFolderUsageMode: 'ONE_OFF',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
      timeZone: 'Asia/Tokyo',
      timeZoneOrigin: 'USER_SELECTED',
      allowExistingSourceTimeZoneChange: true,
      tradingCalendar: {
        tradingDays: [0],
        sessions: [{ startMinute: 60, endMinute: 120, crossesMidnight: false }],
      },
      baseTimeframe: '1d',
      jobMode: 'INCREMENTAL_UPDATE',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'AAPL_1d.csv',
          path: '/tmp/AAPL_1d.csv',
          size: 100,
          symbol: 'AAPL',
        },
      ],
    },
    deps
  );

  assert.equal(updateIncrementalCalls.length, 1);
  const updatePayload = updateIncrementalCalls[0] ?? {};
  assert.equal('timeZone' in updatePayload, false);
  assert.equal('timeZoneOrigin' in updatePayload, false);
  assert.equal('tradingCalendarJson' in updatePayload, false);
  assert.equal(insertJobCalls[0]?.timeZone, 'America/New_York');
  assert.equal(enqueuedJobs[0]?.timezone, 'America/New_York');
});

test('new import source persistence does not write a trading environment binding', () => {
  const { deps, insertSourceCalls } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceName: 'new source',
      sourceFolder: '/new/source',
      sourceFolderBookmarkId: 'bookmark-new',
      sourceFolderUsageMode: 'BOUND_SOURCE',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
      timeZone: 'Etc/UTC',
      timeZoneOrigin: 'USER_SELECTED',
      baseTimeframe: '1d',
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      jobMode: 'FULL_IMPORT',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'AAPL_1d.csv',
          path: '/tmp/AAPL_1d.csv',
          size: 100,
          symbol: 'AAPL',
        },
      ],
    },
    deps
  );

  assert.equal(insertSourceCalls.length, 1);
  assertNoTradingBindingFields(insertSourceCalls[0] ?? {});
});

test('existing source import rejects when that source already has an active job', () => {
  const { deps } = createDeps();
  deps.countActiveJobsBySource = (sourceId: string) =>
    sourceId === 'source-1' ? 1 : 0;

  assert.throws(
    () =>
      startLocalDataImportJobCore(
        {
          sourceId: 'source-1',
          sourceName: 'source-1',
          sourceFolder: '/bound/source',
          sourceFolderBookmarkId: 'bookmark-old',
          sourceFolderUsageMode: 'BOUND_SOURCE',
          importScopeStrategy: 'WITH_PARENT',
          importScopeTopLevelSubfolder: 'group-us',
          timeZone: 'America/New_York',
          timeZoneOrigin: 'USER_SELECTED',
          allowExistingSourceTimeZoneChange: true,
          baseTimeframe: '1d',
          tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
          jobMode: 'FULL_IMPORT',
          mapping: DEFAULT_MAPPING,
          files: [
            {
              originalname: 'AAPL_1d.csv',
              path: '/tmp/AAPL_1d.csv',
              size: 100,
              symbol: 'AAPL',
            },
          ],
        },
        deps
      ),
    (error) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'LOCAL_DATA_IMPORT_JOB_ACTIVE',
  );
});

test('new source import can start while another source has an active job', () => {
  const { deps, insertSourceCalls, enqueuedJobs } = createDeps();
  deps.countActiveJobsBySource = (sourceId: string) =>
    sourceId === 'source-1' ? 1 : 0;

  startLocalDataImportJobCore(
    {
      sourceName: 'new source',
      sourceFolder: '/new/source',
      sourceFolderBookmarkId: 'bookmark-new',
      sourceFolderUsageMode: 'BOUND_SOURCE',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
      timeZone: 'Etc/UTC',
      timeZoneOrigin: 'USER_SELECTED',
      baseTimeframe: '1d',
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      jobMode: 'FULL_IMPORT',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'MSFT_1d.csv',
          path: '/tmp/MSFT_1d.csv',
          size: 100,
          symbol: 'MSFT',
        },
      ],
    },
    deps
  );

  assert.equal(insertSourceCalls.length, 1);
  assert.equal(enqueuedJobs.length, 1);
  assert.notEqual(enqueuedJobs[0]?.sourceId, 'source-1');
});

test('mutation access is asserted inside the source/job transaction before persistence changes', () => {
  const { deps, insertSourceCalls, mutationAccessCalls, transactionOrder } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceName: 'new source',
      sourceFolder: '/new/source',
      sourceFolderBookmarkId: 'bookmark-new',
      sourceFolderUsageMode: 'BOUND_SOURCE',
      importScopeStrategy: 'FLAT',
      importScopeTopLevelSubfolder: '',
      timeZone: 'Etc/UTC',
      timeZoneOrigin: 'USER_SELECTED',
      baseTimeframe: '1d',
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      jobMode: 'FULL_IMPORT',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'MSFT_1d.csv',
          path: '/tmp/MSFT_1d.csv',
          size: 100,
          symbol: 'MSFT',
        },
      ],
    },
    deps
  );

  assert.deepEqual(mutationAccessCalls, [undefined]);
  assert.deepEqual(transactionOrder.slice(0, 3), [
    'begin',
    'assert-mutation-access',
    'insert-source',
  ]);
  assert.equal(transactionOrder.at(-1), 'end');
  assert.equal(insertSourceCalls.length, 1);
});

test('mutation access rejection stops source persistence', () => {
  const { deps, insertSourceCalls, insertJobCalls, transactionOrder } = createDeps();
  deps.assertMutationAccessForSource = () => {
    transactionOrder.push('assert-mutation-access');
    throw Object.assign(new Error('mutation blocked'), {
      code: 'DATA_SOURCE_MUTATION_BLOCKED',
    });
  };

  assert.throws(
    () =>
      startLocalDataImportJobCore(
        {
          sourceName: 'new source',
          sourceFolder: '/new/source',
          sourceFolderBookmarkId: 'bookmark-new',
          sourceFolderUsageMode: 'BOUND_SOURCE',
          importScopeStrategy: 'FLAT',
          importScopeTopLevelSubfolder: '',
          timeZone: 'Etc/UTC',
          timeZoneOrigin: 'USER_SELECTED',
          baseTimeframe: '1d',
          tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
          jobMode: 'FULL_IMPORT',
          mapping: DEFAULT_MAPPING,
          files: [
            {
              originalname: 'MSFT_1d.csv',
              path: '/tmp/MSFT_1d.csv',
              size: 100,
              symbol: 'MSFT',
            },
          ],
        },
        deps
      ),
    (error) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'DATA_SOURCE_MUTATION_BLOCKED',
  );

  assert.deepEqual(transactionOrder, ['begin', 'assert-mutation-access']);
  assert.equal(insertSourceCalls.length, 0);
  assert.equal(insertJobCalls.length, 0);
});

test('full reimport source persistence does not write a trading environment binding', () => {
  const { deps, updateSyncCalls } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceId: 'source-1',
      sourceName: 'source-1',
      sourceFolder: '/bound/source',
      sourceFolderBookmarkId: 'bookmark-old',
      sourceFolderUsageMode: 'BOUND_SOURCE',
      importScopeStrategy: 'WITH_PARENT',
      importScopeTopLevelSubfolder: 'group-us',
      timeZone: 'America/New_York',
      timeZoneOrigin: 'USER_SELECTED',
      allowExistingSourceTimeZoneChange: true,
      baseTimeframe: '1d',
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      jobMode: 'FULL_IMPORT',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'AAPL_1d.csv',
          path: '/tmp/AAPL_1d.csv',
          size: 100,
          symbol: 'AAPL',
        },
      ],
    },
    deps
  );

  assert.equal(updateSyncCalls.length, 1);
  assertNoTradingBindingFields(updateSyncCalls[0] ?? {});
});

test('full reimport rejects saved source timezone changes unless explicitly allowed', () => {
  const { deps, updateSyncCalls } = createDeps();

  assert.throws(
    () =>
      startLocalDataImportJobCore(
        {
          sourceId: 'source-1',
          sourceName: 'source-1',
          sourceFolder: '/bound/source',
          sourceFolderBookmarkId: 'bookmark-old',
          sourceFolderUsageMode: 'BOUND_SOURCE',
          importScopeStrategy: 'WITH_PARENT',
          importScopeTopLevelSubfolder: 'group-us',
          timeZone: 'Asia/Tokyo',
          timeZoneOrigin: 'USER_SELECTED',
          baseTimeframe: '1d',
          tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
          jobMode: 'FULL_IMPORT',
          mapping: DEFAULT_MAPPING,
          files: [
            {
              originalname: 'AAPL_1d.csv',
              path: '/tmp/AAPL_1d.csv',
              size: 100,
              symbol: 'AAPL',
            },
          ],
        },
        deps
      ),
    (error) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'LOCAL_DATA_SOURCE_TIMEZONE_REIMPORT_REQUIRED',
  );
  assert.equal(updateSyncCalls.length, 0);
});

test('full reimport can explicitly replace saved source timezone metadata', () => {
  const { deps, updateSyncCalls, insertJobCalls, enqueuedJobs } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceId: 'source-1',
      sourceName: 'source-1',
      sourceFolder: '/bound/source',
      sourceFolderBookmarkId: 'bookmark-old',
      sourceFolderUsageMode: 'BOUND_SOURCE',
      importScopeStrategy: 'WITH_PARENT',
      importScopeTopLevelSubfolder: 'group-us',
      timeZone: 'Asia/Tokyo',
      timeZoneOrigin: 'USER_SELECTED',
      allowExistingSourceTimeZoneChange: true,
      baseTimeframe: '1d',
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      jobMode: 'FULL_IMPORT',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'AAPL_1d.csv',
          path: '/tmp/AAPL_1d.csv',
          size: 100,
          symbol: 'AAPL',
        },
      ],
    },
    deps
  );

  assert.equal(updateSyncCalls.length, 1);
  assert.equal(updateSyncCalls[0]?.timeZone, 'Asia/Tokyo');
  assert.equal(updateSyncCalls[0]?.timeZoneOrigin, 'USER_SELECTED');
  assert.equal(insertJobCalls[0]?.timeZone, 'Asia/Tokyo');
  assert.equal(enqueuedJobs[0]?.timezone, 'Asia/Tokyo');
});

test('incremental source persistence does not write a trading environment binding', () => {
  const { deps, updateIncrementalCalls } = createDeps();

  startLocalDataImportJobCore(
    {
      sourceId: 'source-1',
      sourceName: '',
      sourceFolder: '/bound/source',
      sourceFolderBookmarkId: 'bookmark-old',
      sourceFolderUsageMode: 'BOUND_SOURCE',
      baseTimeframe: '1d',
      jobMode: 'INCREMENTAL_UPDATE',
      mapping: DEFAULT_MAPPING,
      files: [
        {
          originalname: 'AAPL_1d.csv',
          path: '/tmp/AAPL_1d.csv',
          size: 100,
          symbol: 'AAPL',
        },
      ],
    },
    deps
  );

  assert.equal(updateIncrementalCalls.length, 1);
  assertNoTradingBindingFields(updateIncrementalCalls[0] ?? {});
});

test('full reimport removes existing symbols outside the member import snapshot', () => {
  const { deps, enqueuedJobs } = createDeps();
  const allSymbols = Array.from({ length: 12 }, (_, index) =>
    `SYM${String(index + 1).padStart(2, '0')}`
  );
  const memberSymbols = allSymbols.slice(0, 10);
  deps.listImportedSymbolsBySource = (_sourceId: string) =>
    allSymbols.map((symbol) => ({ symbol }));

  startLocalDataImportJobCore(
    {
      sourceId: 'source-1',
      sourceName: 'source-1',
      sourceFolder: '/bound/source',
      sourceFolderBookmarkId: 'bookmark-old',
      sourceFolderUsageMode: 'BOUND_SOURCE',
      importScopeStrategy: 'WITH_PARENT',
      importScopeTopLevelSubfolder: 'group-us',
      timeZone: 'America/New_York',
      timeZoneOrigin: 'USER_SELECTED',
      allowExistingSourceTimeZoneChange: true,
      baseTimeframe: '1d',
      tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      jobMode: 'FULL_IMPORT',
      mapping: DEFAULT_MAPPING,
      files: memberSymbols.map((symbol) => ({
        originalname: `${symbol}.csv`,
        path: `/tmp/${symbol}.csv`,
        size: 100,
        symbol,
      })),
      snapshotSymbols: memberSymbols,
      sourceTotalFiles: memberSymbols.length,
    },
    deps
  );

  assert.equal(enqueuedJobs.length, 1);
  assert.deepEqual(enqueuedJobs[0]?.changedSymbols, memberSymbols);
  assert.deepEqual(enqueuedJobs[0]?.obsoleteSymbols, ['SYM11', 'SYM12']);
  assert.equal(enqueuedJobs[0]?.sourceTotalFiles, 10);
});
