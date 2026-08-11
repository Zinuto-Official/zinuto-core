// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OrderInputMode,
  OrderSide,
  PriceMode,
} from "@zinuto/shared/trading";
import { api } from "@/api";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type {
  OrderEstimate,
  SessionOrderQuote,
  TradeCapacitySummary,
  TradeExecutionBreakdown,
  SessionTerminationReasonCode,
  TrainerOrderBlockReasonCode,
  SessionOrderActionAvailability,
} from "@/domains/training/types";
import { resolveTrainerBlockReasonText } from "@/domains/trainer/trainerOrderBlockReasonText";

type TradeInputMode = OrderInputMode;
type OrderPriceMode = PriceMode;

type SessionSnapshotLike = {
  session?: {
    id?: string | null;
    cursor_index?: number | null;
  } | null;
  fills?: unknown[] | null;
  fillsTotal?: number | null;
  actionState?: {
    tradeCapacity?: TradeCapacitySummary;
    referencePrice?: number | null;
    buyBlockedReasonCode?: TrainerOrderBlockReasonCode | null;
    buyBlockedReason?: string | null;
    sellBlockedReasonCode?: TrainerOrderBlockReasonCode | null;
    sellBlockedReason?: string | null;
    buyOrder?: SessionOrderActionAvailability | null;
    sellOrder?: SessionOrderActionAvailability | null;
  } | null;
  termination?: {
    isTerminated?: boolean;
    reasonCode?: SessionTerminationReasonCode | null;
  } | null;
};

type TradingSettingsLike = {
  minTradeStep: number;
};

export type { OrderEstimate, TradeCapacitySummary, TradeExecutionBreakdown };

export type OrderQuoteCacheState = {
  requestKey: string;
  ticketKey: string;
  buyQuote: SessionOrderQuote | null;
  sellQuote: SessionOrderQuote | null;
};

const EMPTY_BREAKDOWN: TradeExecutionBreakdown = {
  closeQty: 0,
  openQty: 0,
  closeDirection: null,
  openDirection: null,
};

const EMPTY_ESTIMATE: OrderEstimate = {
  side: "BUY",
  price: 0,
  qty: 0,
  lots: 0,
  amount: 0,
  tradingCost: 0,
  cashEffect: 0,
  executionBreakdown: EMPTY_BREAKDOWN,
};

const EMPTY_TRADE_CAPACITY: TradeCapacitySummary = {
  availableCash: 0,
  longBuyingPowerQty: 0,
  longBuyingPowerAmount: 0,
  longFinancingAmount: 0,
  shortOpenCapacityQty: 0,
  shortOpenCapacityAmount: 0,
  ratioBases: {
    buy: {
      kind: "LONG_BUYING_POWER",
      quantity: 0,
      amount: 0,
    },
    sell: {
      kind: "SHORT_OPEN_CAPACITY",
      quantity: 0,
      amount: 0,
    },
  },
};

const roundQuoteKeyNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Number(parsed.toFixed(8));
};

type UseOrderEstimationControllerArgs = {
  sessionId: string;
  trainerDisplayPeriod: DisplayPeriodKey;
  isBusy: boolean;
  isPreparingAction: boolean;
  snapshot: SessionSnapshotLike | null;
  bars: unknown[];
  currentBarClose: number;
  currentPositionQty: number;
  securitiesBalance: number;
  getSameDayBoughtQtyAtFillIndex: (fillIndex: number) => number;
  lotSizeForCurrentPool: number;
  tradingSettings: TradingSettingsLike;
  buyTradeInputMode: TradeInputMode;
  buyLotInput: string;
  buyAmountInput: string;
  buyRatioInput: string;
  buyPriceMode: OrderPriceMode;
  sellTradeInputMode: TradeInputMode;
  sellLotInput: string;
  sellAmountInput: string;
  sellRatioInput: string;
  sellPriceMode: OrderPriceMode;
  parseNumeric: (value: string) => number;
  formatMoney: (value: number, digits?: number) => string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
};

const normalizeQuoteEstimate = (
  side: OrderSide,
  quote: SessionOrderQuote | null,
): OrderEstimate =>
  quote?.estimate
    ? { ...quote.estimate, side }
    : {
        ...EMPTY_ESTIMATE,
        side,
      };

