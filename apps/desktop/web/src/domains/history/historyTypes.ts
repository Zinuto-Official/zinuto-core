// SPDX-License-Identifier: GPL-3.0-only

import type { TrainingSummary } from "@/domains/training/types";
import type { OperatorSummary } from "@zinuto/shared/operatorSummary";
import type { TradingAssetClass } from "@zinuto/shared/trading";

type HistorySummaryLike = TrainingSummary;

export type HistoryProjectLike = {
  id: string;
  name: string;
  symbol: string;
  trainingDateRange: string;
  initialTotal: number;
  finalEquity: number;
  equityReturnRate: number;
  profitRate: number;
  assetClass?: TradingAssetClass;
  baseTimeframe: string;
  summary: HistorySummaryLike;
  samplePoolId: string;
  samplePoolName: string;
  durationDays: number;
  totalTrades: number;
  totalPnl: number;
  detailExpiredAt?: string | null;
  replayHydrationStatus?: "READY" | "SOURCE_CHANGED" | "SOURCE_MISSING" | "SNAPSHOT_ONLY" | "EXPIRED";
  updatedAt: string;
  createdAt: string;
  operatorSummary: OperatorSummary;
};

export type HistoryProjectsLoadMoreOptions = {
  automatic?: boolean;
};

export type HistoryProjectsLoadMoreResult =
  | "LOADED"
  | "FAILED"
  | "BLOCKED"
  | "SKIPPED";

export type LoadMoreHistoryProjects = (
  options?: HistoryProjectsLoadMoreOptions,
) => Promise<HistoryProjectsLoadMoreResult>;
