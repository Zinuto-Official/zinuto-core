// SPDX-License-Identifier: GPL-3.0-only

import { buildHumanOperatorSummary } from '../../domain/operatorSummary.js';
import { resolveUnifiedReturnRate } from '@zinuto/shared/domain-calculations/training-return-rate';
import {
  createComparison,
  monthKeyFromIso,
  normalizeIsoDate,
  normalizeNumber,
  weekKeyFromIso,
  type SessionAnalytics,
  type TrainingStatsFilters,
} from '../../domain/training/statsDomain.js';
import {
  loadMonthlyAggregateRows,
  loadPoolAggregateRows,
  loadSymbolAggregateRows,
  loadTimeframeAggregateRows,
  loadTrainingReportFactRows,
  loadTrainingStatsCounts,
  loadTrainingStatsDayAggregateRows,
  loadTrainingStatsFilterOptionsSnapshot,
  loadTrainingStatsOverviewAggregateRow,
  loadTrainingStatsPoolAggregateRowsForFilters,
  loadTrainingStatsSymbolAggregateRowsForFilters,
  loadTrainingStatsTimeframeAggregateRowsForFilters,
  normalizeFactTimeframe,
  rebuildTrainingStatsAggregatesTables,
  type TrainingStatsDayAggregateRow,
  type TrainingStatsReportFactRow,
} from '../ports/infrastructure/db/training/statsRepository.js';
import {
  buildTrainingStatsReportCacheKey,
  getCachedTrainingStatsReport,
  getTrainingStatsDerivedVersion,
  isTrainingStatsAggregatesDirty,
  setCachedTrainingStatsReport,
  setTrainingStatsAggregatesDirty,
} from './statsState.js';
import { buildTrainingStatsReportPayload } from './statsReportPayload.js';

export type TrainingStatsSummaryPayload = {
  generatedAt: string;
  version: number;
  totals: {
    totalProjects: number;
    filteredProjects: number;
  };
  overview: {
    totalSessions: number;
    totalTrainingDays: number;
    totalTrades: number;
    totalPnl: number;
    totalReturnRate: number;
    maxDrawdownRate: number;
    winRate: number;
    averageDecisionSeconds: number;
  };
  comparisons: {
    recent20VsPrevious20: ReturnType<typeof createComparison>;
  };
  latestSession: SessionAnalytics | null;
};

const mapPeriodAggregateRowsToBuckets = (rows: TrainingStatsDayAggregateRow[]) =>
  rows.map((row) => ({
    period: row.period,
    sessionCount: Math.max(0, Math.floor(normalizeNumber(row.session_count))),
    totalPnl: normalizeNumber(row.total_pnl),
    winRate:
      normalizeNumber(row.session_count) > 0
        ? normalizeNumber(row.win_count) / normalizeNumber(row.session_count)
        : 0,
    maxDrawdownRate: Math.max(0, normalizeNumber(row.max_drawdown_rate)),
    totalReturnRate:
      normalizeNumber(row.total_initial) > 0
        ? normalizeNumber(row.total_pnl) / normalizeNumber(row.total_initial)
        : 0,
  }));

const aggregateDerivedBucketsByPeriod = (
  rows: TrainingStatsDayAggregateRow[],
  keyGetter: (iso: string) => string,
) => {
  const map = new Map<
    string,
    {
      period: string;
      sessionCount: number;
      winCount: number;
      totalPnl: number;
      totalInitial: number;
      maxDrawdownRate: number;
    }
  >();
  for (const row of rows) {
    const key = keyGetter(row.period);
    if (!key) {
      continue;
    }
    const sessionCount = Math.max(0, Math.floor(normalizeNumber(row.session_count)));
    const winCount = Math.max(0, Math.floor(normalizeNumber(row.win_count)));
    const current = map.get(key) ?? {
      period: key,
      sessionCount: 0,
      winCount: 0,
      totalPnl: 0,
      totalInitial: 0,
      maxDrawdownRate: 0,
    };
    current.sessionCount += sessionCount;
    current.winCount += winCount;
    current.totalPnl += normalizeNumber(row.total_pnl);
    current.totalInitial += Math.max(0, normalizeNumber(row.total_initial));
    current.maxDrawdownRate = Math.max(
      current.maxDrawdownRate,
      Math.max(0, normalizeNumber(row.max_drawdown_rate)),
    );
    map.set(key, current);
  }
  return Array.from(map.values())
    .sort((left, right) => left.period.localeCompare(right.period))
    .map((row) => ({
      period: row.period,
      sessionCount: row.sessionCount,
      totalPnl: row.totalPnl,
      winRate: row.sessionCount > 0 ? row.winCount / row.sessionCount : 0,
      maxDrawdownRate: row.maxDrawdownRate,
      totalReturnRate: row.totalInitial > 0 ? row.totalPnl / row.totalInitial : 0,
    }));
};

