// SPDX-License-Identifier: GPL-3.0-only

const IMPORT_BATCH_FILES_MULTIPLIER = 12;
const IMPORT_BATCH_FILES_MAX = 128;
const IMPORT_BATCH_TARGET_BYTES = 512 * 1024 * 1024;

export const IMPORT_COMPACT_PROGRESS_BASE_PERCENT = 90;
const IMPORT_COMPACT_PROGRESS_SPAN_PERCENT = 9;

type ImportSizedFile = {
  fileSize: number;
};

export const normalizeFileSize = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
};

export const resolveImportInitialBatchFiles = (importParallelFiles: number): number =>
  Math.max(8, Math.min(24, Math.max(1, Math.floor(Number(importParallelFiles) || 0)) * 3));

export const resolveImportBatchSize = (
  files: ImportSizedFile[],
  importParallelFiles: number
): number => {
  if (!files.length) {
    return 0;
  }
  const maxByCpu = Math.max(1, importParallelFiles * IMPORT_BATCH_FILES_MULTIPLIER);
  const fileCountCap = Math.max(1, Math.min(IMPORT_BATCH_FILES_MAX, maxByCpu));
  let selectedCount = 0;
  let selectedBytes = 0;
  for (const file of files) {
    if (selectedCount >= fileCountCap) {
      break;
    }
    const nextBytes = normalizeFileSize(file.fileSize);
    if (selectedCount > 0 && selectedBytes + nextBytes > IMPORT_BATCH_TARGET_BYTES) {
      break;
    }
    selectedCount += 1;
    selectedBytes += nextBytes;
  }
  return Math.max(1, selectedCount);
};

export const normalizeProgressPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
};

export const calculateFileBasedProgressPercent = (doneFiles: number, totalFiles: number): number => {
  if (totalFiles <= 0) {
    return 0;
  }
  return normalizeProgressPercent((doneFiles / totalFiles) * 100);
};

export const calculateRunningImportProgressPercent = (
  doneFiles: number,
  totalFiles: number,
  hasStartedImporting: boolean
): number => {
  const baseProgress = calculateFileBasedProgressPercent(doneFiles, totalFiles);
  if (!hasStartedImporting) {
    return baseProgress;
  }
  if (totalFiles <= 0) {
    return 1;
  }
  if (doneFiles >= totalFiles) {
    return 100;
  }
  if (baseProgress >= 99) {
    return baseProgress;
  }
  return Math.max(1, Math.min(99, baseProgress));
};

export const estimateStorageBytesByBarShare = (
  sourceBarCount: number,
  totalBarCount: number,
  totalMarketBytes: number
): number => {
  const normalizedSourceBars = Math.max(0, Math.floor(Number(sourceBarCount) || 0));
  const normalizedTotalBars = Math.max(0, Math.floor(Number(totalBarCount) || 0));
  const normalizedMarketBytes = Math.max(0, Math.floor(Number(totalMarketBytes) || 0));
  if (normalizedSourceBars <= 0 || normalizedTotalBars <= 0 || normalizedMarketBytes <= 0) {
    return 0;
  }
  const ratio = normalizedSourceBars / normalizedTotalBars;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(normalizedMarketBytes, Math.floor(normalizedMarketBytes * ratio)));
};

export const normalizeCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

export const normalizeCompactProgressPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
};

export const resolveOverallProgressFromMaintenancePercent = (maintenanceProgressPercent: number): number => {
  const normalized = normalizeCompactProgressPercent(maintenanceProgressPercent);
  return normalizeProgressPercent(
    IMPORT_COMPACT_PROGRESS_BASE_PERCENT + (normalized / 100) * IMPORT_COMPACT_PROGRESS_SPAN_PERCENT
  );
};

export const toSafeStorageBytes = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};
