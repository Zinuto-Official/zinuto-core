// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), 'zinuto-special-training-replay-context-'),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [
  { db, DEFAULT_USER_ID },
  { loadChallengeStatsProjectDetailById },
  { saveSpecialTrainingQuestionSnapshotArchive },
] = await Promise.all([
  import('../../src/infrastructure/db/database.js'),
  import('../../src/infrastructure/db/specialTraining/statsProjectionStore.js'),
  import('../../src/infrastructure/db/specialTraining/historyStore.js'),
]);

test.after(async () => {
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  db.prepare('DELETE FROM replay_note_context_archives').run();
  db.prepare('DELETE FROM replay_note_special_training_context_refs').run();
  db.prepare('DELETE FROM replay_notes').run();
  db.prepare('DELETE FROM special_training_question_snapshot_archives').run();
  db.prepare('DELETE FROM special_training_history_questions').run();
  db.prepare('DELETE FROM special_training_history_sessions').run();
});

const insertSessionStmt = db.prepare(
  `INSERT INTO special_training_history_sessions (
    id,user_id,challenge_id,mode_id,simulation_batch_id,source_tag,timeframe,minimum_base_timeframe,source_timeframe,question_count,completed_question_count,
    passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,
    decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,session_summary_json,operator_summary_json,
    created_at,finished_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const insertQuestionStmt = db.prepare(
  `INSERT INTO special_training_history_questions (
    id,session_id,question_order,mode_id,source_tag,symbol,base_timeframe,effective_timeframe,minimum_base_timeframe,instrument_id,bars_version_token,
    window_start_ts,window_end_ts,window_bar_count,source_window_bar_count,start_index,end_index,min_trade_step,
    settlement_status,score,passed,initial_total,total_pnl,final_total_asset,return_rate,used_operations,max_operations,
    max_drawdown_ratio,performance_rate,grade,detail_blob,detail_encoding,created_at,settled_at,updated_at
  ) VALUES (${Array.from({ length: 35 }, () => '?').join(',')})`,
);

const insertReplayNoteStmt = db.prepare(
  `INSERT INTO replay_notes (
    id,title,type,simulation_batch_id,source_kind,source_id,content_preview,training_project_id,context_display_period,
    has_context_replay,context_session_id,context_cursor_index,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const insertReplayArchiveStmt = db.prepare(
  `INSERT INTO replay_note_context_archives (
    note_id,archive_encoding,archive_payload,source_bytes,archive_bytes,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?)`,
);

const buildOperatorSummary = () =>
  JSON.stringify({
    operatorKind: 'HUMAN',
    operationMode: null,
    operatorSource: null,
    clientLabel: null,
    modelLabel: null,
    runId: null,
    actionCount: 0,
    orderCount: 0,
    decisionCount: 0,
    decisionSecondsUsed: 0,
    nonTradeActionCount: 0,
    errorActionCount: 0,
    forcedLiquidationCount: 0,
  });

const buildBars = () => [
  {
    ts: '2026-01-01T00:00:00.000Z',
    open: 100,
    high: 103,
    low: 99,
    close: 101,
    volume: 1000,
  },
  {
    ts: '2026-01-02T00:00:00.000Z',
    open: 101,
    high: 105,
    low: 100,
    close: 104,
    volume: 1200,
  },
  {
    ts: '2026-01-03T00:00:00.000Z',
    open: 104,
    high: 107,
    low: 103,
    close: 106,
    volume: 900,
  },
];

const seedSpecialTrainingQuestion = (input: {
  sessionId: string;
  questionId: string;
  modeId: 'fast-decision-training' | 'risk-discipline-training';
}) => {
  const createdAt = '2026-01-03T12:00:00.000Z';
  const finishedAt = '2026-01-03T12:15:00.000Z';
  const bars = buildBars();
  insertSessionStmt.run(
    input.sessionId,
    DEFAULT_USER_ID,
    'challenge-special-training',
    input.modeId,
    null,
    '',
    '1d',
    '1d',
    '1d',
    1,
    1,
    1,
    0,
    0,
    0,
    12,
    12,
    1,
    JSON.stringify({ horizonBars: 20, decisionSecondsLimit: 20 }),
    null,
    buildOperatorSummary(),
    createdAt,
    finishedAt,
    finishedAt,
  );
  insertQuestionStmt.run(
    input.questionId,
    input.sessionId,
    1,
    input.modeId,
    '',
    'BTCUSDT',
    '1d',
    '1d',
    '1d',
    '',
    '',
    null,
    null,
    bars.length,
    bars.length,
    0,
    bars.length - 1,
    1,
    'SETTLED',
    100,
    1,
    100000,
    5000,
    105000,
    0.05,
    1,
    1,
    0.02,
    0.8,
    'A',
    JSON.stringify({
      revealEndIndex: bars.length - 1,
      decisionSelection: 'LONG',
      decisionActual: 'LONG',
      decisionCorrect: true,
      decisionTimedOut: false,
      decisionSecondsUsed: 12,
      selectedMfeRatio: 0.08,
      selectedMaeRatio: 0.01,
      selectedMfeMaeRatio: 8,
      opportunityDirection: 'LONG',
      opportunityMfeRatio: 0.08,
      opportunityMaeRatio: 0.01,
      opportunityMfeMaeRatio: 8,
      longMfeRatio: 0.08,
      longMaeRatio: 0.01,
      feedbackCodes: [],
      tradeActions: [],
      fastReview: null,
      riskReview: null,
    }),
    '',
    createdAt,
    finishedAt,
    finishedAt,
  );
  assert.equal(
    saveSpecialTrainingQuestionSnapshotArchive(
      input.questionId,
      { bars },
      finishedAt,
    ),
    true,
  );
};

const insertReplayArchiveNote = (input: {
  noteId: string;
  updatedAt: string;
  trainingProjectId?: string | null;
  contextSessionId?: string | null;
  sourceKind?: string | null;
  sourceId?: string | null;
  replayContext: Record<string, unknown>;
}) => {
  const encoded = gzipSync(JSON.stringify(input.replayContext));
  insertReplayNoteStmt.run(
    input.noteId,
    input.noteId,
    'CHALLENGE',
    null,
    input.sourceKind ?? null,
    input.sourceId ?? null,
    '',
    input.trainingProjectId ?? null,
    null,
    1,
    input.contextSessionId ?? null,
    null,
    input.updatedAt,
    input.updatedAt,
  );
  insertReplayArchiveStmt.run(
    input.noteId,
    'GZIP_BINARY',
    encoded,
    Buffer.byteLength(JSON.stringify(input.replayContext), 'utf-8'),
    encoded.byteLength,
    input.updatedAt,
    input.updatedAt,
  );
};

test('loads the latest review replay context across indexed binding branches', async () => {
  const sessionId = 'session-special-training';
  const questionId = 'question-special-training';

  seedSpecialTrainingQuestion({
    sessionId,
    questionId,
    modeId: 'fast-decision-training',
  });

  insertReplayArchiveNote({
    noteId: 'note-training-project',
    updatedAt: '2026-01-03T12:16:00.000Z',
    trainingProjectId: questionId,
    replayContext: {
      replayBranch: 'training-project',
    },
  });
  insertReplayArchiveNote({
    noteId: 'note-context-session',
    updatedAt: '2026-01-03T12:17:00.000Z',
    contextSessionId: `special-training-review:${questionId}`,
    replayContext: {
      replayBranch: 'context-session',
    },
  });
  insertReplayArchiveNote({
    noteId: 'note-source-id',
    updatedAt: '2026-01-03T12:18:00.000Z',
    sourceKind: 'SPECIAL_TRAINING_QUESTION',
    sourceId: `special-training-history:${questionId}`,
    replayContext: {
      replayBranch: 'source-id',
    },
  });

  const detail = await loadChallengeStatsProjectDetailById(questionId);

  assert.ok(detail);
  const replay = detail.replay as Record<string, unknown>;
  assert.equal(replay.replayBranch, 'source-id');
  const snapshot = replay.snapshot as { session?: { id?: string } } | undefined;
  assert.equal(snapshot?.session?.id, `special-training-history:${questionId}`);
});
