// SPDX-License-Identifier: GPL-3.0-only

import {
  SYSTEM_FX_1M_2025Q1_POOL_ID,
  SYSTEM_WIKI_EOD_POOL_ID,
} from '../ports/infrastructure/db/systemSeedBars.js';
import {
  getMarketBarByIndex,
  getMarketBarCount,
  getMarketBarTsByRange,
  getMarketBarsByInstrumentId,
  getMarketBarsByInstrumentIdRange,
  getMarketDisplayBarContainingRawIndex,
  getMarketDisplayBarsByIndexRange,
  getMarketTimelineTotalDisplay,
  ensureMarketTimelinePeriodsReady,
  HOT_MARKET_TIMELINE_PREWARM_PERIODS,
  scheduleMarketPrewarmTask,
  getMarketCloseAtOrBefore,
  type MarketDisplayBar,
} from '../ports/infrastructure/db/marketDatabase.js';
import {
  buildMarketBarFrameCacheKey,
  getOrLoadCachedMarketBarFrame,
} from '../ports/infrastructure/db/marketReadCache.js';
import type { DisplayPeriodKey } from '@zinuto/shared/period';
import {
  DEFAULT_TRADING_CALENDAR_CONFIG,
  parseStoredTradingCalendarConfig,
  stableTradingCalendarKey,
  type TradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';
import { DESKTOP_API_LIMITS } from '@zinuto/shared/input-limits';
import type { MarketBarFrame, OhlcvBar } from '../../domain/models.js';
import { runtimeLimits } from '../../kernel/runtimeLimits.js';
import { appError } from '../../kernel/appError.js';
import {
  ensureSystemMarketSeedReady,
  ensureInstrumentMarketBarsReady as ensureInstrumentMarketBarsReadyWithSeed,
} from '../systemMarketSeedService.js';
import type { InstrumentRow } from '../../domain/trading/types.js';
import { tradingCoreStore } from './tradingCoreStoreRuntime.js';
import {
  normalizeDisplayPeriod,
  resolveBaseDisplayPeriod,
  resolveFrameDirection,
  resolveInstrumentTimeZone,
  resolveNonNegativeInt,
  toBaseTimeframe,
} from './marketFrameSemantics.js';
import type {
  MarketChartDirection,
  MarketChartFrameOptions,
  ReplayArchiveBarsRangeResult,
  ReplayArchiveRangeBar,
} from './marketFrameTypes.js';

export const getInstrumentBySymbol = (symbol: string, timeframe?: string): InstrumentRow | undefined => {
  return tradingCoreStore.getInstrumentBySymbol(symbol, timeframe);
};

export const getInstrumentById = (id: string): InstrumentRow | undefined =>
  tradingCoreStore.getInstrumentById(id);

export const resolveInstrumentSamplePoolId = (instrument: InstrumentRow): string => {
  const sourceId = String(instrument.source_id ?? '').trim();
  if (sourceId) {
    return sourceId;
  }
  if (String(instrument.market || '').trim().toUpperCase() === 'SYSTEM') {
    return toBaseTimeframe(instrument.base_timeframe, '1d') === '1m'
      ? SYSTEM_FX_1M_2025Q1_POOL_ID
      : SYSTEM_WIKI_EOD_POOL_ID;
  }
  return '';
};

export const loadMarketBarsByInstrumentId = (instrumentId: string): Promise<OhlcvBar[]> => getMarketBarsByInstrumentId(instrumentId);

export const loadMarketBarsByInstrumentIdRange = (instrumentId: string, offset: number, limit: number): Promise<OhlcvBar[]> =>
  getMarketBarsByInstrumentIdRange(instrumentId, offset, limit);

export const updateInstrumentBarCount = (instrumentId: string, barCount: number): void => {
  tradingCoreStore.updateInstrumentBarCount(instrumentId, barCount);
};

export const ensureInstrumentMarketBarsReady = async (instrument: InstrumentRow): Promise<number> => {
  return ensureInstrumentMarketBarsReadyWithSeed(
    {
      updateInstrumentBarCount
    },
    instrument
  );
};

export const ensureSystemSeedUniverseReady = async (): Promise<void> => {
  await ensureSystemMarketSeedReady({
    updateInstrumentBarCount
  });
};

export const getBarCount = async (instrumentId: string): Promise<number> => Math.max(0, await getMarketBarCount(instrumentId));

export const getBarByIndex = (instrumentId: string, index: number): Promise<OhlcvBar | undefined> =>
  getMarketBarByIndex(instrumentId, index);

export const getCloseAtOrBefore = (instrumentId: string, ts: string): Promise<number | null> =>
  getMarketCloseAtOrBefore(instrumentId, ts);

export const getBarTsByRange = (instrumentId: string, offset: number, limit: number): Promise<string[]> =>
  getMarketBarTsByRange(instrumentId, offset, limit);

export const getBarTsByInstrumentIdRange = async (
  instrumentId: string,
  offset: number,
  limit: number,
): Promise<string[]> => {
  const normalizedInstrumentId = String(instrumentId || '').trim();
  const instrument = getInstrumentById(normalizedInstrumentId);
  if (!instrument) {
    throw appError('INSTRUMENT_NOT_FOUND', { instrumentId: normalizedInstrumentId });
  }
  await ensureInstrumentMarketBarsReady(instrument);
  return getBarTsByRange(instrument.id, offset, limit);
};

export const MARKET_BAR_FRAME_SCHEMA_VERSION = 'zinuto-market-frame-v2' as const;
export const MARKET_BAR_FRAME_CONTINUATION_PREWARM_LIMIT = 800;

export const resolveInstrumentTradingCalendar = (
  instrument: InstrumentRow,
): TradingCalendarConfig => {
  const sourceId = String(instrument.source_id ?? '').trim();
  if (!sourceId || String(instrument.market ?? '').trim().toUpperCase() !== 'LOCAL') {
    return DEFAULT_TRADING_CALENDAR_CONFIG;
  }
  const tradingCalendarJson =
    tradingCoreStore.getLocalSourceTradingCalendarJson(sourceId);
  if (!tradingCalendarJson) {
    throw appError('LOCAL_DATA_SOURCE_NOT_FOUND', { sourceId }, 404);
  }
  return parseStoredTradingCalendarConfig(tradingCalendarJson);
};

export const resolveInstrumentTimelineConfig = (
  instrument: InstrumentRow,
  totalRaw: number,
): { versionToken: string; tradingCalendar: TradingCalendarConfig } => {
  const tradingCalendar = resolveInstrumentTradingCalendar(instrument);
  return {
    versionToken: resolveMarketFrameVersionToken(
      instrument,
      totalRaw,
      tradingCalendar,
    ),
    tradingCalendar,
  };
};

export const resolveMarketFrameVersionToken = (
  instrument: InstrumentRow,
  totalRaw: number,
  tradingCalendar?: TradingCalendarConfig | null,
): string => {
  const token = String(instrument.bars_version_token ?? '').trim();
  const baseToken = token || [
    'market-frame',
    String(instrument.id || '').trim(),
    String(instrument.base_timeframe || '').trim().toLowerCase() || '1d',
    Math.max(0, Math.floor(Number(totalRaw) || 0)),
  ].join(':');
  const calendar = tradingCalendar ?? resolveInstrumentTradingCalendar(instrument);
  return `${baseToken}:calendar:${stableTradingCalendarKey(calendar)}`;
};

export const buildMarketBarFrame = ({
  instrument,
  totalRaw,
  totalDisplay,
  limit,
  bars,
  displayPeriod,
  tradingCalendar,
}: {
  instrument: InstrumentRow;
  totalRaw: number;
  totalDisplay: number;
  limit: number;
  bars: MarketDisplayBar[];
  displayPeriod: DisplayPeriodKey;
  tradingCalendar?: TradingCalendarConfig | null;
}): MarketBarFrame => {
  const safeTotalRaw = Math.max(0, Math.floor(Number(totalRaw) || 0));
  const safeTotalDisplay = Math.max(0, Math.floor(Number(totalDisplay) || 0));
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const baseDisplayPeriod = resolveBaseDisplayPeriod(instrument.base_timeframe, '1d');
  const resolvedDisplayPeriod = normalizeDisplayPeriod(
    displayPeriod,
    baseDisplayPeriod,
  );
  const count = bars.length;
  const displayIndex = new Array<number>(count);
  const timestampMs = new Array<number>(count);
  const open = new Array<number>(count);
  const high = new Array<number>(count);
  const low = new Array<number>(count);
  const close = new Array<number>(count);
  const volume = new Array<number>(count);
  const startRawIndex = new Array<number>(count);
  const endRawIndex = new Array<number>(count);
  let resolvedRawStartIndex = count > 0 ? Number.POSITIVE_INFINITY : 0;
  let resolvedRawEndIndex = count > 0 ? 0 : resolvedRawStartIndex;

  const readFiniteBarNumber = (
    field: 'open' | 'high' | 'low' | 'close' | 'volume',
    value: unknown,
    index: number,
  ): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw appError('MARKET_BAR_FRAME_INVALID_NUMBER', {
        field,
        index,
      });
    }
    return numeric;
  };

  for (let i = 0; i < count; i += 1) {
    const bar = bars[i];
    const parsedTs = Number(bar?.bucketStartMs);
    if (!Number.isFinite(parsedTs)) {
      throw appError('MARKET_BAR_FRAME_INVALID_TIMESTAMP', { index: i });
    }
    timestampMs[i] = Math.floor(parsedTs);
    open[i] = readFiniteBarNumber('open', bar?.open, i);
    high[i] = readFiniteBarNumber('high', bar?.high, i);
    low[i] = readFiniteBarNumber('low', bar?.low, i);
    close[i] = readFiniteBarNumber('close', bar?.close, i);
    volume[i] = readFiniteBarNumber('volume', bar?.volume, i);
    displayIndex[i] = resolveNonNegativeInt(bar?.displayIndex, i);
    const barStartRawIndex = resolveNonNegativeInt(bar?.startRawIndex, i);
    const barEndRawIndex = Math.max(
      barStartRawIndex,
      resolveNonNegativeInt(bar?.endRawIndex, barStartRawIndex),
    );
    startRawIndex[i] = barStartRawIndex;
    endRawIndex[i] = barEndRawIndex;
    resolvedRawStartIndex = Math.min(resolvedRawStartIndex, barStartRawIndex);
    resolvedRawEndIndex = Math.max(resolvedRawEndIndex, barEndRawIndex);
  }
  if (count <= 0) {
    resolvedRawStartIndex = 0;
    resolvedRawEndIndex = resolvedRawStartIndex;
  }
  const safeDisplayStartIndex = count > 0 ? displayIndex[0] : 0;
  const safeDisplayEndIndex = count > 0 ? displayIndex[count - 1] : safeDisplayStartIndex;

  return {
    schemaVersion: MARKET_BAR_FRAME_SCHEMA_VERSION,
    instrumentId: String(instrument.id || '').trim(),
    symbol: String(instrument.symbol || '').trim().toUpperCase(),
    baseTimeframe: String(instrument.base_timeframe || '1d').trim().toLowerCase() || '1d',
    timeframe: String(instrument.base_timeframe || '1d').trim().toLowerCase() || '1d',
    displayPeriod: resolvedDisplayPeriod,
    timeZone: resolveInstrumentTimeZone(instrument),
    totalRaw: safeTotalRaw,
    totalDisplay: safeTotalDisplay,
    rawStartIndex: resolvedRawStartIndex,
    rawEndIndex: resolvedRawEndIndex,
    displayStartIndex: safeDisplayStartIndex,
    displayEndIndex: safeDisplayEndIndex,
    limit: safeLimit,
    hasBackward: count > 0 ? safeDisplayStartIndex > 0 : false,
    hasForward: count > 0 ? safeDisplayEndIndex + 1 < safeTotalDisplay : safeTotalDisplay > 0,
    versionToken: resolveMarketFrameVersionToken(instrument, safeTotalRaw, tradingCalendar),
    displayIndex,
    timestampMs,
    open,
    high,
    low,
    close,
    volume,
    startRawIndex,
    endRawIndex,
  };
};

