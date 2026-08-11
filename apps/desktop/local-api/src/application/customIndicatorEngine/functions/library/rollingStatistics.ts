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
  buildNumericPrefixStats,
  buildPairPrefixStats,
  buildRangeQueryTree,
  resolveConstantWindow,
  resolveLength
} from './internal.js';

export const REF = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 0, allowZero: true });
    const sourceIndex = index - n;
    if (sourceIndex < 0 || sourceIndex >= length) {
      result[index] = Number.NaN;
      continue;
    }
    const value = source[sourceIndex];
    result[index] = Number.isFinite(value) ? value : Number.NaN;
  }

  return result;
};

export const REFV = (input: NumericOperand, period: NumericOperand): NumericSeries =>
  REF(input, period);

export const MA = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const stats = buildNumericPrefixStats(source);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }

    const count = index - start + 1;
    const finiteCount = stats.finiteCount[index + 1] - stats.finiteCount[start];
    if (finiteCount !== count || count <= 0) {
      result[index] = Number.NaN;
      continue;
    }

    const sum = stats.sum[index + 1] - stats.sum[start];
    result[index] = sum / count;
  }

  return result;
};

export const EMA = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);

  let previous = Number.NaN;
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1 });
    const alpha = 2 / (n + 1);
    const current = source[index];

    if (!Number.isFinite(current)) {
      result[index] = Number.isFinite(previous) ? previous : Number.NaN;
      previous = result[index];
      continue;
    }

    if (!Number.isFinite(previous)) {
      result[index] = current;
      previous = current;
      continue;
    }

    const next = alpha * current + (1 - alpha) * previous;
    result[index] = Number.isFinite(next) ? next : Number.NaN;
    previous = result[index];
  }

  return result;
};

// Chinese-formula SMA: Y = (M * X + (N - M) * Y_PREV) / N
export const SMA = (
  input: NumericOperand,
  period: NumericOperand,
  weight: NumericOperand
): NumericSeries => {
  const length = resolveLength(input, period, weight);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);

  let previous = Number.NaN;
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1 });
    const mRaw = resolveIntegerAt(weight, index, 1, { min: 0, allowZero: true, absolute: false });
    const m = Math.max(0, Math.min(n, mRaw));
    const x = source[index];

    if (!Number.isFinite(x)) {
      result[index] = Number.NaN;
      previous = result[index];
      continue;
    }

    if (!Number.isFinite(previous)) {
      result[index] = x;
      previous = result[index];
      continue;
    }

    const next = (m * x + (n - m) * previous) / n;
    result[index] = Number.isFinite(next) ? next : Number.NaN;
    previous = result[index];
  }

  return result;
};

export const HHV = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const invalidPrefix = buildInvalidPrefix(source);
  const constantPeriod = resolveConstantWindow(period, 1, { min: 1, allowZero: true });

  if (constantPeriod === 0) {
    let maxValue = Number.NEGATIVE_INFINITY;
    let valid = true;
    for (let index = 0; index < length; index += 1) {
      const value = source[index];
      if (!Number.isFinite(value)) {
        valid = false;
        result[index] = Number.NaN;
        continue;
      }
      if (!valid) {
        result[index] = Number.NaN;
        continue;
      }
      maxValue = Math.max(maxValue, value);
      result[index] = maxValue;
    }
    return result;
  }

  if (constantPeriod && constantPeriod > 0) {
    const deque: number[] = [];
    let head = 0;
    for (let index = 0; index < length; index += 1) {
      const value = source[index];
      while (head < deque.length && deque[head] < index - constantPeriod + 1) {
        head += 1;
      }
      if (Number.isFinite(value)) {
        while (deque.length > head && source[deque[deque.length - 1]] <= value) {
          deque.pop();
        }
        deque.push(index);
      }

      const start = index - constantPeriod + 1;
      if (start < 0) {
        result[index] = Number.NaN;
        continue;
      }
      if (invalidPrefix[index + 1] - invalidPrefix[start] > 0) {
        result[index] = Number.NaN;
        continue;
      }
      result[index] = head < deque.length ? source[deque[head]] : Number.NaN;
    }
    return result;
  }

  const rangeTree = buildRangeQueryTree(source, 'max');

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
    result[index] = rangeTree.query(start, index);
  }

  return result;
};

