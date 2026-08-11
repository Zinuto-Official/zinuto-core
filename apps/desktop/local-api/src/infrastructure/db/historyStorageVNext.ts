// SPDX-License-Identifier: GPL-3.0-only

import { INPUT_LIMITS } from "@zinuto/shared/input-limits";

const SPECIAL_TRAINING_HISTORY_QUESTION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS special_training_history_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_order INTEGER NOT NULL,
  mode_id TEXT NOT NULL CHECK(mode_id IN ('fast-decision-training','risk-discipline-training')),
  source_tag TEXT NOT NULL DEFAULT '' CHECK(LENGTH(source_tag) <= ${INPUT_LIMITS.generalNameChars}),
  symbol TEXT NOT NULL CHECK(LENGTH(symbol) BETWEEN 1 AND ${INPUT_LIMITS.symbolChars}),
  base_timeframe TEXT NOT NULL DEFAULT '1d' CHECK(base_timeframe IN ('1m','5m','1h','1d')),
  effective_timeframe TEXT NOT NULL DEFAULT '1d' CHECK(effective_timeframe IN ('1m','5m','1h','1d')),
  minimum_base_timeframe TEXT NOT NULL DEFAULT '1d' CHECK(minimum_base_timeframe IN ('1m','5m','1h','1d')),
  instrument_id TEXT NOT NULL DEFAULT '',
  bars_version_token TEXT NOT NULL DEFAULT '',
  window_start_ts TEXT,
  window_end_ts TEXT,
  window_bar_count INTEGER NOT NULL DEFAULT 0,
  source_window_bar_count INTEGER NOT NULL DEFAULT 0,
  start_index INTEGER NOT NULL DEFAULT 0,
  end_index INTEGER NOT NULL DEFAULT 0,
  min_trade_step REAL NOT NULL DEFAULT 1,
  settlement_status TEXT NOT NULL CHECK(settlement_status IN ('SETTLED','ABANDONED')),
  score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  initial_total REAL NOT NULL DEFAULT 0,
  total_pnl REAL NOT NULL DEFAULT 0,
  final_total_asset REAL NOT NULL DEFAULT 0,
  return_rate REAL NOT NULL DEFAULT 0,
  used_operations INTEGER NOT NULL DEFAULT 0,
  max_operations INTEGER NOT NULL DEFAULT 0,
  max_drawdown_ratio REAL NOT NULL DEFAULT 0,
  performance_rate REAL NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT '' CHECK(LENGTH(grade) <= ${INPUT_LIMITS.shortCodeChars}),
  detail_blob BLOB,
  detail_encoding TEXT NOT NULL DEFAULT '',
  detail_expired_at TEXT,
  created_at TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, question_order),
  FOREIGN KEY(session_id) REFERENCES special_training_history_sessions(id) ON DELETE CASCADE
);
`;

const SPECIAL_TRAINING_HISTORY_QUESTION_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_session
  ON special_training_history_questions(session_id, question_order ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_mode
  ON special_training_history_questions(mode_id, settled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_symbol
  ON special_training_history_questions(symbol, settled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_base_timeframe
  ON special_training_history_questions(base_timeframe, settled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_effective_timeframe
  ON special_training_history_questions(effective_timeframe, settled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_retention
  ON special_training_history_questions(detail_expired_at, settled_at DESC, id DESC);
`;

export const historyStorageVNextSchemaSql = `
CREATE TABLE IF NOT EXISTS special_training_history_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL UNIQUE,
  bank_id TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '' CHECK(LENGTH(bank_name) <= ${INPUT_LIMITS.specialTrainingBankNameChars}),
  mode_id TEXT NOT NULL CHECK(mode_id IN ('fast-decision-training','risk-discipline-training')),
  simulation_batch_id TEXT,
  source_tag TEXT NOT NULL DEFAULT '' CHECK(LENGTH(source_tag) <= ${INPUT_LIMITS.generalNameChars}),
  timeframe TEXT NOT NULL DEFAULT '1d',
  minimum_base_timeframe TEXT NOT NULL DEFAULT '1d',
  source_timeframe TEXT NOT NULL DEFAULT '1d',
  question_count INTEGER NOT NULL DEFAULT 0,
  completed_question_count INTEGER NOT NULL DEFAULT 0,
  passed_question_count INTEGER NOT NULL DEFAULT 0,
  failed_question_count INTEGER NOT NULL DEFAULT 0,
  missed_question_count INTEGER NOT NULL DEFAULT 0,
  timed_out_question_count INTEGER NOT NULL DEFAULT 0,
  decision_seconds_total REAL NOT NULL DEFAULT 0,
  decision_seconds_average REAL NOT NULL DEFAULT 0,
  max_consecutive_passes INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  session_summary_json BLOB,
  operator_summary_json TEXT NOT NULL DEFAULT 'null',
  created_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_special_training_history_sessions_mode
  ON special_training_history_sessions(mode_id, finished_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_sessions_source_tag
  ON special_training_history_sessions(source_tag, finished_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_sessions_bank
  ON special_training_history_sessions(bank_id, finished_at DESC, id DESC);

${SPECIAL_TRAINING_HISTORY_QUESTION_TABLE_SQL}
${SPECIAL_TRAINING_HISTORY_QUESTION_INDEX_SQL}

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
`;
