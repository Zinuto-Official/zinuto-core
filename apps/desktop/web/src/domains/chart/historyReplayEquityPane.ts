// SPDX-License-Identifier: GPL-3.0-only

import type { Chart, IndicatorFigure } from 'klinecharts';
import {
  createDetachedIndicatorPaneAxis,
  INDICATOR_IDS,
  INDICATOR_PANES,
  resolveDetachedIndicatorPaneMinHeight,
} from '@/domains/indicators';

export type HistoryReplayEquityCurvePoint = {
  barIndex: number;
  equity: number;
};

export type HistoryReplayEquityPane = {
  points: readonly HistoryReplayEquityCurvePoint[];
  title?: string;
};

type AggregatedBarItemForEquityPane = {
  endRawIndex: number;
};

type HistoryReplayEquityPaneRow = {
  equity: number | null;
};

const HISTORY_EQUITY_INDICATOR_NAME = '__ZINUTO_BACKTEST_EQUITY__';
const HISTORY_EQUITY_PANE_HEIGHT = 112;
const HISTORY_EQUITY_PANE_MIN_HEIGHT = 34;
const HISTORY_EQUITY_VALUE_KEY = 'equity';

export const buildHistoryEquityPaneRows = (
  points: readonly HistoryReplayEquityCurvePoint[] | null | undefined,
  visibleItems: readonly AggregatedBarItemForEquityPane[],
): HistoryReplayEquityPaneRow[] => {
  if (!points?.length || !visibleItems.length) {
    return visibleItems.map(() => ({ equity: null }));
  }
  const sortedPoints = points
    .map((point) => ({
      barIndex: Math.floor(Number(point.barIndex)),
      equity: Number(point.equity),
    }))
    .filter((point) => Number.isFinite(point.barIndex) && Number.isFinite(point.equity))
    .sort((left, right) => left.barIndex - right.barIndex);
  if (!sortedPoints.length) {
    return visibleItems.map(() => ({ equity: null }));
  }
  let pointIndex = 0;
  let latestEquity: number | null = null;
  return visibleItems.map((item) => {
    while (
      pointIndex < sortedPoints.length &&
      sortedPoints[pointIndex].barIndex <= item.endRawIndex
    ) {
      latestEquity = sortedPoints[pointIndex].equity;
      pointIndex += 1;
    }
    return { equity: latestEquity };
  });
};

export const buildHistoryEquityPaneSignature = (
  title: string,
  rows: readonly HistoryReplayEquityPaneRow[],
): string => [
  title,
  rows.length,
  rows
    .map((row) => Number.isFinite(row.equity) ? Number(row.equity).toFixed(4) : '')
    .join(','),
].join('|');

const buildHistoryEquityFigureStyle = (color: string): (() => Record<string, unknown>) => () => ({
  color,
  size: 1.8,
  style: 'solid',
  dashedValue: [0, 0],
  borderColor: color,
  borderSize: 0,
  backgroundColor: 'transparent',
});

export const createHistoryEquityFigure = (color: string): IndicatorFigure => ({
  key: HISTORY_EQUITY_VALUE_KEY,
  title: '',
  type: 'line',
  styles: buildHistoryEquityFigureStyle(color),
});

export const mountHistoryEquityPaneIndicator = ({
  chart,
  title,
  rows,
  color,
}: {
  chart: Chart;
  title: string;
  rows: readonly HistoryReplayEquityPaneRow[];
  color: string;
}) => {
  chart.createIndicator(
    {
      id: INDICATOR_IDS.historyEquityCurve,
      name: HISTORY_EQUITY_INDICATOR_NAME,
      shortName: title,
      precision: 2,
      figures: [createHistoryEquityFigure(color)],
      calc: (dataList) =>
        dataList.map((_item, index) => ({
          equity: rows[index]?.equity ?? null,
        })),
    },
    {
      isStack: false,
      pane: {
        id: INDICATOR_PANES.historyEquity,
        height: HISTORY_EQUITY_PANE_HEIGHT,
        minHeight: resolveDetachedIndicatorPaneMinHeight(HISTORY_EQUITY_PANE_MIN_HEIGHT),
        dragEnabled: true,
        axis: createDetachedIndicatorPaneAxis(true),
      },
    },
  );
};
