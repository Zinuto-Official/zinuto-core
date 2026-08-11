// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';
import {
  evaluateFastDecision as evaluateFastDecisionShared,
  type FastDecisionStrictnessLevel,
} from '@zinuto/shared/domain-calculations/fast-decision';
import {
  buildFastDecisionCapitalReview,
  FAST_DECISION_REVIEW_INITIAL_ASSET,
} from '@zinuto/shared/domain-calculations/fast-decision-capital-review';
import { DEFAULT_CAPITAL } from '../../domain/specialTraining/constants.js';
import type {
  SettleSpecialTrainingQuestionPayload,
  SpecialTrainingFastDecisionChoice,
  SpecialTrainingFeedbackCode,
  SpecialTrainingModeId,
  SpecialTrainingQuestionState,
  SpecialTrainingRiskDisciplineFirstAction,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction,
  SpecialTrainingTradeRuntimeState,
} from '../../domain/specialTraining/contracts.js';
import {
  executeSpecialTrainingTradeAction,
  normalizeSpecialTrainingOrderInputMode,
  normalizeSpecialTrainingOrderInputValue,
  normalizeSpecialTrainingOrderPriceMode,
} from './riskOrderQuote.js';
import {
  applyRuntimeRiskMetrics,
  calculateTotalAsset,
  createTradeRuntimeState,
} from './riskRuntime.js';
import { appError } from '../../kernel/appError.js';

