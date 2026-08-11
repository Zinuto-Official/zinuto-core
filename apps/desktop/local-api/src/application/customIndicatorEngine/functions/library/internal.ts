// SPDX-License-Identifier: GPL-3.0-only

import type {
  NumericOperand,
  NumericSeries
} from '../../runtime/index.js';
import {
  resolveSeriesLength,
} from '../helpers.js';

export const resolveLength = (...operands: unknown[]): number => resolveSeriesLength(...operands);

export type NumericPrefixStats = {
  sum: number[];
  sumSq: number[];
  finiteCount: number[];
};

export type PairPrefixStats = {
  sumLeft: number[];
  sumRight: number[];
  sumProduct: number[];
  finitePairCount: number[];
};

export const buildNumericPrefixStats = (source: NumericSeries): NumericPrefixStats => {
  const length = source.length;
  const sum = new Array<number>(length + 1).fill(0);
  const sumSq = new Array<number>(length + 1).fill(0);
  const finiteCount = new Array<number>(length + 1).fill(0);

  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    const finite = Number.isFinite(value);
    sum[index + 1] = sum[index] + (finite ? value : 0);
    sumSq[index + 1] = sumSq[index] + (finite ? value * value : 0);
    finiteCount[index + 1] = finiteCount[index] + (finite ? 1 : 0);
  }

  return {
    sum,
    sumSq,
    finiteCount
  };
};

export const buildPairPrefixStats = (left: NumericSeries, right: NumericSeries): PairPrefixStats => {
  const length = Math.max(left.length, right.length);
  const sumLeft = new Array<number>(length + 1).fill(0);
  const sumRight = new Array<number>(length + 1).fill(0);
  const sumProduct = new Array<number>(length + 1).fill(0);
  const finitePairCount = new Array<number>(length + 1).fill(0);

  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];
    const valid = Number.isFinite(l) && Number.isFinite(r);
    sumLeft[index + 1] = sumLeft[index] + (valid ? l : 0);
    sumRight[index + 1] = sumRight[index] + (valid ? r : 0);
    sumProduct[index + 1] = sumProduct[index] + (valid ? l * r : 0);
    finitePairCount[index + 1] = finitePairCount[index] + (valid ? 1 : 0);
  }

  return {
    sumLeft,
    sumRight,
    sumProduct,
    finitePairCount
  };
};

export const resolveConstantWindow = (
  operand: NumericOperand,
  fallback: number,
  { min = 1, allowZero = false }: { min?: number; allowZero?: boolean } = {}
): number | null => {
  if (Array.isArray(operand)) {
    return null;
  }
  if (!Number.isFinite(operand)) {
    return null;
  }
  const rounded = Math.floor(operand);
  if (allowZero && rounded === 0) {
    return 0;
  }
  if (rounded < min) {
    return fallback;
  }
  return rounded;
};

export const buildInvalidPrefix = (source: NumericSeries): number[] => {
  const invalid = new Array<number>(source.length + 1).fill(0);
  for (let index = 0; index < source.length; index += 1) {
    invalid[index + 1] = invalid[index] + (Number.isFinite(source[index]) ? 0 : 1);
  }
  return invalid;
};

export type RangeQueryTree = {
  query: (start: number, end: number) => number;
};

export const buildRangeQueryTree = (
  source: NumericSeries,
  mode: 'max' | 'min'
): RangeQueryTree => {
  const length = source.length;
  const identity = mode === 'max' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  const combine =
    mode === 'max' ?
    (left: number, right: number) => Math.max(left, right) :
    (left: number, right: number) => Math.min(left, right);
  let size = 1;
  while (size < length) {
    size <<= 1;
  }
  const tree = new Array<number>(size * 2).fill(identity);

  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    tree[size + index] = Number.isFinite(value) ? value : identity;
  }

  for (let index = size - 1; index > 0; index -= 1) {
    tree[index] = combine(tree[index * 2], tree[index * 2 + 1]);
  }

  const query = (start: number, end: number): number => {
    if (start > end) {
      return identity;
    }

    let left = start + size;
    let right = end + size;
    let leftResult = identity;
    let rightResult = identity;
    while (left <= right) {
      if ((left & 1) === 1) {
        leftResult = combine(leftResult, tree[left]);
        left += 1;
      }
      if ((right & 1) === 0) {
        rightResult = combine(tree[right], rightResult);
        right -= 1;
      }
      left >>= 1;
      right >>= 1;
    }
    return combine(leftResult, rightResult);
  };

  return {
    query
  };
};

const MILLIS_PER_DAY = 86_400_000;

const splitDateNumber = (value: number): { year: number; month: number; day: number } | null => {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.trunc(Math.abs(value));
  const year = Math.trunc(rounded / 10_000);
  const month = Math.trunc((rounded % 10_000) / 100);
  const day = rounded % 100;
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    year,
    month,
    day
  };
};

export const dateNumberToEpochDay = (value: number): number => {
  const parts = splitDateNumber(value);
  if (!parts) {
    return Number.NaN;
  }
  const ms = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Number.isFinite(ms) ? Math.floor(ms / MILLIS_PER_DAY) : Number.NaN;
};

export const epochDayToDateNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }
  const day = Math.trunc(value);
  const dt = new Date(day * MILLIS_PER_DAY);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return Number.NaN;
  }
  return y * 10_000 + m * 100 + d;
};

export const decodeTimeNumber = (value: number): { hour: number; minute: number; second: number } | null => {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.trunc(Math.abs(value));
  let hour = 0;
  let minute = 0;
  let second = 0;

  if (rounded <= 23_59) {
    hour = Math.trunc(rounded / 100);
    minute = rounded % 100;
  } else {
    hour = Math.trunc(rounded / 10_000);
    minute = Math.trunc((rounded % 10_000) / 100);
    second = rounded % 100;
  }

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return {
    hour,
    minute,
    second
  };
};
