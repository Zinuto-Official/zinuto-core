// SPDX-License-Identifier: GPL-3.0-only

import type { Bar } from "@/domains/training/types";
import type { FastDecisionCapitalReview } from "@zinuto/shared/domain-calculations/fast-decision-capital-review";
import type { OperatorSummary as ApiOperatorSummary } from "@zinuto/shared/operatorSummary";
import type {
  OrderInputMode,
  OrderSide,
  PriceMode,
} from "@zinuto/shared/trading";
export type {
  ApiChallengeStatsDashboardInsights,
  ApiChallengeStatsRiskBehaviorType,
} from "@/api/trainingStatsShared";

export type ApiSpecialTrainingModeId =
  "fast-decision-training" | "risk-discipline-training";

export type ApiSpecialTrainingFastDecisionChoice = "LONG" | "SHORT" | "OBSERVE";
export type ApiSpecialTrainingFastDecisionStrictnessLevel =
  "LENIENT" | "STANDARD" | "STRICT";
export type ApiSpecialTrainingRiskBehaviorType =
  "CUT_LOSS" | "ADD_POSITION" | "FREEZE";
export type ApiSpecialTrainingRiskDisciplineFirstAction = {
  behavior: ApiSpecialTrainingRiskBehaviorType;
  barsSinceStart: number;
};
export type ApiSpecialTrainingAssetClass =
  "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
export type ApiSpecialTrainingDurationEstimateOperatorMode = "HUMAN";
export type ApiSpecialTrainingDurationEstimateBasis =
  "EXACT_HISTORY" | "SIMILAR_HISTORY" | "MODE_HISTORY" | "FORMULA_FALLBACK";

export type ApiSpecialTrainingDurationEstimateRequest = {
  modeId: ApiSpecialTrainingModeId;
  operatorMode: ApiSpecialTrainingDurationEstimateOperatorMode;
  questionCount: number;
  horizonBars: number;
  decisionSecondsLimit?: number;
};

export type ApiSpecialTrainingDurationEstimateResponse = {
  minMinutes: number;
  maxMinutes: number;
  basis: ApiSpecialTrainingDurationEstimateBasis;
  sampleCount: number;
};

export type ApiSpecialTrainingFeedbackCode =
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
  | "ALPHA_BEAT_HOLDER"
  | "ALPHA_LOSE_HOLDER"
  | "ALPHA_BEAT_STOPLOSS"
  | "ALPHA_LOSE_STOPLOSS"
  | "ALPHA_RELATIVE_STRONG"
  | "ALPHA_RELATIVE_WEAK"
  | "COST_BASIS_REDUCED"
  | "COST_BASIS_INCREASED"
  | "COST_BASIS_CLEARED"
  | "RISK_COST_OFFSET_NARROWED"
  | "RISK_COST_OFFSET_WIDENED"
  | "OPS_CONTROLLED"
  | "OPS_EXCEEDED";

export type ApiSpecialTrainingTradeAction = {
  type: OrderSide;
  barIndex: number;
  inputMode: ApiSpecialTrainingOrderInputMode;
  priceMode: ApiSpecialTrainingOrderPriceMode;
  lotInput?: string | number | null;
  amountInput?: string | number | null;
  ratioInput?: string | number | null;
  quantity: number;
  executionPrice: number;
  cashEffect: number;
};

export type ApiSpecialTrainingOrderInputMode = OrderInputMode;
export type ApiSpecialTrainingOrderPriceMode = PriceMode;
export type ApiSpecialTrainingOrderBlockReasonCode =
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

