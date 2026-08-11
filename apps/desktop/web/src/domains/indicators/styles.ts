// SPDX-License-Identifier: GPL-3.0-only

import type { Chart, DeepPartial, IndicatorStyle } from "klinecharts";

import { CHART_STYLE_COLOR_TOKENS } from "@/ui/theme/visualColors";

import { getPriceColorPalette, type PriceColorMode } from "@/domains/chart/display";
import type { SignalIndicatorName } from "@/domains/indicators/core";
import {
  createChartSettingsIndicatorTooltipDataSource,
  unwrapChartSettingsIndicatorTooltipDataSource,
} from "@/domains/indicators/tooltipFeature";

const buildIndicatorDynamicStyles = (
  indicatorName: SignalIndicatorName | "VOL",
  mode: PriceColorMode,
): DeepPartial<IndicatorStyle> | null => {
  const palette = getPriceColorPalette(mode);
  if (indicatorName === "VOL") {
    return {
      bars: [
        {
          upColor: palette.up,
          downColor: palette.down,
          noChangeColor: palette.up,
        },
      ],
    };
  }

  if (indicatorName === "MACD") {
    return {
      bars: [
        {
          upColor: palette.up,
          downColor: palette.down,
          noChangeColor: palette.up,
        },
      ],
    };
  }

  return null;
};

const resolveIndicatorTooltipTextColor = (
  chart: Chart,
): string =>
  chart.getStyles().indicator?.tooltip?.title?.color ||
  chart.getStyles().indicator?.tooltip?.legend?.color ||
  CHART_STYLE_COLOR_TOKENS.main.tickTextDark;

const resolveIndicatorTooltipLabelActiveColor = (
  chart: Chart,
): string => {
  const baseColor = resolveIndicatorTooltipTextColor(chart);
  if (baseColor === CHART_STYLE_COLOR_TOKENS.main.tickTextLight) {
    return CHART_STYLE_COLOR_TOKENS.main.overlayPrimaryLight;
  }
  return CHART_STYLE_COLOR_TOKENS.main.overlayPrimaryDark;
};

export const safelyOverrideIndicatorStyle = (
  chart: Chart,
  indicatorId: string,
  indicatorName: SignalIndicatorName | "VOL",
  mode: PriceColorMode,
  options?: {
    enableChartSettingsTooltip?: boolean;
  },
) => {
  const mountedIndicator = chart.getIndicators({ id: indicatorId })[0];
  const dynamicStyles = buildIndicatorDynamicStyles(indicatorName, mode);
  if (!mountedIndicator && !dynamicStyles) {
    return;
  }
  const tooltipDataSourceBase = unwrapChartSettingsIndicatorTooltipDataSource(
    mountedIndicator?.createTooltipDataSource,
  );
  const createTooltipDataSource =
    mountedIndicator && options?.enableChartSettingsTooltip
      ? createChartSettingsIndicatorTooltipDataSource({
          indicatorId,
          color: resolveIndicatorTooltipTextColor(chart),
          activeColor: resolveIndicatorTooltipTextColor(chart),
          labelActiveColor: resolveIndicatorTooltipLabelActiveColor(chart),
          backgroundColor: CHART_STYLE_COLOR_TOKENS.curve.transparent,
          baseDataSource: tooltipDataSourceBase,
        })
      : tooltipDataSourceBase;
  try {
    chart.overrideIndicator({
      id: indicatorId,
      name: mountedIndicator?.name ?? String(indicatorName || ""),
      ...(dynamicStyles ? { styles: dynamicStyles } : {}),
      createTooltipDataSource,
    });
  } catch {
    // Ignore when indicator is not mounted yet.
  }
};
