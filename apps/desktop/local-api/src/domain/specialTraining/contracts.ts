// SPDX-License-Identifier: GPL-3.0-only

import type { FastDecisionStrictnessLevel } from "@zinuto/shared/domain-calculations/fast-decision";
import type { FastDecisionCapitalReview } from "@zinuto/shared/domain-calculations/fast-decision-capital-review";
import type { SpecialTrainingModeId as SharedSpecialTrainingModeId } from "@zinuto/shared/specialTrainingModes";
import type {
  OrderInputMode,
  OrderSide,
  PriceMode,
} from "@zinuto/shared/trading";
import type { OhlcvBar } from "../models.js";
import type { SpecialTrainingPersistedSessionSummary } from "./sessionSummary.js";
import type { SpecialTrainingBaseTimeframe } from "./timeframeSemantics.js";

export type SpecialTrainingModeId = SharedSpecialTrainingModeId;

export type SpecialTrainingFastDecisionChoice = "LONG" | "SHORT" | "OBSERVE";
export type SpecialTrainingFastDecisionStrictnessLevel =
  FastDecisionStrictnessLevel;
export type SpecialTrainingLedgerSourceTag = "" | "SYSTEM_DEV_SIMULATION";
export type SpecialTrainingAssetClass =
  | "STOCK"
  | "FUTURES"
  | "FOREX"
  | "CRYPTO";

export type SpecialTrainingFeedbackCode =
  | "ABANDONED"
  | "DIRECTION_CORRECT"
  | "DIRECTION_WRONG"
  | "DIRECTION_TIMEOUT"
  | "RECOVERY_SUCCESS"
  | "RECOVERY_PENDING"
  | "RECOVERY_GRADE_S"
  | "RECOVERY_GRADE_A"
  | "RECOVERY_GRADE_B"
  | "RECOVERY_GRADE_C"
  | "ALPHA_POSITIVE"
  | "ALPHA_NEGATIVE"
  | "CAPTURE_HIGH"
  | "CAPTURE_LOW"
  | "DRAWDOWN_DOWNGRADED"
  | "DRAWDOWN_CONTROLLED"
  | "OPS_CONTROLLED"
  | "OPS_EXCEEDED"
  | "ALPHA_BEAT_HOLDER"
  | "ALPHA_LOSE_HOLDER"
  | "ALPHA_BEAT_STOPLOSS"
  | "ALPHA_LOSE_STOPLOSS"
  | "ALPHA_RELATIVE_STRONG"
  | "ALPHA_RELATIVE_WEAK"
  | "COST_BASIS_REDUCED"
  | "COST_BASIS_INCREASED"
  | "COST_BASIS_CLEARED";

export type SpecialTrainingOrderInputMode = OrderInputMode;
export type SpecialTrainingOrderPriceMode = PriceMode;

export type SpecialTrainingOrderBlockReasonCode =
  | "NO_SESSION"
  | "PRICE_UNAVAILABLE"
  | "NEXT_OPEN_UNAVAILABLE"
  | "BUYING_POWER_EMPTY"
  | "SELLING_DISABLED"
  | "SELL_T1_BLOCKED"
  | "SHORT_CAPACITY_EMPTY"
  | "QUANTITY_ZERO"
  | "OPERATION_LIMIT_REACHED"
  | "ENTRY_LIMIT_REACHED";

export type SpecialTrainingOrderEstimate = {
  side: OrderSide;
  price: number;
  qty: number;
  lots: number;
  amount: number;
  tradingCost: number;
  cashEffect: number;
  executionBreakdown: {
    closeQty: number;
    openQty: number;
    closeDirection: "LONG" | "SHORT" | null;
    openDirection: "LONG" | "SHORT" | null;
  };
};

export type SpecialTrainingOrderQuotePayload = {
  side: OrderSide;
  inputMode: SpecialTrainingOrderInputMode;
  lotInput?: string | number | null;
  amountInput?: string | number | null;
  ratioInput?: string | number | null;
  priceMode: SpecialTrainingOrderPriceMode;
  nextOpenDelayBars?: number;
};

