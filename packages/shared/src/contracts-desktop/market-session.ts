// SPDX-License-Identifier: GPL-3.0-only
// Market data and desktop session runtime contract schemas.

import { z } from "zod";

import { DESKTOP_API_LIMITS } from "../input-limits.js";
import { assertTradingCalendarConfig } from "../tradingCalendar.js";
import { isValidTimeZone } from "../timezone.js";
import {
  ORDER_INPUT_MODES,
  ORDER_SIDES,
  PRICE_MODES,
} from "../trading.js";
import {
  baseTimeframeSchema,
  displayPeriodSchema,
  finiteNumberSchema,
  freeReplayAdvancePeriodSchema,
  jsonRecordSchema,
  nonEmptyTrimmedStringSchema,
  nonNegativeIntSchema,
  nullableDateTimeStringSchema,
  nullableFiniteNumberSchema,
  nullableTrimmedStringSchema,
  optionalCursorStringSchema,
  orderInputValueSchema,
  positiveIntSchema,
  positiveNumberSchema,
  trimmedStringSchema,
} from "./api-primitives.js";
import { desktopTradingSettingsSchema } from "./trading-settings.js";

export const priceModeSchema = z.enum(PRICE_MODES);
export const sideSchema = z.enum(ORDER_SIDES);
export const orderInputModeSchema = z.enum(ORDER_INPUT_MODES);
export const optionalOrderInputValueSchema = orderInputValueSchema.nullable().optional();
export const specialTrainingOrderNextOpenDelayBarsSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(5);
export const timeZoneOriginSchema = z.enum([
  "PRESET_DEFAULT",
  "INFERRED_DEFAULT",
  "USER_SELECTED",
]);
export const timeZoneSchema = nonEmptyTrimmedStringSchema.refine(isValidTimeZone, {
  message: "TIME_ZONE_INVALID",
});
const tradingSessionRangeSchema = z.object({
  startMinute: z.coerce.number().int().min(0).max(1439),
  endMinute: z.coerce.number().int().min(0).max(1440),
  crossesMidnight: z.boolean(),
});
export const desktopTradingCalendarConfigSchema = z.object({
  tradingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1).max(7),
  sessions: z.array(tradingSessionRangeSchema).min(1).max(12),
}).transform((value, context) => {
  try {
    return assertTradingCalendarConfig(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TRADING_CALENDAR_INVALID",
    });
    return z.NEVER;
  }
});

export const desktopBarSchema = z.object({
  ts: nonEmptyTrimmedStringSchema,
  open: finiteNumberSchema,
  high: finiteNumberSchema,
  low: finiteNumberSchema,
  close: finiteNumberSchema,
  volume: finiteNumberSchema,
});

export const desktopInstrumentSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  instrumentId: nonEmptyTrimmedStringSchema.optional(),
  symbol: nonEmptyTrimmedStringSchema,
  baseTimeframe: baseTimeframeSchema,
  sourceTimeframe: baseTimeframeSchema.optional(),
  name: nullableTrimmedStringSchema,
  barCount: nonNegativeIntSchema,
  timeStartTs: nullableDateTimeStringSchema.optional(),
  timeEndTs: nullableDateTimeStringSchema.optional(),
  scopeKind: z.enum(["SYSTEM", "LOCAL"]),
  samplePoolId: nullableTrimmedStringSchema.optional(),
  sourceId: nullableTrimmedStringSchema.optional(),
  sourceName: nullableTrimmedStringSchema.optional(),
  displayLabel: nonEmptyTrimmedStringSchema,
  barsVersionToken: trimmedStringSchema.optional(),
});

export const desktopInstrumentListSchema = z.array(desktopInstrumentSchema);

export const desktopBarsRangeSchema = z
  .object({
    symbol: nonEmptyTrimmedStringSchema,
    timeframe: trimmedStringSchema.optional(),
    timeZone: nullableTrimmedStringSchema.optional(),
    total: nonNegativeIntSchema,
    offset: nonNegativeIntSchema,
    limit: positiveIntSchema.max(DESKTOP_API_LIMITS.marketFrameBarsMax),
    bars: z
      .array(desktopBarSchema)
      .max(DESKTOP_API_LIMITS.marketFrameBarsMax),
  })
  .superRefine((value, context) => {
    if (value.bars.length > value.limit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "BARS_RANGE_LENGTH_EXCEEDS_LIMIT",
        path: ["bars"],
      });
    }
  });

const marketBarFrameIntColumnSchema = z
  .array(nonNegativeIntSchema)
  .max(DESKTOP_API_LIMITS.marketFrameBarsMax);
