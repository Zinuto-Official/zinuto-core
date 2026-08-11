// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { DuckDBConnection } from '@duckdb/node-api';
import { DuckDBInstance } from '@duckdb/node-api';
import { buildMarketStorageUsageSummary, type MarketStorageContentSummary, type MarketStorageUsageSummary } from '../marketStorageUsage.js';
import { clearAllInstrumentQuestionMeta } from '../marketInstrumentMetadata.js';
import { invalidateMarketReadCaches } from '../marketReadCache.js';
import { quoteDuckLiteral } from '../marketCsvImportSql.js';
import {
  DUCKDB_TEMP_DIR,
  DUCKDB_THREAD_COUNT,
  MARKET_DB_COMPACT_FREE_BLOCK_RATIO,
  MARKET_DB_COMPACT_MIN_FREE_BLOCKS,
  MARKET_DB_FILE_PATH,
} from './constants.js';
import {
  closeMarketDbContext,
  ensureMarketBarsStageTable,
  getMarketDbContext,
  queryRowsWithConnection,
  resetMarketDbContext,
  withMarketDbLock,
} from './connection.js';
import {
  canReclaimUnreadableMarketStorageAsEmpty,
  isLocalMarketDataNeedsAttentionError,
} from './schema.js';
import {
  cleanupMarketCompactArtifacts,
  cleanupMarketStorageArtifacts,
  randomCompactSuffix,
  safeStatSize,
} from './storageFiles.js';
import { acquireMarketPrewarmExecutionQuiesceLease } from './prewarmExecutionState.js';
import type {
  MarketDeepCompactMode,
  MarketInstrumentDataFootprint,
  MarketMaintenancePhase,
  MarketStorageBlockUsage,
  MarketStorageFootprint,
  ReclaimEmptyMarketStorageResult,
  RunMarketMaintenanceOptions,
} from './types.js';
import { toSafeInt } from './utils.js';

export const getMarketStorageFootprint = async (): Promise<MarketStorageFootprint> => {
  const dbBytes = safeStatSize(MARKET_DB_FILE_PATH);
  const walBytes = safeStatSize(`${MARKET_DB_FILE_PATH}.wal`);
  const shmBytes = safeStatSize(`${MARKET_DB_FILE_PATH}.tmp`);
  return {
    dbBytes,
    walBytes,
    shmBytes,
    totalBytes: dbBytes + walBytes + shmBytes
  };
};

const readMarketStorageBlockUsage = async (
  connection: DuckDBConnection
): Promise<MarketStorageBlockUsage> => {
  let usage = {
    totalBlocks: 0,
    usedBlocks: 0,
    freeBlocks: 0
  };
  const result = await connection.run('PRAGMA database_size');
  const rows = (await result.getRowObjectsJS()) as Array<{
    total_blocks?: unknown;
    used_blocks?: unknown;
    free_blocks?: unknown;
  }>;
  const row = rows[0] ?? {};
  const totalBlocks = toSafeInt(row.total_blocks ?? 0);
  const usedBlocks = toSafeInt(row.used_blocks ?? 0);
  const freeBlocks =
    row.free_blocks !== undefined ?
      toSafeInt(row.free_blocks) :
      Math.max(0, totalBlocks - usedBlocks);
  usage = {
    totalBlocks,
    usedBlocks: Math.min(totalBlocks, usedBlocks),
    freeBlocks: Math.max(0, Math.min(totalBlocks, freeBlocks))
  };
  return usage;
};

export const getMarketStorageBlockUsage = async (): Promise<MarketStorageBlockUsage> => {
  let usage: MarketStorageBlockUsage = {
    totalBlocks: 0,
    usedBlocks: 0,
    freeBlocks: 0
  };
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    usage = await readMarketStorageBlockUsage(connection);
  });
  return usage;
};

const readMarketStorageTableHasRows = async (
  connection: DuckDBConnection,
  tableName: string
): Promise<boolean> => {
  try {
    const result = await connection.run(
      `SELECT 1 AS has_rows FROM ${tableName} LIMIT 1`
    );
    const rows = await result.getRowObjectsJS();
    return rows.length > 0;
  } catch {
    return false;
  }
};