export type SpecialTrainingOrderQuote = {
  side: OrderSide;
  priceMode: SpecialTrainingOrderPriceMode;
  nextOpenDelayBars: number;
  nextOpenAvailable: boolean;
  blockedReasonCode: SpecialTrainingOrderBlockReasonCode | null;
  blockedReason: string | null;
  estimate: SpecialTrainingOrderEstimate;
  executionPlan?: {
    displayPeriod: string | null;
    fillRawIndex: number | null;
    fillPrice: number | null;
    targetRawIndex: number | null;
    nextOpenDisplayIndex: number | null;
  };
};

export type SpecialTrainingTradeAction = {
  type: OrderSide;
  barIndex: number;
  inputMode: SpecialTrainingOrderInputMode;
  priceMode: SpecialTrainingOrderPriceMode;
  lotInput?: string | number | null;
  amountInput?: string | number | null;
  ratioInput?: string | number | null;
  quantity: number;
  executionPrice: number;
  cashEffect: number;
};

export type SpecialTrainingBankScope = {
  poolIds: string[];
};

export type SpecialTrainingBankScopeSummaryStatus =
  | "READY"
  | "EMPTY"
  | "REPAIR_REQUIRED"
  | "TARGET_TIMEFRAME_INVALID";

export type SpecialTrainingBankScopeBlockedReasonCode =
  | "POOL_SELECTION_REQUIRED"
  | "POOL_REPAIR_REQUIRED"
  | "SYMBOLS_REQUIRED"
  | "TARGET_TIMEFRAME_INVALID";

export type SpecialTrainingBankScopeValidation = {
  scope: {
    valid: boolean;
    blockedReasonCode:
      | "POOL_SELECTION_REQUIRED"
      | "POOL_REPAIR_REQUIRED"
      | "SYMBOLS_REQUIRED"
      | null;
    blockedReason: string | null;
  };
  targetTimeframe: {
    valid: boolean;
    blockedReasonCode: "TARGET_TIMEFRAME_INVALID" | null;
    blockedReason: string | null;
  };
};

export type SpecialTrainingBankScopeReadiness = {
  canUse: boolean;
  blockedReasonCode: SpecialTrainingBankScopeBlockedReasonCode | null;
  blockedReason: string | null;
};

export type SpecialTrainingBankScopeSummary = {
  status: SpecialTrainingBankScopeSummaryStatus;
  poolCount: number;
  instrumentCount: number;
  symbolCount: number;
  sourceTimeframes: SpecialTrainingBaseTimeframe[];
  definitionHash: string;
  missingPoolIds: string[];
  maxSourceTimeframe: SpecialTrainingBaseTimeframe | null;
  validation: SpecialTrainingBankScopeValidation;
  readiness: SpecialTrainingBankScopeReadiness;
};

