// SPDX-License-Identifier: GPL-3.0-only
// Local-data import, source summary, and diagnostics response schemas.

import { z } from "zod";

import {
  INPUT_LIMITS,
} from "../input-limits.js";
import {
  assetClassSchema,
  baseTimeframeSchema,
  csvHeaderStringSchema,
  finiteNumberSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntSchema,
  nonNegativeNumberSchema,
  nullableFiniteNumberSchema,
  nullableJsonRecordSchema,
  nullableTrimmedStringSchema,
  optionalCsvHeaderStringSchema,
  pathStringSchema,
  preservedPathStringSchema,
  preservedRelativePathStringSchema,
  relativePathStringSchema,
  samplePoolNameStringSchema,
  tradingPresetNameStringSchema,
  trimmedStringSchema,
} from "./api-primitives.js";
import {
  desktopTradingCalendarConfigSchema,
  timeZoneOriginSchema,
} from "./market-session.js";

export const csvMappingSchema = z
  .object({
    timestampMode: z.enum(["SINGLE", "SPLIT"]).default("SINGLE"),
    date: csvHeaderStringSchema,
    time: optionalCsvHeaderStringSchema.default(""),
    open: csvHeaderStringSchema,
    high: csvHeaderStringSchema,
    low: csvHeaderStringSchema,
    close: csvHeaderStringSchema,
    volume: optionalCsvHeaderStringSchema.default(""),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.timestampMode === "SPLIT" && !value.time.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CSV_MAPPING_REQUIRED",
        path: ["time"],
      });
    }
  });

export const csvMappingDraftSchema = z
  .object({
    timestampMode: z.enum(["SINGLE", "SPLIT"]).default("SINGLE"),
    date: trimmedStringSchema.max(INPUT_LIMITS.csvHeaderChars).default(""),
    time: trimmedStringSchema.max(INPUT_LIMITS.csvHeaderChars).default(""),
    open: trimmedStringSchema.max(INPUT_LIMITS.csvHeaderChars).default(""),
    high: trimmedStringSchema.max(INPUT_LIMITS.csvHeaderChars).default(""),
    low: trimmedStringSchema.max(INPUT_LIMITS.csvHeaderChars).default(""),
    close: trimmedStringSchema.max(INPUT_LIMITS.csvHeaderChars).default(""),
    volume: trimmedStringSchema.max(INPUT_LIMITS.csvHeaderChars).default(""),
  })
  .strict()
  .transform((value) => ({
    ...value,
    time: value.timestampMode === "SPLIT" ? value.time : "",
  }));

const importRuleConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
const importRulePriceFamilySchema = z.enum(["RAW", "ADJUSTED", "GENERIC"]);
const importRuleFieldKeySchema = z.enum([
  "date",
  "time",
  "open",
  "high",
  "low",
  "close",
  "volume",
]);
export const timeZoneSuggestionReasonSchema = z.enum([
  "PRESET_DEFAULT",
  "RULE_INFERRED",
  "TIMESTAMP_INFERRED",
  "EXISTING_SOURCE",
  "SYSTEM_FALLBACK",
]);

const localDataImportFieldDiagnosticSchema = z.object({
  field: importRuleFieldKeySchema,
  status: z.enum(["MATCHED", "MISSING", "CONFLICT"]),
  selectedHeader: trimmedStringSchema,
  confidence: importRuleConfidenceSchema,
  reason: trimmedStringSchema,
  candidates: z.array(
    z.object({
      header: nonEmptyTrimmedStringSchema,
      score: nonNegativeIntSchema,
      reason: trimmedStringSchema,
      family: importRulePriceFamilySchema,
    }),
  ),
});

const localDataImportRepairSummarySchema = z.object({
  applied: z.array(nonEmptyTrimmedStringSchema),
  warnings: z.array(nonEmptyTrimmedStringSchema),
  sample: z.object({
    checkedRows: nonNegativeIntSchema,
    parseableTimestampRows: nonNegativeIntSchema,
    validOhlcRows: nonNegativeIntSchema,
    duplicateTimestampRows: nonNegativeIntSchema,
    conflictingDuplicateTimestampRows: nonNegativeIntSchema,
  }),
});

