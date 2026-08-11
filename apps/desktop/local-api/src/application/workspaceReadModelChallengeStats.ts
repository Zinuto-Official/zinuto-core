// SPDX-License-Identifier: GPL-3.0-only

import { SPECIAL_TRAINING_MODE_IDS } from '@zinuto/shared/specialTrainingModes';
import type { DesktopWorkspaceReadModel } from '@zinuto/shared/contracts-desktop/api';
import type {
  ChallengeStatsDashboardInsights,
  ChallengeStatsDashboardSessionRow,
  ChallengeStatsDashboardWindowPreset,
  ChallengeStatsReport,
} from '../domain/specialTraining/statsContracts.js';
import type { SpecialTrainingModeId } from '../domain/specialTraining/contracts.js';
import {
  createAction,
  createModel,
  createSection,
  toCount,
  type WorkspaceReadModelDependencies,
} from './workspaceReadModelPrimitives.js';

const CHALLENGE_STATS_DASHBOARD_LIMIT = 200;
const CHALLENGE_STATS_MINIMUM_SAMPLE_COUNT = 3;
const CHALLENGE_STATS_WINDOW_PRESETS = [
  'RECENT_10',
  'RECENT_50',
  'ALL',
] as const satisfies readonly ChallengeStatsDashboardWindowPreset[];

type ChallengeStatsMetricReadiness = {
  enabled: boolean;
  statusCode: string;
  reasonCode: string | null;
  sampleCount: number;
  minimumSampleCount: number;
  priority: number;
};

type ChallengeStatsMetricReadinessByWindow = Record<
  ChallengeStatsDashboardWindowPreset,
  ChallengeStatsMetricReadiness
>;

const defaultSpecialTrainingModeId = (): SpecialTrainingModeId =>
  SPECIAL_TRAINING_MODE_IDS[0];

const buildMetricReadiness = (
  sampleCountRaw: number,
  hasHistory: boolean,
): ChallengeStatsMetricReadiness => {
  const sampleCount = toCount(sampleCountRaw);
  if (!hasHistory) {
    return {
      enabled: false,
      statusCode: 'EMPTY',
      reasonCode: 'NO_CHALLENGE_HISTORY',
      sampleCount,
      minimumSampleCount: CHALLENGE_STATS_MINIMUM_SAMPLE_COUNT,
      priority: 60,
    };
  }
  if (sampleCount >= CHALLENGE_STATS_MINIMUM_SAMPLE_COUNT) {
    return {
      enabled: true,
      statusCode: 'READY',
      reasonCode: null,
      sampleCount,
      minimumSampleCount: CHALLENGE_STATS_MINIMUM_SAMPLE_COUNT,
      priority: 20,
    };
  }
  return {
    enabled: false,
    statusCode: 'INSUFFICIENT_SAMPLE',
    reasonCode: 'CHALLENGE_STATS_MINIMUM_SAMPLE_NOT_MET',
    sampleCount,
    minimumSampleCount: CHALLENGE_STATS_MINIMUM_SAMPLE_COUNT,
    priority: 50,
  };
};

const buildReadinessByWindow = (
  samplesByWindow: Record<ChallengeStatsDashboardWindowPreset, { sampleCount: number }>,
  hasHistory: boolean,
): ChallengeStatsMetricReadinessByWindow =>
  CHALLENGE_STATS_WINDOW_PRESETS.reduce((result, preset) => {
    result[preset] = buildMetricReadiness(
      samplesByWindow[preset]?.sampleCount ?? 0,
      hasHistory,
    );
    return result;
  }, {} as ChallengeStatsMetricReadinessByWindow);

const selectedDashboardFamily = (
  modeId: SpecialTrainingModeId,
): 'fast' | 'risk' =>
  modeId === 'risk-discipline-training' ? 'risk' : 'fast';

const countAvailableModeProjects = (
  report: Pick<ChallengeStatsReport, 'modeAvailability'>,
): number =>
  Object.values(report.modeAvailability ?? {}).reduce(
    (sum, item) => sum + toCount(item?.projectCount),
    0,
  );

