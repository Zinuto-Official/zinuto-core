// SPDX-License-Identifier: GPL-3.0-only

import type { TradingSettings } from '@zinuto/shared/trading';
import type { Side } from '../models.js';
import { calculateTradingCostBreakdown } from './feeModel.js';

type TradingExecutionSettings = TradingSettings;

export const POSITION_EPSILON = 1e-8;
const MAX_ORDER_AMOUNT_SEARCH_STEPS = 1_000_000_000;

const roundQuantity = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(8));
};

export const normalizeTradeStep = (value: unknown, fallback = 1): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= POSITION_EPSILON) {
    return Math.max(POSITION_EPSILON, fallback);
  }
  return numeric;
};

export const quantizeQtyDownByStep = (qty: number, tradeStep: number): number => {
  if (!Number.isFinite(qty) || qty <= POSITION_EPSILON) {
    return 0;
  }
  const normalizedTradeStep = normalizeTradeStep(tradeStep, 1);
  const steps = Math.floor(qty / normalizedTradeStep + POSITION_EPSILON);
  return Math.max(0, roundQuantity(steps * normalizedTradeStep));
};

export const quantizeQtyUpByStep = (qty: number, tradeStep: number): number => {
  if (!Number.isFinite(qty) || qty <= POSITION_EPSILON) {
    return 0;
  }
  const normalizedTradeStep = normalizeTradeStep(tradeStep, 1);
  const steps = Math.ceil(qty / normalizedTradeStep - POSITION_EPSILON);
  return Math.max(0, roundQuantity(steps * normalizedTradeStep));
};

export const isQtyAlignedToTradeStep = (qty: number, tradeStep: number): boolean => {
  if (!Number.isFinite(qty) || qty <= POSITION_EPSILON) {
    return false;
  }
  const normalizedTradeStep = normalizeTradeStep(tradeStep, 1);
  const quantized = quantizeQtyDownByStep(qty, normalizedTradeStep);
  return Math.abs(qty - quantized) <= POSITION_EPSILON;
};

export const resolveContractMultiplier = (value: unknown, fallback = 1): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= POSITION_EPSILON) {
    return Math.max(POSITION_EPSILON, fallback);
  }
  return numeric;
};

type ResolveQtyFromTradeAmountArgs = {
  side: Side;
  amount: number;
  price: number;
  tradeStep: number;
  contractMultiplier: number;
  settings: TradingExecutionSettings;
};

const buildTradingCostForQty = ({
  side,
  qty,
  price,
  contractMultiplier,
  settings,
}: {
  side: Side;
  qty: number;
  price: number;
  contractMultiplier: number;
  settings: TradingExecutionSettings;
}) =>
  calculateTradingCostBreakdown(
    qty * price * contractMultiplier,
    side,
    settings,
    qty,
  ).tradingCost;

const canBuyQtyFitAmount = ({
  qty,
  side,
  amount,
  price,
  contractMultiplier,
  settings,
}: ResolveQtyFromTradeAmountArgs & {
  qty: number;
}) => {
  if (qty <= POSITION_EPSILON) {
    return true;
  }
  const tradingCost = buildTradingCostForQty({
    side,
    qty,
    price,
    contractMultiplier,
    settings,
  });
  return qty * price * contractMultiplier + tradingCost <= amount + POSITION_EPSILON;
};

const canSellQtyReachAmount = ({
  qty,
  side,
  amount,
  price,
  contractMultiplier,
  settings,
}: ResolveQtyFromTradeAmountArgs & {
  qty: number;
}) => {
  if (qty <= POSITION_EPSILON) {
    return false;
  }
  const tradingCost = buildTradingCostForQty({
    side,
    qty,
    price,
    contractMultiplier,
    settings,
  });
  return qty * price * contractMultiplier - tradingCost + POSITION_EPSILON >= amount;
};

export const resolveQtyFromTradeAmount = ({
  side,
  amount,
  price,
  tradeStep,
  contractMultiplier,
  settings,
}: ResolveQtyFromTradeAmountArgs): number => {
  const normalizedAmount = Number(amount);
  const normalizedPrice = Number(price);
  if (
    !Number.isFinite(normalizedAmount) ||
    normalizedAmount <= POSITION_EPSILON ||
    !Number.isFinite(normalizedPrice) ||
    normalizedPrice <= POSITION_EPSILON
  ) {
    return 0;
  }

  const normalizedTradeStep = normalizeTradeStep(tradeStep, 1);
  const normalizedContractMultiplier = resolveContractMultiplier(contractMultiplier, 1);
  const stepGross = normalizedTradeStep * normalizedPrice * normalizedContractMultiplier;
  if (!Number.isFinite(stepGross) || stepGross <= POSITION_EPSILON) {
    return 0;
  }

  if (!settings.tradeAmountIncludesFees) {
    return quantizeQtyDownByStep(
      normalizedAmount / (normalizedPrice * normalizedContractMultiplier),
      normalizedTradeStep,
    );
  }

  if (side === 'BUY') {
    const maxSteps = Math.max(
      0,
      Math.floor(normalizedAmount / stepGross + POSITION_EPSILON),
    );
    let low = 0;
    let high = Math.min(MAX_ORDER_AMOUNT_SEARCH_STEPS, maxSteps);
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const qty = mid * normalizedTradeStep;
      if (
        canBuyQtyFitAmount({
          side,
          amount: normalizedAmount,
          price: normalizedPrice,
          tradeStep: normalizedTradeStep,
          contractMultiplier: normalizedContractMultiplier,
          settings,
          qty,
        })
      ) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return roundQuantity(low * normalizedTradeStep);
  }

  let low = Math.max(
    1,
    Math.ceil(normalizedAmount / stepGross - POSITION_EPSILON),
  );
  let high = low;

  while (
    high < MAX_ORDER_AMOUNT_SEARCH_STEPS &&
    !canSellQtyReachAmount({
      side,
      amount: normalizedAmount,
      price: normalizedPrice,
      tradeStep: normalizedTradeStep,
      contractMultiplier: normalizedContractMultiplier,
      settings,
      qty: high * normalizedTradeStep,
    })
  ) {
    high = Math.min(
      MAX_ORDER_AMOUNT_SEARCH_STEPS,
      Math.max(high + 1, high * 2),
    );
  }

  if (high >= MAX_ORDER_AMOUNT_SEARCH_STEPS) {
    return roundQuantity(high * normalizedTradeStep);
  }

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const qty = mid * normalizedTradeStep;
    if (
      canSellQtyReachAmount({
        side,
        amount: normalizedAmount,
        price: normalizedPrice,
        tradeStep: normalizedTradeStep,
        contractMultiplier: normalizedContractMultiplier,
        settings,
        qty,
      })
    ) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return roundQuantity(low * normalizedTradeStep);
};