export const LLV = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const invalidPrefix = buildInvalidPrefix(source);
  const constantPeriod = resolveConstantWindow(period, 1, { min: 1, allowZero: true });

  if (constantPeriod === 0) {
    let minValue = Number.POSITIVE_INFINITY;
    let valid = true;
    for (let index = 0; index < length; index += 1) {
      const value = source[index];
      if (!Number.isFinite(value)) {
        valid = false;
        result[index] = Number.NaN;
        continue;
      }
      if (!valid) {
        result[index] = Number.NaN;
        continue;
      }
      minValue = Math.min(minValue, value);
      result[index] = minValue;
    }
    return result;
  }

  if (constantPeriod && constantPeriod > 0) {
    const deque: number[] = [];
    let head = 0;
    for (let index = 0; index < length; index += 1) {
      const value = source[index];
      while (head < deque.length && deque[head] < index - constantPeriod + 1) {
        head += 1;
      }
      if (Number.isFinite(value)) {
        while (deque.length > head && source[deque[deque.length - 1]] >= value) {
          deque.pop();
        }
        deque.push(index);
      }

      const start = index - constantPeriod + 1;
      if (start < 0) {
        result[index] = Number.NaN;
        continue;
      }
      if (invalidPrefix[index + 1] - invalidPrefix[start] > 0) {
        result[index] = Number.NaN;
        continue;
      }
      result[index] = head < deque.length ? source[deque[head]] : Number.NaN;
    }
    return result;
  }

  const rangeTree = buildRangeQueryTree(source, 'min');

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
    result[index] = rangeTree.query(start, index);
  }

  return result;
};

export const SUM = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const stats = buildNumericPrefixStats(source);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }

    const count = index - start + 1;
    const finiteCount = stats.finiteCount[index + 1] - stats.finiteCount[start];
    if (finiteCount !== count || count <= 0) {
      result[index] = Number.NaN;
      continue;
    }

    const sum = stats.sum[index + 1] - stats.sum[start];
    result[index] = sum;
  }

  return result;
};

export const COUNT = (
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
    result[index] = prefixTrue[index + 1] - prefixTrue[start];
  }

  return result;
};

export const ALIGNRIGHT = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const finiteValues: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (isFiniteNumber(value)) {
      finiteValues.push(value);
    }
  }
  const result = nanSeries(length);
  const offset = Math.max(0, length - finiteValues.length);
  for (let index = 0; index < finiteValues.length; index += 1) {
    result[offset + index] = finiteValues[index] as number;
  }
  return result;
};

export const MAX = (left: NumericOperand, right: NumericOperand): NumericSeries => {
  const length = resolveLength(left, right);
  const leftSeries = toNumericSeries(left, length);
  const rightSeries = toNumericSeries(right, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const l = leftSeries[index];
    const r = rightSeries[index];
    result[index] = Number.isFinite(l) && Number.isFinite(r) ? Math.max(l, r) : Number.NaN;
  }
  return result;
};

export const MIN = (left: NumericOperand, right: NumericOperand): NumericSeries => {
  const length = resolveLength(left, right);
  const leftSeries = toNumericSeries(left, length);
  const rightSeries = toNumericSeries(right, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const l = leftSeries[index];
    const r = rightSeries[index];
    result[index] = Number.isFinite(l) && Number.isFinite(r) ? Math.min(l, r) : Number.NaN;
  }
  return result;
};

export const ABS = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = Number.isFinite(value) ? Math.abs(value) : Number.NaN;
  }
  return result;
};

export const REVERSE = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? -value : Number.NaN;
  }
  return result;
};

export const SIGN = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value)) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = value > 0 ? 1 : (value < 0 ? -1 : 0);
  }
  return result;
};

export const SGN = (input: NumericOperand): NumericSeries => SIGN(input);

