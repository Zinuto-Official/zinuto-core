// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  desktopAkshareAcquisitionInstrumentCatalogSchema,
  desktopAkshareAcquisitionInstrumentSchema,
  desktopBarsRangeSchema,
  desktopInstrumentListSchema,
  desktopLegalDocumentResponseSchema,
  desktopLocalDataImportByPathRequestSchema,
  desktopLocalDataFullReimportByPathRequestSchema,
  desktopLocalDataIncrementalUpdateByPathRequestSchema,
  desktopLocalDataImportFolderPreviewSchema,
  desktopLocalDataImportJobSchema,
  desktopLocalDataImportPreviewByPathRequestSchema,
  desktopLocalDataImportDraftValidationRequestSchema,
  desktopLocalDataImportPreviewJobSchema,
  desktopLocalDataSyncPreviewSchema,
  desktopLocalDataSyncQuickCheckSchema,
  desktopLocalDataSyncQuickCheckByMetadataRequestSchema,
  desktopLocalDataSourceSummarySchema,
  desktopMarketBarFrameSchema,
  desktopSessionCreateRequestSchema,
  desktopSessionActionRequestSchema,
  desktopSessionBootstrapSchema,
  desktopFreeReplayStartReadinessRequestSchema,
  desktopFreeReplayStartReadinessSchema,
  desktopPreparedFreeReplayStartRequestSchema,
  desktopSpecialTrainingStatsSummarySchema,
  desktopSpecialTrainingChallengeActionRequestSchema,
  desktopSpecialTrainingChallengeRuntimeSchema,
  desktopSpecialTrainingChallengeStartRequestSchema,
  desktopSpecialTrainingBankEditorReadModelRequestSchema,
  desktopSpecialTrainingBankEditorReadModelSchema,
  desktopSpecialTrainingBankListSchema,
  desktopSpecialTrainingHistoryQuestionDetailSchema,
  desktopSpecialTrainingOrderQuoteRequestSchema,
  desktopSpecialTrainingQuestionBankDraftPreviewRequestSchema,
  desktopSpecialTrainingQuestionBankPreviewRequestSchema,
  desktopSpecialTrainingQuestionBankSummarySchema,
  desktopFreeReplayStartPointOverviewRangeSchema,
  desktopSystemHealthSchema,
  desktopTrainingStatsSummarySchema,
} from "../dist/contracts-desktop/api.js";
import {
  DESKTOP_OPENAPI_COMPONENT_ZOD_SCHEMAS,
} from "../dist/contracts-desktop/openapi-zod.generated.js";
import {
  DESKTOP_API_LIMITS,
  IMPORT_LIMITS,
  INPUT_LIMITS,
  INPUT_SERIALIZED_LIMITS,
} from "../dist/input-limits.js";
import { DEFAULT_TRADING_CALENDAR_CONFIG } from "../dist/tradingCalendar.js";

const baseSession = {
  id: "session_1",
  user_id: "local",
  instrument_id: "instrument_1",
  samplePoolId: "source_1",
  sourceTimeframe: "1d",
  timeZone: "Asia/Shanghai",
  timeframe: "1d",
  minimumBaseTimeframe: "1d",
  start_index: 0,
  entry_index: 10,
  history_bars: 100,
  cursor_index: 10,
  autoplay_interval_ms: 1000,
  is_paused: 1,
  created_at: "2026-04-25T00:00:00.000Z",
  symbol: "AAPL",
  instrumentName: null,
};

const bar = {
  ts: "2026-04-25T00:00:00.000Z",
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  volume: 1000,
};

const mapping = {
  timestampMode: "SINGLE",
  date: "date",
  time: "",
  open: "open",
  high: "high",
  low: "low",
  close: "close",
  volume: "volume",
};

test("desktop AKShare instrument catalog keeps exchange filters separate from symbols", () => {
  const catalog = desktopAkshareAcquisitionInstrumentCatalogSchema.parse({
    instruments: [
      { symbol: "000001", name: "平安银行", exchangeId: "SZ", kind: "A_SHARE" },
      {
        symbol: "INDEX-000001",
        name: "上证指数",
        exchangeId: "SH",
        kind: "INDEX",
      },
    ],
    cachedAt: "2026-07-20T00:00:00.000Z",
  });
  assert.equal(catalog.instruments.length, 2);
  assert.equal(
    desktopAkshareAcquisitionInstrumentSchema.safeParse({
      symbol: "SH",
      name: "上海",
      exchangeId: "SH",
      kind: "A_SHARE",
    }).success,
    false,
  );
  assert.equal(
    desktopAkshareAcquisitionInstrumentSchema.safeParse({
      symbol: "000001",
      name: "上证指数",
      exchangeId: "SH",
      kind: "INDEX",
    }).success,
    false,
  );
});

