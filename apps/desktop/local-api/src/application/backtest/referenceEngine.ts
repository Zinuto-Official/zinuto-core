// SPDX-License-Identifier: GPL-3.0-only

import { calculateTradingCostBreakdown } from '../../domain/trading/feeModel.js';
import {
  POSITION_EPSILON,
  quantizeQtyDownByStep,
  resolveContractMultiplier,
  resolveQtyFromTradeAmount,
} from '../../domain/trading/orderSizing.js';
import type { OhlcvBar, Side } from '../../domain/models.js';
import type {
  BacktestConflict,
  BacktestEngineFill,
  BacktestInstrumentRunResult,
  BacktestPlannedAction,
  BacktestReferenceEngineInput,
  BacktestSignal,
} from './types.js';

type PositionState = {
  cash: number;
  positionQty: number;
  avgCost: number;
  openCost: number;
  realizedPnl: number;
  closedTrades: number;
  winningTrades: number;
};

const roundNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(8));
};

const getMarkEquity = (
  state: PositionState,
  bar: OhlcvBar,
  contractMultiplier: number,
): number => roundNumber(state.cash + state.positionQty * bar.close * contractMultiplier);

const getPriceForBar = (bar: OhlcvBar, side: Side, mode: 'CUR_CLOSE' | 'NEXT_OPEN'): number => {
  const price = mode === 'NEXT_OPEN' ? bar.open : bar.close;
  const numeric = Number(price);
  if (Number.isFinite(numeric) && numeric > POSITION_EPSILON) {
    return numeric;
  }
  return side === 'BUY' ? Math.max(0, Number(bar.high) || 0) : Math.max(0, Number(bar.low) || 0);
};

const buildActionsForSignal = (
  signal: BacktestSignal,
  fillIndex: number,
): BacktestPlannedAction[] => {
  const actions: BacktestPlannedAction[] = [];
  if (signal.sell && !signal.short) {
    actions.push({ side: 'SELL', rawSignal: 'SELL', barIndex: signal.barIndex, fillIndex });
  }
  if (signal.cover && !signal.buy) {
    actions.push({ side: 'BUY', rawSignal: 'COVER', barIndex: signal.barIndex, fillIndex });
  }
  if (signal.buy) {
    actions.push({ side: 'BUY', rawSignal: 'BUY', barIndex: signal.barIndex, fillIndex });
  }
  if (signal.short) {
    actions.push({ side: 'SELL', rawSignal: 'SHORT', barIndex: signal.barIndex, fillIndex });
  }
  return actions;
};

const resolveEntryQuantity = (
  input: BacktestReferenceEngineInput,
  state: PositionState,
  side: Side,
  price: number,
  markEquity: number,
): number => {
  const settings = input.config.tradingSettings;
  const tradeStep = settings.minTradeStep;
  const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
  const sizing = input.config.orderSizing;
  const sizingValue = Number(sizing.value ?? 0);

  if (sizing.mode === 'FIXED_QTY') {
    return quantizeQtyDownByStep(sizingValue, tradeStep);
  }

  let amount = 0;
  if (sizing.mode === 'FIXED_AMOUNT') {
    amount = sizingValue;
  } else if (sizing.mode === 'EQUITY_PERCENT') {
    amount = markEquity * Math.max(0, sizingValue) / 100;
  } else {
    amount = side === 'BUY' ? state.cash : markEquity;
  }

  if (side === 'BUY' && !settings.allowLongMarginTrading) {
    amount = Math.min(amount, Math.max(0, state.cash));
  }

  return resolveQtyFromTradeAmount({
    side,
    amount,
    price,
    tradeStep,
    contractMultiplier,
    settings,
  });
};

const resolveFlatStateAfterClose = (
  input: BacktestReferenceEngineInput,
  state: PositionState,
  side: Side,
  qty: number,
  price: number,
): PositionState => {
  const contractMultiplier = resolveContractMultiplier(
    input.config.tradingSettings.contractMultiplier,
  );
  const gross = qty * price * contractMultiplier;
  const cost = calculateTradingCostBreakdown(
    gross,
    side,
    input.config.tradingSettings,
    qty,
  ).tradingCost;
  return {
    ...state,
    cash: roundNumber(
      state.cash + (side === 'SELL' ? gross : -gross) - cost,
    ),
    positionQty: 0,
    avgCost: 0,
    openCost: 0,
  };
};

