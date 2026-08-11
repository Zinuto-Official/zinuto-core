// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useState, type CSSProperties } from "react";
import type { EChartsOption } from "echarts";

import type { BacktestAnalyticsResult } from "@/domains/backtest/backtestAnalytics";
import type { PriceColorMode } from "@/domains/chart/display";
import { getGlobalTypographyReferencePx } from "@/frontend-kernel/typography";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { EChartSurface } from "@/workspaces/challenge-stats/charts/echartSurface";
import {
  buildBacktestAxisLabel,
  buildBacktestGrid,
  buildBacktestTooltip,
  resolveBacktestChartTheme,
} from "@/workspaces/strategy-backtest/detail/charts/backtestChartTheme";

const MONTH_INDEXES = Array.from({ length: 12 }, (_, index) => index + 1);
type MonthlyRange = "5y" | "10y" | "all";

type MonthlyReturnsHeatmapProps = {
  metrics: BacktestAnalyticsResult;
  themeMode: "light" | "dark";
  priceColorMode: PriceColorMode;
  monthLabels: string[];
  rangeLabels: {
    fiveYears: string;
    tenYears: string;
    all: string;
  };
  formatPercent: (value: number) => string;
};

export const MonthlyReturnsHeatmap = ({
  metrics,
  themeMode,
  priceColorMode,
  monthLabels,
  rangeLabels,
  formatPercent,
}: MonthlyReturnsHeatmapProps) => {
  const [range, setRange] = useState<MonthlyRange>("10y");
  const filteredMonthly = useMemo(() => {
    const allYears = Array.from(new Set(metrics.series.monthly.map((item) => item.year)))
      .sort((left, right) => left - right);
    const latestYear = allYears.at(-1);
    if (range === "all" || latestYear === undefined) {
      return metrics.series.monthly;
    }
    const yearsToKeep = range === "5y" ? 5 : 10;
    const firstYear = latestYear - yearsToKeep + 1;
    return metrics.series.monthly.filter((item) => item.year >= firstYear);
  }, [metrics.series.monthly, range]);
  const heatmapYears = useMemo(
    () => Array.from(new Set(filteredMonthly.map((item) => item.year))),
    [filteredMonthly],
  );
  const chartStyle = {
    "--strategy-backtest-heatmap-height":
      range === "all"
        ? `clamp(var(--strategy-backtest-chart-md), ${heatmapYears.length * 22 + 86}px, 640px)`
        : "var(--strategy-backtest-chart-md)",
  } as CSSProperties;
  const option = useMemo<EChartsOption>(() => {
    const theme = resolveBacktestChartTheme({ themeMode, priceColorMode });
    const years = Array.from(new Set(filteredMonthly.map((item) => item.year)))
      .sort((left, right) => left - right);
    const yearIndexByValue = new Map(years.map((year, index) => [year, index]));
    const maxAbs = Math.max(
      0.01,
      ...filteredMonthly.map((item) => Math.abs(item.value)),
    );
    const data = filteredMonthly.map((item) => [
      item.month - 1,
      yearIndexByValue.get(item.year) ?? 0,
      item.value,
      item.year,
      item.month,
    ]);
    const showCellLabels = years.length <= 8;

    return {
      animation: false,
      grid: buildBacktestGrid({ top: 8, bottom: 34 }),
      tooltip: {
        ...buildBacktestTooltip(theme),
        trigger: "item",
        formatter: (payload: unknown) => {
          const value = Array.isArray((payload as { value?: unknown }).value)
            ? ((payload as { value: unknown[] }).value[2] as number)
            : 0;
          const year = Array.isArray((payload as { value?: unknown }).value)
            ? ((payload as { value: unknown[] }).value[3] as number)
            : 0;
          const month = Array.isArray((payload as { value?: unknown }).value)
            ? ((payload as { value: unknown[] }).value[4] as number)
            : 0;
          const monthLabel = monthLabels[month - 1] ?? String(month);
          return `${year}-${monthLabel}: ${formatPercent(value)}`;
        },
      },
      visualMap: {
        dimension: 2,
        min: -maxAbs,
        max: maxAbs,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 2,
        itemWidth: 8,
        itemHeight: 88,
        textGap: 6,
        inRange: {
          color: [theme.financialNegative, theme.splitLine, theme.financialPositive],
        },
        textStyle: {
          color: theme.axis,
          fontSize: getGlobalTypographyReferencePx("r1") - 2,
        },
      },
      xAxis: {
        type: "category",
        data: MONTH_INDEXES.map((month) => monthLabels[month - 1] ?? String(month)),
        axisLabel: buildBacktestAxisLabel({ color: theme.axis, fontFamily: undefined }),
        axisLine: { lineStyle: { color: theme.grid } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "category",
        data: years.map(String),
        axisLabel: buildBacktestAxisLabel({ color: theme.axis }),
        axisLine: { lineStyle: { color: theme.grid } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "heatmap",
          data,
          emphasis: {
            itemStyle: {
              borderColor: theme.axis,
              borderWidth: 1,
            },
          },
          label: {
            show: showCellLabels,
            color: theme.axis,
            formatter: (payload: { value?: unknown }) => {
              const value = Array.isArray(payload.value)
                ? Number(payload.value[2])
                : 0;
              return Math.abs(value) >= 0.005 ? formatPercent(value) : "";
            },
          },
        },
      ],
    };
  }, [filteredMonthly, formatPercent, monthLabels, priceColorMode, themeMode]);

  return (
    <div className="strategy-backtest-monthly-heatmap" style={chartStyle}>
      <SegmentedControl<MonthlyRange>
        className="strategy-backtest-monthly-range"
        size="sm"
        value={range}
        onChange={setRange}
        options={[
          { value: "5y", label: rangeLabels.fiveYears },
          { value: "10y", label: rangeLabels.tenYears },
          { value: "all", label: rangeLabels.all },
        ]}
        gridTemplateColumns="repeat(3, minmax(0, 1fr))"
      />
      <EChartSurface
        className="strategy-backtest-analysis-chart"
        option={option}
      />
    </div>
  );
};
