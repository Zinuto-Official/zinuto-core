// SPDX-License-Identifier: GPL-3.0-only

import {
  normalizeBaseTimeframe,
  toFiniteNumber,
  toNonNegativeInt,
  toNonNegativeNumber,
  toNullableTrimmedString,
  toPreservedPathString,
  toPreservedRelativePathString,
  toRecord,
  toTrimmedString,
} from './localDataNormalizationCommon';
import {
  normalizeLocalDataImportFolderPreview,
} from './localDataImportPreviewNormalization';
export {
  normalizeApiTradingCalendarConfig,
} from './localDataCalendarNormalization';
export {
  normalizeLocalDataImportDraftValidation,
} from './localDataImportDraftNormalization';
import {
  type ApiDiagnosticCategory,
  type ApiDiagnosticCode,
  type ApiDiagnosticProfileOrigin,
  type ApiDiagnosticSeverity,
  type ApiDiagnosticStatus,
  type ApiLocalDataImportPreviewJob,
  type ApiLocalDataImportPreviewJobStage,
  type ApiLocalDataImportSymbolLimit,
  type ApiLocalDataSourceDiagnosticIssue,
  type ApiLocalDataSourceDiagnosticProfile,
  type ApiLocalDataSourceDiagnosticSummary,
  type ApiLocalDataSourceDiagnostics,
  type ApiLocalDataSourceSymbolDiagnostics,
  type ApiLocalDataSyncPreview,
  type ApiLocalDataSyncQuickCheck,
  type ApiTradingAssetClass,
} from "@/api/localDataTypes";

const normalizeDiagnosticAssetClass = (
  value: unknown,
): ApiTradingAssetClass => {
  const raw = toTrimmedString(value).toUpperCase();
  return raw === "FUTURES" || raw === "FOREX" || raw === "CRYPTO"
    ? raw
    : "STOCK";
};

const normalizeDiagnosticProfileOrigin = (
  value: unknown,
): ApiDiagnosticProfileOrigin => {
  const raw = toTrimmedString(value).toUpperCase();
  return raw === "SYSTEM" || raw === "USER" ? raw : "INFERRED";
};

const normalizeDiagnosticStatus = (value: unknown): ApiDiagnosticStatus => {
  const raw = toTrimmedString(value).toUpperCase();
  return raw === "READY" || raw === "FAILED" ? raw : "BUILDING";
};

const normalizeDiagnosticCategory = (value: unknown): ApiDiagnosticCategory => {
  const raw = toTrimmedString(value).toUpperCase();
  return raw === "EXTREME_ANOMALY" ? raw : "TIME_INTEGRITY";
};

const normalizeDiagnosticSeverity = (value: unknown): ApiDiagnosticSeverity => {
  const raw = toTrimmedString(value).toUpperCase();
  return raw === "CRITICAL" || raw === "WARNING" ? raw : "INFO";
};

const normalizeDiagnosticCode = (value: unknown): ApiDiagnosticCode => {
  const raw = toTrimmedString(value).toUpperCase();
  const codes: ApiDiagnosticCode[] = [
    "INVALID_OHLC",
    "DUPLICATE_TIMESTAMP",
    "TIME_ORDER_BREAK",
    "DATA_GAP",
    "OUT_OF_SESSION_BAR",
    "TIMEFRAME_MISALIGNED_BAR",
    "EXTREME_PRICE_SPIKE",
  ];
  return codes.includes(raw as ApiDiagnosticCode)
    ? (raw as ApiDiagnosticCode)
    : "DATA_GAP";
};

const createEmptyDiagnosticCategoryCounts = (): Record<
  ApiDiagnosticCategory,
  number
> => ({
  TIME_INTEGRITY: 0,
  EXTREME_ANOMALY: 0,
});