const capBuyQuantityToAvailableCash = (
  input: BacktestReferenceEngineInput,
  state: PositionState,
  requestedQty: number,
  price: number,
): number => {
  const settings = input.config.tradingSettings;
  const tradeStep = settings.minTradeStep;
  const normalizedRequestedQty = quantizeQtyDownByStep(requestedQty, tradeStep);
  if (
    settings.allowLongMarginTrading
    || normalizedRequestedQty <= POSITION_EPSILON
  ) {
    return normalizedRequestedQty;
  }

  const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
  const maxSteps = Math.max(
    0,
    Math.floor(normalizedRequestedQty / tradeStep + POSITION_EPSILON),
  );
  const canAffordSteps = (steps: number): boolean => {
    const qty = steps * tradeStep;
    if (qty <= POSITION_EPSILON) {
      return true;
    }
    const gross = qty * price * contractMultiplier;
    const cost = calculateTradingCostBreakdown(
      gross,
      'BUY',
      settings,
      qty,
    ).tradingCost;
    return gross + cost <= state.cash + POSITION_EPSILON;
  };

  let low = 0;
  let high = maxSteps;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (canAffordSteps(middle)) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return roundNumber(low * tradeStep);
};

const isBuyQuantityAffordable = (
  input: BacktestReferenceEngineInput,
  state: PositionState,
  qty: number,
  price: number,
): boolean => {
  const settings = input.config.tradingSettings;
  if (settings.allowLongMarginTrading) {
    return true;
  }
  const normalizedQty = quantizeQtyDownByStep(qty, settings.minTradeStep);
  const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
  const gross = normalizedQty * price * contractMultiplier;
  const cost = calculateTradingCostBreakdown(
    gross,
    'BUY',
    settings,
    normalizedQty,
  ).tradingCost;
  return gross + cost <= state.cash + POSITION_EPSILON;
};

const resolveActionQuantity = (
  input: BacktestReferenceEngineInput,
  state: PositionState,
  action: BacktestPlannedAction,
  price: number,
  markEquity: number,
): { qty: number; blockedCode: string | null } => {
  const absPosition = Math.abs(state.positionQty);
  if (action.rawSignal === 'SELL') {
    return state.positionQty > POSITION_EPSILON
      ? { qty: absPosition, blockedCode: null }
      : { qty: 0, blockedCode: 'NO_POSITION' };
  }
  if (action.rawSignal === 'COVER') {
    if (state.positionQty >= -POSITION_EPSILON) {
      return { qty: 0, blockedCode: 'NO_POSITION' };
    }
    return { qty: absPosition, blockedCode: null };
  }
  if (action.rawSignal === 'BUY' && state.positionQty < -POSITION_EPSILON) {
    const postCloseState = resolveFlatStateAfterClose(
      input,
      state,
      'BUY',
      absPosition,
      price,
    );
    const entryQty = resolveEntryQuantity(
      input,
      postCloseState,
      action.side,
      price,
      postCloseState.cash,
    );
    const isFixedQuantity = input.config.orderSizing.mode === 'FIXED_QTY';
    const executableEntryQty =
      isFixedQuantity &&
      !isBuyQuantityAffordable(input, postCloseState, entryQty, price)
        ? 0
        : capBuyQuantityToAvailableCash(
            input,
            postCloseState,
            Math.max(0, entryQty),
            price,
          );
    return {
      // A reversal must always be allowed to reduce risk by covering the
      // existing short. An unaffordable explicit new-long quantity is not
      // silently partially filled; only the cover portion executes.
      qty: roundNumber(absPosition + executableEntryQty),
      blockedCode: null,
    };
  }
  if (action.rawSignal === 'SHORT' && state.positionQty > POSITION_EPSILON) {
    if (!input.config.tradingSettings.allowShortSelling) {
      return { qty: absPosition, blockedCode: null };
    }
    const postCloseState = resolveFlatStateAfterClose(
      input,
      state,
      'SELL',
      absPosition,
      price,
    );
    const entryQty = resolveEntryQuantity(
      input,
      postCloseState,
      action.side,
      price,
      postCloseState.cash,
    );
    return { qty: roundNumber(absPosition + Math.max(0, entryQty)), blockedCode: null };
  }
  if (action.side === 'SELL' && state.positionQty <= POSITION_EPSILON && !input.config.tradingSettings.allowShortSelling) {
    return { qty: 0, blockedCode: 'SHORT_SELLING_DISABLED' };
  }
  const entryQty = resolveEntryQuantity(input, state, action.side, price, markEquity);
  if (entryQty <= POSITION_EPSILON) {
    return { qty: 0, blockedCode: 'QUANTITY_ZERO' };
  }
  if (action.side === 'BUY') {
    if (
      input.config.orderSizing.mode === 'FIXED_QTY' &&
      !isBuyQuantityAffordable(input, state, entryQty, price)
    ) {
      return { qty: 0, blockedCode: 'INSUFFICIENT_CASH' };
    }
    const affordableQty = capBuyQuantityToAvailableCash(
      input,
      state,
      entryQty,
      price,
    );
    return affordableQty > POSITION_EPSILON
      ? { qty: affordableQty, blockedCode: null }
      : { qty: 0, blockedCode: 'INSUFFICIENT_CASH' };
  }
  return { qty: entryQty, blockedCode: null };
};

