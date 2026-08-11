// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { DB_SCHEMA_VERSION } from "../../src/infrastructure/db/database/constants.js";
import { runStartupPreflight } from "../../src/infrastructure/db/database/startupPreflight.js";

const tempDbDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-history-schema-migration-"),
);
const dbPath = path.join(tempDbDir, "zinuto.db");
process.env.ZINUTO_DB_PATH = dbPath;

const previousDb = new Database(dbPath);
const seedTimestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString();

previousDb.exec(`
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE special_training_history_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL UNIQUE,
  mode_id TEXT NOT NULL CHECK(mode_id IN ('fast-decision-training','risk-discipline-training')),
  source_tag TEXT NOT NULL DEFAULT '',
  timeframe TEXT NOT NULL DEFAULT '1d',
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
  operator_summary_json TEXT NOT NULL DEFAULT 'null',
  created_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE special_training_history_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_order INTEGER NOT NULL,
  mode_id TEXT NOT NULL CHECK(mode_id IN ('fast-decision-training','risk-discipline-training')),
  source_tag TEXT NOT NULL DEFAULT '',
  symbol TEXT NOT NULL,
  base_timeframe TEXT NOT NULL DEFAULT '1d' CHECK(base_timeframe IN ('1m','5m','1h','1d')),
  instrument_id TEXT NOT NULL DEFAULT '',
  bars_version_token TEXT NOT NULL DEFAULT '',
  window_start_ts TEXT,
  window_end_ts TEXT,
  window_bar_count INTEGER NOT NULL DEFAULT 0,
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
  grade TEXT NOT NULL DEFAULT '',
  detail_blob BLOB,
  detail_encoding TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, question_order),
  FOREIGN KEY(session_id) REFERENCES special_training_history_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_session
  ON special_training_history_questions(session_id, question_order ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_mode
  ON special_training_history_questions(mode_id, settled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_symbol
  ON special_training_history_questions(symbol, settled_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_special_training_history_questions_base_timeframe
  ON special_training_history_questions(base_timeframe, settled_at DESC, id DESC);
`);

previousDb
  .prepare("INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)")
  .run("db_schema_version", DB_SCHEMA_VERSION, seedTimestamp);
previousDb
  .prepare(
    `INSERT INTO special_training_history_sessions (
      id,user_id,challenge_id,mode_id,source_tag,timeframe,question_count,completed_question_count,
      passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,
      decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,
      operator_summary_json,created_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    "session-1",
    "user-1",
    "challenge-1",
    "fast-decision-training",
    "",
    "5m",
    1,
    1,
    1,
    0,
    0,
    0,
    10,
    10,
    1,
    "{}",
    "null",
    seedTimestamp,
    seedTimestamp,
    seedTimestamp,
  );
previousDb
  .prepare(
    `INSERT INTO special_training_history_questions (
      id,session_id,question_order,mode_id,source_tag,symbol,base_timeframe,instrument_id,bars_version_token,
      window_start_ts,window_end_ts,window_bar_count,start_index,end_index,min_trade_step,settlement_status,
      score,passed,initial_total,total_pnl,final_total_asset,return_rate,used_operations,max_operations,
      max_drawdown_ratio,performance_rate,grade,detail_blob,detail_encoding,created_at,settled_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    "question-1",
    "session-1",
    1,
    "fast-decision-training",
    "",
    "BTCUSDT",
    "5m",
    "",
    "",
    seedTimestamp,
    seedTimestamp,
    42,
    0,
    41,
    1,
    "SETTLED",
    88,
    1,
    1000,
    120,
    1120,
    0.12,
    3,
    5,
    0.03,
    0.9,
    "A",
    null,
    "",
    seedTimestamp,
    seedTimestamp,
    seedTimestamp,
  );
previousDb.close();

test.after(async () => {
  delete process.env.ZINUTO_DB_PATH;
  await fs.promises.rm(tempDbDir, { recursive: true, force: true });
});

test("startup preflight blocks non-current special-training history schema without mutating it during startup", () => {
  const layout = {
    appRootDir: tempDbDir,
    coreDataDir: tempDbDir,
    marketDataDir: tempDbDir,
    cacheDir: path.join(tempDbDir, "cache"),
    tempDir: path.join(tempDbDir, "temp"),
    dbPath,
    marketDbPath: path.join(tempDbDir, "zinuto.market.duckdb"),
    duckdbTempDir: path.join(tempDbDir, "temp", "duckdb-tmp"),
    pathMigrationState: "NOT_NEEDED" as const,
  };

  const result = runStartupPreflight(layout);

  assert.equal(result.mode, "BLOCKED");
  assert.equal(result.startupAllowed, false);
  assert.equal(result.blockReason, "LOCAL_DATA_NEEDS_ATTENTION");
  assert.equal(result.localDataStatus, "NEEDS_ATTENTION");
  assert.equal(result.localDataIssueReason, "SCHEMA_MISMATCH");
  assert.equal(fs.existsSync(dbPath), true);
});
