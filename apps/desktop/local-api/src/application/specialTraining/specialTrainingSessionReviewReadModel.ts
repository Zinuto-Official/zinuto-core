// SPDX-License-Identifier: GPL-3.0-only

import type {
  SpecialTrainingFastDecisionChoice,
  SpecialTrainingRiskDisciplineFirstAction,
  SpecialTrainingSettlementResult,
  SpecialTrainingQuestionState,
} from '../../domain/specialTraining/contracts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionReviewTone = 'pass' | 'miss' | 'fail';
export type SessionReviewMarketTone = 'up' | 'down' | 'flat';

export type FastDecisionSessionReviewItemFact = {
  kind: 'fast';
  questionId: string;
  questionIndex: number;
  symbol: string;
  selection: SpecialTrainingFastDecisionChoice;
  actual: SpecialTrainingFastDecisionChoice;
  timedOut: boolean;
  correct: boolean;
  tone: SessionReviewTone;
  marketTone: SessionReviewMarketTone;
  startIndex: number;
  revealEndIndex: number;
  decisionSecondsUsed: number;
  selectedMfeRatio: number;
  selectedMaeRatio: number;
  selectedMfeMaeRatio: number;
  fastReview: SpecialTrainingSettlementResult['fastReview'];
};

export type RiskDisciplineSessionReviewItemFact = {
  kind: 'risk';
  questionId: string;
  questionIndex: number;
  symbol: string;
  tone: SessionReviewTone;
  marketTone: SessionReviewMarketTone;
  startIndex: number;
  settleToIndex: number;
  minTradeStep: number;
  passed: boolean;
  grade: string | null;
  alpha: number | null;
  totalPnl: number;
  firstAction: SpecialTrainingRiskDisciplineFirstAction;
  costBasisShift: {
    initialCostBasis: number | null;
    finalCostBasis: number | null;
    referencePrice: number | null;
    shiftValue: number | null;
    shiftRatio: number | null;
  } | null;
  tradeActions: Array<{
    type: 'BUY' | 'SELL';
    barIndex: number;
    executionPrice: number;
    quantity: number;
  }>;
};

export type SessionReviewItemFact =
  | FastDecisionSessionReviewItemFact
  | RiskDisciplineSessionReviewItemFact;

export type SessionReviewSettlementSummaryFact = {
  completedCount: number;
  passCount: number;
  failCount: number;
  totalPnl: number;
  grade: string;
  gradeTone: string;
  commentaryCode: string;
  alphaMetricTone: string;
  behaviorInsightCode: string;
  behaviorFocusBehavior: string | null;
  behaviorDeathRate: number | null;
};

export type ChallengeReviewSummaryChipFact = {
  labelKey: string;
  value: number | string | null;
  tone: 'positive' | 'warning' | 'danger' | 'neutral';
  visible: boolean;
};

export type ChallengeReviewNoteFact = {
  questionId: string;
  modeId: string;
  initialCapital: number;
  finalTotalAsset: number | null;
  maxDrawdownRatio: number;
  position: {
    qty: number;
    avgCost: number;
    markPrice: number;
  } | null;
  hasFastDecisionContext: boolean;
  hasRiskContext: boolean;
};

