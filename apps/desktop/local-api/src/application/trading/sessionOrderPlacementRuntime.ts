// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar, PriceMode, Side } from '../../domain/models.js';
import type { PositionRow, SessionRow, TradingExecutionSettings } from '../../domain/trading/types.js';
import type { SessionOrderRuntimeContext } from './sessionOrderQuoteRuntime.js';
import type { PendingNextOpenFillFailureMode } from './sessionPendingOrdersRuntime.js';
import {
  isQtyAlignedToTradeStep,
  POSITION_EPSILON,
  quantizeQtyDownByStep,
  resolveContractMultiplier,
  resolveQtyFromTradeAmount,
} from '../../domain/trading/orderSizing.js';
import { resolveOpenShortQtyForOrder } from '../../domain/trading/orderQuote.js';

export type PlaceOrderPayload = {
  side: Side;
  qty?: number;
  amount?: number;
  priceMode: PriceMode;
  nextOpenDelayBars?: number;
  autoStep?: boolean;
  occurredAt?: string;
};

type SessionOrderStore = {
  normalizePendingNextOpenOrders: (session: SessionRow) => void;
  cancelPendingNextOpenOrdersForSession: (sessionId: string) => void;
  createPendingOrder: (input: {
    sessionId: string;
    instrumentId: string;
    side: Side;
    qty?: number | null;
    amount?: number | null;
    priceMode: PriceMode;
    submitIndex: number;
    autoStep: boolean;
    createdAt: string;
  }) => string;
};

type ExecuteFillWithMaintenance = (
  orderId: string,
  session: SessionRow,
  side: Side,
  fillIndex: number,
  fillPrice: number,
  qty?: number,
  amount?: number,
  options?: {
    bypassSettlementCheck?: boolean;
    bypassTradeStepCheck?: boolean;
    fillBar?: OhlcvBar;
    occurredAt?: string;
  },
) => Promise<string[]>;

type StepSessionCore = (
  sessionId: string,
  count?: number,
  options?: {
    targetRawIndex?: number;
    occurredAt?: string;
    maxIndex?: number;
    pendingNextOpenFillFailureMode?: PendingNextOpenFillFailureMode;
  },
) => Promise<{
  session: SessionRow;
  fillIds: string[];
  forcedLiquidationCount: number;
}>;

type CreateSessionOrderPlacementRuntimeDeps = {
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
  round: (value: number, digits?: number) => number;
  resolveOperationIso: (value: unknown) => string;
  getSessionById: (sessionId: string) => SessionRow;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  getBarCount: (instrumentId: string) => Promise<number>;
  getOrCreatePosition: (sessionId: string, instrumentId: string) => PositionRow;
  resolveSessionTradingSettings: (session: SessionRow) => TradingExecutionSettings;
  sessionOrderStore: SessionOrderStore;
  executeFillWithMaintenance: ExecuteFillWithMaintenance;
  stepSessionCore: StepSessionCore;
};

