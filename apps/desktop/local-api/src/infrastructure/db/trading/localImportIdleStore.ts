// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';

type CreateLocalImportIdleProbeInput = {
  db: Pick<Database.Database, 'prepare'>;
};

export const createLocalImportIdleProbe = ({
  db,
}: CreateLocalImportIdleProbeInput) => {
  const countActiveLocalDataImportJobsStmt = db.prepare(
    `SELECT COUNT(*) AS count
       FROM local_data_import_jobs
      WHERE status IN ('QUEUED', 'RUNNING')`,
  );

  const isLocalDataImportIdle = (): boolean => {
    const row = countActiveLocalDataImportJobsStmt.get() as
      | { count?: unknown }
      | undefined;
    const count = Number(row?.count ?? 0);
    return !Number.isFinite(count) || count <= 0;
  };

  return {
    isLocalDataImportIdle,
  };
};
