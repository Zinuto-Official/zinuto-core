// SPDX-License-Identifier: GPL-3.0-only

import type { SystemStorageCategoryKey } from '@zinuto/shared/systemStorageCategories';

export type StorageSummaryRow = {
  key: SystemStorageCategoryKey;
  bytes: number;
  percent: number;
  progressPercent: number;
  sortOrder: number;
};

export type MarketContentCounts = {
  instrumentCount: number;
  barCount: number;
};

export type StorageSummaryReadModel = {
  rows: StorageSummaryRow[];
  totalBytes: number;
  marketContentCounts: MarketContentCounts;
  measurementState: {
    status: 'WARMING' | 'FRESH' | 'STALE';
    lastGoodAt: string | null;
    refreshPending: boolean;
    nextRetryAt: string | null;
  };
};

type StorageUsageCategoryRow = {
  key: SystemStorageCategoryKey;
  bytes: number;
};

type SystemStorageUsageLike = {
  physicalTotalBytes?: number;
  measurementState?: StorageSummaryReadModel['measurementState'];
  marketDataSummary?: {
    instrumentCount?: number;
    barCount?: number;
  };
};

const toSafeByteCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
};

export const resolveMarketContentCounts = (
  systemStorageUsage: SystemStorageUsageLike | null,
): MarketContentCounts => ({
  instrumentCount: toSafeByteCount(
    systemStorageUsage?.marketDataSummary?.instrumentCount,
  ),
  barCount: toSafeByteCount(systemStorageUsage?.marketDataSummary?.barCount),
});

export const buildStorageSummaryRows = ({
  storageUsageRows,
  totalBytes,
}: {
  storageUsageRows: StorageUsageCategoryRow[];
  totalBytes: number;
}): StorageSummaryRow[] => {
  const safeTotalBytes = toSafeByteCount(totalBytes);
  return storageUsageRows
    .map((row, index) => {
      const bytes = toSafeByteCount(row.bytes);
      const percent =
        safeTotalBytes > 0 ? clampPercent((bytes / safeTotalBytes) * 100) : 0;
      return {
        key: row.key,
        bytes,
        percent,
        progressPercent: percent,
        sortOrder: index,
      };
    })
    .sort(
      (left, right) =>
        right.bytes - left.bytes || left.sortOrder - right.sortOrder,
    );
};

export const buildStorageSummaryReadModel = ({
  storageUsageRows,
  systemStorageUsage,
}: {
  storageUsageRows: StorageUsageCategoryRow[];
  systemStorageUsage: SystemStorageUsageLike | null;
}): StorageSummaryReadModel => {
  const rawPhysicalTotalBytes = Number(
    systemStorageUsage?.physicalTotalBytes ?? Number.NaN,
  );
  const totalBytes =
    Number.isFinite(rawPhysicalTotalBytes) && rawPhysicalTotalBytes >= 0
      ? Math.floor(rawPhysicalTotalBytes)
      : storageUsageRows.reduce(
          (total, row) => total + toSafeByteCount(row.bytes),
          0,
        );

  return {
    rows: buildStorageSummaryRows({ storageUsageRows, totalBytes }),
    totalBytes,
    marketContentCounts: resolveMarketContentCounts(systemStorageUsage),
    measurementState: systemStorageUsage?.measurementState ?? {
      status: 'WARMING',
      lastGoodAt: null,
      refreshPending: false,
      nextRetryAt: null,
    },
  };
};
