// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { IMPORT_LIMITS, INPUT_ARRAY_LIMITS, INPUT_LIMITS } from '@zinuto/shared/input-limits';
import {
  idSchema,
  nonEmptyTrimmedString,
  optionalBookmarkSchema,
  optionalIdSchema,
  optionalNameSchema,
  symbolSchema,
  timeZoneSchema,
  tokenSchema,
  tradingCalendarConfigSchema,
  tradingPresetNameSchema,
  trimmedString,
} from './common.js';

const preservedNonWhitespaceString = (maxChars: number) =>
  z
    .string()
    .max(maxChars)
    .refine((value) => /\S/u.test(value), { message: 'STRING_REQUIRED' });

const optionalPreservedString = (maxChars: number) =>
  z
    .string()
    .max(maxChars)
    .refine((value) => value.length === 0 || /\S/u.test(value), {
      message: 'STRING_REQUIRED',
    })
    .optional();

const localDataImportUserOverridesObjectSchema = z
  .object({
    sourceName: optionalNameSchema,
    sourceFolder: optionalPreservedString(INPUT_LIMITS.pathChars),
    sourceFolderBookmarkId: optionalBookmarkSchema,
    timeZone: timeZoneSchema.optional(),
    timeZoneOrigin: z.enum(['PRESET_DEFAULT', 'INFERRED_DEFAULT', 'USER_SELECTED']).optional(),
    tradingCalendar: tradingCalendarConfigSchema.optional(),
  })
  .strict();

const localDataImportUserOverridesSchema =
  localDataImportUserOverridesObjectSchema.default({});

const csvFieldMappingDraftSchema = z
  .object({
    timestampMode: z.enum(['SINGLE', 'SPLIT']).default('SINGLE'),
    date: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
    time: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
    open: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
    high: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
    low: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
    close: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
    volume: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
  })
  .strict()
  .transform((value) => ({
    ...value,
    time: value.timestampMode === 'SPLIT' ? value.time : '',
  }));

const csvFieldMappingSchema = z
  .object({
    timestampMode: z.enum(['SINGLE', 'SPLIT']).default('SINGLE'),
    date: nonEmptyTrimmedString(INPUT_LIMITS.csvHeaderChars),
    time: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
    open: nonEmptyTrimmedString(INPUT_LIMITS.csvHeaderChars),
    high: nonEmptyTrimmedString(INPUT_LIMITS.csvHeaderChars),
    low: nonEmptyTrimmedString(INPUT_LIMITS.csvHeaderChars),
    close: nonEmptyTrimmedString(INPUT_LIMITS.csvHeaderChars),
    volume: trimmedString(INPUT_LIMITS.csvHeaderChars).default(''),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.timestampMode === 'SPLIT' && !value.time) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CSV_MAPPING_REQUIRED',
        path: ['time'],
      });
    }
  });

const localDataFullReimportUserOverridesSchema =
  localDataImportUserOverridesObjectSchema
    .extend({
      allowExistingSourceTimeZoneChange: z.boolean().optional(),
    })
    .default({});

const localDataIncrementalUpdateUserOverridesSchema = z
  .object({
    sourceName: optionalNameSchema,
    sourceFolder: optionalPreservedString(INPUT_LIMITS.pathChars),
    sourceFolderBookmarkId: optionalBookmarkSchema,
    sourceFolderUsageMode: z.enum(['BOUND_SOURCE', 'ONE_OFF']).optional(),
  })
  .strict()
  .default({});

export const localDataImportByPathSchema = z.object({
  previewToken: tokenSchema,
  previewPlanId: idSchema,
  mapping: csvFieldMappingSchema.optional(),
  userOverrides: localDataImportUserOverridesSchema,
}).strict();

export const localDataFullReimportByPathSchema = z.object({
  previewToken: tokenSchema,
  previewPlanId: idSchema,
  mapping: csvFieldMappingSchema.optional(),
  userOverrides: localDataFullReimportUserOverridesSchema,
}).strict();

export const localDataIncrementalUpdateByPathSchema = z.object({
  previewToken: tokenSchema,
  previewPlanId: idSchema,
  mapping: csvFieldMappingSchema.optional(),
  userOverrides: localDataIncrementalUpdateUserOverridesSchema,
}).strict();

export const localDataSourceTradingCalendarUpdateSchema = z.object({
  tradingCalendar: tradingCalendarConfigSchema
});

