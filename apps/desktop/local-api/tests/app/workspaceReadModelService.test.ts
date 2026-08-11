// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { WorkspaceReadModelDependencies } from '../../src/application/workspaceReadModelService.js';

const tempDir = await fs.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-workspace-read-model-'),
);
process.env.ZINUTO_DB_PATH = path.join(tempDir, 'zinuto.db');
const {
  WORKSPACE_READ_MODEL_IDS,
  WORKSPACE_READ_MODEL_REGISTRY,
  buildWorkspaceReadModel,
} = await import('../../src/application/workspaceReadModelService.js');

test.after(async () => {
  await fs.rm(tempDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
});

const createDeps = (
  overrides: Partial<WorkspaceReadModelDependencies> = {},
): WorkspaceReadModelDependencies =>
  ({
    nowIso: () => '2026-05-29T00:00:00.000Z',
    listLocalDataSources: async () => [],
    listTrainingProjects: async () => ({ items: [], nextCursor: null }),
    getTrainingStatsSummary: () => ({
      totals: { totalProjects: 0, filteredProjects: 0 },
    }),
    getLatestResumableSession: async () => null,
    listInstruments: async () => [],
    getPortfolioSummary: async () => ({}),
    getTradingSettings: () => ({}),
    listSpecialTrainingBanksPage: () => ({
      items: [],
      nextCursor: null,
      total: 0,
    }),
    getSpecialTrainingStatsSummary: () => ({
      totals: { totalProjects: 0, filteredProjects: 0 },
    }),
    getSpecialTrainingStatsReport: async () => ({
      report: createChallengeStatsReport(),
      projectDetailsById: {},
    }),
    listReplayNotes: () => ({ items: [], nextCursor: null, total: 0 }),
    listRecentReplayNoteSummaries: () => [],
    getAppPreferences: () => ({
      uiSettings: {},
      dataPoolRemovedSymbolsBySourceId: {},
    }),
    getHistoryRetentionPolicy: () => ({
      retentionWindow: 'FOREVER',
      targets: {
        freeReplayDetails: true,
        challengeDetails: true,
        noteText: true,
      },
      updatedAt: '2026-05-29T00:00:00.000Z',
      lastAppliedAt: null,
    }),
    getLatestHistoryRetentionJob: () => null,
    getSystemStorageUsage: async () => ({}),
    getSystemDevSimulationCapabilities: () => ({
      specVersion: 5,
      defaultProfileId: 'REALISTIC',
      dataAvailability: {
        ready: false,
        localReadySourceCount: 0,
        localEligibleInstrumentCount: 0,
        systemEligibleInstrumentCount: 0,
        selectedInstrumentCount: 0,
        selectedLocalInstrumentCount: 0,
        selectedSystemInstrumentCount: 0,
        willUseSystemFallback: false,
        sourceStrategy: 'NONE',
      },
      profiles: [
        {
          profileId: 'REALISTIC',
          available: true,
          devOnly: false,
          reasonCode: 'AVAILABLE',
        },
        {
          profileId: 'STRESS',
          available: false,
          devOnly: true,
          reasonCode: 'DEV_ONLY_DISABLED',
        },
      ],
    }),
    getLatestSystemDevSimulationJob: () => null,
    getLatestSystemDevSimulationCleanupJob: () => null,
    listCustomIndicatorProfiles: async () => [],
    listSystemSeedDatasets: () => [],
    ...overrides,
  }) as WorkspaceReadModelDependencies;

const createChallengeStatsInsights = (sampleCount = 0) => ({
  fast: {
    RECENT_10: {
      sampleCount,
      winRate: 0,
      avgDecisionSeconds: 0,
      effectiveHitRate: 0,
      medianDecisionSeconds: 0,
      observeMissRate: 0,
      longCount: 0,
      shortCount: 0,
      observeCount: 0,
      longWinRate: 0,
      shortWinRate: 0,
      slowerPercentile: 0,
    },
    RECENT_50: {
      sampleCount,
      winRate: 0,
      avgDecisionSeconds: 0,
      effectiveHitRate: 0,
      medianDecisionSeconds: 0,
      observeMissRate: 0,
      longCount: 0,
      shortCount: 0,
      observeCount: 0,
      longWinRate: 0,
      shortWinRate: 0,
      slowerPercentile: 0,
    },
    ALL: {
      sampleCount,
      winRate: 0,
      avgDecisionSeconds: 0,
      effectiveHitRate: 0,
      medianDecisionSeconds: 0,
      observeMissRate: 0,
      longCount: 0,
      shortCount: 0,
      observeCount: 0,
      longWinRate: 0,
      shortWinRate: 0,
      slowerPercentile: 0,
    },
  },
  risk: {
    RECENT_10: {
      sampleCount: 0,
      survivalRate: 0,
      comebackRate: 0,
      positiveAlphaRate: 0,
      dominantBehavior: 'CUT_LOSS',
      dominantBehaviorShare: 0,
      medianFirstActionBars: 0,
      averageFirstActionBars: 0,
      behaviorStats: {
        CUT_LOSS: { count: 0, survived: 0 },
        ADD_POSITION: { count: 0, survived: 0 },
        FREEZE: { count: 0, survived: 0 },
      },
    },
    RECENT_50: {
      sampleCount: 0,
      survivalRate: 0,
      comebackRate: 0,
      positiveAlphaRate: 0,
      dominantBehavior: 'CUT_LOSS',
      dominantBehaviorShare: 0,
      medianFirstActionBars: 0,
      averageFirstActionBars: 0,
      behaviorStats: {
        CUT_LOSS: { count: 0, survived: 0 },
        ADD_POSITION: { count: 0, survived: 0 },
        FREEZE: { count: 0, survived: 0 },
      },
    },
    ALL: {
      sampleCount: 0,
      survivalRate: 0,
      comebackRate: 0,
      positiveAlphaRate: 0,
      dominantBehavior: 'CUT_LOSS',
      dominantBehaviorShare: 0,
      medianFirstActionBars: 0,
      averageFirstActionBars: 0,
      behaviorStats: {
        CUT_LOSS: { count: 0, survived: 0 },
        ADD_POSITION: { count: 0, survived: 0 },
        FREEZE: { count: 0, survived: 0 },
      },
    },
  },
});

const createChallengeStatsReport = (overrides: Record<string, unknown> = {}) => ({
  generatedAt: '2026-05-29T00:00:00.000Z',
  modeId: 'fast-decision-training',
  defaultModeId: 'fast-decision-training',
  filtersApplied: {
    from: null,
    to: null,
    samplePoolId: '__all__',
    symbol: '__all__',
    timeframe: '__all__',
    tag: 'special_fast_decision',
    profitability: 'ALL',
    comparePoolA: '',
    comparePoolB: '',
  },
  totals: { totalProjects: 0, filteredProjects: 0 },
  overview: { totalSessions: 0 },
  dashboardInsights: createChallengeStatsInsights(),
  dashboardRows: [],
  modeAvailability: {
    'fast-decision-training': {
      tag: 'special_fast_decision',
      sessionCount: 0,
    },
    'risk-discipline-training': {
      tag: 'special_risk',
      sessionCount: 0,
    },
  },
  recentSessions: [],
  ...overrides,
});

const actionById = (
  model: Awaited<ReturnType<typeof buildWorkspaceReadModel>>,
  id: string,
) => model.actions.find((action) => action.id === id) ?? null;

test('workspace read model builders cover every registered workspace id', async () => {
  for (const workspaceId of WORKSPACE_READ_MODEL_IDS) {
    const model = await buildWorkspaceReadModel(workspaceId, createDeps());
    assert.equal(model.workspaceId, workspaceId);
    assert.equal(typeof model.statusCode, 'string');
    assert.equal(Array.isArray(model.actions), true);
    assert.equal(Array.isArray(model.sections), true);
  }
});

test('workspace read model registry owns ids and OpenAPI routes', async () => {
  const registryIds = WORKSPACE_READ_MODEL_REGISTRY.map((entry) => entry.id);
  const registryPaths = WORKSPACE_READ_MODEL_REGISTRY.map((entry) => entry.path);
  assert.deepEqual(WORKSPACE_READ_MODEL_IDS, registryIds);
  assert.equal(new Set(registryIds).size, registryIds.length);
  assert.equal(new Set(registryPaths).size, registryPaths.length);

  const contractText = await fs.readFile(
    path.resolve(process.cwd(), '../../../contracts/openapi/desktop-local-api.v1.yaml'),
    'utf8',
  );
  for (const entry of WORKSPACE_READ_MODEL_REGISTRY) {
    assert.ok(
      contractText.includes(`  /api/v1${entry.path}:`),
      `missing OpenAPI route for ${entry.id}: ${entry.path}`,
    );
  }
});

test('trainer read model blocks start until backend data facts are ready', async () => {
  const model = await buildWorkspaceReadModel('trainer', createDeps());

  assert.equal(model.workspaceId, 'trainer');
  assert.equal(model.statusCode, 'EMPTY');
  assert.equal(model.reasonCode, 'NO_DATA_SOURCE');
  assert.equal(actionById(model, 'start-session')?.enabled, false);
  assert.equal(
    actionById(model, 'start-session')?.reasonCode,
    'NO_READY_DATA_SOURCE',
  );
});

test('trainer read model enables start and resume from local-api facts', async () => {
  const model = await buildWorkspaceReadModel(
    'trainer',
    createDeps({
      listLocalDataSources: async () =>
        [
          {
            id: 'source-1',
            status: 'READY',
            symbolCount: 3,
            barCount: 1200,
            storageBytes: 4096,
          },
        ] as never,
      getLatestResumableSession: async () => ({ id: 'session-1' }) as never,
    }),
  );

  assert.equal(model.statusCode, 'READY');
  assert.equal(actionById(model, 'start-session')?.enabled, true);
  assert.equal(actionById(model, 'resume-session')?.enabled, true);
  assert.deepEqual(model.facts.data, {
    sourceCount: 1,
    readySourceCount: 1,
    importingSourceCount: 0,
    failedSourceCount: 0,
    rebindRequiredSourceCount: 0,
    lockedSourceCount: 0,
    symbolCount: 3,
    barCount: 1200,
    storageBytes: 4096,
    sourceStatusById: {
      'source-1': {
        sourceId: 'source-1',
        statusCode: 'READY',
        reasonCode: null,
        tone: 'ready',
        priority: 50,
        summaryFilter: 'ALL',
        primaryActionId: 'view-details',
        primaryActionEnabled: true,
        primaryActionReasonCode: null,
        sourceStatus: 'READY',
        sourceLocked: false,
        requiresSourceFolderRebind: false,
        symbolCount: 3,
        barCount: 1200,
        storageBytes: 4096,
        lastJobStatus: null,
      },
    },
  });
  const tradingForm = model.facts.tradingForm as {
    defaultPresetId?: string;
    builtInPresetIds?: string[];
    presetValuesById?: Record<string, { minTradeStepInput?: string }>;
  };
  assert.equal(tradingForm.defaultPresetId, 'A_SHARE');
  assert.equal(tradingForm.builtInPresetIds?.includes('US_STOCK'), true);
  assert.equal(
    tradingForm.presetValuesById?.US_STOCK?.minTradeStepInput,
    '1',
  );
});

test('command center read model owns dashboard facts and actions', async () => {
  const model = await buildWorkspaceReadModel(
    'command-center',
    createDeps({
      listLocalDataSources: async () =>
        [
          {
            id: 'source-1',
            status: 'READY',
            symbolCount: 4,
            barCount: 2400,
            storageBytes: 8192,
          },
        ] as never,
      getTrainingStatsSummary: () => ({
        totals: { totalProjects: 3, filteredProjects: 3 },
        comparisons: {
          recent20VsPrevious20: {
            left: { sessionCount: 3, profitLossRatio: 1.4, winRate: 0.67, maxDrawdownRate: 0.08 },
          },
        },
      }),
      getSpecialTrainingStatsSummary: (filters) => ({
        generatedAt: '2026-05-29T00:00:00.000Z',
        modeId: filters.modeId,
        defaultModeId: filters.modeId,
        totals: {
          totalProjects: filters.modeId === 'fast-decision-training' ? 5 : 7,
          filteredProjects: filters.modeId === 'fast-decision-training' ? 5 : 7,
        },
        overview: { totalSessions: filters.modeId === 'fast-decision-training' ? 5 : 7 },
        dashboardInsights: createChallengeStatsInsights(
          filters.modeId === 'fast-decision-training' ? 5 : 7,
        ),
        modeAvailability: {
          'fast-decision-training': {
            tag: 'special_fast_decision',
            sessionCount: 5,
          },
          'risk-discipline-training': {
            tag: 'special_risk',
            sessionCount: 7,
          },
        },
        recentSessions: [],
      }),
      getLatestResumableSession: async () =>
        ({
          sessionId: 'session-1',
          symbol: 'AAPL',
          instrumentName: null,
          timeframe: '1d',
          minimumBaseTimeframe: '1d',
          samplePoolId: 'pool-1',
          createdAt: '2026-05-28T00:00:00.000Z',
          updatedAt: '2026-05-29T00:00:00.000Z',
        }) as never,
      listRecentReplayNoteSummaries: () =>
        [
          {
            id: 'note-1',
            title: 'Breakout review',
            type: 'POST_REPLAY',
            colorTokens: ['DISCIPLINE'],
            createdAt: '2026-05-28T00:00:00.000Z',
            updatedAt: '2026-05-29T00:00:00.000Z',
          },
        ] as never,
    }),
  );

  const specialStats = model.facts.specialStatsSummariesByModeId as Record<
    string,
    { totals?: { totalProjects?: number }; modeId?: string }
  >;
  const recentNotes = model.facts.recentReplayNotes as Array<{ id?: string }>;
  const latestResumableSession = model.facts.latestResumableSession as {
    sessionId?: string;
  };
  const actionFacts = model.facts.actionFacts as {
    resumeTrainer?: { enabled?: boolean; sessionId?: string | null };
  };

  assert.equal(model.workspaceId, 'command-center');
  assert.equal(model.statusCode, 'READY');
  assert.equal(actionById(model, 'start-trainer')?.enabled, true);
  assert.equal(actionById(model, 'resume-trainer')?.enabled, true);
  assert.equal(actionById(model, 'resume-trainer')?.facts.sessionId, 'session-1');
  assert.equal(specialStats['fast-decision-training']?.totals?.totalProjects, 5);
  assert.equal(specialStats['risk-discipline-training']?.totals?.totalProjects, 7);
  assert.equal(recentNotes[0]?.id, 'note-1');
  assert.equal(latestResumableSession.sessionId, 'session-1');
  assert.equal(actionFacts.resumeTrainer?.enabled, true);
  assert.equal(actionFacts.resumeTrainer?.sessionId, 'session-1');
});

test('command center data center summary includes system sample pools', async () => {
  const model = await buildWorkspaceReadModel(
    'command-center',
    createDeps({
      listSystemSeedDatasets: () =>
        [
          {
            poolId: '__sample_pool_system__',
            version: 'test-system',
            sourceName: 'System daily',
            timeZone: 'America/New_York',
            baseTimeframe: '1d',
            marketPresetId: 'US_STOCK',
            assetClass: 'STOCK',
            minTradeStep: 1,
            selectedSymbolCount: 100,
          },
          {
            poolId: '__sample_pool_system_fx_1m_2025q1__',
            version: 'test-fx',
            sourceName: 'System FX',
            timeZone: 'America/New_York',
            baseTimeframe: '1m',
            marketPresetId: 'FOREX_STANDARD_LOT',
            assetClass: 'FOREX',
            minTradeStep: 0.01,
            selectedSymbolCount: 13,
          },
        ] as never,
    }),
  );

  assert.deepEqual(model.facts.dataCenterSummary, {
    poolCount: 2,
    symbolCount: 113,
    localSourceCount: 0,
    localSymbolCount: 0,
    systemPoolCount: 2,
    systemSymbolCount: 113,
  });
  assert.equal(model.statusCode, 'READY');
  assert.equal(actionById(model, 'start-trainer')?.enabled, true);
});

test('settings read model owns dev simulation action availability', async () => {
  const activeJob = {
    id: 'simulation-job-1',
    profileId: 'REALISTIC',
    status: 'RUNNING',
    progressPercent: 12,
    phase: 'FREE_REPLAY',
    startedAt: '2026-05-29T00:00:00.000Z',
    finishedAt: null,
    freeReplayCompleted: 1,
    freeReplayTarget: 10,
    fastDecisionCompleted: 0,
    fastDecisionTarget: 10,
    riskDisciplineCompleted: 0,
    riskDisciplineTarget: 10,
    totalTarget: 30,
    currentMessage: '',
    errorMessage: null,
    errorCode: null,
    errorArgs: null,
    effectivePlan: null,
    elapsedMs: 1000,
    estimatedRemainingMs: null,
    throughput: { completedItems: 1, itemsPerMinute: 60 },
    currentWorkload: {
      phase: 'FREE_REPLAY',
      workload: 'FREE_REPLAY',
      index: 1,
      current: 2,
      target: 10,
      startedAt: '2026-05-29T00:00:01.000Z',
      updatedAt: '2026-05-29T00:00:02.000Z',
    },
    createdCounts: {
      trainingProjects: 0,
      replayNotes: 0,
      independentCustomNotes: 0,
      specialTrainingSessions: 0,
      specialTrainingQuestions: 0,
      specialTrainingBanks: 0,
      questionLedger: 0,
      desktopMutableRuns: 0,
    },
    canCancel: true,
    cancelRequested: false,
    metrics: {
      retryCount: 0,
      phaseElapsedMs: 1000,
      verificationStatus: 'PENDING',
      workloadAverageMs: {
        freeReplayAverageMs: null,
        fastDecisionAverageMs: null,
        riskDisciplineAverageMs: null,
        customNoteAverageMs: null,
      },
    },
  };
  const model = await buildWorkspaceReadModel(
    'settings',
    createDeps({
      getSystemDevSimulationCapabilities: () => ({
        specVersion: 5,
        defaultProfileId: 'REALISTIC',
        dataAvailability: {
          ready: true,
          localReadySourceCount: 1,
          localEligibleInstrumentCount: 8,
          systemEligibleInstrumentCount: 0,
          selectedInstrumentCount: 8,
          selectedLocalInstrumentCount: 8,
          selectedSystemInstrumentCount: 0,
          willUseSystemFallback: false,
          sourceStrategy: 'LOCAL_READY',
        },
        profiles: [
          {
            profileId: 'REALISTIC',
            available: true,
            devOnly: false,
            reasonCode: 'AVAILABLE',
          },
          {
            profileId: 'STRESS',
            available: true,
            devOnly: true,
            reasonCode: 'AVAILABLE',
          },
        ],
      }),
      getLatestSystemDevSimulationJob: () => activeJob as never,
    }),
  );

  assert.equal(model.workspaceId, 'settings');
  assert.equal(
    actionById(model, 'dev-simulation-start-realistic')?.enabled,
    false,
  );
  assert.equal(
    actionById(model, 'dev-simulation-start-realistic')?.reasonCode,
    'SYSTEM_DEV_SIMULATION_JOB_ACTIVE',
  );
  assert.equal(
    actionById(model, 'dev-simulation-cleanup')?.reasonCode,
    'SYSTEM_DEV_SIMULATION_JOB_ACTIVE',
  );
  assert.equal(actionById(model, 'dev-simulation-cancel')?.enabled, true);
  assert.equal(
    actionById(model, 'dev-simulation-cancel')?.facts.jobId,
    'simulation-job-1',
  );
  assert.deepEqual(
    (model.facts.devSimulation as { latestJob?: { id?: string } }).latestJob?.id,
    'simulation-job-1',
  );
  assert.deepEqual(
    (
      model.facts.devSimulation as {
        visibleJobDiagnostic?: {
          currentWorkload?: {
            workload?: string | null;
            current?: number;
            target?: number;
          } | null;
        };
      }
    ).visibleJobDiagnostic?.currentWorkload,
    {
      phase: 'FREE_REPLAY',
      workload: 'FREE_REPLAY',
      index: 1,
      current: 2,
      target: 10,
      startedAt: '2026-05-29T00:00:01.000Z',
      updatedAt: '2026-05-29T00:00:02.000Z',
    },
  );
});

test('challenge stats read model disables dashboard actions when history is empty', async () => {
  const model = await buildWorkspaceReadModel('challenge-stats', createDeps());

  assert.equal(model.statusCode, 'EMPTY');
  assert.equal(model.reasonCode, 'NO_CHALLENGE_HISTORY');
  assert.equal(actionById(model, 'export-stats')?.enabled, false);
  assert.equal(actionById(model, 'clear-history')?.enabled, false);
  assert.deepEqual(model.facts.emptyState, {
    isEmpty: true,
    statusCode: 'EMPTY',
    reasonCode: 'NO_CHALLENGE_HISTORY',
    totalProjects: 0,
    filteredProjects: 0,
    modeProjectCount: 0,
  });
});

test('challenge stats read model owns rows, readiness, and export availability', async () => {
  const model = await buildWorkspaceReadModel(
    'challenge-stats',
    createDeps({
      getSpecialTrainingStatsReport: async () => ({
        report: createChallengeStatsReport({
          totals: { totalProjects: 4, filteredProjects: 4 },
          overview: { totalSessions: 4, winRate: 0.75 },
          dashboardInsights: createChallengeStatsInsights(4),
          dashboardRows: [
            {
              kind: 'fast',
              id: 'challenge-1',
              createdAt: '2026-05-29T00:00:00.000Z',
              symbol: 'AAPL',
              samplePoolId: 'pool-1',
              samplePoolName: 'Pool 1',
              baseTimeframe: '1d',
              totalPnl: 120,
              profitRate: 0.12,
              totalTrades: 3,
              durationDays: 1,
              decisionSeconds: 1.8,
              selection: 'LONG',
              actual: 'LONG',
              correct: true,
              timedOut: false,
              edgeRatio: 1.6,
              opportunityEdgeRatio: 1.8,
              performanceRate: 0.04,
              reviewGrade: 'S',
            },
          ],
          modeAvailability: {
            'fast-decision-training': {
              tag: 'special_fast_decision',
              projectCount: 4,
            },
            'risk-discipline-training': {
              tag: 'special_risk',
              projectCount: 0,
            },
          },
          recentSessions: [
            {
              id: 'challenge-1',
              name: 'Challenge 1',
              symbol: 'AAPL',
              samplePoolId: 'pool-1',
              samplePoolName: 'Pool 1',
              baseTimeframe: '1d',
              createdAt: '2026-05-29T00:00:00.000Z',
              profitRate: 0.12,
              totalPnl: 120,
              totalTrades: 3,
              durationDays: 1,
            },
          ],
        }),
        projectDetailsById: {},
      }) as never,
    }),
  );

  const dashboard = model.facts.dashboard as {
    rowCount?: number;
    activeFamily?: string;
    activeMetricReadiness?: { enabled?: boolean; sampleCount?: number };
  };
  const metricReadiness = model.facts.metricReadiness as {
    fast?: { RECENT_10?: { enabled?: boolean; sampleCount?: number } };
  };
  const sessionRows = model.facts.sessionRows as Array<{ id?: string; kind?: string }>;

  assert.equal(model.statusCode, 'READY');
  assert.equal(actionById(model, 'export-stats')?.enabled, true);
  assert.equal(actionById(model, 'clear-history')?.enabled, true);
  assert.equal(dashboard.rowCount, 1);
  assert.equal(dashboard.activeFamily, 'fast');
  assert.equal(dashboard.activeMetricReadiness?.enabled, true);
  assert.equal(metricReadiness.fast?.RECENT_10?.sampleCount, 4);
  assert.equal(sessionRows[0]?.id, 'challenge-1');
  assert.equal(sessionRows[0]?.kind, 'fast');
});

test('history review read model owns project note counts and compact stats', async () => {
  const model = await buildWorkspaceReadModel(
    'history-review-console',
    createDeps({
      listTrainingProjects: async () =>
        ({
          items: [
            {
              id: 'project-1',
              name: 'Session 1',
              trainingDateRange: '2026-01-01 ~ 2026-01-05',
              initialTotal: 100_000,
              finalEquity: 108_000,
              equityReturnRate: 0.08,
              totalPnl: 8_000,
              summary: {
                initialAsset: 100_000,
                endingAsset: 108_000,
                totalPnl: 8_000,
                assetReturnRate: 0.08,
                maxDrawdownRate: 0.06,
                maxDrawdownAmount: -3200,
              },
            },
          ],
          nextCursor: null,
        }) as never,
      getTrainingStatsSummary: () => ({
        totals: { totalProjects: 1, filteredProjects: 1 },
      }),
      listReplayNotes: () =>
        ({
          items: [
            {
              id: 'note-1',
              type: 'FREE_REPLAY',
              trainingProjectId: 'project-1',
            },
            {
              id: 'note-2',
              type: 'CUSTOM',
              trainingProjectId: 'project-1',
            },
          ],
          nextCursor: null,
          total: 2,
        }) as never,
    }),
  );

  assert.equal(model.statusCode, 'READY');
  assert.equal(actionById(model, 'open-review-console')?.enabled, true);
  const projectFactsById = model.facts.projectFactsById as Record<
    string,
    {
      replayNoteCount?: number;
      compactStats?: {
        initialCapital?: number;
        finalEquity?: number;
        equityReturnRate?: number;
        drawdownRate?: number;
        drawdownAmount?: number;
        dateRange?: { statusCode?: string; startDate?: string; endDate?: string };
      };
    }
  >;
  assert.equal(projectFactsById['project-1']?.replayNoteCount, 1);
  assert.equal(
    projectFactsById['project-1']?.compactStats?.initialCapital,
    100_000,
  );
  assert.equal(projectFactsById['project-1']?.compactStats?.finalEquity, 108_000);
  assert.equal(
    projectFactsById['project-1']?.compactStats?.equityReturnRate,
    0.08,
  );
  assert.equal(projectFactsById['project-1']?.compactStats?.drawdownRate, 0.06);
  assert.equal(
    projectFactsById['project-1']?.compactStats?.drawdownAmount,
    3200,
  );
  assert.deepEqual(projectFactsById['project-1']?.compactStats?.dateRange, {
    statusCode: 'READY',
    reasonCode: null,
    rawRange: '2026-01-01 ~ 2026-01-05',
    startDate: '2026-01-01',
    endDate: '2026-01-05',
  });
});

test('notes read model owns summary, empty state, and CTA availability', async () => {
  const emptyModel = await buildWorkspaceReadModel('notes', createDeps());

  assert.equal(emptyModel.statusCode, 'EMPTY');
  assert.equal(emptyModel.reasonCode, 'NO_REPLAY_NOTES');
  assert.equal(actionById(emptyModel, 'create-note')?.enabled, true);
  assert.equal(actionById(emptyModel, 'open-recent-note')?.enabled, false);
  assert.equal(emptyModel.facts.totalNotes, 0);
  assert.deepEqual(emptyModel.facts.emptyState, {
    statusCode: 'EMPTY',
    reasonCode: 'NO_REPLAY_NOTES',
  });
  assert.deepEqual((emptyModel.facts.cta as Record<string, unknown>).loadMore, {
    enabled: false,
    reasonCode: 'NO_MORE_REPLAY_NOTES',
  });

  const readyModel = await buildWorkspaceReadModel(
    'notes',
    createDeps({
      listReplayNotes: () =>
        ({
          items: [{ id: 'note-1' }],
          nextCursor: 'cursor-2',
          total: 4,
        }) as never,
      listRecentReplayNoteSummaries: () =>
        [
          {
            id: 'note-1',
            title: 'Review',
            type: 'FREE_REPLAY',
            colorTokens: [],
            createdAt: '2026-05-29T00:00:00.000Z',
            updatedAt: '2026-05-29T00:00:00.000Z',
          },
        ] as never,
    }),
  );

  assert.equal(readyModel.statusCode, 'READY');
  assert.equal(readyModel.facts.totalNotes, 4);
  assert.equal(readyModel.facts.loadedNoteCount, 1);
  assert.equal(readyModel.facts.recentCount, 1);
  assert.deepEqual((readyModel.facts.cta as Record<string, unknown>).loadMore, {
    enabled: true,
    reasonCode: null,
  });
  assert.equal(actionById(readyModel, 'open-recent-note')?.enabled, true);
});

test('custom indicator profiles remain fully available from local storage', async () => {
  let requestedInstrumentOptions: unknown;
  const model = await buildWorkspaceReadModel(
    'custom-indicator',
    createDeps({
      listInstruments: async (options) => {
        requestedInstrumentOptions = options;
        return [];
      },
      listCustomIndicatorProfiles: async () =>
        [
          {
            id: 'profile-local',
            name: 'LOCAL',
            updatedAt: '2026-05-29T00:00:00.000Z',
          },
        ] as never,
    }),
  );

  assert.equal(model.statusCode, 'READY');
  assert.equal(model.reasonCode, null);
  assert.equal(
    ((model.facts.systemDefaults as {
      defaultTemplateId?: string;
      templates?: Array<{ id?: string }>;
    }).templates ?? []).some((template) => template.id === 'MACD'),
    true,
  );
  assert.equal(actionById(model, 'create-profile')?.enabled, true);
  assert.equal(actionById(model, 'create-profile')?.reasonCode, null);
  assert.equal(actionById(model, 'edit-profile')?.enabled, true);
  assert.equal(actionById(model, 'edit-profile')?.reasonCode, null);
  assert.deepEqual(requestedInstrumentOptions, {
    limit: 3000,
  });
});

test('data management read model owns per-source status facts', async () => {
  const model = await buildWorkspaceReadModel(
    'data-management',
    createDeps({
      listLocalDataSources: async () =>
        [
          {
            id: 'source-rebind',
            status: 'READY',
            symbolCount: 2,
            barCount: 200,
            storageBytes: 2048,
            requiresSourceFolderRebind: true,
          },
          {
            id: 'source-failed',
            status: 'FAILED',
            symbolCount: 1,
            barCount: 0,
            storageBytes: 1024,
          },
        ] as never,
    }),
  );

  const data = model.facts.data as {
    sourceStatusById?: Record<string, { statusCode?: string; reasonCode?: string | null }>;
  };
  assert.equal(
    data.sourceStatusById?.['source-rebind']?.statusCode,
    'REBIND_REQUIRED',
  );
  assert.equal(
    data.sourceStatusById?.['source-rebind']?.reasonCode,
    'LOCAL_DATA_SOURCE_FOLDER_REBIND_REQUIRED',
  );
  assert.equal(data.sourceStatusById?.['source-failed']?.statusCode, 'FAILED');
});

test('custom indicator creation follows local storage capacity', async () => {
  const model = await buildWorkspaceReadModel(
    'custom-indicator',
    createDeps({
      listCustomIndicatorProfiles: async () =>
        [
          {
            id: 'profile-1',
            name: 'PROFILE_ONE',
            updatedAt: '2026-05-29T00:00:00.000Z',
          },
        ] as never,
      listLocalDataSources: async () =>
        [
          {
            id: 'source-1',
            status: 'READY',
            symbolCount: 2,
            barCount: 320,
            storageBytes: 2048,
          },
        ] as never,
    }),
  );

  assert.equal(actionById(model, 'create-profile')?.enabled, true);
  assert.equal(actionById(model, 'create-profile')?.reasonCode, null);
  assert.deepEqual(
    {
      readySourceCount: (model.facts.validationData as Record<string, unknown>).readySourceCount,
      sourceCount: (model.facts.validationData as Record<string, unknown>).sourceCount,
      symbolCount: (model.facts.validationData as Record<string, unknown>).symbolCount,
      barCount: (model.facts.validationData as Record<string, unknown>).barCount,
      sourceStatusById: (model.facts.validationData as Record<string, unknown>).sourceStatusById,
    },
    {
    readySourceCount: 1,
    sourceCount: 1,
    symbolCount: 2,
    barCount: 320,
    sourceStatusById: {
      'source-1': {
        sourceId: 'source-1',
        statusCode: 'READY',
        reasonCode: null,
        tone: 'ready',
        priority: 50,
        summaryFilter: 'ALL',
        primaryActionId: 'view-details',
        primaryActionEnabled: true,
        primaryActionReasonCode: null,
        sourceStatus: 'READY',
        sourceLocked: false,
        requiresSourceFolderRebind: false,
        symbolCount: 2,
        barCount: 320,
        storageBytes: 2048,
        lastJobStatus: null,
      },
    },
    },
  );
});
