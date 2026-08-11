// SPDX-License-Identifier: GPL-3.0-only

import type {
  OrderSide as SharedOrderSide,
  PriceMode as SharedPriceMode,
  TradingSettings as SharedTradingSettings,
} from '@zinuto/shared/trading';
import type { DisplayPeriodKey, FreeReplayAdvancePeriod } from '@/domains/chart/displayPeriods';

export type Side = SharedOrderSide;
export type PriceMode = SharedPriceMode;
export type { DisplayPeriodKey, FreeReplayAdvancePeriod };

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  errorCode?: string;
  errorStage?: string;
  cause?: Record<string, unknown>;
  details?: Record<string, unknown>;
  requestId?: string;
  presentationKey?: string;
  recoveryAction?: string;
}

export interface Instrument {
  id: string;
  instrumentId?: string;
  symbol: string;
  baseTimeframe: "1m" | "5m" | "1h" | "1d";
  sourceTimeframe?: "1m" | "5m" | "1h" | "1d";
  name: string | null;
  barCount: number;
  timeStartTs?: string | null;
  timeEndTs?: string | null;
  barsVersionToken?: string;
  timeZone?: string | null;
  marketPresetId?: string;
  minTradeStep?: number;
  scopeKind: "SYSTEM" | "LOCAL";
  samplePoolId?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  displayLabel: string;
}

export interface Account {
  id: string;
  user_id: string;
  kind: 'SECURITIES';
  balance: number;
  currency: string;
}

export interface Bar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BarsRange {
  symbol: string;
  timeframe?: string;
  timeZone?: string | null;
  total: number;
  offset: number;
  limit: number;
  bars: Bar[];
}

export interface MarketBarFrame {
  schemaVersion: "zinuto-market-frame-v2";
  instrumentId: string;
  symbol: string;
  baseTimeframe: string;
  timeframe: string;
  displayPeriod: DisplayPeriodKey | string;
  timeZone?: string | null;
  totalRaw: number;
  totalDisplay: number;
  rawStartIndex: number;
  rawEndIndex: number;
  displayStartIndex: number;
  displayEndIndex: number;
  limit: number;
  hasBackward: boolean;
  hasForward: boolean;
  versionToken: string;
  displayIndex: number[];
  timestampMs: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  startRawIndex: number[];
  endRawIndex: number[];
}

export interface FreeReplayStartPointOverviewBar {
  ts: string;
  startTs?: string;
  endTs?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  startRawIndex: number;
  endRawIndex: number;
  startTrainingIndex: number;
  endTrainingIndex: number;
}

export interface FreeReplayStartPointOverviewRange {
  samplePoolId: string;
  instrumentId: string;
  symbol: string;
  sourceTimeframe: "1m" | "5m" | "1h" | "1d";
  minimumBaseTimeframe: FreeReplayAdvancePeriod;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  displayPeriod: DisplayPeriodKey;
  timeZone?: string | null;
  trainingTotal: number;
  total: number;
  offset: number;
  limit: number;
  bars: FreeReplayStartPointOverviewBar[];
}

export interface SessionBootstrap {
  session: Session;
  chartFrame: MarketBarFrame;
  snapshot: SessionSnapshot;
}

export interface ResumableSessionSummary {
  sessionId: string;
  symbol: string;
  instrumentName: string | null;
  timeframe: "1m" | "5m" | "1h" | "1d";
  minimumBaseTimeframe: FreeReplayAdvancePeriod;
  samplePoolId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  user_id: string;
  instrument_id: string;
  instrumentId?: string;
  samplePoolId: string;
  sourceTimeframe: "1m" | "5m" | "1h" | "1d";
  timeZone?: string | null;
  timeframe: string;
  minimumBaseTimeframe: FreeReplayAdvancePeriod;
  start_index: number;
  entry_index: number;
  history_bars: number;
  cursor_index: number;
  autoplay_interval_ms: number;
  is_paused: number;
  created_at: string;
  symbol: string;
  instrumentName?: string | null;
}

