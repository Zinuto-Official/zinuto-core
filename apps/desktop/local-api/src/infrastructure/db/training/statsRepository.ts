// SPDX-License-Identifier: GPL-3.0-only

import type BetterSqlite3 from 'better-sqlite3';
import { db } from '../database.js';
import {
  normalizeIsoDate,
  parseTagsJson,
  normalizeTimeframe,
  type SessionAnalytics,
  type TrainingProjectRow,
  type TrainingStatsFilters,
  type TrainingStatsMonthlyAggregateRow,
  type TrainingStatsPoolAggregateRow,
  type TrainingStatsSymbolAggregateRow,
  type TrainingStatsTimeframeAggregateRow
} from '../../../domain/training/statsDomain.js';
import type { TrainingReviewProjectionMetrics } from '../../../domain/training/reviewProjection.js';
import {
  TRAINING_STATS_FACT_COLUMNS,
  TRAINING_STATS_FACT_COLUMN_LIST,
  TRAINING_STATS_FACT_UPSERT_ASSIGNMENTS,
  TRAINING_STATS_REPORT_FACT_COLUMNS,
  type TrainingStatsReportFactRow,
} from '../../../domain/training/statsFactColumns.js';

export type { TrainingStatsReportFactRow } from '../../../domain/training/statsFactColumns.js';

type ReplayPayloadRow = {
  base_timeframe: string | null;
};

export type TrainingProjectReplayFillRow = {
  side: 'BUY' | 'SELL';
  fill_index: number;
  fill_time: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
};

let upsertTrainingStatsFactStmt: BetterSqlite3.Statement<unknown[]> | null = null;

export type TrainingStatsFilterOptionsSnapshot = {
  totalFacts: number;
  samplePools: Array<{ id: string; name: string; count: number }>;
  symbols: Array<{ symbol: string; count: number }>;
  timeframes: Array<{ timeframe: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
};

export type TrainingStatsOverviewAggregateRow = {
  total_sessions: number;
  total_training_days: number;
  total_trades: number;
  total_pnl: number;
  total_initial: number;
  max_drawdown_rate: number;
  win_sessions: number;
  loss_sessions: number;
  flat_sessions: number;
  closed_trades: number;
  winning_trades: number;
  losing_trades: number;
  long_closed_trades: number;
  long_winning_trades: number;
  profit_trade_total: number;
  loss_trade_total: number;
  hold_bars_weighted_sum: number;
  take_profit_rate_weighted_sum: number;
  stop_loss_rate_weighted_sum: number;
  take_profit_count: number;
  stop_loss_count: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  add_position_count: number;
  reduce_position_count: number;
  full_position_count: number;
  total_trading_cost: number;
  total_fees_from_fills: number;
  total_slippage: number;
  total_decision_seconds_used: number;
  total_decision_count: number;
};

export type TrainingStatsSubsetAggregateRow = {
  session_count: number;
  total_pnl: number;
  total_initial: number;
  win_count: number;
  max_drawdown_rate: number;
  total_trades: number;
  hold_bars_sum: number;
  hold_bars_count: number;
  profit_trade_total: number;
  loss_trade_total: number;
  winning_trades: number;
  losing_trades: number;
};

export type TrainingStatsDayAggregateRow = {
  period: string;
  session_count: number;
  win_count: number;
  total_pnl: number;
  total_initial: number;
  max_drawdown_rate: number;
};

type TrainingStatsTaggedProjectCountRow = {
  count?: unknown;
};

let trainingStatsFilterOptionsSnapshotCache: TrainingStatsFilterOptionsSnapshot | null = null;

export const invalidateTrainingStatsFilterOptionsSnapshotCache = (): void => {
  trainingStatsFilterOptionsSnapshotCache = null;
};

const replaceTrainingStatsTags = (projectId: string, tagsJson: string): void => {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) {
    return;
  }
  const tags = parseTagsJson(tagsJson);
  db.prepare('DELETE FROM training_stats_tags WHERE project_id = ?').run(normalizedProjectId);
  if (!tags.length) {
    return;
  }
  const insert = db.prepare(
    `INSERT INTO training_stats_tags (project_id, tag)
     VALUES (?, ?)
     ON CONFLICT(project_id, tag) DO NOTHING`,
  );
  tags.forEach((tag) => {
    insert.run(normalizedProjectId, tag);
  });
};

const rebuildTrainingStatsTagsTable = (): void => {
  const rows = db
    .prepare(
      `SELECT project_id, tags_json
         FROM training_stats_sessions`,
    )
    .all() as Array<{ project_id?: unknown; tags_json?: unknown }>;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM training_stats_tags').run();
    rows.forEach((row) => {
      replaceTrainingStatsTags(
        String(row.project_id ?? '').trim(),
        String(row.tags_json ?? '[]'),
      );
    });
  });
  tx();
};

