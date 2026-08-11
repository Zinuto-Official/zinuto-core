// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

const LOCAL_DATA_IMPORT_JOBS_PER_SOURCE_LIMIT = 20;
const IMPORT_JOB_RETENTION_CHUNK_SIZE = 400;

type ImportJobRetentionRow = {
  id: string;
  total_files?: unknown;
  done_files?: unknown;
  total_rows?: unknown;
  imported_rows?: unknown;
  skipped_rows?: unknown;
  error_files?: unknown;
};

export type LocalDataImportJobRetentionResult = {
  sourceId: string;
  deletedJobs: number;
  summarizedFiles: number;
  summarizedRows: number;
  summarizedImportedRows: number;
  summarizedSkippedRows: number;
  summarizedErrorFiles: number;
};

const toNonNegativeInteger = (value: unknown): number => {
  const numeric = Math.floor(Number(value) || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const normalizeSourceId = (sourceId: unknown): string =>
  String(sourceId ?? '').trim();

const runChunked = (
  ids: readonly string[],
  handler: (chunk: readonly string[], placeholders: string) => number,
): number => {
  let changed = 0;
  for (let index = 0; index < ids.length; index += IMPORT_JOB_RETENTION_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + IMPORT_JOB_RETENTION_CHUNK_SIZE);
    if (!chunk.length) {
      continue;
    }
    changed += handler(chunk, chunk.map(() => '?').join(','));
  }
  return changed;
};

const listPrunableImportJobsBySource = (
  sourceId: string,
  keepPerSource: number,
): ImportJobRetentionRow[] =>
  db
    .prepare(
      `SELECT id,total_files,done_files,total_rows,imported_rows,skipped_rows,error_files
         FROM (
           SELECT j.id,
                  j.total_files,
                  j.done_files,
                  j.total_rows,
                  j.imported_rows,
                  j.skipped_rows,
                  j.error_files,
                  ROW_NUMBER() OVER (
                    ORDER BY COALESCE(j.finished_at, j.updated_at, j.created_at) DESC,
                             j.created_at DESC,
                             j.id DESC
                  ) AS source_rank
             FROM local_data_import_jobs j
             LEFT JOIN local_data_sources s ON s.id = j.source_id
            WHERE j.source_id = ?
              AND j.status IN ('SUCCESS','PARTIAL_SUCCESS','FAILED','CANCELED')
              AND j.id <> COALESCE(s.last_job_id, '')
         )
        WHERE source_rank > ?
        ORDER BY source_rank DESC, id DESC`,
    )
    .all(sourceId, keepPerSource) as ImportJobRetentionRow[];

const appendPrunedImportJobSummary = (
  sourceId: string,
  rows: readonly ImportJobRetentionRow[],
): void => {
  if (!rows.length) {
    return;
  }
  const summary = rows.reduce(
    (current, row) => ({
      jobs: current.jobs + 1,
      files: current.files + toNonNegativeInteger(row.total_files),
      totalRows: current.totalRows + toNonNegativeInteger(row.total_rows),
      importedRows: current.importedRows + toNonNegativeInteger(row.imported_rows),
      skippedRows: current.skippedRows + toNonNegativeInteger(row.skipped_rows),
      errorFiles: current.errorFiles + toNonNegativeInteger(row.error_files),
    }),
    {
      jobs: 0,
      files: 0,
      totalRows: 0,
      importedRows: 0,
      skippedRows: 0,
      errorFiles: 0,
    },
  );
  db.prepare(
    `UPDATE local_data_sources
        SET pruned_import_job_count = pruned_import_job_count + ?,
            pruned_import_file_count = pruned_import_file_count + ?,
            pruned_import_total_rows = pruned_import_total_rows + ?,
            pruned_import_imported_rows = pruned_import_imported_rows + ?,
            pruned_import_skipped_rows = pruned_import_skipped_rows + ?,
            pruned_import_error_files = pruned_import_error_files + ?
      WHERE id = ?`,
  ).run(
    summary.jobs,
    summary.files,
    summary.totalRows,
    summary.importedRows,
    summary.skippedRows,
    summary.errorFiles,
    sourceId,
  );
};

const deleteImportJobsByIds = (ids: readonly string[]): number =>
  runChunked(ids, (chunk, placeholders) => {
    const result = db
      .prepare(`DELETE FROM local_data_import_jobs WHERE id IN (${placeholders})`)
      .run(...chunk);
    return toNonNegativeInteger(result.changes);
  });

export const pruneLocalDataImportJobsForSource = (
  sourceIdRaw: string,
  keepPerSource = LOCAL_DATA_IMPORT_JOBS_PER_SOURCE_LIMIT,
): LocalDataImportJobRetentionResult => {
  const sourceId = normalizeSourceId(sourceIdRaw);
  const normalizedKeepPerSource = Math.max(1, Math.floor(Number(keepPerSource) || 0));
  if (!sourceId) {
    return {
      sourceId: '',
      deletedJobs: 0,
      summarizedFiles: 0,
      summarizedRows: 0,
      summarizedImportedRows: 0,
      summarizedSkippedRows: 0,
      summarizedErrorFiles: 0,
    };
  }

  return db.transaction(() => {
    const rows = listPrunableImportJobsBySource(sourceId, normalizedKeepPerSource);
    if (!rows.length) {
      return {
        sourceId,
        deletedJobs: 0,
        summarizedFiles: 0,
        summarizedRows: 0,
        summarizedImportedRows: 0,
        summarizedSkippedRows: 0,
        summarizedErrorFiles: 0,
      };
    }
    appendPrunedImportJobSummary(sourceId, rows);
    const deletedJobs = deleteImportJobsByIds(
      rows
        .map((row) => normalizeSourceId(row.id))
        .filter((id) => id.length > 0),
    );
    return {
      sourceId,
      deletedJobs,
      summarizedFiles: rows.reduce((sum, row) => sum + toNonNegativeInteger(row.total_files), 0),
      summarizedRows: rows.reduce((sum, row) => sum + toNonNegativeInteger(row.total_rows), 0),
      summarizedImportedRows: rows.reduce((sum, row) => sum + toNonNegativeInteger(row.imported_rows), 0),
      summarizedSkippedRows: rows.reduce((sum, row) => sum + toNonNegativeInteger(row.skipped_rows), 0),
      summarizedErrorFiles: rows.reduce((sum, row) => sum + toNonNegativeInteger(row.error_files), 0),
    };
  })();
};

export const pruneLocalDataImportJobsForAllSources = (): LocalDataImportJobRetentionResult[] => {
  const sourceIds = (
    db
      .prepare(
        `SELECT DISTINCT source_id AS sourceId
           FROM local_data_import_jobs
          WHERE source_id IS NOT NULL
            AND TRIM(source_id) <> ''
          ORDER BY source_id ASC`,
      )
      .all() as Array<{ sourceId?: unknown }>
  )
    .map((row) => normalizeSourceId(row.sourceId))
    .filter((sourceId) => sourceId.length > 0);
  return sourceIds.map((sourceId) => pruneLocalDataImportJobsForSource(sourceId));
};
