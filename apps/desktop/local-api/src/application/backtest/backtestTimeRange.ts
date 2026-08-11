// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';
import {
  getMarketBarCount,
  getMarketBarsByInstrumentIdRange,
  getMarketBarsByInstrumentIdTsRange,
} from '../ports/infrastructure/db/marketDatabase.js';
import type {
  BacktestConfig,
  BacktestInstrumentCandidate,
} from './types.js';

const BACKTEST_TIME_RANGE_OPEN_START = '1900-01-01T00:00:00.000Z';
const BACKTEST_TIME_RANGE_OPEN_END = '9999-12-31T23:59:59.999Z';

export type BacktestMarketReader = {
  getMarketBarCount: typeof getMarketBarCount;
  getMarketBarsByInstrumentIdRange:
    typeof getMarketBarsByInstrumentIdRange;
  getMarketBarsByInstrumentIdTsRange:
    typeof getMarketBarsByInstrumentIdTsRange;
};

const DEFAULT_BACKTEST_MARKET_READER: BacktestMarketReader = {
  getMarketBarCount,
  getMarketBarsByInstrumentIdRange,
  getMarketBarsByInstrumentIdTsRange,
};

export const hasBacktestTimeRange = (config: BacktestConfig): boolean =>
  Boolean(config.startTime || config.endTime);

const resolveBacktestTimeRange = (
  config: BacktestConfig,
): { startTime: string; endTime: string } => ({
  startTime: config.startTime?.trim() || BACKTEST_TIME_RANGE_OPEN_START,
  endTime: config.endTime?.trim() || BACKTEST_TIME_RANGE_OPEN_END,
});

export const readBacktestCandidateBars = async (
  candidate: Pick<BacktestInstrumentCandidate, 'instrumentId' | 'barCount'>,
  config: BacktestConfig,
  options: {
    signal?: AbortSignal;
    marketReader?: BacktestMarketReader;
  } = {},
): Promise<OhlcvBar[]> => {
  const marketReader = options.marketReader ?? DEFAULT_BACKTEST_MARKET_READER;
  if (hasBacktestTimeRange(config)) {
    const range = resolveBacktestTimeRange(config);
    return marketReader.getMarketBarsByInstrumentIdTsRange(
      candidate.instrumentId,
      range.startTime,
      range.endTime,
      options,
    );
  }
  const barCount = candidate.barCount > 0
    ? candidate.barCount
    : await marketReader.getMarketBarCount(candidate.instrumentId, {
      signal: options.signal,
    });
  if (barCount <= 0) {
    return [];
  }
  return marketReader.getMarketBarsByInstrumentIdRange(
    candidate.instrumentId,
    0,
    barCount,
    { signal: options.signal },
  );
};

export const readBacktestDetailBars = async (options: {
  instrumentId: string;
  config: BacktestConfig;
  startIndex: number;
  limit: number;
  marketReader?: BacktestMarketReader;
}): Promise<{
  rawBars: OhlcvBar[];
  rawIndexStart: number | null;
}> => {
  const marketReader = options.marketReader ?? DEFAULT_BACKTEST_MARKET_READER;
  if (options.limit <= 0) {
    return {
      rawBars: [],
      rawIndexStart: hasBacktestTimeRange(options.config) ? null : options.startIndex,
    };
  }
  if (hasBacktestTimeRange(options.config)) {
    const range = resolveBacktestTimeRange(options.config);
    const rawBars = await marketReader.getMarketBarsByInstrumentIdTsRange(
      options.instrumentId,
      range.startTime,
      range.endTime,
    );
    return {
      rawBars: rawBars.slice(0, options.limit),
      rawIndexStart: null,
    };
  }
  return {
    rawBars: await marketReader.getMarketBarsByInstrumentIdRange(
      options.instrumentId,
      options.startIndex,
      options.limit,
    ),
    rawIndexStart: options.startIndex,
  };
};
