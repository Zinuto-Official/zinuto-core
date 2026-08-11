// SPDX-License-Identifier: GPL-3.0-only

import {
  isFreeReplayAdvancePeriodAllowedForSource,
  normalizeFreeReplayAdvancePeriod,
  resolveEffectiveFreeReplayAdvancePeriod,
  type DisplayPeriodKey,
  type FreeReplayAdvancePeriod,
} from '@zinuto/shared/period';
import {
  normalizeBaseTimeframe,
  type BaseTimeframe,
} from '@zinuto/shared/timeframe';
import type { TradingCalendarConfig } from '@zinuto/shared/tradingCalendar';
import type { InstrumentRow, SessionRow } from '../../domain/trading/types.js';

type AppErrorFactory = (
  code: string,
  args?: Record<string, string | number | boolean | null>,
) => Error;

type DisplayBucket = {
  displayIndex: number;
  startRawIndex: number;
  endRawIndex: number;
  open: number;
  close: number;
};

export type SessionActionAdvanceState = {
  displayPeriod: DisplayPeriodKey;
  cursorRawIndex: number;
  displayIndex: number | null;
  displayStartRawIndex: number | null;
  displayEndRawIndex: number | null;
  nextDisplayIndex: number | null;
};

export type SessionActionRuntimeContext = {
  action: 'STEP' | 'BUY' | 'SELL' | 'UNDO';
  displayPeriod: DisplayPeriodKey;
  previousCursorRawIndex: number;
  previousDisplayIndex: number | null;
  previousDisplayStartRawIndex: number | null;
  previousDisplayEndRawIndex: number | null;
  advanceState?: SessionActionAdvanceState;
};

export type SessionAdvancePlan = {
  totalRaw: number;
  displayPeriod: DisplayPeriodKey;
  currentDisplayIndex: number | null;
  currentDisplayEndRawIndex: number | null;
  nextDisplayIndex: number | null;
  nextOpenRawIndex: number | null;
  stepTargetRawIndex: number;
  hasFutureBars: boolean;
  currentBucket?: DisplayBucket;
  nextBucket?: DisplayBucket | null;
};

type CreateSessionTimelinePlannerDeps = {
  appError: AppErrorFactory;
  getInstrumentById: (id: string) => InstrumentRow | undefined;
  getBarCount: (instrumentId: string) => Promise<number>;
  getDisplayBarContainingRawIndex: (input: {
    instrumentId: string;
    versionToken: string;
    baseTimeframe: string;
    timeZone?: string | null;
    tradingCalendar?: TradingCalendarConfig | null;
    displayPeriod: DisplayPeriodKey;
    rawIndex: number;
  }) => Promise<DisplayBucket | null>;
  getDisplayBarByDisplayIndex: (input: {
    instrumentId: string;
    versionToken: string;
    baseTimeframe: string;
    timeZone?: string | null;
    tradingCalendar?: TradingCalendarConfig | null;
    displayPeriod: DisplayPeriodKey;
    displayIndex: number;
  }) => Promise<DisplayBucket | null>;
  resolveInstrumentTimelineConfig?: (
    instrument: InstrumentRow,
    totalRaw: number,
  ) => {
    versionToken: string;
    tradingCalendar: TradingCalendarConfig | null;
  };
};

const DISPLAY_PERIODS = new Set<DisplayPeriodKey>([
  '1m',
  '5m',
  '1h',
  '1d',
  '1w',
  '1month',
  '1year',
]);

const normalizeSamplePoolId = (value: unknown): string =>
  String(value ?? '').trim();

export const toBaseTimeframe = (
  value: unknown,
  fallback: BaseTimeframe = '1d',
): BaseTimeframe => normalizeBaseTimeframe(value) ?? fallback;