export type ApiSpecialTrainingOrderEstimate = {
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

export type ApiSpecialTrainingOrderQuote = {
  side: OrderSide;
  priceMode: ApiSpecialTrainingOrderPriceMode;
  nextOpenDelayBars: number;
  nextOpenAvailable: boolean;
  blockedReasonCode: ApiSpecialTrainingOrderBlockReasonCode | null;
  blockedReason: string | null;
  estimate: ApiSpecialTrainingOrderEstimate;
  executionPlan?: {
    displayPeriod: string | null;
    fillRawIndex: number | null;
    fillPrice: number | null;
    targetRawIndex: number | null;
    nextOpenDisplayIndex: number | null;
  };
};

export type ApiSpecialTrainingOrderQuotePayload = {
  side: "BUY" | "SELL";
  inputMode: ApiSpecialTrainingOrderInputMode;
  lotInput?: string | number | null;
  amountInput?: string | number | null;
  ratioInput?: string | number | null;
  priceMode: ApiSpecialTrainingOrderPriceMode;
  nextOpenDelayBars?: number;
};

export type ApiSpecialTrainingBankScopeSummary = {
  status: "READY" | "EMPTY" | "REPAIR_REQUIRED" | "TARGET_TIMEFRAME_INVALID";
  poolCount: number;
  instrumentCount: number;
  symbolCount: number;
  sourceTimeframes: Array<"1m" | "5m" | "1h" | "1d">;
  definitionHash: string;
  missingPoolIds: string[];
  maxSourceTimeframe: "1m" | "5m" | "1h" | "1d" | null;
  validation?: {
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
  readiness?: {
    canUse: boolean;
    blockedReasonCode:
      | "POOL_SELECTION_REQUIRED"
      | "POOL_REPAIR_REQUIRED"
      | "SYMBOLS_REQUIRED"
      | "TARGET_TIMEFRAME_INVALID"
      | null;
    blockedReason: string | null;
  };
};

export type ApiSpecialTrainingBank = {
  id: string;
  name: string;
  assetClass: ApiSpecialTrainingAssetClass;
  targetTimeframe: "1m" | "5m" | "1h" | "1d";
  scope: {
    poolIds: string[];
  };
  scopeSummary: ApiSpecialTrainingBankScopeSummary;
  simulationBatchId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiSpecialTrainingBankPage = {
  items: ApiSpecialTrainingBank[];
  nextCursor: string | null;
  total: number;
};

export type ApiSpecialTrainingQuestion = {
  id: string;
  instrumentId?: string;
  samplePoolId?: string;
  barsVersionToken?: string;
  symbol: string;
  timeframe?: "1m" | "5m" | "1h" | "1d";
  targetTimeframe: "1m" | "5m" | "1h" | "1d";
  effectiveTimeframe?: "1m" | "5m" | "1h" | "1d";
  minimumBaseTimeframe: "1m" | "5m" | "1h" | "1d";
  sourceTimeframe?: "1m" | "5m" | "1h" | "1d";
  sourceBarsPerEffectiveBar?: number;
  bars: Bar[];
  startIndex: number;
  endIndex: number;
  effectiveWindowBarCount?: number;
  sourceWindowBarCount?: number;
  minTradeStep: number;
};

export type ApiSpecialTrainingQuestionMetadata = Omit<
  ApiSpecialTrainingQuestion,
  "bars"
> & {
  bars?: Bar[];
};

export type ApiSpecialTrainingScopeRestartSignal = {
  reason: "SCOPE_EXHAUSTED";
  bankId: string;
  bankName: string;
  modeId: ApiSpecialTrainingModeId;
  scopeHash: string;
  timeframe: string;
  targetTimeframe?: "1m" | "5m" | "1h" | "1d";
  effectiveTimeframe?: "1m" | "5m" | "1h" | "1d";
  minimumBaseTimeframe?: "1m" | "5m" | "1h" | "1d";
  sourceTimeframe?: "1m" | "5m" | "1h" | "1d";
  requestedQuestionCount: number;
  totalQuestionCount: number;
  previousUsedQuestionCount: number;
  deletedLedgerCount: number;
  restartedAt: string;
};

export type ApiSpecialTrainingChallenge = {
  challengeId: string;
  bankId: string;
  bankName: string;
  modeId: ApiSpecialTrainingModeId;
  scopeHash: string;
  questionCount: number;
  createdAt: string;
  expiresAt: string;
  targetTimeframe?: "1m" | "5m" | "1h" | "1d";
  effectiveTimeframe?: "1m" | "5m" | "1h" | "1d";
  minimumBaseTimeframe?: "1m" | "5m" | "1h" | "1d";
  sourceTimeframe?: "1m" | "5m" | "1h" | "1d";
  runtime: ApiSpecialTrainingChallengeRuntime;
  progress: ApiSpecialTrainingChallengeProgress;
  scopeRestart: ApiSpecialTrainingScopeRestartSignal | null;
};

export type ApiSpecialTrainingRiskRuntimeBaseline = {
  initialCapital: number;
  cashBalance: number;
  positionQty: number;
  entryPrice: number;
};

export type ApiSpecialTrainingRiskActionBlockReasonCode =
  | "NO_ACTIVE_QUESTION"
  | "NO_ACTIONABLE_BARS"
  | "PRICE_UNAVAILABLE"
  | "BUYING_POWER_EMPTY"
  | "POSITION_EMPTY"
  | "ENTRY_LIMIT_REACHED"
  | "QUANTITY_ZERO"
  | "UNDO_EMPTY";

export type ApiSpecialTrainingRiskActionState = {
  buyAdvance: {
    allowed: boolean;
    blockedReasonCode: ApiSpecialTrainingRiskActionBlockReasonCode | null;
    blockedReason: string | null;
  };
  sellAdvance: {
    allowed: boolean;
    blockedReasonCode: ApiSpecialTrainingRiskActionBlockReasonCode | null;
    blockedReason: string | null;
  };
  nextBar: {
    allowed: boolean;
    blockedReasonCode: ApiSpecialTrainingRiskActionBlockReasonCode | null;
    blockedReason: string | null;
  };
  undo: {
    allowed: boolean;
    blockedReasonCode: ApiSpecialTrainingRiskActionBlockReasonCode | null;
    blockedReason: string | null;
    availableSteps: number;
    maxSteps: number;
    lastUndoableAction:
      "BUY_AND_ADVANCE" | "SELL_AND_ADVANCE" | "NEXT_BAR" | null;
  };
};

export type ApiSpecialTrainingFastDecisionTimerState = {
  state: "INACTIVE" | "RUNNING" | "PAUSED" | "SETTLED";
  startedAt: string | null;
  deadlineAt: string | null;
  serverNow: string;
  secondsLimit: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  timedOut: boolean;
};

export type ApiSpecialTrainingGravityFieldFact = {
  breakevenPrice: number | null;
  referencePrice: number | null;
  breakevenMoveRatio: number | null;
  underwater: boolean;
  gapWidth: number;
};

export type ApiSpecialTrainingRiskRuntimeMetrics = {
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
  gravityField: ApiSpecialTrainingGravityFieldFact | null;
};

export type ApiSpecialTrainingQuestionBankActionAvailability = {
  enabled: boolean;
  reasonCode: string | null;
};

export type ApiSpecialTrainingQuestionBankActionFacts = {
  start: ApiSpecialTrainingQuestionBankActionAvailability & {
    hasCapacityForRun: boolean;
    willRestartQuestionScope: boolean;
  };
  reset: ApiSpecialTrainingQuestionBankActionAvailability & {
    hasProgress: boolean;
  };
};

export type ApiSpecialTrainingQuestionBankRuntimeFacts = {
  status: "EMPTY" | "READY_FRESH" | "READY_IN_PROGRESS" | "AUTO_SWITCHED";
  noticeKind:
    | "AUTO_SWITCHED_RANGE"
    | "AUTO_SWITCHED_REVISION"
    | "ACTIVE_SESSION_STALE"
    | "RESET_DONE"
    | null;
  noticeReasonCode: string | null;
  shouldAppendOldProgressNotice: boolean;
  sessionUsesOldSnapshot: boolean;
};

export type ApiSpecialTrainingQuestionBankCapacityFacts = {
  requestedQuestionCount: number;
  hasCapacityForRun: boolean;
  willRestartQuestionScope: boolean;
  totalQuestionCount: number;
  availableQuestionCount: number;
};

export type ApiSpecialTrainingQuestionBankSummary = {
  bankId: string;
  bankName: string;
  modeId: ApiSpecialTrainingModeId;
  scopeHash: string;
  status: "EMPTY" | "READY_FRESH" | "READY_IN_PROGRESS";
  targetTimeframe?: "1m" | "5m" | "1h" | "1d";
  effectiveTimeframe?: "1m" | "5m" | "1h" | "1d";
  effectiveTimeframes?: Array<"1m" | "5m" | "1h" | "1d">;
  minimumBaseTimeframe?: "1m" | "5m" | "1h" | "1d";
  sourceTimeframe?: "1m" | "5m" | "1h" | "1d";
  sourceTimeframes?: Array<"1m" | "5m" | "1h" | "1d">;
  poolCount: number;
  instrumentCount: number;
  totalQuestionCount: number;
  completedQuestionCount: number;
  remainingQuestionCount: number;
  symbolCount: number;
  availableQuestionCount: number;
  builtQuestionCount: number;
  capacity: ApiSpecialTrainingQuestionBankCapacityFacts;
  actionAvailability: ApiSpecialTrainingQuestionBankActionFacts;
  runtimeState: ApiSpecialTrainingQuestionBankRuntimeFacts;
  updatedAt: string;
  expiresAt: string | null;
};

export type ApiSpecialTrainingQuestionBankDraftPreviewRequest = {
  assetClass: ApiSpecialTrainingAssetClass;
  targetTimeframe: "1m" | "5m" | "1h" | "1d";
  poolIds: string[];
};

export type ApiSpecialTrainingBankEditorStep = "CONFIG" | "PREVIEW";
export type ApiSpecialTrainingBankEditorReasonCode =
  | "NAME_REQUIRED"
  | "POOL_SELECTION_REQUIRED"
  | "POOL_REPAIR_REQUIRED"
  | "SYMBOLS_REQUIRED"
  | "TARGET_TIMEFRAME_INVALID";
export type ApiSpecialTrainingBankEditorPoolReasonCode =
  | "TARGET_TIMEFRAME_TOO_LOW"
  | "NO_SYMBOLS"
  | "NO_INSTRUMENTS"
  | "POOL_REPAIR_REQUIRED";
export type ApiSpecialTrainingBankEditorReadiness = {
  enabled: boolean;
  reasonCode: ApiSpecialTrainingBankEditorReasonCode | null;
  facts: Record<string, unknown>;
};
export type ApiSpecialTrainingBankEditorReadModel = {
  enabled: boolean;
  reasonCode: ApiSpecialTrainingBankEditorReasonCode | null;
  facts: {
    step: ApiSpecialTrainingBankEditorStep;
    selectedPoolCount: number;
    missingPoolCount: number;
    enabledInstrumentCount: number;
    compatibleSelectedPoolIds: string[];
    autoRemovedPoolIds: string[];
    poolReadinessById: Record<
      string,
      {
        disabled: boolean;
        reasonCode: ApiSpecialTrainingBankEditorPoolReasonCode | null;
      }
    >;
    validation: {
      name: ApiSpecialTrainingBankEditorReadiness;
      pools: ApiSpecialTrainingBankEditorReadiness;
      preview: ApiSpecialTrainingBankEditorReadiness;
    };
    scopeSummary: ApiSpecialTrainingBankScopeSummary | null;
  };
  readiness: {
    config: ApiSpecialTrainingBankEditorReadiness;
    preview: ApiSpecialTrainingBankEditorReadiness;
    current: ApiSpecialTrainingBankEditorReadiness;
  };
};
export type ApiSpecialTrainingBankEditorReadModelRequest = {
  step: ApiSpecialTrainingBankEditorStep;
  draft: {
    sourceBankId?: string | null;
    name: string;
    assetClass?: ApiSpecialTrainingAssetClass;
    targetTimeframe: "1m" | "5m" | "1h" | "1d";
    poolIds: string[];
  };
  availablePoolIds?: string[];
};

export type ApiSpecialTrainingRiskCurvePoint = {
  barIndex?: number;
  x?: number;
  asset?: number;
  y?: number;
};

export type ApiSpecialTrainingRiskReviewEquityCurves = {
  labels?: string[];
  user?: Array<number | ApiSpecialTrainingRiskCurvePoint>;
  hold?: Array<number | ApiSpecialTrainingRiskCurvePoint>;
  hardStop?: Array<number | ApiSpecialTrainingRiskCurvePoint>;
};

export type ApiSpecialTrainingRiskReviewCostBasisShift = {
  initialCostBasis?: number | null;
  finalCostBasis?: number | null;
  referencePrice?: number | null;
  initialAvgCost?: number | null;
  finalAvgCost?: number | null;
  shiftRatio?: number | null;
  shiftPercent?: number | null;
  shiftValue?: number | null;
};

export type ApiSpecialTrainingRiskReview = {
  alphaVsHold?: number | null;
  alphaVsHardStop?: number | null;
  equityCurves?: ApiSpecialTrainingRiskReviewEquityCurves | null;
  costBasisShift?: ApiSpecialTrainingRiskReviewCostBasisShift | null;
};

export type ApiSpecialTrainingSettlement = {
  score: number;
  passed: boolean;
  totalPnl: number;
  finalTotalAsset: number;
  feedbackCodes: ApiSpecialTrainingFeedbackCode[];
  usedOperations: number;
  maxOperations: number;
  directionResult: {
    selection: ApiSpecialTrainingFastDecisionChoice;
    actual: ApiSpecialTrainingFastDecisionChoice;
    correct: boolean;
    timedOut: boolean;
    decisionSecondsUsed: number;
    revealEndIndex: number;
    strictnessLevel: ApiSpecialTrainingFastDecisionStrictnessLevel;
    dominanceRatio: number;
    selectedMfeRatio: number;
    selectedMaeRatio: number;
    selectedMfeMaeRatio: number;
    opportunityDirection: ApiSpecialTrainingFastDecisionChoice;
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
  riskReview?: ApiSpecialTrainingRiskReview | null;
  fastReview?: FastDecisionCapitalReview | null;
  riskDisciplineFirstAction?: ApiSpecialTrainingRiskDisciplineFirstAction | null;
  sessionCompletion?: {
    completed: boolean;
    completedCount: number;
    questionCount: number;
    finishedSessionId: string | null;
  };
  sessionSummary?: ApiSpecialTrainingSessionSummary | null;
};

export type ApiSpecialTrainingChallengeProgress = {
  challengeId: string;
  modeId: ApiSpecialTrainingModeId;
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
    fastReview: FastDecisionCapitalReview | null;
    directionResult: ApiSpecialTrainingSettlement["directionResult"];
  } | null;
  finishedSessionId: string | null;
  sessionSummary: ApiSpecialTrainingSessionSummary | null;
};

export type ApiSpecialTrainingChallengeRuntime = {
  challengeId: string;
  modeId: ApiSpecialTrainingModeId;
  activityPaused: boolean;
  questionCount: number;
  settledCount: number;
  currentQuestionIndex: number | null;
  currentQuestionId: string | null;
  question: ApiSpecialTrainingQuestion | null;
  cursorIndex: number | null;
  questionStartIndex: number | null;
  questionEndIndex: number | null;
  tradeRuntime: {
    usedOperations: number;
    openCount: number;
    positionQty: number;
    entryPrice: number;
    cashBalance: number;
    equityPeakAsset: number;
    maxDrawdownRatio: number;
    initialCapital: number;
    challengeStartAsset: number;
  } | null;
  riskBaseline: ApiSpecialTrainingRiskRuntimeBaseline | null;
  riskMetrics: ApiSpecialTrainingRiskRuntimeMetrics | null;
  fastDecisionTimer: ApiSpecialTrainingFastDecisionTimerState | null;
  tradeActions: ApiSpecialTrainingTradeAction[];
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
  actionState: ApiSpecialTrainingRiskActionState | null;
  sessionSummary: ApiSpecialTrainingSessionSummary | null;
};

export type ApiSpecialTrainingChallengeCommandResult = {
  runtime: ApiSpecialTrainingChallengeRuntime;
  progress: ApiSpecialTrainingChallengeProgress;
  settlement: ApiSpecialTrainingSettlement | null;
};

export type ApiSpecialTrainingChallengeActivityResult = {
  challengeId: string;
  paused: boolean;
  runtime: ApiSpecialTrainingChallengeRuntime;
};

export type ApiSpecialTrainingChallengeDiscardResult = {
  challengeId: string;
  deleted: boolean;
  releasedQuestionLedgerRows: number;
};

export type ApiSpecialTrainingHistoryQuestionSummary = {
  id: string;
  questionOrder: number;
  symbol: string;
  timeframe: string;
  baseTimeframe: "1m" | "5m" | "1h" | "1d" | null;
  effectiveTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  minimumBaseTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  sourceTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  startIndex: number;
  endIndex: number;
  minTradeStep: number;
  settlementStatus: "SETTLED" | "ABANDONED";
  score: number;
  passed: boolean;
  totalPnl: number;
  finalTotalAsset: number;
  usedOperations: number;
  maxOperations: number;
  maxDrawdownRatio: number;
  performanceRate: number;
  grade: string;
  createdAt: string;
  settledAt: string;
  updatedAt: string;
};

export type ApiSpecialTrainingHistoryQuestionDetail = {
  id: string;
  questionOrder: number;
  symbol: string;
  timeframe: string;
  baseTimeframe: "1m" | "5m" | "1h" | "1d" | null;
  effectiveTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  minimumBaseTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  sourceTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  bars: Bar[];
  startIndex: number;
  endIndex: number;
  cursorIndex: number | null;
  revealEndIndex: number | null;
  minTradeStep: number;
  settlementStatus: "SETTLED" | "ABANDONED";
  score: number;
  passed: boolean;
  totalPnl: number;
  finalTotalAsset: number;
  usedOperations: number;
  maxOperations: number;
  decisionSelection: string | null;
  decisionActual: string | null;
  decisionCorrect: boolean | null;
  decisionTimedOut: boolean | null;
  decisionSecondsUsed: number | null;
  strictnessLevel: string | null;
  dominanceRatio: number | null;
  selectedMfeRatio: number | null;
  selectedMaeRatio: number | null;
  selectedMfeMaeRatio: number | null;
  opportunityDirection: string | null;
  opportunityMfeRatio: number | null;
  opportunityMaeRatio: number | null;
  opportunityMfeMaeRatio: number | null;
  longMfeRatio: number | null;
  longMaeRatio: number | null;
  recoveryRate: number | null;
  alpha: number | null;
  captureRate: number | null;
  maxDrawdownRatio: number;
  grade: string;
  feedbackCodes: string[];
  riskReview: ApiSpecialTrainingRiskReview | null;
  fastReview?: FastDecisionCapitalReview | null;
  tradeActions: ApiSpecialTrainingTradeAction[];
  replayHydrationStatus?:
    "READY" | "SOURCE_CHANGED" | "SOURCE_MISSING" | "SNAPSHOT_ONLY" | "EXPIRED";
  detailExpiredAt?: string | null;
  createdAt: string;
  settledAt: string;
  updatedAt: string;
};

export type ApiSpecialTrainingFastDecisionCapitalSessionSummary = {
  initialAsset: number;
  questionCount: number;
  totalInvested: number;
  aggregateFinalAsset: number;
  aggregatePnl: number;
  aggregateReturnRate: number;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  bestReviewIndex: number | null;
  worstReviewIndex: number | null;
};

export type ApiSpecialTrainingSessionGrade = "S" | "A" | "B" | "C" | "F";
export type ApiSpecialTrainingSessionGradeTone =
  "elite" | "strong" | "steady" | "warning" | "danger";
export type ApiSpecialTrainingSessionMetricTone =
  "accent" | "neutral" | "warning" | "danger";
export type ApiSpecialTrainingFastDecisionSessionPresentation = {
  grade: ApiSpecialTrainingSessionGrade;
  gradeTone: ApiSpecialTrainingSessionGradeTone;
  commentary: {
    templateCode: "POSITIVE" | "NEUTRAL" | "CONTRAST";
    speedCode: "RAPID" | "STEADY" | "MEASURED";
    accuracyCode: "SHARP" | "OKAY" | "WEAK";
  };
  decisionMetricTone: ApiSpecialTrainingSessionMetricTone;
  biasCode: "LONG" | "SHORT" | "OBSERVE" | "BALANCED";
  directionStats: Array<{
    id: ApiSpecialTrainingFastDecisionChoice;
    attemptCount: number;
    correctCount: number;
    wrongCount: number;
    accuracyRate: number;
    tone: ApiSpecialTrainingSessionMetricTone;
  }>;
};

export type ApiSpecialTrainingFastDecisionSessionSummary = {
  version: 1;
  modeId: "fast-decision-training";
  completedCount: number;
  passCount: number;
  failCount: number;
  totalScore: number;
  averageScore: number;
  totalPnl: number;
  averagePnl: number;
  averageMaxDrawdownRatio: number;
  maxMaxDrawdownRatio: number;
  gradeCounts: Record<string, number>;
  winRate: number;
  averageDecisionSeconds: number;
  maxCorrectStreak: number;
  missCount: number;
  missRate: number;
  timeoutCount: number;
  observeMissCount: number;
  selectionCounts: Record<ApiSpecialTrainingFastDecisionChoice, number>;
  actualCounts: Record<ApiSpecialTrainingFastDecisionChoice, number>;
  capitalSummary: ApiSpecialTrainingFastDecisionCapitalSessionSummary;
  presentation: ApiSpecialTrainingFastDecisionSessionPresentation;
};

export type ApiSpecialTrainingRiskBehaviorSummary = {
  count: number;
  survivedCount: number;
  comebackCount: number;
  averageFirstActionBars: number;
  survivalRate: number;
  comebackRate: number;
};

export type ApiSpecialTrainingRiskDisciplineSessionSummary = {
  version: 1;
  modeId: "risk-discipline-training";
  completedCount: number;
  passCount: number;
  failCount: number;
  totalScore: number;
  averageScore: number;
  totalPnl: number;
  averagePnl: number;
  averageMaxDrawdownRatio: number;
  maxMaxDrawdownRatio: number;
  gradeCounts: Record<string, number>;
  survivalCount: number;
  survivalRate: number;
  comebackCount: number;
  comebackRate: number;
  averageAlpha: number;
  averageCostReductionRate: number;
  averageFirstActionBars: number;
  averageUsedOperations: number;
  behaviorStats: Record<
    ApiSpecialTrainingRiskBehaviorType,
    ApiSpecialTrainingRiskBehaviorSummary
  >;
  presentation: {
    grade: ApiSpecialTrainingSessionGrade;
    gradeTone: ApiSpecialTrainingSessionGradeTone;
    commentaryCode: "RISK_RESCUE" | "RISK_OVERTRADE";
    alphaMetricTone: ApiSpecialTrainingSessionMetricTone;
    behaviorInsight:
      | {
          code: "DEFAULT";
          focusBehavior: null;
          deathRate: null;
        }
      | {
          code: "DEATH_RATE_FOCUS";
          focusBehavior: ApiSpecialTrainingRiskBehaviorType;
          deathRate: number;
        };
    behaviorRows: Array<{
      behavior: ApiSpecialTrainingRiskBehaviorType;
      count: number;
      survivalRate: number;
      tone: ApiSpecialTrainingSessionMetricTone;
    }>;
  };
};

export type ApiSpecialTrainingSessionSummary =
  | ApiSpecialTrainingFastDecisionSessionSummary
  | ApiSpecialTrainingRiskDisciplineSessionSummary;

export type ApiSpecialTrainingHistorySessionListItem = {
  id: string;
  challengeId: string;
  modeId: ApiSpecialTrainingModeId;
  sourceTag: string;
  operatorSummary: ApiOperatorSummary;
  timeframe: string;
  effectiveTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  minimumBaseTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  sourceTimeframe?: "1m" | "5m" | "1h" | "1d" | null;
  questionCount: number;
  completedQuestionCount: number;
  passedQuestionCount: number;
  failedQuestionCount: number;
  missedQuestionCount: number;
  timedOutQuestionCount: number;
  decisionSecondsTotal: number;
  decisionSecondsAverage: number;
  maxConsecutivePasses: number;
  createdAt: string;
  finishedAt: string;
  updatedAt: string;
  config: Record<string, unknown>;
  sessionSummary: ApiSpecialTrainingSessionSummary | null;
};

export type ApiSpecialTrainingHistorySessionDetail =
  ApiSpecialTrainingHistorySessionListItem & {
    questions: ApiSpecialTrainingHistoryQuestionSummary[];
  };