const recordCloseTrade = (state: PositionState, closePnl: number): void => {
  state.closedTrades += 1;
  if (closePnl > POSITION_EPSILON) {
    state.winningTrades += 1;
  }
};

const applyBuy = (
  state: PositionState,
  qty: number,
  price: number,
  contractMultiplier: number,
  tradingCost: number,
): void => {
  const previousQty = state.positionQty;
  const gross = qty * price * contractMultiplier;
  state.cash = roundNumber(state.cash - gross - tradingCost);
  if (previousQty < -POSITION_EPSILON) {
    const closedQty = Math.min(qty, Math.abs(previousQty));
    const closeCost = qty > POSITION_EPSILON ? tradingCost * closedQty / qty : tradingCost;
    const entryCost = state.openCost * closedQty / Math.abs(previousQty);
    const closePnl = (
      (state.avgCost - price) * closedQty * contractMultiplier
      - entryCost
      - closeCost
    );
    state.realizedPnl = roundNumber(state.realizedPnl + closePnl);
    recordCloseTrade(state, closePnl);
    const nextQty = previousQty + qty;
    if (nextQty < -POSITION_EPSILON) {
      state.positionQty = roundNumber(nextQty);
      state.openCost = Math.max(0, roundNumber(state.openCost - entryCost));
      return;
    }
    state.positionQty = roundNumber(nextQty);
    state.avgCost = nextQty > POSITION_EPSILON ? price : 0;
    state.openCost = nextQty > POSITION_EPSILON
      ? Math.max(0, roundNumber(tradingCost - closeCost))
      : 0;
    return;
  }

  const nextQty = previousQty + qty;
  state.avgCost = nextQty > POSITION_EPSILON
    ? roundNumber(((Math.max(0, previousQty) * state.avgCost) + qty * price) / nextQty)
    : 0;
  state.positionQty = roundNumber(nextQty);
  state.openCost = Math.max(0, roundNumber(state.openCost + tradingCost));
};

