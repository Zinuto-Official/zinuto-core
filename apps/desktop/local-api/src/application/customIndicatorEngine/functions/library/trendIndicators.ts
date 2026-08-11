// SPDX-License-Identifier: GPL-3.0-only

import type {
  BooleanOperand,
  NumericOperand,
  NumericSeries,
} from "../../runtime/index.js";

import {
  isFiniteNumber,
  nanSeries,
  resolveIntegerAt,
  toConditionSeries,
  toNumericSeries,
} from "../helpers.js";

import { resolveLength } from "./internal.js";

import { COVAR, CROSS, HHV, LLV, VAR } from "./rollingStatistics.js";

import { BETWEEN } from "./conditionRange.js";
export {
  AMA,
  EXPMEMA,
  KAMA,
  SMMA,
  TMA,
  XMA,
} from "./adaptiveMovingAverages.js";

export const CROSSUP = (
  left: NumericOperand,
  right: NumericOperand,
): NumericSeries => CROSS(left, right);

export const CROSSDOWN = (
  left: NumericOperand,
  right: NumericOperand,
): NumericSeries => {
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
      !isFiniteNumber(currentLeft) ||
      !isFiniteNumber(currentRight) ||
      !isFiniteNumber(previousLeft) ||
      !isFiniteNumber(previousRight)
    ) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] =
      currentLeft < currentRight && previousLeft >= previousRight ? 1 : 0;
  }
  return result;
};

export const LONGCROSS = (
  left: NumericOperand,
  right: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(left, right, period);
  const leftSeries = toNumericSeries(left, length);
  const rightSeries = toNumericSeries(right, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    if (index === 0) {
      result[index] = Number.NaN;
      continue;
    }
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = index - n;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    let valid = true;
    for (let cursor = start; cursor < index; cursor += 1) {
      const l = leftSeries[cursor];
      const r = rightSeries[cursor];
      if (!isFiniteNumber(l) || !isFiniteNumber(r) || l >= r) {
        valid = false;
        break;
      }
    }
    if (!valid) {
      result[index] = 0;
      continue;
    }
    const nowL = leftSeries[index];
    const nowR = rightSeries[index];
    const prevL = leftSeries[index - 1];
    const prevR = rightSeries[index - 1];
    if (
      !isFiniteNumber(nowL) ||
      !isFiniteNumber(nowR) ||
      !isFiniteNumber(prevL) ||
      !isFiniteNumber(prevR)
    ) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = nowL > nowR && prevL <= prevR ? 1 : 0;
  }
  return result;
};

export const FILTER = (
  condition: BooleanOperand | NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(condition, period);
  const cond = toConditionSeries(condition, length);
  const result = new Array<number>(length).fill(0);
  let cooldown = 0;
  for (let index = 0; index < length; index += 1) {
    if (cooldown > 0) {
      result[index] = 0;
      cooldown -= 1;
      continue;
    }
    if (!cond[index]) {
      result[index] = 0;
      continue;
    }
    result[index] = 1;
    cooldown = resolveIntegerAt(period, index, 0, { min: 0, allowZero: true });
  }
  return result;
};

export const TFILTER = (
  buy: BooleanOperand | NumericOperand,
  sell: BooleanOperand | NumericOperand,
  mode: NumericOperand,
): NumericSeries => {
  const length = resolveLength(buy, sell, mode);
  const buySeries = toConditionSeries(buy, length);
  const sellSeries = toConditionSeries(sell, length);
  const modeSeries = toNumericSeries(mode, length);
  const result = new Array<number>(length).fill(0);
  let position = 0; // 1 long, -1 short, 0 flat

  for (let index = 0; index < length; index += 1) {
    const nextModeRaw = modeSeries[index];
    const nextMode = Number.isFinite(nextModeRaw) ? Math.trunc(nextModeRaw) : 0;
    const buySignal = buySeries[index];
    const sellSignal = sellSeries[index];

    if (nextMode === 1) {
      if (position <= 0 && buySignal) {
        position = 1;
        result[index] = 1;
      } else if (position === 1 && sellSignal) {
        position = 0;
        result[index] = -1;
      }
      continue;
    }

    if (nextMode === 2) {
      if (position >= 0 && sellSignal) {
        position = -1;
        result[index] = -1;
      } else if (position === -1 && buySignal) {
        position = 0;
        result[index] = 1;
      }
      continue;
    }

    if (buySignal && position <= 0) {
      position = 1;
      result[index] = 1;
      continue;
    }
    if (sellSignal && position >= 0) {
      position = -1;
      result[index] = -1;
      continue;
    }
    result[index] = 0;
  }
  return result;
};

