// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";

import type { BacktestAnalyticsResult } from "@/domains/backtest/backtestAnalytics";
import type { PriceColorMode } from "@/domains/chart/display";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
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

type RollingRiskMode = "sharpe" | "volatility";

type RollingRiskChartProps = {
  metrics: BacktestAnalyticsResult;
  themeMode: "light" | "dark";
  priceColorMode: PriceColorMode;
  sharpeLabel: string;
  volatilityLabel: string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
};

export const RollingRiskChart = ({
  metrics,
  themeMode,
  priceColorMode,
  sharpeLabel,
  volatilityLabel,
  formatNumber,
  formatPercent,
}: RollingRiskChartProps) => {
  const [mode, setMode] = useState<RollingRiskMode>("sharpe");
  const option = useMemo<EChartsOption>(() => {
    const theme = resolveBacktestChartTheme({ themeMode, priceColorMode });
    const source = mode === "sharpe"
      ? metrics.series.rollingSharpe
      : metrics.series.rollingVolatility;
    const values = source.map((point) => point.value).filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value)
    );
    const extent = resolveValueAxisExtent(values, {
      paddingRatio: 0.12,
      preferZeroBoundary: mode === "sharpe",
    });
    const label = mode === "sharpe" ? sharpeLabel : volatilityLabel;
    const formatter = mode === "sharpe" ? formatNumber : formatPercent;
    return {
      animation: false,
      color: [mode === "sharpe" ? theme.primary : theme.benchmark],
      grid: buildBacktestGrid(),
      tooltip: {
        ...buildBacktestTooltip(theme),
        valueFormatter: (value) => formatter(Number(value)),
      },
      xAxis: {
        type: "category",
        data: source.map((point) =>
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
        min: extent.min,
        max: extent.max,
        axisLabel: buildBacktestAxisLabel({
          color: theme.axis,
          formatter: (value) => formatter(Number(value)),
        }),
        splitLine: { lineStyle: { color: theme.splitLine } },
      },
      series: [
        {
          name: label,
          type: "line",
          data: source.map((point) => point.value),
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 1.8 },
        },
      ],
    };
  }, [
    formatNumber,
    formatPercent,
    metrics.series.rollingSharpe,
    metrics.series.rollingVolatility,
    mode,
    priceColorMode,
    sharpeLabel,
    themeMode,
    volatilityLabel,
  ]);

  return (
    <div className="strategy-backtest-rolling-risk">
      <SegmentedControl<RollingRiskMode>
        className="strategy-backtest-rolling-risk-control"
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: "sharpe", label: sharpeLabel },
          { value: "volatility", label: volatilityLabel },
        ]}
        gridTemplateColumns="repeat(2, minmax(0, 1fr))"
      />
      <EChartSurface
        className="strategy-backtest-analysis-chart"
        option={option}
      />
    </div>
  );
};
