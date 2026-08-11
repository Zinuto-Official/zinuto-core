// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import type { EChartsOption } from "echarts";

import type { BacktestAnalyticsResult } from "@/domains/backtest/backtestAnalytics";
import type { PriceColorMode } from "@/domains/chart/display";
import { EChartSurface } from "@/workspaces/challenge-stats/charts/echartSurface";
import {
  buildBacktestAxisLabel,
  buildBacktestGrid,
  buildBacktestTooltip,
  formatBacktestCompactNumberAxis,
  resolveBacktestChartTheme,
} from "@/workspaces/strategy-backtest/detail/charts/backtestChartTheme";

type ReturnDistributionChartProps = {
  metrics: BacktestAnalyticsResult;
  themeMode: "light" | "dark";
  priceColorMode: PriceColorMode;
  label: string;
  skewnessLabel: string;
  kurtosisLabel: string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
};

export const ReturnDistributionChart = ({
  metrics,
  themeMode,
  priceColorMode,
  label,
  skewnessLabel,
  kurtosisLabel,
  formatNumber,
  formatPercent,
}: ReturnDistributionChartProps) => {
  const option = useMemo<EChartsOption>(() => {
    const theme = resolveBacktestChartTheme({ themeMode, priceColorMode });
    const bins = metrics.distribution.histogram;
    return {
      animation: false,
      color: [theme.primary],
      grid: buildBacktestGrid(),
      tooltip: {
        ...buildBacktestTooltip(theme),
        trigger: "axis",
      },
      xAxis: {
        type: "category",
        data: bins.map((bin) => formatPercent(bin.mid)),
        axisLabel: buildBacktestAxisLabel({ color: theme.axis }),
        axisLine: { lineStyle: { color: theme.grid } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: buildBacktestAxisLabel({
          color: theme.axis,
          formatter: formatBacktestCompactNumberAxis,
        }),
        splitLine: { lineStyle: { color: theme.splitLine } },
      },
      series: [
        {
          name: label,
          type: "bar",
          data: bins.map((bin) => bin.count),
          barMaxWidth: 24,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [formatPercent, label, metrics.distribution.histogram, priceColorMode, themeMode]);

  return (
    <div className="strategy-backtest-analysis-chart-stack">
      <EChartSurface
        className="strategy-backtest-analysis-chart"
        option={option}
      />
      <div className="strategy-backtest-distribution-stats">
        <span>
          <small>{skewnessLabel}</small>
          <strong>{formatNumber(metrics.distribution.skewness)}</strong>
        </span>
        <span>
          <small>{kurtosisLabel}</small>
          <strong>{formatNumber(metrics.distribution.kurtosis)}</strong>
        </span>
      </div>
    </div>
  );
};
