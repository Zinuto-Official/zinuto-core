// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar, Side } from '../../domain/models.js';
import type { createSessionCashStore } from '../ports/infrastructure/db/trading/sessionCashStore.js';
import type { createSessionFillStore } from '../ports/infrastructure/db/trading/sessionFillStore.js';
import type { createSessionMetricStore } from '../ports/infrastructure/db/trading/sessionMetricStore.js';
import type { createSessionOrderStore } from '../ports/infrastructure/db/trading/sessionOrderStore.js';
import type { createSessionPositionStore } from '../ports/infrastructure/db/trading/sessionPositionStore.js';
import type { PositionRow, SessionRow, TradingExecutionSettings } from '../../domain/trading/types.js';
import { calculateTradingCostBreakdown } from '../../domain/trading/feeModel.js';
import {
  isQtyAlignedToTradeStep,
  POSITION_EPSILON,
  quantizeQtyDownByStep,
  resolveContractMultiplier,
  resolveQtyFromTradeAmount,
} from '../../domain/trading/orderSizing.js';
import {
  normalizeOrderPrice,
  resolveTradeExecutionBreakdown,
} from '../../domain/trading/orderQuote.js';
import {
  shouldRealizeClosedLong,
  shouldRealizeCoveredShort,
} from '../../domain/trading/pnlDecomposition.js';

export type ExecuteFillOptions = {
  bypassSettlementCheck?: boolean;
  bypassTradeStepCheck?: boolean;
  fillBar?: OhlcvBar;
  occurredAt?: string;
};

type SessionCashStore = Pick<
  ReturnType<typeof createSessionCashStore>,
  'getSessionCashBalance' | 'setSessionCashBalance'
>;

type SessionFillStore = Pick<
  ReturnType<typeof createSessionFillStore>,
  'insertFill'
>;

type SessionMetricStore = Pick<
  ReturnType<typeof createSessionMetricStore>,
  'applyDelta'
>;

type SessionOrderStore = Pick<
  ReturnType<typeof createSessionOrderStore>,
  'markOrderFilled'
>;

type SessionPositionStore = Pick<
  ReturnType<typeof createSessionPositionStore>,
  'getSameDayBoughtQty' | 'setPosition'
>;

type CreateSessionFillExecutionRuntimeDeps = {
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
  round: (value: number, digits?: number) => number;
  resolveOperationIso: (value: unknown) => string;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  getOrCreatePosition: (sessionId: string, instrumentId: string) => PositionRow;
  resolveTradeDay: (value: string, instrumentId?: string) => string;
  resolveSessionTradingSettings: (session: SessionRow) => TradingExecutionSettings;
  accruePositionFinancingUntil: (
    session: SessionRow,
    bar: OhlcvBar,
    occurredAt?: string,
  ) => Promise<void>;
  resolveNextFinancingAccrualDay: (
    previousQty: number,
    nextQty: number,
    previousAccrualDay: string | null,
    tradeDay: string,
  ) => string | null;
  resolveNextLeverageCycleStartTime: (
    previousQty: number,
    nextQty: number,
    previousCycleStartTime: string | null,
    fillTime: string,
  ) => string | null;
  assertInitialMarginSufficient: (
    session: SessionRow,
    projectedQty: number,
    projectedCash: number,
    referencePrice: number,
    openLongQty: number,
    openShortQty: number,
  ) => Promise<void>;
  sessionCashStore: SessionCashStore;
  sessionFillStore: SessionFillStore;
  sessionMetricStore: SessionMetricStore;
  sessionOrderStore: SessionOrderStore;
  sessionPositionStore: SessionPositionStore;
};

