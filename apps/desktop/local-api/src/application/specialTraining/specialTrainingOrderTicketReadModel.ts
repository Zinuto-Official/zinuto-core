// SPDX-License-Identifier: GPL-3.0-only

import type {
  SpecialTrainingOrderQuote,
} from '../../domain/specialTraining/contracts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderTicketEstimateFact = {
  price: number | null;
  qty: number | null;
  cashEffect: number | null;
  disabled: boolean;
};

export type OrderTicketSideButtonFact = {
  disabled: boolean;
  reason: string;
};

export type OrderTicketDisplayFact = {
  requestKey: string;
  questionId: string;
  buyQuote: SpecialTrainingOrderQuote | null;
  sellQuote: SpecialTrainingOrderQuote | null;
  referencePrice: number | null;
  nextOpenUnavailable: boolean;
  buyEstimate: OrderTicketEstimateFact;
  sellEstimate: OrderTicketEstimateFact;
  buyButton: OrderTicketSideButtonFact;
  sellButton: OrderTicketSideButtonFact;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toNullableFiniteNumber = (value: unknown): number | null => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const resolveReferencePrice = ({
  buyPrice,
  sellPrice,
  currentPrice,
}: {
  buyPrice: number | null;
  sellPrice: number | null;
  currentPrice: number | null;
}): number | null => {
  if (buyPrice !== null && buyPrice > 0) {
    return buyPrice;
  }
  if (sellPrice !== null && sellPrice > 0) {
    return sellPrice;
  }
  return currentPrice !== null && currentPrice > 0 ? currentPrice : null;
};

const resolveSideButtonFact = ({
  disabled,
  blockedReason,
}: {
  disabled?: boolean;
  blockedReason?: string | null;
}): OrderTicketSideButtonFact => {
  const reason = normalizeText(blockedReason);
  return {
    disabled: disabled === true || reason.length > 0,
    reason,
  };
};

const buildQuoteEstimateFact = ({
  quote,
  disabled,
}: {
  quote: SpecialTrainingOrderQuote;
  disabled: boolean;
}): OrderTicketEstimateFact => ({
  price: toNullableFiniteNumber(quote.estimate.price),
  qty: toNullableFiniteNumber(quote.estimate.qty),
  cashEffect: toNullableFiniteNumber(quote.estimate.cashEffect),
  disabled,
});

const buildRuntimeEstimateFact = ({
  estimate,
  price,
  disabled,
}: {
  estimate: { qty: number | null; cashEffect: number | null };
  price: number | null;
  disabled: boolean;
}): OrderTicketEstimateFact => ({
  price,
  qty: toNullableFiniteNumber(estimate.qty),
  cashEffect: toNullableFiniteNumber(estimate.cashEffect),
  disabled,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const buildCompletedOrderTicketDisplayFact = ({
  requestKey,
  questionId,
  buyQuote,
  sellQuote,
  currentPrice,
  buyBlockedReason,
  sellBlockedReason,
}: {
  requestKey: string;
  questionId: string;
  buyQuote: SpecialTrainingOrderQuote;
  sellQuote: SpecialTrainingOrderQuote;
  currentPrice: number | null;
  buyBlockedReason?: string | null;
  sellBlockedReason?: string | null;
}): OrderTicketDisplayFact => {
  const buyButton = resolveSideButtonFact({
    blockedReason: buyBlockedReason,
  });
  const sellButton = resolveSideButtonFact({
    blockedReason: sellBlockedReason,
  });
  const buyEstimate = buildQuoteEstimateFact({
    quote: buyQuote,
    disabled: buyButton.disabled,
  });
  const sellEstimate = buildQuoteEstimateFact({
    quote: sellQuote,
    disabled: sellButton.disabled,
  });
  return {
    requestKey,
    questionId: normalizeText(questionId),
    buyQuote,
    sellQuote,
    referencePrice: resolveReferencePrice({
      buyPrice: buyEstimate.price,
      sellPrice: sellEstimate.price,
      currentPrice: toNullableFiniteNumber(currentPrice),
    }),
    nextOpenUnavailable: !Boolean(
      buyQuote.nextOpenAvailable || sellQuote.nextOpenAvailable,
    ),
    buyEstimate,
    sellEstimate,
    buyButton,
    sellButton,
  };
};

export const buildRuntimeOrderTicketDisplayFact = ({
  requestKey,
  questionId,
  currentPrice,
  buyEstimate,
  sellEstimate,
  buyBlockedReason,
  sellBlockedReason,
  nextOpenUnavailable,
}: {
  requestKey: string;
  questionId: string;
  currentPrice: number | null;
  buyEstimate: { qty: number | null; cashEffect: number | null } | null | undefined;
  sellEstimate: { qty: number | null; cashEffect: number | null } | null | undefined;
  buyBlockedReason?: string | null;
  sellBlockedReason?: string | null;
  nextOpenUnavailable: boolean;
}): OrderTicketDisplayFact | null => {
  const normalizedQuestionId = normalizeText(questionId);
  if (!normalizedQuestionId || !buyEstimate || !sellEstimate) {
    return null;
  }
  const price = toNullableFiniteNumber(currentPrice);
  const buyButton = resolveSideButtonFact({
    blockedReason: buyBlockedReason,
  });
  const sellButton = resolveSideButtonFact({
    blockedReason: sellBlockedReason,
  });
  const buyEstimateFact = buildRuntimeEstimateFact({
    estimate: buyEstimate,
    price,
    disabled: buyButton.disabled,
  });
  const sellEstimateFact = buildRuntimeEstimateFact({
    estimate: sellEstimate,
    price,
    disabled: sellButton.disabled,
  });
  return {
    requestKey,
    questionId: normalizedQuestionId,
    buyQuote: null,
    sellQuote: null,
    referencePrice: resolveReferencePrice({
      buyPrice: buyEstimateFact.price,
      sellPrice: sellEstimateFact.price,
      currentPrice: price,
    }),
    nextOpenUnavailable,
    buyEstimate: buyEstimateFact,
    sellEstimate: sellEstimateFact,
    buyButton,
    sellButton,
  };
};

export const buildLoadingOrderTicketDisplayFact = ({
  requestKey,
  questionId,
  currentPrice,
}: {
  requestKey: string;
  questionId: string;
  currentPrice: number | null;
}): OrderTicketDisplayFact => {
  const price = toNullableFiniteNumber(currentPrice);
  return {
    requestKey,
    questionId: normalizeText(questionId),
    buyQuote: null,
    sellQuote: null,
    referencePrice: price,
    nextOpenUnavailable: true,
    buyEstimate: {
      price,
      qty: null,
      cashEffect: null,
      disabled: true,
    },
    sellEstimate: {
      price,
      qty: null,
      cashEffect: null,
      disabled: true,
    },
    buyButton: { disabled: true, reason: '' },
    sellButton: { disabled: true, reason: '' },
  };
};

export const resolveVisibleOrderTicketDisplayFact = ({
  fact,
  lifecycleActive,
  questionId,
}: {
  fact: OrderTicketDisplayFact | null;
  lifecycleActive: boolean;
  questionId: string | null | undefined;
}): OrderTicketDisplayFact | null => {
  if (!lifecycleActive || !fact) {
    return null;
  }
  return fact.questionId === normalizeText(questionId) ? fact : null;
};
