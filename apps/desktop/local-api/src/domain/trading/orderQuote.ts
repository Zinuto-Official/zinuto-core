// SPDX-License-Identifier: GPL-3.0-only

import { calculateTradingCostBreakdown } from "./feeModel.js";
import {
  POSITION_EPSILON,
  resolveContractMultiplier,
} from "./orderSizing.js";
import {
  shouldRealizeClosedLong,
  shouldRealizeCoveredShort,
} from "./pnlDecomposition.js";

import type {
  OrderPriceMode,
  TradingExecutionSettings,
  PositionDirection,
  QuotePriceSource,
  FillPriceField,
  ProjectedTradingCostBreakdown,
  ProjectedAfterFill,
  SessionActionState,
  SessionOrderQuote,
  ResolvedQuoteSessionOrderInput,
  BuildOrderQuoteContext,
} from './orderQuoteTypes.js';
export type * from './orderQuoteTypes.js';

import {
  buildDisabledReasonCode,
  buildOrderActionAvailability,
  buildOrderEstimate,
  buildTradeCapacitySummary,
  calculateProjectedMarginState,
  normalizeBlockReason,
  normalizeOrderPrice,
  normalizeTradeStepValue,
  resolveMarginRatioValue,
  resolveTradeExecutionBreakdown,
  roundProjectionNumber,
  shouldUseDirectQuantityInput,
  toFiniteNumber,
} from './orderQuoteCapacity.js';
export {
  normalizeOrderPrice,
  resolveOpenShortQtyForOrder,
  resolveTradeExecutionBreakdown,
} from './orderQuoteCapacity.js';

const resolveQuotePriceSource = (priceMode: OrderPriceMode): QuotePriceSource =>
  priceMode === "NEXT_OPEN" ? "NEXT_OPEN" : "CURRENT_CLOSE";

const resolveFillPriceField = (priceMode: OrderPriceMode): FillPriceField =>
  priceMode === "NEXT_OPEN" ? "open" : "close";

const resolveMaintenanceMarginRatioValue = ({
  settings,
  side,
}: {
  settings: TradingExecutionSettings;
  side: PositionDirection;
}): number => {
  if (side === "LONG") {
    return resolveMarginRatioValue(
      settings.allowLongMarginTrading === false
        ? 100
        : settings.longMaintenanceMarginRatio,
      100,
    );
  }
  return resolveMarginRatioValue(settings.shortMaintenanceMarginRatio, 30);
};

const buildProjectedTradingCostBreakdown = ({
  quote,
  settings,
}: {
  quote: SessionOrderQuote;
  settings: TradingExecutionSettings;
}): ProjectedTradingCostBreakdown => {
  const breakdown = calculateTradingCostBreakdown(
    Math.max(0, Number(quote.estimate.amount) || 0),
    quote.side,
    settings,
    Math.max(0, Number(quote.estimate.qty) || 0),
  );
  return {
    commission: roundProjectionNumber(breakdown.commission),
    transferFee: roundProjectionNumber(breakdown.transferFee),
    regulatoryFee: roundProjectionNumber(breakdown.regulatoryFee),
    platformFee: roundProjectionNumber(breakdown.platformFee),
    transactionLevy: roundProjectionNumber(breakdown.transactionLevy),
    fees: roundProjectionNumber(breakdown.fee),
    taxes: roundProjectionNumber(breakdown.tax),
    slippage: roundProjectionNumber(breakdown.slippage),
    totalTradingCost: roundProjectionNumber(breakdown.tradingCost),
  };
};

