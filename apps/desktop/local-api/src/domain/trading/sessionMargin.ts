// SPDX-License-Identifier: GPL-3.0-only

import type { TradingSettings } from '@zinuto/shared/trading';
import type { Side } from '../models.js';
import { calculateTradingCostBreakdown } from './feeModel.js';
import {
  POSITION_EPSILON,
  resolveContractMultiplier,
} from './orderSizing.js';
import {
  type SessionOrderQuote,
} from './orderQuote.js';

type TradingExecutionSettings = TradingSettings;

export type MarginRequirementInputRow = {
  qty: number;
  fillPrice: number;
  contractMultiplier: number;
  settings: TradingExecutionSettings;
};

export type MarginState = {
  equity: number;
  requiredInitialEquity: number;
  requiredMaintenanceEquity: number;
  availableInitialEquity: number;
  longNotional: number;
  shortNotional: number;
};

export type MarginRatios = {
  longInitialRatio: number;
  shortInitialRatio: number;
  longMaintenanceRatio: number;
  shortMaintenanceRatio: number;
};

type RoundFn = (value: number, digits?: number) => number;

const resolvePositiveRatio = (
  percent: number | undefined,
  fallbackPercent: number,
): number => {
  const numericPercent = Number(percent);
  const effectivePercent =
    Number.isFinite(numericPercent) && numericPercent > POSITION_EPSILON
      ? numericPercent
      : fallbackPercent;
  return Math.max(POSITION_EPSILON, effectivePercent / 100);
};

export const resolveMarginRatios = (
  settings: TradingExecutionSettings,
): MarginRatios => {
  const longInitialPercent = Number(settings.longInitialMarginRatio);
  const resolvedLongInitialPercent =
    Number.isFinite(longInitialPercent) && longInitialPercent > POSITION_EPSILON
      ? longInitialPercent
      : 100;
  const longMaintenancePercent = Number(settings.longMaintenanceMarginRatio);
  const resolvedLongMaintenancePercent =
    Number.isFinite(longMaintenancePercent) &&
    longMaintenancePercent > POSITION_EPSILON
      ? Math.min(longMaintenancePercent, resolvedLongInitialPercent)
      : Math.min(100, resolvedLongInitialPercent);
  const shortInitialPercent = Number(settings.shortInitialMarginRatio);
  const resolvedShortInitialPercent =
    Number.isFinite(shortInitialPercent) &&
    shortInitialPercent > POSITION_EPSILON
      ? shortInitialPercent
      : 150;
  const shortMaintenancePercent = Number(settings.shortMaintenanceMarginRatio);
  const resolvedShortMaintenancePercent =
    Number.isFinite(shortMaintenancePercent) &&
    shortMaintenancePercent > POSITION_EPSILON
      ? Math.min(shortMaintenancePercent, resolvedShortInitialPercent)
      : Math.min(30, resolvedShortInitialPercent);
  const effectiveLongInitialPercent = settings.allowLongMarginTrading
    ? resolvedLongInitialPercent
    : 100;
  const effectiveLongMaintenancePercent = settings.allowLongMarginTrading
    ? resolvedLongMaintenancePercent
    : 100;
  return {
    longInitialRatio: resolvePositiveRatio(effectiveLongInitialPercent, 100),
    shortInitialRatio: resolvePositiveRatio(resolvedShortInitialPercent, 150),
    longMaintenanceRatio: resolvePositiveRatio(
      effectiveLongMaintenancePercent,
      100,
    ),
    shortMaintenanceRatio: resolvePositiveRatio(
      resolvedShortMaintenancePercent,
      30,
    ),
  };
};