const ensureTrainingStatsTagsTableBackfilled = (): void => {
  const taggedSessionsRow = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM training_stats_sessions
        WHERE tags_json IS NOT NULL
          AND TRIM(tags_json) <> ''
          AND TRIM(tags_json) <> '[]'`,
    )
    .get() as TrainingStatsTaggedProjectCountRow | undefined;
  const taggedProjectsCount = Math.max(
    0,
    Math.floor(Number(taggedSessionsRow?.count ?? 0) || 0),
  );
  if (taggedProjectsCount === 0) {
    return;
  }
  const tagRowsProjectCount = db
    .prepare(
      `SELECT COUNT(DISTINCT project_id) AS count
         FROM training_stats_tags`,
    )
    .get() as TrainingStatsTaggedProjectCountRow | undefined;
  const existingTaggedProjectsCount = Math.max(
    0,
    Math.floor(Number(tagRowsProjectCount?.count ?? 0) || 0),
  );
  if (existingTaggedProjectsCount >= taggedProjectsCount) {
    return;
  }
  rebuildTrainingStatsTagsTable();
};

let loadTrainingStatsTotalFactsStmt: BetterSqlite3.Statement | null = null;
const getLoadTrainingStatsTotalFactsStmt = () => {
  if (!loadTrainingStatsTotalFactsStmt) {
    loadTrainingStatsTotalFactsStmt = db
      .prepare(`SELECT COUNT(*) AS count FROM training_stats_sessions`);
  }
  return loadTrainingStatsTotalFactsStmt;
};

let loadTrainingStatsSamplePoolOptionsStmt: BetterSqlite3.Statement | null = null;
const getLoadTrainingStatsSamplePoolOptionsStmt = () => {
  if (!loadTrainingStatsSamplePoolOptionsStmt) {
    loadTrainingStatsSamplePoolOptionsStmt = db.prepare(
      `SELECT TRIM(sample_pool_id) AS id,
              MAX(sample_pool_name) AS name,
              COUNT(*) AS count
         FROM training_stats_sessions
        WHERE TRIM(sample_pool_id) <> ''
        GROUP BY TRIM(sample_pool_id)
        ORDER BY count DESC, name ASC`,
    );
  }
  return loadTrainingStatsSamplePoolOptionsStmt;
};

let loadTrainingStatsSymbolOptionsStmt: BetterSqlite3.Statement | null = null;
const getLoadTrainingStatsSymbolOptionsStmt = () => {
  if (!loadTrainingStatsSymbolOptionsStmt) {
    loadTrainingStatsSymbolOptionsStmt = db.prepare(
      `SELECT UPPER(TRIM(symbol)) AS symbol,
              COUNT(*) AS count
         FROM training_stats_sessions
        WHERE TRIM(symbol) <> ''
        GROUP BY UPPER(TRIM(symbol))
        ORDER BY count DESC, symbol ASC`,
    );
  }
  return loadTrainingStatsSymbolOptionsStmt;
};

let loadTrainingStatsTimeframeOptionsStmt: BetterSqlite3.Statement | null = null;
const getLoadTrainingStatsTimeframeOptionsStmt = () => {
  if (!loadTrainingStatsTimeframeOptionsStmt) {
    loadTrainingStatsTimeframeOptionsStmt = db.prepare(
      `SELECT COALESCE(NULLIF(LOWER(TRIM(base_timeframe)), ''), 'unknown') AS timeframe,
              COUNT(*) AS count
         FROM training_stats_sessions
        GROUP BY COALESCE(NULLIF(LOWER(TRIM(base_timeframe)), ''), 'unknown')
        ORDER BY count DESC, timeframe ASC`,
    );
  }
  return loadTrainingStatsTimeframeOptionsStmt;
};

let loadTrainingStatsTagOptionsStmt: BetterSqlite3.Statement | null = null;
const getLoadTrainingStatsTagOptionsStmt = () => {
  if (!loadTrainingStatsTagOptionsStmt) {
    loadTrainingStatsTagOptionsStmt = db.prepare(
      `SELECT tag,
              COUNT(*) AS count
         FROM training_stats_tags
        WHERE TRIM(tag) <> ''
        GROUP BY tag
        ORDER BY count DESC, tag ASC`,
    );
  }
  return loadTrainingStatsTagOptionsStmt;
};

export const loadTrainingStatsFilterOptionsSnapshot =
  (): TrainingStatsFilterOptionsSnapshot => {
    if (trainingStatsFilterOptionsSnapshotCache) {
      return trainingStatsFilterOptionsSnapshotCache;
    }
    const totalFactsRaw = getLoadTrainingStatsTotalFactsStmt().get() as
      | { count?: unknown }
      | undefined;
    const totalFacts = Math.max(
      0,
      Math.floor(Number(totalFactsRaw?.count ?? 0) || 0),
    );

    const samplePools = getLoadTrainingStatsSamplePoolOptionsStmt()
      .all() as Array<{ id: string; name: string; count: number }>;
    const symbols = getLoadTrainingStatsSymbolOptionsStmt()
      .all() as Array<{ symbol: string; count: number }>;
    const timeframes = getLoadTrainingStatsTimeframeOptionsStmt()
      .all() as Array<{ timeframe: string; count: number }>;

    ensureTrainingStatsTagsTableBackfilled();
    const tags = getLoadTrainingStatsTagOptionsStmt()
      .all() as Array<{ tag: string; count: number }>;

    const snapshot = {
      totalFacts,
      samplePools: samplePools.map((row) => ({
        id: String(row.id ?? '').trim(),
        name: String(row.name ?? '').trim(),
        count: Math.max(0, Math.floor(Number(row.count) || 0)),
      })),
      symbols: symbols.map((row) => ({
        symbol: String(row.symbol ?? '').trim().toUpperCase(),
        count: Math.max(0, Math.floor(Number(row.count) || 0)),
      })),
      timeframes: timeframes.map((row) => ({
        timeframe: normalizeTimeframe(String(row.timeframe ?? '')),
        count: Math.max(0, Math.floor(Number(row.count) || 0)),
      })),
      tags: tags.map((row) => ({
        tag: String(row.tag ?? '').trim().toLowerCase(),
        count: Math.max(0, Math.floor(Number(row.count) || 0)),
      })),
    };
    trainingStatsFilterOptionsSnapshotCache = snapshot;
    return snapshot;
  };

const buildTrainingStatsFactsWhereClause = (
  filters: TrainingStatsFilters,
  options: {
    tableAlias?: string;
    extraClauses?: string[];
    extraParams?: unknown[];
  } = {},
): { whereSql: string; params: unknown[] } => {
  const prefix = options.tableAlias ? `${options.tableAlias}.` : '';
  const where: string[] = [];
  const params: unknown[] = [];
  const fromIso = normalizeIsoDate(filters.from ?? '', false);
  const toIso = normalizeIsoDate(filters.to ?? '', true);

  if (fromIso) {
    where.push(`${prefix}created_at >= ?`);
    params.push(fromIso);
  }
  if (toIso) {
    where.push(`${prefix}created_at <= ?`);
    params.push(toIso);
  }
  if (filters.samplePoolId && filters.samplePoolId.trim() && filters.samplePoolId !== '__all__') {
    where.push(`${prefix}sample_pool_id = ?`);
    params.push(filters.samplePoolId.trim());
  }
  if (filters.symbol && filters.symbol.trim() && filters.symbol !== '__all__') {
    where.push(`${prefix}symbol = ?`);
    params.push(filters.symbol.trim().toUpperCase());
  }
  if (filters.timeframe && filters.timeframe.trim() && filters.timeframe !== '__all__') {
    where.push(`${prefix}base_timeframe = ?`);
    params.push(filters.timeframe.trim().toLowerCase());
  }
  if (filters.profitability === 'PROFIT') {
    where.push(`${prefix}total_pnl > 0`);
  } else if (filters.profitability === 'LOSS') {
    where.push(`${prefix}total_pnl < 0`);
  }
  if (filters.tag && filters.tag.trim()) {
    where.push(`EXISTS (
      SELECT 1
      FROM training_stats_tags tags
      WHERE tags.project_id = ${prefix}project_id
        AND tags.tag = ?
    )`);
    params.push(filters.tag.trim().toLowerCase());
  }
  if (options.extraClauses?.length) {
    where.push(...options.extraClauses);
    params.push(...(options.extraParams ?? []));
  }
  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
};

const getUpsertTrainingStatsFactStatement = () => {
  if (!upsertTrainingStatsFactStmt) {
    const placeholders = TRAINING_STATS_FACT_COLUMN_LIST.map(() => '?').join(',');
    upsertTrainingStatsFactStmt = db.prepare(
      `INSERT INTO training_stats_sessions (
     ${TRAINING_STATS_FACT_COLUMNS}
   ) VALUES (${placeholders})
   ON CONFLICT(project_id) DO UPDATE SET
     ${TRAINING_STATS_FACT_UPSERT_ASSIGNMENTS}`
    );
  }
  return upsertTrainingStatsFactStmt;
};

export const loadReplayPayloadRow = (projectId: string): ReplayPayloadRow | null => {
  const row = db
    .prepare(
      `SELECT base_timeframe
         FROM training_project_replay_refs
        WHERE project_id = ?
        LIMIT 1`
    )
    .get(projectId) as ReplayPayloadRow | undefined;
  return row ?? null;
};

export const listTrainingProjectReplayFills = (
  projectId: string,
): TrainingProjectReplayFillRow[] =>
  db
    .prepare(
      `SELECT side,
              fill_index,
              fill_time,
              fill_price,
              fill_qty,
              contract_multiplier,
              fee,
              tax,
              slippage
         FROM training_project_replay_fills
        WHERE project_id = ?
        ORDER BY fill_index ASC, row_seq ASC`,
    )
    .all(projectId) as TrainingProjectReplayFillRow[];

export const upsertTrainingStatsFact = (
  session: SessionAnalytics,
  normalizedBaseTimeframe: string,
  tagsJson: string,
  generatedAt: string,
  reviewMetrics?: TrainingReviewProjectionMetrics | null,
): void => {
  const normalizedReviewMetrics = reviewMetrics ?? null;
  db.transaction(() => {
    getUpsertTrainingStatsFactStatement().run(
      session.id,
      session.name,
      session.createdAt,
      session.symbol,
      session.samplePoolId,
      session.samplePoolName,
      normalizedBaseTimeframe,
      session.trainingDateRange,
      session.initialTotal,
      session.totalPnl,
      session.profitRate,
      session.durationDays,
      session.totalTrades,
      session.finalEquity,
      session.maxDrawdownRate,
      session.tradingCost,
      session.decisionSecondsUsed,
      session.decisionCount,
      tagsJson,
      session.trade.closedTrades,
      session.trade.winningTrades,
      session.trade.losingTrades,
      normalizedReviewMetrics?.longClosedTrades ?? 0,
      normalizedReviewMetrics?.longWinningTrades ?? 0,
      session.trade.profitTradeTotal,
      session.trade.lossTradeTotal,
      session.trade.averageHoldBars,
      session.trade.averageTakeProfitRate,
      session.trade.averageStopLossRate,
      session.trade.addPositionCount,
      session.trade.reducePositionCount,
      session.trade.fullPositionCount,
      session.trade.maxConsecutiveWins,
      session.trade.maxConsecutiveLosses,
      session.trade.totalSlippage,
      session.trade.totalFeesFromFills,
      normalizedReviewMetrics?.marketPresetId ?? '',
      normalizedReviewMetrics?.assetClass ?? 'STOCK',
      normalizedReviewMetrics?.tradeSettlementMode ?? 'T0',
      normalizedReviewMetrics?.allowLongMarginTrading ? 1 : 0,
      normalizedReviewMetrics?.allowShortSelling ? 1 : 0,
      normalizedReviewMetrics?.leverageMultiple ?? 1,
      normalizedReviewMetrics?.usesMakerTaker ? 1 : 0,
      normalizedReviewMetrics?.fundingRate ?? 0,
      normalizedReviewMetrics?.grossPnl ?? 0,
      normalizedReviewMetrics?.feeAndTaxCost ?? 0,
      normalizedReviewMetrics?.borrowCost ?? 0,
      normalizedReviewMetrics?.decisionAverageSeconds ?? 0,
      normalizedReviewMetrics?.tradeWinRate ?? 0,
      normalizedReviewMetrics?.sessionProfitFactor ?? null,
      normalizedReviewMetrics?.expectancyPerTrade ?? 0,
      0,
      normalizedReviewMetrics?.peakMaintenanceUtilizationRate ?? 0,
      normalizedReviewMetrics?.marginMinBufferRate ?? 1,
      normalizedReviewMetrics?.trendAligned ? 1 : 0,
      normalizedReviewMetrics?.criticalFailure ? 1 : 0,
      normalizedReviewMetrics?.lossCutDelayBarsTotal ?? 0,
      normalizedReviewMetrics?.lossCutDelayBarsCount ?? 0,
      generatedAt
    );
    replaceTrainingStatsTags(session.id, tagsJson);
  })();
  invalidateTrainingStatsFilterOptionsSnapshotCache();
};

type RebuildTrainingStatsAggregatesOptions = {
  /**
   * Retention invokes the rebuild from its per-batch transaction so removing
   * expired projects and refreshing their aggregates cannot commit separately.
   */
  withinTransaction?: boolean;
};

const rebuildTrainingStatsAggregatesTablesCore = (updatedAt: string): {
  monthly: number;
  pools: number;
  symbols: number;
  timeframes: number;
} => {
  db.prepare('DELETE FROM training_stats_monthly').run();
  db.prepare('DELETE FROM training_stats_pool').run();
  db.prepare('DELETE FROM training_stats_symbol').run();
  db.prepare('DELETE FROM training_stats_timeframe').run();

  const monthlyInserted = db
    .prepare(
      `INSERT INTO training_stats_monthly (
          period, session_count, win_count, total_pnl, total_initial, max_drawdown_rate, updated_at
        )
        SELECT
          SUBSTR(created_at, 1, 7) AS period,
          COUNT(*) AS session_count,
          SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END) AS win_count,
          SUM(total_pnl) AS total_pnl,
          SUM(CASE WHEN initial_total > 0 THEN initial_total ELSE 0 END) AS total_initial,
          MAX(CASE WHEN max_drawdown_rate > 0 THEN max_drawdown_rate ELSE 0 END) AS max_drawdown_rate,
          ? AS updated_at
        FROM training_stats_sessions
        WHERE created_at IS NOT NULL AND TRIM(created_at) <> ''
        GROUP BY SUBSTR(created_at, 1, 7)
        ORDER BY period ASC`,
    )
    .run(updatedAt).changes;

  const poolInserted = db
    .prepare(
      `INSERT INTO training_stats_pool (
          sample_pool_id, sample_pool_name, session_count, win_count, total_pnl, total_initial, total_trades,
          hold_bars_sum, hold_bars_count, updated_at
        )
        SELECT
          sample_pool_id,
          MAX(sample_pool_name) AS sample_pool_name,
          COUNT(*) AS session_count,
          SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END) AS win_count,
          SUM(total_pnl) AS total_pnl,
          SUM(CASE WHEN initial_total > 0 THEN initial_total ELSE 0 END) AS total_initial,
          SUM(CASE WHEN total_trades > 0 THEN total_trades ELSE 0 END) AS total_trades,
          SUM(average_hold_bars * closed_trades) AS hold_bars_sum,
          SUM(closed_trades) AS hold_bars_count,
          ? AS updated_at
        FROM training_stats_sessions
        GROUP BY sample_pool_id`,
    )
    .run(updatedAt).changes;

  const symbolInserted = db
    .prepare(
      `INSERT INTO training_stats_symbol (
          symbol, session_count, best_return, worst_return, return_rate_sum, updated_at
        )
        SELECT
          symbol,
          COUNT(*) AS session_count,
          MAX(profit_rate) AS best_return,
          MIN(profit_rate) AS worst_return,
          SUM(profit_rate) AS return_rate_sum,
          ? AS updated_at
        FROM training_stats_sessions
        WHERE symbol IS NOT NULL AND TRIM(symbol) <> ''
        GROUP BY symbol`,
    )
    .run(updatedAt).changes;

  const timeframeInserted = db
    .prepare(
      `INSERT INTO training_stats_timeframe (
          timeframe, session_count, win_count, return_rate_sum, max_drawdown_rate, total_trades, updated_at
        )
        SELECT
          base_timeframe AS timeframe,
          COUNT(*) AS session_count,
          SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END) AS win_count,
          SUM(profit_rate) AS return_rate_sum,
          MAX(CASE WHEN max_drawdown_rate > 0 THEN max_drawdown_rate ELSE 0 END) AS max_drawdown_rate,
          SUM(CASE WHEN total_trades > 0 THEN total_trades ELSE 0 END) AS total_trades,
          ? AS updated_at
        FROM training_stats_sessions
        WHERE base_timeframe IS NOT NULL AND TRIM(base_timeframe) <> ''
        GROUP BY base_timeframe`,
    )
    .run(updatedAt).changes;

  return {
    monthly: monthlyInserted,
    pools: poolInserted,
    symbols: symbolInserted,
    timeframes: timeframeInserted,
  };
};

export const rebuildTrainingStatsAggregatesTables = (
  updatedAt: string,
  options: RebuildTrainingStatsAggregatesOptions = {},
): {
  monthly: number;
  pools: number;
  symbols: number;
  timeframes: number;
} => {
  const result = options.withinTransaction
    ? rebuildTrainingStatsAggregatesTablesCore(updatedAt)
    : db.transaction(() => rebuildTrainingStatsAggregatesTablesCore(updatedAt))();
  // Retention cleanup rebuilds aggregates outside the normal upsert path; the
  // cached filter-options snapshot (sample pools, symbols, timeframes, tags)
  // must be invalidated so consumers never serve pre-cleanup counts.
  invalidateTrainingStatsFilterOptionsSnapshotCache();
  return result;
};

export const loadMonthlyAggregateRows = (): TrainingStatsMonthlyAggregateRow[] =>
  db
    .prepare(
      `SELECT period, session_count, win_count, total_pnl, total_initial, max_drawdown_rate
       FROM training_stats_monthly
       ORDER BY period ASC`
    )
    .all() as TrainingStatsMonthlyAggregateRow[];

export const loadPoolAggregateRows = (): TrainingStatsPoolAggregateRow[] =>
  db
    .prepare(
      `SELECT sample_pool_id, sample_pool_name, session_count, win_count, total_pnl, total_initial, total_trades, hold_bars_sum, hold_bars_count
       FROM training_stats_pool
       ORDER BY total_pnl DESC, session_count DESC, sample_pool_name ASC`
    )
    .all() as TrainingStatsPoolAggregateRow[];

export const loadSymbolAggregateRows = (): TrainingStatsSymbolAggregateRow[] =>
  db
    .prepare(
      `SELECT symbol, session_count, best_return, worst_return, return_rate_sum
       FROM training_stats_symbol
       ORDER BY session_count DESC, return_rate_sum DESC, symbol ASC`
    )
    .all() as TrainingStatsSymbolAggregateRow[];

export const loadTimeframeAggregateRows = (): TrainingStatsTimeframeAggregateRow[] =>
  db
    .prepare(
      `SELECT timeframe, session_count, win_count, return_rate_sum, max_drawdown_rate, total_trades
       FROM training_stats_timeframe
       ORDER BY session_count DESC, timeframe ASC`
    )
    .all() as TrainingStatsTimeframeAggregateRow[];

export const loadTrainingProjectById = (projectId: string): TrainingProjectRow | null => {
  const normalizedId = String(projectId || '').trim();
  if (!normalizedId) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,training_date_range,
              initial_total,total_pnl,profit_rate,duration_days,total_trades,final_equity,equity_return_rate,summary_json,operator_summary_json
       FROM training_projects
       WHERE id = ?`
    )
    .get(normalizedId) as TrainingProjectRow | undefined;
  return row ?? null;
};