const projectPositionAfterFill = ({
  quote,
  context,
}: {
  quote: SessionOrderQuote;
  context: BuildOrderQuoteContext;
}): {
  cashBalance: number;
  positionQty: number;
  avgCost: number;
  realizedPnl: number;
} => {
  const settings = context.tradingSettings;
  const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
  const positionQty = toFiniteNumber(context.currentPositionQty, 0);
  const avgCost = Math.max(0, toFiniteNumber(context.currentPositionAvgCost, 0));
  const realizedPnl = toFiniteNumber(context.currentRealizedPnl, 0);
  const fillQty = Math.max(0, toFiniteNumber(quote.estimate.qty, 0));
  const fillPrice = Math.max(0, toFiniteNumber(quote.estimate.price, 0));
  const tradingCost = Math.max(0, toFiniteNumber(quote.estimate.tradingCost, 0));
  const gross = fillQty * fillPrice * contractMultiplier;

  if (fillQty <= POSITION_EPSILON || fillPrice <= POSITION_EPSILON) {
    return {
      cashBalance: toFiniteNumber(context.securitiesBalance, 0),
      positionQty,
      avgCost: Math.abs(positionQty) <= POSITION_EPSILON ? 0 : avgCost,
      realizedPnl,
    };
  }

  const splitTradingCost = (qtyPart: number): number =>
    tradingCost * (Math.max(0, qtyPart) / Math.max(POSITION_EPSILON, fillQty));

  if (quote.side === "BUY") {
    const totalCost = gross + tradingCost;
    const projectedCash = toFiniteNumber(context.securitiesBalance, 0) - totalCost;
    if (positionQty >= -POSITION_EPSILON) {
      const unitCost = settings.tradeAmountIncludesFees
        ? totalCost / Math.max(POSITION_EPSILON, fillQty * contractMultiplier)
        : fillPrice;
      const nextQty = positionQty + fillQty;
      const nextAvgCost =
        nextQty <= POSITION_EPSILON
          ? 0
          : (positionQty * avgCost + fillQty * unitCost) / nextQty;
      return {
        cashBalance: projectedCash,
        positionQty: nextQty,
        avgCost: nextAvgCost,
        realizedPnl,
      };
    }

    const shortQtyAbs = Math.max(0, -positionQty);
    const coverQty = Math.min(fillQty, shortQtyAbs);
    const longOpenQty = Math.max(0, fillQty - coverQty);
    const coverTradingCost = splitTradingCost(coverQty);
    const coverGross = fillPrice * coverQty * contractMultiplier;
    const coverUnitCost =
      coverQty <= POSITION_EPSILON
        ? fillPrice
        : settings.tradeAmountIncludesFees
          ? (coverGross + coverTradingCost) /
            Math.max(POSITION_EPSILON, coverQty * contractMultiplier)
          : fillPrice;
    const nextQtyRaw = positionQty + fillQty;
    const nextQty = Math.abs(nextQtyRaw) <= POSITION_EPSILON ? 0 : nextQtyRaw;
    let nextAvgCost = 0;
    let realizedDelta = 0;
    if (
      coverQty > POSITION_EPSILON &&
      shouldRealizeCoveredShort(settings.positionCostMode, nextQty)
    ) {
      realizedDelta +=
        (avgCost - fillPrice) * coverQty * contractMultiplier - coverTradingCost;
    }
    if (nextQty < -POSITION_EPSILON) {
      const remainShortQty = Math.max(0, -nextQty);
      nextAvgCost =
        settings.positionCostMode === "DILUTED" && coverQty > POSITION_EPSILON
          ? (shortQtyAbs * avgCost - coverUnitCost * coverQty) / remainShortQty
          : avgCost;
    } else if (nextQty > POSITION_EPSILON) {
      const longOpenTradingCost = splitTradingCost(longOpenQty);
      const longOpenGross = fillPrice * longOpenQty * contractMultiplier;
      nextAvgCost =
        longOpenQty <= POSITION_EPSILON
          ? 0
          : settings.tradeAmountIncludesFees
            ? (longOpenGross + longOpenTradingCost) /
              Math.max(POSITION_EPSILON, longOpenQty * contractMultiplier)
            : fillPrice;
    }
    return {
      cashBalance: projectedCash,
      positionQty: nextQty,
      avgCost: nextAvgCost,
      realizedPnl: realizedPnl + realizedDelta,
    };
  }

  const proceeds = gross - tradingCost;
  const projectedCash = toFiniteNumber(context.securitiesBalance, 0) + proceeds;
  const executionBreakdown = resolveTradeExecutionBreakdown({
    side: quote.side,
    qty: fillQty,
    positionQty,
  });
  const closeLongQty =
    executionBreakdown.closeDirection === "LONG"
      ? Math.max(0, executionBreakdown.closeQty)
      : 0;
  const openShortQty =
    executionBreakdown.openDirection === "SHORT"
      ? Math.max(0, executionBreakdown.openQty)
      : 0;
  const closeTradingCost = splitTradingCost(closeLongQty);
  const closeProceeds = fillPrice * closeLongQty * contractMultiplier - closeTradingCost;
  const closeUnitValue =
    closeLongQty <= POSITION_EPSILON
      ? fillPrice
      : settings.tradeAmountIncludesFees
        ? closeProceeds / Math.max(POSITION_EPSILON, closeLongQty * contractMultiplier)
        : fillPrice;
  const nextQtyRaw = positionQty - fillQty;
  const nextQty = Math.abs(nextQtyRaw) <= POSITION_EPSILON ? 0 : nextQtyRaw;
  let realizedDelta = 0;
  if (
    closeLongQty > POSITION_EPSILON &&
    shouldRealizeClosedLong(settings.positionCostMode, nextQty)
  ) {
    realizedDelta +=
      (fillPrice - avgCost) * closeLongQty * contractMultiplier - closeTradingCost;
  }
  let nextAvgCost = 0;
  if (nextQty > POSITION_EPSILON) {
    nextAvgCost =
      settings.positionCostMode === "DILUTED" && closeLongQty > POSITION_EPSILON
        ? (positionQty * avgCost - closeUnitValue * closeLongQty) / nextQty
        : avgCost;
  } else if (nextQty < -POSITION_EPSILON) {
    if (positionQty < -POSITION_EPSILON) {
      const previousShortQty = Math.max(0, -positionQty);
      const shortOpenTradingCost = splitTradingCost(fillQty);
      const shortOpenProceeds = fillPrice * fillQty * contractMultiplier - shortOpenTradingCost;
      const shortUnitValue = settings.tradeAmountIncludesFees
        ? shortOpenProceeds / Math.max(POSITION_EPSILON, fillQty * contractMultiplier)
        : fillPrice;
      nextAvgCost =
        (previousShortQty * avgCost + fillQty * shortUnitValue) /
        Math.max(POSITION_EPSILON, -nextQty);
    } else {
      const shortOpenTradingCost = splitTradingCost(openShortQty);
      const shortOpenProceeds = fillPrice * openShortQty * contractMultiplier - shortOpenTradingCost;
      nextAvgCost =
        openShortQty <= POSITION_EPSILON
          ? 0
          : settings.tradeAmountIncludesFees
            ? shortOpenProceeds /
              Math.max(POSITION_EPSILON, openShortQty * contractMultiplier)
            : fillPrice;
    }
  }
  return {
    cashBalance: projectedCash,
    positionQty: nextQty,
    avgCost: nextAvgCost,
    realizedPnl: realizedPnl + realizedDelta,
  };
};

