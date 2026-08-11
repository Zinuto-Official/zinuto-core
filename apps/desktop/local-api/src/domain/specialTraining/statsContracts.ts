// SPDX-License-Identifier: GPL-3.0-only

import type { SpecialTrainingModeId } from './contracts.js';
import type {
  SpecialTrainingHistoryQuestionDetail,
  SpecialTrainingHistorySessionDetail,
} from './historyTypes.js';
import type { TrainingSummaryPayload } from '../training/summary.js';
import type { ProfitabilityFilter } from '../training/statsDomain.js';

export type ChallengeStatsProjectReplay = {
  bars: Array<{
    ts: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  snapshot: Record<string, unknown>;
  drawings: unknown[];
  equityCurve: Array<{ ts: string; value: number }>;
  drawdownCurve: Array<{ ts: string; value: number }>;
  tradeRounds: unknown[];
  finalEquity: number;
  equityReturnRate: number;
  baseTimeframe: string;
  chartIndicators?: Record<string, unknown>;
  noteSummary?: Record<string, unknown>;
  specialTraining?: Record<string, unknown> | null;
  directionResult: {
    selection: string | null;
    actual: string | null;
    correct: boolean | null;
    timedOut: boolean | null;
    decisionSecondsUsed: number | null;
    revealEndIndex: number | null;
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
  };
  feedbackCodes: string[];
  riskReview: SpecialTrainingHistoryQuestionDetail['riskReview'];
  tradeActions: SpecialTrainingHistoryQuestionDetail['tradeActions'];
};

export type ChallengeStatsProjectDetail = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  initialTotal: number;
  totalPnl: number;
  profitRate: number;
  durationDays: number;
  totalTrades: number;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  trainingDateRange: string;
  summary: TrainingSummaryPayload;
  finalEquity: number;
  equityReturnRate: number;
  replayHydrationStatus?: 'READY' | 'SOURCE_CHANGED' | 'SOURCE_MISSING' | 'SNAPSHOT_ONLY' | 'EXPIRED';
  detailExpiredAt?: string | null;
  replay: ChallengeStatsProjectReplay;
};

export type SpecialTrainingStatsFilters = {
  modeId: SpecialTrainingModeId;
  from?: string;
  to?: string;
  symbol?: string;
  timeframe?: string;
  profitability?: ProfitabilityFilter;
  limit?: number;
  detailId?: string;
  includeProjectDetails?: boolean;
};

export type SpecialTrainingStatsModeAvailability = Record<
  SpecialTrainingModeId,
  {
    tag: string;
    projectCount: number;
  }
>;

export type SpecialTrainingStatsReportPayload = {
  report: ChallengeStatsReport;
  projectDetailsById: Record<string, ChallengeStatsProjectDetail>;
};

export type ChallengeStatsDashboardWindowPreset =
  | 'RECENT_10'
  | 'RECENT_50'
  | 'ALL';

export type ChallengeStatsFastDirectionSelection =
  | 'LONG'
  | 'SHORT'
  | 'OBSERVE';

export type ChallengeStatsRiskBehaviorType =
  | 'CUT_LOSS'
  | 'ADD_POSITION'
  | 'FREEZE';

export type ChallengeStatsReviewGrade = 'S' | 'A' | 'F';

export type ChallengeStatsDashboardFastInsights = {
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
};

export type ChallengeStatsDashboardRiskBehaviorSummary = {
  count: number;
  survived: number;
};

export type ChallengeStatsDashboardRiskInsights = {
  sampleCount: number;
  survivalRate: number;
  comebackRate: number;
  positiveAlphaRate: number;
  dominantBehavior: ChallengeStatsRiskBehaviorType;
  dominantBehaviorShare: number;
  medianFirstActionBars: number;
  averageFirstActionBars: number;
  behaviorStats: Record<
    ChallengeStatsRiskBehaviorType,
    ChallengeStatsDashboardRiskBehaviorSummary
  >;
};

export type ChallengeStatsFastSessionRow = {
  kind: 'fast';
  id: string;
  createdAt: string;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  totalPnl: number;
  profitRate: number;
  totalTrades: number;
  durationDays: number;
  decisionSeconds: number;
  selection: ChallengeStatsFastDirectionSelection;
  actual: ChallengeStatsFastDirectionSelection;
  correct: boolean;
  timedOut: boolean;
  edgeRatio: number;
  opportunityEdgeRatio: number;
  performanceRate: number;
  reviewGrade: ChallengeStatsReviewGrade;
};

