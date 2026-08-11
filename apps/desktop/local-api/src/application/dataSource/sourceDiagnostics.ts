// SPDX-License-Identifier: GPL-3.0-only

import type { MarketSymbolDiagnosticsSnapshot } from '../ports/infrastructure/db/marketDatabase.js';
import {
  normalizeLocalDataSourceDiagnosticProfile,
} from './diagnosticProfile.js';
import type {
  LocalDataSourceDiagnosticCategory,
  LocalDataSourceDiagnosticCode,
  LocalDataSourceDiagnosticProfile,
  LocalDataSourceDiagnosticSeverity,
  LocalDataSourceDiagnosticStatus,
  LocalDataSourceDiagnostics,
  LocalDataSourceDiagnosticsIssue,
  LocalDataSourceDiagnosticsSymbolSummary,
  LocalDataSourceSymbolDiagnostics,
} from './types.js';

type BaseTimeframe = LocalDataSourceDiagnostics['baseTimeframe'];

export const LOCAL_DATA_SOURCE_DIAGNOSTIC_RULES_VERSION =
  '2026-05-18-timeframe-grid-v1';

export type LocalDataSourceDiagnosticsInstrument = {
  instrumentId: string;
  symbol: string;
  timeStartTs?: string | null;
  timeEndTs?: string | null;
};

export type LocalDataSourceDiagnosticsQuery = {
  limit?: number;
  cursor?: string | null;
  category?: LocalDataSourceDiagnosticCategory | null;
  severity?: LocalDataSourceDiagnosticSeverity | null;
};

const CATEGORY_ORDER: Record<LocalDataSourceDiagnosticCategory, number> = {
  TIME_INTEGRITY: 0,
  EXTREME_ANOMALY: 1,
};

const SEVERITY_ORDER: Record<LocalDataSourceDiagnosticSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

const SOURCE_DIAGNOSTICS_DEFAULT_LIMIT = 200;
const SOURCE_DIAGNOSTICS_MAX_LIMIT = 500;

const createEmptyCategoryCounts = (): Record<
  LocalDataSourceDiagnosticCategory,
  number
> => ({
  TIME_INTEGRITY: 0,
  EXTREME_ANOMALY: 0,
});

const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNonNegativeInt = (value: unknown): number => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toIsoOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : null;
};

const toDateLabel = (value: unknown): string => {
  const iso = toIsoOrNull(value);
  if (!iso) {
    return '';
  }
  return iso.slice(0, 10);
};

const clampHealthScore = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

const severityFromScore = (
  score: number,
): LocalDataSourceDiagnosticSeverity => {
  if (score < 60) {
    return 'CRITICAL';
  }
  if (score < 85) {
    return 'WARNING';
  }
  return 'INFO';
};

const normalizeLimit = (value: unknown): number => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SOURCE_DIAGNOSTICS_DEFAULT_LIMIT;
  }
  return Math.min(SOURCE_DIAGNOSTICS_MAX_LIMIT, parsed);
};

const normalizeCursorOffset = (value: unknown): number => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const compareIssues = (
  left: LocalDataSourceDiagnosticsIssue,
  right: LocalDataSourceDiagnosticsIssue,
): number => {
  if (SEVERITY_ORDER[left.severity] !== SEVERITY_ORDER[right.severity]) {
    return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
  }
  if (left.symbol !== right.symbol) {
    return left.symbol.localeCompare(right.symbol, 'en');
  }
  if (left.focusBarIndex !== right.focusBarIndex) {
    return left.focusBarIndex - right.focusBarIndex;
  }
  return CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
};

const isWeekendDayUtc = (timestampMs: number): boolean => {
  const day = new Date(timestampMs).getUTCDay();
  return day === 0 || day === 6;
};

const isForexWeekendOnlyGap = (
  missingStartTs: string | null,
  missingEndTs: string | null,
): boolean => {
  const startMs = missingStartTs ? Date.parse(missingStartTs) : Number.NaN;
  const endMs = missingEndTs ? Date.parse(missingEndTs) : Number.NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return false;
  }
  const oneDayMs = 24 * 60 * 60_000;
  let cursorMs = Date.UTC(
    new Date(startMs).getUTCFullYear(),
    new Date(startMs).getUTCMonth(),
    new Date(startMs).getUTCDate(),
  );
  const endDayMs = Date.UTC(
    new Date(endMs).getUTCFullYear(),
    new Date(endMs).getUTCMonth(),
    new Date(endMs).getUTCDate(),
  );
  while (cursorMs <= endDayMs) {
    if (!isWeekendDayUtc(cursorMs)) {
      return false;
    }
    cursorMs += oneDayMs;
  }
  return true;
};

