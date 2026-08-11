// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { INPUT_ARRAY_LIMITS, INPUT_LIMITS } from '@zinuto/shared/input-limits';
import {
  desktopSpecialTrainingChallengeActivityRequestSchema,
  desktopSpecialTrainingBankEditorReadModelRequestSchema,
  desktopSpecialTrainingQuestionBankDraftPreviewRequestSchema,
  desktopSpecialTrainingQuestionBankPreviewRequestSchema,
  desktopSpecialTrainingQuestionBankResetRequestSchema,
} from '@zinuto/shared/contracts-desktop/api';
import {
  SPECIAL_TRAINING_MODE_IDS,
  isSpecialTrainingDecisionSecondsAllowed,
  isSpecialTrainingHorizonBarsAllowed,
  isSpecialTrainingQuestionCountAllowed,
  supportsSpecialTrainingFastDecisionStrictness,
  type SpecialTrainingModeId
} from '@zinuto/shared/specialTrainingModes';
import {
  baseTimeframeSchema,
  cursorSchema,
  dateTimeTextSchema,
  idSchema,
  optionalIdSchema,
  optionalSymbolSchema,
  orderInputModeSchema,
  priceModeSchema,
  queryBooleanSchema,
  searchQuerySchema,
  sideSchema,
  specialTrainingBankNameSchema,
} from './common.js';

const specialTrainingModeIdSchema = z.enum(SPECIAL_TRAINING_MODE_IDS);
const specialTrainingFastDecisionStrictnessSchema = z.enum(['LENIENT', 'STANDARD', 'STRICT']);
const specialTrainingOperatorModeSchema = z.literal("HUMAN");
const specialTrainingOrderInputModeSchema = orderInputModeSchema;
const specialTrainingOrderPriceModeSchema = priceModeSchema;
const specialTrainingOrderInputValueSchema = z.union([
  z.string().trim().max(INPUT_LIMITS.orderInputChars),
  z.coerce.number().finite(),
]).nullable().optional();

const specialTrainingFastDecisionSchema = z.object({
  selection: z.enum(['LONG', 'SHORT', 'OBSERVE']),
  decisionSecondsUsed: z.coerce.number().finite().min(0).max(120),
  timedOut: z.boolean().optional().default(false)
});

export const specialTrainingChallengeActivitySchema =
  desktopSpecialTrainingChallengeActivityRequestSchema;

const specialTrainingTradeActionSchema = z.object({
  type: sideSchema,
  barIndex: z.coerce.number().int().min(0),
  inputMode: specialTrainingOrderInputModeSchema,
  priceMode: specialTrainingOrderPriceModeSchema,
  lotInput: specialTrainingOrderInputValueSchema,
  amountInput: specialTrainingOrderInputValueSchema,
  ratioInput: specialTrainingOrderInputValueSchema,
  quantity: z.coerce.number().finite().min(0),
  executionPrice: z.coerce.number().finite().min(0),
  cashEffect: z.coerce.number().finite().min(0),
});

export const specialTrainingChallengeActionSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'BUY_AND_ADVANCE', 'SELL_AND_ADVANCE', 'NEXT_BAR', 'UNDO']),
  inputMode: specialTrainingOrderInputModeSchema.optional(),
  lotInput: specialTrainingOrderInputValueSchema,
  amountInput: specialTrainingOrderInputValueSchema,
  ratioInput: specialTrainingOrderInputValueSchema,
  priceMode: specialTrainingOrderPriceModeSchema.optional(),
  nextOpenDelayBars: z.coerce.number().int().min(1).max(5).optional(),
});

export const specialTrainingChallengeOrderQuoteSchema = z.object({
  side: sideSchema,
  inputMode: specialTrainingOrderInputModeSchema,
  lotInput: specialTrainingOrderInputValueSchema,
  amountInput: specialTrainingOrderInputValueSchema,
  ratioInput: specialTrainingOrderInputValueSchema,
  priceMode: specialTrainingOrderPriceModeSchema,
  nextOpenDelayBars: z.coerce.number().int().min(1).max(5).optional(),
});

export const specialTrainingDecisionSchema = z.object({
  selection: z.enum(['LONG', 'SHORT', 'OBSERVE']),
  decisionSecondsUsed: z.coerce.number().finite().min(0).max(120).optional(),
  timedOut: z.boolean().optional(),
});