const localDataImportTimeZoneSuggestionSchema = z.object({
  timeZone: nonEmptyTrimmedStringSchema,
  reason: timeZoneSuggestionReasonSchema,
  confidence: importRuleConfidenceSchema,
  reasons: z.array(
    z.object({
      code: nonEmptyTrimmedStringSchema,
      timeZone: nonEmptyTrimmedStringSchema,
      score: nonNegativeIntSchema,
    }),
  ),
  samples: z.array(
    z.object({
      raw: nonEmptyTrimmedStringSchema,
      parsedAt: nonEmptyTrimmedStringSchema,
    }),
  ),
});

const localDataImportTradingCalendarSuggestionSchema = z.object({
  calendar: desktopTradingCalendarConfigSchema,
  confidence: importRuleConfidenceSchema,
  origin: z.enum(["DETECTED", "PRESET_DEFAULT", "EXISTING_SOURCE"]),
  sampleCount: nonNegativeIntSchema,
  activeDayCount: nonNegativeIntSchema,
});

const localDataImportSchemaDiagnosticsSchema = z.object({
  canonicalSchemaKey: nonEmptyTrimmedStringSchema,
  validSchemaCount: nonNegativeIntSchema,
  inconsistentFiles: z.array(
    z.object({
      relativePath: relativePathStringSchema,
      reason: nonEmptyTrimmedStringSchema,
      canonicalSchemaKey: trimmedStringSchema,
      conflicts: z.array(nonEmptyTrimmedStringSchema),
    }),
  ),
});

const localDataImportDraftValidationReasonCodeSchema = z.enum([
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
]);

const localDataImportBlockingIssueKindSchema = z.enum([
  "none",
  "field-mapping",
  "targeting",
  "trading-calendar",
  "repair-warnings",
  "time-zone",
]);

const localDataImportPlanningTargetSourceOptionSchema = z.object({
  sourceId: nonEmptyTrimmedStringSchema,
  sourceName: nonEmptyTrimmedStringSchema,
  baseTimeframe: baseTimeframeSchema,
  importScopeStrategy: z.enum(["FLAT", "WITH_PARENT"]).nullable(),
  importScopeTopLevelSubfolder: preservedRelativePathStringSchema,
  timeZone: nonEmptyTrimmedStringSchema,
  timeZoneOrigin: timeZoneOriginSchema,
  tradingCalendar: desktopTradingCalendarConfigSchema,
});

const localDataImportPlanningSchema = z.object({
  targetSourceOptions: z.array(localDataImportPlanningTargetSourceOptionSchema),
  recommendedTimeZone: nonEmptyTrimmedStringSchema,
  recommendedTimeZoneReason: timeZoneSuggestionReasonSchema,
  recommendedTradingCalendar: desktopTradingCalendarConfigSchema,
  scopeStrategy: z.enum(["FLAT", "WITH_PARENT"]),
  availableScopeStrategies: z.array(z.enum(["FLAT", "WITH_PARENT"])),
  planRows: z.array(
    z.object({
      id: nonEmptyTrimmedStringSchema,
      previewPlanId: nonEmptyTrimmedStringSchema,
      strategy: z.enum(["FLAT", "WITH_PARENT"]),
      topLevelSubfolder: preservedRelativePathStringSchema,
      poolName: samplePoolNameStringSchema,
      autoGeneratedPoolName: samplePoolNameStringSchema,
      sourceId: trimmedStringSchema,
      targetSourceId: nonEmptyTrimmedStringSchema,
      targetSourceOptions: z.array(
        z.object({
          sourceId: nonEmptyTrimmedStringSchema,
          sourceName: nonEmptyTrimmedStringSchema,
        }),
      ),
      hasExistingTargetOptions: z.boolean(),
      symbolCount: nonNegativeIntSchema,
      fileCount: nonNegativeIntSchema,
      baseTimeframe: baseTimeframeSchema,
      effectiveTimeZone: nonEmptyTrimmedStringSchema,
      effectiveTimeZoneOrigin: timeZoneOriginSchema,
      effectiveTimeZoneSource: z.enum([
        "NEW_SOURCE_PENDING_IMPORT",
        "EXISTING_SOURCE",
        "FULL_REIMPORT",
      ]),
      targetSourceTimeZone: trimmedStringSchema.nullable(),
      targetSourceTimeZoneOrigin: timeZoneOriginSchema.nullable(),
      tradingCalendar: desktopTradingCalendarConfigSchema,
      targetSourceTradingCalendar: desktopTradingCalendarConfigSchema.nullable(),
      willUpdateExistingSourceTimeZone: z.boolean(),
      willUpdateExistingSourceTradingCalendar: z.boolean(),
    }),
  ),
});

