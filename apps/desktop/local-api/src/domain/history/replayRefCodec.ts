// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../models.js';
import { calculateReplayEquityMetrics as calculateSharedReplayEquityMetrics } from '@zinuto/shared/replay';

export type ReplayRefMeta = {
  storage: 'REF';
  version: 2;
  startTs: string | null;
  endTs: string | null;
  barCount: number;
};

export type ReplayRefStoredPayload = {
  drawings: ReplayDrawingCompactTuple[];
  chartIndicators?: unknown;
  displayPeriod?: string;
};

type ReplayFillSide = 'BUY' | 'SELL';
type ReplayCashAdjustmentKind = 'LONG_FINANCING' | 'SHORT_BORROW' | 'FUNDING';

export type ReplayCashAdjustmentRecord = {
  kind: ReplayCashAdjustmentKind;
  bar_index: number;
  amount: number;
  ts: string;
  created_at: string;
};

type ReplayDrawingPointTuple = [number, number];
type ReplayDrawingCompactTuple = [
  string,
  string,
  ReplayDrawingPointTuple[],
  string?,
  number?,
  number?,
  number?,
  string?,
  number?,
  number?,
  Record<string, unknown>?,
  unknown?
];

export type ReplayFillRecord = {
  id: string;
  order_id: string;
  session_id: string;
  instrument_id: string;
  symbol: string;
  side: ReplayFillSide;
  fill_index: number;
  fill_time: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  created_at: string;
};

export type ReplayFillStoreRecord = ReplayFillRecord & {
  row_seq: number;
};

export type ReplayFillStoreRow = {
  rowSeq: number;
  side: ReplayFillSide;
  fillIndex: number;
  fillTime: string;
  fillPrice: number;
  fillQty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  createdAt: string;
};

export type ReplayCashAdjustmentStoreRecord = ReplayCashAdjustmentRecord & {
  row_seq: number;
};

export type ReplayCashAdjustmentStoreRow = {
  rowSeq: number;
  kind: ReplayCashAdjustmentKind;
  barIndex: number;
  amount: number;
  ts: string;
  createdAt: string;
};

export type ReplayCurvePoint = {
  ts: string;
  value: number;
};

type ReplayTradeDirection = 'LONG' | 'SHORT';

type ReplayTradeRoundCompactTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string?,
  string?
];

export type ReplayTradeRoundRecord = {
  id: string;
  direction: ReplayTradeDirection;
  entryIndex: number;
  closeIndex: number;
  entryTime: string;
  closeTime: string;
  holdBars: number;
  quantity: number;
  entryAvgPrice: number;
  exitAvgPrice: number;
  grossPnl: number;
  pnl: number;
  returnRate: number;
  mfeRate: number;
  maeRate: number;
  entryCost: number;
  exitCost: number;
};

export type ReplayPayload = {
  bars: OhlcvBar[];
  snapshot: Record<string, unknown>;
  drawings: unknown[];
  equityCurve: ReplayCurvePoint[];
  drawdownCurve: ReplayCurvePoint[];
  tradeRounds: ReplayTradeRoundRecord[];
  finalEquity: number;
  equityReturnRate: number;
  chartIndicators: unknown;
  baseTimeframe?: string;
  displayPeriod?: string;
  replayHydrationStatus?: 'READY' | 'SOURCE_CHANGED' | 'SOURCE_MISSING' | 'SNAPSHOT_ONLY';
};

export const normalizeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const trimTrailingUndefined = <T>(value: T[]): T[] => {
  const next = [...value];
  while (next.length > 0) {
    const last = next[next.length - 1];
    if (last !== undefined) {
      break;
    }
    next.pop();
  }
  return next;
};

export const normalizeBaseTimeframe = (value: unknown): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
};

export const normalizeDisplayPeriod = (value: unknown): string | null => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === '1m' ||
    normalized === '5m' ||
    normalized === '1h' ||
    normalized === '1d' ||
    normalized === '1w' ||
    normalized === '1month' ||
    normalized === '1year'
  ) {
    return normalized;
  }
  return null;
};

const normalizeFillSide = (value: unknown): ReplayFillSide | null => {
  if (value === 'BUY' || value === 'SELL') {
    return value;
  }
  return null;
};

