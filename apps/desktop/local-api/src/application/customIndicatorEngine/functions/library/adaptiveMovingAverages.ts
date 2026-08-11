// SPDX-License-Identifier: GPL-3.0-only

import type { NumericOperand, NumericSeries } from "../../runtime/index.js";
import {
  isFiniteNumber,
  nanSeries,
  resolveIntegerAt,
  toNumericSeries,
} from "../helpers.js";
import { MEMA } from "./conditionRange.js";
import { resolveLength } from "./internal.js";
import { EMA, MA } from "./rollingStatistics.js";

export const TMA = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(input, period);
  const n1 = new Array<number>(length).fill(1);
  const n2 = new Array<number>(length).fill(1);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, {
      min: 1,
      allowZero: true,
    });
    const span = n === 0 ? index + 1 : n;
    n1[index] = Math.max(1, Math.ceil(span / 2));
    n2[index] = Math.max(1, Math.floor(span / 2) + 1);
  }
  return MA(MA(input, n1), n2);
};

export const AMA = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  const fast = 2 / 3;
  const slow = 2 / 31;
  let previous = Number.NaN;

  for (let index = 0; index < length; index += 1) {
    const current = source[index];
    if (!isFiniteNumber(current)) {
      result[index] = Number.NaN;
      previous = result[index];
      continue;
    }
    const n = resolveIntegerAt(period, index, 10, { min: 1 });
    if (index < n) {
      result[index] = Number.NaN;
      previous = result[index];
      continue;
    }
    const past = source[index - n];
    if (!isFiniteNumber(past)) {
      result[index] = Number.NaN;
      previous = result[index];
      continue;
    }
    let volatility = 0;
    let valid = true;
    for (let cursor = index - n + 1; cursor <= index; cursor += 1) {
      const now = source[cursor];
      const before = source[cursor - 1];
      if (!isFiniteNumber(now) || !isFiniteNumber(before)) {
        valid = false;
        break;
      }
      volatility += Math.abs(now - before);
    }
    if (!valid || volatility <= 0) {
      result[index] = Number.NaN;
      previous = result[index];
      continue;
    }
    const efficiency = Math.abs(current - past) / volatility;
    const smoothing = Math.pow(efficiency * (fast - slow) + slow, 2);
    if (!isFiniteNumber(previous)) {
      result[index] = current;
      previous = current;
      continue;
    }
    const next = previous + smoothing * (current - previous);
    result[index] = Number.isFinite(next) ? next : Number.NaN;
    previous = result[index];
  }
  return result;
};

export const KAMA = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => AMA(input, period);

export const EXPMEMA = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => EMA(MEMA(input, period), period);

export const SMMA = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => MEMA(input, period);

export const XMA = (
  input: NumericOperand,
  period: NumericOperand,
  offset: NumericOperand = 0,
): NumericSeries => {
  const baseline = MA(input, period);
  const result = nanSeries(baseline.length);
  for (let index = 0; index < baseline.length; index += 1) {
    const shift = resolveIntegerAt(offset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const sourceIndex = index - shift;
    const value = baseline[sourceIndex];
    result[index] = isFiniteNumber(value) ? value : Number.NaN;
  }
  return result;
};
