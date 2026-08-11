// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SPECIAL_TRAINING_HISTORY_QUESTION_DETAIL_ENCODING,
  encodeSpecialTrainingHistoryQuestionDetailPayload,
} from "../../src/infrastructure/db/specialTrainingHistoryQuestionDetailStorage.js";

const tempDataDir = await fs.promises.mkdtemp(
  path.join(os.tmpdir(), "zinuto-history-retention-"),
);
process.env.ZINUTO_DATA_DIR = tempDataDir;

const [
  { db },
  { DEFAULT_USER_ID },
  historyRetentionService,
  historyRetentionStore,
] = await Promise.all([
  import("../../src/infrastructure/db/database.js"),
  import("../../src/infrastructure/db/defaults.js"),
  import("../../src/application/historyRetentionService.js"),
  import("../../src/infrastructure/db/history/historyRetentionStore.js"),
]);

const {
  applyHistoryRetentionPolicy,
  getHistoryRetentionJob,
  getHistoryRetentionPolicy,
  previewHistoryRetentionPolicy,
  updateHistoryRetentionPolicy,
} = historyRetentionService;

const OLD_DATE = "2000-01-01T00:00:00.000Z";
const NEW_DATE = "2999-01-01T00:00:00.000Z";

const countRows = (tableName: string, whereSql = "1 = 1", ...params: unknown[]): number => {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereSql}`)
    .get(...params) as { count?: unknown } | undefined;
  return Math.max(0, Math.floor(Number(row?.count ?? 0)));
};

const tableExists = (tableName: string): boolean =>
  countRows("sqlite_master", "type = 'table' AND name = ?", tableName) > 0;

const deleteAllRows = (tableName: string): void => {
  if (!tableExists(tableName)) {
    return;
  }
  db.prepare(`DELETE FROM ${tableName}`).run();
};

const resetRetentionFixtures = (): void => {
  [
    "replay_notes_fts",
    "replay_note_attachments",
    "replay_note_contents",
    "replay_note_colors",
    "replay_note_meta",
    "replay_note_context_archives",
    "replay_note_special_training_context_refs",
    "replay_note_context_refs",
    "replay_notes",
    "special_training_stats_projection",
    "special_training_question_snapshot_archives",
    "special_training_question_draw_cursors",
    "special_training_question_scope_indexes",
    "special_training_question_ledger",
    "special_training_history_questions",
    "special_training_history_sessions",
    "training_project_portable_previews",
    "training_project_replay_refs",
    "training_stats_sessions",
    "training_projects",
    "history_retention_policy",
  ].forEach(deleteAllRows);
};

const seedTrainingProject = (projectId: string, createdAt = OLD_DATE): void => {
  db.prepare(
    `INSERT INTO training_projects (
      id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,
      training_date_range,initial_total,total_pnl,profit_rate,duration_days,total_trades,
      final_equity,equity_return_rate,simulation_batch_id,source_tag,summary_json,operator_summary_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    projectId,
    "Old Replay",
    createdAt,
    createdAt,
    "AAPL",
    "pool-1",
    "Pool 1",
    "1d",
    "1999-01-01 ~ 1999-01-02",
    1000,
    120,
    0.12,
    1,
    2,
    1120,
    0.12,
    null,
    "",
    JSON.stringify({ totalPnl: 120, totalTrades: 2 }),
    "null",
  );
  db.prepare(
    `INSERT INTO training_stats_sessions (
      project_id,name,created_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,
      training_date_range,initial_total,total_pnl,profit_rate,duration_days,total_trades,
      final_equity,generated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    projectId,
    "Old Replay",
    createdAt,
    "AAPL",
    "pool-1",
    "Pool 1",
    "1d",
    "1999-01-01 ~ 1999-01-02",
    1000,
    120,
    0.12,
    1,
    2,
    1120,
    createdAt,
  );
};

const seedTrainingReplayPayloads = (projectId: string): void => {
  db.prepare(
    `INSERT INTO training_project_replay_refs (
      project_id,base_timeframe,instrument_id,bars_version_token,start_ts,end_ts,entry_index,
      cursor_index,history_bars,settings_json,payload_blob,payload_encoding,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    projectId,
    "1d",
    "instrument-1",
    "bars-v1",
    OLD_DATE,
    OLD_DATE,
    0,
    1,
    240,
    "{}",
    Buffer.from("replay-payload"),
    "GZIP_JSON_V1",
    OLD_DATE,
    OLD_DATE,
  );
  db.prepare(
    `INSERT INTO training_project_portable_previews (
      project_id,source_manifest_hash,preview_encoding,preview_payload,source_bytes,preview_bytes,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    projectId,
    "manifest-1",
    "GZIP_JSON_V1",
    Buffer.from("portable-preview"),
    64,
    16,
    OLD_DATE,
    OLD_DATE,
  );
};

const seedReplayNoteWithContext = (noteId: string, projectId: string): void => {
  db.prepare(
    `INSERT INTO replay_notes (
      id,title,type,simulation_batch_id,source_kind,source_id,content_preview,training_project_id,
      context_display_period,has_context_replay,context_expired_at,context_session_id,
      context_cursor_index,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    noteId,
    "Old Note",
    "FREE_REPLAY",
    null,
    null,
    null,
    "Body stays",
    projectId,
    "1d",
    1,
    null,
    "session-1",
    1,
    OLD_DATE,
    OLD_DATE,
  );
  db.prepare(
    `INSERT INTO replay_note_contents (
      note_id,document_schema_version,document_encoding,document_payload,document_hash,
      content_preview,text_chars,payload_bytes,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    noteId,
    1,
    "GZIP_JSON_V1",
    Buffer.from("note-body"),
    "hash-1",
    "Body stays",
    10,
    9,
    OLD_DATE,
  );
  db.prepare(
    "INSERT INTO replay_notes_fts (note_id,title,content) VALUES (?,?,?)",
  ).run(noteId, "Old Note", "Body stays");
  db.prepare(
    `INSERT INTO replay_note_context_refs (
      note_id,training_project_id,context_cursor_index,window_bars,created_at,updated_at
    ) VALUES (?,?,?,?,?,?)`,
  ).run(noteId, projectId, 1, 240, OLD_DATE, OLD_DATE);
  db.prepare(
    `INSERT INTO replay_note_context_archives (
      note_id,archive_encoding,archive_payload,source_bytes,archive_bytes,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?)`,
  ).run(noteId, "GZIP_BINARY", Buffer.from("archived-context"), 128, 16, OLD_DATE, OLD_DATE);
};

const seedSpecialTrainingQuestion = (questionId: string): void => {
  db.prepare(
    `INSERT INTO special_training_history_sessions (
      id,user_id,challenge_id,bank_id,bank_name,mode_id,simulation_batch_id,source_tag,
      timeframe,minimum_base_timeframe,source_timeframe,question_count,completed_question_count,
      passed_question_count,failed_question_count,missed_question_count,timed_out_question_count,
      decision_seconds_total,decision_seconds_average,max_consecutive_passes,config_json,
      session_summary_json,operator_summary_json,created_at,finished_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "special-session-1",
    DEFAULT_USER_ID,
    "challenge-1",
    "bank-1",
    "Bank 1",
    "fast-decision-training",
    null,
    "",
    "1d",
    "1d",
    "1d",
    1,
    1,
    1,
    0,
    0,
    0,
    12,
    12,
    1,
    "{}",
    null,
    "null",
    OLD_DATE,
    OLD_DATE,
    OLD_DATE,
  );
  db.prepare(
    `INSERT INTO special_training_history_questions (
      id,session_id,question_order,mode_id,source_tag,symbol,base_timeframe,effective_timeframe,
      minimum_base_timeframe,instrument_id,bars_version_token,window_start_ts,window_end_ts,
      window_bar_count,source_window_bar_count,start_index,end_index,min_trade_step,
      settlement_status,score,passed,initial_total,total_pnl,final_total_asset,return_rate,
      used_operations,max_operations,max_drawdown_ratio,performance_rate,grade,detail_blob,
      detail_encoding,detail_expired_at,created_at,settled_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    questionId,
    "special-session-1",
    1,
    "fast-decision-training",
    "",
    "MSFT",
    "1d",
    "1d",
    "1d",
    "instrument-2",
    "bars-v1",
    OLD_DATE,
    OLD_DATE,
    30,
    30,
    0,
    29,
    1,
    "SETTLED",
    88,
    1,
    1000,
    80,
    1080,
    0.08,
    2,
    5,
    0.03,
    0.9,
    "A",
    encodeSpecialTrainingHistoryQuestionDetailPayload({
      cursorIndex: 10,
      revealEndIndex: 29,
      tradeActionCount: 2,
      decisionSelection: "LONG",
      decisionActual: "LONG",
      decisionCorrect: true,
      decisionTimedOut: false,
      decisionSecondsUsed: 12,
      strictnessLevel: null,
      dominanceRatio: null,
      selectedMfeRatio: null,
      selectedMaeRatio: null,
      selectedMfeMaeRatio: 1.8,
      opportunityDirection: "LONG",
      opportunityMfeRatio: null,
      opportunityMaeRatio: null,
      opportunityMfeMaeRatio: 2.1,
      longMfeRatio: null,
      longMaeRatio: null,
      recoveryRate: null,
      alpha: null,
      captureRate: null,
      firstActionBars: 3,
      riskBehavior: "FOLLOW_PLAN",
      riskReviewGrade: "A",
      feedbackCodes: [],
      tradeActions: [
        {
          type: "BUY",
          barIndex: 3,
          inputMode: "RATIO",
          priceMode: "CUR_CLOSE",
          ratioInput: "50",
          quantity: 0,
          executionPrice: 0,
          cashEffect: 0,
        },
        {
          type: "SELL",
          barIndex: 12,
          inputMode: "RATIO",
          priceMode: "CUR_CLOSE",
          ratioInput: "50",
          quantity: 0,
          executionPrice: 0,
          cashEffect: 0,
        },
      ],
      riskReview: { equityCurves: { user: [1000, 1080] } },
      fastReview: null,
    }),
    SPECIAL_TRAINING_HISTORY_QUESTION_DETAIL_ENCODING,
    null,
    OLD_DATE,
    OLD_DATE,
    OLD_DATE,
  );
  db.prepare(
    `INSERT INTO special_training_question_snapshot_archives (
      question_id,source_manifest_hash,snapshot_encoding,snapshot_payload,source_bytes,snapshot_bytes,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    questionId,
    "manifest-2",
    "GZIP_JSON_V1",
    Buffer.from("snapshot"),
    128,
    24,
    OLD_DATE,
    OLD_DATE,
  );
};

const seedSpecialTrainingLedgerRow = (input: {
  id: string;
  status: "ASSIGNED" | "SETTLED" | "ABANDONED";
  updatedAt: string;
  slotIndex?: number;
}): void => {
  db.prepare(
    `INSERT INTO special_training_question_ledger (
      id,user_id,bank_id,mode_id,scope_hash,instrument_id,symbol,timeframe,
      minimum_base_timeframe,source_timeframe,slot_index,status,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    input.id,
    DEFAULT_USER_ID,
    "bank-retention",
    "fast-decision-training",
    "scope-retention",
    "instrument-retention",
    "RETENTION.TEST",
    "1d",
    "1d",
    "1d",
    input.slotIndex ?? 0,
    input.status,
    input.updatedAt,
    input.updatedAt,
  );
};

test.after(async () => {
  db.close();
  delete process.env.ZINUTO_DATA_DIR;
  await fs.promises.rm(tempDataDir, { recursive: true, force: true });
});

test.beforeEach(() => {
  resetRetentionFixtures();
});

test("history retention defaults to one year and FOREVER keeps retained details", () => {
  seedTrainingProject("project-forever");
  seedTrainingReplayPayloads("project-forever");
  seedSpecialTrainingLedgerRow({
    id: "ledger-forever-settled",
    status: "SETTLED",
    updatedAt: OLD_DATE,
  });
  seedSpecialTrainingLedgerRow({
    id: "ledger-forever-assigned",
    status: "ASSIGNED",
    updatedAt: OLD_DATE,
    slotIndex: 1,
  });

  const defaultPolicy = getHistoryRetentionPolicy();
  assert.equal(defaultPolicy.retentionWindow, "ONE_YEAR");
  assert.deepEqual(defaultPolicy.targets, {
    freeReplayDetails: true,
    challengeDetails: true,
    noteText: false,
  });

  const updatedPolicy = updateHistoryRetentionPolicy({
    retentionWindow: "FOREVER",
    targets: {
      freeReplayDetails: true,
      challengeDetails: true,
      noteText: true,
    },
  });
  assert.equal(updatedPolicy.retentionWindow, "FOREVER");
  assert.equal(updatedPolicy.targets.noteText, true);
  const preview = previewHistoryRetentionPolicy();
  assert.equal(preview.cutoffAt, null);
  assert.equal(preview.estimated.totalRows, 0);

  const result = applyHistoryRetentionPolicy();
  assert.equal(result.deleted.totalRows, 0);
  assert.ok(getHistoryRetentionPolicy().lastAppliedAt);
  assert.equal(countRows("training_project_replay_refs", "project_id = ?", "project-forever"), 1);
  assert.equal(countRows("training_projects", "id = ? AND detail_expired_at IS NULL", "project-forever"), 1);
  assert.equal(countRows("special_training_question_ledger", "id = ?", "ledger-forever-settled"), 1);
  assert.equal(countRows("special_training_question_ledger", "id = ?", "ledger-forever-assigned"), 0);
});

test("free replay retention expires details while keeping stats and note text", () => {
  seedTrainingProject("project-old");
  seedTrainingReplayPayloads("project-old");
  seedReplayNoteWithContext("note-old-context", "project-old");

  updateHistoryRetentionPolicy({
    retentionWindow: "ONE_YEAR",
    targets: {
      freeReplayDetails: true,
      challengeDetails: false,
      noteText: false,
    },
  });
  const preview = previewHistoryRetentionPolicy();
  assert.equal(preview.estimated.freeReplayDetails.rows, 1);

  const result = applyHistoryRetentionPolicy();
  assert.equal(result.deleted.freeReplayDetails.rows, 1);
  assert.equal(countRows("training_projects", "id = ?", "project-old"), 1);
  assert.equal(countRows("training_stats_sessions", "project_id = ?", "project-old"), 1);
  assert.equal(countRows("training_projects", "id = ? AND detail_expired_at IS NOT NULL", "project-old"), 1);
  assert.equal(countRows("training_project_replay_refs", "project_id = ?", "project-old"), 0);
  assert.equal(countRows("training_project_portable_previews", "project_id = ?", "project-old"), 0);
  assert.equal(countRows("replay_notes", "id = ?", "note-old-context"), 1);
  assert.equal(countRows("replay_note_contents", "note_id = ?", "note-old-context"), 1);
  assert.equal(countRows("replay_notes_fts", "note_id = ?", "note-old-context"), 1);
  assert.equal(countRows("replay_note_context_refs", "note_id = ?", "note-old-context"), 0);
  assert.equal(countRows("replay_note_context_archives", "note_id = ?", "note-old-context"), 0);
  assert.equal(
    countRows(
      "replay_notes",
      "id = ? AND has_context_replay = 0 AND context_expired_at IS NOT NULL",
      "note-old-context",
    ),
    1,
  );
});

test("history retention deadline guard rolls back the whole deletion transaction", () => {
  seedTrainingProject("project-deadline-rollback");
  seedTrainingReplayPayloads("project-deadline-rollback");
  updateHistoryRetentionPolicy({
    retentionWindow: "ONE_YEAR",
    targets: {
      freeReplayDetails: true,
      challengeDetails: false,
      noteText: false,
    },
  });
  const preview = previewHistoryRetentionPolicy();
  assert.ok(preview.cutoffAt);
  let deadlineChecks = 0;

  assert.throws(
    () =>
      historyRetentionStore.applyHistoryRetentionPolicyData({
        policy: getHistoryRetentionPolicy(),
        cutoffAt: preview.cutoffAt as string,
        estimated: preview.estimated,
        appliedAt: new Date().toISOString(),
        assertCanContinue: () => {
          deadlineChecks += 1;
          if (deadlineChecks === 2) {
            const error = new Error("HISTORY_RETENTION_MAINTENANCE_TIMEOUT");
            error.name = "HistoryRetentionMaintenanceTimeoutError";
            throw error;
          }
        },
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "HistoryRetentionMaintenanceTimeoutError",
  );

  assert.equal(deadlineChecks, 2);
  assert.equal(
    countRows(
      "training_project_replay_refs",
      "project_id = ?",
      "project-deadline-rollback",
    ),
    1,
  );
  assert.equal(
    countRows(
      "training_projects",
      "id = ? AND detail_expired_at IS NULL",
      "project-deadline-rollback",
    ),
    1,
  );
});

test("free replay retention removes expired project rows after stats rollup window", () => {
  seedTrainingProject("project-expired");
  db.prepare("UPDATE training_projects SET detail_expired_at = ? WHERE id = ?").run(
    OLD_DATE,
    "project-expired",
  );

  updateHistoryRetentionPolicy({
    retentionWindow: "ONE_YEAR",
    targets: {
      freeReplayDetails: true,
      challengeDetails: false,
      noteText: false,
    },
  });
  const result = applyHistoryRetentionPolicy();

  assert.equal(result.deleted.freeReplayDetails.rows, 1);
  assert.ok(result.deleted.freeReplayDetails.bytes > result.deleted.freeReplayDetails.rows);
  assert.equal(countRows("training_projects", "id = ?", "project-expired"), 0);
  assert.equal(countRows("training_stats_sessions", "project_id = ?", "project-expired"), 0);
  // Aggregates are rebuilt only after the expired project rows are removed,
  // so the deleted session is never counted.
  assert.equal(countRows("training_stats_monthly", "period = ?", "2000-01"), 0);
  assert.equal(countRows("training_stats_pool", "sample_pool_id = ?", "pool-1"), 0);
});

test("expired project deletion rolls back when its aggregate rebuild fails", () => {
  seedTrainingProject("project-rebuild-failure");
  seedTrainingProject("project-rebuild-survivor", NEW_DATE);
  db.prepare("UPDATE training_projects SET detail_expired_at = ? WHERE id = ?").run(
    OLD_DATE,
    "project-rebuild-failure",
  );
  db.prepare(
    `INSERT INTO training_stats_monthly (
       period,session_count,win_count,total_pnl,total_initial,max_drawdown_rate,updated_at
     ) VALUES (?,?,?,?,?,?,?)`,
  ).run("2000-01", 1, 1, 120, 1000, 0, OLD_DATE);
  updateHistoryRetentionPolicy({
    retentionWindow: "ONE_YEAR",
    targets: {
      freeReplayDetails: true,
      challengeDetails: false,
      noteText: false,
    },
  });
  db.exec(`
    CREATE TRIGGER retention_rebuild_failure
    BEFORE INSERT ON training_stats_monthly
    BEGIN
      SELECT RAISE(ABORT, 'RETENTION_REBUILD_FAILED');
    END
  `);

  try {
    assert.throws(
      () => applyHistoryRetentionPolicy(),
      /RETENTION_REBUILD_FAILED/u,
    );
  } finally {
    db.exec("DROP TRIGGER IF EXISTS retention_rebuild_failure");
  }

  assert.equal(countRows("training_projects", "id = ?", "project-rebuild-failure"), 1);
  assert.equal(
    countRows("training_stats_sessions", "project_id = ?", "project-rebuild-failure"),
    1,
  );
  assert.equal(countRows("training_stats_monthly", "period = ?", "2000-01"), 1);
});

test("challenge retention projects stats before removing question detail and snapshots", () => {
  seedSpecialTrainingQuestion("question-old");

  updateHistoryRetentionPolicy({
    retentionWindow: "ONE_YEAR",
    targets: {
      freeReplayDetails: false,
      challengeDetails: true,
      noteText: false,
    },
  });
  const result = applyHistoryRetentionPolicy();

  assert.equal(result.deleted.challengeDetails.rows, 1);
  assert.equal(countRows("special_training_history_questions", "id = ?", "question-old"), 1);
  assert.equal(
    countRows(
      "special_training_history_questions",
      "id = ? AND detail_blob IS NULL AND detail_expired_at IS NOT NULL",
      "question-old",
    ),
    1,
  );
  assert.equal(countRows("special_training_question_snapshot_archives", "question_id = ?", "question-old"), 0);
  const projection = db
    .prepare(
      `SELECT project_id,total_trades,return_rate,detail_expired_at
         FROM special_training_stats_projection
        WHERE project_id = ?`,
    )
    .get("question-old") as
    | {
        project_id: string;
        total_trades: number;
        return_rate: number;
        detail_expired_at: string;
      }
    | undefined;
  assert.equal(projection?.project_id, "question-old");
  assert.equal(projection?.total_trades, 2);
  assert.equal(projection?.return_rate, 0.08);
  assert.ok(projection?.detail_expired_at);
});

test("challenge retention prunes stale stats projections after detail expiry window", () => {
  seedSpecialTrainingQuestion("question-projection-old");

  updateHistoryRetentionPolicy({
    retentionWindow: "ONE_YEAR",
    targets: {
      freeReplayDetails: false,
      challengeDetails: true,
      noteText: false,
    },
  });
  applyHistoryRetentionPolicy();
  db.prepare(
    `UPDATE special_training_stats_projection
        SET detail_expired_at = ?
      WHERE project_id = ?`,
  ).run(OLD_DATE, "question-projection-old");

  const result = applyHistoryRetentionPolicy();

  assert.equal(result.deleted.challengeDetails.rows, 1);
  assert.ok(result.deleted.challengeDetails.bytes > result.deleted.challengeDetails.rows);
  assert.equal(
    countRows(
      "special_training_stats_projection",
      "project_id = ?",
      "question-projection-old",
    ),
    0,
  );
});

test("history retention compacts special training ledger without deleting challenge history", () => {
  seedSpecialTrainingQuestion("question-ledger-history");
  seedSpecialTrainingLedgerRow({
    id: "ledger-old-settled",
    status: "SETTLED",
    updatedAt: OLD_DATE,
  });
  seedSpecialTrainingLedgerRow({
    id: "ledger-old-abandoned",
    status: "ABANDONED",
    updatedAt: OLD_DATE,
    slotIndex: 1,
  });
  seedSpecialTrainingLedgerRow({
    id: "ledger-new-settled",
    status: "SETTLED",
    updatedAt: NEW_DATE,
    slotIndex: 2,
  });
  seedSpecialTrainingLedgerRow({
    id: "ledger-old-assigned",
    status: "ASSIGNED",
    updatedAt: OLD_DATE,
    slotIndex: 3,
  });
  seedSpecialTrainingLedgerRow({
    id: "ledger-new-assigned",
    status: "ASSIGNED",
    updatedAt: NEW_DATE,
    slotIndex: 4,
  });

  updateHistoryRetentionPolicy({
    retentionWindow: "ONE_YEAR",
    targets: {
      freeReplayDetails: false,
      challengeDetails: false,
      noteText: false,
    },
  });
  const result = applyHistoryRetentionPolicy();

  assert.equal(result.deleted.totalRows, 0);
  assert.equal(countRows("special_training_question_ledger", "id = ?", "ledger-old-settled"), 0);
  assert.equal(countRows("special_training_question_ledger", "id = ?", "ledger-old-abandoned"), 0);
  assert.equal(countRows("special_training_question_ledger", "id = ?", "ledger-old-assigned"), 0);
  assert.equal(countRows("special_training_question_ledger", "id = ?", "ledger-new-settled"), 1);
  assert.equal(countRows("special_training_question_ledger", "id = ?", "ledger-new-assigned"), 1);
  assert.equal(countRows("special_training_history_questions", "id = ?", "question-ledger-history"), 1);
  assert.equal(
    countRows(
      "special_training_history_questions",
      "id = ? AND detail_blob IS NOT NULL AND detail_expired_at IS NULL",
      "question-ledger-history",
    ),
    1,
  );
  assert.equal(
    countRows(
      "special_training_question_snapshot_archives",
      "question_id = ?",
      "question-ledger-history",
    ),
    1,
  );
});

test("note text target deletes only stale notes and clears search rows", () => {
  seedTrainingProject("project-note-fresh", NEW_DATE);
  seedReplayNoteWithContext("note-stale", "project-note-fresh");
  db.prepare("UPDATE replay_notes SET updated_at = ? WHERE id = ?").run(OLD_DATE, "note-stale");
  db.prepare("UPDATE replay_note_contents SET updated_at = ? WHERE note_id = ?").run(OLD_DATE, "note-stale");
  db.prepare(
    `INSERT INTO replay_note_attachments (
      note_id,attachment_ref_id,attachment_kind,summary_json,ref_kind,ref_id,
      payload_encoding,payload_blob,source_bytes,payload_bytes,sort_index,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "note-stale",
    "attachment-stale",
    "CAPSULE",
    JSON.stringify({ label: "stale attachment" }),
    null,
    null,
    "GZIP_JSON_V1",
    Buffer.from("stale-attachment-payload"),
    128,
    24,
    0,
    OLD_DATE,
    OLD_DATE,
  );
  db.prepare(
    `INSERT INTO replay_note_meta (
      note_id,meta_json,meta_summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?)`,
  ).run(
    "note-stale",
    JSON.stringify({ body: "stale meta" }),
    JSON.stringify({ summary: "stale" }),
    OLD_DATE,
    OLD_DATE,
  );

  db.prepare(
    `INSERT INTO replay_notes (
      id,title,type,simulation_batch_id,source_kind,source_id,content_preview,training_project_id,
      context_display_period,has_context_replay,context_expired_at,context_session_id,
      context_cursor_index,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "note-fresh",
    "Fresh Note",
    "CUSTOM",
    null,
    null,
    null,
    "Fresh body",
    null,
    null,
    0,
    null,
    null,
    null,
    NEW_DATE,
    NEW_DATE,
  );
  db.prepare(
    `INSERT INTO replay_note_contents (
      note_id,document_schema_version,document_encoding,document_payload,document_hash,
      content_preview,text_chars,payload_bytes,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run("note-fresh", 1, "GZIP_JSON_V1", Buffer.from("fresh"), "hash-2", "Fresh body", 10, 5, NEW_DATE);
  db.prepare(
    "INSERT INTO replay_notes_fts (note_id,title,content) VALUES (?,?,?)",
  ).run("note-fresh", "Fresh Note", "Fresh body");

  updateHistoryRetentionPolicy({
    retentionWindow: "ONE_YEAR",
    targets: {
      freeReplayDetails: false,
      challengeDetails: false,
      noteText: true,
    },
  });
  const result = applyHistoryRetentionPolicy();

  assert.equal(result.deleted.noteText.rows, 1);
  assert.ok(result.deleted.noteText.bytes > result.deleted.noteText.rows);
  assert.equal(countRows("replay_notes", "id = ?", "note-stale"), 0);
  assert.equal(countRows("replay_notes_fts", "note_id = ?", "note-stale"), 0);
  assert.equal(countRows("replay_note_contents", "note_id = ?", "note-stale"), 0);
  assert.equal(countRows("replay_note_attachments", "note_id = ?", "note-stale"), 0);
  assert.equal(countRows("replay_note_context_archives", "note_id = ?", "note-stale"), 0);
  assert.equal(countRows("replay_note_meta", "note_id = ?", "note-stale"), 0);
  assert.equal(countRows("replay_notes", "id = ?", "note-fresh"), 1);
  assert.equal(countRows("replay_notes_fts", "note_id = ?", "note-fresh"), 1);
});

test("history retention job lookup rejects missing jobs with stable code", () => {
  assert.throws(
    () => getHistoryRetentionJob("missing-job"),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "HISTORY_RETENTION_JOB_NOT_FOUND");
      return true;
    },
  );
  assert.throws(
    () => getHistoryRetentionJob("  "),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "HISTORY_RETENTION_JOB_NOT_FOUND");
      return true;
    },
  );
});