const gapCrossesUtcDate = (
  missingStartTs: string | null,
  missingEndTs: string | null,
): boolean =>
  Boolean(
    missingStartTs &&
      missingEndTs &&
      missingStartTs.slice(0, 10) !== missingEndTs.slice(0, 10),
  );

const repeatedBreakMinimumMissingBars = (baseTimeframe: BaseTimeframe): number => {
  if (baseTimeframe === '1m') {
    return 30;
  }
  if (baseTimeframe === '5m') {
    return 6;
  }
  if (baseTimeframe === '1h') {
    return 2;
  }
  return 1;
};

const isRepeatedMarketBreak = (value: {
  baseTimeframe: BaseTimeframe;
  missingBars: number;
  repeatCount?: unknown;
  repeatRatio?: unknown;
}): boolean => {
  if (value.missingBars < repeatedBreakMinimumMissingBars(value.baseTimeframe)) {
    return false;
  }
  const repeatCount = toNonNegativeInt(value.repeatCount);
  const repeatRatio = toFiniteNumber(value.repeatRatio);
  return repeatCount >= 3 || (repeatCount >= 2 && repeatRatio >= 0.001);
};

const isLikelyStockSessionBreak = (
  baseTimeframe: BaseTimeframe,
  missingBars: number,
): boolean => {
  if (baseTimeframe === '1m') {
    return missingBars >= 30 && missingBars <= 240;
  }
  if (baseTimeframe === '5m') {
    return missingBars >= 6 && missingBars <= 48;
  }
  if (baseTimeframe === '1h') {
    return missingBars >= 1 && missingBars <= 6;
  }
  return false;
};

const shouldReportGap = ({
  baseTimeframe,
  profile,
  missingStartTs,
  missingEndTs,
  missingBars,
  repeatCount,
  repeatRatio,
}: {
  baseTimeframe: BaseTimeframe;
  profile: LocalDataSourceDiagnosticProfile;
  missingStartTs: string | null;
  missingEndTs: string | null;
  missingBars: number;
  repeatCount?: unknown;
  repeatRatio?: unknown;
}): boolean => {
  if (missingBars <= 0) {
    return false;
  }
  if (baseTimeframe === '1d') {
    if (profile.assetClass === 'STOCK' || profile.assetClass === 'FUTURES') {
      return false;
    }
    if (
      profile.assetClass === 'FOREX' &&
      isForexWeekendOnlyGap(missingStartTs, missingEndTs)
    ) {
      return false;
    }
    return profile.assetClass === 'CRYPTO' || profile.assetClass === 'FOREX';
  }
  if (
    isRepeatedMarketBreak({
      baseTimeframe,
      missingBars,
      repeatCount,
      repeatRatio,
    })
  ) {
    return false;
  }
  if (
    profile.assetClass !== 'CRYPTO' &&
    gapCrossesUtcDate(missingStartTs, missingEndTs)
  ) {
    return false;
  }
  if (
    (profile.assetClass === 'STOCK' || profile.assetClass === 'FUTURES') &&
    isLikelyStockSessionBreak(baseTimeframe, missingBars)
  ) {
    return false;
  }
  if (
    profile.assetClass === 'FOREX' &&
    isForexWeekendOnlyGap(missingStartTs, missingEndTs)
  ) {
    return false;
  }
  return true;
};

const makeIssue = ({
  instrumentId,
  symbol,
  code,
  category,
  severity,
  focusBarIndex,
  focusStartTs = null,
  focusEndTs = null,
  missingBars = 0,
  ratio = 0,
  volumeRatio = 0,
  closeChangeRatio = 0,
  amplitudeRatio = 0,
  zScore = 0,
  multiple = 0,
  count = 1,
}: {
  instrumentId: string;
  symbol: string;
  code: LocalDataSourceDiagnosticCode;
  category: LocalDataSourceDiagnosticCategory;
  severity: LocalDataSourceDiagnosticSeverity;
  focusBarIndex: number;
  focusStartTs?: string | null;
  focusEndTs?: string | null;
  missingBars?: number;
  ratio?: number;
  volumeRatio?: number;
  closeChangeRatio?: number;
  amplitudeRatio?: number;
  zScore?: number;
  multiple?: number;
  count?: number;
}): LocalDataSourceDiagnosticsIssue => {
  const normalizedFocusStartTs = toIsoOrNull(focusStartTs);
  const normalizedFocusEndTs = toIsoOrNull(focusEndTs);
  const dateLabel =
    toDateLabel(normalizedFocusStartTs) ||
    toDateLabel(normalizedFocusEndTs) ||
    symbol;
  return {
    id: `${symbol}:${code}:${Math.max(0, Math.floor(focusBarIndex))}:${dateLabel}`,
    instrumentId,
    symbol,
    category,
    code,
    severity,
    dateLabel,
    focusBarIndex: Math.max(0, Math.floor(focusBarIndex)),
    focusStartTs: normalizedFocusStartTs,
    focusEndTs: normalizedFocusEndTs,
    missingBars: toNonNegativeInt(missingBars),
    ratio: toFiniteNumber(ratio),
    volumeRatio: toFiniteNumber(volumeRatio),
    closeChangeRatio: toFiniteNumber(closeChangeRatio),
    amplitudeRatio: toFiniteNumber(amplitudeRatio),
    zScore: toFiniteNumber(zScore),
    multiple: toFiniteNumber(multiple),
    count: Math.max(1, toNonNegativeInt(count)),
  };
};