const buildDashboardFacts = (
  report: ChallengeStatsReport,
  sessionRows: ChallengeStatsDashboardSessionRow[],
) => {
  const totalProjects = toCount(report.totals.totalProjects);
  const filteredProjects = toCount(report.totals.filteredProjects);
  const modeProjectCount = countAvailableModeProjects(report);
  const hasHistory = modeProjectCount > 0;
  const hasFilteredRows = filteredProjects > 0;
  const activeFamily = selectedDashboardFamily(report.modeId);
  const metricReadiness = {
    fast: buildReadinessByWindow(report.dashboardInsights.fast, hasHistory),
    risk: buildReadinessByWindow(report.dashboardInsights.risk, hasHistory),
  };
  const activeWindowReadiness = metricReadiness[activeFamily].RECENT_10;

  return {
    activeFamily,
    rowCount: sessionRows.length,
    minimumSampleCount: CHALLENGE_STATS_MINIMUM_SAMPLE_COUNT,
    windows: CHALLENGE_STATS_WINDOW_PRESETS,
    metricReadiness,
    activeMetricReadiness: activeWindowReadiness,
    emptyState: {
      isEmpty: !hasHistory,
      statusCode: hasHistory ? 'READY' : 'EMPTY',
      reasonCode: hasHistory ? null : 'NO_CHALLENGE_HISTORY',
      totalProjects,
      filteredProjects,
      modeProjectCount,
    },
    exportAvailability: {
      enabled: hasFilteredRows,
      reasonCode: hasFilteredRows ? null : 'NO_CHALLENGE_HISTORY',
    },
    clearHistoryAvailability: {
      enabled: hasHistory,
      reasonCode: hasHistory ? null : 'NO_CHALLENGE_HISTORY',
    },
  };
};

export const buildChallengeStatsModel = async (
  deps: WorkspaceReadModelDependencies,
): Promise<DesktopWorkspaceReadModel> => {
  const { report } = await deps.getSpecialTrainingStatsReport({
    modeId: defaultSpecialTrainingModeId(),
    profitability: 'ALL',
    limit: CHALLENGE_STATS_DASHBOARD_LIMIT,
    includeProjectDetails: false,
  });
  const sessionRows = report.dashboardRows;
  const dashboardFacts = buildDashboardFacts(report, sessionRows);
  const statusCode = dashboardFacts.emptyState.isEmpty ? 'EMPTY' : 'READY';
  const reasonCode = dashboardFacts.emptyState.reasonCode;
  const tone = dashboardFacts.emptyState.isEmpty ? 'neutral' : 'ready';
  const priority = dashboardFacts.emptyState.isEmpty ? 60 : 20;

  return createModel({
    deps,
    workspaceId: 'challenge-stats',
    statusCode,
    reasonCode,
    tone,
    priority,
    facts: {
      summary: {
        generatedAt: report.generatedAt,
        modeId: report.modeId,
        defaultModeId: report.defaultModeId,
        filtersApplied: report.filtersApplied,
        totals: report.totals,
        overview: report.overview,
        modeAvailability: report.modeAvailability,
        dashboardInsights: report.dashboardInsights,
        recentSessions: report.recentSessions,
      },
      sessionRows,
      metricReadiness: dashboardFacts.metricReadiness,
      emptyState: dashboardFacts.emptyState,
      exportAvailability: dashboardFacts.exportAvailability,
      clearHistoryAvailability: dashboardFacts.clearHistoryAvailability,
      dashboard: {
        ...dashboardFacts,
        insights: report.dashboardInsights as ChallengeStatsDashboardInsights,
        sessionRows,
      },
    },
    actions: [
      createAction({
        id: 'open-special-training',
        enabled: true,
        priority: 20,
      }),
      createAction({
        id: 'export-stats',
        enabled: dashboardFacts.exportAvailability.enabled,
        reasonCode: dashboardFacts.exportAvailability.reasonCode,
        priority: 50,
      }),
      createAction({
        id: 'clear-history',
        enabled: dashboardFacts.clearHistoryAvailability.enabled,
        reasonCode: dashboardFacts.clearHistoryAvailability.reasonCode,
        priority: 80,
      }),
    ],
    sections: [
      createSection({
        id: 'stats',
        statusCode,
        reasonCode,
        tone,
        priority,
        facts: {
          totals: report.totals,
          overview: report.overview,
          modeAvailability: report.modeAvailability,
        },
      }),
      createSection({
        id: 'session-rows',
        statusCode: sessionRows.length > 0 ? 'READY' : 'EMPTY',
        reasonCode: sessionRows.length > 0 ? null : 'NO_CHALLENGE_HISTORY',
        tone: sessionRows.length > 0 ? 'ready' : 'neutral',
        priority: sessionRows.length > 0 ? 20 : 60,
        facts: {
          rowCount: sessionRows.length,
          rows: sessionRows,
        },
      }),
      createSection({
        id: 'metric-readiness',
        statusCode: dashboardFacts.activeMetricReadiness.statusCode,
        reasonCode: dashboardFacts.activeMetricReadiness.reasonCode,
        tone: dashboardFacts.activeMetricReadiness.enabled ? 'ready' : 'warning',
        priority: dashboardFacts.activeMetricReadiness.priority,
        facts: {
          activeFamily: dashboardFacts.activeFamily,
          activeWindow: 'RECENT_10',
          activeMetricReadiness: dashboardFacts.activeMetricReadiness,
          metricReadiness: dashboardFacts.metricReadiness,
        },
      }),
    ],
  });
};