export const buildProjectedAfterFill = (
  quote: SessionOrderQuote,
  context: BuildOrderQuoteContext,
): ProjectedAfterFill => {
  const settings = context.tradingSettings;
  const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
  const fillPrice = Math.max(0, toFiniteNumber(quote.estimate.price, 0));
  const projected = projectPositionAfterFill({ quote, context });
  const unrealizedPnl =
    projected.positionQty * (fillPrice - projected.avgCost) * contractMultiplier;
  const longInitialRatio = resolveMarginRatioValue(
    settings.allowLongMarginTrading === false
      ? 100
      : settings.longInitialMarginRatio,
    100,
  );
  const shortInitialRatio = resolveMarginRatioValue(
    settings.shortInitialMarginRatio,
    150,
  );
  const marginState = calculateProjectedMarginState({
    projectedCash: projected.cashBalance,
    projectedQty: projected.positionQty,
    price: fillPrice,
    contractMultiplier,
    longInitialRatio,
    shortInitialRatio,
    longMaintenanceRatio: resolveMaintenanceMarginRatioValue({
      settings,
      side: "LONG",
    }),
    shortMaintenanceRatio: resolveMaintenanceMarginRatioValue({
      settings,
      side: "SHORT",
    }),
  });
  return {
    cashBalance: roundProjectionNumber(projected.cashBalance),
    accountBalance: roundProjectionNumber(projected.cashBalance),
    positionQty: roundProjectionNumber(projected.positionQty, 8),
    avgCost: roundProjectionNumber(projected.avgCost, 8),
    realizedPnl: roundProjectionNumber(projected.realizedPnl),
    unrealizedPnl: roundProjectionNumber(unrealizedPnl),
    totalPnl: roundProjectionNumber(projected.realizedPnl + unrealizedPnl),
    equity: marginState.equity,
    longFinancingAmount: Math.max(0, roundProjectionNumber(-projected.cashBalance)),
    longFinancingAccrual: Math.max(
      0,
      roundProjectionNumber(context.currentLongFinancingAccrual),
    ),
    shortBorrowAccrual: Math.max(
      0,
      roundProjectionNumber(context.currentShortBorrowAccrual),
    ),
    tradingCostBreakdown: buildProjectedTradingCostBreakdown({
      quote,
      settings,
    }),
    marginState,
  };
};

