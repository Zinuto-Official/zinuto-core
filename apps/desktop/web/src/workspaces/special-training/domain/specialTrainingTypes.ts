// SPDX-License-Identifier: GPL-3.0-only

import type { SpecialTrainingReplayOverlayContext } from "@/domains/chart/overlays/specialTrainingReplayOverlayTypes";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type {
  ApiSpecialTrainingDurationEstimateResponse,
  ApiSpecialTrainingFastDecisionStrictnessLevel,
  ApiSpecialTrainingQuestion,
  ApiSpecialTrainingRiskReview,
  ApiSpecialTrainingSessionSummary,
  ApiSpecialTrainingTradeAction,
} from "@/api";
import type { Bar } from "@/domains/training/types";
import type { FastDecisionCapitalReview } from "@zinuto/shared/domain-calculations/fast-decision-capital-review";

export type SpecialTrainingView = "MODE_PICKER" | "TRAINING" | "SETTLEMENT";

export type SpecialTrainingQuestion = ApiSpecialTrainingQuestion & {
  minimumBaseTimeframe?: BaseTimeframe | null;
  requestedMinimumBaseTimeframe?: BaseTimeframe | null;
  effectiveTrainingTimeframe?: BaseTimeframe | null;
  effectiveTimeframe?: BaseTimeframe | null;
  trainingTimeframe?: BaseTimeframe | null;
};

export type FastDecisionChoice = "LONG" | "SHORT" | "OBSERVE";
export type FastDecisionStrictnessLevel =
  ApiSpecialTrainingFastDecisionStrictnessLevel;

export type TradeActionLogEntry = ApiSpecialTrainingTradeAction;

export type FastDecisionResult = {
  selection: FastDecisionChoice;
  actual: FastDecisionChoice;
  correct: boolean;
  timedOut: boolean;
  decisionSecondsUsed: number;
  revealEndIndex: number;
  strictnessLevel: FastDecisionStrictnessLevel;
  dominanceRatio: number;
  selectedMfeRatio: number;
  selectedMaeRatio: number;
  selectedMfeMaeRatio: number;
  opportunityDirection: FastDecisionChoice;
  opportunityMfeRatio: number;
  opportunityMaeRatio: number;
  opportunityMfeMaeRatio: number;
  longMfeRatio: number;
  longMaeRatio: number;
};

export type FastDecisionReviewDetail = {
  favorableLabel: string;
  adverseLabel: string;
  favorableValue: string;
  adverseValue: string;
  ratioValue: string;
  directionLabel: string;
  actualDirectionLabel: string;
  badgeLabel: string;
  decisionSecondsLabel: string;
  selectedChoice: FastDecisionChoice;
  actualChoice: FastDecisionChoice;
  favorableRatio: number;
  adverseRatio: number;
  ratioGaugeValue: number;
  ratioIsInfinity: boolean;
};

export type RuntimeState = {
  usedOperations: number;
  openCount: number;
  positionQty: number;
  entryPrice: number;
  cashBalance: number;
  sizeInput: string;
  stopLossInput: string;
  paused: boolean;
  equityPeakAsset: number;
  maxDrawdownRatio: number;
  initialCapital: number;
  challengeStartAsset: number;
};

export type RiskRuntimeBaseline = {
  initialCapital: number;
  cashBalance: number;
  positionQty: number;
  entryPrice: number;
};

export type SettlementResult = {
  questionId: string;
  startIndex: number;
  settleToIndex: number;
  score: number;
  passed: boolean;
  totalPnl: number;
  finalTotalAsset: number;
  feedback: string[];
  usedOperations: number;
  maxOperations: number;
  modeBinding: {
    historyTag: string;
    statsDimension: string;
    notesContextTag: string;
    indicatorScope: "SYSTEM" | "CUSTOM" | "MIXED";
  };
  directionResult: FastDecisionResult | null;
  recoveryRate: number | null;
  alpha: number | null;
  captureRate: number | null;
  maxDrawdownRatio: number;
  grade: string;
  riskReview: ApiSpecialTrainingRiskReview | null;
  fastReview: FastDecisionCapitalReview | null;
  tradeActions?: ApiSpecialTrainingTradeAction[];
  sessionSummary?: ApiSpecialTrainingSessionSummary | null;
  sessionCompletion?: {
    completed: boolean;
    completedCount: number;
    questionCount: number;
    finishedSessionId: string | null;
  };
};

