// SPDX-License-Identifier: GPL-3.0-only

import type { LocalDataSourceSummary } from '../../dataSource/types.js';

type BaseTimeframe = '1m' | '5m' | '1h' | '1d';
type DisplayPeriod = '1m' | '5m' | '1h' | '1d' | '1w' | '1month' | '1year';

type ValidationInstrumentInput = {
  id?: unknown;
  symbol?: unknown;
  baseTimeframe?: unknown;
  name?: unknown;
  barCount?: unknown;
  scopeKind?: unknown;
  sourceId?: unknown;
  sourceName?: unknown;
  displayLabel?: unknown;
};

export type CustomIndicatorValidationInstrumentFact = {
  id: string;
  symbol: string;
  baseTimeframe: BaseTimeframe;
  name: string | null;
  barCount: number;
  scopeKind: 'SYSTEM' | 'LOCAL';
  sourceId: string | null;
  sourceName: string | null;
  displayLabel: string;
  samplePoolIds: string[];
  defaultDisplayPeriod: DisplayPeriod;
  displayPeriodOptions: DisplayPeriod[];
};

export type CustomIndicatorValidationSamplePoolFact = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
  symbolCount: number;
  symbols: string[];
  disabled: boolean;
  locked: boolean;
  lockReason: string | null;
  defaultSymbol: string | null;
  defaultDisplayPeriod: DisplayPeriod;
  displayPeriodOptions: DisplayPeriod[];
};

export type CustomIndicatorValidationFacts = {
  allPoolId: string;
  defaultSamplePoolId: string;
  defaultSymbol: string | null;
  defaultInstrumentId: string | null;
  defaultBaseTimeframe: BaseTimeframe;
  defaultDisplayPeriod: DisplayPeriod;
  samplePools: CustomIndicatorValidationSamplePoolFact[];
  instruments: CustomIndicatorValidationInstrumentFact[];
};

const ALL_POOL_ID = '__sample_pool_all__';
const DEFAULT_SYMBOL = 'AAPL';
const BASE_TIMEFRAME_PRIORITY: readonly BaseTimeframe[] = ['1d', '1h', '5m', '1m'];
const DISPLAY_PERIOD_OPTIONS_BY_BASE: Record<BaseTimeframe, DisplayPeriod[]> = {
  '1m': ['1m', '5m', '1h', '1d'],
  '5m': ['5m', '1h', '1d', '1w'],
  '1h': ['1h', '1d', '1w', '1month'],
  '1d': ['1d', '1w', '1month', '1year'],
};

const normalizeText = (value: unknown): string => String(value ?? '').trim();
const normalizeSymbol = (value: unknown): string =>
  normalizeText(value).toUpperCase();
const normalizeBaseTimeframe = (
  value: unknown,
  fallback: BaseTimeframe = '1d',
): BaseTimeframe => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === '1m' ||
    normalized === '5m' ||
    normalized === '1h' ||
    normalized === '1d'
    ? normalized
    : fallback;
};
const normalizeCount = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};
const resolveDefaultDisplayPeriod = (baseTimeframe: BaseTimeframe): DisplayPeriod =>
  DISPLAY_PERIOD_OPTIONS_BY_BASE[baseTimeframe][0] ?? '1d';
const resolveTimeframeRank = (baseTimeframe: BaseTimeframe): number => {
  const rank = BASE_TIMEFRAME_PRIORITY.indexOf(baseTimeframe);
  return rank >= 0 ? rank : BASE_TIMEFRAME_PRIORITY.length;
};

const compareInstruments = (
  left: CustomIndicatorValidationInstrumentFact,
  right: CustomIndicatorValidationInstrumentFact,
): number => {
  const symbolCompare = left.symbol.localeCompare(right.symbol, 'en');
  if (symbolCompare !== 0) {
    return symbolCompare;
  }
  const timeframeCompare = resolveTimeframeRank(left.baseTimeframe) -
    resolveTimeframeRank(right.baseTimeframe);
  if (timeframeCompare !== 0) {
    return timeframeCompare;
  }
  const scopeCompare =
    (left.scopeKind === 'SYSTEM' ? 0 : 1) -
    (right.scopeKind === 'SYSTEM' ? 0 : 1);
  if (scopeCompare !== 0) {
    return scopeCompare;
  }
  const sourceCompare = String(left.sourceId ?? '').localeCompare(
    String(right.sourceId ?? ''),
    'en',
  );
  if (sourceCompare !== 0) {
    return sourceCompare;
  }
  return left.id.localeCompare(right.id, 'en');
};