export const MOD = (left: NumericOperand, right: NumericOperand): NumericSeries => {
  const length = resolveLength(left, right);
  const leftSeries = toNumericSeries(left, length);
  const rightSeries = toNumericSeries(right, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const l = leftSeries[index];
    const r = rightSeries[index];
    if (!isFiniteNumber(l) || !isFiniteNumber(r) || r === 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = l % r;
  }
  return result;
};

export const IF = (
  condition: BooleanOperand | NumericOperand,
  trueValue: NumericOperand,
  falseValue: NumericOperand
): NumericSeries => {
  const length = resolveLength(condition, trueValue, falseValue);
  const cond = toConditionSeries(condition, length);
  const trueSeries = toNumericSeries(trueValue, length);
  const falseSeries = toNumericSeries(falseValue, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const selected = cond[index] ? trueSeries[index] : falseSeries[index];
    result[index] = Number.isFinite(selected) ? selected : Number.NaN;
  }

  return result;
};

// CROSS returns numeric signal series: 1 means upward cross this bar, 0 means no cross, first bar NaN.
export const CROSS = (left: NumericOperand, right: NumericOperand): NumericSeries => {
  const length = resolveLength(left, right);
  const leftSeries = toNumericSeries(left, length);
  const rightSeries = toNumericSeries(right, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    if (index === 0) {
      result[index] = Number.NaN;
      continue;
    }
    const currentLeft = leftSeries[index];
    const currentRight = rightSeries[index];
    const previousLeft = leftSeries[index - 1];
    const previousRight = rightSeries[index - 1];

    if (
      !Number.isFinite(currentLeft) ||
      !Number.isFinite(currentRight) ||
      !Number.isFinite(previousLeft) ||
      !Number.isFinite(previousRight)
    ) {
      result[index] = Number.NaN;
      continue;
    }

    result[index] = currentLeft > currentRight && previousLeft <= previousRight ? 1 : 0;
  }

  return result;
};

// BARSLAST returns bars count since last true condition; no previous true => NaN.
export const BARSLAST = (condition: BooleanOperand | NumericOperand): NumericSeries => {
  const length = resolveLength(condition);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);

  let lastTrueIndex = -1;
  for (let index = 0; index < length; index += 1) {
    if (cond[index]) {
      lastTrueIndex = index;
      result[index] = 0;
      continue;
    }

    if (lastTrueIndex < 0) {
      result[index] = Number.NaN;
      continue;
    }

    result[index] = index - lastTrueIndex;
  }

  return result;
};

export const BARSNEXT = (condition: BooleanOperand | NumericOperand): NumericSeries => {
  const length = resolveLength(condition);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);
  let nextTrueIndex = -1;

  for (let index = length - 1; index >= 0; index -= 1) {
    if (cond[index]) {
      nextTrueIndex = index;
      result[index] = 0;
      continue;
    }
    result[index] = nextTrueIndex >= 0 ? nextTrueIndex - index : Number.NaN;
  }

  return result;
};

export const BARSLASTCOUNT = (condition: BooleanOperand | NumericOperand): NumericSeries => {
  const length = resolveLength(condition);
  const cond = toConditionSeries(condition, length);
  const result = nanSeries(length);
  let consecutive = 0;
  for (let index = 0; index < length; index += 1) {
    if (cond[index]) {
      consecutive += 1;
      result[index] = consecutive;
      continue;
    }
    consecutive = 0;
    result[index] = 0;
  }
  return result;
};

export const STD = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const stats = buildNumericPrefixStats(source);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const count = index - start + 1;
    const finiteCount = stats.finiteCount[index + 1] - stats.finiteCount[start];
    if (finiteCount !== count || count <= 0) {
      result[index] = Number.NaN;
      continue;
    }

    const sum = stats.sum[index + 1] - stats.sum[start];
    const sumSq = stats.sumSq[index + 1] - stats.sumSq[start];
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    result[index] = variance >= 0 ? Math.sqrt(variance) : 0;
  }

  return result;
};

export const WMA = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const prefixSum = new Array<number>(length + 1).fill(0);
  const prefixWeighted = new Array<number>(length + 1).fill(0);
  const invalidPrefix = new Array<number>(length + 1).fill(0);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    const valid = Number.isFinite(value);
    prefixSum[index + 1] = prefixSum[index] + (valid ? value : 0);
    prefixWeighted[index + 1] = prefixWeighted[index] + (valid ? value * (index + 1) : 0);
    invalidPrefix[index + 1] = invalidPrefix[index] + (valid ? 0 : 1);
  }

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const span = n === 0 ? index + 1 : n;
    const start = index - span + 1;
    if (start < 0 || span <= 0) {
      result[index] = Number.NaN;
      continue;
    }
    if (invalidPrefix[index + 1] - invalidPrefix[start] > 0) {
      result[index] = Number.NaN;
      continue;
    }
    const sum = prefixSum[index + 1] - prefixSum[start];
    const weightedByIndex = prefixWeighted[index + 1] - prefixWeighted[start];
    const weightedSum = weightedByIndex - start * sum;
    const weightSum = (span * (span + 1)) / 2;
    result[index] = weightSum > 0 ? weightedSum / weightSum : Number.NaN;
  }

  return result;
};