export const desktopLocalDataImportDraftValidationSchema = z.object({
  mapping: z.object({
    valid: z.boolean(),
    reasonCode: localDataImportDraftValidationReasonCodeSchema,
    issueCount: nonNegativeIntSchema,
    issues: z.array(
      z.object({
        field: importRuleFieldKeySchema,
        reasonCode: localDataImportDraftValidationReasonCodeSchema,
        header: trimmedStringSchema,
      }),
    ),
  }),
  tradingCalendar: z.object({
    valid: z.boolean(),
    reasonCode: localDataImportDraftValidationReasonCodeSchema,
    issueCount: nonNegativeIntSchema,
    issues: z.array(
      z.object({
        previewPlanId: trimmedStringSchema,
        baseTimeframe: baseTimeframeSchema.nullable(),
        reasonCode: localDataImportDraftValidationReasonCodeSchema,
      }),
    ),
  }),
  targeting: z.object({
    valid: z.boolean(),
    reasonCode: localDataImportDraftValidationReasonCodeSchema,
    issueCount: nonNegativeIntSchema,
    issues: z.array(
      z.object({
        previewPlanId: trimmedStringSchema,
        targetSourceId: trimmedStringSchema,
        reasonCode: localDataImportDraftValidationReasonCodeSchema,
      }),
    ),
  }),
  repair: z.object({
    valid: z.boolean(),
    reasonCode: localDataImportDraftValidationReasonCodeSchema,
    warningCount: nonNegativeIntSchema,
  }),
  timeZone: z.object({
    valid: z.boolean(),
    reasonCode: localDataImportDraftValidationReasonCodeSchema,
    confirmationRequired: z.boolean(),
  }),
  confirm: z.object({
    enabled: z.boolean(),
    reasonCode: localDataImportDraftValidationReasonCodeSchema,
  }),
  blockingIssue: z.object({
    kind: localDataImportBlockingIssueKindSchema,
    reasonCode: localDataImportDraftValidationReasonCodeSchema,
  }),
  planning: localDataImportPlanningSchema,
  validatedAt: nonEmptyTrimmedStringSchema,
});

const localDataImportMappingProfileSchema = z.object({
  canonicalSchemaKey: nonEmptyTrimmedStringSchema,
  priceFamily: importRulePriceFamilySchema,
  confidence: importRuleConfidenceSchema,
  score: nonNegativeIntSchema,
  conflicts: z.array(nonEmptyTrimmedStringSchema),
});

const localDataSourceInstrumentSummarySchema = z.object({
  samplePoolId: nonEmptyTrimmedStringSchema,
  instrumentId: nonEmptyTrimmedStringSchema,
  symbol: nonEmptyTrimmedStringSchema,
  displayLabel: nonEmptyTrimmedStringSchema,
  baseTimeframe: baseTimeframeSchema,
  sourceTimeframe: baseTimeframeSchema,
  scopeKind: z.enum(["SYSTEM", "LOCAL"]),
  sourceId: nullableTrimmedStringSchema,
  sourceName: nullableTrimmedStringSchema,
  barCount: nonNegativeIntSchema,
  timeStartTs: nullableTrimmedStringSchema,
  timeEndTs: nullableTrimmedStringSchema,
});

const localDataImportJobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FAILED",
  "CANCELED",
]);
const localDataImportJobStageSchema = z.enum([
  "QUEUED",
  "SCANNING",
  "IMPORTING",
  "FINALIZING",
  "DONE",
]);

const localDataImportOutcomeSummarySchema = z.object({
  noChanges: z.boolean(),
  addedSymbols: z.array(nonEmptyTrimmedStringSchema),
  updatedSymbols: z.array(nonEmptyTrimmedStringSchema),
  unchangedFiles: nonNegativeIntSchema,
  prependedRows: nonNegativeIntSchema,
  appendedRows: nonNegativeIntSchema,
  overlapRowsIgnored: nonNegativeIntSchema,
  internalRangeRowsIgnored: nonNegativeIntSchema,
  conflictRowsIgnored: nonNegativeIntSchema,
  qualityWarnings: z.object({
    filesWithSkippedRows: nonNegativeIntSchema,
    invalidRequiredRowsSkipped: nonNegativeIntSchema,
    invalidOhlcRowsSkipped: nonNegativeIntSchema,
    duplicateConflictRowsSkipped: nonNegativeIntSchema,
    duplicateIdenticalRowsDeduped: nonNegativeIntSchema,
  }),
});

