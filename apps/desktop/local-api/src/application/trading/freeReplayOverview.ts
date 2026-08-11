// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';
import { appError } from '../../kernel/appError.js';
import {
  getMarketDisplayBarContainingRawIndex,
  getMarketDisplayBarsByIndexRange,
  getMarketTimelineTotalDisplay,
  type MarketDisplayBar,
} from '../ports/infrastructure/db/marketDatabase.js';
import {
  resolveEffectiveFreeReplayAdvancePeriod,
  type DisplayPeriodKey,
  type FreeReplayAdvancePeriod,
} from '@zinuto/shared/period';
import { DESKTOP_API_LIMITS } from '@zinuto/shared/input-limits';
import type { BaseTimeframe } from '@zinuto/shared/timeframe';
import type { InstrumentRow } from '../../domain/trading/types.js';
import type {
  FreeReplayStartPointOverviewBar,
  FreeReplayStartPointOverviewResult,
} from './marketFrameTypes.js';
import {
  ensureInstrumentMarketBarsReady,
  getInstrumentById,
  loadMarketBarsByInstrumentIdRange,
  resolveInstrumentSamplePoolId,
  resolveInstrumentTimelineConfig,
} from './marketFrameRuntime.js';
import {
  resolveInstrumentTimeZone,
  resolveRequestedFreeReplayAdvancePeriod,
  resolveStartPointOverviewDisplayPeriod,
  toBaseTimeframe,
} from './marketFrameSemantics.js';

export type DisplayOverviewRange = {
  sourceTimeframe: BaseTimeframe;
  minimumBaseTimeframe: FreeReplayAdvancePeriod;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  displayPeriod: DisplayPeriodKey;
  timeZone: string | null;
  trainingTotal: number;
  total: number;
  offset: number;
  bars: FreeReplayStartPointOverviewBar[];
};

export const mapRawBarsToOverviewBars = (
  bars: OhlcvBar[],
  offset: number,
): FreeReplayStartPointOverviewBar[] =>
  bars.map((bar, index) => ({
    ts: bar.ts,
    startTs: bar.ts,
    endTs: bar.ts,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    startRawIndex: offset + index,
    endRawIndex: offset + index,
    startTrainingIndex: offset + index,
    endTrainingIndex: offset + index,
  }));

export const mapDisplayBarsToOverviewBars = async (
  bars: MarketDisplayBar[],
  input: {
    timelineInput: {
      instrumentId: string;
      versionToken: string;
      baseTimeframe: BaseTimeframe;
      timeZone: string | null;
    };
    displayPeriod: DisplayPeriodKey;
    effectiveTimeframe: FreeReplayAdvancePeriod;
  },
): Promise<FreeReplayStartPointOverviewBar[]> => {
  const trainingIndexByRawIndex = new Map<number, number>();
  const resolveTrainingIndexForRawIndex = async (rawIndex: number): Promise<number> => {
    const safeRawIndex = Math.max(0, Math.floor(Number(rawIndex) || 0));
    if (input.effectiveTimeframe === input.timelineInput.baseTimeframe) {
      return safeRawIndex;
    }
    const cached = trainingIndexByRawIndex.get(safeRawIndex);
    if (cached !== undefined) {
      return cached;
    }
    const trainingBar = await getMarketDisplayBarContainingRawIndex({
      ...input.timelineInput,
      displayPeriod: input.effectiveTimeframe,
      rawIndex: safeRawIndex,
    });
    const resolvedIndex = Math.max(
      0,
      Math.floor(Number(trainingBar?.displayIndex) || 0),
    );
    trainingIndexByRawIndex.set(safeRawIndex, resolvedIndex);
    return resolvedIndex;
  };

  const output: FreeReplayStartPointOverviewBar[] = [];
  for (const bar of bars) {
    const startRawIndex = Math.max(
      0,
      Math.floor(Number(bar.startRawIndex) || 0),
    );
    const endRawIndex = Math.max(
      startRawIndex,
      Math.floor(Number(bar.endRawIndex) || startRawIndex),
    );
    const displayIndex = Math.max(0, Math.floor(Number(bar.displayIndex) || 0));
    const startTrainingIndex =
      input.displayPeriod === input.effectiveTimeframe
        ? displayIndex
        : await resolveTrainingIndexForRawIndex(startRawIndex);
    const endTrainingIndex =
      input.displayPeriod === input.effectiveTimeframe
        ? displayIndex
        : await resolveTrainingIndexForRawIndex(endRawIndex);
    output.push({
      ts: new Date(
        Math.max(0, Math.floor(Number(bar.bucketStartMs) || 0)),
      ).toISOString(),
      startTs: String(bar.startTs || ''),
      endTs: String(bar.endTs || ''),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume),
      startRawIndex,
      endRawIndex,
      startTrainingIndex,
      endTrainingIndex: Math.max(startTrainingIndex, endTrainingIndex),
    });
  }
  return output;
};

