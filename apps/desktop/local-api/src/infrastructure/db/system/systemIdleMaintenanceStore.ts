// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

const countActiveLocalDataImportJobsStmt = db.prepare(
  `SELECT COUNT(*) AS count
     FROM local_data_import_jobs
    WHERE status IN ('QUEUED', 'RUNNING')`,
);

const listDeletingLocalDataSourceIdsStmt = db.prepare(
  `SELECT id FROM local_data_sources WHERE deletion_state = 'DELETING' LIMIT ?`,
);

const listInstrumentIdsBySourceIdStmt = db.prepare(
  `SELECT id FROM instruments WHERE source_id = ?`,
);

const deleteInstrumentsBySourceIdStmt = db.prepare(
  `DELETE FROM instruments WHERE source_id = ?`,
);

const deleteLocalDataSourceByIdStmt = db.prepare(
  `DELETE FROM local_data_sources WHERE id = ?`,
);

export const isLocalDataImportIdle = (): boolean => {
  const row = countActiveLocalDataImportJobsStmt.get() as
    | { count?: unknown }
    | undefined;
  const count = Number(row?.count ?? 0);
  return !Number.isFinite(count) || count <= 0;
};

export const listDeletingLocalDataSourceIds = (limit: number): string[] =>
  (
    listDeletingLocalDataSourceIdsStmt.all(limit) as Array<{
      id?: unknown;
    }>
  )
    .map((row) => String(row.id ?? '').trim())
    .filter(Boolean);

export const listInstrumentIdsBySourceId = (sourceId: string): string[] =>
  (
    listInstrumentIdsBySourceIdStmt.all(sourceId) as Array<{
      id?: unknown;
    }>
  )
    .map((row) => String(row.id ?? '').trim())
    .filter(Boolean);

const deleteLocalDataSourceMetadataTransaction = db.transaction((sourceId: string) => {
  deleteInstrumentsBySourceIdStmt.run(sourceId);
  deleteLocalDataSourceByIdStmt.run(sourceId);
});

export const deleteLocalDataSourceMetadataById = (sourceId: string): void => {
  deleteLocalDataSourceMetadataTransaction(sourceId);
};
