// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import {
  SPECIAL_TRAINING_MODE_IDS,
  isSpecialTrainingDecisionSecondsAllowed,
  isSpecialTrainingHorizonBarsAllowed,
  isSpecialTrainingQuestionCountAllowed,
  supportsSpecialTrainingFastDecisionStrictness,
  type SpecialTrainingModeId,
} from "../specialTrainingModes.js";
import {
  DESKTOP_API_LIMITS,
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
} from "../input-limits.js";
import {
  assetClassSchema,
  baseTimeframeSchema,
  finiteNumberSchema,
  idStringSchema,
  jsonRecordSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntSchema,
  nonNegativeNumberSchema,
  nullableFiniteNumberSchema,
  nullableJsonRecordSchema,
  nullableTrimmedStringSchema,
  positiveIntSchema,
  positiveNumberSchema,
  specialTrainingBankNameStringSchema,
  trimmedStringSchema,
} from "./api-primitives.js";
import {
  desktopBarSchema,
  optionalOrderInputValueSchema,
  orderInputModeSchema,
  priceModeSchema,
  sideSchema,
  specialTrainingOrderNextOpenDelayBarsSchema,
} from "./market-session.js";

const specialTrainingRiskActionBlockReasonCodeSchema = z.enum([
  "NO_ACTIVE_QUESTION",
  "NO_ACTIONABLE_BARS",
  "PRICE_UNAVAILABLE",
  "BUYING_POWER_EMPTY",
  "POSITION_EMPTY",
  "ENTRY_LIMIT_REACHED",
  "QUANTITY_ZERO",
  "UNDO_EMPTY",
]);

const specialTrainingRiskActionStatusSchema = z.object({
  allowed: z.boolean(),
  blockedReasonCode: specialTrainingRiskActionBlockReasonCodeSchema.nullable(),
  blockedReason: nullableTrimmedStringSchema,
});

const specialTrainingRiskUndoActionStatusSchema =
  specialTrainingRiskActionStatusSchema.extend({
    availableSteps: nonNegativeIntSchema,
    maxSteps: positiveIntSchema,
    lastUndoableAction: z
      .enum(["BUY_AND_ADVANCE", "SELL_AND_ADVANCE", "NEXT_BAR"])
      .nullable(),
  });

export const specialTrainingRiskActionStateSchema = z
  .object({
    buyAdvance: specialTrainingRiskActionStatusSchema,
    sellAdvance: specialTrainingRiskActionStatusSchema,
    nextBar: specialTrainingRiskActionStatusSchema,
    undo: specialTrainingRiskUndoActionStatusSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const entries: Array<
      [
        "buyAdvance" | "sellAdvance" | "nextBar" | "undo",
        z.infer<typeof specialTrainingRiskActionStatusSchema>,
      ]
    > = [
      ["buyAdvance", value.buyAdvance],
      ["sellAdvance", value.sellAdvance],
      ["nextBar", value.nextBar],
      ["undo", value.undo],
    ];
    for (const [key, action] of entries) {
      if (action.allowed && action.blockedReasonCode !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ACTION_STATE_ALLOWED_WITH_BLOCK_REASON",
          path: [key, "blockedReasonCode"],
        });
      }
      if (!action.allowed && action.blockedReasonCode === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ACTION_STATE_BLOCKED_WITHOUT_REASON",
          path: [key, "blockedReasonCode"],
        });
      }
    }
  });

export const desktopSpecialTrainingTradeActionSchema = z.object({
  type: sideSchema,
  barIndex: nonNegativeIntSchema,
  inputMode: orderInputModeSchema,
  priceMode: priceModeSchema,
  lotInput: optionalOrderInputValueSchema,
  amountInput: optionalOrderInputValueSchema,
  ratioInput: optionalOrderInputValueSchema,
  quantity: nonNegativeNumberSchema,
  executionPrice: nonNegativeNumberSchema,
  cashEffect: nonNegativeNumberSchema,
});

const desktopSpecialTrainingOrderEstimateSchema = z.object({
  side: sideSchema,
  price: nonNegativeNumberSchema,
  qty: nonNegativeNumberSchema,
  lots: nonNegativeNumberSchema,
  amount: nonNegativeNumberSchema,
  tradingCost: nonNegativeNumberSchema,
  cashEffect: nonNegativeNumberSchema,
  executionBreakdown: z.object({
    closeQty: nonNegativeNumberSchema,
    openQty: nonNegativeNumberSchema,
    closeDirection: z.enum(["LONG", "SHORT"]).nullable(),
    openDirection: z.enum(["LONG", "SHORT"]).nullable(),
  }),
});

