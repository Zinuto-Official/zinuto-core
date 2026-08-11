// SPDX-License-Identifier: GPL-3.0-only

import type { OrderInputMode, OrderSide } from "../trading.js";

const DEFAULT_RISK_TARGET_POSITION_VALUE = 100000;
const DEFAULT_RISK_CASH_RESERVE = 100000;
const DEFAULT_RISK_ATR_LOOKBACK_BARS = 100;
const DEFAULT_RISK_ATR_LOSS_MULTIPLE = 5;

type RiskBarInput = {
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
};

export type RiskDisciplineRuntimeSeed = {
  positionQty: number;
  minTradeStep: number;
  targetPositionValue: number;
  cashReserve: number;
  currentPrice: number;
  entryPrice: number;
  positionCost: number;
  currentPositionValue: number;
  cashBalance: number;
  initialCapital: number;
  challengeStartAsset: number;
  atrValue: number;
  atrLookbackBars: number;
  atrLossMultiple: number;
  positionLossAmount: number;
  positionLossRatio: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown, fallback = Number.NaN): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizePositiveNumber = (value: unknown, fallback: number): number => {
  const numeric = toFiniteNumber(value, fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
};

const normalizeInteger = (
  value: unknown,
  fallback: number,
  min = 1,
): number => {
  const numeric = Math.floor(toFiniteNumber(value, fallback));
  if (!Number.isFinite(numeric) || numeric < min) {
    return fallback;
  }
  return numeric;
};

const resolveBarClose = (bar: RiskBarInput | undefined): number =>
  toFiniteNumber(bar?.close, Number.NaN);
const resolveBarHigh = (bar: RiskBarInput | undefined): number =>
  toFiniteNumber(bar?.high, Number.NaN);
const resolveBarLow = (bar: RiskBarInput | undefined): number =>
  toFiniteNumber(bar?.low, Number.NaN);

const resolveAverageTrueRange = (
  bars: RiskBarInput[],
  endIndex: number,
  lookbackBars: number,
): number => {
  if (!Array.isArray(bars) || !bars.length) {
    return 0;
  }
  const safeEndIndex = clamp(Math.floor(toFiniteNumber(endIndex, 0)), 0, bars.length - 1);
  const safeLookbackBars = normalizeInteger(lookbackBars, DEFAULT_RISK_ATR_LOOKBACK_BARS);
  const startIndex = Math.max(0, safeEndIndex - safeLookbackBars + 1);
  let totalTrueRange = 0;
  let sampleCount = 0;

  for (let index = startIndex; index <= safeEndIndex; index += 1) {
    const high = resolveBarHigh(bars[index]);
    const low = resolveBarLow(bars[index]);
    if (!Number.isFinite(high) || !Number.isFinite(low)) {
      continue;
    }
    const previousClose = index > 0 ? resolveBarClose(bars[index - 1]) : Number.NaN;
    const trueRange = Number.isFinite(previousClose)
      ? Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose))
      : high - low;
    if (!Number.isFinite(trueRange) || trueRange < 0) {
      continue;
    }
    totalTrueRange += trueRange;
    sampleCount += 1;
  }

  if (sampleCount <= 0) {
    return 0;
  }
  return totalTrueRange / sampleCount;
};

const resolveNearestSteppedQuantity = ({
  currentPrice,
  minTradeStep,
  targetPositionValue,
}: {
  currentPrice: number;
  minTradeStep: number;
  targetPositionValue: number;
}): number => {
  const safePrice = normalizePositiveNumber(currentPrice, Number.NaN);
  const safeStep = normalizePositiveNumber(minTradeStep, 1);
  const safeTargetValue = normalizePositiveNumber(targetPositionValue, DEFAULT_RISK_TARGET_POSITION_VALUE);
  if (!Number.isFinite(safePrice) || safePrice <= 0) {
    return Number.NaN;
  }
  const multiplier = Math.max(1, Math.round(safeTargetValue / (safePrice * safeStep)));
  const quantity = multiplier * safeStep;
  return Number.isFinite(quantity) && quantity > 0 ? Number(quantity.toFixed(8)) : Number.NaN;
};

