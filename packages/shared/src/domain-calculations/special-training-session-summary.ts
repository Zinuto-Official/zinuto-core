// SPDX-License-Identifier: GPL-3.0-only

export type FastDecisionChoice = "LONG" | "SHORT" | "OBSERVE";

export type FastDecisionDirectionResult = {
  selection: FastDecisionChoice;
  actual: FastDecisionChoice;
  correct: boolean;
  timedOut: boolean;
  decisionSecondsUsed: number;
};

export type FastDecisionSettlementLike = {
  passed: boolean;
  score: number;
  directionResult: FastDecisionDirectionResult | null;
};

export type FastDecisionSessionSummaryMetrics = {
  completedCount: number;
  passCount: number;
  failCount: number;
  totalScore: number;
  averageScore: number;
  winRate: number;
  averageDecisionSeconds: number;
  maxCorrectStreak: number;
  missCount: number;
  missRate: number;
  timeoutCount: number;
  observeMissCount: number;
  selectionCounts: Record<FastDecisionChoice, number>;
  actualCounts: Record<FastDecisionChoice, number>;
};

export type RiskDisciplineBehaviorType =
  | "CUT_LOSS"
  | "ADD_POSITION"
  | "FREEZE";

export type RiskDisciplineTradeAction = {
  type: "BUY" | "SELL";
  barIndex: number;
};

export type RiskDisciplineReviewLike = {
  costBasisShift?: {
    shiftRatio?: number | null;
  } | null;
};

export type RiskDisciplineSettlementLike = {
  passed: boolean;
  totalPnl: number;
  finalTotalAsset: number;
  alpha: number | null;
  usedOperations: number;
  startIndex?: number;
  settleToIndex?: number;
  tradeActions?: readonly RiskDisciplineTradeAction[] | null;
  riskReview: RiskDisciplineReviewLike | null;
};

export type RiskDisciplineFirstActionSummary = {
  behavior: RiskDisciplineBehaviorType;
  barsSinceStart: number;
};

export type RiskDisciplineBehaviorSummary = {
  count: number;
  survivedCount: number;
  comebackCount: number;
  averageFirstActionBars: number;
  survivalRate: number;
  comebackRate: number;
};

export type RiskDisciplineSessionSummaryMetrics = {
  completedCount: number;
  passCount: number;
  failCount: number;
  survivalCount: number;
  survivalRate: number;
  comebackCount: number;
  comebackRate: number;
  averageAlpha: number;
  averageCostReductionRate: number;
  averageFirstActionBars: number;
  averageUsedOperations: number;
  behaviorStats: Record<RiskDisciplineBehaviorType, RiskDisciplineBehaviorSummary>;
};

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

const createChoiceCountMap = (): Record<FastDecisionChoice, number> => ({
  LONG: 0,
  SHORT: 0,
  OBSERVE: 0,
});

const createRiskBehaviorStats = (): Record<
  RiskDisciplineBehaviorType,
  {
    count: number;
    survivedCount: number;
    comebackCount: number;
    totalFirstActionBars: number;
  }
> => ({
  CUT_LOSS: {
    count: 0,
    survivedCount: 0,
    comebackCount: 0,
    totalFirstActionBars: 0,
  },
  ADD_POSITION: {
    count: 0,
    survivedCount: 0,
    comebackCount: 0,
    totalFirstActionBars: 0,
  },
  FREEZE: {
    count: 0,
    survivedCount: 0,
    comebackCount: 0,
    totalFirstActionBars: 0,
  },
});

const resolveInitialAsset = (
  settlement: RiskDisciplineSettlementLike,
): number | null => {
  const finalTotalAsset = toFiniteNumber(settlement.finalTotalAsset);
  const totalPnl = toFiniteNumber(settlement.totalPnl);
  if (!Number.isFinite(finalTotalAsset) || !Number.isFinite(totalPnl)) {
    return null;
  }
  const initialAsset = finalTotalAsset - totalPnl;
  return Number.isFinite(initialAsset) && initialAsset > 0 ? initialAsset : null;
};