export const UPNDAY = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1 });
    const start = index - n + 1;
    if (start < 1) {
      result[index] = Number.NaN;
      continue;
    }
    let allUp = true;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const now = source[cursor];
      const prev = source[cursor - 1];
      if (!isFiniteNumber(now) || !isFiniteNumber(prev) || now <= prev) {
        allUp = false;
        break;
      }
    }
    result[index] = allUp ? 1 : 0;
  }
  return result;
};

export const DOWNNDAY = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1 });
    const start = index - n + 1;
    if (start < 1) {
      result[index] = Number.NaN;
      continue;
    }
    let allDown = true;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const now = source[cursor];
      const prev = source[cursor - 1];
      if (!isFiniteNumber(now) || !isFiniteNumber(prev) || now >= prev) {
        allDown = false;
        break;
      }
    }
    result[index] = allDown ? 1 : 0;
  }
  return result;
};

export const NDAY = (
  left: NumericOperand,
  right: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(left, right, period);
  const leftSeries = toNumericSeries(left, length);
  const rightSeries = toNumericSeries(right, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1 });
    const start = index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    let allPass = true;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const l = leftSeries[cursor];
      const r = rightSeries[cursor];
      if (!isFiniteNumber(l) || !isFiniteNumber(r) || l <= r) {
        allPass = false;
        break;
      }
    }
    result[index] = allPass ? 1 : 0;
  }
  return result;
};

export const RANGE = (
  input: NumericOperand,
  lower: NumericOperand,
  upper: NumericOperand,
): NumericSeries => BETWEEN(input, lower, upper);

const resolveFindWindowRange = (
  index: number,
  fromOffset: number,
  toOffset: number,
): { start: number; end: number } | null => {
  const older = Math.max(fromOffset, toOffset);
  const newer = Math.min(fromOffset, toOffset);
  const start = index - older;
  const end = index - newer;
  if (start < 0 || end < start) {
    return null;
  }
  return {
    start,
    end,
  };
};

const findRankedWindowEntry = (
  source: NumericSeries,
  start: number,
  end: number,
  rank: number,
  mode: "high" | "low",
): { index: number; value: number } | null => {
  if (rank < 1 || start < 0 || end < start || end >= source.length) {
    return null;
  }
  const candidates: Array<{ index: number; value: number }> = [];
  for (let cursor = start; cursor <= end; cursor += 1) {
    const value = source[cursor];
    if (!isFiniteNumber(value)) {
      continue;
    }
    candidates.push({
      index: cursor,
      value,
    });
  }
  if (candidates.length < rank) {
    return null;
  }
  candidates.sort((left, right) => {
    if (left.value === right.value) {
      return right.index - left.index;
    }
    return mode === "high"
      ? right.value - left.value
      : left.value - right.value;
  });
  return candidates[rank - 1] ?? null;
};