const normalizeReplayFillForStore = (
  value: Record<string, unknown>,
  rowSeq: number,
): ReplayFillStoreRecord | null => {
  const side = normalizeFillSide(value.side);
  if (!side) {
    return null;
  }
  const fillIndex = Math.floor(normalizeNumber(value.fill_index, Number.NaN));
  const fillPrice = normalizeNumber(value.fill_price, Number.NaN);
  const fillQty = normalizeNumber(value.fill_qty, Number.NaN);
  const contractMultiplier = Math.max(Number.EPSILON, normalizeNumber(value.contract_multiplier, 1));
  if (
    !Number.isFinite(fillIndex) ||
    fillIndex < 0 ||
    !Number.isFinite(fillPrice) ||
    !Number.isFinite(fillQty) ||
    fillQty <= 0
  ) {
    return null;
  }
  const fillTime = typeof value.fill_time === 'string' ? value.fill_time.trim() : '';
  const createdAt =
    typeof value.created_at === 'string' && value.created_at.trim()
      ? value.created_at.trim()
      : fillTime;
  return {
    id: typeof value.id === 'string' ? value.id : `ref-fill-${rowSeq}`,
    order_id: typeof value.order_id === 'string' ? value.order_id : '',
    session_id: typeof value.session_id === 'string' ? value.session_id : '',
    instrument_id: typeof value.instrument_id === 'string' ? value.instrument_id : '',
    symbol: typeof value.symbol === 'string' ? value.symbol.trim().toUpperCase() : '',
    side,
    fill_index: fillIndex,
    fill_time: fillTime,
    fill_price: fillPrice,
    fill_qty: fillQty,
    contract_multiplier: contractMultiplier,
    fee: Math.max(0, normalizeNumber(value.fee)),
    tax: Math.max(0, normalizeNumber(value.tax)),
    slippage: Math.max(0, normalizeNumber(value.slippage)),
    created_at: createdAt,
    row_seq: rowSeq,
  };
};

export const encodeReplayFillsForRows = (fills: unknown[]): ReplayFillStoreRecord[] => {
  if (!Array.isArray(fills) || !fills.length) {
    return [];
  }
  let rowSeq = 0;
  return fills
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      rowSeq += 1;
      return normalizeReplayFillForStore(item as Record<string, unknown>, rowSeq);
    })
    .filter((item): item is ReplayFillStoreRecord => Boolean(item))
    .sort((left, right) => {
      if (left.fill_index !== right.fill_index) {
        return left.fill_index - right.fill_index;
      }
      return left.row_seq - right.row_seq;
    });
};

export const decodeReplayFillRowsForWindow = (
  rows: ReplayFillStoreRow[],
  bars: OhlcvBar[],
  fallbackSymbol: string,
  localWindowStart: number,
): ReplayFillRecord[] => {
  if (!rows.length || !bars.length) {
    return [];
  }
  return rows
    .map((row) => {
      const fillIndex = Math.floor(normalizeNumber(row.fillIndex, Number.NaN));
      const localIndex = fillIndex - localWindowStart;
      if (!Number.isFinite(fillIndex) || localIndex < 0 || localIndex >= bars.length) {
        return null;
      }
      const fillTime = row.fillTime || bars[localIndex]?.ts || '';
      return {
        id: `ref-fill-${row.rowSeq}`,
        order_id: '',
        session_id: '',
        instrument_id: '',
        symbol: fallbackSymbol.trim().toUpperCase(),
        side: row.side,
        fill_index: localIndex,
        fill_time: fillTime,
        fill_price: normalizeNumber(row.fillPrice),
        fill_qty: normalizeNumber(row.fillQty),
        contract_multiplier: Math.max(Number.EPSILON, normalizeNumber(row.contractMultiplier, 1)),
        fee: Math.max(0, normalizeNumber(row.fee)),
        tax: Math.max(0, normalizeNumber(row.tax)),
        slippage: Math.max(0, normalizeNumber(row.slippage)),
        created_at: row.createdAt || fillTime,
      } satisfies ReplayFillRecord;
    })
    .filter((item): item is ReplayFillRecord => Boolean(item))
    .sort((left, right) => {
      if (left.fill_index !== right.fill_index) {
        return left.fill_index - right.fill_index;
      }
      if (left.fill_time !== right.fill_time) {
        return left.fill_time.localeCompare(right.fill_time);
      }
      if (left.created_at !== right.created_at) {
        return left.created_at.localeCompare(right.created_at);
      }
      // Equal coordinates retain the replay-ref row sequence through stable sort.
      return 0;
    });
};