export interface Position {
  sessionId: string;
  instrumentId: string;
  symbol: string;
  qty: number;
  avgCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  markPrice: number;
}

export interface Fill {
  id: string;
  order_id: string;
  session_id: string;
  instrument_id: string;
  symbol: string;
  side: Side;
  fill_index: number;
  fill_time: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  created_at: string;
}

export type SessionTerminationReasonCode =
  | 'NO_POSITION_AND_CANNOT_OPEN'
  | 'NO_FUTURE_DATA'
  | 'NO_FUTURE_DATA_AND_POSITION_BLOCKED';

export interface SessionTerminationState {
  isTerminated: boolean;
  reasonCode: SessionTerminationReasonCode | null;
  assetClass: TradingSettings['assetClass'];
  hasOpenPosition: boolean;
  hasFutureBars: boolean;
  canOpenMinLong: boolean;
  canOpenMinShort: boolean;
  canFullyClosePosition: boolean;
  minTradeStep: number;
  referencePrice: number;
}

export type TrainerOrderBlockReasonCode =
  | 'NO_SESSION'
  | 'PRICE_UNAVAILABLE'
  | 'NEXT_OPEN_UNAVAILABLE'
  | 'BUYING_POWER_EMPTY'
  | 'SELLING_DISABLED'
  | 'SELL_T1_BLOCKED'
  | 'SHORT_CAPACITY_EMPTY'
  | 'QUANTITY_ZERO'
  | 'OPERATION_LIMIT_REACHED'
  | 'ENTRY_LIMIT_REACHED';

export interface TradeExecutionBreakdown {
  closeQty: number;
  openQty: number;
  closeDirection: 'LONG' | 'SHORT' | null;
  openDirection: 'LONG' | 'SHORT' | null;
}

export interface OrderEstimate {
  side: Side;
  price: number;
  qty: number;
  lots: number;
  amount: number;
  tradingCost: number;
  cashEffect: number;
  executionBreakdown: TradeExecutionBreakdown;
}

export interface ProjectedAfterFill {
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
  tradingCostBreakdown: {
    commission?: number;
    transferFee?: number;
    regulatoryFee?: number;
    platformFee?: number;
    transactionLevy?: number;
    fees: number;
    taxes: number;
    slippage: number;
    totalTradingCost: number;
  };
  marginState: {
    equity: number;
    requiredInitialEquity: number;
    requiredMaintenanceEquity: number;
    availableInitialEquity: number;
    availableMaintenanceEquity: number;
    longNotional: number;
    shortNotional: number;
  };
}

export interface TradeCapacityRatioBasis {
  kind:
    | 'CLOSE_SHORT'
    | 'LONG_BUYING_POWER'
    | 'CLOSE_LONG'
    | 'SHORT_OPEN_CAPACITY';
  quantity: number;
  amount: number;
}

export interface TradeCapacitySummary {
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
}

export type SessionOrderActionFacts = Record<string, string | number | boolean | null>;

export interface SessionOrderActionAvailability {
  enabled: boolean;
  reasonCode: TrainerOrderBlockReasonCode | null;
  facts: SessionOrderActionFacts;
}

export interface TrainerActionExecutionConclusion {
  action: "STEP" | "BUY" | "SELL" | "UNDO";
  statusCode: "NOT_ORDER" | "NO_FILL" | "FILLED";
  reasonCode: string | null;
  side: Side | null;
  fillIds: string[];
  qty: number;
  amount: number;
  tradingCost: number;
  cashEffect: number;
}

export interface TrainerSessionTradingFacts {
  sessionId: string;
  instrumentId: string;
  symbol: string;
  assetClass: TradingSettings["assetClass"];
  marketPresetId: string;
  tradeSettlementMode: TradingSettings["tradeSettlementMode"];
  freeReplayEndSettlementMode: TradingSettings["freeReplayEndSettlementMode"];
  minTradeStep: number;
  contractMultiplier: number;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  initialSecuritiesBalance: number;
  cashBalance: number;
  positionQty: number;
  positionAvgCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  markPrice: number;
  referencePrice: number | null;
  nextOpenAvailable: boolean;
}

