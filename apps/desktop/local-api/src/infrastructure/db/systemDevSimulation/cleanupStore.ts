// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";
import {
  DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES,
  isSimulationReplayNoteRecord,
  isSimulationTrainingProjectRecord,
} from "@zinuto/shared/simulationArtifactIdentity";
import { DEV_SIMULATION_LEDGER_SOURCE_TAG } from "../../../domain/systemDevSimulation/sharedDomain.js";

export const SYSTEM_DEV_SIMULATION_INDICATOR_ID_PREFIX =
  "sim_dev_indicator:";
export const SYSTEM_DEV_SIMULATION_BACKTEST_ID_PREFIX =
  "sim_dev_backtest:";

const normalizeSimulationBatchIds = (
  batchIds: readonly string[],
): string[] =>
  Array.from(
    new Set(
      batchIds
        .map((batchId) => String(batchId ?? "").trim())
        .filter((batchId) => batchId.length > 0),
    ),
  );

const buildBatchPlaceholders = (batchIds: readonly string[]): string =>
  batchIds.map(() => "?").join(",");

const deleteSimulationQuestionDrawCursorsByScopeHashes = (
  scopeHashes: readonly string[],
): void => {
  const normalizedScopeHashes = Array.from(
    new Set(
      scopeHashes
        .map((scopeHash) => String(scopeHash ?? "").trim())
        .filter((scopeHash) => scopeHash.length > 0),
    ),
  );
  if (!normalizedScopeHashes.length) {
    return;
  }
  db.prepare(
    `DELETE FROM special_training_question_draw_cursors
      WHERE scope_hash IN (${normalizedScopeHashes.map(() => "?").join(",")})`,
  ).run(...normalizedScopeHashes);
};

const buildSimulationTitleLikeClause = (columnName: string): string =>
  DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES.map(
    () => `${columnName} LIKE ?`,
  ).join(" OR ");

const buildSimulationTitleLikeParams = (): string[] =>
  DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES.map((prefix) => `${prefix}%`);

export const listSystemDevSimulationBatchIds = (): string[] =>
  (
    db
      .prepare(
        `SELECT id
           FROM system_dev_simulation_batches
          ORDER BY created_at DESC, id DESC`,
      )
      .all() as Array<{ id?: unknown }>
  )
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id.length > 0);

export const collectSimulationTrainingProjectIds = (): string[] => {
  const rows = db
    .prepare(
      `SELECT p.id AS id,
              p.source_tag AS sourceTag,
              p.name AS title,
              CASE
                WHEN EXISTS (
                  SELECT 1
                    FROM replay_notes n
                   WHERE n.training_project_id = p.id
                     AND (
                       n.source_kind = ?
                       OR ${buildSimulationTitleLikeClause("n.title")}
                     )
                ) THEN 1
                ELSE 0
              END AS referencedBySimulationNote
         FROM training_projects p`,
    )
    .all(
      DEV_SIMULATION_LEDGER_SOURCE_TAG,
      ...buildSimulationTitleLikeParams(),
    ) as Array<{
      id?: unknown;
      sourceTag?: unknown;
      title?: unknown;
      referencedBySimulationNote?: unknown;
    }>;
  return Array.from(
    new Set(
      rows
        .filter((row) =>
          isSimulationTrainingProjectRecord({
            sourceTag: row.sourceTag,
            title: row.title,
            referencedBySimulationNote: Boolean(row.referencedBySimulationNote),
          }),
        )
        .map((row) => String(row.id ?? "").trim())
        .filter((id) => id.length > 0),
    ),
  );
};

export const collectSimulationReplayNoteIds = (): string[] => {
  const rows = db
    .prepare(
      `SELECT replay_notes.id AS id,
              replay_notes.title AS title,
              replay_notes.source_kind AS sourceKind,
              p.source_tag AS linkedProjectSourceTag
         FROM replay_notes
         LEFT JOIN training_projects p
           ON p.id = replay_notes.training_project_id
        WHERE replay_notes.source_kind = ?
           OR p.source_tag = ?
           OR ${buildSimulationTitleLikeClause("replay_notes.title")}`,
    )
    .all(
      DEV_SIMULATION_LEDGER_SOURCE_TAG,
      DEV_SIMULATION_LEDGER_SOURCE_TAG,
      ...buildSimulationTitleLikeParams(),
    ) as Array<{
      id?: unknown;
      title?: unknown;
      sourceKind?: unknown;
      linkedProjectSourceTag?: unknown;
    }>;
  return rows
    .filter((row) =>
      isSimulationReplayNoteRecord({
        sourceKind: row.sourceKind,
        linkedTrainingProjectIsSimulation:
          String(row.linkedProjectSourceTag ?? "").trim() ===
          DEV_SIMULATION_LEDGER_SOURCE_TAG,
        title: row.title,
      }),
    )
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id.length > 0);
};

