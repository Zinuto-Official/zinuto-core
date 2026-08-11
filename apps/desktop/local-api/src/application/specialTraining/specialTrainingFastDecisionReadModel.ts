// SPDX-License-Identifier: GPL-3.0-only

import type { FastDecisionCapitalReview } from '@zinuto/shared/domain-calculations/fast-decision-capital-review';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FastDecisionChoice = 'LONG' | 'SHORT' | 'OBSERVE';

export type FastDecisionReviewDetailFact = {
  selectedChoice: FastDecisionChoice;
  actualChoice: FastDecisionChoice;
  favorableRatio: number;
  adverseRatio: number;
  ratioGaugeValue: number;
  ratioIsInfinity: boolean;
  timedOut: boolean;
  isObserveMiss: boolean;
  isCorrect: boolean;
  decisionSecondsUsed: number;
  badgeCode: 'CONFIRMED' | 'TIMEOUT' | 'MISSED_TREND' | 'REVERSE' | 'CHOPPY';
};

export type FastDecisionReviewToneFact = 'fail' | 'pass' | 'miss';

export type FastDecisionGaugeFact = {
  value: number;
  threshold: number;
  tone: 'up' | 'down' | 'flat';
};

export type FastDecisionTrainingFacts = {
  showReview: boolean;
  showDecisionControls: boolean;
  showSettlementActions: boolean;
  reviewTone: FastDecisionReviewToneFact;
  reviewDetail: FastDecisionReviewDetailFact | null;
  gauge: FastDecisionGaugeFact;
  capitalReview: FastDecisionCapitalReview | null;
  capitalTone: 'positive' | 'negative' | 'flat';
  progressValue: string;
  progressSegmentCount: number;
  winRateMeta: string;
  averageDecisionMeta: string;
  phase: string;
};

export type FastDecisionSessionReviewTone = 'pass' | 'miss' | 'fail';
export type FastDecisionSessionReviewMarketTone = 'up' | 'down' | 'flat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const FAST_DECISION_CHOICE_OBSERVE: FastDecisionChoice = 'OBSERVE';

// ---------------------------------------------------------------------------
// Gauge constants (mirrored from web layer for server-side computation)
// ---------------------------------------------------------------------------

const FAST_DECISION_RATIO_GAUGE_MAX = 3;
const FAST_DECISION_RATIO_GAUGE_MIN = 0;

const resolveFastDecisionRatioGaugeThreshold = (
  dominanceRatio: number,
): number => {
  if (dominanceRatio >= 2.5) return 2.0;
  if (dominanceRatio >= 2.0) return 1.5;
  return 1.0;
};

