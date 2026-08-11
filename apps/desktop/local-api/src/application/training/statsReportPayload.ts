// SPDX-License-Identifier: GPL-3.0-only

import {
  createComparison,
  normalizeIsoDate,
  resolvePreviousMonthKey,
  type SessionAnalytics,
  type TrainingStatsFilters,
} from '../../domain/training/statsDomain.js';
import {
  loadTrainingStatsSubsetAggregateRow,
  normalizeFactTimeframe,
  type TrainingStatsSubsetAggregateRow,
} from '../ports/infrastructure/db/training/statsRepository.js';

type ReportComparisonMetrics = {
  sessionCount: number;
  returnRate: number;
  winRate: number;
  profitLossRatio: number;
  maxDrawdownRate: number;
  avgHoldBars: number;
  tradeFrequency: number;
};

type TrainingStatsReportTotals = {
  totalSessions: number;
  totalTrainingDays: number;
  totalTrades: number;
  totalPnl: number;
  totalInitial: number;
  maxDrawdownRate: number;
  winSessions: number;
  lossSessions: number;
  flatSessions: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  longClosedTrades: number;
  longWinningTrades: number;
  profitTradeTotal: number;
  lossTradeTotal: number;
  holdBarsWeightedSum: number;
  takeProfitRateWeightedSum: number;
  stopLossRateWeightedSum: number;
  takeProfitCount: number;
  stopLossCount: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  addPositionCount: number;
  reducePositionCount: number;
  fullPositionCount: number;
  totalTradingCost: number;
  totalFeesFromFills: number;
  totalSlippage: number;
  totalDecisionSecondsUsed: number;
  totalDecisionCount: number;
};

type TrainingStatsBucket = {
  period: string;
  sessionCount: number;
  totalPnl: number;
  winRate: number;
  maxDrawdownRate: number;
  totalReturnRate: number;
};

type TrainingStatsPoolStat = {
  samplePoolId: string;
  samplePoolName: string;
  sessionCount: number;
  totalReturnRate: number;
  winRate: number;
  totalTrades: number;
  avgHoldBars: number;
};

type TrainingStatsSymbolStat = {
  symbol: string;
  sessionCount: number;
  bestReturn: number;
  worstReturn: number;
  avgReturn: number;
};

type TrainingStatsTimeframeStat = {
  timeframe: string;
  sessionCount: number;
  winRate: number;
  avgReturn: number;
  maxDrawdownRate: number;
  tradeFrequency: number;
};

