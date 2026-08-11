// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import { INPUT_ARRAY_LIMITS, INPUT_LIMITS } from "../input-limits.js";
import { ORDER_SIDES, PRICE_MODES } from "../trading.js";
import { desktopTradingSettingsSchema } from "./trading-settings.js";

const trimmedStringSchema = z.string().trim();
const nonEmptyTrimmedStringSchema = trimmedStringSchema.min(1);
const nullableTrimmedStringSchema = trimmedStringSchema.nullable();
const nullableDateTimeStringSchema = trimmedStringSchema.max(INPUT_LIMITS.dateTimeChars).nullable();
const optionalDateTimeStringSchema = trimmedStringSchema.max(INPUT_LIMITS.dateTimeChars).optional();
const idStringSchema = nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.idChars);
const symbolStringSchema = nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.symbolChars);
const finiteNumberSchema = z.number().finite();
const nonNegativeNumberSchema = finiteNumberSchema.nonnegative();
const nonNegativeIntSchema = z.number().int().nonnegative();
const positiveNumberSchema = finiteNumberSchema.positive();
const jsonRecordSchema = z.record(z.string(), z.unknown());
const sideSchema = z.enum(ORDER_SIDES);
const priceModeSchema = z.enum(PRICE_MODES);
const nonEmptyCustomIndicatorFormulaSourceSchema = z
  .string()
  .max(INPUT_LIMITS.formulaSourceChars)
  .refine((value) => value.trim().length > 0, {
    message: "CUSTOM_INDICATOR_SOURCE_REQUIRED",
  });

export const desktopBacktestBatchStatusSchema = z.enum([
  "DRAFT",
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
export const desktopBacktestOrderSizingModeSchema = z.enum([
  "FIXED_QTY",
  "FIXED_AMOUNT",
  "EQUITY_PERCENT",
  "ALL_IN",
]);
const desktopBacktestSignalExecutionModeSchema = z.enum([
  "NEXT_OPEN",
  "CUR_CLOSE",
]);
export const desktopBacktestSignalRuleOperandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("OUTPUT"),
    key: nonEmptyTrimmedStringSchema
      .max(INPUT_LIMITS.parameterKeyChars)
      .regex(/^[A-Z_][A-Z0-9_]*$/),
  }).strict(),
  z.object({
    kind: z.literal("PRICE"),
    field: z.enum(["CLOSE", "OPEN", "HIGH", "LOW", "VOLUME"]),
  }).strict(),
  z.object({
    kind: z.literal("CONSTANT"),
    value: finiteNumberSchema,
  }).strict(),
]);
export const desktopBacktestSignalRuleOperatorSchema = z.enum([
  "CROSS_ABOVE",
  "CROSS_BELOW",
  "GREATER",
  "GREATER_EQUAL",
  "LESS",
  "LESS_EQUAL",
  "EQUAL",
]);
export const desktopBacktestSignalRuleConditionSchema = z
  .object({
    left: desktopBacktestSignalRuleOperandSchema,
    operator: desktopBacktestSignalRuleOperatorSchema,
    right: desktopBacktestSignalRuleOperandSchema,
  })
  .strict();
export const desktopBacktestDirectionSignalRuleSchema = z
  .object({
    connector: z.enum(["AND", "OR"]),
    conditions: z.array(desktopBacktestSignalRuleConditionSchema).min(1),
  })
  .strict();
export const desktopBacktestSignalRulesSchema = z
  .object({
    buy: desktopBacktestDirectionSignalRuleSchema.optional(),
    sell: desktopBacktestDirectionSignalRuleSchema.optional(),
    short: desktopBacktestDirectionSignalRuleSchema.optional(),
    cover: desktopBacktestDirectionSignalRuleSchema.optional(),
  })
  .strict();
export const desktopBacktestOrderSizingSchema = z
  .object({
    mode: desktopBacktestOrderSizingModeSchema,
    value: nonNegativeNumberSchema.optional(),
  })
  .strict();
export const desktopBacktestConfigSchema = z
  .object({
    name: trimmedStringSchema.max(INPUT_LIMITS.generalNameChars).optional(),
    strategySource: nonEmptyCustomIndicatorFormulaSourceSchema,
    parameterInputs: z.record(
      trimmedStringSchema.max(INPUT_LIMITS.parameterKeyChars),
      trimmedStringSchema.max(INPUT_LIMITS.parameterValueChars),
    ).optional(),
    instrumentIds: z.array(idStringSchema).max(INPUT_ARRAY_LIMITS.symbols).optional(),
    samplePoolIds: z.array(idStringSchema).max(INPUT_ARRAY_LIMITS.enabledSamplePools).optional(),
    startIndex: nonNegativeIntSchema.optional(),
    endIndex: nonNegativeIntSchema.optional(),
    startTime: optionalDateTimeStringSchema,
    endTime: optionalDateTimeStringSchema,
    initialCapital: positiveNumberSchema,
    priceMode: priceModeSchema.default("NEXT_OPEN"),
    signalExecutionMode: desktopBacktestSignalExecutionModeSchema.default("NEXT_OPEN"),
    orderSizing: desktopBacktestOrderSizingSchema,
    tradingSettings: desktopTradingSettingsSchema,
    signalRules: desktopBacktestSignalRulesSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const instrumentCount = value.instrumentIds?.length ?? 0;
    const poolCount = value.samplePoolIds?.length ?? 0;
    if (instrumentCount + poolCount <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BACKTEST_UNIVERSE_REQUIRED",
        path: ["instrumentIds"],
      });
    }
    if (
      value.startIndex !== undefined &&
      value.endIndex !== undefined &&
      value.endIndex < value.startIndex
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BACKTEST_RANGE_INVALID",
        path: ["endIndex"],
      });
    }
    if (
      (value.startTime !== undefined || value.endTime !== undefined) &&
      (value.startIndex !== undefined || value.endIndex !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BACKTEST_RANGE_MODE_CONFLICT",
        path: ["startTime"],
      });
    }
    const startMs = value.startTime ? Date.parse(value.startTime) : null;
    const endMs = value.endTime ? Date.parse(value.endTime) : null;
    if (value.startTime && !Number.isFinite(startMs)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BACKTEST_TIME_RANGE_INVALID",
        path: ["startTime"],
      });
    }
    if (value.endTime && !Number.isFinite(endMs)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BACKTEST_TIME_RANGE_INVALID",
        path: ["endTime"],
      });
    }
    if (
      startMs !== null &&
      endMs !== null &&
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      endMs < startMs
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BACKTEST_TIME_RANGE_INVALID",
        path: ["endTime"],
      });
    }
  });