export const resolveRiskDisciplineDefaults = (): {
  targetPositionValue: number;
  cashReserve: number;
  atrLookbackBars: number;
  atrLossMultiple: number;
} => ({
  targetPositionValue: DEFAULT_RISK_TARGET_POSITION_VALUE,
  cashReserve: DEFAULT_RISK_CASH_RESERVE,
  atrLookbackBars: DEFAULT_RISK_ATR_LOOKBACK_BARS,
  atrLossMultiple: DEFAULT_RISK_ATR_LOSS_MULTIPLE,
});

export const buildRiskDisciplineRuntimeSeed = (value: {
  bars: Array<{
    open?: unknown;
    high?: unknown;
    low?: unknown;
    close?: unknown;
  }>;
  startIndex?: unknown;
  minTradeStep?: unknown;
  targetPositionValue?: unknown;
  cashReserve?: unknown;
  atrLookbackBars?: unknown;
  atrLossMultiple?: unknown;
}): RiskDisciplineRuntimeSeed | null => {
  const defaults = resolveRiskDisciplineDefaults();
  const bars = Array.isArray(value?.bars) ? value.bars : [];
  const startIndex = clamp(Math.floor(toFiniteNumber(value?.startIndex, 0)), 0, Math.max(0, bars.length - 1));
  const currentPrice = resolveBarClose(bars[startIndex]);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return null;
  }

  const minTradeStep = normalizePositiveNumber(value?.minTradeStep, 1);
  const targetPositionValue = normalizePositiveNumber(value?.targetPositionValue, defaults.targetPositionValue);
  const cashReserve = normalizePositiveNumber(value?.cashReserve, defaults.cashReserve);
  const atrLookbackBars = normalizeInteger(value?.atrLookbackBars, defaults.atrLookbackBars);
  const atrLossMultiple = normalizePositiveNumber(value?.atrLossMultiple, defaults.atrLossMultiple);
  const atrValue = resolveAverageTrueRange(bars, startIndex, atrLookbackBars);
  const positionLossAmount = Math.max(0, atrValue * atrLossMultiple);
  const entryPrice = currentPrice + positionLossAmount;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return null;
  }

  const positionQty = resolveNearestSteppedQuantity({
    currentPrice,
    minTradeStep,
    targetPositionValue
  });
  if (!Number.isFinite(positionQty) || positionQty <= 0) {
    return null;
  }

  const currentPositionValue = currentPrice * positionQty;
  const positionCost = entryPrice * positionQty;
  const positionLossRatio =
    Math.abs(entryPrice) > 1e-9
      ? clamp((entryPrice - currentPrice) / Math.abs(entryPrice), 0, 0.95)
      : 0;
  const initialCapital = cashReserve + positionCost;
  const cashBalance = cashReserve;
  const challengeStartAsset = cashBalance + currentPositionValue;

  if (
    !Number.isFinite(currentPositionValue) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(positionCost) ||
    !Number.isFinite(initialCapital) ||
    !Number.isFinite(cashBalance) ||
    !Number.isFinite(challengeStartAsset)
  ) {
    return null;
  }

  return {
    positionQty,
    minTradeStep,
    targetPositionValue,
    cashReserve,
    currentPrice,
    entryPrice,
    positionCost,
    currentPositionValue,
    cashBalance,
    initialCapital,
    challengeStartAsset,
    atrValue,
    atrLookbackBars,
    atrLossMultiple,
    positionLossAmount,
    positionLossRatio
  };
};

export type SpecialTrainingRiskTradeSide = OrderSide;
export type SpecialTrainingRiskOrderInputMode = OrderInputMode;

export type SpecialTrainingRiskTradeRuntime = {
  cashBalance: number;
  positionQty: number;
  entryPrice: number;
  usedOperations: number;
  openCount: number;
};

export type SpecialTrainingRiskTradeEstimate = {
  qty: number | null;
  cashEffect: number | null;
  executionPrice: number | null;
  notional: number | null;
  fee: number | null;
};

