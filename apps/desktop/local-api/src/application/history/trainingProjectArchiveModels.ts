// SPDX-License-Identifier: GPL-3.0-only

import { appError } from '../../kernel/appError.js';
import type { ArchiveReplayFill } from '../ports/infrastructure/db/history/historyStore.js';

export type ReplayBar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ArchiveSourceBar = ReplayBar & {
  displayIndex: number;
  startRawIndex: number;
  endRawIndex: number;
};

export type SessionSnapshotForArchive = {
  session: {
    id: string;
    symbol: string;
    timeframe?: string;
    created_at: string;
    start_index: number;
    entry_index: number;
    cursor_index: number;
    [key: string]: unknown;
  };
  fills: ArchiveReplayFill[];
  fillsTotal: number;
  nextFillCursor?: string | null;
  drawings: unknown[];
  [key: string]: unknown;
};

export type SessionPositionForArchive = {
  sessionId: string;
  instrumentId: string;
  symbol: string;
  qty: number;
};

export type ArchiveCashAdjustment = {
  kind: 'LONG_FINANCING' | 'SHORT_BORROW' | 'FUNDING';
  bar_index: number;
  amount: number;
  ts: string;
  created_at: string;
};

export type ReplayCurvePoint = {
  ts: string;
  value: number;
};

export type ArchivedBaseTimeframe = '1m' | '5m' | '1h' | '1d';
export type ArchivedDisplayPeriod =
  | '1m'
  | '5m'
  | '1h'
  | '1d'
  | '1w'
  | '1month'
  | '1year';

export const normalizeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const round = (value: number, digits = 8): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeReplayBar = (value: unknown): ReplayBar | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const ts = typeof source.ts === 'string' ? source.ts : '';
  if (!ts) {
    return null;
  }
  const open = normalizeNumber(source.open, Number.NaN);
  const high = normalizeNumber(source.high, Number.NaN);
  const low = normalizeNumber(source.low, Number.NaN);
  const close = normalizeNumber(source.close, Number.NaN);
  const volume = normalizeNumber(source.volume, Number.NaN);
  if (![open, high, low, close, volume].every((item) => Number.isFinite(item))) {
    return null;
  }
  return {
    ts,
    open,
    high,
    low,
    close,
    volume,
  };
};

export const normalizeArchiveSourceBar = (value: unknown): ArchiveSourceBar | null => {
  const bar = normalizeReplayBar(value);
  if (!bar || !value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const displayIndex = Math.max(
    0,
    Math.floor(normalizeNumber(source.displayIndex, Number.NaN)),
  );
  const startRawIndex = Math.max(
    0,
    Math.floor(normalizeNumber(source.startRawIndex, Number.NaN)),
  );
  const endRawIndex = Math.max(
    startRawIndex,
    Math.floor(normalizeNumber(source.endRawIndex, startRawIndex)),
  );
  if (![displayIndex, startRawIndex, endRawIndex].every((item) => Number.isFinite(item))) {
    return null;
  }
  return {
    ...bar,
    displayIndex,
    startRawIndex,
    endRawIndex,
  };
};

export const normalizeArchivedBaseTimeframe = (value: unknown): ArchivedBaseTimeframe => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === '1m' ||
    normalized === '5m' ||
    normalized === '1h' ||
    normalized === '1d'
  ) {
    return normalized;
  }
  return '1d';
};

export const normalizeArchivedDisplayPeriod = (value: unknown): ArchivedDisplayPeriod => {
  const normalized = String(value || '').trim().toLowerCase();
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
  throw appError('INVALID_PARAMS', { displayPeriod: normalized });
};
