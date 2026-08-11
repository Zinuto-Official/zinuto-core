// SPDX-License-Identifier: GPL-3.0-only

export type MarketStorageFootprintLike = {
  dbBytes: number;
  walBytes: number;
  shmBytes: number;
  totalBytes: number;
};

export type MarketStorageBlockUsageLike = {
  totalBlocks: number;
  usedBlocks: number;
  freeBlocks: number;
};

export type MarketStorageContentSummary = {
  hasContent: boolean;
  instrumentCount: number;
  barCount: number;
  reclaimableBytes: number;
};

export type MarketStorageUsageSummary = {
  categories: {
    marketDataBytes: number;
    otherBytes: number;
  };
  physicalFootprint: MarketStorageFootprintLike;
  blockUsage: MarketStorageBlockUsageLike | null;
  contentSummary: MarketStorageContentSummary;
};

const toSafeByteCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const toSafeBlockCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const normalizeFootprint = (
  footprint: MarketStorageFootprintLike,
): MarketStorageFootprintLike => {
  const dbBytes = toSafeByteCount(footprint.dbBytes);
  const walBytes = toSafeByteCount(footprint.walBytes);
  const shmBytes = toSafeByteCount(footprint.shmBytes);
  const explicitTotalBytes = toSafeByteCount(footprint.totalBytes);
  return {
    dbBytes,
    walBytes,
    shmBytes,
    totalBytes: Math.max(explicitTotalBytes, dbBytes + walBytes + shmBytes),
  };
};

const normalizeBlockUsage = (
  blockUsage: MarketStorageBlockUsageLike | null | undefined,
): MarketStorageBlockUsageLike | null => {
  if (!blockUsage) {
    return null;
  }
  const totalBlocks = toSafeBlockCount(blockUsage.totalBlocks);
  const usedBlocks = Math.min(totalBlocks, toSafeBlockCount(blockUsage.usedBlocks));
  const freeBlocks = Math.min(
    totalBlocks,
    toSafeBlockCount(blockUsage.freeBlocks),
  );
  return {
    totalBlocks,
    usedBlocks,
    freeBlocks,
  };
};

const normalizeContentSummary = (
  contentSummary: Omit<MarketStorageContentSummary, "reclaimableBytes">,
): Omit<MarketStorageContentSummary, "reclaimableBytes"> => {
  const instrumentCount = toSafeBlockCount(contentSummary.instrumentCount);
  const barCount = toSafeBlockCount(contentSummary.barCount);
  return {
    hasContent: Boolean(contentSummary.hasContent) && instrumentCount > 0 && barCount > 0,
    instrumentCount,
    barCount,
  };
};

export const buildMarketStorageUsageSummary = ({
  physicalFootprint,
  blockUsage,
  contentSummary,
}: {
  physicalFootprint: MarketStorageFootprintLike;
  blockUsage: MarketStorageBlockUsageLike | null;
  contentSummary: Omit<MarketStorageContentSummary, "reclaimableBytes">;
}): MarketStorageUsageSummary => {
  const safePhysicalFootprint = normalizeFootprint(physicalFootprint);
  const safeBlockUsage = normalizeBlockUsage(blockUsage);
  const safeContentSummary = normalizeContentSummary(contentSummary);

  if (!safeContentSummary.hasContent || safePhysicalFootprint.totalBytes <= 0) {
    return {
      categories: {
        marketDataBytes: 0,
        otherBytes: safePhysicalFootprint.totalBytes,
      },
      physicalFootprint: safePhysicalFootprint,
      blockUsage: safeBlockUsage,
      contentSummary: {
        hasContent: false,
        instrumentCount: 0,
        barCount: 0,
        reclaimableBytes: safePhysicalFootprint.totalBytes,
      },
    };
  }

  const totalBlocks = safeBlockUsage?.totalBlocks ?? 0;
  const usedBlocks = Math.min(
    totalBlocks,
    safeBlockUsage?.usedBlocks ?? 0,
  );
  const freeBlocks = Math.min(totalBlocks, safeBlockUsage?.freeBlocks ?? 0);
  const usedDbBytes =
    totalBlocks > 0 && usedBlocks > 0
      ? Math.floor(safePhysicalFootprint.dbBytes * (usedBlocks / totalBlocks))
      : safePhysicalFootprint.dbBytes;
  const freeDbBytes =
    totalBlocks > 0 && freeBlocks > 0
      ? Math.floor(safePhysicalFootprint.dbBytes * (freeBlocks / totalBlocks))
      : 0;
  const marketDataBytes = Math.max(
    0,
    Math.min(safePhysicalFootprint.dbBytes, usedDbBytes),
  );
  const reclaimableBytes = Math.max(
    0,
    Math.min(
      safePhysicalFootprint.totalBytes,
      freeDbBytes + safePhysicalFootprint.walBytes + safePhysicalFootprint.shmBytes,
    ),
  );

  return {
    categories: {
      marketDataBytes,
      otherBytes: Math.max(
        0,
        safePhysicalFootprint.totalBytes - marketDataBytes,
      ),
    },
    physicalFootprint: safePhysicalFootprint,
    blockUsage: safeBlockUsage,
    contentSummary: {
      ...safeContentSummary,
      reclaimableBytes,
    },
  };
};
