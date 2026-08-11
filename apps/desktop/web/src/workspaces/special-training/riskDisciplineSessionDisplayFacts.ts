// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiSpecialTrainingRiskBehaviorSummary,
  ApiSpecialTrainingRiskBehaviorType,
  ApiSpecialTrainingRiskDisciplineSessionSummary,
  ApiSpecialTrainingSessionSummary,
} from "@/api";
import type { SettlementResult } from "@/workspaces/special-training/domain/specialTrainingTypes";

export type RiskDisciplineBehaviorType = ApiSpecialTrainingRiskBehaviorType;
export type RiskDisciplineSessionSummary =
  ApiSpecialTrainingRiskDisciplineSessionSummary;
export type RiskDisciplineFirstActionSummary = {
  behavior: RiskDisciplineBehaviorType;
  barsSinceStart: number;
};

const createEmptyBehaviorDisplayFacts = (): ApiSpecialTrainingRiskBehaviorSummary => ({
  count: 0,
  survivedCount: 0,
  comebackCount: 0,
  averageFirstActionBars: 0,
  survivalRate: 0,
  comebackRate: 0,
});

export const EMPTY_RISK_DISCIPLINE_SESSION_DISPLAY_FACTS: RiskDisciplineSessionSummary =
  {
    version: 1,
    modeId: "risk-discipline-training",
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
    survivalCount: 0,
    survivalRate: 0,
    comebackCount: 0,
    comebackRate: 0,
    averageAlpha: 0,
    averageCostReductionRate: 0,
    averageFirstActionBars: 0,
    averageUsedOperations: 0,
    behaviorStats: {
      CUT_LOSS: createEmptyBehaviorDisplayFacts(),
      ADD_POSITION: createEmptyBehaviorDisplayFacts(),
      FREEZE: createEmptyBehaviorDisplayFacts(),
    },
    presentation: {
      grade: "F",
      gradeTone: "danger",
      commentaryCode: "RISK_OVERTRADE",
      alphaMetricTone: "neutral",
      behaviorInsight: {
        code: "DEFAULT",
        focusBehavior: null,
        deathRate: null,
      },
      behaviorRows: [
        {
          behavior: "CUT_LOSS",
          count: 0,
          survivalRate: 0,
          tone: "neutral",
        },
        {
          behavior: "ADD_POSITION",
          count: 0,
          survivalRate: 0,
          tone: "neutral",
        },
        {
          behavior: "FREEZE",
          count: 0,
          survivalRate: 0,
          tone: "neutral",
        },
      ],
    },
  };

export const readRiskDisciplineSessionDisplayFacts = (
  sessionSummary: ApiSpecialTrainingSessionSummary | null | undefined,
): RiskDisciplineSessionSummary =>
  sessionSummary?.modeId === "risk-discipline-training"
    ? sessionSummary
    : EMPTY_RISK_DISCIPLINE_SESSION_DISPLAY_FACTS;

export const readLatestRiskDisciplineSessionDisplayFacts = (
  settlements: readonly SettlementResult[],
): RiskDisciplineSessionSummary => {
  const latestSummary = (
    settlements.at(-1) as
      | (SettlementResult & {
          sessionSummary?: ApiSpecialTrainingSessionSummary | null;
        })
      | undefined
  )?.sessionSummary;
  return readRiskDisciplineSessionDisplayFacts(latestSummary);
};

export const readRiskDisciplineFirstActionDisplayFacts = (
  settlement: SettlementResult,
): RiskDisciplineFirstActionSummary => {
  const firstAction = (
    settlement as SettlementResult & {
      riskDisciplineFirstAction?: RiskDisciplineFirstActionSummary | null;
    }
  ).riskDisciplineFirstAction;
  return firstAction ?? { behavior: "FREEZE", barsSinceStart: 0 };
};
