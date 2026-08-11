// SPDX-License-Identifier: GPL-3.0-only

import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import type { CsvFieldMapping } from "@/domains/data-import/csvHelpers";
import {
  parseTimestampMs,
  toMarketDateKey,
  toMarketDateTime,
} from "@zinuto/shared/marketTime";
import type { ApiTradingCalendarConfig } from "@/api";

export type PoolSettingsRow = {
  id: string;
  name: string;
  sourceFolder: string;
  importScopeStrategy: "FLAT" | "WITH_PARENT" | null;
  importScopeTopLevelSubfolder: string;
  timeZone: string;
  timeZoneOrigin:
    | "PRESET_DEFAULT"
    | "PRESET_DEFAULT"
    | "INFERRED_DEFAULT"
    | "USER_SELECTED";
  tradingCalendar: ApiTradingCalendarConfig;
  symbols: string[];
  symbolCount: number;
  barCount: number;
  symbolBarCountBySymbol: Record<string, number>;
  symbolInstrumentIdBySymbol: Record<string, string>;
  symbolTimeRangeBySymbol: Record<
    string,
    { timeStartTs: string | null; timeEndTs: string | null }
  >;
  timeStartTs: string | null;
  timeEndTs: string | null;
  lastSyncedAt: string | null;
  storageBytes: number | null;
  csvFieldMapping: CsvFieldMapping | null;
  baseTimeframe: BaseTimeframe;
  diagnosticProfile?: DiagnosticProfile;
  selected: boolean;
  status: "IMPORTING" | "READY" | "FAILED";
  isSystem: boolean;
  requiresSourceFolderRebind: boolean;
  sourceLocked: boolean;
  unlockedSymbols: string[];
  lockedSymbols: string[];
  lockedSymbolCount: number;
  lockReason: string | null;
};

export type CsvImportCardView = {
  id: string;
  poolName: string;
  sourceId: string;
  sourceFolder: string;
  timeZone?: string | null;
  baseTimeframe: BaseTimeframe;
  phase: "UPLOADING" | "IMPORTING" | "FINALIZING" | "FAILED" | "DONE";
  jobId: string | null;
  cancelRequested: boolean;
  isPaused: boolean;
  progressLabelText: string;
  importProgressPercent: number;
  shouldShowCompactProgress: boolean;
  compactProgressLabelText: string;
  compactProgressDisplayPercent: number;
  compactSizeSummaryText: string;
  compactEffectText: string;
  skippedRowsLabelText: string;
  errorMessage: string;
  totalFiles: number;
};

export type DetailBar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DetailSymbolRow = {
  symbol: string;
  barCount: number;
  timeSpanText: string;
  timeStartTs: string | null;
  timeEndTs: string | null;
  locked: boolean;
};

export type DiagnosticAssetClass = "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
export type DiagnosticProfileOrigin = "SYSTEM" | "INFERRED" | "USER";
export type DiagnosticStatus = "READY" | "BUILDING" | "FAILED";
export type DiagnosticCategory =
  | "TIME_INTEGRITY"
  | "EXTREME_ANOMALY";
export type DiagnosticSeverity = "INFO" | "WARNING" | "CRITICAL";
export type DiagnosticCode =
  | "INVALID_OHLC"
  | "DUPLICATE_TIMESTAMP"
  | "TIME_ORDER_BREAK"
  | "DATA_GAP"
  | "OUT_OF_SESSION_BAR"
  | "TIMEFRAME_MISALIGNED_BAR"
  | "EXTREME_PRICE_SPIKE";

export type DiagnosticProfile = {
  assetClass: DiagnosticAssetClass;
  marketPresetId: string;
  profileOrigin: DiagnosticProfileOrigin;
};

export type SourceDiagnosticFilterKind = "ALL" | DiagnosticCategory;

export type DiagnosticDetailItem = {
  id: string;
  symbol?: string;
  category?: DiagnosticCategory;
  code?: DiagnosticCode;
  severity?: DiagnosticSeverity;
  dateLabel: string;
  focusBarIndex: number;
  detailText: string;
  tone: "primary" | "warning" | "danger";
  markerLabel?: string;
  stacked?: boolean;
};