export const scheduleMarketBarFrameContinuationPrewarm = (
  frame: MarketBarFrame,
  direction: MarketChartDirection,
): void => {
  if (!frame.timestampMs.length) {
    return;
  }

  const displayPeriod = String(frame.displayPeriod || '').trim();
  const instrumentId = String(frame.instrumentId || '').trim();
  const versionToken = String(frame.versionToken || '').trim();
  if (!instrumentId || !displayPeriod || !versionToken) {
    return;
  }

  const normalizedDirection = resolveFrameDirection(direction);
  const totalDisplay = Math.max(0, Math.floor(Number(frame.totalDisplay) || 0));
  let displayStart = 0;
  let anchorDisplayIndex = 0;
  let before = 0;
  let after = 0;
  let requestLimit = 0;

  if (normalizedDirection === 'BACKWARD') {
    if (!frame.hasBackward) {
      return;
    }
    const currentStart = Math.max(0, Math.floor(Number(frame.displayStartIndex) || 0));
    requestLimit = Math.min(
      MARKET_BAR_FRAME_CONTINUATION_PREWARM_LIMIT,
      currentStart,
    );
    if (requestLimit <= 0) {
      return;
    }
    displayStart = currentStart - requestLimit;
    anchorDisplayIndex = currentStart - 1;
    before = requestLimit - 1;
  } else {
    if (!frame.hasForward) {
      return;
    }
    const currentEnd = Math.max(0, Math.floor(Number(frame.displayEndIndex) || 0));
    const remaining = Math.max(0, totalDisplay - currentEnd - 1);
    requestLimit = Math.min(
      MARKET_BAR_FRAME_CONTINUATION_PREWARM_LIMIT,
      remaining,
    );
    if (requestLimit <= 0) {
      return;
    }
    displayStart = currentEnd + 1;
    anchorDisplayIndex = displayStart;
    after = requestLimit - 1;
  }

  const prewarmKey = buildMarketBarFrameCacheKey({
    instrumentId,
    versionToken,
    displayPeriod,
    timeZone: frame.timeZone ?? null,
    displayStart,
    limit: requestLimit,
  });
  scheduleMarketPrewarmTask(`frame:${prewarmKey}`, async (context) => {
    await getBarsFrameByInstrumentId(instrumentId, displayStart, requestLimit, {
      displayPeriod,
      anchorDisplayIndex,
      direction: normalizedDirection,
      before,
      after,
      maxDisplayBars: requestLimit,
      skipContinuationPrewarm: true,
      signal: context.signal,
      canPublish: context.canPublish,
    });
    context.assertCanPublish();
  });
};

