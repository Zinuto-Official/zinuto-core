// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import { db } from '../database.js';
import type {
  PortablePayloadInsertTableName,
  PortablePayloadJsonRow,
  PortablePayloadMarketBarRow,
  PortablePayloadTableName,
  PortableSqlRange,
} from '../../../domain/portableDataRepositoryTypes.js';

type PayloadInsertStatement = Database.Statement<unknown[]>;

const portablePayloadInsertStatementCache = new WeakMap<
  Database.Database,
  Map<string, PayloadInsertStatement>
>();

const getPortablePayloadInsertStatement = (
  payloadDb: Database.Database,
  tableName: PortablePayloadInsertTableName,
  columns: readonly string[],
): PayloadInsertStatement => {
  let statementsByShape = portablePayloadInsertStatementCache.get(payloadDb);
  if (!statementsByShape) {
    statementsByShape = new Map<string, PayloadInsertStatement>();
    portablePayloadInsertStatementCache.set(payloadDb, statementsByShape);
  }
  const cacheKey = `${tableName}:${columns.join('\u001f')}`;
  const cached = statementsByShape.get(cacheKey);
  if (cached) {
    return cached;
  }
  const placeholders = columns.map(() => '?').join(',');
  const statement = payloadDb.prepare<unknown[]>(
    `INSERT OR REPLACE INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`,
  );
  statementsByShape.set(cacheKey, statement);
  return statement;
};

export const listPortableSourceRowsForManifest = (): Array<Record<string, unknown>> =>
  db
    .prepare(
      `SELECT
         s.id AS source_id,
         s.name AS source_name,
         s.base_timeframe,
         s.time_zone,
         s.time_zone_origin,
         s.import_scope_strategy,
         s.import_scope_top_level_subfolder,
         s.field_mapping_json,
         s.trading_calendar_json,
         s.symbol_count,
         s.bar_count,
         s.time_start_ts,
         s.time_end_ts,
         s.updated_at,
         pm.fingerprint_hash AS stored_fingerprint_hash,
         (
           SELECT group_concat(ordered_fingerprints.entry, '|')
           FROM (
             SELECT coalesce(f.symbol, '') || ':' ||
                    coalesce(f.file_path, '') || ':' ||
                    coalesce(f.file_name, '') || ':' ||
                    coalesce(f.file_fingerprint, '') AS entry
             FROM local_data_source_files f
             WHERE f.source_id = s.id
             ORDER BY coalesce(f.symbol, '') ASC,
                      coalesce(f.file_path, '') ASC,
                      coalesce(f.file_name, '') ASC,
                      coalesce(f.file_fingerprint, '') ASC
           ) ordered_fingerprints
         ) AS fingerprint_input
       FROM local_data_sources s
       LEFT JOIN portable_source_manifests pm ON pm.source_id = s.id
       ORDER BY s.updated_at DESC, s.created_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;

export const listInstrumentSourceRows = (): Array<{
  id?: unknown;
  source_id?: unknown;
}> =>
  db
    .prepare('SELECT id, source_id FROM instruments')
    .all() as Array<{ id?: unknown; source_id?: unknown }>;

export const listPortableMarketSourceRows = (
  sourceIds: readonly string[],
): Array<Record<string, unknown>> => {
  const placeholders = sourceIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT *
         FROM local_data_sources
        WHERE id IN (${placeholders})
        ORDER BY updated_at DESC, created_at DESC`,
    )
    .all(...sourceIds) as Array<Record<string, unknown>>;
};