export const createSessionOrderPlacementRuntime = ({
  appError,
  round,
  resolveOperationIso,
  getSessionById,
  getBarByIndex,
  getBarCount,
  getOrCreatePosition,
  resolveSessionTradingSettings,
  sessionOrderStore,
  executeFillWithMaintenance,
  stepSessionCore,
}: CreateSessionOrderPlacementRuntimeDeps) => {
  const assertOrderDoesNotOpenShortWhenDisabled = async (
    session: SessionRow,
    payload: {
      side: Side;
      qty?: number;
      amount?: number;
      priceMode: PriceMode;
    },
    currentBar: OhlcvBar,
    nextOpenDelayBars: number,
    options?: {
      settings?: TradingExecutionSettings;
      referenceBar?: OhlcvBar;
      currentPosition?: PositionRow;
    },
  ): Promise<void> => {
    const settings = options?.settings ?? resolveSessionTradingSettings(session);
    if (payload.side !== 'SELL' || settings.allowShortSelling) {
      return;
    }
    const referenceBar =
      payload.priceMode === 'NEXT_OPEN'
        ? options?.referenceBar ??
          (await getBarByIndex(session.instrument_id, session.cursor_index + nextOpenDelayBars))
        : currentBar;
    const referencePrice =
      payload.priceMode === 'NEXT_OPEN'
        ? Number(referenceBar?.open ?? 0)
        : Number(currentBar.close ?? 0);
    if (!Number.isFinite(referencePrice) || referencePrice <= POSITION_EPSILON) {
      return;
    }
    const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
    const rawQty =
      payload.qty && payload.qty > 0
        ? payload.qty
        : resolveQtyFromTradeAmount({
            side: payload.side,
            amount: Number(payload.amount ?? 0),
            price: referencePrice,
            tradeStep: settings.minTradeStep,
            contractMultiplier,
            settings,
          });
    const fillQty =
      payload.qty && payload.qty > 0
        ? isQtyAlignedToTradeStep(payload.qty, settings.minTradeStep)
          ? round(payload.qty, 8)
          : 0
        : quantizeQtyDownByStep(rawQty, settings.minTradeStep);
    if (!Number.isFinite(fillQty) || fillQty <= POSITION_EPSILON) {
      return;
    }
    const position = options?.currentPosition ?? getOrCreatePosition(session.id, session.instrument_id);
    const openShortQty = resolveOpenShortQtyForOrder({
      side: payload.side,
      qty: fillQty,
      positionQty: position.qty,
    });
    if (openShortQty > POSITION_EPSILON) {
      throw appError('SHORT_SELLING_DISABLED');
    }
  };

  const placeOrderCore = async (
    sessionId: string,
    payload: PlaceOrderPayload,
    context?: SessionOrderRuntimeContext,
  ): Promise<{ session: SessionRow; fillIds: string[]; forcedLiquidationCount: number }> => {
    const session = context?.session?.id === sessionId
      ? context.session
      : getSessionById(sessionId);
    const occurredAt = resolveOperationIso(payload.occurredAt);
    const currentBar =
      context?.currentBar ?? (await getBarByIndex(session.instrument_id, session.cursor_index));
    if (!currentBar) {
      throw appError('CURRENT_BAR_NOT_FOUND');
    }

    if ((!payload.qty || payload.qty <= 0) && (!payload.amount || payload.amount <= 0)) {
      throw appError('ORDER_QTY_OR_AMOUNT_REQUIRED');
    }
    const maxIndex = Number.isFinite(context?.barCount)
      ? Math.max(0, Math.floor(Number(context?.barCount)) - 1)
      : Math.max(0, (await getBarCount(session.instrument_id)) - 1);
    sessionOrderStore.normalizePendingNextOpenOrders(session);
    if (
      payload.priceMode === 'NEXT_OPEN' &&
      (!Number.isFinite(payload.nextOpenDelayBars) ||
        Math.floor(Number(payload.nextOpenDelayBars)) <= 0)
    ) {
      throw appError('NEXT_OPEN_DELAY_REQUIRED');
    }
    const nextOpenDelayBars =
      payload.priceMode === 'NEXT_OPEN'
        ? Math.max(1, Math.floor(Number.isFinite(payload.nextOpenDelayBars) ? Number(payload.nextOpenDelayBars) : 1))
        : 1;
    if (payload.priceMode === 'NEXT_OPEN' && session.cursor_index + nextOpenDelayBars > maxIndex) {
      throw appError('NEXT_BAR_NOT_FOUND');
    }
    await assertOrderDoesNotOpenShortWhenDisabled(
      session,
      payload,
      currentBar,
      nextOpenDelayBars,
      {
        settings: context?.sessionTradingSettings,
        referenceBar: context?.nextBar,
        currentPosition: context?.currentPosition,
      },
    );
    if (payload.priceMode === 'NEXT_OPEN') {
      sessionOrderStore.cancelPendingNextOpenOrdersForSession(session.id);
    }
    const submitIndex = payload.priceMode === 'NEXT_OPEN'
      ? session.cursor_index + nextOpenDelayBars - 1
      : session.cursor_index;

    const orderId = sessionOrderStore.createPendingOrder({
      sessionId: session.id,
      instrumentId: session.instrument_id,
      side: payload.side,
      qty: payload.qty ?? null,
      amount: payload.amount ?? null,
      priceMode: payload.priceMode,
      submitIndex,
      autoStep: payload.autoStep !== false,
      createdAt: occurredAt,
    });

    const fillIds: string[] = [];
    let forcedLiquidationCount = 0;

    if (payload.priceMode === 'CUR_CLOSE') {
      const orderFillIds = await executeFillWithMaintenance(
        orderId,
        session,
        payload.side,
        session.cursor_index,
        currentBar.close,
        payload.qty,
        payload.amount,
        { fillBar: currentBar, occurredAt },
      );
      fillIds.push(...orderFillIds);
      forcedLiquidationCount += Math.max(0, orderFillIds.length - 1);
      sessionOrderStore.cancelPendingNextOpenOrdersForSession(session.id);
    }

    let nextSession = getSessionById(session.id);
    if (payload.autoStep !== false) {
      const stepped = await stepSessionCore(session.id, 1, {
        occurredAt,
        maxIndex,
        pendingNextOpenFillFailureMode: 'THROW',
      });
      nextSession = stepped.session;
      fillIds.push(...stepped.fillIds);
      forcedLiquidationCount += Math.max(0, Math.floor(Number(stepped.forcedLiquidationCount) || 0));
    }

    return {
      session: nextSession,
      fillIds,
      forcedLiquidationCount,
    };
  };

  return {
    placeOrderCore,
  };
};
