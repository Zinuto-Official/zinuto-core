// SPDX-License-Identifier: GPL-3.0-only

import {
  executeSpecialTrainingRiskOrder,
  normalizeSpecialTrainingRiskTradeStep,
  resolveSpecialTrainingRiskOrderEstimate,
} from '@zinuto/shared/domain-calculations/special-training-risk';
import {
  isOrderInputMode,
  normalizePriceMode,
  type OrderSide,
} from '@zinuto/shared/trading';
import type {
  SpecialTrainingOrderBlockReasonCode,
  SpecialTrainingOrderEstimate,
  SpecialTrainingOrderInputMode,
  SpecialTrainingOrderPriceMode,
  SpecialTrainingOrderQuote,
  SpecialTrainingOrderQuotePayload,
  SpecialTrainingQuestionState,
  SpecialTrainingTradeAction,
  SpecialTrainingTradeRuntimeState,
} from '../../domain/specialTraining/contracts.js';

export const RISK_ORDER_BLOCK_REASON_MESSAGE: Record<
  SpecialTrainingOrderBlockReasonCode,
  string
> = {
  NO_SESSION: 'Session unavailable.',
  PRICE_UNAVAILABLE: 'Reference price unavailable.',
  NEXT_OPEN_UNAVAILABLE: 'Next open unavailable.',
  BUYING_POWER_EMPTY: 'No available buying power.',
  SELLING_DISABLED: 'No sellable position.',
  SELL_T1_BLOCKED: 'T+1 settlement blocks selling.',
  SHORT_CAPACITY_EMPTY: 'No short open capacity.',
  QUANTITY_ZERO: 'Requested quantity rounds to zero.',
  OPERATION_LIMIT_REACHED: 'Operation limit reached.',
  ENTRY_LIMIT_REACHED: 'Entry limit reached.',
};

type RiskOrderQuoteChallengeContext = {
  maxOperations: number;
  maxEntries: number;
};

type RiskOrderQuoteDraftContext = {
  cursorIndex: number;
  runtime: SpecialTrainingTradeRuntimeState;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
};

export const normalizeSpecialTrainingOrderInputMode = (
  value: unknown,
): SpecialTrainingOrderInputMode =>
  isOrderInputMode(value) ? value : 'RATIO';

export const normalizeSpecialTrainingOrderPriceMode = (
  value: unknown,
): SpecialTrainingOrderPriceMode => normalizePriceMode(value);

export const normalizeSpecialTrainingOrderInputValue = (
  value: string | number | null | undefined,
): string | number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
};

const buildSpecialTrainingOrderBlockReason = (
  code: SpecialTrainingOrderBlockReasonCode | null,
): { code: SpecialTrainingOrderBlockReasonCode | null; message: string | null } => ({
  code,
  message: code ? RISK_ORDER_BLOCK_REASON_MESSAGE[code] : null,
});

const buildSpecialTrainingOrderExecutionBreakdown = ({
  side,
  qty,
  positionQty,
}: {
  side: OrderSide;
  qty: number;
  positionQty: number;
}): SpecialTrainingOrderEstimate['executionBreakdown'] => {
  const normalizedQty = Math.max(0, toFiniteNumber(qty) || 0);
  const normalizedPositionQty = toFiniteNumber(positionQty) || 0;
  const longPositionQty = Math.max(0, normalizedPositionQty);
  const shortPositionQty = Math.max(0, -normalizedPositionQty);
  if (normalizedQty <= 1e-8) {
    return {
      closeQty: 0,
      openQty: 0,
      closeDirection: null,
      openDirection: null,
    };
  }
  if (side === 'BUY') {
    const closeQty = Math.min(shortPositionQty, normalizedQty);
    const openQty = Math.max(0, normalizedQty - closeQty);
    return {
      closeQty,
      openQty,
      closeDirection: closeQty > 1e-8 ? 'SHORT' : null,
      openDirection: openQty > 1e-8 ? 'LONG' : null,
    };
  }
  const closeQty = Math.min(longPositionQty, normalizedQty);
  const openQty = Math.max(0, normalizedQty - closeQty);
  return {
    closeQty,
    openQty,
    closeDirection: closeQty > 1e-8 ? 'LONG' : null,
    openDirection: openQty > 1e-8 ? 'SHORT' : null,
  };
};

