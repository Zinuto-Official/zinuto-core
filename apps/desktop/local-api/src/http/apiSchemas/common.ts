// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import {
  ORDER_INPUT_MODES,
  ORDER_SIDES,
  PRICE_MODES,
} from '@zinuto/shared/trading';
import { assertTradingCalendarConfig } from '@zinuto/shared/tradingCalendar';
import { isValidTimeZone } from '@zinuto/shared/timezone';

export const trimmedString = (maxChars: number) => z.string().trim().max(maxChars);
export const nonEmptyTrimmedString = (maxChars: number) => trimmedString(maxChars).min(1);
export const idSchema = nonEmptyTrimmedString(INPUT_LIMITS.idChars);
export const optionalIdSchema = trimmedString(INPUT_LIMITS.idChars).optional();
export const nullableIdSchema = trimmedString(INPUT_LIMITS.idChars).nullable().optional();
export const optionalNameSchema = trimmedString(INPUT_LIMITS.generalNameChars).optional();
export const samplePoolNameSchema = nonEmptyTrimmedString(INPUT_LIMITS.samplePoolNameChars);
export const optionalSamplePoolNameSchema = trimmedString(INPUT_LIMITS.samplePoolNameChars).optional();
export const tradingPresetNameSchema = nonEmptyTrimmedString(INPUT_LIMITS.tradingPresetNameChars);
export const specialTrainingBankNameSchema = nonEmptyTrimmedString(INPUT_LIMITS.specialTrainingBankNameChars);
export const trainingProjectNameSchema = nonEmptyTrimmedString(INPUT_LIMITS.trainingProjectNameChars);
export const symbolSchema = nonEmptyTrimmedString(INPUT_LIMITS.symbolChars);
export const optionalSymbolSchema = trimmedString(INPUT_LIMITS.symbolChars).optional();
export const cursorSchema = trimmedString(INPUT_LIMITS.cursorChars).optional();
export const searchQuerySchema = trimmedString(INPUT_LIMITS.searchQueryChars).optional();
export const dateTimeTextSchema = trimmedString(INPUT_LIMITS.dateTimeChars).optional();
export const pathSchema = nonEmptyTrimmedString(INPUT_LIMITS.pathChars);
export const optionalPathSchema = trimmedString(INPUT_LIMITS.pathChars).optional();
export const optionalBookmarkSchema = trimmedString(INPUT_LIMITS.bookmarkChars).optional();
export const csvHeaderSchema = nonEmptyTrimmedString(INPUT_LIMITS.csvHeaderChars);
export const optionalCsvHeaderSchema = trimmedString(INPUT_LIMITS.csvHeaderChars).optional();
export const tokenSchema = nonEmptyTrimmedString(INPUT_LIMITS.tokenChars);
export const optionalSourceFolderSchema = optionalPathSchema;
export const orderInputSchema = z.union([
  trimmedString(INPUT_LIMITS.orderInputChars),
  z.number().finite(),
]);

const jsonSerializedBytes = (value: unknown): number => {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

export const boundedRecordSchema = (maxBytes: number) =>
  z
    .record(trimmedString(INPUT_LIMITS.recordKeyChars), z.unknown())
    .superRefine((value, context) => {
      if (jsonSerializedBytes(value) > maxBytes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PAYLOAD_TOO_LARGE',
        });
      }
    });

export const boundedUnknownSchema = (maxBytes: number) =>
  z.unknown().superRefine((value, context) => {
    if (jsonSerializedBytes(value) > maxBytes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PAYLOAD_TOO_LARGE',
      });
    }
  });

export const boundedUnknownArraySchema = (maxItems: number, maxItemBytes: number, maxTotalBytes: number) =>
  z
    .array(boundedUnknownSchema(maxItemBytes))
    .max(maxItems)
    .superRefine((value, context) => {
      if (jsonSerializedBytes(value) > maxTotalBytes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PAYLOAD_TOO_LARGE',
        });
      }
    });

export const baseTimeframeSchema = z.enum(['1m', '5m', '1h', '1d']);
export const freeReplayAdvancePeriodSchema = z.enum([
  '1m',
  '5m',
  '1h',
  '1d',
  '1w',
  '1month',
  '1year',
]);
export const displayPeriodSchema = z.enum([
  '1m',
  '5m',
  '1h',
  '1d',
  '1w',
  '1month',
  '1year',
]);
export const sideSchema = z.enum(ORDER_SIDES);
export const orderInputModeSchema = z.enum(ORDER_INPUT_MODES);
export const priceModeSchema = z.enum(PRICE_MODES);
export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isValidTimeZone(value), {
    message: 'TIME_ZONE_INVALID'
  });

const tradingSessionRangeSchema = z.object({
  startMinute: z.coerce.number().int().min(0).max(1439),
  endMinute: z.coerce.number().int().min(0).max(1440),
  crossesMidnight: z.boolean()
}).strict();

export const tradingCalendarConfigSchema = z.object({
  tradingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1).max(7),
  sessions: z.array(tradingSessionRangeSchema).min(1).max(12)
}).strict().transform((value, context) => {
  try {
    return assertTradingCalendarConfig(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'TRADING_CALENDAR_INVALID'
    });
    return z.NEVER;
  }
});

export const queryBooleanSchema = z
  .union([z.boolean(), z.string().trim().max(INPUT_LIMITS.shortCodeChars).toLowerCase()])
  .transform((value, context) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true' || value === '1' || value === 'yes' || value === 'on') {
      return true;
    }
    if (value === 'false' || value === '0' || value === 'no' || value === 'off') {
      return false;
    }
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'INVALID_PARAMS'
    });
    return z.NEVER;
  });