export type SessionReplayProjectFact = {
  questionId: string;
  symbol: string;
  visibleEndIndex: number;
  startIndex: number;
  baseTimeframe: string | null;
  barsCount: number;
  fills: Array<{
    side: 'BUY' | 'SELL';
    barIndex: number;
    price: number;
    quantity: number;
  }>;
  finalAsset: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const buildFastDecisionSessionReviewItemFacts = ({
  settlements,
  questions,
}: {
  settlements: SpecialTrainingSettlementResult[];
  questions: SpecialTrainingQuestionState[];
}): FastDecisionSessionReviewItemFact[] => {
  return settlements.flatMap((item, index) => {
    const question = questions[index];
    const directionResult = item.directionResult;
    if (!question || !directionResult) {
      return [];
    }
    const bars = Array.isArray(question.bars) ? question.bars : [];
    if (!bars.length) {
      return [];
    }
    const startIndex = clamp(
      Math.floor(toFiniteNumber(question.startIndex) || 0),
      0,
      Math.max(0, bars.length - 1),
    );
    const revealEndIndex = clamp(
      Math.floor(
        toFiniteNumber(directionResult.revealEndIndex) || startIndex,
      ),
      startIndex,
      Math.max(startIndex, bars.length - 1),
    );
    const tone: SessionReviewTone = item.passed
      ? 'pass'
      : directionResult.selection === 'OBSERVE' &&
          directionResult.actual !== 'OBSERVE'
        ? 'miss'
        : 'fail';
    const marketTone: SessionReviewMarketTone =
      directionResult.actual === 'LONG'
        ? 'up'
        : directionResult.actual === 'SHORT'
          ? 'down'
          : 'flat';

    return [
      {
        kind: 'fast' as const,
        questionId: question.id,
        questionIndex: index,
        symbol: String(question.symbol || '').trim().toUpperCase(),
        selection: directionResult.selection,
        actual: directionResult.actual,
        timedOut: directionResult.timedOut,
        correct: directionResult.correct,
        tone,
        marketTone,
        startIndex,
        revealEndIndex,
        decisionSecondsUsed: directionResult.decisionSecondsUsed,
        selectedMfeRatio: directionResult.selectedMfeRatio,
        selectedMaeRatio: directionResult.selectedMaeRatio,
        selectedMfeMaeRatio: directionResult.selectedMfeMaeRatio,
        fastReview: item.fastReview ?? null,
      },
    ];
  });
};

export const buildRiskDisciplineSessionReviewItemFacts = ({
  settlements,
  questions,
  cursorIndexes,
}: {
  settlements: SpecialTrainingSettlementResult[];
  questions: SpecialTrainingQuestionState[];
  cursorIndexes?: Array<number | null>;
}): RiskDisciplineSessionReviewItemFact[] => {
  return settlements.flatMap((item, index) => {
    const question = questions[index];
    if (!question) {
      return [];
    }
    const bars = Array.isArray(question.bars) ? question.bars : [];
    if (!bars.length) {
      return [];
    }
    const startIndex = clamp(
      Math.floor(toFiniteNumber(question.startIndex) || 0),
      0,
      Math.max(0, bars.length - 1),
    );
    const cursorIndex = cursorIndexes?.[index] ?? null;
    const settleToIndex = clamp(
      Math.floor(
        toFiniteNumber(cursorIndex) ||
          toFiniteNumber(question.endIndex) ||
          startIndex,
      ),
      startIndex,
      Math.max(startIndex, bars.length - 1),
    );
    const firstAction = item.riskDisciplineFirstAction ?? {
      behavior: 'FREEZE' as const,
      barsSinceStart: Math.max(0, settleToIndex - startIndex),
    };
    const passed = item.passed;
    const tone: SessionReviewTone = passed ? 'pass' : 'miss';
    const marketTone: SessionReviewMarketTone =
      item.totalPnl > 0 ? 'up' : item.totalPnl < 0 ? 'down' : 'flat';

    const costBasisShift = item.riskReview?.costBasisShift ?? null;

    return [
      {
        kind: 'risk' as const,
        questionId: question.id,
        questionIndex: index,
        symbol: String(question.symbol || '').trim().toUpperCase(),
        tone,
        marketTone,
        startIndex,
        settleToIndex,
        minTradeStep: Math.max(
          1,
          Math.floor(toFiniteNumber(question.minTradeStep) || 1),
        ),
        passed,
        grade: item.grade || null,
        alpha: item.alpha ?? null,
        totalPnl: item.totalPnl,
        firstAction,
        costBasisShift,
        tradeActions: (item as any).tradeActions ?? [],
      },
    ];
  });
};

export const buildChallengeReviewSummaryChipFacts = ({
  settlement,
  riskReviewAlphaVsHold,
  riskReviewAlphaVsHardStop,
  activeFastDecisionDirectionResult,
  resolvedFastDecisionReviewDetail,
}: {
  settlement: SpecialTrainingSettlementResult | null;
  riskReviewAlphaVsHold: number | null;
  riskReviewAlphaVsHardStop: number | null;
  activeFastDecisionDirectionResult: {
    selection: SpecialTrainingFastDecisionChoice;
    actual: SpecialTrainingFastDecisionChoice;
    correct: boolean;
    selectedMfeRatio: number;
    selectedMaeRatio: number;
    selectedMfeMaeRatio: number;
    dominanceRatio: number;
    decisionSecondsUsed: number;
  } | null;
  resolvedFastDecisionReviewDetail: {
    favorableRatio: number;
    adverseRatio: number;
    ratioGaugeValue: number;
    ratioIsInfinity: boolean;
    decisionSecondsUsed: number;
    badgeCode: string;
  } | null;
}): ChallengeReviewSummaryChipFact[] => {
  const chips: ChallengeReviewSummaryChipFact[] = [];

  if (activeFastDecisionDirectionResult && resolvedFastDecisionReviewDetail) {
    if (settlement?.fastReview) {
      chips.push({
        labelKey: 'metricTotalAsset',
        value: settlement.fastReview.finalAsset,
        tone: settlement.fastReview.totalPnl >= 0 ? 'positive' : 'danger',
        visible: true,
      });
      chips.push({
        labelKey: 'statusFloating',
        value: settlement.fastReview.totalPnl,
        tone: settlement.fastReview.totalPnl >= 0 ? 'positive' : 'danger',
        visible: true,
      });
      chips.push({
        labelKey: 'metricMaxDrawdown',
        value: settlement.fastReview.maxDrawdownRate,
        tone: 'warning',
        visible: true,
      });
    }
    chips.push({
      labelKey: 'decisionSelected',
      value: activeFastDecisionDirectionResult.selection,
      tone: activeFastDecisionDirectionResult.correct ? 'positive' : 'neutral',
      visible: true,
    });
    chips.push({
      labelKey: 'decisionActual',
      value: activeFastDecisionDirectionResult.actual,
      tone: activeFastDecisionDirectionResult.correct ? 'positive' : 'danger',
      visible: true,
    });
    chips.push({
      labelKey: 'favorable',
      value: resolvedFastDecisionReviewDetail.favorableRatio,
      tone: 'positive',
      visible: true,
    });
    chips.push({
      labelKey: 'adverse',
      value: resolvedFastDecisionReviewDetail.adverseRatio,
      tone: 'danger',
      visible: true,
    });
    chips.push({
      labelKey: 'fastDecisionRatio',
      value: resolvedFastDecisionReviewDetail.ratioIsInfinity
        ? null
        : resolvedFastDecisionReviewDetail.ratioGaugeValue,
      tone: resolvedFastDecisionReviewDetail.ratioGaugeValue >= 1.5 ? 'positive' : resolvedFastDecisionReviewDetail.ratioGaugeValue >= 1 ? 'neutral' : 'danger',
      visible: true,
    });
    chips.push({
      labelKey: 'metricAvgDecisionSeconds',
      value: resolvedFastDecisionReviewDetail.decisionSecondsUsed,
      tone: 'neutral',
      visible: true,
    });
    return chips.slice(0, 9);
  }

  if (!settlement) {
    return [];
  }

  chips.push({
    labelKey: 'metricMaxDrawdown',
    value: settlement.maxDrawdownRatio,
    tone: 'warning',
    visible: true,
  });
  chips.push({
    labelKey: 'metricTotalAsset',
    value: settlement.finalTotalAsset,
    tone: settlement.totalPnl >= 0 ? 'positive' : 'danger',
    visible: true,
  });
  chips.push({
    labelKey: 'statusFloating',
    value: settlement.totalPnl,
    tone: settlement.totalPnl >= 0 ? 'positive' : 'danger',
    visible: true,
  });
  if (riskReviewAlphaVsHold !== null) {
    chips.push({
      labelKey: 'riskAlphaVsHold',
      value: riskReviewAlphaVsHold,
      tone: riskReviewAlphaVsHold >= 0 ? 'positive' : 'danger',
      visible: true,
    });
  }
  if (riskReviewAlphaVsHardStop !== null) {
    chips.push({
      labelKey: 'riskAlphaVsHardStop',
      value: riskReviewAlphaVsHardStop,
      tone: riskReviewAlphaVsHardStop >= 0 ? 'positive' : 'danger',
      visible: true,
    });
  }
  if (settlement.recoveryRate !== null) {
    chips.push({
      labelKey: 'metricRecoveryRate',
      value: settlement.recoveryRate,
      tone: settlement.recoveryRate >= 1 ? 'positive' : settlement.recoveryRate >= 0.5 ? 'neutral' : 'danger',
      visible: true,
    });
  }
  if (settlement.captureRate !== null) {
    chips.push({
      labelKey: 'metricCaptureRate',
      value: settlement.captureRate,
      tone: settlement.captureRate >= 0.5 ? 'positive' : 'danger',
      visible: true,
    });
  }
  if (settlement.grade) {
    chips.push({
      labelKey: 'metricGrade',
      value: settlement.grade,
      tone: settlement.passed ? 'positive' : 'warning',
      visible: true,
    });
  }

  return chips.slice(0, 9);
};

export const buildChallengeReviewNoteFact = ({
  activeModeId,
  activeQuestionId,
  fastDecisionPhase,
  activeFastDecisionDirectionResult,
  settlement,
  currentTotalAsset,
  runtime,
  currentPrice,
}: {
  activeModeId: string | null | undefined;
  activeQuestionId: string | null | undefined;
  fastDecisionPhase: string;
  activeFastDecisionDirectionResult: {
    revealEndIndex: number;
    selection: SpecialTrainingFastDecisionChoice;
  } | null;
  settlement: SpecialTrainingSettlementResult | null;
  currentTotalAsset: number | null;
  runtime: {
    initialCapital: number;
    positionQty: number;
    entryPrice: number;
    maxDrawdownRatio: number;
    challengeStartAsset: number;
  };
  currentPrice: number | null;
}): ChallengeReviewNoteFact | null => {
  if (!activeModeId || !activeQuestionId) {
    return null;
  }

  const canUseFastDecisionPreviewNote =
    activeModeId === 'fast-decision-training' &&
    fastDecisionPhase === 'JUDGED' &&
    activeFastDecisionDirectionResult !== null;
  if (!settlement && !canUseFastDecisionPreviewNote) {
    return null;
  }

  const finalTotalAssetForNote =
    settlement?.fastReview?.finalAsset ??
    settlement?.finalTotalAsset ??
    currentTotalAsset;
  const maxDrawdownRatioForNote =
    settlement?.fastReview?.maxDrawdownRate ??
    settlement?.maxDrawdownRatio ??
    runtime.maxDrawdownRatio;
  const currentPriceValue =
    typeof currentPrice === 'number' ? currentPrice : Number.NaN;

  return {
    questionId: activeQuestionId,
    modeId: activeModeId,
    initialCapital: runtime.initialCapital,
    finalTotalAsset: finalTotalAssetForNote,
    maxDrawdownRatio: maxDrawdownRatioForNote,
    position:
      runtime.positionQty > 1e-8 &&
      Number.isFinite(currentPriceValue) &&
      currentPriceValue > 0 &&
      Number.isFinite(runtime.entryPrice) &&
      runtime.entryPrice > 0
        ? {
            qty: runtime.positionQty,
            avgCost: runtime.entryPrice,
            markPrice: currentPriceValue,
          }
        : null,
    hasFastDecisionContext:
      activeModeId === 'fast-decision-training' &&
      activeFastDecisionDirectionResult !== null,
    hasRiskContext: activeModeId === 'risk-discipline-training',
  };
};

export const buildSessionReplayProjectFact = ({
  selectedSessionReviewIndex,
  selectedSessionReviewItem,
  settlements,
}: {
  selectedSessionReviewIndex: number | null;
  selectedSessionReviewItem:
    | FastDecisionSessionReviewItemFact
    | RiskDisciplineSessionReviewItemFact
    | null;
  settlements: SpecialTrainingSettlementResult[];
}): SessionReplayProjectFact | null => {
  if (selectedSessionReviewIndex === null || !selectedSessionReviewItem) {
    return null;
  }
  const reviewSettlement = settlements[selectedSessionReviewIndex] ?? null;
  const visibleEndIndex =
    selectedSessionReviewItem.kind === 'risk'
      ? selectedSessionReviewItem.settleToIndex
      : selectedSessionReviewItem.revealEndIndex;

  const fills: SessionReplayProjectFact['fills'] = [];
  if (selectedSessionReviewItem.kind === 'risk' && reviewSettlement) {
    const tradeActions = (reviewSettlement as any).tradeActions ?? [];
    tradeActions
      .filter(
        (action: any) =>
          (action.type === 'BUY' || action.type === 'SELL') &&
          Number.isFinite(action.barIndex) &&
          action.barIndex >= selectedSessionReviewItem.startIndex &&
          action.barIndex <= visibleEndIndex &&
          Number(action.quantity) > 0 &&
          Number(action.executionPrice) > 0,
      )
      .sort((a: any, b: any) => a.barIndex - b.barIndex)
      .forEach((action: any) => {
        fills.push({
          side: action.type,
          barIndex: action.barIndex,
          price: Number(action.executionPrice),
          quantity: Number(action.quantity),
        });
      });
  }

  const reviewFinalAsset =
    selectedSessionReviewItem.kind === 'fast'
      ? (selectedSessionReviewItem as FastDecisionSessionReviewItemFact).fastReview?.finalAsset ??
        reviewSettlement?.finalTotalAsset ??
        1000000
      : reviewSettlement?.finalTotalAsset ?? 1000000;

  return {
    questionId: selectedSessionReviewItem.questionId,
    symbol: selectedSessionReviewItem.symbol,
    visibleEndIndex,
    startIndex: selectedSessionReviewItem.startIndex,
    baseTimeframe: selectedSessionReviewItem.kind === 'risk'
      ? (selectedSessionReviewItem as RiskDisciplineSessionReviewItemFact).settleToIndex !== undefined
        ? null
        : null
      : null,
    barsCount: 0,
    fills,
    finalAsset: reviewFinalAsset,
  };
};
