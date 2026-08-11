// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';

export type ResetAllDataOperationCheckpoint =
  | 'PREPARED'
  | 'CORE_DATA_COMMITTED'
  | 'MARKET_DATA_CLEARED'
  | 'SEEDS_RECONCILED'
  | 'STORAGE_RECLAIMED'
  | 'VERIFIED';

export type ResetAllDataOperationStatus =
  | 'RUNNING'
  | 'RECOVERY_REQUIRED'
  | 'BLOCKED'
  | 'SUCCESS'
  | 'ABORTED';

export type ResetAllDataOperationRow = {
  id: string;
  operation_key: 'RESET_ALL_STORED_DATA';
  status: ResetAllDataOperationStatus;
  checkpoint: ResetAllDataOperationCheckpoint;
  recovery_attempts: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

type CreateSystemResetJournalStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
};

const INCOMPLETE_STATUS_SQL = "'RUNNING','RECOVERY_REQUIRED','BLOCKED'";

const assertJournalUpdate = (changes: number): void => {
  if (changes !== 1) {
    throw new Error('RESET_ALL_DATA_JOURNAL_UPDATE_FAILED');
  }
};

export const createSystemResetJournalStore = ({
  db,
}: CreateSystemResetJournalStoreDeps) => {
  const insertPreparedOperationStmt = db.prepare(
    `INSERT INTO system_reset_operations (
       id, operation_key, status, checkpoint, recovery_attempts,
       error_code, created_at, updated_at, finished_at
     ) VALUES (?, 'RESET_ALL_STORED_DATA', 'RUNNING', 'PREPARED', 0, NULL, ?, ?, NULL)`,
  );
  const readIncompleteOperationStmt = db.prepare(
    `SELECT id, operation_key, status, checkpoint, recovery_attempts,
            error_code, created_at, updated_at, finished_at
       FROM system_reset_operations
      WHERE operation_key = 'RESET_ALL_STORED_DATA'
        AND status IN (${INCOMPLETE_STATUS_SQL})
      ORDER BY created_at ASC, id ASC
      LIMIT 1`,
  );
  const markCheckpointStmt = db.prepare(
    `UPDATE system_reset_operations
        SET status = 'RUNNING', checkpoint = ?, error_code = NULL,
            updated_at = ?, finished_at = NULL
      WHERE id = ?
        AND operation_key = 'RESET_ALL_STORED_DATA'
        AND status IN (${INCOMPLETE_STATUS_SQL})`,
  );
  const beginRecoveryStmt = db.prepare(
    `UPDATE system_reset_operations
        SET status = 'RUNNING', recovery_attempts = recovery_attempts + 1,
            error_code = NULL, updated_at = ?, finished_at = NULL
      WHERE id = ?
        AND operation_key = 'RESET_ALL_STORED_DATA'
        AND status IN (${INCOMPLETE_STATUS_SQL})`,
  );
  const markRecoveryRequiredStmt = db.prepare(
    `UPDATE system_reset_operations
        SET status = 'RECOVERY_REQUIRED', error_code = ?, updated_at = ?,
            finished_at = NULL
      WHERE id = ?
        AND operation_key = 'RESET_ALL_STORED_DATA'
        AND status IN (${INCOMPLETE_STATUS_SQL})`,
  );
  const markBlockedStmt = db.prepare(
    `UPDATE system_reset_operations
        SET status = 'BLOCKED', error_code = ?, updated_at = ?,
            finished_at = NULL
      WHERE id = ?
        AND operation_key = 'RESET_ALL_STORED_DATA'
        AND status IN (${INCOMPLETE_STATUS_SQL})`,
  );
  const markAbortedStmt = db.prepare(
    `UPDATE system_reset_operations
        SET status = 'ABORTED', error_code = NULL, updated_at = ?, finished_at = ?
      WHERE id = ?
        AND operation_key = 'RESET_ALL_STORED_DATA'
        AND checkpoint = 'PREPARED'
        AND status IN (${INCOMPLETE_STATUS_SQL})`,
  );
  const markSucceededStmt = db.prepare(
    `UPDATE system_reset_operations
        SET status = 'SUCCESS', checkpoint = 'VERIFIED', error_code = NULL,
            updated_at = ?, finished_at = ?
      WHERE id = ?
        AND operation_key = 'RESET_ALL_STORED_DATA'
        AND status IN (${INCOMPLETE_STATUS_SQL})`,
  );

  return {
    createPreparedOperation: ({
      operationId,
      createdAt,
    }: {
      operationId: string;
      createdAt: string;
    }): void => {
      insertPreparedOperationStmt.run(operationId, createdAt, createdAt);
    },
    readIncompleteOperation: (): ResetAllDataOperationRow | null =>
      (readIncompleteOperationStmt.get() as
        | ResetAllDataOperationRow
        | undefined) ?? null,
    markCheckpoint: ({
      operationId,
      checkpoint,
      updatedAt,
    }: {
      operationId: string;
      checkpoint: ResetAllDataOperationCheckpoint;
      updatedAt: string;
    }): void => {
      assertJournalUpdate(
        markCheckpointStmt.run(checkpoint, updatedAt, operationId).changes,
      );
    },
    beginRecovery: (operationId: string, updatedAt: string): void => {
      assertJournalUpdate(
        beginRecoveryStmt.run(updatedAt, operationId).changes,
      );
    },
    markRecoveryRequired: (
      operationId: string,
      errorCode: string,
      updatedAt: string,
    ): void => {
      assertJournalUpdate(
        markRecoveryRequiredStmt.run(errorCode, updatedAt, operationId).changes,
      );
    },
    markBlocked: (
      operationId: string,
      errorCode: string,
      updatedAt: string,
    ): void => {
      assertJournalUpdate(
        markBlockedStmt.run(errorCode, updatedAt, operationId).changes,
      );
    },
    markAborted: (operationId: string, finishedAt: string): void => {
      assertJournalUpdate(
        markAbortedStmt.run(finishedAt, finishedAt, operationId).changes,
      );
    },
    markSucceeded: (operationId: string, finishedAt: string): void => {
      assertJournalUpdate(
        markSucceededStmt.run(finishedAt, finishedAt, operationId).changes,
      );
    },
  };
};