const normalizeReplayCashAdjustmentKind = (value: unknown): ReplayCashAdjustmentKind | null => {
  if (value === 'LONG_FINANCING' || value === 'SHORT_BORROW' || value === 'FUNDING') {
    return value;
  }
  return null;
};

const sortReplayCashAdjustmentRecords = (
  left: ReplayCashAdjustmentRecord,
  right: ReplayCashAdjustmentRecord,
): number => {
  if (left.bar_index !== right.bar_index) {
    return left.bar_index - right.bar_index;
  }
  if (left.ts !== right.ts) {
    return left.ts.localeCompare(right.ts);
  }
  if (left.created_at !== right.created_at) {
    return left.created_at.localeCompare(right.created_at);
  }
  return left.kind.localeCompare(right.kind);
};

const normalizeReplayCashAdjustmentRecord = (
  value: unknown,
): ReplayCashAdjustmentRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const kind = normalizeReplayCashAdjustmentKind(source.kind);
  const barIndex = Math.floor(normalizeNumber(source.bar_index ?? source.barIndex, Number.NaN));
  const amount = normalizeNumber(source.amount, Number.NaN);
  if (!kind || !Number.isFinite(barIndex) || barIndex < 0 || !Number.isFinite(amount)) {
    return null;
  }
  const ts = typeof source.ts === 'string' ? source.ts.trim() : '';
  const createdAt =
    typeof source.created_at === 'string'
      ? source.created_at.trim()
      : typeof source.createdAt === 'string'
        ? source.createdAt.trim()
        : '';
  return {
    kind,
    bar_index: barIndex,
    amount,
    ts,
    created_at: createdAt || ts,
  };
};

const encodeReplayCashAdjustments = (raw: unknown): ReplayCashAdjustmentRecord[] => {
  if (!Array.isArray(raw) || !raw.length) {
    return [];
  }
  return raw
    .map((item) => normalizeReplayCashAdjustmentRecord(item))
    .filter((item): item is ReplayCashAdjustmentRecord => Boolean(item))
    .sort(sortReplayCashAdjustmentRecords);
};

export const encodeReplayCashAdjustmentsForRows = (
  raw: unknown,
): ReplayCashAdjustmentStoreRecord[] => {
  let rowSeq = 0;
  return encodeReplayCashAdjustments(raw).map((adjustment) => {
    rowSeq += 1;
    return {
      ...adjustment,
      row_seq: rowSeq,
    };
  });
};

export const decodeReplayCashAdjustmentRowsForWindow = (
  rows: ReplayCashAdjustmentStoreRow[],
  bars: OhlcvBar[],
  localWindowStart: number,
): ReplayCashAdjustmentRecord[] => {
  if (!rows.length || !bars.length) {
    return [];
  }
  return rows
    .map((row) => {
      const barIndex = Math.floor(normalizeNumber(row.barIndex, Number.NaN)) - localWindowStart;
      if (!Number.isFinite(barIndex) || barIndex < 0 || barIndex >= bars.length) {
        return null;
      }
      const barTs = bars[barIndex]?.ts ?? '';
      return {
        kind: row.kind,
        bar_index: barIndex,
        amount: normalizeNumber(row.amount),
        ts: row.ts || barTs,
        created_at: row.createdAt || row.ts || barTs,
      } satisfies ReplayCashAdjustmentRecord;
    })
    .filter((item): item is ReplayCashAdjustmentRecord => Boolean(item))
    .sort(sortReplayCashAdjustmentRecords);
};

const encodeDrawingPointTuple = (value: unknown): ReplayDrawingPointTuple | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const timestamp = normalizeNumber(source.timestamp, Number.NaN);
  const pointValue = normalizeNumber(source.value, Number.NaN);
  if (!Number.isFinite(timestamp) || !Number.isFinite(pointValue)) {
    return null;
  }
  return [timestamp, pointValue];
};

