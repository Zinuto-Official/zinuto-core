// SPDX-License-Identifier: GPL-3.0-only

import type {
  BooleanOperand,
  BooleanSeries,
  NumericOperand,
  NumericSeries,
} from "../runtime/index.js";
import type { AstRuntimeValue } from "./types.js";

export const normalizeName = (name: string): string =>
  name.trim().toUpperCase();

export const isNumericSeries = (
  value: AstRuntimeValue,
): value is NumericSeries =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

export const isBooleanSeries = (
  value: AstRuntimeValue,
): value is BooleanSeries =>
  Array.isArray(value) && value.every((item) => typeof item === "boolean");

export const isNumberValue = (value: AstRuntimeValue): value is number =>
  typeof value === "number";

export const isBooleanValue = (value: AstRuntimeValue): value is boolean =>
  typeof value === "boolean";
export const isStringValue = (value: AstRuntimeValue): value is string =>
  typeof value === "string";

export const asNumericOperand = (value: AstRuntimeValue): NumericOperand => {
  if (isNumberValue(value)) {
    return value;
  }
  if (isBooleanValue(value)) {
    return value ? 1 : 0;
  }
  if (isNumericSeries(value)) {
    return value;
  }
  if (isBooleanSeries(value)) {
    return value.map((item) => (item ? 1 : 0));
  }
  if (isStringValue(value)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  }
  return Number.NaN;
};

export const asConditionOperand = (
  value: AstRuntimeValue,
): BooleanOperand | NumericOperand => {
  if (isBooleanValue(value) || isBooleanSeries(value)) {
    return value;
  }
  return asNumericOperand(value);
};

export const toNumericSeries = (
  value: AstRuntimeValue,
  length: number,
): NumericSeries => {
  if (isNumericSeries(value)) {
    if (value.length === length) {
      return value;
    }
    const resized = new Array<number>(length).fill(Number.NaN);
    for (let index = 0; index < length; index += 1) {
      const current = Number(value[index]);
      resized[index] = Number.isFinite(current) ? current : Number.NaN;
    }
    return resized;
  }
  if (isBooleanSeries(value)) {
    const resized = new Array<number>(length).fill(Number.NaN);
    for (let index = 0; index < length; index += 1) {
      resized[index] = value[index] ? 1 : 0;
    }
    return resized;
  }
  if (isNumberValue(value)) {
    const numeric = Number(value);
    return new Array<number>(length).fill(
      Number.isFinite(numeric) ? numeric : Number.NaN,
    );
  }
  if (isBooleanValue(value)) {
    return new Array<number>(length).fill(value ? 1 : 0);
  }
  return new Array<number>(length).fill(Number.NaN);
};

export const toBooleanSeries = (
  value: AstRuntimeValue,
  length: number,
): BooleanSeries => {
  if (isBooleanSeries(value)) {
    if (value.length === length) {
      return value;
    }
    const resized = new Array<boolean>(length).fill(false);
    for (let index = 0; index < length; index += 1) {
      resized[index] = Boolean(value[index]);
    }
    return resized;
  }
  if (isNumericSeries(value)) {
    const resized = new Array<boolean>(length).fill(false);
    for (let index = 0; index < length; index += 1) {
      const numeric = Number(value[index]);
      resized[index] = Number.isFinite(numeric) && numeric !== 0;
    }
    return resized;
  }
  if (isBooleanValue(value)) {
    return new Array<boolean>(length).fill(value);
  }
  if (isNumberValue(value)) {
    const numeric = Number(value);
    const next = Number.isFinite(numeric) && numeric !== 0;
    return new Array<boolean>(length).fill(next);
  }
  return new Array<boolean>(length).fill(false);
};

export const isScalar = (value: AstRuntimeValue): boolean =>
  isNumberValue(value) || isBooleanValue(value);

export const resolveArrayLength = (value: AstRuntimeValue): number =>
  Array.isArray(value) ? value.length : 0;