const applySell = (
  state: PositionState,
  qty: number,
  price: number,
  contractMultiplier: number,
  tradingCost: number,
): void => {
  const previousQty = state.positionQty;
  const gross = qty * price * contractMultiplier;
  state.cash = roundNumber(state.cash + gross - tradingCost);
  if (previousQty > POSITION_EPSILON) {
    const closedQty = Math.min(qty, previousQty);
    const closeCost = qty > POSITION_EPSILON ? tradingCost * closedQty / qty : tradingCost;
    const entryCost = state.openCost * closedQty / previousQty;
    const closePnl = (
      (price - state.avgCost) * closedQty * contractMultiplier
      - entryCost
      - closeCost
    );
    state.realizedPnl = roundNumber(state.realizedPnl + closePnl);
    recordCloseTrade(state, closePnl);
    const nextQty = previousQty - qty;
    if (nextQty > POSITION_EPSILON) {
      state.positionQty = roundNumber(nextQty);
      state.openCost = Math.max(0, roundNumber(state.openCost - entryCost));
      return;
    }
    state.positionQty = roundNumber(nextQty);
    state.avgCost = nextQty < -POSITION_EPSILON ? price : 0;
    state.openCost = nextQty < -POSITION_EPSILON
      ? Math.max(0, roundNumber(tradingCost - closeCost))
      : 0;
    return;
  }

  const nextAbsQty = Math.abs(previousQty - qty);
  state.avgCost = nextAbsQty > POSITION_EPSILON
    ? roundNumber(((Math.abs(Math.min(0, previousQty)) * state.avgCost) + qty * price) / nextAbsQty)
    : 0;
  state.positionQty = roundNumber(previousQty - qty);
  state.openCost = Math.max(0, roundNumber(state.openCost + tradingCost));
};

const applyFill = (
  input: BacktestReferenceEngineInput,
  state: PositionState,
  action: BacktestPlannedAction,
  qty: number,
  price: number,
  fillBar: OhlcvBar,
  fillSeq: number,
): BacktestEngineFill => {
  const contractMultiplier = resolveContractMultiplier(input.config.tradingSettings.contractMultiplier);
  const gross = roundNumber(qty * price * contractMultiplier);
  const cost = calculateTradingCostBreakdown(
    gross,
    action.side,
    input.config.tradingSettings,
    qty,
  );
  if (action.side === 'BUY') {
    applyBuy(state, qty, price, contractMultiplier, cost.tradingCost);
  } else {
    applySell(state, qty, price, contractMultiplier, cost.tradingCost);
  }
  return {
    instrumentId: input.instrument.instrumentId,
    symbol: input.instrument.symbol,
    orderId: `backtest:${input.instrument.instrumentId}:${action.fillIndex}:${fillSeq}`,
    fillIndex: action.fillIndex,
    fillTime: fillBar.ts,
    side: action.side,
    price: roundNumber(price),
    qty: roundNumber(qty),
    gross,
    fee: roundNumber(cost.fee),
    tax: roundNumber(cost.tax),
    slippage: roundNumber(cost.slippage),
  };
};

const appendActionsForSignal = (
  pendingActionsByFillIndex: Map<number, BacktestPlannedAction[]>,
  signal: BacktestSignal,
  fillIndex: number,
): void => {
  const actions = buildActionsForSignal(signal, fillIndex);
  if (!actions.length) {
    return;
  }
  const existing = pendingActionsByFillIndex.get(fillIndex) ?? [];
  pendingActionsByFillIndex.set(fillIndex, [...existing, ...actions]);
};

const executePlannedActions = (
  input: BacktestReferenceEngineInput,
  state: PositionState,
  conflicts: BacktestConflict[],
  fills: BacktestEngineFill[],
  actions: readonly BacktestPlannedAction[],
  fillBar: OhlcvBar,
  markBar: OhlcvBar,
  fillSeqRef: { value: number },
): void => {
  const contractMultiplier = resolveContractMultiplier(input.config.tradingSettings.contractMultiplier);
  for (const action of actions) {
    const markEquity = getMarkEquity(state, markBar, contractMultiplier);
    const price = getPriceForBar(fillBar, action.side, input.priceMode);
    const resolved = resolveActionQuantity(input, state, action, price, markEquity);
    if (resolved.blockedCode) {
      conflicts.push({
        barIndex: action.barIndex,
        code: resolved.blockedCode,
      });
      continue;
    }
    if (resolved.qty <= POSITION_EPSILON) {
      continue;
    }
    fills.push(applyFill(
      input,
      state,
      action,
      resolved.qty,
      price,
      fillBar,
      fillSeqRef.value,
    ));
    fillSeqRef.value += 1;
  }
};

