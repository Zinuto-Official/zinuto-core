// SPDX-License-Identifier: GPL-3.0-only

import { calculateTradingCostBreakdown } from './feeModel.js';
import {
  POSITION_EPSILON,
  quantizeQtyDownByStep,
  resolveContractMultiplier,
  resolveQtyFromTradeAmount,
} from './orderSizing.js';
import type {
  LongBuyingPower,
  OrderEstimate,
  OrderPriceMode,
  OrderSide,
  SessionOrderActionAvailability,
  TradeCapacitySummary,
  TradeCapacityRatioBasis,
  TradeExecutionBreakdown,
  TradeInputMode,
  TradingExecutionSettings,
  TrainerOrderBlockReasonCode,
} from './orderQuoteTypes.js';

export const MAX_PROJECTED_MARGIN_SEARCH_LOTS = 1_000_000;
export const ORDER_PRICE_DECIMALS = 8;
export const ORDER_INPUT_NUMBER_PATTERN =
  /^(?:\d+(?:\.\d*)?|\d{1,3}(?:,\d{3})+(?:\.\d*)?)$/;

export const BLOCK_REASON_MESSAGE: Record<TrainerOrderBlockReasonCode, string> = {
  NO_SESSION: "Session unavailable.",
  PRICE_UNAVAILABLE: "Reference price unavailable.",
  NEXT_OPEN_UNAVAILABLE: "Next open unavailable.",
  BUYING_POWER_EMPTY: "No available buying power.",
  SELLING_DISABLED: "Short selling disabled.",
  SELL_T1_BLOCKED: "T+1 settlement blocks selling.",
  SHORT_CAPACITY_EMPTY: "No short open capacity.",
  QUANTITY_ZERO: "Requested quantity rounds to zero.",
};

export const normalizeTradeStepValue = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= POSITION_EPSILON) {
    return 1;
  }
  return numeric;
};

export const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const roundProjectionNumber = (value: unknown, digits = 6): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(digits));
};

export const normalizeOrderPrice = (value: unknown): number => {
  const price = toFiniteNumber(value, 0);
  return price > POSITION_EPSILON ? Number(price.toFixed(ORDER_PRICE_DECIMALS)) : 0;
};