const mapTrainingStatsFactRowToSession = (row: TrainingStatsReportFactRow): SessionAnalytics => {
  const initialTotal = Math.max(0, normalizeNumber(row.initial_total));
  const totalPnl = normalizeNumber(row.total_pnl);
  const unifiedReturnRate = resolveUnifiedReturnRate(
    initialTotal,
    totalPnl,
    Number.NaN,
    Number.NaN,
    normalizeNumber(row.profit_rate),
  );

  return {
    id: row.project_id,
    name: row.name,
    createdAt: row.created_at,
    symbol: (row.symbol || '').trim().toUpperCase(),
    samplePoolId: row.sample_pool_id,
    samplePoolName: row.sample_pool_name,
    baseTimeframe: normalizeFactTimeframe(row.base_timeframe),
    trainingDateRange: row.training_date_range,
    initialTotal,
    totalPnl,
    profitRate: unifiedReturnRate,
    durationDays: Math.max(0, Math.floor(normalizeNumber(row.duration_days))),
    totalTrades: Math.max(0, Math.floor(normalizeNumber(row.total_trades))),
    finalEquity: normalizeNumber(row.final_equity),
    maxDrawdownRate: Math.max(0, Math.abs(normalizeNumber(row.max_drawdown_rate))),
    tradingCost: Math.max(0, normalizeNumber(row.trading_cost)),
    decisionSecondsUsed: Math.max(0, normalizeNumber(row.decision_seconds_used)),
    decisionCount: Math.max(0, Math.floor(normalizeNumber(row.decision_count))),
    tags: [],
    operatorSummary: {
      ...buildHumanOperatorSummary(),
      decisionCount: Math.max(0, Math.floor(normalizeNumber(row.decision_count))),
      decisionSecondsUsed: Math.max(0, normalizeNumber(row.decision_seconds_used)),
    },
    trade: {
      closedTrades: Math.max(0, Math.floor(normalizeNumber(row.closed_trades))),
      winningTrades: Math.max(0, Math.floor(normalizeNumber(row.winning_trades))),
      losingTrades: Math.max(0, Math.floor(normalizeNumber(row.losing_trades))),
      profitTradeTotal: normalizeNumber(row.profit_trade_total),
      lossTradeTotal: normalizeNumber(row.loss_trade_total),
      totalTradePnl: normalizeNumber(row.profit_trade_total) + normalizeNumber(row.loss_trade_total),
      averageHoldBars: Math.max(0, normalizeNumber(row.average_hold_bars)),
      averageTakeProfitRate: Math.max(0, normalizeNumber(row.average_take_profit_rate)),
      averageStopLossRate: Math.max(0, normalizeNumber(row.average_stop_loss_rate)),
      addPositionCount: Math.max(0, Math.floor(normalizeNumber(row.add_position_count))),
      reducePositionCount: Math.max(0, Math.floor(normalizeNumber(row.reduce_position_count))),
      fullPositionCount: Math.max(0, Math.floor(normalizeNumber(row.full_position_count))),
      maxConsecutiveWins: Math.max(0, Math.floor(normalizeNumber(row.max_consecutive_wins))),
      maxConsecutiveLosses: Math.max(0, Math.floor(normalizeNumber(row.max_consecutive_losses))),
      totalSlippage: Math.max(0, normalizeNumber(row.total_slippage)),
      totalFeesFromFills: Math.max(0, normalizeNumber(row.total_fees_from_fills)),
      records: [],
    },
  };
};

