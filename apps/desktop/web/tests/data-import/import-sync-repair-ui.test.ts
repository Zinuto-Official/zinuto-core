// SPDX-License-Identifier: GPL-3.0-only

import type { PendingCsvFolderImport } from "../../src/domains/data-import/dataSourceTypes";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePendingImportScopeStrategy,
  resolveAvailableImportScopeStrategies,
  shouldShowFirstImportScopeSelector,
} from '../../src/app-shell/importScopeStrategy';
import { DEFAULT_TRADING_CALENDAR_CONFIG } from '@zinuto/shared/tradingCalendar';
import { shouldDisableCsvImportConfirmation } from '../../src/app-shell/csvMappingModalViewModel';
import { resolveActiveImportCardSourceFolderBySourceId } from '../../src/app-shell/importCardSourceFolder';
import type { ApiTradingCalendarConfig } from '../../src/api';
import {
  addTradingCalendarSession,
  buildTradingSessionRangeFromInput,
  formatTradingCalendarSummary,
  formatTradingSessionEndMinute,
  formatTradingSessionRange,
  isDailyTradingCalendarTimeframe,
  normalizeTradingCalendarForSubmit,
  removeTradingCalendarSession,
  updateTradingCalendarSession,
} from '../../src/domains/data-import/tradingCalendarUi';
import {
  buildActiveLocalDataImportSourceIds,
  isLocalDataImportSourceBusy,
  resolveDataConfigOperationLockState,
} from '../../src/domains/data-import/importActivity';
import { buildIncrementalUpdateNotice } from '../../src/domains/data-import/incrementalUpdateNotice';

const csvMappingModalSource = [
  'AppCsvMappingModal.tsx',
  'AppCsvMappingModalHelpers.tsx',
]
  .map((fileName) =>
    readFileSync(new URL(`../../src/app-shell/${fileName}`, import.meta.url), 'utf8'),
  )
  .join('\n');
const csvImportPreviewActionsSource = readFileSync(
  new URL('../../src/app-shell/appCsvImportPreviewActions.ts', import.meta.url),
  'utf8',
);
const csvImportConfirmActionsSource = readFileSync(
  new URL('../../src/app-shell/appCsvImportConfirmActions.ts', import.meta.url),
  'utf8',
);
const workspaceNavigationAccessSource = readFileSync(
  new URL('../../src/app-shell/useWorkspaceNavigationAccess.ts', import.meta.url),
  'utf8',
);