const decodeDrawingPointTuple = (value: unknown): { timestamp: number; value: number } | null => {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const timestamp = normalizeNumber(value[0], Number.NaN);
  const pointValue = normalizeNumber(value[1], Number.NaN);
  if (!Number.isFinite(timestamp) || !Number.isFinite(pointValue)) {
    return null;
  }
  return {
    timestamp,
    value: pointValue,
  };
};

export const encodeReplayDrawingsCompact = (drawings: unknown[]): ReplayDrawingCompactTuple[] => {
  if (!Array.isArray(drawings) || !drawings.length) {
    return [];
  }
  return drawings
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const source = item as Record<string, unknown>;
      const name = typeof source.name === 'string' ? source.name.trim() : '';
      if (!name) {
        return null;
      }
      const points = (Array.isArray(source.points) ? source.points : [])
        .map((point) => encodeDrawingPointTuple(point))
        .filter((point): point is ReplayDrawingPointTuple => Boolean(point));
      if (!points.length) {
        return null;
      }

      const id = typeof source.id === 'string' ? source.id : '';
      const sourcePeriod =
        typeof source.sourcePeriod === 'string' && source.sourcePeriod.trim()
          ? source.sourcePeriod
          : undefined;
      const visible = source.visible === false ? 0 : undefined;
      const lock = source.lock === true ? 1 : undefined;
      const zLevelRaw = normalizeNumber(source.zLevel, Number.NaN);
      const zLevel = Number.isFinite(zLevelRaw) && zLevelRaw !== 1 ? zLevelRaw : undefined;
      const mode = typeof source.mode === 'string' && source.mode.trim() ? source.mode : undefined;
      const modeSensitivityRaw = normalizeNumber(source.modeSensitivity, Number.NaN);
      const modeSensitivity = Number.isFinite(modeSensitivityRaw) ? modeSensitivityRaw : undefined;
      const needDefaultXAxisFigure = source.needDefaultXAxisFigure === true ? 1 : undefined;
      const styles =
        source.styles &&
        typeof source.styles === 'object' &&
        Object.keys(source.styles as Record<string, unknown>).length
          ? (source.styles as Record<string, unknown>)
          : undefined;
      const extendData = source.extendData !== undefined ? source.extendData : undefined;

      return trimTrailingUndefined<ReplayDrawingCompactTuple[number]>([
        id,
        name,
        points,
        sourcePeriod,
        visible,
        lock,
        zLevel,
        mode,
        modeSensitivity,
        needDefaultXAxisFigure,
        styles,
        extendData,
      ]) as ReplayDrawingCompactTuple;
    })
    .filter((item): item is ReplayDrawingCompactTuple => Boolean(item));
};

export const decodeReplayDrawingsCompact = (raw: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(raw) || !raw.length) {
    return [];
  }
  return raw
    .map((item, index) => {
      if (!Array.isArray(item) || item.length < 3) {
        return null;
      }
      const id = typeof item[0] === 'string' ? item[0] : `ref-drawing-${index + 1}`;
      const name = typeof item[1] === 'string' ? item[1].trim() : '';
      if (!name) {
        return null;
      }
      const pointsRaw = Array.isArray(item[2]) ? item[2] : [];
      const points = pointsRaw
        .map((point) => decodeDrawingPointTuple(point))
        .filter((point): point is { timestamp: number; value: number } => Boolean(point));
      if (!points.length) {
        return null;
      }

      const sourcePeriod = typeof item[3] === 'string' && item[3].trim() ? item[3] : undefined;
      const visible = item[4] === 0 ? false : true;
      const lock = item[5] === 1;
      const zLevelRaw = normalizeNumber(item[6], Number.NaN);
      const zLevel = Number.isFinite(zLevelRaw) ? zLevelRaw : 1;
      const mode = typeof item[7] === 'string' && item[7].trim() ? item[7] : undefined;
      const modeSensitivityRaw = normalizeNumber(item[8], Number.NaN);
      const modeSensitivity = Number.isFinite(modeSensitivityRaw) ? modeSensitivityRaw : undefined;
      const needDefaultXAxisFigure = item[9] === 1;
      const styles =
        item[10] && typeof item[10] === 'object'
          ? (item[10] as Record<string, unknown>)
          : undefined;
      const extendData = item.length >= 12 ? item[11] : undefined;

      const next: Record<string, unknown> = {
        id,
        name,
        points,
        visible,
        lock,
        zLevel,
      };
      if (sourcePeriod) next.sourcePeriod = sourcePeriod;
      if (mode) next.mode = mode;
      if (modeSensitivity !== undefined) next.modeSensitivity = modeSensitivity;
      if (needDefaultXAxisFigure) next.needDefaultXAxisFigure = true;
      if (styles) next.styles = styles;
      if (extendData !== undefined) next.extendData = extendData;
      return next;
    })
    .filter((item): item is Record<string, unknown> => Boolean(item));
};

