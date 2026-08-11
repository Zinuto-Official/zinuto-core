// SPDX-License-Identifier: GPL-3.0-only

import { historyStorageVNextSchemaSql } from "../historyStorageVNext.js";
import { backtestSchemaSql } from "./backtestSchemaSql.js";
import {
  INPUT_LIMITS,
  INPUT_SERIALIZED_LIMITS,
} from "@zinuto/shared/input-limits";
import {
  DEFAULT_COMMISSION_MINIMUM_FEE,
  DEFAULT_REGULATORY_FEE_RATE,
  DEFAULT_SHORT_BORROW_ANNUAL_RATE,
  DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO,
  DEFAULT_SLIPPAGE_RATE,
  DEFAULT_STAMP_DUTY_RATE,
  DEFAULT_TAKER_FEE_RATE,
  DEFAULT_TRADE_SETTLEMENT_MODE,
} from "../defaults.js";

export const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(LENGTH(name) BETWEEN 1 AND ${INPUT_LIMITS.localProfileNameChars}),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_reset_operations (
  id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL DEFAULT 'RESET_ALL_STORED_DATA'
    CHECK(operation_key = 'RESET_ALL_STORED_DATA'),
  status TEXT NOT NULL
    CHECK(status IN ('RUNNING','RECOVERY_REQUIRED','BLOCKED','SUCCESS','ABORTED')),
  checkpoint TEXT NOT NULL
    CHECK(checkpoint IN ('PREPARED','CORE_DATA_COMMITTED','MARKET_DATA_CLEARED','SEEDS_RECONCILED','STORAGE_RECLAIMED','VERIFIED')),
  recovery_attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_reset_operations_single_incomplete
  ON system_reset_operations(operation_key)
  WHERE status IN ('RUNNING','RECOVERY_REQUIRED','BLOCKED');

CREATE TABLE IF NOT EXISTS portable_import_recovery_journal (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL
    CHECK(state IN ('PENDING','MARKET_READY','COMMITTED')),
  created_source_ids_json TEXT NOT NULL DEFAULT '[]',
  created_instrument_ids_json TEXT NOT NULL DEFAULT '[]',
  claimed_source_ids_json TEXT NOT NULL DEFAULT '[]',
  recovery_attempts INTEGER NOT NULL DEFAULT 0,
  last_recovery_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portable_import_recovery_journal_state
  ON portable_import_recovery_journal(state, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('SECURITIES','BANK')),
  balance REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  created_at TEXT NOT NULL,
  UNIQUE(user_id, kind),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  initial_securities_balance REAL NOT NULL DEFAULT 50000,
  initial_bank_balance REAL NOT NULL DEFAULT 100000,
  asset_class TEXT NOT NULL DEFAULT 'STOCK' CHECK(asset_class IN ('STOCK','FUTURES','FOREX','CRYPTO')),
  market_preset_id TEXT NOT NULL DEFAULT 'A_SHARE' CHECK(LENGTH(market_preset_id) <= ${INPUT_LIMITS.tradingPresetNameChars}),
  min_trade_step REAL NOT NULL DEFAULT 100,
  commission_rate REAL NOT NULL DEFAULT 0.03,
  maker_fee_rate REAL NOT NULL DEFAULT 0,
  taker_fee_rate REAL NOT NULL DEFAULT ${DEFAULT_TAKER_FEE_RATE},
  funding_rate REAL NOT NULL DEFAULT 0,
  contract_multiplier REAL NOT NULL DEFAULT 1,
  transfer_fee_rate REAL NOT NULL DEFAULT 0.001,
  regulatory_fee_rate REAL NOT NULL DEFAULT ${DEFAULT_REGULATORY_FEE_RATE},
  platform_fee_rate REAL NOT NULL DEFAULT 0,
  transaction_levy_rate REAL NOT NULL DEFAULT 0,
  slippage_rate REAL NOT NULL DEFAULT ${DEFAULT_SLIPPAGE_RATE},
  stamp_duty_rate REAL NOT NULL DEFAULT ${DEFAULT_STAMP_DUTY_RATE},
  commission_minimum_fee REAL NOT NULL DEFAULT ${DEFAULT_COMMISSION_MINIMUM_FEE},
  platform_fee_minimum_fee REAL NOT NULL DEFAULT 0,
  transaction_levy_minimum_fee REAL NOT NULL DEFAULT 0,
  long_financing_annual_rate REAL NOT NULL DEFAULT 0,
  long_initial_margin_ratio REAL NOT NULL DEFAULT 100,
  long_maintenance_margin_ratio REAL NOT NULL DEFAULT 100,
  short_borrow_annual_rate REAL NOT NULL DEFAULT ${DEFAULT_SHORT_BORROW_ANNUAL_RATE},
  short_initial_margin_ratio REAL NOT NULL DEFAULT 150,
  short_maintenance_margin_ratio REAL NOT NULL DEFAULT ${DEFAULT_SHORT_MAINTENANCE_MARGIN_RATIO},
  stamp_duty_mode TEXT NOT NULL DEFAULT 'SINGLE' CHECK(stamp_duty_mode IN ('SINGLE','DOUBLE')),
  stamp_duty_single_side TEXT NOT NULL DEFAULT 'SELL' CHECK(stamp_duty_single_side IN ('BUY','SELL')),
  position_cost_mode TEXT NOT NULL DEFAULT 'DILUTED' CHECK(position_cost_mode IN ('DILUTED','AVERAGE_OPEN')),
  trade_settlement_mode TEXT NOT NULL DEFAULT '${DEFAULT_TRADE_SETTLEMENT_MODE}' CHECK(trade_settlement_mode IN ('T0','T1')),
  free_replay_end_settlement_mode TEXT NOT NULL DEFAULT 'FORCE_CLOSE'
    CHECK(free_replay_end_settlement_mode IN ('FORCE_CLOSE','CURRENT_TOTAL_ASSET')),
  trade_amount_includes_fees INTEGER NOT NULL DEFAULT 0,
  allow_long_margin_trading INTEGER NOT NULL DEFAULT 0,
  allow_short_selling INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_app_preferences (
  user_id TEXT PRIMARY KEY,
  ui_settings_json TEXT NOT NULL DEFAULT '{}',
  data_pool_removed_symbols_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS history_retention_policy (
  user_id TEXT PRIMARY KEY,
  retention_window TEXT NOT NULL DEFAULT 'ONE_YEAR'
    CHECK(retention_window IN ('ONE_MONTH','SIX_MONTHS','ONE_YEAR','THREE_YEARS','FOREVER')),
  free_replay_details_enabled INTEGER NOT NULL DEFAULT 1,
  challenge_details_enabled INTEGER NOT NULL DEFAULT 1,
  note_text_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  last_applied_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS instruments (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  base_timeframe TEXT NOT NULL DEFAULT '1d' CHECK(base_timeframe IN ('1m','5m','1h','1d')),
  name TEXT CHECK(name IS NULL OR LENGTH(name) <= ${INPUT_LIMITS.generalNameChars}),
  market TEXT,
  time_zone TEXT,
  min_trade_step REAL NOT NULL DEFAULT 100,
  bar_count INTEGER NOT NULL DEFAULT 0,
  time_start_ts TEXT,
  time_end_ts TEXT,
  bars_version_token TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_instruments_source_id
  ON instruments(source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_system_symbol_timeframe_unique
  ON instruments(symbol, base_timeframe)
  WHERE market = 'SYSTEM';
CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_local_source_symbol_timeframe_unique
  ON instruments(source_id, symbol, base_timeframe)
  WHERE market = 'LOCAL' AND source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS local_data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(LENGTH(name) BETWEEN 1 AND ${INPUT_LIMITS.generalNameChars}),
  source_folder TEXT NOT NULL DEFAULT '' CHECK(LENGTH(source_folder) <= ${INPUT_LIMITS.pathChars}),
  source_folder_bookmark_id TEXT NOT NULL DEFAULT '' CHECK(LENGTH(source_folder_bookmark_id) <= ${INPUT_LIMITS.bookmarkChars}),
  import_scope_strategy TEXT DEFAULT NULL
    CHECK(import_scope_strategy IS NULL OR import_scope_strategy IN ('FLAT','WITH_PARENT')),
  import_scope_top_level_subfolder TEXT NOT NULL DEFAULT '' CHECK(LENGTH(import_scope_top_level_subfolder) <= ${INPUT_LIMITS.relativePathChars}),
  time_zone TEXT NOT NULL,
  time_zone_origin TEXT NOT NULL DEFAULT 'PRESET_DEFAULT'
    CHECK(time_zone_origin IN ('PRESET_DEFAULT','INFERRED_DEFAULT','USER_SELECTED')),
  base_timeframe TEXT NOT NULL CHECK(base_timeframe IN ('1m','5m','1h','1d')),
  diagnostic_asset_class TEXT NOT NULL DEFAULT 'STOCK'
    CHECK(diagnostic_asset_class IN ('STOCK','FUTURES','FOREX','CRYPTO')),
  diagnostic_market_preset_id TEXT NOT NULL DEFAULT 'A_SHARE'
    CHECK(LENGTH(diagnostic_market_preset_id) BETWEEN 1 AND 64),
  diagnostic_profile_origin TEXT NOT NULL DEFAULT 'INFERRED'
    CHECK(diagnostic_profile_origin IN ('SYSTEM','INFERRED','USER')),
  field_mapping_json TEXT NOT NULL,
  trading_calendar_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('IMPORTING','READY','FAILED')),
  deletion_state TEXT NOT NULL DEFAULT 'IDLE'
    CHECK(deletion_state IN ('IDLE','DELETING','MUTATING_SYMBOLS')),
  total_files INTEGER NOT NULL DEFAULT 0,
  imported_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  bar_count INTEGER NOT NULL DEFAULT 0,
  storage_bytes INTEGER NOT NULL DEFAULT 0,
  pruned_import_job_count INTEGER NOT NULL DEFAULT 0,
  pruned_import_file_count INTEGER NOT NULL DEFAULT 0,
  pruned_import_total_rows INTEGER NOT NULL DEFAULT 0,
  pruned_import_imported_rows INTEGER NOT NULL DEFAULT 0,
  pruned_import_skipped_rows INTEGER NOT NULL DEFAULT 0,
  pruned_import_error_files INTEGER NOT NULL DEFAULT 0,
  time_start_ts TEXT,
  time_end_ts TEXT,
  last_job_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_data_sources_status
  ON local_data_sources(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS local_data_source_diagnostics (
  source_id TEXT PRIMARY KEY,
  base_timeframe TEXT NOT NULL CHECK(base_timeframe IN ('1m','5m','1h','1d')),
  diagnostics_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES local_data_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS local_data_source_symbol_diagnostics (
  source_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  base_timeframe TEXT NOT NULL CHECK(base_timeframe IN ('1m','5m','1h','1d')),
  diagnostics_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY(source_id, instrument_id),
  FOREIGN KEY(source_id) REFERENCES local_data_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_local_data_source_symbol_diagnostics_symbol
  ON local_data_source_symbol_diagnostics(source_id, symbol);

CREATE TABLE IF NOT EXISTS local_data_import_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL CHECK(LENGTH(source_name) BETWEEN 1 AND ${INPUT_LIMITS.generalNameChars}),
  time_zone TEXT NOT NULL,
  base_timeframe TEXT NOT NULL CHECK(base_timeframe IN ('1m','5m','1h','1d')),
  job_mode TEXT NOT NULL DEFAULT 'FULL_IMPORT'
    CHECK(job_mode IN ('FULL_IMPORT','INCREMENTAL_UPDATE')),
  status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCESS','PARTIAL_SUCCESS','FAILED','CANCELED')),
  stage TEXT NOT NULL CHECK(stage IN ('QUEUED','SCANNING','IMPORTING','FINALIZING','DONE')),
  progress_percent REAL NOT NULL DEFAULT 0,
  compact_progress_percent REAL NOT NULL DEFAULT 0,
  compact_before_bytes INTEGER NOT NULL DEFAULT 0,
  compact_after_bytes INTEGER NOT NULL DEFAULT 0,
  compact_reclaimed_bytes INTEGER NOT NULL DEFAULT 0,
  total_files INTEGER NOT NULL DEFAULT 0,
  done_files INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  error_files INTEGER NOT NULL DEFAULT 0,
  current_file_name TEXT CHECK(current_file_name IS NULL OR LENGTH(current_file_name) <= ${INPUT_LIMITS.relativePathChars}),
  error_message TEXT,
  error_code TEXT,
  error_cause_json TEXT,
  error_details_json TEXT,
  failure_summary_json TEXT,
  outcome_summary_json TEXT,
  symbol_limit_json TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES local_data_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_local_data_import_jobs_source
  ON local_data_import_jobs(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_data_import_jobs_status
  ON local_data_import_jobs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS local_data_source_files (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  instrument_id TEXT,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  file_name TEXT NOT NULL CHECK(LENGTH(file_name) BETWEEN 1 AND ${INPUT_LIMITS.fileNameChars}),
  file_path TEXT NOT NULL CHECK(LENGTH(file_path) BETWEEN 1 AND ${INPUT_LIMITS.relativePathChars}),
  file_size INTEGER NOT NULL DEFAULT 0,
  file_mtime_ms INTEGER NOT NULL DEFAULT 0,
  file_fingerprint TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('QUEUED','IMPORTING','IMPORTED','FAILED')),
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  error_code TEXT,
  error_cause_json TEXT,
  error_details_json TEXT,
  diagnostics_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES local_data_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_local_data_source_files_source
  ON local_data_source_files(source_id, symbol);
CREATE INDEX IF NOT EXISTS idx_local_data_source_files_job
  ON local_data_source_files(job_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_data_source_files_source_instrument
  ON local_data_source_files(source_id, instrument_id);
CREATE INDEX IF NOT EXISTS idx_local_data_source_files_source_status_updated
  ON local_data_source_files(source_id, status, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_data_source_files_source_file_identity_updated
  ON local_data_source_files(source_id, file_path, file_name, symbol, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_data_source_files_imported_symbol_order
  ON local_data_source_files(source_id, symbol, rows_imported, created_at);

CREATE TABLE IF NOT EXISTS replay_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  sample_pool_id TEXT NOT NULL DEFAULT '',
  trading_settings_json TEXT NOT NULL DEFAULT '',
  access_grant_json TEXT NOT NULL DEFAULT 'null',
  timeframe TEXT NOT NULL DEFAULT '1d',
  minimum_base_timeframe TEXT NOT NULL DEFAULT '1d',
  start_index INTEGER NOT NULL DEFAULT 0,
  entry_index INTEGER NOT NULL DEFAULT 0,
  history_bars INTEGER NOT NULL DEFAULT 1,
  cursor_index INTEGER NOT NULL DEFAULT 0,
  cash_balance REAL,
  autoplay_interval_ms INTEGER NOT NULL DEFAULT 1000,
  is_paused INTEGER NOT NULL DEFAULT 1,
  session_scope TEXT NOT NULL DEFAULT 'OFFICIAL' CHECK(session_scope IN ('OFFICIAL','SIMULATION_ONLY')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replay_sessions_user_updated_created
  ON replay_sessions(user_id, updated_at DESC, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS replay_session_undo_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('STEP','BUY','SELL')),
  undo_delta_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES replay_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replay_session_undo_entries_session_created
  ON replay_session_undo_entries(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sim_orders (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  qty REAL,
  amount REAL,
  price_mode TEXT NOT NULL CHECK(price_mode IN ('CUR_CLOSE','NEXT_OPEN')),
  submit_index INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','FILLED','CANCELLED')),
  auto_step_next INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES replay_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sim_orders_pending_next_open_submit
  ON sim_orders(session_id, status, price_mode, submit_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_orders_single_pending_next_open_session
  ON sim_orders(session_id)
  WHERE status = 'PENDING'
    AND price_mode = 'NEXT_OPEN';

CREATE TABLE IF NOT EXISTS sim_fills (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  fill_index INTEGER NOT NULL,
  fill_time TEXT NOT NULL,
  fill_trade_day TEXT NOT NULL,
  fill_price REAL NOT NULL,
  fill_qty REAL NOT NULL,
  contract_multiplier REAL NOT NULL DEFAULT 1,
  fee REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  slippage REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES sim_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES replay_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sim_fills_session ON sim_fills(session_id, fill_index);
CREATE INDEX IF NOT EXISTS idx_sim_fills_trade_day ON sim_fills(session_id, instrument_id, fill_trade_day, fill_index);

CREATE TABLE IF NOT EXISTS sim_accrual_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('LONG_FINANCING','SHORT_BORROW','FUNDING')),
  accrual_start_day TEXT NOT NULL,
  accrual_end_day TEXT NOT NULL,
  accrual_days INTEGER NOT NULL DEFAULT 0,
  accrual_time TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  reference_price REAL NOT NULL DEFAULT 0,
  notional_basis REAL NOT NULL DEFAULT 0,
  annual_rate REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES replay_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sim_accrual_events_session_day
  ON sim_accrual_events(session_id, accrual_end_day, kind);

CREATE TABLE IF NOT EXISTS replay_session_metric_totals (
  session_id TEXT PRIMARY KEY,
  fills_count INTEGER NOT NULL DEFAULT 0,
  fill_fee_total REAL NOT NULL DEFAULT 0,
  fill_tax_total REAL NOT NULL DEFAULT 0,
  fill_slippage_total REAL NOT NULL DEFAULT 0,
  long_financing_total REAL NOT NULL DEFAULT 0,
  short_borrow_total REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES replay_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS positions (
  session_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  avg_cost REAL NOT NULL DEFAULT 0,
  realized_pnl REAL NOT NULL DEFAULT 0,
  last_borrow_accrual_day TEXT,
  current_leverage_cycle_start_time TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(session_id, instrument_id),
  FOREIGN KEY(session_id) REFERENCES replay_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS training_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(LENGTH(name) BETWEEN 1 AND ${INPUT_LIMITS.trainingProjectNameChars}),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  sample_pool_id TEXT NOT NULL CHECK(LENGTH(sample_pool_id) <= ${INPUT_LIMITS.idChars}),
  sample_pool_name TEXT NOT NULL CHECK(LENGTH(sample_pool_name) <= ${INPUT_LIMITS.samplePoolNameChars}),
  base_timeframe TEXT NOT NULL DEFAULT '1d',
  training_date_range TEXT NOT NULL,
  initial_total REAL NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  profit_rate REAL NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  final_equity REAL NOT NULL DEFAULT 0,
  equity_return_rate REAL NOT NULL DEFAULT 0,
  detail_expired_at TEXT,
  simulation_batch_id TEXT CHECK(simulation_batch_id IS NULL OR LENGTH(simulation_batch_id) <= ${INPUT_LIMITS.idChars}),
  source_tag TEXT NOT NULL DEFAULT '',
  summary_json TEXT NOT NULL,
  operator_summary_json TEXT NOT NULL DEFAULT 'null'
);

CREATE INDEX IF NOT EXISTS idx_training_projects_created_at ON training_projects(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_training_projects_pool_symbol_time ON training_projects(sample_pool_id, symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_projects_simulation_batch
  ON training_projects(simulation_batch_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS system_dev_simulation_batches (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, seed TEXT NOT NULL,
  spec_version INTEGER NOT NULL DEFAULT 1,
  effective_plan_json TEXT,
  created_at TEXT NOT NULL, finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_dev_simulation_batches_created_at
  ON system_dev_simulation_batches(created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS special_training_banks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(LENGTH(name) BETWEEN 1 AND ${INPUT_LIMITS.specialTrainingBankNameChars}),
  asset_class TEXT NOT NULL CHECK(asset_class IN ('STOCK','FUTURES','FOREX','CRYPTO')),
  target_timeframe TEXT NOT NULL CHECK(target_timeframe IN ('1m','5m','1h','1d')),
  scope_json TEXT NOT NULL DEFAULT '{}',
  simulation_batch_id TEXT CHECK(simulation_batch_id IS NULL OR LENGTH(simulation_batch_id) <= ${INPUT_LIMITS.idChars}),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_special_training_banks_user_updated
  ON special_training_banks(user_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_banks_simulation_batch
  ON special_training_banks(simulation_batch_id);
CREATE TABLE IF NOT EXISTS special_training_question_scope_indexes (
  definition_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  bank_id TEXT NOT NULL DEFAULT '',
  mode_id TEXT NOT NULL CHECK(mode_id IN ('fast-decision-training','risk-discipline-training')),
  target_timeframe TEXT NOT NULL CHECK(target_timeframe IN ('1m','5m','1h','1d')),
  horizon_bars INTEGER NOT NULL,
  scope_hash TEXT NOT NULL,
  total_question_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_special_training_question_scope_indexes_scope
  ON special_training_question_scope_indexes(user_id, mode_id, scope_hash);
CREATE INDEX IF NOT EXISTS idx_special_training_question_scope_indexes_bank
  ON special_training_question_scope_indexes(user_id, bank_id, mode_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS special_training_question_draw_cursors (
  user_id TEXT NOT NULL,
  mode_id TEXT NOT NULL CHECK(mode_id IN ('fast-decision-training','risk-discipline-training')),
  scope_hash TEXT NOT NULL,
  cycle_index INTEGER NOT NULL DEFAULT 0,
  cursor_index INTEGER NOT NULL DEFAULT 0,
  total_question_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, mode_id, scope_hash)
);

CREATE INDEX IF NOT EXISTS idx_special_training_question_draw_cursors_updated
  ON special_training_question_draw_cursors(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS special_training_question_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  bank_id TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '' CHECK(LENGTH(bank_name) <= ${INPUT_LIMITS.specialTrainingBankNameChars}),
  mode_id TEXT NOT NULL CHECK(mode_id IN ('fast-decision-training','risk-discipline-training')),
  scope_hash TEXT NOT NULL,
  source_tag TEXT NOT NULL DEFAULT '',
  simulation_batch_id TEXT,
  instrument_id TEXT NOT NULL DEFAULT '',
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  timeframe TEXT NOT NULL DEFAULT '1d',
  minimum_base_timeframe TEXT NOT NULL DEFAULT '1d',
  source_timeframe TEXT NOT NULL DEFAULT '1d',
  slot_index INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ASSIGNED','SETTLED','ABANDONED')),
  score REAL,
  passed INTEGER,
  decision_selection TEXT,
  decision_actual TEXT,
  decision_correct INTEGER,
  decision_seconds_used REAL,
  decision_mfe_mae_ratio REAL,
  opportunity_direction TEXT,
  opportunity_mfe_mae_ratio REAL,
  settled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, mode_id, scope_hash, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_special_training_question_ledger_scope
  ON special_training_question_ledger(user_id, mode_id, scope_hash, slot_index);
CREATE INDEX IF NOT EXISTS idx_special_training_question_ledger_scope_status
  ON special_training_question_ledger(user_id, mode_id, scope_hash, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_question_ledger_status_updated
  ON special_training_question_ledger(user_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_special_training_question_ledger_bank
  ON special_training_question_ledger(user_id, bank_id, mode_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_question_ledger_simulation_batch
  ON special_training_question_ledger(simulation_batch_id, mode_id, created_at DESC, id DESC);
${historyStorageVNextSchemaSql}

CREATE INDEX IF NOT EXISTS idx_special_training_history_sessions_simulation_batch
  ON special_training_history_sessions(simulation_batch_id, finished_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS training_stats_sessions (
  project_id TEXT PRIMARY KEY CHECK(LENGTH(project_id) BETWEEN 1 AND ${INPUT_LIMITS.idChars}),
  name TEXT NOT NULL CHECK(LENGTH(name) BETWEEN 1 AND ${INPUT_LIMITS.trainingProjectNameChars}),
  created_at TEXT NOT NULL,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  sample_pool_id TEXT NOT NULL CHECK(LENGTH(sample_pool_id) <= ${INPUT_LIMITS.idChars}),
  sample_pool_name TEXT NOT NULL CHECK(LENGTH(sample_pool_name) <= ${INPUT_LIMITS.samplePoolNameChars}),
  base_timeframe TEXT NOT NULL CHECK(LENGTH(base_timeframe) BETWEEN 1 AND ${INPUT_LIMITS.shortCodeChars}),
  training_date_range TEXT NOT NULL CHECK(LENGTH(training_date_range) <= ${INPUT_LIMITS.dateTimeChars * 2 + 16}),
  initial_total REAL NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  profit_rate REAL NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  final_equity REAL NOT NULL DEFAULT 0,
  max_drawdown_rate REAL NOT NULL DEFAULT 0,
  trading_cost REAL NOT NULL DEFAULT 0,
  decision_seconds_used REAL NOT NULL DEFAULT 0,
  decision_count INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK(LENGTH(tags_json) <= ${INPUT_SERIALIZED_LIMITS.replayNoteMetaSummaryBytes}),
  closed_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  long_closed_trades INTEGER NOT NULL DEFAULT 0,
  long_winning_trades INTEGER NOT NULL DEFAULT 0,
  profit_trade_total REAL NOT NULL DEFAULT 0,
  loss_trade_total REAL NOT NULL DEFAULT 0,
  average_hold_bars REAL NOT NULL DEFAULT 0,
  average_take_profit_rate REAL NOT NULL DEFAULT 0,
  average_stop_loss_rate REAL NOT NULL DEFAULT 0,
  add_position_count INTEGER NOT NULL DEFAULT 0,
  reduce_position_count INTEGER NOT NULL DEFAULT 0,
  full_position_count INTEGER NOT NULL DEFAULT 0,
  max_consecutive_wins INTEGER NOT NULL DEFAULT 0,
  max_consecutive_losses INTEGER NOT NULL DEFAULT 0,
  total_slippage REAL NOT NULL DEFAULT 0,
  total_fees_from_fills REAL NOT NULL DEFAULT 0,
  market_preset_id TEXT NOT NULL DEFAULT '' CHECK(LENGTH(market_preset_id) <= ${INPUT_LIMITS.tradingPresetNameChars}),
  asset_class TEXT NOT NULL DEFAULT 'STOCK' CHECK(LENGTH(asset_class) <= ${INPUT_LIMITS.shortCodeChars}),
  trade_settlement_mode TEXT NOT NULL DEFAULT 'T0' CHECK(LENGTH(trade_settlement_mode) <= ${INPUT_LIMITS.shortCodeChars}),
  allow_long_margin_trading INTEGER NOT NULL DEFAULT 0,
  allow_short_selling INTEGER NOT NULL DEFAULT 0,
  leverage_multiple REAL NOT NULL DEFAULT 1,
  uses_maker_taker INTEGER NOT NULL DEFAULT 0,
  funding_rate REAL NOT NULL DEFAULT 0,
  gross_pnl REAL NOT NULL DEFAULT 0,
  fee_and_tax_cost REAL NOT NULL DEFAULT 0,
  borrow_cost REAL NOT NULL DEFAULT 0,
  decision_average_seconds REAL NOT NULL DEFAULT 0,
  trade_win_rate REAL NOT NULL DEFAULT 0,
  session_profit_factor REAL,
  expectancy_per_trade REAL NOT NULL DEFAULT 0,
  net_profit_retention_rate REAL NOT NULL DEFAULT 0,
  peak_maintenance_utilization_rate REAL NOT NULL DEFAULT 0,
  margin_min_buffer_rate REAL NOT NULL DEFAULT 1,
  trend_aligned INTEGER NOT NULL DEFAULT 0,
  critical_failure INTEGER NOT NULL DEFAULT 0,
  loss_cut_delay_bars_total REAL NOT NULL DEFAULT 0,
  loss_cut_delay_bars_count INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES training_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_stats_sessions_created_at
  ON training_stats_sessions(created_at DESC, project_id DESC);
CREATE INDEX IF NOT EXISTS idx_training_stats_sessions_pool
  ON training_stats_sessions(sample_pool_id, created_at DESC, project_id DESC);
CREATE INDEX IF NOT EXISTS idx_training_stats_sessions_symbol
  ON training_stats_sessions(symbol, created_at DESC, project_id DESC);
CREATE INDEX IF NOT EXISTS idx_training_stats_sessions_timeframe
  ON training_stats_sessions(base_timeframe, created_at DESC, project_id DESC);

CREATE TABLE IF NOT EXISTS training_stats_tags (
  project_id TEXT NOT NULL CHECK(LENGTH(project_id) BETWEEN 1 AND ${INPUT_LIMITS.idChars}),
  tag TEXT NOT NULL CHECK(LENGTH(tag) BETWEEN 1 AND 32),
  PRIMARY KEY(project_id, tag),
  FOREIGN KEY(project_id) REFERENCES training_stats_sessions(project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_stats_tags_tag
  ON training_stats_tags(tag, project_id);

CREATE TABLE IF NOT EXISTS training_stats_monthly (
  period TEXT PRIMARY KEY,
  session_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  total_initial REAL NOT NULL DEFAULT 0,
  max_drawdown_rate REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_stats_pool (
  sample_pool_id TEXT PRIMARY KEY,
  sample_pool_name TEXT NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  total_initial REAL NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  hold_bars_sum REAL NOT NULL DEFAULT 0,
  hold_bars_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_stats_symbol (
  symbol TEXT PRIMARY KEY,
  session_count INTEGER NOT NULL DEFAULT 0,
  best_return REAL NOT NULL DEFAULT 0,
  worst_return REAL NOT NULL DEFAULT 0,
  return_rate_sum REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_stats_timeframe (
  timeframe TEXT PRIMARY KEY,
  session_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  return_rate_sum REAL NOT NULL DEFAULT 0,
  max_drawdown_rate REAL NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_project_replay_refs (
  project_id TEXT PRIMARY KEY,
  base_timeframe TEXT,
  instrument_id TEXT NOT NULL DEFAULT '',
  bars_version_token TEXT NOT NULL DEFAULT '',
  start_ts TEXT,
  end_ts TEXT,
  entry_index INTEGER NOT NULL DEFAULT 0,
  cursor_index INTEGER NOT NULL DEFAULT 0,
  history_bars INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}',
  payload_blob BLOB,
  payload_encoding TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES training_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS training_project_replay_fills (
  project_id TEXT NOT NULL,
  fill_index INTEGER NOT NULL,
  row_seq INTEGER NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  fill_time TEXT NOT NULL DEFAULT '',
  fill_price REAL NOT NULL,
  fill_qty REAL NOT NULL,
  contract_multiplier REAL NOT NULL DEFAULT 1,
  fee REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  slippage REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, fill_index, row_seq),
  FOREIGN KEY(project_id) REFERENCES training_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_project_replay_fills_project_window
  ON training_project_replay_fills(project_id, fill_index, row_seq);

CREATE TABLE IF NOT EXISTS training_project_replay_cash_adjustments (
  project_id TEXT NOT NULL,
  bar_index INTEGER NOT NULL,
  row_seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('LONG_FINANCING','SHORT_BORROW','FUNDING')),
  amount REAL NOT NULL,
  ts TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, bar_index, row_seq),
  FOREIGN KEY(project_id) REFERENCES training_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_project_replay_cash_adjustments_project_window
  ON training_project_replay_cash_adjustments(project_id, bar_index, row_seq);

CREATE TABLE IF NOT EXISTS training_project_portable_previews (
  project_id TEXT PRIMARY KEY,
  source_manifest_hash TEXT NOT NULL DEFAULT '',
  preview_encoding TEXT NOT NULL DEFAULT 'GZIP_JSON_V1',
  preview_payload BLOB NOT NULL,
  source_bytes INTEGER NOT NULL DEFAULT 0,
  preview_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES training_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS replay_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(LENGTH(title) <= ${INPUT_LIMITS.noteTitleChars}),
  type TEXT NOT NULL CHECK (type IN ('FREE_REPLAY','CHALLENGE','CUSTOM')),
  simulation_batch_id TEXT,
  source_kind TEXT CHECK(source_kind IS NULL OR LENGTH(source_kind) <= ${INPUT_LIMITS.shortCodeChars}),
  source_id TEXT CHECK(source_id IS NULL OR LENGTH(source_id) <= 191),
  content_preview TEXT NOT NULL DEFAULT '',
  training_project_id TEXT CHECK(training_project_id IS NULL OR LENGTH(training_project_id) <= ${INPUT_LIMITS.idChars}),
  context_display_period TEXT CHECK(context_display_period IS NULL OR LENGTH(context_display_period) <= ${INPUT_LIMITS.shortCodeChars}),
  has_context_replay INTEGER NOT NULL DEFAULT 0,
  context_expired_at TEXT,
  context_session_id TEXT CHECK(context_session_id IS NULL OR LENGTH(context_session_id) <= ${INPUT_LIMITS.idChars}),
  context_cursor_index INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS replay_note_contents (
  note_id TEXT PRIMARY KEY,
  document_schema_version INTEGER NOT NULL DEFAULT 1,
  document_encoding TEXT NOT NULL DEFAULT 'GZIP_JSON_V1',
  document_payload BLOB NOT NULL,
  document_hash TEXT NOT NULL DEFAULT '',
  content_preview TEXT NOT NULL DEFAULT '',
  text_chars INTEGER NOT NULL DEFAULT 0 CHECK(text_chars <= ${INPUT_LIMITS.noteContentChars}),
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES replay_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replay_notes_updated_at
  ON replay_notes(updated_at DESC, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_replay_notes_type
  ON replay_notes(type, updated_at DESC, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_replay_notes_training_project
  ON replay_notes(training_project_id, updated_at DESC, created_at DESC, id DESC)
  WHERE training_project_id IS NOT NULL
    AND LENGTH(TRIM(training_project_id)) > 0;

CREATE INDEX IF NOT EXISTS idx_replay_notes_context_session
  ON replay_notes(context_session_id, context_cursor_index, updated_at DESC, created_at DESC, id DESC)
  WHERE context_session_id IS NOT NULL
    AND LENGTH(TRIM(context_session_id)) > 0;
CREATE INDEX IF NOT EXISTS idx_replay_notes_source
  ON replay_notes(source_kind, source_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_replay_notes_simulation_batch
  ON replay_notes(simulation_batch_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS replay_note_context_refs (
  note_id TEXT PRIMARY KEY,
  training_project_id TEXT NOT NULL CHECK(LENGTH(training_project_id) BETWEEN 1 AND ${INPUT_LIMITS.idChars}),
  context_cursor_index INTEGER NOT NULL DEFAULT 0,
  window_bars INTEGER NOT NULL DEFAULT 240,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES replay_notes(id) ON DELETE CASCADE,
  FOREIGN KEY(training_project_id) REFERENCES training_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replay_note_context_refs_project
  ON replay_note_context_refs(training_project_id, updated_at DESC, note_id DESC);

CREATE INDEX IF NOT EXISTS idx_replay_note_context_refs_updated
  ON replay_note_context_refs(updated_at DESC, note_id DESC);

CREATE TABLE IF NOT EXISTS replay_note_special_training_context_refs (
  note_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL CHECK(LENGTH(question_id) BETWEEN 1 AND ${INPUT_LIMITS.idChars}),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES replay_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replay_note_special_training_context_refs_question
  ON replay_note_special_training_context_refs(question_id, updated_at DESC, note_id DESC);

CREATE INDEX IF NOT EXISTS idx_replay_note_special_training_context_refs_updated
  ON replay_note_special_training_context_refs(updated_at DESC, note_id DESC);

CREATE TABLE IF NOT EXISTS replay_note_context_archives (
  note_id TEXT PRIMARY KEY,
  archive_encoding TEXT NOT NULL DEFAULT 'GZIP_BINARY',
  archive_payload BLOB NOT NULL,
  source_bytes INTEGER NOT NULL DEFAULT 0,
  archive_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES replay_notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS replay_note_attachments (
  note_id TEXT NOT NULL,
  attachment_ref_id TEXT NOT NULL CHECK(LENGTH(attachment_ref_id) BETWEEN 1 AND ${INPUT_LIMITS.idChars}),
  attachment_kind TEXT NOT NULL CHECK(attachment_kind IN ('CAPSULE','REPLAY_CONTEXT','CHART_VIEW','DRAWING_LAYER')),
  summary_json TEXT NOT NULL DEFAULT 'null' CHECK(LENGTH(summary_json) <= ${INPUT_SERIALIZED_LIMITS.replayNoteMetaSummaryBytes}),
  ref_kind TEXT CHECK(ref_kind IS NULL OR LENGTH(ref_kind) <= ${INPUT_LIMITS.shortCodeChars}),
  ref_id TEXT CHECK(ref_id IS NULL OR LENGTH(ref_id) <= ${INPUT_LIMITS.idChars}),
  payload_encoding TEXT,
  payload_blob BLOB,
  source_bytes INTEGER NOT NULL DEFAULT 0,
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(note_id, attachment_ref_id),
  FOREIGN KEY(note_id) REFERENCES replay_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replay_note_attachments_note
  ON replay_note_attachments(note_id, sort_index ASC, attachment_ref_id ASC);

CREATE INDEX IF NOT EXISTS idx_replay_note_attachments_kind
  ON replay_note_attachments(attachment_kind, note_id);

CREATE TABLE IF NOT EXISTS special_training_question_snapshot_archives (
  question_id TEXT PRIMARY KEY,
  source_manifest_hash TEXT NOT NULL DEFAULT '',
  snapshot_encoding TEXT NOT NULL DEFAULT 'GZIP_JSON_V1',
  snapshot_payload BLOB NOT NULL,
  source_bytes INTEGER NOT NULL DEFAULT 0,
  snapshot_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(question_id) REFERENCES special_training_history_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS special_training_stats_projection (
  project_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_order INTEGER NOT NULL DEFAULT 0,
  mode_id TEXT NOT NULL CHECK(mode_id IN ('fast-decision-training','risk-discipline-training')),
  created_at TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  base_timeframe TEXT NOT NULL DEFAULT '1d',
  sample_pool_id TEXT NOT NULL DEFAULT '',
  sample_pool_name TEXT NOT NULL DEFAULT '',
  initial_total REAL NOT NULL DEFAULT 0,
  final_equity REAL NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  profit_rate REAL NOT NULL DEFAULT 0,
  return_rate REAL NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 0,
  max_drawdown_rate REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  decision_seconds_used REAL,
  decision_count INTEGER NOT NULL DEFAULT 0,
  selection TEXT,
  actual TEXT,
  correct INTEGER NOT NULL DEFAULT 0,
  timed_out INTEGER NOT NULL DEFAULT 0,
  edge_ratio REAL NOT NULL DEFAULT 0,
  opportunity_edge_ratio REAL NOT NULL DEFAULT 0,
  performance_rate REAL NOT NULL DEFAULT 0,
  fast_review_grade TEXT NOT NULL DEFAULT '',
  survived INTEGER NOT NULL DEFAULT 0,
  comeback INTEGER NOT NULL DEFAULT 0,
  alpha_ratio REAL,
  first_action_bars INTEGER NOT NULL DEFAULT 0,
  behavior TEXT NOT NULL DEFAULT '',
  risk_review_grade TEXT NOT NULL DEFAULT '',
  curve_points_json TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL,
  detail_expired_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_special_training_stats_projection_mode
  ON special_training_stats_projection(mode_id, settled_at DESC, project_id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_stats_projection_symbol
  ON special_training_stats_projection(symbol, settled_at DESC, project_id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_stats_projection_timeframe
  ON special_training_stats_projection(base_timeframe, settled_at DESC, project_id DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS replay_notes_fts
USING fts5(
  note_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS replay_note_meta (
  note_id TEXT PRIMARY KEY,
  meta_json TEXT NOT NULL DEFAULT 'null' CHECK(LENGTH(meta_json) <= ${INPUT_SERIALIZED_LIMITS.replayNoteMetaBytes}),
  meta_summary_json TEXT NOT NULL DEFAULT 'null' CHECK(LENGTH(meta_summary_json) <= ${INPUT_SERIALIZED_LIMITS.replayNoteMetaSummaryBytes}),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES replay_notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS portable_source_manifests (
  id TEXT PRIMARY KEY CHECK(LENGTH(id) BETWEEN 1 AND ${INPUT_LIMITS.idChars}),
  source_id TEXT NOT NULL UNIQUE CHECK(LENGTH(source_id) BETWEEN 1 AND ${INPUT_LIMITS.idChars}),
  source_name TEXT NOT NULL CHECK(LENGTH(source_name) BETWEEN 1 AND ${INPUT_LIMITS.generalNameChars}),
  base_timeframe TEXT NOT NULL CHECK(LENGTH(base_timeframe) BETWEEN 1 AND ${INPUT_LIMITS.shortCodeChars}),
  time_zone TEXT NOT NULL CHECK(LENGTH(time_zone) BETWEEN 1 AND ${INPUT_LIMITS.generalNameChars}),
  symbol_count INTEGER NOT NULL DEFAULT 0,
  bar_count INTEGER NOT NULL DEFAULT 0,
  time_start_ts TEXT,
  time_end_ts TEXT,
  fingerprint_hash TEXT NOT NULL DEFAULT '' CHECK(LENGTH(fingerprint_hash) <= ${INPUT_LIMITS.tokenChars}),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS replay_note_colors (
  note_id TEXT NOT NULL,
  color_token TEXT NOT NULL,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(note_id, color_token),
  FOREIGN KEY(note_id) REFERENCES replay_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replay_note_colors_note
  ON replay_note_colors(note_id, sort_index ASC, color_token ASC);

CREATE INDEX IF NOT EXISTS idx_replay_note_colors_color
  ON replay_note_colors(color_token, note_id);

${backtestSchemaSql}

);
`;
