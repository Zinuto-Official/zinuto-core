// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';
import type { TradingExecutionSettings } from '../../domain/trading/types.js';
import { calculateTradingCostBreakdown } from '../../domain/trading/feeModel.js';
import type {
  MarginRequirementInputRow,
  MarginState,
} from '../../domain/trading/sessionMargin.js';

const POSITION_EPSILON = 1e-8;

export type SessionTerminationReasonCode =
  | 'NO_POSITION_AND_CANNOT_OPEN'
  | 'NO_FUTURE_DATA'
  | 'NO_FUTURE_DATA_AND_POSITION_BLOCKED';

export type SessionTerminationState = {
  isTerminated: boolean;
  reasonCode: SessionTerminationReasonCode | null;
  assetClass: TradingExecutionSettings['assetClass'];
  hasOpenPosition: boolean;
  hasFutureBars: boolean;
  canOpenMinLong: boolean;
  canOpenMinShort: boolean;
  canFullyClosePosition: boolean;
  minTradeStep: number;
  referencePrice: number;
};

type EvaluateSessionTerminationArgs = {
  sessionId: string;
  instrumentId: string;
  cursorIndex: number;
  maxIndex: number;
  currentBar?: OhlcvBar;
  settings: TradingExecutionSettings;
  accountBalance: number;
  currentPositionQty: number;
  sameDayBoughtQty: number;
  buildProjectedMarginRows: (
    sessionId: string,
    instrumentId: string,
    projectedCurrentQty: number,
    referencePrice: number,
    projectedSessionSettings: TradingExecutionSettings
  ) => Promise<MarginRequirementInputRow[]>;
  calcMarginRequirements: (cash: number, positions: MarginRequirementInputRow[]) => MarginState;
};

const normalizeTradeStep = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= POSITION_EPSILON) {
    return 1;
  }
  return numeric;
};

const resolveContractMultiplier = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= POSITION_EPSILON) {
    return 1;
  }
  return numeric;
};

const normalizePositionQty = (value: number): number => (Math.abs(value) <= POSITION_EPSILON ? 0 : value);

const canSatisfyInitialMargin = async ({
  sessionId,
  instrumentId,
  settings,
  projectedQty,
  projectedCash,
  referencePrice,
  openLongQty,
  openShortQty,
  buildProjectedMarginRows,
  calcMarginRequirements
}: {
  sessionId: string;
  instrumentId: string;
  settings: TradingExecutionSettings;
  projectedQty: number;
  projectedCash: number;
  referencePrice: number;
  openLongQty: number;
  openShortQty: number;
  buildProjectedMarginRows: EvaluateSessionTerminationArgs['buildProjectedMarginRows'];
  calcMarginRequirements: EvaluateSessionTerminationArgs['calcMarginRequirements'];
}): Promise<boolean> => {
  if (openLongQty <= POSITION_EPSILON && openShortQty <= POSITION_EPSILON) {
    return true;
  }
  const marginRows = await buildProjectedMarginRows(sessionId, instrumentId, projectedQty, referencePrice, settings);
  const marginState = calcMarginRequirements(projectedCash, marginRows);
  return marginState.equity + POSITION_EPSILON >= marginState.requiredInitialEquity;
};

const canOpenMinLong = async ({
  sessionId,
  instrumentId,
  settings,
  accountBalance,
  currentPositionQty,
  minTradeStep,
  referencePrice,
  buildProjectedMarginRows,
  calcMarginRequirements
}: {
  sessionId: string;
  instrumentId: string;
  settings: TradingExecutionSettings;
  accountBalance: number;
  currentPositionQty: number;
  minTradeStep: number;
  referencePrice: number;
  buildProjectedMarginRows: EvaluateSessionTerminationArgs['buildProjectedMarginRows'];
  calcMarginRequirements: EvaluateSessionTerminationArgs['calcMarginRequirements'];
}): Promise<boolean> => {
  if (minTradeStep <= POSITION_EPSILON || referencePrice <= POSITION_EPSILON) {
    return false;
  }
  const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
  const gross = minTradeStep * referencePrice * contractMultiplier;
  const tradingCost = calculateTradingCostBreakdown(gross, 'BUY', settings, minTradeStep).tradingCost;
  const shortQtyAbs = Math.max(0, -currentPositionQty);
  const openLongQty = currentPositionQty < -POSITION_EPSILON ? Math.max(0, minTradeStep - shortQtyAbs) : minTradeStep;
  if (openLongQty <= POSITION_EPSILON) {
    return false;
  }
  const projectedQty = normalizePositionQty(currentPositionQty + minTradeStep);
  const projectedCash = accountBalance - gross - tradingCost;
  return canSatisfyInitialMargin({
    sessionId,
    instrumentId,
    settings,
    projectedQty,
    projectedCash,
    referencePrice,
    openLongQty,
    openShortQty: 0,
    buildProjectedMarginRows,
    calcMarginRequirements
  });
};

