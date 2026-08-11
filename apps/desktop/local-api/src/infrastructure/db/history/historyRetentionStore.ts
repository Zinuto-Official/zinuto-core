// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";
import { DEFAULT_USER_ID } from "../defaults.js";
import { compactQuestionLedgerByRetentionWindow } from "../specialTraining/questionLedgerStore.js";
import { upsertSpecialTrainingStatsProjectionRowsForQuestions } from "../specialTraining/statsProjectionStore.js";
import { rebuildTrainingStatsAggregatesTables } from "../training/statsRepository.js";
import type {
  HistoryRetentionImpact,
  HistoryRetentionImpactSummary,
  HistoryRetentionPolicy,
  HistoryRetentionTargets,
} from "../../../domain/historyRetentionTypes.js";

export type HistoryRetentionPolicyRow = {
  retention_window?: unknown;
  free_replay_details_enabled?: unknown;
  challenge_details_enabled?: unknown;
  note_text_enabled?: unknown;
  updated_at?: unknown;
  last_applied_at?: unknown;
};

type ApplyHistoryRetentionPolicyDataInput = {
  policy: HistoryRetentionPolicy;
  cutoffAt: string;
  estimated: HistoryRetentionImpactSummary;
  appliedAt: string;
  assertCanContinue?: () => void;
};

const EMPTY_IMPACT: HistoryRetentionImpact = {
  rows: 0,
  bytes: 0,
};

const TRAINING_PROJECT_BASE_BYTES = 1_024;
const TRAINING_STATS_FACT_BASE_BYTES = 1_536;
const TRAINING_PROJECT_REPLAY_FILL_BYTES = 160;
const TRAINING_PROJECT_REPLAY_CASH_ADJUSTMENT_BYTES = 128;
const SPECIAL_TRAINING_STATS_PROJECTION_BYTES = 1_536;