export const collectSimulationTrainingProjectIdsByBatchIds = (
  batchIds: readonly string[],
): string[] => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return [];
  }
  const placeholders = normalizedBatchIds.map(() => "?").join(",");
  return (
    db
      .prepare(
        `SELECT id
           FROM training_projects
          WHERE simulation_batch_id IN (${placeholders})`,
      )
      .all(...normalizedBatchIds) as Array<{ id?: unknown }>
  )
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id.length > 0);
};

export const collectSimulationReplayNoteIdsByBatchIds = (
  batchIds: readonly string[],
): string[] => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return [];
  }
  const placeholders = buildBatchPlaceholders(normalizedBatchIds);
  return (
    db
      .prepare(
        `SELECT id
           FROM replay_notes
          WHERE simulation_batch_id IN (${placeholders})`,
      )
      .all(...normalizedBatchIds) as Array<{ id?: unknown }>
  )
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id.length > 0);
};

export const countSimulationTrainingProjectsByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return Math.max(
    0,
    Number(
      db
        .prepare(
          `SELECT COUNT(*)
             FROM training_projects
            WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})`,
        )
        .pluck()
        .get(...normalizedBatchIds) ?? 0,
    ),
  );
};

export const countSimulationReplayNotesByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return Math.max(
    0,
    Number(
      db
        .prepare(
          `SELECT COUNT(*)
             FROM replay_notes
            WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})`,
        )
        .pluck()
        .get(...normalizedBatchIds) ?? 0,
    ),
  );
};

export const countSimulationQuestionLedgerByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return Math.max(
    0,
    Number(
      db
        .prepare(
          `SELECT COUNT(*)
             FROM special_training_question_ledger
            WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})`,
        )
        .pluck()
        .get(...normalizedBatchIds) ?? 0,
    ),
  );
};

export const countSimulationSpecialTrainingBanksByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return Math.max(
    0,
    Number(
      db
        .prepare(
          `SELECT COUNT(*)
             FROM special_training_banks
            WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})`,
        )
        .pluck()
        .get(...normalizedBatchIds) ?? 0,
    ),
  );
};

export const countSimulationSpecialTrainingHistorySessionsByBatchIds = (
  batchIds: readonly string[],
  modeId?: "fast-decision-training" | "risk-discipline-training",
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return Math.max(
    0,
    Number(
      db
        .prepare(
          `SELECT COUNT(*)
             FROM special_training_history_sessions
            WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})
              ${modeId ? "AND mode_id = ?" : ""}`,
        )
        .pluck()
        .get(...normalizedBatchIds, ...(modeId ? [modeId] : [])) ?? 0,
    ),
  );
};

export const countSimulationSpecialTrainingHistoryQuestionsByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return Math.max(
    0,
    Number(
      db
        .prepare(
          `SELECT COUNT(*)
             FROM special_training_history_questions
            WHERE session_id IN (
              SELECT id
                FROM special_training_history_sessions
               WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})
            )`,
        )
        .pluck()
        .get(...normalizedBatchIds) ?? 0,
    ),
  );
};

export const deleteReplayNotesByIds = (noteIds: readonly string[]): number => {
  const normalizedIds = Array.from(
    new Set(
      noteIds
        .map((noteId) => String(noteId || "").trim())
        .filter((noteId) => noteId.length > 0),
    ),
  );
  if (!normalizedIds.length) {
    return 0;
  }
  const placeholders = normalizedIds.map(() => "?").join(",");
  return db
    .prepare(`DELETE FROM replay_notes WHERE id IN (${placeholders})`)
    .run(...normalizedIds).changes;
};

export const deleteSimulationQuestionLedger = (): number =>
  db.transaction(() => {
    const scopeRows = db
      .prepare(
        `SELECT DISTINCT scope_hash
           FROM special_training_question_ledger
          WHERE source_tag = ?`,
      )
      .all(DEV_SIMULATION_LEDGER_SOURCE_TAG) as Array<{ scope_hash?: unknown }>;
    deleteSimulationQuestionDrawCursorsByScopeHashes(
      scopeRows.map((row) => String(row.scope_hash ?? "").trim()),
    );
    return db
      .prepare("DELETE FROM special_training_question_ledger WHERE source_tag = ?")
      .run(DEV_SIMULATION_LEDGER_SOURCE_TAG).changes;
  })();

export const deleteSimulationQuestionLedgerByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return db.transaction(() => {
    const scopeRows = db
      .prepare(
        `SELECT DISTINCT scope_hash
           FROM special_training_question_ledger
          WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})`,
      )
      .all(...normalizedBatchIds) as Array<{ scope_hash?: unknown }>;
    deleteSimulationQuestionDrawCursorsByScopeHashes(
      scopeRows.map((row) => String(row.scope_hash ?? "").trim()),
    );
    return db
      .prepare(
        `DELETE FROM special_training_question_ledger
          WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})`,
      )
      .run(...normalizedBatchIds).changes;
  })();
};

export const deleteSimulationSpecialTrainingBanksByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return db.transaction(() => {
    db.prepare(
      `DELETE FROM special_training_question_scope_indexes
        WHERE bank_id IN (
          SELECT id
            FROM special_training_banks
           WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})
        )`,
    ).run(...normalizedBatchIds);
    return db
      .prepare(
        `DELETE FROM special_training_banks
          WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})`,
      )
      .run(...normalizedBatchIds).changes;
  })();
};

export const deleteSimulationSpecialTrainingBanks = (): number =>
  db.transaction(() => {
    db.prepare(
      `DELETE FROM special_training_question_scope_indexes
        WHERE bank_id IN (
          SELECT id
            FROM special_training_banks
           WHERE simulation_batch_id IS NOT NULL
              OR name LIKE 'system-dev-simulation-%'
        )`,
    ).run();
    return db
      .prepare(
        `DELETE FROM special_training_banks
          WHERE simulation_batch_id IS NOT NULL
             OR name LIKE 'system-dev-simulation-%'`,
      )
      .run().changes;
  })();

export const deleteSimulationCustomIndicatorProfiles = (): number =>
  db
    .prepare(
      `DELETE FROM custom_indicator_profiles
        WHERE id LIKE 'sys_override:SIM_DEV_%'
           OR id LIKE 'sim_dev_indicator:%'`,
    )
    .run().changes;

export const countSimulationCustomIndicatorProfilesByBatchId = (
  batchId: string,
): number =>
  Math.max(
    0,
    Number(
      db
        .prepare(
          "SELECT COUNT(*) FROM custom_indicator_profiles WHERE id LIKE ?",
        )
        .pluck()
        .get(`${SYSTEM_DEV_SIMULATION_INDICATOR_ID_PREFIX}${batchId}:%`) ?? 0,
    ),
  );

export const countSimulationBacktestBatchesByBatchId = (
  batchId: string,
  kind?: "real" | "quick",
): number => {
  const suffix = kind ? `:${kind}:%` : ":%";
  return Math.max(
    0,
    Number(
      db
        .prepare("SELECT COUNT(*) FROM backtest_batches WHERE id LIKE ?")
        .pluck()
        .get(`${SYSTEM_DEV_SIMULATION_BACKTEST_ID_PREFIX}${batchId}${suffix}`) ??
        0,
    ),
  );
};

export const deleteSimulationBacktestBatches = (): number =>
  db
    .prepare("DELETE FROM backtest_batches WHERE id LIKE 'sim_dev_backtest:%'")
    .run().changes;

export const deleteSimulationSpecialTrainingHistoryQuestions = (): number =>
  db
    .prepare(
      `DELETE FROM special_training_history_questions
         WHERE session_id IN (
           SELECT id FROM special_training_history_sessions WHERE source_tag = ?
         )`,
    )
    .run(DEV_SIMULATION_LEDGER_SOURCE_TAG).changes;

export const deleteSimulationSpecialTrainingStatsProjection = (): number =>
  db
    .prepare(
      `DELETE FROM special_training_stats_projection
         WHERE session_id IN (
           SELECT id FROM special_training_history_sessions WHERE source_tag = ?
         )`,
    )
    .run(DEV_SIMULATION_LEDGER_SOURCE_TAG).changes;

export const deleteSimulationSpecialTrainingHistoryQuestionsByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return db
    .prepare(
      `DELETE FROM special_training_history_questions
         WHERE session_id IN (
           SELECT id
             FROM special_training_history_sessions
            WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})
         )`,
    )
    .run(...normalizedBatchIds).changes;
};

export const deleteSimulationSpecialTrainingStatsProjectionByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return db
    .prepare(
      `DELETE FROM special_training_stats_projection
         WHERE session_id IN (
           SELECT id
             FROM special_training_history_sessions
            WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})
         )`,
    )
    .run(...normalizedBatchIds).changes;
};

export const deleteSimulationSpecialTrainingHistorySessions = (): number =>
  db
    .prepare("DELETE FROM special_training_history_sessions WHERE source_tag = ?")
    .run(DEV_SIMULATION_LEDGER_SOURCE_TAG).changes;

export const deleteSimulationSpecialTrainingHistorySessionsByBatchIds = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = normalizeSimulationBatchIds(batchIds);
  if (!normalizedBatchIds.length) {
    return 0;
  }
  return db
    .prepare(
      `DELETE FROM special_training_history_sessions
        WHERE simulation_batch_id IN (${buildBatchPlaceholders(normalizedBatchIds)})`,
    )
    .run(...normalizedBatchIds).changes;
};
