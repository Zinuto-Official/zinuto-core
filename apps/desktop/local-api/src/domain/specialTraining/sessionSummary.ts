// SPDX-License-Identifier: GPL-3.0-only

import { resolveSpecialTrainingDashboardFamily } from "@zinuto/shared/specialTrainingModes";
import {
  summarizeFastDecisionSession as summarizeFastDecisionSessionMetrics,
  summarizeRiskDisciplineSession as summarizeRiskDisciplineSessionMetrics,
  type FastDecisionSettlementLike,
  type RiskDisciplineBehaviorSummary,
  type RiskDisciplineSettlementLike,
} from "@zinuto/shared/domain-calculations/special-training-session-summary";
import {
  FAST_DECISION_REVIEW_INITIAL_ASSET,
  summarizeFastDecisionCapitalSession,
  type FastDecisionCapitalSessionSummary,
} from "@zinuto/shared/domain-calculations/fast-decision-capital-review";
import type {
  SettleSpecialTrainingQuestionPayload,
  SpecialTrainingFastDecisionChoice,
  SpecialTrainingModeId,
  SpecialTrainingQuestionState,
  SpecialTrainingSettlementResult,
  SpecialTrainingTradeAction,
} from "./contracts.js";

export type SpecialTrainingSessionSummaryQuestionEntry = {
  question: SpecialTrainingQuestionState;
  payload: SettleSpecialTrainingQuestionPayload;
  result: SpecialTrainingSettlementResult;
};

type SessionSummaryBase = {
  version: 1;
  modeId: SpecialTrainingModeId;
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
};

export type SpecialTrainingSessionGrade = "S" | "A" | "B" | "C" | "F";
export type SpecialTrainingSessionGradeTone =
  | "elite"
  | "strong"
  | "steady"
  | "warning"
  | "danger";
export type SpecialTrainingSessionMetricTone =
  | "accent"
  | "neutral"
  | "warning"
  | "danger";
export type SpecialTrainingFastDecisionCommentaryTemplateCode =
  | "POSITIVE"
  | "NEUTRAL"
  | "CONTRAST";
export type SpecialTrainingFastDecisionSpeedCode =
  | "RAPID"
  | "STEADY"
  | "MEASURED";
export type SpecialTrainingFastDecisionAccuracyCode =
  | "SHARP"
  | "OKAY"
  | "WEAK";
export type SpecialTrainingFastDecisionBiasCode =
  | "LONG"
  | "SHORT"
  | "OBSERVE"
  | "BALANCED";
export type SpecialTrainingRiskDisciplineCommentaryCode =
  | "RISK_RESCUE"
  | "RISK_OVERTRADE";

export type SpecialTrainingFastDecisionSessionSummary = SessionSummaryBase & {
  modeId: "fast-decision-training";
  winRate: number;
  averageDecisionSeconds: number;
  maxCorrectStreak: number;
  missCount: number;
  missRate: number;
  timeoutCount: number;
  observeMissCount: number;
  selectionCounts: Record<SpecialTrainingFastDecisionChoice, number>;
  actualCounts: Record<SpecialTrainingFastDecisionChoice, number>;
  capitalSummary: FastDecisionCapitalSessionSummary & {
    initialAsset: number;
  };
  presentation: SpecialTrainingFastDecisionSessionPresentation;
};

export type RiskDisciplineBehaviorType =
  | "CUT_LOSS"
  | "ADD_POSITION"
  | "FREEZE";

export type SpecialTrainingRiskDisciplineBehaviorInsight =
  | {
      code: "DEFAULT";
      focusBehavior: null;
      deathRate: null;
    }
  | {
      code: "DEATH_RATE_FOCUS";
      focusBehavior: RiskDisciplineBehaviorType;
      deathRate: number;
    };

export type SpecialTrainingFastDecisionDirectionStatPresentation = {
  id: SpecialTrainingFastDecisionChoice;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  accuracyRate: number;
  tone: SpecialTrainingSessionMetricTone;
};