test("desktop import request contracts preserve filesystem whitespace and enforce confirmed mappings", () => {
  const sourceFolder = "/tmp/source folder ";
  const relativePath = " group /AAPL .csv ";
  const preview = desktopLocalDataImportPreviewByPathRequestSchema.parse({
    folderPath: sourceFolder,
  });
  assert.equal(preview.folderPath, sourceFolder);

  const quickCheck = desktopLocalDataSyncQuickCheckByMetadataRequestSchema.parse({
    sourceFolder,
    files: [{ relativePath, originalname: "AAPL .csv " }],
  });
  assert.equal(quickCheck.sourceFolder, sourceFolder);
  assert.equal(quickCheck.files[0]?.relativePath, relativePath);
  assert.equal(quickCheck.files[0]?.originalname, "AAPL .csv ");

  assert.equal(
    desktopLocalDataImportByPathRequestSchema.safeParse({
      previewToken: "preview",
      previewPlanId: "plan",
      mapping: {},
    }).success,
    false,
  );
  assert.equal(
    desktopLocalDataImportByPathRequestSchema.safeParse({
      previewToken: "preview",
      previewPlanId: "plan",
      mapping: { ...mapping, timestampMode: "SPLIT", time: "" },
    }).success,
    false,
  );
  assert.equal(
    desktopLocalDataImportDraftValidationRequestSchema.safeParse({
      previewToken: "preview",
      mapping: {},
    }).success,
    true,
  );
  assert.equal(
    desktopLocalDataImportPreviewByPathRequestSchema.safeParse({
      folderPath: "   ",
    }).success,
    false,
  );
});

test("desktop sync metadata OpenAPI and runtime contracts share import boundaries", () => {
  const openApiSchema =
    DESKTOP_OPENAPI_COMPONENT_ZOD_SCHEMAS
      .DesktopLocalDataSyncQuickCheckByMetadataRequest;
  const buildFiles = (count: number) =>
    Array.from({ length: count }, () => ({ relativePath: "AAPL.csv" }));

  for (const schema of [
    desktopLocalDataSyncQuickCheckByMetadataRequestSchema,
    openApiSchema,
  ]) {
    assert.equal(schema.safeParse({ files: buildFiles(5001) }).success, true);
    assert.equal(
      schema.safeParse({ files: buildFiles(IMPORT_LIMITS.maxFiles) }).success,
      true,
    );
    assert.equal(
      schema.safeParse({ files: buildFiles(IMPORT_LIMITS.maxFiles + 1) }).success,
      false,
    );
    assert.equal(
      schema.safeParse({
        files: [{
          relativePath: "AAPL.csv",
          size: IMPORT_LIMITS.maxSingleFileBytes,
        }],
      }).success,
      true,
    );
    assert.equal(
      schema.safeParse({
        files: [{
          relativePath: "AAPL.csv",
          size: IMPORT_LIMITS.maxSingleFileBytes + 1,
        }],
      }).success,
      false,
    );
  }

  const maxLengthRelativePath = [
    "d".repeat(54),
    ...Array.from({ length: 14 }, () => "d".repeat(50)),
    `${"f".repeat(251)}.csv`,
  ].join("/");
  const originalname = maxLengthRelativePath.split("/").at(-1);
  assert.equal(maxLengthRelativePath.length, INPUT_LIMITS.relativePathChars);
  assert.equal(originalname?.length, INPUT_LIMITS.fileNameChars);
  assert.equal(
    openApiSchema.safeParse({
      files: [{ relativePath: maxLengthRelativePath, originalname }],
    }).success,
    true,
  );
});