const buildInstrumentKey = (options: {
  id: string;
  symbol: string;
  baseTimeframe: BaseTimeframe;
  scopeKind: 'SYSTEM' | 'LOCAL';
  sourceId: string | null;
}): string =>
  [
    options.scopeKind,
    options.sourceId ?? '',
    options.baseTimeframe,
    options.symbol,
    options.id,
  ].join('::');

const addPoolId = (
  instrument: CustomIndicatorValidationInstrumentFact,
  poolId: string,
): void => {
  if (instrument.samplePoolIds.includes(poolId)) {
    return;
  }
  instrument.samplePoolIds.push(poolId);
};

const upsertInstrument = (
  byKey: Map<string, CustomIndicatorValidationInstrumentFact>,
  candidate: ValidationInstrumentInput,
  poolId: string,
): CustomIndicatorValidationInstrumentFact | null => {
  const symbol = normalizeSymbol(candidate.symbol);
  if (!symbol) {
    return null;
  }
  const baseTimeframe = normalizeBaseTimeframe(candidate.baseTimeframe);
  const sourceId = normalizeText(candidate.sourceId) || null;
  const sourceName = normalizeText(candidate.sourceName) || null;
  const scopeKind = candidate.scopeKind === 'LOCAL' ? 'LOCAL' : 'SYSTEM';
  const id = normalizeText(candidate.id);
  const key = buildInstrumentKey({
    id,
    symbol,
    baseTimeframe,
    scopeKind,
    sourceId,
  });
  const current = byKey.get(key);
  if (current) {
    addPoolId(current, poolId);
    current.barCount = Math.max(current.barCount, normalizeCount(candidate.barCount));
    return current;
  }
  const instrument: CustomIndicatorValidationInstrumentFact = {
    id,
    symbol,
    baseTimeframe,
    name: normalizeText(candidate.name) || null,
    barCount: normalizeCount(candidate.barCount),
    scopeKind,
    sourceId,
    sourceName,
    displayLabel: normalizeText(candidate.displayLabel) || symbol,
    samplePoolIds: [poolId],
    defaultDisplayPeriod: resolveDefaultDisplayPeriod(baseTimeframe),
    displayPeriodOptions: DISPLAY_PERIOD_OPTIONS_BY_BASE[baseTimeframe],
  };
  byKey.set(key, instrument);
  return instrument;
};

const sortSymbols = (symbols: Iterable<string>): string[] =>
  Array.from(new Set(Array.from(symbols).map(normalizeSymbol).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, 'en'),
  );

const resolveDefaultSymbol = (symbols: readonly string[]): string | null => {
  if (symbols.includes(DEFAULT_SYMBOL)) {
    return DEFAULT_SYMBOL;
  }
  return symbols[0] ?? null;
};

const createSamplePoolFact = (options: {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
  symbols: string[];
  disabled?: boolean;
  locked?: boolean;
  lockReason?: string | null;
}): CustomIndicatorValidationSamplePoolFact => {
  const defaultDisplayPeriod = resolveDefaultDisplayPeriod(options.baseTimeframe);
  return {
    id: options.id,
    name: options.name,
    baseTimeframe: options.baseTimeframe,
    symbolCount: options.symbols.length,
    symbols: options.symbols,
    disabled: options.disabled === true,
    locked: options.locked === true,
    lockReason: options.lockReason ?? null,
    defaultSymbol: resolveDefaultSymbol(options.symbols),
    defaultDisplayPeriod,
    displayPeriodOptions: DISPLAY_PERIOD_OPTIONS_BY_BASE[options.baseTimeframe],
  };
};