export const buildSpecialTrainingOrderEstimate = ({
  side,
  runtime,
  order,
  price,
  tradeStep,
  maxOperations,
  maxEntries,
}: {
  side: OrderSide;
  runtime: SpecialTrainingTradeRuntimeState;
  order: {
    inputMode: SpecialTrainingOrderInputMode;
    lotInput?: string | number | null;
    amountInput?: string | number | null;
    ratioInput?: string | number | null;
  };
  price: number;
  tradeStep: number;
  maxOperations: number;
  maxEntries: number;
}): SpecialTrainingOrderEstimate => {
  const estimate = resolveSpecialTrainingRiskOrderEstimate({
    side,
    runtime,
    order,
    currentPrice: price,
    tradeStep,
    maxOperations,
    maxEntries,
  });
  const qty = estimate.qty ?? 0;
  const amount = qty * Math.max(0, price);
  return {
    side,
    price: Number.isFinite(price) && price > 0 ? price : 0,
    qty,
    lots: tradeStep > 0 ? qty / tradeStep : 0,
    amount,
    tradingCost: 0,
    cashEffect: estimate.cashEffect ?? 0,
    executionBreakdown: buildSpecialTrainingOrderExecutionBreakdown({
      side,
      qty,
      positionQty: runtime.positionQty,
    }),
  };
};

const resolveSpecialTrainingOrderExecutionPlan = ({
  question,
  draft,
  priceMode,
  nextOpenDelayBars,
}: {
  question: Pick<SpecialTrainingQuestionState, 'bars' | 'startIndex' | 'endIndex'>;
  draft: Pick<RiskOrderQuoteDraftContext, 'cursorIndex'>;
  priceMode: SpecialTrainingOrderPriceMode;
  nextOpenDelayBars: number;
}): {
  price: number;
  fillRawIndex: number | null;
  nextOpenAvailable: boolean;
  nextOpenRawIndex: number | null;
  noActionableBars: boolean;
} => {
  const delay = Math.max(1, Math.floor(nextOpenDelayBars || 1));
  const cursorIndex = clamp(draft.cursorIndex, question.startIndex, question.endIndex);
  const noActionableBars = cursorIndex >= question.endIndex;
  const nextOpenRawIndex =
    cursorIndex + delay <= question.endIndex ? cursorIndex + delay : null;
  const nextOpenPrice =
    nextOpenRawIndex === null
      ? Number.NaN
      : toFiniteNumber(question.bars[nextOpenRawIndex]?.open);
  const nextOpenAvailable =
    !noActionableBars && Number.isFinite(nextOpenPrice) && nextOpenPrice > 0;
  if (priceMode === 'NEXT_OPEN') {
    return {
      price: nextOpenAvailable ? nextOpenPrice : 0,
      fillRawIndex: nextOpenAvailable ? nextOpenRawIndex : null,
      nextOpenAvailable,
      nextOpenRawIndex,
      noActionableBars,
    };
  }
  const currentClose = toFiniteNumber(question.bars[cursorIndex]?.close);
  return {
    price: Number.isFinite(currentClose) && currentClose > 0 ? currentClose : 0,
    fillRawIndex: cursorIndex,
    nextOpenAvailable,
    nextOpenRawIndex,
    noActionableBars,
  };
};