export interface TrainerReplayAvailabilityFacts {
  statusCode: "RUNNING" | "TERMINATED";
  reasonCode: SessionTerminationReasonCode | string | null;
  hasFutureBars: boolean;
  canStep: boolean;
  canUndo: boolean;
  undoAvailableSteps: number;
  undoMaxSteps: number;
  lastUndoableAction: "STEP" | "BUY" | "SELL" | null;
}

export interface TrainerLeverageExposureSummary {
  isActive: boolean;
  isConfigured: boolean;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  holdingStartDate: string | null;
  holdingEndDate: string | null;
  longFinancingFee: number;
  cumulativeLongFinancingFee: number;
  shortAmount: number;
  shortFee: number;
  cumulativeShortFee: number;
  totalFee: number;
  shortQty: number;
  shortAmountRatio: number;
  shortQtyRatio: number;
}

export interface TrainerSessionSummaryFacts {
  currentTradingFee: number;
  positionMarketValue: number;
  securitiesTotal: number;
  securitiesDelta: number;
  cumulativePnlRate: number;
  floatingRate: number;
  selectedSymbolBarCount: number;
  trainingDays: number;
  trainingDateRange: {
    startDateKey: string | null;
    endDateKey: string | null;
  };
  klineProgress: {
    current: number;
    total: number;
    remaining: number;
  };
  leverageExposureSummary: TrainerLeverageExposureSummary;
}

export interface TrainerSessionRunConclusionFacts {
  statusCode: "RUNNING" | "TERMINATED";
  reasonCode: SessionTerminationReasonCode | string | null;
  equity: number;
  totalPnl: number;
  returnRate: number;
  lastActionExecution: TrainerActionExecutionConclusion | null;
}

export interface TrainerSessionTradingReadModel {
  schemaVersion: "trainer-session-trading-read-model.v1";
  tradingFacts: TrainerSessionTradingFacts;
  replayAvailability: TrainerReplayAvailabilityFacts;
  summary: TrainerSessionSummaryFacts;
  validation: {
    buy: SessionOrderActionAvailability;
    sell: SessionOrderActionAvailability;
    step: SessionOrderActionAvailability;
    undo: SessionOrderActionAvailability;
  };
  actionAvailability: {
    buy: SessionOrderActionAvailability;
    sell: SessionOrderActionAvailability;
    step: SessionOrderActionAvailability;
    undo: SessionOrderActionAvailability;
  };
  runConclusion: TrainerSessionRunConclusionFacts;
}

export interface SessionActionState {
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
  buyOrder?: SessionOrderActionAvailability;
  sellOrder?: SessionOrderActionAvailability;
  tradeCapacity: TradeCapacitySummary;
  canUndo: boolean;
  undoAvailableSteps: number;
  undoMaxSteps: number;
  lastUndoableAction: "STEP" | "BUY" | "SELL" | null;
  readModel?: TrainerSessionTradingReadModel;
  tradingFacts?: TrainerSessionTradingFacts;
  replayAvailability?: TrainerReplayAvailabilityFacts;
  summary?: TrainerSessionSummaryFacts;
  validation?: TrainerSessionTradingReadModel["validation"];
  actionAvailability?: TrainerSessionTradingReadModel["actionAvailability"];
  runConclusion?: TrainerSessionRunConclusionFacts;
  execution?: TrainerActionExecutionConclusion | null;
}

export interface SessionOrderQuote {
  side: Side;
  priceMode: PriceMode;
  priceSource: "CURRENT_CLOSE" | "NEXT_OPEN";
  fillPriceField: "close" | "open";
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
}

