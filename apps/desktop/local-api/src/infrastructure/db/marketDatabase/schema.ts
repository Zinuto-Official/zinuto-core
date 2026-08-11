// SPDX-License-Identifier: GPL-3.0-only

import type { DuckDBConnection } from '@duckdb/node-api';
import { appError, isAppError } from '../../../kernel/appError.js';
import { db } from '../database.js';
import { probeMarketSchemaConnection } from './schemaDefinition.js';

export const localMarketDataNeedsAttentionError = (
  reason: 'SCHEMA_MISMATCH' | 'DATABASE_CORRUPTED'
): Error =>
  appError('LOCAL_MARKET_DATA_NEEDS_ATTENTION', { reason }, 503);

export const isLocalMarketDataNeedsAttentionError = (error: unknown): boolean =>
  isAppError(error) && error.code === 'LOCAL_MARKET_DATA_NEEDS_ATTENTION';

export const canReclaimUnreadableMarketStorageAsEmpty = (): boolean => {
  try {
    const activeImportJobs = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS count
             FROM local_data_import_jobs
            WHERE status IN ('QUEUED', 'RUNNING')`,
        )
        .pluck()
        .get() ?? 0,
    );
    if (Number.isFinite(activeImportJobs) && activeImportJobs > 0) {
      return false;
    }

    const coreLocalBarCount = Number(
      db
        .prepare(
          `SELECT COALESCE(SUM(bar_count), 0) AS barCount
             FROM instruments
            WHERE (market = 'LOCAL' OR source_id IS NOT NULL)
              AND bar_count > 0`,
        )
        .pluck()
        .get() ?? 0,
    );
    const sourceLocalBarCount = Number(
      db
        .prepare(
          `SELECT COALESCE(SUM(bar_count), 0) AS barCount
             FROM local_data_sources
            WHERE bar_count > 0`,
        )
        .pluck()
        .get() ?? 0,
    );
    return (
      (!Number.isFinite(coreLocalBarCount) || coreLocalBarCount <= 0) &&
      (!Number.isFinite(sourceLocalBarCount) || sourceLocalBarCount <= 0)
    );
  } catch {
    return false;
  }
};

export const assertExistingMarketDbSchemaCompatible = async (
  connection: DuckDBConnection,
  existingMarketDb: boolean
): Promise<void> => {
  if (!existingMarketDb) {
    return;
  }
  let isCurrent = false;
  try {
    isCurrent = (await probeMarketSchemaConnection(connection)).isCurrent;
  } catch {
    throw localMarketDataNeedsAttentionError('DATABASE_CORRUPTED');
  }
  if (!isCurrent) {
    throw localMarketDataNeedsAttentionError('SCHEMA_MISMATCH');
  }
};