export const FINDHIGH = (
  input: NumericOperand,
  fromOffset: NumericOperand,
  toOffset: NumericOperand = 0,
  rank: NumericOperand = 1,
): NumericSeries => {
  const length = resolveLength(input, fromOffset, toOffset, rank);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const from = resolveIntegerAt(fromOffset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const to = resolveIntegerAt(toOffset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const nth = resolveIntegerAt(rank, index, 1, { min: 1 });
    const window = resolveFindWindowRange(index, from, to);
    if (!window) {
      result[index] = Number.NaN;
      continue;
    }
    const matched = findRankedWindowEntry(
      source,
      window.start,
      window.end,
      nth,
      "high",
    );
    result[index] = matched?.value ?? Number.NaN;
  }

  return result;
};

export const FINDHIGHBARS = (
  input: NumericOperand,
  fromOffset: NumericOperand,
  toOffset: NumericOperand = 0,
  rank: NumericOperand = 1,
): NumericSeries => {
  const length = resolveLength(input, fromOffset, toOffset, rank);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const from = resolveIntegerAt(fromOffset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const to = resolveIntegerAt(toOffset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const nth = resolveIntegerAt(rank, index, 1, { min: 1 });
    const window = resolveFindWindowRange(index, from, to);
    if (!window) {
      result[index] = Number.NaN;
      continue;
    }
    const matched = findRankedWindowEntry(
      source,
      window.start,
      window.end,
      nth,
      "high",
    );
    result[index] = matched ? index - matched.index : Number.NaN;
  }

  return result;
};

export const FINDLOW = (
  input: NumericOperand,
  fromOffset: NumericOperand,
  toOffset: NumericOperand = 0,
  rank: NumericOperand = 1,
): NumericSeries => {
  const length = resolveLength(input, fromOffset, toOffset, rank);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const from = resolveIntegerAt(fromOffset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const to = resolveIntegerAt(toOffset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const nth = resolveIntegerAt(rank, index, 1, { min: 1 });
    const window = resolveFindWindowRange(index, from, to);
    if (!window) {
      result[index] = Number.NaN;
      continue;
    }
    const matched = findRankedWindowEntry(
      source,
      window.start,
      window.end,
      nth,
      "low",
    );
    result[index] = matched?.value ?? Number.NaN;
  }

  return result;
};

export const FINDLOWBARS = (
  input: NumericOperand,
  fromOffset: NumericOperand,
  toOffset: NumericOperand = 0,
  rank: NumericOperand = 1,
): NumericSeries => {
  const length = resolveLength(input, fromOffset, toOffset, rank);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);

  for (let index = 0; index < length; index += 1) {
    const from = resolveIntegerAt(fromOffset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const to = resolveIntegerAt(toOffset, index, 0, {
      min: 0,
      allowZero: true,
    });
    const nth = resolveIntegerAt(rank, index, 1, { min: 1 });
    const window = resolveFindWindowRange(index, from, to);
    if (!window) {
      result[index] = Number.NaN;
      continue;
    }
    const matched = findRankedWindowEntry(
      source,
      window.start,
      window.end,
      nth,
      "low",
    );
    result[index] = matched ? index - matched.index : Number.NaN;
  }

  return result;
};

export const TOPRANGE = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const current = source[index];
    if (!isFiniteNumber(current)) {
      result[index] = Number.NaN;
      continue;
    }
    let count = 1;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const value = source[cursor];
      if (!isFiniteNumber(value)) {
        break;
      }
      if (value > current) {
        break;
      }
      count += 1;
    }
    result[index] = count;
  }
  return result;
};

export const LOWRANGE = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const current = source[index];
    if (!isFiniteNumber(current)) {
      result[index] = Number.NaN;
      continue;
    }
    let count = 1;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const value = source[cursor];
      if (!isFiniteNumber(value)) {
        break;
      }
      if (value < current) {
        break;
      }
      count += 1;
    }
    result[index] = count;
  }
  return result;
};

export const BARSCOUNT = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  let firstValid = -1;
  for (let index = 0; index < length; index += 1) {
    if (firstValid < 0 && isFiniteNumber(source[index])) {
      firstValid = index;
    }
    if (firstValid < 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = index - firstValid + 1;
  }
  return result;
};

