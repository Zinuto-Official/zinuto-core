// SPDX-License-Identifier: GPL-3.0-only

import type { MarketSymbolDiagnosticsSnapshot } from '../ports/infrastructure/db/marketDatabase.js';
import type { TradingCalendarConfig } from '@zinuto/shared/tradingCalendar';
import {
  buildLocalDataSourceDiagnostics,
  buildLocalDataSourceSymbolDiagnosticsFromSnapshot,
  createEmptyLocalDataSourceDiagnostics,
  LOCAL_DATA_SOURCE_DIAGNOSTIC_RULES_VERSION,
  type LocalDataSourceDiagnosticsInstrument,
  type LocalDataSourceDiagnosticsQuery,
} from './sourceDiagnostics.js';
import {
  normalizeLocalDataSourceDiagnosticProfile,
} from './diagnosticProfile.js';
import type {
  LocalDataSourceDiagnosticProfile,
  LocalDataSourceDiagnostics,
  LocalDataSourceSymbolDiagnostics,
} from './types.js';

type BaseTimeframe = LocalDataSourceDiagnostics['baseTimeframe'];

export type LocalDataSourceDiagnosticsCacheBuildResult = {
  sourceDiagnostics: LocalDataSourceDiagnostics;
  symbolDiagnostics: Array<{
    instrumentId: string;
    symbol: string;
    diagnostics: LocalDataSourceSymbolDiagnostics;
  }>;
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const parseJsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    return toRecord(JSON.parse(value));
  } catch {
    return null;
  }
};

const hasValidDiagnosticsEnvelope = (
  record: Record<string, unknown>,
): boolean =>
  (record.status === 'READY' ||
    record.status === 'BUILDING' ||
    record.status === 'FAILED') &&
  toRecord(record.profile) !== null &&
  Array.isArray(record.items);

export const parseCachedLocalDataSourceDiagnostics = (
  diagnosticsJson: unknown,
  sourceId: string,
  baseTimeframe: BaseTimeframe,
): LocalDataSourceDiagnostics | null => {
  const record = parseJsonRecord(diagnosticsJson);
  if (!record || !hasValidDiagnosticsEnvelope(record)) {
    return null;
  }
  if (record.sourceId !== sourceId || record.baseTimeframe !== baseTimeframe) {
    return null;
  }
  if (
    record.diagnosticRulesVersion !==
    LOCAL_DATA_SOURCE_DIAGNOSTIC_RULES_VERSION
  ) {
    return null;
  }
  return record as LocalDataSourceDiagnostics;
};

export const parseCachedLocalDataSourceSymbolDiagnostics = (
  diagnosticsJson: unknown,
  symbol: string,
  baseTimeframe: BaseTimeframe,
): LocalDataSourceSymbolDiagnostics | null => {
  const record = parseJsonRecord(diagnosticsJson);
  if (!record || !hasValidDiagnosticsEnvelope(record)) {
    return null;
  }
  if (record.symbol !== symbol || record.baseTimeframe !== baseTimeframe) {
    return null;
  }
  if (
    record.diagnosticRulesVersion !==
    LOCAL_DATA_SOURCE_DIAGNOSTIC_RULES_VERSION
  ) {
    return null;
  }
  return record as LocalDataSourceSymbolDiagnostics;
};

export const buildLocalDataSourceDiagnosticsCache = async ({
  sourceId,
  baseTimeframe,
  profile,
  instruments,
  generatedAt,
  timeZone,
  tradingCalendar,
  loadSnapshot,
  query,
  signal,
}: {
  sourceId: string;
  baseTimeframe: BaseTimeframe;
  profile: LocalDataSourceDiagnosticProfile;
  instruments: LocalDataSourceDiagnosticsInstrument[];
  generatedAt: string;
  timeZone?: string | null;
  tradingCalendar?: TradingCalendarConfig | null;
  loadSnapshot: (
    instrumentId: string,
    baseTimeframe: BaseTimeframe,
    options?: {
      timeZone?: string | null;
      tradingCalendar?: TradingCalendarConfig | null;
      signal?: AbortSignal;
    },
  ) => Promise<MarketSymbolDiagnosticsSnapshot>;
  query?: LocalDataSourceDiagnosticsQuery;
  signal?: AbortSignal;
}): Promise<LocalDataSourceDiagnosticsCacheBuildResult> => {
  const throwIfAborted = (): void => {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('SOURCE_DIAGNOSTICS_ABORTED');
    }
  };
  throwIfAborted();
  const normalizedProfile = normalizeLocalDataSourceDiagnosticProfile(profile);
  const normalizedInstruments = instruments
    .map((instrument) => ({
      instrumentId: String(instrument.instrumentId || '').trim(),
      symbol: String(instrument.symbol || '').trim().toUpperCase(),
      timeStartTs: instrument.timeStartTs ?? null,
      timeEndTs: instrument.timeEndTs ?? null,
    }))
    .filter((instrument) => instrument.instrumentId && instrument.symbol);

  if (!normalizedInstruments.length) {
    return {
      sourceDiagnostics: createEmptyLocalDataSourceDiagnostics(
        sourceId,
        baseTimeframe,
        normalizedProfile,
        'READY',
        0,
        generatedAt,
      ),
      symbolDiagnostics: [],
    };
  }

  const snapshotsByInstrumentId = new Map<
    string,
    MarketSymbolDiagnosticsSnapshot
  >();
  const symbolDiagnostics: LocalDataSourceDiagnosticsCacheBuildResult['symbolDiagnostics'] =
    [];

  for (const instrument of normalizedInstruments) {
    throwIfAborted();
    // Keep diagnostic scans sequential so imports and UI reads do not compete
    // with a burst of market_bars window queries.
    // eslint-disable-next-line no-await-in-loop
    let snapshot: MarketSymbolDiagnosticsSnapshot;
    try {
      snapshot = await loadSnapshot(instrument.instrumentId, baseTimeframe, {
        timeZone,
        tradingCalendar,
        signal,
      });
    } catch (error) {
      throwIfAborted();
      throw error;
    }
    throwIfAborted();
    snapshotsByInstrumentId.set(instrument.instrumentId, snapshot);
    symbolDiagnostics.push({
      instrumentId: instrument.instrumentId,
      symbol: instrument.symbol,
      diagnostics: buildLocalDataSourceSymbolDiagnosticsFromSnapshot({
        instrumentId: instrument.instrumentId,
        symbol: instrument.symbol,
        baseTimeframe,
        profile: normalizedProfile,
        snapshot,
        generatedAt,
      }),
    });
  }

  throwIfAborted();
  return {
    sourceDiagnostics: buildLocalDataSourceDiagnostics({
      sourceId,
      baseTimeframe,
      profile: normalizedProfile,
      instruments: normalizedInstruments,
      snapshotsByInstrumentId,
      generatedAt,
      query,
    }),
    symbolDiagnostics,
  };
};