export type DetailFocusMarker = NonNullable<
  HistoryReplayChartViewProps["focusMarker"]
>;

export const createDetailFocusMarker = (
  detailItem: DiagnosticDetailItem,
  rawBarIndex: number,
): DetailFocusMarker => ({
  rawBarIndex,
  label: detailItem.markerLabel || detailItem.dateLabel,
  tone: detailItem.tone,
  fullHeight: true,
});

export const areDetailFocusMarkersEqual = (
  left: DetailFocusMarker | null,
  right: DetailFocusMarker | null,
): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.rawBarIndex === right.rawBarIndex &&
    left.label === right.label &&
    left.tone === right.tone &&
    left.toneColor === right.toneColor &&
    left.fullHeight === right.fullHeight
  );
};

export type DetailSymbolDiagnostics = {
  totalBars: number;
  diagnosticRulesVersion: string;
  status: DiagnosticStatus;
  profile: DiagnosticProfile;
  items: SourceDiagnosticIssueItem[];
};

export type SourceDiagnosticSymbolSummary = {
  instrumentId: string;
  symbol: string;
  totalBars: number;
  issueCount: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  healthScore: number;
  volatilityPercent: number;
  highPrice: number;
  lowPrice: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
};

export type SourceDiagnosticIssueItem = {
  id: string;
  instrumentId: string;
  symbol: string;
  category: DiagnosticCategory;
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  dateLabel: string;
  focusBarIndex: number;
  focusStartTs: string | null;
  focusEndTs: string | null;
  missingBars: number;
  ratio: number;
  volumeRatio: number;
  closeChangeRatio: number;
  amplitudeRatio: number;
  zScore: number;
  multiple: number;
  count: number;
};

export type SourceDiagnostics = {
  sourceId: string;
  baseTimeframe: BaseTimeframe;
  diagnosticRulesVersion: string;
  status: DiagnosticStatus;
  generatedAt: string | null;
  profile: DiagnosticProfile;
  health: {
    score: number;
    severity: DiagnosticSeverity;
    affectedSymbols: number;
  };
  totalSymbols: number;
  scannedSymbols: number;
  affectedSymbols: number;
  totalIssues: number;
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    infoIssues: number;
    byCategory: Record<DiagnosticCategory, number>;
  };
  symbols: SourceDiagnosticSymbolSummary[];
  items: SourceDiagnosticIssueItem[];
  nextCursor: string | null;
};

export const DETAIL_SYMBOL_CHART_WINDOW_BARS = 600;
export const DETAIL_SYMBOL_FOCUS_WINDOW_BARS = 180;
export const DETAIL_SYMBOL_RANGE_CACHE_LIMIT = 12;
export const DETAIL_SYMBOL_DIAGNOSTICS_CACHE_LIMIT = 24;

export type HallSectionItem =
  | {
      id: string;
      type: "READY";
      pool: PoolSettingsRow;
      compactTitle: string;
    }
  | {
      id: string;
      type: "IMPORT";
      card: CsvImportCardView;
      bridgedReadyPool: PoolSettingsRow | null;
      compactTitle: string;
    };

export type HallSection = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
  items: HallSectionItem[];
  poolCount: number;
  symbolCount: number;
  barCount: number;
  storageBytes: number;
  importingCount: number;
  failedCount: number;
};

export type DataConfigSummaryFilterId = "ALL" | "DIRTY" | "SYNCING" | "ERROR";

export type CardReorderGesture = {
  pointerId: number;
  poolId: string;
  baseTimeframe: BaseTimeframe;
  startX: number;
  startY: number;
  moved: boolean;
  sourceElement: HTMLElement | null;
};

export type CardDropHit =
  | { kind: "NONE" }
  | { kind: "SELF" }
  | {
      kind: "TARGET";
      targetPoolId: string;
    };

