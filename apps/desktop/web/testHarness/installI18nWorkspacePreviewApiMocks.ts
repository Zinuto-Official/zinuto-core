// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiDesktopWorkspaceReadModel,
  ApiSystemDevSimulationCapabilities,
  ApiSystemStartupStatus,
  ApiSystemStorageUsage,
  ApiTrainingProject,
  ApiTrainingReviewBundlePayload,
  PortableExportPreview,
  PortableImportPreview,
  PortableImportResult,
} from "../src/api";
import { api } from "../src/api";
import { language, requestedTheme } from "./i18nWorkspacePreviewSupport";
import "../src/styles/index.css";
import "../src/styles/workspaces/strategy-backtest.css";
import "../src/workspaces/data/dataConfig/market-data-acquisition.css";

export const installI18nWorkspacePreviewApiMocks = ({
  requestedPage,
  isSettingsPreviewPage,
  previewReviewBundle,
  previewReviewProjectById,
}: {
  requestedPage: string;
  isSettingsPreviewPage: boolean;
  previewReviewBundle: ApiTrainingReviewBundlePayload;
  previewReviewProjectById: ReadonlyMap<string, ApiTrainingProject>;
}): void => {
  if (requestedPage === "HISTORY") {
    api.getTrainingReviewConsoleBundle = async () => previewReviewBundle;
    api.getTrainingProject = async (projectId) => {
      const project = previewReviewProjectById.get(projectId);
      if (!project) {
        throw new Error(`Missing preview history project: ${projectId}`);
      }
      return project;
    };
  }

  if (requestedPage === "CUSTOM_INDICATOR") {
    api.listInstruments = async () => [];
    api.listLocalDataSources = async () => [];
    api.getBarsRange = async () => ({
      symbol: "AAPL",
      timeframe: "1d",
      total: 0,
      offset: 0,
      limit: 0,
      bars: [],
    });
    api.getInstrumentBarsRange = async () => ({
      symbol: "AAPL",
      timeframe: "1d",
      total: 0,
      offset: 0,
      limit: 0,
      bars: [],
    });
  }

  if (isSettingsPreviewPage) {
    const previousFetch = globalThis.fetch.bind(globalThis);
    const previewStorageUsage: ApiSystemStorageUsage = {
      measuredAt: "2026-04-20T08:00:00.000Z",
      source: "PHYSICAL_FALLBACK",
      categories: {
        trainingDataBytes: 1_920_000_000,
        replayNotesBytes: 148_000_000,
        marketDataBytes: 3_540_000_000,
        systemSettingsBytes: 42_000_000,
        statsDataBytes: 196_000_000,
        otherBytes: 108_000_000,
      },
      logicalTotalBytes: 5_954_000_000,
      physicalFootprint: {
        dbBytes: 5_220_000_000,
        walBytes: 182_000_000,
        shmBytes: 8_000_000,
        totalBytes: 5_410_000_000,
      },
      physicalTotalBytes: 5_954_000_000,
      storageLayout: {
        coreBytes: 1_074_000_000,
        marketBytes: 4_420_000_000,
        cacheBytes: 286_000_000,
        tempBytes: 174_000_000,
        paths: {
          coreDir: "~/Library/Application Support/org.zinuto.core/core",
          marketDir: "~/Library/Application Support/org.zinuto.core/market",
          cacheDir: "~/Library/Caches/org.zinuto.core",
          tempDir: "~/Library/Caches/org.zinuto.core/tmp",
        },
      },
    };

    const previewStartupStatusReady: ApiSystemStartupStatus = {
      mode: "READY",
      channel: "community",
      runtimeBuildId: "preview-runtime-1.0.8",
      checkedAt: "2026-04-20T08:00:00.000Z",
      startupAllowed: true,
      blockReason: null,
      blockMessage: null,
      blockDetails: {},
      versions: {
        schemaVersion: 1,
        generatedAt: "2026-04-20T08:00:00.000Z",
        entries: [
          {
            id: "app.desktop",
            domain: "APP",
            label: "APP_DESKTOP",
            displayVersion: "APP 2026Q2.1",
            technicalVersion: "1.0.8",
            visibility: "summary",
            source: "preview",
            components: [
              {
                id: "app.desktopVersion",
                label: "DESKTOP_APP",
                displayVersion: "Zinuto 1.0.8",
                technicalVersion: "1.0.8",
                source: "preview",
              },
            ],
          },
          {
            id: "data.localStore",
            domain: "DATA",
            label: "DATA_LOCAL_STORE",
            displayVersion: "DATA 2026Q2.1",
            technicalVersion: "core=core-v12; market=market-v7",
            visibility: "summary",
            source: "preview",
            status: "CURRENT",
            components: [
              {
                id: "data.coreSqlite",
                label: "CORE_DATA",
                technicalVersion: "core-v12",
                source: "preview",
                status: "CURRENT",
              },
              {
                id: "data.marketDuckDb",
                label: "MARKET_DATA",
                technicalVersion: "market-v7",
                source: "preview",
                status: "CURRENT",
              },
            ],
          },
          {
            id: "market.builtinData",
            domain: "MARKET",
            label: "MARKET_BUILTIN_DATA",
            displayVersion: "MARKET 2026Q2.1",
            technicalVersion: "seed-v1",
            visibility: "summary",
            source: "preview",
            components: [
              {
                id: "market.wikiEod100",
                label: "WIKI",
                technicalVersion: "wiki-v1",
                source: "preview",
              },
              {
                id: "market.fx1m2025q1",
                label: "FX",
                technicalVersion: "fx-v1",
                source: "preview",
              },
            ],
          },
          {
            id: "rules.trainingContent",
            domain: "RULES",
            label: "RULES_TRAINING_CONTENT",
            displayVersion: "RULES 2026Q2.1",
            technicalVersion: "trading=rules-v1",
            visibility: "summary",
            source: "preview",
            components: [
              {
                id: "rules.tradingPresets",
                label: "TRADING_RULES",
                technicalVersion: "rules-v1",
                source: "preview",
              },
            ],
          },
          {
            id: "runtime.backend",
            domain: "RUNTIME",
            label: "RUNTIME_BACKEND",
            displayVersion: "RUNTIME 2026Q2.1",
            technicalVersion: "backend-bundle:7db85d5ec90a13aed39aac17:3172",
            visibility: "diagnostic",
            source: "preview",
            components: [
              {
                id: "runtime.backendBundle",
                label: "BACKEND_BUNDLE",
                technicalVersion:
                  "backend-bundle:7db85d5ec90a13aed39aac17:3172",
                source: "preview",
              },
              {
                id: "runtime.node",
                label: "NODE",
                technicalVersion: "v24.18.0",
                source: "preview",
              },
            ],
          },
          {
            id: "api.contracts",
            domain: "API",
            label: "API_CONTRACTS",
            displayVersion: "API v1",
            technicalVersion: "desktop=v1; official=v1; native=v1; schemas=v1",
            visibility: "diagnostic",
            source: "preview",
            components: [
              {
                id: "api.desktopLocal",
                label: "DESKTOP_API",
                technicalVersion: "v1",
                source: "preview",
              },
            ],
          },
        ],
      },
      requiredHeadroomBytes: 0,
      availableHeadroomBytes: 12_400_000_000,
      localDataIssueReason: null,
      storageLayout: {
        appRootDir: "~/Library/Application Support/org.zinuto.core",
        coreDataDir: "~/Library/Application Support/org.zinuto.core/core",
        marketDataDir: "~/Library/Application Support/org.zinuto.core/market",
        cacheDir: "~/Library/Caches/org.zinuto.core",
        tempDir: "~/Library/Caches/org.zinuto.core/tmp",
        dbPath:
          "~/Library/Application Support/org.zinuto.core/core/main.sqlite",
        marketDbPath:
          "~/Library/Application Support/org.zinuto.core/market/market.sqlite",
        duckdbTempDir: "~/Library/Caches/org.zinuto.core/tmp/duckdb",
      },
      localDataStatus: "CURRENT",
      securityIntegrity: {
        runtimeIntegrityStatus: "MANIFEST_DIGESTED",
        runtimeManifestDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    };

    const previewStartupStatusBlocked: ApiSystemStartupStatus = {
      ...previewStartupStatusReady,
      mode: "BLOCKED",
      startupAllowed: false,
      blockReason: "INSUFFICIENT_DISK_SPACE",
      blockMessage: null,
      requiredHeadroomBytes: 8_000_000_000,
      availableHeadroomBytes: 1_300_000_000,
    };

    const previewPortableExport: PortableExportPreview = {
      domains: [
        {
          domain: "SETTINGS",
          itemCount: 22,
          estimatedBytes: 220_000,
          includesEvidenceSnapshots: false,
          needsRebindAfterImport: false,
        },
        {
          domain: "TRAINING_HISTORY",
          itemCount: 86,
          estimatedBytes: 12_400_000,
          includesEvidenceSnapshots: true,
          needsRebindAfterImport: false,
        },
        {
          domain: "MARKET_DATA",
          itemCount: 2,
          estimatedBytes: 1_820_000_000,
          includesEvidenceSnapshots: false,
          needsRebindAfterImport: true,
        },
      ],
      marketSources: [
        {
          sourceId: "portable-preview-us",
          sourceName: "U.S. Swing Archive",
          assetClass: "STOCK",
          marketPresetId: "US_STOCK",
          baseTimeframe: "1d",
          timeZone: "America/New_York",
          symbolCount: 24,
          barCount: 18240,
          estimatedBytes: 820_000_000,
          linkedTrainingProjectCount: 12,
          linkedSpecialTrainingQuestionCount: 6,
        },
        {
          sourceId: "portable-preview-intraday",
          sourceName: "Momentum Intraday Set",
          assetClass: "STOCK",
          marketPresetId: "US_STOCK",
          baseTimeframe: "15m",
          timeZone: "America/New_York",
          symbolCount: 12,
          barCount: 8640,
          estimatedBytes: 1_000_000_000,
          linkedTrainingProjectCount: 8,
          linkedSpecialTrainingQuestionCount: 5,
        },
      ],
      totalItems: 110,
      estimatedBytes: 1_832_620_000,
      snapshotPolicy: "EVIDENCE_ONLY",
      dateRange: { from: null, to: null },
    };

    const previewPortableImport: PortableImportPreview = {
      manifest: {
        schemaVersion: "zinuto-portable-export-v2",
        exportId: "portable-preview-export",
        exportedAt: "2026-04-20T06:00:00.000Z",
        appBuildVersion: "1.0.8",
        selectedDomains: ["SETTINGS", "TRAINING_HISTORY", "MARKET_DATA"],
        selectedMarketSourceIds: [
          "portable-preview-us",
          "portable-preview-intraday",
        ],
        dateRange: { from: null, to: null },
        snapshotPolicy: "EVIDENCE_ONLY",
        countsByDomain: {
          SETTINGS: 22,
          CUSTOM_INDICATORS: 0,
          NOTES: 0,
          TRAINING_HISTORY: 86,
          SPECIAL_TRAINING_HISTORY: 0,
          MARKET_DATA: 2,
        },
        payloadBytes: 1_832_620_000,
        marketDataIncluded: true,
      } as unknown as PortableImportPreview["manifest"],
      domains: [
        {
          domain: "SETTINGS",
          itemCount: 22,
          estimatedBytes: 220_000,
          includesEvidenceSnapshots: false,
          needsRebindAfterImport: false,
          conflictCount: 2,
        },
        {
          domain: "TRAINING_HISTORY",
          itemCount: 86,
          estimatedBytes: 12_400_000,
          includesEvidenceSnapshots: true,
          needsRebindAfterImport: false,
          conflictCount: 4,
        },
        {
          domain: "MARKET_DATA",
          itemCount: 2,
          estimatedBytes: 1_820_000_000,
          includesEvidenceSnapshots: false,
          needsRebindAfterImport: true,
          conflictCount: 1,
        },
      ],
      marketSources: previewPortableExport.marketSources,
      totalItems: 110,
      payloadBytes: 1_832_620_000,
      fullRestoreCounts: {
        trainingProjects: 20,
        specialTrainingQuestions: 11,
      },
      snapshotOnlyCounts: {
        trainingProjects: 3,
        specialTrainingQuestions: 2,
      },
      previewGeneration: "portable-preview-generation",
    };

    const previewPortableImportResult: PortableImportResult = {
      manifest: previewPortableImport.manifest,
      importedCountByDomain: {
        SETTINGS: 20,
        TRAINING_HISTORY: 82,
        MARKET_DATA: 2,
      },
      skippedCountByDomain: {
        SETTINGS: 2,
        TRAINING_HISTORY: 4,
      },
      conflictCountByDomain: {
        SETTINGS: 2,
        TRAINING_HISTORY: 4,
        MARKET_DATA: 1,
      },
      remappedIds: {
        notes: 0,
        trainingProjects: 4,
        specialTrainingSessions: 0,
        specialTrainingQuestions: 3,
      },
      rebind: {
        trainingProjectRefsUpdated: 9,
        specialTrainingQuestionsUpdated: 5,
      },
      marketImport: {
        importedSources: 1,
        reusedSources: 1,
        importedInstruments: 36,
        importedBars: 26880,
        pendingRebindSourceIds: ["portable-preview-intraday"],
      },
    };

    const previewDevSimulationCapabilities: ApiSystemDevSimulationCapabilities =
      {
        specVersion: 1,
        defaultProfileId: "REALISTIC",
        dataAvailability: {
          ready: true,
          localReadySourceCount: 2,
          localEligibleInstrumentCount: 6,
          systemEligibleInstrumentCount: 0,
          selectedInstrumentCount: 6,
          selectedLocalInstrumentCount: 6,
          selectedSystemInstrumentCount: 0,
          willUseSystemFallback: false,
          sourceStrategy: "LOCAL_READY",
        },
        profiles: [
          {
            profileId: "REALISTIC",
            available: true,
            devOnly: true,
            reasonCode: "AVAILABLE",
            defaultTargets: {
              freeReplayTarget: 48,
              fastDecisionTarget: 24,
              riskDisciplineTarget: 24,
              independentCustomNotes: 24,
              customIndicatorProfiles: 12,
              realBacktestBatches: 33,
            },
          },
          {
            profileId: "STRESS",
            available: true,
            devOnly: true,
            reasonCode: "AVAILABLE",
            defaultTargets: {
              freeReplayTarget: 1200,
              fastDecisionTarget: 240,
              riskDisciplineTarget: 240,
              independentCustomNotes: 48,
              customIndicatorProfiles: 60,
              realBacktestBatches: 310,
            },
          },
        ],
      };

    const createPreviewSettingsAction = (
      id: string,
      priority: number,
      enabled = true,
      reasonCode: string | null = null,
    ): ApiDesktopWorkspaceReadModel["actions"][number] => ({
      id,
      enabled,
      reasonCode,
      priority,
      facts: {},
    });

    const previewSettingsReadModel: ApiDesktopWorkspaceReadModel = {
      workspaceId: "settings",
      generatedAt: "2026-04-20T08:00:00.000Z",
      statusCode: requestedPage === "SETTINGS_BLOCKED" ? "DEGRADED" : "READY",
      reasonCode:
        requestedPage === "SETTINGS_BLOCKED"
          ? "SYSTEM_STARTUP_LOCAL_DATA_BLOCKED"
          : null,
      tone: requestedPage === "SETTINGS_BLOCKED" ? "warning" : "ready",
      priority: 30,
      facts: {
        appPreferences: {
          language,
          fontSizePreset: "STANDARD",
          themeMode: requestedTheme,
          desktopCloseButtonAction: "ASK",
          priceColorMode: "RED_UP_GREEN_DOWN",
          tradeColorTheme: "INSTITUTIONAL",
        },
        retention: {
          policy: null,
          latestJob: null,
          statusCode: "READY",
          reasonCode: null,
        },
        retentionPolicy: null,
        storageUsage: previewStorageUsage,
        devSimulation: {
          capabilities: previewDevSimulationCapabilities,
          latestJob: null,
          latestCleanupJob: null,
          visibleJob: null,
          visibleCleanupJob: null,
          visibleStatusCode: "IDLE",
          visibleJobDisplayTargets: null,
          visibleJobDiagnostic: null,
          cleanupSummary: null,
          statusCode: "READY",
          reasonCode: null,
          jobActive: false,
          cleanupJobActive: false,
          latestJobFinal: false,
          latestCleanupJobFinal: false,
        },
      },
      actions: [
        createPreviewSettingsAction("portable-export", 20),
        createPreviewSettingsAction("portable-import", 30),
        createPreviewSettingsAction("reset-all-data", 90),
        createPreviewSettingsAction("retention-save", 50),
        createPreviewSettingsAction("retention-preview", 51),
        createPreviewSettingsAction("retention-start", 52),
        createPreviewSettingsAction("dev-simulation-start-realistic", 60),
        createPreviewSettingsAction("dev-simulation-start-stress", 61),
        createPreviewSettingsAction("dev-simulation-cleanup", 62),
        createPreviewSettingsAction(
          "dev-simulation-cancel",
          63,
          false,
          "SYSTEM_DEV_SIMULATION_NO_CANCELABLE_JOB",
        ),
      ],
      sections: [],
    };

    api.listLocalDataSources = async () => [
      {
        id: "portable-preview-us",
        name: "U.S. Swing Archive",
        baseTimeframe: "1d",
        symbolCount: 24,
        barCount: 18240,
        status: "READY",
        updatedAt: "2026-04-16T08:00:00.000Z",
      } as never,
      {
        id: "portable-preview-intraday",
        name: "Momentum Intraday Set",
        baseTimeframe: "15m",
        symbolCount: 12,
        barCount: 8640,
        status: "READY",
        updatedAt: "2026-04-15T08:00:00.000Z",
      } as never,
      ...Array.from({ length: 56 }, (_, index) => {
        const sourceIndex = index + 1;
        return {
          id: `portable-preview-long-${sourceIndex}`,
          name: `Portable Archive Long Named Source ${sourceIndex} / Regional Multi-Timeframe Dataset`,
          baseTimeframe: sourceIndex % 2 === 0 ? "5m" : "1h",
          symbolCount: 18 + sourceIndex,
          barCount: 9000 + sourceIndex * 720,
          status: "READY",
          updatedAt: `2026-04-${String(Math.max(1, 14 - index)).padStart(
            2,
            "0",
          )}T08:00:00.000Z`,
        } as never;
      }),
    ];
    api.getSystemStorageUsage = async () => previewStorageUsage;
    api.getSystemStartupStatus = async () =>
      requestedPage === "SETTINGS_BLOCKED"
        ? previewStartupStatusBlocked
        : previewStartupStatusReady;
    api.getDesktopAppVersion = async () => "1.0.8";
    api.getWorkspaceReadModel = async (workspaceId) => {
      if (workspaceId === "settings") {
        return previewSettingsReadModel;
      }
      throw new Error(`Missing preview workspace read model: ${workspaceId}`);
    };
    api.getSystemDevSimulationCapabilities = async () =>
      previewDevSimulationCapabilities;
    api.getLatestSystemDevSimulationJob = async () => null as never;
    api.getLatestSystemDevSimulationCleanupJob = async () => null as never;
    api.startSystemDevSimulationJob = async () =>
      ({
        id: "preview-dev-simulation-job",
        profileId: "REALISTIC",
        status: "RUNNING",
        progressPercent: 42,
        phase: "FAST_DECISION",
        startedAt: "2026-04-20T08:10:00.000Z",
        finishedAt: null,
        freeReplayCompleted: 24,
        freeReplayTarget: 40,
        fastDecisionCompleted: 18,
        fastDecisionTarget: 36,
        riskDisciplineCompleted: 9,
        riskDisciplineTarget: 20,
        totalTarget: 96,
        currentMessage: "Preview running",
        errorMessage: null,
        errorCode: null,
        errorArgs: null,
        effectivePlan: {
          specVersion: 1,
          profileId: "REALISTIC",
          enabledPairCount: 4,
          calibrated: true,
          budget: {
            targetDurationMs: 12 * 60_000,
            hardLimitMs: 18 * 60_000,
            projectedDurationMs: 10 * 60_000,
            calibrationTargets: {
              freeReplayTarget: 40,
              fastDecisionTarget: 36,
              riskDisciplineTarget: 20,
              independentCustomNotes: 12,
            },
          },
          targets: {
            freeReplayTarget: 40,
            fastDecisionTarget: 36,
            riskDisciplineTarget: 20,
            independentCustomNotes: 12,
          },
          runtime: {
            freeReplayConcurrency: 2,
            challengeConcurrency: 2,
            customNoteConcurrency: 1,
            barCacheMaxSeries: 12,
          },
          notePolicy: {
            freeReplayForceCreateUntil: 4,
            freeReplayCreateProbability: 0.4,
            challengeForceCreateUntil: 3,
            challengeCreateProbability: 0.25,
            maxTagCount: 6,
          },
        },
        elapsedMs: 4 * 60_000,
        throughput: {
          completedItems: 51,
          itemsPerMinute: 14,
        },
        estimatedRemainingMs: 4 * 60_000,
        createdCounts: {
          trainingProjects: 24,
          replayNotes: 16,
          independentCustomNotes: 6,
          specialTrainingSessions: 12,
          specialTrainingQuestions: 9,
          specialTrainingBanks: 12,
          questionLedger: 18,
          desktopMutableRuns: 0,
        },
        canCancel: true,
        cancelRequested: false,
        metrics: {
          retryCount: 0,
          phaseElapsedMs: 80_000,
          verificationStatus: "PENDING",
          workloadAverageMs: {
            freeReplayAverageMs: 2600,
            fastDecisionAverageMs: 1900,
            riskDisciplineAverageMs: 2400,
            customNoteAverageMs: 1200,
          },
        },
      }) as never;
    api.cancelSystemDevSimulationJob = async () =>
      ({
        id: "preview-dev-simulation-job",
        profileId: "REALISTIC",
        status: "INTERRUPTED",
        progressPercent: 42,
        phase: "FAST_DECISION",
        startedAt: "2026-04-20T08:10:00.000Z",
        finishedAt: "2026-04-20T08:14:00.000Z",
        freeReplayCompleted: 24,
        freeReplayTarget: 40,
        fastDecisionCompleted: 18,
        fastDecisionTarget: 36,
        riskDisciplineCompleted: 9,
        riskDisciplineTarget: 20,
        totalTarget: 96,
        currentMessage: "Preview cancelled",
        errorMessage: null,
        errorCode: null,
        errorArgs: null,
        effectivePlan: {
          specVersion: 1,
          profileId: "REALISTIC",
          enabledPairCount: 4,
          calibrated: true,
          budget: {
            targetDurationMs: 12 * 60_000,
            hardLimitMs: 18 * 60_000,
            projectedDurationMs: 10 * 60_000,
            calibrationTargets: {
              freeReplayTarget: 40,
              fastDecisionTarget: 36,
              riskDisciplineTarget: 20,
              independentCustomNotes: 12,
            },
          },
          targets: {
            freeReplayTarget: 40,
            fastDecisionTarget: 36,
            riskDisciplineTarget: 20,
            independentCustomNotes: 12,
          },
          runtime: {
            freeReplayConcurrency: 2,
            challengeConcurrency: 2,
            customNoteConcurrency: 1,
            barCacheMaxSeries: 12,
          },
          notePolicy: {
            freeReplayForceCreateUntil: 4,
            freeReplayCreateProbability: 0.4,
            challengeForceCreateUntil: 3,
            challengeCreateProbability: 0.25,
            maxTagCount: 6,
          },
        },
        elapsedMs: 4 * 60_000,
        throughput: {
          completedItems: 51,
          itemsPerMinute: 14,
        },
        estimatedRemainingMs: 0,
        createdCounts: {
          trainingProjects: 24,
          replayNotes: 16,
          independentCustomNotes: 6,
          specialTrainingSessions: 12,
          specialTrainingQuestions: 9,
          specialTrainingBanks: 12,
          questionLedger: 18,
          desktopMutableRuns: 0,
        },
        canCancel: false,
        cancelRequested: true,
        metrics: {
          retryCount: 0,
          phaseElapsedMs: 80_000,
          verificationStatus: "SUCCESS",
          workloadAverageMs: {
            freeReplayAverageMs: 2600,
            fastDecisionAverageMs: 1900,
            riskDisciplineAverageMs: 2400,
            customNoteAverageMs: 1200,
          },
        },
      }) as never;
    api.getSystemDevSimulationJob = async () =>
      ({
        id: "preview-dev-simulation-job",
        profileId: "REALISTIC",
        status: "SUCCESS",
        progressPercent: 100,
        phase: "DONE",
        startedAt: "2026-04-20T08:10:00.000Z",
        finishedAt: "2026-04-20T08:16:00.000Z",
        freeReplayCompleted: 40,
        freeReplayTarget: 40,
        fastDecisionCompleted: 36,
        fastDecisionTarget: 36,
        riskDisciplineCompleted: 20,
        riskDisciplineTarget: 20,
        totalTarget: 96,
        currentMessage: "Preview complete",
        errorMessage: null,
        errorCode: null,
        errorArgs: null,
        effectivePlan: {
          specVersion: 1,
          profileId: "REALISTIC",
          enabledPairCount: 4,
          calibrated: true,
          budget: {
            targetDurationMs: 12 * 60_000,
            hardLimitMs: 18 * 60_000,
            projectedDurationMs: 10 * 60_000,
            calibrationTargets: {
              freeReplayTarget: 40,
              fastDecisionTarget: 36,
              riskDisciplineTarget: 20,
              independentCustomNotes: 12,
            },
          },
          targets: {
            freeReplayTarget: 40,
            fastDecisionTarget: 36,
            riskDisciplineTarget: 20,
            independentCustomNotes: 12,
          },
          runtime: {
            freeReplayConcurrency: 2,
            challengeConcurrency: 2,
            customNoteConcurrency: 1,
            barCacheMaxSeries: 12,
          },
          notePolicy: {
            freeReplayForceCreateUntil: 4,
            freeReplayCreateProbability: 0.4,
            challengeForceCreateUntil: 3,
            challengeCreateProbability: 0.25,
            maxTagCount: 6,
          },
        },
        elapsedMs: 6 * 60_000,
        throughput: {
          completedItems: 96,
          itemsPerMinute: 14,
        },
        estimatedRemainingMs: 0,
        createdCounts: {
          trainingProjects: 40,
          replayNotes: 24,
          independentCustomNotes: 12,
          specialTrainingSessions: 18,
          specialTrainingQuestions: 20,
          specialTrainingBanks: 56,
          questionLedger: 36,
          desktopMutableRuns: 1,
        },
        canCancel: false,
        cancelRequested: false,
        metrics: {
          retryCount: 0,
          phaseElapsedMs: 0,
          verificationStatus: "SUCCESS",
          workloadAverageMs: {
            freeReplayAverageMs: 2600,
            fastDecisionAverageMs: 1900,
            riskDisciplineAverageMs: 2400,
            customNoteAverageMs: 1200,
          },
        },
      }) as never;
    api.startSystemDevSimulationCleanupJob = async () =>
      ({
        id: "preview-dev-simulation-cleanup-job",
        status: "RUNNING",
        stage: "TRAINING_PROJECTS",
        progressPercent: 64,
        startedAt: "2026-04-20T08:20:00.000Z",
        finishedAt: null,
        errorCode: null,
        errorArgs: null,
        result: null,
      }) as never;
    api.getSystemDevSimulationCleanupJob = async () =>
      ({
        id: "preview-dev-simulation-cleanup-job",
        status: "SUCCESS",
        stage: "DONE",
        progressPercent: 100,
        startedAt: "2026-04-20T08:20:00.000Z",
        finishedAt: "2026-04-20T08:21:00.000Z",
        errorCode: null,
        errorArgs: null,
        result: {
          deletedTrainingProjects: 42,
          deletedReplayNotes: 12,
          deletedQuestionLedger: 18,
          deletedSpecialTrainingBanks: 8,
          deletedSpecialTrainingHistoryQuestions: 18,
          deletedSpecialTrainingHistorySessions: 8,
          deletedCustomIndicatorProfiles: 1,
        },
      }) as never;
    api.pickPortableExportTargetPath = async () =>
      "~/Desktop/trading-practice-data-2026-04-20.otp-package";
    api.previewPortableExport = async () => previewPortableExport;
    api.executePortableExport = async () => ({
      outputPath: "~/Desktop/trading-practice-data-2026-04-20.otp-package",
      manifest: previewPortableImport.manifest,
      fileBytes: previewPortableImport.payloadBytes,
    });
    api.pickPortableImportPackagePath = async () =>
      "~/Desktop/trading-practice-data-2026-04-20.otp-package";
    api.inspectPortableImportPackage = async () => previewPortableImport;
    api.executePortableImport = async () => previewPortableImportResult;

    globalThis.fetch = (input, init) => previousFetch(input, init);
  }
};