const normalizeLocalDataSourceDiagnosticProfile = (
  value: unknown,
): ApiLocalDataSourceDiagnosticProfile => {
  const record = toRecord(value) ?? {};
  return {
    assetClass: normalizeDiagnosticAssetClass(record.assetClass),
    marketPresetId: toTrimmedString(record.marketPresetId) || "A_SHARE",
    profileOrigin: normalizeDiagnosticProfileOrigin(record.profileOrigin),
  };
};

const normalizeLocalDataSourceDiagnosticSummary = (
  value: unknown,
): ApiLocalDataSourceDiagnosticSummary => {
  const record = toRecord(value) ?? {};
  const byCategoryRecord = toRecord(record.byCategory) ?? {};
  return {
    totalIssues: toNonNegativeInt(record.totalIssues),
    criticalIssues: toNonNegativeInt(record.criticalIssues),
    warningIssues: toNonNegativeInt(record.warningIssues),
    infoIssues: toNonNegativeInt(record.infoIssues),
    byCategory: {
      ...createEmptyDiagnosticCategoryCounts(),
      TIME_INTEGRITY: toNonNegativeInt(byCategoryRecord.TIME_INTEGRITY),
      EXTREME_ANOMALY: toNonNegativeInt(byCategoryRecord.EXTREME_ANOMALY),
    },
  };
};

const normalizeLocalDataSourceDiagnosticIssueItems = (
  items: unknown,
): ApiLocalDataSourceDiagnosticIssue[] =>
  Array.isArray(items)
    ? items.map((item, index) => {
        const entry = toRecord(item) ?? {};
        return {
          id: toTrimmedString(entry.id) || `source-diagnostic-${index + 1}`,
          instrumentId: toTrimmedString(entry.instrumentId),
          symbol: toTrimmedString(entry.symbol).toUpperCase(),
          category: normalizeDiagnosticCategory(entry.category),
          code: normalizeDiagnosticCode(entry.code),
          severity: normalizeDiagnosticSeverity(entry.severity),
          dateLabel: toTrimmedString(entry.dateLabel),
          focusBarIndex: toNonNegativeInt(entry.focusBarIndex),
          focusStartTs: toNullableTrimmedString(entry.focusStartTs),
          focusEndTs: toNullableTrimmedString(entry.focusEndTs),
          missingBars: toNonNegativeInt(entry.missingBars),
          ratio: toFiniteNumber(entry.ratio),
          volumeRatio: toFiniteNumber(entry.volumeRatio),
          closeChangeRatio: toFiniteNumber(entry.closeChangeRatio),
          amplitudeRatio: toFiniteNumber(entry.amplitudeRatio),
          zScore: toFiniteNumber(entry.zScore),
          multiple: toFiniteNumber(entry.multiple),
          count: toNonNegativeInt(entry.count),
        };
      })
    : [];

const normalizeDiagnosticHealth = (value: unknown) => {
  const record = toRecord(value) ?? {};
  return {
    score: toNonNegativeInt(record.score),
    severity: normalizeDiagnosticSeverity(record.severity),
    affectedSymbols: toNonNegativeInt(record.affectedSymbols),
  };
};

export const normalizeLocalDataSourceSymbolDiagnostics = (
  value: unknown,
): ApiLocalDataSourceSymbolDiagnostics => {
  const record = toRecord(value) ?? {};
  return {
    symbol: toTrimmedString(record.symbol).toUpperCase(),
    baseTimeframe: normalizeBaseTimeframe(record.baseTimeframe),
    diagnosticRulesVersion: toTrimmedString(record.diagnosticRulesVersion),
    status: normalizeDiagnosticStatus(record.status),
    generatedAt: toNullableTrimmedString(record.generatedAt),
    profile: normalizeLocalDataSourceDiagnosticProfile(record.profile),
    health: normalizeDiagnosticHealth(record.health),
    totalBars: toNonNegativeInt(record.totalBars),
    summary: normalizeLocalDataSourceDiagnosticSummary(record.summary),
    items: normalizeLocalDataSourceDiagnosticIssueItems(record.items),
  };
};