export type ChallengeStatsRiskSessionRow = {
  kind: 'risk';
  id: string;
  createdAt: string;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  totalPnl: number;
  profitRate: number;
  totalTrades: number;
  durationDays: number;
  survived: boolean;
  comeback: boolean;
  alphaRatio: number | null;
  returnRate: number;
  firstActionBars: number;
  behavior: ChallengeStatsRiskBehaviorType;
  reviewGrade: ChallengeStatsReviewGrade;
  curvePoints: Array<[number, number]>;
};

export type ChallengeStatsDashboardSessionRow =
  | ChallengeStatsFastSessionRow
  | ChallengeStatsRiskSessionRow;

export type ChallengeStatsDashboardInsights = {
  fast: Record<
    ChallengeStatsDashboardWindowPreset,
    ChallengeStatsDashboardFastInsights
  >;
  risk: Record<
    ChallengeStatsDashboardWindowPreset,
    ChallengeStatsDashboardRiskInsights
  >;
};

export type ChallengeStatsReport = {
  generatedAt: string;
  modeId: SpecialTrainingModeId;
  filtersApplied: {
    from: string | null;
    to: string | null;
    samplePoolId: string;
    symbol: string;
    timeframe: string;
    tag: string;
    profitability: ProfitabilityFilter;
    comparePoolA: string;
    comparePoolB: string;
  };
  totals: {
    totalProjects: number;
    filteredProjects: number;
  };
  filterOptions: {
    samplePools: Array<{ id: string; name: string; count: number }>;
    symbols: Array<{ symbol: string; count: number }>;
    timeframes: Array<{ timeframe: string; count: number }>;
    tags: Array<{ tag: string; count: number }>;
  };
  overview: {
    totalSessions: number;
    totalTrainingDays: number;
    totalTrades: number;
    totalPnl: number;
    totalReturnRate: number;
    maxDrawdownRate: number;
    winRate: number;
    profitLossRatio: number;
    averageTradePnl: number;
    averageHoldBars: number;
    averageDecisionSeconds: number;
  };
  winRateBreakdown: {
    overallWinRate: number;
    longWinRate: number;
    shortWinRate: number;
    samplePoolWinRates: Array<{ samplePoolId: string; winRate: number }>;
    symbolWinRates: Array<{ symbol: string; winRate: number }>;
  };
  monthlyPerformance: Array<unknown>;
  samplePoolPerformance: Array<unknown>;
  symbolPerformance: Array<unknown>;
  timeframePerformance: Array<unknown>;
  tagPerformance: Array<unknown>;
  dashboardInsights: ChallengeStatsDashboardInsights;
  dashboardRows: ChallengeStatsDashboardSessionRow[];
  defaultModeId: SpecialTrainingModeId;
  modeAvailability: SpecialTrainingStatsModeAvailability;
  costAnalysis: {
    totalFees: number;
    feeRate: number;
  };
  strategyComparison: {
    poolA: {
      sessionCount: number;
      returnRate: number;
      winRate: number;
      profitLossRatio: number;
      maxDrawdownRate: number;
      avgHoldBars: number;
      tradeFrequency: number;
    };
    poolB: {
      sessionCount: number;
      returnRate: number;
      winRate: number;
      profitLossRatio: number;
      maxDrawdownRate: number;
      avgHoldBars: number;
      tradeFrequency: number;
    };
  };
  recentSessions: Array<{
    id: string;
    name: string;
    symbol: string;
    samplePoolId: string;
    samplePoolName: string;
    baseTimeframe: string;
    createdAt: string;
    profitRate: number;
    totalPnl: number;
    totalTrades: number;
    durationDays: number;
  }>;
};

export type ChallengeStatsRecentSession =
  ChallengeStatsReport['recentSessions'][number];

export type ChallengeHistoryQuestionFeedRow = {
  session: SpecialTrainingHistorySessionDetail;
  question: SpecialTrainingHistoryQuestionDetail;
  project: ChallengeStatsProjectDetail;
};