export const desktopSpecialTrainingOrderQuoteSchema = z.object({
  side: sideSchema,
  priceMode: priceModeSchema,
  nextOpenDelayBars: positiveIntSchema,
  nextOpenAvailable: z.boolean(),
  blockedReasonCode: nullableTrimmedStringSchema,
  blockedReason: nullableTrimmedStringSchema,
  estimate: desktopSpecialTrainingOrderEstimateSchema,
  executionPlan: z
    .object({
      displayPeriod: nullableTrimmedStringSchema,
      fillRawIndex: nonNegativeIntSchema.nullable(),
      fillPrice: nullableFiniteNumberSchema,
      targetRawIndex: nonNegativeIntSchema.nullable(),
      nextOpenDisplayIndex: nonNegativeIntSchema.nullable(),
    })
    .optional(),
});

export const specialTrainingRiskRuntimeBaselineSchema = z.object({
  initialCapital: finiteNumberSchema,
  cashBalance: finiteNumberSchema,
  positionQty: finiteNumberSchema,
  entryPrice: finiteNumberSchema,
});

export const specialTrainingTradeRuntimeStateSchema = z.object({
  usedOperations: nonNegativeIntSchema,
  openCount: nonNegativeIntSchema,
  positionQty: finiteNumberSchema,
  entryPrice: finiteNumberSchema,
  cashBalance: finiteNumberSchema,
  equityPeakAsset: finiteNumberSchema,
  maxDrawdownRatio: finiteNumberSchema,
  initialCapital: finiteNumberSchema,
  challengeStartAsset: finiteNumberSchema,
});

export const specialTrainingRiskEstimateSchema = z.object({
  qty: nullableFiniteNumberSchema,
  cashEffect: nullableFiniteNumberSchema,
});

const specialTrainingModeIdSchema = z.enum(SPECIAL_TRAINING_MODE_IDS);
const specialTrainingFastDecisionStrictnessSchema = z.enum([
  "LENIENT",
  "STANDARD",
  "STRICT",
]);
const specialTrainingSelectionSchema = z.enum(["LONG", "SHORT", "OBSERVE"]);
const specialTrainingBankScopeBlockedReasonCodeSchema = z.enum([
  "POOL_SELECTION_REQUIRED",
  "POOL_REPAIR_REQUIRED",
  "SYMBOLS_REQUIRED",
  "TARGET_TIMEFRAME_INVALID",
]);
const specialTrainingBankScopeOnlyBlockedReasonCodeSchema = z.enum([
  "POOL_SELECTION_REQUIRED",
  "POOL_REPAIR_REQUIRED",
  "SYMBOLS_REQUIRED",
]);
const specialTrainingQuestionBankRuntimeStatusSchema = z.enum([
  "EMPTY",
  "READY_FRESH",
  "READY_IN_PROGRESS",
  "AUTO_SWITCHED",
]);
const specialTrainingQuestionBankNoticeKindSchema = z.enum([
  "AUTO_SWITCHED_RANGE",
  "AUTO_SWITCHED_REVISION",
  "ACTIVE_SESSION_STALE",
  "RESET_DONE",
]);
const specialTrainingQuestionBankPreviousSummarySchema = z
  .object({
    scopeHash: trimmedStringSchema.nullable().optional(),
    poolCount: nonNegativeIntSchema.nullable().optional(),
    instrumentCount: nonNegativeIntSchema.nullable().optional(),
    symbolCount: nonNegativeIntSchema.nullable().optional(),
    totalQuestionCount: nonNegativeIntSchema.nullable().optional(),
    completedQuestionCount: nonNegativeIntSchema.nullable().optional(),
  })
  .strict();
const specialTrainingQuestionBankActiveSessionSchema = z
  .object({
    hasLiveChallengeSession: z.boolean().nullable().optional(),
    modeId: specialTrainingModeIdSchema.nullable().optional(),
    scopeHash: trimmedStringSchema.nullable().optional(),
  })
  .strict();