export const normalizeLocalDataSourceDiagnostics = (
  value: unknown,
): ApiLocalDataSourceDiagnostics => {
  const record = toRecord(value) ?? {};
  const normalizeSymbolSummaries = (
    items: unknown,
  ): ApiLocalDataSourceDiagnostics["symbols"] =>
    Array.isArray(items)
      ? items.map((item) => {
          const entry = toRecord(item) ?? {};
          return {
            instrumentId: toTrimmedString(entry.instrumentId),
            symbol: toTrimmedString(entry.symbol).toUpperCase(),
            totalBars: toNonNegativeInt(entry.totalBars),
            issueCount: toNonNegativeInt(entry.issueCount),
            criticalIssues: toNonNegativeInt(entry.criticalIssues),
            warningIssues: toNonNegativeInt(entry.warningIssues),
            infoIssues: toNonNegativeInt(entry.infoIssues),
            healthScore: toNonNegativeInt(entry.healthScore),
            volatilityPercent: toFiniteNumber(entry.volatilityPercent),
            highPrice: toFiniteNumber(entry.highPrice),
            lowPrice: toFiniteNumber(entry.lowPrice),
            timeStartTs: toNullableTrimmedString(entry.timeStartTs),
            timeEndTs: toNullableTrimmedString(entry.timeEndTs),
          };
        })
      : [];

  return {
    sourceId: toTrimmedString(record.sourceId),
    baseTimeframe: normalizeBaseTimeframe(record.baseTimeframe),
    diagnosticRulesVersion: toTrimmedString(record.diagnosticRulesVersion),
    status: normalizeDiagnosticStatus(record.status),
    generatedAt: toNullableTrimmedString(record.generatedAt),
    profile: normalizeLocalDataSourceDiagnosticProfile(record.profile),
    health: normalizeDiagnosticHealth(record.health),
    totalSymbols: toNonNegativeInt(record.totalSymbols),
    scannedSymbols: toNonNegativeInt(record.scannedSymbols),
    affectedSymbols: toNonNegativeInt(record.affectedSymbols),
    totalIssues: toNonNegativeInt(record.totalIssues),
    summary: normalizeLocalDataSourceDiagnosticSummary(record.summary),
    symbols: normalizeSymbolSummaries(record.symbols),
    items: normalizeLocalDataSourceDiagnosticIssueItems(record.items),
    nextCursor: toNullableTrimmedString(record.nextCursor),
  };
};

const normalizeLocalDataImportPreviewJobStage = (
  value: unknown,
): ApiLocalDataImportPreviewJobStage => {
  const raw = toTrimmedString(value);
  return raw === "SCANNING_FILES" ||
    raw === "READING_HEADERS" ||
    raw === "DETECTING_TIMEFRAMES" ||
    raw === "BUILDING_PLAN" ||
    raw === "CHECKING_QUALITY" ||
    raw === "DONE"
    ? raw
    : "QUEUED";
};

export const normalizeLocalDataImportPreviewJob = (
  value: unknown,
): ApiLocalDataImportPreviewJob => {
  const record = toRecord(value) ?? {};
  const statusRaw = toTrimmedString(record.status);
  const status: ApiLocalDataImportPreviewJob["status"] =
    statusRaw === "RUNNING" || statusRaw === "SUCCESS" || statusRaw === "FAILED"
      ? statusRaw
      : "QUEUED";
  const resultRecord = toRecord(record.result);
  return {
    id: toTrimmedString(record.id),
    status,
    stage: normalizeLocalDataImportPreviewJobStage(record.stage),
    progressPercent: toNonNegativeNumber(record.progressPercent),
    processedFiles: toNonNegativeInt(record.processedFiles),
    totalFiles: toNonNegativeInt(record.totalFiles),
    result: resultRecord
      ? normalizeLocalDataImportFolderPreview(resultRecord)
      : null,
    errorMessage: toTrimmedString(record.errorMessage) || null,
    errorCode: toTrimmedString(record.errorCode) || null,
    errorArgs: toRecord(record.errorArgs),
    createdAt: toTrimmedString(record.createdAt),
    startedAt: toTrimmedString(record.startedAt) || null,
    finishedAt: toTrimmedString(record.finishedAt) || null,
  };
};