export type SpecialTrainingRiskOrderInput = {
  inputMode: SpecialTrainingRiskOrderInputMode;
  lotInput?: string | number | null;
  amountInput?: string | number | null;
  ratioInput?: string | number | null;
};

export type SpecialTrainingRiskTradeExecutionResult<
  TRuntime extends SpecialTrainingRiskTradeRuntime,
> = {
  runtime: TRuntime;
  tradeChanged: boolean;
  estimate: SpecialTrainingRiskTradeEstimate;
};

const RISK_TRADE_EPSILON = 1e-8;
const RISK_ORDER_INPUT_NUMBER_PATTERN =
  /^(?:\d+(?:\.\d*)?|\d{1,3}(?:,\d{3})+(?:\.\d*)?)$/;

export const normalizeSpecialTrainingRiskTradeStep = (value: unknown): number => {
  const numeric = toFiniteNumber(value, 1);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

const quantizeSpecialTrainingRiskQtyDown = (
  qty: number,
  step: number,
): number => {
  if (!Number.isFinite(qty) || qty <= 0) {
    return 0;
  }
  const normalizedStep = normalizeSpecialTrainingRiskTradeStep(step);
  const stepCount = Math.floor(qty / normalizedStep + RISK_TRADE_EPSILON);
  return Math.max(0, Number((stepCount * normalizedStep).toFixed(8)));
};

const resolveSpecialTrainingRiskExecutionPrice = (markPrice: number): number => {
  const safeMarkPrice = toFiniteNumber(markPrice, Number.NaN);
  if (!Number.isFinite(safeMarkPrice) || safeMarkPrice <= 0) {
    return Number.NaN;
  }
  return safeMarkPrice;
};

const emptySpecialTrainingRiskTradeEstimate = (): SpecialTrainingRiskTradeEstimate => ({
  qty: null,
  cashEffect: null,
  executionPrice: null,
  notional: null,
  fee: null,
});

const parseSpecialTrainingRiskOrderInputNumber = (
  input: string | number | null | undefined,
): number => {
  if (typeof input === "number") {
    return Number.isFinite(input) && input > 0 ? input : 0;
  }
  const normalized = String(input ?? "").trim();
  if (!normalized || !RISK_ORDER_INPUT_NUMBER_PATTERN.test(normalized)) {
    return 0;
  }
  const numeric = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const buildSpecialTrainingRiskTradeEstimate = ({
  qty,
  executionPrice,
}: {
  qty: number;
  executionPrice: number;
}): SpecialTrainingRiskTradeEstimate => {
  const normalizedQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const normalizedExecutionPrice = resolveSpecialTrainingRiskExecutionPrice(executionPrice);
  if (normalizedQty <= RISK_TRADE_EPSILON || !Number.isFinite(normalizedExecutionPrice)) {
    return emptySpecialTrainingRiskTradeEstimate();
  }
  const notional = normalizedQty * normalizedExecutionPrice;
  const fee = 0;
  const cashEffect = notional;
  if (!Number.isFinite(notional) || notional <= 0) {
    return emptySpecialTrainingRiskTradeEstimate();
  }
  return {
    qty: normalizedQty,
    cashEffect,
    executionPrice: normalizedExecutionPrice,
    notional,
    fee,
  };
};

export const resolveSpecialTrainingRiskOrderEstimate = (input: {
  side: SpecialTrainingRiskTradeSide;
  runtime: SpecialTrainingRiskTradeRuntime;
  order: SpecialTrainingRiskOrderInput;
  currentPrice: number;
  tradeStep: number;
  maxOperations?: number;
  maxEntries?: number;
}): SpecialTrainingRiskTradeEstimate => {
  const runtime = input.runtime;
  const side = input.side;
  const markPrice = toFiniteNumber(input.currentPrice, Number.NaN);
  if (!runtime || !Number.isFinite(markPrice) || markPrice <= 0) {
    return emptySpecialTrainingRiskTradeEstimate();
  }
  const maxOperations = Math.max(0, Math.floor(toFiniteNumber(input.maxOperations, 0)));
  if (maxOperations > 0 && runtime.usedOperations >= maxOperations) {
    return emptySpecialTrainingRiskTradeEstimate();
  }

  const tradeStep = normalizeSpecialTrainingRiskTradeStep(input.tradeStep);
  const executionPrice = resolveSpecialTrainingRiskExecutionPrice(markPrice);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) {
    return emptySpecialTrainingRiskTradeEstimate();
  }

  const positionQty = toFiniteNumber(runtime.positionQty, 0);
  const cashBalance = toFiniteNumber(runtime.cashBalance, 0);
  const maxEntries = Math.max(0, Math.floor(toFiniteNumber(input.maxEntries, 0)));
  const entryLimitReached =
    maxEntries > 0 && Math.floor(toFiniteNumber(runtime.openCount, 0)) >= maxEntries;
  const maxBuyQty =
    positionQty < -RISK_TRADE_EPSILON
      ? Math.abs(positionQty)
      : entryLimitReached
        ? 0
        : Math.max(0, cashBalance) / executionPrice;
  const maxSellQty = positionQty > RISK_TRADE_EPSILON ? positionQty : 0;
  const maxQty = side === "BUY" ? maxBuyQty : maxSellQty;
  if (maxQty <= RISK_TRADE_EPSILON) {
    return emptySpecialTrainingRiskTradeEstimate();
  }

  let rawQty = 0;
  if (input.order.inputMode === "LOT") {
    const lots = Math.floor(parseSpecialTrainingRiskOrderInputNumber(input.order.lotInput));
    rawQty = lots * tradeStep;
  } else if (input.order.inputMode === "AMOUNT") {
    rawQty = parseSpecialTrainingRiskOrderInputNumber(input.order.amountInput) / executionPrice;
  } else {
    const ratio = clamp(
      parseSpecialTrainingRiskOrderInputNumber(input.order.ratioInput),
      0,
      100,
    );
    rawQty = maxQty * (ratio / 100);
  }

  const qty = quantizeSpecialTrainingRiskQtyDown(Math.min(rawQty, maxQty), tradeStep);
  return buildSpecialTrainingRiskTradeEstimate({
    qty,
    executionPrice,
  });
};

const resolveNextSpecialTrainingRiskEntryPrice = ({
  side,
  runtime,
  qty,
  executionPrice,
}: {
  side: SpecialTrainingRiskTradeSide;
  runtime: SpecialTrainingRiskTradeRuntime;
  qty: number;
  executionPrice: number;
}): number => {
  const positionQty = toFiniteNumber(runtime.positionQty, 0);
  const currentEntry = toFiniteNumber(runtime.entryPrice, Number.NaN);
  const nextPositionQty = side === "BUY" ? positionQty + qty : positionQty - qty;
  if (Math.abs(nextPositionQty) <= RISK_TRADE_EPSILON) {
    return Number.NaN;
  }
  if (side === "BUY") {
    if (positionQty < -RISK_TRADE_EPSILON) {
      return nextPositionQty < -RISK_TRADE_EPSILON ? currentEntry : executionPrice;
    }
    return positionQty > RISK_TRADE_EPSILON && Number.isFinite(currentEntry)
      ? (currentEntry * positionQty + executionPrice * qty) / nextPositionQty
      : executionPrice;
  }
  if (positionQty > RISK_TRADE_EPSILON) {
    return nextPositionQty > RISK_TRADE_EPSILON ? currentEntry : executionPrice;
  }
  const currentShortQty = Math.abs(Math.min(0, positionQty));
  const nextShortQty = Math.abs(Math.min(0, nextPositionQty));
  if (currentShortQty > RISK_TRADE_EPSILON && Number.isFinite(currentEntry)) {
    return (currentEntry * currentShortQty + executionPrice * qty) / nextShortQty;
  }
  return executionPrice;
};

const doesSpecialTrainingRiskTradeOpenExposure = ({
  side,
  previousPositionQty,
  nextPositionQty,
}: {
  side: SpecialTrainingRiskTradeSide;
  previousPositionQty: number;
  nextPositionQty: number;
}): boolean => {
  if (side === "BUY") {
    return nextPositionQty > RISK_TRADE_EPSILON && nextPositionQty > Math.max(0, previousPositionQty);
  }
  return nextPositionQty < -RISK_TRADE_EPSILON && Math.abs(nextPositionQty) > Math.abs(Math.min(0, previousPositionQty));
};

export const executeSpecialTrainingRiskOrder = <
  TRuntime extends SpecialTrainingRiskTradeRuntime,
>(input: {
  runtime: TRuntime;
  side: SpecialTrainingRiskTradeSide;
  qty: number;
  executionPrice: number;
  tradeStep?: number;
  maxOperations?: number;
  maxEntries?: number;
}): SpecialTrainingRiskTradeExecutionResult<TRuntime> => {
  const executionPrice = resolveSpecialTrainingRiskExecutionPrice(input.executionPrice);
  const positionQty = toFiniteNumber(input.runtime.positionQty, 0);
  const maxOperations = Math.max(0, Math.floor(toFiniteNumber(input.maxOperations, 0)));
  if (
    maxOperations > 0 &&
    Math.floor(toFiniteNumber(input.runtime.usedOperations, 0)) >= maxOperations
  ) {
    return {
      runtime: input.runtime,
      tradeChanged: false,
      estimate: emptySpecialTrainingRiskTradeEstimate(),
    };
  }
  const maxEntries = Math.max(0, Math.floor(toFiniteNumber(input.maxEntries, 0)));
  const entryLimitReached =
    maxEntries > 0 &&
    Math.floor(toFiniteNumber(input.runtime.openCount, 0)) >= maxEntries;
  const maxQty =
    input.side === "SELL"
      ? positionQty > RISK_TRADE_EPSILON
        ? positionQty
        : 0
      : positionQty < -RISK_TRADE_EPSILON
        ? Math.abs(positionQty)
        : entryLimitReached
          ? 0
          : Number.isFinite(executionPrice) && executionPrice > 0
            ? Math.max(0, toFiniteNumber(input.runtime.cashBalance, 0)) / executionPrice
            : 0;
  const tradeStep = normalizeSpecialTrainingRiskTradeStep(input.tradeStep);
  const estimate = buildSpecialTrainingRiskTradeEstimate({
    qty: quantizeSpecialTrainingRiskQtyDown(Math.min(input.qty, maxQty), tradeStep),
    executionPrice,
  });
  if (
    estimate.qty === null ||
    estimate.executionPrice === null ||
    estimate.notional === null ||
    estimate.fee === null
  ) {
    return {
      runtime: input.runtime,
      tradeChanged: false,
      estimate,
    };
  }

  const previousPositionQty = toFiniteNumber(input.runtime.positionQty, 0);
  const nextPositionQty =
    input.side === "BUY"
      ? previousPositionQty + estimate.qty
      : previousPositionQty - estimate.qty;
  const nextEntryPrice = resolveNextSpecialTrainingRiskEntryPrice({
    side: input.side,
    runtime: input.runtime,
    qty: estimate.qty,
    executionPrice: estimate.executionPrice,
  });
  const opensExposure = doesSpecialTrainingRiskTradeOpenExposure({
    side: input.side,
    previousPositionQty,
    nextPositionQty,
  });
  const nextRuntime = {
    ...input.runtime,
    usedOperations: input.runtime.usedOperations + 1,
    openCount: input.runtime.openCount + (opensExposure ? 1 : 0),
    cashBalance:
      input.side === "BUY"
        ? input.runtime.cashBalance - estimate.notional - estimate.fee
        : input.runtime.cashBalance + estimate.notional - estimate.fee,
    positionQty: Number(nextPositionQty.toFixed(8)),
    entryPrice: nextEntryPrice,
  };

  return {
    runtime: nextRuntime,
    tradeChanged: true,
    estimate,
  };
};
