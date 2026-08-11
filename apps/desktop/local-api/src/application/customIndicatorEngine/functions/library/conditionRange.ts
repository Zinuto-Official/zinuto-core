// SPDX-License-Identifier: GPL-3.0-only

import type {
  BooleanOperand,
  NumericOperand,
  NumericSeries
} from '../../runtime/index.js';

import {
  isFiniteNumber,
  nanSeries,
  resolveIntegerAt,
  toConditionSeries,
  toNumericSeries
} from '../helpers.js';

import {
  buildInvalidPrefix,
  resolveLength
} from './internal.js';

import {
  EMA,
  IF,
  REF,
  SMA
} from './rollingStatistics.js';

export const BETWEEN = (
  input: NumericOperand,
  lower: NumericOperand,
  upper: NumericOperand
): NumericSeries => {
  const length = resolveLength(input, lower, upper);
  const source = toNumericSeries(input, length);
  const loSeries = toNumericSeries(lower, length);
  const upSeries = toNumericSeries(upper, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const x = source[index];
    const lo = loSeries[index];
    const up = upSeries[index];
    if (!isFiniteNumber(x) || !isFiniteNumber(lo) || !isFiniteNumber(up)) {
      result[index] = Number.NaN;
      continue;
    }
    const min = Math.min(lo, up);
    const max = Math.max(lo, up);
    result[index] = x >= min && x <= max ? 1 : 0;
  }
  return result;
};

export const IFF = (
  condition: BooleanOperand | NumericOperand,
  trueValue: NumericOperand,
  falseValue: NumericOperand
): NumericSeries => IF(condition, trueValue, falseValue);

export const NOT_FN = (condition: BooleanOperand | NumericOperand): NumericSeries => {
  const length = resolveLength(condition);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    result[index] = cond[index] ? 0 : 1;
  }
  return result;
};

export const AND_FN = (
  left: BooleanOperand | NumericOperand,
  right: BooleanOperand | NumericOperand
): NumericSeries => {
  const length = resolveLength(left, right);
  const leftCond = toConditionSeries(left, length);
  const rightCond = toConditionSeries(right, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    result[index] = leftCond[index] && rightCond[index] ? 1 : 0;
  }
  return result;
};

export const OR_FN = (
  left: BooleanOperand | NumericOperand,
  right: BooleanOperand | NumericOperand
): NumericSeries => {
  const length = resolveLength(left, right);
  const leftCond = toConditionSeries(left, length);
  const rightCond = toConditionSeries(right, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    result[index] = leftCond[index] || rightCond[index] ? 1 : 0;
  }
  return result;
};

export const REFX = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 0, allowZero: true });
    const sourceIndex = index + n;
    if (sourceIndex < 0 || sourceIndex >= length) {
      result[index] = Number.NaN;
      continue;
    }
    const value = source[sourceIndex];
    result[index] = Number.isFinite(value) ? value : Number.NaN;
  }
  return result;
};

export const REFXV = (input: NumericOperand, period: NumericOperand): NumericSeries =>
  REFX(input, period);

export const DIFF = (input: NumericOperand, period: NumericOperand = 1): NumericSeries => {
  const left = toNumericSeries(input, resolveLength(input, period));
  const right = REF(input, period);
  const length = Math.max(left.length, right.length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];
    result[index] = isFiniteNumber(l) && isFiniteNumber(r) ? l - r : Number.NaN;
  }
  return result;
};

export const VALUEWHEN = (
  condition: BooleanOperand | NumericOperand,
  input: NumericOperand
): NumericSeries => {
  const length = resolveLength(condition, input);
  const cond = toConditionSeries(condition, length);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  let lastValue = Number.NaN;
  for (let index = 0; index < length; index += 1) {
    if (cond[index] && isFiniteNumber(source[index])) {
      lastValue = source[index];
    }
    result[index] = isFiniteNumber(lastValue) ? lastValue : Number.NaN;
  }
  return result;
};

export const BARSSINCE = (condition: BooleanOperand | NumericOperand): NumericSeries => {
  const length = resolveLength(condition);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);
  let firstTrueIndex = -1;
  for (let index = 0; index < length; index += 1) {
    if (cond[index] && firstTrueIndex < 0) {
      firstTrueIndex = index;
    }
    if (firstTrueIndex < 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = index - firstTrueIndex;
  }
  return result;
};

