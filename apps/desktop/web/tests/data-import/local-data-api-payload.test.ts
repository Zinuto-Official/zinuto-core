// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { createLocalDataApi } from "../../src/api/localData";
import type { ApiRequester, ApiRequesterOptions } from "../../src/api/requesterTypes";

const FIELD_MAPPING = {
  timestampMode: "SINGLE",
  date: "date",
  time: "",
  open: "open",
  high: "high",
  low: "low",
  close: "close",
  volume: "volume",
} as const;

const createPreviewJobResponse = (
  resultOverrides: Record<string, unknown> = {},
) => ({
  id: "preview-job-1",
  status: "SUCCESS",
  stage: "DONE",
  progressPercent: 100,
  processedFiles: 1,
  totalFiles: 1,
  result: {
    previewToken: "preview_1",
    folderName: "sample",
    folderPath: "/data/sample",
    marketDataAcquisitionMetadata: null,
    suggestedTimeZone: "America/New_York",
    suggestedTimeZoneReason: "PRESET_DEFAULT",
    headers: ["date", "open", "high", "low", "close"],
    draftValidation: {
      mapping: {
        valid: true,
        reasonCode: "READY",
        issueCount: 0,
        issues: [],
      },
      tradingCalendar: {
        valid: true,
        reasonCode: "READY",
        issueCount: 0,
        issues: [],
      },
      targeting: {
        valid: true,
        reasonCode: "READY",
        issueCount: 0,
        issues: [],
      },
      repair: {
        valid: true,
        reasonCode: "READY",
        warningCount: 0,
      },
      timeZone: {
        valid: true,
        reasonCode: "READY",
        confirmationRequired: false,
      },
      confirm: {
        enabled: true,
        reasonCode: "READY",
      },
      blockingIssue: {
        kind: "none",
        reasonCode: "READY",
      },
      planning: {
        targetSourceOptions: [],
        recommendedTimeZone: "America/New_York",
        recommendedTimeZoneReason: "PRESET_DEFAULT",
        recommendedTradingCalendar: { tradingDays: [1], sessions: [{ startMinute: 0, endMinute: 1440, crossesMidnight: false }] },
        scopeStrategy: "FLAT",
        availableScopeStrategies: ["FLAT"],
        planRows: [],
      },
      validatedAt: "2026-04-10T00:00:00.000Z",
    },
    defaultMapping: {
      timestampMode: "SINGLE",
      date: "date",
      time: "",
      open: "open",
      high: "high",
      low: "low",
      close: "close",
      volume: "",
    },
    mappingProfile: {
      canonicalSchemaKey: "ohlc",
      priceFamily: "GENERIC",
      confidence: "HIGH",
      score: 100,
      conflicts: [],
    },
    fieldDiagnostics: [],
    repairSummary: {
      applied: [],
      warnings: [],
      sample: {
        checkedRows: 1,
        parseableTimestampRows: 1,
        validOhlcRows: 1,
        duplicateTimestampRows: 0,
        conflictingDuplicateTimestampRows: 0,
      },
    },
    schemaDiagnostics: {
      canonicalSchemaKey: "ohlc",
      validSchemaCount: 1,
      inconsistentFiles: [],
    },
    detectedTimeframe: "1d",
    detectedTimeframes: ["1d"],
    validSymbolCount: 1,
    totalFiles: 1,
    validFiles: 1,
    invalidFiles: 0,
    invalidFileSamples: [],
    planSummaries: [
      {
        id: "flat",
        strategy: "FLAT",
        baseTimeframe: "1d",
        topLevelSubfolder: "",
        symbolCount: 1,
        fileCount: 1,
      },
    ],
    confirmableImportPlans: [
      {
        id: "flat",
        previewPlanId: "plan_1",
        strategy: "FLAT",
        baseTimeframe: "1d",
        topLevelSubfolder: "",
        defaultPoolName: "sample-1d",
        symbolCount: 1,
        fileCount: 1,
      },
    ],
    sampledFileNames: ["SPY.csv"],
    skippedNestedCount: 0,
    ...resultOverrides,
  },
  errorMessage: null,
  errorCode: null,
  errorArgs: null,
  createdAt: "2026-04-10T00:00:00.000Z",
  startedAt: "2026-04-10T00:00:00.000Z",
  finishedAt: "2026-04-10T00:00:01.000Z",
});

