// SPDX-License-Identifier: GPL-3.0-only
// Local-data requests, reset results, and portable transfer schemas.

import { z } from "zod";

import {
  IMPORT_LIMITS,
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
} from "../input-limits.js";
import {
  assetClassSchema,
  finiteNumberSchema,
  idStringSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntSchema,
  nonNegativeNumberSchema,
  nullableDateTimeStringSchema,
  nullableTrimmedStringSchema,
  optionalLocaleStringSchema,
  optionalNameStringSchema,
  optionalPathStringSchema,
  optionalPreservedStringSchema,
  optionalTokenStringSchema,
  pathStringSchema,
  relativePathStringSchema,
  symbolStringSchema,
  tokenStringSchema,
  tradingPresetNameStringSchema,
  trimmedStringSchema,
} from "./api-primitives.js";
import {
  desktopAccountSchema,
  desktopInstrumentListSchema,
  desktopTradingCalendarConfigSchema,
  timeZoneOriginSchema,
  timeZoneSchema,
} from "./market-session.js";
import {
  csvMappingDraftSchema,
  csvMappingSchema,
  timeZoneSuggestionReasonSchema,
} from "./local-data-models.js";
import { desktopTradingSettingsSchema } from "./trading-settings.js";

export const desktopLocalDataSourceDiagnosticProfileUpdateRequestSchema =
  z.object({
    assetClass: assetClassSchema,
    marketPresetId: tradingPresetNameStringSchema,
  });

export const desktopLocalDataClearAllResultSchema = z.object({
  deletedSourceFiles: nonNegativeIntSchema,
  deletedImportJobs: nonNegativeIntSchema,
  deletedSources: nonNegativeIntSchema,
  deletedInstruments: nonNegativeIntSchema,
  clearedAt: nonEmptyTrimmedStringSchema,
});

export const desktopLocalDataDeleteSourceResultSchema =
  desktopLocalDataClearAllResultSchema.extend({
    sourceId: nonEmptyTrimmedStringSchema,
  });

const desktopStorageFootprintSchema = z.object({
  dbBytes: nonNegativeNumberSchema,
  walBytes: nonNegativeNumberSchema,
  shmBytes: nonNegativeNumberSchema,
  totalBytes: nonNegativeNumberSchema,
});

const desktopResetAllDataErrorArgsSchema = z
  .record(
    z.string(),
    z.union([z.string(), finiteNumberSchema, z.boolean(), z.null()]),
  )
  .nullable();

export const desktopResetAllDataModuleProgressSchema = z.object({
  key: z.enum([
    "trainingDataBytes",
    "replayNotesBytes",
    "statsDataBytes",
    "systemSettingsBytes",
    "marketDataBytes",
  ]),
  status: z.enum(["PENDING", "RUNNING", "SUCCESS", "FAILED"]),
  progressPercent: nonNegativeNumberSchema.max(100),
});

export const desktopResetAllDataResultSchema = z.object({
  deletedSessions: nonNegativeIntSchema,
  deletedStatsSessions: nonNegativeIntSchema,
  deletedStatsMonthly: nonNegativeIntSchema,
  deletedStatsPools: nonNegativeIntSchema,
  deletedStatsSymbols: nonNegativeIntSchema,
  deletedStatsTimeframes: nonNegativeIntSchema,
  deletedProjects: nonNegativeIntSchema,
  deletedPortableProjectPreviews: nonNegativeIntSchema,
  deletedSpecialTrainingLedger: nonNegativeIntSchema,
  deletedSpecialTrainingBanks: nonNegativeIntSchema,
  deletedSpecialTrainingHistoryQuestions: nonNegativeIntSchema,
  deletedSpecialTrainingHistorySessions: nonNegativeIntSchema,
  deletedSpecialTrainingQuestionSnapshots: nonNegativeIntSchema,
  deletedSpecialTrainingStatsProjection: nonNegativeIntSchema,
  deletedReplayNotes: nonNegativeIntSchema,
  deletedSimulationBatches: nonNegativeIntSchema,
  deletedLocalDataSourceFiles: nonNegativeIntSchema,
  deletedLocalDataImportJobs: nonNegativeIntSchema,
  deletedLocalDataSources: nonNegativeIntSchema,
  deletedPortableSourceManifests: nonNegativeIntSchema,
  deletedTransfers: nonNegativeIntSchema,
  deletedInstruments: nonNegativeIntSchema,
  marketResetResult: z.object({
    deletedBars: nonNegativeIntSchema,
    deletedInstruments: nonNegativeIntSchema,
  }),
  resetAt: nonEmptyTrimmedStringSchema,
  accounts: z.array(desktopAccountSchema),
  tradingSettings: desktopTradingSettingsSchema,
  instruments: desktopInstrumentListSchema,
  storageFootprintBefore: desktopStorageFootprintSchema,
  marketFootprintBefore: desktopStorageFootprintSchema,
  storageFootprint: desktopStorageFootprintSchema,
  marketFootprint: desktopStorageFootprintSchema,
  storageReclaimedBytes: nonNegativeNumberSchema,
  marketReclaimedBytes: nonNegativeNumberSchema,
});