export const getBarsFrameByInstrumentId = async (
  instrumentId: string,
  offset = 0,
  limit = 1200,
  options?: MarketChartFrameOptions,
): Promise<MarketBarFrame> => {
  options?.signal?.throwIfAborted();
  const normalizedInstrumentId = String(instrumentId || '').trim();
  const instrument = getInstrumentById(normalizedInstrumentId);
  if (!instrument) {
    throw appError('INSTRUMENT_NOT_FOUND', { instrumentId: normalizedInstrumentId });
  }
  const totalRaw = await ensureInstrumentMarketBarsReady(instrument);
  options?.signal?.throwIfAborted();
  const currentInstrument = getInstrumentById(instrument.id) ?? instrument;
  const safeLimit = Math.max(
    1,
    Math.min(
      DESKTOP_API_LIMITS.marketFrameBarsMax,
      Math.floor(Number.isFinite(limit) ? limit : 1200),
    ),
  );
  const baseDisplayPeriod = resolveBaseDisplayPeriod(currentInstrument.base_timeframe, '1d');
  const displayPeriod = normalizeDisplayPeriod(options?.displayPeriod, baseDisplayPeriod);
  const direction = resolveFrameDirection(options?.direction);
  const safeMaxDisplayBars = Math.max(
    1,
    Math.min(
      DESKTOP_API_LIMITS.marketFrameBarsMax,
      Math.floor(
        Number.isFinite(options?.maxDisplayBars)
          ? Number(options?.maxDisplayBars)
          : safeLimit,
      ),
    ),
  );
  const timelineConfig = resolveInstrumentTimelineConfig(currentInstrument, totalRaw);
  const versionToken = timelineConfig.versionToken;
  const timelineInput = {
    instrumentId: currentInstrument.id,
    versionToken,
    baseTimeframe: toBaseTimeframe(currentInstrument.base_timeframe, '1d'),
    timeZone: resolveInstrumentTimeZone(currentInstrument),
    tradingCalendar: timelineConfig.tradingCalendar,
    signal: options?.signal,
  };
  const totalDisplay = await getMarketTimelineTotalDisplay({
    ...timelineInput,
    displayPeriod
  });
  const maxDisplayIndex = Math.max(0, totalDisplay - 1);
  const anchorByRaw = Number.isFinite(options?.anchorRawIndex)
    ? await getMarketDisplayBarContainingRawIndex({
        ...timelineInput,
        displayPeriod,
        rawIndex: Math.max(
          0,
          Math.min(Math.max(0, totalRaw - 1), Math.floor(Number(options?.anchorRawIndex))),
        ),
      })
    : null;
  const anchorDisplayIndex = Number.isFinite(options?.anchorDisplayIndex)
    ? Math.max(
        0,
        Math.min(maxDisplayIndex, Math.floor(Number(options?.anchorDisplayIndex))),
      )
    : anchorByRaw?.displayIndex ?? Math.max(
        0,
        Math.min(maxDisplayIndex, Math.floor(Number.isFinite(offset) ? offset : 0)),
      );
  const before = Number.isFinite(options?.before)
    ? Math.max(0, Math.floor(Number(options?.before)))
    : direction === 'BACKWARD'
      ? safeMaxDisplayBars - 1
      : 0;
  const after = Number.isFinite(options?.after)
    ? Math.max(0, Math.floor(Number(options?.after)))
    : direction === 'BACKWARD'
      ? 0
      : safeMaxDisplayBars - 1;
  const requestedStart = Math.max(0, anchorDisplayIndex - before);
  const requestedEnd = Math.min(maxDisplayIndex, anchorDisplayIndex + after);
  const requestedLimit =
    totalDisplay <= 0
      ? 0
      : Math.max(0, Math.min(safeMaxDisplayBars, requestedEnd - requestedStart + 1));
  const frameCacheKey = buildMarketBarFrameCacheKey({
    instrumentId: currentInstrument.id,
    versionToken,
    displayPeriod,
    timeZone: timelineInput.timeZone,
    displayStart: requestedStart,
    limit: requestedLimit,
  });
  const frame = await getOrLoadCachedMarketBarFrame(
    frameCacheKey,
    async () => {
      options?.signal?.throwIfAborted();
      const bars =
        requestedLimit <= 0
          ? []
          : await getMarketDisplayBarsByIndexRange({
              ...timelineInput,
              displayPeriod,
              offset: requestedStart,
              limit: requestedLimit,
              signal: options?.signal,
            });
      options?.signal?.throwIfAborted();
      return buildMarketBarFrame({
        instrument: currentInstrument,
        totalRaw,
        totalDisplay,
        limit: safeMaxDisplayBars,
        bars,
        displayPeriod,
        tradingCalendar: timelineConfig.tradingCalendar,
      });
    },
    {
      canPublish: () =>
        !options?.signal?.aborted && (options?.canPublish?.() ?? true),
      shareInFlight: !options?.signal,
    },
  );
  options?.signal?.throwIfAborted();
  prewarmInstrumentMarketTimelines(
    currentInstrument,
    totalRaw,
    displayPeriod,
  );
  if (!options?.skipContinuationPrewarm) {
    scheduleMarketBarFrameContinuationPrewarm(frame, direction);
  }
  return frame;
};

