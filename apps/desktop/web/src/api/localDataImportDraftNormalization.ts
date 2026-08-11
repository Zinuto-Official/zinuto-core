// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiLocalDataImportBlockingIssueKind,
  ApiLocalDataImportDraftValidation,
  ApiLocalDataImportDraftValidationReasonCode,
  ApiLocalDataImportPlanning,
  CsvFieldMapping,
  ImportRuleConfidence,
  ImportRuleFieldKey,
  ImportRulePriceFamily,
} from '@/api/localDataTypes';
import {
  normalizeBaseTimeframeValue,
  normalizeCsvTimestampMode,
  normalizeTimeZoneOrigin,
  requireBaseTimeframe,
  requireImportScopeStrategy,
  toNonNegativeInt,
  toNullableTrimmedString,
  toNullableTimeZoneOrigin,
  toPreservedRelativePathString,
  toRecord,
  toTrimmedString,
} from './localDataNormalizationCommon';
import {
  normalizeApiTradingCalendarConfig,
  normalizeTimeZoneSuggestionReason,
} from './localDataCalendarNormalization';

export const requireCsvFieldMapping = (
  value: unknown,
  fieldName: string,
): CsvFieldMapping => {
  const record = toRecord(value);
  const timestampMode = normalizeCsvTimestampMode(record?.timestampMode);
  const date = toTrimmedString(record?.date);
  const time = timestampMode === "SPLIT" ? toTrimmedString(record?.time) : "";
  const open = toTrimmedString(record?.open);
  const high = toTrimmedString(record?.high);
  const low = toTrimmedString(record?.low);
  const close = toTrimmedString(record?.close);
  if (
    !record ||
    !date ||
    !open ||
    !high ||
    !low ||
    !close ||
    (timestampMode === "SPLIT" && !time)
  ) {
    throw new Error(`Invalid local data import preview ${fieldName}`);
  }
  return {
    timestampMode,
    date,
    time,
    open,
    high,
    low,
    close,
    volume: toTrimmedString(record?.volume),
  };
};

export const normalizeImportRuleConfidence = (
  value: unknown,
): ImportRuleConfidence => {
  const raw = toTrimmedString(value).toUpperCase();
  return raw === "HIGH" || raw === "MEDIUM" || raw === "LOW" ? raw : "LOW";
};

export const normalizeImportRulePriceFamily = (
  value: unknown,
): ImportRulePriceFamily => {
  const raw = toTrimmedString(value).toUpperCase();
  return raw === "RAW" || raw === "ADJUSTED" || raw === "GENERIC"
    ? raw
    : "GENERIC";
};

export const normalizeImportRuleFieldKey = (
  value: unknown,
): ImportRuleFieldKey | null => {
  const raw = toTrimmedString(value);
  return raw === "date" ||
    raw === "time" ||
    raw === "open" ||
    raw === "high" ||
    raw === "low" ||
    raw === "close" ||
    raw === "volume"
    ? raw
    : null;
};

const normalizeLocalDataImportDraftValidationReasonCode = (
  value: unknown,
): ApiLocalDataImportDraftValidationReasonCode => {
  const raw = toTrimmedString(value).toUpperCase();
  const codes: ApiLocalDataImportDraftValidationReasonCode[] = [
    "READY",
    "CSV_MAPPING_REQUIRED",
    "CSV_MAPPING_HEADER_MISSING",
    "CSV_MAPPING_DUPLICATED",
    "LOCAL_DATA_IMPORT_NO_CONFIRMABLE_PLAN",
    "LOCAL_DATA_IMPORT_PREVIEW_EXPIRED",
    "LOCAL_DATA_TRADING_CALENDAR_INVALID",
    "LOCAL_DATA_IMPORT_TARGET_SOURCE_INVALID",
    "LOCAL_DATA_IMPORT_REPAIR_WARNINGS",
    "LOCAL_DATA_IMPORT_TIME_ZONE_CONFIRMATION_REQUIRED",
  ];
  return codes.includes(raw as ApiLocalDataImportDraftValidationReasonCode)
    ? (raw as ApiLocalDataImportDraftValidationReasonCode)
    : (() => {
        throw new Error(
          `Invalid local data import draft validation reasonCode: ${raw}`,
        );
      })();
};

const normalizeLocalDataImportBlockingIssueKind = (
  value: unknown,
): ApiLocalDataImportBlockingIssueKind => {
  const raw = toTrimmedString(value);
  return raw === "field-mapping" ||
    raw === "targeting" ||
    raw === "trading-calendar" ||
    raw === "repair-warnings" ||
    raw === "time-zone"
    ? raw
    : "none";
};