export const resolveTrainingTotal = async (input: {
  totalRaw: number;
  sourceTimeframe: BaseTimeframe;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  timelineInput: {
    instrumentId: string;
    versionToken: string;
    baseTimeframe: BaseTimeframe;
    timeZone: string | null;
  };
}): Promise<number> => {
  if (input.effectiveTimeframe === input.sourceTimeframe) {
    return input.totalRaw;
  }
  return getMarketTimelineTotalDisplay({
    ...input.timelineInput,
    displayPeriod: input.effectiveTimeframe,
  });
};

export const getDisplayOverviewRange = async (input: {
  instrument: InstrumentRow;
  minimumBaseTimeframe: FreeReplayAdvancePeriod;
  displayPeriod?: DisplayPeriodKey;
  offset: number;
  limit: number;
}): Promise<DisplayOverviewRange> => {
  const sourceTimeframe = toBaseTimeframe(
    input.instrument.base_timeframe,
    '1d',
  );
  const minimumBaseTimeframe = resolveEffectiveFreeReplayAdvancePeriod(
    sourceTimeframe,
    input.minimumBaseTimeframe,
  );
  const effectiveTimeframe = resolveEffectiveFreeReplayAdvancePeriod(
    sourceTimeframe,
    minimumBaseTimeframe,
  );
  const timeZone = resolveInstrumentTimeZone(input.instrument);
  const totalRaw = await ensureInstrumentMarketBarsReady(input.instrument);
  const safeOffset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const safeLimit = Math.max(1, Math.floor(Number(input.limit) || 1));
  const displayPeriod = resolveStartPointOverviewDisplayPeriod(
    sourceTimeframe,
    effectiveTimeframe,
    input.displayPeriod,
  );
  const timelineConfig = resolveInstrumentTimelineConfig(input.instrument, totalRaw);
  const versionToken = timelineConfig.versionToken;
  const timelineInput = {
    instrumentId: input.instrument.id,
    versionToken,
    baseTimeframe: sourceTimeframe,
    timeZone,
    tradingCalendar: timelineConfig.tradingCalendar,
  };
  const trainingTotal = await resolveTrainingTotal({
    totalRaw,
    sourceTimeframe,
    effectiveTimeframe,
    timelineInput,
  });

  if (displayPeriod === sourceTimeframe) {
    const rawBars =
      safeOffset >= totalRaw
        ? []
        : await loadMarketBarsByInstrumentIdRange(
            input.instrument.id,
            safeOffset,
            safeLimit,
          );
    return {
      sourceTimeframe,
      minimumBaseTimeframe,
      effectiveTimeframe,
      displayPeriod,
      timeZone,
      trainingTotal,
      total: totalRaw,
      offset: safeOffset,
      bars: mapRawBarsToOverviewBars(rawBars, safeOffset),
    };
  }

  const totalDisplay = await getMarketTimelineTotalDisplay({
    ...timelineInput,
    displayPeriod,
  });
  const displayBars =
    safeOffset >= totalDisplay
      ? []
      : await getMarketDisplayBarsByIndexRange({
          ...timelineInput,
          displayPeriod,
          offset: safeOffset,
          limit: Math.min(safeLimit, totalDisplay - safeOffset),
        });
  return {
    sourceTimeframe,
    minimumBaseTimeframe,
    effectiveTimeframe,
    displayPeriod,
    timeZone,
    trainingTotal,
    total: totalDisplay,
    offset: safeOffset,
    bars: await mapDisplayBarsToOverviewBars(displayBars, {
      timelineInput,
      displayPeriod,
      effectiveTimeframe,
    }),
  };
};

