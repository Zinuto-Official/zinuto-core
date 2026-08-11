// SPDX-License-Identifier: GPL-3.0-only

import type { Chart, KLineData } from 'klinecharts';
import { INDICATOR_PANES } from '@/domains/indicators';
import { parseTimestampMs } from '@zinuto/shared/marketTime';

type ReplayBarLike = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const HISTORY_DIAGNOSTIC_FOCUS_OVERLAY_ID = 'history-diagnostic-focus-marker';
export const HISTORY_ENTRY_BOUNDARY_OVERLAY_ID = 'history-entry-boundary-overlay';
export const HISTORY_ENTRY_BOUNDARY_OVERLAY_GROUP = 'history-entry-boundary-group';
export const HISTORY_SPECIAL_TRAINING_OVERLAY_GROUP = 'history-special-training-overlay-group';
export const HISTORY_SPECIAL_TRAINING_DECISION_BOUNDARY_OVERLAY_ID =
  'history-special-training-decision-boundary-overlay';
export const HISTORY_SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_ID =
  'history-special-training-decision-reference-overlay';
export const HISTORY_SPECIAL_TRAINING_MFE_RAY_OVERLAY_ID =
  'history-special-training-mfe-ray-overlay';
export const HISTORY_SPECIAL_TRAINING_MAE_RAY_OVERLAY_ID =
  'history-special-training-mae-ray-overlay';
export const HISTORY_SPECIAL_TRAINING_MFE_TAG_OVERLAY_ID =
  'history-special-training-mfe-tag-overlay';
export const HISTORY_SPECIAL_TRAINING_MAE_TAG_OVERLAY_ID =
  'history-special-training-mae-tag-overlay';
export const HISTORY_SPECIAL_TRAINING_RISK_BASELINE_LINE_OVERLAY_ID =
  'history-special-training-risk-baseline-line-overlay';
export const HISTORY_SPECIAL_TRAINING_RISK_BASELINE_TAG_OVERLAY_ID =
  'history-special-training-risk-baseline-tag-overlay';
export const HISTORY_SPECIAL_TRAINING_RISK_COST_LINE_OVERLAY_ID =
  'history-special-training-risk-cost-line-overlay';
export const HISTORY_SPECIAL_TRAINING_RISK_COST_TAG_OVERLAY_ID =
  'history-special-training-risk-cost-tag-overlay';

export const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
};

export const mapBarToKline = (bar: ReplayBarLike): KLineData => ({
  timestamp: parseTimestampMs(bar.ts),
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume
});

export const applyHistoryCandlePaneAxisOptions = (chart: Chart) => {
  chart.setPaneOptions({
    id: INDICATOR_PANES.candle,
    axis: {
      name: 'normal',
      scrollZoomEnabled: false
    }
  });
};

export const resolveVisibleRangeBarCount = (chart: Chart): number => {
  try {
    const visibleRange = chart.getVisibleRange?.();
    const fromRaw = Number(visibleRange?.realFrom ?? visibleRange?.from);
    const toRaw = Number(visibleRange?.realTo ?? visibleRange?.to);
    if (!Number.isFinite(fromRaw) || !Number.isFinite(toRaw)) {
      return 0;
    }
    const from = Math.max(0, Math.floor(Math.min(fromRaw, toRaw)));
    const to = Math.max(0, Math.floor(Math.max(fromRaw, toRaw)));
    const count = to - from + 1;
    return count > 0 ? count : 0;
  } catch {
    return 0;
  }
};

export const applyHistoryChartStyleOverrides = (
  styles: any,
  options: { hideLastPriceLine: boolean; hideNativeTooltip: boolean }
) => {
  if (options.hideLastPriceLine && styles?.candle?.priceMark?.last) {
    styles.candle.priceMark.last = {
      ...styles.candle.priceMark.last,
      show: false,
      line: {
        ...(styles.candle.priceMark.last.line || {}),
        show: false
      },
      text: {
        ...(styles.candle.priceMark.last.text || {}),
        show: false
      }
    };
  }
  if (options.hideNativeTooltip) {
    if (styles?.candle?.tooltip) {
      styles.candle.tooltip = {
        ...styles.candle.tooltip,
        showRule: 'none'
      };
    }
    if (styles?.indicator?.tooltip) {
      styles.indicator.tooltip = {
        ...styles.indicator.tooltip,
        showRule: 'none'
      };
    }
  }
  return styles;
};