export interface SessionSnapshot {
  session: Session;
  accounts: Account[];
  sessionTradingSettings?: TradingSettings;
  positions: Position[];
  fills: Fill[];
  cashAdjustments?: Array<{
    kind?: 'LONG_FINANCING' | 'SHORT_BORROW';
    bar_index?: number;
    barIndex?: number;
    amount?: number;
    ts?: string;
    created_at?: string;
    createdAt?: string;
  }>;
  fillsTotal?: number;
  nextFillCursor?: string | null;
  residentFillsStartIndex?: number;
  tradingCostBreakdown?: {
    fees: number;
    taxes: number;
    slippage: number;
    borrowCost: number;
    financingCost: number;
    totalTradingCost: number;
  };
  longFinancingChargesTotal?: number;
  shortBorrowChargesTotal?: number;
  currentLeverageCycle?: {
    isActive: boolean;
    holdingStartDate: string | null;
    holdingEndDate: string | null;
    longFinancingFee: number;
    shortFee: number;
    totalFee: number;
  };
  termination?: SessionTerminationState;
  actionState?: SessionActionState;
  drawings: unknown[];
}

export interface SessionRuntimeDelta {
  sessionId: string;
  session: Session;
  action: "STEP" | "BUY" | "SELL" | "UNDO";
  previousCursorRawIndex: number;
  cursorRawIndex: number;
  displayPeriod: string;
  previousDisplayIndex: number | null;
  displayIndex: number | null;
  displayStartRawIndex: number;
  displayEndRawIndex: number;
  nextDisplayIndex: number | null;
  hasFutureBars: boolean;
  actionState?: SessionActionState;
  positions: Position[];
  accounts: Account[];
  sessionTradingSettings?: TradingSettings;
  tradingCostBreakdown?: SessionSnapshot["tradingCostBreakdown"];
  longFinancingChargesTotal?: number;
  shortBorrowChargesTotal?: number;
  currentLeverageCycle?: SessionSnapshot["currentLeverageCycle"];
  fills: Fill[];
  fillsTotal?: number;
  nextFillCursor?: string | null;
  residentFillsStartIndex?: number;
  termination?: SessionTerminationState;
  chartFrameDelta?: MarketBarFrame;
}

export interface SessionStepResult {
  session: Session;
  fillIds: string[];
  forcedLiquidationCount: number;
  runtimeDelta: SessionRuntimeDelta;
  chartFrame?: MarketBarFrame;
  advanceState?: {
    displayPeriod: string;
    cursorRawIndex: number;
    displayStartIndex: number;
    displayEndIndex: number;
  };
}

export interface PreparedFreeReplayCandidate {
  instrumentId: string;
  symbol: string;
  poolId: string;
  poolName: string;
  sourceTimeframe: '1m' | '5m' | '1h' | '1d';
}

export interface PreparedFreeReplayStartResult {
  selected: PreparedFreeReplayCandidate & {
    anchorIndex: number | null;
    instrumentId: string;
  };
  bootstrap: SessionBootstrap;
}

export interface PortfolioItem {
  symbol: string;
  qty: number;
  avgCost: number;
  markPrice: number;
  marketValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  pnlRate: number;
  sessionId: string;
  durationDays: number;
}

export interface PortfolioSummary {
  totalRealized: number;
  totalUnrealized: number;
  totalPnl: number;
  items: PortfolioItem[];
}

export type TradingSettings = SharedTradingSettings & {
  longFinancingAnnualRate: number;
  longInitialMarginRatio: number;
  longMaintenanceMarginRatio: number;
};

export interface TrainingSummary {
  initialAsset: number;
  endingAsset: number;
  assetReturnRate: number;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  buyCount: number;
  sellCount: number;
  totalTrades: number;
  investedAmount: number;
  tradingCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  profitRate: number;
  maxDrawdownRate: number;
  maxDrawdownAmount: number;
  decisionSecondsUsed?: number;
  decisionCount?: number;
  forcedLiquidationApplied?: boolean;
  forcedLiquidationCount?: number;
  forcedLiquidationBuyCount?: number;
  forcedLiquidationSellCount?: number;
  forcedLiquidationFallbackToCloseCount?: number;
  forcedLiquidationPriceMode?: PriceMode;
}
