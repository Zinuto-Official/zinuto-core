// SPDX-License-Identifier: GPL-3.0-only

export type OrderActionAvailability = {
  enabled: boolean;
  reasonCode: string | null;
  facts: Record<string, unknown>;
};

export type OrderEstimationReadModel = {
  buyAction: OrderActionAvailability;
  sellAction: OrderActionAvailability;
  buyDisabled: boolean;
  sellDisabled: boolean;
  buyBlockedReasonCode: string | null;
  sellBlockedReasonCode: string | null;
};

type OrderQuoteLike = {
  enabled?: boolean;
  reasonCode?: string | null;
  blockedReason?: string | null;
  facts?: Record<string, unknown>;
};

const buildAvailability = (
  enabled: boolean,
  reasonCode: string | null,
  facts: Record<string, unknown> = {},
): OrderActionAvailability => ({
  enabled,
  reasonCode: enabled ? null : reasonCode,
  facts,
});

export const resolveOrderActionAvailability = (
  quote: OrderQuoteLike | null | undefined,
  fallbackReasonCode: string | null = null,
): OrderActionAvailability => {
  if (!quote) {
    return buildAvailability(false, fallbackReasonCode);
  }
  const enabled = quote.enabled === true;
  const reasonCode =
    (quote.reasonCode ?? '').trim() || fallbackReasonCode;
  return buildAvailability(
    enabled,
    reasonCode,
    quote.facts && typeof quote.facts === 'object' && !Array.isArray(quote.facts)
      ? quote.facts
      : {},
  );
};

export const resolveOrderDisabled = (
  actionState: OrderActionAvailability | null | undefined,
): boolean => {
  if (!actionState) {
    return true;
  }
  return actionState.enabled !== true;
};

export const buildOrderEstimationReadModel = ({
  buyQuote,
  sellQuote,
  fallbackBuyReasonCode,
  fallbackSellReasonCode,
}: {
  buyQuote: OrderQuoteLike | null | undefined;
  sellQuote: OrderQuoteLike | null | undefined;
  fallbackBuyReasonCode?: string | null;
  fallbackSellReasonCode?: string | null;
}): OrderEstimationReadModel => {
  const buyAction = resolveOrderActionAvailability(
    buyQuote,
    fallbackBuyReasonCode ?? null,
  );
  const sellAction = resolveOrderActionAvailability(
    sellQuote,
    fallbackSellReasonCode ?? null,
  );

  return {
    buyAction,
    sellAction,
    buyDisabled: resolveOrderDisabled(buyAction),
    sellDisabled: resolveOrderDisabled(sellAction),
    buyBlockedReasonCode: buyQuote?.reasonCode ?? null,
    sellBlockedReasonCode: sellQuote?.reasonCode ?? null,
  };
};