export const loadTrainingProjectIds = (): Array<{ id: string }> =>
  db
    .prepare(
      `SELECT id
       FROM training_projects
       ORDER BY created_at DESC, id DESC`
    )
    .all() as Array<{ id: string }>;

export const loadTrainingReportFactRows = (
  filters: TrainingStatsFilters,
  limit?: number,
): TrainingStatsReportFactRow[] => {
  if (filters.tag && filters.tag.trim()) {
    ensureTrainingStatsTagsTableBackfilled();
  }
  const { whereSql, params } = buildTrainingStatsFactsWhereClause(filters);
  const normalizedLimit =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.max(1, Math.floor(limit))
      : null;
  return db
    .prepare(
      `SELECT ${TRAINING_STATS_REPORT_FACT_COLUMNS}
       FROM training_stats_sessions
       ${whereSql}
       ORDER BY created_at DESC, project_id DESC
       ${normalizedLimit ? 'LIMIT ?' : ''}`
    )
    .all(...params, ...(normalizedLimit ? [normalizedLimit] : [])) as TrainingStatsReportFactRow[];
};

export const loadTrainingStatsOverviewAggregateRow = (
  filters: TrainingStatsFilters,
): TrainingStatsOverviewAggregateRow => {
  const { whereSql, params } = buildTrainingStatsFactsWhereClause(filters);
  return (
    (db
      .prepare(
        `SELECT
           COUNT(*) AS total_sessions,
           COALESCE(SUM(CASE WHEN duration_days > 0 THEN duration_days ELSE 0 END), 0) AS total_training_days,
           COALESCE(SUM(CASE WHEN total_trades > 0 THEN total_trades ELSE 0 END), 0) AS total_trades,
           COALESCE(SUM(total_pnl), 0) AS total_pnl,
           COALESCE(SUM(CASE WHEN initial_total > 0 THEN initial_total ELSE 0 END), 0) AS total_initial,
           COALESCE(MAX(CASE WHEN max_drawdown_rate > 0 THEN max_drawdown_rate ELSE 0 END), 0) AS max_drawdown_rate,
           COALESCE(SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END), 0) AS win_sessions,
           COALESCE(SUM(CASE WHEN total_pnl < 0 THEN 1 ELSE 0 END), 0) AS loss_sessions,
           COALESCE(SUM(CASE WHEN total_pnl = 0 THEN 1 ELSE 0 END), 0) AS flat_sessions,
           COALESCE(SUM(closed_trades), 0) AS closed_trades,
           COALESCE(SUM(winning_trades), 0) AS winning_trades,
           COALESCE(SUM(losing_trades), 0) AS losing_trades,
           COALESCE(SUM(long_closed_trades), 0) AS long_closed_trades,
           COALESCE(SUM(long_winning_trades), 0) AS long_winning_trades,
           COALESCE(SUM(profit_trade_total), 0) AS profit_trade_total,
           COALESCE(SUM(loss_trade_total), 0) AS loss_trade_total,
           COALESCE(SUM(average_hold_bars * closed_trades), 0) AS hold_bars_weighted_sum,
           COALESCE(SUM(average_take_profit_rate * winning_trades), 0) AS take_profit_rate_weighted_sum,
           COALESCE(SUM(average_stop_loss_rate * losing_trades), 0) AS stop_loss_rate_weighted_sum,
           COALESCE(SUM(winning_trades), 0) AS take_profit_count,
           COALESCE(SUM(losing_trades), 0) AS stop_loss_count,
           COALESCE(MAX(max_consecutive_wins), 0) AS max_consecutive_wins,
           COALESCE(MAX(max_consecutive_losses), 0) AS max_consecutive_losses,
           COALESCE(SUM(add_position_count), 0) AS add_position_count,
           COALESCE(SUM(reduce_position_count), 0) AS reduce_position_count,
           COALESCE(SUM(full_position_count), 0) AS full_position_count,
           COALESCE(SUM(trading_cost), 0) AS total_trading_cost,
           COALESCE(SUM(total_fees_from_fills), 0) AS total_fees_from_fills,
           COALESCE(SUM(total_slippage), 0) AS total_slippage,
           COALESCE(SUM(decision_seconds_used), 0) AS total_decision_seconds_used,
           COALESCE(SUM(decision_count), 0) AS total_decision_count
         FROM training_stats_sessions
         ${whereSql}`,
      )
      .get(...params) as TrainingStatsOverviewAggregateRow | undefined) ?? {
      total_sessions: 0,
      total_training_days: 0,
      total_trades: 0,
      total_pnl: 0,
      total_initial: 0,
      max_drawdown_rate: 0,
      win_sessions: 0,
      loss_sessions: 0,
      flat_sessions: 0,
      closed_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      long_closed_trades: 0,
      long_winning_trades: 0,
      profit_trade_total: 0,
      loss_trade_total: 0,
      hold_bars_weighted_sum: 0,
      take_profit_rate_weighted_sum: 0,
      stop_loss_rate_weighted_sum: 0,
      take_profit_count: 0,
      stop_loss_count: 0,
      max_consecutive_wins: 0,
      max_consecutive_losses: 0,
      add_position_count: 0,
      reduce_position_count: 0,
      full_position_count: 0,
      total_trading_cost: 0,
      total_fees_from_fills: 0,
      total_slippage: 0,
      total_decision_seconds_used: 0,
      total_decision_count: 0,
    }
  );
};

