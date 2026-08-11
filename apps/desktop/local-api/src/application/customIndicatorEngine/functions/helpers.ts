// SPDX-License-Identifier: GPL-3.0-only

import type {
  BooleanOperand,
  BooleanSeries,
  NumericOperand,
  NumericSeries
} from '../runtime/index.js';
import { broadcastNumeric } from '../runtime/operators.js';

export const resolveSeriesLength = (...operands: unknown[]): number => {
  let length = 0;
  operands.forEach((operand) => {
    if (Array.isArray(operand)) {
      length = Math.max(length, operand.length);
    }
  });
  return length;
};

export const toNumericSeries = (operand: NumericOperand, length: number): NumericSeries =>
  broadcastNumeric(operand, length);

export const toConditionSeries = (
  operand: BooleanOperand | NumericOperand,
  length: number
): BooleanSeries => {
  if (typeof operand === 'boolean') {
    return new Array<boolean>(length).fill(operand);
  }

  if (Array.isArray(operand)) {
    const result = new Array<boolean>(length).fill(false);
    for (let index = 0; index < length; index += 1) {
      const value = operand[index];
      if (typeof value === 'boolean') {
        result[index] = value;
        continue;
      }
      const numeric = Number(value);
      result[index] = Number.isFinite(numeric) && numeric !== 0;
    }
    return result;
  }

  const numeric = Number(operand);
  const next = Number.isFinite(numeric) && numeric !== 0;
  return new Array<boolean>(length).fill(next);
};

export const resolveIntegerAt = (
  operand: NumericOperand,
  index: number,
  fallback: number,
  options?: {
    min?: number;
    allowZero?: boolean;
    absolute?: boolean;
  }
): number => {
  const rawValue = Array.isArray(operand) ? operand[index] : operand;
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const useAbsolute = options?.absolute ?? true;
  const rounded = Math.floor(useAbsolute ? Math.abs(numeric) : numeric);
  const min = options?.min ?? 1;
  const allowZero = options?.allowZero ?? false;

  if (allowZero && rounded === 0) {
    return 0;
  }
  return Math.max(min, rounded);
};

export const isFiniteNumber = (value: unknown): value is number => Number.isFinite(Number(value));

export const nanSeries = (length: number): NumericSeries => new Array<number>(length).fill(Number.NaN);
