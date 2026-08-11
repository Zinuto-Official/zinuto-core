// SPDX-License-Identifier: GPL-3.0-only

import type {
  BooleanOperand,
  BooleanSeries,
  NumericOperand,
  NumericSeries,
  Series
} from '../runtime/index.js';

const isSeries = <T>(value: T | Series<T>): value is Series<T> => Array.isArray(value);

const resolveOutputLength = (...operands: unknown[]): number => {
  let length = 0;
  operands.forEach((operand) => {
    if (Array.isArray(operand)) {
      length = Math.max(length, operand.length);
    }
  });
  return length;
};

const finiteOrNaN = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

const toNumericSeries = (operand: NumericOperand, length: number): NumericSeries => {
  if (!isSeries(operand)) {
    return new Array<number>(length).fill(finiteOrNaN(operand));
  }
  const result = new Array<number>(length).fill(Number.NaN);
  for (let index = 0; index < length; index += 1) {
    result[index] = finiteOrNaN(operand[index]);
  }
  return result;
};

const toBooleanSeries = (operand: BooleanOperand, length: number): BooleanSeries => {
  if (!isSeries(operand)) {
    return new Array<boolean>(length).fill(Boolean(operand));
  }
  const result = new Array<boolean>(length).fill(false);
  for (let index = 0; index < length; index += 1) {
    result[index] = Boolean(operand[index]);
  }
  return result;
};

const numericBinary = (
  left: NumericOperand,
  right: NumericOperand,
  operation: (leftValue: number, rightValue: number) => number,
  length?: number
): NumericSeries => {
  const outputLength = Math.max(length ?? 0, resolveOutputLength(left, right));
  const leftSeries = toNumericSeries(left, outputLength);
  const rightSeries = toNumericSeries(right, outputLength);
  const result = new Array<number>(outputLength).fill(Number.NaN);

  for (let index = 0; index < outputLength; index += 1) {
    const leftValue = leftSeries[index];
    const rightValue = rightSeries[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      result[index] = Number.NaN;
      continue;
    }
    const nextValue = operation(leftValue, rightValue);
    result[index] = Number.isFinite(nextValue) ? nextValue : Number.NaN;
  }

  return result;
};

const comparisonBinary = (
  left: NumericOperand,
  right: NumericOperand,
  operation: (leftValue: number, rightValue: number) => boolean,
  length?: number
): BooleanSeries => {
  const outputLength = Math.max(length ?? 0, resolveOutputLength(left, right));
  const leftSeries = toNumericSeries(left, outputLength);
  const rightSeries = toNumericSeries(right, outputLength);
  const result = new Array<boolean>(outputLength).fill(false);

  for (let index = 0; index < outputLength; index += 1) {
    const leftValue = leftSeries[index];
    const rightValue = rightSeries[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      result[index] = false;
      continue;
    }
    result[index] = operation(leftValue, rightValue);
  }

  return result;
};

const logicalBinary = (
  left: BooleanOperand,
  right: BooleanOperand,
  operation: (leftValue: boolean, rightValue: boolean) => boolean,
  length?: number
): BooleanSeries => {
  const outputLength = Math.max(length ?? 0, resolveOutputLength(left, right));
  const leftSeries = toBooleanSeries(left, outputLength);
  const rightSeries = toBooleanSeries(right, outputLength);
  const result = new Array<boolean>(outputLength).fill(false);

  for (let index = 0; index < outputLength; index += 1) {
    result[index] = operation(leftSeries[index], rightSeries[index]);
  }

  return result;
};

export const addSeries = (left: NumericOperand, right: NumericOperand, length?: number): NumericSeries =>
  numericBinary(left, right, (l, r) => l + r, length);

export const subSeries = (left: NumericOperand, right: NumericOperand, length?: number): NumericSeries =>
  numericBinary(left, right, (l, r) => l - r, length);

export const mulSeries = (left: NumericOperand, right: NumericOperand, length?: number): NumericSeries =>
  numericBinary(left, right, (l, r) => l * r, length);

export const divSeries = (left: NumericOperand, right: NumericOperand, length?: number): NumericSeries =>
  numericBinary(left, right, (l, r) => (r === 0 ? Number.NaN : l / r), length);

export const modSeries = (left: NumericOperand, right: NumericOperand, length?: number): NumericSeries =>
  numericBinary(left, right, (l, r) => (r === 0 ? Number.NaN : l % r), length);

export const powSeries = (left: NumericOperand, right: NumericOperand, length?: number): NumericSeries =>
  numericBinary(left, right, (l, r) => {
    const next = Math.pow(l, r);
    return Number.isFinite(next) ? next : Number.NaN;
  }, length);

export const gtSeries = (left: NumericOperand, right: NumericOperand, length?: number): BooleanSeries =>
  comparisonBinary(left, right, (l, r) => l > r, length);

export const gteSeries = (left: NumericOperand, right: NumericOperand, length?: number): BooleanSeries =>
  comparisonBinary(left, right, (l, r) => l >= r, length);

export const ltSeries = (left: NumericOperand, right: NumericOperand, length?: number): BooleanSeries =>
  comparisonBinary(left, right, (l, r) => l < r, length);

export const lteSeries = (left: NumericOperand, right: NumericOperand, length?: number): BooleanSeries =>
  comparisonBinary(left, right, (l, r) => l <= r, length);

export const eqSeries = (left: NumericOperand, right: NumericOperand, length?: number): BooleanSeries =>
  comparisonBinary(left, right, (l, r) => l === r, length);

export const neqSeries = (left: NumericOperand, right: NumericOperand, length?: number): BooleanSeries =>
  comparisonBinary(left, right, (l, r) => l !== r, length);

export const andSeries = (left: BooleanOperand, right: BooleanOperand, length?: number): BooleanSeries =>
  logicalBinary(left, right, (l, r) => l && r, length);

export const orSeries = (left: BooleanOperand, right: BooleanOperand, length?: number): BooleanSeries =>
  logicalBinary(left, right, (l, r) => l || r, length);

export const notSeries = (operand: BooleanOperand, length?: number): BooleanSeries => {
  const outputLength = Math.max(length ?? 0, resolveOutputLength(operand));
  const values = toBooleanSeries(operand, outputLength);
  return values.map((value) => !value);
};

export const broadcastNumeric = toNumericSeries;
