// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { useEffect, type MutableRefObject } from 'react';
import type { Chart } from 'klinecharts';
import {
  createMainChartStyles,
  type ChartDisplayEdgeConfig,
  type ChartThemeMode,
  type PriceColorMode
} from '@/domains/chart/display';
import { type ChartRenderMode } from '@/domains/chart/chartRenderMode';
import {
  getGlobalTypographyFontFamily,
  getGlobalTypographyReferencePx
} from '@/frontend-kernel/typography';
import {
  applyIndicatorStyles,
  INDICATOR_IDS,
  isIndicatorNone,
} from '@/domains/indicators/runtime';
import type { SignalIndicatorName } from '@/domains/indicators/core';

type UseTrainerChartStyleSyncArgs = {
  chartReady: boolean;
  chartRef: MutableRefObject<Chart | null>;
  effectiveThemeMode: ChartThemeMode;
  priceColorMode: PriceColorMode;
  chartRenderMode: ChartRenderMode;
  language: UiLanguage;
  trainerResponsiveChartEdgeConfig: ChartDisplayEdgeConfig;
  applyTrainerMaxOffsetRightDistance: (chart: Chart) => void;
  adjustPaneHeights: () => void;
  mainNativeIndicator: string;
  signalTopIndicator: SignalIndicatorName;
  signalBottomIndicator: SignalIndicatorName;
  supportedIndicatorNameSet: Set<string>;
  showVolumePane: boolean;
  hideLastPriceMark?: boolean;
};

export const useTrainerChartStyleSync = ({
  chartReady,
  chartRef,
  effectiveThemeMode,
  priceColorMode,
  chartRenderMode,
  language,
  trainerResponsiveChartEdgeConfig,
  applyTrainerMaxOffsetRightDistance,
  adjustPaneHeights,
  mainNativeIndicator,
  signalTopIndicator,
  signalBottomIndicator,
  supportedIndicatorNameSet,
  showVolumePane,
  hideLastPriceMark = false
}: UseTrainerChartStyleSyncArgs) => {
  const chartTypographySignature = `${getGlobalTypographyFontFamily('ui')}|${getGlobalTypographyFontFamily('mono')}|${getGlobalTypographyReferencePx("r1")}`;
  useEffect(() => {
    if (!chartReady) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const nextStyles = createMainChartStyles(
      effectiveThemeMode,
      priceColorMode,
      trainerResponsiveChartEdgeConfig,
      chartRenderMode,
      language
    ) as Parameters<Chart['setStyles']>[0] & {
      candle?: {
        priceMark?: {
          last?: {
            line?: { show?: boolean; };
            text?: { show?: boolean; };
          };
        };
      };
    };
    if (hideLastPriceMark && nextStyles?.candle?.priceMark?.last) {
      nextStyles.candle.priceMark.last = {
        ...nextStyles.candle.priceMark.last,
        line: {
          ...(nextStyles.candle.priceMark.last.line || {}),
          show: false
        },
        text: {
          ...(nextStyles.candle.priceMark.last.text || {}),
          show: false
        }
      };
    }
    chart.setStyles(nextStyles as Parameters<Chart['setStyles']>[0]);
    chart.setRightMinVisibleBarCount(trainerResponsiveChartEdgeConfig.minRightVisibleBars);
    applyTrainerMaxOffsetRightDistance(chart);
    adjustPaneHeights();
  }, [
    adjustPaneHeights,
    applyTrainerMaxOffsetRightDistance,
    chartReady,
    chartRef,
    chartTypographySignature,
    effectiveThemeMode,
    language,
    priceColorMode,
    chartRenderMode,
    hideLastPriceMark,
    trainerResponsiveChartEdgeConfig
  ]);

  useEffect(() => {
    if (!chartReady) {
      return;
    }
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    applyIndicatorStyles(chart, priceColorMode, [
      { id: INDICATOR_IDS.volumeMain, name: 'VOL', enabled: showVolumePane },
      {
        id: INDICATOR_IDS.mainNative,
        name: mainNativeIndicator,
        enabled: !isIndicatorNone(mainNativeIndicator) && supportedIndicatorNameSet.has(mainNativeIndicator),
        enableChartSettingsTooltip: true
      },
      {
        id: INDICATOR_IDS.signalTop,
        name: signalTopIndicator,
        enabled:
          signalTopIndicator === 'NONE' ||
          (!isIndicatorNone(signalTopIndicator) &&
            supportedIndicatorNameSet.has(signalTopIndicator)),
        enableChartSettingsTooltip: true
      },
      {
        id: INDICATOR_IDS.signalBottom,
        name: signalBottomIndicator,
        enabled:
          signalBottomIndicator === 'NONE' ||
          (!isIndicatorNone(signalBottomIndicator) &&
            supportedIndicatorNameSet.has(signalBottomIndicator)),
        enableChartSettingsTooltip: true
      }
    ]);
  }, [
    chartReady,
    chartRef,
    chartTypographySignature,
    effectiveThemeMode,
    language,
    mainNativeIndicator,
    priceColorMode,
    chartRenderMode,
    showVolumePane,
    signalBottomIndicator,
    signalTopIndicator,
    supportedIndicatorNameSet
  ]);
};