export const desktopResetAllDataJobSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  status: z.enum(["QUEUED", "RUNNING", "SUCCESS", "FAILED"]),
  progressPercent: nonNegativeNumberSchema.max(100),
  modules: z.array(desktopResetAllDataModuleProgressSchema),
  startedAt: nullableTrimmedStringSchema,
  finishedAt: nullableTrimmedStringSchema,
  errorCode: nullableTrimmedStringSchema,
  errorArgs: desktopResetAllDataErrorArgsSchema,
  result: desktopResetAllDataResultSchema.nullable(),
});

export const desktopLocalDataRemoveSymbolsResultSchema = z.object({
  sourceId: nonEmptyTrimmedStringSchema,
  requestedSymbols: z.array(nonEmptyTrimmedStringSchema),
  removedSymbols: z.array(nonEmptyTrimmedStringSchema),
  skippedSymbols: z.array(nonEmptyTrimmedStringSchema),
  deletedSourceFiles: nonNegativeIntSchema,
  deletedInstruments: nonNegativeIntSchema,
  summary: z.object({
    symbolCount: nonNegativeIntSchema,
    barCount: nonNegativeIntSchema,
    timeStartTs: nullableTrimmedStringSchema,
    timeEndTs: nullableTrimmedStringSchema,
    storageBytes: nonNegativeNumberSchema,
    totalFiles: nonNegativeIntSchema,
    importedFiles: nonNegativeIntSchema,
    failedFiles: nonNegativeIntSchema,
  }),
  updatedAt: nonEmptyTrimmedStringSchema,
});

const desktopLocalDataImportUserOverridesSchema = z.object({
  sourceName: optionalNameStringSchema,
  sourceFolder: optionalPathStringSchema,
  sourceFolderBookmarkId: trimmedStringSchema.max(INPUT_LIMITS.bookmarkChars).optional(),
  timeZone: timeZoneSchema.optional(),
  timeZoneOrigin: timeZoneOriginSchema.optional(),
  tradingCalendar: desktopTradingCalendarConfigSchema.optional(),
}).strict();

export const desktopLocalDataImportByPathRequestSchema = z.object({
  previewToken: tokenStringSchema,
  previewPlanId: idStringSchema,
  mapping: csvMappingSchema.optional(),
  userOverrides: desktopLocalDataImportUserOverridesSchema.optional(),
}).strict();

export const desktopLocalDataFullReimportByPathRequestSchema = z.object({
  previewToken: tokenStringSchema,
  previewPlanId: idStringSchema,
  mapping: csvMappingSchema.optional(),
  userOverrides: desktopLocalDataImportUserOverridesSchema
    .extend({
      allowExistingSourceTimeZoneChange: z.boolean().optional(),
    })
    .optional(),
}).strict();

const desktopLocalDataIncrementalUpdateUserOverridesSchema = z.object({
  sourceName: optionalNameStringSchema,
  sourceFolder: optionalPathStringSchema,
  sourceFolderBookmarkId: trimmedStringSchema.max(INPUT_LIMITS.bookmarkChars).optional(),
  sourceFolderUsageMode: z.enum(["BOUND_SOURCE", "ONE_OFF"]).optional(),
}).strict();

export const desktopLocalDataIncrementalUpdateByPathRequestSchema = z.object({
  previewToken: tokenStringSchema,
  previewPlanId: idStringSchema,
  mapping: csvMappingSchema.optional(),
  userOverrides: desktopLocalDataIncrementalUpdateUserOverridesSchema.optional(),
}).strict();

export const desktopLocalDataSourceTradingCalendarUpdateRequestSchema = z.object({
  tradingCalendar: desktopTradingCalendarConfigSchema,
});

export const desktopLocalDataImportPreviewByPathRequestSchema = z.object({
  folderPath: pathStringSchema,
  sourceFolderName: trimmedStringSchema.max(INPUT_LIMITS.fileNameChars).optional(),
  sourceId: idStringSchema.optional(),
  locale: optionalLocaleStringSchema,
});