export const getActiveOrderQuoteCache = (
  quoteState: OrderQuoteCacheState | null,
  quoteRequestKey: string | null | undefined,
): OrderQuoteCacheState | null => {
  const normalizedRequestKey = String(quoteRequestKey ?? "").trim();
  if (!quoteState || !normalizedRequestKey) {
    return null;
  }
  return quoteState.requestKey === normalizedRequestKey ? quoteState : null;
};

export const getVisibleOrderQuoteCache = (
  quoteState: OrderQuoteCacheState | null,
  quoteRequestKey: string | null | undefined,
  quoteRequestTicketKey?: string | null | undefined,
  options?: {
    preservePreviousWhilePending?: boolean;
  },
): OrderQuoteCacheState | null => {
  const normalizedRequestKey = String(quoteRequestKey ?? "").trim();
  if (!quoteState || !normalizedRequestKey) {
    return null;
  }
  const activeState = getActiveOrderQuoteCache(
    quoteState,
    normalizedRequestKey,
  );
  if (activeState) {
    return activeState;
  }
  const normalizedTicketKey = String(quoteRequestTicketKey ?? "").trim();
  if (!normalizedTicketKey) {
    return quoteState;
  }
  if (quoteState.ticketKey === normalizedTicketKey) {
    return quoteState;
  }
  return options?.preservePreviousWhilePending ? quoteState : null;
};

export const readTrainerOrderQuoteAction = ({
  quoteRequestKey,
  quoteState,
  quote,
  requireActiveQuote = true,
}: {
  quoteRequestKey: string | null | undefined;
  quoteState: OrderQuoteCacheState | null;
  quote:
    | Pick<SessionOrderQuote, "enabled" | "reasonCode" | "facts">
    | null
    | undefined;
  requireActiveQuote?: boolean;
}): SessionOrderActionAvailability | null => {
  if (!quoteState) {
    return null;
  }
  if (requireActiveQuote && !getActiveOrderQuoteCache(quoteState, quoteRequestKey)) {
    return null;
  }
  return quote?.enabled === true || quote?.enabled === false
    ? {
        enabled: quote.enabled,
        reasonCode: quote.reasonCode ?? null,
        facts: quote.facts ?? {},
      }
    : null;
};

export const isTrainerOrderQuoteUnavailableForUi = (
  actionState: SessionOrderActionAvailability | null | undefined,
): boolean => {
  if (!actionState) {
    return true;
  }
  return actionState.enabled !== true;
};

const normalizeQuoteKeyText = (value: unknown): string => String(value ?? "").trim();

const normalizeQuoteKeyNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

type OrderQuoteRefreshKeyInput = {
  sessionId: string;
  hasSnapshot: boolean;
  hasBars: boolean;
  isBusy: boolean;
  isPreparingAction: boolean;
  trainerDisplayPeriod: DisplayPeriodKey;
  buyTradeInputMode: TradeInputMode;
  buyLotInput: string;
  buyAmountInput: string;
  buyRatioInput: string;
  buyPriceMode: OrderPriceMode;
  sellTradeInputMode: TradeInputMode;
  sellLotInput: string;
  sellAmountInput: string;
  sellRatioInput: string;
  sellPriceMode: OrderPriceMode;
  snapshotRefreshKey: string;
  tradingSettings: TradingSettingsLike;
};

type OrderQuoteTicketKeyInput = Omit<
  OrderQuoteRefreshKeyInput,
  "snapshotRefreshKey"
>;

