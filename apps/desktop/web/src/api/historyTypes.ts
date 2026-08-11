// SPDX-License-Identifier: GPL-3.0-only

import type { OperatorSummary as ApiOperatorSummary } from "@zinuto/shared/operatorSummary";
import type { ReplayRatioState } from "@zinuto/shared/replay";
import type { ApiChallengeStatsDashboardInsights } from "@/api/trainingStatsShared";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { PriceMode, TrainingSummary } from "@/domains/training/types";

export type ApiReplayRatioState = ReplayRatioState;

export type ApiTrainingProjectSummary = {
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
  summary: TrainingSummary;
  finalEquity: number;
  equityReturnRate: number;
  assetClass?: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  detailExpiredAt?: string | null;
  operatorSummary: ApiOperatorSummary;
};

export type ApiTrainingProjectDetail = ApiTrainingProjectSummary & {
  replayHydrationStatus?:
    "READY" | "SOURCE_CHANGED" | "SOURCE_MISSING" | "SNAPSHOT_ONLY" | "EXPIRED";
  replay?: Record<string, unknown>;
};

export type ApiTrainingProject = ApiTrainingProjectDetail;

export type ApiTrainingProjectArchiveFromSessionPayload = {
  sessionId: string;
  name: string;
  samplePoolId: string;
  samplePoolName: string;
  displayPeriod: DisplayPeriodKey;
  finalizePriceMode?: PriceMode;
  drawings?: unknown[];
  chartIndicators?: unknown;
};

export type ApiReplayCurvePoint = {
  ts: string;
  value: number;
};

export type ApiTrainingProjectSettlementPreviewPayload = {
  sessionId: string;
  displayPeriod: DisplayPeriodKey;
  finalizePriceMode?: PriceMode;
};

export type ApiTrainingProjectSettlementPreview = {
  summary: TrainingSummary;
  replayMetrics: {
    initialCapital: number;
    finalEquity: number;
    equityReturnRate: number;
    equityCurve: ApiReplayCurvePoint[];
    drawdownCurve: ApiReplayCurvePoint[];
  };
  baseTimeframe: "1m" | "5m" | "1h" | "1d";
  trainingDateRange: string;
};

export type ApiTrainingStatsComparisonMetrics = {
  sessionCount: number;
  returnRate: number;
  winRate: number;
  profitLossRatio: number;
  maxDrawdownRate: number;
  avgHoldBars: number;
  tradeFrequency: number;
};

export type ApiTrainingStatsReport = {
  generatedAt: string;
  filtersApplied: {
    from: string | null;
    to: string | null;
    samplePoolId: string;
    symbol: string;
    timeframe: string;
    tag: string;
    profitability: "ALL" | "PROFIT" | "LOSS";
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
    sessionWinRate: number;
    monthlyWinRate: Array<{
      period: string;
      sessionCount: number;
      winRate: number;
    }>;
    samplePoolWinRate: Array<{
      samplePoolId: string;
      samplePoolName: string;
      sessionCount: number;
      winRate: number;
    }>;
  };
  pnlStructure: {
    avgProfitTrade: number;
    avgLossTrade: number;
    profitLossRatio: number;
    expectancy: number;
  };
  behavior: {
    avgTradesPerDay: number;
    avgTradesPerSession: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    averageHoldBars: number;
    averageTakeProfitRate: number;
    averageStopLossRate: number;
    addPositionCount: number;
    reducePositionCount: number;
    fullPositionCount: number;
  };
  cost: {
    totalFees: number;
    avgFeePerSession: number;
    feeToProfitRatio: number;
    slippageImpact: number;
  };
  winLossStructure: {
    wins: number;
    losses: number;
    flat: number;
  };
  dailyPerformance: Array<{
    period: string;
    sessionCount: number;
    totalPnl: number;
    winRate: number;
    maxDrawdownRate: number;
    totalReturnRate: number;
  }>;
  weeklyPerformance: Array<{
    period: string;
    sessionCount: number;
    totalPnl: number;
    winRate: number;
    maxDrawdownRate: number;
    totalReturnRate: number;
  }>;
  monthlyPerformance: Array<{
    period: string;
    sessionCount: number;
    totalPnl: number;
    winRate: number;
    maxDrawdownRate: number;
    totalReturnRate: number;
  }>;
  samplePoolStats: Array<{
    samplePoolId: string;
    samplePoolName: string;
    sessionCount: number;
    totalReturnRate: number;
    winRate: number;
    totalTrades: number;
    avgHoldBars: number;
  }>;
  symbolStats: Array<{
    symbol: string;
    sessionCount: number;
    bestReturn: number;
    worstReturn: number;
    avgReturn: number;
  }>;
  timeframeStats: Array<{
    timeframe: string;
    sessionCount: number;
    winRate: number;
    avgReturn: number;
    maxDrawdownRate: number;
    tradeFrequency: number;
  }>;
  comparisons: {
    recent20VsPrevious20: {
      leftLabel: string;
      rightLabel: string;
      left: ApiTrainingStatsComparisonMetrics;
      right: ApiTrainingStatsComparisonMetrics;
      delta: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">;
    };
    monthVsPreviousMonth: {
      leftLabel: string;
      rightLabel: string;
      left: ApiTrainingStatsComparisonMetrics;
      right: ApiTrainingStatsComparisonMetrics;
      delta: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">;
    };
    poolAVsPoolB: {
      leftLabel: string;
      rightLabel: string;
      left: ApiTrainingStatsComparisonMetrics;
      right: ApiTrainingStatsComparisonMetrics;
      delta: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">;
    };
    dayVsMinute: {
      leftLabel: string;
      rightLabel: string;
      left: ApiTrainingStatsComparisonMetrics;
      right: ApiTrainingStatsComparisonMetrics;
      delta: Omit<ApiTrainingStatsComparisonMetrics, "sessionCount">;
    };
  };
  recentSessions: Array<{
    id: string;
    name: string;
    createdAt: string;
    symbol: string;
    samplePoolId: string;
    samplePoolName: string;
    baseTimeframe: string;
    totalPnl: number;
    profitRate: number;
    totalTrades: number;
    durationDays: number;
    contextSessionId?: string;
    contextQuestionId?: string;
  }>;
  dashboardInsights?: ApiChallengeStatsDashboardInsights;
};