export const buildCustomIndicatorValidationFacts = (options: {
  instruments: readonly ValidationInstrumentInput[];
  localDataSources: readonly LocalDataSourceSummary[];
}): CustomIndicatorValidationFacts => {
  const byKey = new Map<string, CustomIndicatorValidationInstrumentFact>();
  const poolFacts: CustomIndicatorValidationSamplePoolFact[] = [];

  options.instruments.forEach((instrument) => {
    upsertInstrument(byKey, instrument, ALL_POOL_ID);
  });

  const allInstruments = Array.from(byKey.values()).sort(compareInstruments);
  const allSymbols = sortSymbols(allInstruments.map((instrument) => instrument.symbol));
  poolFacts.push(createSamplePoolFact({
    id: ALL_POOL_ID,
    name: 'ALL_SAMPLE_POOLS',
    baseTimeframe: '1d',
    symbols: allSymbols,
    disabled: allSymbols.length === 0,
  }));

  const systemByTimeframe = new Map<BaseTimeframe, string[]>();
  allInstruments
    .filter((instrument) => instrument.scopeKind === 'SYSTEM')
    .forEach((instrument) => {
      const current = systemByTimeframe.get(instrument.baseTimeframe) ?? [];
      current.push(instrument.symbol);
      systemByTimeframe.set(instrument.baseTimeframe, current);
      addPoolId(instrument, `SYSTEM:${instrument.baseTimeframe}`);
    });
  Array.from(systemByTimeframe.entries()).forEach(([baseTimeframe, rawSymbols]) => {
    const symbols = sortSymbols(rawSymbols);
    poolFacts.push(createSamplePoolFact({
      id: `SYSTEM:${baseTimeframe}`,
      name: `SYSTEM_${baseTimeframe.toUpperCase()}`,
      baseTimeframe,
      symbols,
      disabled: symbols.length === 0,
    }));
  });

  options.localDataSources.forEach((source) => {
    const baseTimeframe = normalizeBaseTimeframe(source.baseTimeframe);
    const lockedSymbols = new Set((source.lockedSymbols ?? []).map(normalizeSymbol));
    const unlockedSymbols = new Set((source.unlockedSymbols ?? []).map(normalizeSymbol));
    const hasExplicitSymbolAccess =
      (source.lockedSymbols ?? []).length > 0 ||
      (source.unlockedSymbols ?? []).length > 0;
    const symbols = sortSymbols(
      (source.instruments ?? [])
        .filter((instrument) => {
          const symbol = normalizeSymbol(instrument.symbol);
          return Boolean(symbol) &&
            !source.sourceLocked &&
            !lockedSymbols.has(symbol) &&
            (!hasExplicitSymbolAccess || unlockedSymbols.has(symbol));
        })
        .map((instrument) => {
          const symbol = normalizeSymbol(instrument.symbol);
          const instrumentFact = upsertInstrument(
            byKey,
            {
              id: instrument.instrumentId,
              symbol,
              baseTimeframe: instrument.sourceTimeframe ?? baseTimeframe,
              name: null,
              barCount: instrument.barCount,
              scopeKind: 'LOCAL',
              sourceId: source.id,
              sourceName: source.name,
              displayLabel: instrument.displayLabel,
            },
            source.id,
          );
          if (instrumentFact) {
            addPoolId(instrumentFact, ALL_POOL_ID);
          }
          return symbol;
        }),
    );
    const totalSymbols = sortSymbols(
      (source.instruments ?? []).map((instrument) => instrument.symbol),
    );
    poolFacts.push(createSamplePoolFact({
      id: source.id,
      name: source.name,
      baseTimeframe,
      symbols,
      disabled: source.sourceLocked || symbols.length === 0,
      locked: source.sourceLocked,
      lockReason: source.sourceLocked ? source.lockReason : null,
    }));
    if (source.sourceLocked && !symbols.length && totalSymbols.length) {
      const pool = poolFacts[poolFacts.length - 1];
      pool.symbolCount = totalSymbols.length;
    }
  });

  const finalInstruments = Array.from(byKey.values()).sort(compareInstruments);
  const allPool = poolFacts[0] ?? createSamplePoolFact({
    id: ALL_POOL_ID,
    name: 'ALL_SAMPLE_POOLS',
    baseTimeframe: '1d',
    symbols: [],
    disabled: true,
  });
  const finalAllSymbols = sortSymbols(
    finalInstruments
      .filter((instrument) => instrument.samplePoolIds.includes(ALL_POOL_ID))
      .map((instrument) => instrument.symbol),
  );
  allPool.symbols = finalAllSymbols;
  allPool.symbolCount = finalAllSymbols.length;
  allPool.disabled = finalAllSymbols.length === 0;
  allPool.defaultSymbol = resolveDefaultSymbol(finalAllSymbols);
  const defaultSymbol = allPool.defaultSymbol;
  const defaultInstrument = defaultSymbol
    ? finalInstruments.find((instrument) => instrument.symbol === defaultSymbol) ?? null
    : null;
  const defaultBaseTimeframe = defaultInstrument?.baseTimeframe ?? '1d';
  return {
    allPoolId: ALL_POOL_ID,
    defaultSamplePoolId: allPool.id,
    defaultSymbol,
    defaultInstrumentId: defaultInstrument?.id ?? null,
    defaultBaseTimeframe,
    defaultDisplayPeriod:
      defaultInstrument?.defaultDisplayPeriod ??
      resolveDefaultDisplayPeriod(defaultBaseTimeframe),
    samplePools: poolFacts,
    instruments: finalInstruments,
  };
};