const readMarketStorageContentSummary = async (
  connection: DuckDBConnection
): Promise<Omit<MarketStorageContentSummary, "reclaimableBytes">> => {
  const hasRawBars = await readMarketStorageTableHasRows(
    connection,
    'market_bars'
  );
  if (!hasRawBars) {
    return {
      hasContent: false,
      instrumentCount: 0,
      barCount: 0
    };
  }

  try {
    const result = await connection.run(`
      SELECT
        COUNT(*) AS instrument_count,
        COALESCE(SUM(bar_count), 0) AS bar_count
      FROM market_instruments
      WHERE bar_count > 0
    `);
    const rows = (await result.getRowObjectsJS()) as Array<{
      instrument_count?: unknown;
      bar_count?: unknown;
    }>;
    const row = rows[0] ?? {};
    const instrumentCount = toSafeInt(row.instrument_count ?? 0);
    const barCount = toSafeInt(row.bar_count ?? 0);
    if (instrumentCount > 0 && barCount > 0) {
      return {
        hasContent: true,
        instrumentCount,
        barCount
      };
    }
  } catch {
    // Fall back to raw bar counts below when summary metadata is unavailable.
  }

  try {
    const result = await connection.run(`
      SELECT
        COUNT(DISTINCT instrument_id) AS instrument_count,
        COUNT(*) AS bar_count
      FROM market_bars
    `);
    const rows = (await result.getRowObjectsJS()) as Array<{
      instrument_count?: unknown;
      bar_count?: unknown;
    }>;
    const row = rows[0] ?? {};
    const instrumentCount = toSafeInt(row.instrument_count ?? 0);
    const barCount = toSafeInt(row.bar_count ?? 0);
    return {
      hasContent: instrumentCount > 0 && barCount > 0,
      instrumentCount,
      barCount
    };
  } catch {
    return {
      hasContent: false,
      instrumentCount: 0,
      barCount: 0
    };
  }
};

export const getMarketStorageUsageSummary = async (): Promise<MarketStorageUsageSummary> => {
  const physicalFootprint = await getMarketStorageFootprint();
  if (physicalFootprint.totalBytes <= 0) {
    return buildMarketStorageUsageSummary({
      physicalFootprint,
      blockUsage: null,
      contentSummary: {
        hasContent: false,
        instrumentCount: 0,
        barCount: 0
      }
    });
  }

  let blockUsage: MarketStorageBlockUsage | null = null;
  let contentSummary: Omit<MarketStorageContentSummary, "reclaimableBytes"> = {
    hasContent: false,
    instrumentCount: 0,
    barCount: 0
  };
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    blockUsage = await readMarketStorageBlockUsage(connection);
    contentSummary = await readMarketStorageContentSummary(connection);
  });

  return buildMarketStorageUsageSummary({
    physicalFootprint,
    blockUsage,
    contentSummary
  });
};

export const removeMarketStorageForExplicitClearWithLockHeld = async (
  options: { signal?: AbortSignal } = {},
): Promise<void> => {
  options.signal?.throwIfAborted();
  await resetMarketDbContext({
    removeStorageFiles: true,
    cleanupArtifacts: true
  });
  options.signal?.throwIfAborted();
  clearAllInstrumentQuestionMeta();
  invalidateMarketReadCaches();
};

export const removeMarketStorageForExplicitClear = async (
  options: { signal?: AbortSignal } = {},
): Promise<void> =>
  withMarketDbLock(
    () => removeMarketStorageForExplicitClearWithLockHeld(options),
    { signal: options.signal },
  );

export const reclaimEmptyMarketStorage = async (): Promise<ReclaimEmptyMarketStorageResult> => {
  await cleanupMarketStorageArtifacts();
  const footprintBefore = await getMarketStorageFootprint();
  if (footprintBefore.totalBytes <= 0) {
    return {
      hasContent: false,
      footprintBefore,
      footprintAfter: footprintBefore,
      reclaimedBytes: 0
    };
  }

  const prewarmQuiesceLease = await acquireMarketPrewarmExecutionQuiesceLease();
  try {
    let hasContent = false;
    await withMarketDbLock(async () => {
      try {
        const { connection } = await getMarketDbContext();
        const contentSummary = await readMarketStorageContentSummary(connection);
        hasContent = contentSummary.hasContent;
        if (hasContent) {
          return;
        }
        await connection.run('CHECKPOINT').catch(() => undefined);
        await resetMarketDbContext({
          removeStorageFiles: true,
          cleanupArtifacts: true
        });
      } catch (error) {
        if (
          isLocalMarketDataNeedsAttentionError(error) &&
          canReclaimUnreadableMarketStorageAsEmpty()
        ) {
          hasContent = false;
          await resetMarketDbContext({
            removeStorageFiles: true,
            cleanupArtifacts: true
          });
          return;
        }
        throw error;
      }
    });

    const footprintAfter = await getMarketStorageFootprint();
    return {
      hasContent,
      footprintBefore,
      footprintAfter,
      reclaimedBytes: Math.max(0, footprintBefore.totalBytes - footprintAfter.totalBytes)
    };
  } finally {
    prewarmQuiesceLease.release();
  }
};

