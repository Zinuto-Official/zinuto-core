// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

export type ReplayNoteRow = {
  id: string;
  title: string;
  type: string;
  simulation_batch_id: string | null;
  source_kind: string | null;
  source_id: string | null;
  content_preview: string | null;
  training_project_id: string | null;
  context_display_period: string | null;
  has_context_replay: number;
  context_expired_at: string | null;
  context_session_id: string | null;
  context_cursor_index: number | null;
  created_at: string;
  updated_at: string;
};

export type RecentReplayNoteRow = {
  id: string;
  title: string;
  type: string;
  created_at: string;
  updated_at: string;
};

export type ReplayNoteContentRow = {
  note_id: string;
  document_schema_version: number;
  document_encoding: string;
  document_payload: unknown;
  document_hash: string;
  content_preview: string | null;
  text_chars: number;
  payload_bytes: number;
};

export type ReplayNoteAttachmentRow = {
  note_id: string;
  attachment_ref_id: string;
  attachment_kind: string;
  summary_json: string;
  ref_kind: string | null;
  ref_id: string | null;
  payload_encoding?: string | null;
  payload_blob?: unknown;
  source_bytes?: number;
  payload_bytes?: number;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

export type ReplayNoteContextRefRow = {
  note_id: string;
  training_project_id: string;
  context_cursor_index: number;
  window_bars: number;
};

export type ReplayNoteSpecialTrainingContextRefRow = {
  note_id: string;
  question_id: string;
};

export type ReplayNoteContextArchiveRow = {
  note_id: string;
  archive_encoding: string;
  archive_payload: unknown;
  source_bytes: number;
  archive_bytes: number;
};

export type ReplayNoteMetaRow = {
  note_id: string;
  meta_json: string;
  meta_summary_json: string;
};

type ReplayNoteContentUpsertInput = {
  noteId: string;
  documentSchemaVersion: number;
  documentEncoding: string;
  documentPayload: Buffer;
  documentHash: string;
  contentPreview: string;
  textChars: number;
  payloadBytes: number;
  updatedAt: string;
};

type ReplayNoteAttachmentInsertRow = {
  attachmentRefId: string;
  attachmentKind: string;
  summaryJson: string;
  refKind: string | null;
  refId: string | null;
  payloadEncoding: string | null;
  payloadBlob: Buffer | null;
  sourceBytes: number;
  payloadBytes: number;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

type ReplayNoteColorInsertRow = {
  colorToken: string;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

type ReplayNoteContextArchiveUpsertInput = {
  noteId: string;
  archiveEncoding: string;
  archivePayload: Buffer;
  sourceBytes: number;
  archiveBytes: number;
  createdAt: string;
  updatedAt: string;
};

type ReplayNoteRowUpsertInput = {
  id: string;
  title: string;
  type: string;
  simulationBatchId: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  contentPreview: string;
  trainingProjectId: string | null;
  contextDisplayPeriod: string | null;
  hasContextReplay: number;
  contextExpiredAt: string | null;
  contextSessionId: string | null;
  contextCursorIndex: number | null;
  createdAt: string;
  updatedAt: string;
};

type ReplayNoteRowUpdateInput = {
  id: string;
  title: string;
  simulationBatchId: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  contentPreview: string;
  trainingProjectId: string | null;
  contextDisplayPeriod: string | null;
  hasContextReplay: number;
  contextExpiredAt: string | null;
  contextSessionId: string | null;
  contextCursorIndex: number | null;
  updatedAt: string;
};

const replayNoteSelectColumns = `n.id,n.title,n.type,n.simulation_batch_id,n.source_kind,n.source_id,n.content_preview,n.training_project_id,n.context_display_period,
              n.has_context_replay,n.context_expired_at,n.context_session_id,n.context_cursor_index,n.created_at,n.updated_at`;

export const runReplayNoteTransaction = <T>(callback: () => T): T =>
  db.transaction(callback)();

export const getReplayNoteContentRow = (noteId: string): ReplayNoteContentRow | null => {
  const row = db
    .prepare(
      `SELECT note_id,document_schema_version,document_encoding,document_payload,document_hash,
              content_preview,text_chars,payload_bytes
       FROM replay_note_contents
       WHERE note_id = ?`,
    )
    .get(noteId) as ReplayNoteContentRow | undefined;
  return row ?? null;
};

export const updateReplayNoteContentPreview = (input: {
  noteId: string;
  contentPreview: string;
  textChars: number;
  updatedAt: string;
}): void => {
  db.prepare(
    `UPDATE replay_note_contents
        SET content_preview = ?,
            text_chars = ?,
            updated_at = ?
      WHERE note_id = ?`,
  ).run(input.contentPreview, input.textChars, input.updatedAt, input.noteId);
};

export const upsertReplayNoteContentRow = (
  input: ReplayNoteContentUpsertInput,
): void => {
  db.prepare(
    `INSERT INTO replay_note_contents (
      note_id,document_schema_version,document_encoding,document_payload,document_hash,
      content_preview,text_chars,payload_bytes,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(note_id) DO UPDATE SET
      document_schema_version = excluded.document_schema_version,
      document_encoding = excluded.document_encoding,
      document_payload = excluded.document_payload,
      document_hash = excluded.document_hash,
      content_preview = excluded.content_preview,
      text_chars = excluded.text_chars,
      payload_bytes = excluded.payload_bytes,
      updated_at = excluded.updated_at`,
  ).run(
    input.noteId,
    input.documentSchemaVersion,
    input.documentEncoding,
    input.documentPayload,
    input.documentHash,
    input.contentPreview,
    input.textChars,
    input.payloadBytes,
    input.updatedAt,
  );
};

export const deleteReplayNoteSearchDocument = (noteId: string): void => {
  db.prepare('DELETE FROM replay_notes_fts WHERE note_id = ?').run(noteId);
};

export const upsertReplayNoteSearchDocument = (input: {
  noteId: string;
  title: string;
  content: string;
}): void => {
  deleteReplayNoteSearchDocument(input.noteId);
  db.prepare(
    `INSERT INTO replay_notes_fts (note_id,title,content)
     VALUES (?,?,?)`,
  ).run(input.noteId, input.title, input.content);
};

export const getReplayNoteMetaRow = (noteId: string): ReplayNoteMetaRow | null => {
  const row = db
    .prepare(
      `SELECT note_id,meta_json,meta_summary_json
       FROM replay_note_meta
       WHERE note_id = ?`,
    )
    .get(noteId) as ReplayNoteMetaRow | undefined;
  return row ?? null;
};

export const deleteReplayNoteMeta = (noteId: string): void => {
  db.prepare('DELETE FROM replay_note_meta WHERE note_id = ?').run(noteId);
};

export const upsertReplayNoteMeta = (input: {
  noteId: string;
  metaJson: string;
  metaSummaryJson: string;
  createdAt: string;
  updatedAt: string;
}): void => {
  db.prepare(
    `INSERT INTO replay_note_meta (
      note_id,meta_json,meta_summary_json,created_at,updated_at
    ) VALUES (?,?,?,?,?)
    ON CONFLICT(note_id) DO UPDATE SET
      meta_json = excluded.meta_json,
      meta_summary_json = excluded.meta_summary_json,
      updated_at = excluded.updated_at`,
  ).run(
    input.noteId,
    input.metaJson,
    input.metaSummaryJson,
    input.createdAt,
    input.updatedAt,
  );
};

export const listReplayNoteMetaSummaryRows = (
  noteIds: readonly string[],
): Array<{ note_id: string; meta_summary_json: string }> => {
  if (!noteIds.length) {
    return [];
  }
  const placeholders = noteIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT note_id,meta_summary_json
       FROM replay_note_meta
       WHERE note_id IN (${placeholders})`,
    )
    .all(...noteIds) as Array<{ note_id: string; meta_summary_json: string }>;
};

export const listReplayNoteAttachmentRows = (
  noteId: string,
): ReplayNoteAttachmentRow[] =>
  db
    .prepare(
      `SELECT note_id,attachment_ref_id,attachment_kind,summary_json,ref_kind,ref_id,
              payload_encoding,payload_blob,source_bytes,payload_bytes,sort_index,created_at,updated_at
         FROM replay_note_attachments
        WHERE note_id = ?
        ORDER BY sort_index ASC, attachment_ref_id ASC`,
    )
    .all(noteId) as ReplayNoteAttachmentRow[];

export const listReplayNoteAttachmentRowsByNoteIds = (
  noteIds: readonly string[],
): ReplayNoteAttachmentRow[] => {
  if (!noteIds.length) {
    return [];
  }
  const placeholders = noteIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT note_id,attachment_ref_id,attachment_kind,summary_json,ref_kind,ref_id,
              sort_index,created_at,updated_at
         FROM replay_note_attachments
        WHERE note_id IN (${placeholders})
        ORDER BY note_id ASC, sort_index ASC, attachment_ref_id ASC`,
    )
    .all(...noteIds) as ReplayNoteAttachmentRow[];
};

export const replaceReplayNoteAttachmentRows = (
  noteId: string,
  rows: readonly ReplayNoteAttachmentInsertRow[],
): void => {
  db.prepare('DELETE FROM replay_note_attachments WHERE note_id = ?').run(noteId);
  const insert = db.prepare(
    `INSERT INTO replay_note_attachments (
      note_id,attachment_ref_id,attachment_kind,summary_json,ref_kind,ref_id,
      payload_encoding,payload_blob,source_bytes,payload_bytes,sort_index,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  rows.forEach((row) => {
    insert.run(
      noteId,
      row.attachmentRefId,
      row.attachmentKind,
      row.summaryJson,
      row.refKind,
      row.refId,
      row.payloadEncoding,
      row.payloadBlob,
      row.sourceBytes,
      row.payloadBytes,
      row.sortIndex,
      row.createdAt,
      row.updatedAt,
    );
  });
};

export const listReplayNoteColorRows = (
  noteId: string,
): Array<{ color_token: string }> =>
  db
    .prepare(
      `SELECT color_token
         FROM replay_note_colors
        WHERE note_id = ?
        ORDER BY sort_index ASC, color_token ASC`,
    )
    .all(noteId) as Array<{ color_token: string }>;

export const listReplayNoteColorRowsByNoteIds = (
  noteIds: readonly string[],
): Array<{ note_id: string; color_token: string }> => {
  if (!noteIds.length) {
    return [];
  }
  const placeholders = noteIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT note_id,color_token
         FROM replay_note_colors
        WHERE note_id IN (${placeholders})
        ORDER BY note_id ASC, sort_index ASC, color_token ASC`,
    )
    .all(...noteIds) as Array<{ note_id: string; color_token: string }>;
};

export const replaceReplayNoteColorRows = (
  noteId: string,
  rows: readonly ReplayNoteColorInsertRow[],
): void => {
  db.prepare('DELETE FROM replay_note_colors WHERE note_id = ?').run(noteId);
  const insert = db.prepare(
    `INSERT INTO replay_note_colors (
      note_id,color_token,sort_index,created_at,updated_at
    ) VALUES (?,?,?,?,?)`,
  );
  rows.forEach((row) => {
    insert.run(noteId, row.colorToken, row.sortIndex, row.createdAt, row.updatedAt);
  });
};

export const getReplayNoteContextRefRow = (
  noteId: string,
): ReplayNoteContextRefRow | null => {
  const row = db
    .prepare(
      `SELECT note_id,training_project_id,context_cursor_index,window_bars
       FROM replay_note_context_refs
       WHERE note_id = ?`,
    )
    .get(noteId) as ReplayNoteContextRefRow | undefined;
  return row ?? null;
};

export const getReplayNoteSpecialTrainingContextRefRow = (
  noteId: string,
): ReplayNoteSpecialTrainingContextRefRow | null => {
  const row = db
    .prepare(
      `SELECT note_id,question_id
         FROM replay_note_special_training_context_refs
        WHERE note_id = ?`,
    )
    .get(noteId) as ReplayNoteSpecialTrainingContextRefRow | undefined;
  return row ?? null;
};

export const clearReplayNoteSpecialTrainingContextRef = (noteId: string): void => {
  db.prepare(
    'DELETE FROM replay_note_special_training_context_refs WHERE note_id = ?',
  ).run(noteId);
};

export const hasSpecialTrainingQuestion = (questionId: string): boolean => {
  const row = db
    .prepare(
      `SELECT 1
         FROM special_training_history_questions
        WHERE id = ?
          AND detail_expired_at IS NULL
        LIMIT 1`,
    )
    .get(questionId) as { 1?: number } | undefined;
  return Boolean(row);
};

export const upsertReplayNoteSpecialTrainingContextRef = (input: {
  noteId: string;
  questionId: string;
  createdAt: string;
  updatedAt: string;
}): void => {
  db.prepare(
    `INSERT INTO replay_note_special_training_context_refs (
      note_id,question_id,created_at,updated_at
    ) VALUES (?,?,?,?)
    ON CONFLICT(note_id) DO UPDATE SET
      question_id = excluded.question_id,
      updated_at = excluded.updated_at`,
  ).run(input.noteId, input.questionId, input.createdAt, input.updatedAt);
};

export const getReplayNoteContextArchiveRow = (
  noteId: string,
): ReplayNoteContextArchiveRow | null => {
  const row = db
    .prepare(
      `SELECT note_id,archive_encoding,archive_payload,source_bytes,archive_bytes
       FROM replay_note_context_archives
       WHERE note_id = ?`,
    )
    .get(noteId) as ReplayNoteContextArchiveRow | undefined;
  return row ?? null;
};

export const clearReplayNoteContextArchive = (noteId: string): void => {
  db.prepare('DELETE FROM replay_note_context_archives WHERE note_id = ?').run(noteId);
};

export const hasReplayNoteContextArchive = (noteId: string): boolean => {
  const row = db
    .prepare('SELECT 1 FROM replay_note_context_archives WHERE note_id = ? LIMIT 1')
    .get(noteId) as { 1: number } | undefined;
  return Boolean(row);
};

export const upsertReplayNoteContextArchive = (
  input: ReplayNoteContextArchiveUpsertInput,
): void => {
  db.prepare(
    `INSERT INTO replay_note_context_archives (
      note_id,archive_encoding,archive_payload,source_bytes,archive_bytes,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(note_id) DO UPDATE SET
      archive_encoding = excluded.archive_encoding,
      archive_payload = excluded.archive_payload,
      source_bytes = excluded.source_bytes,
      archive_bytes = excluded.archive_bytes,
      updated_at = excluded.updated_at`,
  ).run(
    input.noteId,
    input.archiveEncoding,
    input.archivePayload,
    input.sourceBytes,
    input.archiveBytes,
    input.createdAt,
    input.updatedAt,
  );
};

export const listReplayNoteContextRefsMissingArchive = (
  normalizedTrainingProjectIds: readonly string[],
  safeLimit: number,
): ReplayNoteContextRefRow[] => {
  const baseSql = `SELECT r.note_id,r.training_project_id,r.context_cursor_index,r.window_bars
                   FROM replay_note_context_refs r
                   LEFT JOIN replay_note_context_archives a ON a.note_id = r.note_id
                   WHERE a.note_id IS NULL`;
  if (!normalizedTrainingProjectIds.length) {
    return db
      .prepare(
        `${baseSql}
         ORDER BY r.updated_at DESC, r.note_id DESC
         LIMIT ?`,
      )
      .all(safeLimit) as ReplayNoteContextRefRow[];
  }
  const placeholders = normalizedTrainingProjectIds.map(() => '?').join(',');
  return db
    .prepare(
      `${baseSql}
       AND r.training_project_id IN (${placeholders})
       ORDER BY r.updated_at DESC, r.note_id DESC
       LIMIT ?`,
    )
    .all(...normalizedTrainingProjectIds, safeLimit) as ReplayNoteContextRefRow[];
};

export const listReplayNoteContextRefsMissingArchiveByNoteIds = (
  normalizedNoteIds: readonly string[],
): ReplayNoteContextRefRow[] => {
  if (!normalizedNoteIds.length) {
    return [];
  }
  const placeholders = normalizedNoteIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT r.note_id,r.training_project_id,r.context_cursor_index,r.window_bars
         FROM replay_note_context_refs r
         LEFT JOIN replay_note_context_archives a ON a.note_id = r.note_id
        WHERE a.note_id IS NULL
          AND r.note_id IN (${placeholders})
        ORDER BY r.updated_at DESC, r.note_id DESC`,
    )
    .all(...normalizedNoteIds) as ReplayNoteContextRefRow[];
};

export const markReplayNoteContextHydrated = (noteId: string): void => {
  db.prepare(
    `UPDATE replay_notes
       SET has_context_replay = 1,
           context_expired_at = NULL
     WHERE id = ?`,
  ).run(noteId);
};

export const listReplayNoteSpecialTrainingContextRefsMissingArchive = (
  normalizedQuestionIds: readonly string[],
  safeLimit: number,
): ReplayNoteSpecialTrainingContextRefRow[] => {
  const baseSql = `SELECT r.note_id,r.question_id
                     FROM replay_note_special_training_context_refs r
                     LEFT JOIN replay_note_context_archives a ON a.note_id = r.note_id
                    WHERE a.note_id IS NULL`;
  if (!normalizedQuestionIds.length) {
    return db
      .prepare(
        `${baseSql}
         ORDER BY r.updated_at DESC, r.note_id DESC
         LIMIT ?`,
      )
      .all(safeLimit) as ReplayNoteSpecialTrainingContextRefRow[];
  }
  const placeholders = normalizedQuestionIds.map(() => '?').join(',');
  return db
    .prepare(
      `${baseSql}
       AND r.question_id IN (${placeholders})
       ORDER BY r.updated_at DESC, r.note_id DESC
       LIMIT ?`,
    )
    .all(...normalizedQuestionIds, safeLimit) as ReplayNoteSpecialTrainingContextRefRow[];
};

export const listReplayNoteSpecialTrainingContextRefsMissingArchiveByNoteIds = (
  normalizedNoteIds: readonly string[],
): ReplayNoteSpecialTrainingContextRefRow[] => {
  if (!normalizedNoteIds.length) {
    return [];
  }
  const placeholders = normalizedNoteIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT r.note_id,r.question_id
         FROM replay_note_special_training_context_refs r
         LEFT JOIN replay_note_context_archives a ON a.note_id = r.note_id
        WHERE a.note_id IS NULL
          AND r.note_id IN (${placeholders})
        ORDER BY r.updated_at DESC, r.note_id DESC`,
    )
    .all(...normalizedNoteIds) as ReplayNoteSpecialTrainingContextRefRow[];
};

export const clearReplayNoteContextRef = (noteId: string): void => {
  db.prepare('DELETE FROM replay_note_context_refs WHERE note_id = ?').run(noteId);
};

export const hasTrainingProject = (projectId: string): boolean => {
  const row = db
    .prepare(
      `SELECT 1
       FROM training_projects
       WHERE id = ?
         AND detail_expired_at IS NULL
       LIMIT 1`,
    )
    .get(projectId) as { 1: number } | undefined;
  return Boolean(row);
};

export const upsertReplayNoteContextRef = (input: {
  noteId: string;
  trainingProjectId: string;
  contextCursorIndex: number;
  windowBars: number;
  createdAt: string;
  updatedAt: string;
}): void => {
  db.prepare(
    `INSERT INTO replay_note_context_refs (
      note_id,training_project_id,context_cursor_index,window_bars,created_at,updated_at
    ) VALUES (?,?,?,?,?,?)
    ON CONFLICT(note_id) DO UPDATE SET
      training_project_id = excluded.training_project_id,
      context_cursor_index = excluded.context_cursor_index,
      window_bars = excluded.window_bars,
      updated_at = excluded.updated_at`,
  ).run(
    input.noteId,
    input.trainingProjectId,
    input.contextCursorIndex,
    input.windowBars,
    input.createdAt,
    input.updatedAt,
  );
};

export const upsertReplayNoteRow = (input: ReplayNoteRowUpsertInput): void => {
  db.prepare(
    `INSERT INTO replay_notes (
      id,title,type,simulation_batch_id,source_kind,source_id,content_preview,training_project_id,context_display_period,
      has_context_replay,context_expired_at,context_session_id,context_cursor_index,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      simulation_batch_id = excluded.simulation_batch_id,
      source_kind = excluded.source_kind,
      source_id = excluded.source_id,
      content_preview = excluded.content_preview,
      training_project_id = excluded.training_project_id,
      context_display_period = excluded.context_display_period,
      has_context_replay = excluded.has_context_replay,
      context_expired_at = excluded.context_expired_at,
      context_session_id = excluded.context_session_id,
      context_cursor_index = excluded.context_cursor_index,
      updated_at = excluded.updated_at`,
  ).run(
    input.id,
    input.title,
    input.type,
    input.simulationBatchId,
    input.sourceKind,
    input.sourceId,
    input.contentPreview,
    input.trainingProjectId,
    input.contextDisplayPeriod,
    input.hasContextReplay,
    input.contextExpiredAt,
    input.contextSessionId,
    input.contextCursorIndex,
    input.createdAt,
    input.updatedAt,
  );
};

export const updateReplayNoteContextState = (input: {
  noteId: string;
  hasContextReplay: number;
  contextSessionId: string | null;
  contextCursorIndex: number | null;
}): void => {
  db.prepare(
    `UPDATE replay_notes
     SET has_context_replay = ?,
         context_expired_at = NULL,
         context_session_id = ?,
         context_cursor_index = ?
     WHERE id = ?`,
  ).run(
    input.hasContextReplay,
    input.contextSessionId,
    input.contextCursorIndex,
    input.noteId,
  );
};

export const listReplayNoteRows = (input: {
  whereSql: string;
  params: readonly unknown[];
  limit: number;
}): ReplayNoteRow[] =>
  db
    .prepare(
      `SELECT ${replayNoteSelectColumns}
         FROM replay_notes n
       ${input.whereSql}
       ORDER BY n.updated_at DESC, n.created_at DESC, n.id DESC
       LIMIT ?`,
    )
    .all(...input.params, input.limit) as ReplayNoteRow[];

export const countReplayNoteRows = (input: {
  whereSql: string;
  params: readonly unknown[];
}): { count?: unknown } | undefined =>
  db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM replay_notes n
         ${input.whereSql}`,
    )
    .get(...input.params) as { count?: unknown } | undefined;

export const listRecentReplayNoteRows = (limit: number): RecentReplayNoteRow[] =>
  db
    .prepare(
      `SELECT id,title,type,created_at,updated_at
       FROM replay_notes
       ORDER BY updated_at DESC, created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(limit) as RecentReplayNoteRow[];

export const getReplayNoteRowById = (id: string): ReplayNoteRow | null => {
  const row = db
    .prepare(
      `SELECT ${replayNoteSelectColumns}
       FROM replay_notes n
       WHERE n.id = ?`,
    )
    .get(id) as ReplayNoteRow | undefined;
  return row ?? null;
};

export const updateReplayNoteRow = (input: ReplayNoteRowUpdateInput): void => {
  db.prepare(
    `UPDATE replay_notes
       SET title = ?,
           simulation_batch_id = ?,
           source_kind = ?,
           source_id = ?,
           content_preview = ?,
           training_project_id = ?,
           context_display_period = ?,
           has_context_replay = ?,
           context_expired_at = ?,
           context_session_id = ?,
           context_cursor_index = ?,
           updated_at = ?
       WHERE id = ?`,
  ).run(
    input.title,
    input.simulationBatchId,
    input.sourceKind,
    input.sourceId,
    input.contentPreview,
    input.trainingProjectId,
    input.contextDisplayPeriod,
    input.hasContextReplay,
    input.contextExpiredAt,
    input.contextSessionId,
    input.contextCursorIndex,
    input.updatedAt,
    input.id,
  );
};

export const deleteReplayNoteRow = (id: string): number => {
  const result = db.prepare('DELETE FROM replay_notes WHERE id = ?').run(id);
  return result.changes;
};

export const clearReplayNoteSearchDocuments = (): void => {
  db.prepare('DELETE FROM replay_notes_fts').run();
};

export const clearReplayNoteRows = (): number => {
  const result = db.prepare('DELETE FROM replay_notes').run();
  return result.changes;
};

export const rebindTrainingRecordNoteRows = (input: {
  sourceId: string;
  targetId: string;
  updatedAt: string;
}): number =>
  db.transaction(() => {
    const result = db.prepare(
      `UPDATE replay_notes
       SET training_project_id = ?, updated_at = ?
       WHERE type = 'FREE_REPLAY'
         AND training_project_id = ?`,
    ).run(input.targetId, input.updatedAt, input.sourceId);

    db.prepare(
      `UPDATE replay_note_context_refs
       SET training_project_id = ?, updated_at = ?
       WHERE training_project_id = ?
         AND note_id IN (
           SELECT id FROM replay_notes WHERE type = 'FREE_REPLAY'
         )`,
    ).run(input.targetId, input.updatedAt, input.sourceId);

    return result.changes;
  })();