export const attachProjectedAfterFill = (
  quote: SessionOrderQuote,
  context: BuildOrderQuoteContext,
): SessionOrderQuote => ({
  ...quote,
  projectedAfterFill: buildProjectedAfterFill(quote, context),
});

const resolveExposureCapacityFlags = (context: BuildOrderQuoteContext): {
  canOpenLongCapacity: boolean;
  canOpenShortCapacity: boolean;
} => {
  if (!context.canStep) {
    return {
      canOpenLongCapacity: false,
      canOpenShortCapacity: false,
    };
  }
  const positionQty = toFiniteNumber(context.currentPositionQty, 0);
  return {
    canOpenLongCapacity:
      context.canOpenMinLong || positionQty < -POSITION_EPSILON,
    canOpenShortCapacity:
      context.tradingSettings.allowShortSelling &&
      (context.canOpenMinShort || positionQty > POSITION_EPSILON),
  };
};

const resolveQuoteExposureCapacityFlags = ({
  context,
  price,
}: {
  context: BuildOrderQuoteContext;
  price: number;
}): {
  canOpenLongCapacity: boolean;
  canOpenShortCapacity: boolean;
} => {
  if (!context.canStep || !(price > POSITION_EPSILON)) {
    return {
      canOpenLongCapacity: false,
      canOpenShortCapacity: false,
    };
  }
  return {
    canOpenLongCapacity: true,
    canOpenShortCapacity: Boolean(context.tradingSettings.allowShortSelling),
  };
};