test("desktop import response contracts preserve operational path whitespace", () => {
  const folderPath = " /tmp/source folder ";
  const relativePath = " group /AAPL .csv ";

  assert.equal(
    desktopLocalDataImportFolderPreviewSchema.shape.folderPath.parse(folderPath),
    folderPath,
  );
  assert.equal(
    desktopLocalDataImportFolderPreviewSchema.shape.invalidFileSamples.element.shape.relativePath.parse(
      relativePath,
    ),
    relativePath,
  );
  assert.equal(
    desktopLocalDataImportFolderPreviewSchema.shape.schemaDiagnostics.shape.inconsistentFiles.element.shape.relativePath.parse(
      relativePath,
    ),
    relativePath,
  );
  for (const planSchema of [
    desktopLocalDataImportFolderPreviewSchema.shape.planSummaries.element,
    desktopLocalDataImportFolderPreviewSchema.shape.confirmableImportPlans.element,
  ]) {
    assert.equal(
      planSchema.shape.topLevelSubfolder.parse(relativePath),
      relativePath,
    );
    assert.equal(planSchema.shape.topLevelSubfolder.parse(""), "");
  }
  const planningSchema =
    desktopLocalDataImportFolderPreviewSchema.shape.draftValidation.shape.planning;
  assert.deepEqual(
    desktopLocalDataImportFolderPreviewSchema.shape.marketDataAcquisitionMetadata.parse({
      schemaVersion: 1,
      connectorId: "akshare",
      adjustment: "qfq",
      sourceSymbols: ["000001"],
      importSymbols: ["000001"],
    }),
    {
      schemaVersion: 1,
      connectorId: "akshare",
      adjustment: "qfq",
      sourceSymbols: ["000001"],
      importSymbols: ["000001"],
    },
  );
  assert.equal(
    desktopLocalDataImportFolderPreviewSchema.shape.marketDataAcquisitionMetadata.safeParse({
      schemaVersion: 1,
      connectorId: "ccxt",
      adjustment: "qfq",
      sourceSymbols: ["BTC/USDT"],
      importSymbols: ["BTC-USDT"],
    }).success,
    false,
  );
  assert.equal(
    planningSchema.shape.targetSourceOptions.element.shape.importScopeTopLevelSubfolder.parse(
      relativePath,
    ),
    relativePath,
  );
  assert.equal(
    planningSchema.shape.planRows.element.shape.topLevelSubfolder.parse(relativePath),
    relativePath,
  );

  const sourcePaths = desktopLocalDataSourceSummarySchema
    .pick({
      sourceFolder: true,
      importScopeTopLevelSubfolder: true,
    })
    .parse({
      sourceFolder: folderPath,
      importScopeTopLevelSubfolder: relativePath,
    });
  assert.equal(sourcePaths.sourceFolder, folderPath);
  assert.equal(sourcePaths.importScopeTopLevelSubfolder, relativePath);

  const syncPreviewPaths = desktopLocalDataSyncPreviewSchema
    .pick({
      sourceFolder: true,
      importScopeTopLevelSubfolder: true,
      scopeCandidates: true,
    })
    .parse({
      sourceFolder: folderPath,
      importScopeTopLevelSubfolder: relativePath,
      scopeCandidates: [
        {
          previewPlanId: "plan_1",
          strategy: "WITH_PARENT",
          topLevelSubfolder: relativePath,
          symbolCount: 1,
          fileCount: 1,
        },
      ],
    });
  assert.equal(syncPreviewPaths.sourceFolder, folderPath);
  assert.equal(syncPreviewPaths.importScopeTopLevelSubfolder, relativePath);
  assert.equal(syncPreviewPaths.scopeCandidates[0]?.topLevelSubfolder, relativePath);

  const quickCheckPaths = desktopLocalDataSyncQuickCheckSchema
    .pick({
      sourceFolder: true,
      changedRelativePaths: true,
      fingerprintRequiredRelativePaths: true,
    })
    .parse({
      sourceFolder: folderPath,
      changedRelativePaths: [relativePath],
      fingerprintRequiredRelativePaths: [relativePath],
    });
  assert.equal(quickCheckPaths.sourceFolder, folderPath);
  assert.deepEqual(quickCheckPaths.changedRelativePaths, [relativePath]);
  assert.deepEqual(quickCheckPaths.fingerprintRequiredRelativePaths, [relativePath]);

  assert.equal(
    desktopLocalDataImportJobSchema.shape.failedFiles.element.shape.diagnostics.element.shape.relativePath.parse(
      relativePath,
    ),
    relativePath,
  );
  assert.equal(
    desktopLocalDataSyncQuickCheckSchema
      .pick({ changedRelativePaths: true })
      .safeParse({ changedRelativePaths: ["   "] }).success,
    false,
  );
});

const buildChartFrame = (overrides = {}) => ({
  schemaVersion: "zinuto-market-frame-v2",
  instrumentId: "instrument_aapl",
  symbol: "AAPL",
  baseTimeframe: "1d",
  timeframe: "1d",
  displayPeriod: "1d",
  timeZone: "Asia/Shanghai",
  totalRaw: 1,
  totalDisplay: 1,
  rawStartIndex: 0,
  rawEndIndex: 0,
  displayStartIndex: 0,
  displayEndIndex: 0,
  limit: 1200,
  hasBackward: false,
  hasForward: false,
  versionToken: "version_1",
  displayIndex: [0],
  timestampMs: [1777075200000],
  open: [10],
  high: [12],
  low: [9],
  close: [11],
  volume: [1000],
  startRawIndex: [0],
  endRawIndex: [0],
  ...overrides,
});

