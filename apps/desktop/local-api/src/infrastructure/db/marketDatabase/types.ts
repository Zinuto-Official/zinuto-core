// SPDX-License-Identifier: GPL-3.0-only

import type { TradingCalendarConfig } from '@zinuto/shared/tradingCalendar';

export type MarketStorageFootprint = {
  dbBytes: number;
  walBytes: number;
  shmBytes: number;
  totalBytes: number;
};

export type MarketStorageBlockUsage = {
  totalBlocks: number;
  usedBlocks: number;
  freeBlocks: number;
};

export type ReclaimEmptyMarketStorageResult = {
  hasContent: boolean;
  footprintBefore: MarketStorageFootprint;
  footprintAfter: MarketStorageFootprint;
  reclaimedBytes: number;
};

export type CsvImportColumnMapping = {
  timestampMode: 'SINGLE' | 'SPLIT';
  date: string;
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

export type TabularImportFileFormat = 'csv' | 'json' | 'parquet';

export type CsvBatchImportInput = {
  instrumentId: string;
  symbol: string;
  filePath: string;
  mapping: CsvImportColumnMapping;
  inputFormat?: TabularImportFileFormat;
  timezone?: string;
};

export type CsvBatchImportResult = {
  instrumentId: string;
  symbol: string;
  filePath: string;
  importedRows: number;
  skippedRows: number;
  invalidRequiredRowsSkipped: number;
  invalidOhlcRowsSkipped: number;
  duplicateConflictRowsSkipped: number;
  duplicateIdenticalRowsDeduped: number;
};

export type MarketDeepCompactMode = 'always' | 'ifIdle' | 'disabled';
export type MarketMaintenancePhase = 'RECLAIM' | 'COMPACT' | 'ANALYZE' | 'DONE';
export type MarketMaintenanceProgress = {
  phase: MarketMaintenancePhase;
  progressPercent: number;
  compactProgressPercent: number;
};
export type RunMarketMaintenanceOptions = {
  deepCompactMode?: MarketDeepCompactMode;
  isIdle?: () => boolean | Promise<boolean>;
  skipVacuumIfLowFragmentation?: boolean;
  onProgress?: (progress: MarketMaintenanceProgress) => void | Promise<void>;
};

export type MarketDisplayBar = {
  displayIndex: number;
  bucketStartMs: number;
  startRawIndex: number;
  endRawIndex: number;
  ts: string;
  startTs: string;
  endTs: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketTimelineBuildInput = {
  instrumentId: string;
  versionToken: string;
  baseTimeframe: string;
  timeZone?: string | null;
  tradingCalendar?: TradingCalendarConfig | null;
  signal?: AbortSignal;
};

export type MarketSymbolDiagnosticsSnapshot = {
  totalBars: number;
  volatilityPercent: number;
  highPrice: number;
  lowPrice: number;
  invalidOhlcItems: Array<{
    rawIndex: number;
    ts: string;
    count: number;
  }>;
  duplicateTimestampItems: Array<{
    rawIndex: number;
    ts: string;
    duplicateCount: number;
  }>;
  timeOrderItems: Array<{
    rawIndex: number;
    ts: string;
    previousTs: string;
  }>;
  gaps: Array<{
    rawIndex: number;
    missingBars: number;
    missingStartTs: string;
    missingEndTs: string;
    deltaMs: number;
    baseIntervalMs: number;
    repeatCount: number;
    repeatRatio: number;
  }>;
  outOfSessionItems: Array<{
    rawIndex: number;
    ts: string;
    count: number;
  }>;
  timeframeMisalignedItems?: Array<{
    rawIndex: number;
    ts: string;
    count: number;
  }>;
  extremePriceSpikeItems: Array<{
    rawIndex: number;
    ts: string;
    closeChangeRatio: number;
    amplitudeRatio: number;
    zScore: number;
    multiple: number;
  }>;
};

export type MarketInstrumentDataFootprint = {
  instrumentId: string;
  bars: number;
  instruments: number;
  instrumentBarCount: number;
  chunkAnchors: number;
  displayBars: number;
  displayAnchors: number;
  timelineMeta: number;
};