export const BARSTATUS = (input: NumericOperand): NumericSeries => {
  const length = resolveLength(input);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    if (!isFiniteNumber(value)) {
      result[index] = Number.NaN;
      continue;
    }
    if (index === 0) {
      result[index] = 1;
      continue;
    }
    if (index === length - 1) {
      result[index] = 2;
      continue;
    }
    result[index] = 0;
  }
  return result;
};

export const SLOPE = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const span = n === 0 ? index + 1 : n;
    const start = index - span + 1;
    if (start < 0 || span < 2) {
      result[index] = Number.NaN;
      continue;
    }
    let sumY = 0;
    let sumXY = 0;
    let valid = true;
    for (let cursor = 0; cursor < span; cursor += 1) {
      const value = source[start + cursor];
      if (!isFiniteNumber(value)) {
        valid = false;
        break;
      }
      sumY += value;
      sumXY += cursor * value;
    }
    if (!valid) {
      result[index] = Number.NaN;
      continue;
    }
    const sumX = ((span - 1) * span) / 2;
    const sumXX = ((span - 1) * span * (2 * span - 1)) / 6;
    const denom = span * sumXX - sumX * sumX;
    if (denom === 0) {
      result[index] = Number.NaN;
      continue;
    }
    result[index] = (span * sumXY - sumX * sumY) / denom;
  }
  return result;
};

export const FORCAST = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const span = n === 0 ? index + 1 : n;
    const start = index - span + 1;
    if (start < 0 || span < 2) {
      result[index] = Number.NaN;
      continue;
    }
    let sumY = 0;
    let sumXY = 0;
    let valid = true;
    for (let cursor = 0; cursor < span; cursor += 1) {
      const value = source[start + cursor];
      if (!isFiniteNumber(value)) {
        valid = false;
        break;
      }
      sumY += value;
      sumXY += cursor * value;
    }
    if (!valid) {
      result[index] = Number.NaN;
      continue;
    }
    const sumX = ((span - 1) * span) / 2;
    const sumXX = ((span - 1) * span * (2 * span - 1)) / 6;
    const denom = span * sumXX - sumX * sumX;
    if (denom === 0) {
      result[index] = Number.NaN;
      continue;
    }
    const slope = (span * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / span;
    result[index] = intercept + slope * (span - 1);
  }
  return result;
};

export const FORECAST = (
  input: NumericOperand,
  period: NumericOperand,
): NumericSeries => FORCAST(input, period);

export const BETA = (
  left: NumericOperand,
  right: NumericOperand,
  period: NumericOperand,
): NumericSeries => {
  const cov = COVAR(left, right, period);
  const varRight = VAR(right, period);
  const length = resolveLength(cov, varRight);
  const covSeries = toNumericSeries(cov, length);
  const varSeries = toNumericSeries(varRight, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const c = covSeries[index];
    const v = varSeries[index];
    result[index] =
      isFiniteNumber(c) && isFiniteNumber(v) && v !== 0 ? c / v : Number.NaN;
  }
  return result;
};

const normalizeSarFactor = (value: number, fallback: number): number => {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  const abs = Math.abs(value);
  if (abs <= 0) {
    return fallback;
  }
  const normalized = abs > 1 ? abs / 100 : abs;
  return Math.max(0.0001, Math.min(1, normalized));
};