export const hasEffectiveRiskDisciplineAction = (
  settlement: RiskDisciplineSettlementLike,
): boolean => {
  const usedOperations = Math.max(
    0,
    Math.floor(toFiniteNumber(settlement.usedOperations) || 0),
  );
  if (usedOperations > 0) {
    return true;
  }
  return Array.isArray(settlement.tradeActions) && settlement.tradeActions.length > 0;
};

export const summarizeFastDecisionSession = (
  settlements: readonly FastDecisionSettlementLike[],
): FastDecisionSessionSummaryMetrics => {
  const completedCount = settlements.length;
  const selectionCounts = createChoiceCountMap();
  const actualCounts = createChoiceCountMap();

  let passCount = 0;
  let totalScore = 0;
  let totalDecisionSeconds = 0;
  let decisionCount = 0;
  let currentCorrectStreak = 0;
  let maxCorrectStreak = 0;
  let missCount = 0;
  let timeoutCount = 0;
  let observeMissCount = 0;

  settlements.forEach((settlement) => {
    totalScore += Number(settlement.score) || 0;
    if (settlement.passed) {
      passCount += 1;
      currentCorrectStreak += 1;
      maxCorrectStreak = Math.max(maxCorrectStreak, currentCorrectStreak);
    } else {
      currentCorrectStreak = 0;
    }

    const directionResult = settlement.directionResult;
    if (!directionResult) {
      return;
    }

    selectionCounts[directionResult.selection] += 1;
    actualCounts[directionResult.actual] += 1;
    totalDecisionSeconds += Number(directionResult.decisionSecondsUsed) || 0;
    decisionCount += 1;

    if (directionResult.timedOut) {
      timeoutCount += 1;
    }
    if (!directionResult.correct) {
      missCount += 1;
    }
    if (
      directionResult.selection === "OBSERVE" &&
      directionResult.actual !== "OBSERVE"
    ) {
      observeMissCount += 1;
    }
  });

  const failCount = Math.max(0, completedCount - passCount);

  return {
    completedCount,
    passCount,
    failCount,
    totalScore,
    averageScore: completedCount > 0 ? totalScore / completedCount : 0,
    winRate: completedCount > 0 ? passCount / completedCount : 0,
    averageDecisionSeconds:
      decisionCount > 0 ? totalDecisionSeconds / decisionCount : 0,
    maxCorrectStreak,
    missCount,
    missRate: completedCount > 0 ? missCount / completedCount : 0,
    timeoutCount,
    observeMissCount,
    selectionCounts,
    actualCounts,
  };
};

export const resolveRiskDisciplineSurvived = (
  settlement: RiskDisciplineSettlementLike,
): boolean => {
  return Boolean(settlement.passed) && hasEffectiveRiskDisciplineAction(settlement);
};

export const resolveRiskDisciplineComeback = (
  settlement: RiskDisciplineSettlementLike,
): boolean => {
  if (!resolveRiskDisciplineSurvived(settlement)) {
    return false;
  }
  const initialAsset = resolveInitialAsset(settlement);
  const finalTotalAsset = toFiniteNumber(settlement.finalTotalAsset);
  if (initialAsset === null || !Number.isFinite(finalTotalAsset)) {
    return false;
  }
  return finalTotalAsset >= initialAsset;
};

export const resolveRiskDisciplineCostReductionRate = (
  settlement: RiskDisciplineSettlementLike,
): number => {
  const shiftRatio = toFiniteNumber(
    settlement.riskReview?.costBasisShift?.shiftRatio,
  );
  if (!Number.isFinite(shiftRatio)) {
    return 0;
  }
  return Math.max(0, -shiftRatio);
};