export const DMA = (input: NumericOperand, alpha: NumericOperand): NumericSeries => {
  const length = resolveLength(input, alpha);
  const source = toNumericSeries(input, length);
  const alphaSeries = toNumericSeries(alpha, length);
  const result = nanSeries(length);

  let previous = Number.NaN;
  for (let index = 0; index < length; index += 1) {
    const x = source[index];
    const aRaw = alphaSeries[index];
    if (!Number.isFinite(x) || !Number.isFinite(aRaw)) {
      result[index] = Number.NaN;
      previous = result[index];
      continue;
    }
    const a = Math.max(0, Math.min(1, aRaw));
    if (!Number.isFinite(previous)) {
      result[index] = x;
      previous = result[index];
      continue;
    }
    const next = a * x + (1 - a) * previous;
    result[index] = Number.isFinite(next) ? next : Number.NaN;
    previous = result[index];
  }

  return result;
};

export const AVEDEV = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const stats = buildNumericPrefixStats(source);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const count = index - start + 1;
    if (count <= 0) {
      result[index] = Number.NaN;
      continue;
    }

    const finiteCount = stats.finiteCount[index + 1] - stats.finiteCount[start];
    if (finiteCount !== count) {
      result[index] = Number.NaN;
      continue;
    }

    const sum = stats.sum[index + 1] - stats.sum[start];
    const mean = sum / count;
    let devSum = 0;
    for (let cursor = start; cursor <= index; cursor += 1) {
      devSum += Math.abs(source[cursor] - mean);
    }
    result[index] = devSum / count;
  }

  return result;
};

export const VAR = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const stats = buildNumericPrefixStats(source);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const count = index - start + 1;
    if (count <= 0) {
      result[index] = Number.NaN;
      continue;
    }

    const finiteCount = stats.finiteCount[index + 1] - stats.finiteCount[start];
    if (finiteCount !== count) {
      result[index] = Number.NaN;
      continue;
    }
    const sum = stats.sum[index + 1] - stats.sum[start];
    const sumSq = stats.sumSq[index + 1] - stats.sumSq[start];
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    result[index] = variance >= 0 ? variance : 0;
  }

  return result;
};

export const STDP = (input: NumericOperand, period: NumericOperand): NumericSeries =>
  STD(input, period);

export const VARP = (input: NumericOperand, period: NumericOperand): NumericSeries =>
  VAR(input, period);

export const DEVSQ = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const stats = buildNumericPrefixStats(source);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const count = index - start + 1;
    if (count <= 0) {
      result[index] = Number.NaN;
      continue;
    }
    const finiteCount = stats.finiteCount[index + 1] - stats.finiteCount[start];
    if (finiteCount !== count) {
      result[index] = Number.NaN;
      continue;
    }
    const sum = stats.sum[index + 1] - stats.sum[start];
    const sumSq = stats.sumSq[index + 1] - stats.sumSq[start];
    const mean = sum / count;
    const devsq = sumSq - count * mean * mean;
    result[index] = devsq >= 0 ? devsq : 0;
  }

  return result;
};

export const COVAR = (
  left: NumericOperand,
  right: NumericOperand,
  period: NumericOperand
): NumericSeries => {
  const length = resolveLength(left, right, period);
  const leftSeries = toNumericSeries(left, length);
  const rightSeries = toNumericSeries(right, length);
  const result = nanSeries(length);
  const pairStats = buildPairPrefixStats(leftSeries, rightSeries);

  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const count = index - start + 1;
    if (count <= 0) {
      result[index] = Number.NaN;
      continue;
    }

    const finitePairCount = pairStats.finitePairCount[index + 1] - pairStats.finitePairCount[start];
    if (finitePairCount !== count) {
      result[index] = Number.NaN;
      continue;
    }
    const sumL = pairStats.sumLeft[index + 1] - pairStats.sumLeft[start];
    const sumR = pairStats.sumRight[index + 1] - pairStats.sumRight[start];
    const sumLR = pairStats.sumProduct[index + 1] - pairStats.sumProduct[start];
    const meanL = sumL / count;
    const meanR = sumR / count;
    result[index] = sumLR / count - meanL * meanR;
  }

  return result;
};

