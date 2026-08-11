// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";

export type ReplayRefVerificationRow = {
  id?: unknown;
  name?: unknown;
  total_trades?: unknown;
  start_ts?: unknown;
  end_ts?: unknown;
  entry_index?: unknown;
  cursor_index?: unknown;
  history_bars?: unknown;
  payload_blob?: unknown;
};

export type ReplayNoteVerificationRow = {
  id?: unknown;
  training_project_id?: unknown;
  context_cursor_index?: unknown;
  cursor_index?: unknown;
};

export type ChallengeSessionVerificationRow = {
  mode_id?: unknown;
  completed_question_count?: unknown;
  decision_seconds_total?: unknown;
  decision_seconds_average?: unknown;
};

export type ChallengeQuestionVerificationRow = {
  mode_id?: unknown;
  window_bar_count?: unknown;
  start_index?: unknown;
  end_index?: unknown;
  used_operations?: unknown;
  max_operations?: unknown;
};

const listReplayRefVerificationRowsStmt = db.prepare(
  `SELECT p.id,p.name,p.total_trades,
          r.start_ts,r.end_ts,r.entry_index,r.cursor_index,r.history_bars,r.payload_blob
     FROM training_projects p
LEFT JOIN training_project_replay_refs r ON r.project_id = p.id
    WHERE p.simulation_batch_id = ?`,
);

const listReplayNoteVerificationRowsStmt = db.prepare(
  `SELECT n.id,n.training_project_id,n.context_cursor_index,r.cursor_index
     FROM replay_notes n
LEFT JOIN training_project_replay_refs r ON r.project_id = n.training_project_id
    WHERE n.simulation_batch_id = ?
      AND n.type = 'FREE_REPLAY'`,
);

const listChallengeSessionVerificationRowsStmt = db.prepare(
  `SELECT mode_id,completed_question_count,decision_seconds_total,decision_seconds_average
     FROM special_training_history_sessions
    WHERE simulation_batch_id = ?`,
);

const listChallengeQuestionVerificationRowsStmt = db.prepare(
  `SELECT q.mode_id,q.window_bar_count,q.start_index,q.end_index,
          q.used_operations,q.max_operations
     FROM special_training_history_questions q
     JOIN special_training_history_sessions s ON s.id = q.session_id
    WHERE s.simulation_batch_id = ?`,
);

export const listReplayRefVerificationRows = (
  batchId: string,
): ReplayRefVerificationRow[] =>
  listReplayRefVerificationRowsStmt.all(batchId) as ReplayRefVerificationRow[];

export const listReplayNoteVerificationRows = (
  batchId: string,
): ReplayNoteVerificationRow[] =>
  listReplayNoteVerificationRowsStmt.all(batchId) as ReplayNoteVerificationRow[];

export const listChallengeSessionVerificationRows = (
  batchId: string,
): ChallengeSessionVerificationRow[] =>
  listChallengeSessionVerificationRowsStmt.all(
    batchId,
  ) as ChallengeSessionVerificationRow[];

export const listChallengeQuestionVerificationRows = (
  batchId: string,
): ChallengeQuestionVerificationRow[] =>
  listChallengeQuestionVerificationRowsStmt.all(
    batchId,
  ) as ChallengeQuestionVerificationRow[];