export const listPortableMarketInstrumentRows = (
  sourceIds: readonly string[],
): Array<Record<string, unknown>> => {
  const placeholders = sourceIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT *
         FROM instruments
        WHERE source_id IN (${placeholders})
          AND market = 'LOCAL'
        ORDER BY source_id ASC, symbol ASC, base_timeframe ASC`,
    )
    .all(...sourceIds) as Array<Record<string, unknown>>;
};

export const listPortableMarketLatestLedgerRows = (
  sourceIds: readonly string[],
): Array<Record<string, unknown>> => {
  const placeholders = sourceIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT source_id,
              instrument_id,
              symbol,
              file_name,
              file_path,
              file_size,
              file_mtime_ms,
              file_fingerprint,
              updated_at
         FROM (
           SELECT source_id,
                  instrument_id,
                  symbol,
                  file_name,
                  file_path,
                  file_size,
                  file_mtime_ms,
                  file_fingerprint,
                  updated_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY source_id, COALESCE(NULLIF(TRIM(file_path), ''), NULLIF(TRIM(file_name), ''), symbol)
                    ORDER BY updated_at DESC, created_at DESC, id DESC
                  ) AS row_rank
             FROM local_data_source_files
            WHERE source_id IN (${placeholders})
              AND rows_imported > 0
         ) ranked
        WHERE row_rank = 1`,
    )
    .all(...sourceIds) as Array<Record<string, unknown>>;
};

export const countTrainingProjectReplayRefsBySourceId = (
  sourceIds: readonly string[],
): Array<{ source_id?: unknown; count?: unknown }> => {
  const placeholders = sourceIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT i.source_id AS source_id, COUNT(*) AS count
         FROM training_project_replay_refs r
         INNER JOIN instruments i ON i.id = r.instrument_id
        WHERE i.source_id IN (${placeholders})
        GROUP BY i.source_id`,
    )
    .all(...sourceIds) as Array<{ source_id?: unknown; count?: unknown }>;
};

export const countSpecialTrainingQuestionsBySourceId = (
  sourceIds: readonly string[],
): Array<{ source_id?: unknown; count?: unknown }> => {
  const placeholders = sourceIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT i.source_id AS source_id, COUNT(*) AS count
         FROM special_training_history_questions q
         INNER JOIN instruments i ON i.id = q.instrument_id
        WHERE i.source_id IN (${placeholders})
        GROUP BY i.source_id`,
    )
    .all(...sourceIds) as Array<{ source_id?: unknown; count?: unknown }>;
};

export const getPortableCustomIndicatorPreviewStats = (
  range: PortableSqlRange,
): { count?: unknown; bytes?: unknown } | undefined =>
  db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(LENGTH(source) + LENGTH(parameter_inputs_json) + LENGTH(revisions_json)), 0) AS bytes
         FROM custom_indicator_profiles
         ${range.whereSql}`,
    )
    .get(...range.values) as { count?: unknown; bytes?: unknown } | undefined;

export const getPortableNotesPreviewStats = (
  range: PortableSqlRange,
): { count?: unknown; bytes?: unknown } | undefined =>
  db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(LENGTH(title) + LENGTH(content_preview)), 0) AS bytes
         FROM replay_notes
         ${range.whereSql}`,
    )
    .get(...range.values) as { count?: unknown; bytes?: unknown } | undefined;

export const getPortableTrainingHistoryPreviewStats = (
  range: PortableSqlRange,
): { count?: unknown; bytes?: unknown } | undefined =>
  db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(LENGTH(name) + LENGTH(summary_json) + LENGTH(operator_summary_json)), 0) AS bytes
         FROM training_projects
         ${range.whereSql}`,
    )
    .get(...range.values) as { count?: unknown; bytes?: unknown } | undefined;

export const getPortableSpecialTrainingHistoryPreviewStats = (
  range: PortableSqlRange,
): { count?: unknown; bytes?: unknown } | undefined =>
  db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(LENGTH(config_json)), 0) AS bytes
         FROM special_training_history_sessions
         ${range.whereSql}`,
    )
    .get(...range.values) as { count?: unknown; bytes?: unknown } | undefined;

