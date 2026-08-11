// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import {
  DESKTOP_API_LIMITS,
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
  INPUT_SERIALIZED_LIMITS,
} from '@zinuto/shared/input-limits';
import {
  desktopPreparedFreeReplayStartRequestSchema,
  desktopFreeReplayStartReadinessRequestSchema,
} from '@zinuto/shared/contracts-desktop/api';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import {
  baseTimeframeSchema,
  boundedRecordSchema,
  boundedUnknownArraySchema,
  boundedUnknownSchema,
  cursorSchema,
  displayPeriodSchema,
  freeReplayAdvancePeriodSchema,
  idSchema,
  optionalIdSchema,
  optionalSymbolSchema,
  orderInputModeSchema,
  orderInputSchema,
  priceModeSchema,
  samplePoolNameSchema,
  searchQuerySchema,
  sideSchema,
  symbolSchema,
  dateTimeTextSchema,
  trainingProjectNameSchema,
  tradingPresetNameSchema,
  trimmedString,
} from './common.js';

export const sessionSchema = z.object({
  instrumentId: idSchema,
  symbol: optionalSymbolSchema,
  timeframe: baseTimeframeSchema.default('1d'),
  minimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
  forceNew: z.boolean().optional(),
  anchorIndex: z.coerce.number().int().min(0).optional(),
  samplePoolId: optionalIdSchema,
  sessionTradingSettings: boundedRecordSchema(INPUT_SERIALIZED_LIMITS.trainingSessionTradingSettingsBytes).optional()
}).strict();

const bootstrapWindowSchema = z.object({
  backwardBars: z.coerce.number().int().min(0).max(runtimeLimits.barsRangeLimitMax).optional(),
  forwardBars: z.coerce.number().int().min(0).max(runtimeLimits.barsRangeLimitMax).optional()
});

export const sessionBootstrapSchema = sessionSchema.merge(bootstrapWindowSchema);
export const sessionBootstrapQuerySchema = bootstrapWindowSchema;

export const sessionActionSchema = z.union([
  z.object({
    action: z.literal('STEP'),
    displayPeriod: displayPeriodSchema,
    fillCursor: cursorSchema.nullable(),
  }).strict(),
  z.object({
    action: z.literal('PLAYBACK_TICK'),
    displayPeriod: displayPeriodSchema,
    fillCursor: cursorSchema.nullable(),
  }).strict(),
  z.object({
    action: z.literal('BUY'),
    inputMode: orderInputModeSchema,
    lotInput: orderInputSchema.optional(),
    amountInput: orderInputSchema.optional(),
    ratioInput: orderInputSchema.optional(),
    priceMode: priceModeSchema,
    displayPeriod: displayPeriodSchema,
    fillCursor: cursorSchema.nullable(),
  }).strict(),
  z.object({
    action: z.literal('SELL'),
    inputMode: orderInputModeSchema,
    lotInput: orderInputSchema.optional(),
    amountInput: orderInputSchema.optional(),
    ratioInput: orderInputSchema.optional(),
    priceMode: priceModeSchema,
    displayPeriod: displayPeriodSchema,
    fillCursor: cursorSchema.nullable(),
  }).strict(),
  z.object({
    action: z.literal('UNDO'),
    displayPeriod: displayPeriodSchema,
    fillCursor: cursorSchema.nullable(),
  }).strict(),
]);

export const playbackSchema = z.object({
  intervalMs: z.coerce.number().int().min(100).max(120000),
  isPaused: z.boolean(),
  displayPeriod: displayPeriodSchema.optional(),
});

export const snapshotQuerySchema = z.object({
  fillCursor: cursorSchema.nullable()
});