export type SpecialTrainingRiskDisciplineBehaviorRowPresentation = {
  behavior: RiskDisciplineBehaviorType;
  count: number;
  survivalRate: number;
  tone: SpecialTrainingSessionMetricTone;
};

export type SpecialTrainingFastDecisionSessionPresentation = {
  grade: SpecialTrainingSessionGrade;
  gradeTone: SpecialTrainingSessionGradeTone;
  commentary: {
    templateCode: SpecialTrainingFastDecisionCommentaryTemplateCode;
    speedCode: SpecialTrainingFastDecisionSpeedCode;
    accuracyCode: SpecialTrainingFastDecisionAccuracyCode;
  };
  decisionMetricTone: SpecialTrainingSessionMetricTone;
  biasCode: SpecialTrainingFastDecisionBiasCode;
  directionStats: SpecialTrainingFastDecisionDirectionStatPresentation[];
};

export type SpecialTrainingRiskDisciplineSessionPresentation = {
  grade: SpecialTrainingSessionGrade;
  gradeTone: SpecialTrainingSessionGradeTone;
  commentaryCode: SpecialTrainingRiskDisciplineCommentaryCode;
  alphaMetricTone: SpecialTrainingSessionMetricTone;
  behaviorInsight: SpecialTrainingRiskDisciplineBehaviorInsight;
  behaviorRows: SpecialTrainingRiskDisciplineBehaviorRowPresentation[];
};

export type SpecialTrainingRiskDisciplineSessionSummary = SessionSummaryBase & {
  modeId: "risk-discipline-training";
  survivalCount: number;
  survivalRate: number;
  comebackCount: number;
  comebackRate: number;
  averageAlpha: number;
  averageCostReductionRate: number;
  averageFirstActionBars: number;
  averageUsedOperations: number;
  behaviorStats: Record<RiskDisciplineBehaviorType, RiskDisciplineBehaviorSummary>;
  presentation: SpecialTrainingRiskDisciplineSessionPresentation;
};

export type SpecialTrainingPersistedSessionSummary =
  | SpecialTrainingFastDecisionSessionSummary
  | SpecialTrainingRiskDisciplineSessionSummary;

const buildGradeCounts = (
  entries: readonly SpecialTrainingSessionSummaryQuestionEntry[],
): Record<string, number> => {
  const counts: Record<string, number> = {};
  entries.forEach((entry) => {
    const grade = String(entry.result.grade || "").trim();
    if (!grade) {
      return;
    }
    counts[grade] = (counts[grade] ?? 0) + 1;
  });
  return counts;
};

const buildBaseSummary = <ModeId extends SpecialTrainingModeId>(
  modeId: ModeId,
  entries: readonly SpecialTrainingSessionSummaryQuestionEntry[],
): SessionSummaryBase & { modeId: ModeId } => {
  const completedCount = entries.length;
  const passCount = entries.filter((entry) => entry.result.passed).length;
  const failCount = Math.max(0, completedCount - passCount);
  const totalScore = entries.reduce(
    (sum, entry) => sum + (Number(entry.result.score) || 0),
    0,
  );
  const totalPnl = entries.reduce(
    (sum, entry) => sum + (Number(entry.result.totalPnl) || 0),
    0,
  );
  const maxDrawdownValues = entries.map((entry) =>
    Math.max(0, Number(entry.result.maxDrawdownRatio) || 0),
  );
  const maxMaxDrawdownRatio = maxDrawdownValues.length
    ? Math.max(...maxDrawdownValues)
    : 0;
  const averageMaxDrawdownRatio =
    maxDrawdownValues.length > 0
      ? maxDrawdownValues.reduce((sum, value) => sum + value, 0) /
        maxDrawdownValues.length
      : 0;
  return {
    version: 1,
    modeId,
    completedCount,
    passCount,
    failCount,
    totalScore,
    averageScore: completedCount > 0 ? totalScore / completedCount : 0,
    totalPnl,
    averagePnl: completedCount > 0 ? totalPnl / completedCount : 0,
    averageMaxDrawdownRatio,
    maxMaxDrawdownRatio,
    gradeCounts: buildGradeCounts(entries),
  };
};