export const buildSessionActionState = (
  context: BuildOrderQuoteContext,
): SessionActionState => {
  const referencePrice = normalizeOrderPrice(context.currentBarClose);
  const nextOpenPrice = normalizeOrderPrice(context.nextOpenPrice);
  const nextOpenAvailable = nextOpenPrice > 0;
  const currentFillIndex = Math.max(0, Math.floor(context.currentFillIndex));
  const { canOpenLongCapacity, canOpenShortCapacity } =
    resolveExposureCapacityFlags(context);
  const tradeCapacity = buildTradeCapacitySummary({
    currentPositionQty: context.currentPositionQty,
    securitiesBalance: context.securitiesBalance,
    referencePrice,
    currentFillIndex,
    tradingSettings: context.tradingSettings,
    canOpenLong: canOpenLongCapacity,
    canOpenShort: canOpenShortCapacity,
    getSameDayBoughtQtyAtFillIndex: context.getSameDayBoughtQtyAtFillIndex,
  });
  const probeLotInput = shouldUseDirectQuantityInput(
    context.tradingSettings.assetClass,
  )
    ? normalizeTradeStepValue(context.tradingSettings.minTradeStep)
    : 1;
  const buyEstimate = buildOrderEstimate({
    side: "BUY",
    inputMode: "LOT",
    lotInput: probeLotInput,
    price: referencePrice,
    currentPositionQty: context.currentPositionQty,
    securitiesBalance: context.securitiesBalance,
    currentFillIndex,
    tradingSettings: context.tradingSettings,
    canOpenLong: canOpenLongCapacity,
    canOpenShort: canOpenShortCapacity,
    getSameDayBoughtQtyAtFillIndex: context.getSameDayBoughtQtyAtFillIndex,
    tradeCapacity,
  }).estimate;
  const sellEstimate = buildOrderEstimate({
    side: "SELL",
    inputMode: "LOT",
    lotInput: probeLotInput,
    price: referencePrice,
    currentPositionQty: context.currentPositionQty,
    securitiesBalance: context.securitiesBalance,
    currentFillIndex,
    tradingSettings: context.tradingSettings,
    canOpenLong: canOpenLongCapacity,
    canOpenShort: canOpenShortCapacity,
    getSameDayBoughtQtyAtFillIndex: context.getSameDayBoughtQtyAtFillIndex,
    tradeCapacity,
  }).estimate;
  const buyBlocked = normalizeBlockReason(
    buildDisabledReasonCode({
      side: "BUY",
      inputMode: "LOT",
      estimate: buyEstimate,
      priceMode: "CUR_CLOSE",
      nextOpenAvailable,
      currentPositionQty: context.currentPositionQty,
      currentFillIndex,
      tradeCapacity,
      tradingSettings: context.tradingSettings,
      getSameDayBoughtQtyAtFillIndex: context.getSameDayBoughtQtyAtFillIndex,
    }),
  );
  const sellBlocked = normalizeBlockReason(
    buildDisabledReasonCode({
      side: "SELL",
      inputMode: "LOT",
      estimate: sellEstimate,
      priceMode: "CUR_CLOSE",
      nextOpenAvailable,
      currentPositionQty: context.currentPositionQty,
      currentFillIndex,
      tradeCapacity,
      tradingSettings: context.tradingSettings,
      getSameDayBoughtQtyAtFillIndex: context.getSameDayBoughtQtyAtFillIndex,
    }),
  );
  const buyOrder = buildOrderActionAvailability({
    side: "BUY",
    inputMode: "LOT",
    priceMode: "CUR_CLOSE",
    estimate: buyEstimate,
    reasonCode: buyBlocked.code,
    referencePrice,
    currentFillIndex,
    canStep: context.canStep,
    nextOpenAvailable,
    tradingSettings: context.tradingSettings,
    tradeCapacity,
  });
  const sellOrder = buildOrderActionAvailability({
    side: "SELL",
    inputMode: "LOT",
    priceMode: "CUR_CLOSE",
    estimate: sellEstimate,
    reasonCode: sellBlocked.code,
    referencePrice,
    currentFillIndex,
    canStep: context.canStep,
    nextOpenAvailable,
    tradingSettings: context.tradingSettings,
    tradeCapacity,
  });

  return {
    allowBuy: !buyBlocked.code,
    allowSell: !sellBlocked.code,
    allowStep: context.canStep,
    nextOpenAvailable,
    referencePrice: referencePrice > 0 ? referencePrice : null,
    minTradeStep: normalizeTradeStepValue(context.tradingSettings.minTradeStep),
    buyBlockedReasonCode: buyBlocked.code,
    buyBlockedReason: buyBlocked.message,
    sellBlockedReasonCode: sellBlocked.code,
    sellBlockedReason: sellBlocked.message,
    buyOrder,
    sellOrder,
    tradeCapacity,
    canUndo: (context.undoState?.availableSteps ?? 0) > 0,
    undoAvailableSteps: Math.max(0, Math.floor(context.undoState?.availableSteps ?? 0)),
    undoMaxSteps: Math.max(1, Math.floor(context.undoState?.maxSteps ?? 5)),
    lastUndoableAction: context.undoState?.lastUndoableAction ?? null,
  };
};

