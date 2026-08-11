// SPDX-License-Identifier: GPL-3.0-only

import type { EChartsOption } from "echarts";

import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx,
} from "@/frontend-kernel/typography";
import {
  resolveCssTokenColor,
} from "@/workspaces/challenge-stats/charts/echartSurface";
import { CHART_STYLE_COLOR_TOKENS } from "@/ui/theme/visual/chartColorTokens";
import {
  getPriceColorPalette,
  type PriceColorMode,
} from "@/domains/chart/display";

export type BacktestChartTheme = {
  axis: string;
  grid: string;
  splitLine: string;
  primary: string;
  benchmark: string;
  financialPositive: string;
  financialNegative: string;
  muted: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
};

type BacktestGridOptions = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  containLabel?: boolean;
};

export const resolveBacktestChartTheme = ({
  themeMode,
  priceColorMode,
}: {
  themeMode: "light" | "dark";
  priceColorMode: PriceColorMode;
}): BacktestChartTheme => {
  const pricePalette = getPriceColorPalette(priceColorMode);
  return {
    axis: resolveCssTokenColor("--text-subtle"),
    grid: themeMode === "dark"
      ? CHART_STYLE_COLOR_TOKENS.main.gridVerticalDark
      : CHART_STYLE_COLOR_TOKENS.main.gridVerticalLight,
    splitLine: themeMode === "dark"
      ? CHART_STYLE_COLOR_TOKENS.main.gridHorizontalDark
      : CHART_STYLE_COLOR_TOKENS.main.gridHorizontalLight,
    primary: themeMode === "dark"
      ? CHART_STYLE_COLOR_TOKENS.curve.areaLineDark
      : CHART_STYLE_COLOR_TOKENS.curve.areaLineLight,
    benchmark: themeMode === "dark"
      ? CHART_STYLE_COLOR_TOKENS.curve.benchmarkLineDark
      : CHART_STYLE_COLOR_TOKENS.curve.benchmarkLineLight,
    financialPositive: pricePalette.up,
    financialNegative: pricePalette.down,
    muted: resolveCssTokenColor("--text-muted"),
    tooltipBg: resolveCssTokenColor("--ui-tooltip-bg"),
    tooltipBorder: resolveCssTokenColor("--ui-tooltip-border"),
    tooltipText: resolveCssTokenColor("--text"),
  };
};

export const buildBacktestGrid = ({
  left = 10,
  right = 10,
  top = 10,
  bottom = 22,
  containLabel = true,
}: BacktestGridOptions = {}): NonNullable<EChartsOption["grid"]> => ({
  left,
  right,
  top,
  bottom,
  containLabel,
});

export const buildBacktestAxisLabel = ({
  color,
  formatter,
  hideOverlap = true,
  fontFamily = getGlobalTypographyFontFamily("mono"),
  margin = 4,
}: {
  color: string;
  formatter?: (value: string | number) => string;
  hideOverlap?: boolean;
  fontFamily?: string;
  margin?: number;
}): {
  color: string;
  hideOverlap: boolean;
  fontFamily: string;
  fontSize: number;
  margin: number;
  formatter?: (value: string | number) => string;
} => ({
  color,
  hideOverlap,
  fontFamily,
  fontSize: getGlobalTypographyReferencePx("r1") - 2,
  margin,
  ...(formatter ? { formatter } : {}),
});

export const formatBacktestAxisDateLabel = (value: string | number): string => {
  const text = String(value ?? "").trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/u.exec(text);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }
  return text;
};

export const formatBacktestCompactAxisDateLabel = (
  value: string | number,
): string => {
  const text = String(value ?? "").trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/u.exec(text);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}`;
  }
  return text;
};

export const formatBacktestCompactNumberAxis = (
  value: string | number,
): string => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }
  const absolute = Math.abs(numericValue);
  const sign = numericValue < 0 ? "-" : "";
  if (absolute === 0) {
    return "0";
  }
  if (absolute >= 1_000_000_000) {
    return `${sign}${(absolute / 1_000_000_000).toFixed(1).replace(/\.0$/u, "")}B`;
  }
  if (absolute >= 1_000_000) {
    return `${sign}${(absolute / 1_000_000).toFixed(1).replace(/\.0$/u, "")}M`;
  }
  if (absolute >= 1_000) {
    return `${sign}${(absolute / 1_000).toFixed(1).replace(/\.0$/u, "")}K`;
  }
  if (absolute >= 10) {
    return `${sign}${absolute.toFixed(0)}`;
  }
  return `${sign}${absolute.toFixed(absolute >= 1 ? 1 : 2).replace(/\.0+$/u, "")}`;
};

export const buildBacktestTooltip = (
  theme: BacktestChartTheme,
): NonNullable<EChartsOption["tooltip"]> => ({
  trigger: "axis",
  backgroundColor: theme.tooltipBg,
  borderColor: theme.tooltipBorder,
  borderWidth: 1,
  borderRadius: 6,
  padding: [6, 12],
  transitionDuration: 0.12,
  textStyle: {
    color: theme.tooltipText,
    fontFamily: getGlobalTypographyFontFamily("ui"),
    fontSize: getGlobalTypographyReferencePx("r1"),
    fontWeight: 400,
    lineHeight: Math.round(getGlobalTypographyReferencePx("r1") * 1.3),
  },
});
