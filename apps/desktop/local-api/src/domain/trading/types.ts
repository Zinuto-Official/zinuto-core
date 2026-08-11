// SPDX-License-Identifier: GPL-3.0-only

import type { TradingSettings as SharedTradingSettings } from '@zinuto/shared/trading';

export interface SessionRow {
  id: string;
  user_id: string;
  instrument_id: string;
  sample_pool_id?: string;
  trading_settings_json?: string;
  access_grant_json?: string;
  timeZone?: string | null;
  instrument_symbol?: string;
  instrument_name?: string | null;
  instrument_source_id?: string | null;
  instrument_base_timeframe?: string | null;
  instrument_market?: string | null;
  instrument_bar_count?: number;
  instrument_bars_version_token?: string | null;
  timeframe: string;
  minimum_base_timeframe: string;
  start_index: number;
  entry_index: number;
  history_bars: number;
  cursor_index: number;
  cash_balance?: number | null;
  autoplay_interval_ms: number;
  is_paused: number;
  session_scope?: 'OFFICIAL' | 'SIMULATION_ONLY';
  created_at: string;
  updated_at?: string;
}

export interface PositionRow {
  session_id: string;
  instrument_id: string;
  qty: number;
  avg_cost: number;
  realized_pnl: number;
  last_borrow_accrual_day: string | null;
  current_leverage_cycle_start_time: string | null;
  updated_at: string;
}

export interface AccountRow {
  id: string;
  user_id: string;
  kind: 'SECURITIES';
  balance: number;
  currency: string;
}

export interface InstrumentRow {
  id: string;
  source_id?: string | null;
  symbol: string;
  base_timeframe?: string | null;
  name: string | null;
  market?: string | null;
  bar_count?: number;
  time_zone?: string | null;
  bars_version_token?: string | null;
}

export type TradingSettings = SharedTradingSettings;

export type TradingExecutionSettings = TradingSettings;

export type TradingFeeSettings = Pick<
  TradingSettings,
  | 'marketPresetId'
  | 'assetClass'
  | 'commissionRate'
  | 'makerFeeRate'
  | 'takerFeeRate'
  | 'fundingRate'
  | 'contractMultiplier'
  | 'transferFeeRate'
  | 'regulatoryFeeRate'
  | 'platformFeeRate'
  | 'transactionLevyRate'
  | 'slippageRate'
  | 'stampDutyRate'
  | 'commissionMinimumFee'
  | 'platformFeeMinimumFee'
  | 'transactionLevyMinimumFee'
  | 'shortBorrowAnnualRate'
  | 'stampDutyMode'
>;