const resolveSessionGradeTone = (
  grade: SpecialTrainingSessionGrade,
): SpecialTrainingSessionGradeTone => {
  if (grade === "S") {
    return "elite";
  }
  if (grade === "A") {
    return "strong";
  }
  if (grade === "B") {
    return "steady";
  }
  if (grade === "C") {
    return "warning";
  }
  return "danger";
};

const resolveFastDecisionSessionGrade = (
  winRate: number,
): SpecialTrainingSessionGrade => {
  if (winRate >= 0.85) {
    return "S";
  }
  if (winRate >= 0.65) {
    return "A";
  }
  if (winRate >= 0.5) {
    return "B";
  }
  if (winRate >= 0.35) {
    return "C";
  }
  return "F";
};

const resolveRiskDisciplineSessionGrade = (value: {
  completedCount: number;
  passRate: number;
  survivalRate: number;
  averageAlpha: number;
}): SpecialTrainingSessionGrade => {
  if (value.completedCount <= 0) {
    return "F";
  }
  if (
    value.passRate >= 0.75 &&
    value.survivalRate >= 0.8 &&
    value.averageAlpha > 0
  ) {
    return "S";
  }
  if (
    value.passRate >= 0.5 &&
    value.survivalRate >= 0.65 &&
    value.averageAlpha > 0
  ) {
    return "A";
  }
  if (value.passRate > 0 && value.survivalRate >= 0.5) {
    return "B";
  }
  if (value.survivalRate >= 0.34) {
    return "C";
  }
  return "F";
};

const resolveMetricTone = (
  attemptCount: number,
  accuracyRate: number,
): SpecialTrainingSessionMetricTone => {
  if (attemptCount <= 0) {
    return "neutral";
  }
  if (accuracyRate >= 0.6) {
    return "accent";
  }
  if (accuracyRate >= 0.34) {
    return "warning";
  }
  return "danger";
};

const buildFastDecisionSessionPresentation = (
  summary: Omit<SpecialTrainingFastDecisionSessionSummary, "presentation">,
  entries: readonly SpecialTrainingSessionSummaryQuestionEntry[],
): SpecialTrainingFastDecisionSessionPresentation => {
  const grade = resolveFastDecisionSessionGrade(summary.winRate);
  const decisionSecondsLimit = 20;
  const rapidThreshold = Math.min(2.5, decisionSecondsLimit * 0.18);
  const steadyThreshold = Math.max(
    rapidThreshold + 0.5,
    decisionSecondsLimit * 0.45,
  );
  const speedCode: SpecialTrainingFastDecisionSpeedCode =
    summary.averageDecisionSeconds <= rapidThreshold
      ? "RAPID"
      : summary.averageDecisionSeconds <= steadyThreshold
        ? "STEADY"
        : "MEASURED";
  const accuracyCode: SpecialTrainingFastDecisionAccuracyCode =
    summary.winRate >= 0.75
      ? "SHARP"
      : summary.winRate >= 0.45
        ? "OKAY"
        : "WEAK";
  const templateCode: SpecialTrainingFastDecisionCommentaryTemplateCode =
    summary.winRate >= 0.75
      ? "POSITIVE"
      : summary.winRate >= 0.45
        ? "NEUTRAL"
        : "CONTRAST";
  const decisionMetricTone: SpecialTrainingSessionMetricTone =
    summary.averageDecisionSeconds <= rapidThreshold && summary.winRate < 0.5
      ? "warning"
      : summary.averageDecisionSeconds <= decisionSecondsLimit * 0.5
        ? "accent"
        : "neutral";
  const correctCounts: Record<SpecialTrainingFastDecisionChoice, number> = {
    LONG: 0,
    SHORT: 0,
    OBSERVE: 0,
  };
  entries.forEach((entry) => {
    const result = entry.result.directionResult;
    if (!result?.correct) {
      return;
    }
    correctCounts[result.selection] += 1;
  });
  const directionStats = (["LONG", "SHORT", "OBSERVE"] as const).map((id) => {
    const attemptCount = summary.selectionCounts[id] ?? 0;
    const correctCount = correctCounts[id] ?? 0;
    const wrongCount = Math.max(0, attemptCount - correctCount);
    const accuracyRate = attemptCount > 0 ? correctCount / attemptCount : 0;
    return {
      id,
      attemptCount,
      correctCount,
      wrongCount,
      accuracyRate,
      tone: resolveMetricTone(attemptCount, accuracyRate),
    };
  });
  const longStat = directionStats.find((item) => item.id === "LONG");
  const shortStat = directionStats.find((item) => item.id === "SHORT");
  const observeStat = directionStats.find((item) => item.id === "OBSERVE");
  let biasCode: SpecialTrainingFastDecisionBiasCode = "BALANCED";
  if (
    longStat &&
    shortStat &&
    longStat.attemptCount >= 2 &&
    (longStat.attemptCount >= shortStat.attemptCount + 1 ||
      longStat.accuracyRate + 0.2 < shortStat.accuracyRate) &&
    longStat.accuracyRate < 0.35
  ) {
    biasCode = "LONG";
  } else if (
    longStat &&
    shortStat &&
    shortStat.attemptCount >= 2 &&
    (shortStat.attemptCount >= longStat.attemptCount + 1 ||
      shortStat.accuracyRate + 0.2 < longStat.accuracyRate) &&
    shortStat.accuracyRate < 0.35
  ) {
    biasCode = "SHORT";
  } else if (
    observeStat &&
    observeStat.attemptCount >= 2 &&
    observeStat.accuracyRate < 0.5
  ) {
    biasCode = "OBSERVE";
  }
  return {
    grade,
    gradeTone: resolveSessionGradeTone(grade),
    commentary: {
      templateCode,
      speedCode,
      accuracyCode,
    },
    decisionMetricTone,
    biasCode,
    directionStats,
  };
};