export const CORR = (
  left: NumericOperand,
  right: NumericOperand,
  period: NumericOperand
): NumericSeries => {
  const covariance = COVAR(left, right, period);
  const varianceLeft = VAR(left, period);
  const varianceRight = VAR(right, period);
  const length = resolveLength(covariance, varianceLeft, varianceRight);
  const covSeries = toNumericSeries(covariance, length);
  const varLeftSeries = toNumericSeries(varianceLeft, length);
  const varRightSeries = toNumericSeries(varianceRight, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const cov = covSeries[index];
    const varL = varLeftSeries[index];
    const varR = varRightSeries[index];
    if (!isFiniteNumber(cov) || !isFiniteNumber(varL) || !isFiniteNumber(varR)) {
      result[index] = Number.NaN;
      continue;
    }
    if (varL <= 0 || varR <= 0) {
      result[index] = Number.NaN;
      continue;
    }
    const denom = Math.sqrt(varL * varR);
    result[index] = denom > 0 ? cov / denom : Number.NaN;
  }

  return result;
};

export const RELATE = (
  left: NumericOperand,
  right: NumericOperand,
  period: NumericOperand
): NumericSeries =>
  CORR(left, right, period);

export const VOLAT = (
  input: NumericOperand,
  period: NumericOperand,
  annualBars: NumericOperand = 250
): NumericSeries => {
  const length = resolveLength(input, period, annualBars);
  const source = toNumericSeries(input, length);
  const annualSeries = toNumericSeries(annualBars, length);
  const logReturns = nanSeries(length);

  for (let index = 1; index < length; index += 1) {
    const current = source[index];
    const previous = source[index - 1];
    if (!isFiniteNumber(current) || !isFiniteNumber(previous) || current <= 0 || previous <= 0) {
      logReturns[index] = Number.NaN;
      continue;
    }
    logReturns[index] = Math.log(current / previous);
  }

  const sigma = STD(logReturns, period);
  const sigmaSeries = toNumericSeries(sigma, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const vol = sigmaSeries[index];
    const annual = annualSeries[index];
    if (!isFiniteNumber(vol) || !isFiniteNumber(annual) || annual <= 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = vol * Math.sqrt(annual) * 100;
  }

  return result;
};

export const RSI = (input: NumericOperand, period: NumericOperand): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const diff = nanSeries(length);
  const rise = nanSeries(length);
  const absDiff = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    if (index === 0) {
      diff[index] = Number.NaN;
      rise[index] = Number.NaN;
      absDiff[index] = Number.NaN;
      continue;
    }
    const current = source[index];
    const previous = source[index - 1];
    if (!isFiniteNumber(current) || !isFiniteNumber(previous)) {
      diff[index] = Number.NaN;
      rise[index] = Number.NaN;
      absDiff[index] = Number.NaN;
      continue;
    }
    const d = current - previous;
    diff[index] = d;
    rise[index] = Math.max(d, 0);
    absDiff[index] = Math.abs(d);
  }

  const riseSma = SMA(rise, period, 1);
  const absSma = SMA(absDiff, period, 1);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1 });
    if (index < n - 1) {
      result[index] = Number.NaN;
      continue;
    }
    const num = riseSma[index];
    const den = absSma[index];
    if (!isFiniteNumber(num) || !isFiniteNumber(den) || den === 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = (num / den) * 100;
  }
  return result;
};

export const BOLL_MID = (input: NumericOperand, period: NumericOperand): NumericSeries =>
  MA(input, period);

export const BOLL_UPPER = (
  input: NumericOperand,
  period: NumericOperand,
  multiple: NumericOperand = 2
): NumericSeries => {
  const mid = MA(input, period);
  const std = STD(input, period);
  const length = resolveLength(mid, std, multiple);
  const midSeries = toNumericSeries(mid, length);
  const stdSeries = toNumericSeries(std, length);
  const multSeries = toNumericSeries(multiple, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const m = midSeries[index];
    const s = stdSeries[index];
    const k = multSeries[index];
    result[index] = isFiniteNumber(m) && isFiniteNumber(s) && isFiniteNumber(k) ? m + s * k : Number.NaN;
  }
  return result;
};

export const BOLL_LOWER = (
  input: NumericOperand,
  period: NumericOperand,
  multiple: NumericOperand = 2
): NumericSeries => {
  const mid = MA(input, period);
  const std = STD(input, period);
  const length = resolveLength(mid, std, multiple);
  const midSeries = toNumericSeries(mid, length);
  const stdSeries = toNumericSeries(std, length);
  const multSeries = toNumericSeries(multiple, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const m = midSeries[index];
    const s = stdSeries[index];
    const k = multSeries[index];
    result[index] = isFiniteNumber(m) && isFiniteNumber(s) && isFiniteNumber(k) ? m - s * k : Number.NaN;
  }
  return result;
};