export const parseOrderInputNumber = (input: string | number | null | undefined): number => {
  if (typeof input === "number") {
    return Number.isFinite(input) && input > 0 ? input : 0;
  }
  const normalized = String(input ?? "").trim();
  if (!normalized || !ORDER_INPUT_NUMBER_PATTERN.test(normalized)) {
    return 0;
  }
  const numeric = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export const shouldUseDirectQuantityInput = (
  assetClass: TradingExecutionSettings["assetClass"],
): boolean => assetClass === "CRYPTO";

export const resolveMarginRatioValue = (
  value: number | undefined,
  fallbackPercent: number,
): number => {
  const numeric = Number(value);
  const effectivePercent =
    Number.isFinite(numeric) && numeric > 0 ? numeric : fallbackPercent;
  if (!Number.isFinite(effectivePercent) || effectivePercent <= 0) {
    return 1e-6;
  }
  return Math.max(1e-6, effectivePercent / 100);
};

export const calculateTradingExecutionCost = ({
  settings,
  side,
  qty,
  price,
  contractMultiplier,
}: {
  settings: TradingExecutionSettings;
  side: OrderSide;
  qty: number;
  price: number;
  contractMultiplier: number;
}): number => {
  return calculateTradingCostBreakdown(
    Math.max(0, qty) * Math.max(0, price) * resolveContractMultiplier(contractMultiplier),
    side,
    settings,
    Math.max(0, qty),
  ).tradingCost;
};

export const calculateProjectedMarginState = ({
  projectedCash,
  projectedQty,
  price,
  contractMultiplier,
  longInitialRatio,
  shortInitialRatio,
  longMaintenanceRatio,
  shortMaintenanceRatio,
}: {
  projectedCash: number;
  projectedQty: number;
  price: number;
  contractMultiplier: number;
  longInitialRatio: number;
  shortInitialRatio: number;
  longMaintenanceRatio: number;
  shortMaintenanceRatio: number;
}) => {
  const longNotional =
    Math.max(0, projectedQty) * price * contractMultiplier;
  const shortNotional =
    Math.max(0, -projectedQty) * price * contractMultiplier;
  const equity = projectedCash + longNotional - shortNotional;
  const requiredInitialEquity =
    longNotional * longInitialRatio + shortNotional * shortInitialRatio;
  const requiredMaintenanceEquity =
    longNotional * longMaintenanceRatio + shortNotional * shortMaintenanceRatio;
  return {
    equity: roundProjectionNumber(equity),
    requiredInitialEquity: roundProjectionNumber(requiredInitialEquity),
    requiredMaintenanceEquity: roundProjectionNumber(requiredMaintenanceEquity),
    availableInitialEquity: roundProjectionNumber(equity - requiredInitialEquity),
    availableMaintenanceEquity: roundProjectionNumber(equity - requiredMaintenanceEquity),
    longNotional: roundProjectionNumber(longNotional),
    shortNotional: roundProjectionNumber(shortNotional),
  };
};

export const resolveTradeExecutionBreakdown = ({
  side,
  qty,
  positionQty,
}: {
  side: OrderSide;
  qty: number;
  positionQty: number;
}): TradeExecutionBreakdown => {
  const normalizedQty = Math.max(0, Number(qty) || 0);
  const normalizedPositionQty = Number(positionQty) || 0;
  const longPositionQty = Math.max(0, normalizedPositionQty);
  const shortPositionQty = Math.max(0, -normalizedPositionQty);
  if (normalizedQty <= POSITION_EPSILON) {
    return {
      closeQty: 0,
      openQty: 0,
      closeDirection: null,
      openDirection: null,
    };
  }
  if (side === "BUY") {
    const closeQty = Math.min(shortPositionQty, normalizedQty);
    const openQty = Math.max(0, normalizedQty - closeQty);
    return {
      closeQty,
      openQty,
      closeDirection: closeQty > POSITION_EPSILON ? "SHORT" : null,
      openDirection: openQty > POSITION_EPSILON ? "LONG" : null,
    };
  }
  const closeQty = Math.min(longPositionQty, normalizedQty);
  const openQty = Math.max(0, normalizedQty - closeQty);
  return {
    closeQty,
    openQty,
    closeDirection: closeQty > POSITION_EPSILON ? "LONG" : null,
    openDirection: openQty > POSITION_EPSILON ? "SHORT" : null,
  };
};

export const resolveOpenShortQtyForOrder = ({
  side,
  qty,
  positionQty,
}: {
  side: OrderSide;
  qty: number;
  positionQty: number;
}): number => {
  if (side !== "SELL") {
    return 0;
  }
  const breakdown = resolveTradeExecutionBreakdown({
    side,
    qty,
    positionQty,
  });
  return breakdown.openDirection === "SHORT"
    ? Math.max(0, breakdown.openQty)
    : 0;
};

export const resolveRatioCapacityBasis = ({
  side,
  price,
  contractMultiplier,
  longPositionQty,
  sellableLongQty,
  longBuyingPowerQty,
  shortOpenCapacityQty,
}: {
  side: OrderSide;
  price: number;
  contractMultiplier: number;
  longPositionQty: number;
  sellableLongQty: number;
  longBuyingPowerQty: number;
  shortOpenCapacityQty: number;
}): TradeCapacityRatioBasis => {
  const referencePrice = Math.max(0, Number(price) || 0);
  const normalizedContractMultiplier = resolveContractMultiplier(contractMultiplier);
  if (side === "SELL" && longPositionQty > POSITION_EPSILON) {
    const closableQty = Math.max(0, sellableLongQty);
    return {
      kind: "CLOSE_LONG",
      quantity: closableQty,
      amount: closableQty * referencePrice * normalizedContractMultiplier,
    };
  }
  if (side === "BUY") {
    return {
      kind: "LONG_BUYING_POWER",
      quantity: Math.max(0, longBuyingPowerQty),
      amount:
        Math.max(0, longBuyingPowerQty) *
        referencePrice *
        normalizedContractMultiplier,
    };
  }
  return {
    kind: "SHORT_OPEN_CAPACITY",
    quantity: Math.max(0, shortOpenCapacityQty),
    amount:
      Math.max(0, shortOpenCapacityQty) *
      referencePrice *
      normalizedContractMultiplier,
  };
};

export const resolveRatioOrderQty = ({
  ratioPercent,
  basisQty,
  useDirectQuantityInput,
  lot,
}: {
  ratioPercent: number;
  basisQty: number;
  useDirectQuantityInput: boolean;
  lot: number;
}): number => {
  const normalizedBasisQty = Math.max(0, Number(basisQty) || 0);
  const normalizedRatio = Math.max(
    0,
    Math.min(100, Number.isFinite(ratioPercent) ? ratioPercent : 0),
  );
  if (
    normalizedBasisQty <= POSITION_EPSILON ||
    normalizedRatio <= POSITION_EPSILON
  ) {
    return 0;
  }
  if (useDirectQuantityInput) {
    return normalizedBasisQty * (normalizedRatio / 100);
  }
  const normalizedLot = normalizeTradeStepValue(lot);
  const basisLots = Math.floor(normalizedBasisQty / normalizedLot + 1e-9);
  const targetLots = Math.floor(basisLots * (normalizedRatio / 100) + 1e-9);
  return Math.max(0, targetLots * normalizedLot);
};

export const isLotsAffordableByProjectedMargin = ({
  lots,
  lot,
  positionQty,
  availableCash,
  price,
  contractMultiplier,
  side,
  tradingCostForQty,
  longInitialRatio,
  shortInitialRatio,
}: {
  lots: number;
  lot: number;
  positionQty: number;
  availableCash: number;
  price: number;
  contractMultiplier: number;
  side: OrderSide;
  tradingCostForQty: (qty: number) => number;
  longInitialRatio: number;
  shortInitialRatio: number;
}): boolean => {
  const qty = Math.max(0, lots) * lot;
  if (qty <= POSITION_EPSILON) {
    return true;
  }
  const amount = qty * price * contractMultiplier;
  const tradingCost = tradingCostForQty(qty);
  const projectedQty = side === "BUY" ? positionQty + qty : positionQty - qty;
  const projectedCash =
    side === "BUY"
      ? availableCash - amount - tradingCost
      : availableCash + amount - tradingCost;
  const marginState = calculateProjectedMarginState({
    projectedCash,
    projectedQty,
    price,
    contractMultiplier,
    longInitialRatio,
    shortInitialRatio,
    longMaintenanceRatio: longInitialRatio,
    shortMaintenanceRatio: shortInitialRatio,
  });
  return (
    marginState.equity + POSITION_EPSILON >=
    marginState.requiredInitialEquity
  );
};

export const resolveMaxLotsByProjectedMargin = ({
  lot,
  positionQty,
  availableCash,
  price,
  contractMultiplier,
  side,
  tradingCostForQty,
  longInitialRatio,
  shortInitialRatio,
  minimumAffordableLots = 0,
}: {
  lot: number;
  positionQty: number;
  availableCash: number;
  price: number;
  contractMultiplier: number;
  side: OrderSide;
  tradingCostForQty: (qty: number) => number;
  longInitialRatio: number;
  shortInitialRatio: number;
  minimumAffordableLots?: number;
}): number => {
  const normalizedMinimumLots = Math.max(0, Math.floor(minimumAffordableLots));
  if (
    !isLotsAffordableByProjectedMargin({
      lots: normalizedMinimumLots,
      lot,
      positionQty,
      availableCash,
      price,
      contractMultiplier,
      side,
      tradingCostForQty,
      longInitialRatio,
      shortInitialRatio,
    })
  ) {
    return 0;
  }

  let low = normalizedMinimumLots;
  let high = Math.max(
    1,
    normalizedMinimumLots === 0 ? 1 : normalizedMinimumLots,
  );

  while (
    high < MAX_PROJECTED_MARGIN_SEARCH_LOTS &&
    isLotsAffordableByProjectedMargin({
      lots: high,
      lot,
      positionQty,
      availableCash,
      price,
      contractMultiplier,
      side,
      tradingCostForQty,
      longInitialRatio,
      shortInitialRatio,
    })
  ) {
    low = high;
    high = Math.min(
      MAX_PROJECTED_MARGIN_SEARCH_LOTS,
      Math.max(high + 1, high * 2),
    );
  }

  if (high === low) {
    return low;
  }

  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    if (
      isLotsAffordableByProjectedMargin({
        lots: mid,
        lot,
        positionQty,
        availableCash,
        price,
        contractMultiplier,
        side,
        tradingCostForQty,
        longInitialRatio,
        shortInitialRatio,
      })
    ) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
};

export const resolveSellT1RestrictionState = ({
  tradeSettlementMode,
  longPositionQty,
  estimatedFillIndex,
  getSameDayBoughtQtyAtFillIndex,
}: {
  tradeSettlementMode: TradingExecutionSettings["tradeSettlementMode"];
  longPositionQty: number;
  estimatedFillIndex: number | null;
  getSameDayBoughtQtyAtFillIndex: (fillIndex: number) => number;
}) => {
  if (
    tradeSettlementMode !== "T1" ||
    !(longPositionQty > POSITION_EPSILON) ||
    estimatedFillIndex === null
  ) {
    return {
      sellableQty: longPositionQty,
      isBlocked: false,
    };
  }
  const sameDayBoughtQty = Math.max(
    0,
    Number(getSameDayBoughtQtyAtFillIndex(Math.max(0, Math.floor(estimatedFillIndex)))) || 0,
  );
  const sellableQty = Math.max(0, longPositionQty - sameDayBoughtQty);
  return {
    sellableQty,
    isBlocked: sellableQty <= POSITION_EPSILON,
  };
};

export const resolveLongBuyingPower = ({
  lot,
  positionQty,
  availableCash,
  price,
  contractMultiplier,
  longInitialRatio,
  shortInitialRatio,
  tradingCostForQty,
}: {
  lot: number;
  positionQty: number;
  availableCash: number;
  price: number;
  contractMultiplier: number;
  longInitialRatio: number;
  shortInitialRatio: number;
  tradingCostForQty: (qty: number) => number;
}): LongBuyingPower => {
  const normalizedLot = normalizeTradeStepValue(lot);
  const maxBuyLots = resolveMaxLotsByProjectedMargin({
    lot: normalizedLot,
    positionQty,
    availableCash,
    price,
    contractMultiplier,
    side: "BUY",
    tradingCostForQty,
    longInitialRatio,
    shortInitialRatio,
    minimumAffordableLots: Math.floor(
      Math.max(0, -Number(positionQty) || 0) / normalizedLot,
    ),
  });
  const qty = maxBuyLots * normalizedLot;
  const amount =
    qty * Math.max(0, Number(price) || 0) * resolveContractMultiplier(contractMultiplier);
  const tradingCost = tradingCostForQty(qty);
  const cashEffect = amount + tradingCost;
  const projectedCash = Math.max(0, Number(availableCash) || 0) - cashEffect;
  return {
    qty: Math.max(0, qty),
    lots: Math.max(0, maxBuyLots),
    amount: Math.max(0, amount),
    tradingCost: Math.max(0, tradingCost),
    cashEffect: Math.max(0, cashEffect),
    financingAmount: Math.max(0, -projectedCash),
  };
};

export const normalizeBlockReason = (
  code: TrainerOrderBlockReasonCode | null,
): { code: TrainerOrderBlockReasonCode | null; message: string | null } => ({
  code,
  message: code ? BLOCK_REASON_MESSAGE[code] : null,
});

export const buildOrderActionAvailability = ({
  side,
  inputMode,
  priceMode,
  estimate,
  reasonCode,
  referencePrice,
  currentFillIndex,
  canStep,
  nextOpenAvailable,
  tradingSettings,
  tradeCapacity,
}: {
  side: OrderSide;
  inputMode: TradeInputMode;
  priceMode: OrderPriceMode;
  estimate: OrderEstimate;
  reasonCode: TrainerOrderBlockReasonCode | null;
  referencePrice: number;
  currentFillIndex: number;
  canStep: boolean;
  nextOpenAvailable: boolean;
  tradingSettings: TradingExecutionSettings;
  tradeCapacity: TradeCapacitySummary;
}): SessionOrderActionAvailability => ({
  enabled: reasonCode === null,
  reasonCode,
  facts: {
    side,
    inputMode,
    priceMode,
    referencePrice: referencePrice > 0 ? referencePrice : null,
    price: estimate.price > 0 ? estimate.price : null,
    qty: Math.max(0, toFiniteNumber(estimate.qty, 0)),
    lots: Math.max(0, toFiniteNumber(estimate.lots, 0)),
    amount: Math.max(0, toFiniteNumber(estimate.amount, 0)),
    cashEffect: toFiniteNumber(estimate.cashEffect, 0),
    currentFillIndex: Math.max(0, Math.floor(Number(currentFillIndex) || 0)),
    canStep,
    nextOpenAvailable,
    minTradeStep: normalizeTradeStepValue(tradingSettings.minTradeStep),
    assetClass: tradingSettings.assetClass,
    tradeSettlementMode: tradingSettings.tradeSettlementMode,
    allowLongMarginTrading: Boolean(tradingSettings.allowLongMarginTrading),
    allowShortSelling: Boolean(tradingSettings.allowShortSelling),
    availableCash: Math.max(0, toFiniteNumber(tradeCapacity.availableCash, 0)),
    longBuyingPowerQty: Math.max(
      0,
      toFiniteNumber(tradeCapacity.longBuyingPowerQty, 0),
    ),
    shortOpenCapacityQty: Math.max(
      0,
      toFiniteNumber(tradeCapacity.shortOpenCapacityQty, 0),
    ),
  },
});

export const buildTradeCapacitySummary = ({
  currentPositionQty,
  securitiesBalance,
  referencePrice,
  currentFillIndex,
  tradingSettings,
  canOpenLong,
  canOpenShort,
  getSameDayBoughtQtyAtFillIndex,
}: {
  currentPositionQty: number;
  securitiesBalance: number;
  referencePrice: number;
  currentFillIndex: number;
  tradingSettings: TradingExecutionSettings;
  canOpenLong: boolean;
  canOpenShort: boolean;
  getSameDayBoughtQtyAtFillIndex: (fillIndex: number) => number;
}): TradeCapacitySummary => {
  const lot = normalizeTradeStepValue(tradingSettings.minTradeStep);
  const positionQty = toFiniteNumber(currentPositionQty, 0);
  const availableCash = toFiniteNumber(securitiesBalance, 0);
  const longPositionQty = Math.max(0, positionQty);
  const shortPositionQty = Math.max(0, -positionQty);
  const contractMultiplier = resolveContractMultiplier(
    tradingSettings.contractMultiplier,
    1,
  );
  const longInitialRatio = resolveMarginRatioValue(
    tradingSettings.allowLongMarginTrading === false
      ? 100
      : tradingSettings.longInitialMarginRatio,
    100,
  );
  const shortInitialRatio = resolveMarginRatioValue(
    tradingSettings.shortInitialMarginRatio,
    150,
  );

  const tradingCostForQty = (qty: number, side: OrderSide) =>
    calculateTradingExecutionCost({
      settings: tradingSettings,
      side,
      qty,
      price: referencePrice,
      contractMultiplier,
    });

  const rawLongBuyingPower = resolveLongBuyingPower({
    lot,
    positionQty,
    availableCash,
    price: referencePrice,
    contractMultiplier,
    longInitialRatio,
    shortInitialRatio,
    tradingCostForQty: (qty) => tradingCostForQty(qty, "BUY"),
  });
  const longBuyingPower = !canOpenLong
    ? {
        ...rawLongBuyingPower,
        qty: Math.min(shortPositionQty, rawLongBuyingPower.qty),
        lots:
          lot > POSITION_EPSILON
            ? Math.min(shortPositionQty, rawLongBuyingPower.qty) / lot
            : 0,
        amount:
          Math.min(shortPositionQty, rawLongBuyingPower.qty) *
          Math.max(0, referencePrice) *
          contractMultiplier,
        cashEffect:
          Math.min(shortPositionQty, rawLongBuyingPower.qty) *
            Math.max(0, referencePrice) *
            contractMultiplier +
          tradingCostForQty(
            Math.min(shortPositionQty, rawLongBuyingPower.qty),
            "BUY",
          ),
        financingAmount: 0,
      }
    : rawLongBuyingPower;

  const sellableQtyByRule =
    tradingSettings.tradeSettlementMode === "T1"
      ? Math.max(
          0,
          longPositionQty -
            Math.max(
              0,
              Number(getSameDayBoughtQtyAtFillIndex(currentFillIndex)) || 0,
            ),
        )
      : longPositionQty;
  const sellableLots = Math.floor(Math.max(0, sellableQtyByRule) / lot);
  const hasUnsettledLong =
    tradingSettings.tradeSettlementMode === "T1" &&
    longPositionQty > sellableQtyByRule + POSITION_EPSILON;

  let shortOpenCapacityQty = 0;
  if (
    referencePrice > 0 &&
    tradingSettings.allowShortSelling &&
    canOpenShort &&
    !hasUnsettledLong
  ) {
    const maxSellLots = resolveMaxLotsByProjectedMargin({
      lot,
      positionQty,
      availableCash,
      price: referencePrice,
      contractMultiplier,
      side: "SELL",
      tradingCostForQty: (qty) => tradingCostForQty(qty, "SELL"),
      longInitialRatio,
      shortInitialRatio,
      minimumAffordableLots: sellableLots,
    });
    shortOpenCapacityQty = Math.max(0, maxSellLots - sellableLots) * lot;
  }

  return {
    availableCash,
    longBuyingPowerQty: Math.max(0, longBuyingPower.qty),
    longBuyingPowerAmount: Math.max(0, longBuyingPower.cashEffect),
    longFinancingAmount: Math.max(0, longBuyingPower.financingAmount),
    shortOpenCapacityQty: Math.max(0, shortOpenCapacityQty),
    shortOpenCapacityAmount:
      Math.max(0, shortOpenCapacityQty) * Math.max(0, referencePrice) * contractMultiplier,
    ratioBases: {
      buy: resolveRatioCapacityBasis({
        side: "BUY",
        price: referencePrice,
        contractMultiplier,
        longPositionQty,
        sellableLongQty: sellableQtyByRule,
        longBuyingPowerQty: longBuyingPower.qty,
        shortOpenCapacityQty,
      }),
      sell: resolveRatioCapacityBasis({
        side: "SELL",
        price: referencePrice,
        contractMultiplier,
        longPositionQty,
        sellableLongQty: sellableQtyByRule,
        longBuyingPowerQty: longBuyingPower.qty,
        shortOpenCapacityQty,
      }),
    },
  };
};

export const buildDisabledReasonCode = ({
  side,
  inputMode,
  estimate,
  priceMode,
  nextOpenAvailable,
  currentPositionQty,
  currentFillIndex,
  tradeCapacity,
  tradingSettings,
  getSameDayBoughtQtyAtFillIndex,
}: {
  side: OrderSide;
  inputMode: TradeInputMode;
  estimate: OrderEstimate;
  priceMode: OrderPriceMode;
  nextOpenAvailable: boolean;
  currentPositionQty: number;
  currentFillIndex: number;
  tradeCapacity: TradeCapacitySummary;
  tradingSettings: TradingExecutionSettings;
  getSameDayBoughtQtyAtFillIndex: (fillIndex: number) => number;
}): TrainerOrderBlockReasonCode | null => {
  if (!(estimate.price > 0)) {
    return "PRICE_UNAVAILABLE";
  }
  if (priceMode === "NEXT_OPEN" && !nextOpenAvailable) {
    return "NEXT_OPEN_UNAVAILABLE";
  }

  const longPositionQty = Math.max(0, toFiniteNumber(currentPositionQty, 0));
  const shortPositionQty = Math.max(0, -toFiniteNumber(currentPositionQty, 0));

  if (side === "BUY") {
    if (
      shortPositionQty <= POSITION_EPSILON &&
      tradeCapacity.longBuyingPowerQty <= POSITION_EPSILON
    ) {
      return "BUYING_POWER_EMPTY";
    }
    if (
      inputMode === "LOT" &&
      estimate.qty > tradeCapacity.longBuyingPowerQty + POSITION_EPSILON
    ) {
      return "BUYING_POWER_EMPTY";
    }
    if (estimate.qty <= POSITION_EPSILON) {
      return "QUANTITY_ZERO";
    }
    return null;
  }

  if (longPositionQty <= POSITION_EPSILON && !tradingSettings.allowShortSelling) {
    return "SELLING_DISABLED";
  }

  if (tradingSettings.tradeSettlementMode === "T1" && longPositionQty > POSITION_EPSILON) {
    const restriction = resolveSellT1RestrictionState({
      tradeSettlementMode: tradingSettings.tradeSettlementMode,
      longPositionQty,
      estimatedFillIndex: currentFillIndex,
      getSameDayBoughtQtyAtFillIndex,
    });
    if (restriction.isBlocked) {
      return "SELL_T1_BLOCKED";
    }
  }

  if (estimate.qty <= POSITION_EPSILON) {
    if (tradingSettings.allowShortSelling && longPositionQty <= POSITION_EPSILON) {
      return "SHORT_CAPACITY_EMPTY";
    }
    return "QUANTITY_ZERO";
  }

  return null;
};

export const buildOrderEstimate = ({
  side,
  inputMode,
  lotInput,
  amountInput,
  ratioInput,
  price,
  currentPositionQty,
  securitiesBalance,
  currentFillIndex,
  tradingSettings,
  canOpenLong,
  canOpenShort,
  getSameDayBoughtQtyAtFillIndex,
  tradeCapacity: precomputedTradeCapacity,
}: {
  side: OrderSide;
  inputMode: TradeInputMode;
  lotInput?: string | number | null;
  amountInput?: string | number | null;
  ratioInput?: string | number | null;
  price: number;
  currentPositionQty: number;
  securitiesBalance: number;
  currentFillIndex: number;
  tradingSettings: TradingExecutionSettings;
  canOpenLong: boolean;
  canOpenShort: boolean;
  getSameDayBoughtQtyAtFillIndex: (fillIndex: number) => number;
  tradeCapacity?: TradeCapacitySummary;
}): { estimate: OrderEstimate; tradeCapacity: TradeCapacitySummary } => {
  const lot = normalizeTradeStepValue(tradingSettings.minTradeStep);
  const useDirectQuantityInput = shouldUseDirectQuantityInput(
    tradingSettings.assetClass,
  );
  const contractMultiplier = resolveContractMultiplier(
    tradingSettings.contractMultiplier,
    1,
  );
  const positionQty = toFiniteNumber(currentPositionQty, 0);
  const longPositionQty = Math.max(0, positionQty);
  const shortPositionQty = Math.max(0, -positionQty);

  const tradingCostForQty = (qty: number, quoteSide: OrderSide) =>
    calculateTradingExecutionCost({
      settings: tradingSettings,
      side: quoteSide,
      qty,
      price,
      contractMultiplier,
    });

  const tradeCapacity =
    precomputedTradeCapacity ??
    buildTradeCapacitySummary({
      currentPositionQty,
      securitiesBalance,
      referencePrice: price,
      currentFillIndex,
      tradingSettings,
      canOpenLong,
      canOpenShort,
      getSameDayBoughtQtyAtFillIndex,
    });

  const sellableLongQty = Math.max(
    0,
    tradeCapacity.ratioBases.sell.kind === "CLOSE_LONG"
      ? tradeCapacity.ratioBases.sell.quantity
      : longPositionQty,
  );
  const maxBuyQty =
    shortPositionQty > POSITION_EPSILON && !canOpenLong
      ? Math.min(shortPositionQty, tradeCapacity.longBuyingPowerQty)
      : tradeCapacity.longBuyingPowerQty;
  const maxSellQty =
    longPositionQty > POSITION_EPSILON && canOpenShort
      ? Math.max(sellableLongQty, tradeCapacity.shortOpenCapacityQty + sellableLongQty)
      : longPositionQty > POSITION_EPSILON
        ? sellableLongQty
        : tradeCapacity.shortOpenCapacityQty;

  let qty = 0;
  if (inputMode === "LOT") {
    const primaryInput = parseOrderInputNumber(lotInput);
    qty = useDirectQuantityInput ? primaryInput : Math.floor(primaryInput) * lot;
  } else if (inputMode === "AMOUNT") {
    const targetAmount = parseOrderInputNumber(amountInput);
    qty = resolveQtyFromTradeAmount({
      side,
      amount: targetAmount,
      price,
      tradeStep: lot,
      contractMultiplier,
      settings: tradingSettings,
    });
  } else {
    const ratio = Math.min(100, parseOrderInputNumber(ratioInput));
    const ratioBasis = resolveRatioCapacityBasis({
      side,
      price,
      contractMultiplier,
      longPositionQty,
      sellableLongQty,
      longBuyingPowerQty: maxBuyQty,
      shortOpenCapacityQty: tradeCapacity.shortOpenCapacityQty,
    });
    qty = resolveRatioOrderQty({
      ratioPercent: ratio,
      basisQty: ratioBasis.quantity,
      useDirectQuantityInput,
      lot,
    });
  }

  if (side === "BUY") {
    // LOT is an explicit quantity instruction. Keep the requested quantity so
    // the quote can reject an unaffordable order instead of silently turning
    // it into a smaller fill. When opening exposure is structurally unavailable
    // (for example, at the end of the replay), still cap the order to the
    // position-closing quantity. Derived amount/ratio orders remain
    // capacity-capped.
    if (inputMode !== "LOT" || !canOpenLong) {
      qty = Math.min(qty, maxBuyQty);
    }
  } else {
    qty = Math.min(qty, maxSellQty);
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    qty = 0;
  } else {
    qty = quantizeQtyDownByStep(qty, lot);
  }
  const amount = qty * price * contractMultiplier;
  const executionBreakdown = resolveTradeExecutionBreakdown({
    side,
    qty,
    positionQty,
  });
  const tradingCost = tradingCostForQty(qty, side);

  return {
    estimate: {
      side,
      price,
      qty,
      lots: lot > 0 ? qty / lot : 0,
      amount,
      tradingCost,
      cashEffect: side === "BUY" ? amount + tradingCost : amount - tradingCost,
      executionBreakdown,
    },
    tradeCapacity,
  };
};