export const mapRawBarsToReplayArchiveRangeBars = (
  bars: OhlcvBar[],
  offset: number,
): ReplayArchiveRangeBar[] =>
  bars.map((bar, index) => {
    const rawIndex = Math.max(0, Math.floor(offset) + index);
    return {
      ...bar,
      displayIndex: rawIndex,
      startRawIndex: rawIndex,
      endRawIndex: rawIndex,
    };
  });

export const mapDisplayBarsToReplayArchiveRangeBars = (
  bars: MarketDisplayBar[],
): ReplayArchiveRangeBar[] =>
  bars.map((bar) => {
    const startRawIndex = Math.max(
      0,
      Math.floor(Number(bar.startRawIndex) || 0),
    );
    const endRawIndex = Math.max(
      startRawIndex,
      Math.floor(Number(bar.endRawIndex) || startRawIndex),
    );
    return {
      ts: new Date(
        Math.max(0, Math.floor(Number(bar.bucketStartMs) || 0)),
      ).toISOString(),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume),
      displayIndex: Math.max(0, Math.floor(Number(bar.displayIndex) || 0)),
      startRawIndex,
      endRawIndex,
    };
  });

export const getReplayArchiveBarsByInstrumentIdRawRange = async (
  instrumentId: string,
  displayPeriodInput: DisplayPeriodKey | string,
  rawStartIndexInput: number,
  rawEndIndexInput: number,
  limit = runtimeLimits.barsRangeLimitMax,
): Promise<ReplayArchiveBarsRangeResult> => {
  const normalizedInstrumentId = String(instrumentId || '').trim();
  const instrument = getInstrumentById(normalizedInstrumentId);
  if (!instrument) {
    throw appError('INSTRUMENT_NOT_FOUND', { instrumentId: normalizedInstrumentId });
  }
  const totalRaw = await ensureInstrumentMarketBarsReady(instrument);
  const currentInstrument = getInstrumentById(instrument.id) ?? instrument;
  const baseTimeframe = toBaseTimeframe(currentInstrument.base_timeframe, '1d');
  const displayPeriod = normalizeDisplayPeriod(displayPeriodInput, baseTimeframe);
  const timeZone = resolveInstrumentTimeZone(currentInstrument);
  const safeLimit = Math.max(
    1,
    Math.min(
      runtimeLimits.barsRangeLimitMax,
      Math.floor(Number.isFinite(limit) ? Number(limit) : runtimeLimits.barsRangeLimitMax),
    ),
  );

  if (totalRaw <= 0) {
    return {
      symbol: currentInstrument.symbol,
      timeframe: baseTimeframe,
      displayPeriod,
      timeZone,
      totalRaw: 0,
      totalDisplay: 0,
      offset: 0,
      bars: [],
    };
  }

  const rawStartIndex = Math.max(
    0,
    Math.min(
      totalRaw - 1,
      Math.floor(Number.isFinite(rawStartIndexInput) ? rawStartIndexInput : 0),
    ),
  );
  const rawEndIndex = Math.max(
    rawStartIndex,
    Math.min(
      totalRaw - 1,
      Math.floor(
        Number.isFinite(rawEndIndexInput) ? rawEndIndexInput : rawStartIndex,
      ),
    ),
  );
  const timelineConfig = resolveInstrumentTimelineConfig(currentInstrument, totalRaw);
  const timelineInput = {
    instrumentId: currentInstrument.id,
    versionToken: timelineConfig.versionToken,
    baseTimeframe,
    timeZone,
    tradingCalendar: timelineConfig.tradingCalendar,
  };

  if (displayPeriod === baseTimeframe) {
    const requestedRawCount = rawEndIndex - rawStartIndex + 1;
    if (requestedRawCount > safeLimit) {
      throw appError('BARS_RANGE_LIMIT_EXCEEDED', {
        requested: requestedRawCount,
        limit: safeLimit,
      });
    }
    const bars = await loadMarketBarsByInstrumentIdRange(
      currentInstrument.id,
      rawStartIndex,
      requestedRawCount,
    );
    return {
      symbol: currentInstrument.symbol,
      timeframe: baseTimeframe,
      displayPeriod,
      timeZone,
      totalRaw,
      totalDisplay: totalRaw,
      offset: rawStartIndex,
      bars: mapRawBarsToReplayArchiveRangeBars(bars, rawStartIndex),
    };
  }

  const totalDisplay = await getMarketTimelineTotalDisplay({
    ...timelineInput,
    displayPeriod,
  });
  const startDisplayBar = await getMarketDisplayBarContainingRawIndex({
    ...timelineInput,
    displayPeriod,
    rawIndex: rawStartIndex,
  });
  const endDisplayBar = await getMarketDisplayBarContainingRawIndex({
    ...timelineInput,
    displayPeriod,
    rawIndex: rawEndIndex,
  });
  if (!startDisplayBar || !endDisplayBar || totalDisplay <= 0) {
    return {
      symbol: currentInstrument.symbol,
      timeframe: baseTimeframe,
      displayPeriod,
      timeZone,
      totalRaw,
      totalDisplay,
      offset: 0,
      bars: [],
    };
  }
  const offset = Math.max(0, Math.floor(Number(startDisplayBar.displayIndex) || 0));
  const endDisplayIndex = Math.max(
    offset,
    Math.floor(Number(endDisplayBar.displayIndex) || offset),
  );
  const requestedDisplayCount = endDisplayIndex - offset + 1;
  if (requestedDisplayCount > safeLimit) {
    throw appError('BARS_RANGE_LIMIT_EXCEEDED', {
      requested: requestedDisplayCount,
      limit: safeLimit,
    });
  }
  const bars = await getMarketDisplayBarsByIndexRange({
    ...timelineInput,
    displayPeriod,
    offset,
    limit: requestedDisplayCount,
  });
  return {
    symbol: currentInstrument.symbol,
    timeframe: baseTimeframe,
    displayPeriod,
    timeZone,
    totalRaw,
    totalDisplay,
    offset,
    bars: mapDisplayBarsToReplayArchiveRangeBars(bars),
  };
};