export type RiskSettlementCurveViewModel = {
  labels: string[];
  userCurve: Array<number | null>;
  holdCurve: Array<number | null>;
  hardStopCurve: Array<number | null>;
};

export type FastDecisionEvaluation = {
  actual: FastDecisionChoice;
  revealEndIndex: number;
  longSuccess: boolean;
  shortSuccess: boolean;
  observeSuccess: boolean;
  longMfeRatio: number;
  longMaeRatio: number;
  shortMfeRatio: number;
  shortMaeRatio: number;
  dominanceRatio: number;
};

export type FastDecisionArenaPhase = "THINKING" | "LOCKED" | "REVEALING" | "JUDGED";
export type FastDecisionStrictnessOption = {
  level: FastDecisionStrictnessLevel;
  ratio: number;
  shortLabel: string;
  title: string;
  subtitle: string;
};

export type SpecialTrainingDurationEstimateState = {
  signature: string;
  estimate: ApiSpecialTrainingDurationEstimateResponse | null;
  loading: boolean;
  error: boolean;
};

export type ModePickerQuestionBankStatusTone =
  | "ready"
  | "warning"
  | "danger"
  | "loading";

export type ModePickerQuestionBankStatus = {
  label: string;
  tone: ModePickerQuestionBankStatusTone;
  isPulsing: boolean;
};

export type FastDecisionSessionGrade = "S" | "A" | "B" | "C" | "F";
export type FastDecisionSessionGradeTone =
  | "elite"
  | "strong"
  | "steady"
  | "warning"
  | "danger";
export type FastDecisionSessionMetricTone =
  | "accent"
  | "neutral"
  | "warning"
  | "danger";
export type FastDecisionSessionReviewTone = "pass" | "fail" | "miss";
export type FastDecisionSessionReviewMarketTone = "up" | "down" | "flat";

export type FastDecisionSessionDirectionStat = {
  id: FastDecisionChoice;
  label: string;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  accuracyRate: number;
  tone: FastDecisionSessionMetricTone;
};

export type FastDecisionSessionReviewItem = {
  kind: "fast";
  id: string;
  questionLabel: string;
  symbol: string;
  questionId: string;
  timeframeLabel: string;
  baseTimeframe: BaseTimeframe | null;
  decisionTimeLabel: string;
  selectionLabel: string;
  actualLabel: string;
  selection: FastDecisionChoice;
  actual: FastDecisionChoice;
  timedOut: boolean;
  correct: boolean;
  tone: FastDecisionSessionReviewTone;
  marketTone: FastDecisionSessionReviewMarketTone;
  verdictLabel: string;
  verdictSummary: string;
  bars: Bar[];
  startIndex: number;
  revealEndIndex: number;
  sparkline: number[];
  sparklineDecisionBoundaryOffset: number;
  fastReview: FastDecisionCapitalReview | null;
  specialTraining: SpecialTrainingReplayOverlayContext | null;
};

export type SessionReviewTradeMarker = {
  offset: number;
  value: number;
  side: "BUY" | "SELL";
};

export type RiskDisciplineSessionReviewItem = {
  kind: "risk";
  id: string;
  questionLabel: string;
  symbol: string;
  questionId: string;
  timeframeLabel: string;
  baseTimeframe: BaseTimeframe | null;
  minTradeStep: number;
  gradeLabel: string;
  firstActionLabel: string;
  alphaLabel: string;
  performanceLabel: string;
  tone: FastDecisionSessionReviewTone;
  marketTone: FastDecisionSessionReviewMarketTone;
  verdictLabel: string;
  verdictSummary: string;
  bars: Bar[];
  startIndex: number;
  settleToIndex: number;
  sparkline: number[];
  sparklineDecisionBoundaryOffset: number;
  tradeMarkers: SessionReviewTradeMarker[];
  specialTraining: SpecialTrainingReplayOverlayContext | null;
};

export type SessionReviewItem =
  | FastDecisionSessionReviewItem
  | RiskDisciplineSessionReviewItem;