export const createSessionFillExecutionRuntime = ({
  appError,
  round,
  resolveOperationIso,
  getBarByIndex,
  getOrCreatePosition,
  resolveTradeDay,
  resolveSessionTradingSettings,
  accruePositionFinancingUntil,
  resolveNextFinancingAccrualDay,
  resolveNextLeverageCycleStartTime,
  assertInitialMarginSufficient,
  sessionCashStore,
  sessionFillStore,
  sessionMetricStore,
  sessionOrderStore,
  sessionPositionStore,
}: CreateSessionFillExecutionRuntimeDeps) => {
  const executeFill = async (
    orderId: string,
    session: SessionRow,
    side: Side,
    fillIndex: number,
    fillPrice: number,
    qty?: number,
    amount?: number,
    options?: ExecuteFillOptions,
  ): Promise<string> => {
    const fillBar = options?.fillBar ?? (await getBarByIndex(session.instrument_id, fillIndex));
    if (!fillBar) {
      throw appError('FILL_BAR_NOT_FOUND');
    }
    const normalizedFillPrice = normalizeOrderPrice(fillPrice);
    if (normalizedFillPrice <= POSITION_EPSILON) {
      throw appError('INVALID_PARAMS');
    }
    const occurredAt = resolveOperationIso(options?.occurredAt);
    await accruePositionFinancingUntil(session, fillBar, occurredAt);
    const fillTradeDay = resolveTradeDay(fillBar.ts, session.instrument_id);

    const settings = resolveSessionTradingSettings(session);
    const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
    const rawQty =
      qty && qty > 0
        ? qty
        : resolveQtyFromTradeAmount({
            side,
            amount: Number(amount ?? 0),
            price: normalizedFillPrice,
            tradeStep: settings.minTradeStep,
            contractMultiplier,
            settings,
          });
    const bypassTradeStepCheck = Boolean(options?.bypassTradeStepCheck);
    const fillQty = (() => {
      if (qty && qty > 0) {
        if (bypassTradeStepCheck) {
          // Forced liquidation must close the exact remaining position even if
          // session settings were switched to another asset class/min step.
          return round(qty, 8);
        }
        return isQtyAlignedToTradeStep(qty, settings.minTradeStep)
          ? round(qty, 8)
          : 0;
      }
      return quantizeQtyDownByStep(rawQty, settings.minTradeStep);
    })();
    if (!Number.isFinite(fillQty) || fillQty <= 0) {
      throw appError('FILL_QTY_INVALID');
    }

    const gross = fillQty * normalizedFillPrice * contractMultiplier;
    const tradingCostBreakdown = calculateTradingCostBreakdown(gross, side, settings, fillQty);
    const fee = tradingCostBreakdown.fee;
    const tax = tradingCostBreakdown.tax;
    const slippage = tradingCostBreakdown.slippage;
    const tradingCost = tradingCostBreakdown.tradingCost;

    const position = getOrCreatePosition(session.id, session.instrument_id);
    const tradingCostPerQty = tradingCost / fillQty;
    const splitTradingCost = (qtyPart: number): number => tradingCostPerQty * Math.max(0, qtyPart);

    if (side === 'BUY') {
      const totalCost = gross + tradingCost;
      const openLongQty = position.qty < -POSITION_EPSILON ? Math.max(0, fillQty - Math.abs(position.qty)) : fillQty;
      const projectedQtyRaw = position.qty + fillQty;
      const projectedQty = Math.abs(projectedQtyRaw) <= POSITION_EPSILON ? 0 : projectedQtyRaw;
      const projectedCash = sessionCashStore.getSessionCashBalance(session) - totalCost;
      await assertInitialMarginSufficient(session, projectedQty, projectedCash, normalizedFillPrice, openLongQty, 0);
      if (position.qty >= -POSITION_EPSILON) {
        const unitCost = settings.tradeAmountIncludesFees
          ? totalCost / Math.max(POSITION_EPSILON, fillQty * contractMultiplier)
          : normalizedFillPrice;
        const nextQty = position.qty + fillQty;
        const nextAvgCost =
          nextQty <= POSITION_EPSILON ? 0 : (position.qty * position.avg_cost + fillQty * unitCost) / nextQty;
        sessionCashStore.setSessionCashBalance(
          session.id,
          sessionCashStore.getSessionCashBalance(session) - totalCost,
          occurredAt,
        );
        sessionPositionStore.setPosition({
          sessionId: session.id,
          instrumentId: session.instrument_id,
          qty: nextQty,
          avgCost: nextAvgCost,
          realizedPnl: position.realized_pnl,
          lastBorrowAccrualDay: resolveNextFinancingAccrualDay(
            position.qty,
            nextQty,
            position.last_borrow_accrual_day,
            fillTradeDay,
          ),
          currentLeverageCycleStartTime: resolveNextLeverageCycleStartTime(
            position.qty,
            nextQty,
            position.current_leverage_cycle_start_time,
            fillBar.ts,
          ),
          updatedAt: occurredAt,
        });
      } else {
        const shortQtyAbs = Math.max(0, -position.qty);
        const coverQty = Math.min(fillQty, shortQtyAbs);
        const longOpenQty = Math.max(0, fillQty - coverQty);
        const coverTradingCost = splitTradingCost(coverQty);
        const coverGross = normalizedFillPrice * coverQty * contractMultiplier;
        const coverUnitCost =
          coverQty <= POSITION_EPSILON
            ? normalizedFillPrice
            : settings.tradeAmountIncludesFees
              ? (coverGross + coverTradingCost) / Math.max(POSITION_EPSILON, coverQty * contractMultiplier)
              : normalizedFillPrice;

        const nextQtyRaw = position.qty + fillQty;
        const nextQty = Math.abs(nextQtyRaw) <= POSITION_EPSILON ? 0 : nextQtyRaw;
        let nextAvgCost = 0;
        let realizedDelta = 0;
        const shouldRealizeCover = shouldRealizeCoveredShort(settings.positionCostMode, nextQty);

        if (coverQty > POSITION_EPSILON && shouldRealizeCover) {
          realizedDelta += (position.avg_cost - normalizedFillPrice) * coverQty * contractMultiplier - coverTradingCost;
        }
        if (nextQty < -POSITION_EPSILON) {
          const remainShortQty = Math.max(0, -nextQty);
          if (settings.positionCostMode === 'DILUTED' && coverQty > POSITION_EPSILON) {
            const baseCost = shortQtyAbs * position.avg_cost;
            nextAvgCost = remainShortQty <= POSITION_EPSILON ? 0 : (baseCost - coverUnitCost * coverQty) / remainShortQty;
          } else {
            nextAvgCost = position.avg_cost;
          }
        } else if (nextQty > POSITION_EPSILON) {
          const longOpenTradingCost = splitTradingCost(longOpenQty);
          const longOpenGross = normalizedFillPrice * longOpenQty * contractMultiplier;
          nextAvgCost =
            longOpenQty <= POSITION_EPSILON
              ? 0
              : settings.tradeAmountIncludesFees
                ? (longOpenGross + longOpenTradingCost) / Math.max(POSITION_EPSILON, longOpenQty * contractMultiplier)
                : normalizedFillPrice;
        }

        sessionCashStore.setSessionCashBalance(
          session.id,
          sessionCashStore.getSessionCashBalance(session) - totalCost,
          occurredAt,
        );
        sessionPositionStore.setPosition({
          sessionId: session.id,
          instrumentId: session.instrument_id,
          qty: nextQty,
          avgCost: nextAvgCost,
          realizedPnl: position.realized_pnl + realizedDelta,
          lastBorrowAccrualDay: resolveNextFinancingAccrualDay(
            position.qty,
            nextQty,
            position.last_borrow_accrual_day,
            fillTradeDay,
          ),
          currentLeverageCycleStartTime: resolveNextLeverageCycleStartTime(
            position.qty,
            nextQty,
            position.current_leverage_cycle_start_time,
            fillBar.ts,
          ),
          updatedAt: occurredAt,
        });
      }
    } else {
      const executionBreakdown = resolveTradeExecutionBreakdown({
        side,
        qty: fillQty,
        positionQty: position.qty,
      });
      const closeLongQty =
        executionBreakdown.closeDirection === 'LONG'
          ? Math.max(0, executionBreakdown.closeQty)
          : 0;
      const openShortQty =
        executionBreakdown.openDirection === 'SHORT'
          ? Math.max(0, executionBreakdown.openQty)
          : 0;

      if (!options?.bypassSettlementCheck && settings.tradeSettlementMode === 'T1' && closeLongQty > POSITION_EPSILON) {
        const sameDayBoughtQty = sessionPositionStore.getSameDayBoughtQty(
          session.id,
          session.instrument_id,
          fillIndex,
          fillTradeDay,
        );
        const sellableQty = Math.max(0, position.qty - sameDayBoughtQty);
        if (sellableQty + POSITION_EPSILON < closeLongQty) {
          throw appError('T1_SELL_LIMIT', { sellableQty: round(sellableQty, 8) });
        }
      }

      if (openShortQty > POSITION_EPSILON && !settings.allowShortSelling) {
        throw appError('SHORT_SELLING_DISABLED');
      }

      const proceeds = gross - tradingCost;
      const nextQtyRaw = position.qty - fillQty;
      const nextQty = Math.abs(nextQtyRaw) <= POSITION_EPSILON ? 0 : nextQtyRaw;
      if (openShortQty > POSITION_EPSILON) {
        await assertInitialMarginSufficient(
          session,
          nextQty,
          sessionCashStore.getSessionCashBalance(session) + proceeds,
          normalizedFillPrice,
          0,
          openShortQty,
        );
      }

      const closeTradingCost = splitTradingCost(closeLongQty);
      const closeProceeds = normalizedFillPrice * closeLongQty * contractMultiplier - closeTradingCost;
      const closeUnitValue =
        closeLongQty <= POSITION_EPSILON
          ? normalizedFillPrice
          : settings.tradeAmountIncludesFees
            ? closeProceeds / Math.max(POSITION_EPSILON, closeLongQty * contractMultiplier)
            : normalizedFillPrice;

      let realizedDelta = 0;
      const shouldRealizeClose = shouldRealizeClosedLong(settings.positionCostMode, nextQty);
      if (closeLongQty > POSITION_EPSILON && shouldRealizeClose) {
        realizedDelta += (normalizedFillPrice - position.avg_cost) * closeLongQty * contractMultiplier - closeTradingCost;
      }

      let nextAvgCost = 0;
      if (nextQty > POSITION_EPSILON) {
        if (settings.positionCostMode === 'DILUTED' && closeLongQty > POSITION_EPSILON) {
          nextAvgCost = (position.qty * position.avg_cost - closeUnitValue * closeLongQty) / nextQty;
        } else {
          nextAvgCost = position.avg_cost;
        }
      } else if (nextQty < -POSITION_EPSILON) {
        if (position.qty < -POSITION_EPSILON) {
          const prevShortQty = Math.max(0, -position.qty);
          const shortOpenTradingCost = splitTradingCost(fillQty);
          const shortOpenProceeds = normalizedFillPrice * fillQty * contractMultiplier - shortOpenTradingCost;
          const shortUnitValue = settings.tradeAmountIncludesFees
            ? shortOpenProceeds / Math.max(POSITION_EPSILON, fillQty * contractMultiplier)
            : normalizedFillPrice;
          nextAvgCost = (prevShortQty * position.avg_cost + fillQty * shortUnitValue) / Math.max(POSITION_EPSILON, -nextQty);
        } else {
          const shortOpenTradingCost = splitTradingCost(openShortQty);
          const shortOpenProceeds = normalizedFillPrice * openShortQty * contractMultiplier - shortOpenTradingCost;
          nextAvgCost =
            openShortQty <= POSITION_EPSILON
              ? 0
              : settings.tradeAmountIncludesFees
                ? shortOpenProceeds / Math.max(POSITION_EPSILON, openShortQty * contractMultiplier)
                : normalizedFillPrice;
        }
      }

      sessionCashStore.setSessionCashBalance(
        session.id,
        sessionCashStore.getSessionCashBalance(session) + proceeds,
        occurredAt,
      );
      sessionPositionStore.setPosition({
        sessionId: session.id,
        instrumentId: session.instrument_id,
        qty: nextQty,
        avgCost: nextAvgCost,
        realizedPnl: position.realized_pnl + realizedDelta,
        lastBorrowAccrualDay: resolveNextFinancingAccrualDay(
          position.qty,
          nextQty,
          position.last_borrow_accrual_day,
          fillTradeDay,
        ),
        currentLeverageCycleStartTime: resolveNextLeverageCycleStartTime(
          position.qty,
          nextQty,
          position.current_leverage_cycle_start_time,
          fillBar.ts,
        ),
        updatedAt: occurredAt,
      });
    }

    const fillId = sessionFillStore.insertFill({
      orderId,
      sessionId: session.id,
      instrumentId: session.instrument_id,
      side,
      fillIndex,
      fillTime: fillBar.ts,
      fillTradeDay,
      fillPrice: normalizedFillPrice,
      fillQty,
      contractMultiplier,
      fee,
      tax,
      slippage,
      createdAt: occurredAt,
    });

    sessionMetricStore.applyDelta(
      session.id,
      {
        fillsCount: 1,
        fillFeeTotal: fee,
        fillTaxTotal: tax,
        fillSlippageTotal: slippage,
      },
      occurredAt,
    );

    sessionOrderStore.markOrderFilled(orderId);

    return fillId;
  };

  return {
    executeFill,
  };
};