export const resolveRiskDisciplineFirstAction = (
  settlement: RiskDisciplineSettlementLike,
): RiskDisciplineFirstActionSummary => {
  const startIndex = Math.max(
    0,
    Math.floor(toFiniteNumber(settlement.startIndex) || 0),
  );
  const settleToIndex = Math.max(
    startIndex,
    Math.floor(
      toFiniteNumber(settlement.settleToIndex) ||
        toFiniteNumber(settlement.startIndex) ||
        0,
    ),
  );
  const actions = Array.isArray(settlement.tradeActions)
    ? settlement.tradeActions
        .map((action) => ({
          type: action.type,
          barIndex: Math.floor(toFiniteNumber(action.barIndex)),
        }))
        .filter(
          (
            action,
          ): action is { type: "BUY" | "SELL"; barIndex: number } =>
            (action.type === "BUY" || action.type === "SELL") &&
            Number.isFinite(action.barIndex),
        )
        .sort((left, right) => left.barIndex - right.barIndex)
    : [];
  const firstAction = actions[0];
  if (!firstAction) {
    return {
      behavior: "FREEZE",
      barsSinceStart: Math.max(0, settleToIndex - startIndex),
    };
  }
  return {
    behavior: firstAction.type === "SELL" ? "CUT_LOSS" : "ADD_POSITION",
    barsSinceStart: Math.max(0, firstAction.barIndex - startIndex),
  };
};

export const summarizeRiskDisciplineSession = (
  settlements: readonly RiskDisciplineSettlementLike[],
): RiskDisciplineSessionSummaryMetrics => {
  const completedCount = settlements.length;
  const behaviorStats = createRiskBehaviorStats();

  let passCount = 0;
  let survivalCount = 0;
  let comebackCount = 0;
  let alphaCount = 0;
  let alphaTotal = 0;
  let costReductionTotal = 0;
  let firstActionBarsTotal = 0;
  let usedOperationsTotal = 0;

  settlements.forEach((settlement) => {
    const survived = resolveRiskDisciplineSurvived(settlement);
    if (survived) {
      passCount += 1;
    }

    const comeback = resolveRiskDisciplineComeback(settlement);
    const firstAction = resolveRiskDisciplineFirstAction(settlement);
    const costReductionRate = resolveRiskDisciplineCostReductionRate(settlement);
    const alpha = toFiniteNumber(settlement.alpha);

    if (survived) {
      survivalCount += 1;
    }
    if (comeback) {
      comebackCount += 1;
    }
    if (Number.isFinite(alpha)) {
      alphaTotal += alpha;
      alphaCount += 1;
    }

    costReductionTotal += costReductionRate;
    firstActionBarsTotal += firstAction.barsSinceStart;
    usedOperationsTotal += Math.max(
      0,
      Math.floor(toFiniteNumber(settlement.usedOperations) || 0),
    );

    behaviorStats[firstAction.behavior].count += 1;
    behaviorStats[firstAction.behavior].survivedCount += Number(survived);
    behaviorStats[firstAction.behavior].comebackCount += Number(comeback);
    behaviorStats[firstAction.behavior].totalFirstActionBars +=
      firstAction.barsSinceStart;
  });

  const failCount = Math.max(0, completedCount - passCount);
  const normalizeBehavior = (
    behavior: RiskDisciplineBehaviorType,
  ): RiskDisciplineBehaviorSummary => {
    const source = behaviorStats[behavior];
    return {
      count: source.count,
      survivedCount: source.survivedCount,
      comebackCount: source.comebackCount,
      averageFirstActionBars:
        source.count > 0 ? source.totalFirstActionBars / source.count : 0,
      survivalRate:
        source.count > 0 ? source.survivedCount / source.count : 0,
      comebackRate:
        source.count > 0 ? source.comebackCount / source.count : 0,
    };
  };

  return {
    completedCount,
    passCount,
    failCount,
    survivalCount,
    survivalRate: completedCount > 0 ? survivalCount / completedCount : 0,
    comebackCount,
    comebackRate: completedCount > 0 ? comebackCount / completedCount : 0,
    averageAlpha: alphaCount > 0 ? alphaTotal / alphaCount : 0,
    averageCostReductionRate:
      completedCount > 0 ? costReductionTotal / completedCount : 0,
    averageFirstActionBars:
      completedCount > 0 ? firstActionBarsTotal / completedCount : 0,
    averageUsedOperations:
      completedCount > 0 ? usedOperationsTotal / completedCount : 0,
    behaviorStats: {
      CUT_LOSS: normalizeBehavior("CUT_LOSS"),
      ADD_POSITION: normalizeBehavior("ADD_POSITION"),
      FREEZE: normalizeBehavior("FREEZE"),
    },
  };
};