export const loadTrainingStatsSubsetAggregateRow = (
  filters: TrainingStatsFilters,
  options: {
    extraClauses?: string[];
    extraParams?: unknown[];
  } = {},
): TrainingStatsSubsetAggregateRow => {
  const { whereSql, params } = buildTrainingStatsFactsWhereClause(filters, options);
  return (
    (db
      .prepare(
        `SELECT
           COUNT(*) AS session_count,
           COALESCE(SUM(total_pnl), 0) AS total_pnl,
           COALESCE(SUM(CASE WHEN initial_total > 0 THEN initial_total ELSE 0 END), 0) AS total_initial,
           COALESCE(SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END), 0) AS win_count,
           COALESCE(MAX(CASE WHEN max_drawdown_rate > 0 THEN max_drawdown_rate ELSE 0 END), 0) AS max_drawdown_rate,
           COALESCE(SUM(CASE WHEN total_trades > 0 THEN total_trades ELSE 0 END), 0) AS total_trades,
           COALESCE(SUM(average_hold_bars * closed_trades), 0) AS hold_bars_sum,
           COALESCE(SUM(closed_trades), 0) AS hold_bars_count,
           COALESCE(SUM(profit_trade_total), 0) AS profit_trade_total,
           COALESCE(SUM(loss_trade_total), 0) AS loss_trade_total,
           COALESCE(SUM(winning_trades), 0) AS winning_trades,
           COALESCE(SUM(losing_trades), 0) AS losing_trades
         FROM training_stats_sessions
         ${whereSql}`,
      )
      .get(...params) as TrainingStatsSubsetAggregateRow | undefined) ?? {
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
    }
  );
};

