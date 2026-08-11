// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import {
  DESKTOP_API_LIMITS,
  INPUT_ARRAY_LIMITS,
  INPUT_SERIALIZED_LIMITS,
} from "../input-limits.js";
import {
  assetClassSchema,
  baseTimeframeSchema,
  boundedJsonRecordSchema,
  displayPeriodSchema,
  freeReplayAdvancePeriodSchema,
  idStringSchema,
  optionalCursorStringSchema,
  optionalIdStringSchema,
  optionalSamplePoolNameStringSchema,
  optionalSymbolStringSchema,
  orderInputValueSchema,
  positiveIntSchema,
} from "./api-primitives.js";
import { freeReplayCandidateSchema } from "./free-replay.js";
import { desktopFreeReplayPoolDefaultEnvironmentSchema } from "./local-data.js";
import {
  orderInputModeSchema,
  priceModeSchema,
  sideSchema,
} from "./market-session.js";
import { desktopTradingSettingsSchema } from "./trading-settings.js";

const sessionBaseRequestSchema = z
  .object({
    instrumentId: idStringSchema,
    symbol: optionalSymbolStringSchema,
    timeframe: baseTimeframeSchema.default("1d"),
    minimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
    forceNew: z.boolean().optional(),
    anchorIndex: z.coerce.number().int().min(0).optional(),
    samplePoolId: optionalIdStringSchema,
    sessionTradingSettings: boundedJsonRecordSchema(
      INPUT_SERIALIZED_LIMITS.trainingSessionTradingSettingsBytes,
    ).optional(),
  })
  .strict();

export const desktopSessionCreateRequestSchema = sessionBaseRequestSchema;
export const desktopSessionBootstrapRequestSchema = sessionBaseRequestSchema.extend({
  backwardBars: z.coerce.number().int().min(0).optional(),
  forwardBars: z.coerce.number().int().min(0).optional(),
});
export const desktopSessionTradingSettingsUpdateRequestSchema =
  desktopTradingSettingsSchema;

export const desktopSessionActionRequestSchema = z.union([
  z.object({
    action: z.literal("STEP"),
    displayPeriod: displayPeriodSchema,
    fillCursor: optionalCursorStringSchema,
  }).strict(),
  z.object({
    action: z.literal("PLAYBACK_TICK"),
    displayPeriod: displayPeriodSchema,
    fillCursor: optionalCursorStringSchema,
  }).strict(),
  z.object({
    action: z.literal("BUY"),
    inputMode: orderInputModeSchema,
    lotInput: orderInputValueSchema.optional(),
    amountInput: orderInputValueSchema.optional(),
    ratioInput: orderInputValueSchema.optional(),
    priceMode: priceModeSchema,
    displayPeriod: displayPeriodSchema,
    fillCursor: optionalCursorStringSchema,
  }).strict(),
  z.object({
    action: z.literal("SELL"),
    inputMode: orderInputModeSchema,
    lotInput: orderInputValueSchema.optional(),
    amountInput: orderInputValueSchema.optional(),
    ratioInput: orderInputValueSchema.optional(),
    priceMode: priceModeSchema,
    displayPeriod: displayPeriodSchema,
    fillCursor: optionalCursorStringSchema,
  }).strict(),
  z.object({
    action: z.literal("UNDO"),
    displayPeriod: displayPeriodSchema,
    fillCursor: optionalCursorStringSchema,
  }).strict(),
]);

export const desktopSessionOrderQuoteRequestSchema = z.object({
  side: sideSchema,
  inputMode: orderInputModeSchema,
  lotInput: orderInputValueSchema.optional(),
  amountInput: orderInputValueSchema.optional(),
  ratioInput: orderInputValueSchema.optional(),
  priceMode: priceModeSchema,
  displayPeriod: displayPeriodSchema,
}).strict();

export const desktopPreparedFreeReplayStartRequestSchema = z.object({
  mode: z.enum(["RANDOM", "FOCUSED"]),
  selectedPoolId: optionalIdStringSchema,
  selectedPoolName: optionalSamplePoolNameStringSchema,
  selectedInstrumentId: optionalIdStringSchema,
  selectedSymbol: optionalSymbolStringSchema,
  selectedAnchorIndex: z.coerce.number().int().min(0).optional(),
  minimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
  tradingEnvironment: desktopFreeReplayPoolDefaultEnvironmentSchema,
}).strict();

export const desktopFreeReplayPrepReadModelRequestSchema = z
  .object({
    mode: z.enum(["RANDOM", "FOCUSED"]).optional(),
    selectedPoolId: optionalIdStringSchema,
    selectedInstrumentId: optionalIdStringSchema,
    selectedSymbol: optionalSymbolStringSchema,
    selectedAnchorIndex: z.coerce.number().int().min(0).optional(),
    minimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
    minimumBaseTimeframeTouched: z.boolean().optional(),
    hideSymbolName: z.boolean().optional(),
    preferredAssetClass: assetClassSchema.optional(),
    preferredBaseTimeframe: baseTimeframeSchema.optional(),
    activeSessionMinimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
    hasActiveSession: z.boolean().optional(),
    environmentSelection: desktopFreeReplayPoolDefaultEnvironmentSchema
      .partial()
      .nullable()
      .optional(),
    environmentTouched: z.boolean().optional(),
  })
  .strict();

export const desktopFreeReplayStartReadinessRequestSchema = z
  .object({
    mode: z.enum(["RANDOM", "FOCUSED"]),
    selectedPoolId: optionalIdStringSchema,
    selectedInstrumentId: optionalIdStringSchema,
    selectedSymbol: optionalSymbolStringSchema,
    selectedAnchorIndex: z.coerce.number().int().min(0).optional(),
    minimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
    candidates: z
      .array(freeReplayCandidateSchema)
      .max(INPUT_ARRAY_LIMITS.candidateItems),
  })
  .strict();

export const desktopFreeReplayStartPointOverviewRequestSchema = z.object({
  instrumentId: idStringSchema,
  samplePoolId: optionalIdStringSchema,
  minimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: positiveIntSchema
    .max(DESKTOP_API_LIMITS.startPointOverviewBarsMax)
    .optional(),
  rawStartIndex: z.coerce.number().int().min(0).optional(),
  rawEndIndex: z.coerce.number().int().min(0).optional(),
  displayPeriod: displayPeriodSchema.optional(),
});