const deepCompactMarketStorage = async (
  onProgress?: (compactProgressPercent: number) => void | Promise<void>
): Promise<void> => {
  const notifyProgress = async (compactProgressPercent: number): Promise<void> => {
    if (!onProgress) {
      return;
    }
    const normalized = Math.max(0, Math.min(100, Math.round(Number(compactProgressPercent) || 0)));
    await onProgress(normalized);
  };
  const compactSuffix = randomCompactSuffix();
  const exportDirPath = path.join(DUCKDB_TEMP_DIR, `market-export-${compactSuffix}`);
  const compactDbPath = path.join(DUCKDB_TEMP_DIR, `market-compact-${compactSuffix}.duckdb`);
  const backupDbPath = `${MARKET_DB_FILE_PATH}.bak-${compactSuffix}`;

  await notifyProgress(2);
  await cleanupMarketCompactArtifacts();
  try {
    await withMarketDbLock(async () => {
      const { connection } = await getMarketDbContext();
      await connection.run('CHECKPOINT');
      await notifyProgress(8);

      await fsPromises.rm(exportDirPath, { recursive: true, force: true });
      await fsPromises.mkdir(exportDirPath, { recursive: true });
      await notifyProgress(14);

      let shouldRestoreStageTable = false;
      try {
        // DuckDB EXPORT writes temp-table COPY entries to load.sql without matching DDL.
        // Drop the temp staging table before export to keep IMPORT DATABASE valid.
        await connection.run('DROP TABLE IF EXISTS market_bars_stage');
        shouldRestoreStageTable = true;
        await notifyProgress(22);
        await connection.run(`EXPORT DATABASE ${quoteDuckLiteral(exportDirPath)}`);
        await notifyProgress(38);

        await fsPromises.rm(compactDbPath, { force: true });
        const compactInstance = await DuckDBInstance.fromCache(compactDbPath, {
          temp_directory: DUCKDB_TEMP_DIR,
          threads: String(DUCKDB_THREAD_COUNT)
        });
        const compactConnection = await compactInstance.connect();
        try {
          await compactConnection.run(`IMPORT DATABASE ${quoteDuckLiteral(exportDirPath)}`);
          await notifyProgress(58);
          await compactConnection.run('CHECKPOINT');
          await notifyProgress(68);
        } finally {
          try {
            compactConnection.closeSync();
          } catch {
            // ignore close failures
          }
          try {
            compactInstance.closeSync();
          } catch {
            // ignore close failures
          }
        }

        await closeMarketDbContext();
        shouldRestoreStageTable = false;
        await notifyProgress(78);

        let backupMoved = false;
        try {
          if (fs.existsSync(MARKET_DB_FILE_PATH)) {
            await fsPromises.rm(backupDbPath, { force: true });
            await fsPromises.rename(MARKET_DB_FILE_PATH, backupDbPath);
            backupMoved = true;
          }
          await fsPromises.rename(compactDbPath, MARKET_DB_FILE_PATH);
          await notifyProgress(90);
          if (backupMoved) {
            await fsPromises.rm(backupDbPath, { force: true });
          }
        } catch (error) {
          if (!fs.existsSync(MARKET_DB_FILE_PATH) && backupMoved && fs.existsSync(backupDbPath)) {
            await fsPromises.rename(backupDbPath, MARKET_DB_FILE_PATH).catch(() => undefined);
          }
          throw error;
        }
        await notifyProgress(100);
      } catch (error) {
        if (shouldRestoreStageTable) {
          await ensureMarketBarsStageTable(connection).catch(() => undefined);
        }
        throw error;
      }
    });
  } finally {
    await fsPromises.rm(exportDirPath, { recursive: true, force: true }).catch(() => undefined);
    await fsPromises.rm(compactDbPath, { force: true }).catch(() => undefined);
    await fsPromises.rm(backupDbPath, { force: true }).catch(() => undefined);
    await cleanupMarketCompactArtifacts();
  }
};

