// SPDX-License-Identifier: GPL-3.0-only

import type { OrderInputMode, TradingSettings } from '@zinuto/shared/trading';
import type { PriceMode, Side } from '../models.js';

export type OrderSide = Side;
export type OrderPriceMode = PriceMode;
export type TradeInputMode = OrderInputMode;
export type TradingExecutionSettings = TradingSettings;
export type PositionDirection = "LONG" | "SHORT";
export type QuotePriceSource = "CURRENT_CLOSE" | "NEXT_OPEN";
export type FillPriceField = "close" | "open";
export type RatioBasisKind =
  | "CLOSE_SHORT"
  | "LONG_BUYING_POWER"
  | "CLOSE_LONG"
  | "SHORT_OPEN_CAPACITY";

export type TrainerOrderBlockReasonCode =
  | "NO_SESSION"
  | "PRICE_UNAVAILABLE"
  | "NEXT_OPEN_UNAVAILABLE"
  | "BUYING_POWER_EMPTY"
  | "SELLING_DISABLED"
  | "SELL_T1_BLOCKED"
  | "SHORT_CAPACITY_EMPTY"
  | "QUANTITY_ZERO";

export type TradeExecutionBreakdown = {
  closeQty: number;
  openQty: number;
  closeDirection: PositionDirection | null;
  openDirection: PositionDirection | null;
};

export type OrderEstimate = {
  side: OrderSide;
  price: number;
  qty: number;
  lots: number;
  amount: number;
  tradingCost: number;
  cashEffect: number;
  executionBreakdown: TradeExecutionBreakdown;
};

export type ProjectedTradingCostBreakdown = {
  commission: number;
  transferFee: number;
  regulatoryFee: number;
  platformFee: number;
  transactionLevy: number;
  fees: number;
  taxes: number;
  slippage: number;
  totalTradingCost: number;
};

export type ProjectedMarginState = {
  equity: number;
  requiredInitialEquity: number;
  requiredMaintenanceEquity: number;
  availableInitialEquity: number;
  availableMaintenanceEquity: number;
  longNotional: number;
  shortNotional: number;
};

export type ProjectedAfterFill = {
  cashBalance: number;
  accountBalance: number;
  positionQty: number;
  avgCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  equity: number;
  longFinancingAmount: number;
  longFinancingAccrual: number;
  shortBorrowAccrual: number;
  tradingCostBreakdown: ProjectedTradingCostBreakdown;
  marginState: ProjectedMarginState;
};

export type TradeCapacityRatioBasis = {
  kind: RatioBasisKind;
  quantity: number;
  amount: number;
};

export type TradeCapacitySummary = {
  availableCash: number;
  longBuyingPowerQty: number;
  longBuyingPowerAmount: number;
  longFinancingAmount: number;
  shortOpenCapacityQty: number;
  shortOpenCapacityAmount: number;
  ratioBases: {
    buy: TradeCapacityRatioBasis;
    sell: TradeCapacityRatioBasis;
  };
};

export type SessionOrderActionFacts = Record<string, string | number | boolean | null>;

export type SessionOrderActionAvailability = {
  enabled: boolean;
  reasonCode: TrainerOrderBlockReasonCode | null;
  facts: SessionOrderActionFacts;
};

export type SessionActionState = {
  allowBuy: boolean;
  allowSell: boolean;
  allowStep: boolean;
  nextOpenAvailable: boolean;
  referencePrice: number | null;
  minTradeStep: number;
  buyBlockedReasonCode: TrainerOrderBlockReasonCode | null;
  buyBlockedReason: string | null;
  sellBlockedReasonCode: TrainerOrderBlockReasonCode | null;
  sellBlockedReason: string | null;
  buyOrder: SessionOrderActionAvailability;
  sellOrder: SessionOrderActionAvailability;
  tradeCapacity: TradeCapacitySummary;
  canUndo: boolean;
  undoAvailableSteps: number;
  undoMaxSteps: number;
  lastUndoableAction: 'STEP' | 'BUY' | 'SELL' | null;
};

export type SessionOrderQuote = {
  side: OrderSide;
  priceMode: OrderPriceMode;
  priceSource: QuotePriceSource;
  fillPriceField: FillPriceField;
  nextOpenDelayBars: number;
  nextOpenAvailable: boolean;
  blockedReasonCode: TrainerOrderBlockReasonCode | null;
  blockedReason: string | null;
  enabled: boolean;
  reasonCode: TrainerOrderBlockReasonCode | null;
  facts: SessionOrderActionFacts;
  estimate: OrderEstimate;
  tradeCapacity: TradeCapacitySummary;
  projectedAfterFill: ProjectedAfterFill;
  executionPlan?: {
    displayPeriod: string | null;
    fillRawIndex: number | null;
    fillPrice: number | null;
    targetRawIndex: number | null;
    nextOpenDisplayIndex: number | null;
  };
};

export type QuoteSessionOrderInput = {
  side: OrderSide;
  inputMode: TradeInputMode;
  lotInput?: string | number | null;
  amountInput?: string | number | null;
  ratioInput?: string | number | null;
  priceMode: OrderPriceMode;
  displayPeriod: string;
};

export type ResolvedQuoteSessionOrderInput = QuoteSessionOrderInput & {
  nextOpenDelayBars: number;
};

export type BuildOrderQuoteContext = {
  currentPositionQty: number;
  currentPositionAvgCost?: number;
  currentRealizedPnl?: number;
  currentLongFinancingAccrual?: number;
  currentShortBorrowAccrual?: number;
  securitiesBalance: number;
  currentBarClose: number;
  nextOpenPrice: number | null;
  currentFillIndex: number;
  tradingSettings: TradingExecutionSettings;
  canStep: boolean;
  canOpenMinLong: boolean;
  canOpenMinShort: boolean;
  canFullyClosePosition: boolean;
  getSameDayBoughtQtyAtFillIndex: (fillIndex: number) => number;
  undoState?: {
    availableSteps: number;
    maxSteps?: number;
    lastUndoableAction?: 'STEP' | 'BUY' | 'SELL' | null;
  };
};

export type LongBuyingPower = {
  qty: number;
  lots: number;
  amount: number;
  tradingCost: number;
  cashEffect: number;
  financingAmount: number;
};
