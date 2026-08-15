// SPDX-License-Identifier: GPL-3.0-only

import Database from 'better-sqlite3';

import { db } from '../database.js';

import type { AcquisitionJobStore } from './marketDataAcquisitionJobStore.js';

export type PersistedAcquisitionJobRow = {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'READY_TO_SAVE' | 'FAILED' | 'CANCELED';
  requestJson: string;
  progressJson: string;
  sourceResultsJson: string;
  stagingJson: string | null;
  errorJson: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

type RepositoryStatements = {
  upsertJobStmt: Database.Statement;
  deleteJobStmt: Database.Statement;
  listJobsStmt: Database.Statement;
  pruneJobsStmt: Database.Statement;
  markInterruptedStmt: Database.Statement;
};

type RowKey = 'id' | 'status' | 'requestJson' | 'progressJson' | 'sourceResultsJson' | 'stagingJson' | 'errorJson' | 'createdAt' | 'updatedAt' | 'finishedAt';

const rowKeys: RowKey[] = [
  'id',
  'status',
  'requestJson',
  'progressJson',
  'sourceResultsJson',
  'stagingJson',
  'errorJson',
  'createdAt',
  'updatedAt',
  'finishedAt',
];

const toRow = (record: Record<string, unknown>): PersistedAcquisitionJobRow => {
  const row = {} as Record<RowKey, unknown>;
  for (const key of rowKeys) {
    row[key] = record[String(key).replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)];
  }
  return {
    id: String(row.id ?? ''),
    status: String(row.status ?? '') as PersistedAcquisitionJobRow['status'],
    requestJson: String(row.requestJson ?? ''),
    progressJson: String(row.progressJson ?? ''),
    sourceResultsJson: String(row.sourceResultsJson ?? ''),
    stagingJson: row.stagingJson === null || row.stagingJson === undefined
      ? null
      : String(row.stagingJson),
    errorJson: row.errorJson === null || row.errorJson === undefined
      ? null
      : String(row.errorJson),
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
    finishedAt: row.finishedAt === null || row.finishedAt === undefined
      ? null
      : String(row.finishedAt),
  };
};

// Statements are prepared lazily so importing this module stays safe while
// the durable database is unavailable (blocked startup). The handler only
// constructs this store when the database is actually open; the lazy barrier
// keeps a misconfigured wiring from crashing unrelated acquisition routes.
export const createMarketDataAcquisitionJobRepository = (
  database: Database.Database = db,
): AcquisitionJobStore => {
    let statements: RepositoryStatements | null = null;

    const prepare = (): RepositoryStatements => {
      if (!statements) {
        statements = {
          upsertJobStmt: database.prepare(`
            INSERT INTO local_data_acquisition_jobs (
              id, status, request_json, progress_json, source_results_json,
              staging_json, error_json, created_at, updated_at, finished_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              status = excluded.status,
              progress_json = excluded.progress_json,
              source_results_json = excluded.source_results_json,
              staging_json = excluded.staging_json,
              error_json = excluded.error_json,
              updated_at = excluded.updated_at,
              finished_at = excluded.finished_at
          `),
          deleteJobStmt: database.prepare(
            'DELETE FROM local_data_acquisition_jobs WHERE id = ?',
          ),
          listJobsStmt: database.prepare(`
            SELECT id, status, request_json, progress_json, source_results_json,
                   staging_json, error_json, created_at, updated_at, finished_at
              FROM local_data_acquisition_jobs
             ORDER BY updated_at DESC, id DESC
             LIMIT ?
          `),
          // Ready-to-save jobs are never pruned by position so a user can
          // still retry saving them even after newer jobs have accumulated.
          pruneJobsStmt: database.prepare(`
            DELETE FROM local_data_acquisition_jobs
             WHERE id IN (
               SELECT id FROM local_data_acquisition_jobs
                WHERE status != 'READY_TO_SAVE'
                ORDER BY updated_at DESC, id DESC
                LIMIT -1 OFFSET ?
             )
             RETURNING id
          `),
          markInterruptedStmt: database.prepare(`
            UPDATE local_data_acquisition_jobs
               SET status = 'FAILED', error_json = ?, updated_at = ?, finished_at = ?
             WHERE status IN ('QUEUED', 'RUNNING')
             RETURNING id
          `),
        };
      }
      return statements;
    };

    return {
      upsert(row: PersistedAcquisitionJobRow): void {
        prepare().upsertJobStmt.run(
          row.id,
          row.status,
          row.requestJson,
          row.progressJson,
          row.sourceResultsJson,
          row.stagingJson,
          row.errorJson,
          row.createdAt,
          row.updatedAt,
          row.finishedAt,
        );
      },
      remove(jobId: string): void {
        prepare().deleteJobStmt.run(jobId);
      },
      list(limit: number): PersistedAcquisitionJobRow[] {
        return (prepare().listJobsStmt.all(limit) as Array<Record<string, unknown>>)
          .map(toRow)
          .filter((row) => row.id.length > 0);
      },
      prune(keep: number): string[] {
        return (prepare().pruneJobsStmt.all(keep) as Array<{ id?: unknown }>)
          .map((row) => String(row.id ?? ''))
          .filter((id) => id.length > 0);
      },
      markRunningInterrupted(errorJson: string, updatedAt: string): string[] {
        return (
          prepare().markInterruptedStmt.all(errorJson, updatedAt, updatedAt) as Array<{
            id?: unknown;
          }>
        )
          .map((row) => String(row.id ?? ''))
          .filter((id) => id.length > 0);
      },
    };
  };