const buildSymbolIssues = ({
  instrumentId,
  symbol,
  baseTimeframe,
  profile,
  snapshot,
}: {
  instrumentId: string;
  symbol: string;
  baseTimeframe: BaseTimeframe;
  profile: LocalDataSourceDiagnosticProfile;
  snapshot: MarketSymbolDiagnosticsSnapshot;
}): LocalDataSourceDiagnosticsIssue[] => {
  const issues: LocalDataSourceDiagnosticsIssue[] = [];
  (snapshot.invalidOhlcItems ?? []).forEach((item) => {
    issues.push(
      makeIssue({
        instrumentId,
        symbol,
        code: 'INVALID_OHLC',
        category: 'EXTREME_ANOMALY',
        severity: 'CRITICAL',
        focusBarIndex: item.rawIndex,
        focusStartTs: item.ts,
        count: item.count,
      }),
    );
  });

  (snapshot.duplicateTimestampItems ?? []).forEach((item) => {
    issues.push(
      makeIssue({
        instrumentId,
        symbol,
        code: 'DUPLICATE_TIMESTAMP',
        category: 'TIME_INTEGRITY',
        severity: 'CRITICAL',
        focusBarIndex: item.rawIndex,
        focusStartTs: item.ts,
        count: item.duplicateCount,
      }),
    );
  });

  (snapshot.timeOrderItems ?? []).forEach((item) => {
    issues.push(
      makeIssue({
        instrumentId,
        symbol,
        code: 'TIME_ORDER_BREAK',
        category: 'TIME_INTEGRITY',
        severity: 'CRITICAL',
        focusBarIndex: item.rawIndex,
        focusStartTs: item.ts,
        focusEndTs: item.previousTs,
      }),
    );
  });

  (snapshot.gaps ?? []).forEach((item) => {
    const missingStartTs = toIsoOrNull(item.missingStartTs);
    const missingEndTs = toIsoOrNull(item.missingEndTs);
    if (
      !shouldReportGap({
        baseTimeframe,
        profile,
        missingStartTs,
        missingEndTs,
        missingBars: toNonNegativeInt(item.missingBars),
        repeatCount: item.repeatCount,
        repeatRatio: item.repeatRatio,
      })
    ) {
      return;
    }
    const missingBars = toNonNegativeInt(item.missingBars);
    issues.push(
      makeIssue({
        instrumentId,
        symbol,
        code: 'DATA_GAP',
        category: 'TIME_INTEGRITY',
        severity: missingBars >= 20 ? 'CRITICAL' : 'WARNING',
        focusBarIndex: item.rawIndex,
        focusStartTs: missingStartTs,
        focusEndTs: missingEndTs,
        missingBars,
      }),
    );
  });

  (snapshot.outOfSessionItems ?? []).forEach((item) => {
    issues.push(
      makeIssue({
        instrumentId,
        symbol,
        code: 'OUT_OF_SESSION_BAR',
        category: 'TIME_INTEGRITY',
        severity: 'WARNING',
        focusBarIndex: item.rawIndex,
        focusStartTs: item.ts,
        count: item.count,
      }),
    );
  });

  (snapshot.timeframeMisalignedItems ?? []).forEach((item) => {
    issues.push(
      makeIssue({
        instrumentId,
        symbol,
        code: 'TIMEFRAME_MISALIGNED_BAR',
        category: 'TIME_INTEGRITY',
        severity: 'WARNING',
        focusBarIndex: item.rawIndex,
        focusStartTs: item.ts,
        count: item.count,
      }),
    );
  });

  (snapshot.extremePriceSpikeItems ?? []).forEach((item) => {
    const amplitudeRatio = toFiniteNumber(item.amplitudeRatio);
    issues.push(
      makeIssue({
        instrumentId,
        symbol,
        code: 'EXTREME_PRICE_SPIKE',
        category: 'EXTREME_ANOMALY',
        severity: 'CRITICAL',
        focusBarIndex: item.rawIndex,
        focusStartTs: item.ts,
        closeChangeRatio: item.closeChangeRatio,
        amplitudeRatio,
        zScore: item.zScore,
        multiple: item.multiple,
      }),
    );
  });

  return issues.sort(compareIssues);
};