export const getDisplayOverviewRangeByRawRange = async (input: {
  instrument: InstrumentRow;
  minimumBaseTimeframe: FreeReplayAdvancePeriod;
  displayPeriod?: DisplayPeriodKey;
  rawStartIndex: number;
  rawEndIndex: number;
  limit: number;
}): Promise<DisplayOverviewRange> => {
  const sourceTimeframe = toBaseTimeframe(
    input.instrument.base_timeframe,
    '1d',
  );
  const minimumBaseTimeframe = resolveEffectiveFreeReplayAdvancePeriod(
    sourceTimeframe,
    input.minimumBaseTimeframe,
  );
  const effectiveTimeframe = resolveEffectiveFreeReplayAdvancePeriod(
    sourceTimeframe,
    minimumBaseTimeframe,
  );
  const timeZone = resolveInstrumentTimeZone(input.instrument);
  const totalRaw = await ensureInstrumentMarketBarsReady(input.instrument);
  const displayPeriod = resolveStartPointOverviewDisplayPeriod(
    sourceTimeframe,
    effectiveTimeframe,
    input.displayPeriod,
  );
  const timelineConfig = resolveInstrumentTimelineConfig(input.instrument, totalRaw);
  const versionToken = timelineConfig.versionToken;
  const timelineInput = {
    instrumentId: input.instrument.id,
    versionToken,
    baseTimeframe: sourceTimeframe,
    timeZone,
    tradingCalendar: timelineConfig.tradingCalendar,
  };
  const trainingTotal = await resolveTrainingTotal({
    totalRaw,
    sourceTimeframe,
    effectiveTimeframe,
    timelineInput,
  });
  if (totalRaw <= 0) {
    return {
      sourceTimeframe,
      minimumBaseTimeframe,
      effectiveTimeframe,
      displayPeriod,
      timeZone,
      trainingTotal,
      total: 0,
      offset: 0,
      bars: [],
    };
  }

  const rawStartIndex = Math.max(
    0,
    Math.min(
      totalRaw - 1,
      Math.floor(Number.isFinite(input.rawStartIndex) ? input.rawStartIndex : 0),
    ),
  );
  const rawEndIndex = Math.max(
    rawStartIndex,
    Math.min(
      totalRaw - 1,
      Math.floor(
        Number.isFinite(input.rawEndIndex) ? input.rawEndIndex : rawStartIndex,
      ),
    ),
  );
  const safeLimit = Math.max(
    1,
    Math.min(
      DESKTOP_API_LIMITS.startPointOverviewBarsMax,
      Math.floor(Number.isFinite(input.limit) ? input.limit : 1),
    ),
  );

  if (displayPeriod === sourceTimeframe) {
    const requestedRawCount = rawEndIndex - rawStartIndex + 1;
    if (requestedRawCount > safeLimit) {
      throw appError('BARS_RANGE_LIMIT_EXCEEDED', {
        requested: requestedRawCount,
        limit: safeLimit,
      });
    }
    const rawBars = await loadMarketBarsByInstrumentIdRange(
      input.instrument.id,
      rawStartIndex,
      rawEndIndex - rawStartIndex + 1,
    );
    return {
      sourceTimeframe,
      minimumBaseTimeframe,
      effectiveTimeframe,
      displayPeriod,
      timeZone,
      trainingTotal,
      total: totalRaw,
      offset: rawStartIndex,
      bars: mapRawBarsToOverviewBars(rawBars, rawStartIndex),
    };
  }

  const totalDisplay = await getMarketTimelineTotalDisplay({
    ...timelineInput,
    displayPeriod,
  });
  const startBar = await getMarketDisplayBarContainingRawIndex({
    ...timelineInput,
    displayPeriod,
    rawIndex: rawStartIndex,
  });
  const endBar = await getMarketDisplayBarContainingRawIndex({
    ...timelineInput,
    displayPeriod,
    rawIndex: rawEndIndex,
  });
  if (!startBar || !endBar) {
    return {
      sourceTimeframe,
      minimumBaseTimeframe,
      effectiveTimeframe,
      displayPeriod,
      timeZone,
      trainingTotal,
      total: totalDisplay,
      offset: 0,
      bars: [],
    };
  }
  const offset = Math.max(0, Math.floor(startBar.displayIndex));
  const endDisplayIndex = Math.max(offset, Math.floor(endBar.displayIndex));
  const requestedDisplayCount = endDisplayIndex - offset + 1;
  if (requestedDisplayCount > safeLimit) {
    throw appError('BARS_RANGE_LIMIT_EXCEEDED', {
      requested: requestedDisplayCount,
      limit: safeLimit,
    });
  }
  const displayBars = await getMarketDisplayBarsByIndexRange({
    ...timelineInput,
    displayPeriod,
    offset,
    limit: endDisplayIndex - offset + 1,
  });
  return {
    sourceTimeframe,
    minimumBaseTimeframe,
    effectiveTimeframe,
    displayPeriod,
    timeZone,
    trainingTotal,
    total: totalDisplay,
    offset,
    bars: await mapDisplayBarsToOverviewBars(displayBars, {
      timelineInput,
      displayPeriod,
      effectiveTimeframe,
    }),
  };
};