const localDataImportSymbolLimitSchema = z.object({
  limitApplied: z.boolean(),
  maxSymbols: nonNegativeIntSchema.nullable(),
  selectedSymbols: z.array(nonEmptyTrimmedStringSchema),
  skippedSymbols: z.array(nonEmptyTrimmedStringSchema),
  skippedSymbolCount: nonNegativeIntSchema,
  reason: z.null(),
});

const localDataImportFailureCauseSchema = z.object({
  code: nonEmptyTrimmedStringSchema,
  stage: nonEmptyTrimmedStringSchema,
});

const localDataImportFailureDetailsSchema = z
  .record(z.string(), nullableFiniteNumberSchema.or(z.string()).or(z.boolean()).or(z.null()));

const localDataImportDiagnosticSchema = z.object({
  code: nonEmptyTrimmedStringSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR"]),
  stage: nonEmptyTrimmedStringSchema,
  fileName: nullableTrimmedStringSchema,
  relativePath: preservedRelativePathStringSchema.nullable(),
  format: nullableTrimmedStringSchema,
  field: nullableTrimmedStringSchema,
  rowNumber: nonNegativeIntSchema.nullable(),
  rawValue: nullableTrimmedStringSchema,
  expected: nullableTrimmedStringSchema,
  actual: nullableFiniteNumberSchema.or(z.string()).or(z.boolean()).or(z.null()),
  samples: z.array(localDataImportFailureDetailsSchema),
});

const localDataImportFailureSummarySchema = z.object({
  totalFailedFiles: nonNegativeIntSchema,
  primaryCode: nullableTrimmedStringSchema,
  items: z.array(
    z.object({
      code: nonEmptyTrimmedStringSchema,
      stage: nonEmptyTrimmedStringSchema,
      fileName: nullableTrimmedStringSchema,
      count: nonNegativeIntSchema,
    }),
  ),
});

export const desktopLocalDataImportJobSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  sourceId: nonEmptyTrimmedStringSchema,
  sourceName: nonEmptyTrimmedStringSchema,
  timeZone: nonEmptyTrimmedStringSchema,
  baseTimeframe: baseTimeframeSchema,
  jobMode: z.enum(["FULL_IMPORT", "INCREMENTAL_UPDATE"]),
  status: localDataImportJobStatusSchema,
  stage: localDataImportJobStageSchema,
  progressPercent: nonNegativeNumberSchema,
  compactProgressPercent: nonNegativeNumberSchema,
  compactBeforeBytes: nonNegativeNumberSchema,
  compactAfterBytes: nonNegativeNumberSchema,
  compactReclaimedBytes: nonNegativeNumberSchema,
  totalFiles: nonNegativeIntSchema,
  doneFiles: nonNegativeIntSchema,
  totalRows: nonNegativeIntSchema,
  importedRows: nonNegativeIntSchema,
  skippedRows: nonNegativeIntSchema,
  errorFiles: nonNegativeIntSchema,
  currentFileName: nullableTrimmedStringSchema,
  errorMessage: nullableTrimmedStringSchema,
  errorCode: nullableTrimmedStringSchema,
  cause: localDataImportFailureCauseSchema.nullable(),
  details: localDataImportFailureDetailsSchema.nullable(),
  failureSummary: localDataImportFailureSummarySchema.nullable(),
  createdAt: nonEmptyTrimmedStringSchema,
  startedAt: nullableTrimmedStringSchema,
  finishedAt: nullableTrimmedStringSchema,
  isPaused: z.boolean(),
  cancelRequested: z.boolean(),
  outcomeSummary: localDataImportOutcomeSummarySchema.nullable(),
  symbolLimit: localDataImportSymbolLimitSchema,
  failedFiles: z.array(
    z.object({
      id: nonEmptyTrimmedStringSchema,
      fileName: nonEmptyTrimmedStringSchema,
      symbol: nonEmptyTrimmedStringSchema,
      rowsTotal: nonNegativeIntSchema,
      rowsImported: nonNegativeIntSchema,
      rowsSkipped: nonNegativeIntSchema,
      errorMessage: nonEmptyTrimmedStringSchema,
      errorCode: nonEmptyTrimmedStringSchema,
      cause: localDataImportFailureCauseSchema,
      details: localDataImportFailureDetailsSchema,
      diagnostics: z.array(localDataImportDiagnosticSchema),
      updatedAt: nonEmptyTrimmedStringSchema,
    }),
  ),
});