const buildRiskDisciplineSessionPresentation = (
  summary: Omit<SpecialTrainingRiskDisciplineSessionSummary, "presentation">,
): SpecialTrainingRiskDisciplineSessionPresentation => {
  const passRate =
    summary.completedCount > 0 ? summary.passCount / summary.completedCount : 0;
  const grade = resolveRiskDisciplineSessionGrade({
    completedCount: summary.completedCount,
    passRate,
    survivalRate: summary.survivalRate,
    averageAlpha: summary.averageAlpha,
  });
  const behaviorRows = (
    Object.entries(summary.behaviorStats) as Array<
      [
        RiskDisciplineBehaviorType,
        (typeof summary.behaviorStats)[RiskDisciplineBehaviorType],
      ]
    >
  ).map(([behavior, stats]) => ({
    behavior,
    count: stats.count,
    survivalRate: stats.survivalRate,
    tone:
      stats.count <= 0
        ? ("neutral" as const)
        : stats.survivalRate >= 0.66
          ? ("accent" as const)
          : stats.survivalRate >= 0.34
            ? ("warning" as const)
            : ("danger" as const),
  }));
  const focus = [...behaviorRows]
    .filter((item) => item.count > 0)
    .sort((left, right) => {
      const leftDeathRate = 1 - left.survivalRate;
      const rightDeathRate = 1 - right.survivalRate;
      if (rightDeathRate !== leftDeathRate) {
        return rightDeathRate - leftDeathRate;
      }
      return right.count - left.count;
    })[0];
  const behaviorInsight: SpecialTrainingRiskDisciplineBehaviorInsight = focus
    ? {
        code: "DEATH_RATE_FOCUS",
        focusBehavior: focus.behavior,
        deathRate: Math.max(0, 1 - focus.survivalRate),
      }
    : {
        code: "DEFAULT",
        focusBehavior: null,
        deathRate: null,
      };
  return {
    grade,
    gradeTone: resolveSessionGradeTone(grade),
    commentaryCode:
      passRate >= 0.5 &&
      summary.survivalRate >= 0.5 &&
      summary.averageAlpha > 0
        ? "RISK_RESCUE"
        : "RISK_OVERTRADE",
    alphaMetricTone:
      summary.averageAlpha > 0
        ? "accent"
        : summary.averageAlpha < 0
          ? "danger"
          : "neutral",
    behaviorInsight,
    behaviorRows,
  };
};

