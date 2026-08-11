// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_INITIAL_CAPITAL,
  EPSILON,
  floorToStep,
} from '../../domain/systemDevSimulation/sharedDomain.js';

export const resolveSimulationBuyQty = (input: {
  budget: number;
  fillPrice: number;
  minTradeStep: number;
  contractMultiplier: number;
}): number => {
  const budget = Number(input.budget);
  const fillPrice = Number(input.fillPrice);
  const minTradeStep = Math.max(
    EPSILON,
    Number(input.minTradeStep) || 0,
  );
  const contractMultiplier = Math.max(
    EPSILON,
    Number(input.contractMultiplier) || 0,
  );
  if (
    !Number.isFinite(budget) ||
    budget <= EPSILON ||
    !Number.isFinite(fillPrice) ||
    fillPrice <= EPSILON
  ) {
    return 0;
  }
  const minNotional =
    Math.max(EPSILON, fillPrice) *
    Math.max(EPSILON, minTradeStep) *
    Math.max(EPSILON, contractMultiplier);
  const reservedBudget = Math.max(minNotional, budget * 0.015);
  const effectiveBudget = Math.max(0, budget - reservedBudget);
  if (effectiveBudget + EPSILON < minNotional) {
    return minTradeStep;
  }
  return floorToStep(
    effectiveBudget / (fillPrice * contractMultiplier),
    minTradeStep,
  );
};

const SIMULATION_INITIAL_CAPITAL_MIN_LOT_MULTIPLE = 40;

export const resolveSimulationInitialCapital = (input: {
  configuredInitialCapital: number;
  referencePrice: number;
  minTradeStep: number;
  contractMultiplier: number;
}): number => {
  const configuredInitialCapital = Math.max(
    0,
    Number(input.configuredInitialCapital) || 0,
  );
  const referencePrice = Math.max(EPSILON, Number(input.referencePrice) || 0);
  const minTradeStep = Math.max(EPSILON, Number(input.minTradeStep) || 0);
  const contractMultiplier = Math.max(
    EPSILON,
    Number(input.contractMultiplier) || 0,
  );
  const minLotNotional = referencePrice * minTradeStep * contractMultiplier;
  const requiredInitialCapital =
    minLotNotional * SIMULATION_INITIAL_CAPITAL_MIN_LOT_MULTIPLE;
  return Math.ceil(
    Math.max(
      DEFAULT_INITIAL_CAPITAL,
      configuredInitialCapital,
      requiredInitialCapital,
    ),
  );
};