export const desktopLocalDataImportFolderPreviewSchema = z.object({
  previewToken: nonEmptyTrimmedStringSchema,
  folderName: nonEmptyTrimmedStringSchema,
  folderPath: pathStringSchema,
  marketDataAcquisitionMetadata: z
    .union([
      z.object({
        schemaVersion: z.literal(1),
        connectorId: z.literal("akshare"),
        adjustment: z.enum(["none", "qfq", "hfq"]),
        sourceSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
        importSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
      }),
      z.object({
        schemaVersion: z.literal(1),
        connectorId: z.literal("ccxt"),
        adjustment: z.null(),
        sourceSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
        importSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
      }),
      z.object({
        schemaVersion: z.literal(2),
        connectorId: z.literal("akshare"),
        adjustment: z.enum(["none", "qfq", "hfq"]),
        sourceSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
        importSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
        timeframe: baseTimeframeSchema,
      }),
      z.object({
        schemaVersion: z.literal(2),
        connectorId: z.literal("ccxt"),
        adjustment: z.null(),
        sourceSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
        importSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
        timeframe: baseTimeframeSchema,
      }),
      z.object({
        schemaVersion: z.literal(3),
        connectorId: z.enum(["akshare", "ccxt", "financedatareader", "mixed"]),
        adjustment: z.enum(["none", "qfq", "hfq"]).nullable(),
        sourceSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
        importSymbols: z.array(nonEmptyTrimmedStringSchema).min(1).max(20),
        timeframe: baseTimeframeSchema,
        marketId: nonEmptyTrimmedStringSchema,
        timeZone: nonEmptyTrimmedStringSchema,
        sources: z
          .array(
            z.object({
              sourceSymbol: nonEmptyTrimmedStringSchema,
              importSymbol: nonEmptyTrimmedStringSchema,
              finalSource: z.object({
                providerId: z.enum(["akshare", "ccxt", "financedatareader"]),
                providerVersion: nonEmptyTrimmedStringSchema,
                upstreamId: nonEmptyTrimmedStringSchema,
                status: z.literal("SUCCEEDED"),
                errorCode: z.null(),
              }),
              attempts: z.array(
                z.object({
                  providerId: z.enum(["akshare", "ccxt", "financedatareader"]),
                  providerVersion: nonEmptyTrimmedStringSchema,
                  upstreamId: nonEmptyTrimmedStringSchema,
                  status: z.enum(["SUCCEEDED", "FAILED", "SKIPPED"]),
                  errorCode: nonEmptyTrimmedStringSchema.nullable(),
                }),
              ).min(1).max(3),
            }),
          )
          .min(1)
          .max(20),
      }),
    ])
    .nullable(),
  suggestedFreeReplayEnvironment: z
    .object({
      assetClass: assetClassSchema,
      marketPresetId: tradingPresetNameStringSchema,
    })
    .nullable(),
  suggestedTimeZone: nonEmptyTrimmedStringSchema,
  suggestedTimeZoneReason: timeZoneSuggestionReasonSchema,
  timeZoneSuggestion: localDataImportTimeZoneSuggestionSchema,
  tradingCalendarSuggestion: localDataImportTradingCalendarSuggestionSchema,
  draftValidation: desktopLocalDataImportDraftValidationSchema,
  headers: z.array(nonEmptyTrimmedStringSchema),
  defaultMapping: csvMappingSchema,
  mappingProfile: localDataImportMappingProfileSchema,
  fieldDiagnostics: z.array(localDataImportFieldDiagnosticSchema),
  repairSummary: localDataImportRepairSummarySchema,
  schemaDiagnostics: localDataImportSchemaDiagnosticsSchema,
  detectedTimeframe: baseTimeframeSchema,
  detectedTimeframes: z.array(baseTimeframeSchema),
  validSymbolCount: nonNegativeIntSchema,
  totalFiles: nonNegativeIntSchema,
  validFiles: nonNegativeIntSchema,
  invalidFiles: nonNegativeIntSchema,
  invalidFileSamples: z.array(
    z.object({
      relativePath: relativePathStringSchema,
      reason: nonEmptyTrimmedStringSchema,
    }),
  ),
  planSummaries: z.array(
    z.object({
      id: nonEmptyTrimmedStringSchema,
      strategy: z.enum(["FLAT", "WITH_PARENT"]),
      baseTimeframe: baseTimeframeSchema,
      topLevelSubfolder: preservedRelativePathStringSchema,
      symbolCount: nonNegativeIntSchema,
      fileCount: nonNegativeIntSchema,
    }),
  ),
  confirmableImportPlans: z.array(
    z.object({
      id: nonEmptyTrimmedStringSchema,
      previewPlanId: nonEmptyTrimmedStringSchema,
      strategy: z.enum(["FLAT", "WITH_PARENT"]),
      baseTimeframe: baseTimeframeSchema,
      topLevelSubfolder: preservedRelativePathStringSchema,
      defaultPoolName: samplePoolNameStringSchema,
      symbolCount: nonNegativeIntSchema,
      fileCount: nonNegativeIntSchema,
    }).strict(),
  ),
  sampledFileNames: z.array(nonEmptyTrimmedStringSchema),
  skippedNestedCount: nonNegativeIntSchema,
});

const localDataImportPreviewJobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCESS",
  "FAILED",
]);

const localDataImportPreviewJobStageSchema = z.enum([
  "QUEUED",
  "SCANNING_FILES",
  "READING_HEADERS",
  "DETECTING_TIMEFRAMES",
  "BUILDING_PLAN",
  "CHECKING_QUALITY",
  "DONE",
]);

export const desktopLocalDataImportPreviewJobSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  status: localDataImportPreviewJobStatusSchema,
  stage: localDataImportPreviewJobStageSchema,
  progressPercent: nonNegativeNumberSchema,
  processedFiles: nonNegativeIntSchema,
  totalFiles: nonNegativeIntSchema,
  result: desktopLocalDataImportFolderPreviewSchema.nullable(),
  errorMessage: nullableTrimmedStringSchema,
  errorCode: nullableTrimmedStringSchema,
  errorArgs: nullableJsonRecordSchema,
  createdAt: nonEmptyTrimmedStringSchema,
  startedAt: nullableTrimmedStringSchema,
  finishedAt: nullableTrimmedStringSchema,
});

export const desktopLocalDataImportPreviewDiscardResultSchema = z.object({
  discarded: z.boolean(),
});

export const desktopFreeReplayPoolDefaultEnvironmentSchema = z.object({
  assetClass: assetClassSchema,
  marketPresetId: tradingPresetNameStringSchema,
});

export const desktopFreeReplayPoolDefaultEnvironmentRecordSchema = z.record(
  nonEmptyTrimmedStringSchema,
  desktopFreeReplayPoolDefaultEnvironmentSchema,
);

const localDataSourceDiagnosticProfileOriginSchema = z.enum([
  "SYSTEM",
  "INFERRED",
  "USER",
]);

const localDataSourceDiagnosticProfileSchema = z.object({
  assetClass: assetClassSchema,
  marketPresetId: tradingPresetNameStringSchema,
  profileOrigin: localDataSourceDiagnosticProfileOriginSchema,
});

const localDataSourceDiagnosticStatusSchema = z.enum([
  "READY",
  "BUILDING",
  "FAILED",
]);

const localDataSourceDiagnosticCategorySchema = z.enum([
  "TIME_INTEGRITY",
  "EXTREME_ANOMALY",
]);

const localDataSourceDiagnosticSeveritySchema = z.enum([
  "INFO",
  "WARNING",
  "CRITICAL",
]);

const localDataSourceDiagnosticCodeSchema = z.enum([
  "INVALID_OHLC",
  "DUPLICATE_TIMESTAMP",
  "TIME_ORDER_BREAK",
  "DATA_GAP",
  "OUT_OF_SESSION_BAR",
  "TIMEFRAME_MISALIGNED_BAR",
  "EXTREME_PRICE_SPIKE",
]);

const localDataSourceDiagnosticsSummarySchema = z.object({
  totalIssues: nonNegativeIntSchema,
  criticalIssues: nonNegativeIntSchema,
  warningIssues: nonNegativeIntSchema,
  infoIssues: nonNegativeIntSchema,
  byCategory: z.record(
    localDataSourceDiagnosticCategorySchema,
    nonNegativeIntSchema,
  ),
});

const localDataSourceDiagnosticIssueSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  instrumentId: nonEmptyTrimmedStringSchema,
  symbol: nonEmptyTrimmedStringSchema,
  category: localDataSourceDiagnosticCategorySchema,
  code: localDataSourceDiagnosticCodeSchema,
  severity: localDataSourceDiagnosticSeveritySchema,
  dateLabel: nonEmptyTrimmedStringSchema,
  focusBarIndex: nonNegativeIntSchema,
  focusStartTs: nullableTrimmedStringSchema,
  focusEndTs: nullableTrimmedStringSchema,
  missingBars: nonNegativeIntSchema,
  ratio: finiteNumberSchema,
  volumeRatio: finiteNumberSchema,
  closeChangeRatio: finiteNumberSchema,
  amplitudeRatio: finiteNumberSchema,
  zScore: finiteNumberSchema,
  multiple: finiteNumberSchema,
  count: nonNegativeIntSchema,
});

export const desktopLocalDataSourceSummarySchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  samplePoolId: nonEmptyTrimmedStringSchema,
  name: nonEmptyTrimmedStringSchema,
  sourceFolder: preservedPathStringSchema,
  sourceFolderBookmarkId: trimmedStringSchema,
  importScopeStrategy: z.enum(["FLAT", "WITH_PARENT"]).nullable(),
  importScopeTopLevelSubfolder: preservedRelativePathStringSchema,
  timeZone: nonEmptyTrimmedStringSchema,
  timeZoneOrigin: timeZoneOriginSchema,
  baseTimeframe: baseTimeframeSchema,
  tradingCalendar: desktopTradingCalendarConfigSchema,
  diagnosticProfile: localDataSourceDiagnosticProfileSchema,
  fieldMapping: csvMappingSchema,
  symbols: z.array(nonEmptyTrimmedStringSchema),
  instruments: z.array(localDataSourceInstrumentSummarySchema),
  status: z.enum(["IMPORTING", "READY", "FAILED"]),
  symbolCount: nonNegativeIntSchema,
  barCount: nonNegativeIntSchema,
  symbolStats: z.array(
    z.object({
      instrumentId: nonEmptyTrimmedStringSchema,
      symbol: nonEmptyTrimmedStringSchema,
      displayLabel: nonEmptyTrimmedStringSchema,
      barCount: nonNegativeIntSchema,
      timeStartTs: nullableTrimmedStringSchema,
      timeEndTs: nullableTrimmedStringSchema,
    }),
  ),
  timeStartTs: nullableTrimmedStringSchema,
  timeEndTs: nullableTrimmedStringSchema,
  totalFiles: nonNegativeIntSchema,
  importedFiles: nonNegativeIntSchema,
  failedFiles: nonNegativeIntSchema,
  requiresSourceFolderRebind: z.boolean(),
  sourceLocked: z.boolean(),
  unlockedSymbols: z.array(nonEmptyTrimmedStringSchema),
  lockedSymbols: z.array(nonEmptyTrimmedStringSchema),
  lockedSymbolCount: nonNegativeIntSchema,
  lockReason: nullableTrimmedStringSchema,
  storageBytes: nonNegativeNumberSchema,
  createdAt: nonEmptyTrimmedStringSchema,
  updatedAt: nonEmptyTrimmedStringSchema,
  lastJob: z
    .object({
      id: nonEmptyTrimmedStringSchema,
      status: localDataImportJobStatusSchema,
      stage: localDataImportJobStageSchema,
      progressPercent: nonNegativeNumberSchema,
      compactProgressPercent: nonNegativeNumberSchema,
      compactBeforeBytes: nonNegativeNumberSchema,
      compactAfterBytes: nonNegativeNumberSchema,
      compactReclaimedBytes: nonNegativeNumberSchema,
      doneFiles: nonNegativeIntSchema,
      totalFiles: nonNegativeIntSchema,
      errorFiles: nonNegativeIntSchema,
      startedAt: nullableTrimmedStringSchema,
      finishedAt: nullableTrimmedStringSchema,
    })
    .nullable(),
});

export const desktopLocalDataSourceListSchema = z.array(
  desktopLocalDataSourceSummarySchema,
);

export const desktopLocalDataSyncPreviewSchema = z.object({
  sourceId: nonEmptyTrimmedStringSchema,
  sourceName: nonEmptyTrimmedStringSchema,
  sourceFolder: preservedPathStringSchema,
  sourceFolderUsageMode: z.enum(["BOUND_SOURCE", "ONE_OFF"]),
  baseTimeframe: baseTimeframeSchema,
  timeZone: nonEmptyTrimmedStringSchema,
  timeZoneOrigin: timeZoneOriginSchema,
  importScopeStrategy: z.enum(["FLAT", "WITH_PARENT"]).nullable(),
  importScopeTopLevelSubfolder: preservedRelativePathStringSchema,
  matchedPreviewPlanId: nullableTrimmedStringSchema,
  scopeCandidates: z.array(
    z.object({
      previewPlanId: nonEmptyTrimmedStringSchema,
      strategy: z.enum(["FLAT", "WITH_PARENT"]),
      topLevelSubfolder: preservedRelativePathStringSchema,
      symbolCount: nonNegativeIntSchema,
      fileCount: nonNegativeIntSchema,
    }),
  ),
  requiresScopeConfirmation: z.boolean(),
  changeSummary: z.object({
    changedFiles: nonNegativeIntSchema,
    unchangedFiles: nonNegativeIntSchema,
    addedSymbols: z.array(nonEmptyTrimmedStringSchema),
    updatedSymbols: z.array(nonEmptyTrimmedStringSchema),
    missingSymbolsRetained: z.array(nonEmptyTrimmedStringSchema),
    symbolLimit: localDataImportSymbolLimitSchema,
  }),
});