export const insertPortablePayloadRow = ({
  payloadDb,
  tableName,
  idColumn,
  id,
  payload,
  updatedAt,
  extra = {},
}: {
  payloadDb: Database.Database;
  tableName: PortablePayloadInsertTableName;
  idColumn: string;
  id: string;
  payload: unknown;
  updatedAt: string;
  extra?: Record<string, unknown>;
}): void => {
  const columns = [idColumn, ...Object.keys(extra), 'payload_json', 'updated_at'];
  const values = [
    id,
    ...Object.values(extra),
    JSON.stringify(payload ?? null),
    updatedAt,
  ];
  getPortablePayloadInsertStatement(payloadDb, tableName, columns).run(...values);
};

export const insertPortablePayloadMarketBarRows = (
  payloadDb: Database.Database,
  rows: readonly PortablePayloadMarketBarRow[],
): void => {
  const statement = payloadDb.prepare(
    `INSERT OR REPLACE INTO portable_export_market_bars (
      instrument_id,ts_ms,open,high,low,close,volume
    ) VALUES (?,?,?,?,?,?,?)`,
  );
  rows.forEach((row) => {
    statement.run(
      row.instrumentId,
      row.tsMs,
      row.open,
      row.high,
      row.low,
      row.close,
      row.volume,
    );
  });
};

export const readPortablePayloadRows = <T>(
  payloadDb: Database.Database,
  tableName: PortablePayloadTableName,
): T[] =>
  payloadDb
    .prepare(`SELECT * FROM ${tableName}`)
    .all()
    .map((row) => row as T);

export const getPortablePayloadJsonByKey = ({
  payloadDb,
  tableName,
  keyColumn,
  key,
}: {
  payloadDb: Database.Database;
  tableName: PortablePayloadInsertTableName;
  keyColumn: string;
  key: string;
}): PortablePayloadJsonRow | undefined =>
  payloadDb
    .prepare(
      `SELECT payload_json FROM ${tableName} WHERE ${keyColumn} = ? LIMIT 1`,
    )
    .get(key) as PortablePayloadJsonRow | undefined;

export const listPortablePayloadMarketBars = ({
  payloadDb,
  instrumentId,
  limit,
  offset,
}: {
  payloadDb: Database.Database;
  instrumentId: string;
  limit: number;
  offset: number;
}): Array<Record<string, unknown>> =>
  payloadDb
    .prepare(
      `SELECT ts_ms, open, high, low, close, volume
         FROM portable_export_market_bars
        WHERE instrument_id = ?
        ORDER BY ts_ms ASC
        LIMIT ? OFFSET ?`,
    )
    .all(instrumentId, limit, offset) as Array<Record<string, unknown>>;

export const listReplayNoteRowsForExport = (
  range: PortableSqlRange,
  limit?: number,
  offset?: number,
): Array<Record<string, unknown>> =>
  db
    .prepare(
      `SELECT n.*
         FROM replay_notes n
         ${range.whereSql}
        ORDER BY n.updated_at DESC, n.id DESC
        ${limit ? 'LIMIT ? OFFSET ?' : ''}`,
    )
    .all(...range.values, ...(limit ? [limit, Math.max(0, Math.floor(offset ?? 0))] : [])) as Array<
    Record<string, unknown>
  >;

export const getReplayNoteExportBundleRows = (
  noteId: string,
): {
  content: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  colors: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  contextArchive: Record<string, unknown> | null;
} => {
  const content =
    (db
      .prepare('SELECT * FROM replay_note_contents WHERE note_id = ? LIMIT 1')
      .get(noteId) as Record<string, unknown> | undefined) ?? null;
  const meta =
    (db
      .prepare('SELECT * FROM replay_note_meta WHERE note_id = ? LIMIT 1')
      .get(noteId) as Record<string, unknown> | undefined) ?? null;
  const colors = db
    .prepare(
      'SELECT * FROM replay_note_colors WHERE note_id = ? ORDER BY sort_index ASC, color_token ASC',
    )
    .all(noteId) as Array<Record<string, unknown>>;
  const attachments = db
    .prepare(
      'SELECT * FROM replay_note_attachments WHERE note_id = ? ORDER BY sort_index ASC, attachment_ref_id ASC',
    )
    .all(noteId) as Array<Record<string, unknown>>;
  const contextArchive =
    (db
      .prepare('SELECT * FROM replay_note_context_archives WHERE note_id = ? LIMIT 1')
      .get(noteId) as Record<string, unknown> | undefined) ?? null;
  return {
    content,
    meta,
    colors,
    attachments,
    contextArchive,
  };
};