export const BASE_TIMEFRAME_SECTION_ORDER: BaseTimeframe[] = [
  "1m",
  "5m",
  "1h",
  "1d",
];

const normalizeSymbolCode = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export const normalizeRemovedSymbolsByPool = (
  input: unknown,
): Record<string, string[]> => {
  if (!input || typeof input !== "object") {
    return {};
  }
  const next: Record<string, string[]> = {};
  Object.entries(input as Record<string, unknown>).forEach(
    ([rawPoolId, rawSymbols]) => {
      const poolId = String(rawPoolId || "").trim();
      if (!poolId || !Array.isArray(rawSymbols)) {
        return;
      }
      const symbols = Array.from(
        new Set(
          rawSymbols
            .map((symbol) => normalizeSymbolCode(symbol))
            .filter((symbol) => symbol.length > 0),
        ),
      ).sort((left, right) => left.localeCompare(right, "en"));
      if (!symbols.length) {
        return;
      }
      next[poolId] = symbols;
    },
  );
  return next;
};

export const encodeRemovedSymbolsByPool = (
  input: Record<string, string[]>,
): string => {
  const normalized = normalizeRemovedSymbolsByPool(input);
  const ordered = Object.keys(normalized)
    .sort((left, right) => left.localeCompare(right, "en"))
    .reduce<Record<string, string[]>>((accumulator, poolId) => {
      accumulator[poolId] = normalized[poolId] ?? [];
      return accumulator;
    }, {});
  return JSON.stringify(ordered);
};

export const sanitizeRemovedSymbolsByPool = (
  removedSymbolsByPool: Record<string, string[]>,
  poolSettingsRows: PoolSettingsRow[],
): Record<string, string[]> => {
  const existingPoolIdSet = new Set<string>();
  poolSettingsRows.forEach((pool) => {
    const poolId = String(pool.id || "").trim();
    if (!poolId) {
      return;
    }
    existingPoolIdSet.add(poolId);
  });
  const next: Record<string, string[]> = {};
  Object.entries(normalizeRemovedSymbolsByPool(removedSymbolsByPool)).forEach(
    ([poolId, symbols]) => {
      if (!existingPoolIdSet.has(poolId)) {
        return;
      }
      if (!symbols.length) {
        return;
      }
      next[poolId] = symbols;
    },
  );
  return next;
};

export const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeDetailBarTimestampMs = (value: unknown): number | null => {
  const parsed = parseTimestampMs(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const toDateLabel = (input: string): string => toMarketDateKey(input);

const toDateTimeLabel = (input: string): string => toMarketDateTime(input);

export const formatGapBoundaryLabel = (
  input: string,
  baseTimeframe: BaseTimeframe,
): string => {
  if (baseTimeframe === "1d") {
    return toDateLabel(input);
  }
  return toDateTimeLabel(input);
};

export const resolveTimeSpanText = (
  timeStartTs: string | null,
  timeEndTs: string | null,
  unknownText: string,
  formatRange: (startLabel: string, endLabel: string) => string,
): string => {
  if (!timeStartTs || !timeEndTs) {
    return unknownText;
  }
  const startLabel = toDateLabel(timeStartTs);
  const endLabel = toDateLabel(timeEndTs);
  if (!startLabel || !endLabel) {
    return unknownText;
  }
  return formatRange(startLabel, endLabel);
};

export const normalizeDetailBars = (bars: DetailBar[]): DetailBar[] => {
  const mapByTsMs = new Map<number, DetailBar>();
  bars.forEach((bar) => {
    const tsMs = normalizeDetailBarTimestampMs(bar.ts);
    if (tsMs === null) {
      return;
    }
    const ts = new Date(tsMs).toISOString();
    mapByTsMs.set(tsMs, {
      ts,
      open: toFiniteNumber(bar.open),
      high: toFiniteNumber(bar.high),
      low: toFiniteNumber(bar.low),
      close: toFiniteNumber(bar.close),
      volume: toFiniteNumber(bar.volume),
    });
  });
  return Array.from(mapByTsMs.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, bar]) => bar);
};

