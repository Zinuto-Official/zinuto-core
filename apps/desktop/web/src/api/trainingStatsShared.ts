// SPDX-License-Identifier: GPL-3.0-only

export type ApiChallengeStatsRiskBehaviorType =
  | "CUT_LOSS"
  | "ADD_POSITION"
  | "FREEZE";

export type ApiChallengeStatsDashboardInsights = {
  fast: Record<
    "RECENT_10" | "RECENT_50" | "ALL",
    {
      sampleCount: number;
      winRate: number;
      avgDecisionSeconds: number;
      effectiveHitRate: number;
      medianDecisionSeconds: number;
      observeMissRate: number;
      longCount: number;
      shortCount: number;
      observeCount: number;
      longWinRate: number;
      shortWinRate: number;
      slowerPercentile: number;
    }
  >;
  risk: Record<
    "RECENT_10" | "RECENT_50" | "ALL",
    {
      sampleCount: number;
      survivalRate: number;
      comebackRate: number;
      positiveAlphaRate: number;
      dominantBehavior: ApiChallengeStatsRiskBehaviorType;
      dominantBehaviorShare: number;
      medianFirstActionBars: number;
      averageFirstActionBars: number;
      behaviorStats: Record<
        ApiChallengeStatsRiskBehaviorType,
        {
          count: number;
          survived: number;
        }
      >;
    }
  >;
};