const buildProjectedMarginRows = async (
  _sessionId: string,
  _instrumentId: string,
  projectedCurrentQty: number,
  referencePrice: number,
  projectedSessionSettings: TradingExecutionSettings,
): Promise<MarginRequirementInputRow[]> => {
  const qty = Number(projectedCurrentQty);
  if (!Number.isFinite(qty) || Math.abs(qty) <= POSITION_EPSILON) {
    return [];
  }
  const effectiveMarkPrice = Math.max(0, Number(referencePrice) || 0);
  if (effectiveMarkPrice <= POSITION_EPSILON) {
    return [];
  }
  return [
    {
      qty,
      fillPrice: effectiveMarkPrice,
      contractMultiplier: resolveContractMultiplier(
        projectedSessionSettings.contractMultiplier,
      ),
      settings: projectedSessionSettings,
    },
  ];
};

const calcMarginRequirements = (
  cash: number,
  positions: MarginRequirementInputRow[],
  round: RoundFn,
): MarginState => {
  let longNotional = 0;
  let shortNotional = 0;
  let requiredInitialEquity = 0;
  let requiredMaintenanceEquity = 0;
  for (const position of positions) {
    const qty = Number(position.qty);
    const fillPrice = Math.max(
      POSITION_EPSILON,
      Number(position.fillPrice) || 0,
    );
    const contractMultiplier = resolveContractMultiplier(
      position.contractMultiplier,
    );
    if (
      !Number.isFinite(qty) ||
      Math.abs(qty) <= POSITION_EPSILON ||
      fillPrice <= POSITION_EPSILON
    ) {
      continue;
    }
    const ratios = resolveMarginRatios(position.settings);
    const notional = Math.abs(qty) * fillPrice * contractMultiplier;
    if (qty > 0) {
      longNotional += notional;
      requiredInitialEquity += notional * ratios.longInitialRatio;
      requiredMaintenanceEquity += notional * ratios.longMaintenanceRatio;
    } else {
      shortNotional += notional;
      requiredInitialEquity += notional * ratios.shortInitialRatio;
      requiredMaintenanceEquity += notional * ratios.shortMaintenanceRatio;
    }
  }
  longNotional = Math.max(0, longNotional);
  shortNotional = Math.max(0, shortNotional);
  const equity = cash + longNotional - shortNotional;
  return {
    equity: round(equity, 6),
    requiredInitialEquity: round(requiredInitialEquity, 6),
    requiredMaintenanceEquity: round(requiredMaintenanceEquity, 6),
    availableInitialEquity: round(equity - requiredInitialEquity, 6),
    longNotional: round(longNotional, 6),
    shortNotional: round(shortNotional, 6),
  };
};

const isProjectedQuoteQtyMarginExecutable = async ({
  sessionId,
  instrumentId,
  positionQty,
  cashBalance,
  settings,
  side,
  qty,
  price,
  round,
}: {
  sessionId: string;
  instrumentId: string;
  positionQty: number;
  cashBalance: number;
  settings: TradingExecutionSettings;
  side: Side;
  qty: number;
  price: number;
  round: RoundFn;
}): Promise<boolean> => {
  if (!Number.isFinite(qty) || qty <= POSITION_EPSILON) {
    return true;
  }
  const contractMultiplier = resolveContractMultiplier(
    settings.contractMultiplier,
  );
  const gross = qty * price * contractMultiplier;
  const tradingCost = calculateTradingCostBreakdown(
    gross,
    side,
    settings,
    qty,
  ).tradingCost;
  const projectedQtyRaw =
    side === 'BUY' ? positionQty + qty : positionQty - qty;
  const projectedQty =
    Math.abs(projectedQtyRaw) <= POSITION_EPSILON ? 0 : projectedQtyRaw;
  const projectedCash =
    side === 'BUY'
      ? cashBalance - gross - tradingCost
      : cashBalance + gross - tradingCost;
  const openLongQty =
    side === 'BUY'
      ? positionQty < -POSITION_EPSILON
        ? Math.max(0, qty - Math.abs(positionQty))
        : qty
      : 0;
  const closeLongQty =
    side === 'SELL' && positionQty > POSITION_EPSILON
      ? Math.min(qty, positionQty)
      : 0;
  const openShortQty =
    side === 'SELL' ? Math.max(0, qty - closeLongQty) : 0;
  if (openLongQty <= POSITION_EPSILON && openShortQty <= POSITION_EPSILON) {
    return true;
  }
  const marginRows = await buildProjectedMarginRows(
    sessionId,
    instrumentId,
    projectedQty,
    price,
    settings,
  );
  const marginState = calcMarginRequirements(projectedCash, marginRows, round);
  return (
    marginState.equity + POSITION_EPSILON >=
    marginState.requiredInitialEquity
  );
};