export const createEmptyDetailSymbolDiagnostics =
  (): DetailSymbolDiagnostics => ({
    totalBars: 0,
    diagnosticRulesVersion: "",
    status: "BUILDING",
    profile: {
      assetClass: "STOCK",
      marketPresetId: "A_SHARE",
      profileOrigin: "INFERRED",
    },
    items: [],
  });

export const createEmptySourceDiagnostics = (
  sourceId = "",
  baseTimeframe: BaseTimeframe = "1d",
): SourceDiagnostics => ({
  sourceId,
  baseTimeframe,
  diagnosticRulesVersion: "",
  status: "BUILDING",
  generatedAt: null,
  profile: {
    assetClass: "STOCK",
    marketPresetId: "A_SHARE",
    profileOrigin: "INFERRED",
  },
  health: {
    score: 100,
    severity: "INFO",
    affectedSymbols: 0,
  },
  totalSymbols: 0,
  scannedSymbols: 0,
  affectedSymbols: 0,
  totalIssues: 0,
  summary: {
    totalIssues: 0,
    criticalIssues: 0,
    warningIssues: 0,
    infoIssues: 0,
    byCategory: {
      TIME_INTEGRITY: 0,
      EXTREME_ANOMALY: 0,
    },
  },
  symbols: [],
  items: [],
  nextCursor: null,
});

export const touchBoundedCacheEntry = <T,>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
): void => {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
};

export const resolveWindowFocusBarIndex = (
  targetIndex: number | null,
  offset: number,
  barsLength: number,
): number | null => {
  if (
    targetIndex === null ||
    targetIndex < offset ||
    targetIndex >= offset + barsLength
  ) {
    return null;
  }
  return targetIndex - offset;
};

export const normalizeFocusBarIndex = (value: unknown): number | null => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return Math.max(0, Math.floor(numericValue));
};

export const resolveCompactPoolTitle = (
  poolName: string,
  sectionName: string,
  fallbackTitle: string,
): string => {
  const normalizedPoolName = String(poolName || "").trim();
  if (!normalizedPoolName) {
    return fallbackTitle;
  }
  const normalizedSectionName = String(sectionName || "").trim();
  if (normalizedSectionName) {
    const withHyphenPrefix = `${normalizedSectionName}-`;
    const withUnderscorePrefix = `${normalizedSectionName}_`;
    if (normalizedPoolName.startsWith(withHyphenPrefix)) {
      const rest = normalizedPoolName.slice(withHyphenPrefix.length).trim();
      if (rest) {
        return rest;
      }
    }
    if (normalizedPoolName.startsWith(withUnderscorePrefix)) {
      const rest = normalizedPoolName.slice(withUnderscorePrefix.length).trim();
      if (rest) {
        return rest;
      }
    }
  }
  return normalizedPoolName;
};

export const resolveHallSectionStats = (items: HallSectionItem[]) => {
  let symbolCount = 0;
  let barCount = 0;
  let storageBytes = 0;
  let importingCount = 0;
  let failedCount = 0;
  items.forEach((item) => {
    if (item.type === "READY") {
      symbolCount += Math.max(0, Number(item.pool.symbolCount) || 0);
      barCount += Math.max(0, Number(item.pool.barCount) || 0);
      storageBytes += Math.max(0, Number(item.pool.storageBytes) || 0);
      return;
    }
    symbolCount += Math.max(0, Number(item.bridgedReadyPool?.symbolCount || 0));
    barCount += Math.max(0, Number(item.bridgedReadyPool?.barCount || 0));
    storageBytes += Math.max(
      0,
      Number(item.bridgedReadyPool?.storageBytes || 0),
    );
    if (item.card.phase === "FAILED") {
      failedCount += 1;
    } else if (item.card.phase !== "DONE") {
      importingCount += 1;
    }
  });
  return {
    poolCount: items.length,
    symbolCount,
    barCount,
    storageBytes,
    importingCount,
    failedCount,
  };
};