const computeParabolicSarCore = (
  high: NumericOperand,
  low: NumericOperand,
  step: NumericOperand = 2,
  maxStep: NumericOperand = 20,
): { sar: NumericSeries; turn: NumericSeries } => {
  const length = resolveLength(high, low, step, maxStep);
  const highSeries = toNumericSeries(high, length);
  const lowSeries = toNumericSeries(low, length);
  const stepSeries = toNumericSeries(step, length);
  const maxStepSeries = toNumericSeries(maxStep, length);
  const sar = nanSeries(length);
  const turn = new Array<number>(length).fill(0);

  if (length === 0) {
    return {
      sar,
      turn,
    };
  }

  let first = -1;
  for (let index = 0; index < length; index += 1) {
    if (isFiniteNumber(highSeries[index]) && isFiniteNumber(lowSeries[index])) {
      first = index;
      break;
    }
  }
  if (first < 0) {
    return {
      sar,
      turn,
    };
  }

  let second = -1;
  for (let index = first + 1; index < length; index += 1) {
    if (isFiniteNumber(highSeries[index]) && isFiniteNumber(lowSeries[index])) {
      second = index;
      break;
    }
  }

  const firstHigh = highSeries[first] as number;
  const firstLow = lowSeries[first] as number;
  const secondHigh = second >= 0 ? (highSeries[second] as number) : firstHigh;
  const secondLow = second >= 0 ? (lowSeries[second] as number) : firstLow;
  let rising = secondHigh + secondLow >= firstHigh + firstLow;
  let accelStep = normalizeSarFactor(stepSeries[first] as number, 0.02);
  let accelMax = normalizeSarFactor(maxStepSeries[first] as number, 0.2);
  if (accelMax < accelStep) {
    accelMax = accelStep;
  }
  let accel = accelStep;
  let extremePoint = rising ? firstHigh : firstLow;
  let currentSar = rising ? firstLow : firstHigh;

  sar[first] = currentSar;
  turn[first] = 0;

  for (let index = first + 1; index < length; index += 1) {
    const highValue = highSeries[index];
    const lowValue = lowSeries[index];
    if (!isFiniteNumber(highValue) || !isFiniteNumber(lowValue)) {
      sar[index] = Number.NaN;
      turn[index] = 0;
      continue;
    }

    accelStep = normalizeSarFactor(stepSeries[index] as number, accelStep);
    accelMax = normalizeSarFactor(maxStepSeries[index] as number, accelMax);
    if (accelMax < accelStep) {
      accelMax = accelStep;
    }

    let nextSar = currentSar + accel * (extremePoint - currentSar);
    const prevLow = index > 0 ? lowSeries[index - 1] : Number.NaN;
    const prevPrevLow = index > 1 ? lowSeries[index - 2] : Number.NaN;
    const prevHigh = index > 0 ? highSeries[index - 1] : Number.NaN;
    const prevPrevHigh = index > 1 ? highSeries[index - 2] : Number.NaN;

    if (rising) {
      if (isFiniteNumber(prevLow)) {
        nextSar = Math.min(nextSar, prevLow);
      }
      if (isFiniteNumber(prevPrevLow)) {
        nextSar = Math.min(nextSar, prevPrevLow);
      }

      if (lowValue < nextSar) {
        rising = false;
        turn[index] = -1;
        nextSar = extremePoint;
        extremePoint = lowValue;
        accel = accelStep;
      } else {
        turn[index] = 0;
        if (highValue > extremePoint) {
          extremePoint = highValue;
          accel = Math.min(accelMax, accel + accelStep);
        }
      }
    } else {
      if (isFiniteNumber(prevHigh)) {
        nextSar = Math.max(nextSar, prevHigh);
      }
      if (isFiniteNumber(prevPrevHigh)) {
        nextSar = Math.max(nextSar, prevPrevHigh);
      }

      if (highValue > nextSar) {
        rising = true;
        turn[index] = 1;
        nextSar = extremePoint;
        extremePoint = highValue;
        accel = accelStep;
      } else {
        turn[index] = 0;
        if (lowValue < extremePoint) {
          extremePoint = lowValue;
          accel = Math.min(accelMax, accel + accelStep);
        }
      }
    }

    currentSar = nextSar;
    sar[index] = currentSar;
  }

  return {
    sar,
    turn,
  };
};

export const SAR = (
  high: NumericOperand,
  low: NumericOperand = high,
  step: NumericOperand = 2,
  maxStep: NumericOperand = 20,
): NumericSeries => computeParabolicSarCore(high, low, step, maxStep).sar;