export const createSessionTimelinePlanner = ({
  appError,
  getInstrumentById,
  getBarCount,
  getDisplayBarContainingRawIndex,
  getDisplayBarByDisplayIndex,
  resolveInstrumentTimelineConfig,
}: CreateSessionTimelinePlannerDeps) => {
  const resolveRequestedFreeReplayAdvancePeriod = (
    sourceTimeframe: BaseTimeframe,
    requestedMinimumBaseTimeframe: unknown,
  ): FreeReplayAdvancePeriod => {
    const normalizedRequestedMinimumBaseTimeframe = String(
      requestedMinimumBaseTimeframe ?? '',
    )
      .trim()
      .toLowerCase();
    const minimumBaseTimeframe = normalizedRequestedMinimumBaseTimeframe
      ? normalizeFreeReplayAdvancePeriod(
          normalizedRequestedMinimumBaseTimeframe,
          sourceTimeframe,
        )
      : sourceTimeframe;
    if (
      normalizedRequestedMinimumBaseTimeframe &&
      minimumBaseTimeframe !== normalizedRequestedMinimumBaseTimeframe
    ) {
      throw appError('INVALID_PARAMS', {
        sourceTimeframe,
        minimumBaseTimeframe: normalizedRequestedMinimumBaseTimeframe,
      });
    }
    if (
      !isFreeReplayAdvancePeriodAllowedForSource(
        sourceTimeframe,
        minimumBaseTimeframe,
      )
    ) {
      throw appError('INVALID_PARAMS', {
        sourceTimeframe,
        minimumBaseTimeframe,
      });
    }
    return resolveEffectiveFreeReplayAdvancePeriod(
      sourceTimeframe,
      minimumBaseTimeframe,
    );
  };

  const normalizeDisplayPeriod = (
    value: unknown,
    fallback: DisplayPeriodKey,
  ): DisplayPeriodKey => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (DISPLAY_PERIODS.has(normalized as DisplayPeriodKey)) {
      return normalized as DisplayPeriodKey;
    }
    throw appError('INVALID_PARAMS', { displayPeriod: normalized });
  };

  const resolveSessionMarketVersionToken = async (
    session: SessionRow,
  ): Promise<{
    instrument: InstrumentRow | undefined;
    totalRaw: number;
    versionToken: string;
    baseTimeframe: string;
    timeZone: string | null;
    tradingCalendar: TradingCalendarConfig | null;
  }> => {
    const instrument = getInstrumentById(session.instrument_id);
    const totalRaw = await getBarCount(session.instrument_id);
    const baseTimeframe =
      String(instrument?.base_timeframe || session.timeframe || '1d')
        .trim()
        .toLowerCase() || '1d';
    const token = String(instrument?.bars_version_token ?? '').trim();
    const timelineConfig =
      instrument && resolveInstrumentTimelineConfig
        ? resolveInstrumentTimelineConfig(instrument, totalRaw)
        : null;
    return {
      instrument,
      totalRaw,
      versionToken:
        timelineConfig?.versionToken ||
        token ||
        [
          'market-frame',
          String(session.instrument_id || '').trim(),
          baseTimeframe,
          Math.max(0, Math.floor(Number(totalRaw) || 0)),
        ].join(':'),
      baseTimeframe,
      timeZone:
        typeof instrument?.time_zone === 'string' && instrument.time_zone.trim()
          ? instrument.time_zone
          : null,
      tradingCalendar: timelineConfig?.tradingCalendar ?? null,
    };
  };

  const resolveInstrumentMarketTimeline = (
    instrument: InstrumentRow,
    totalRaw: number,
    fallbackTimeframe: BaseTimeframe,
  ): {
    versionToken: string;
    baseTimeframe: string;
    timeZone: string | null;
    tradingCalendar: TradingCalendarConfig | null;
  } => {
    const baseTimeframe =
      String(instrument.base_timeframe || fallbackTimeframe || '1d')
        .trim()
        .toLowerCase() || '1d';
    const token = String(instrument.bars_version_token ?? '').trim();
    const timelineConfig = resolveInstrumentTimelineConfig
      ? resolveInstrumentTimelineConfig(instrument, totalRaw)
      : null;
    return {
      versionToken:
        timelineConfig?.versionToken ||
        token ||
        [
          'market-frame',
          String(instrument.id || '').trim(),
          baseTimeframe,
          Math.max(0, Math.floor(Number(totalRaw) || 0)),
        ].join(':'),
      baseTimeframe,
      timeZone:
        typeof instrument.time_zone === 'string' && instrument.time_zone.trim()
          ? instrument.time_zone
          : null,
      tradingCalendar: timelineConfig?.tradingCalendar ?? null,
    };
  };

  const resolveReplayableInitialCursorIndex = async ({
    instrument,
    sourceTimeframe,
    minimumBaseTimeframe,
    barCount,
    anchorIndex,
  }: {
    instrument: InstrumentRow;
    sourceTimeframe: BaseTimeframe;
    minimumBaseTimeframe: FreeReplayAdvancePeriod;
    barCount: number;
    anchorIndex?: number;
  }): Promise<number> => {
    const maxIndex = Math.max(0, barCount - 1);
    const maxCursorIndex = Math.max(0, maxIndex - 1);
    const requestedAnchor = Number.isFinite(anchorIndex)
      ? Math.floor(Number(anchorIndex))
      : Number.NaN;
    const hasManualAnchor = Number.isFinite(requestedAnchor);
    const initialCursor = hasManualAnchor
      ? Math.max(0, Math.min(maxCursorIndex, requestedAnchor))
      : (() => {
          const minAnchorByRatio = Math.max(
            0,
            Math.min(maxCursorIndex, Math.ceil(maxCursorIndex * 0.1)),
          );
          const maxAnchorByRatio = Math.max(
            minAnchorByRatio,
            Math.min(maxCursorIndex, Math.floor(maxCursorIndex * 0.85)),
          );
          const span = Math.max(1, maxAnchorByRatio - minAnchorByRatio + 1);
          return minAnchorByRatio + Math.floor(Math.random() * span);
        })();
    const displayPeriod = resolveEffectiveFreeReplayAdvancePeriod(
      sourceTimeframe,
      minimumBaseTimeframe,
    );
    const timeline = resolveInstrumentMarketTimeline(
      instrument,
      barCount,
      sourceTimeframe,
    );
    const currentBucket = await getDisplayBarContainingRawIndex({
      instrumentId: instrument.id,
      versionToken: timeline.versionToken,
      baseTimeframe: timeline.baseTimeframe,
      timeZone: timeline.timeZone,
      tradingCalendar: timeline.tradingCalendar,
      displayPeriod,
      rawIndex: initialCursor,
    });
    if (!currentBucket) {
      throw appError('INSTRUMENT_NOT_ENOUGH_BARS', {
        instrumentId: instrument.id,
        barCount,
        minimumBars: 2,
        minimumBaseTimeframe,
      });
    }
    const nextBucket = await getDisplayBarByDisplayIndex({
      instrumentId: instrument.id,
      versionToken: timeline.versionToken,
      baseTimeframe: timeline.baseTimeframe,
      timeZone: timeline.timeZone,
      tradingCalendar: timeline.tradingCalendar,
      displayPeriod,
      displayIndex: currentBucket.displayIndex + 1,
    });
    if (nextBucket) {
      return initialCursor;
    }
    if (hasManualAnchor) {
      throw appError('INVALID_PARAMS', {
        anchorIndex: requestedAnchor,
        minimumBaseTimeframe,
        reason: 'NO_FUTURE_DISPLAY_BARS',
      });
    }
    if (currentBucket.displayIndex <= 0) {
      throw appError('INSTRUMENT_NOT_ENOUGH_BARS', {
        instrumentId: instrument.id,
        barCount,
        minimumBars: 2,
        minimumBaseTimeframe,
      });
    }
    const previousBucket = await getDisplayBarByDisplayIndex({
      instrumentId: instrument.id,
      versionToken: timeline.versionToken,
      baseTimeframe: timeline.baseTimeframe,
      timeZone: timeline.timeZone,
      tradingCalendar: timeline.tradingCalendar,
      displayPeriod,
      displayIndex: currentBucket.displayIndex - 1,
    });
    if (!previousBucket) {
      throw appError('INSTRUMENT_NOT_ENOUGH_BARS', {
        instrumentId: instrument.id,
        barCount,
        minimumBars: 2,
        minimumBaseTimeframe,
      });
    }
    return Math.max(0, Math.min(maxCursorIndex, previousBucket.endRawIndex));
  };

  const toClientSession = (session: SessionRow, instrument: InstrumentRow) => ({
    ...session,
    instrumentId: session.instrument_id,
    samplePoolId: normalizeSamplePoolId(session.sample_pool_id),
    sourceTimeframe: toBaseTimeframe(session.timeframe, '1d'),
    minimumBaseTimeframe: normalizeFreeReplayAdvancePeriod(
      session.minimum_base_timeframe,
      toBaseTimeframe(session.timeframe, '1d'),
    ),
    symbol: instrument.symbol,
    instrumentName: instrument.name,
  });

  const resolveSessionAdvancePlan = async (
    session: SessionRow,
    displayPeriodInput?: DisplayPeriodKey | string,
  ): Promise<SessionAdvancePlan> => {
    const timeline = await resolveSessionMarketVersionToken(session);
    const sourceTimeframe = toBaseTimeframe(session.timeframe, '1d');
    const displayPeriod = normalizeDisplayPeriod(
      displayPeriodInput,
      resolveEffectiveFreeReplayAdvancePeriod(
        sourceTimeframe,
        normalizeFreeReplayAdvancePeriod(
          session.minimum_base_timeframe,
          sourceTimeframe,
        ),
      ),
    );
    const currentBucket = await getDisplayBarContainingRawIndex({
      instrumentId: session.instrument_id,
      versionToken: timeline.versionToken,
      baseTimeframe: timeline.baseTimeframe,
      timeZone: timeline.timeZone,
      tradingCalendar: timeline.tradingCalendar,
      displayPeriod,
      rawIndex: Math.max(0, Math.floor(Number(session.cursor_index) || 0)),
    });
    if (!currentBucket) {
      return {
        totalRaw: timeline.totalRaw,
        displayPeriod,
        currentDisplayIndex: null,
        currentDisplayEndRawIndex: null,
        nextDisplayIndex: null,
        nextOpenRawIndex: null,
        stepTargetRawIndex: Math.max(
          0,
          Math.floor(Number(session.cursor_index) || 0),
        ),
        hasFutureBars: false,
      };
    }
    const cursorIndex = Math.max(
      0,
      Math.floor(Number(session.cursor_index) || 0),
    );
    const nextDisplayIndex =
      cursorIndex < currentBucket.endRawIndex
        ? currentBucket.displayIndex + 1
        : currentBucket.displayIndex + 1;
    const nextBucket = await getDisplayBarByDisplayIndex({
      instrumentId: session.instrument_id,
      versionToken: timeline.versionToken,
      baseTimeframe: timeline.baseTimeframe,
      timeZone: timeline.timeZone,
      tradingCalendar: timeline.tradingCalendar,
      displayPeriod,
      displayIndex: nextDisplayIndex,
    });
    const stepTargetRawIndex =
      cursorIndex < currentBucket.endRawIndex
        ? currentBucket.endRawIndex
        : nextBucket?.endRawIndex ?? currentBucket.endRawIndex;
    return {
      totalRaw: timeline.totalRaw,
      displayPeriod,
      currentDisplayIndex: currentBucket.displayIndex,
      currentDisplayEndRawIndex: currentBucket.endRawIndex,
      nextDisplayIndex: nextBucket?.displayIndex ?? null,
      nextOpenRawIndex: nextBucket?.startRawIndex ?? null,
      stepTargetRawIndex,
      hasFutureBars: stepTargetRawIndex > cursorIndex,
      currentBucket,
      nextBucket,
    };
  };

  const buildRuntimeContextFromAdvancePlan = (
    action: SessionActionRuntimeContext['action'],
    session: SessionRow,
    advancePlan: SessionAdvancePlan,
    advanceState?: SessionActionAdvanceState,
  ): SessionActionRuntimeContext => ({
    action,
    displayPeriod: advancePlan.displayPeriod,
    previousCursorRawIndex: Math.max(
      0,
      Math.floor(Number(session.cursor_index) || 0),
    ),
    previousDisplayIndex: advancePlan.currentDisplayIndex,
    previousDisplayStartRawIndex: advancePlan.currentBucket
      ? advancePlan.currentBucket.startRawIndex
      : null,
    previousDisplayEndRawIndex: advancePlan.currentDisplayEndRawIndex,
    ...(advanceState ? { advanceState } : {}),
  });

  const toAdvanceStateFromBucket = (
    displayPeriod: DisplayPeriodKey,
    cursorRawIndex: number,
    bucket: {
      displayIndex: number;
      startRawIndex: number;
      endRawIndex: number;
    } | null,
    nextDisplayIndex: number | null,
  ): SessionActionAdvanceState => ({
    displayPeriod,
    cursorRawIndex,
    displayIndex: bucket?.displayIndex ?? null,
    displayStartRawIndex: bucket?.startRawIndex ?? null,
    displayEndRawIndex: bucket?.endRawIndex ?? null,
    nextDisplayIndex,
  });

  const resolveKnownStepAdvanceState = async (
    session: SessionRow,
    advancePlan: SessionAdvancePlan,
    cursorRawIndex: number,
  ): Promise<SessionActionAdvanceState | undefined> => {
    const normalizedCursorRawIndex = Math.max(
      0,
      Math.floor(Number(cursorRawIndex) || 0),
    );
    const currentBucket = advancePlan.currentBucket ?? null;
    const nextBucket = advancePlan.nextBucket ?? null;

    if (
      currentBucket &&
      normalizedCursorRawIndex >= currentBucket.startRawIndex &&
      normalizedCursorRawIndex <= currentBucket.endRawIndex
    ) {
      return toAdvanceStateFromBucket(
        advancePlan.displayPeriod,
        normalizedCursorRawIndex,
        currentBucket,
        advancePlan.nextDisplayIndex,
      );
    }

    if (
      nextBucket &&
      normalizedCursorRawIndex >= nextBucket.startRawIndex &&
      normalizedCursorRawIndex <= nextBucket.endRawIndex
    ) {
      const timeline = await resolveSessionMarketVersionToken(session);
      const followingBucket = await getDisplayBarByDisplayIndex({
        instrumentId: session.instrument_id,
        versionToken: timeline.versionToken,
        baseTimeframe: timeline.baseTimeframe,
        timeZone: timeline.timeZone,
        tradingCalendar: timeline.tradingCalendar,
        displayPeriod: advancePlan.displayPeriod,
        displayIndex: nextBucket.displayIndex + 1,
      });
      return toAdvanceStateFromBucket(
        advancePlan.displayPeriod,
        normalizedCursorRawIndex,
        nextBucket,
        followingBucket?.displayIndex ?? null,
      );
    }

    return undefined;
  };

  return {
    toBaseTimeframe,
    resolveRequestedFreeReplayAdvancePeriod,
    normalizeDisplayPeriod,
    resolveReplayableInitialCursorIndex,
    toClientSession,
    resolveSessionAdvancePlan,
    buildRuntimeContextFromAdvancePlan,
    toAdvanceStateFromBucket,
    resolveKnownStepAdvanceState,
  };
};
