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

type EquityBenchmarkChartProps = {
  metrics: BacktestAnalyticsResult;
  themeMode: "light" | "dark";
  priceColorMode: PriceColorMode;
  strategyLabel: string;
  benchmarkLabel: string;
  formatMoney: (value: number) => string;
};

const formatCompactMoneyAxis = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000_000) {
    return `${sign}${(absolute / 1_000_000_000).toFixed(1).replace(/\.0$/u, "")}B`;
  }
  if (absolute >= 1_000_000) {
    return `${sign}${(absolute / 1_000_000).toFixed(1).replace(/\.0$/u, "")}M`;
  }
  if (absolute >= 1_000) {
    return `${sign}${(absolute / 1_000).toFixed(1).replace(/\.0$/u, "")}K`;
  }
  return `${sign}${absolute.toFixed(0)}`;
};

export const EquityBenchmarkChart = ({
  metrics,
  themeMode,
  priceColorMode,
  strategyLabel,
  benchmarkLabel,
  formatMoney,
}: EquityBenchmarkChartProps) => {
  const option = useMemo<EChartsOption>(() => {
    const theme = resolveBacktestChartTheme({ themeMode, priceColorMode });
    const points = metrics.series.benchmarkEquity ?? [];
    const categories = points.map((point) =>
      formatBacktestAxisDateLabel(point.barTime ?? String(point.barIndex))
    );
    const strategyValues = points.map((point) => point.strategyEquity);
    const benchmarkValues = points.map((point) => point.benchmarkEquity);
    const extent = resolveValueAxisExtent([...strategyValues, ...benchmarkValues], {
      paddingRatio: 0.08,
    });

    return {
      animation: false,
      color: [theme.primary, theme.benchmark],
      grid: buildBacktestGrid({ top: 28 }),
      tooltip: {
        ...buildBacktestTooltip(theme),
        valueFormatter: (value) => formatMoney(Number(value)),
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: theme.axis },
      },
      xAxis: {
        type: "category",
        data: categories,
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
        min: extent.min,
        max: extent.max,
        axisLabel: buildBacktestAxisLabel({
          color: theme.axis,
          formatter: (value) => formatCompactMoneyAxis(Number(value)),
        }),
        splitLine: { lineStyle: { color: theme.splitLine } },
      },
      series: [
        {
          name: strategyLabel,
          type: "line",
          data: strategyValues,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2.2 },
          areaStyle: { opacity: 0.14 },
        },
        {
          name: benchmarkLabel,
          type: "line",
          data: benchmarkValues,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.7, type: "dashed" },
        },
      ],
    };
  }, [benchmarkLabel, formatMoney, metrics.series.benchmarkEquity, priceColorMode, strategyLabel, themeMode]);

  return (
    <EChartSurface
      className="strategy-backtest-analysis-chart"
      option={option}
    />
  );
};