export const loadTrainingStatsDayAggregateRows = (
  filters: TrainingStatsFilters,
): TrainingStatsDayAggregateRow[] => {
  const { whereSql, params } = buildTrainingStatsFactsWhereClause(filters, {
    extraClauses: [`created_at IS NOT NULL`, `TRIM(created_at) <> ''`],
  });
  return db
    .prepare(
      `SELECT
         SUBSTR(created_at, 1, 10) AS period,
         COUNT(*) AS session_count,
         SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END) AS win_count,
         SUM(total_pnl) AS total_pnl,
         SUM(CASE WHEN initial_total > 0 THEN initial_total ELSE 0 END) AS total_initial,
         MAX(CASE WHEN max_drawdown_rate > 0 THEN max_drawdown_rate ELSE 0 END) AS max_drawdown_rate
       FROM training_stats_sessions
       ${whereSql}
       GROUP BY SUBSTR(created_at, 1, 10)
       ORDER BY period ASC`,
    )
	    .all(...params) as TrainingStatsDayAggregateRow[];
	};

export const loadTrainingStatsPoolAggregateRowsForFilters = (
  filters: TrainingStatsFilters,
): TrainingStatsPoolAggregateRow[] => {
  const { whereSql, params } = buildTrainingStatsFactsWhereClause(filters);
  return db
    .prepare(
      `SELECT
         sample_pool_id,
         MAX(sample_pool_name) AS sample_pool_name,
         COUNT(*) AS session_count,
         COALESCE(SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END), 0) AS win_count,
         COALESCE(SUM(total_pnl), 0) AS total_pnl,
         COALESCE(SUM(CASE WHEN initial_total > 0 THEN initial_total ELSE 0 END), 0) AS total_initial,
         COALESCE(SUM(CASE WHEN total_trades > 0 THEN total_trades ELSE 0 END), 0) AS total_trades,
         COALESCE(SUM(average_hold_bars * closed_trades), 0) AS hold_bars_sum,
         COALESCE(SUM(closed_trades), 0) AS hold_bars_count
       FROM training_stats_sessions
       ${whereSql}
       GROUP BY sample_pool_id
       ORDER BY total_pnl DESC, session_count DESC, sample_pool_name ASC`,
    )
    .all(...params) as TrainingStatsPoolAggregateRow[];
};

