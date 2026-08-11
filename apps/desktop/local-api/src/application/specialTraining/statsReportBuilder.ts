// SPDX-License-Identifier: GPL-3.0-only

import { normalizeIsoDate } from '../../domain/training/statsDomain.js';
import { resolveSpecialTrainingStatsTag } from '@zinuto/shared/specialTrainingModes';
import { buildChallengeStatsDashboardInsights } from './statsDashboardBuilder.js';
import { buildChallengeStatsDashboardRows } from './statsDashboardRowsBuilder.js';
import type {
  ChallengeStatsProjectDetail,
  ChallengeStatsReport,
  SpecialTrainingStatsFilters,
  SpecialTrainingStatsModeAvailability,
  SpecialTrainingStatsReportPayload,
} from '../../domain/specialTraining/statsContracts.js';
import type { SpecialTrainingStatsProjectionRow } from '../ports/infrastructure/db/specialTraining/statsProjectionStore.js';
import { buildChallengeStatsRecentSession } from './statsProjectionRuntime.js';

const toText = (value: unknown): string => String(value ?? '').trim();

const buildEmptyComparisonMetrics = () => ({
  sessionCount: 0,
  returnRate: 0,
  winRate: 0,
  profitLossRatio: 0,
  maxDrawdownRate: 0,
  avgHoldBars: 0,
  tradeFrequency: 0,
});

export const buildSpecialTrainingStatsReportPayload = ({
  filters,
  projectionRows,
  totalModeProjects,
  totalFilteredProjects,
  defaultModeId,
  modeAvailability,
  projectDetailsById,
}: {
  filters: SpecialTrainingStatsFilters;
  projectionRows: SpecialTrainingStatsProjectionRow[];
  totalModeProjects: number;
  totalFilteredProjects: number;
  defaultModeId: SpecialTrainingStatsFilters['modeId'];
  modeAvailability: SpecialTrainingStatsModeAvailability;
  projectDetailsById: Record<string, ChallengeStatsProjectDetail>;
}): SpecialTrainingStatsReportPayload => {
  const fromIso = normalizeIsoDate(filters.from ?? '', false);
  const toIso = normalizeIsoDate(filters.to ?? '', true);
  const symbolFilter = toText(filters.symbol).toUpperCase();
  const timeframeFilter = toText(filters.timeframe).toLowerCase() || '__all__';
  const profitability = filters.profitability ?? 'ALL';

  const currentTag = resolveSpecialTrainingStatsTag(filters.modeId);
  const totalPnl = projectionRows.reduce(
    (sum, row) => sum + (Number(row.total_pnl) || 0),
    0,
  );
  const totalInitial = projectionRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.initial_total) || 0),
    0,
  );
  const maxDrawdownRate = projectionRows.reduce(
    (max, row) => Math.max(max, Number(row.max_drawdown_rate) || 0),
    0,
  );
  const averageDecisionSeconds =
    projectionRows.length > 0
      ? projectionRows.reduce(
          (sum, row) => sum + (Number(row.decision_seconds_used) || 0),
          0,
        ) / projectionRows.length
      : 0;
  const passedCount = projectionRows.filter(
    (row) => Number(row.passed) === 1,
  ).length;
  const settledDayKeys = new Set(
    projectionRows
      .map((row) =>
        toText(row.settled_at || row.finished_at || row.created_at).slice(0, 10),
      )
      .filter((value) => value.length > 0),
  );
  const symbolCountById = new Map<string, number>();
  const timeframeCountById = new Map<string, number>();
  projectionRows.forEach((row) => {
    symbolCountById.set(row.symbol, (symbolCountById.get(row.symbol) ?? 0) + 1);
    timeframeCountById.set(
      row.base_timeframe,
      (timeframeCountById.get(row.base_timeframe) ?? 0) + 1,
    );
  });

  const dashboardInsights = buildChallengeStatsDashboardInsights(projectionRows);
  const dashboardRows = buildChallengeStatsDashboardRows(projectionRows);
  const report: ChallengeStatsReport = {
    generatedAt: new Date().toISOString(),
    modeId: filters.modeId,
    filtersApplied: {
      from: fromIso,
      to: toIso,
      samplePoolId: '__all__',
      symbol: symbolFilter || '__all__',
      timeframe: timeframeFilter,
      tag: currentTag,
      profitability,
      comparePoolA: '',
      comparePoolB: '',
    },
    totals: {
      totalProjects: totalModeProjects,
      filteredProjects: totalFilteredProjects,
    },
    filterOptions: {
      samplePools: [],
      symbols: Array.from(symbolCountById.entries()).map(([symbol, count]) => ({
        symbol,
        count,
      })),
      timeframes: Array.from(timeframeCountById.entries()).map(
        ([timeframe, count]) => ({
          timeframe,
          count,
        }),
      ),
      tags: [{ tag: currentTag, count: totalFilteredProjects }],
    },
    overview: {
      totalSessions: totalFilteredProjects,
      totalTrainingDays: settledDayKeys.size,
      totalTrades: projectionRows.reduce(
        (sum, row) => sum + Math.max(0, Math.floor(Number(row.total_trades) || 0)),
        0,
      ),
      totalPnl,
      totalReturnRate: totalInitial > 0 ? totalPnl / totalInitial : 0,
      maxDrawdownRate,
      winRate:
        totalFilteredProjects > 0 ? passedCount / totalFilteredProjects : 0,
      profitLossRatio: 0,
      averageTradePnl:
        totalFilteredProjects > 0 ? totalPnl / totalFilteredProjects : 0,
      averageHoldBars: 0,
      averageDecisionSeconds,
    },
    winRateBreakdown: {
      overallWinRate:
        totalFilteredProjects > 0 ? passedCount / totalFilteredProjects : 0,
      longWinRate: 0,
      shortWinRate: 0,
      samplePoolWinRates: [],
      symbolWinRates: [],
    },
    monthlyPerformance: [],
    samplePoolPerformance: [],
    symbolPerformance: [],
    timeframePerformance: [],
    tagPerformance: [],
    dashboardInsights,
    dashboardRows,
    defaultModeId,
    modeAvailability,
    costAnalysis: {
      totalFees: 0,
      feeRate: 0,
    },
    strategyComparison: {
      poolA: buildEmptyComparisonMetrics(),
      poolB: buildEmptyComparisonMetrics(),
    },
    recentSessions: projectionRows.map(buildChallengeStatsRecentSession),
  };

  return {
    projectDetailsById,
    report,
  };
};