const specialTrainingTimeframeSchema = baseTimeframeSchema;
const specialTrainingBankAssetClassSchema = z.enum([
  "STOCK",
  "FUTURES",
  "FOREX",
  "CRYPTO",
]);
export const specialTrainingChallengeStartSchema = z
  .object({
    bankId: idSchema,
    modeId: specialTrainingModeIdSchema,
    questionCount: z.coerce.number().int().default(5),
    horizonBars: z.coerce.number().int().optional(),
    maxOperations: z.coerce.number().int().optional(),
    decisionSecondsLimit: z.coerce.number().int().optional(),
    fastDecisionStrictnessLevel: specialTrainingFastDecisionStrictnessSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isSpecialTrainingQuestionCountAllowed(value.questionCount)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPECIAL_TRAINING_QUESTION_COUNT_INVALID',
        path: ['questionCount']
      });
    }
    if (value.horizonBars !== undefined && !isSpecialTrainingHorizonBarsAllowed(value.modeId, value.horizonBars)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPECIAL_TRAINING_HORIZON_INVALID',
        path: ['horizonBars']
      });
    }
    if (value.decisionSecondsLimit !== undefined && !isSpecialTrainingDecisionSecondsAllowed(value.modeId, value.decisionSecondsLimit)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPECIAL_TRAINING_DECISION_SECONDS_INVALID',
        path: ['decisionSecondsLimit']
      });
    }
    if (supportsSpecialTrainingFastDecisionStrictness(value.modeId)) {
      if (value.maxOperations !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SPECIAL_TRAINING_MAX_OPERATIONS_INVALID',
          path: ['maxOperations']
        });
      }
      return;
    }
    if (value.fastDecisionStrictnessLevel !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPECIAL_TRAINING_FAST_DECISION_STRICTNESS_INVALID',
        path: ['fastDecisionStrictnessLevel']
      });
    }
    if (value.decisionSecondsLimit !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPECIAL_TRAINING_DECISION_SECONDS_INVALID',
        path: ['decisionSecondsLimit']
      });
    }
  });

const specialTrainingQuestionBankScopeSchema = z.object({
  bankId: idSchema,
  modeId: specialTrainingModeIdSchema,
  horizonBars: z.coerce.number().int().optional()
});

export const specialTrainingBankCreateSchema = z.object({
  name: specialTrainingBankNameSchema,
  assetClass: specialTrainingBankAssetClassSchema,
  targetTimeframe: specialTrainingTimeframeSchema,
  poolIds: z.array(idSchema).min(1).max(INPUT_ARRAY_LIMITS.poolIds),
});

export const specialTrainingBankUpdateSchema = specialTrainingBankCreateSchema;

export const specialTrainingBankListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: cursorSchema,
  keyword: searchQuerySchema,
});

const appendQuestionBankScopeRules = <
  T extends z.ZodType<{
    modeId: SpecialTrainingModeId;
    horizonBars?: number;
  }>
>(
  schema: T
) =>
  schema.superRefine((value, context) => {
    if (
      value.horizonBars !== undefined &&
      !isSpecialTrainingHorizonBarsAllowed(value.modeId, value.horizonBars)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SPECIAL_TRAINING_HORIZON_INVALID',
        path: ['horizonBars']
      });
    }
  });

export const specialTrainingQuestionBankDraftPreviewSchema =
  desktopSpecialTrainingQuestionBankDraftPreviewRequestSchema;

export const specialTrainingBankEditorReadModelSchema =
  desktopSpecialTrainingBankEditorReadModelRequestSchema;

export const specialTrainingQuestionBankPreviewSchema =
  desktopSpecialTrainingQuestionBankPreviewRequestSchema;

export const specialTrainingQuestionBankBuildSchema = appendQuestionBankScopeRules(
  specialTrainingQuestionBankScopeSchema.extend({
    targetQuestionCount: z.coerce.number().int().min(1).max(1000).optional()
  })
);

export const specialTrainingQuestionBankResetSchema =
  desktopSpecialTrainingQuestionBankResetRequestSchema;

export const specialTrainingQuestionSettleSchema = z.object({
  abandoned: z.boolean().optional().default(false),
  cursorIndex: z.coerce.number().int().min(0).optional(),
  fastDecision: specialTrainingFastDecisionSchema.optional(),
  tradeActions: z.array(specialTrainingTradeActionSchema).max(INPUT_ARRAY_LIMITS.tradeActions).optional().default([])
});

export const specialTrainingHistoryQuerySchema = z.object({
  modeId: specialTrainingModeIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const specialTrainingDurationEstimateSchema = z
  .object({
    modeId: specialTrainingModeIdSchema,
    operatorMode: specialTrainingOperatorModeSchema.default("HUMAN"),
    questionCount: z.coerce.number().int().default(5),
    horizonBars: z.coerce.number().int(),
    decisionSecondsLimit: z.coerce.number().int().optional(),
  })
  .superRefine((value, context) => {
    if (!isSpecialTrainingQuestionCountAllowed(value.questionCount)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_QUESTION_COUNT_INVALID",
        path: ["questionCount"],
      });
    }
    if (!isSpecialTrainingHorizonBarsAllowed(value.modeId, value.horizonBars)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_HORIZON_INVALID",
        path: ["horizonBars"],
      });
    }
    if (
      value.decisionSecondsLimit !== undefined &&
      !isSpecialTrainingDecisionSecondsAllowed(
        value.modeId,
        value.decisionSecondsLimit,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_DECISION_SECONDS_INVALID",
        path: ["decisionSecondsLimit"],
      });
    }
  });

export const specialTrainingHistoryClearSchema = z.object({
  modeId: specialTrainingModeIdSchema.optional(),
});

export const specialTrainingStatsQuerySchema = z.object({
  modeId: specialTrainingModeIdSchema,
  from: dateTimeTextSchema,
  to: dateTimeTextSchema,
  symbol: optionalSymbolSchema,
  timeframe: z.enum(['1m', '5m', '1h', '1d', '__all__']).optional(),
  profitability: z.enum(['ALL', 'PROFIT', 'LOSS']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  detailId: optionalIdSchema,
  includeProjectDetails: queryBooleanSchema.optional(),
});