export const desktopSpecialTrainingBankScopeSummarySchema = z.object({
  status: z.enum([
    "READY",
    "EMPTY",
    "REPAIR_REQUIRED",
    "TARGET_TIMEFRAME_INVALID",
  ]),
  poolCount: nonNegativeIntSchema,
  symbolCount: nonNegativeIntSchema,
  instrumentCount: nonNegativeIntSchema,
  sourceTimeframes: z.array(baseTimeframeSchema),
  definitionHash: nonEmptyTrimmedStringSchema,
  missingPoolIds: z.array(nonEmptyTrimmedStringSchema),
  maxSourceTimeframe: baseTimeframeSchema.nullable(),
  validation: z.object({
    scope: z.object({
      valid: z.boolean(),
      blockedReasonCode:
        specialTrainingBankScopeOnlyBlockedReasonCodeSchema.nullable(),
      blockedReason: nullableTrimmedStringSchema,
    }),
    targetTimeframe: z.object({
      valid: z.boolean(),
      blockedReasonCode: z.literal("TARGET_TIMEFRAME_INVALID").nullable(),
      blockedReason: nullableTrimmedStringSchema,
    }),
  }),
  readiness: z.object({
    canUse: z.boolean(),
    blockedReasonCode: specialTrainingBankScopeBlockedReasonCodeSchema.nullable(),
    blockedReason: nullableTrimmedStringSchema,
  }),
});

const specialTrainingBankEditorStepSchema = z.enum(["CONFIG", "PREVIEW"]);
const specialTrainingBankEditorReasonCodeSchema = z.enum([
  "NAME_REQUIRED",
  "POOL_SELECTION_REQUIRED",
  "POOL_REPAIR_REQUIRED",
  "SYMBOLS_REQUIRED",
  "TARGET_TIMEFRAME_INVALID",
]);
const specialTrainingBankEditorPoolReasonCodeSchema = z.enum([
  "TARGET_TIMEFRAME_TOO_LOW",
  "NO_SYMBOLS",
  "NO_INSTRUMENTS",
  "POOL_REPAIR_REQUIRED",
]);
const desktopSpecialTrainingBankEditorReadinessSchema = z
  .object({
    enabled: z.boolean(),
    reasonCode: specialTrainingBankEditorReasonCodeSchema.nullable(),
    facts: jsonRecordSchema,
  })
  .strict();
const desktopSpecialTrainingBankEditorValidationFactsSchema = z
  .object({
    name: desktopSpecialTrainingBankEditorReadinessSchema,
    pools: desktopSpecialTrainingBankEditorReadinessSchema,
    preview: desktopSpecialTrainingBankEditorReadinessSchema,
  })
  .strict();

export const desktopSpecialTrainingBankEditorReadModelSchema = z
  .object({
    enabled: z.boolean(),
    reasonCode: specialTrainingBankEditorReasonCodeSchema.nullable(),
    facts: z
      .object({
        step: specialTrainingBankEditorStepSchema,
        selectedPoolCount: nonNegativeIntSchema,
        missingPoolCount: nonNegativeIntSchema,
        enabledInstrumentCount: nonNegativeIntSchema,
        compatibleSelectedPoolIds: z.array(nonEmptyTrimmedStringSchema),
        autoRemovedPoolIds: z.array(nonEmptyTrimmedStringSchema),
        poolReadinessById: z.record(
          nonEmptyTrimmedStringSchema,
          z
            .object({
              disabled: z.boolean(),
              reasonCode:
                specialTrainingBankEditorPoolReasonCodeSchema.nullable(),
            })
            .strict(),
        ),
        validation: desktopSpecialTrainingBankEditorValidationFactsSchema,
        scopeSummary: desktopSpecialTrainingBankScopeSummarySchema.nullable(),
      })
      .strict(),
    readiness: z
      .object({
        config: desktopSpecialTrainingBankEditorReadinessSchema,
        preview: desktopSpecialTrainingBankEditorReadinessSchema,
        current: desktopSpecialTrainingBankEditorReadinessSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled !== value.readiness.current.enabled) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_BANK_EDITOR_ENABLED_MISMATCH",
        path: ["enabled"],
      });
    }
    if (value.reasonCode !== value.readiness.current.reasonCode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_BANK_EDITOR_REASON_MISMATCH",
        path: ["reasonCode"],
      });
    }
  });

export const desktopSpecialTrainingBankSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  name: nonEmptyTrimmedStringSchema,
  assetClass: assetClassSchema,
  targetTimeframe: baseTimeframeSchema,
  scope: z.object({
    poolIds: z.array(nonEmptyTrimmedStringSchema),
  }),
  scopeSummary: desktopSpecialTrainingBankScopeSummarySchema,
  simulationBatchId: nonEmptyTrimmedStringSchema.nullable().optional(),
  createdAt: nonEmptyTrimmedStringSchema,
  updatedAt: nonEmptyTrimmedStringSchema,
});

const desktopSpecialTrainingBankArraySchema = z.array(
  desktopSpecialTrainingBankSchema,
);

export const desktopSpecialTrainingBankListSchema = z.object({
  items: desktopSpecialTrainingBankArraySchema,
  nextCursor: nullableTrimmedStringSchema,
  total: nonNegativeIntSchema,
});