const marketBarFrameNumberColumnSchema = z
  .array(finiteNumberSchema)
  .max(DESKTOP_API_LIMITS.marketFrameBarsMax);
const marketBarFrameColumnKeys = [
  "displayIndex",
  "timestampMs",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "startRawIndex",
  "endRawIndex",
] as const;

export const desktopMarketBarFrameSchema = z
  .object({
    schemaVersion: z.literal("zinuto-market-frame-v2"),
    instrumentId: nonEmptyTrimmedStringSchema,
    symbol: nonEmptyTrimmedStringSchema,
    baseTimeframe: trimmedStringSchema,
    timeframe: trimmedStringSchema,
    displayPeriod: displayPeriodSchema,
    timeZone: nullableTrimmedStringSchema.optional(),
    totalRaw: nonNegativeIntSchema,
    totalDisplay: nonNegativeIntSchema,
    rawStartIndex: nonNegativeIntSchema,
    rawEndIndex: nonNegativeIntSchema,
    displayStartIndex: nonNegativeIntSchema,
    displayEndIndex: nonNegativeIntSchema,
    limit: positiveIntSchema.max(DESKTOP_API_LIMITS.marketFrameBarsMax),
    hasBackward: z.boolean(),
    hasForward: z.boolean(),
    versionToken: nonEmptyTrimmedStringSchema,
    displayIndex: marketBarFrameIntColumnSchema,
    timestampMs: marketBarFrameIntColumnSchema,
    open: marketBarFrameNumberColumnSchema,
    high: marketBarFrameNumberColumnSchema,
    low: marketBarFrameNumberColumnSchema,
    close: marketBarFrameNumberColumnSchema,
    volume: marketBarFrameNumberColumnSchema,
    startRawIndex: marketBarFrameIntColumnSchema,
    endRawIndex: marketBarFrameIntColumnSchema,
  })
  .superRefine((value, context) => {
    const expectedLength = value.displayIndex.length;
    for (const key of marketBarFrameColumnKeys) {
      if (value[key].length !== expectedLength) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MARKET_BAR_FRAME_COLUMN_LENGTH_MISMATCH",
          path: [key],
        });
      }
    }
    if (expectedLength > value.limit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MARKET_BAR_FRAME_LENGTH_EXCEEDS_LIMIT",
        path: ["displayIndex"],
      });
    }
  });

export const desktopAccountSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  user_id: nonEmptyTrimmedStringSchema,
  kind: z.literal("SECURITIES"),
  balance: finiteNumberSchema,
  currency: nonEmptyTrimmedStringSchema,
});


export const desktopSessionSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  user_id: nonEmptyTrimmedStringSchema,
  instrument_id: nonEmptyTrimmedStringSchema,
  instrumentId: nonEmptyTrimmedStringSchema.optional(),
  samplePoolId: nonEmptyTrimmedStringSchema,
  sourceTimeframe: baseTimeframeSchema,
  timeZone: nullableTrimmedStringSchema.optional(),
  timeframe: nonEmptyTrimmedStringSchema,
  minimumBaseTimeframe: freeReplayAdvancePeriodSchema,
  start_index: nonNegativeIntSchema,
  entry_index: nonNegativeIntSchema,
  history_bars: nonNegativeIntSchema,
  cursor_index: nonNegativeIntSchema,
  autoplay_interval_ms: positiveIntSchema,
  is_paused: z.number().int().min(0).max(1),
  created_at: nonEmptyTrimmedStringSchema,
  symbol: nonEmptyTrimmedStringSchema,
  instrumentName: nullableTrimmedStringSchema.optional(),
});

const desktopPositionSchema = z.object({
  sessionId: nonEmptyTrimmedStringSchema,
  instrumentId: nonEmptyTrimmedStringSchema,
  symbol: nonEmptyTrimmedStringSchema,
  qty: finiteNumberSchema,
  avgCost: finiteNumberSchema,
  realizedPnl: finiteNumberSchema,
  unrealizedPnl: finiteNumberSchema,
  totalPnl: finiteNumberSchema,
  markPrice: finiteNumberSchema,
});

const desktopFillSchema = z.object({
  id: nonEmptyTrimmedStringSchema,
  order_id: nonEmptyTrimmedStringSchema,
  session_id: nonEmptyTrimmedStringSchema,
  instrument_id: nonEmptyTrimmedStringSchema,
  symbol: nonEmptyTrimmedStringSchema,
  side: sideSchema,
  fill_index: nonNegativeIntSchema,
  fill_time: nonEmptyTrimmedStringSchema,
  fill_price: finiteNumberSchema,
  fill_qty: finiteNumberSchema,
  contract_multiplier: finiteNumberSchema,
  fee: finiteNumberSchema,
  tax: finiteNumberSchema,
  slippage: finiteNumberSchema,
  created_at: nonEmptyTrimmedStringSchema,
});

