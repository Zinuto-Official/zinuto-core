// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type {
  ApiReplayRatioState,
  ApiTrainingProject,
  ApiTrainingReviewDiagnosticsPayload,
  ApiTrainingReviewReportPayload,
} from "@/api";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { HistoryProjectLike } from "@/domains/history/historyTypes";
import type { TradingAssetClass } from "@zinuto/shared/trading";
import type { ReplayReviewWindow } from "@zinuto/shared/domain-calculations/replay-review-window";

export type ReplayReviewProject = HistoryProjectLike & {
  replay?: ArchivedReplayData;
};

export type ReplayReviewEnvironmentContext = {
  key: string;
  marketPresetId: string;
  assetClass: TradingAssetClass;
  assetClassLabel: string;
  tradeSettlementMode: "T0" | "T1";
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  leverageMultiple: number;
  usesMakerTaker: boolean;
  fundingRate: number;
};

export type AssetFilterTab = "ALL" | TradingAssetClass;
export type { ReplayReviewWindow };
export type ReplayReviewLoadingState =
  | "INITIAL_SKELETON"
  | "REVALIDATING"
  | "READY";
export type ReplayReviewPendingReason =
  | "FILTER_CHANGE"
  | "HISTORY_REFRESH"
  | null;
export type ReplayReviewPendingSections = {
  overviewKpis: boolean;
  overviewMatrix: boolean;
  overviewTrend: boolean;
  behaviorMargin: boolean;
  archiveTable: boolean;
};

export type ReplayTradeRoundView = {
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
  pnl: number;
  grossPnl: number;
  returnRate: number;
  mfeRate: number;
  maeRate: number;
};

export type ReplayFillView = {
  side: "BUY" | "SELL";
  fillIndex: number;
  fillTime: string;
  fillPrice: number;
  fillQty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
};

export type SessionTradeAnalyticsView = {
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitTradeTotal: number;
  lossTradeTotal: number;
  averageHoldBars: number;
  addPositionCount: number;
  reducePositionCount: number;
  fullPositionCount: number;
  maxConsecutiveLosses: number;
  totalSlippage: number;
  totalFeesFromFills: number;
};

export type ReplayReviewSessionMetric = {
  id: string;
  project: ReplayReviewProject;
  detail: ApiTrainingProject | null;
  assetClass: TradingAssetClass;
  assetClassLabel: string;
  environment: ReplayReviewEnvironmentContext;
  projectTs: number;
  projectDateKey: string;
  tradeRounds: ReplayTradeRoundView[];
  fills: ReplayFillView[];
  analytics: SessionTradeAnalyticsView;
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

export type ReplayReviewModel = {
  filters: {
    assetTab: AssetFilterTab;
  };
  setAssetTab: (value: AssetFilterTab) => void;
  loadingState: ReplayReviewLoadingState;
  hasSettledSnapshot: boolean;
  isRevalidating: boolean;
  pendingReason: ReplayReviewPendingReason;
  isHistoryPaginationStalled: boolean;
  retryHistoryPagination: () => void;
  activeTabPendingSections: ReplayReviewPendingSections;
  windowCandidateSessionMetrics: ReplayReviewSessionMetric[];
  visibleSessionMetrics: ReplayReviewSessionMetric[];
  reviewReport: ApiTrainingReviewReportPayload | null;
  previousReviewReport: ApiTrainingReviewReportPayload | null;
  activeReplayProjectId: string;
  isActiveReplayLoading: boolean;
  activeReplayProject:
    | {
        project: ReplayReviewProject;
        detail: ApiTrainingProject;
      }
    | null;
  reviewDiagnostics: ApiTrainingReviewDiagnosticsPayload | null;
  isDiagnosticsLoading: boolean;
  openReplayProject: (projectId: string) => void;
  closeReplayProject: () => void;
  locale: AppUiLanguage;
};
