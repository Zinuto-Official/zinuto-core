// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import { CHART_OVERLAY_IDS } from '@/domains/chart/overlays/constants';
import { type HistoryReplayChartBindings } from '@/domains/chart/HistoryReplayChart';
import {
  PERIOD_OPTIONS_BY_BASE_TIMEFRAME,
  DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE,
  DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE,
  toKlinePeriod
} from '@/domains/chart/chartPeriods';
import { inferBaseTimeframeFromBars, aggregateBarsByPeriod } from '@/domains/chart/replayAggregation';
import {
  getDrawingMinPointCount,
  registerCustomOverlays
} from '@/domains/chart/chartRuntime';

export const useHistoryReplayChartBindings = () =>
  useMemo<HistoryReplayChartBindings>(
    () => ({
      periodOptionsByBaseTimeframe: PERIOD_OPTIONS_BY_BASE_TIMEFRAME,
      defaultTrainerPeriodOptionsByBase: DEFAULT_TRAINER_PERIOD_OPTIONS_BY_BASE,
      defaultTrainerDisplayPeriodByBase: DEFAULT_TRAINER_DISPLAY_PERIOD_BY_BASE,
      inferBaseTimeframeFromBars,
      aggregateBarsByPeriod,
      toKlinePeriod,
      getDrawingMinPointCount,
      registerCustomOverlays,
      overlayIds: CHART_OVERLAY_IDS
    }),
    []
  );