export const resolveOrderQuoteSnapshotRefreshKey = (
  snapshot: SessionSnapshotLike | null,
): string => {
  if (!snapshot) {
    return "";
  }
  const rawFillsTotal = Number(snapshot.fillsTotal);
  const fillsTotal =
    Number.isFinite(rawFillsTotal) && rawFillsTotal >= 0
      ? Math.floor(rawFillsTotal)
      : Array.isArray(snapshot.fills)
        ? snapshot.fills.length
        : 0;
  const terminationReasonCode =
    snapshot.termination?.isTerminated ? snapshot.termination.reasonCode ?? null : null;
  return JSON.stringify({
    sessionId: normalizeQuoteKeyText(snapshot.session?.id),
    cursorIndex: normalizeQuoteKeyNumber(snapshot.session?.cursor_index),
    fillsTotal,
    terminationReasonCode,
    referencePrice: roundQuoteKeyNumber(snapshot.actionState?.referencePrice),
    buyBlockedReasonCode:
      snapshot.actionState?.buyBlockedReasonCode ?? null,
    sellBlockedReasonCode:
      snapshot.actionState?.sellBlockedReasonCode ?? null,
    buyOrderReasonCode:
      snapshot.actionState?.buyOrder?.reasonCode ?? null,
    sellOrderReasonCode:
      snapshot.actionState?.sellOrder?.reasonCode ?? null,
    tradeCapacity: snapshot.actionState?.tradeCapacity
      ? {
          availableCash: roundQuoteKeyNumber(
            snapshot.actionState.tradeCapacity.availableCash,
          ),
          longBuyingPowerQty: roundQuoteKeyNumber(
            snapshot.actionState.tradeCapacity.longBuyingPowerQty,
          ),
          longBuyingPowerAmount: roundQuoteKeyNumber(
            snapshot.actionState.tradeCapacity.longBuyingPowerAmount,
          ),
          longFinancingAmount: roundQuoteKeyNumber(
            snapshot.actionState.tradeCapacity.longFinancingAmount,
          ),
          shortOpenCapacityQty: roundQuoteKeyNumber(
            snapshot.actionState.tradeCapacity.shortOpenCapacityQty,
          ),
          shortOpenCapacityAmount: roundQuoteKeyNumber(
            snapshot.actionState.tradeCapacity.shortOpenCapacityAmount,
          ),
          buyRatioBasisKind:
            snapshot.actionState.tradeCapacity.ratioBases.buy.kind,
          buyRatioBasisQty: roundQuoteKeyNumber(
            snapshot.actionState.tradeCapacity.ratioBases.buy.quantity,
          ),
          sellRatioBasisKind:
            snapshot.actionState.tradeCapacity.ratioBases.sell.kind,
          sellRatioBasisQty: roundQuoteKeyNumber(
            snapshot.actionState.tradeCapacity.ratioBases.sell.quantity,
          ),
        }
      : null,
  });
};

export const resolveOrderQuoteRefreshKey = ({
  sessionId,
  hasSnapshot,
  hasBars,
  isBusy,
  isPreparingAction,
  trainerDisplayPeriod,
  buyTradeInputMode,
  buyLotInput,
  buyAmountInput,
  buyRatioInput,
  buyPriceMode,
  sellTradeInputMode,
  sellLotInput,
  sellAmountInput,
  sellRatioInput,
  sellPriceMode,
  snapshotRefreshKey,
  tradingSettings,
}: OrderQuoteRefreshKeyInput): string | null => {
  const ticketKey = resolveOrderQuoteTicketKey({
    sessionId,
    hasSnapshot,
    hasBars,
    isBusy,
    isPreparingAction,
    trainerDisplayPeriod,
    buyTradeInputMode,
    buyLotInput,
    buyAmountInput,
    buyRatioInput,
    buyPriceMode,
    sellTradeInputMode,
    sellLotInput,
    sellAmountInput,
    sellRatioInput,
    sellPriceMode,
    tradingSettings,
  });
  if (!ticketKey) {
    return null;
  }
  return JSON.stringify({
    ticketKey,
    snapshotRefreshKey,
  });
};

export const resolveOrderQuoteTicketKey = ({
  sessionId,
  hasSnapshot,
  hasBars,
  isBusy,
  isPreparingAction,
  trainerDisplayPeriod,
  buyTradeInputMode,
  buyLotInput,
  buyAmountInput,
  buyRatioInput,
  buyPriceMode,
  sellTradeInputMode,
  sellLotInput,
  sellAmountInput,
  sellRatioInput,
  sellPriceMode,
  tradingSettings,
}: OrderQuoteTicketKeyInput): string | null => {
  const normalizedSessionId = normalizeQuoteKeyText(sessionId);
  if (!normalizedSessionId || !hasSnapshot || !hasBars || isBusy || isPreparingAction) {
    return null;
  }
  return JSON.stringify({
    sessionId: normalizedSessionId,
    displayPeriod: trainerDisplayPeriod,
    buy: {
      inputMode: buyTradeInputMode,
      lotInput: normalizeQuoteKeyText(buyLotInput),
      amountInput: normalizeQuoteKeyText(buyAmountInput),
      ratioInput: normalizeQuoteKeyText(buyRatioInput),
      priceMode: buyPriceMode,
    },
    sell: {
      inputMode: sellTradeInputMode,
      lotInput: normalizeQuoteKeyText(sellLotInput),
      amountInput: normalizeQuoteKeyText(sellAmountInput),
      ratioInput: normalizeQuoteKeyText(sellRatioInput),
      priceMode: sellPriceMode,
    },
    minTradeStep: normalizeQuoteKeyNumber(tradingSettings.minTradeStep),
  });
};