export const loadTrainingStatsSymbolAggregateRowsForFilters = (
  filters: TrainingStatsFilters,
): TrainingStatsSymbolAggregateRow[] => {
  const { whereSql, params } = buildTrainingStatsFactsWhereClause(filters, {
    extraClauses: [`symbol IS NOT NULL`, `TRIM(symbol) <> ''`],
  });
  return db
    .prepare(
      `SELECT
         symbol,
         COUNT(*) AS session_count,
         COALESCE(MAX(profit_rate), 0) AS best_return,
         COALESCE(MIN(profit_rate), 0) AS worst_return,
         COALESCE(SUM(profit_rate), 0) AS return_rate_sum
       FROM training_stats_sessions
       ${whereSql}
       GROUP BY symbol
       ORDER BY session_count DESC, return_rate_sum DESC, symbol ASC`,
    )
    .all(...params) as TrainingStatsSymbolAggregateRow[];
};

export const loadTrainingStatsTimeframeAggregateRowsForFilters = (
  filters: TrainingStatsFilters,
): TrainingStatsTimeframeAggregateRow[] => {
  const { whereSql, params } = buildTrainingStatsFactsWhereClause(filters, {
    extraClauses: [`base_timeframe IS NOT NULL`, `TRIM(base_timeframe) <> ''`],
  });
  return db
    .prepare(
      `SELECT
         base_timeframe AS timeframe,
         COUNT(*) AS session_count,
         COALESCE(SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END), 0) AS win_count,
         COALESCE(SUM(profit_rate), 0) AS return_rate_sum,
         COALESCE(MAX(CASE WHEN max_drawdown_rate > 0 THEN max_drawdown_rate ELSE 0 END), 0) AS max_drawdown_rate,
         COALESCE(SUM(CASE WHEN total_trades > 0 THEN total_trades ELSE 0 END), 0) AS total_trades
       FROM training_stats_sessions
       ${whereSql}
       GROUP BY base_timeframe
       ORDER BY session_count DESC, timeframe ASC`,
    )
    .all(...params) as TrainingStatsTimeframeAggregateRow[];
};

export const renameTrainingStatsSessionFactByProjectId = (
  projectId: string,
  name: string,
  tagsJson: string,
  generatedAt: string
): void => {
  db.transaction(() => {
    db
      .prepare('UPDATE training_stats_sessions SET name = ?, tags_json = ?, generated_at = ? WHERE project_id = ?')
      .run(String(name || '').trim(), tagsJson, generatedAt, projectId);
    replaceTrainingStatsTags(projectId, tagsJson);
  })();
  invalidateTrainingStatsFilterOptionsSnapshotCache();
};

export const loadTrainingStatsCounts = (): {
  totalProjects: number;
  totalFacts: number;
} => {
  const totalProjectsRow = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM training_projects`
    )
    .get() as { count: number } | undefined;
  const totalFactsRow = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM training_stats_sessions`
    )
    .get() as { count: number } | undefined;
  return {
    totalProjects: Math.max(0, Math.floor(Number(totalProjectsRow?.count) || 0)),
    totalFacts: Math.max(0, Math.floor(Number(totalFactsRow?.count) || 0))
  };
};

export const normalizeFactTimeframe = (value: string): string => normalizeTimeframe(value);
