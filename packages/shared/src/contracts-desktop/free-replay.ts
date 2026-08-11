// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import {
  DESKTOP_API_LIMITS,
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
} from "../input-limits.js";
import {
  assetClassSchema,
  baseTimeframeSchema,
  displayPeriodSchema,
  freeReplayAdvancePeriodSchema,
  idStringSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntSchema,
  nullableTrimmedStringSchema,
  positiveIntSchema,
  samplePoolNameStringSchema,
  symbolStringSchema,
  tradingPresetNameStringSchema,
  trimmedStringSchema,
} from "./api-primitives.js";
import {
  desktopBarSchema,
  desktopSessionBootstrapSchema,
} from "./market-session.js";

export const freeReplayCandidateSchema = z.object({
  instrumentId: idStringSchema,
  symbol: symbolStringSchema,
  poolId: idStringSchema,
  poolName: samplePoolNameStringSchema,
  sourceTimeframe: baseTimeframeSchema,
});

const freeReplayStartReadinessReasonCodeSchema = z.enum([
  "NO_SAMPLES",
  "NO_SYMBOL",
  "NO_ANCHOR",
]);

export const desktopFreeReplayStartReadinessSchema = z
  .object({
    enabled: z.boolean(),
    reasonCode: freeReplayStartReadinessReasonCodeSchema.nullable(),
    facts: z
      .object({
        mode: z.enum(["RANDOM", "FOCUSED"]),
        candidateCount: nonNegativeIntSchema,
        scopedCandidateCount: nonNegativeIntSchema,
        selectedPoolId: nullableTrimmedStringSchema,
        selectedInstrumentId: nullableTrimmedStringSchema,
        selectedSymbol: nullableTrimmedStringSchema,
        selectedAnchorIndex: nonNegativeIntSchema.nullable(),
        requiresSymbol: z.boolean(),
        requiresAnchor: z.boolean(),
        hasExplicitAnchor: z.boolean(),
        normalizedSelectedSymbol: trimmedStringSchema
          .max(INPUT_LIMITS.symbolChars),
      })
      .strict(),
    readiness: z
      .object({
        canStart: z.boolean(),
        reason: freeReplayStartReadinessReasonCodeSchema.nullable(),
        requiresSymbol: z.boolean(),
        requiresAnchor: z.boolean(),
        hasExplicitAnchor: z.boolean(),
        normalizedSelectedSymbol: trimmedStringSchema
          .max(INPUT_LIMITS.symbolChars),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled !== value.readiness.canStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FREE_REPLAY_START_READINESS_ENABLED_MISMATCH",
        path: ["enabled"],
      });
    }
    if (value.reasonCode !== value.readiness.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FREE_REPLAY_START_READINESS_REASON_MISMATCH",
        path: ["reasonCode"],
      });
    }
  });

const desktopFreeReplayPrepInstrumentSchema = z
  .object({
    instrumentId: idStringSchema,
    samplePoolId: idStringSchema,
    symbol: symbolStringSchema,
    label: nonEmptyTrimmedStringSchema,
    sourceTimeframe: baseTimeframeSchema,
    barCount: nonNegativeIntSchema,
    locked: z.boolean(),
    lockReason: nullableTrimmedStringSchema,
  })
  .strict();

const desktopFreeReplayPrepPoolSchema = z
  .object({
    id: idStringSchema,
    name: samplePoolNameStringSchema,
    assetClass: assetClassSchema,
    marketPresetId: tradingPresetNameStringSchema,
    sourceBaseTimeframe: baseTimeframeSchema,
    baseTimeframe: baseTimeframeSchema,
    minimumBaseTimeframeOptions: z
      .array(freeReplayAdvancePeriodSchema)
      .max(INPUT_ARRAY_LIMITS.enabledSamplePools),
    disabled: z.boolean(),
    sourceLocked: z.boolean(),
    lockReason: nullableTrimmedStringSchema,
    symbolCount: nonNegativeIntSchema,
    trainableSymbolCount: nonNegativeIntSchema,
    instruments: z
      .array(desktopFreeReplayPrepInstrumentSchema)
      .max(INPUT_ARRAY_LIMITS.symbols),
    symbols: z.array(symbolStringSchema).max(INPUT_ARRAY_LIMITS.symbols),
  })
  .strict();

const desktopFreeReplayPrepCandidateSchema = freeReplayCandidateSchema;

const desktopFreeReplayPrepOptionSchema = z
  .object({
    value: nonEmptyTrimmedStringSchema,
    disabled: z.boolean(),
  })
  .strict();