export const BARSSINCEN = (
  condition: BooleanOperand | NumericOperand,
  period: NumericOperand
): NumericSeries => {
  const length = resolveLength(condition, period);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    let firstTrueIndex = -1;
    for (let cursor = start; cursor <= index; cursor += 1) {
      if (cond[cursor]) {
        firstTrueIndex = cursor;
        break;
      }
    }
    result[index] = firstTrueIndex >= 0 ? index - firstTrueIndex : Number.NaN;
  }
  return result;
};

export const BACKSET = (
  condition: BooleanOperand | NumericOperand,
  period: NumericOperand
): NumericSeries => {
  const length = resolveLength(condition, period);
  const cond = toConditionSeries(condition, length);
  const result = new Array<number>(length).fill(0);
  for (let index = 0; index < length; index += 1) {
    if (!cond[index]) {
      continue;
    }
    const n = resolveIntegerAt(period, index, 1, { min: 0, allowZero: true });
    const span = Math.max(1, n);
    const start = Math.max(0, index - span + 1);
    for (let cursor = start; cursor <= index; cursor += 1) {
      result[cursor] = 1;
    }
  }
  return result;
};

export const CONST = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  let lastFinite = Number.NaN;
  for (let index = length - 1; index >= 0; index -= 1) {
    if (isFiniteNumber(source[index])) {
      lastFinite = source[index];
      break;
    }
  }
  if (!isFiniteNumber(lastFinite)) {
    return nanSeries(length);
  }
  return new Array<number>(length).fill(lastFinite);
};

export const EVERY = (
  condition: BooleanOperand | NumericOperand,
  period: NumericOperand
): NumericSeries => {
  const length = resolveLength(condition, period);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);
  const prefixTrue = new Array<number>(length + 1).fill(0);
  for (let index = 0; index < length; index += 1) {
    prefixTrue[index + 1] = prefixTrue[index] + (cond[index] ? 1 : 0);
  }
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const span = index - start + 1;
    const trueCount = prefixTrue[index + 1] - prefixTrue[start];
    result[index] = trueCount === span ? 1 : 0;
  }
  return result;
};

export const EXIST = (
  condition: BooleanOperand | NumericOperand,
  period: NumericOperand
): NumericSeries => {
  const length = resolveLength(condition, period);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);
  const prefixTrue = new Array<number>(length + 1).fill(0);
  for (let index = 0; index < length; index += 1) {
    prefixTrue[index + 1] = prefixTrue[index] + (cond[index] ? 1 : 0);
  }
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const trueCount = prefixTrue[index + 1] - prefixTrue[start];
    result[index] = trueCount > 0 ? 1 : 0;
  }
  return result;
};

export const LAST = (
  condition: BooleanOperand | NumericOperand,
  periodStart: NumericOperand,
  periodEnd: NumericOperand
): NumericSeries => {
  const length = resolveLength(condition, periodStart, periodEnd);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);
  const prefixTrue = new Array<number>(length + 1).fill(0);
  for (let index = 0; index < length; index += 1) {
    prefixTrue[index + 1] = prefixTrue[index] + (cond[index] ? 1 : 0);
  }
  for (let index = 0; index < length; index += 1) {
    const n1 = resolveIntegerAt(periodStart, index, 0, { min: 0, allowZero: true });
    const n2 = resolveIntegerAt(periodEnd, index, 0, { min: 0, allowZero: true });
    const startOffset = Math.max(n1, n2);
    const endOffset = Math.min(n1, n2);
    const start = index - startOffset;
    const end = index - endOffset;
    if (start < 0 || end < start) {
      result[index] = Number.NaN;
      continue;
    }
    const span = end - start + 1;
    const trueCount = prefixTrue[end + 1] - prefixTrue[start];
    result[index] = trueCount === span ? 1 : 0;
  }
  return result;
};

export const HHVBARS = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const invalidPrefix = buildInvalidPrefix(source);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    if (invalidPrefix[index + 1] - invalidPrefix[start] > 0) {
      result[index] = Number.NaN;
      continue;
    }
    let maxValue = Number.NEGATIVE_INFINITY;
    let maxIndex = -1;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const value = source[cursor];
      if (value >= maxValue) {
        maxValue = value;
        maxIndex = cursor;
      }
    }
    result[index] = maxIndex >= 0 ? index - maxIndex : Number.NaN;
  }
  return result;
};

export const LLVBARS = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const invalidPrefix = buildInvalidPrefix(source);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    if (invalidPrefix[index + 1] - invalidPrefix[start] > 0) {
      result[index] = Number.NaN;
      continue;
    }
    let minValue = Number.POSITIVE_INFINITY;
    let minIndex = -1;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const value = source[cursor];
      if (value <= minValue) {
        minValue = value;
        minIndex = cursor;
      }
    }
    result[index] = minIndex >= 0 ? index - minIndex : Number.NaN;
  }
  return result;
};