export const prewarmInstrumentMarketTimelines = (
  instrument: InstrumentRow,
  totalRaw: number,
  displayPeriod?: DisplayPeriodKey,
): void => {
  const baseDisplayPeriod = resolveBaseDisplayPeriod(instrument.base_timeframe, '1d');
  const selectedDisplayPeriod = normalizeDisplayPeriod(displayPeriod, baseDisplayPeriod);
  const timelineConfig = resolveInstrumentTimelineConfig(instrument, totalRaw);
  const timelineInput = {
    instrumentId: instrument.id,
    versionToken: timelineConfig.versionToken,
    baseTimeframe: toBaseTimeframe(instrument.base_timeframe, '1d'),
    timeZone: resolveInstrumentTimeZone(instrument),
    tradingCalendar: timelineConfig.tradingCalendar,
  };
  const backgroundPeriods = HOT_MARKET_TIMELINE_PREWARM_PERIODS.filter(
    (period) => period !== selectedDisplayPeriod,
  );
  const periods = [selectedDisplayPeriod, ...backgroundPeriods];
  const prewarmKey = [
    timelineInput.instrumentId,
    timelineInput.versionToken,
    timelineInput.baseTimeframe,
    timelineInput.timeZone ?? '',
    periods.join(','),
  ].join('\u0000');
  scheduleMarketPrewarmTask(`timeline:${prewarmKey}`, async (context) => {
    await ensureMarketTimelinePeriodsReady(
      {
        ...timelineInput,
        signal: context.signal,
      },
      periods,
      { priority: 'bulk', signal: context.signal },
    );
    context.assertCanPublish();
  });
};