export const desktopSpecialTrainingBankDeleteResultSchema = z.object({
  bankId: nonEmptyTrimmedStringSchema,
  deleted: z.boolean(),
});

export const desktopSpecialTrainingDurationEstimateSchema = z.object({
  minMinutes: nonNegativeNumberSchema,
  maxMinutes: nonNegativeNumberSchema,
  basis: z.enum([
    "EXACT_HISTORY",
    "SIMILAR_HISTORY",
    "MODE_HISTORY",
    "FORMULA_FALLBACK",
  ]),
  sampleCount: nonNegativeIntSchema,
});

const specialTrainingQuestionMetadataSchema = z
  .object({
    id: nonEmptyTrimmedStringSchema,
    instrumentId: nonEmptyTrimmedStringSchema.optional(),
    samplePoolId: nonEmptyTrimmedStringSchema.optional(),
    barsVersionToken: trimmedStringSchema.optional(),
    symbol: nonEmptyTrimmedStringSchema,
    timeframe: baseTimeframeSchema.optional(),
    targetTimeframe: baseTimeframeSchema.optional(),
    effectiveTimeframe: baseTimeframeSchema.optional(),
    minimumBaseTimeframe: baseTimeframeSchema.optional(),
    sourceTimeframe: baseTimeframeSchema.optional(),
    sourceBarsPerEffectiveBar: positiveIntSchema.optional(),
    bars: z
      .array(desktopBarSchema)
      .max(DESKTOP_API_LIMITS.specialTrainingQuestionBarsMax),
    startIndex: nonNegativeIntSchema,
    endIndex: nonNegativeIntSchema,
    effectiveWindowBarCount: positiveIntSchema.optional(),
    sourceWindowBarCount: positiveIntSchema.optional(),
    minTradeStep: positiveNumberSchema,
    requestedMinimumBaseTimeframe: baseTimeframeSchema.nullable().optional(),
  })
  .strict();

export const desktopSpecialTrainingChallengeProgressSchema = z
  .object({
    challengeId: nonEmptyTrimmedStringSchema,
    modeId: specialTrainingModeIdSchema,
    questionCount: positiveIntSchema,
    settledCount: nonNegativeIntSchema,
    currentQuestionIndex: nonNegativeIntSchema.nullable(),
    currentQuestionId: nullableTrimmedStringSchema,
    currentQuestionSymbol: nullableTrimmedStringSchema,
    latestSettlementQuestionId: nullableTrimmedStringSchema,
    latestSettlement: z
      .object({
        questionId: nonEmptyTrimmedStringSchema,
        passed: z.boolean(),
        score: finiteNumberSchema,
        totalPnl: finiteNumberSchema,
        finalTotalAsset: finiteNumberSchema,
        maxDrawdownRatio: finiteNumberSchema,
        grade: nonEmptyTrimmedStringSchema,
        feedbackCodes: z.array(nonEmptyTrimmedStringSchema),
      })
      .passthrough()
      .nullable(),
    finishedSessionId: nullableTrimmedStringSchema,
    sessionSummary: jsonRecordSchema.nullable(),
  })
  .strict();

export const desktopSpecialTrainingFastDecisionTimerSchema = z
  .object({
    state: z.enum(["INACTIVE", "RUNNING", "PAUSED", "SETTLED"]),
    startedAt: nullableTrimmedStringSchema,
    deadlineAt: nullableTrimmedStringSchema,
    serverNow: nonEmptyTrimmedStringSchema,
    secondsLimit: nonNegativeIntSchema,
    elapsedSeconds: nonNegativeIntSchema,
    remainingSeconds: nonNegativeIntSchema,
    timedOut: z.boolean(),
  })
  .strict();

export const desktopSpecialTrainingChallengeRuntimeSchema = z
  .object({
    challengeId: nonEmptyTrimmedStringSchema,
    modeId: specialTrainingModeIdSchema,
    activityPaused: z.boolean(),
    questionCount: positiveIntSchema,
    settledCount: nonNegativeIntSchema,
    currentQuestionIndex: nonNegativeIntSchema.nullable(),
    currentQuestionId: nullableTrimmedStringSchema,
    question: specialTrainingQuestionMetadataSchema.nullable(),
    cursorIndex: nonNegativeIntSchema.nullable(),
    questionStartIndex: nonNegativeIntSchema.nullable(),
    questionEndIndex: nonNegativeIntSchema.nullable(),
    tradeRuntime: specialTrainingTradeRuntimeStateSchema.nullable(),
    riskBaseline: specialTrainingRiskRuntimeBaselineSchema.nullable(),
    fastDecisionTimer:
      desktopSpecialTrainingFastDecisionTimerSchema.nullable(),
    tradeActions: z.array(desktopSpecialTrainingTradeActionSchema),
    currentPrice: nullableFiniteNumberSchema,
    currentTotalAsset: nullableFiniteNumberSchema,
    floatingPnl: nullableFiniteNumberSchema,
    remainingActionableBars: nonNegativeIntSchema,
    buyEstimate: specialTrainingRiskEstimateSchema.nullable(),
    sellEstimate: specialTrainingRiskEstimateSchema.nullable(),
    actionState: specialTrainingRiskActionStateSchema.nullable(),
    sessionSummary: jsonRecordSchema.nullable(),
  })
  .strict();