export const desktopLocalDataSyncQuickCheckSchema = z.object({
  sourceId: nonEmptyTrimmedStringSchema,
  sourceName: nonEmptyTrimmedStringSchema,
  sourceFolder: preservedPathStringSchema,
  baseTimeframe: baseTimeframeSchema,
  status: z.enum(["NO_CHANGES", "POTENTIAL_CHANGES", "UNABLE_TO_CHECK"]),
  reasonCode: nonEmptyTrimmedStringSchema,
  checkedAt: nonEmptyTrimmedStringSchema,
  estimatedChangedFiles: nonNegativeIntSchema,
  estimatedChangedSymbols: nonNegativeIntSchema,
  detectedFiles: nonNegativeIntSchema,
  trackedFiles: nonNegativeIntSchema,
  changedSymbols: z.array(nonEmptyTrimmedStringSchema),
  changedRelativePaths: z.array(relativePathStringSchema),
  fingerprintRequiredRelativePaths: z.array(relativePathStringSchema),
  missingSymbolsRetained: z.array(nonEmptyTrimmedStringSchema),
  snapshotSymbols: z.array(nonEmptyTrimmedStringSchema),
  invalidFiles: nonNegativeIntSchema,
  symbolLimit: localDataImportSymbolLimitSchema,
});

export const desktopLocalDataSourceSymbolDiagnosticsSchema = z.object({
  symbol: nonEmptyTrimmedStringSchema,
  baseTimeframe: baseTimeframeSchema,
  diagnosticRulesVersion: nonEmptyTrimmedStringSchema,
  status: localDataSourceDiagnosticStatusSchema,
  generatedAt: nullableTrimmedStringSchema,
  profile: localDataSourceDiagnosticProfileSchema,
  health: z.object({
    score: nonNegativeIntSchema,
    severity: localDataSourceDiagnosticSeveritySchema,
    affectedSymbols: nonNegativeIntSchema,
  }),
  totalBars: nonNegativeIntSchema,
  summary: localDataSourceDiagnosticsSummarySchema,
  items: z.array(localDataSourceDiagnosticIssueSchema),
});

export const desktopLocalDataSourceDiagnosticsSchema = z.object({
  sourceId: nonEmptyTrimmedStringSchema,
  baseTimeframe: baseTimeframeSchema,
  diagnosticRulesVersion: nonEmptyTrimmedStringSchema,
  status: localDataSourceDiagnosticStatusSchema,
  generatedAt: nullableTrimmedStringSchema,
  profile: localDataSourceDiagnosticProfileSchema,
  health: z.object({
    score: nonNegativeIntSchema,
    severity: localDataSourceDiagnosticSeveritySchema,
    affectedSymbols: nonNegativeIntSchema,
  }),
  totalSymbols: nonNegativeIntSchema,
  scannedSymbols: nonNegativeIntSchema,
  affectedSymbols: nonNegativeIntSchema,
  totalIssues: nonNegativeIntSchema,
  summary: localDataSourceDiagnosticsSummarySchema,
  symbols: z.array(
    z.object({
      instrumentId: nonEmptyTrimmedStringSchema,
      symbol: nonEmptyTrimmedStringSchema,
      totalBars: nonNegativeIntSchema,
      issueCount: nonNegativeIntSchema,
      criticalIssues: nonNegativeIntSchema,
      warningIssues: nonNegativeIntSchema,
      infoIssues: nonNegativeIntSchema,
      healthScore: nonNegativeIntSchema,
      volatilityPercent: finiteNumberSchema,
      highPrice: finiteNumberSchema,
      lowPrice: finiteNumberSchema,
      timeStartTs: nullableTrimmedStringSchema,
      timeEndTs: nullableTrimmedStringSchema,
    }),
  ),
  items: z.array(localDataSourceDiagnosticIssueSchema),
  nextCursor: nullableTrimmedStringSchema,
});