const resolveFastDecisionRatioGaugeTone = ({
  ratioValue,
  dominanceRatio,
}: {
  ratioValue: number;
  dominanceRatio: number;
}): 'up' | 'down' | 'flat' => {
  if (ratioValue >= dominanceRatio) return 'up';
  if (ratioValue >= 1) return 'flat';
  return 'down';
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const buildFastDecisionReviewDetailFact = ({
  directionResult,
}: {
  directionResult: {
    selection: FastDecisionChoice;
    actual: FastDecisionChoice;
    correct: boolean;
    timedOut: boolean;
    decisionSecondsUsed: number;
    revealEndIndex: number;
    selectedMfeRatio: number;
    selectedMaeRatio: number;
    selectedMfeMaeRatio: number;
    opportunityMfeRatio: number;
    opportunityMaeRatio: number;
    opportunityMfeMaeRatio: number;
  } | null;
}): FastDecisionReviewDetailFact | null => {
  if (!directionResult) {
    return null;
  }

  const isObserveMiss =
    directionResult.selection === FAST_DECISION_CHOICE_OBSERVE &&
    directionResult.actual !== FAST_DECISION_CHOICE_OBSERVE;
  const displayMfeRatio = isObserveMiss
    ? directionResult.opportunityMfeRatio
    : directionResult.selectedMfeRatio;
  const displayMaeRatio = isObserveMiss
    ? directionResult.opportunityMaeRatio
    : directionResult.selectedMaeRatio;
  const displayMfeMaeRatio = isObserveMiss
    ? directionResult.opportunityMfeMaeRatio
    : directionResult.selectedMfeMaeRatio;

  let badgeCode: FastDecisionReviewDetailFact['badgeCode'] = 'CONFIRMED';
  if (directionResult.timedOut) {
    badgeCode = 'TIMEOUT';
  } else if (isObserveMiss) {
    badgeCode = 'MISSED_TREND';
  } else if (
    !directionResult.correct &&
    directionResult.actual !== FAST_DECISION_CHOICE_OBSERVE
  ) {
    badgeCode = 'REVERSE';
  } else if (!directionResult.correct) {
    badgeCode = 'CHOPPY';
  }

  return {
    selectedChoice: directionResult.selection,
    actualChoice: directionResult.actual,
    favorableRatio: displayMfeRatio,
    adverseRatio: displayMaeRatio,
    ratioGaugeValue: displayMfeMaeRatio,
    ratioIsInfinity: displayMfeMaeRatio >= 999,
    timedOut: directionResult.timedOut,
    isObserveMiss,
    isCorrect: directionResult.correct,
    decisionSecondsUsed: directionResult.decisionSecondsUsed,
    badgeCode,
  };
};

export const buildFastDecisionReviewToneFact = ({
  directionResult,
}: {
  directionResult: {
    selection: FastDecisionChoice;
    actual: FastDecisionChoice;
    correct: boolean;
  } | null;
}): FastDecisionReviewToneFact => {
  if (!directionResult) {
    return 'fail';
  }
  if (directionResult.correct) {
    return 'pass';
  }
  if (
    directionResult.selection === 'OBSERVE' &&
    directionResult.actual !== 'OBSERVE'
  ) {
    return 'miss';
  }
  return 'fail';
};

export const buildFastDecisionGaugeFact = ({
  reviewDetail,
  dominanceRatio,
}: {
  reviewDetail: FastDecisionReviewDetailFact | null;
  dominanceRatio: number;
}): FastDecisionGaugeFact => {
  const gaugeValue = !reviewDetail
    ? 0
    : reviewDetail.ratioIsInfinity
      ? FAST_DECISION_RATIO_GAUGE_MAX
      : clamp(
          reviewDetail.ratioGaugeValue,
          FAST_DECISION_RATIO_GAUGE_MIN,
          FAST_DECISION_RATIO_GAUGE_MAX,
        );
  const threshold = resolveFastDecisionRatioGaugeThreshold(dominanceRatio);
  const tone = resolveFastDecisionRatioGaugeTone({
    ratioValue: gaugeValue,
    dominanceRatio: threshold,
  });
  return { value: gaugeValue, threshold, tone };
};

export const buildFastDecisionCapitalToneFact = (
  totalPnl: number | null | undefined,
): 'positive' | 'negative' | 'flat' => {
  if (totalPnl === null || totalPnl === undefined) {
    return 'flat';
  }
  return totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : 'flat';
};

export const buildFastDecisionTrainingFacts = ({
  currentQuestionIndex,
  questionCount,
  completedCount,
  passCount,
  decisionCount,
  fastDecisionPhase,
  directionResult,
  resolvedReviewDetail,
  activeFastDecisionDominanceRatio,
  settlement,
  questionSettledInTraining,
}: {
  currentQuestionIndex: number;
  questionCount: number;
  completedCount: number;
  passCount: number;
  decisionCount: number;
  winRate: number;
  fastDecisionPhase: string;
  directionResult: {
    selection: FastDecisionChoice;
    actual: FastDecisionChoice;
    correct: boolean;
    timedOut: boolean;
    decisionSecondsUsed: number;
    revealEndIndex: number;
    selectedMfeRatio: number;
    selectedMaeRatio: number;
    selectedMfeMaeRatio: number;
    opportunityMfeRatio: number;
    opportunityMaeRatio: number;
    opportunityMfeMaeRatio: number;
  } | null;
  resolvedReviewDetail: FastDecisionReviewDetailFact | null;
  activeFastDecisionDominanceRatio: number;
  settlement: { fastReview: FastDecisionCapitalReview | null } | null;
  questionSettledInTraining: boolean;
}): FastDecisionTrainingFacts => {
  const showReview = resolvedReviewDetail !== null;
  const reviewTone = buildFastDecisionReviewToneFact({ directionResult });
  const gauge = buildFastDecisionGaugeFact({
    reviewDetail: resolvedReviewDetail,
    dominanceRatio: activeFastDecisionDominanceRatio,
  });
  const fastReview = settlement?.fastReview ?? null;
  const capitalTone = buildFastDecisionCapitalToneFact(fastReview?.totalPnl);

  return {
    showReview,
    showDecisionControls: !showReview,
    showSettlementActions: showReview && questionSettledInTraining,
    reviewTone,
    reviewDetail: resolvedReviewDetail,
    gauge,
    capitalReview: fastReview,
    capitalTone,
    progressValue: `${currentQuestionIndex + 1}/${questionCount}`,
    progressSegmentCount: Math.max(questionCount, 1),
    winRateMeta:
      completedCount > 0 ? `${passCount}/${completedCount}` : '',
    averageDecisionMeta:
      decisionCount > 0 ? `${decisionCount}/${questionCount}` : '',
    phase: fastDecisionPhase,
  };
};

export const buildFastDecisionSessionReviewToneFact = ({
  passed,
  selection,
  actual,
}: {
  passed: boolean;
  selection: FastDecisionChoice;
  actual: FastDecisionChoice;
}): FastDecisionSessionReviewTone => {
  if (passed) return 'pass';
  if (selection === 'OBSERVE' && actual !== 'OBSERVE') return 'miss';
  return 'fail';
};

export const buildFastDecisionSessionReviewMarketToneFact = (
  actual: FastDecisionChoice,
): FastDecisionSessionReviewMarketTone => {
  if (actual === 'LONG') return 'up';
  if (actual === 'SHORT') return 'down';
  return 'flat';
};
