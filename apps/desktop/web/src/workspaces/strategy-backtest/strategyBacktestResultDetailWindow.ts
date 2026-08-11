// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiBacktestBatch,
  ApiBacktestResultDetail,
  ApiCompileCustomIndicatorScriptRequest,
} from "@/api";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";

export const STRATEGY_BACKTEST_RESULT_DETAIL_WINDOW_KIND =
  "STRATEGY_BACKTEST_RESULT_DETAIL" as const;

export type StrategyBacktestDetailStrategyIndicator = {
  source: string;
  parameterInputs: Record<string, string>;
  parameters?: ApiCompileCustomIndicatorScriptRequest["parameters"];
  displayName: string;
};

export type StrategyBacktestResultDetailWindowPayload = {
  title: string;
  batchId: string;
  batch?: ApiBacktestBatch;
  detail?: ApiBacktestResultDetail;
  strategyIndicator: StrategyBacktestDetailStrategyIndicator | null;
  displayPeriod?: HistoryReplayChartViewProps["displayPeriod"];
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  chartRenderMode?: HistoryReplayChartViewProps["chartRenderMode"];
};
