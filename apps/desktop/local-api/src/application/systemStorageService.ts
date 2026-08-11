// SPDX-License-Identifier: GPL-3.0-only

import { STORAGE_LAYOUT } from './ports/infrastructure/db/database.js';
import { getSystemSeedStorageBytesByPoolId } from './systemMarketSeedService.js';
import { nowIso } from '../kernel/time.js';
import { createStaleWhileRevalidateSnapshot } from './staleWhileRevalidateSnapshot.js';
import { measureSystemStorageUsageInWorker } from './ports/infrastructure/db/systemStorageMeasurementWorkerClient.js';

const STORAGE_USAGE_MAX_AGE_MS = 15_000;
const STORAGE_USAGE_REFRESH_TIMEOUT_MS = 4_000;
const STORAGE_USAGE_RETRY_BASE_MS = 5_000;
const STORAGE_USAGE_RETRY_MAX_MS = 60_000;

const readSystemStorageUsage = async (signal?: AbortSignal) => {
  const { metaUsage, marketUsage, cacheBytes, tempBytes } =
    await measureSystemStorageUsageInWorker({
      input: {
        dbPath: STORAGE_LAYOUT.dbPath,
        marketDbPath: STORAGE_LAYOUT.marketDbPath,
        cacheDir: STORAGE_LAYOUT.cacheDir,
        tempDir: STORAGE_LAYOUT.tempDir,
      },
      signal,
      timeoutMs: STORAGE_USAGE_REFRESH_TIMEOUT_MS,
    });
  const marketFootprint = marketUsage.physicalFootprint;
  const sqliteMarketMetadataBytes = Math.max(
    0,
    metaUsage.categories.marketDataBytes,
  );
  const categories = {
    ...metaUsage.categories,
    marketDataBytes:
      sqliteMarketMetadataBytes + Math.max(0, marketUsage.categories.marketDataBytes),
    otherBytes: Math.max(
      0,
      metaUsage.categories.otherBytes +
        marketUsage.categories.otherBytes,
    ),
  };
  const logicalTotalBytes =
    categories.trainingDataBytes +
    categories.replayNotesBytes +
    categories.marketDataBytes +
    categories.systemSettingsBytes +
    categories.statsDataBytes +
    categories.otherBytes;
  const physicalFootprint = {
    dbBytes: metaUsage.physicalFootprint.dbBytes + marketFootprint.dbBytes,
    walBytes: metaUsage.physicalFootprint.walBytes + marketFootprint.walBytes,
    shmBytes: metaUsage.physicalFootprint.shmBytes + marketFootprint.shmBytes,
    totalBytes: metaUsage.physicalFootprint.totalBytes + marketFootprint.totalBytes
  };
  return {
    ...metaUsage,
    categories,
    systemPoolStorageBytesById: getSystemSeedStorageBytesByPoolId(),
    marketDataSummary: marketUsage.contentSummary,
    logicalTotalBytes,
    physicalBreakdown: {
      system: metaUsage.physicalFootprint,
      market: marketFootprint
    },
    physicalFootprint,
    physicalTotalBytes: physicalFootprint.totalBytes,
    storageLayout: {
      coreBytes: Math.max(0, metaUsage.physicalFootprint.totalBytes),
      marketBytes: Math.max(0, marketFootprint.totalBytes),
      cacheBytes: Math.max(0, cacheBytes),
      tempBytes: Math.max(0, tempBytes),
      paths: {
        coreDir: STORAGE_LAYOUT.coreDataDir,
        marketDir: STORAGE_LAYOUT.marketDataDir,
        cacheDir: STORAGE_LAYOUT.cacheDir,
        tempDir: STORAGE_LAYOUT.tempDir,
      },
    }
  };
};

type ExactSystemStorageUsage = Awaited<ReturnType<typeof readSystemStorageUsage>>;

export type SystemStorageMeasurementState = {
  status: 'WARMING' | 'FRESH' | 'STALE';
  lastGoodAt: string | null;
  refreshPending: boolean;
  nextRetryAt: string | null;
};

export type SystemStorageUsage = ExactSystemStorageUsage & {
  measurementState: SystemStorageMeasurementState;
};

const emptyFootprint = () => ({
  dbBytes: 0,
  walBytes: 0,
  shmBytes: 0,
  totalBytes: 0,
});

const createInitialStorageUsage = (): ExactSystemStorageUsage => ({
  measuredAt: nowIso(),
  source: 'PHYSICAL_FALLBACK',
  categories: {
    trainingDataBytes: 0,
    replayNotesBytes: 0,
    marketDataBytes: 0,
    systemSettingsBytes: 0,
    statsDataBytes: 0,
    otherBytes: 0,
  },
  systemPoolStorageBytesById: {},
  marketDataSummary: {
    hasContent: false,
    instrumentCount: 0,
    barCount: 0,
    reclaimableBytes: 0,
  },
  logicalTotalBytes: 0,
  physicalBreakdown: {
    system: emptyFootprint(),
    market: emptyFootprint(),
  },
  physicalFootprint: emptyFootprint(),
  physicalTotalBytes: 0,
  storageLayout: {
    coreBytes: 0,
    marketBytes: 0,
    cacheBytes: 0,
    tempBytes: 0,
    paths: {
      coreDir: STORAGE_LAYOUT.coreDataDir,
      marketDir: STORAGE_LAYOUT.marketDataDir,
      cacheDir: STORAGE_LAYOUT.cacheDir,
      tempDir: STORAGE_LAYOUT.tempDir,
    },
  },
});

const workspaceStorageUsageSnapshot = createStaleWhileRevalidateSnapshot({
  load: readSystemStorageUsage,
  createFallback: createInitialStorageUsage,
  maxAgeMs: STORAGE_USAGE_MAX_AGE_MS,
  refreshTimeoutMs: STORAGE_USAGE_REFRESH_TIMEOUT_MS,
  retryBaseMs: STORAGE_USAGE_RETRY_BASE_MS,
  retryMaxMs: STORAGE_USAGE_RETRY_MAX_MS,
  onRefreshError: (error) => {
    console.warn('[system-storage] background usage refresh failed', error);
  },
});

const toIsoTimestamp = (timestamp: number | null): string | null =>
  timestamp === null ? null : new Date(timestamp).toISOString();

const readWorkspaceSystemStorageUsage = (): SystemStorageUsage => {
  const snapshot = workspaceStorageUsageSnapshot.readState();
  return {
    ...snapshot.value,
    measurementState: {
      status: snapshot.status,
      lastGoodAt: toIsoTimestamp(snapshot.refreshedAt),
      refreshPending: snapshot.refreshPending,
      nextRetryAt: toIsoTimestamp(snapshot.nextRetryAt),
    },
  };
};

export const getWorkspaceSystemStorageUsage = async (): Promise<SystemStorageUsage> =>
  readWorkspaceSystemStorageUsage();

export const invalidateWorkspaceSystemStorageUsage = (): void => {
  workspaceStorageUsageSnapshot.invalidate();
};

export const getSystemStorageUsage = async (): Promise<SystemStorageUsage> => {
  const usage = await readSystemStorageUsage();
  workspaceStorageUsageSnapshot.write(usage);
  return readWorkspaceSystemStorageUsage();
};