const summarizeIssues = (
  items: LocalDataSourceDiagnosticsIssue[],
): LocalDataSourceDiagnostics['summary'] => {
  const byCategory = createEmptyCategoryCounts();
  let criticalIssues = 0;
  let warningIssues = 0;
  let infoIssues = 0;
  items.forEach((item) => {
    byCategory[item.category] += 1;
    if (item.severity === 'CRITICAL') {
      criticalIssues += 1;
    } else if (item.severity === 'WARNING') {
      warningIssues += 1;
    } else {
      infoIssues += 1;
    }
  });
  return {
    totalIssues: items.length,
    criticalIssues,
    warningIssues,
    infoIssues,
    byCategory,
  };
};

const scoreIssues = (summary: LocalDataSourceDiagnostics['summary']): number =>
  clampHealthScore(
    100 -
      summary.criticalIssues * 18 -
      summary.warningIssues * 7 -
      summary.infoIssues * 2,
  );

export const filterLocalDataSourceDiagnostics = (
  diagnostics: LocalDataSourceDiagnostics,
  query: LocalDataSourceDiagnosticsQuery = {},
): LocalDataSourceDiagnostics => {
  const limit = normalizeLimit(query.limit);
  const offset = normalizeCursorOffset(query.cursor);
  const category = query.category ?? null;
  const severity = query.severity ?? null;
  const filteredItems = diagnostics.items.filter((item) => {
    if (category && item.category !== category) {
      return false;
    }
    if (severity && item.severity !== severity) {
      return false;
    }
    return true;
  });
  const items = filteredItems.slice(offset, offset + limit);
  return {
    ...diagnostics,
    items,
    nextCursor:
      offset + limit < filteredItems.length ? String(offset + limit) : null,
  };
};

export const createEmptyLocalDataSourceDiagnostics = (
  sourceId: string,
  baseTimeframe: BaseTimeframe,
  profile?: Partial<LocalDataSourceDiagnosticProfile> | null,
  status: LocalDataSourceDiagnosticStatus = 'BUILDING',
  totalSymbols = 0,
  generatedAt: string | null = null,
): LocalDataSourceDiagnostics => {
  const normalizedProfile = normalizeLocalDataSourceDiagnosticProfile(profile);
  return {
    sourceId: String(sourceId || '').trim(),
    baseTimeframe,
    diagnosticRulesVersion: LOCAL_DATA_SOURCE_DIAGNOSTIC_RULES_VERSION,
    status,
    generatedAt,
    profile: normalizedProfile,
    health: {
      score: status === 'FAILED' ? 0 : 100,
      severity: status === 'FAILED' ? 'CRITICAL' : 'INFO',
      affectedSymbols: 0,
    },
    totalSymbols: Math.max(0, Math.floor(Number(totalSymbols) || 0)),
    scannedSymbols: 0,
    affectedSymbols: 0,
    totalIssues: 0,
    summary: {
      totalIssues: 0,
      criticalIssues: 0,
      warningIssues: 0,
      infoIssues: 0,
      byCategory: createEmptyCategoryCounts(),
    },
    symbols: [],
    items: [],
    nextCursor: null,
  };
};