export type ApiTrainingStatsSummary = {
  generatedAt: string;
  version: number;
  totals: ApiTrainingStatsReport["totals"];
  overview: Pick<
    ApiTrainingStatsReport["overview"],
    | "totalSessions"
    | "totalTrainingDays"
    | "totalTrades"
    | "totalPnl"
    | "totalReturnRate"
    | "maxDrawdownRate"
    | "winRate"
    | "averageDecisionSeconds"
  >;
  comparisons: Pick<
    ApiTrainingStatsReport["comparisons"],
    "recent20VsPrevious20"
  >;
  latestSession: ApiTrainingStatsReport["recentSessions"][number] | null;
};

export type ApiTrainingReviewContext = {
  marketPresetId: string;
  marketPresetLabel: string;
  assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  tradeSettlementMode: "T0" | "T1";
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  leverageMultiple: number;
  usesMakerTaker: boolean;
  ruleBadges: string[];
};

export type ApiTrainingReviewWindow =
  "LAST_10" | "LAST_50" | "LAST_7D" | "LAST_30D" | "ALL";

export type ApiTrainingReviewDiagnosticsPayload = {
  generatedAt: string;
  totals: {
    requestedProjects: number;
    resolvedProjects: number;
    missingProjects: number;
  };
  missingProjectIds: string[];
  environmentMatrix: Array<{
    environmentKey: string;
    label: string;
    sessionCount: number;
    profitLossRatio: number | null;
    profitLossRatioState: ApiReplayRatioState;
    expectancy: number;
    maxDrawdownRate: number;
    sampleAdequacy: "INSUFFICIENT" | "SUFFICIENT";
    representativeProjectIds: string[];
    context: ApiTrainingReviewContext;
  }>;
  exitDiscipline: {
    avgLossCutDelayBars: number;
    dangerDelaySessionRate: number;
    representativeProjectIds: string[];
  };
  capitalDiscipline: {
    enabled: boolean;
    dangerSessionRate: number;
    breachCount: number;
    p70: number;
    p85: number;
    p100: number;
    representativeProjectIds: string[];
  };
  marginSafety: {
    dangerSessionShare: number;
    dangerSessionCount: number;
    minSafetyBufferRate: number;
    breachSessionCount: number;
    sessionSafetyPoints: Array<{
      sessionId: string;
      sequenceIndex: number;
      sequenceText: string;
      symbol: string;
      minBufferRate: number;
      peakPressureRate: number;
      zone: "SAFE" | "CROWDED" | "DANGER" | "BREACH";
      isRepresentative: boolean;
    }>;
    zoneSummaries: Array<{
      zone: "SAFE" | "CROWDED" | "DANGER" | "BREACH";
      count: number;
      share: number;
    }>;
    worstSessionPoints: Array<{
      sessionId: string;
      sequenceIndex: number;
      sequenceText: string;
      symbol: string;
      minBufferRate: number;
      peakPressureRate: number;
      zone: "SAFE" | "CROWDED" | "DANGER" | "BREACH";
      isRepresentative: boolean;
    }>;
    focusWindow: {
      isDense: boolean;
      startIndex: number;
      endIndex: number;
      startPercent: number;
      endPercent: number;
    };
  };
  actionableAlerts: Array<{
    id: "ENVIRONMENT_MISMATCH" | "EXIT_DELAY" | "MARGIN_PRESSURE";
    severity: "WATCH" | "ALERT";
    currentValue: number;
    thresholdValue: number;
    details: Record<string, number>;
    representativeProjectIds: string[];
  }>;
  archiveFinancialDetailsById: Record<
    string,
    {
      projectId: string;
      grossPnl: number;
      netPnl: number;
      slippageCost: number;
      feeAndTaxCost: number;
      fundingOrBorrowCost: number;
      environmentKey: string;
      context: ApiTrainingReviewContext;
      marginDiagnostics: { maxUtilizationRate: number; minBufferRate: number };
    }
  >;
};