export const desktopLocalDataImportDraftValidationRequestSchema = z.object({
  previewToken: tokenStringSchema,
  mapping: csvMappingDraftSchema,
  planDrafts: z
    .array(
      z.object({
        previewPlanId: idStringSchema,
        tradingCalendar: desktopTradingCalendarConfigSchema,
      }).strict(),
    )
    .max(INPUT_ARRAY_LIMITS.enabledSamplePools)
    .default([]),
  planning: z
    .object({
      importEntryMode: z.enum(["GENERAL", "FULL_REIMPORT"]).optional(),
      fullReimportTargetSourceId: idStringSchema.optional(),
      importTimeZone: timeZoneSchema.optional(),
      importTimeZoneMode: z.enum(["AUTO", "MANUAL"]).optional(),
      timeZoneConfirmed: z.boolean().optional(),
      timeZoneConfidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
      suggestedTimeZone: timeZoneSchema.optional(),
      suggestedTimeZoneReason: timeZoneSuggestionReasonSchema.optional(),
      scopeStrategy: z.enum(["FLAT", "WITH_PARENT"]).optional(),
      tradingCalendar: desktopTradingCalendarConfigSchema.optional(),
      tradingCalendarTouched: z.boolean().optional(),
      repairWarningCount: nonNegativeIntSchema.optional(),
      locale: optionalLocaleStringSchema,
      planOverrides: z
        .array(
          z.object({
            previewPlanId: idStringSchema,
            targetSourceId: trimmedStringSchema.max(INPUT_LIMITS.idChars).optional(),
            sourceTouched: z.boolean().optional(),
            poolName: trimmedStringSchema.max(INPUT_LIMITS.samplePoolNameChars).optional(),
            nameTouched: z.boolean().optional(),
          }).strict(),
        )
        .max(INPUT_ARRAY_LIMITS.enabledSamplePools)
        .default([]),
    })
    .strict()
    .optional(),
}).strict();

export const desktopLocalDataImportPreviewDiscardRequestSchema = z.object({
  previewToken: tokenStringSchema,
});

export const desktopLocalDataSyncPreviewByPathRequestSchema = z.object({
  previewToken: tokenStringSchema,
  sourceFolder: optionalPathStringSchema,
  sourceFolderUsageMode: z.enum(["BOUND_SOURCE", "ONE_OFF"]).default("BOUND_SOURCE"),
});

export const desktopLocalDataSyncQuickCheckByMetadataRequestSchema = z.object({
  sourceFolder: optionalPathStringSchema,
  files: z
    .array(
      z.object({
        relativePath: relativePathStringSchema,
        originalname: optionalPreservedStringSchema(INPUT_LIMITS.fileNameChars),
        size: z.coerce.number().int().min(0).max(IMPORT_LIMITS.maxSingleFileBytes).default(0),
        mtimeMs: z.coerce.number().finite().min(0).default(0),
        fingerprint: optionalTokenStringSchema,
      }),
    )
    .max(IMPORT_LIMITS.maxFiles)
    .default([]),
});

export const desktopLocalDataImportControlRequestSchema = z.object({
  action: z.enum(["PAUSE", "RESUME", "CANCEL"]),
});

export const desktopLocalDataSourceRemoveSymbolsRequestSchema = z.object({
  symbols: z.array(symbolStringSchema).min(1).max(INPUT_ARRAY_LIMITS.symbols),
});

const portableDomainSchema = z.enum([
  "SETTINGS",
  "CUSTOM_INDICATORS",
  "NOTES",
  "TRAINING_HISTORY",
  "SPECIAL_TRAINING_HISTORY",
  "MARKET_DATA",
]);

const portableDateRangeSchema = z
  .object({
    from: nullableDateTimeStringSchema.optional(),
    to: nullableDateTimeStringSchema.optional(),
  })
  .optional();

export const desktopPortableExportPreviewRequestSchema = z.object({
  domains: z.array(portableDomainSchema).max(7).optional(),
  marketSourceIds: z.array(idStringSchema).max(INPUT_ARRAY_LIMITS.projectIds).optional(),
  dateRange: portableDateRangeSchema,
});

export const desktopPortableExportRequestSchema =
  desktopPortableExportPreviewRequestSchema.extend({
    outputPath: pathStringSchema,
    snapshotPolicy: z.literal("EVIDENCE_ONLY").optional(),
    appBuildVersion: trimmedStringSchema.max(INPUT_LIMITS.shortCodeChars).optional(),
    legalConfirmedForMarketData: z.boolean(),
  });

export const desktopPortableImportInspectRequestSchema = z.object({
  inputPath: pathStringSchema,
});

export const desktopPortableImportRequestSchema = z.object({
  inputPath: pathStringSchema,
  domains: z.array(portableDomainSchema).max(7).optional(),
  conflictMode: z.enum(["MERGE_KEEP_LOCAL", "REPLACE_DOMAIN"]).optional(),
  settingsConflictMode: z.enum(["KEEP_LOCAL", "REPLACE_TARGET"]).optional(),
  legalConfirmedForMarketData: z.boolean(),
});

export const desktopLocalImportMockSampleExportRequestSchema = z.object({
  outputPath: pathStringSchema,
});

export const desktopLocalImportMockSampleExportResultSchema = z.object({
  outputPath: pathStringSchema,
  byteLength: nonNegativeIntSchema,
});