test('folder preview failures are presented through the global error dialog', () => {
  assert.match(csvImportPreviewActionsSource, /reportAppError\(err,\s*\{/);
  assert.match(csvImportPreviewActionsSource, /title:\s*tt\('appText\.import'\)/);
});

test('folder preview entry preserves legal whitespace in the selected native path', () => {
  assert.match(
    csvImportPreviewActionsSource,
    /normalizeNativeImportDirectoryPath\(selectedFolderPath\)/,
  );
  assert.doesNotMatch(
    csvImportPreviewActionsSource,
    /String\(selectedFolderPath \|\| ''\)\.trim\(\)/,
  );
});

test('csv import confirmation consumes each preview token once', () => {
  assert.match(csvImportConfirmActionsSource, /confirmedPreviewTokenRef/);
  assert.match(
    csvImportConfirmActionsSource,
    /confirmedPreviewTokenRef\.current === nextImportPreviewToken/,
  );
  assert.match(
    csvImportConfirmActionsSource,
    /confirmedPreviewTokenRef\.current = nextImportPreviewToken/,
  );
});

const makePendingImport = (input: {
  importEntryMode: 'GENERAL' | 'FULL_REIMPORT';
  planSummaries: Array<{
    id: string;
    strategy: 'FLAT' | 'WITH_PARENT';
    baseTimeframe: '1m' | '5m' | '1h' | '1d';
    topLevelSubfolder: string;
    symbolCount: number;
    fileCount: number;
  }>;
}): PendingCsvFolderImport => ({
    importEntryMode: input.importEntryMode,
    previewToken: 'preview-token',
    planSummaries: input.planSummaries,
    confirmableImportPlans: input.planSummaries.map((plan) => ({
      ...plan,
      previewPlanId: plan.id,
      defaultPoolName: `sample-${plan.id}`,
    })),
    sampledFileNames: [],
    skippedNestedCount: 0,
    folderName: 'sample',
    folderPath: '/tmp/sample',
    marketDataAcquisitionMetadata: null,
    sourceFolderPath: '/tmp/sample',
    suggestedTimeZone: 'UTC',
    suggestedTimeZoneReason: 'SYSTEM_FALLBACK',
    headers: ['timestamp', 'open', 'high', 'low', 'close', 'volume'],
    mapping: {
      timestampMode: 'SINGLE',
      date: 'timestamp',
      time: '',
      open: 'open',
      high: 'high',
      low: 'low',
      close: 'close',
      volume: 'volume',
    },
    timeZoneSuggestion: {
      timeZone: 'UTC',
      reason: 'SYSTEM_FALLBACK',
      confidence: 'LOW',
      reasons: [{ code: 'SYSTEM_FALLBACK', timeZone: 'UTC', score: 30 }],
      samples: [],
    },
    tradingCalendarSuggestion: {
      calendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      confidence: 'LOW',
      origin: 'PRESET_DEFAULT',
      sampleCount: 0,
      activeDayCount: 5,
    },
    tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
    draftValidation: {
      mapping: {
        valid: true,
        reasonCode: 'READY',
        issueCount: 0,
        issues: [],
      },
      tradingCalendar: {
        valid: true,
        reasonCode: 'READY',
        issueCount: 0,
        issues: [],
      },
      targeting: {
        valid: true,
        reasonCode: 'READY',
        issueCount: 0,
        issues: [],
      },
      repair: {
        valid: true,
        reasonCode: 'READY',
        warningCount: 0,
      },
      timeZone: {
        valid: true,
        reasonCode: 'READY',
        confirmationRequired: false,
      },
      confirm: {
        enabled: true,
        reasonCode: 'READY',
      },
      blockingIssue: {
        kind: 'none',
        reasonCode: 'READY',
      },
      planning: {
        targetSourceOptions: [],
        recommendedTimeZone: 'UTC',
        recommendedTimeZoneReason: 'PRESET_DEFAULT',
        recommendedTradingCalendar: { tradingDays: [1], sessions: [{ startMinute: 0, endMinute: 1440, crossesMidnight: false }] },
        scopeStrategy: 'FLAT',
        availableScopeStrategies: ['FLAT'],
        planRows: [],
      },
      validatedAt: '2026-05-29T00:00:00.000Z',
    },
    mappingProfile: {
      canonicalSchemaKey: 'ts:SINGLE|price:RAW|volume:OPTIONAL',
      priceFamily: 'RAW',
      confidence: 'HIGH',
      score: 100,
      conflicts: [],
    },
    fieldDiagnostics: [
      'date',
      'open',
      'high',
      'low',
      'close',
      'volume',
    ].map((field) => ({
      field: field as PendingCsvFolderImport['fieldDiagnostics'][number]['field'],
      status: 'MATCHED' as const,
      selectedHeader: field === 'date' ? 'timestamp' : field,
      confidence: 'HIGH' as const,
      reason: field === 'volume' ? 'VOLUME' : 'RAW_OHLC',
      candidates: [],
    })),
    repairSummary: {
      applied: [],
      warnings: [],
      sample: {
        checkedRows: 0,
        parseableTimestampRows: 0,
        validOhlcRows: 0,
        duplicateTimestampRows: 0,
        conflictingDuplicateTimestampRows: 0,
      },
    },
    schemaDiagnostics: {
      canonicalSchemaKey: 'ts:SINGLE|price:RAW|volume:OPTIONAL',
      validSchemaCount: 1,
      inconsistentFiles: [],
    },
    detectedTimeframe: '1d',
    detectedTimeframes: ['1d'],
    validSymbolCount: 1,
    totalFiles: 1,
    validFiles: 1,
    invalidFiles: 0,
    invalidFileSamples: [],
  });

test('scope selector rules support mixed FLAT/WITH_PARENT preview plans', () => {
  const generalImport = makePendingImport({
    importEntryMode: 'GENERAL',
    planSummaries: [
      {
        id: 'flat-1',
        strategy: 'FLAT',
        baseTimeframe: '1d',
        topLevelSubfolder: '',
        symbolCount: 4,
        fileCount: 4,
      },
      {
        id: 'parent-1',
        strategy: 'WITH_PARENT',
        baseTimeframe: '1d',
        topLevelSubfolder: 'group-a',
        symbolCount: 2,
        fileCount: 2,
      },
    ],
  });
  assert.deepEqual(resolveAvailableImportScopeStrategies(generalImport), [
    'FLAT',
    'WITH_PARENT',
  ]);
  assert.equal(shouldShowFirstImportScopeSelector(generalImport), true);
  assert.equal(
    normalizePendingImportScopeStrategy(generalImport, 'FLAT'),
    'FLAT',
  );

  const fullReimport = makePendingImport({
    importEntryMode: 'FULL_REIMPORT',
    planSummaries: generalImport.planSummaries,
  });
  assert.equal(shouldShowFirstImportScopeSelector(fullReimport), false);
});

test('trading calendar editor displays close minutes by source timeframe', () => {
  const morningSession = {
    startMinute: 9 * 60 + 30,
    endMinute: 11 * 60 + 30,
    crossesMidnight: false,
  };
  const afternoonSession = {
    startMinute: 13 * 60,
    endMinute: 15 * 60,
    crossesMidnight: false,
  };

  assert.equal(formatTradingSessionRange(morningSession, '1m'), '09:30-11:30');
  assert.equal(formatTradingSessionRange(morningSession, '5m'), '09:30-11:30');
  assert.equal(formatTradingSessionRange(morningSession, '1h'), '09:30-11:30');
  assert.equal(formatTradingSessionEndMinute(afternoonSession, '1m'), '15:00');
  assert.equal(formatTradingSessionEndMinute(afternoonSession, '5m'), '15:00');
  assert.equal(formatTradingSessionEndMinute(afternoonSession, '1h'), '15:00');
  assert.deepEqual(buildTradingSessionRangeFromInput('13:00', '15:00', '1m'), {
    startMinute: 13 * 60,
    endMinute: 15 * 60,
    crossesMidnight: false,
  });
  assert.deepEqual(buildTradingSessionRangeFromInput('13:00', '15:00', '5m'), {
    startMinute: 13 * 60,
    endMinute: 15 * 60,
    crossesMidnight: false,
  });
  assert.deepEqual(buildTradingSessionRangeFromInput('00:00', '24:00', '5m'), {
    startMinute: 0,
    endMinute: 24 * 60,
    crossesMidnight: false,
  });
  assert.deepEqual(buildTradingSessionRangeFromInput('09:30', '11:30', '1h'), {
    startMinute: 9 * 60 + 30,
    endMinute: 11 * 60 + 30,
    crossesMidnight: false,
  });
  assert.equal(buildTradingSessionRangeFromInput('12:10', '15:00', '1h'), null);

  const validHourlyCalendar: ApiTradingCalendarConfig = {
    tradingDays: [1, 2, 3, 4, 5],
    sessions: [
      {
        startMinute: 9 * 60 + 30,
        endMinute: 11 * 60 + 30,
        crossesMidnight: false,
      },
    ],
  };
  assert.equal(isDailyTradingCalendarTimeframe('1d'), true);
  assert.deepEqual(
    normalizeTradingCalendarForSubmit(validHourlyCalendar, '1d').sessions,
    [{ startMinute: 0, endMinute: 24 * 60, crossesMidnight: false }],
  );
  assert.equal(
    formatTradingCalendarSummary(
      validHourlyCalendar,
      {
        1: 'Mon',
        2: 'Tue',
        3: 'Wed',
        4: 'Thu',
        5: 'Fri',
        6: 'Sat',
        7: 'Sun',
      },
      'en',
      '1d',
    ),
    'Mon Tue Wed Thu Fri',
  );
});

test('trading calendar editor keeps add and delete as draft edits', () => {
  const calendar: ApiTradingCalendarConfig = {
    tradingDays: [1, 2, 3, 4, 5],
    sessions: [
      {
        startMinute: 9 * 60 + 30,
        endMinute: 15 * 60 + 1,
        crossesMidnight: false,
      },
    ],
  };

  const added = addTradingCalendarSession(calendar);
  assert.equal(added.sessions.length, 2);
  assert.deepEqual(added.sessions[1], {
    startMinute: 15 * 60 + 1,
    endMinute: 16 * 60 + 1,
    crossesMidnight: false,
  });

  const overlappingDraft = updateTradingCalendarSession(added, 1, {
    startMinute: 9 * 60 + 30,
    endMinute: 15 * 60 + 1,
    crossesMidnight: false,
  });
  assert.equal(overlappingDraft.sessions.length, 2);
  assert.equal(normalizeTradingCalendarForSubmit(overlappingDraft).sessions.length, 1);

  const removed = removeTradingCalendarSession(added, 0);
  assert.deepEqual(removed.sessions, [added.sessions[1]]);
});

test('trading calendar session delete uses the single-row delete label', () => {
  assert.match(csvMappingModalSource, /tt\("appText\.delete2"\)/);
  assert.doesNotMatch(csvMappingModalSource, /<span>\{tt\("appText\.delete"\)\}<\/span>/);
});

test('daily trading calendar import hides session editing and uses backend draft validation', () => {
  assert.match(csvMappingModalSource, /isDailyTradingCalendarTimeframe\(baseTimeframe\)/);
  assert.match(
    csvMappingModalSource,
    /!isDailyTimeframe \? \(\s*<div className="csv-preview-trading-calendar-sessions">/,
  );
  assert.match(
    csvMappingModalSource,
    /!isDailyTimeframe \? \(\s*<Button[\s\S]*appText\.addTradingSession/,
  );
  assert.match(csvMappingModalSource, /const hasInvalidTradingCalendar = draftValidation/);
  assert.match(csvMappingModalSource, /draftValidation\?\.confirm\.enabled !== true/);
  assert.doesNotMatch(csvMappingModalSource, /pendingPlanConfigRows\.some\(\s*\(\s*row\s*\)\s*=>\s*!isTradingCalendarValidForSubmit/);
  assert.doesNotMatch(csvMappingModalSource, /isTradingCalendarValidForSubmit/);
  assert.doesNotMatch(csvMappingModalSource, /!isTradingCalendarEditorValid/);
});

test('only active import cards can override displayed source folder', () => {
  const sourceId = 'source-1';
  const folder = resolveActiveImportCardSourceFolderBySourceId(sourceId, [
    {
      id: 'done-card',
      sourceId,
      sourceFolder: '/new-folder',
      phase: 'DONE',
    } as never,
  ]);
  assert.equal(folder, '');

  const activeFolder = resolveActiveImportCardSourceFolderBySourceId(sourceId, [
    {
      id: 'older-active',
      sourceId,
      sourceFolder: '/bound-folder',
      phase: 'IMPORTING',
    } as never,
    {
      id: 'newer-failed',
      sourceId,
      sourceFolder: '/one-off-folder',
      phase: 'FAILED',
    } as never,
  ]);
  assert.equal(activeFolder, '/bound-folder');
});

test('data config import activity locks only the active source', () => {
  const activeSourceIds = buildActiveLocalDataImportSourceIds([
    {
      sourceId: 'source-a',
      phase: 'IMPORTING',
    },
    {
      sourceId: 'source-c',
      phase: 'FAILED',
    },
    {
      sourceId: 'source-d',
      phase: 'DONE',
    },
  ]);

  assert.equal(isLocalDataImportSourceBusy('source-a', activeSourceIds), true);
  assert.equal(isLocalDataImportSourceBusy('source-b', activeSourceIds), false);
  assert.equal(isLocalDataImportSourceBusy('source-c', activeSourceIds), false);
  assert.equal(
    isLocalDataImportSourceBusy('source-b', activeSourceIds, {
      status: 'IMPORTING',
    }),
    true,
  );
});

test('data config locks allow new import entry while keeping destructive actions blocked', () => {
  const lockState = resolveDataConfigOperationLockState({
    isPreparingCsvImportPreview: false,
    isClearingLocalDataSources: false,
    deletingSamplePoolId: '',
    isRemovingSymbols: false,
    isCsvImporting: true,
  });

  assert.equal(lockState.importEntryBlocked, false);
  assert.equal(lockState.globalBlocking, false);
  assert.equal(lockState.destructiveBlocking, true);
});

test('data import action gates allow another import while a job is active', () => {
  assert.doesNotMatch(
    csvImportPreviewActionsSource,
    /isPreparingCsvImportPreview\s*\|\|\s*isCsvImporting/,
  );
  assert.doesNotMatch(
    csvImportPreviewActionsSource,
    /isCsvImporting\s*\|\|\s*isClearingLocalDataSources/,
  );
  assert.doesNotMatch(
    csvImportConfirmActionsSource,
    /isPreparingCsvImportPreview\s*\|\|\s*isCsvImporting/,
  );
  assert.doesNotMatch(
    workspaceNavigationAccessSource,
    /isPreparingCsvImportPreview\s*\|\|\s*isCsvImporting/,
  );
});

test('ignored-only incremental outcome should not use no-new-data copy', () => {
  const tt = (key: string) =>
    (
      {
        'appText.unnamedFolder': 'fallback-source',
        'appText.dataSyncResult': 'sync-result',
        'appText.newDataFoundSourceValue0': 'no-new-data',
      } as Record<string, string>
    )[key] ?? key;
  const ttf = (key: string, values: Array<string | number>) =>
    `${key}:${values.join('|')}`;

  const notice = buildIncrementalUpdateNotice(
    'My Source',
    {
      noChanges: true,
      addedSymbols: [],
      updatedSymbols: [],
      prependedRows: 0,
      appendedRows: 0,
      overlapRowsIgnored: 12,
      internalRangeRowsIgnored: 8,
      conflictRowsIgnored: 3,
      qualityWarnings: {
        filesWithSkippedRows: 0,
        invalidRequiredRowsSkipped: 0,
        invalidOhlcRowsSkipped: 0,
        duplicateConflictRowsSkipped: 0,
        duplicateIdenticalRowsDeduped: 0,
      },
      unchangedFiles: 5,
    },
    tt as never,
    ttf,
  );

  assert.match(notice.message, /appText\.syncCompletedSourceValue0Value1AddedSymbolValue2Value3Value4Value5:/);
  assert.match(notice.message, /appText\.syncIgnoredValue0OverlappingRowValue1RangeRowValue2:/);
  assert.doesNotMatch(notice.message, /no-new-data/);
});

test('partial incremental outcome names skipped failed symbols', () => {
  const tt = (key: string) =>
    (
      {
        'appText.unnamedFolder': 'fallback-source',
        'appText.dataSyncResult': 'sync-result',
        'appText.newDataFoundSourceValue0': 'no-new-data',
      } as Record<string, string>
    )[key] ?? key;
  const ttf = (key: string, values: Array<string | number>) =>
    `${key}:${values.join('|')}`;

  const notice = buildIncrementalUpdateNotice(
    'My Source',
    {
      noChanges: false,
      addedSymbols: ['MSFT'],
      updatedSymbols: [],
      prependedRows: 0,
      appendedRows: 2,
      overlapRowsIgnored: 0,
      internalRangeRowsIgnored: 0,
      conflictRowsIgnored: 0,
      qualityWarnings: {
        filesWithSkippedRows: 1,
        invalidRequiredRowsSkipped: 5,
        invalidOhlcRowsSkipped: 0,
        duplicateConflictRowsSkipped: 0,
        duplicateIdenticalRowsDeduped: 0,
      },
      unchangedFiles: 0,
    },
    tt as never,
    ttf,
    { failedSymbols: ['sz000001', 'SZ000001'] },
  );

  assert.match(notice.message, /appText\.syncCompletedSourceValue0Value1AddedSymbolValue2Value3Value4Value5:/);
  assert.match(notice.message, /appText\.skippedUnloadableSymbolsValue0:SZ000001/);
  assert.match(notice.message, /appText\.importSkippedProblemRowsValue0FilesValue1:5\|1/);
});

test('low-confidence time zone requires manual confirmation before import', () => {
  assert.equal(
    shouldDisableCsvImportConfirmation({
      disabled: false,
      confirmEnabled: false,
    }),
    true,
  );
  assert.equal(
    shouldDisableCsvImportConfirmation({
      disabled: false,
      confirmEnabled: true,
    }),
    false,
  );
});

test('low-confidence time zone lets selecting the current recommendation confirm it', () => {
  assert.match(
    csvMappingModalSource,
    /onSelectedValueConfirm=\{onPendingImportTimeZoneChange\}/,
  );
});