test("desktop high-risk response schemas accept canonical payloads", () => {
  const securityIntegrity = {
    runtimeIntegrityStatus: "MANIFEST_DIGESTED",
    runtimeManifestDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  };
  const startupStatus = {
    mode: "READY",
    channel: "community",
    runtimeBuildId: "build_1",
    checkedAt: "2026-04-25T00:00:00.000Z",
    startupAllowed: true,
    blockReason: null,
    blockMessage: null,
    blockDetails: {},
    versions: {
      schemaVersion: 1,
      generatedAt: "2026-04-25T00:00:00.000Z",
      entries: [
        {
          id: "data.localStore",
          domain: "DATA",
          label: "DATA_LOCAL_STORE",
          displayVersion: "DATA 2026Q2.1",
          technicalVersion: "core=1; market=1",
          visibility: "summary",
          source: "test",
          status: "CURRENT",
          components: [
            {
              id: "data.coreSqlite",
              label: "CORE_DATA",
              technicalVersion: "1",
              source: "test",
              status: "CURRENT",
            },
          ],
        },
      ],
    },
    localDataIssueReason: null,
    requiredHeadroomBytes: 0,
    availableHeadroomBytes: 1024,
    storageLayout: null,
    localDataStatus: "CURRENT",
    securityIntegrity,
  };
  assert.equal(
    desktopSystemHealthSchema.safeParse({
      status: "UP",
      runtimeBuildId: "build_1",
      pid: 123,
      securityIntegrity,
      startupStatus,
    }).success,
    true,
  );
  assert.equal(
    desktopLegalDocumentResponseSchema.safeParse({
      documentKey: "privacy",
      locale: "en",
      documentVersion: "2026-08-12",
      lastUpdated: "2026-08-12",
      effectiveDate: "2026-08-12",
      markdown: "# Privacy",
      sourceUrl: "app://legal/privacy",
      cacheStatus: "local",
      fetchedAt: "2026-08-12T00:00:00.000Z",
      checkedAt: "2026-08-12T00:00:00.000Z",
    }).success,
    true,
  );
  assert.equal(
    desktopLegalDocumentResponseSchema.safeParse({
      documentKey: "refund",
      locale: "en",
      documentVersion: "2026-08-12",
      lastUpdated: "2026-08-12",
      effectiveDate: "2026-08-12",
      markdown: "# Refund",
      sourceUrl: "app://legal/refund",
      cacheStatus: "local",
      fetchedAt: "2026-08-12T00:00:00.000Z",
      checkedAt: "2026-08-12T00:00:00.000Z",
    }).success,
    false,
  );

  assert.equal(
    desktopInstrumentListSchema.safeParse([
      {
        id: "instrument_1",
        symbol: "AAPL",
        baseTimeframe: "1d",
        name: null,
        barCount: 100,
        timeStartTs: "2026-04-25T00:00:00.000Z",
        timeEndTs: "2026-04-26T00:00:00.000Z",
        scopeKind: "LOCAL",
        sourceId: "source_1",
        sourceName: "Local",
        displayLabel: "AAPL · Local",
      },
    ]).success,
    true,
  );

  const barsRange = {
    symbol: "AAPL",
    timeframe: "1d",
    timeZone: "Asia/Shanghai",
    total: 1,
    offset: 0,
    limit: DESKTOP_API_LIMITS.marketFrameBarsMax,
    bars: [bar],
  };
  const chartFrame = buildChartFrame();
  const snapshot = {
    session: baseSession,
    accounts: [
      {
        id: "account_1",
        user_id: "local",
        kind: "SECURITIES",
        balance: 100000,
        currency: "USD",
      },
    ],
    positions: [],
    fills: [],
    drawings: [],
  };
  assert.equal(desktopBarsRangeSchema.safeParse(barsRange).success, true);
  assert.equal(desktopMarketBarFrameSchema.safeParse(chartFrame).success, true);
  assert.equal(
    desktopSessionBootstrapSchema.safeParse({
      session: baseSession,
      chartFrame,
      snapshot,
    }).success,
    true,
  );
  const statsSummary = {
    generatedAt: "2026-04-25T00:00:00.000Z",
    version: 1,
    totals: {
      totalProjects: 1,
      filteredProjects: 1,
    },
    overview: {
      totalSessions: 1,
      totalTrainingDays: 1,
      totalTrades: 2,
      totalPnl: 10,
      totalReturnRate: 0.01,
      maxDrawdownRate: 0.02,
      winRate: 1,
      averageDecisionSeconds: 12,
    },
    comparisons: {
      recent20VsPrevious20: {
        leftLabel: "recent20",
        rightLabel: "previous20",
        left: {
          sessionCount: 1,
          returnRate: 0.01,
          winRate: 1,
          profitLossRatio: 2,
          maxDrawdownRate: 0.02,
          avgHoldBars: 3,
          tradeFrequency: 2,
        },
        right: {
          sessionCount: 0,
          returnRate: 0,
          winRate: 0,
          profitLossRatio: 0,
          maxDrawdownRate: 0,
          avgHoldBars: 0,
          tradeFrequency: 0,
        },
        delta: {
          returnRate: 0.01,
          winRate: 1,
          profitLossRatio: 2,
          maxDrawdownRate: 0.02,
          avgHoldBars: 3,
          tradeFrequency: 2,
        },
      },
    },
    latestSession: null,
  };
  assert.equal(desktopTrainingStatsSummarySchema.safeParse(statsSummary).success, true);
  assert.equal(
    desktopSpecialTrainingStatsSummarySchema.safeParse({
      ...statsSummary,
      modeId: "fast-decision-training",
      dashboardInsights: {},
      defaultModeId: "fast-decision-training",
      modeAvailability: {
        "fast-decision-training": {
          tag: "special:fast-decision-training",
          projectCount: 1,
        },
        "risk-discipline-training": {
          tag: "special:risk-discipline-training",
          projectCount: 0,
        },
      },
      recentSessions: [],
    }).success,
    true,
  );
});

test("desktop local data import preview job schema carries structured failure errors", () => {
  assert.equal(
    desktopLocalDataImportPreviewJobSchema.safeParse({
      id: "preview_job_1",
      status: "FAILED",
      stage: "DONE",
      progressPercent: 100,
      processedFiles: 1,
      totalFiles: 1,
      result: null,
      errorMessage: "CSV_TIMEFRAME_INVALID",
      errorCode: "CSV_TIMEFRAME_INVALID",
      errorArgs: { value: "SZ000001.csv" },
      createdAt: "2026-05-18T00:00:00.000Z",
      startedAt: "2026-05-18T00:00:00.000Z",
      finishedAt: "2026-05-18T00:00:01.000Z",
    }).success,
    true,
  );
});

