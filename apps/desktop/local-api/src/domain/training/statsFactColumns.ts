// SPDX-License-Identifier: GPL-3.0-only

import type { TrainingStatsSessionFactRow } from './statsDomain.js';

export const TRAINING_STATS_FACT_COLUMN_LIST = [
  'project_id',
  'name',
  'created_at',
  'symbol',
  'sample_pool_id',
  'sample_pool_name',
  'base_timeframe',
  'training_date_range',
  'initial_total',
  'total_pnl',
  'profit_rate',
  'duration_days',
  'total_trades',
  'final_equity',
  'max_drawdown_rate',
  'trading_cost',
  'decision_seconds_used',
  'decision_count',
  'tags_json',
  'closed_trades',
  'winning_trades',
  'losing_trades',
  'long_closed_trades',
  'long_winning_trades',
  'profit_trade_total',
  'loss_trade_total',
  'average_hold_bars',
  'average_take_profit_rate',
  'average_stop_loss_rate',
  'add_position_count',
  'reduce_position_count',
  'full_position_count',
  'max_consecutive_wins',
  'max_consecutive_losses',
  'total_slippage',
  'total_fees_from_fills',
  'market_preset_id',
  'asset_class',
  'trade_settlement_mode',
  'allow_long_margin_trading',
  'allow_short_selling',
  'leverage_multiple',
  'uses_maker_taker',
  'funding_rate',
  'gross_pnl',
  'fee_and_tax_cost',
  'borrow_cost',
  'decision_average_seconds',
  'trade_win_rate',
  'session_profit_factor',
  'expectancy_per_trade',
  'net_profit_retention_rate',
  'peak_maintenance_utilization_rate',
  'margin_min_buffer_rate',
  'trend_aligned',
  'critical_failure',
  'loss_cut_delay_bars_total',
  'loss_cut_delay_bars_count',
  'generated_at',
] as const;

export const TRAINING_STATS_FACT_COLUMNS =
  TRAINING_STATS_FACT_COLUMN_LIST.join(',');

export const TRAINING_STATS_FACT_UPSERT_ASSIGNMENTS =
  TRAINING_STATS_FACT_COLUMN_LIST
    .filter((column) => column !== 'project_id')
    .map((column) => `${column} = excluded.${column}`)
    .join(',\n     ');

export const TRAINING_STATS_REPORT_FACT_COLUMN_LIST = [
  'project_id',
  'name',
  'created_at',
  'symbol',
  'sample_pool_id',
  'sample_pool_name',
  'base_timeframe',
  'training_date_range',
  'initial_total',
  'total_pnl',
  'profit_rate',
  'duration_days',
  'total_trades',
  'final_equity',
  'max_drawdown_rate',
  'trading_cost',
  'decision_seconds_used',
  'decision_count',
  'closed_trades',
  'winning_trades',
  'losing_trades',
  'long_closed_trades',
  'long_winning_trades',
  'profit_trade_total',
  'loss_trade_total',
  'average_hold_bars',
  'average_take_profit_rate',
  'average_stop_loss_rate',
  'add_position_count',
  'reduce_position_count',
  'full_position_count',
  'max_consecutive_wins',
  'max_consecutive_losses',
  'total_slippage',
  'total_fees_from_fills',
] as const;

export const TRAINING_STATS_REPORT_FACT_COLUMNS =
  TRAINING_STATS_REPORT_FACT_COLUMN_LIST.join(',');

export type TrainingStatsReportFactRow = Pick<
  TrainingStatsSessionFactRow,
  (typeof TRAINING_STATS_REPORT_FACT_COLUMN_LIST)[number]
>;