export const instrumentListQuerySchema = z.object({
  query: searchQuerySchema,
  sourceId: optionalIdSchema,
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

export const barsRangeQuerySchema = z.object({
  instrumentId: optionalIdSchema,
  timeframe: baseTimeframeSchema.optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(DESKTOP_API_LIMITS.marketFrameBarsMax).optional()
});

export const barsFrameQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(DESKTOP_API_LIMITS.marketFrameBarsMax).optional(),
  displayPeriod: displayPeriodSchema.optional(),
  anchorRawIndex: z.coerce.number().int().min(0).optional(),
  anchorDisplayIndex: z.coerce.number().int().min(0).optional(),
  direction: z.enum(['FORWARD', 'BACKWARD']).optional(),
  before: z.coerce.number().int().min(0).max(DESKTOP_API_LIMITS.marketFrameBarsMax).optional(),
  after: z.coerce.number().int().min(0).max(DESKTOP_API_LIMITS.marketFrameBarsMax).optional(),
  maxDisplayBars: z.coerce.number().int().min(1).max(DESKTOP_API_LIMITS.marketFrameBarsMax).optional()
});

export const orderQuoteSchema = z.object({
  side: sideSchema,
  inputMode: orderInputModeSchema,
  lotInput: orderInputSchema.optional(),
  amountInput: orderInputSchema.optional(),
  ratioInput: orderInputSchema.optional(),
  priceMode: priceModeSchema,
  displayPeriod: displayPeriodSchema,
}).strict();

export const resetSymbolSchema = z.object({
  symbol: symbolSchema,
  timeframe: baseTimeframeSchema.optional(),
  finalizePriceMode: priceModeSchema.optional()
});

export const resetTrainingSchema = z.object({
  finalizePriceMode: priceModeSchema.optional()
});

export const cleanupStaleSessionsSchema = z.object({
  keepSessionId: optionalIdSchema
});

export const tradingSettingsSchema = z
  .object({
    initialSecuritiesBalance: z.coerce.number().int().positive(),
    assetClass: z.enum(['STOCK', 'FUTURES', 'FOREX', 'CRYPTO']),
    marketPresetId: tradingPresetNameSchema,
    minTradeStep: z.coerce.number().finite().gt(0),
    commissionRate: z.coerce.number().finite().min(0),
    makerFeeRate: z.coerce.number().finite().min(0),
    takerFeeRate: z.coerce.number().finite().min(0),
    fundingRate: z.coerce.number().finite(),
    contractMultiplier: z.coerce.number().finite().gt(0),
    transferFeeRate: z.coerce.number().finite().min(0),
    regulatoryFeeRate: z.coerce.number().finite().min(0),
    platformFeeRate: z.coerce.number().finite().min(0),
    transactionLevyRate: z.coerce.number().finite().min(0),
    slippageRate: z.coerce.number().finite().min(0),
    stampDutyRate: z.coerce.number().finite().min(0),
    commissionMinimumFee: z.coerce.number().finite().min(0),
    platformFeeMinimumFee: z.coerce.number().finite().min(0),
    transactionLevyMinimumFee: z.coerce.number().finite().min(0),
    longFinancingAnnualRate: z.coerce.number().finite().min(0),
    longInitialMarginRatio: z.coerce.number().finite().gt(0).max(1000),
    longMaintenanceMarginRatio: z.coerce.number().finite().gt(0).max(1000),
    shortBorrowAnnualRate: z.coerce.number().finite().min(0),
    shortInitialMarginRatio: z.coerce.number().finite().gt(0).max(1000),
    shortMaintenanceMarginRatio: z.coerce.number().finite().gt(0).max(1000),
    stampDutyMode: z.enum(['BUY', 'SELL', 'DOUBLE']),
    positionCostMode: z.enum(['DILUTED', 'AVERAGE_OPEN']),
    tradeSettlementMode: z.enum(['T0', 'T1']),
    freeReplayEndSettlementMode: z.enum(['FORCE_CLOSE', 'CURRENT_TOTAL_ASSET']),
    tradeAmountIncludesFees: z.boolean(),
    allowLongMarginTrading: z.boolean(),
    allowShortSelling: z.boolean()
  })
  .superRefine((value, context) => {
    if (value.longMaintenanceMarginRatio > value.longInitialMarginRatio) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MARGIN_RATIO_RELATION_INVALID',
        path: ['longMaintenanceMarginRatio']
      });
    }
    if (value.shortMaintenanceMarginRatio > value.shortInitialMarginRatio) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MARGIN_RATIO_RELATION_INVALID',
        path: ['shortMaintenanceMarginRatio']
      });
    }
  });