const resolveMaxExecutableQuoteQtyByMargin = async ({
  sessionId,
  instrumentId,
  positionQty,
  cashBalance,
  settings,
  side,
  requestedQty,
  price,
  round,
}: {
  sessionId: string;
  instrumentId: string;
  positionQty: number;
  cashBalance: number;
  settings: TradingExecutionSettings;
  side: Side;
  requestedQty: number;
  price: number;
  round: RoundFn;
}): Promise<number> => {
  if (
    !Number.isFinite(requestedQty) ||
    requestedQty <= POSITION_EPSILON ||
    !Number.isFinite(price) ||
    price <= POSITION_EPSILON
  ) {
    return 0;
  }
  if (
    await isProjectedQuoteQtyMarginExecutable({
      sessionId,
      instrumentId,
      positionQty,
      cashBalance,
      settings,
      side,
      qty: requestedQty,
      price,
      round,
    })
  ) {
    return requestedQty;
  }
  const tradeStep = Math.max(
    POSITION_EPSILON,
    Number(settings.minTradeStep) || 1,
  );
  let lowSteps = 0;
  let highSteps = Math.floor(requestedQty / tradeStep + POSITION_EPSILON);
  while (lowSteps < highSteps) {
    const midSteps = Math.ceil((lowSteps + highSteps) / 2);
    const qty = Math.max(0, round(midSteps * tradeStep, 8));
    if (
      await isProjectedQuoteQtyMarginExecutable({
        sessionId,
        instrumentId,
        positionQty,
        cashBalance,
        settings,
        side,
        qty,
        price,
        round,
      })
    ) {
      lowSteps = midSteps;
    } else {
      highSteps = midSteps - 1;
    }
  }
  return Math.max(0, round(lowSteps * tradeStep, 8));
};

export const createSessionMarginDomain = ({
  round,
}: {
  round: RoundFn;
}) => {
  const boundCalcMarginRequirements = (
    cash: number,
    positions: MarginRequirementInputRow[],
  ): MarginState => calcMarginRequirements(cash, positions, round);

  const applyProjectedMarginTruthToQuote = async ({
    sessionId,
    instrumentId,
    positionQty,
    cashBalance,
    settings,
    quote,
  }: {
    sessionId: string;
    instrumentId: string;
    positionQty: number;
    cashBalance: number;
    settings: TradingExecutionSettings;
    quote: SessionOrderQuote;
  }): Promise<SessionOrderQuote> => {
    if (quote.blockedReasonCode || quote.estimate.qty <= POSITION_EPSILON) {
      return quote;
    }
    const maxExecutableQty = await resolveMaxExecutableQuoteQtyByMargin({
      sessionId,
      instrumentId,
      positionQty,
      cashBalance,
      settings,
      side: quote.side,
      requestedQty: quote.estimate.qty,
      price: quote.estimate.price,
      round,
    });
    if (maxExecutableQty + POSITION_EPSILON >= quote.estimate.qty) {
      return quote;
    }
    const blockedReasonCode =
      quote.side === 'SELL' && positionQty <= POSITION_EPSILON
        ? 'SHORT_CAPACITY_EMPTY'
        : 'BUYING_POWER_EMPTY';
    return {
      ...quote,
      blockedReasonCode,
      blockedReason:
        blockedReasonCode === 'SHORT_CAPACITY_EMPTY'
          ? 'No short open capacity.'
          : 'No available buying power.',
    };
  };

  return {
    buildProjectedMarginRows,
    calcMarginRequirements: boundCalcMarginRequirements,
    resolveMarginRatios,
    applyProjectedMarginTruthToQuote,
  };
};