const toNonNegativeInteger = (value: unknown): number => {
  const numeric = Math.floor(Number(value) || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const impact = (rows: unknown, bytes: unknown): HistoryRetentionImpact => ({
  rows: toNonNegativeInteger(rows),
  bytes: toNonNegativeInteger(bytes),
});

const summarizeHistoryRetentionImpact = (
  value: Partial<Record<keyof HistoryRetentionTargets, HistoryRetentionImpact>>,
): HistoryRetentionImpactSummary => {
  const freeReplayDetails = value.freeReplayDetails ?? EMPTY_IMPACT;
  const challengeDetails = value.challengeDetails ?? EMPTY_IMPACT;
  const noteText = value.noteText ?? EMPTY_IMPACT;
  return {
    freeReplayDetails,
    challengeDetails,
    noteText,
    totalRows:
      freeReplayDetails.rows +
      challengeDetails.rows +
      noteText.rows,
    totalBytes:
      freeReplayDetails.bytes +
      challengeDetails.bytes +
      noteText.bytes,
  };
};

export const ensureHistoryRetentionPolicyRow = (
  timestamp: string,
): HistoryRetentionPolicyRow => {
  db.prepare(
    `INSERT OR IGNORE INTO history_retention_policy (
      user_id,retention_window,free_replay_details_enabled,challenge_details_enabled,note_text_enabled,updated_at,last_applied_at
    ) VALUES (?,?,?,?,?,?,NULL)`,
  ).run(DEFAULT_USER_ID, "ONE_YEAR", 1, 1, 0, timestamp);
  const row = db
    .prepare(
      `SELECT retention_window,free_replay_details_enabled,challenge_details_enabled,note_text_enabled,updated_at,last_applied_at
         FROM history_retention_policy
        WHERE user_id = ?
        LIMIT 1`,
    )
    .get(DEFAULT_USER_ID) as HistoryRetentionPolicyRow | undefined;
  return row ?? { updated_at: timestamp };
};

export const updateHistoryRetentionPolicyRow = (
  policy: HistoryRetentionPolicy,
  updatedAt: string,
): void => {
  db.prepare(
    `UPDATE history_retention_policy
        SET retention_window = ?,
            free_replay_details_enabled = ?,
            challenge_details_enabled = ?,
            note_text_enabled = ?,
            updated_at = ?
      WHERE user_id = ?`,
  ).run(
    policy.retentionWindow,
    policy.targets.freeReplayDetails ? 1 : 0,
    policy.targets.challengeDetails ? 1 : 0,
    policy.targets.noteText ? 1 : 0,
    updatedAt,
    DEFAULT_USER_ID,
  );
};

const countFreeReplayDetailsImpact = (cutoffAt: string): HistoryRetentionImpact => {
  const row = db
    .prepare(
      `WITH stale_detail_projects AS (
         SELECT p.id
           FROM training_projects p
          WHERE p.created_at < ?
            AND p.detail_expired_at IS NULL
       ),
       stale_expired_projects AS (
         SELECT p.id
           FROM training_projects p
          WHERE p.detail_expired_at IS NOT NULL
            AND p.detail_expired_at < ?
       )
       SELECT
         (SELECT COUNT(*) FROM stale_detail_projects) +
         (SELECT COUNT(*) FROM stale_expired_projects) AS rows,
         COALESCE((
           SELECT SUM(
             COALESCE(LENGTH(r.payload_blob), 0) +
             COALESCE(v.preview_bytes, LENGTH(v.preview_payload), 0) +
             COALESCE((SELECT COUNT(*) FROM training_project_replay_fills f WHERE f.project_id = p.id), 0) * ? +
             COALESCE((SELECT COUNT(*) FROM training_project_replay_cash_adjustments c WHERE c.project_id = p.id), 0) * ?
           )
             FROM training_projects p
             LEFT JOIN training_project_replay_refs r ON r.project_id = p.id
             LEFT JOIN training_project_portable_previews v ON v.project_id = p.id
            WHERE p.id IN (SELECT id FROM stale_detail_projects)
         ), 0) +
         COALESCE((
           SELECT SUM(
             ? +
             COALESCE(LENGTH(p.summary_json), 0) +
             COALESCE(LENGTH(p.operator_summary_json), 0) +
             CASE WHEN s.project_id IS NOT NULL THEN ? ELSE 0 END
           )
             FROM training_projects p
             LEFT JOIN training_stats_sessions s ON s.project_id = p.id
            WHERE p.id IN (SELECT id FROM stale_expired_projects)
         ), 0) AS bytes`,
    )
    .get(
      cutoffAt,
      cutoffAt,
      TRAINING_PROJECT_REPLAY_FILL_BYTES,
      TRAINING_PROJECT_REPLAY_CASH_ADJUSTMENT_BYTES,
      TRAINING_PROJECT_BASE_BYTES,
      TRAINING_STATS_FACT_BASE_BYTES,
    ) as { rows?: unknown; bytes?: unknown } | undefined;
  return impact(row?.rows, row?.bytes);
};

const countChallengeDetailsImpact = (cutoffAt: string): HistoryRetentionImpact => {
  const row = db
    .prepare(
      `WITH stale_detail_questions AS (
         SELECT q.id
           FROM special_training_history_questions q
           LEFT JOIN special_training_question_snapshot_archives a ON a.question_id = q.id
          WHERE q.settled_at < ?
            AND q.detail_expired_at IS NULL
            AND (q.detail_blob IS NOT NULL OR a.question_id IS NOT NULL)
       ),
       stale_projections AS (
         SELECT project_id
           FROM special_training_stats_projection
          WHERE detail_expired_at < ?
       )
       SELECT
         (SELECT COUNT(*) FROM stale_detail_questions) +
         (SELECT COUNT(*) FROM stale_projections) AS rows,
         COALESCE((
           SELECT SUM(COALESCE(LENGTH(q.detail_blob), 0) + COALESCE(a.snapshot_bytes, LENGTH(a.snapshot_payload), 0))
             FROM special_training_history_questions q
             LEFT JOIN special_training_question_snapshot_archives a ON a.question_id = q.id
            WHERE q.id IN (SELECT id FROM stale_detail_questions)
         ), 0) +
         COALESCE((
           SELECT SUM(? + COALESCE(LENGTH(curve_points_json), 0))
             FROM special_training_stats_projection
            WHERE project_id IN (SELECT project_id FROM stale_projections)
         ), 0) AS bytes`,
    )
    .get(cutoffAt, cutoffAt, SPECIAL_TRAINING_STATS_PROJECTION_BYTES) as
    | { rows?: unknown; bytes?: unknown }
    | undefined;
  return impact(row?.rows, row?.bytes);
};

const countNoteTextImpact = (cutoffAt: string): HistoryRetentionImpact => {
  const row = db
    .prepare(
      `WITH stale_notes AS (
         SELECT id
           FROM replay_notes
          WHERE updated_at < ?
       )
       SELECT
         (SELECT COUNT(*) FROM stale_notes) AS rows,
         COALESCE((
           SELECT SUM(COALESCE(c.payload_bytes, LENGTH(c.document_payload), 0))
             FROM replay_note_contents c
            WHERE c.note_id IN (SELECT id FROM stale_notes)
         ), 0) +
         COALESCE((
           SELECT SUM(
             COALESCE(a.payload_bytes, LENGTH(a.payload_blob), 0) +
             COALESCE(LENGTH(a.summary_json), 0)
           )
             FROM replay_note_attachments a
            WHERE a.note_id IN (SELECT id FROM stale_notes)
         ), 0) +
         COALESCE((
           SELECT SUM(COALESCE(a.archive_bytes, LENGTH(a.archive_payload), 0))
             FROM replay_note_context_archives a
            WHERE a.note_id IN (SELECT id FROM stale_notes)
         ), 0) +
         COALESCE((
           SELECT SUM(COALESCE(LENGTH(m.meta_json), 0) + COALESCE(LENGTH(m.meta_summary_json), 0))
             FROM replay_note_meta m
            WHERE m.note_id IN (SELECT id FROM stale_notes)
         ), 0) AS bytes`,
    )
    .get(cutoffAt) as { rows?: unknown; bytes?: unknown } | undefined;
  return impact(row?.rows, row?.bytes);
};

export const estimateHistoryRetentionPolicyImpact = (
  cutoffAt: string,
  targets: HistoryRetentionTargets,
): HistoryRetentionImpactSummary =>
  summarizeHistoryRetentionImpact({
    freeReplayDetails: targets.freeReplayDetails
      ? countFreeReplayDetailsImpact(cutoffAt)
      : EMPTY_IMPACT,
    challengeDetails: targets.challengeDetails
      ? countChallengeDetailsImpact(cutoffAt)
      : EMPTY_IMPACT,
    noteText: targets.noteText ? countNoteTextImpact(cutoffAt) : EMPTY_IMPACT,
  });

const RETENTION_BATCH_SIZE = 400;

const runChunked = <T,>(
  items: readonly T[],
  handler: (chunk: readonly T[], placeholders: string) => number,
  assertCanContinue: () => void = () => undefined,
): number => {
  let changed = 0;
  for (let index = 0; index < items.length; index += RETENTION_BATCH_SIZE) {
    const chunk = items.slice(index, index + RETENTION_BATCH_SIZE);
    if (!chunk.length) {
      continue;
    }
    // Check before opening the batch transaction. If the deadline is reached
    // here the exception propagates, already-committed batches survive, and
    // the next run resumes where this one stopped.
    assertCanContinue();
    changed += db.transaction(() =>
      handler(chunk, chunk.map(() => "?").join(",")),
    )();
  }
  return changed;
};

const collectIds = (
  sql: string,
  assertCanContinue: () => void,
  ...params: unknown[]
): string[] => {
  const rows = db.prepare(sql).all(...params) as Array<{ id?: unknown }>;
  const ids: string[] = [];
  rows.forEach((row, index) => {
    // Yield the event loop and re-check the deadline after every batch of
    // collected ids; a huge result set must not block a deadline stop.
    if (index > 0 && index % RETENTION_BATCH_SIZE === 0) {
      assertCanContinue();
    }
    const id = String(row.id ?? "").trim();
    if (id) {
      ids.push(id);
    }
  });
  return ids;
};

const collectNoteIdsForFreeReplayProjects = (
  projectIds: readonly string[],
  assertCanContinue: () => void,
): string[] => {
  const noteIds = new Set<string>();
  runChunked(projectIds, (chunk, placeholders) => {
    const rows = db
      .prepare(
        `SELECT note_id AS id
           FROM replay_note_context_refs
          WHERE training_project_id IN (${placeholders})
         UNION
         SELECT id
           FROM replay_notes
          WHERE training_project_id IN (${placeholders})
            AND has_context_replay = 1`,
      )
      .all(...chunk, ...chunk) as Array<{ id?: unknown }>;
    rows.forEach((row) => {
      const id = String(row.id ?? "").trim();
      if (id) {
        noteIds.add(id);
      }
    });
    return 0;
  }, assertCanContinue);
  return [...noteIds];
};

const collectNoteIdsForChallengeQuestions = (
  questionIds: readonly string[],
  assertCanContinue: () => void,
): string[] => {
  const noteIds = new Set<string>();
  runChunked(questionIds, (chunk, placeholders) => {
    const rows = db
      .prepare(
        `SELECT note_id AS id
           FROM replay_note_special_training_context_refs
          WHERE question_id IN (${placeholders})
         UNION
         SELECT id
           FROM replay_notes
          WHERE source_kind = 'SPECIAL_TRAINING_QUESTION'
            AND source_id IN (${placeholders})
            AND has_context_replay = 1`,
      )
      .all(...chunk, ...chunk) as Array<{ id?: unknown }>;
    rows.forEach((row) => {
      const id = String(row.id ?? "").trim();
      if (id) {
        noteIds.add(id);
      }
    });
    return 0;
  }, assertCanContinue);
  return [...noteIds];
};

const expireReplayNoteContexts = (
  noteIds: readonly string[],
  expiredAt: string,
  assertCanContinue: () => void,
): number => {
  if (!noteIds.length) {
    return 0;
  }
  runChunked(noteIds, (chunk, placeholders) => {
    db.prepare(`DELETE FROM replay_note_context_archives WHERE note_id IN (${placeholders})`).run(...chunk);
    return 0;
  }, assertCanContinue);
  return runChunked(noteIds, (chunk, placeholders) => {
    const result = db
      .prepare(
        `UPDATE replay_notes
            SET has_context_replay = 0,
                context_expired_at = ?
          WHERE id IN (${placeholders})`,
      )
      .run(expiredAt, ...chunk);
    return toNonNegativeInteger(result.changes);
  }, assertCanContinue);
};

const deleteByIds = (
  tableName: string,
  columnName: string,
  ids: readonly string[],
  assertCanContinue: () => void,
): number =>
  runChunked(ids, (chunk, placeholders) => {
    const result = db
      .prepare(`DELETE FROM ${tableName} WHERE ${columnName} IN (${placeholders})`)
      .run(...chunk);
    return toNonNegativeInteger(result.changes);
  }, assertCanContinue);

const expireFreeReplayDetails = (
  cutoffAt: string,
  expiredAt: string,
  assertCanContinue: () => void,
): HistoryRetentionImpact => {
  const estimated = countFreeReplayDetailsImpact(cutoffAt);
  const projectIds = collectIds(
    `SELECT id
       FROM training_projects
      WHERE created_at < ?
        AND detail_expired_at IS NULL`,
    assertCanContinue,
    cutoffAt,
  );
  let expiredProjects = 0;
  if (projectIds.length) {
    const noteIds = collectNoteIdsForFreeReplayProjects(projectIds, assertCanContinue);
    deleteByIds("training_project_replay_refs", "project_id", projectIds, assertCanContinue);
    deleteByIds("training_project_replay_fills", "project_id", projectIds, assertCanContinue);
    deleteByIds("training_project_replay_cash_adjustments", "project_id", projectIds, assertCanContinue);
    deleteByIds("training_project_portable_previews", "project_id", projectIds, assertCanContinue);
    deleteByIds("replay_note_context_refs", "training_project_id", projectIds, assertCanContinue);
    expireReplayNoteContexts(noteIds, expiredAt, assertCanContinue);
    expiredProjects = runChunked(projectIds, (chunk, placeholders) => {
      const result = db
        .prepare(
          `UPDATE training_projects
              SET detail_expired_at = ?
            WHERE id IN (${placeholders})
              AND detail_expired_at IS NULL`,
        )
        .run(expiredAt, ...chunk);
      return toNonNegativeInteger(result.changes);
    }, assertCanContinue);
  }
  const secondStageProjectIds = collectIds(
    `SELECT id
       FROM training_projects
      WHERE detail_expired_at IS NOT NULL
        AND detail_expired_at < ?`,
    assertCanContinue,
    cutoffAt,
  );
  let deletedExpiredProjects = 0;
  if (secondStageProjectIds.length) {
    const noteIds = collectNoteIdsForFreeReplayProjects(secondStageProjectIds, assertCanContinue);
    deleteByIds("training_project_replay_refs", "project_id", secondStageProjectIds, assertCanContinue);
    deleteByIds("training_project_replay_fills", "project_id", secondStageProjectIds, assertCanContinue);
    deleteByIds("training_project_replay_cash_adjustments", "project_id", secondStageProjectIds, assertCanContinue);
    deleteByIds("training_project_portable_previews", "project_id", secondStageProjectIds, assertCanContinue);
    deleteByIds("replay_note_context_refs", "training_project_id", secondStageProjectIds, assertCanContinue);
    expireReplayNoteContexts(noteIds, expiredAt, assertCanContinue);
    // Delete each project batch and rebuild aggregates in the same SQLite
    // transaction. Otherwise a rebuild failure could leave stats counting a
    // project that has already been removed, with no later retention run able
    // to discover that project again.
    deletedExpiredProjects = runChunked(secondStageProjectIds, (chunk, placeholders) => {
      const result = db
        .prepare(`DELETE FROM training_projects WHERE id IN (${placeholders})`)
        .run(...chunk);
      const deleted = toNonNegativeInteger(result.changes);
      if (deleted > 0) {
        rebuildTrainingStatsAggregatesTables(expiredAt, { withinTransaction: true });
      }
      return deleted;
    }, assertCanContinue);
  }
  return {
    rows: expiredProjects + deletedExpiredProjects,
    bytes: expiredProjects + deletedExpiredProjects > 0 ? estimated.bytes : 0,
  };
};

const expireChallengeDetails = (
  cutoffAt: string,
  expiredAt: string,
  assertCanContinue: () => void,
): HistoryRetentionImpact => {
  const estimated = countChallengeDetailsImpact(cutoffAt);
  const questionIds = collectIds(
    `SELECT q.id
       FROM special_training_history_questions q
       LEFT JOIN special_training_question_snapshot_archives a ON a.question_id = q.id
      WHERE q.settled_at < ?
        AND q.detail_expired_at IS NULL
        AND (q.detail_blob IS NOT NULL OR a.question_id IS NOT NULL)`,
    assertCanContinue,
    cutoffAt,
  );
  let expiredQuestions = 0;
  if (questionIds.length) {
    const noteIds = collectNoteIdsForChallengeQuestions(questionIds, assertCanContinue);
    upsertSpecialTrainingStatsProjectionRowsForQuestions(questionIds, expiredAt);
    deleteByIds(
      "special_training_question_snapshot_archives",
      "question_id",
      questionIds,
      assertCanContinue,
    );
    deleteByIds("replay_note_special_training_context_refs", "question_id", questionIds, assertCanContinue);
    expireReplayNoteContexts(noteIds, expiredAt, assertCanContinue);
    expiredQuestions = runChunked(questionIds, (chunk, placeholders) => {
      const result = db
        .prepare(
          `UPDATE special_training_history_questions
              SET detail_blob = NULL,
                  detail_encoding = '',
                  detail_expired_at = ?
            WHERE id IN (${placeholders})
              AND detail_expired_at IS NULL`,
        )
        .run(expiredAt, ...chunk);
      return toNonNegativeInteger(result.changes);
    }, assertCanContinue);
  }
  const projectionIds = collectIds(
    `SELECT project_id AS id
       FROM special_training_stats_projection
      WHERE detail_expired_at < ?`,
    assertCanContinue,
    cutoffAt,
  );
  const deletedProjections = projectionIds.length
    ? deleteByIds("special_training_stats_projection", "project_id", projectionIds, assertCanContinue)
    : 0;
  return {
    rows: expiredQuestions + deletedProjections,
    bytes: expiredQuestions + deletedProjections > 0 ? estimated.bytes : 0,
  };
};

const deleteOldReplayNotes = (
  cutoffAt: string,
  assertCanContinue: () => void,
): HistoryRetentionImpact => {
  const estimated = countNoteTextImpact(cutoffAt);
  const noteIds = collectIds(
    `SELECT id
       FROM replay_notes
      WHERE updated_at < ?`,
    assertCanContinue,
    cutoffAt,
  );
  if (!noteIds.length) {
    return EMPTY_IMPACT;
  }
  deleteByIds("replay_notes_fts", "note_id", noteIds, assertCanContinue);
  deleteByIds("replay_note_attachments", "note_id", noteIds, assertCanContinue);
  deleteByIds("replay_note_contents", "note_id", noteIds, assertCanContinue);
  deleteByIds("replay_note_colors", "note_id", noteIds, assertCanContinue);
  deleteByIds("replay_note_meta", "note_id", noteIds, assertCanContinue);
  deleteByIds("replay_note_context_archives", "note_id", noteIds, assertCanContinue);
  deleteByIds("replay_note_context_refs", "note_id", noteIds, assertCanContinue);
  deleteByIds("replay_note_special_training_context_refs", "note_id", noteIds, assertCanContinue);
  const deleted = deleteByIds("replay_notes", "id", noteIds, assertCanContinue);
  return {
    rows: deleted,
    bytes: deleted > 0 ? estimated.bytes : 0,
  };
};

export const markHistoryRetentionPolicyApplied = (appliedAt: string): void => {
  db.prepare(
    `UPDATE history_retention_policy
        SET last_applied_at = ?
      WHERE user_id = ?`,
  ).run(appliedAt, DEFAULT_USER_ID);
};

const replaceDeletedBytesWithEstimates = (
  deleted: HistoryRetentionImpactSummary,
  estimated: HistoryRetentionImpactSummary,
): HistoryRetentionImpactSummary =>
  summarizeHistoryRetentionImpact({
    freeReplayDetails: {
      ...deleted.freeReplayDetails,
      bytes: deleted.freeReplayDetails.rows > 0 ? estimated.freeReplayDetails.bytes : 0,
    },
    challengeDetails: {
      ...deleted.challengeDetails,
      bytes: deleted.challengeDetails.rows > 0 ? estimated.challengeDetails.bytes : 0,
    },
    noteText: {
      ...deleted.noteText,
      bytes: deleted.noteText.rows > 0 ? estimated.noteText.bytes : 0,
    },
  });

export const applyHistoryRetentionPolicyData = ({
  policy,
  cutoffAt,
  estimated,
  appliedAt,
  assertCanContinue = () => undefined,
}: ApplyHistoryRetentionPolicyDataInput): HistoryRetentionImpactSummary => {
  // Each batch inside the per-target helpers commits in its own transaction.
  // When the deadline stops the run, already-committed batches persist and
  // the next run resumes; the policy is only marked applied after a complete
  // sweep.
  const runTarget = (
    enabled: boolean,
    apply: () => HistoryRetentionImpact,
  ): HistoryRetentionImpact => {
    assertCanContinue();
    const result = enabled ? apply() : EMPTY_IMPACT;
    assertCanContinue();
    return result;
  };
  const deleted = summarizeHistoryRetentionImpact({
    freeReplayDetails: runTarget(policy.targets.freeReplayDetails, () =>
      expireFreeReplayDetails(cutoffAt, appliedAt, assertCanContinue),
    ),
    challengeDetails: runTarget(policy.targets.challengeDetails, () =>
      expireChallengeDetails(cutoffAt, appliedAt, assertCanContinue),
    ),
    noteText: runTarget(policy.targets.noteText, () =>
      deleteOldReplayNotes(cutoffAt, assertCanContinue),
    ),
  });
  assertCanContinue();
  compactQuestionLedgerByRetentionWindow(cutoffAt);
  assertCanContinue();
  markHistoryRetentionPolicyApplied(appliedAt);
  assertCanContinue();
  return replaceDeletedBytesWithEstimates(deleted, estimated);
};
