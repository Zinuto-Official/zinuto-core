// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import {
  FREE_REPLAY_ADVANCE_PERIODS,
  isFreeReplayAdvancePeriodAllowedForSource,
  normalizeFreeReplayAdvancePeriod,
  resolveEffectiveFreeReplayAdvancePeriod,
  type DisplayPeriodKey,
  type FreeReplayAdvancePeriod,
} from '@zinuto/shared/period';
import { normalizeBaseTimeframe, type BaseTimeframe } from '@zinuto/shared/timeframe';
import type { InstrumentRow } from '../../domain/trading/types.js';
import type { MarketChartDirection } from './marketFrameTypes.js';

export const toBaseTimeframe = (
  value: unknown,
  fallback: BaseTimeframe = '1d',
): BaseTimeframe => normalizeBaseTimeframe(value) ?? fallback;

export const resolveRequestedFreeReplayAdvancePeriod = (
  sourceTimeframe: BaseTimeframe,
  requestedMinimumBaseTimeframe: unknown,
): FreeReplayAdvancePeriod => {
  const normalizedRequestedMinimumBaseTimeframe = String(
    requestedMinimumBaseTimeframe ?? '',
  ).trim().toLowerCase();
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

export const DISPLAY_PERIODS = new Set<DisplayPeriodKey>([
  '1m',
  '5m',
  '1h',
  '1d',
  '1w',
  '1month',
  '1year',
]);

export const DISPLAY_PERIOD_RANK = new Map<DisplayPeriodKey, number>(
  FREE_REPLAY_ADVANCE_PERIODS.map((period, index) => [period, index]),
);

export const compareDisplayPeriod = (
  left: DisplayPeriodKey,
  right: DisplayPeriodKey,
): number =>
  (DISPLAY_PERIOD_RANK.get(left) ?? 0) - (DISPLAY_PERIOD_RANK.get(right) ?? 0);

export const normalizeDisplayPeriod = (
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

export const resolveStartPointOverviewDisplayPeriod = (
  sourceTimeframe: BaseTimeframe,
  effectiveTimeframe: FreeReplayAdvancePeriod,
  requestedDisplayPeriod: unknown,
): DisplayPeriodKey => {
  const displayPeriod = normalizeDisplayPeriod(
    requestedDisplayPeriod,
    effectiveTimeframe,
  );
  if (
    compareDisplayPeriod(displayPeriod, sourceTimeframe) < 0 ||
    compareDisplayPeriod(displayPeriod, effectiveTimeframe) < 0
  ) {
    throw appError('INVALID_PARAMS', {
      sourceTimeframe,
      effectiveTimeframe,
      displayPeriod,
    });
  }
  return displayPeriod;
};

export const resolveBaseDisplayPeriod = (
  value: unknown,
  fallback: BaseTimeframe = '1d',
): DisplayPeriodKey => toBaseTimeframe(value, fallback);

export const resolveFrameDirection = (value: unknown): MarketChartDirection =>
  String(value ?? '').trim().toUpperCase() === 'BACKWARD'
    ? 'BACKWARD'
    : 'FORWARD';

export const resolveNonNegativeInt = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.floor(fallback));
  }
  return Math.max(0, Math.floor(numeric));
};

export const resolveInstrumentTimeZone = (
  instrument: InstrumentRow | undefined,
): string | null =>
  typeof instrument?.time_zone === 'string' && instrument.time_zone.trim()
    ? instrument.time_zone
    : null;