export const filterReplayDrawingsForWindow = (
  drawings: Record<string, unknown>[],
  bars: OhlcvBar[],
): Record<string, unknown>[] => {
  if (!drawings.length || !bars.length) {
    return [];
  }
  const visibleTimestamps = new Set(
    bars
      .map((bar) => Date.parse(String(bar.ts ?? '')))
      .filter((timestamp) => Number.isFinite(timestamp)),
  );
  if (!visibleTimestamps.size) {
    return [];
  }
  return drawings.filter((drawing) => {
    const points = Array.isArray((drawing as { points?: unknown }).points)
      ? ((drawing as { points?: unknown[] }).points ?? [])
      : [];
    return (
      points.length > 0 &&
      points.every((point) => {
        const timestamp = Number((point as { timestamp?: unknown }).timestamp);
        return Number.isFinite(timestamp) && visibleTimestamps.has(timestamp);
      })
    );
  });
};

const normalizeTradeDirection = (value: unknown): ReplayTradeDirection | null => {
  if (value === 'LONG' || value === 'SHORT') {
    return value;
  }
  return null;
};

const parseTradeRoundObjectForEncode = (
  value: Record<string, unknown>,
): ReplayTradeRoundCompactTuple | null => {
  const direction = normalizeTradeDirection(value.direction);
  if (!direction) {
    return null;
  }
  const entryIndex = Math.floor(normalizeNumber(value.entryIndex, Number.NaN));
  const closeIndex = Math.floor(normalizeNumber(value.closeIndex, Number.NaN));
  const quantity = normalizeNumber(value.quantity, Number.NaN);
  const entryAvgPrice = normalizeNumber(value.entryAvgPrice, Number.NaN);
  const exitAvgPrice = normalizeNumber(value.exitAvgPrice, Number.NaN);
  if (
    !Number.isFinite(entryIndex) ||
    !Number.isFinite(closeIndex) ||
    entryIndex < 0 ||
    closeIndex < entryIndex ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(entryAvgPrice) ||
    entryAvgPrice <= 0 ||
    !Number.isFinite(exitAvgPrice) ||
    exitAvgPrice <= 0
  ) {
    return null;
  }
  const entryTime = typeof value.entryTime === 'string' ? value.entryTime : '';
  const closeTime = typeof value.closeTime === 'string' ? value.closeTime : '';
  return trimTrailingUndefined<ReplayTradeRoundCompactTuple[number]>([
    direction === 'SHORT' ? -1 : 1,
    entryIndex,
    closeIndex,
    quantity,
    entryAvgPrice,
    exitAvgPrice,
    normalizeNumber(value.grossPnl),
    normalizeNumber(value.pnl),
    normalizeNumber(value.returnRate),
    Math.max(0, normalizeNumber(value.mfeRate)),
    Math.max(0, normalizeNumber(value.maeRate)),
    Math.max(0, normalizeNumber(value.entryCost)),
    Math.max(0, normalizeNumber(value.exitCost)),
    entryTime || undefined,
    closeTime || undefined,
  ]) as ReplayTradeRoundCompactTuple;
};