type FastDecisionEvaluation = {
  actual: SpecialTrainingFastDecisionChoice;
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

type SimulatedTradeResult = {
  runtime: SpecialTrainingTradeRuntimeState;
  settlementIndex: number;
  finalTotalAsset: number;
  curveX: number[];
  curveAsset: number[];
  initialEntryPrice: number;
  finalEntryPrice: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

const evaluateFastDecision = (
  bars: OhlcvBar[],
  startIndex: number,
  revealBars: number,
  dominanceRatio: number,
): FastDecisionEvaluation | null =>
  evaluateFastDecisionShared({
    bars,
    startIndex,
    revealBars,
    dominanceRatio,
  });

const normalizeTradeActions = (
  actions: SpecialTrainingTradeAction[] | undefined,
  startIndex: number,
  maxIndex: number,
): Map<number, SpecialTrainingTradeAction[]> => {
  const actionsByBar = new Map<number, SpecialTrainingTradeAction[]>();
  if (!Array.isArray(actions) || !actions.length) {
    return actionsByBar;
  }

  actions.forEach((action) => {
    const barIndex = Math.floor(toFiniteNumber(action.barIndex));
    if (
      !Number.isFinite(barIndex) ||
      barIndex < startIndex ||
      barIndex > maxIndex
    ) {
      return;
    }
    const type = action.type === 'SELL' ? 'SELL' : 'BUY';
    const inputMode = normalizeSpecialTrainingOrderInputMode(action.inputMode);
    const priceMode = normalizeSpecialTrainingOrderPriceMode(action.priceMode);
    const quantity = Math.max(0, toFiniteNumber(action.quantity) || 0);
    const executionPrice = Math.max(
      0,
      toFiniteNumber(action.executionPrice) || 0,
    );
    const cashEffect = Math.max(0, toFiniteNumber(action.cashEffect) || 0);
    const normalized: SpecialTrainingTradeAction = {
      type,
      barIndex,
      inputMode,
      priceMode,
      lotInput: normalizeSpecialTrainingOrderInputValue(action.lotInput),
      amountInput: normalizeSpecialTrainingOrderInputValue(action.amountInput),
      ratioInput: normalizeSpecialTrainingOrderInputValue(action.ratioInput),
      quantity,
      executionPrice,
      cashEffect,
    };
    const current = actionsByBar.get(barIndex) ?? [];
    current.push(normalized);
    actionsByBar.set(barIndex, current);
  });

  return actionsByBar;
};

const resolveRiskDisciplineFirstAction = (
  actions: SpecialTrainingTradeAction[] | undefined,
  startIndex: number,
  settleToIndex: number,
): SpecialTrainingRiskDisciplineFirstAction => {
  const normalizedActions = Array.from(
    normalizeTradeActions(actions, startIndex, settleToIndex).entries(),
  )
    .flatMap(([barIndex, items]) =>
      items.map((item) => ({
        type: item.type,
        barIndex,
      })),
    )
    .sort((left, right) => left.barIndex - right.barIndex);
  const firstAction = normalizedActions[0] ?? null;
  if (!firstAction) {
    return {
      behavior: 'FREEZE',
      barsSinceStart: Math.max(0, settleToIndex - startIndex),
    };
  }
  return {
    behavior: firstAction.type === 'SELL' ? 'CUT_LOSS' : 'ADD_POSITION',
    barsSinceStart: Math.max(0, firstAction.barIndex - startIndex),
  };
};

const executeTradeAction = (
  runtime: SpecialTrainingTradeRuntimeState,
  action: SpecialTrainingTradeAction,
  markPrice: number,
  tradeStep: number,
  limits: {
    maxOperations: number;
    maxEntries: number;
  },
): SpecialTrainingTradeRuntimeState =>
  executeSpecialTrainingTradeAction({
    runtime,
    action,
    markPrice,
    tradeStep,
    maxOperations: limits.maxOperations,
    maxEntries: limits.maxEntries,
  });

const simulateTradeQuestion = (
  modeId: Exclude<SpecialTrainingModeId, 'fast-decision-training'>,
  question: SpecialTrainingQuestionState,
  tradeActions: SpecialTrainingTradeAction[] | undefined,
  settlementLimitIndex: number,
  limits: {
    maxOperations: number;
    maxEntries: number;
  },
): SimulatedTradeResult => {
  const bars = question.bars;
  const startIndex = question.startIndex;
  const endIndex = clamp(settlementLimitIndex, startIndex, question.endIndex);

  const startPrice = toFiniteNumber(bars[startIndex]?.close);
  let runtime = createTradeRuntimeState(modeId, question);
  const initialEntryPrice = runtime.entryPrice;
  runtime = applyRuntimeRiskMetrics(runtime, startPrice);

  const actionsByBar = normalizeTradeActions(
    tradeActions,
    startIndex,
    endIndex,
  );
  const curveX: number[] = [];
  const curveAsset: number[] = [];

  const settlementIndex = endIndex;
  let latestPrice = startPrice;

  for (let barIndex = startIndex; barIndex <= endIndex; barIndex += 1) {
    const markPrice = toFiniteNumber(bars[barIndex]?.close);
    const hasValidMarkPrice = Number.isFinite(markPrice) && markPrice > 0;
    if (hasValidMarkPrice) {
      latestPrice = markPrice;
      const barActions = actionsByBar.get(barIndex) ?? [];
      for (const action of barActions) {
        runtime = executeTradeAction(
          runtime,
          action,
          markPrice,
          question.minTradeStep,
          limits,
        );
        runtime = applyRuntimeRiskMetrics(runtime, markPrice);
      }

      runtime = applyRuntimeRiskMetrics(runtime, markPrice);
    }

    const markForCurve =
      Number.isFinite(latestPrice) && latestPrice > 0
        ? latestPrice
        : startPrice;
    curveX.push(barIndex);
    curveAsset.push(calculateTotalAsset(runtime, markForCurve));
  }

  const finalAsset =
    curveAsset.length > 0
      ? curveAsset[curveAsset.length - 1]
      : calculateTotalAsset(runtime, latestPrice);
  if (curveX.length > 0 && curveX[curveX.length - 1] < endIndex) {
    for (
      let barIndex = curveX[curveX.length - 1] + 1;
      barIndex <= endIndex;
      barIndex += 1
    ) {
      curveX.push(barIndex);
      curveAsset.push(finalAsset);
    }
  }

  const finalTotalAsset =
    curveAsset.length > 0
      ? curveAsset[curveAsset.length - 1]
      : calculateTotalAsset(runtime, latestPrice);
  return {
    runtime,
    settlementIndex,
    finalTotalAsset,
    curveX,
    curveAsset,
    initialEntryPrice,
    finalEntryPrice: runtime.entryPrice,
  };
};

type RiskReview = NonNullable<SpecialTrainingSettlementResult['riskReview']>;

const toCurvePoints = (
  sourceX: number[],
  sourceAsset: number[],
): Array<{ barIndex: number; asset: number }> => {
  const points: Array<{ barIndex: number; asset: number }> = [];
  for (let index = 0; index < sourceX.length; index += 1) {
    const barIndex = sourceX[index];
    const asset = sourceAsset[index];
    if (!Number.isFinite(barIndex) || !Number.isFinite(asset)) {
      continue;
    }
    points.push({
      barIndex,
      asset,
    });
  }
  return points;
};

const resolveBarCloseOrNull = (
  bars: OhlcvBar[],
  index: number,
): number | null => {
  const close = toFiniteNumber(bars[index]?.close);
  return Number.isFinite(close) && close > 0 ? close : null;
};

const resolveFirstTradableBarIndex = (
  bars: OhlcvBar[],
  startIndex: number,
  endIndex: number,
): number => {
  for (let barIndex = startIndex; barIndex <= endIndex; barIndex += 1) {
    const close = toFiniteNumber(bars[barIndex]?.close);
    if (Number.isFinite(close) && close > 0) {
      return barIndex;
    }
  }
  return startIndex;
};

const resolveRiskReviewCostBasisShift = (
  initialEntryPrice: number,
  finalEntryPrice: number,
  referencePrice: number | null,
): RiskReview['costBasisShift'] => {
  const initialCostBasis =
    Number.isFinite(initialEntryPrice) && initialEntryPrice > 0
      ? initialEntryPrice
      : null;
  const finalCostBasisRaw =
    Number.isFinite(finalEntryPrice) && finalEntryPrice > 0
      ? finalEntryPrice
      : null;
  const finalCostBasis = finalCostBasisRaw ?? referencePrice;
  if (initialCostBasis === null || finalCostBasis === null) {
    return {
      initialCostBasis,
      finalCostBasis,
      referencePrice,
      shiftValue: null,
      shiftRatio: null,
    };
  }
  const shiftValue = finalCostBasis - initialCostBasis;
  const shiftRatio =
    Math.abs(initialCostBasis) > 1e-9
      ? shiftValue / Math.abs(initialCostBasis)
      : null;
  return {
    initialCostBasis,
    finalCostBasis,
    referencePrice,
    shiftValue,
    shiftRatio,
  };
};

const resolveCostBasisFeedbackCode = (
  shift: RiskReview['costBasisShift'],
): SpecialTrainingFeedbackCode => {
  if (shift.finalCostBasis === null) {
    return 'COST_BASIS_CLEARED';
  }
  if (shift.shiftRatio !== null && shift.shiftRatio < -1e-6) {
    return 'COST_BASIS_REDUCED';
  }
  return 'COST_BASIS_INCREASED';
};

const scoreRiskDisciplineByRelativeAlpha = (value: {
  alphaVsHolderRatio: number;
  alphaVsHardStopRatio: number;
  recoveryRate: number;
  usedOperations: number;
  maxOperations: number;
  costBasisShift: RiskReview['costBasisShift'];
}): {
  score: number;
  grade: string;
  passed: boolean;
  alpha: number;
  feedbackCodes: SpecialTrainingFeedbackCode[];
} => {
  const feedbackCodes: SpecialTrainingFeedbackCode[] = [];
  const alphaEpsilon = 1e-6;
  const beatHolder = value.alphaVsHolderRatio > alphaEpsilon;
  const beatHardStop = value.alphaVsHardStopRatio > alphaEpsilon;

  if (beatHolder) {
    feedbackCodes.push('ALPHA_BEAT_HOLDER');
  } else {
    feedbackCodes.push('ALPHA_LOSE_HOLDER');
  }

  if (beatHardStop) {
    feedbackCodes.push('ALPHA_BEAT_STOPLOSS');
  } else {
    feedbackCodes.push('ALPHA_LOSE_STOPLOSS');
  }

  const alpha = (value.alphaVsHolderRatio + value.alphaVsHardStopRatio) / 2;
  feedbackCodes.push(
    alpha > alphaEpsilon ? 'ALPHA_RELATIVE_STRONG' : 'ALPHA_RELATIVE_WEAK',
  );

  let score =
    58 + value.alphaVsHolderRatio * 200 + value.alphaVsHardStopRatio * 260;

  const bothPositive = beatHolder && beatHardStop;
  const bothNegative =
    value.alphaVsHolderRatio <= alphaEpsilon &&
    value.alphaVsHardStopRatio <= alphaEpsilon;
  if (bothPositive) {
    score += 8;
  } else if (bothNegative) {
    score -= 8;
  }

  if (Number.isFinite(value.recoveryRate)) {
    if (value.recoveryRate >= 1) {
      score += 6;
    } else if (value.recoveryRate >= 0.5) {
      score += 2;
    } else {
      score -= 4;
    }
  }

  if (value.maxOperations > 0 && value.usedOperations > value.maxOperations) {
    score -= 8;
    feedbackCodes.push('OPS_EXCEEDED');
  }

  const costBasisCode = resolveCostBasisFeedbackCode(value.costBasisShift);
  feedbackCodes.push(costBasisCode);

  const normalizedScore = clamp(Math.round(score), 0, 100);
  const hasEffectiveIntervention = value.usedOperations > 0;
  const hasStrictBenchmarkImprovement = beatHolder || beatHardStop;
  const passed =
    normalizedScore >= 62 &&
    hasEffectiveIntervention &&
    hasStrictBenchmarkImprovement;

  let grade = 'C';
  if (
    passed &&
    normalizedScore >= 92 &&
    beatHolder &&
    beatHardStop
  ) {
    grade = 'S';
  } else if (passed && normalizedScore >= 78) {
    grade = 'A';
  } else if (passed) {
    grade = 'B';
  }

  if (grade === 'S') {
    feedbackCodes.push('RECOVERY_GRADE_S');
  } else if (grade === 'A') {
    feedbackCodes.push('RECOVERY_GRADE_A');
  } else if (grade === 'B') {
    feedbackCodes.push('RECOVERY_GRADE_B');
  } else {
    feedbackCodes.push('RECOVERY_GRADE_C');
  }
  feedbackCodes.push(passed ? 'RECOVERY_SUCCESS' : 'RECOVERY_PENDING');

  return {
    score: normalizedScore,
    grade,
    passed,
    alpha,
    feedbackCodes: Array.from(new Set(feedbackCodes)),
  };
};

export const settleFastDecisionQuestion = (
  question: SpecialTrainingQuestionState,
  payload: SettleSpecialTrainingQuestionPayload,
  abandoned: boolean,
  config: {
    maxOperations: number;
    horizonBars: number;
    decisionSecondsLimit: number;
    strictnessLevel: FastDecisionStrictnessLevel;
    dominanceRatio: number;
  },
): SpecialTrainingSettlementResult => {
  const maxOperations = config.maxOperations;

  if (abandoned) {
    return {
      score: 0,
      passed: false,
      totalPnl: 0,
      finalTotalAsset: DEFAULT_CAPITAL,
      feedbackCodes: ['ABANDONED'],
      usedOperations: 0,
      maxOperations,
      directionResult: null,
      recoveryRate: null,
      alpha: null,
      captureRate: null,
      maxDrawdownRatio: 0,
      grade: '',
      riskReview: null,
      fastReview: null,
      riskDisciplineFirstAction: null,
    };
  }

  const selection = payload.fastDecision?.selection;
  if (!selection) {
    throw appError('SPECIAL_TRAINING_FAST_DECISION_REQUIRED');
  }

  const evaluation = evaluateFastDecision(
    question.bars,
    question.startIndex,
    config.horizonBars,
    config.dominanceRatio,
  );
  if (!evaluation) {
    throw appError('SPECIAL_TRAINING_BAR_DATA_INVALID');
  }

  const rawSecondsUsed = toFiniteNumber(
    payload.fastDecision?.decisionSecondsUsed,
  );
  const secondsUsed = clamp(
    Number.isFinite(rawSecondsUsed)
      ? rawSecondsUsed
      : config.decisionSecondsLimit,
    0,
    config.decisionSecondsLimit,
  );
  const timedOut = Boolean(payload.fastDecision?.timedOut);

  const correct =
    selection === 'LONG'
      ? evaluation.longSuccess
      : selection === 'SHORT'
        ? evaluation.shortSuccess
        : evaluation.observeSuccess;

  const feedbackCodes: SpecialTrainingFeedbackCode[] = [
    correct ? 'DIRECTION_CORRECT' : 'DIRECTION_WRONG',
  ];
  if (timedOut) {
    feedbackCodes.push('DIRECTION_TIMEOUT');
  }

  const selectedMfeRatio =
    selection === 'LONG'
      ? evaluation.longMfeRatio
      : selection === 'SHORT'
        ? evaluation.shortMfeRatio
        : Math.max(evaluation.longMfeRatio, evaluation.shortMfeRatio);
  const selectedMaeRatio =
    selection === 'LONG'
      ? evaluation.longMaeRatio
      : selection === 'SHORT'
        ? evaluation.shortMaeRatio
        : Math.min(evaluation.longMaeRatio, evaluation.shortMaeRatio);
  const selectedMfeMaeRatio =
    selectedMaeRatio > 1e-9
      ? selectedMfeRatio / selectedMaeRatio
      : selectedMfeRatio > 1e-9
        ? 999
        : 0;
  const opportunityDirection = evaluation.actual;
  const opportunityMfeRatio =
    opportunityDirection === 'LONG'
      ? evaluation.longMfeRatio
      : opportunityDirection === 'SHORT'
        ? evaluation.shortMfeRatio
        : Math.max(evaluation.longMfeRatio, evaluation.shortMfeRatio);
  const opportunityMaeRatio =
    opportunityDirection === 'LONG'
      ? evaluation.longMaeRatio
      : opportunityDirection === 'SHORT'
        ? evaluation.shortMaeRatio
        : Math.min(evaluation.longMaeRatio, evaluation.shortMaeRatio);
  const opportunityMfeMaeRatio =
    opportunityMaeRatio > 1e-9
      ? opportunityMfeRatio / opportunityMaeRatio
      : opportunityMfeRatio > 1e-9
        ? 999
        : 0;
  const fastReview = buildFastDecisionCapitalReview({
    bars: question.bars,
    startIndex: question.startIndex,
    revealEndIndex: evaluation.revealEndIndex,
    selection,
    actual: evaluation.actual,
    initialAsset: FAST_DECISION_REVIEW_INITIAL_ASSET,
  });

  return {
    score: correct ? 88 : 42,
    passed: correct,
    totalPnl: 0,
    finalTotalAsset: DEFAULT_CAPITAL,
    feedbackCodes,
    usedOperations: 1,
    maxOperations,
    directionResult: {
      selection,
      actual: evaluation.actual,
      correct,
      timedOut,
      decisionSecondsUsed: secondsUsed,
      revealEndIndex: evaluation.revealEndIndex,
      strictnessLevel: config.strictnessLevel,
      dominanceRatio: config.dominanceRatio,
      selectedMfeRatio,
      selectedMaeRatio,
      selectedMfeMaeRatio,
      opportunityDirection,
      opportunityMfeRatio,
      opportunityMaeRatio,
      opportunityMfeMaeRatio,
      longMfeRatio: evaluation.longMfeRatio,
      longMaeRatio: evaluation.longMaeRatio,
    },
    recoveryRate: null,
    alpha: null,
    captureRate: null,
    maxDrawdownRatio: 0,
    grade: '',
    riskReview: null,
    fastReview,
    riskDisciplineFirstAction: null,
  };
};

export const settleRiskDisciplineQuestion = (
  question: SpecialTrainingQuestionState,
  payload: SettleSpecialTrainingQuestionPayload,
  abandoned: boolean,
  config: {
    maxOperations: number;
    maxEntries: number;
  },
): SpecialTrainingSettlementResult => {
  const maxOperations = config.maxOperations;
  const settleTo = Number.isFinite(toFiniteNumber(payload.cursorIndex))
    ? clamp(
        Math.floor(toFiniteNumber(payload.cursorIndex)),
        question.startIndex,
        question.endIndex,
      )
    : abandoned
      ? question.startIndex
      : question.endIndex;
  const hardStopBarIndex = resolveFirstTradableBarIndex(
    question.bars,
    question.startIndex,
    settleTo,
  );
  const firstAction = resolveRiskDisciplineFirstAction(
    payload.tradeActions,
    question.startIndex,
    settleTo,
  );

  const simulated = simulateTradeQuestion(
    'risk-discipline-training',
    question,
    payload.tradeActions,
    settleTo,
    config,
  );
  const holdSimulated = simulateTradeQuestion(
    'risk-discipline-training',
    question,
    [],
    settleTo,
    config,
  );
  const hardStopSimulated = simulateTradeQuestion(
    'risk-discipline-training',
    question,
    [
      {
        type: 'SELL',
        barIndex: hardStopBarIndex,
        inputMode: 'RATIO',
        priceMode: 'CUR_CLOSE',
        ratioInput: '100',
        quantity: 0,
        executionPrice: 0,
        cashEffect: 0,
      },
    ],
    settleTo,
    config,
  );

  const totalPnl = simulated.finalTotalAsset - simulated.runtime.initialCapital;
  const initialCapital = simulated.runtime.initialCapital;
  const challengeStartAsset = simulated.runtime.challengeStartAsset;
  const recoveryRateBase = Math.max(1, initialCapital - challengeStartAsset);
  const recoveryRate =
    (simulated.finalTotalAsset - challengeStartAsset) / recoveryRateBase;
  const alphaVsHold = simulated.finalTotalAsset - holdSimulated.finalTotalAsset;
  const alphaVsHardStop =
    simulated.finalTotalAsset - hardStopSimulated.finalTotalAsset;
  const alphaVsHoldRatio = alphaVsHold / Math.max(1, initialCapital);
  const alphaVsHardStopRatio = alphaVsHardStop / Math.max(1, initialCapital);
  const referencePrice = resolveBarCloseOrNull(
    question.bars,
    clamp(simulated.settlementIndex, question.startIndex, settleTo),
  );
  const costBasisShift = resolveRiskReviewCostBasisShift(
    simulated.initialEntryPrice,
    simulated.finalEntryPrice,
    referencePrice,
  );
  const scored = scoreRiskDisciplineByRelativeAlpha({
    alphaVsHolderRatio: alphaVsHoldRatio,
    alphaVsHardStopRatio,
    recoveryRate,
    usedOperations: simulated.runtime.usedOperations,
    maxOperations,
    costBasisShift,
  });

  const riskReview: NonNullable<SpecialTrainingSettlementResult['riskReview']> =
    {
      alphaVsHold,
      alphaVsHardStop,
      equityCurves: {
        user: toCurvePoints(simulated.curveX, simulated.curveAsset),
        hold: toCurvePoints(holdSimulated.curveX, holdSimulated.curveAsset),
        hardStop: toCurvePoints(
          hardStopSimulated.curveX,
          hardStopSimulated.curveAsset,
        ),
      },
      costBasisShift,
    };

  if (abandoned) {
    return {
      score: 0,
      passed: false,
      totalPnl,
      finalTotalAsset: simulated.finalTotalAsset,
      feedbackCodes: Array.from(
        new Set(['ABANDONED', ...scored.feedbackCodes]),
      ),
      usedOperations: simulated.runtime.usedOperations,
      maxOperations,
      directionResult: null,
      recoveryRate,
      alpha: null,
      captureRate: null,
      maxDrawdownRatio: simulated.runtime.maxDrawdownRatio,
      grade: '',
      riskReview,
      fastReview: null,
      riskDisciplineFirstAction: firstAction,
    };
  }

  const feedbackSet = new Set<SpecialTrainingFeedbackCode>(
    scored.feedbackCodes,
  );

  return {
    score: scored.score,
    passed: scored.passed,
    totalPnl,
    finalTotalAsset: simulated.finalTotalAsset,
    feedbackCodes: Array.from(feedbackSet),
    usedOperations: simulated.runtime.usedOperations,
    maxOperations,
    directionResult: null,
    recoveryRate,
    alpha: scored.alpha,
    captureRate: null,
    maxDrawdownRatio: simulated.runtime.maxDrawdownRatio,
    grade: scored.grade,
    riskReview,
    fastReview: null,
    riskDisciplineFirstAction: firstAction,
  };
};