test("desktop bar response schemas enforce bounded page shapes", () => {
  assert.equal(
    desktopMarketBarFrameSchema.safeParse(buildChartFrame({ high: [] })).success,
    false,
  );
  assert.equal(
    desktopMarketBarFrameSchema.safeParse(
      buildChartFrame({ limit: DESKTOP_API_LIMITS.marketFrameBarsMax + 1 }),
    ).success,
    false,
  );

  const oversizedBars = Array.from(
    { length: DESKTOP_API_LIMITS.startPointOverviewBarsMax + 1 },
    () => bar,
  );
  assert.equal(
    desktopFreeReplayStartPointOverviewRangeSchema.safeParse({
      samplePoolId: "source_1",
      instrumentId: "instrument_1",
      symbol: "AAPL",
      sourceTimeframe: "1d",
      minimumBaseTimeframe: "1d",
      effectiveTimeframe: "1d",
      displayPeriod: "1d",
      timeZone: "Asia/Shanghai",
      trainingTotal: oversizedBars.length,
      total: oversizedBars.length,
      offset: 0,
      limit: DESKTOP_API_LIMITS.startPointOverviewBarsMax,
      bars: oversizedBars.map((item, index) => ({
        ...item,
        startRawIndex: index,
        endRawIndex: index,
        startTrainingIndex: index,
        endTrainingIndex: index,
      })),
    }).success,
    false,
  );

  assert.equal(
    desktopSpecialTrainingHistoryQuestionDetailSchema.safeParse({
      id: "question_1",
      symbol: "AAPL",
      bars: Array.from(
        { length: DESKTOP_API_LIMITS.specialTrainingQuestionBarsMax + 1 },
        () => bar,
      ),
      settlementStatus: "SETTLED",
      score: 80,
      passed: true,
      tradeActions: [],
      createdAt: "2026-04-25T00:00:00.000Z",
      settledAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
    }).success,
    false,
  );
});

test("desktop request schemas reject invalid high-risk mutations", () => {
  assert.equal(
    desktopSessionActionRequestSchema.safeParse({
      action: "BUY",
      inputMode: "LOT",
      lotInput: 1,
      priceMode: "CUR_CLOSE",
      displayPeriod: "1d",
    }).success,
    true,
  );
  assert.equal(
    desktopSessionActionRequestSchema.safeParse({
      action: "BUY",
      qty: 1,
      priceMode: "CUR_CLOSE",
    }).success,
    false,
  );
  assert.equal(
    desktopSessionActionRequestSchema.safeParse({
      action: "UNDO",
      displayPeriod: "1d",
      chartWindowDisplayStartIndex: 0,
      chartWindowDisplayEndIndex: 100,
    }).success,
    false,
  );
  assert.equal(
    desktopSessionActionRequestSchema.safeParse({
      action: "UNDO",
      displayPeriod: "1d",
    }).success,
    true,
  );
  assert.equal(
    desktopSpecialTrainingChallengeStartRequestSchema.safeParse({
      bankId: "bank_1",
      modeId: "risk-discipline-training",
      questionCount: 7,
      horizonBars: 60,
    }).success,
    false,
  );
  assert.equal(
    desktopSpecialTrainingChallengeStartRequestSchema.safeParse({
      bankId: "bank_1",
      modeId: "risk-discipline-training",
      questionCount: 5,
      riskExecutionProfile: {
        totalFeeRate: 0.01,
      },
    }).success,
    false,
  );
  assert.equal(
    desktopSpecialTrainingChallengeActionRequestSchema.safeParse({
      action: "BUY_AND_ADVANCE",
      inputMode: "RATIO",
      ratioInput: "25",
      priceMode: "NEXT_OPEN",
      nextOpenDelayBars: 6,
    }).success,
    false,
  );
  assert.equal(
    desktopSpecialTrainingOrderQuoteRequestSchema.safeParse({
      side: "BUY",
      inputMode: "RATIO",
      ratioInput: "25",
      priceMode: "CUR_CLOSE",
    }).success,
    true,
  );
  assert.equal(
    desktopSessionCreateRequestSchema.safeParse({
      symbol: "AAPL",
      sessionTradingSettings: {
        note: "x".repeat(INPUT_SERIALIZED_LIMITS.trainingSessionTradingSettingsBytes),
      },
    }).success,
    false,
  );
  assert.equal(
    desktopLocalDataImportByPathRequestSchema.safeParse({
      previewToken: "preview_1",
      previewPlanId: "plan_1",
      mapping,
      userOverrides: {
        sourceName: "source",
        sourceFolder: "/tmp/source",
        timeZone: "Etc/UTC",
        tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      },
    }).success,
    true,
  );
  assert.equal(
    desktopLocalDataFullReimportByPathRequestSchema.safeParse({
      previewToken: "preview_1",
      previewPlanId: "plan_1",
      mapping,
      userOverrides: {
        timeZone: "Etc/UTC",
        tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
        allowExistingSourceTimeZoneChange: true,
      },
    }).success,
    true,
  );
  assert.equal(
    desktopLocalDataImportByPathRequestSchema.safeParse({
      previewToken: "preview_1",
      previewPlanId: "plan_1",
      userOverrides: {
        timeZone: "Not/A_Zone",
        tradingCalendar: DEFAULT_TRADING_CALENDAR_CONFIG,
      },
    }).success,
    false,
  );
  assert.equal(
    desktopLocalDataIncrementalUpdateByPathRequestSchema.safeParse({
      previewToken: "preview_1",
      previewPlanId: "plan_1",
      mapping,
      userOverrides: {
        sourceFolderUsageMode: "BOUND_SOURCE",
      },
    }).success,
    true,
  );
  assert.equal(
    desktopLocalDataImportPreviewByPathRequestSchema.safeParse({
      folderPath: "/tmp/source",
      sourceFolderName: "source folder",
      sourceId: "source_1",
      locale: "zh-CN",
    }).success,
    true,
  );
  assert.equal(
    desktopLocalDataImportPreviewByPathRequestSchema.parse({
      folderPath: "/tmp/source",
      sourceFolderName: "source folder",
    }).sourceFolderName,
    "source folder",
  );
  for (const forbiddenField of [
    "baseTimeframe",
    "importScopeStrategy",
    "importScopeTopLevelSubfolder",
    "timeZone",
    "timeZoneOrigin",
    "tradingCalendar",
    "allowExistingSourceTimeZoneChange",
  ]) {
    assert.equal(
      desktopLocalDataIncrementalUpdateByPathRequestSchema.safeParse({
        previewToken: "preview_1",
        previewPlanId: "plan_1",
        userOverrides: {
          sourceFolderUsageMode: "BOUND_SOURCE",
        },
        [forbiddenField]: forbiddenField === "tradingCalendar" ? DEFAULT_TRADING_CALENDAR_CONFIG : "Etc/UTC",
      }).success,
      false,
      `incremental request must reject ${forbiddenField}`,
    );
  }
});