const desktopTradeCapacityRatioBasisSchema = z.object({
  kind: z.enum([
    "CLOSE_SHORT",
    "LONG_BUYING_POWER",
    "CLOSE_LONG",
    "SHORT_OPEN_CAPACITY",
  ]),
  quantity: finiteNumberSchema,
  amount: finiteNumberSchema,
});

const desktopTradeCapacitySummarySchema = z.object({
  availableCash: finiteNumberSchema,
  longBuyingPowerQty: finiteNumberSchema,
  longBuyingPowerAmount: finiteNumberSchema,
  longFinancingAmount: finiteNumberSchema,
  shortOpenCapacityQty: finiteNumberSchema,
  shortOpenCapacityAmount: finiteNumberSchema,
  ratioBases: z.object({
    buy: desktopTradeCapacityRatioBasisSchema,
    sell: desktopTradeCapacityRatioBasisSchema,
  }),
});

const desktopProjectedAfterFillSchema = z
  .object({
    cashBalance: finiteNumberSchema,
    accountBalance: finiteNumberSchema,
    positionQty: finiteNumberSchema,
    avgCost: finiteNumberSchema,
    realizedPnl: finiteNumberSchema,
    unrealizedPnl: finiteNumberSchema,
    totalPnl: finiteNumberSchema,
    equity: finiteNumberSchema,
    longFinancingAmount: finiteNumberSchema,
    longFinancingAccrual: finiteNumberSchema,
    shortBorrowAccrual: finiteNumberSchema,
    tradingCostBreakdown: z
      .object({
        fees: finiteNumberSchema,
        taxes: finiteNumberSchema,
        slippage: finiteNumberSchema,
        totalTradingCost: finiteNumberSchema,
      })
      .passthrough(),
    marginState: z
      .object({
        equity: finiteNumberSchema,
        requiredInitialEquity: finiteNumberSchema,
        requiredMaintenanceEquity: finiteNumberSchema,
        availableInitialEquity: finiteNumberSchema,
        availableMaintenanceEquity: finiteNumberSchema,
        longNotional: finiteNumberSchema,
        shortNotional: finiteNumberSchema,
      })
      .passthrough(),
  })
  .passthrough();

const desktopSessionOrderActionAvailabilitySchema = z
  .object({
    enabled: z.boolean(),
    reasonCode: nullableTrimmedStringSchema,
    facts: jsonRecordSchema,
  })
  .passthrough();