test("incremental local data API payload carries the confirmed mapping with preview selection", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const request: ApiRequester = async <T>(
    url: string,
    options?: ApiRequesterOptions,
  ): Promise<T> => {
    calls.push({
      url,
      body: JSON.parse(String(options?.body ?? "{}")) as Record<string, unknown>,
    });
    return {
      id: "job-1",
      sourceId: "source-1",
      sourceName: "source",
      timeZone: "America/New_York",
      baseTimeframe: "1d",
      jobMode: "INCREMENTAL_UPDATE",
      status: "QUEUED",
      stage: "QUEUED",
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
      createdAt: "2026-04-10T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      isPaused: false,
      cancelRequested: false,
      outcomeSummary: null,
      failedFiles: [],
    } as T;
  };
  const api = createLocalDataApi(request);

  await api.startLocalDataIncrementalUpdateJobByPaths("source-1", {
    previewToken: "preview_1",
    previewPlanId: "plan_1",
    userOverrides: {
      sourceName: "source",
      sourceFolder: "/data",
      sourceFolderBookmarkId: "bookmark",
      sourceFolderUsageMode: "BOUND_SOURCE",
    },
    importScopeStrategy: "FLAT",
    importScopeTopLevelSubfolder: "",
    baseTimeframe: "1d",
    mapping: FIELD_MAPPING,
    timeZone: "Asia/Tokyo",
    timeZoneOrigin: "USER_SELECTED",
    tradingCalendar: { tradingDays: [1], sessions: [] },
    allowExistingSourceTimeZoneChange: true,
  } as Parameters<typeof api.startLocalDataIncrementalUpdateJobByPaths>[1] & Record<string, unknown>);

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    "/api/v1/data-sources/source-1/incremental-update/from-paths",
  );
  assert.equal("timeZone" in (calls[0]?.body ?? {}), false);
  assert.equal("timeZoneOrigin" in (calls[0]?.body ?? {}), false);
  assert.equal("tradingCalendar" in (calls[0]?.body ?? {}), false);
  assert.equal("allowExistingSourceTimeZoneChange" in (calls[0]?.body ?? {}), false);
  assert.deepEqual(calls[0]?.body.mapping, FIELD_MAPPING);
  assert.equal("baseTimeframe" in (calls[0]?.body ?? {}), false);
  assert.equal("importScopeStrategy" in (calls[0]?.body ?? {}), false);
  assert.equal("importScopeTopLevelSubfolder" in (calls[0]?.body ?? {}), false);
  assert.deepEqual(Object.keys(calls[0]?.body ?? {}).sort(), [
    "mapping",
    "previewPlanId",
    "previewToken",
    "userOverrides",
  ]);
  assert.deepEqual(calls[0]?.body.userOverrides, {
    sourceName: "source",
    sourceFolder: "/data",
    sourceFolderBookmarkId: "bookmark",
    sourceFolderUsageMode: "BOUND_SOURCE",
  });
});

test("new and full-reimport local data API payloads carry the confirmed mapping", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const api = createLocalDataApi(async <T>(
    url: string,
    options?: ApiRequesterOptions,
  ): Promise<T> => {
    calls.push({
      url,
      body: JSON.parse(String(options?.body ?? "{}")) as Record<string, unknown>,
    });
    return {} as T;
  });

  await api.startLocalDataImportJobByPaths({
    previewToken: "preview_1",
    previewPlanId: "plan_1",
    mapping: FIELD_MAPPING,
  });
  await api.startLocalDataFullReimportJobByPaths("source-1", {
    previewToken: "preview_2",
    previewPlanId: "plan_2",
    mapping: FIELD_MAPPING,
  });

  assert.equal(calls[0]?.url, "/api/v1/data-sources/import/from-paths");
  assert.deepEqual(calls[0]?.body.mapping, FIELD_MAPPING);
  assert.equal(
    calls[1]?.url,
    "/api/v1/data-sources/source-1/full-reimport/from-paths",
  );
  assert.deepEqual(calls[1]?.body.mapping, FIELD_MAPPING);
});

test("local data preview payload carries the selected folder display name", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const api = createLocalDataApi(async <T>(
    url: string,
    options?: ApiRequesterOptions,
  ): Promise<T> => {
    calls.push({
      url,
      body: JSON.parse(String(options?.body ?? "{}")) as Record<string, unknown>,
    });
    return createPreviewJobResponse() as T;
  });

  await api.startLocalDataImportPreviewJobByPath('/tmp/staged-internal', {
    sourceFolderName: 'flat_daily_csv',
    locale: 'zh-CN',
  });

  assert.equal(
    calls[0]?.url,
    '/api/v1/data-sources/import/preview/from-path',
  );
  assert.deepEqual(calls[0]?.body, {
    folderPath: '/tmp/staged-internal',
    sourceFolderName: 'flat_daily_csv',
    locale: 'zh-CN',
  });
});

test("local data preview preserves recognized acquisition adjustment metadata", async () => {
  const api = createLocalDataApi(async <T>(): Promise<T> => (
    createPreviewJobResponse({
      marketDataAcquisitionMetadata: {
        schemaVersion: 1,
        connectorId: 'akshare',
        adjustment: 'qfq',
        sourceSymbols: ['000001'],
        importSymbols: ['000001'],
      },
    }) as T
  ));

  const previewJob = await api.getLocalDataImportPreviewJob('preview-job-1');

  assert.deepEqual(previewJob.result?.marketDataAcquisitionMetadata, {
    schemaVersion: 1,
    connectorId: 'akshare',
    adjustment: 'qfq',
    sourceSymbols: ['000001'],
    importSymbols: ['000001'],
  });
});