export type ApiTrainingReviewReportSessionMetric = {
  id: string;
  project: ApiTrainingProject;
  detail: ApiTrainingProject | null;
  assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
  environment: {
    marketPresetId: string;
    assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
    tradeSettlementMode: "T0" | "T1";
    allowLongMarginTrading: boolean;
    allowShortSelling: boolean;
    leverageMultiple: number;
    usesMakerTaker: boolean;
    fundingRate: number;
  };
  projectTs: number;
  projectDateKey: string;
  tradeRounds: Array<{
    id: string;
    direction: "LONG" | "SHORT";
    entryIndex: number;
    closeIndex: number;
    entryTime: string;
    closeTime: string;
    holdBars: number;
    quantity: number;
    entryAvgPrice: number;
    exitAvgPrice: number;
    grossPnl: number;
    pnl: number;
    returnRate: number;
    mfeRate: number;
    maeRate: number;
  }>;
  fills: Array<{
    side: "BUY" | "SELL";
    fillIndex: number;
    fillTime: string;
    fillPrice: number;
    fillQty: number;
    contractMultiplier: number;
    fee: number;
    tax: number;
    slippage: number;
  }>;
  analytics: {
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    profitTradeTotal: number;
    lossTradeTotal: number;
    averageHoldBars: number;
    addPositionCount: number;
    reducePositionCount: number;
    fullPositionCount: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    totalSlippage: number;
    totalFeesFromFills: number;
  };
  grossPnl: number;
  slippageCost: number;
  feeAndTaxCost: number;
  borrowCost: number;
  decisionAverageSeconds: number | null;
  tradeWinRate: number;
  returnRate: number;
  maxDrawdownRate: number;
  sessionProfitFactor: number | null;
  sessionProfitFactorState: ApiReplayRatioState;
  expectancyPerTrade: number;
  peakMaintenanceUtilizationRate: number;
  criticalFailure: boolean;
  lossCutDelayBarsTotal: number;
  lossCutDelayBarsCount: number;
};

export type ApiTrainingReviewTrendReasonKey =
  "criticalFailure" | "deepDrawdown" | "weakReturn" | "representative";

export type ApiTrainingReviewTrendFacts = {
  recentWindowSize: number;
  recentAverage: number | null;
  positiveShare: number | null;
  anomalyCount: number;
  points: Array<{
    sessionId: string;
    rollingAverage: number;
    rollingWindowSize: number;
    isAnomaly: boolean;
    reasonKey: ApiTrainingReviewTrendReasonKey;
  }>;
};

export type ApiTrainingReviewReportPayload = {
  samplePoolOptions: Array<{ id: string; name: string; count: number }>;
  coverage: {
    filteredProjectCount: number;
    resolvedProjectCount: number;
    replayReadyProjectCount: number;
    pendingProjectCount: number;
  };
  heroMetrics: {
    totalNetPnl: number;
    tradeWinRate: number | null;
    profitFactor: number | null;
    profitFactorState: ApiReplayRatioState;
    maxDrawdownRate: number;
    maxConsecutiveLosses: number;
  };
  heroProfitFactorReady: boolean;
  trendFacts: ApiTrainingReviewTrendFacts;
  arenaCards: Array<{
    assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
    sessionCount: number;
    netPnl: number;
    avgReturnRate: number;
    tradeWinRate: number;
    averageHoldBars: number;
    fullPositionRate: number;
    fullPositionCount: number;
    sparklinePoints: Array<{ ts: string; value: number }>;
  }>;
  curvePoints: Array<{ ts: string; value: number }>;
  drawdownPoints: Array<{ ts: string; value: number }>;
  scatterPoints: Array<{
    sessionId: string;
    symbol: string;
    assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
    outcome: "PROFIT" | "LOSS" | "FLAT";
    pnl: number;
    returnRate: number;
    mfeRate: number;
    maeRate: number;
    holdBars: number;
  }>;
  waterfallSteps: Array<{
    key: "gross" | "slippage" | "fees" | "borrow" | "net";
    value: number;
  }>;
  behaviorComparison: Array<{
    key: "withAdd" | "withoutAdd";
    sessionCount: number;
    winRate: number;
  }>;
  radarMetrics: Array<{
    label: string;
    score: number;
    fullMark: number;
    rawValue: number | null;
    valueKind: "ratio" | "number" | "bars" | "money";
    digits?: number;
  }>;
  sessions: ApiTrainingReviewReportSessionMetric[];
};

export type ApiTrainingReviewBundlePayload = {
  report: ApiTrainingReviewReportPayload;
  diagnostics: ApiTrainingReviewDiagnosticsPayload;
};
