// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopBacktestSignalRules } from "@zinuto/shared/contracts-desktop/api";
import type { TradingAssetClass } from "@zinuto/shared/trading";
import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";

export type ApiBacktestBatchStatus =
  | "DRAFT"
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type ApiBacktestOrderSizingMode =
  | "FIXED_QTY"
  | "FIXED_AMOUNT"
  | "EQUITY_PERCENT"
  | "ALL_IN";

export type ApiBacktestOrderSizing = {
  mode: ApiBacktestOrderSizingMode;
  value?: number;
};

export type ApiBacktestTradingSettings = {
  assetClass: TradingAssetClass;
  marketPresetId: string;
  minTradeStep: number;
  initialSecuritiesBalance: number;
  allowShortSelling: boolean;
  tradeSettlementMode: "T0" | "T1";
  freeReplayEndSettlementMode: "FORCE_CLOSE" | "CURRENT_TOTAL_ASSET";
} & Record<string, unknown>;

export type ApiBacktestConfig = {
  name?: string;
  strategySource: string;
  parameterInputs?: Record<string, string>;
  instrumentIds?: string[];
  samplePoolIds?: string[];
  startIndex?: number;
  endIndex?: number;
  startTime?: string;
  endTime?: string;
  initialCapital: number;
  priceMode: "CUR_CLOSE" | "NEXT_OPEN";
  signalExecutionMode: "CUR_CLOSE" | "NEXT_OPEN";
  orderSizing: ApiBacktestOrderSizing;
  tradingSettings: ApiBacktestTradingSettings;
  signalRules?: DesktopBacktestSignalRules;
};

export type ApiBacktestBatch = {
  id: string;
  name: string;
  status: ApiBacktestBatchStatus;
  config: ApiBacktestConfig;
  progress: Record<string, unknown>;
  summary: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ApiBacktestResultSummary = {
  id: string;
  batchId: string;
  instrumentId: string;
  symbol: string;
  timeframe: string;
  barsCount: number;
  finalEquity: number;
  totalPnl: number;
  profitRate: number;
  maxDrawdown: number;
  winRate: number;
  tradeCount: number;
  conflictCount: number;
  summary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ApiBacktestResultListItem = Omit<ApiBacktestResultSummary, "summary">;

export type ApiBacktestFill = {
  id: string;
  batchId: string;
  resultId: string;
  instrumentId: string;
  symbol: string;
  orderId: string;
  fillIndex: number;
  fillTime: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  gross: number;
  fee: number;
  tax: number;
  slippage: number;
  createdAt: string;
};

export type ApiBacktestEquityPoint = {
  id: string;
  batchId: string;
  resultId: string;
  instrumentId: string;
  symbol: string;
  barIndex: number;
  barTime: string;
  equity: number;
  drawdown: number;
};

export type ApiBacktestBar = {
  rawIndex: number;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ApiBacktestResults = {
  batch: ApiBacktestBatch;
  results: ApiBacktestResultListItem[];
};

export type ApiBacktestProgress = {
  batch: ApiBacktestBatch;
  progress: Record<string, unknown>;
};

export type ApiBacktestResultDetail = {
  batch: ApiBacktestBatch;
  result: ApiBacktestResultSummary;
  fills: ApiBacktestFill[];
  equityCurve: ApiBacktestEquityPoint[];
  bars: ApiBacktestBar[];
};

export type ApiBacktestBatchCreateRequest = {
  name?: string;
  config: ApiBacktestConfig;
};

export type ApiBacktestClearResult = {
  deletedBatchIds: string[];
  deletedBatchCount: number;
  clearedAt: string;
};

export const createBacktestApi = (request: ApiRequester) => ({
  listBacktestBatches: (options?: ApiRequestOptions) =>
    request<ApiBacktestBatch[]>("/api/v1/backtest/batches", options),
  createBacktestBatch: (
    payload: ApiBacktestBatchCreateRequest,
    options?: ApiRequestOptions,
  ) =>
    request<ApiBacktestBatch>("/api/v1/backtest/batches", {
      method: "POST",
      body: JSON.stringify(payload),
      ...options,
    }),
  getBacktestBatch: (batchId: string, options?: ApiRequestOptions) =>
    request<ApiBacktestBatch>(`/api/v1/backtest/batches/${encodeURIComponent(batchId)}`, options),
  deleteBacktestBatch: (batchId: string, options?: ApiRequestOptions) =>
    request<{ deletedBatchId: string }>(
      `/api/v1/backtest/batches/${encodeURIComponent(batchId)}`,
      {
        method: "DELETE",
        ...options,
      },
    ),
  clearBacktestBatches: (options?: ApiRequestOptions) =>
    request<ApiBacktestClearResult>("/api/v1/backtest/batches", {
      method: "DELETE",
      ...options,
    }),
  runBacktestBatch: (batchId: string, options?: ApiRequestOptions) =>
    request<ApiBacktestBatch>(
      `/api/v1/backtest/batches/${encodeURIComponent(batchId)}/run`,
      {
        method: "POST",
        body: JSON.stringify({}),
        ...options,
      },
    ),
  cancelBacktestBatch: (batchId: string, options?: ApiRequestOptions) =>
    request<ApiBacktestBatch>(
      `/api/v1/backtest/batches/${encodeURIComponent(batchId)}/cancel`,
      {
        method: "POST",
        ...options,
      },
    ),
  getBacktestProgress: (batchId: string, options?: ApiRequestOptions) =>
    request<ApiBacktestProgress>(
      `/api/v1/backtest/batches/${encodeURIComponent(batchId)}/progress`,
      options,
    ),
  getBacktestResults: (batchId: string, options?: ApiRequestOptions) =>
    request<ApiBacktestResults>(
      `/api/v1/backtest/batches/${encodeURIComponent(batchId)}/results`,
      options,
    ),
  getBacktestResultDetail: (
    batchId: string,
    symbol: string,
    options?: ApiRequestOptions,
  ) =>
    request<ApiBacktestResultDetail>(
      `/api/v1/backtest/batches/${encodeURIComponent(batchId)}/results/${encodeURIComponent(symbol)}/trades`,
      options,
    ),
});
