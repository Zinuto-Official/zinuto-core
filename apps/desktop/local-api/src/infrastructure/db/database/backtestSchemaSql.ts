// SPDX-License-Identifier: GPL-3.0-only

import {
  INPUT_LIMITS,
  INPUT_SERIALIZED_LIMITS,
} from "@zinuto/shared/input-limits";

export const backtestSchemaSql = `
CREATE TABLE IF NOT EXISTS custom_indicator_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(LENGTH(name) BETWEEN 1 AND ${INPUT_LIMITS.customIndicatorProfileNameChars}),
  source TEXT NOT NULL CHECK(LENGTH(source) BETWEEN 1 AND ${INPUT_LIMITS.formulaSourceChars}),
  parameter_inputs_json TEXT NOT NULL CHECK(LENGTH(parameter_inputs_json) <= ${INPUT_SERIALIZED_LIMITS.customIndicatorParameterInputsBytes}),
  revisions_json TEXT NOT NULL DEFAULT '[]' CHECK(LENGTH(revisions_json) <= ${INPUT_SERIALIZED_LIMITS.appPreferencesBytes}),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_indicator_profiles_updated_at
  ON custom_indicator_profiles(updated_at DESC, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS backtest_batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(LENGTH(name) BETWEEN 1 AND ${INPUT_LIMITS.generalNameChars}),
  status TEXT NOT NULL CHECK(status IN ('DRAFT','QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  config_json TEXT NOT NULL CHECK(LENGTH(config_json) <= ${INPUT_SERIALIZED_LIMITS.appPreferencesBytes}),
  progress_json TEXT NOT NULL DEFAULT '{}' CHECK(LENGTH(progress_json) <= ${INPUT_SERIALIZED_LIMITS.appPreferencesBytes}),
  summary_json TEXT NOT NULL DEFAULT '{}' CHECK(LENGTH(summary_json) <= ${INPUT_SERIALIZED_LIMITS.appPreferencesBytes}),
  error_code TEXT CHECK(error_code IS NULL OR LENGTH(error_code) <= ${INPUT_LIMITS.shortCodeChars}),
  error_message TEXT CHECK(error_message IS NULL OR LENGTH(error_message) <= ${INPUT_LIMITS.noteTitleChars * 8}),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_backtest_batches_status_updated
  ON backtest_batches(status, updated_at DESC, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  timeframe TEXT NOT NULL CHECK(LENGTH(timeframe) BETWEEN 1 AND ${INPUT_LIMITS.shortCodeChars}),
  bars_count INTEGER NOT NULL DEFAULT 0,
  final_equity REAL NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  profit_rate REAL NOT NULL DEFAULT 0,
  max_drawdown REAL NOT NULL DEFAULT 0,
  win_rate REAL NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}' CHECK(LENGTH(summary_json) <= ${INPUT_SERIALIZED_LIMITS.appPreferencesBytes}),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES backtest_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_results_batch_symbol
  ON backtest_results(batch_id, symbol, timeframe, id DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_results_instrument_id
  ON backtest_results(instrument_id);

CREATE TABLE IF NOT EXISTS backtest_fills (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  order_id TEXT NOT NULL CHECK(LENGTH(order_id) BETWEEN 1 AND ${INPUT_LIMITS.idChars}),
  fill_index INTEGER NOT NULL DEFAULT 0,
  fill_time TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  price REAL NOT NULL DEFAULT 0,
  qty REAL NOT NULL DEFAULT 0,
  gross REAL NOT NULL DEFAULT 0,
  fee REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  slippage REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES backtest_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(result_id) REFERENCES backtest_results(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_fills_batch_result_index
  ON backtest_fills(batch_id, result_id, fill_index, id);

CREATE INDEX IF NOT EXISTS idx_backtest_fills_result_index
  ON backtest_fills(result_id, fill_index, id);

CREATE INDEX IF NOT EXISTS idx_backtest_fills_instrument_id
  ON backtest_fills(instrument_id);

CREATE TABLE IF NOT EXISTS backtest_equity_curve (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  bar_index INTEGER NOT NULL DEFAULT 0,
  bar_time TEXT NOT NULL,
  equity REAL NOT NULL DEFAULT 0,
  drawdown REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(batch_id) REFERENCES backtest_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(result_id) REFERENCES backtest_results(id) ON DELETE CASCADE,
  FOREIGN KEY(instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
  UNIQUE(result_id, bar_index)
);

CREATE INDEX IF NOT EXISTS idx_backtest_equity_curve_batch_result_index
  ON backtest_equity_curve(batch_id, result_id, bar_index);

CREATE INDEX IF NOT EXISTS idx_backtest_equity_curve_instrument_id
  ON backtest_equity_curve(instrument_id);

CREATE TABLE IF NOT EXISTS cash_transfers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_account_id TEXT NOT NULL,
  to_account_id TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(from_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(to_account_id) REFERENCES accounts(id) ON DELETE CASCADE

`;
