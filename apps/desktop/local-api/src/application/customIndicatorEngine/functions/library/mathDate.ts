// SPDX-License-Identifier: GPL-3.0-only

import type {
  NumericOperand,
  NumericSeries
} from '../../runtime/index.js';

import {
  isFiniteNumber,
  nanSeries,
  toNumericSeries
} from '../helpers.js';

import {
  dateNumberToEpochDay,
  decodeTimeNumber,
  epochDayToDateNumber,
  resolveLength
} from './internal.js';

export const POW = (input: NumericOperand, power: NumericOperand): NumericSeries => {
  const length = resolveLength(input, power);
  const source = toNumericSeries(input, length);
  const exponent = toNumericSeries(power, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const x = source[index];
    const n = exponent[index];
    if (!isFiniteNumber(x) || !isFiniteNumber(n)) {
      result[index] = Number.NaN;
      continue;
    }
    const next = Math.pow(x, n);
    result[index] = Number.isFinite(next) ? next : Number.NaN;
  }
  return result;
};

export const SQRT = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value) || value < 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = Math.sqrt(value);
  }
  return result;
};

export const LOG = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value) || value <= 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = Math.log(value);
  }
  return result;
};

export const LOG10 = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value) || value <= 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = Math.log10(value);
  }
  return result;
};

export const LOG2 = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value) || value <= 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = Math.log2(value);
  }
  return result;
};

export const LN = (input: NumericOperand): NumericSeries => LOG(input);

export const EXP = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value)) {
      result[index] = Number.NaN;
      continue;
    }
    const next = Math.exp(value);
    result[index] = Number.isFinite(next) ? next : Number.NaN;
  }
  return result;
};

export const SIN = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? Math.sin(value) : Number.NaN;
  }
  return result;
};

export const COS = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? Math.cos(value) : Number.NaN;
  }
  return result;
};

export const TAN = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? Math.tan(value) : Number.NaN;
  }
  return result;
};

export const ASIN = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value) || value < -1 || value > 1) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = Math.asin(value);
  }
  return result;
};

export const ACOS = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value) || value < -1 || value > 1) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = Math.acos(value);
  }
  return result;
};

export const ATAN = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? Math.atan(value) : Number.NaN;
  }
  return result;
};

export const CEILING = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? Math.ceil(value) : Number.NaN;
  }
  return result;
};

export const INTPART = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? Math.trunc(value) : Number.NaN;
  }
  return result;
};

export const INT = (input: NumericOperand): NumericSeries => INTPART(input);

export const FLOOR = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? Math.floor(value) : Number.NaN;
  }
  return result;
};

export const ROUND = (input: NumericOperand, digits: NumericOperand = 0): NumericSeries => {
  const length = resolveLength(input, digits);
  const source = toNumericSeries(input, length);
  const digitSeries = toNumericSeries(digits, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    const precisionRaw = digitSeries[index];
    if (!isFiniteNumber(value)) {
      result[index] = Number.NaN;
      continue;
    }
    const precision = isFiniteNumber(precisionRaw) ? Math.max(-12, Math.min(12, Math.trunc(precisionRaw))) : 0;
    const factor = 10 ** precision;
    result[index] = precision >= 0
      ? Math.round(value * factor) / factor
      : Math.round(value / (10 ** Math.abs(precision))) * (10 ** Math.abs(precision));
  }
  return result;
};

export const ROUND2 = (input: NumericOperand, digits: NumericOperand = 0): NumericSeries =>
  ROUND(input, digits);

export const FRACPART = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    result[index] = isFiniteNumber(value) ? value - Math.trunc(value) : Number.NaN;
  }
  return result;
};

export const RAND = (maxValue: NumericOperand = 2_147_483_647): NumericSeries => {
  const length = resolveLength(maxValue);
  const maxSeries = toNumericSeries(maxValue, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const rawMax = maxSeries[index];
    if (!isFiniteNumber(rawMax)) {
      result[index] = Number.NaN;
      continue;
    }
    const maxInt = Math.max(1, Math.trunc(Math.abs(rawMax)));
    const seed = index + 1;
    const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    result[index] = (next % maxInt) + 1;
  }

  return result;
};

export const DATETODAY = (dateValue: NumericOperand): NumericSeries => {
  const length = resolveLength(dateValue);
  const dateSeries = toNumericSeries(dateValue, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = dateSeries[index];
    result[index] = isFiniteNumber(value) ? dateNumberToEpochDay(value) : Number.NaN;
  }
  return result;
};

export const DAYTODATE = (dayValue: NumericOperand): NumericSeries => {
  const length = resolveLength(dayValue);
  const daySeries = toNumericSeries(dayValue, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = daySeries[index];
    result[index] = isFiniteNumber(value) ? epochDayToDateNumber(value) : Number.NaN;
  }
  return result;
};

export const TIMETOSEC = (timeValue: NumericOperand): NumericSeries => {
  const length = resolveLength(timeValue);
  const timeSeries = toNumericSeries(timeValue, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = timeSeries[index];
    const parts = decodeTimeNumber(value);
    if (!parts) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = parts.hour * 3600 + parts.minute * 60 + parts.second;
  }
  return result;
};

export const SECTOTIME = (secondsValue: NumericOperand): NumericSeries => {
  const length = resolveLength(secondsValue);
  const secondsSeries = toNumericSeries(secondsValue, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = secondsSeries[index];
    if (!isFiniteNumber(value)) {
      result[index] = Number.NaN;
      continue;
    }
    const seconds = Math.trunc(value);
    if (seconds < 0 || seconds >= 24 * 3600) {
      result[index] = Number.NaN;
      continue;
    }
    const hour = Math.trunc(seconds / 3600);
    const minute = Math.trunc((seconds % 3600) / 60);
    const second = seconds % 60;
    result[index] = hour * 10_000 + minute * 100 + second;
  }
  return result;
};