export const reclaimMarketStorage = async (): Promise<MarketStorageFootprint> => {
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    await connection.run('CHECKPOINT');
    await connection.run('VACUUM');
    await connection.run('CHECKPOINT');
  });
  return getMarketStorageFootprint();
};

const shouldRunDeepCompaction = async (
  mode: MarketDeepCompactMode,
  isIdle?: () => boolean | Promise<boolean>
): Promise<boolean> => {
  if (mode === 'disabled') {
    return false;
  }
  if (mode === 'always') {
    return true;
  }
  if (!isIdle) {
    return false;
  }
  try {
    return Boolean(await isIdle());
  } catch {
    return false;
  }
};

export const runMarketMaintenance = async (
  options?: RunMarketMaintenanceOptions
): Promise<{
  footprintBefore: MarketStorageFootprint;
  footprintAfter: MarketStorageFootprint;
  reclaimedBytes: number;
}> => {
  const notifyProgress = async (
    phase: MarketMaintenancePhase,
    progressPercent: number,
    compactProgressPercent = 0
  ): Promise<void> => {
    if (!options?.onProgress) {
      return;
    }
    await options.onProgress({
      phase,
      progressPercent: Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0))),
      compactProgressPercent: Math.max(0, Math.min(100, Math.round(Number(compactProgressPercent) || 0)))
    });
  };

  const emptyReclaim = await reclaimEmptyMarketStorage();
  const footprintBefore = emptyReclaim.footprintBefore;
  await notifyProgress('RECLAIM', 6, 0);
  if (!emptyReclaim.hasContent) {
    await notifyProgress('DONE', 100, 100);
    return {
      footprintBefore,
      footprintAfter: emptyReclaim.footprintAfter,
      reclaimedBytes: emptyReclaim.reclaimedBytes
    };
  }
  const preBlockUsage = await getMarketStorageBlockUsage();
  const preFreeBlockRatio =
    preBlockUsage.totalBlocks > 0 ?
      preBlockUsage.freeBlocks / preBlockUsage.totalBlocks :
      0;
  const shouldSkipVacuum =
    Boolean(options?.skipVacuumIfLowFragmentation) &&
    preBlockUsage.freeBlocks < MARKET_DB_COMPACT_MIN_FREE_BLOCKS &&
    preFreeBlockRatio < Math.min(MARKET_DB_COMPACT_FREE_BLOCK_RATIO, 0.05);
  if (shouldSkipVacuum) {
    await checkpointMarketStorage();
  } else {
    await reclaimMarketStorage();
  }
  await notifyProgress('RECLAIM', 24, 0);
  const blockUsage = shouldSkipVacuum ? preBlockUsage : await getMarketStorageBlockUsage();
  const deepCompactMode = options?.deepCompactMode ?? 'always';
  const allowDeepCompactByMode = await shouldRunDeepCompaction(deepCompactMode, options?.isIdle);
  const freeBlockRatio =
    blockUsage.totalBlocks > 0 ?
      blockUsage.freeBlocks / blockUsage.totalBlocks :
      0;
  if (
    allowDeepCompactByMode &&
    blockUsage.freeBlocks >= MARKET_DB_COMPACT_MIN_FREE_BLOCKS &&
    freeBlockRatio >= MARKET_DB_COMPACT_FREE_BLOCK_RATIO
  ) {
    await notifyProgress('COMPACT', 26, 0);
    await deepCompactMarketStorage(async (compactProgressPercent) => {
      const blendedProgress = 26 + compactProgressPercent * 0.62;
      await notifyProgress('COMPACT', blendedProgress, compactProgressPercent);
    });
    await notifyProgress('COMPACT', 88, 100);
  } else {
    await notifyProgress('COMPACT', 88, 100);
  }
  await notifyProgress('ANALYZE', 92, 100);
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    await connection.run('ANALYZE');
    await connection.run('CHECKPOINT');
  });
  await notifyProgress('ANALYZE', 98, 100);
  await cleanupMarketStorageArtifacts();
  const footprintAfter = await getMarketStorageFootprint();
  await notifyProgress('DONE', 100, 100);
  return {
    footprintBefore,
    footprintAfter,
    reclaimedBytes: Math.max(
      0,
      footprintBefore.totalBytes - footprintAfter.totalBytes,
    ),
  };
};

