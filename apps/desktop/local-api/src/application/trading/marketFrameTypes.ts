// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';
import type { BaseTimeframe } from '@zinuto/shared/timeframe';
import type { DisplayPeriodKey, FreeReplayAdvancePeriod } from '@zinuto/shared/period';

export interface BarsRangeResult {
  symbol: string;
  timeframe: string;
  timeZone: string | null;
  total: number;
  offset: number;
  limit: number;
  bars: OhlcvBar[];
}

export interface FreeReplayStartPointOverviewBar {
  ts: string;
  startTs: string;
  endTs: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  startRawIndex: number;
  endRawIndex: number;
  startTrainingIndex: number;
  endTrainingIndex: number;
}

export interface ReplayArchiveRangeBar extends OhlcvBar {
  displayIndex: number;
  startRawIndex: number;
  endRawIndex: number;
}

export interface ReplayArchiveBarsRangeResult {
  symbol: string;
  timeframe: BaseTimeframe;
  displayPeriod: DisplayPeriodKey;
  timeZone: string | null;
  totalRaw: number;
  totalDisplay: number;
  offset: number;
  bars: ReplayArchiveRangeBar[];
}

export type MarketChartDirection = 'FORWARD' | 'BACKWARD';

export type MarketChartFrameOptions = {
  displayPeriod?: DisplayPeriodKey | string;
  anchorRawIndex?: number;
  anchorDisplayIndex?: number;
  direction?: MarketChartDirection;
  before?: number;
  after?: number;
  maxDisplayBars?: number;
  skipContinuationPrewarm?: boolean;
  signal?: AbortSignal;
  canPublish?: () => boolean;
};

export interface FreeReplayStartPointOverviewResult {
  samplePoolId: string;
  instrumentId: string;
  symbol: string;
  sourceTimeframe: BaseTimeframe;
  minimumBaseTimeframe: FreeReplayAdvancePeriod;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  displayPeriod: DisplayPeriodKey;
  timeZone: string | null;
  trainingTotal: number;
  total: number;
  offset: number;
  limit: number;
  bars: FreeReplayStartPointOverviewBar[];
}