export const desktopSpecialTrainingChallengeActivityRequestSchema = z
  .object({
    paused: z.boolean(),
  })
  .strict();

export const desktopSpecialTrainingChallengeActivityResultSchema = z
  .object({
    challengeId: nonEmptyTrimmedStringSchema,
    paused: z.boolean(),
    runtime: desktopSpecialTrainingChallengeRuntimeSchema,
  })
  .strict();

export const desktopSpecialTrainingSettlementSchema = z
  .object({
    score: finiteNumberSchema,
    passed: z.boolean(),
    totalPnl: finiteNumberSchema,
    finalTotalAsset: finiteNumberSchema,
    feedbackCodes: z.array(nonEmptyTrimmedStringSchema),
    usedOperations: nonNegativeIntSchema,
    maxOperations: nonNegativeIntSchema,
    directionResult: z.unknown().nullable(),
    recoveryRate: nullableFiniteNumberSchema,
    alpha: nullableFiniteNumberSchema,
    captureRate: nullableFiniteNumberSchema,
    maxDrawdownRatio: finiteNumberSchema,
    grade: nonEmptyTrimmedStringSchema,
  })
  .passthrough();

export const desktopSpecialTrainingChallengeSchema = z
  .object({
    challengeId: nonEmptyTrimmedStringSchema,
    bankId: nonEmptyTrimmedStringSchema,
    bankName: specialTrainingBankNameStringSchema,
    modeId: specialTrainingModeIdSchema,
    scopeHash: nonEmptyTrimmedStringSchema,
    questionCount: positiveIntSchema,
    createdAt: nonEmptyTrimmedStringSchema,
    expiresAt: nonEmptyTrimmedStringSchema,
    runtime: desktopSpecialTrainingChallengeRuntimeSchema,
    progress: desktopSpecialTrainingChallengeProgressSchema,
    scopeRestart: nullableJsonRecordSchema,
  })
  .passthrough();

export const desktopSpecialTrainingChallengeCommandResultSchema = z.object({
  runtime: desktopSpecialTrainingChallengeRuntimeSchema,
  progress: desktopSpecialTrainingChallengeProgressSchema,
  settlement: desktopSpecialTrainingSettlementSchema.nullable(),
});

export const desktopSpecialTrainingChallengeDiscardResultSchema = z.object({
  challengeId: nonEmptyTrimmedStringSchema,
  deleted: z.boolean(),
  releasedQuestionLedgerRows: nonNegativeIntSchema,
});

