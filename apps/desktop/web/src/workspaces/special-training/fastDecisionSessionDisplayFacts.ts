// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiSpecialTrainingFastDecisionChoice,
  ApiSpecialTrainingFastDecisionSessionSummary,
  ApiSpecialTrainingSessionSummary,
} from "@/api";
import type { SettlementResult } from "@/workspaces/special-training/domain/specialTrainingTypes";

export type FastDecisionChoice = ApiSpecialTrainingFastDecisionChoice;
export type FastDecisionSessionSummary = ApiSpecialTrainingFastDecisionSessionSummary;

const createChoiceCountMap = (): Record<FastDecisionChoice, number> => ({
  LONG: 0,
  SHORT: 0,
  OBSERVE: 0,
});

export const EMPTY_FAST_DECISION_SESSION_DISPLAY_FACTS: FastDecisionSessionSummary = {
  version: 1,
  modeId: "fast-decision-training",
  completedCount: 0,
  passCount: 0,
  failCount: 0,
  totalScore: 0,
  averageScore: 0,
  totalPnl: 0,
  averagePnl: 0,
  averageMaxDrawdownRatio: 0,
  maxMaxDrawdownRatio: 0,
  gradeCounts: {},
  winRate: 0,
  averageDecisionSeconds: 0,
  maxCorrectStreak: 0,
  missCount: 0,
  missRate: 0,
  timeoutCount: 0,
  observeMissCount: 0,
  selectionCounts: createChoiceCountMap(),
  actualCounts: createChoiceCountMap(),
  capitalSummary: {
    initialAsset: 0,
    questionCount: 0,
    totalInvested: 0,
    aggregateFinalAsset: 0,
    aggregatePnl: 0,
    aggregateReturnRate: 0,
    positiveCount: 0,
    flatCount: 0,
    negativeCount: 0,
    bestReviewIndex: null,
    worstReviewIndex: null,
  },
  presentation: {
    grade: "F",
    gradeTone: "danger",
    commentary: {
      templateCode: "CONTRAST",
      speedCode: "MEASURED",
      accuracyCode: "WEAK",
    },
    decisionMetricTone: "neutral",
    biasCode: "BALANCED",
    directionStats: [
      {
        id: "LONG",
        attemptCount: 0,
        correctCount: 0,
        wrongCount: 0,
        accuracyRate: 0,
        tone: "neutral",
      },
      {
        id: "SHORT",
        attemptCount: 0,
        correctCount: 0,
        wrongCount: 0,
        accuracyRate: 0,
        tone: "neutral",
      },
      {
        id: "OBSERVE",
        attemptCount: 0,
        correctCount: 0,
        wrongCount: 0,
        accuracyRate: 0,
        tone: "neutral",
      },
    ],
  },
};

export const readFastDecisionSessionDisplayFacts = (
  sessionSummary: ApiSpecialTrainingSessionSummary | null | undefined,
): FastDecisionSessionSummary =>
  sessionSummary?.modeId === "fast-decision-training"
    ? sessionSummary
    : EMPTY_FAST_DECISION_SESSION_DISPLAY_FACTS;

export const readLatestFastDecisionSessionDisplayFacts = (
  settlements: readonly SettlementResult[],
): FastDecisionSessionSummary => {
  const latestSummary = (
    settlements.at(-1) as
      | (SettlementResult & {
          sessionSummary?: ApiSpecialTrainingSessionSummary | null;
        })
      | undefined
  )?.sessionSummary;
  return readFastDecisionSessionDisplayFacts(latestSummary);
};
