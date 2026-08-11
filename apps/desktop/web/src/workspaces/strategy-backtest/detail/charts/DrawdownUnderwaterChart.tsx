// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import type { EChartsOption } from "echarts";

import type { BacktestAnalyticsResult } from "@/domains/backtest/backtestAnalytics";
import type { PriceColorMode } from "@/domains/chart/display";
import { EChartSurface } from "@/workspaces/challenge-stats/charts/echartSurface";
import { resolveValueAxisExtent } from "@/workspaces/challenge-stats/charts/valueAxis";
import {
  buildBacktestAxisLabel,
  buildBacktestGrid,
  buildBacktestTooltip,
  formatBacktestAxisDateLabel,
  formatBacktestCompactAxisDateLabel,
  resolveBacktestChartTheme,
} from "@/workspaces/strategy-backtest/detail/charts/backtestChartTheme";

type DrawdownUnderwaterChartProps = {
  metrics: BacktestAnalyticsResult;
  themeMode: "light" | "dark";
  priceColorMode: PriceColorMode;
  label: string;
  formatPercent: (value: number) => string;
};

export const DrawdownUnderwaterChart = ({
  metrics,
  themeMode,
  priceColorMode,
  label,
  formatPercent,
}: DrawdownUnderwaterChartProps) => {
  const option = useMemo<EChartsOption>(() => {
    const theme = resolveBacktestChartTheme({ themeMode, priceColorMode });
    const values = metrics.series.drawdown.map((point) => point.value);
    const extent = resolveValueAxisExtent(values, {
      paddingRatio: 0.1,
      preferZeroBoundary: true,
    });
    return {
      animation: false,
      color: [theme.financialNegative],
      grid: buildBacktestGrid(),
      tooltip: {
        ...buildBacktestTooltip(theme),
        valueFormatter: (value) => formatPercent(Number(value)),
      },
      xAxis: {
        type: "category",
        data: metrics.series.drawdown.map((point) =>
          formatBacktestAxisDateLabel(point.barTime ?? String(point.barIndex))
        ),
        boundaryGap: false,
        axisLabel: buildBacktestAxisLabel({
          color: theme.axis,
          formatter: formatBacktestCompactAxisDateLabel,
        }),
        axisLine: { lineStyle: { color: theme.grid } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: Math.min(extent.min, -0.01),
        max: 0,
        axisLabel: buildBacktestAxisLabel({
          color: theme.axis,
          formatter: (value) => formatPercent(Number(value)),
        }),
        splitLine: { lineStyle: { color: theme.splitLine } },
      },
      series: [
        {
          name: label,
          type: "line",
          data: values,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.7 },
          areaStyle: { opacity: 0.2 },
        },
      ],
    };
  }, [formatPercent, label, metrics.series.drawdown, priceColorMode, themeMode]);

  return (
    <EChartSurface
      className="strategy-backtest-analysis-chart"
      option={option}
    />
  );
};