export const desktopSpecialTrainingQuestionBankSummarySchema = z
  .object({
    bankId: nonEmptyTrimmedStringSchema,
    bankName: specialTrainingBankNameStringSchema,
    modeId: specialTrainingModeIdSchema,
    scopeHash: nonEmptyTrimmedStringSchema,
    status: z.enum(["EMPTY", "READY_FRESH", "READY_IN_PROGRESS"]),
    targetTimeframe: baseTimeframeSchema,
    effectiveTimeframe: baseTimeframeSchema.optional(),
    effectiveTimeframes: z.array(baseTimeframeSchema),
    minimumBaseTimeframe: baseTimeframeSchema,
    sourceTimeframe: baseTimeframeSchema.optional(),
    sourceTimeframes: z.array(baseTimeframeSchema),
    poolCount: nonNegativeIntSchema,
    instrumentCount: nonNegativeIntSchema,
    totalQuestionCount: nonNegativeIntSchema,
    completedQuestionCount: nonNegativeIntSchema,
    remainingQuestionCount: nonNegativeIntSchema,
    symbolCount: nonNegativeIntSchema,
    availableQuestionCount: nonNegativeIntSchema,
    builtQuestionCount: nonNegativeIntSchema,
    capacity: z
      .object({
        requestedQuestionCount: positiveIntSchema,
        hasCapacityForRun: z.boolean(),
        willRestartQuestionScope: z.boolean(),
        totalQuestionCount: nonNegativeIntSchema,
        availableQuestionCount: nonNegativeIntSchema,
      })
      .strict(),
    actionAvailability: z
      .object({
        start: z
          .object({
            enabled: z.boolean(),
            reasonCode: nullableTrimmedStringSchema,
            hasCapacityForRun: z.boolean(),
            willRestartQuestionScope: z.boolean(),
          })
          .strict(),
        reset: z
          .object({
            enabled: z.boolean(),
            reasonCode: nullableTrimmedStringSchema,
            hasProgress: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    runtimeState: z
      .object({
        status: specialTrainingQuestionBankRuntimeStatusSchema,
        noticeKind: specialTrainingQuestionBankNoticeKindSchema.nullable(),
        noticeReasonCode: nullableTrimmedStringSchema,
        shouldAppendOldProgressNotice: z.boolean(),
        sessionUsesOldSnapshot: z.boolean(),
      })
      .strict(),
    updatedAt: nonEmptyTrimmedStringSchema,
    expiresAt: nullableTrimmedStringSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expectedRemaining = Math.max(
      0,
      value.totalQuestionCount - value.completedQuestionCount,
    );
    if (value.remainingQuestionCount !== expectedRemaining) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "QUESTION_BANK_REMAINING_COUNT_INCONSISTENT",
        path: ["remainingQuestionCount"],
      });
    }
    if (value.availableQuestionCount !== expectedRemaining) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "QUESTION_BANK_AVAILABLE_COUNT_INCONSISTENT",
        path: ["availableQuestionCount"],
      });
    }
    if (value.builtQuestionCount !== value.completedQuestionCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "QUESTION_BANK_BUILT_COUNT_INCONSISTENT",
        path: ["builtQuestionCount"],
      });
    }
    if (value.completedQuestionCount > value.totalQuestionCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "QUESTION_BANK_COMPLETED_EXCEEDS_TOTAL",
        path: ["completedQuestionCount"],
      });
    }
  });

export const desktopSpecialTrainingHistorySessionListSchema = z.array(
  z
    .object({
      id: nonEmptyTrimmedStringSchema,
      challengeId: nonEmptyTrimmedStringSchema,
      modeId: specialTrainingModeIdSchema,
      sourceTag: nonEmptyTrimmedStringSchema,
      questionCount: nonNegativeIntSchema,
      completedQuestionCount: nonNegativeIntSchema,
      passedQuestionCount: nonNegativeIntSchema,
      failedQuestionCount: nonNegativeIntSchema,
      missedQuestionCount: nonNegativeIntSchema,
      timedOutQuestionCount: nonNegativeIntSchema,
      createdAt: nonEmptyTrimmedStringSchema,
      finishedAt: nonEmptyTrimmedStringSchema,
      updatedAt: nonEmptyTrimmedStringSchema,
    })
    .passthrough(),
);

export const desktopSpecialTrainingHistorySessionDetailSchema = z
  .object({
    id: nonEmptyTrimmedStringSchema,
    challengeId: nonEmptyTrimmedStringSchema,
    modeId: specialTrainingModeIdSchema,
    questions: z.array(z.unknown()),
  })
  .passthrough();

export const desktopSpecialTrainingHistoryQuestionDetailSchema = z
  .object({
    id: nonEmptyTrimmedStringSchema,
    symbol: nonEmptyTrimmedStringSchema,
    bars: z
      .array(desktopBarSchema)
      .max(DESKTOP_API_LIMITS.specialTrainingQuestionBarsMax),
    settlementStatus: z.enum(["SETTLED", "ABANDONED"]),
    score: finiteNumberSchema,
    passed: z.boolean(),
    tradeActions: z.array(z.unknown()),
    createdAt: nonEmptyTrimmedStringSchema,
    settledAt: nonEmptyTrimmedStringSchema,
    updatedAt: nonEmptyTrimmedStringSchema,
  })
  .passthrough();

export const desktopSpecialTrainingHistoryClearResultSchema = z.object({
  deletedSessionRows: nonNegativeIntSchema,
  deletedQuestionRows: nonNegativeIntSchema,
});