test("desktop request schemas enforce shared input and import limits", () => {
  assert.equal(INPUT_LIMITS.samplePoolNameChars, 20);
  assert.equal(
    desktopSessionActionRequestSchema.safeParse({
      action: "BUY",
      inputMode: "LOT",
      lotInput: "1".repeat(INPUT_LIMITS.orderInputChars),
      priceMode: "CUR_CLOSE",
      displayPeriod: "1d",
    }).success,
    true,
  );
  assert.equal(
    desktopSessionActionRequestSchema.safeParse({
      action: "BUY",
      inputMode: "LOT",
      lotInput: "1".repeat(INPUT_LIMITS.orderInputChars + 1),
      priceMode: "CUR_CLOSE",
      displayPeriod: "1d",
    }).success,
    false,
  );
  assert.equal(
    desktopLocalDataImportByPathRequestSchema.safeParse({
      previewToken: "preview_1",
      previewPlanId: "plan_1",
      userOverrides: {
        sourceName: "A".repeat(INPUT_LIMITS.generalNameChars + 1),
      },
    }).success,
    false,
  );
  assert.equal(
    desktopLocalDataImportPreviewByPathRequestSchema.safeParse({
      folderPath: "/tmp/source",
      locale: "z".repeat(INPUT_LIMITS.localeChars + 1),
    }).success,
    false,
  );
  assert.equal(
    desktopLocalDataImportPreviewByPathRequestSchema.safeParse({
      folderPath: "/tmp/source",
      sourceFolderName: "z".repeat(INPUT_LIMITS.fileNameChars + 1),
    }).success,
    false,
  );
  const importDraftWithPoolName = (poolName: string) =>
    desktopLocalDataImportDraftValidationRequestSchema.safeParse({
      previewToken: "preview_1",
      mapping: {},
      planning: {
        planOverrides: [
          {
            previewPlanId: "plan_1",
            poolName,
          },
        ],
      },
    }).success;
  assert.equal(
    importDraftWithPoolName("n".repeat(INPUT_LIMITS.samplePoolNameChars)),
    true,
  );
  assert.equal(
    importDraftWithPoolName("n".repeat(INPUT_LIMITS.samplePoolNameChars + 1)),
    false,
  );
  assert.equal(
    desktopLocalDataSyncQuickCheckByMetadataRequestSchema.safeParse({
      files: [
        {
          relativePath: `${"a".repeat(INPUT_LIMITS.relativePathChars - 4)}.csv`,
          originalname: "AAPL_1d.csv",
          size: IMPORT_LIMITS.maxSingleFileBytes,
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    desktopLocalDataSyncQuickCheckByMetadataRequestSchema.safeParse({
      files: [
        {
          relativePath: `${"a".repeat(INPUT_LIMITS.relativePathChars - 3)}.csv`,
          originalname: "AAPL_1d.csv",
          size: IMPORT_LIMITS.maxSingleFileBytes + 1,
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    desktopLocalDataSyncQuickCheckByMetadataRequestSchema.safeParse({
      files: Array.from({ length: IMPORT_LIMITS.maxFiles + 1 }, () => ({
        relativePath: "AAPL_1d.csv",
        originalname: "AAPL_1d.csv",
        size: 1,
      })),
    }).success,
    false,
  );
});

test("free replay start echoes pool display names at full source-name width", () => {
  const startRequest = (selectedPoolName: string) =>
    desktopPreparedFreeReplayStartRequestSchema.safeParse({
      mode: "FOCUSED",
      selectedPoolId: "pool_1",
      selectedPoolName,
      tradingEnvironment: {
        marketPresetId: "A_SHARE",
        assetClass: "STOCK",
      },
    }).success;
  assert.equal(startRequest("p".repeat(INPUT_LIMITS.samplePoolNameChars)), true);
  assert.equal(startRequest("Nasdaq Data Link WIKI EOD 100"), true);
  assert.equal(startRequest("p".repeat(INPUT_LIMITS.generalNameChars)), true);
  assert.equal(startRequest("p".repeat(INPUT_LIMITS.generalNameChars + 1)), false);
});

test("desktop data source schema keeps storage and source identity typed", () => {
  const result = desktopLocalDataSourceSummarySchema.safeParse({
    id: "source_1",
    name: "Local",
    sourceFolder: "",
    sourceFolderBookmarkId: "",
    importScopeStrategy: null,
    importScopeTopLevelSubfolder: "",
    assetClass: "STOCK",
    marketPresetId: "US_STOCK",
    timeZone: "America/New_York",
    timeZoneOrigin: "USER_SELECTED",
    baseTimeframe: "1d",
    fieldMapping: mapping,
    symbols: ["AAPL"],
    instruments: [],
    status: "READY",
    symbolCount: 1,
    barCount: -1,
    symbolStats: [],
    timeStartTs: null,
    timeEndTs: null,
    totalFiles: 1,
    importedFiles: 1,
    failedFiles: 0,
    requiresSourceFolderRebind: false,
    sourceLocked: false,
    unlockedSymbols: ["AAPL"],
    lockedSymbols: [],
    lockedSymbolCount: 0,
    lockReason: null,
    storageBytes: 100,
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    lastJob: null,
  });
  assert.equal(result.success, false);
});

test("special training display truth schemas reject frontend-derived fallbacks", () => {
  const questionBank = {
    id: "bank_1",
    name: "Risk bank",
    assetClass: "STOCK",
    targetTimeframe: "1d",
    scope: { poolIds: ["pool_1"] },
    scopeSummary: {
      status: "READY",
      poolCount: 1,
      symbolCount: 2,
      instrumentCount: 2,
      sourceTimeframes: ["1d"],
      definitionHash: "definition_1",
      missingPoolIds: [],
      maxSourceTimeframe: "1d",
      validation: {
        scope: {
          valid: true,
          blockedReasonCode: null,
          blockedReason: null,
        },
        targetTimeframe: {
          valid: true,
          blockedReasonCode: null,
          blockedReason: null,
        },
      },
      readiness: {
        canUse: true,
        blockedReasonCode: null,
        blockedReason: null,
      },
    },
    simulationBatchId: null,
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
  };
  assert.equal(
    desktopSpecialTrainingBankListSchema.safeParse({
      items: [questionBank],
      nextCursor: null,
      total: 1,
    }).success,
    true,
  );
  assert.equal(
    desktopSpecialTrainingBankListSchema.safeParse([questionBank]).success,
    false,
  );

  const questionBankSummary = {
    bankId: "bank_1",
    bankName: "Risk bank",
    modeId: "risk-discipline-training",
    scopeHash: "scope_1",
    status: "READY_IN_PROGRESS",
    targetTimeframe: "1d",
    effectiveTimeframes: ["1d"],
    minimumBaseTimeframe: "1d",
    sourceTimeframes: ["1d"],
    poolCount: 1,
    instrumentCount: 2,
    totalQuestionCount: 5,
    completedQuestionCount: 2,
    remainingQuestionCount: 3,
    symbolCount: 2,
    availableQuestionCount: 3,
    builtQuestionCount: 2,
    capacity: {
      requestedQuestionCount: 5,
      hasCapacityForRun: true,
      willRestartQuestionScope: true,
      totalQuestionCount: 5,
      availableQuestionCount: 3,
    },
    actionAvailability: {
      start: {
        enabled: true,
        reasonCode: null,
        hasCapacityForRun: true,
        willRestartQuestionScope: true,
      },
      reset: {
        enabled: true,
        reasonCode: null,
        hasProgress: true,
      },
    },
    runtimeState: {
      status: "READY_IN_PROGRESS",
      noticeKind: null,
      noticeReasonCode: null,
      shouldAppendOldProgressNotice: false,
      sessionUsesOldSnapshot: false,
    },
    updatedAt: "2026-04-25T00:00:00.000Z",
    expiresAt: null,
  };
  assert.equal(
    desktopSpecialTrainingQuestionBankSummarySchema.safeParse(
      questionBankSummary,
    ).success,
    true,
  );
  assert.equal(
    desktopSpecialTrainingQuestionBankSummarySchema.safeParse({
      ...questionBankSummary,
      totalQuestionCount: 0,
      availableQuestionCount: 42,
    }).success,
    false,
  );
  assert.equal(
    desktopSpecialTrainingQuestionBankSummarySchema.safeParse({
      ...questionBankSummary,
      completedQuestionCount: 6,
    }).success,
    false,
  );

  assert.equal(
    desktopSpecialTrainingChallengeRuntimeSchema.safeParse({
      challengeId: "challenge_1",
      modeId: "risk-discipline-training",
      questionCount: 1,
      settledCount: 0,
      currentQuestionIndex: 0,
      currentQuestionId: "question_1",
      question: {
        id: "question_1",
        instrumentId: "instrument_1",
        samplePoolId: "pool_1",
        barsVersionToken: "bars_1",
        symbol: "AAPL",
        timeframe: "1d",
        targetTimeframe: "1d",
        effectiveTimeframe: "1d",
        minimumBaseTimeframe: "1d",
        sourceTimeframe: "1d",
        sourceBarsPerEffectiveBar: 1,
        startIndex: 0,
        endIndex: 1,
        effectiveWindowBarCount: 1,
        sourceWindowBarCount: 1,
        minTradeStep: 1,
      },
      cursorIndex: 0,
      questionStartIndex: 0,
      questionEndIndex: 1,
      tradeRuntime: {
        usedOperations: 0,
        openCount: 0,
        positionQty: 0,
        entryPrice: 0,
        cashBalance: 100000,
        equityPeakAsset: 100000,
        maxDrawdownRatio: 0,
        initialCapital: 100000,
        challengeStartAsset: 100000,
      },
      riskBaseline: {
        initialCapital: 100000,
        cashBalance: 100000,
        positionQty: 0,
        entryPrice: 0,
      },
      tradeActions: [],
      currentPrice: 10,
      currentTotalAsset: 100000,
      floatingPnl: 0,
      remainingActionableBars: 1,
      buyEstimate: { qty: 100, cashEffect: -1000 },
      sellEstimate: { qty: null, cashEffect: null },
      actionState: {},
      sessionSummary: null,
    }).success,
    false,
  );
});

test("special training question bank request schemas are shared route truth", () => {
  assert.equal(
    desktopSpecialTrainingQuestionBankPreviewRequestSchema.safeParse({
      bankId: "bank_1",
      modeId: "fast-decision-training",
      horizonBars: 20,
    }).success,
    true,
  );
  assert.equal(
    desktopSpecialTrainingQuestionBankPreviewRequestSchema.safeParse({
      bankId: "bank_1",
      modeId: "fast-decision-training",
      horizonBars: -1,
    }).success,
    false,
  );
  assert.equal(
    desktopSpecialTrainingQuestionBankDraftPreviewRequestSchema.safeParse({
      assetClass: "STOCK",
      targetTimeframe: "1d",
      poolIds: ["pool_1"],
    }).success,
    true,
  );
});

test("trainer prep read-model schemas enforce backend readiness consistency", () => {
  const freeReplayStartReadiness = {
    enabled: true,
    reasonCode: null,
    facts: {
      mode: "FOCUSED",
      candidateCount: 1,
      scopedCandidateCount: 1,
      selectedPoolId: "pool_1",
      selectedInstrumentId: "instrument_1",
      selectedSymbol: "AAPL",
      selectedAnchorIndex: 10,
      requiresSymbol: true,
      requiresAnchor: true,
      hasExplicitAnchor: true,
      normalizedSelectedSymbol: "AAPL",
    },
    readiness: {
      canStart: true,
      reason: null,
      requiresSymbol: true,
      requiresAnchor: true,
      hasExplicitAnchor: true,
      normalizedSelectedSymbol: "AAPL",
    },
  };
  assert.equal(
    desktopFreeReplayStartReadinessSchema.safeParse(
      freeReplayStartReadiness,
    ).success,
    true,
  );
  assert.equal(
    desktopFreeReplayStartReadinessSchema.safeParse({
      ...freeReplayStartReadiness,
      enabled: false,
    }).success,
    false,
  );

  const bankScopeSummary = {
    status: "READY",
    poolCount: 1,
    symbolCount: 1,
    instrumentCount: 1,
    sourceTimeframes: ["1d"],
    definitionHash: "definition_1",
    missingPoolIds: [],
    maxSourceTimeframe: "1d",
    validation: {
      scope: {
        valid: true,
        blockedReasonCode: null,
        blockedReason: null,
      },
      targetTimeframe: {
        valid: true,
        blockedReasonCode: null,
        blockedReason: null,
      },
    },
    readiness: {
      canUse: true,
      blockedReasonCode: null,
      blockedReason: null,
    },
  };
  const bankEditorReadiness = {
    enabled: true,
    reasonCode: null,
    facts: {},
  };
  const bankEditorReadModel = {
    enabled: true,
    reasonCode: null,
    facts: {
      step: "PREVIEW",
      selectedPoolCount: 1,
      missingPoolCount: 0,
      enabledInstrumentCount: 1,
      compatibleSelectedPoolIds: ["pool_1"],
      autoRemovedPoolIds: [],
      poolReadinessById: {
        pool_1: {
          disabled: false,
          reasonCode: null,
        },
      },
      validation: {
        name: bankEditorReadiness,
        pools: bankEditorReadiness,
        preview: bankEditorReadiness,
      },
      scopeSummary: bankScopeSummary,
    },
    readiness: {
      config: bankEditorReadiness,
      preview: bankEditorReadiness,
      current: bankEditorReadiness,
    },
  };
  assert.equal(
    desktopSpecialTrainingBankEditorReadModelSchema.safeParse(
      bankEditorReadModel,
    ).success,
    true,
  );
  assert.equal(
    desktopSpecialTrainingBankEditorReadModelSchema.safeParse({
      ...bankEditorReadModel,
      reasonCode: "NAME_REQUIRED",
    }).success,
    false,
  );
});

test("trainer prep read-model request schemas are shared route truth", () => {
  assert.equal(
    desktopFreeReplayStartReadinessRequestSchema.safeParse({
      mode: "RANDOM",
      candidates: [],
    }).success,
    true,
  );
  assert.equal(
    desktopSpecialTrainingBankEditorReadModelRequestSchema.safeParse({
      step: "CONFIG",
      draft: {
        name: "Bank",
        targetTimeframe: "1d",
        poolIds: ["pool_1"],
      },
      availablePoolIds: ["pool_1"],
    }).success,
    true,
  );
  assert.equal(
    desktopSpecialTrainingBankEditorReadModelRequestSchema.safeParse({
      step: "CONFIG",
      draft: {
        name: "Bank",
        targetTimeframe: "1w",
        poolIds: ["pool_1"],
      },
    }).success,
    false,
  );
});