export const buildSpecialTrainingOrderQuoteForDraft = ({
  challenge,
  question,
  draft,
  payload,
}: {
  challenge: RiskOrderQuoteChallengeContext;
  question: Pick<
    SpecialTrainingQuestionState,
    'bars' | 'startIndex' | 'endIndex' | 'minTradeStep'
  >;
  draft: RiskOrderQuoteDraftContext;
  payload: SpecialTrainingOrderQuotePayload;
}): SpecialTrainingOrderQuote => {
  const side = payload.side === 'SELL' ? 'SELL' : 'BUY';
  const inputMode = normalizeSpecialTrainingOrderInputMode(payload.inputMode);
  const priceMode = normalizeSpecialTrainingOrderPriceMode(payload.priceMode);
  const nextOpenDelayBars = Math.max(
    1,
    Math.floor(Number(payload.nextOpenDelayBars) || 1),
  );
  const execution = resolveSpecialTrainingOrderExecutionPlan({
    question,
    draft,
    priceMode,
    nextOpenDelayBars,
  });
  const tradeStep = normalizeSpecialTrainingRiskTradeStep(question.minTradeStep);
  const order = {
    inputMode,
    lotInput: normalizeSpecialTrainingOrderInputValue(payload.lotInput),
    amountInput: normalizeSpecialTrainingOrderInputValue(payload.amountInput),
    ratioInput: normalizeSpecialTrainingOrderInputValue(payload.ratioInput),
  };
  const estimate = buildSpecialTrainingOrderEstimate({
    side,
    runtime: draft.runtime,
    order,
    price: execution.price,
    tradeStep,
    maxOperations: challenge.maxOperations,
    maxEntries: challenge.maxEntries,
  });

  let blockCode: SpecialTrainingOrderBlockReasonCode | null = null;
  if (execution.noActionableBars) {
    blockCode = 'NEXT_OPEN_UNAVAILABLE';
  } else if (!(execution.price > 0)) {
    blockCode =
      priceMode === 'NEXT_OPEN' ? 'NEXT_OPEN_UNAVAILABLE' : 'PRICE_UNAVAILABLE';
  } else if (priceMode === 'NEXT_OPEN' && !execution.nextOpenAvailable) {
    blockCode = 'NEXT_OPEN_UNAVAILABLE';
  } else if (
    challenge.maxOperations > 0 &&
    draft.runtime.usedOperations >= challenge.maxOperations
  ) {
    blockCode = 'OPERATION_LIMIT_REACHED';
  } else if (
    side === 'BUY' &&
    draft.runtime.positionQty >= 0 &&
    challenge.maxEntries > 0 &&
    draft.runtime.openCount >= challenge.maxEntries
  ) {
    blockCode = 'ENTRY_LIMIT_REACHED';
  } else if (
    side === 'BUY' &&
    draft.runtime.positionQty >= 0 &&
    draft.runtime.cashBalance <= 0
  ) {
    blockCode = 'BUYING_POWER_EMPTY';
  } else if (side === 'SELL' && draft.runtime.positionQty <= 0) {
    blockCode = 'SELLING_DISABLED';
  } else if (estimate.qty <= 0) {
    blockCode = 'QUANTITY_ZERO';
  }

  const blocked = buildSpecialTrainingOrderBlockReason(blockCode);
  return {
    side,
    priceMode,
    nextOpenDelayBars,
    nextOpenAvailable: execution.nextOpenAvailable,
    blockedReasonCode: blocked.code,
    blockedReason: blocked.message,
    estimate,
    executionPlan: {
      displayPeriod: null,
      fillRawIndex: execution.fillRawIndex,
      fillPrice: execution.price > 0 ? execution.price : null,
      targetRawIndex: execution.fillRawIndex,
      nextOpenDisplayIndex: execution.nextOpenRawIndex,
    },
  };
};

export const executeSpecialTrainingTradeAction = ({
  runtime,
  action,
  markPrice,
  tradeStep,
  maxOperations,
  maxEntries,
}: {
  runtime: SpecialTrainingTradeRuntimeState;
  action: SpecialTrainingTradeAction;
  markPrice: number;
  tradeStep: number;
  maxOperations: number;
  maxEntries: number;
}): SpecialTrainingTradeRuntimeState => {
  const executionPrice = action.executionPrice > 0 ? action.executionPrice : markPrice;
  const quotedEstimate =
    action.quantity > 0
      ? null
      : resolveSpecialTrainingRiskOrderEstimate({
          side: action.type,
          runtime,
          order: {
            inputMode: action.inputMode,
            lotInput: action.lotInput,
            amountInput: action.amountInput,
            ratioInput: action.ratioInput,
          },
          currentPrice: executionPrice,
          tradeStep,
          maxOperations,
          maxEntries,
        });
  const quantity = action.quantity > 0 ? action.quantity : quotedEstimate?.qty ?? 0;
  const result = executeSpecialTrainingRiskOrder({
    runtime,
    side: action.type,
    qty: quantity,
    executionPrice,
    tradeStep,
    maxOperations,
    maxEntries,
  });
  return result.runtime;
};