const encodeReplayTradeRoundsCompact = (rounds: unknown[]): ReplayTradeRoundCompactTuple[] => {
  if (!Array.isArray(rounds) || !rounds.length) {
    return [];
  }
  return rounds
    .map((item) =>
      item && typeof item === 'object'
        ? parseTradeRoundObjectForEncode(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is ReplayTradeRoundCompactTuple => Boolean(item));
};

const parseTradeRoundTuple = (tuple: unknown[], index: number): ReplayTradeRoundRecord | null => {
  if (!Array.isArray(tuple) || tuple.length < 13) {
    return null;
  }
  const direction: ReplayTradeDirection =
    Math.floor(normalizeNumber(tuple[0], 1)) === -1 ? 'SHORT' : 'LONG';
  const entryIndex = Math.floor(normalizeNumber(tuple[1], Number.NaN));
  const closeIndex = Math.floor(normalizeNumber(tuple[2], Number.NaN));
  const quantity = normalizeNumber(tuple[3], Number.NaN);
  const entryAvgPrice = normalizeNumber(tuple[4], Number.NaN);
  const exitAvgPrice = normalizeNumber(tuple[5], Number.NaN);
  if (
    !Number.isFinite(entryIndex) ||
    !Number.isFinite(closeIndex) ||
    entryIndex < 0 ||
    closeIndex < entryIndex ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(entryAvgPrice) ||
    entryAvgPrice <= 0 ||
    !Number.isFinite(exitAvgPrice) ||
    exitAvgPrice <= 0
  ) {
    return null;
  }
  const entryTime = typeof tuple[13] === 'string' ? tuple[13] : '';
  const closeTime = typeof tuple[14] === 'string' ? tuple[14] : '';
  return {
    id: `round-${index + 1}`,
    direction,
    entryIndex,
    closeIndex,
    entryTime,
    closeTime,
    holdBars: Math.max(0, closeIndex - entryIndex),
    quantity,
    entryAvgPrice,
    exitAvgPrice,
    grossPnl: normalizeNumber(tuple[6]),
    pnl: normalizeNumber(tuple[7]),
    returnRate: normalizeNumber(tuple[8]),
    mfeRate: Math.max(0, normalizeNumber(tuple[9])),
    maeRate: Math.max(0, normalizeNumber(tuple[10])),
    entryCost: Math.max(0, normalizeNumber(tuple[11])),
    exitCost: Math.max(0, normalizeNumber(tuple[12])),
  };
};

const decodeReplayTradeRoundsCompact = (raw: unknown): ReplayTradeRoundRecord[] => {
  if (!Array.isArray(raw) || !raw.length) {
    return [];
  }
  return raw
    .map((item, index) => (Array.isArray(item) ? parseTradeRoundTuple(item, index) : null))
    .filter((item): item is ReplayTradeRoundRecord => Boolean(item))
    .sort((left, right) => {
      if (left.entryIndex !== right.entryIndex) {
        return left.entryIndex - right.entryIndex;
      }
      return left.closeIndex - right.closeIndex;
    });
};

export const normalizeReplayTradeRounds = (rounds: unknown[]): ReplayTradeRoundRecord[] =>
  decodeReplayTradeRoundsCompact(encodeReplayTradeRoundsCompact(rounds));

export const normalizePortablePreviewRecord = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const buildReplayEquityMetrics = (
  initialCapital: number,
  bars: OhlcvBar[],
  fills: ReplayFillRecord[],
  entryIndexRaw: unknown,
  cashAdjustments: ReplayCashAdjustmentRecord[] = [],
): {
  equityCurve: ReplayCurvePoint[];
  drawdownCurve: ReplayCurvePoint[];
  finalEquity: number;
  equityReturnRate: number;
} =>
  calculateSharedReplayEquityMetrics({
    initialCapital,
    bars,
    fills,
    cashAdjustments,
    entryIndex: Math.floor(normalizeNumber(entryIndexRaw, 0)),
  });

export const buildReplayRefMeta = (replay: unknown): ReplayRefMeta | null => {
  if (!replay || typeof replay !== 'object') {
    return null;
  }
  const source = replay as Record<string, unknown>;
  const bars = Array.isArray(source.bars) ? (source.bars as Array<{ ts?: unknown }>) : [];
  const firstTs: string | null = typeof bars[0]?.ts === 'string' ? String(bars[0]?.ts) : null;
  const lastTs: string | null =
    typeof bars[bars.length - 1]?.ts === 'string' ? String(bars[bars.length - 1]?.ts) : null;
  return {
    storage: 'REF',
    version: 2,
    startTs: firstTs,
    endTs: lastTs,
    barCount: bars.length,
  };
};

export const normalizeStoredReplaySettings = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};