export const HOD = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const current = source[index];
    if (!isFiniteNumber(current)) {
      result[index] = Number.NaN;
      continue;
    }
    let rank = 1;
    let valid = true;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const value = source[cursor];
      if (!isFiniteNumber(value)) {
        valid = false;
        break;
      }
      if (value > current) {
        rank += 1;
      }
    }
    result[index] = valid ? rank : Number.NaN;
  }
  return result;
};

export const LOD = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const current = source[index];
    if (!isFiniteNumber(current)) {
      result[index] = Number.NaN;
      continue;
    }
    let rank = 1;
    let valid = true;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const value = source[cursor];
      if (!isFiniteNumber(value)) {
        valid = false;
        break;
      }
      if (value < current) {
        rank += 1;
      }
    }
    result[index] = valid ? rank : Number.NaN;
  }
  return result;
};

export const SUMBARS = (input: NumericOperand, threshold: NumericOperand): NumericSeries => {
  const length = resolveLength(input, threshold);
  const source = toNumericSeries(input, length);
  const target = toNumericSeries(threshold, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const goal = target[index];
    if (!isFiniteNumber(goal)) {
      result[index] = Number.NaN;
      continue;
    }
    if (goal <= 0) {
      result[index] = 0;
      continue;
    }
    let sum = 0;
    let bars = 0;
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const value = source[cursor];
      if (!isFiniteNumber(value)) {
        sum = Number.NaN;
        break;
      }
      sum += value;
      bars += 1;
      if (sum >= goal) {
        break;
      }
    }
    result[index] = Number.isFinite(sum) && sum >= goal ? bars : Number.NaN;
  }
  return result;
};

export const MULAR = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    let product = 1;
    let valid = true;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const value = source[cursor];
      if (!isFiniteNumber(value)) {
        valid = false;
        break;
      }
      product *= value;
      if (!Number.isFinite(product)) {
        valid = false;
        break;
      }
    }
    result[index] = valid ? product : Number.NaN;
  }

  return result;
};

export const TR = (
  high: NumericOperand,
  low: NumericOperand,
  close: NumericOperand
): NumericSeries => {
  const length = resolveLength(high, low, close);
  const highSeries = toNumericSeries(high, length);
  const lowSeries = toNumericSeries(low, length);
  const closeSeries = toNumericSeries(close, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const h = highSeries[index];
    const l = lowSeries[index];
    if (!isFiniteNumber(h) || !isFiniteNumber(l)) {
      result[index] = Number.NaN;
      continue;
    }
    const baseRange = h - l;
    if (index === 0) {
      result[index] = baseRange;
      continue;
    }
    const prevClose = closeSeries[index - 1];
    if (!isFiniteNumber(prevClose)) {
      result[index] = baseRange;
      continue;
    }
    const value = Math.max(
      baseRange,
      Math.abs(h - prevClose),
      Math.abs(l - prevClose)
    );
    result[index] = Number.isFinite(value) ? value : Number.NaN;
  }

  return result;
};

export const REFDATE = (
  input: NumericOperand,
  dateValue: NumericOperand,
  dateSeriesInput: NumericOperand
): NumericSeries => {
  const length = resolveLength(input, dateValue, dateSeriesInput);
  const source = toNumericSeries(input, length);
  const targetDateSeries = toNumericSeries(dateValue, length);
  const dateSeries = toNumericSeries(dateSeriesInput, length);
  const result = nanSeries(length);

  // Use the latest bar on/before current index whose DATE equals requested yyyymmdd.
  for (let index = 0; index < length; index += 1) {
    const target = targetDateSeries[index];
    if (!isFiniteNumber(target)) {
      result[index] = Number.NaN;
      continue;
    }
    const targetDate = Math.trunc(target);
    let matched = Number.NaN;
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      const maybeDate = dateSeries[cursor];
      if (!isFiniteNumber(maybeDate)) {
        continue;
      }
      if (Math.trunc(maybeDate) !== targetDate) {
        continue;
      }
      const value = source[cursor];
      matched = isFiniteNumber(value) ? value : Number.NaN;
      break;
    }
    result[index] = matched;
  }

  return result;
};

export const MEMA = (input: NumericOperand, period: NumericOperand): NumericSeries =>
  SMA(input, period, 1);

export const EXPMA = (input: NumericOperand, period: NumericOperand): NumericSeries =>
  EMA(input, period);