export const listTrainingProjectRowsForExport = (
  range: PortableSqlRange,
  limit?: number,
  offset?: number,
): Array<Record<string, unknown>> =>
  db
    .prepare(
      `SELECT *
         FROM training_projects
         ${range.whereSql}
        ORDER BY created_at DESC, id DESC
        ${limit ? 'LIMIT ? OFFSET ?' : ''}`,
    )
    .all(...range.values, ...(limit ? [limit, Math.max(0, Math.floor(offset ?? 0))] : [])) as Array<
    Record<string, unknown>
  >;

export const getTrainingProjectReplayRefRow = (
  projectId: string,
): Record<string, unknown> | null =>
  (db
    .prepare('SELECT * FROM training_project_replay_refs WHERE project_id = ? LIMIT 1')
    .get(projectId) as Record<string, unknown> | undefined) ?? null;

export const listTrainingProjectReplayFillRowsForExport = (
  projectId: string,
): Array<Record<string, unknown>> =>
  db
    .prepare(
      `SELECT project_id,fill_index,row_seq,side,fill_time,fill_price,fill_qty,
              contract_multiplier,fee,tax,slippage,created_at
         FROM training_project_replay_fills
        WHERE project_id = ?
        ORDER BY fill_index ASC, row_seq ASC`,
    )
    .all(projectId) as Array<Record<string, unknown>>;

export const listTrainingProjectReplayCashAdjustmentRowsForExport = (
  projectId: string,
): Array<Record<string, unknown>> =>
  db
    .prepare(
      `SELECT project_id,bar_index,row_seq,kind,amount,ts,created_at
         FROM training_project_replay_cash_adjustments
        WHERE project_id = ?
        ORDER BY bar_index ASC, row_seq ASC`,
    )
    .all(projectId) as Array<Record<string, unknown>>;

export const listSpecialTrainingSessionRowsForExport = (
  range: PortableSqlRange,
  limit?: number,
  offset?: number,
): Array<Record<string, unknown>> =>
  db
    .prepare(
      `SELECT *
         FROM special_training_history_sessions
         ${range.whereSql}
        ORDER BY finished_at DESC, id DESC
        ${limit ? 'LIMIT ? OFFSET ?' : ''}`,
    )
    .all(...range.values, ...(limit ? [limit, Math.max(0, Math.floor(offset ?? 0))] : [])) as Array<
    Record<string, unknown>
  >;

export const listSpecialTrainingQuestionRowsForSessionIds = (
  sessionIds: readonly string[],
  limit?: number,
  offset?: number,
): Array<Record<string, unknown>> => {
  if (!sessionIds.length) {
    return [];
  }
  const placeholders = sessionIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT *
         FROM special_training_history_questions
        WHERE session_id IN (${placeholders})
        ORDER BY settled_at DESC, id DESC
        ${limit ? 'LIMIT ? OFFSET ?' : ''}`,
    )
    .all(...sessionIds, ...(limit ? [limit, Math.max(0, Math.floor(offset ?? 0))] : [])) as Array<
    Record<string, unknown>
  >;
};

export const listCustomIndicatorRowsForExport = (
  range: PortableSqlRange,
): Array<Record<string, unknown>> =>
  db
    .prepare(
      `SELECT * FROM custom_indicator_profiles ${range.whereSql} ORDER BY updated_at DESC, id DESC`,
    )
    .all(...range.values) as Array<Record<string, unknown>>;