export const getFreeReplayStartPointOverview = async (
  instrumentId: string,
  minimumBaseTimeframe: FreeReplayAdvancePeriod = '1d',
  offset = 0,
  limit = 5000,
  options?: {
    rawStartIndex?: number;
    rawEndIndex?: number;
    displayPeriod?: DisplayPeriodKey;
  },
): Promise<FreeReplayStartPointOverviewResult> => {
  const normalizedInstrumentId = String(instrumentId || '').trim();
  const instrument = getInstrumentById(normalizedInstrumentId);
  if (!instrument) {
    throw appError('INSTRUMENT_NOT_FOUND', {
      instrumentId: normalizedInstrumentId,
    });
  }
  const normalizedSourceTimeframe = toBaseTimeframe(instrument.base_timeframe, '1d');

  const safeOffset = Math.max(0, Math.floor(Number.isFinite(offset) ? offset : 0));
  const safeLimit = Math.max(
    1,
    Math.min(
      DESKTOP_API_LIMITS.startPointOverviewBarsMax,
      Math.floor(Number.isFinite(limit) ? limit : 5000),
    ),
  );
  const resolvedMinimumBaseTimeframe = resolveRequestedFreeReplayAdvancePeriod(
    normalizedSourceTimeframe,
    minimumBaseTimeframe,
  );
  const hasRawRange =
    Number.isFinite(options?.rawStartIndex) &&
    Number.isFinite(options?.rawEndIndex);
  const overview = hasRawRange
    ? await getDisplayOverviewRangeByRawRange({
        instrument,
        minimumBaseTimeframe: resolvedMinimumBaseTimeframe,
        displayPeriod: options?.displayPeriod,
        rawStartIndex: Number(options?.rawStartIndex),
        rawEndIndex: Number(options?.rawEndIndex),
        limit: safeLimit,
      })
    : await getDisplayOverviewRange({
        instrument,
        minimumBaseTimeframe: resolvedMinimumBaseTimeframe,
        displayPeriod: options?.displayPeriod,
        offset: safeOffset,
        limit: safeLimit,
      });
  const bars = overview.bars.map(
    (item) => ({
      ts: item.ts,
      startTs: item.startTs,
      endTs: item.endTs,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
      startRawIndex: item.startRawIndex,
      endRawIndex: item.endRawIndex,
      startTrainingIndex: item.startTrainingIndex,
      endTrainingIndex: item.endTrainingIndex,
    }),
  );

  return {
    samplePoolId: resolveInstrumentSamplePoolId(instrument),
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    sourceTimeframe: overview.sourceTimeframe,
    minimumBaseTimeframe: overview.minimumBaseTimeframe,
    effectiveTimeframe: overview.effectiveTimeframe,
    displayPeriod: overview.displayPeriod,
    timeZone: overview.timeZone,
    trainingTotal: overview.trainingTotal,
    total: overview.total,
    offset: overview.offset,
    limit: safeLimit,
    bars,
  };
};