export const localDataImportPreviewByPathSchema = z.object({
  folderPath: preservedNonWhitespaceString(INPUT_LIMITS.pathChars),
  sourceFolderName: trimmedString(INPUT_LIMITS.fileNameChars).optional(),
  sourceId: optionalIdSchema,
  locale: trimmedString(INPUT_LIMITS.localeChars).optional(),
});

export const localDataImportPreviewDiscardSchema = z.object({
  previewToken: tokenSchema,
});

export const localDataImportDraftValidationSchema = z.object({
  previewToken: tokenSchema,
  mapping: csvFieldMappingDraftSchema,
  planDrafts: z
    .array(
      z.object({
        previewPlanId: idSchema,
        tradingCalendar: tradingCalendarConfigSchema,
      }).strict(),
    )
    .max(INPUT_ARRAY_LIMITS.enabledSamplePools)
    .default([]),
  planning: z
    .object({
      importEntryMode: z.enum(['GENERAL', 'FULL_REIMPORT']).optional(),
      fullReimportTargetSourceId: optionalIdSchema,
      importTimeZone: timeZoneSchema.optional(),
      importTimeZoneMode: z.enum(['AUTO', 'MANUAL']).optional(),
      timeZoneConfirmed: z.boolean().optional(),
      timeZoneConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
      suggestedTimeZone: timeZoneSchema.optional(),
      suggestedTimeZoneReason: z
        .enum([
          'PRESET_DEFAULT',
          'RULE_INFERRED',
          'TIMESTAMP_INFERRED',
          'EXISTING_SOURCE',
          'SYSTEM_FALLBACK',
        ])
        .optional(),
      scopeStrategy: z.enum(['FLAT', 'WITH_PARENT']).optional(),
      tradingCalendar: tradingCalendarConfigSchema.optional(),
      tradingCalendarTouched: z.boolean().optional(),
      repairWarningCount: z.coerce.number().int().min(0).max(100000).optional(),
      locale: trimmedString(INPUT_LIMITS.localeChars).optional(),
      planOverrides: z
        .array(
          z
            .object({
              previewPlanId: idSchema,
              targetSourceId: trimmedString(INPUT_LIMITS.idChars).optional(),
              sourceTouched: z.boolean().optional(),
              poolName: optionalNameSchema,
              nameTouched: z.boolean().optional(),
            })
            .strict(),
        )
        .max(INPUT_ARRAY_LIMITS.enabledSamplePools)
        .default([]),
    })
    .strict()
    .optional(),
}).strict();

export const localDataSyncPreviewByPathSchema = z.object({
  previewToken: tokenSchema,
  sourceFolder: optionalPreservedString(INPUT_LIMITS.pathChars),
  sourceFolderUsageMode: z.enum(['BOUND_SOURCE', 'ONE_OFF']).default('BOUND_SOURCE'),
});

export const localDataSyncQuickCheckByMetadataSchema = z.object({
  sourceFolder: optionalPreservedString(INPUT_LIMITS.pathChars),
  files: z
    .array(
      z.object({
        relativePath: preservedNonWhitespaceString(INPUT_LIMITS.relativePathChars),
        originalname: optionalPreservedString(INPUT_LIMITS.fileNameChars),
        size: z.coerce.number().int().min(0).max(IMPORT_LIMITS.maxSingleFileBytes).default(0),
        mtimeMs: z.coerce.number().finite().min(0).default(0),
        fingerprint: trimmedString(INPUT_LIMITS.tokenChars).optional(),
      }),
    )
    .max(IMPORT_LIMITS.maxFiles)
    .default([]),
});

export const localDataImportControlSchema = z.object({
  action: z.enum(['PAUSE', 'RESUME', 'CANCEL'])
});

const diagnosticCategorySchema = z.enum([
  'TIME_INTEGRITY',
  'EXTREME_ANOMALY',
]);

const diagnosticSeveritySchema = z.enum(['INFO', 'WARNING', 'CRITICAL']);

export const localDataSourceDiagnosticsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: trimmedString(64).nullable().optional(),
  category: diagnosticCategorySchema.nullable().optional(),
  severity: diagnosticSeveritySchema.nullable().optional(),
});

export const localDataSourceDiagnosticProfileUpdateSchema = z.object({
  assetClass: z.enum(['STOCK', 'FUTURES', 'FOREX', 'CRYPTO']),
  marketPresetId: tradingPresetNameSchema,
});

export const localDataSourceRemoveSymbolsSchema = z.object({
  symbols: z.array(symbolSchema).min(1).max(500)
});
