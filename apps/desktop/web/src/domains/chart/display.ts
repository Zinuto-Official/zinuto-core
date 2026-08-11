// SPDX-License-Identifier: GPL-3.0-only

import type { AxisCreateTicksParams, AxisTick, BarSpace } from 'klinecharts';
import { ttByLanguage, type AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import { APP_UI_BASE_LANGUAGE, type AppUiLanguage } from '@/ui/config/uiConfig';
import {
  CHART_STYLE_COLOR_TOKENS,
  GLOBAL_COLOR_ARCHITECTURE
} from '@/ui/theme/visualColors';
import {
  getGlobalPriceColorMode,
  getPriceColorPalette,
  type PriceColorMode
} from '@/domains/chart/priceColorModeState';
import {
  getGlobalTypographyFontFamily,
} from '@/frontend-kernel/typography';
import {
  resolveKlineCandleTypeByRenderMode,
  type ChartRenderMode
} from '@/domains/chart/chartRenderMode';
import {
  DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION,
  resolveIndicatorValueDisplayPrecision,
} from '@/domains/indicators/precision';

export type ChartThemeMode = 'light' | 'dark';
export {
  getGlobalPriceColorMode,
  getPriceColorPalette,
  setGlobalPriceColorMode,
  type PriceColorMode
} from '@/domains/chart/priceColorModeState';

export type ChartDisplayEdgeConfig = {
  xAxisSize: number;
  yAxisSize: number;
  rightOffset: number;
  minRightVisibleBars: number;
  maxRightOffsetMultiplier: number;
};

const clampNumber = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export const INDICATOR_VALUE_DISPLAY_PRECISION = DEFAULT_INDICATOR_VALUE_DISPLAY_PRECISION;

export const TRAINER_CHART_EDGE_CONFIG: ChartDisplayEdgeConfig = Object.freeze({
  xAxisSize: 28,
  yAxisSize: 50,
  rightOffset: 2,
  minRightVisibleBars: 3,
  maxRightOffsetMultiplier: 4
});

export const HISTORY_PREVIEW_CHART_EDGE_CONFIG: ChartDisplayEdgeConfig = Object.freeze({
  xAxisSize: 28,
  yAxisSize: 45,
  rightOffset: 0,
  minRightVisibleBars: 3,
  maxRightOffsetMultiplier: 4
});

export const resolveResponsiveChartEdgeConfig = (
  baseConfig: ChartDisplayEdgeConfig,
  viewportScale: number
): ChartDisplayEdgeConfig => {
  const normalizedScale = clampNumber(viewportScale, 0.56, 1.08);
  const xAxisSize = Math.round(clampNumber(baseConfig.xAxisSize * normalizedScale, 22, 36));
  const yAxisSize = Math.round(clampNumber(baseConfig.yAxisSize * normalizedScale, 38, 62));
  const rightOffset = Math.max(0, Math.round(baseConfig.rightOffset * normalizedScale));
  return {
    ...baseConfig,
    xAxisSize,
    yAxisSize,
    rightOffset
  };
};

export const resolveChartChangeBubbleRight = (config: ChartDisplayEdgeConfig): number =>
  Math.round(clampNumber(config.yAxisSize + 10, 42, 88));

const resolveMaxOffsetRightDistance = (config: ChartDisplayEdgeConfig): number =>
{
  return Math.max(
    4,
    Math.round(config.rightOffset * config.maxRightOffsetMultiplier),
    Math.round(config.minRightVisibleBars * 4)
  );
};

const resolveSingleBarPixelWidth = (space: Partial<BarSpace> | null | undefined): number => {
  const barWidth = Number(space?.bar);
  const gapWidth = Number(space?.gapBar);
  const combinedWidth = barWidth + gapWidth;
  if (Number.isFinite(combinedWidth) && combinedWidth > 0) {
    return combinedWidth;
  }

  const halfBarWidth = Number(space?.halfBar);
  const halfGapWidth = Number(space?.halfGapBar);
  const combinedHalfWidth = (halfBarWidth + halfGapWidth) * 2;
  if (Number.isFinite(combinedHalfWidth) && combinedHalfWidth > 0) {
    return combinedHalfWidth;
  }

  return 0;
};

export const resolveMaxOffsetRightDistanceByVisibleBars = (
  chart: { getBarSpace: () => BarSpace; } | null | undefined,
  config: ChartDisplayEdgeConfig,
  visibleBarCount = 50
): number => {
  const baseline = resolveMaxOffsetRightDistance(config);
  const normalizedVisibleBarCount =
    Number.isFinite(visibleBarCount) && visibleBarCount > 0 ? Math.floor(visibleBarCount) : 50;
  const fallback = baseline;

  if (!chart || typeof chart.getBarSpace !== 'function') {
    return fallback;
  }

  try {
    const unitWidth = resolveSingleBarPixelWidth(chart.getBarSpace());
    if (!Number.isFinite(unitWidth) || unitWidth <= 0) {
      return fallback;
    }
    return Math.max(fallback, Math.round(unitWidth * normalizedVisibleBarCount));
  } catch {
    return fallback;
  }
};

const resolveUiAxisFontFamily = (): string => getGlobalTypographyFontFamily('ui');
const resolveNumericAxisFontFamily = (): string => getGlobalTypographyFontFamily('mono');
const MAIN_CHART_MARKET_INFO_LABEL_SIZE = 12;
const resolveMainChartMarketInfoLabelSize = (): number =>
  MAIN_CHART_MARKET_INFO_LABEL_SIZE;

const MAIN_CHART_TOOLTIP_FIELDS: ReadonlyArray<{
  titleKey: AppTextKey;
  valueTemplate: string;
}> = [
  { titleKey: 'appText.time', valueTemplate: '{time}' },
  { titleKey: 'appText.open', valueTemplate: '{open}' },
  { titleKey: 'appText.high', valueTemplate: '{high}' },
  { titleKey: 'appText.low', valueTemplate: '{low}' },
  { titleKey: 'appText.close', valueTemplate: '{close}' },
  { titleKey: 'appText.volume', valueTemplate: '{volume}' }
];

const buildMainChartTooltipLegendTemplate = (language: AppUiLanguage, isDark: boolean) => {
  const darkText = GLOBAL_COLOR_ARCHITECTURE.dark.text;
  return isDark
    ? MAIN_CHART_TOOLTIP_FIELDS.map(({ titleKey, valueTemplate }) => ({
        title: { text: ttByLanguage(language, titleKey), color: darkText.t2 },
        value: { text: valueTemplate, color: darkText.t1 }
      }))
    : MAIN_CHART_TOOLTIP_FIELDS.map(({ titleKey, valueTemplate }) => ({
        title: ttByLanguage(language, titleKey),
        value: valueTemplate
      }));
};

const createMainAxisStyle = (
  isDark: boolean,
  size: number | 'auto',
  fontFamily: string,
  tickTextSize: number
) => ({
  axisLine: {
    color: isDark ? CHART_STYLE_COLOR_TOKENS.main.axisLineDark : CHART_STYLE_COLOR_TOKENS.main.axisLineLight,
    size: 1,
    show: false
  },
  tickLine: {
    show: false,
    color: isDark ? CHART_STYLE_COLOR_TOKENS.main.tickLineDark : CHART_STYLE_COLOR_TOKENS.main.tickLineLight,
    size: 1,
    length: 3
  },
  tickText: {
    show: true,
    color: isDark ? CHART_STYLE_COLOR_TOKENS.main.tickTextDark : CHART_STYLE_COLOR_TOKENS.main.tickTextLight,
    size: tickTextSize,
    family: fontFamily,
    weight: 'normal',
    marginStart: 4,
    marginEnd: 6
  },
  show: true,
  size
});

export const createAdaptiveIndicatorTicks = ({
  defaultTicks
}: AxisCreateTicksParams): AxisTick[] =>
{
  const precision = resolveIndicatorValueDisplayPrecision(defaultTicks.map((tick) => tick.value));
  return defaultTicks.map((tick) => {
    const numericValue = typeof tick.value === 'number' ? tick.value : Number(tick.value);
    if (!Number.isFinite(numericValue)) {
      return tick;
    }
    return {
      ...tick,
      text: numericValue.toFixed(precision)
    };
  });
};

export const createMainChartStyles = (
  themeMode: ChartThemeMode,
  priceColorMode: PriceColorMode = getGlobalPriceColorMode(),
  edgeConfig: ChartDisplayEdgeConfig = HISTORY_PREVIEW_CHART_EDGE_CONFIG,
  chartRenderMode: ChartRenderMode = 'CANDLE',
  language: AppUiLanguage = APP_UI_BASE_LANGUAGE
) => {
  const isDark = themeMode === 'dark';
  const palette = getPriceColorPalette(priceColorMode);
  const riseColor = isDark ? palette.upLight : palette.up;
  const fallColor = isDark ? palette.downLight : palette.down;
  const overlayPrimary = isDark ? CHART_STYLE_COLOR_TOKENS.main.overlayPrimaryDark : CHART_STYLE_COLOR_TOKENS.main.overlayPrimaryLight;
  const areaLineColor = isDark ? CHART_STYLE_COLOR_TOKENS.curve.areaLineDark : CHART_STYLE_COLOR_TOKENS.curve.areaLineLight;
  const candleType = resolveKlineCandleTypeByRenderMode(chartRenderMode);
  const isLineMode = candleType === 'area';
  const tooltipLegendTemplate = buildMainChartTooltipLegendTemplate(language, isDark);
  const chartLabelSize = resolveMainChartMarketInfoLabelSize();
  const numericLabelFamily = resolveNumericAxisFontFamily();
  const uiLabelFamily = resolveUiAxisFontFamily();
  return {
    grid: {
      horizontal: {
        show: true,
        color: isDark ? CHART_STYLE_COLOR_TOKENS.main.gridHorizontalDark : CHART_STYLE_COLOR_TOKENS.main.gridHorizontalLight,
        size: 1,
        style: 'dashed',
        dashedValue: [4, 6]
      },
      vertical: {
        show: true,
        color: isDark ? CHART_STYLE_COLOR_TOKENS.main.gridVerticalDark : CHART_STYLE_COLOR_TOKENS.main.gridVerticalLight,
        size: 1,
        style: 'dashed',
        dashedValue: [4, 8]
      }
    },
    candle: {
      type: candleType,
      bar: {
        compareRule: 'previous_close',
        upColor: riseColor,
        downColor: fallColor,
        noChangeColor: isDark ? CHART_STYLE_COLOR_TOKENS.main.noChangeDark : CHART_STYLE_COLOR_TOKENS.main.noChangeLight,
        upBorderColor: riseColor,
        downBorderColor: fallColor,
        noChangeBorderColor: isDark ? CHART_STYLE_COLOR_TOKENS.main.noChangeDark : CHART_STYLE_COLOR_TOKENS.main.noChangeLight,
        upWickColor: riseColor,
        downWickColor: fallColor,
        noChangeWickColor: isDark ? CHART_STYLE_COLOR_TOKENS.main.noChangeDark : CHART_STYLE_COLOR_TOKENS.main.noChangeLight
      },
      area: {
        lineSize: isLineMode ? 2 : 1.8,
        lineColor: isLineMode ? overlayPrimary : areaLineColor,
        value: 'close',
        smooth: true,
        backgroundColor: isLineMode ?
        CHART_STYLE_COLOR_TOKENS.curve.transparent :
        isDark ?
        CHART_STYLE_COLOR_TOKENS.curve.areaBackgroundDark :
        CHART_STYLE_COLOR_TOKENS.curve.areaBackgroundLight,
        point: {
          show: false,
          color: CHART_STYLE_COLOR_TOKENS.curve.transparent,
          radius: 0,
          rippleColor: CHART_STYLE_COLOR_TOKENS.curve.transparent,
          rippleRadius: 0,
          animation: false,
          animationDuration: 0
        }
      },
      priceMark: {
        high: {
          textSize: chartLabelSize,
          textFamily: numericLabelFamily
        },
        low: {
          textSize: chartLabelSize,
          textFamily: numericLabelFamily
        },
        last: {
          upColor: riseColor,
          downColor: fallColor,
          noChangeColor: isDark ? CHART_STYLE_COLOR_TOKENS.main.noChangeDark : CHART_STYLE_COLOR_TOKENS.main.noChangeLight,
          compareRule: 'previous_close',
          text: {
            size: chartLabelSize,
            family: numericLabelFamily
          }
        }
      },
      tooltip: {
        showRule: 'always' as const,
        title: {
          show: false,
          template: ''
        },
        legend: {
          size: chartLabelSize,
          template: tooltipLegendTemplate
        }
      }
    },
    xAxis: createMainAxisStyle(
      isDark,
      edgeConfig.xAxisSize,
      uiLabelFamily,
      chartLabelSize
    ),
    yAxis: createMainAxisStyle(
      isDark,
      'auto',
      numericLabelFamily,
      chartLabelSize
    ),
    crosshair: {
      horizontal: {
        text: {
          size: chartLabelSize,
          family: numericLabelFamily
        }
      },
      vertical: {
        text: {
          size: chartLabelSize,
          family: uiLabelFamily
        }
      }
    },
    indicator: {
      tooltip: {
        offsetTop: 3,
        title: {
          color: isDark ? CHART_STYLE_COLOR_TOKENS.main.tickTextDark : CHART_STYLE_COLOR_TOKENS.main.tickTextLight,
          size: chartLabelSize,
          marginTop: 0,
          marginBottom: 2
        },
        legend: {
          color: isDark ? CHART_STYLE_COLOR_TOKENS.main.tickTextDark : CHART_STYLE_COLOR_TOKENS.main.tickTextLight,
          size: chartLabelSize,
          marginTop: 0,
          marginBottom: 2
        }
      }
    },
    overlay: {
      point: {
        color: overlayPrimary,
        borderColor: overlayPrimary,
        borderSize: 1,
        radius: 3,
        activeColor: overlayPrimary,
        activeBorderColor: overlayPrimary,
        activeBorderSize: 2,
        activeRadius: 4
      },
      line: {
        style: 'solid' as const,
        size: 2,
        color: overlayPrimary,
        dashedValue: [8, 4],
        smooth: false
      }
    }
  };
};