export const desktopSpecialTrainingStatsPayloadSchema = z
  .object({
    report: jsonRecordSchema,
    projectDetailsById: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const desktopTrainingStatsSummaryComparisonMetricsSchema = z
  .object({
    sessionCount: nonNegativeIntSchema,
    returnRate: finiteNumberSchema,
    winRate: finiteNumberSchema,
    profitLossRatio: finiteNumberSchema,
    maxDrawdownRate: finiteNumberSchema,
    avgHoldBars: finiteNumberSchema,
    tradeFrequency: finiteNumberSchema,
  })
  .passthrough();

const desktopTrainingStatsSummaryComparisonSchema = z
  .object({
    leftLabel: nonEmptyTrimmedStringSchema,
    rightLabel: nonEmptyTrimmedStringSchema,
    left: desktopTrainingStatsSummaryComparisonMetricsSchema,
    right: desktopTrainingStatsSummaryComparisonMetricsSchema,
    delta: desktopTrainingStatsSummaryComparisonMetricsSchema.omit({
      sessionCount: true,
    }),
  })
  .passthrough();

const desktopTrainingStatsSummaryTotalsSchema = z
  .object({
    totalProjects: nonNegativeIntSchema,
    filteredProjects: nonNegativeIntSchema,
  })
  .passthrough();

const desktopTrainingStatsSummaryOverviewSchema = z
  .object({
    totalSessions: nonNegativeIntSchema,
    totalTrainingDays: nonNegativeIntSchema,
    totalTrades: nonNegativeIntSchema,
    totalPnl: finiteNumberSchema,
    totalReturnRate: finiteNumberSchema,
    maxDrawdownRate: finiteNumberSchema,
    winRate: finiteNumberSchema,
    averageDecisionSeconds: finiteNumberSchema,
  })
  .passthrough();

export const desktopTrainingStatsSummarySchema = z
  .object({
    generatedAt: nonEmptyTrimmedStringSchema,
    version: nonNegativeIntSchema,
    totals: desktopTrainingStatsSummaryTotalsSchema,
    overview: desktopTrainingStatsSummaryOverviewSchema,
    comparisons: z
      .object({
        recent20VsPrevious20: desktopTrainingStatsSummaryComparisonSchema,
      })
      .passthrough(),
    latestSession: jsonRecordSchema.nullable(),
  })
  .passthrough();

export const desktopSpecialTrainingStatsSummarySchema = z
  .object({
    generatedAt: nonEmptyTrimmedStringSchema,
    modeId: specialTrainingModeIdSchema,
    totals: desktopTrainingStatsSummaryTotalsSchema,
    overview: desktopTrainingStatsSummaryOverviewSchema.extend({
      profitLossRatio: finiteNumberSchema.optional(),
      averageTradePnl: finiteNumberSchema.optional(),
      averageHoldBars: finiteNumberSchema.optional(),
    }),
    dashboardInsights: jsonRecordSchema,
    defaultModeId: specialTrainingModeIdSchema,
    modeAvailability: z.record(
      specialTrainingModeIdSchema,
      z
        .object({
          tag: nonEmptyTrimmedStringSchema,
          projectCount: nonNegativeIntSchema,
        })
        .passthrough(),
    ),
    recentSessions: z.array(jsonRecordSchema),
  })
  .passthrough();

export const desktopSpecialTrainingStatsProjectDetailSchema =
  jsonRecordSchema.nullable();

export const desktopSpecialTrainingChallengeStartRequestSchema = z
  .object({
    bankId: idStringSchema,
    modeId: specialTrainingModeIdSchema,
    questionCount: z.coerce.number().int().default(5),
    horizonBars: z.coerce.number().int().optional(),
    maxOperations: z.coerce.number().int().optional(),
    decisionSecondsLimit: z.coerce.number().int().optional(),
    fastDecisionStrictnessLevel:
      specialTrainingFastDecisionStrictnessSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const modeId = value.modeId as SpecialTrainingModeId;
    if (!isSpecialTrainingQuestionCountAllowed(value.questionCount)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_QUESTION_COUNT_INVALID",
        path: ["questionCount"],
      });
    }
    if (
      value.horizonBars !== undefined
      && !isSpecialTrainingHorizonBarsAllowed(modeId, value.horizonBars)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_HORIZON_INVALID",
        path: ["horizonBars"],
      });
    }
    if (
      value.decisionSecondsLimit !== undefined
      && !isSpecialTrainingDecisionSecondsAllowed(
        modeId,
        value.decisionSecondsLimit,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_DECISION_SECONDS_INVALID",
        path: ["decisionSecondsLimit"],
      });
    }
    if (supportsSpecialTrainingFastDecisionStrictness(modeId)) {
      if (value.maxOperations !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SPECIAL_TRAINING_MAX_OPERATIONS_INVALID",
          path: ["maxOperations"],
        });
      }
      return;
    }
    if (value.fastDecisionStrictnessLevel !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_FAST_DECISION_STRICTNESS_INVALID",
        path: ["fastDecisionStrictnessLevel"],
      });
    }
    if (value.decisionSecondsLimit !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_DECISION_SECONDS_INVALID",
        path: ["decisionSecondsLimit"],
      });
    }
  });