const EMPTY_SUBSET_AGGREGATE_ROW: TrainingStatsSubsetAggregateRow = {
  session_count: 0,
  total_pnl: 0,
  total_initial: 0,
  win_count: 0,
  max_drawdown_rate: 0,
  total_trades: 0,
  hold_bars_sum: 0,
  hold_bars_count: 0,
  profit_trade_total: 0,
  loss_trade_total: 0,
  winning_trades: 0,
  losing_trades: 0,
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const mapSubsetAggregateRowToComparisonMetrics = (
  row: TrainingStatsSubsetAggregateRow,
): ReportComparisonMetrics => {
  const sessionCount = Math.max(0, Math.floor(normalizeNumber(row.session_count)));
  const totalInitial = Math.max(0, normalizeNumber(row.total_initial));
  const totalPnl = normalizeNumber(row.total_pnl);
  const winCount = Math.max(0, Math.floor(normalizeNumber(row.win_count)));
  const totalTrades = Math.max(0, Math.floor(normalizeNumber(row.total_trades)));
  const holdBarsCount = Math.max(0, Math.floor(normalizeNumber(row.hold_bars_count)));
  const winningTrades = Math.max(0, Math.floor(normalizeNumber(row.winning_trades)));
  const losingTrades = Math.max(0, Math.floor(normalizeNumber(row.losing_trades)));
  const avgProfitTrade =
    winningTrades > 0 ? normalizeNumber(row.profit_trade_total) / winningTrades : 0;
  const avgLossTradeAbs =
    losingTrades > 0 ? Math.abs(normalizeNumber(row.loss_trade_total) / losingTrades) : 0;
  return {
    sessionCount,
    returnRate: totalInitial > 0 ? totalPnl / totalInitial : 0,
    winRate: sessionCount > 0 ? winCount / sessionCount : 0,
    profitLossRatio: avgLossTradeAbs > 1e-9 ? avgProfitTrade / avgLossTradeAbs : 0,
    maxDrawdownRate: Math.max(0, normalizeNumber(row.max_drawdown_rate)),
    avgHoldBars:
      holdBarsCount > 0 ? normalizeNumber(row.hold_bars_sum) / holdBarsCount : 0,
    tradeFrequency: sessionCount > 0 ? totalTrades / sessionCount : 0,
  };
};

const createComparisonFromAggregateRows = (
  leftLabel: string,
  rightLabel: string,
  leftRow: TrainingStatsSubsetAggregateRow,
  rightRow: TrainingStatsSubsetAggregateRow,
) => {
  const left = mapSubsetAggregateRowToComparisonMetrics(leftRow);
  const right = mapSubsetAggregateRowToComparisonMetrics(rightRow);
  return {
    leftLabel,
    rightLabel,
    left,
    right,
    delta: {
      returnRate: left.returnRate - right.returnRate,
      winRate: left.winRate - right.winRate,
      profitLossRatio: left.profitLossRatio - right.profitLossRatio,
      maxDrawdownRate: left.maxDrawdownRate - right.maxDrawdownRate,
      avgHoldBars: left.avgHoldBars - right.avgHoldBars,
      tradeFrequency: left.tradeFrequency - right.tradeFrequency,
    },
  };
};

export const buildTrainingStatsReportPayload = (input: {
  filters: TrainingStatsFilters;
  filterOptionsSnapshot: {
    totalFacts: number;
    samplePools: Array<{ id: string; name: string; count: number }>;
    symbols: Array<{ symbol: string; count: number }>;
    timeframes: Array<{ timeframe: string; count: number }>;
    tags: Array<{ tag: string; count: number }>;
  };
  recentSessions: SessionAnalytics[];
  recent20: SessionAnalytics[];
  previous20: SessionAnalytics[];
  dailyBuckets: TrainingStatsBucket[];
  weeklyBuckets: TrainingStatsBucket[];
  monthlyPerformanceOutput: TrainingStatsBucket[];
  samplePoolStatsOutput: TrainingStatsPoolStat[];
  symbolStatsOutput: TrainingStatsSymbolStat[];
  timeframeStatsOutput: TrainingStatsTimeframeStat[];
  totals: TrainingStatsReportTotals;
}) => {
  const {
    filters,
    filterOptionsSnapshot,
    recentSessions,
    recent20,
    previous20,
    dailyBuckets,
    weeklyBuckets,
    monthlyPerformanceOutput,
    samplePoolStatsOutput,
    symbolStatsOutput,
    timeframeStatsOutput,
    totals,
  } = input;
  const monthlyWinRateOutput = monthlyPerformanceOutput.map((item) => ({
    period: item.period,
    sessionCount: item.sessionCount,
    winRate: item.winRate,
  }));
  const samplePoolWinRateOutput = samplePoolStatsOutput.map((item) => ({
    samplePoolId: item.samplePoolId,
    samplePoolName: item.samplePoolName,
    sessionCount: item.sessionCount,
    winRate: item.winRate,
  }));

  const latestMonth = monthlyPerformanceOutput.length
    ? monthlyPerformanceOutput[monthlyPerformanceOutput.length - 1].period
    : '';
  const previousMonth = latestMonth ? resolvePreviousMonthKey(latestMonth) : '';
  const currentMonthMetrics = latestMonth
    ? loadTrainingStatsSubsetAggregateRow(filters, {
        extraClauses: [`SUBSTR(created_at, 1, 7) = ?`],
        extraParams: [latestMonth],
      })
    : EMPTY_SUBSET_AGGREGATE_ROW;
  const previousMonthMetrics = previousMonth
    ? loadTrainingStatsSubsetAggregateRow(filters, {
        extraClauses: [`SUBSTR(created_at, 1, 7) = ?`],
        extraParams: [previousMonth],
      })
    : EMPTY_SUBSET_AGGREGATE_ROW;

  const sortedPoolsBySessions = [...samplePoolStatsOutput].sort(
    (left, right) => right.sessionCount - left.sessionCount,
  );
  const comparePoolA = (
    filters.comparePoolA ||
    sortedPoolsBySessions[0]?.samplePoolId ||
    ''
  ).trim();
  const comparePoolB = (
    filters.comparePoolB ||
    sortedPoolsBySessions[1]?.samplePoolId ||
    ''
  ).trim();
  const poolAMetrics = comparePoolA
    ? loadTrainingStatsSubsetAggregateRow(filters, {
        extraClauses: [`sample_pool_id = ?`],
        extraParams: [comparePoolA],
      })
    : EMPTY_SUBSET_AGGREGATE_ROW;
  const poolBMetrics = comparePoolB
    ? loadTrainingStatsSubsetAggregateRow(filters, {
        extraClauses: [`sample_pool_id = ?`],
        extraParams: [comparePoolB],
      })
    : EMPTY_SUBSET_AGGREGATE_ROW;
  const dayMetrics = loadTrainingStatsSubsetAggregateRow(filters, {
    extraClauses: [`base_timeframe IN (?,?,?,?)`],
    extraParams: ['1d', '1w', '1month', '1year'],
  });
  const minuteMetrics = loadTrainingStatsSubsetAggregateRow(filters, {
    extraClauses: [`base_timeframe IN (?,?,?)`],
    extraParams: ['1m', '5m', '1h'],
  });

  const totalReturnRate =
    totals.totalInitial > 0 ? totals.totalPnl / totals.totalInitial : 0;
  const sessionWinRate =
    totals.totalSessions > 0 ? totals.winSessions / totals.totalSessions : 0;
  const overallTradeWinRate =
    totals.closedTrades > 0 ? totals.winningTrades / totals.closedTrades : 0;
  const longTradeWinRate =
    totals.longClosedTrades > 0 ? totals.longWinningTrades / totals.longClosedTrades : 0;
  const avgProfitTrade =
    totals.winningTrades > 0 ? totals.profitTradeTotal / totals.winningTrades : 0;
  const avgLossTradeAbs =
    totals.losingTrades > 0 ? Math.abs(totals.lossTradeTotal / totals.losingTrades) : 0;
  const profitLossRatio =
    avgLossTradeAbs > 1e-9 ? avgProfitTrade / avgLossTradeAbs : 0;
  const expectancy =
    totals.closedTrades > 0
      ? (totals.winningTrades / totals.closedTrades) * avgProfitTrade -
        (totals.losingTrades / totals.closedTrades) * avgLossTradeAbs
      : 0;
  const avgTradePnl =
    totals.closedTrades > 0
      ? (totals.profitTradeTotal + totals.lossTradeTotal) / totals.closedTrades
      : 0;
  const avgHoldBars =
    totals.closedTrades > 0 ? totals.holdBarsWeightedSum / totals.closedTrades : 0;
  const avgTakeProfitRate =
    totals.takeProfitCount > 0
      ? totals.takeProfitRateWeightedSum / totals.takeProfitCount
      : 0;
  const avgStopLossRate =
    totals.stopLossCount > 0 ? totals.stopLossRateWeightedSum / totals.stopLossCount : 0;
  const avgTradesPerDay =
    totals.totalTrainingDays > 0 ? totals.totalTrades / totals.totalTrainingDays : 0;
  const avgTradesPerSession =
    totals.totalSessions > 0 ? totals.totalTrades / totals.totalSessions : 0;
  const averageDecisionSeconds =
    totals.totalDecisionCount > 0
      ? totals.totalDecisionSecondsUsed / totals.totalDecisionCount
      : 0;
  const totalFees =
    totals.totalTradingCost > 0 ? totals.totalTradingCost : totals.totalFeesFromFills;
  const avgFeePerSession = totals.totalSessions > 0 ? totalFees / totals.totalSessions : 0;
  const feeToProfitRatio =
    totals.totalPnl !== 0 ? totalFees / Math.max(Math.abs(totals.totalPnl), 1e-9) : 0;

  return {
    generatedAt: new Date().toISOString(),
    filtersApplied: {
      from: normalizeIsoDate(filters.from ?? '', false),
      to: normalizeIsoDate(filters.to ?? '', true),
      samplePoolId: (filters.samplePoolId || '').trim() || '__all__',
      symbol: (filters.symbol || '').trim().toUpperCase() || '__all__',
      timeframe: normalizeFactTimeframe((filters.timeframe || '').trim() || '__all__'),
      tag: (filters.tag || '').trim().toLowerCase(),
      profitability: filters.profitability ?? 'ALL',
      comparePoolA,
      comparePoolB,
    },
    totals: {
      totalProjects: filterOptionsSnapshot.totalFacts,
      filteredProjects: totals.totalSessions,
    },
    filterOptions: {
      samplePools: filterOptionsSnapshot.samplePools,
      symbols: filterOptionsSnapshot.symbols,
      timeframes: filterOptionsSnapshot.timeframes,
      tags: filterOptionsSnapshot.tags,
    },
    overview: {
      totalSessions: totals.totalSessions,
      totalTrainingDays: totals.totalTrainingDays,
      totalTrades: totals.totalTrades,
      totalPnl: totals.totalPnl,
      totalReturnRate,
      maxDrawdownRate: totals.maxDrawdownRate,
      winRate: sessionWinRate,
      profitLossRatio,
      averageTradePnl: avgTradePnl,
      averageHoldBars: avgHoldBars,
      averageDecisionSeconds,
    },
    winRateBreakdown: {
      overallWinRate: overallTradeWinRate,
      longWinRate: longTradeWinRate,
      sessionWinRate,
      monthlyWinRate: monthlyWinRateOutput,
      samplePoolWinRate: samplePoolWinRateOutput,
    },
    pnlStructure: {
      avgProfitTrade,
      avgLossTrade: totals.losingTrades > 0 ? totals.lossTradeTotal / totals.losingTrades : 0,
      profitLossRatio,
      expectancy,
    },
    behavior: {
      avgTradesPerDay,
      avgTradesPerSession,
      maxConsecutiveWins: totals.maxConsecutiveWins,
      maxConsecutiveLosses: totals.maxConsecutiveLosses,
      averageHoldBars: avgHoldBars,
      averageTakeProfitRate: avgTakeProfitRate,
      averageStopLossRate: avgStopLossRate,
      addPositionCount: totals.addPositionCount,
      reducePositionCount: totals.reducePositionCount,
      fullPositionCount: totals.fullPositionCount,
    },
    cost: {
      totalFees,
      avgFeePerSession,
      feeToProfitRatio,
      slippageImpact: totals.totalSlippage,
    },
    winLossStructure: {
      wins: totals.winSessions,
      losses: totals.lossSessions,
      flat: totals.flatSessions,
    },
    dailyPerformance: dailyBuckets,
    weeklyPerformance: weeklyBuckets,
    monthlyPerformance: monthlyPerformanceOutput,
    samplePoolStats: samplePoolStatsOutput,
    symbolStats: symbolStatsOutput,
    timeframeStats: timeframeStatsOutput,
    comparisons: {
      recent20VsPrevious20: createComparison(
        'recent20',
        'previous20',
        recent20,
        previous20,
      ),
      monthVsPreviousMonth: createComparisonFromAggregateRows(
        'currentMonth',
        'previousMonth',
        currentMonthMetrics,
        previousMonthMetrics,
      ),
      poolAVsPoolB: createComparisonFromAggregateRows(
        'poolA',
        'poolB',
        poolAMetrics,
        poolBMetrics,
      ),
      dayVsMinute: createComparisonFromAggregateRows(
        'dayK',
        'minute',
        dayMetrics,
        minuteMetrics,
      ),
    },
    recentSessions: recentSessions.slice(0, 120).map((session) => ({
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
      symbol: session.symbol,
      samplePoolId: session.samplePoolId,
      samplePoolName: session.samplePoolName,
      baseTimeframe: session.baseTimeframe,
      totalPnl: session.totalPnl,
      profitRate: session.profitRate,
      totalTrades: session.totalTrades,
      durationDays: session.durationDays,
    })),
  };
};
