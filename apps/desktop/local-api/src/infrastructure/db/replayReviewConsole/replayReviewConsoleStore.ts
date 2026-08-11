// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";

export type ReplayReviewProjectRow = {
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  symbol: string;
  sample_pool_id: string;
  sample_pool_name: string;
  training_date_range: string;
  base_timeframe: string;
  initial_total: number;
  total_pnl: number;
  profit_rate: number;
  duration_days: number;
  total_trades: number;
  final_equity: number;
  equity_return_rate: number;
  summary_json: string;
  operator_summary_json: string | null;
  closed_trades: number | null;
  winning_trades: number | null;
  losing_trades: number | null;
  profit_trade_total: number | null;
  loss_trade_total: number | null;
  average_hold_bars: number | null;
  add_position_count: number | null;
  reduce_position_count: number | null;
  full_position_count: number | null;
  max_consecutive_wins: number | null;
  max_consecutive_losses: number | null;
  total_slippage: number | null;
  total_fees_from_fills: number | null;
  market_preset_id: string | null;
  asset_class: string | null;
  trade_settlement_mode: string | null;
  allow_long_margin_trading: number | null;
  allow_short_selling: number | null;
  leverage_multiple: number | null;
  uses_maker_taker: number | null;
  funding_rate: number | null;
  gross_pnl: number | null;
  fee_and_tax_cost: number | null;
  borrow_cost: number | null;
  decision_average_seconds: number | null;
  trade_win_rate: number | null;
  session_profit_factor: number | null;
  expectancy_per_trade: number | null;
  peak_maintenance_utilization_rate: number | null;
  margin_min_buffer_rate: number | null;
  trend_aligned: number | null;
  critical_failure: number | null;
  loss_cut_delay_bars_total: number | null;
  loss_cut_delay_bars_count: number | null;
};

export const loadReplayReviewProjectRows = (
  projectIds: readonly string[],
): ReplayReviewProjectRow[] => {
  if (!projectIds.length) {
    return [];
  }
  const placeholders = projectIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT p.id AS project_id,
              p.name,
              p.created_at,
              p.updated_at,
              p.symbol,
              p.sample_pool_id,
              p.sample_pool_name,
              p.training_date_range,
              p.base_timeframe,
              p.initial_total,
              p.total_pnl,
              p.profit_rate,
              p.duration_days,
              p.total_trades,
              p.final_equity,
              p.equity_return_rate,
              p.summary_json,
              p.operator_summary_json,
              s.closed_trades,
              s.winning_trades,
              s.losing_trades,
              s.profit_trade_total,
              s.loss_trade_total,
              s.average_hold_bars,
              s.add_position_count,
              s.reduce_position_count,
              s.full_position_count,
              s.max_consecutive_wins,
              s.max_consecutive_losses,
              s.total_slippage,
              s.total_fees_from_fills,
              s.market_preset_id,
              s.asset_class,
              s.trade_settlement_mode,
              s.allow_long_margin_trading,
              s.allow_short_selling,
              s.leverage_multiple,
              s.uses_maker_taker,
              s.funding_rate,
              s.gross_pnl,
              s.fee_and_tax_cost,
              s.borrow_cost,
              s.decision_average_seconds,
              s.trade_win_rate,
              s.session_profit_factor,
              s.expectancy_per_trade,
              s.peak_maintenance_utilization_rate,
              s.margin_min_buffer_rate,
              s.trend_aligned,
              s.critical_failure,
              s.loss_cut_delay_bars_total,
              s.loss_cut_delay_bars_count
         FROM training_projects p
         LEFT JOIN training_stats_sessions s ON s.project_id = p.id
        WHERE p.id IN (${placeholders})
        ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all(...projectIds) as ReplayReviewProjectRow[];
};