const isDefaultAggregateScope = (filters: TrainingStatsFilters): boolean => {
  const profitability = filters.profitability ?? 'ALL';
  return (
    !normalizeIsoDate(filters.from ?? '', false) &&
    !normalizeIsoDate(filters.to ?? '', true) &&
    (!filters.samplePoolId || filters.samplePoolId === '__all__') &&
    (!filters.symbol || filters.symbol === '__all__') &&
    (!filters.timeframe || filters.timeframe === '__all__') &&
    !(filters.tag || '').trim() &&
    profitability === 'ALL'
  );
};

const rebuildTrainingStatsAggregatesInternal = (): {
  monthly: number;
  pools: number;
  symbols: number;
  timeframes: number;
} => rebuildTrainingStatsAggregatesTables(new Date().toISOString());

export const getTrainingStatsSummary = (
  filters: TrainingStatsFilters = {},
): TrainingStatsSummaryPayload => {
  const cacheKey = `summary:${buildTrainingStatsReportCacheKey(filters)}`;
  const cachedSummary = getCachedTrainingStatsReport(cacheKey);
  if (cachedSummary) {
    return cachedSummary as TrainingStatsSummaryPayload;
  }

  const overviewRow = loadTrainingStatsOverviewAggregateRow(filters);
  const recentRows = loadTrainingReportFactRows(filters, 40);
  const recentSessions = recentRows.map(mapTrainingStatsFactRowToSession);
  const recent20 = recentSessions.slice(0, 20);
  const previous20 = recentSessions.slice(20, 40);
  const counts = loadTrainingStatsCounts();
  const totalSessions = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.total_sessions)),
  );
  const totalInitial = Math.max(0, normalizeNumber(overviewRow.total_initial));
  const totalPnl = normalizeNumber(overviewRow.total_pnl);
  const winSessions = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.win_sessions)),
  );
  const totalDecisionCount = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.total_decision_count)),
  );
  const summary: TrainingStatsSummaryPayload = {
    generatedAt: new Date().toISOString(),
    version: getTrainingStatsDerivedVersion(),
    totals: {
      totalProjects: Math.max(0, Math.floor(Number(counts.totalFacts) || 0)),
      filteredProjects: totalSessions,
    },
    overview: {
      totalSessions,
      totalTrainingDays: Math.max(
        0,
        Math.floor(normalizeNumber(overviewRow.total_training_days)),
      ),
      totalTrades: Math.max(
        0,
        Math.floor(normalizeNumber(overviewRow.total_trades)),
      ),
      totalPnl,
      totalReturnRate: totalInitial > 0 ? totalPnl / totalInitial : 0,
      maxDrawdownRate: Math.max(
        0,
        normalizeNumber(overviewRow.max_drawdown_rate),
      ),
      winRate: totalSessions > 0 ? winSessions / totalSessions : 0,
      averageDecisionSeconds:
        totalDecisionCount > 0
          ? normalizeNumber(overviewRow.total_decision_seconds_used) /
            totalDecisionCount
          : 0,
    },
    comparisons: {
      recent20VsPrevious20: createComparison(
        'recent20',
        'previous20',
        recent20,
        previous20,
      ),
    },
    latestSession: recentSessions[0] ?? null,
  };

  setCachedTrainingStatsReport(cacheKey, summary);
  return summary;
};

