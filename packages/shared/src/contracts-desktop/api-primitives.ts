// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import {
  INPUT_LIMITS,
} from "../input-limits.js";

export const trimmedStringSchema = z.string().trim();
export const nonEmptyTrimmedStringSchema = trimmedStringSchema.min(1);

const nonWhitespaceStringSchema = (maxChars: number) =>
  z
    .string()
    .max(maxChars)
    .refine((value) => /\S/u.test(value), { message: "STRING_REQUIRED" });

const preservedStringSchema = (maxChars: number) =>
  z
    .string()
    .max(maxChars)
    .refine((value) => value.length === 0 || /\S/u.test(value), {
      message: "STRING_REQUIRED",
    });

export const optionalPreservedStringSchema = (maxChars: number) =>
  preservedStringSchema(maxChars).optional();
export const nullableTrimmedStringSchema = trimmedStringSchema.nullable();
export const nullableDateTimeStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.dateTimeChars)
  .nullable();
export const optionalDateTimeStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.dateTimeChars)
  .optional();
export const idStringSchema = nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars);
export const optionalIdStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.idChars)
  .optional();
export const symbolStringSchema = nonEmptyTrimmedStringSchema
  .max(INPUT_LIMITS.symbolChars);
export const optionalSymbolStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.symbolChars)
  .optional();
export const optionalNameStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.generalNameChars)
  .optional();
// Pool display names flow through read models and client echoes at the full
// source-name width (data sources and system seed datasets may exceed 20
// characters), while values persisted into the training tables are truncated
// to samplePoolNameChars by their write paths. These schemas therefore only
// bound the echo/read-model side.
export const samplePoolNameStringSchema = nonEmptyTrimmedStringSchema
  .max(INPUT_LIMITS.generalNameChars);
export const optionalSamplePoolNameStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.generalNameChars)
  .optional();
export const tradingPresetNameStringSchema = nonEmptyTrimmedStringSchema
  .max(INPUT_LIMITS.tradingPresetNameChars);
export const specialTrainingBankNameStringSchema = nonEmptyTrimmedStringSchema
  .max(INPUT_LIMITS.specialTrainingBankNameChars);
export const pathStringSchema = nonWhitespaceStringSchema(INPUT_LIMITS.pathChars);
export const preservedPathStringSchema = preservedStringSchema(INPUT_LIMITS.pathChars);
export const optionalPathStringSchema = optionalPreservedStringSchema(
  INPUT_LIMITS.pathChars,
);
export const relativePathStringSchema = nonWhitespaceStringSchema(
  INPUT_LIMITS.relativePathChars,
);
export const preservedRelativePathStringSchema = preservedStringSchema(
  INPUT_LIMITS.relativePathChars,
);
export const optionalRelativePathStringSchema = optionalPreservedStringSchema(
  INPUT_LIMITS.relativePathChars,
);
export const tokenStringSchema = nonEmptyTrimmedStringSchema
  .max(INPUT_LIMITS.tokenChars);
export const optionalTokenStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.tokenChars)
  .optional();
export const optionalCursorStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.cursorChars)
  .nullable()
  .optional();
export const optionalLocaleStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.localeChars)
  .optional();
export const csvHeaderStringSchema = nonEmptyTrimmedStringSchema
  .max(INPUT_LIMITS.csvHeaderChars);
export const optionalCsvHeaderStringSchema = trimmedStringSchema
  .max(INPUT_LIMITS.csvHeaderChars)
  .optional();
export const orderInputValueSchema = z.union([
  trimmedStringSchema.max(INPUT_LIMITS.orderInputChars),
  z.number().finite(),
]);
export const finiteNumberSchema = z.number().finite();
export const nullableFiniteNumberSchema = finiteNumberSchema.nullable();
export const nonNegativeNumberSchema = finiteNumberSchema.nonnegative();
export const nonNegativeIntSchema = z.number().int().nonnegative();
export const positiveNumberSchema = finiteNumberSchema.positive();
export const positiveIntSchema = z.number().int().positive();
export const jsonRecordSchema = z.record(z.string(), z.unknown());
export const nullableJsonRecordSchema = jsonRecordSchema.nullable();

const jsonSerializedBytes = (value: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

export const boundedJsonRecordSchema = (maxBytes: number) =>
  z
    .record(z.string().trim().max(INPUT_LIMITS.recordKeyChars), z.unknown())
    .superRefine((value, context) => {
      if (jsonSerializedBytes(value) > maxBytes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PAYLOAD_TOO_LARGE",
        });
      }
    });

export const baseTimeframeSchema = z.enum(["1m", "5m", "1h", "1d"]);
export const freeReplayAdvancePeriodSchema = z.enum([
  "1m",
  "5m",
  "1h",
  "1d",
  "1w",
  "1month",
  "1year",
]);
export const displayPeriodSchema = z.enum([
  "1m",
  "5m",
  "1h",
  "1d",
  "1w",
  "1month",
  "1year",
]);
export const assetClassSchema = z.enum(["STOCK", "FUTURES", "FOREX", "CRYPTO"]);