export const quoteSessionOrder = (
  context: BuildOrderQuoteContext,
  input: ResolvedQuoteSessionOrderInput,
): SessionOrderQuote => {
  const normalizedNextOpenDelayBars = Math.max(
    1,
    Math.floor(Number(input.nextOpenDelayBars) || 1),
  );
  const nextOpenPrice = toFiniteNumber(context.nextOpenPrice, Number.NaN);
  const nextOpenAvailable = Number.isFinite(nextOpenPrice) && nextOpenPrice > 0;
  const currentFillIndex = Math.max(
    0,
    Math.floor(context.currentFillIndex) +
      (input.priceMode === "NEXT_OPEN"
        ? normalizedNextOpenDelayBars
        : 0),
  );
  const price = normalizeOrderPrice(
    input.priceMode === "NEXT_OPEN"
      ? nextOpenAvailable
        ? nextOpenPrice
        : 0
      : context.currentBarClose,
  );
  const { canOpenLongCapacity, canOpenShortCapacity } =
    resolveQuoteExposureCapacityFlags({ context, price });

  const { estimate, tradeCapacity } = buildOrderEstimate({
    side: input.side,
    inputMode: input.inputMode,
    lotInput: input.lotInput,
    amountInput: input.amountInput,
    ratioInput: input.ratioInput,
    price,
    currentPositionQty: context.currentPositionQty,
    securitiesBalance: context.securitiesBalance,
    currentFillIndex,
    tradingSettings: context.tradingSettings,
    canOpenLong: canOpenLongCapacity,
    canOpenShort: canOpenShortCapacity,
    getSameDayBoughtQtyAtFillIndex: context.getSameDayBoughtQtyAtFillIndex,
  });

  const blocked = normalizeBlockReason(
    buildDisabledReasonCode({
      side: input.side,
      inputMode: input.inputMode,
      estimate,
      priceMode: input.priceMode,
      nextOpenAvailable,
      currentPositionQty: context.currentPositionQty,
      currentFillIndex,
      tradeCapacity,
      tradingSettings: context.tradingSettings,
      getSameDayBoughtQtyAtFillIndex: context.getSameDayBoughtQtyAtFillIndex,
    }),
  );
  const actionAvailability = buildOrderActionAvailability({
    side: input.side,
    inputMode: input.inputMode,
    priceMode: input.priceMode,
    estimate,
    reasonCode: blocked.code,
    referencePrice: price,
    currentFillIndex,
    canStep: context.canStep,
    nextOpenAvailable,
    tradingSettings: context.tradingSettings,
    tradeCapacity,
  });

  const quote: SessionOrderQuote = {
    side: input.side,
    priceMode: input.priceMode,
    priceSource: resolveQuotePriceSource(input.priceMode),
    fillPriceField: resolveFillPriceField(input.priceMode),
    nextOpenDelayBars: normalizedNextOpenDelayBars,
    nextOpenAvailable,
    blockedReasonCode: blocked.code,
    blockedReason: blocked.message,
    enabled: actionAvailability.enabled,
    reasonCode: actionAvailability.reasonCode,
    facts: actionAvailability.facts,
    estimate,
    tradeCapacity,
    projectedAfterFill: {
      cashBalance: 0,
      accountBalance: 0,
      positionQty: 0,
      avgCost: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalPnl: 0,
      equity: 0,
      longFinancingAmount: 0,
      longFinancingAccrual: 0,
      shortBorrowAccrual: 0,
      tradingCostBreakdown: {
        commission: 0,
        transferFee: 0,
        regulatoryFee: 0,
        platformFee: 0,
        transactionLevy: 0,
        fees: 0,
        taxes: 0,
        slippage: 0,
        totalTradingCost: 0,
      },
      marginState: {
        equity: 0,
        requiredInitialEquity: 0,
        requiredMaintenanceEquity: 0,
        availableInitialEquity: 0,
        availableMaintenanceEquity: 0,
        longNotional: 0,
        shortNotional: 0,
      },
    },
  };
  return attachProjectedAfterFill(quote, context);
};
