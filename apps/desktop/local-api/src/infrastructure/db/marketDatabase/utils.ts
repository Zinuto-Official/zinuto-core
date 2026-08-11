// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs } from '@zinuto/shared/marketTime';

export const toSafeInt = (value: unknown): number => {
  if (typeof value === 'bigint') {
    return Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const normalized = trimmed.replace(/,/g, '');
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.floor(numeric));
    }
    const matched = normalized.match(/^(\d+)/u);
    if (matched) {
      const parsed = Number(matched[1]);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }
    return 0;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }
  return Math.max(0, Math.floor(numberValue));
};

export const toSafeNumber = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return n;
};

export const toEpochMs = (ts: string): number | null => {
  const value = String(ts ?? '').trim();
  if (!value) {
    return null;
  }
  const parsed = parseTimestampMs(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.floor(parsed);
};

export const toEpochMsBigInt = (ts: string): bigint | null => {
  const epochMs = toEpochMs(ts);
  if (epochMs === null) {
    return null;
  }
  return BigInt(epochMs);
};

export const toIsoFromEpochMs = (value: unknown): string | null => {
  if (typeof value === 'bigint') {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return null;
    }
    return new Date(n).toISOString();
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return new Date(n).toISOString();
};

export const formatVersionClose = (value: unknown): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(6) : 'NaN';
};