export const getTrainingStatsReport = (filters: TrainingStatsFilters = {}) => {
  const cacheKey = buildTrainingStatsReportCacheKey(filters);
  const cachedReport = getCachedTrainingStatsReport(cacheKey);
  if (cachedReport) {
    return cachedReport as Record<string, unknown>;
  }
  const useAggregateTables = isDefaultAggregateScope(filters);
  if (useAggregateTables && isTrainingStatsAggregatesDirty()) {
    rebuildTrainingStatsAggregatesInternal();
    setTrainingStatsAggregatesDirty(false);
  }
  const filterOptionsSnapshot = loadTrainingStatsFilterOptionsSnapshot();
  let monthlyAggregateRows = useAggregateTables ? loadMonthlyAggregateRows() : [];
  let poolAggregateRows = useAggregateTables ? loadPoolAggregateRows() : [];
  let symbolAggregateRows = useAggregateTables ? loadSymbolAggregateRows() : [];
  let timeframeAggregateRows = useAggregateTables ? loadTimeframeAggregateRows() : [];
  if (useAggregateTables) {
    const aggregateSessionCount = monthlyAggregateRows.reduce(
      (sum, row) => sum + Math.max(0, Math.floor(normalizeNumber(row.session_count))),
      0,
    );
    if (aggregateSessionCount !== filterOptionsSnapshot.totalFacts) {
      rebuildTrainingStatsAggregatesInternal();
      setTrainingStatsAggregatesDirty(false);
      monthlyAggregateRows = loadMonthlyAggregateRows();
      poolAggregateRows = loadPoolAggregateRows();
      symbolAggregateRows = loadSymbolAggregateRows();
      timeframeAggregateRows = loadTimeframeAggregateRows();
    }
  }

  if (useAggregateTables) {
    const overviewRow = loadTrainingStatsOverviewAggregateRow(filters);
    const recentRows = loadTrainingReportFactRows(filters, 120);
    const recentSessions = recentRows.map(mapTrainingStatsFactRowToSession);
    const recent20 = recentSessions.slice(0, 20);
    const previous20 = recentSessions.slice(20, 40);
    const dailyAggregateRows = loadTrainingStatsDayAggregateRows(filters);
    const dailyBuckets = mapPeriodAggregateRowsToBuckets(dailyAggregateRows);
    const weeklyBuckets = aggregateDerivedBucketsByPeriod(
      dailyAggregateRows,
      weekKeyFromIso,
    );

    const totalSessions = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.total_sessions)),
    );
    const totalTrainingDays = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.total_training_days)),
    );
    const totalTrades = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.total_trades)),
    );
    const totalPnl = normalizeNumber(overviewRow.total_pnl);
    const totalInitial = Math.max(0, normalizeNumber(overviewRow.total_initial));
    const maxDrawdownRate = Math.max(
      0,
      normalizeNumber(overviewRow.max_drawdown_rate),
    );
    const winSessions = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.win_sessions)),
    );
    const lossSessions = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.loss_sessions)),
    );
    const flatSessions = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.flat_sessions)),
    );
    const closedTrades = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.closed_trades)),
    );
    const winningTrades = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.winning_trades)),
    );
    const losingTrades = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.losing_trades)),
    );
    const longClosedTrades = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.long_closed_trades)),
    );
    const longWinningTrades = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.long_winning_trades)),
    );
    const profitTradeTotal = normalizeNumber(overviewRow.profit_trade_total);
    const lossTradeTotal = normalizeNumber(overviewRow.loss_trade_total);
    const holdBarsWeightedSum = normalizeNumber(
      overviewRow.hold_bars_weighted_sum,
    );
    const takeProfitRateWeightedSum = normalizeNumber(
      overviewRow.take_profit_rate_weighted_sum,
    );
    const stopLossRateWeightedSum = normalizeNumber(
      overviewRow.stop_loss_rate_weighted_sum,
    );
    const takeProfitCount = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.take_profit_count)),
    );
    const stopLossCount = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.stop_loss_count)),
    );
    const maxConsecutiveWins = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.max_consecutive_wins)),
    );
    const maxConsecutiveLosses = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.max_consecutive_losses)),
    );
    const addPositionCount = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.add_position_count)),
    );
    const reducePositionCount = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.reduce_position_count)),
    );
    const fullPositionCount = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.full_position_count)),
    );
    const totalTradingCost = Math.max(
      0,
      normalizeNumber(overviewRow.total_trading_cost),
    );
    const totalFeesFromFills = Math.max(
      0,
      normalizeNumber(overviewRow.total_fees_from_fills),
    );
    const totalSlippage = Math.max(
      0,
      normalizeNumber(overviewRow.total_slippage),
    );
    const totalDecisionSecondsUsed = Math.max(
      0,
      normalizeNumber(overviewRow.total_decision_seconds_used),
    );
    const totalDecisionCount = Math.max(
      0,
      Math.floor(normalizeNumber(overviewRow.total_decision_count)),
    );

    const aggregateMonthlyPerformance = monthlyAggregateRows.map((row) => ({
      period: row.period,
      sessionCount: Math.max(0, Math.floor(normalizeNumber(row.session_count))),
      totalPnl: normalizeNumber(row.total_pnl),
      winRate:
        normalizeNumber(row.session_count) > 0
          ? normalizeNumber(row.win_count) / normalizeNumber(row.session_count)
          : 0,
      maxDrawdownRate: Math.max(0, normalizeNumber(row.max_drawdown_rate)),
      totalReturnRate:
        normalizeNumber(row.total_initial) > 0
          ? normalizeNumber(row.total_pnl) / normalizeNumber(row.total_initial)
          : 0,
    }));

    const aggregateSamplePoolStats = poolAggregateRows.map((row) => ({
      samplePoolId: row.sample_pool_id,
      samplePoolName: row.sample_pool_name,
      sessionCount: Math.max(0, Math.floor(normalizeNumber(row.session_count))),
      totalReturnRate:
        normalizeNumber(row.total_initial) > 0
          ? normalizeNumber(row.total_pnl) / normalizeNumber(row.total_initial)
          : 0,
      winRate:
        normalizeNumber(row.session_count) > 0
          ? normalizeNumber(row.win_count) / normalizeNumber(row.session_count)
          : 0,
      totalTrades: Math.max(0, Math.floor(normalizeNumber(row.total_trades))),
      avgHoldBars:
        normalizeNumber(row.hold_bars_count) > 0
          ? normalizeNumber(row.hold_bars_sum) /
            normalizeNumber(row.hold_bars_count)
          : 0,
    }));

    const aggregateSymbolStats = symbolAggregateRows.map((row) => ({
      symbol: row.symbol,
      sessionCount: Math.max(0, Math.floor(normalizeNumber(row.session_count))),
      bestReturn: normalizeNumber(row.best_return),
      worstReturn: normalizeNumber(row.worst_return),
      avgReturn:
        normalizeNumber(row.session_count) > 0
          ? normalizeNumber(row.return_rate_sum) /
            normalizeNumber(row.session_count)
          : 0,
    }));

    const aggregateTimeframeStats = timeframeAggregateRows.map((row) => ({
      timeframe: row.timeframe,
      sessionCount: Math.max(0, Math.floor(normalizeNumber(row.session_count))),
      winRate:
        normalizeNumber(row.session_count) > 0
          ? normalizeNumber(row.win_count) / normalizeNumber(row.session_count)
          : 0,
      avgReturn:
        normalizeNumber(row.session_count) > 0
          ? normalizeNumber(row.return_rate_sum) /
            normalizeNumber(row.session_count)
          : 0,
      maxDrawdownRate: Math.max(0, normalizeNumber(row.max_drawdown_rate)),
      tradeFrequency:
        normalizeNumber(row.session_count) > 0
          ? normalizeNumber(row.total_trades) /
            normalizeNumber(row.session_count)
          : 0,
    }));

    const report = buildTrainingStatsReportPayload({
      filters,
      filterOptionsSnapshot,
      recentSessions,
      recent20,
      previous20,
      dailyBuckets,
      weeklyBuckets,
      monthlyPerformanceOutput: aggregateMonthlyPerformance,
      samplePoolStatsOutput: aggregateSamplePoolStats,
      symbolStatsOutput: aggregateSymbolStats,
      timeframeStatsOutput: aggregateTimeframeStats,
      totals: {
        totalSessions,
        totalTrainingDays,
        totalTrades,
        totalPnl,
        totalInitial,
        maxDrawdownRate,
        winSessions,
        lossSessions,
        flatSessions,
        closedTrades,
        winningTrades,
        losingTrades,
        longClosedTrades,
        longWinningTrades,
        profitTradeTotal,
        lossTradeTotal,
        holdBarsWeightedSum,
        takeProfitRateWeightedSum,
        stopLossRateWeightedSum,
        takeProfitCount,
        stopLossCount,
        maxConsecutiveWins,
        maxConsecutiveLosses,
        addPositionCount,
        reducePositionCount,
        fullPositionCount,
        totalTradingCost,
        totalFeesFromFills,
        totalSlippage,
        totalDecisionSecondsUsed,
        totalDecisionCount,
      },
    });
    setCachedTrainingStatsReport(cacheKey, report);
    return report;
  }

  const overviewRow = loadTrainingStatsOverviewAggregateRow(filters);
  const recentRows = loadTrainingReportFactRows(filters, 120);
  const recentSessions = recentRows.map(mapTrainingStatsFactRowToSession);
  const recent20 = recentSessions.slice(0, 20);
  const previous20 = recentSessions.slice(20, 40);
  const dailyAggregateRows = loadTrainingStatsDayAggregateRows(filters);
  const dailyBuckets = mapPeriodAggregateRowsToBuckets(dailyAggregateRows);
  const weeklyBuckets = aggregateDerivedBucketsByPeriod(
    dailyAggregateRows,
    weekKeyFromIso,
  );
  const monthlyPerformanceOutput = aggregateDerivedBucketsByPeriod(
    dailyAggregateRows,
    monthKeyFromIso,
  );

  const totalSessions = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.total_sessions)),
  );
  const totalTrainingDays = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.total_training_days)),
  );
  const totalTrades = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.total_trades)),
  );
  const totalPnl = normalizeNumber(overviewRow.total_pnl);
  const totalInitial = Math.max(0, normalizeNumber(overviewRow.total_initial));
  const maxDrawdownRate = Math.max(
    0,
    normalizeNumber(overviewRow.max_drawdown_rate),
  );
  const winSessions = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.win_sessions)),
  );
  const lossSessions = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.loss_sessions)),
  );
  const flatSessions = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.flat_sessions)),
  );
  const closedTrades = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.closed_trades)),
  );
  const winningTrades = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.winning_trades)),
  );
  const losingTrades = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.losing_trades)),
  );
  const longClosedTrades = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.long_closed_trades)),
  );
  const longWinningTrades = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.long_winning_trades)),
  );
  const profitTradeTotal = normalizeNumber(overviewRow.profit_trade_total);
  const lossTradeTotal = normalizeNumber(overviewRow.loss_trade_total);
  const holdBarsWeightedSum = normalizeNumber(
    overviewRow.hold_bars_weighted_sum,
  );
  const takeProfitRateWeightedSum = normalizeNumber(
    overviewRow.take_profit_rate_weighted_sum,
  );
  const stopLossRateWeightedSum = normalizeNumber(
    overviewRow.stop_loss_rate_weighted_sum,
  );
  const takeProfitCount = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.take_profit_count)),
  );
  const stopLossCount = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.stop_loss_count)),
  );
  const maxConsecutiveWins = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.max_consecutive_wins)),
  );
  const maxConsecutiveLosses = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.max_consecutive_losses)),
  );
  const addPositionCount = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.add_position_count)),
  );
  const reducePositionCount = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.reduce_position_count)),
  );
  const fullPositionCount = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.full_position_count)),
  );
  const totalTradingCost = Math.max(
    0,
    normalizeNumber(overviewRow.total_trading_cost),
  );
  const totalFeesFromFills = Math.max(
    0,
    normalizeNumber(overviewRow.total_fees_from_fills),
  );
  const totalSlippage = Math.max(
    0,
    normalizeNumber(overviewRow.total_slippage),
  );
  const totalDecisionSecondsUsed = Math.max(
    0,
    normalizeNumber(overviewRow.total_decision_seconds_used),
  );
  const totalDecisionCount = Math.max(
    0,
    Math.floor(normalizeNumber(overviewRow.total_decision_count)),
  );

  const aggregateSamplePoolStats = loadTrainingStatsPoolAggregateRowsForFilters(filters).map((row) => ({
    samplePoolId: row.sample_pool_id,
    samplePoolName: row.sample_pool_name,
    sessionCount: Math.max(0, Math.floor(normalizeNumber(row.session_count))),
    totalReturnRate:
      normalizeNumber(row.total_initial) > 0
        ? normalizeNumber(row.total_pnl) / normalizeNumber(row.total_initial)
        : 0,
    winRate:
      normalizeNumber(row.session_count) > 0
        ? normalizeNumber(row.win_count) / normalizeNumber(row.session_count)
        : 0,
    totalTrades: Math.max(0, Math.floor(normalizeNumber(row.total_trades))),
    avgHoldBars:
      normalizeNumber(row.hold_bars_count) > 0
        ? normalizeNumber(row.hold_bars_sum) / normalizeNumber(row.hold_bars_count)
        : 0,
  }));
  const aggregateSymbolStats = loadTrainingStatsSymbolAggregateRowsForFilters(filters).map((row) => ({
    symbol: row.symbol,
    sessionCount: Math.max(0, Math.floor(normalizeNumber(row.session_count))),
    bestReturn: normalizeNumber(row.best_return),
    worstReturn: normalizeNumber(row.worst_return),
    avgReturn:
      normalizeNumber(row.session_count) > 0
        ? normalizeNumber(row.return_rate_sum) / normalizeNumber(row.session_count)
        : 0,
  }));
  const aggregateTimeframeStats = loadTrainingStatsTimeframeAggregateRowsForFilters(filters).map((row) => ({
    timeframe: row.timeframe,
    sessionCount: Math.max(0, Math.floor(normalizeNumber(row.session_count))),
    winRate:
      normalizeNumber(row.session_count) > 0
        ? normalizeNumber(row.win_count) / normalizeNumber(row.session_count)
        : 0,
    avgReturn:
      normalizeNumber(row.session_count) > 0
        ? normalizeNumber(row.return_rate_sum) / normalizeNumber(row.session_count)
        : 0,
    maxDrawdownRate: Math.max(0, normalizeNumber(row.max_drawdown_rate)),
    tradeFrequency:
      normalizeNumber(row.session_count) > 0
        ? normalizeNumber(row.total_trades) / normalizeNumber(row.session_count)
        : 0,
  }));

  const report = buildTrainingStatsReportPayload({
    filters,
    filterOptionsSnapshot,
    recentSessions,
    recent20,
    previous20,
    dailyBuckets,
    weeklyBuckets,
    monthlyPerformanceOutput,
    samplePoolStatsOutput: aggregateSamplePoolStats,
    symbolStatsOutput: aggregateSymbolStats,
    timeframeStatsOutput: aggregateTimeframeStats,
    totals: {
      totalSessions,
      totalTrainingDays,
      totalTrades,
      totalPnl,
      totalInitial,
      maxDrawdownRate,
      winSessions,
      lossSessions,
      flatSessions,
      closedTrades,
      winningTrades,
      losingTrades,
      longClosedTrades,
      longWinningTrades,
      profitTradeTotal,
      lossTradeTotal,
      holdBarsWeightedSum,
      takeProfitRateWeightedSum,
      stopLossRateWeightedSum,
      takeProfitCount,
      stopLossCount,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      addPositionCount,
      reducePositionCount,
      fullPositionCount,
      totalTradingCost,
      totalFeesFromFills,
      totalSlippage,
      totalDecisionSecondsUsed,
      totalDecisionCount,
    },
  });
  setCachedTrainingStatsReport(cacheKey, report);
  return report;
};