const normalizeApiLocalDataImportSymbolLimit = (
  value: unknown,
): ApiLocalDataImportSymbolLimit => {
  const record = toRecord(value) ?? {};
  const normalizeSymbolList = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? Array.from(
          new Set(
            raw
              .map((item) => toTrimmedString(item).toUpperCase())
              .filter((item) => item.length > 0),
          ),
        ).sort((left, right) => left.localeCompare(right, "en"))
      : [];
  const skippedSymbols = normalizeSymbolList(record.skippedSymbols);
  const skippedSymbolCount = Math.max(
    skippedSymbols.length,
    toNonNegativeInt(record.skippedSymbolCount),
  );
  return {
    limitApplied: Boolean(record.limitApplied) && skippedSymbolCount > 0,
    maxSymbols:
      record.maxSymbols === null || record.maxSymbols === undefined
        ? null
        : toNonNegativeInt(record.maxSymbols),
    selectedSymbols: normalizeSymbolList(record.selectedSymbols),
    skippedSymbols,
    skippedSymbolCount,
    reason: null,
  };
};

export const normalizeLocalDataSyncPreview = (
  value: unknown,
): ApiLocalDataSyncPreview => {
  const record = toRecord(value) ?? {};
  const normalizeScopeStrategy = (
    raw: unknown,
  ): "FLAT" | "WITH_PARENT" | null => {
    const normalized = toTrimmedString(raw);
    if (normalized === "FLAT" || normalized === "WITH_PARENT") {
      return normalized;
    }
    return null;
  };
  const normalizeSymbolList = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? Array.from(
          new Set(
            raw
              .map((item) => toTrimmedString(item).toUpperCase())
              .filter((item) => item.length > 0),
          ),
        ).sort((left, right) => left.localeCompare(right, "en"))
      : [];

  return {
    sourceId: toTrimmedString(record.sourceId),
    sourceName: toTrimmedString(record.sourceName),
    sourceFolder: toPreservedPathString(record.sourceFolder),
    sourceFolderUsageMode:
      toTrimmedString(record.sourceFolderUsageMode) === "ONE_OFF"
        ? "ONE_OFF"
        : "BOUND_SOURCE",
    baseTimeframe: normalizeBaseTimeframe(record.baseTimeframe),
    timeZone: toTrimmedString(record.timeZone),
    timeZoneOrigin: (() => {
      const raw = toTrimmedString(record.timeZoneOrigin);
      return raw === "USER_SELECTED" ||
        raw === "INFERRED_DEFAULT" ||
        raw === "PRESET_DEFAULT"
        ? raw
        : "PRESET_DEFAULT";
    })(),
    importScopeStrategy: normalizeScopeStrategy(record.importScopeStrategy),
    importScopeTopLevelSubfolder: toPreservedRelativePathString(
      record.importScopeTopLevelSubfolder,
    ),
    matchedPreviewPlanId: toTrimmedString(record.matchedPreviewPlanId) || null,
    scopeCandidates: Array.isArray(record.scopeCandidates)
      ? record.scopeCandidates
          .map((item) => {
            const entry = toRecord(item);
            const previewPlanId = toTrimmedString(entry?.previewPlanId);
            if (!previewPlanId) {
              return null;
            }
            return {
              previewPlanId,
              strategy: normalizeScopeStrategy(entry?.strategy) ?? "FLAT",
              topLevelSubfolder: toPreservedRelativePathString(
                entry?.topLevelSubfolder,
              ),
              symbolCount: toNonNegativeInt(entry?.symbolCount),
              fileCount: toNonNegativeInt(entry?.fileCount),
            };
          })
          .filter(
            (
              item,
            ): item is ApiLocalDataSyncPreview["scopeCandidates"][number] =>
              Boolean(item),
          )
      : [],
    requiresScopeConfirmation: Boolean(record.requiresScopeConfirmation),
    changeSummary: {
      changedFiles: toNonNegativeInt(
        toRecord(record.changeSummary)?.changedFiles,
      ),
      unchangedFiles: toNonNegativeInt(
        toRecord(record.changeSummary)?.unchangedFiles,
      ),
      addedSymbols: normalizeSymbolList(
        toRecord(record.changeSummary)?.addedSymbols,
      ),
      updatedSymbols: normalizeSymbolList(
        toRecord(record.changeSummary)?.updatedSymbols,
      ),
      missingSymbolsRetained: normalizeSymbolList(
        toRecord(record.changeSummary)?.missingSymbolsRetained,
      ),
      symbolLimit: normalizeApiLocalDataImportSymbolLimit(
        toRecord(record.changeSummary)?.symbolLimit,
      ),
    },
  };
};

