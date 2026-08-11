// SPDX-License-Identifier: GPL-3.0-only

import {
  BASE_TIMEFRAME_SORT_ORDER,
  type ApiLocalDataImportFolderPreview,
  type ApiTradingCalendarSuggestion,
} from '@/api/localDataTypes';
import {
  normalizeApiTradingCalendarConfig,
  normalizeTimeZoneSuggestionReason,
} from './localDataCalendarNormalization';
import {
  normalizeImportRuleConfidence,
  normalizeImportRuleFieldKey,
  normalizeImportRulePriceFamily,
  normalizeLocalDataImportDraftValidation,
  requireCsvFieldMapping,
} from './localDataImportDraftNormalization';
import {
  requireBaseTimeframe,
  requireImportScopeStrategy,
  requireTrimmedString,
  toNonNegativeInt,
  toPreservedPathString,
  toPreservedRelativePathString,
  toRecord,
  toTrimmedString,
} from './localDataNormalizationCommon';

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => toTrimmedString(item))
        .filter((item) => item.length > 0)
    : [];

const normalizeApiTradingCalendarSuggestion = (
  value: unknown,
): ApiTradingCalendarSuggestion => {
  const record = toRecord(value) ?? {};
  const originRaw = toTrimmedString(record.origin);
  const origin: ApiTradingCalendarSuggestion["origin"] =
    originRaw === "EXISTING_SOURCE" ||
    originRaw === "PRESET_DEFAULT" ||
    originRaw === "DETECTED"
      ? originRaw
      : "PRESET_DEFAULT";
  return {
    calendar: normalizeApiTradingCalendarConfig(record.calendar),
    confidence: normalizeImportRuleConfidence(record.confidence),
    origin,
    sampleCount: toNonNegativeInt(record.sampleCount),
    activeDayCount: toNonNegativeInt(record.activeDayCount),
  };
};

const normalizeMarketDataAcquisitionMetadata = (
  value: unknown,
): ApiLocalDataImportFolderPreview["marketDataAcquisitionMetadata"] => {
  const record = toRecord(value);
  if (!record || record.schemaVersion !== 1) {
    return null;
  }
  const connectorId =
    record.connectorId === "akshare" || record.connectorId === "ccxt"
      ? record.connectorId
      : null;
  const adjustment =
    record.adjustment === "none" ||
    record.adjustment === "qfq" ||
    record.adjustment === "hfq"
      ? record.adjustment
      : record.adjustment === null
        ? null
        : undefined;
  const sourceSymbols = normalizeStringArray(record.sourceSymbols);
  const importSymbols = normalizeStringArray(record.importSymbols);
  if (
    !connectorId ||
    adjustment === undefined ||
    (connectorId === "akshare" && adjustment === null) ||
    (connectorId === "ccxt" && adjustment !== null) ||
    sourceSymbols.length === 0 ||
    sourceSymbols.length !== importSymbols.length
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    connectorId,
    adjustment,
    sourceSymbols,
    importSymbols,
  };
};