const summarizeFastDecisionSession = (
  entries: readonly SpecialTrainingSessionSummaryQuestionEntry[],
): SpecialTrainingFastDecisionSessionSummary => {
  const base = buildBaseSummary("fast-decision-training", entries);
  const metrics = summarizeFastDecisionSessionMetrics(
    entries.map(
      (entry): FastDecisionSettlementLike => ({
        passed: entry.result.passed,
        score: entry.result.score,
        directionResult: entry.result.directionResult,
      }),
    ),
  );

  const summary = {
    ...base,
    winRate: metrics.winRate,
    averageDecisionSeconds: metrics.averageDecisionSeconds,
    maxCorrectStreak: metrics.maxCorrectStreak,
    missCount: metrics.missCount,
    missRate: metrics.missRate,
    timeoutCount: metrics.timeoutCount,
    observeMissCount: metrics.observeMissCount,
    selectionCounts: metrics.selectionCounts,
    actualCounts: metrics.actualCounts,
    capitalSummary: {
      initialAsset: FAST_DECISION_REVIEW_INITIAL_ASSET,
      ...summarizeFastDecisionCapitalSession(
        entries.map((entry) => entry.result.fastReview),
      ),
    },
  } satisfies Omit<SpecialTrainingFastDecisionSessionSummary, "presentation">;

  return {
    ...summary,
    presentation: buildFastDecisionSessionPresentation(summary, entries),
  };
};

const summarizeRiskDisciplineSession = (
  entries: readonly SpecialTrainingSessionSummaryQuestionEntry[],
): SpecialTrainingRiskDisciplineSessionSummary => {
  const base = buildBaseSummary("risk-discipline-training", entries);
  const metrics = summarizeRiskDisciplineSessionMetrics(
    entries.map(
      (entry): RiskDisciplineSettlementLike => ({
        passed: entry.result.passed,
        totalPnl: entry.result.totalPnl,
        finalTotalAsset: entry.result.finalTotalAsset,
        alpha: entry.result.alpha,
        usedOperations: entry.result.usedOperations,
        startIndex: entry.question.startIndex,
        settleToIndex: entry.payload.cursorIndex ?? entry.question.endIndex,
        tradeActions: (Array.isArray(entry.payload.tradeActions)
          ? entry.payload.tradeActions.filter(
              (
                action,
              ): action is SpecialTrainingTradeAction & { barIndex: number } =>
                (action.type === "BUY" || action.type === "SELL") &&
                Number.isFinite(Number(action.barIndex)),
            )
          : null) as RiskDisciplineSettlementLike["tradeActions"],
        riskReview: entry.result.riskReview,
      }),
    ),
  );

  const summary = {
    ...base,
    survivalCount: metrics.survivalCount,
    survivalRate: metrics.survivalRate,
    comebackCount: metrics.comebackCount,
    comebackRate: metrics.comebackRate,
    averageAlpha: metrics.averageAlpha,
    averageCostReductionRate: metrics.averageCostReductionRate,
    averageFirstActionBars: metrics.averageFirstActionBars,
    averageUsedOperations: metrics.averageUsedOperations,
    behaviorStats: metrics.behaviorStats,
  } satisfies Omit<SpecialTrainingRiskDisciplineSessionSummary, "presentation">;

  return {
    ...summary,
    presentation: buildRiskDisciplineSessionPresentation(summary),
  };
};

export const summarizeSpecialTrainingSession = (
  modeId: SpecialTrainingModeId,
  entries: readonly SpecialTrainingSessionSummaryQuestionEntry[],
): SpecialTrainingPersistedSessionSummary =>
  resolveSpecialTrainingDashboardFamily(modeId) === "RISK_DISCIPLINE"
    ? summarizeRiskDisciplineSession(entries)
    : summarizeFastDecisionSession(entries);