const normalizeLocalDataImportPlanning = (
  value: unknown,
): ApiLocalDataImportPlanning => {
  const record = toRecord(value) ?? {};
  const targetSourceOptions = Array.isArray(record.targetSourceOptions)
    ? record.targetSourceOptions
        .map((item) => {
          const source = toRecord(item) ?? {};
          const sourceId = toTrimmedString(source.sourceId);
          if (!sourceId) {
            return null;
          }
          const importScopeStrategyRaw = toTrimmedString(
            source.importScopeStrategy,
          );
          return {
            sourceId,
            sourceName: toTrimmedString(source.sourceName) || sourceId,
            baseTimeframe: requireBaseTimeframe(
              source.baseTimeframe,
              "planning.targetSourceOptions.baseTimeframe",
            ),
            importScopeStrategy:
              importScopeStrategyRaw === "WITH_PARENT" ||
              importScopeStrategyRaw === "FLAT"
                ? importScopeStrategyRaw
                : null,
            importScopeTopLevelSubfolder: toPreservedRelativePathString(
              source.importScopeTopLevelSubfolder,
            ),
            timeZone: toTrimmedString(source.timeZone),
            timeZoneOrigin: normalizeTimeZoneOrigin(source.timeZoneOrigin),
            tradingCalendar: normalizeApiTradingCalendarConfig(
              source.tradingCalendar,
            ),
          };
        })
        .filter(
          (
            item,
          ): item is ApiLocalDataImportPlanning["targetSourceOptions"][number] =>
            Boolean(item),
        )
    : [];
  const planRows = Array.isArray(record.planRows)
    ? record.planRows
        .map((item) => {
          const row = toRecord(item) ?? {};
          const id = toTrimmedString(row.id);
          const previewPlanId = toTrimmedString(row.previewPlanId);
          if (!id || !previewPlanId) {
            return null;
          }
          const effectiveTimeZoneSourceRaw = toTrimmedString(
            row.effectiveTimeZoneSource,
          );
          return {
            id,
            previewPlanId,
            strategy: requireImportScopeStrategy(
              row.strategy,
              "planning.planRows.strategy",
            ),
            topLevelSubfolder: toPreservedRelativePathString(
              row.topLevelSubfolder,
            ),
            poolName: toTrimmedString(row.poolName),
            autoGeneratedPoolName: toTrimmedString(row.autoGeneratedPoolName),
            sourceId: toTrimmedString(row.sourceId),
            targetSourceId: toTrimmedString(row.targetSourceId),
            targetSourceOptions: Array.isArray(row.targetSourceOptions)
              ? row.targetSourceOptions
                  .map((optionItem) => {
                    const option = toRecord(optionItem) ?? {};
                    const sourceId = toTrimmedString(option.sourceId);
                    return sourceId
                      ? {
                          sourceId,
                          sourceName:
                            toTrimmedString(option.sourceName) || sourceId,
                        }
                      : null;
                  })
                  .filter(
                    (
                      option,
                    ): option is ApiLocalDataImportPlanning["planRows"][number]["targetSourceOptions"][number] =>
                      Boolean(option),
                  )
              : [],
            hasExistingTargetOptions: Boolean(row.hasExistingTargetOptions),
            symbolCount: toNonNegativeInt(row.symbolCount),
            fileCount: toNonNegativeInt(row.fileCount),
            baseTimeframe: requireBaseTimeframe(
              row.baseTimeframe,
              "planning.planRows.baseTimeframe",
            ),
            effectiveTimeZone: toTrimmedString(row.effectiveTimeZone),
            effectiveTimeZoneOrigin: normalizeTimeZoneOrigin(
              row.effectiveTimeZoneOrigin,
            ),
            effectiveTimeZoneSource:
              effectiveTimeZoneSourceRaw === "EXISTING_SOURCE" ||
              effectiveTimeZoneSourceRaw === "FULL_REIMPORT"
                ? effectiveTimeZoneSourceRaw
                : "NEW_SOURCE_PENDING_IMPORT",
            targetSourceTimeZone: toNullableTrimmedString(
              row.targetSourceTimeZone,
            ),
            targetSourceTimeZoneOrigin: toNullableTimeZoneOrigin(
              row.targetSourceTimeZoneOrigin,
            ),
            tradingCalendar: normalizeApiTradingCalendarConfig(
              row.tradingCalendar,
            ),
            targetSourceTradingCalendar: row.targetSourceTradingCalendar
              ? normalizeApiTradingCalendarConfig(
                  row.targetSourceTradingCalendar,
                )
              : null,
            willUpdateExistingSourceTimeZone: Boolean(
              row.willUpdateExistingSourceTimeZone,
            ),
            willUpdateExistingSourceTradingCalendar: Boolean(
              row.willUpdateExistingSourceTradingCalendar,
            ),
          };
        })
        .filter(
          (item): item is ApiLocalDataImportPlanning["planRows"][number] =>
            Boolean(item),
        )
    : [];
  const scopeStrategyRaw = toTrimmedString(record.scopeStrategy);
  return {
    targetSourceOptions,
    recommendedTimeZone: toTrimmedString(record.recommendedTimeZone),
    recommendedTimeZoneReason: normalizeTimeZoneSuggestionReason(
      record.recommendedTimeZoneReason,
    ),
    recommendedTradingCalendar: normalizeApiTradingCalendarConfig(
      record.recommendedTradingCalendar,
    ),
    scopeStrategy: scopeStrategyRaw === "WITH_PARENT" ? "WITH_PARENT" : "FLAT",
    availableScopeStrategies: Array.isArray(record.availableScopeStrategies)
      ? record.availableScopeStrategies
          .map((item) => toTrimmedString(item))
          .filter(
            (item): item is "FLAT" | "WITH_PARENT" =>
              item === "FLAT" || item === "WITH_PARENT",
          )
      : [],
    planRows,
  };
};