export const buildLocalDataSourceDiagnostics = ({
  sourceId,
  baseTimeframe,
  profile,
  instruments,
  snapshotsByInstrumentId,
  generatedAt = null,
  query,
}: {
  sourceId: string;
  baseTimeframe: BaseTimeframe;
  profile: LocalDataSourceDiagnosticProfile;
  instruments: LocalDataSourceDiagnosticsInstrument[];
  snapshotsByInstrumentId: Map<string, MarketSymbolDiagnosticsSnapshot>;
  generatedAt?: string | null;
  query?: LocalDataSourceDiagnosticsQuery;
}): LocalDataSourceDiagnostics => {
  const normalizedSourceId = String(sourceId || '').trim();
  const normalizedProfile = normalizeLocalDataSourceDiagnosticProfile(profile);
  const orderedInstruments = instruments
    .map((instrument) => ({
      instrumentId: String(instrument.instrumentId || '').trim(),
      symbol: String(instrument.symbol || '').trim().toUpperCase(),
      timeStartTs: toIsoOrNull(instrument.timeStartTs),
      timeEndTs: toIsoOrNull(instrument.timeEndTs),
    }))
    .filter((instrument) => instrument.instrumentId && instrument.symbol)
    .sort((left, right) => left.symbol.localeCompare(right.symbol, 'en'));

  if (!orderedInstruments.length) {
    return createEmptyLocalDataSourceDiagnostics(
      normalizedSourceId,
      baseTimeframe,
      normalizedProfile,
      'READY',
      0,
      generatedAt,
    );
  }

  const allItems: LocalDataSourceDiagnosticsIssue[] = [];
  const symbols: LocalDataSourceDiagnosticsSymbolSummary[] =
    orderedInstruments.map((instrument) => {
      const snapshot = snapshotsByInstrumentId.get(instrument.instrumentId) ?? {
        totalBars: 0,
        volatilityPercent: 0,
        highPrice: 0,
        lowPrice: 0,
        gaps: [],
        outOfSessionItems: [],
        extremePriceSpikeItems: [],
        invalidOhlcItems: [],
        duplicateTimestampItems: [],
        timeOrderItems: [],
      };
      const symbolItems = buildSymbolIssues({
        instrumentId: instrument.instrumentId,
        symbol: instrument.symbol,
        baseTimeframe,
        profile: normalizedProfile,
        snapshot,
      });
      allItems.push(...symbolItems);
      const symbolSummary = summarizeIssues(symbolItems);
      return {
        instrumentId: instrument.instrumentId,
        symbol: instrument.symbol,
        totalBars: toNonNegativeInt(snapshot.totalBars),
        issueCount: symbolItems.length,
        criticalIssues: symbolSummary.criticalIssues,
        warningIssues: symbolSummary.warningIssues,
        infoIssues: symbolSummary.infoIssues,
        healthScore: scoreIssues(symbolSummary),
        volatilityPercent: toFiniteNumber(snapshot.volatilityPercent),
        highPrice: toFiniteNumber(snapshot.highPrice),
        lowPrice: toFiniteNumber(snapshot.lowPrice),
        timeStartTs: instrument.timeStartTs ?? null,
        timeEndTs: instrument.timeEndTs ?? null,
      };
    });

  const sortedItems = allItems.sort(compareIssues);
  const summary = summarizeIssues(sortedItems);
  const score = scoreIssues(summary);
  const fullDiagnostics: LocalDataSourceDiagnostics = {
    sourceId: normalizedSourceId,
    baseTimeframe,
    diagnosticRulesVersion: LOCAL_DATA_SOURCE_DIAGNOSTIC_RULES_VERSION,
    status: 'READY',
    generatedAt,
    profile: normalizedProfile,
    health: {
      score,
      severity: severityFromScore(score),
      affectedSymbols: symbols.filter((symbol) => symbol.issueCount > 0).length,
    },
    totalSymbols: orderedInstruments.length,
    scannedSymbols: orderedInstruments.length,
    affectedSymbols: symbols.filter((symbol) => symbol.issueCount > 0).length,
    totalIssues: summary.totalIssues,
    summary,
    symbols,
    items: sortedItems,
    nextCursor: null,
  };

  return filterLocalDataSourceDiagnostics(fullDiagnostics, query);
};

export const buildLocalDataSourceSymbolDiagnosticsFromSnapshot = ({
  symbol,
  instrumentId = symbol,
  baseTimeframe,
  profile,
  snapshot,
  generatedAt = null,
}: {
  symbol: string;
  instrumentId?: string;
  baseTimeframe: BaseTimeframe;
  profile: LocalDataSourceDiagnosticProfile;
  snapshot: MarketSymbolDiagnosticsSnapshot;
  generatedAt?: string | null;
}): LocalDataSourceSymbolDiagnostics => {
  const diagnostics = buildLocalDataSourceDiagnostics({
    sourceId: instrumentId,
    baseTimeframe,
    profile,
    instruments: [
      {
        instrumentId,
        symbol,
      },
    ],
    snapshotsByInstrumentId: new Map([[instrumentId, snapshot]]),
    generatedAt,
  });
  const symbolSummary = diagnostics.symbols[0];
  return {
    symbol: String(symbol || '').trim().toUpperCase(),
    baseTimeframe,
    diagnosticRulesVersion: diagnostics.diagnosticRulesVersion,
    status: diagnostics.status,
    generatedAt: diagnostics.generatedAt,
    profile: diagnostics.profile,
    health: diagnostics.health,
    totalBars: symbolSummary?.totalBars ?? 0,
    summary: diagnostics.summary,
    items: diagnostics.items,
  };
};