export const normalizeLocalDataSyncQuickCheck = (
  value: unknown,
): ApiLocalDataSyncQuickCheck => {
  const record = toRecord(value) ?? {};
  const normalizeSymbolList = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? Array.from(
          new Set(
            raw
              .map((item) => toTrimmedString(item).toUpperCase())
              .filter((item) => item.length > 0),
          ),
        ).sort((left, right) => left.localeCompare(right, "en"))
      : [];
  const normalizedStatus = toTrimmedString(record.status);
  return {
    sourceId: toTrimmedString(record.sourceId),
    sourceName: toTrimmedString(record.sourceName),
    sourceFolder: toPreservedPathString(record.sourceFolder),
    baseTimeframe: normalizeBaseTimeframe(record.baseTimeframe),
    status:
      normalizedStatus === "NO_CHANGES" ||
      normalizedStatus === "POTENTIAL_CHANGES" ||
      normalizedStatus === "UNABLE_TO_CHECK"
        ? normalizedStatus
        : "UNABLE_TO_CHECK",
    reasonCode: toTrimmedString(record.reasonCode),
    checkedAt: toTrimmedString(record.checkedAt),
    estimatedChangedFiles: toNonNegativeInt(record.estimatedChangedFiles),
    estimatedChangedSymbols: toNonNegativeInt(record.estimatedChangedSymbols),
    detectedFiles: toNonNegativeInt(record.detectedFiles),
    trackedFiles: toNonNegativeInt(record.trackedFiles),
    changedSymbols: normalizeSymbolList(record.changedSymbols),
    changedRelativePaths: Array.isArray(record.changedRelativePaths)
      ? Array.from(
          new Set(
            record.changedRelativePaths
              .map((item) => toPreservedRelativePathString(item))
              .filter((item) => item.length > 0),
          ),
        ).sort((left, right) => left.localeCompare(right, "en"))
      : [],
    fingerprintRequiredRelativePaths: Array.isArray(
      record.fingerprintRequiredRelativePaths,
    )
      ? Array.from(
          new Set(
            record.fingerprintRequiredRelativePaths
              .map((item) => toPreservedRelativePathString(item))
              .filter((item) => item.length > 0),
          ),
        ).sort((left, right) => left.localeCompare(right, "en"))
      : [],
    missingSymbolsRetained: normalizeSymbolList(record.missingSymbolsRetained),
    snapshotSymbols: normalizeSymbolList(record.snapshotSymbols),
    invalidFiles: toNonNegativeInt(record.invalidFiles),
    symbolLimit: normalizeApiLocalDataImportSymbolLimit(record.symbolLimit),
  };
};