export const SARTURN = (
  high: NumericOperand,
  low: NumericOperand = high,
  step: NumericOperand = 2,
  maxStep: NumericOperand = 20,
): NumericSeries => {
  const { sar, turn } = computeParabolicSarCore(high, low, step, maxStep);
  const length = sar.length;
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    result[index] = turn[index] === 0 ? Number.NaN : (sar[index] ?? Number.NaN);
  }
  return result;
};

export const ZIG = (
  input: NumericOperand,
  threshold: NumericOperand,
): NumericSeries => {
  const length = resolveLength(input, threshold);
  const source = toNumericSeries(input, length);
  const thresholdSeries = toNumericSeries(threshold, length);
  const result = nanSeries(length);

  let pivot = Number.NaN;
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    const thresholdRaw = thresholdSeries[index];
    const thresholdRatioBase = Number.isFinite(thresholdRaw)
      ? Math.abs(thresholdRaw)
      : 5;
    const thresholdRatio =
      thresholdRatioBase > 1 ? thresholdRatioBase / 100 : thresholdRatioBase;
    if (!isFiniteNumber(value)) {
      result[index] = Number.NaN;
      continue;
    }
    if (!isFiniteNumber(pivot)) {
      pivot = value;
      result[index] = pivot;
      continue;
    }
    const base = Math.max(Math.abs(pivot), 1e-8);
    const move = Math.abs(value - pivot) / base;
    if (move >= thresholdRatio) {
      pivot = value;
    }
    result[index] = pivot;
  }

  return result;
};

export const ZIGZAG = (
  input: NumericOperand,
  threshold: NumericOperand,
): NumericSeries => ZIG(input, threshold);

export const ZIGA = (
  input: NumericOperand,
  threshold: NumericOperand,
): NumericSeries => ZIG(input, threshold);

export const PEAK = (
  input: NumericOperand,
  period: NumericOperand,
  _order: NumericOperand = 1,
): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const highest = HHV(input, period);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    const high = highest[index];
    result[index] =
      isFiniteNumber(value) && isFiniteNumber(high) && value === high
        ? value
        : Number.NaN;
  }
  return result;
};

export const PEAKBARS = (
  input: NumericOperand,
  period: NumericOperand,
  order: NumericOperand = 1,
): NumericSeries => {
  const length = resolveLength(input, period, order);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const rank = resolveIntegerAt(order, index, 1, { min: 1 });
    const matched = findRankedWindowEntry(source, start, index, rank, "high");
    result[index] = matched ? index - matched.index : Number.NaN;
  }
  return result;
};

export const TROUGHBARS = (
  input: NumericOperand,
  period: NumericOperand,
  order: NumericOperand = 1,
): NumericSeries => {
  const length = resolveLength(input, period, order);
  const source = toNumericSeries(input, length);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const n = resolveIntegerAt(period, index, 1, { min: 1, allowZero: true });
    const start = n === 0 ? 0 : index - n + 1;
    if (start < 0) {
      result[index] = Number.NaN;
      continue;
    }
    const rank = resolveIntegerAt(order, index, 1, { min: 1 });
    const matched = findRankedWindowEntry(source, start, index, rank, "low");
    result[index] = matched ? index - matched.index : Number.NaN;
  }
  return result;
};

export const TROUGH = (
  input: NumericOperand,
  period: NumericOperand,
  _order: NumericOperand = 1,
): NumericSeries => {
  const length = resolveLength(input, period);
  const source = toNumericSeries(input, length);
  const lowest = LLV(input, period);
  const result = nanSeries(length);
  for (let index = 0; index < length; index += 1) {
    const value = source[index];
    const low = lowest[index];
    result[index] =
      isFiniteNumber(value) && isFiniteNumber(low) && value === low
        ? value
        : Number.NaN;
  }
  return result;
};
