// SPDX-License-Identifier: GPL-3.0-only

import type { ApiSpecialTrainingOrderQuote } from "@/api";

type RuntimeEstimateSeed = {
  qty: number | null;
  cashEffect: number | null;
};

export type StableRiskOrderTicketEstimateDisplay = {
  price: number | null;
  qty: number | null;
  cashEffect: number | null;
  disabled: boolean;
};

export type StableRiskOrderSideButtonDisplay = {
  disabled: boolean;
  label: string;
  reason: string;
  className: string;
};

export type StableRiskOrderTicketDisplayState = {
  requestKey: string;
  questionId: string;
  buyQuote: ApiSpecialTrainingOrderQuote | null;
  sellQuote: ApiSpecialTrainingOrderQuote | null;
  referencePrice: number | null;
  nextOpenUnavailable: boolean;
  buyEstimate: StableRiskOrderTicketEstimateDisplay;
  sellEstimate: StableRiskOrderTicketEstimateDisplay;
  buyButton: StableRiskOrderSideButtonDisplay;
  sellButton: StableRiskOrderSideButtonDisplay;
};

const sideButtonBaseClassName = "trade-side-action";

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const toNullableFiniteNumber = (value: unknown): number | null => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

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

export const resolveStableRiskOrderSideButtonDisplay = ({
  defaultLabel,
  disabled,
  quoteBlockedReason,
}: {
  defaultLabel: string;
  disabled?: boolean;
  quoteBlockedReason?: string | null;
}): StableRiskOrderSideButtonDisplay => {
  const reason = normalizeText(quoteBlockedReason);
  return {
    disabled: disabled === true || reason.length > 0,
    label: reason || defaultLabel,
    reason,
    className: `${sideButtonBaseClassName} ${
      reason ? "is-reason-inline" : ""
    }`.trim(),
  };
};

const buildQuoteEstimateDisplay = ({
  quote,
  disabled,
}: {
  quote: ApiSpecialTrainingOrderQuote;
  disabled: boolean;
}): StableRiskOrderTicketEstimateDisplay => ({
  price: toNullableFiniteNumber(quote.estimate.price),
  qty: toNullableFiniteNumber(quote.estimate.qty),
  cashEffect: toNullableFiniteNumber(quote.estimate.cashEffect),
  disabled,
});

const buildRuntimeEstimateDisplay = ({
  estimate,
  price,
  disabled,
}: {
  estimate: RuntimeEstimateSeed;
  price: number | null;
  disabled: boolean;
}): StableRiskOrderTicketEstimateDisplay => ({
  price,
  qty: toNullableFiniteNumber(estimate.qty),
  cashEffect: toNullableFiniteNumber(estimate.cashEffect),
  disabled,
});

export const resolveVisibleStableRiskOrderTicketDisplayState = ({
  state,
  lifecycleActive,
  questionId,
}: {
  state: StableRiskOrderTicketDisplayState | null;
  lifecycleActive: boolean;
  questionId: string | null | undefined;
}): StableRiskOrderTicketDisplayState | null => {
  if (!lifecycleActive || !state) {
    return null;
  }
  return state.questionId === normalizeText(questionId) ? state : null;
};

export const buildCompletedStableRiskOrderTicketDisplayState = ({
  requestKey,
  questionId,
  buyQuote,
  sellQuote,
  currentPrice,
  buyDefaultLabel,
  sellDefaultLabel,
  buyQuoteBlockedReason,
  sellQuoteBlockedReason,
}: {
  requestKey: string;
  questionId: string;
  buyQuote: ApiSpecialTrainingOrderQuote;
  sellQuote: ApiSpecialTrainingOrderQuote;
  currentPrice: number | null;
  buyDefaultLabel: string;
  sellDefaultLabel: string;
  buyQuoteBlockedReason?: string | null;
  sellQuoteBlockedReason?: string | null;
}): StableRiskOrderTicketDisplayState => {
  const buyButton = resolveStableRiskOrderSideButtonDisplay({
    defaultLabel: buyDefaultLabel,
    quoteBlockedReason: buyQuoteBlockedReason,
  });
  const sellButton = resolveStableRiskOrderSideButtonDisplay({
    defaultLabel: sellDefaultLabel,
    quoteBlockedReason: sellQuoteBlockedReason,
  });
  const buyEstimate = buildQuoteEstimateDisplay({
    quote: buyQuote,
    disabled: buyButton.disabled,
  });
  const sellEstimate = buildQuoteEstimateDisplay({
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

export const buildRuntimeStableRiskOrderTicketDisplayState = ({
  requestKey,
  questionId,
  currentPrice,
  buyEstimate,
  sellEstimate,
  buyDefaultLabel,
  sellDefaultLabel,
  buyBlockedReason,
  sellBlockedReason,
  nextOpenUnavailable,
}: {
  requestKey: string;
  questionId: string;
  currentPrice: number | null;
  buyEstimate: RuntimeEstimateSeed | null | undefined;
  sellEstimate: RuntimeEstimateSeed | null | undefined;
  buyDefaultLabel: string;
  sellDefaultLabel: string;
  buyBlockedReason?: string | null;
  sellBlockedReason?: string | null;
  nextOpenUnavailable: boolean;
}): StableRiskOrderTicketDisplayState | null => {
  const normalizedQuestionId = normalizeText(questionId);
  if (!normalizedQuestionId || !buyEstimate || !sellEstimate) {
    return null;
  }
  const price = toNullableFiniteNumber(currentPrice);
  const buyButton = resolveStableRiskOrderSideButtonDisplay({
    defaultLabel: buyDefaultLabel,
    quoteBlockedReason: buyBlockedReason,
  });
  const sellButton = resolveStableRiskOrderSideButtonDisplay({
    defaultLabel: sellDefaultLabel,
    quoteBlockedReason: sellBlockedReason,
  });
  const buyEstimateDisplay = buildRuntimeEstimateDisplay({
    estimate: buyEstimate,
    price,
    disabled: buyButton.disabled,
  });
  const sellEstimateDisplay = buildRuntimeEstimateDisplay({
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
      buyPrice: buyEstimateDisplay.price,
      sellPrice: sellEstimateDisplay.price,
      currentPrice: price,
    }),
    nextOpenUnavailable,
    buyEstimate: buyEstimateDisplay,
    sellEstimate: sellEstimateDisplay,
    buyButton,
    sellButton,
  };
};

export const buildLoadingStableRiskOrderTicketDisplayState = ({
  requestKey,
  questionId,
  currentPrice,
  buyDefaultLabel,
  sellDefaultLabel,
}: {
  requestKey: string;
  questionId: string;
  currentPrice: number | null;
  buyDefaultLabel: string;
  sellDefaultLabel: string;
}): StableRiskOrderTicketDisplayState => {
  const price = toNullableFiniteNumber(currentPrice);
  const buyButton = resolveStableRiskOrderSideButtonDisplay({
    defaultLabel: buyDefaultLabel,
    disabled: true,
  });
  const sellButton = resolveStableRiskOrderSideButtonDisplay({
    defaultLabel: sellDefaultLabel,
    disabled: true,
  });
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
    buyButton,
    sellButton,
  };
};