export const desktopSessionSnapshotSchema = z
  .object({
    session: desktopSessionSchema,
    accounts: z.array(desktopAccountSchema),
    sessionTradingSettings: desktopTradingSettingsSchema.optional(),
    positions: z.array(desktopPositionSchema),
    fills: z.array(desktopFillSchema).max(DESKTOP_API_LIMITS.sessionFillsPageMax),
    fillsTotal: nonNegativeIntSchema.optional(),
    nextFillCursor: optionalCursorStringSchema,
    residentFillsStartIndex: nonNegativeIntSchema.optional(),
    drawings: z.array(z.unknown()),
    actionState: z
      .object({
        allowBuy: z.boolean(),
        allowSell: z.boolean(),
        allowStep: z.boolean(),
        nextOpenAvailable: z.boolean(),
        referencePrice: nullableFiniteNumberSchema,
        minTradeStep: positiveNumberSchema.optional(),
        buyBlockedReasonCode: nullableTrimmedStringSchema.optional(),
        buyBlockedReason: nullableTrimmedStringSchema.optional(),
        sellBlockedReasonCode: nullableTrimmedStringSchema.optional(),
        sellBlockedReason: nullableTrimmedStringSchema.optional(),
        buyOrder: desktopSessionOrderActionAvailabilitySchema.optional(),
        sellOrder: desktopSessionOrderActionAvailabilitySchema.optional(),
        tradeCapacity: desktopTradeCapacitySummarySchema.optional(),
        canUndo: z.boolean(),
        undoAvailableSteps: nonNegativeIntSchema,
        undoMaxSteps: nonNegativeIntSchema,
        lastUndoableAction: z.enum(["STEP", "BUY", "SELL"]).nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const desktopSessionBootstrapSchema = z.object({
  session: desktopSessionSchema,
  chartFrame: desktopMarketBarFrameSchema,
  snapshot: desktopSessionSnapshotSchema,
});

export const desktopSessionRuntimeDeltaSchema = z
  .object({
    sessionId: nonEmptyTrimmedStringSchema,
    session: desktopSessionSchema,
    action: z.enum(["STEP", "BUY", "SELL", "UNDO"]),
    previousCursorRawIndex: nonNegativeIntSchema,
    cursorRawIndex: nonNegativeIntSchema,
    displayPeriod: displayPeriodSchema,
    previousDisplayIndex: nonNegativeIntSchema.nullable(),
    displayIndex: nonNegativeIntSchema.nullable(),
    displayStartRawIndex: nonNegativeIntSchema,
    displayEndRawIndex: nonNegativeIntSchema,
    nextDisplayIndex: nonNegativeIntSchema.nullable(),
    hasFutureBars: z.boolean(),
    actionState: desktopSessionSnapshotSchema.shape.actionState,
    positions: z.array(desktopPositionSchema),
    accounts: z.array(desktopAccountSchema),
    sessionTradingSettings: desktopTradingSettingsSchema.optional(),
    tradingCostBreakdown: z
      .object({
        fees: finiteNumberSchema,
        taxes: finiteNumberSchema,
        slippage: finiteNumberSchema,
        borrowCost: finiteNumberSchema,
        financingCost: finiteNumberSchema,
        totalTradingCost: finiteNumberSchema,
      })
      .optional(),
    longFinancingChargesTotal: finiteNumberSchema.optional(),
    shortBorrowChargesTotal: finiteNumberSchema.optional(),
    currentLeverageCycle: z.unknown().optional(),
    fills: z.array(desktopFillSchema).max(DESKTOP_API_LIMITS.sessionFillsPageMax),
    fillsTotal: nonNegativeIntSchema.optional(),
    nextFillCursor: optionalCursorStringSchema,
    residentFillsStartIndex: nonNegativeIntSchema.optional(),
    termination: z.unknown().optional(),
    chartFrameDelta: desktopMarketBarFrameSchema.optional(),
  })
  .passthrough();

export const desktopSessionStepResultSchema = z.object({
  session: desktopSessionSchema,
  fillIds: z.array(nonEmptyTrimmedStringSchema),
  forcedLiquidationCount: nonNegativeIntSchema,
  runtimeDelta: desktopSessionRuntimeDeltaSchema,
  chartFrame: desktopMarketBarFrameSchema.optional(),
  chartFrameDecision: z
    .object({
      includeFrame: z.boolean(),
      reason: z.enum([
        "CURSOR_DISPLAY_INDEX_UNAVAILABLE",
        "RESIDENT_WINDOW_UNREPORTED",
        "CURSOR_INSIDE_RESIDENT_WINDOW",
        "CURSOR_OUTSIDE_RESIDENT_WINDOW",
      ]),
    })
    .optional(),
  advanceState: z
    .object({
      displayPeriod: trimmedStringSchema,
      cursorRawIndex: nonNegativeIntSchema,
      displayStartIndex: nonNegativeIntSchema,
      displayEndIndex: nonNegativeIntSchema,
      chartFrameReason: z
        .enum(["CURSOR_OUTSIDE_RESIDENT_WINDOW"])
        .nullable()
        .optional(),
    })
    .optional(),
});

export const desktopSessionOrderQuoteSchema = z
  .object({
    side: sideSchema,
    priceMode: priceModeSchema,
    priceSource: z.enum(["CURRENT_CLOSE", "NEXT_OPEN"]),
    fillPriceField: z.enum(["close", "open"]),
    nextOpenDelayBars: nonNegativeIntSchema,
    nextOpenAvailable: z.boolean(),
    blockedReasonCode: nullableTrimmedStringSchema,
    blockedReason: nullableTrimmedStringSchema,
    enabled: z.boolean(),
    reasonCode: nullableTrimmedStringSchema,
    facts: jsonRecordSchema,
    estimate: z
      .object({
        side: sideSchema,
        price: finiteNumberSchema,
        qty: finiteNumberSchema,
        lots: finiteNumberSchema,
        amount: finiteNumberSchema,
        tradingCost: finiteNumberSchema,
        cashEffect: finiteNumberSchema,
      })
      .passthrough(),
    tradeCapacity: desktopTradeCapacitySummarySchema,
    projectedAfterFill: desktopProjectedAfterFillSchema,
    executionPlan: z
      .object({
        displayPeriod: nullableTrimmedStringSchema,
        fillRawIndex: nonNegativeIntSchema.nullable(),
        fillPrice: nullableFiniteNumberSchema,
        targetRawIndex: nonNegativeIntSchema.nullable(),
        nextOpenDisplayIndex: nonNegativeIntSchema.nullable(),
      })
      .optional(),
  })
  .passthrough();
