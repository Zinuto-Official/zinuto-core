// SPDX-License-Identifier: GPL-3.0-only

import type { KLineData } from 'klinecharts';
import { parseTimestampMs } from '@zinuto/shared/marketTime';

const sanitizeNumericInput = (input: string): string => {
  let result = input.replace(/[^\d.]/g, '');
  const dotIndex = result.indexOf('.');
  if (dotIndex >= 0) {
    result = `${result.slice(0, dotIndex + 1)}${result.slice(dotIndex + 1).replace(/\./g, '')}`;
  }
  return result;
};

const formatInputThousands = (input: string): string => {
  if (!input) {
    return '';
  }
  const [rawInt, rawDecimal] = input.split('.');
  const intClean = rawInt.replace(/^0+(?=\d)/, '') || '0';
  const intPart = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rawDecimal !== undefined ? `${intPart}.${rawDecimal}` : intPart;
};

export const mapBarToKline = (bar: {
  ts?: string;
  bucketStartMs?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}): KLineData => ({
  timestamp: Number.isFinite(Number(bar.bucketStartMs))
    ? Number(bar.bucketStartMs)
    : parseTimestampMs(String(bar.ts ?? '')),
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume
});

export const normalizeInput = (raw: string) => formatInputThousands(sanitizeNumericInput(raw));

export const normalizeIntegerInput = (raw: string): string => {
  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) {
    return '';
  }
  const normalized = digitsOnly.replace(/^0+(?=\d)/, '');
  return formatInputThousands(normalized);
};

export const formatRateInput = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const fixed = value.toFixed(8);
  return fixed.replace(/\.?0+$/, '');
};