export const useOrderEstimationController = ({
  sessionId,
  trainerDisplayPeriod,
  isBusy,
  isPreparingAction,
  snapshot,
  bars,
  tradingSettings,
  buyTradeInputMode,
  buyLotInput,
  buyAmountInput,
  buyRatioInput,
  buyPriceMode,
  sellTradeInputMode,
  sellLotInput,
  sellAmountInput,
  sellRatioInput,
  sellPriceMode,
  tt,
}: UseOrderEstimationControllerArgs) => {
  const [quoteState, setQuoteState] = useState<OrderQuoteCacheState | null>(null);
  const requestVersionRef = useRef(0);
  const snapshotRefreshKey = useMemo(
    () => resolveOrderQuoteSnapshotRefreshKey(snapshot),
    [
      snapshot?.fills?.length,
      snapshot?.fillsTotal,
      snapshot?.session?.cursor_index,
      snapshot?.actionState?.referencePrice,
      snapshot?.actionState?.buyBlockedReasonCode,
      snapshot?.actionState?.sellBlockedReasonCode,
      snapshot?.actionState?.buyOrder?.reasonCode,
      snapshot?.actionState?.sellOrder?.reasonCode,
      snapshot?.actionState?.tradeCapacity,
      snapshot?.session?.id,
      snapshot?.termination?.isTerminated,
      snapshot?.termination?.reasonCode,
    ],
  );
  const minTradeStep = tradingSettings.minTradeStep;

  const quoteRequest = useMemo(() => {
    const normalizedSessionId = String(sessionId || "").trim();
    const key = resolveOrderQuoteRefreshKey({
      sessionId: normalizedSessionId,
      hasSnapshot: Boolean(snapshot),
      hasBars: bars.length > 0,
      isBusy,
      isPreparingAction,
      trainerDisplayPeriod,
      buyTradeInputMode,
      buyLotInput,
      buyAmountInput,
      buyRatioInput,
      buyPriceMode,
      sellTradeInputMode,
      sellLotInput,
      sellAmountInput,
      sellRatioInput,
      sellPriceMode,
      snapshotRefreshKey,
      tradingSettings: { minTradeStep },
    });
    if (!key) {
      return null;
    }
    const ticketKey = resolveOrderQuoteTicketKey({
      sessionId: normalizedSessionId,
      hasSnapshot: Boolean(snapshot),
      hasBars: bars.length > 0,
      isBusy,
      isPreparingAction,
      trainerDisplayPeriod,
      buyTradeInputMode,
      buyLotInput,
      buyAmountInput,
      buyRatioInput,
      buyPriceMode,
      sellTradeInputMode,
      sellLotInput,
      sellAmountInput,
      sellRatioInput,
      sellPriceMode,
      tradingSettings: { minTradeStep },
    });
    if (!ticketKey) {
      return null;
    }
    return {
      key,
      ticketKey,
      sessionId: normalizedSessionId,
      buyPayload: {
        side: "BUY" as const,
        inputMode: buyTradeInputMode,
        lotInput: buyLotInput,
        amountInput: buyAmountInput,
        ratioInput: buyRatioInput,
        priceMode: buyPriceMode,
        displayPeriod: trainerDisplayPeriod,
      },
      sellPayload: {
        side: "SELL" as const,
        inputMode: sellTradeInputMode,
        lotInput: sellLotInput,
        amountInput: sellAmountInput,
        ratioInput: sellRatioInput,
        priceMode: sellPriceMode,
        displayPeriod: trainerDisplayPeriod,
      },
    };
  }, [
    bars.length > 0,
    buyAmountInput,
    buyLotInput,
    buyPriceMode,
    buyRatioInput,
    buyTradeInputMode,
    isBusy,
    isPreparingAction,
    minTradeStep,
    sellAmountInput,
    sellLotInput,
    sellPriceMode,
    sellRatioInput,
    sellTradeInputMode,
    sessionId,
    snapshot,
    snapshotRefreshKey,
    trainerDisplayPeriod,
  ]);

  useEffect(() => {
    if (!quoteRequest) {
      requestVersionRef.current += 1;
      setQuoteState(null);
      return;
    }

    requestVersionRef.current += 1;
    const requestVersion = requestVersionRef.current;
    const abortController = new AbortController();

    void Promise.all([
      api.getSessionOrderQuote(
        quoteRequest.sessionId,
        quoteRequest.buyPayload,
        { signal: abortController.signal },
      ),
      api.getSessionOrderQuote(
        quoteRequest.sessionId,
        quoteRequest.sellPayload,
        { signal: abortController.signal },
      ),
    ])
      .then(([nextBuyQuote, nextSellQuote]) => {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }
        setQuoteState({
          requestKey: quoteRequest.key,
          ticketKey: quoteRequest.ticketKey,
          buyQuote: nextBuyQuote,
          sellQuote: nextSellQuote,
        });
      })
      .catch(() => {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }
        setQuoteState((current) =>
          current?.ticketKey === quoteRequest.ticketKey ? current : null,
        );
      });

    return () => {
      abortController.abort();
    };
  }, [quoteRequest?.key]);

  const quoteRequestKey = quoteRequest?.key ?? null;
  const visibleQuoteState = getVisibleOrderQuoteCache(
    quoteState,
    quoteRequestKey,
    quoteRequest?.ticketKey ?? null,
    {
      preservePreviousWhilePending: true,
    },
  );
  const buyQuote = visibleQuoteState?.buyQuote ?? null;
  const sellQuote = visibleQuoteState?.sellQuote ?? null;

  const readOrderDisplayEstimate = useCallback(
    (side: OrderSide): OrderEstimate =>
      normalizeQuoteEstimate(side, side === "BUY" ? buyQuote : sellQuote),
    [buyQuote, sellQuote],
  );

  const buyEstimate = useMemo(() => readOrderDisplayEstimate("BUY"), [readOrderDisplayEstimate]);
  const sellEstimate = useMemo(() => readOrderDisplayEstimate("SELL"), [readOrderDisplayEstimate]);

  const tradeCapacity =
    buyQuote?.tradeCapacity ??
    sellQuote?.tradeCapacity ??
    snapshot?.actionState?.tradeCapacity ??
    EMPTY_TRADE_CAPACITY;
  const buyBlockedReasonCode =
    buyQuote?.reasonCode ?? null;
  const sellBlockedReasonCode =
    sellQuote?.reasonCode ?? null;

  const buyBlockMessage = useMemo(
    () =>
      resolveTrainerBlockReasonText(
        buyBlockedReasonCode,
        buyQuote?.blockedReason ?? "",
        tt,
      ),
    [
      buyQuote?.blockedReason,
      buyBlockedReasonCode,
      tt,
    ],
  );

  const sellBlockMessage = useMemo(
    () =>
      resolveTrainerBlockReasonText(
        sellBlockedReasonCode,
        sellQuote?.blockedReason ?? "",
        tt,
      ),
    [
      sellQuote?.blockedReason,
      sellBlockedReasonCode,
      tt,
    ],
  );

  const buyOrderActionState = readTrainerOrderQuoteAction({
    quoteRequestKey,
    quoteState: visibleQuoteState,
    quote: buyQuote,
    requireActiveQuote: false,
  });
  const sellOrderActionState = readTrainerOrderQuoteAction({
    quoteRequestKey,
    quoteState: visibleQuoteState,
    quote: sellQuote,
    requireActiveQuote: false,
  });
  const buyOrderDisabled = isTrainerOrderQuoteUnavailableForUi(buyOrderActionState);
  const sellOrderDisabled = isTrainerOrderQuoteUnavailableForUi(sellOrderActionState);

  return {
    estimateOrder: readOrderDisplayEstimate,
    buyEstimate,
    sellEstimate,
    tradeCapacity,
    buyBlockReason: buyBlockMessage,
    sellBlockReason: sellBlockMessage,
    buyOrderActionState,
    sellOrderActionState,
    buyOrderDisabled,
    sellOrderDisabled,
  };
};
