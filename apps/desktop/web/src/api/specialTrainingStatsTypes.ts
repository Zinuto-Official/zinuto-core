// SPDX-License-Identifier: GPL-3.0-only

import type {
  SessionSnapshot,
  TrainingSummary,
} from '@/domains/training/types';
import type { ApiTrainingStatsReport } from '@/api/history';
import type {
  ApiChallengeStatsDashboardInsights,
  ApiChallengeStatsRiskBehaviorType,
} from '@/api/trainingStatsShared';
import type {
  ApiSpecialTrainingModeId,
  ApiSpecialTrainingRiskReview,
  ApiSpecialTrainingTradeAction,
} from './specialTrainingCoreTypes';

export type ApiChallengeStatsDashboardFastDirectionSelection =
  "LONG" | "SHORT" | "OBSERVE";

export type ApiChallengeStatsReviewGrade = "S" | "A" | "F";

export type ApiChallengeStatsDashboardFastSessionRow = {
  kind: "fast";
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
  selection: ApiChallengeStatsDashboardFastDirectionSelection;
  actual: ApiChallengeStatsDashboardFastDirectionSelection;
  correct: boolean;
  timedOut: boolean;
  edgeRatio: number;
  opportunityEdgeRatio: number;
  performanceRate: number;
  reviewGrade: ApiChallengeStatsReviewGrade;
};

export type ApiChallengeStatsDashboardRiskSessionRow = {
  kind: "risk";
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
  behavior: ApiChallengeStatsRiskBehaviorType;
  reviewGrade: ApiChallengeStatsReviewGrade;
  curvePoints: Array<[number, number]>;
};

export type ApiChallengeStatsDashboardSessionRow =
  | ApiChallengeStatsDashboardFastSessionRow
  | ApiChallengeStatsDashboardRiskSessionRow;

export type ApiSpecialTrainingStatsReport = ApiTrainingStatsReport & {
  modeId: ApiSpecialTrainingModeId;
  dashboardInsights: ApiChallengeStatsDashboardInsights;
  dashboardRows: ApiChallengeStatsDashboardSessionRow[];
  defaultModeId: ApiSpecialTrainingModeId;
  modeAvailability: Record<
    ApiSpecialTrainingModeId,
    {
      tag: string;
      projectCount: number;
    }
  >;
};

export type ApiSpecialTrainingStatsPayload = {
  report: ApiSpecialTrainingStatsReport;
  projectDetailsById: Record<string, ApiChallengeStatsProjectDetail>;
};

export type ApiSpecialTrainingStatsSummary = Pick<
  ApiSpecialTrainingStatsReport,
  | "generatedAt"
  | "modeId"
  | "totals"
  | "overview"
  | "dashboardInsights"
  | "defaultModeId"
  | "modeAvailability"
  | "recentSessions"
>;

export type ApiChallengeStatsProjectReplay = {
  bars: Array<{
    ts: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  snapshot: SessionSnapshot;
  drawings: Array<{
    id?: string;
    name: string;
    points: Array<{
      timestamp: number;
      value?: number;
      dataIndex?: number;
    }>;
    visible?: boolean;
    zLevel?: number;
    mode?: string;
    modeSensitivity?: number;
    needDefaultXAxisFigure?: boolean;
    styles?: unknown;
    extendData?: unknown;
  }>;
  equityCurve: Array<{ ts: string; value: number }>;
  drawdownCurve: Array<{ ts: string; value: number }>;
  tradeRounds: unknown[];
  finalEquity: number;
  equityReturnRate: number;
  baseTimeframe: string;
  chartIndicators?: Record<string, unknown>;
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
  riskReview: ApiSpecialTrainingRiskReview | null;
  tradeActions: ApiSpecialTrainingTradeAction[];
};

export type ApiChallengeStatsProjectDetail = {
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
  replayHydrationStatus?:
    "READY" | "SOURCE_CHANGED" | "SOURCE_MISSING" | "SNAPSHOT_ONLY" | "EXPIRED";
  detailExpiredAt?: string | null;
  replay: ApiChallengeStatsProjectReplay;
};