const appendSpecialTrainingQuestionBankScopeRules = <
  T extends z.ZodType<{
    modeId: SpecialTrainingModeId;
    horizonBars?: number;
    questionCount?: number;
  }>,
>(
  schema: T,
) =>
  schema.superRefine((value, context) => {
    if (
      value.horizonBars !== undefined
      && !isSpecialTrainingHorizonBarsAllowed(value.modeId, value.horizonBars)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_HORIZON_INVALID",
        path: ["horizonBars"],
      });
    }
    if (
      value.questionCount !== undefined
      && !isSpecialTrainingQuestionCountAllowed(value.questionCount)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SPECIAL_TRAINING_QUESTION_COUNT_INVALID",
        path: ["questionCount"],
      });
    }
  });

const desktopSpecialTrainingQuestionBankScopeRequestBaseSchema = z
  .object({
    bankId: idStringSchema,
    modeId: specialTrainingModeIdSchema,
    horizonBars: z.coerce.number().int().optional(),
    questionCount: z.coerce.number().int().optional(),
    previousSummary: specialTrainingQuestionBankPreviousSummarySchema
      .nullable()
      .optional(),
    activeSession: specialTrainingQuestionBankActiveSessionSchema
      .nullable()
      .optional(),
  })
  .strict();

export const desktopSpecialTrainingQuestionBankPreviewRequestSchema =
  appendSpecialTrainingQuestionBankScopeRules(
    desktopSpecialTrainingQuestionBankScopeRequestBaseSchema,
  );

export const desktopSpecialTrainingQuestionBankResetRequestSchema =
  appendSpecialTrainingQuestionBankScopeRules(
    desktopSpecialTrainingQuestionBankScopeRequestBaseSchema,
  );

export const desktopSpecialTrainingQuestionBankDraftPreviewRequestSchema = z
  .object({
    assetClass: assetClassSchema,
    targetTimeframe: baseTimeframeSchema,
    poolIds: z.array(idStringSchema).min(1).max(INPUT_ARRAY_LIMITS.poolIds),
  })
  .strict();

export const desktopSpecialTrainingBankEditorReadModelRequestSchema = z
  .object({
    step: specialTrainingBankEditorStepSchema,
    draft: z
      .object({
        sourceBankId: idStringSchema.nullable().optional(),
        name: trimmedStringSchema.max(
          INPUT_LIMITS.specialTrainingBankNameChars,
        ),
        assetClass: assetClassSchema.optional(),
        targetTimeframe: baseTimeframeSchema,
        poolIds: z.array(idStringSchema).max(INPUT_ARRAY_LIMITS.poolIds),
      })
      .strict(),
    availablePoolIds: z
      .array(idStringSchema)
      .max(INPUT_ARRAY_LIMITS.poolIds)
      .optional(),
  })
  .strict();

export const desktopSpecialTrainingChallengeActionRequestSchema = z.object({
  action: z.enum([
    "BUY",
    "SELL",
    "BUY_AND_ADVANCE",
    "SELL_AND_ADVANCE",
    "NEXT_BAR",
    "UNDO",
  ]),
  inputMode: orderInputModeSchema.optional(),
  lotInput: optionalOrderInputValueSchema,
  amountInput: optionalOrderInputValueSchema,
  ratioInput: optionalOrderInputValueSchema,
  priceMode: priceModeSchema.optional(),
  nextOpenDelayBars: specialTrainingOrderNextOpenDelayBarsSchema.optional(),
});

export const desktopSpecialTrainingOrderQuoteRequestSchema = z.object({
  side: sideSchema,
  inputMode: orderInputModeSchema,
  lotInput: optionalOrderInputValueSchema,
  amountInput: optionalOrderInputValueSchema,
  ratioInput: optionalOrderInputValueSchema,
  priceMode: priceModeSchema,
  nextOpenDelayBars: specialTrainingOrderNextOpenDelayBarsSchema.optional(),
});

export const desktopSpecialTrainingDecisionRequestSchema = z.object({
  selection: specialTrainingSelectionSchema,
  decisionSecondsUsed: z.coerce.number().finite().min(0).max(120),
  timedOut: z.boolean().optional(),
});

export const desktopSpecialTrainingQuestionSettleRequestSchema = z.object({
  abandoned: z.boolean().optional().default(false),
  cursorIndex: z.coerce.number().int().min(0).optional(),
  fastDecision: desktopSpecialTrainingDecisionRequestSchema.optional(),
  tradeActions: z
    .array(desktopSpecialTrainingTradeActionSchema)
    .max(INPUT_ARRAY_LIMITS.tradeActions)
    .optional()
    .default([]),
});