export const runBacktestReferenceEngine = (
  input: BacktestReferenceEngineInput,
  initialConflicts: readonly BacktestConflict[] = [],
): BacktestInstrumentRunResult => {
  const bars = input.bars;
  const startIndex = Math.max(0, Math.floor(Number(input.config.startIndex ?? 0) || 0));
  const endIndex = Math.min(
    bars.length - 1,
    Math.floor(Number(input.config.endIndex ?? bars.length - 1) || 0),
  );
  const state: PositionState = {
    cash: input.config.initialCapital,
    positionQty: 0,
    avgCost: 0,
    openCost: 0,
    realizedPnl: 0,
    closedTrades: 0,
    winningTrades: 0,
  };
  const conflicts: BacktestConflict[] = [...initialConflicts];
  const fills: BacktestEngineFill[] = [];
  const equityCurve = [];
  let peakEquity = input.config.initialCapital;
  let maxDrawdown = 0;
  const fillSeqRef = { value: 0 };
  const contractMultiplier = resolveContractMultiplier(input.config.tradingSettings.contractMultiplier);
  const signalByBarIndex = new Map(input.signals.map((signal) => [signal.barIndex, signal]));
  const pendingActionsByFillIndex = new Map<number, BacktestPlannedAction[]>();

  for (let barIndex = startIndex; barIndex <= endIndex; barIndex += 1) {
    const bar = bars[barIndex];
    if (!bar) {
      continue;
    }
    const pendingActions = pendingActionsByFillIndex.get(barIndex) ?? [];
    if (pendingActions.length) {
      executePlannedActions(
        input,
        state,
        conflicts,
        fills,
        pendingActions,
        bar,
        bar,
        fillSeqRef,
      );
      pendingActionsByFillIndex.delete(barIndex);
    }
    const signal = signalByBarIndex.get(barIndex);
    if (signal) {
      const fillIndex = input.priceMode === 'NEXT_OPEN' ? barIndex + 1 : barIndex;
      const fillBar = fillIndex <= endIndex ? bars[fillIndex] : undefined;
      if (!fillBar) {
        if (signal.buy || signal.sell || signal.short || signal.cover) {
          conflicts.push({
            barIndex,
            code: 'FILL_BAR_UNAVAILABLE',
          });
        }
      } else if (input.priceMode === 'NEXT_OPEN') {
        appendActionsForSignal(pendingActionsByFillIndex, signal, fillIndex);
      } else {
        executePlannedActions(
          input,
          state,
          conflicts,
          fills,
          buildActionsForSignal(signal, fillIndex),
          fillBar,
          bar,
          fillSeqRef,
        );
      }
    }

    const equity = getMarkEquity(state, bar, contractMultiplier);
    peakEquity = Math.max(peakEquity, equity);
    const drawdown = peakEquity > POSITION_EPSILON
      ? roundNumber((peakEquity - equity) / peakEquity)
      : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    equityCurve.push({
      instrumentId: input.instrument.instrumentId,
      symbol: input.instrument.symbol,
      barIndex,
      barTime: bar.ts,
      equity,
      drawdown,
    });
  }

  const finalEquity = equityCurve.length
    ? equityCurve[equityCurve.length - 1]?.equity ?? input.config.initialCapital
    : input.config.initialCapital;
  const totalPnl = roundNumber(finalEquity - input.config.initialCapital);
  const profitRate = input.config.initialCapital > POSITION_EPSILON
    ? roundNumber(totalPnl / input.config.initialCapital)
    : 0;
  const winRate = state.closedTrades > 0
    ? roundNumber(state.winningTrades / state.closedTrades)
    : 0;

  return {
    instrument: input.instrument,
    result: {
      instrumentId: input.instrument.instrumentId,
      symbol: input.instrument.symbol,
      timeframe: input.instrument.baseTimeframe,
      barsCount: Math.max(0, endIndex - startIndex + 1),
      finalEquity,
      totalPnl,
      profitRate,
      maxDrawdown: roundNumber(maxDrawdown),
      winRate,
      tradeCount: fills.length,
      conflictCount: conflicts.length,
      summary: {
        realizedPnl: state.realizedPnl,
        closedTrades: state.closedTrades,
        winningTrades: state.winningTrades,
        endingPositionQty: state.positionQty,
        endingAvgCost: state.avgCost,
      },
    },
    fills,
    equityCurve,
    conflicts,
  };
};