export const freeReplayPoolDefaultEnvironmentSchema = z.object({
  assetClass: z.enum(['STOCK', 'FUTURES', 'FOREX', 'CRYPTO']),
  marketPresetId: tradingPresetNameSchema,
});

export const freeReplayPrepReadModelSchema = z.object({
  mode: z.enum(['RANDOM', 'FOCUSED']).optional(),
  selectedPoolId: optionalIdSchema,
  selectedInstrumentId: optionalIdSchema,
  selectedSymbol: optionalSymbolSchema,
  selectedAnchorIndex: z.coerce.number().int().min(0).optional(),
  minimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
  minimumBaseTimeframeTouched: z.boolean().optional(),
  hideSymbolName: z.boolean().optional(),
  preferredAssetClass: z.enum(['STOCK', 'FUTURES', 'FOREX', 'CRYPTO']).optional(),
  preferredBaseTimeframe: baseTimeframeSchema.optional(),
  activeSessionMinimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
  hasActiveSession: z.boolean().optional(),
  environmentSelection: freeReplayPoolDefaultEnvironmentSchema.partial().nullable().optional(),
  environmentTouched: z.boolean().optional(),
}).strict();

export const preparedFreeReplayStartSchema =
  desktopPreparedFreeReplayStartRequestSchema;

export const freeReplayStartReadinessSchema =
  desktopFreeReplayStartReadinessRequestSchema;

export const freeReplayStartPointOverviewQuerySchema = z.object({
  instrumentId: idSchema, samplePoolId: optionalIdSchema, minimumBaseTimeframe: freeReplayAdvancePeriodSchema.optional(),
  offset: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(DESKTOP_API_LIMITS.startPointOverviewBarsMax).optional(),
  rawStartIndex: z.coerce.number().int().min(0).optional(), rawEndIndex: z.coerce.number().int().min(0).optional(),
  displayPeriod: displayPeriodSchema.optional(),
});

export const trainingProjectArchiveSessionSchema = z.object({
  sessionId: idSchema,
  name: trainingProjectNameSchema,
  samplePoolId: idSchema,
  samplePoolName: samplePoolNameSchema,
  displayPeriod: displayPeriodSchema,
  finalizePriceMode: priceModeSchema.optional(),
  drawings: boundedUnknownArraySchema(
    runtimeLimits.archiveDrawingCountMax,
    INPUT_SERIALIZED_LIMITS.trainingArchiveDrawingBytes,
    INPUT_SERIALIZED_LIMITS.trainingArchiveDrawingsBytes,
  ).optional(),
  chartIndicators: boundedUnknownSchema(INPUT_SERIALIZED_LIMITS.chartIndicatorsBytes).optional(),
});

export const trainingProjectSettlementPreviewSchema = z.object({
  sessionId: idSchema,
  displayPeriod: displayPeriodSchema,
  finalizePriceMode: priceModeSchema.optional(),
});

export const trainingProjectsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(runtimeLimits.trainingProjectsQueryLimitMax).optional(),
  cursor: cursorSchema
});

export const trainingStatsQuerySchema = z.object({
  from: dateTimeTextSchema,
  to: dateTimeTextSchema,
  samplePoolId: optionalIdSchema,
  symbol: optionalSymbolSchema,
  timeframe: trimmedString(INPUT_LIMITS.shortCodeChars).optional(),
  tag: searchQuerySchema,
  profitability: z.enum(['ALL', 'PROFIT', 'LOSS']).optional(),
  comparePoolA: optionalIdSchema,
  comparePoolB: optionalIdSchema,
});

export const trainingReviewDiagnosticsSchema = z.object({
  projectIds: z.array(idSchema).max(INPUT_ARRAY_LIMITS.projectIds).default([]),
  window: z
    .enum(['LAST_10', 'LAST_50', 'LAST_7D', 'LAST_30D', 'ALL'])
    .default('ALL'),
  anchorMs: z.coerce.number().int().positive().optional(),
  nowMs: z.coerce.number().int().positive().optional(),
});

export const trainingProjectRenameSchema = z.object({
  name: trainingProjectNameSchema
});

export const trainingProjectsDeleteSchema = z.object({
  ids: z.array(idSchema).max(INPUT_ARRAY_LIMITS.projectIds).optional()
});