export const normalizeLocalDataImportFolderPreview = (
  value: unknown,
): ApiLocalDataImportFolderPreview => {
  const record = toRecord(value) ?? {};
  const headers = Array.isArray(record.headers)
    ? record.headers
        .map((item) => toTrimmedString(item))
        .filter((item) => item.length > 0)
    : [];
  const invalidFileSamples = Array.isArray(record.invalidFileSamples)
    ? record.invalidFileSamples
        .map((item) => {
          const entry = toRecord(item);
          const relativePath = toPreservedRelativePathString(
            entry?.relativePath,
          );
          const reason = toTrimmedString(entry?.reason);
          if (!relativePath && !reason) {
            return null;
          }
          return {
            relativePath,
            reason,
          };
        })
        .filter((item): item is { relativePath: string; reason: string } =>
          Boolean(item),
        )
    : [];
  const planSummaries = Array.isArray(record.planSummaries)
    ? record.planSummaries
        .map((item) => {
          const entry = toRecord(item);
          const id = toTrimmedString(entry?.id);
          if (!id) {
            return null;
          }
          return {
            id,
            strategy: requireImportScopeStrategy(
              entry?.strategy,
              "planSummaries.strategy",
            ),
            baseTimeframe: requireBaseTimeframe(
              entry?.baseTimeframe,
              "planSummaries.baseTimeframe",
            ),
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
          ): item is {
            id: string;
            strategy: "FLAT" | "WITH_PARENT";
            baseTimeframe: "1m" | "5m" | "1h" | "1d";
            topLevelSubfolder: string;
            symbolCount: number;
            fileCount: number;
          } => Boolean(item),
        )
    : [];
  const confirmableImportPlans = Array.isArray(record.confirmableImportPlans)
    ? record.confirmableImportPlans
        .map((item) => {
          const entry = toRecord(item);
          const id = toTrimmedString(entry?.id);
          const previewPlanId = toTrimmedString(entry?.previewPlanId);
          if (!id || !previewPlanId) {
            return null;
          }
          return {
            id,
            previewPlanId,
            strategy: requireImportScopeStrategy(
              entry?.strategy,
              "confirmableImportPlans.strategy",
            ),
            baseTimeframe: requireBaseTimeframe(
              entry?.baseTimeframe,
              "confirmableImportPlans.baseTimeframe",
            ),
            topLevelSubfolder: toPreservedRelativePathString(
              entry?.topLevelSubfolder,
            ),
            defaultPoolName: requireTrimmedString(
              entry?.defaultPoolName,
              "confirmableImportPlans.defaultPoolName",
            ),
            symbolCount: toNonNegativeInt(entry?.symbolCount),
            fileCount: toNonNegativeInt(entry?.fileCount),
          };
        })
        .filter(
          (
            item,
          ): item is ApiLocalDataImportFolderPreview["confirmableImportPlans"][number] =>
            Boolean(item),
        )
    : [];
  const sampledFileNames = Array.isArray(record.sampledFileNames)
    ? record.sampledFileNames
        .map((item) => toTrimmedString(item))
        .filter((item) => item.length > 0)
    : [];
  const suggestedFreeReplayEnvironmentRecord = toRecord(
    record.suggestedFreeReplayEnvironment,
  );
  const suggestedFreeReplayEnvironmentAssetClassRaw = toTrimmedString(
    suggestedFreeReplayEnvironmentRecord?.assetClass,
  );
  const suggestedFreeReplayEnvironmentAssetClass:
    "STOCK" | "FUTURES" | "FOREX" | "CRYPTO" =
    suggestedFreeReplayEnvironmentAssetClassRaw === "FUTURES" ||
    suggestedFreeReplayEnvironmentAssetClassRaw === "FOREX" ||
    suggestedFreeReplayEnvironmentAssetClassRaw === "CRYPTO"
      ? suggestedFreeReplayEnvironmentAssetClassRaw
      : "STOCK";
  const suggestedFreeReplayEnvironment =
    suggestedFreeReplayEnvironmentRecord &&
    toTrimmedString(suggestedFreeReplayEnvironmentRecord.marketPresetId)
      ? {
          assetClass: suggestedFreeReplayEnvironmentAssetClass,
          marketPresetId: toTrimmedString(
            suggestedFreeReplayEnvironmentRecord.marketPresetId,
          ),
        }
      : null;
  const timeZoneSuggestionRecord = toRecord(record.timeZoneSuggestion) ?? {};
  const mappingProfileRecord = toRecord(record.mappingProfile) ?? {};
  const fieldDiagnostics = Array.isArray(record.fieldDiagnostics)
    ? record.fieldDiagnostics
        .map((item) => {
          const entry = toRecord(item) ?? {};
          const field = normalizeImportRuleFieldKey(entry.field);
          if (!field) {
            return null;
          }
          const statusRaw = toTrimmedString(entry.status).toUpperCase();
          const status =
            statusRaw === "MISSING" || statusRaw === "CONFLICT"
              ? statusRaw
              : "MATCHED";
          const candidates = Array.isArray(entry.candidates)
            ? entry.candidates.map((candidateItem) => {
                const candidate = toRecord(candidateItem) ?? {};
                return {
                  header: toTrimmedString(candidate.header),
                  score: toNonNegativeInt(candidate.score),
                  reason: toTrimmedString(candidate.reason),
                  family: normalizeImportRulePriceFamily(candidate.family),
                };
              })
            : [];
          return {
            field,
            status,
            selectedHeader: toTrimmedString(entry.selectedHeader),
            confidence: normalizeImportRuleConfidence(entry.confidence),
            reason: toTrimmedString(entry.reason),
            candidates,
          };
        })
        .filter(
          (
            item,
          ): item is ApiLocalDataImportFolderPreview["fieldDiagnostics"][number] =>
            Boolean(item),
        )
    : [];
  const repairSummaryRecord = toRecord(record.repairSummary) ?? {};
  const repairSummarySampleRecord = toRecord(repairSummaryRecord.sample) ?? {};
  const schemaDiagnosticsRecord = toRecord(record.schemaDiagnostics) ?? {};
  return {
    previewToken: toTrimmedString(record.previewToken),
    folderName: toTrimmedString(record.folderName),
    folderPath: toPreservedPathString(record.folderPath),
    marketDataAcquisitionMetadata: normalizeMarketDataAcquisitionMetadata(
      record.marketDataAcquisitionMetadata,
    ),
    suggestedFreeReplayEnvironment,
    suggestedTimeZone: toTrimmedString(record.suggestedTimeZone),
    suggestedTimeZoneReason: normalizeTimeZoneSuggestionReason(
      record.suggestedTimeZoneReason,
    ),
    timeZoneSuggestion: {
      timeZone:
        toTrimmedString(timeZoneSuggestionRecord.timeZone) ||
        toTrimmedString(record.suggestedTimeZone),
      reason: normalizeTimeZoneSuggestionReason(
        timeZoneSuggestionRecord.reason,
      ),
      confidence: normalizeImportRuleConfidence(
        timeZoneSuggestionRecord.confidence,
      ),
      reasons: Array.isArray(timeZoneSuggestionRecord.reasons)
        ? timeZoneSuggestionRecord.reasons.map((item) => {
            const entry = toRecord(item) ?? {};
            return {
              code: toTrimmedString(entry.code),
              timeZone: toTrimmedString(entry.timeZone),
              score: toNonNegativeInt(entry.score),
            };
          })
        : [],
      samples: Array.isArray(timeZoneSuggestionRecord.samples)
        ? timeZoneSuggestionRecord.samples.map((item) => {
            const entry = toRecord(item) ?? {};
            return {
              raw: toTrimmedString(entry.raw),
              parsedAt: toTrimmedString(entry.parsedAt),
            };
          })
        : [],
    },
    tradingCalendarSuggestion: normalizeApiTradingCalendarSuggestion(
      record.tradingCalendarSuggestion,
    ),
    draftValidation: normalizeLocalDataImportDraftValidation(
      record.draftValidation,
    ),
    headers,
    defaultMapping: requireCsvFieldMapping(
      record.defaultMapping,
      "defaultMapping",
    ),
    mappingProfile: {
      canonicalSchemaKey: toTrimmedString(
        mappingProfileRecord.canonicalSchemaKey,
      ),
      priceFamily: normalizeImportRulePriceFamily(
        mappingProfileRecord.priceFamily,
      ),
      confidence: normalizeImportRuleConfidence(
        mappingProfileRecord.confidence,
      ),
      score: toNonNegativeInt(mappingProfileRecord.score),
      conflicts: normalizeStringArray(mappingProfileRecord.conflicts),
    },
    fieldDiagnostics,
    repairSummary: {
      applied: normalizeStringArray(repairSummaryRecord.applied),
      warnings: normalizeStringArray(repairSummaryRecord.warnings),
      sample: {
        checkedRows: toNonNegativeInt(repairSummarySampleRecord.checkedRows),
        parseableTimestampRows: toNonNegativeInt(
          repairSummarySampleRecord.parseableTimestampRows,
        ),
        validOhlcRows: toNonNegativeInt(
          repairSummarySampleRecord.validOhlcRows,
        ),
        duplicateTimestampRows: toNonNegativeInt(
          repairSummarySampleRecord.duplicateTimestampRows,
        ),
        conflictingDuplicateTimestampRows: toNonNegativeInt(
          repairSummarySampleRecord.conflictingDuplicateTimestampRows,
        ),
      },
    },
    schemaDiagnostics: {
      canonicalSchemaKey: toTrimmedString(
        schemaDiagnosticsRecord.canonicalSchemaKey,
      ),
      validSchemaCount: toNonNegativeInt(
        schemaDiagnosticsRecord.validSchemaCount,
      ),
      inconsistentFiles: Array.isArray(
        schemaDiagnosticsRecord.inconsistentFiles,
      )
        ? schemaDiagnosticsRecord.inconsistentFiles.map((item) => {
            const entry = toRecord(item) ?? {};
            return {
              relativePath: toPreservedRelativePathString(entry.relativePath),
              reason: toTrimmedString(entry.reason),
              canonicalSchemaKey: toTrimmedString(entry.canonicalSchemaKey),
              conflicts: normalizeStringArray(entry.conflicts),
            };
          })
        : [],
    },
    detectedTimeframe: requireBaseTimeframe(
      record.detectedTimeframe,
      "detectedTimeframe",
    ),
    detectedTimeframes: Array.isArray(record.detectedTimeframes)
      ? Array.from(
          new Set(
            record.detectedTimeframes
              .map((item) => requireBaseTimeframe(item, "detectedTimeframes"))
              .filter((item): item is NonNullable<typeof item> =>
                Boolean(item),
              ),
          ),
        ).sort(
          (left, right) =>
            BASE_TIMEFRAME_SORT_ORDER.indexOf(left) -
            BASE_TIMEFRAME_SORT_ORDER.indexOf(right),
        )
      : [],
    validSymbolCount: toNonNegativeInt(record.validSymbolCount),
    totalFiles: toNonNegativeInt(record.totalFiles),
    validFiles: toNonNegativeInt(record.validFiles),
    invalidFiles: toNonNegativeInt(record.invalidFiles),
    invalidFileSamples,
    planSummaries,
    confirmableImportPlans,
    sampledFileNames,
    skippedNestedCount: toNonNegativeInt(record.skippedNestedCount),
  };
};