const desktopFreeReplayEnvironmentRuleCardSchema = z
  .object({
    id: z.enum([
      "settlement",
      "direction",
      "longPermission",
      "minTradeStep",
      "commissionRate",
      "commissionMinimumFee",
      "platformFeeRate",
      "platformFeeMinimumFee",
      "transactionLevyRate",
      "transactionLevyMinimumFee",
      "transferFeeRate",
      "regulatoryFeeRate",
      "stampDutyRate",
      "stampDutyMode",
      "makerFeeRate",
      "takerFeeRate",
      "fundingRate",
      "slippageRate",
      "contractMultiplier",
      "longInitialMargin",
      "longMaintenanceMargin",
      "longFinancing",
      "shortInitialMargin",
      "shortMaintenanceMargin",
      "shortBorrow",
    ]),
    valueKind: z.enum([
      "TEXT",
      "TRADE_SETTLEMENT_MODE",
      "DIRECTION",
      "LONG_MARGIN_PERMISSION",
      "MIN_TRADE_STEP",
      "STAMP_DUTY_MODE",
    ]),
    value: nonEmptyTrimmedStringSchema.max(80),
  })
  .strict();

export const desktopFreeReplayPrepReadModelSchema = z
  .object({
    statusCode: z.enum(["READY", "EMPTY"]),
    reasonCode: z.enum(["NO_POOLS"]).nullable(),
    prepConfig: z
      .object({
        mode: z.enum(["RANDOM", "FOCUSED"]),
        minimumBaseTimeframe: freeReplayAdvancePeriodSchema,
        baseTimeframe: freeReplayAdvancePeriodSchema,
        hideSymbolName: z.boolean(),
        assetClass: assetClassSchema,
      })
      .strict(),
    selection: z
      .object({
        selectedPoolId: trimmedStringSchema.max(INPUT_LIMITS.idChars),
        selectedInstrumentId: trimmedStringSchema.max(INPUT_LIMITS.idChars),
        selectedSymbol: trimmedStringSchema.max(INPUT_LIMITS.symbolChars),
        selectedSourceTimeframe: baseTimeframeSchema,
      })
      .strict(),
    facts: z
      .object({
        availablePoolCount: nonNegativeIntSchema,
        availableSymbolCount: nonNegativeIntSchema,
        trainableSymbolCount: nonNegativeIntSchema,
        candidateCount: nonNegativeIntSchema,
      })
      .strict(),
    pools: z
      .array(desktopFreeReplayPrepPoolSchema)
      .max(INPUT_ARRAY_LIMITS.enabledSamplePools),
    selectedPool: desktopFreeReplayPrepPoolSchema.nullable(),
    selectedInstrument: desktopFreeReplayPrepInstrumentSchema.nullable(),
    startCandidates: z
      .array(desktopFreeReplayPrepCandidateSchema)
      .max(INPUT_ARRAY_LIMITS.candidateItems),
    startReadiness: desktopFreeReplayStartReadinessSchema,
    actions: z
      .object({
        start: desktopFreeReplayStartReadinessSchema,
      })
      .strict(),
    environment: z
      .object({
        selected: z
          .object({
            assetClass: assetClassSchema,
            marketPresetId: tradingPresetNameStringSchema,
          })
          .strict(),
        ruleCards: z.array(desktopFreeReplayEnvironmentRuleCardSchema).max(40),
        assetOptions: z
          .array(desktopFreeReplayPrepOptionSchema)
          .max(INPUT_ARRAY_LIMITS.enabledSamplePools),
        presetOptions: z
          .array(desktopFreeReplayPrepOptionSchema)
          .max(INPUT_ARRAY_LIMITS.enabledSamplePools),
      })
      .strict(),
  })
  .strict();

export const desktopPreparedFreeReplayStartResultSchema = z.object({
  selected: freeReplayCandidateSchema.extend({
    anchorIndex: nonNegativeIntSchema.nullable(),
    instrumentId: nonEmptyTrimmedStringSchema,
  }),
  bootstrap: desktopSessionBootstrapSchema,
});

export const desktopFreeReplayStartPointOverviewRangeSchema = z
  .object({
    samplePoolId: nonEmptyTrimmedStringSchema,
    instrumentId: nonEmptyTrimmedStringSchema,
    symbol: nonEmptyTrimmedStringSchema,
    sourceTimeframe: baseTimeframeSchema,
    minimumBaseTimeframe: freeReplayAdvancePeriodSchema,
    effectiveTimeframe: freeReplayAdvancePeriodSchema,
    displayPeriod: displayPeriodSchema,
    timeZone: nullableTrimmedStringSchema.optional(),
    trainingTotal: nonNegativeIntSchema,
    total: nonNegativeIntSchema,
    offset: nonNegativeIntSchema,
    limit: positiveIntSchema
      .max(DESKTOP_API_LIMITS.startPointOverviewBarsMax),
    bars: z
      .array(
        desktopBarSchema.extend({
          startTs: nullableTrimmedStringSchema.optional(),
          endTs: nullableTrimmedStringSchema.optional(),
          startRawIndex: nonNegativeIntSchema,
          endRawIndex: nonNegativeIntSchema,
          startTrainingIndex: nonNegativeIntSchema,
          endTrainingIndex: nonNegativeIntSchema,
        }),
      )
      .max(DESKTOP_API_LIMITS.startPointOverviewBarsMax),
  })
  .superRefine((value, context) => {
    if (value.bars.length > value.limit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "START_POINT_OVERVIEW_LENGTH_EXCEEDS_LIMIT",
        path: ["bars"],
      });
    }
  });