export type SpecialTrainingBankSummary = {
  id: string;
  name: string;
  assetClass: SpecialTrainingAssetClass;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  scope: SpecialTrainingBankScope;
  scopeSummary: SpecialTrainingBankScopeSummary;
  simulationBatchId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListSpecialTrainingBanksPayload = {
  limit?: number;
  cursor?: string;
  keyword?: string;
};

export type ListSpecialTrainingBanksResult = {
  items: SpecialTrainingBankSummary[];
  nextCursor: string | null;
  total: number;
};

export type CreateSpecialTrainingBankPayload = {
  name: string;
  assetClass: SpecialTrainingAssetClass;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  poolIds: string[];
  simulationBatchId?: string | null;
};

export type UpdateSpecialTrainingBankPayload = CreateSpecialTrainingBankPayload;

export type SpecialTrainingQuestionState = {
  id: string;
  instrumentId: string;
  samplePoolId: string;
  barsVersionToken: string;
  symbol: string;
  timeframe: string;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  effectiveTimeframe: SpecialTrainingBaseTimeframe;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe: SpecialTrainingBaseTimeframe;
  sourceBarsPerEffectiveBar: number;
  slotIndex: number;
  scopeHash: string;
  ledgerId: string;
  bars: OhlcvBar[];
  startIndex: number;
  endIndex: number;
  effectiveWindowBarCount: number;
  sourceWindowBarCount: number;
  minTradeStep: number;
};

export type SpecialTrainingQuestionSlot = {
  instrumentId: string;
  samplePoolId: string;
  symbol: string;
  slotIndex: number;
  displayStartIndex: number;
  displayEndIndex: number;
  windowStartIndex: number;
  windowEndIndex: number;
  startIndex: number;
  endIndex: number;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe: SpecialTrainingBaseTimeframe;
  effectiveTimeframe: SpecialTrainingBaseTimeframe;
  sourceBarsPerEffectiveBar: number;
  timeZone: string;
  effectiveWindowBarCount: number;
  sourceWindowBarCount: number;
  barsVersionToken: string;
  minTradeStep: number;
};

export type SpecialTrainingQuestionSlotRange = {
  instrumentId: string;
  samplePoolId: string;
  symbol: string;
  slotStartIndex: number;
  slotCount: number;
  totalEffectiveBars: number;
  effectiveSlotStrideBars: number;
  startIndex: number;
  endIndex: number;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe: SpecialTrainingBaseTimeframe;
  effectiveTimeframe: SpecialTrainingBaseTimeframe;
  sourceBarsPerEffectiveBar: number;
  timeZone: string;
  effectiveWindowBarCount: number;
  sourceBarCount: number;
  barsVersionToken: string;
  minTradeStep: number;
};

export type SpecialTrainingQuestionScopeState = {
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  poolCount: number;
  horizonBars: number;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframes: SpecialTrainingBaseTimeframe[];
  effectiveTimeframes: SpecialTrainingBaseTimeframe[];
  timeframe: string;
  scopeHash: string;
  normalizedSymbolsWithBars: string[];
  instrumentIdsWithBars: string[];
  slotRanges: SpecialTrainingQuestionSlotRange[];
  slotRangesByInstrumentId: Map<string, SpecialTrainingQuestionSlotRange>;
  totalQuestionCount: number;
};

export type StartSpecialTrainingChallengePayload = {
  bankId: string;
  modeId: SpecialTrainingModeId;
  questionCount: number;
  timeframe?: "1m" | "5m" | "1h" | "1d";
  horizonBars?: number;
  maxOperations?: number;
  decisionSecondsLimit?: number;
  fastDecisionStrictnessLevel?: SpecialTrainingFastDecisionStrictnessLevel;
  sourceTag?: SpecialTrainingLedgerSourceTag;
  simulationBatchId?: string | null;
};

export type SpecialTrainingScopeRestartSignal = {
  reason: "SCOPE_EXHAUSTED";
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  scopeHash: string;
  timeframe: string;
  effectiveTimeframe: SpecialTrainingBaseTimeframe;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe: SpecialTrainingBaseTimeframe;
  requestedQuestionCount: number;
  totalQuestionCount: number;
  previousUsedQuestionCount: number;
  deletedLedgerCount: number;
  restartedAt: string;
};

export type SpecialTrainingPublicQuestion = {
  id: string;
  instrumentId: string;
  samplePoolId: string;
  barsVersionToken: string;
  symbol: string;
  timeframe: string;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  effectiveTimeframe: SpecialTrainingBaseTimeframe;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe: SpecialTrainingBaseTimeframe;
  bars: OhlcvBar[];
  startIndex: number;
  endIndex: number;
  minTradeStep: number;
  requestedMinimumBaseTimeframe?: string | null;
};

export type SpecialTrainingChallengeProgress = {
  challengeId: string;
  modeId: SpecialTrainingModeId;
  questionCount: number;
  settledCount: number;
  currentQuestionIndex: number | null;
  currentQuestionId: string | null;
  currentQuestionSymbol: string | null;
  latestSettlementQuestionId: string | null;
  latestSettlement: {
    questionId: string;
    passed: boolean;
    score: number;
    totalPnl: number;
    finalTotalAsset: number;
    maxDrawdownRatio: number;
    grade: string;
    feedbackCodes: string[];
    fastReview: SpecialTrainingSettlementResult["fastReview"];
    directionResult: SpecialTrainingSettlementResult["directionResult"];
  } | null;
  finishedSessionId: string | null;
  sessionSummary: SpecialTrainingPersistedSessionSummary | null;
};

export type SpecialTrainingRiskRuntimeBaseline = {
  initialCapital: number;
  cashBalance: number;
  positionQty: number;
  entryPrice: number;
};

export type SpecialTrainingRiskActionBlockReasonCode =
  | "NO_ACTIVE_QUESTION"
  | "NO_ACTIONABLE_BARS"
  | "PRICE_UNAVAILABLE"
  | "BUYING_POWER_EMPTY"
  | "POSITION_EMPTY"
  | "ENTRY_LIMIT_REACHED"
  | "QUANTITY_ZERO"
  | "UNDO_EMPTY";

export type SpecialTrainingRiskActionStatus = {
  allowed: boolean;
  blockedReasonCode: SpecialTrainingRiskActionBlockReasonCode | null;
  blockedReason: string | null;
};

export type SpecialTrainingRiskUndoActionStatus =
  SpecialTrainingRiskActionStatus & {
    availableSteps: number;
    maxSteps: number;
    lastUndoableAction:
      | "BUY_AND_ADVANCE"
      | "SELL_AND_ADVANCE"
      | "NEXT_BAR"
      | null;
  };

export type SpecialTrainingRiskActionState = {
  buyAdvance: SpecialTrainingRiskActionStatus;
  sellAdvance: SpecialTrainingRiskActionStatus;
  nextBar: SpecialTrainingRiskActionStatus;
  undo: SpecialTrainingRiskUndoActionStatus;
};

export type SpecialTrainingFastDecisionTimerState = {
  state: "INACTIVE" | "RUNNING" | "PAUSED" | "SETTLED";
  startedAt: string | null;
  deadlineAt: string | null;
  serverNow: string;
  secondsLimit: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  timedOut: boolean;
};

export type SpecialTrainingTradeRuntimeState = {
  usedOperations: number;
  openCount: number;
  positionQty: number;
  entryPrice: number;
  cashBalance: number;
  equityPeakAsset: number;
  maxDrawdownRatio: number;
  initialCapital: number;
  challengeStartAsset: number;
};

export type SpecialTrainingGravityFieldFact = {
  breakevenPrice: number | null;
  referencePrice: number | null;
  breakevenMoveRatio: number | null;
  underwater: boolean;
  gapWidth: number;
};

export type SpecialTrainingRiskRuntimeMetrics = {
  currentPrice: number | null;
  currentTotalAsset: number | null;
  floatingPnl: number | null;
  costPriceNow: number | null;
  baselineCostPrice: number | null;
  accountBreakevenPrice: number | null;
  holderReference: {
    holderPnl: number;
    actualPnl: number;
    rescueAlpha: number;
  } | null;
  survivalProgress: {
    progressed: number;
    total: number;
    remainingActionableBars: number;
    remainingActionableRatio: number;
  };
  gravityField: SpecialTrainingGravityFieldFact | null;
};

export type SpecialTrainingChallengeRuntime = {
  challengeId: string;
  modeId: SpecialTrainingModeId;
  activityPaused: boolean;
  questionCount: number;
  settledCount: number;
  currentQuestionIndex: number | null;
  currentQuestionId: string | null;
  question: SpecialTrainingPublicQuestion | null;
  cursorIndex: number | null;
  questionStartIndex: number | null;
  questionEndIndex: number | null;
  tradeRuntime: SpecialTrainingTradeRuntimeState | null;
  riskBaseline: SpecialTrainingRiskRuntimeBaseline | null;
  riskMetrics: SpecialTrainingRiskRuntimeMetrics | null;
  fastDecisionTimer: SpecialTrainingFastDecisionTimerState | null;
  tradeActions: SpecialTrainingTradeAction[];
  currentPrice: number | null;
  currentTotalAsset: number | null;
  floatingPnl: number | null;
  remainingActionableBars: number;
  buyEstimate: {
    qty: number | null;
    cashEffect: number | null;
  } | null;
  sellEstimate: {
    qty: number | null;
    cashEffect: number | null;
  } | null;
  actionState: SpecialTrainingRiskActionState | null;
  sessionSummary: SpecialTrainingPersistedSessionSummary | null;
};

export type SpecialTrainingChallengeCommandResult = {
  runtime: SpecialTrainingChallengeRuntime;
  progress: SpecialTrainingChallengeProgress;
  settlement: SpecialTrainingSettlementResult | null;
};

export type SpecialTrainingChallengeActivityResult = {
  challengeId: string;
  paused: boolean;
  runtime: SpecialTrainingChallengeRuntime;
};

export type DiscardSpecialTrainingChallengeResult = {
  challengeId: string;
  deleted: boolean;
  releasedQuestionLedgerRows: number;
};

export type StartSpecialTrainingChallengeResult = {
  challengeId: string;
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  scopeHash: string;
  questionCount: number;
  createdAt: string;
  expiresAt: string;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  effectiveTimeframe?: SpecialTrainingBaseTimeframe;
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe?: SpecialTrainingBaseTimeframe;
  runtime: SpecialTrainingChallengeRuntime;
  progress: SpecialTrainingChallengeProgress;
  scopeRestart: SpecialTrainingScopeRestartSignal | null;
};

export type SpecialTrainingQuestionBankPreviewPayload = {
  bankId: string;
  modeId: SpecialTrainingModeId;
  questionCount?: number;
  horizonBars?: number;
  previousSummary?: SpecialTrainingQuestionBankPreviousSummary | null;
  activeSession?: SpecialTrainingQuestionBankActiveSession | null;
};

export type SpecialTrainingQuestionBankDraftPreviewPayload = {
  assetClass: SpecialTrainingAssetClass;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  poolIds: string[];
};

export type SpecialTrainingQuestionBankBuildPayload = {
  bankId: string;
  modeId: SpecialTrainingModeId;
  targetQuestionCount?: number;
  horizonBars?: number;
};

export type SpecialTrainingQuestionBankResetPayload = {
  bankId: string;
  modeId: SpecialTrainingModeId;
  questionCount?: number;
  horizonBars?: number;
  activeSession?: SpecialTrainingQuestionBankActiveSession | null;
};

export type SpecialTrainingQuestionBankPreviousSummary = {
  scopeHash?: string | null;
  poolCount?: number | null;
  instrumentCount?: number | null;
  symbolCount?: number | null;
  totalQuestionCount?: number | null;
  completedQuestionCount?: number | null;
};

export type SpecialTrainingQuestionBankActiveSession = {
  hasLiveChallengeSession?: boolean | null;
  modeId?: SpecialTrainingModeId | null;
  scopeHash?: string | null;
};

export type SpecialTrainingQuestionBankRuntimeStatus =
  | "EMPTY"
  | "READY_FRESH"
  | "READY_IN_PROGRESS"
  | "AUTO_SWITCHED";

export type SpecialTrainingQuestionBankNoticeKind =
  | "AUTO_SWITCHED_RANGE"
  | "AUTO_SWITCHED_REVISION"
  | "ACTIVE_SESSION_STALE"
  | "RESET_DONE"
  | null;

export type SpecialTrainingQuestionBankCapacityFacts = {
  requestedQuestionCount: number;
  hasCapacityForRun: boolean;
  willRestartQuestionScope: boolean;
  totalQuestionCount: number;
  availableQuestionCount: number;
};

export type SpecialTrainingQuestionBankActionAvailability = {
  enabled: boolean;
  reasonCode: string | null;
};

export type SpecialTrainingQuestionBankActionFacts = {
  start: SpecialTrainingQuestionBankActionAvailability & {
    hasCapacityForRun: boolean;
    willRestartQuestionScope: boolean;
  };
  reset: SpecialTrainingQuestionBankActionAvailability & {
    hasProgress: boolean;
  };
};

export type SpecialTrainingQuestionBankRuntimeFacts = {
  status: SpecialTrainingQuestionBankRuntimeStatus;
  noticeKind: SpecialTrainingQuestionBankNoticeKind;
  noticeReasonCode: string | null;
  shouldAppendOldProgressNotice: boolean;
  sessionUsesOldSnapshot: boolean;
};

export type SpecialTrainingQuestionBankSummary = {
  bankId: string;
  bankName: string;
  modeId: SpecialTrainingModeId;
  scopeHash: string;
  status: "EMPTY" | "READY_FRESH" | "READY_IN_PROGRESS";
  targetTimeframe: SpecialTrainingBaseTimeframe;
  effectiveTimeframe?: SpecialTrainingBaseTimeframe;
  effectiveTimeframes: SpecialTrainingBaseTimeframe[];
  minimumBaseTimeframe: SpecialTrainingBaseTimeframe;
  sourceTimeframe?: SpecialTrainingBaseTimeframe;
  sourceTimeframes: SpecialTrainingBaseTimeframe[];
  poolCount: number;
  instrumentCount: number;
  symbolCount: number;
  totalQuestionCount: number;
  completedQuestionCount: number;
  remainingQuestionCount: number;
  availableQuestionCount: number;
  builtQuestionCount: number;
  capacity: SpecialTrainingQuestionBankCapacityFacts;
  actionAvailability: SpecialTrainingQuestionBankActionFacts;
  runtimeState: SpecialTrainingQuestionBankRuntimeFacts;
  updatedAt: string;
  expiresAt: string | null;
};

export type ListSpecialTrainingHistorySessionsPayload = {
  modeId?: SpecialTrainingModeId;
  limit?: number;
};

export type SettleSpecialTrainingQuestionPayload = {
  abandoned?: boolean;
  cursorIndex?: number;
  decisionSecondsUsed?: number;
  fastDecision?: {
    selection: SpecialTrainingFastDecisionChoice;
    decisionSecondsUsed?: number;
    timedOut?: boolean;
  };
  tradeActions?: SpecialTrainingTradeAction[];
};

export type SpecialTrainingRiskDisciplineFirstAction = {
  behavior: 'CUT_LOSS' | 'ADD_POSITION' | 'FREEZE';
  barsSinceStart: number;
};

export type SpecialTrainingSettlementResult = {
  score: number;
  passed: boolean;
  totalPnl: number;
  finalTotalAsset: number;
  feedbackCodes: SpecialTrainingFeedbackCode[];
  usedOperations: number;
  maxOperations: number;
  directionResult: {
    selection: SpecialTrainingFastDecisionChoice;
    actual: SpecialTrainingFastDecisionChoice;
    correct: boolean;
    timedOut: boolean;
    decisionSecondsUsed: number;
    revealEndIndex: number;
    strictnessLevel: SpecialTrainingFastDecisionStrictnessLevel;
    dominanceRatio: number;
    selectedMfeRatio: number;
    selectedMaeRatio: number;
    selectedMfeMaeRatio: number;
    opportunityDirection: SpecialTrainingFastDecisionChoice;
    opportunityMfeRatio: number;
    opportunityMaeRatio: number;
    opportunityMfeMaeRatio: number;
    longMfeRatio: number;
    longMaeRatio: number;
  } | null;
  recoveryRate: number | null;
  alpha: number | null;
  captureRate: number | null;
  maxDrawdownRatio: number;
  grade: string;
  riskReview: {
    alphaVsHold: number;
    alphaVsHardStop: number;
    equityCurves: {
      user: Array<{ barIndex: number; asset: number }>;
      hold: Array<{ barIndex: number; asset: number }>;
      hardStop: Array<{ barIndex: number; asset: number }>;
    };
    costBasisShift: {
      initialCostBasis: number | null;
      finalCostBasis: number | null;
      referencePrice: number | null;
      shiftValue: number | null;
      shiftRatio: number | null;
    };
  } | null;
  fastReview: FastDecisionCapitalReview | null;
  riskDisciplineFirstAction?: SpecialTrainingRiskDisciplineFirstAction | null;
  sessionCompletion?: {
    completed: boolean;
    completedCount: number;
    questionCount: number;
    finishedSessionId: string | null;
  };
  sessionSummary?: SpecialTrainingPersistedSessionSummary | null;
};