test("local data preview rejects missing backend mapping instead of applying frontend defaults", async () => {
  const api = createLocalDataApi(async <T>(): Promise<T> => (
    createPreviewJobResponse({ defaultMapping: undefined }) as T
  ));

  await assert.rejects(
    () => api.getLocalDataImportPreviewJob("preview-job-1"),
    /defaultMapping/,
  );
});

test("local data preview rejects invalid backend timeframe instead of applying 1d", async () => {
  const api = createLocalDataApi(async <T>(): Promise<T> => (
    createPreviewJobResponse({ detectedTimeframe: "" }) as T
  ));

  await assert.rejects(
    () => api.getLocalDataImportPreviewJob("preview-job-1"),
    /detectedTimeframe/,
  );
});

test("local data preview rejects invalid backend plan strategy instead of applying flat scope", async () => {
  const api = createLocalDataApi(async <T>(): Promise<T> => (
    createPreviewJobResponse({
      planSummaries: [
        {
          id: "flat",
          strategy: "",
          baseTimeframe: "1d",
          topLevelSubfolder: "",
          symbolCount: 1,
          fileCount: 1,
        },
      ],
    }) as T
  ));

  await assert.rejects(
    () => api.getLocalDataImportPreviewJob("preview-job-1"),
    /planSummaries\.strategy/,
  );
});

test("local data preview rejects missing backend plan presentation", async () => {
  const api = createLocalDataApi(async <T>(): Promise<T> => (
    createPreviewJobResponse({
      confirmableImportPlans: [
        {
          id: "flat",
          previewPlanId: "plan_1",
          strategy: "FLAT",
          baseTimeframe: "1d",
          topLevelSubfolder: "",
          symbolCount: 1,
          fileCount: 1,
        },
      ],
    }) as T
  ));

  await assert.rejects(
    () => api.getLocalDataImportPreviewJob("preview-job-1"),
    /confirmableImportPlans\.defaultPoolName/,
  );
});

test("local data draft validation posts mapping and plan drafts to the backend validator", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const api = createLocalDataApi(async <T>(
    url: string,
    options?: ApiRequesterOptions,
  ): Promise<T> => {
    calls.push({
      url,
      body: JSON.parse(String(options?.body ?? "{}")) as Record<string, unknown>,
    });
    return {
      mapping: {
        valid: true,
        reasonCode: "READY",
        issueCount: 0,
        issues: [],
      },
      tradingCalendar: {
        valid: true,
        reasonCode: "READY",
        issueCount: 0,
        issues: [],
      },
      targeting: {
        valid: true,
        reasonCode: "READY",
        issueCount: 0,
        issues: [],
      },
      repair: {
        valid: true,
        reasonCode: "READY",
        warningCount: 0,
      },
      timeZone: {
        valid: true,
        reasonCode: "READY",
        confirmationRequired: false,
      },
      confirm: {
        enabled: true,
        reasonCode: "READY",
      },
      blockingIssue: {
        kind: "none",
        reasonCode: "READY",
      },
      planning: {
        targetSourceOptions: [],
        recommendedTimeZone: "Asia/Shanghai",
        recommendedTimeZoneReason: "SYSTEM_FALLBACK",
        recommendedTradingCalendar: { tradingDays: [1], sessions: [{ startMinute: 0, endMinute: 1440, crossesMidnight: false }] },
        scopeStrategy: "FLAT",
        availableScopeStrategies: ["FLAT"],
        planRows: [],
      },
      validatedAt: "2026-04-10T00:00:00.000Z",
    } as T;
  });

  const result = await api.validateLocalDataImportDraft({
    previewToken: "preview_1",
    mapping: {
      timestampMode: "SINGLE",
      date: "date",
      time: "",
      open: "open",
      high: "high",
      low: "low",
      close: "close",
      volume: "",
    },
    planDrafts: [
      {
        previewPlanId: "plan_1",
        tradingCalendar: { tradingDays: [1], sessions: [] },
      },
    ],
  });

  assert.equal(result.confirm.enabled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/v1/data-sources/import/preview/validate");
  assert.deepEqual(calls[0]?.body, {
    previewToken: "preview_1",
    mapping: {
      timestampMode: "SINGLE",
      date: "date",
      time: "",
      open: "open",
      high: "high",
      low: "low",
      close: "close",
      volume: "",
    },
    planDrafts: [
      {
        previewPlanId: "plan_1",
        tradingCalendar: { tradingDays: [1], sessions: [] },
      },
    ],
  });
});