const requireRecord = (
  value: unknown,
  fieldName: string,
): Record<string, unknown> => {
  const record = toRecord(value);
  if (!record) {
    throw new Error(`Invalid local data import preview ${fieldName}`);
  }
  return record;
};

export const normalizeLocalDataImportDraftValidation = (
  value: unknown,
  fieldName = "draftValidation",
): ApiLocalDataImportDraftValidation => {
  const record = requireRecord(value, fieldName);
  const mappingRecord = requireRecord(record.mapping, `${fieldName}.mapping`);
  const tradingCalendarRecord = requireRecord(
    record.tradingCalendar,
    `${fieldName}.tradingCalendar`,
  );
  const targetingRecord = requireRecord(
    record.targeting,
    `${fieldName}.targeting`,
  );
  const repairRecord = requireRecord(record.repair, `${fieldName}.repair`);
  const timeZoneRecord = requireRecord(
    record.timeZone,
    `${fieldName}.timeZone`,
  );
  const confirmRecord = requireRecord(record.confirm, `${fieldName}.confirm`);
  const blockingIssueRecord = requireRecord(
    record.blockingIssue,
    `${fieldName}.blockingIssue`,
  );
  const mappingIssues = Array.isArray(mappingRecord.issues)
    ? mappingRecord.issues
        .map((item) => {
          const issue = toRecord(item) ?? {};
          const field = normalizeImportRuleFieldKey(issue.field);
          if (!field) {
            return null;
          }
          return {
            field,
            reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
              issue.reasonCode,
            ),
            header: toTrimmedString(issue.header),
          };
        })
        .filter(
          (
            item,
          ): item is ApiLocalDataImportDraftValidation["mapping"]["issues"][number] =>
            Boolean(item),
        )
    : [];
  const tradingCalendarIssues = Array.isArray(tradingCalendarRecord.issues)
    ? tradingCalendarRecord.issues.map((item) => {
        const issue = toRecord(item) ?? {};
        return {
          previewPlanId: toTrimmedString(issue.previewPlanId),
          baseTimeframe: normalizeBaseTimeframeValue(issue.baseTimeframe),
          reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
            issue.reasonCode,
          ),
        };
      })
    : [];
  const targetingIssues = Array.isArray(targetingRecord.issues)
    ? targetingRecord.issues.map((item) => {
        const issue = toRecord(item) ?? {};
        return {
          previewPlanId: toTrimmedString(issue.previewPlanId),
          targetSourceId: toTrimmedString(issue.targetSourceId),
          reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
            issue.reasonCode,
          ),
        };
      })
    : [];
  return {
    mapping: {
      valid: Boolean(mappingRecord.valid),
      reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
        mappingRecord.reasonCode,
      ),
      issueCount: toNonNegativeInt(mappingRecord.issueCount),
      issues: mappingIssues,
    },
    tradingCalendar: {
      valid: Boolean(tradingCalendarRecord.valid),
      reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
        tradingCalendarRecord.reasonCode,
      ),
      issueCount: toNonNegativeInt(tradingCalendarRecord.issueCount),
      issues: tradingCalendarIssues,
    },
    targeting: {
      valid: Boolean(targetingRecord.valid),
      reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
        targetingRecord.reasonCode,
      ),
      issueCount: toNonNegativeInt(targetingRecord.issueCount),
      issues: targetingIssues,
    },
    repair: {
      valid: Boolean(repairRecord.valid),
      reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
        repairRecord.reasonCode,
      ),
      warningCount: toNonNegativeInt(repairRecord.warningCount),
    },
    timeZone: {
      valid: Boolean(timeZoneRecord.valid),
      reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
        timeZoneRecord.reasonCode,
      ),
      confirmationRequired: Boolean(timeZoneRecord.confirmationRequired),
    },
    confirm: {
      enabled: Boolean(confirmRecord.enabled),
      reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
        confirmRecord.reasonCode,
      ),
    },
    blockingIssue: {
      kind: normalizeLocalDataImportBlockingIssueKind(blockingIssueRecord.kind),
      reasonCode: normalizeLocalDataImportDraftValidationReasonCode(
        blockingIssueRecord.reasonCode,
      ),
    },
    planning: normalizeLocalDataImportPlanning(record.planning),
    validatedAt: toTrimmedString(record.validatedAt),
  };
};