const canOpenMinShort = async ({
  sessionId,
  instrumentId,
  settings,
  accountBalance,
  currentPositionQty,
  minTradeStep,
  referencePrice,
  buildProjectedMarginRows,
  calcMarginRequirements
}: {
  sessionId: string;
  instrumentId: string;
  settings: TradingExecutionSettings;
  accountBalance: number;
  currentPositionQty: number;
  minTradeStep: number;
  referencePrice: number;
  buildProjectedMarginRows: EvaluateSessionTerminationArgs['buildProjectedMarginRows'];
  calcMarginRequirements: EvaluateSessionTerminationArgs['calcMarginRequirements'];
}): Promise<boolean> => {
  if (!settings.allowShortSelling || minTradeStep <= POSITION_EPSILON || referencePrice <= POSITION_EPSILON) {
    return false;
  }
  const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
  const gross = minTradeStep * referencePrice * contractMultiplier;
  const tradingCost = calculateTradingCostBreakdown(gross, 'SELL', settings, minTradeStep).tradingCost;
  const closeLongQty = currentPositionQty > POSITION_EPSILON ? Math.min(minTradeStep, currentPositionQty) : 0;
  const openShortQty = Math.max(0, minTradeStep - closeLongQty);
  if (openShortQty <= POSITION_EPSILON) {
    return false;
  }
  const projectedQty = normalizePositionQty(currentPositionQty - minTradeStep);
  const projectedCash = accountBalance + gross - tradingCost;
  return canSatisfyInitialMargin({
    sessionId,
    instrumentId,
    settings,
    projectedQty,
    projectedCash,
    referencePrice,
    openLongQty: 0,
    openShortQty,
    buildProjectedMarginRows,
    calcMarginRequirements
  });
};

export const evaluateSessionTermination = async ({
  sessionId,
  instrumentId,
  cursorIndex,
  maxIndex,
  currentBar,
  settings,
  accountBalance,
  currentPositionQty,
  sameDayBoughtQty,
  buildProjectedMarginRows,
  calcMarginRequirements
}: EvaluateSessionTerminationArgs): Promise<SessionTerminationState> => {
  const positionQty = normalizePositionQty(Number(currentPositionQty) || 0);
  const hasOpenPosition = Math.abs(positionQty) > POSITION_EPSILON;
  const hasFutureBars = Math.max(0, Math.floor(Number(cursorIndex) || 0)) < Math.max(0, Math.floor(Number(maxIndex) || 0));
  const referencePrice = Math.max(0, Number(currentBar?.close ?? 0));
  const minTradeStep = normalizeTradeStep(settings.minTradeStep);

  const [canOpenLong, canOpenShort] = await Promise.all([
    canOpenMinLong({
      sessionId,
      instrumentId,
      settings,
      accountBalance,
      currentPositionQty: positionQty,
      minTradeStep,
      referencePrice,
      buildProjectedMarginRows,
      calcMarginRequirements
    }),
    canOpenMinShort({
      sessionId,
      instrumentId,
      settings,
      accountBalance,
      currentPositionQty: positionQty,
      minTradeStep,
      referencePrice,
      buildProjectedMarginRows,
      calcMarginRequirements
    })
  ]);

  const canFullyClosePosition =
    !hasOpenPosition ||
    positionQty < -POSITION_EPSILON ||
    settings.tradeSettlementMode !== 'T1' ||
    Math.max(0, positionQty - Math.max(0, Number(sameDayBoughtQty) || 0)) + POSITION_EPSILON >= positionQty;

  let reasonCode: SessionTerminationReasonCode | null = null;
  if (!hasOpenPosition && !hasFutureBars) {
    reasonCode = 'NO_FUTURE_DATA';
  } else if (hasOpenPosition && !hasFutureBars && !canFullyClosePosition) {
    reasonCode = 'NO_FUTURE_DATA_AND_POSITION_BLOCKED';
  }

  return {
    isTerminated: reasonCode !== null,
    reasonCode,
    assetClass: settings.assetClass,
    hasOpenPosition,
    hasFutureBars,
    canOpenMinLong: canOpenLong,
    canOpenMinShort: canOpenShort,
    canFullyClosePosition,
    minTradeStep,
    referencePrice
  };
};