export const desktopBacktestBatchCreateRequestSchema = z
  .object({
    name: trimmedStringSchema.max(INPUT_LIMITS.generalNameChars).optional(),
    config: desktopBacktestConfigSchema,
  })
  .strict();
export const desktopBacktestBatchRunRequestSchema = z.object({}).strict();
export const desktopBacktestBatchSchema = z
  .object({
    id: idStringSchema,
    name: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.generalNameChars),
    status: desktopBacktestBatchStatusSchema,
    config: desktopBacktestConfigSchema,
    progress: jsonRecordSchema,
    summary: jsonRecordSchema,
    errorCode: nullableTrimmedStringSchema,
    errorMessage: nullableTrimmedStringSchema,
    createdAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    updatedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    startedAt: nullableDateTimeStringSchema,
    finishedAt: nullableDateTimeStringSchema,
  })
  .strict();
export const desktopBacktestBatchListSchema = z.array(desktopBacktestBatchSchema).max(500);
export const desktopBacktestClearResultSchema = z
  .object({
    deletedBatchIds: z.array(idStringSchema).max(500),
    deletedBatchCount: nonNegativeIntSchema,
    clearedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
  })
  .strict();
export const desktopBacktestDeleteResultSchema = z
  .object({
    deletedBatchId: idStringSchema,
  })
  .strict();
export const desktopBacktestProgressSchema = z
  .object({
    batch: desktopBacktestBatchSchema,
    progress: jsonRecordSchema,
  })
  .strict();
export const desktopBacktestResultSummarySchema = z
  .object({
    id: idStringSchema,
    batchId: idStringSchema,
    instrumentId: idStringSchema,
    symbol: symbolStringSchema,
    timeframe: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.shortCodeChars),
    barsCount: nonNegativeIntSchema,
    finalEquity: finiteNumberSchema,
    totalPnl: finiteNumberSchema,
    profitRate: finiteNumberSchema,
    maxDrawdown: finiteNumberSchema,
    winRate: finiteNumberSchema,
    tradeCount: nonNegativeIntSchema,
    conflictCount: nonNegativeIntSchema,
    summary: jsonRecordSchema,
    createdAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    updatedAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
  })
  .strict();
export const desktopBacktestResultListItemSchema = desktopBacktestResultSummarySchema
  .omit({ summary: true })
  .strict();
export const desktopBacktestFillSchema = z
  .object({
    id: idStringSchema,
    batchId: idStringSchema,
    resultId: idStringSchema,
    instrumentId: idStringSchema,
    symbol: symbolStringSchema,
    orderId: idStringSchema,
    fillIndex: nonNegativeIntSchema,
    fillTime: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    side: sideSchema,
    price: finiteNumberSchema,
    qty: finiteNumberSchema,
    gross: finiteNumberSchema,
    fee: finiteNumberSchema,
    tax: finiteNumberSchema,
    slippage: finiteNumberSchema,
    createdAt: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
  })
  .strict();
export const desktopBacktestEquityPointSchema = z
  .object({
    id: idStringSchema,
    batchId: idStringSchema,
    resultId: idStringSchema,
    instrumentId: idStringSchema,
    symbol: symbolStringSchema,
    barIndex: nonNegativeIntSchema,
    barTime: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    equity: finiteNumberSchema,
    drawdown: finiteNumberSchema,
  })
  .strict();
export const desktopBacktestBarSchema = z
  .object({
    rawIndex: nonNegativeIntSchema,
    ts: nonEmptyTrimmedStringSchema.max(INPUT_LIMITS.dateTimeChars),
    open: finiteNumberSchema,
    high: finiteNumberSchema,
    low: finiteNumberSchema,
    close: finiteNumberSchema,
    volume: finiteNumberSchema,
  })
  .strict();
export const desktopBacktestResultsSchema = z
  .object({
    batch: desktopBacktestBatchSchema,
    results: z.array(desktopBacktestResultListItemSchema).max(INPUT_ARRAY_LIMITS.symbols),
  })
  .strict();
export const desktopBacktestResultDetailSchema = z
  .object({
    batch: desktopBacktestBatchSchema,
    result: desktopBacktestResultSummarySchema,
    fills: z.array(desktopBacktestFillSchema).max(20_000),
    equityCurve: z.array(desktopBacktestEquityPointSchema).max(120_000),
    bars: z.array(desktopBacktestBarSchema).max(5_000),
  })
  .strict();