export const checkpointMarketStorage = async (): Promise<void> => {
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    await connection.run('CHECKPOINT');
  });
};

export const readMarketInstrumentDataFootprints = async (
  instrumentIds: readonly string[]
): Promise<MarketInstrumentDataFootprint[]> => {
  const normalizedInstrumentIds = Array.from(
    new Set(
      (Array.isArray(instrumentIds) ? instrumentIds : [])
        .map((item) => String(item ?? '').trim())
        .filter((item) => Boolean(item))
    )
  );
  if (!normalizedInstrumentIds.length) {
    return [];
  }
  const placeholders = normalizedInstrumentIds.map(() => '?').join(',');
  const emptyCounts = () => new Map<string, number>();
  const readCountMap = async (
    connection: DuckDBConnection,
    tableName: string
  ): Promise<Map<string, number>> => {
    const rows = await queryRowsWithConnection<{
      instrument_id?: unknown;
      count?: unknown;
    }>(
      connection,
      `SELECT instrument_id, COUNT(*) AS count
         FROM ${tableName}
        WHERE instrument_id IN (${placeholders})
        GROUP BY instrument_id`,
      normalizedInstrumentIds
    );
    return new Map(
      rows.map((row) => [
        String(row.instrument_id ?? '').trim(),
        toSafeInt(row.count ?? 0)
      ])
    );
  };
  const readMarketInstrumentMap = async (
    connection: DuckDBConnection
  ): Promise<Map<string, { count: number; barCount: number }>> => {
    const rows = await queryRowsWithConnection<{
      instrument_id?: unknown;
      count?: unknown;
      bar_count?: unknown;
    }>(
      connection,
      `SELECT instrument_id,
              COUNT(*) AS count,
              COALESCE(SUM(bar_count), 0) AS bar_count
         FROM market_instruments
        WHERE instrument_id IN (${placeholders})
        GROUP BY instrument_id`,
      normalizedInstrumentIds
    );
    return new Map(
      rows.map((row) => [
        String(row.instrument_id ?? '').trim(),
        {
          count: toSafeInt(row.count ?? 0),
          barCount: toSafeInt(row.bar_count ?? 0)
        }
      ])
    );
  };
  let barsByInstrument = emptyCounts();
  let instrumentsByInstrument = new Map<string, { count: number; barCount: number }>();
  let chunkAnchorsByInstrument = emptyCounts();
  let displayBarsByInstrument = emptyCounts();
  let displayAnchorsByInstrument = emptyCounts();
  let timelineMetaByInstrument = emptyCounts();
  await withMarketDbLock(async () => {
    const { connection } = await getMarketDbContext();
    barsByInstrument = await readCountMap(connection, 'market_bars');
    instrumentsByInstrument = await readMarketInstrumentMap(connection);
    chunkAnchorsByInstrument = await readCountMap(connection, 'market_bar_chunk_anchors');
    displayBarsByInstrument = await readCountMap(connection, 'market_display_bars');
    displayAnchorsByInstrument = await readCountMap(connection, 'market_display_anchors');
    timelineMetaByInstrument = await readCountMap(connection, 'market_timeline_meta');
  });
  return normalizedInstrumentIds.map((instrumentId) => {
    const instrumentFootprint = instrumentsByInstrument.get(instrumentId);
    return {
      instrumentId,
      bars: barsByInstrument.get(instrumentId) ?? 0,
      instruments: instrumentFootprint?.count ?? 0,
      instrumentBarCount: instrumentFootprint?.barCount ?? 0,
      chunkAnchors: chunkAnchorsByInstrument.get(instrumentId) ?? 0,
      displayBars: displayBarsByInstrument.get(instrumentId) ?? 0,
      displayAnchors: displayAnchorsByInstrument.get(instrumentId) ?? 0,
      timelineMeta: timelineMetaByInstrument.get(instrumentId) ?? 0
    };
  });
};
