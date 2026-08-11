// SPDX-License-Identifier: GPL-3.0-only

import { countMarketDaysBetween } from '@zinuto/shared/marketTime';
import type { OhlcvBar } from '../../domain/models.js';
import type { PositionRow, SessionRow, TradingExecutionSettings } from '../../domain/trading/types.js';
import {
  buildAccrualIntervalSettlement,
  type AccrualEventDraft,
} from '../../domain/trading/accrualEvents.js';
import { resolveLongFinancingPrincipal } from '../../domain/trading/longFinancingModel.js';
import { POSITION_EPSILON, resolveContractMultiplier } from '../../domain/trading/orderSizing.js';

type SessionCashStore = {
  getSessionCashBalance: (session: SessionRow) => number;
  setSessionCashBalance: (
    sessionId: string,
    value: number,
    updatedAt?: string,
  ) => void;
};

type SessionMetricStore = {
  applyDelta: (
    sessionId: string,
    delta: {
      longFinancingTotal?: number;
      shortBorrowTotal?: number;
    },
    updatedAt: string,
  ) => void;
};

type SessionPositionStore = {
  setBorrowAccrualDay: (
    sessionId: string,
    instrumentId: string,
    lastBorrowAccrualDay: string | null,
    updatedAt?: string,
  ) => void;
  insertAccrualEvents: (input: {
    sessionId: string;
    instrumentId: string;
    events: AccrualEventDraft[];
    lastAccrualDay: string;
    asOfDay: string;
    accrualDays: number;
    accrualAt: string;
    createdAt: string;
  }) => void;
  applyBorrowAccrualSettlement: (input: {
    sessionId: string;
    instrumentId: string;
    realizedPnl: number;
    lastBorrowAccrualDay: string;
    updatedAt: string;
  }) => void;
};

type CreateSessionFinancingDeps = {
  round: (value: number, digits?: number) => number;
  nowIso: () => string;
  resolveTradeDay: (value: string, instrumentId?: string) => string;
  resolveSessionTradingSettings: (session: SessionRow) => TradingExecutionSettings;
  getOrCreatePosition: (sessionId: string, instrumentId: string) => PositionRow;
  getCloseAtOrBefore: (instrumentId: string, ts: string) => Promise<number | null>;
  sessionCashStore: SessionCashStore;
  sessionMetricStore: SessionMetricStore;
  sessionPositionStore: SessionPositionStore;
};

const normalizeTradeDay = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

const countCalendarDaysBetween = (fromDay: string, toDay: string): number => {
  const diffDays = countMarketDaysBetween(fromDay, toDay);
  if (!Number.isFinite(diffDays)) {
    return 0;
  }
  return Math.max(0, Math.trunc(diffDays));
};

const resolvePositionSign = (qty: number): -1 | 0 | 1 => {
  if (qty > POSITION_EPSILON) {
    return 1;
  }
  if (qty < -POSITION_EPSILON) {
    return -1;
  }
  return 0;
};

export const createSessionFinancing = ({
  round,
  nowIso,
  resolveTradeDay,
  resolveSessionTradingSettings,
  getOrCreatePosition,
  getCloseAtOrBefore,
  sessionCashStore,
  sessionMetricStore,
  sessionPositionStore,
}: CreateSessionFinancingDeps) => {
  const resolveNextFinancingAccrualDay = (
    previousQty: number,
    nextQty: number,
    currentAccrualDay: string | null,
    fillTradeDay: string,
  ): string | null => {
    const previousSign = resolvePositionSign(previousQty);
    const nextSign = resolvePositionSign(nextQty);
    if (nextSign === 0) {
      return null;
    }
    if (previousSign === nextSign && currentAccrualDay) {
      return currentAccrualDay;
    }
    return fillTradeDay;
  };

  const resolveNextLeverageCycleStartTime = (
    previousQty: number,
    nextQty: number,
    currentCycleStartTime: string | null,
    fillTime: string,
  ): string | null => {
    const previousSign = resolvePositionSign(previousQty);
    const nextSign = resolvePositionSign(nextQty);
    if (nextSign === 0) {
      return null;
    }
    if (previousSign === nextSign && currentCycleStartTime) {
      return currentCycleStartTime;
    }
    const normalizedFillTime = String(fillTime || '').trim();
    return normalizedFillTime || nowIso();
  };

  const accruePositionFinancingUntil = async (
    session: SessionRow,
    asOfBar: OhlcvBar,
    occurredAt = nowIso(),
  ): Promise<void> => {
    const position = getOrCreatePosition(session.id, session.instrument_id);
    if (!Number.isFinite(position.qty) || Math.abs(position.qty) <= POSITION_EPSILON) {
      if (position.last_borrow_accrual_day) {
        sessionPositionStore.setBorrowAccrualDay(
          session.id,
          session.instrument_id,
          null,
          occurredAt,
        );
      }
      return;
    }

    const asOfDay = resolveTradeDay(asOfBar.ts, session.instrument_id);
    const lastAccrualDay = normalizeTradeDay(position.last_borrow_accrual_day);
    if (!lastAccrualDay) {
      sessionPositionStore.setBorrowAccrualDay(
        session.id,
        session.instrument_id,
        asOfDay,
        occurredAt,
      );
      return;
    }

    const accrualDays = countCalendarDaysBetween(lastAccrualDay, asOfDay);
    if (accrualDays <= 0) {
      return;
    }

    const settings = resolveSessionTradingSettings(session);
    const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
    const isLongPosition = position.qty > POSITION_EPSILON;
    const longFinancingPrincipal = isLongPosition
      ? resolveLongFinancingPrincipal(sessionCashStore.getSessionCashBalance(session))
      : 0;
    const annualRatePercent = Math.max(
      0,
      Number(
        isLongPosition
          ? settings.longFinancingAnnualRate
          : settings.shortBorrowAnnualRate,
      ) || 0,
    );
    const avgCost = Number(position.avg_cost);
    const fallbackReferencePrice = (() => {
      const asOfClose = Number(asOfBar.close);
      if (Number.isFinite(asOfClose) && asOfClose > POSITION_EPSILON) {
        return asOfClose;
      }
      if (Number.isFinite(avgCost) && avgCost > POSITION_EPSILON) {
        return avgCost;
      }
      return 0;
    })();
    const accrualAt = `${asOfDay}T23:59:59.999Z`;
    const closeAtOrBefore = await getCloseAtOrBefore(session.instrument_id, accrualAt);
    const referencePrice =
      Number.isFinite(closeAtOrBefore) &&
      closeAtOrBefore !== null &&
      closeAtOrBefore > POSITION_EPSILON
        ? closeAtOrBefore
        : fallbackReferencePrice;
    const settlement = buildAccrualIntervalSettlement({
      accrualDays,
      positionQty: position.qty,
      referencePrice,
      contractMultiplier,
      longFinancingPrincipal,
      annualRatePercent,
      fundingRatePercent: Number(settings.fundingRate) || 0,
      assetClass: settings.assetClass,
      allowShortSelling: settings.allowShortSelling,
    });
    sessionPositionStore.insertAccrualEvents({
      sessionId: session.id,
      instrumentId: session.instrument_id,
      events: settlement.events,
      lastAccrualDay,
      asOfDay,
      accrualDays,
      accrualAt,
      createdAt: occurredAt,
    });

    sessionMetricStore.applyDelta(
      session.id,
      {
        longFinancingTotal: settlement.longFinancingMetricDelta,
        shortBorrowTotal: settlement.shortBorrowMetricDelta,
      },
      occurredAt,
    );

    if (!Number.isFinite(settlement.totalAmount) || Math.abs(settlement.totalAmount) <= POSITION_EPSILON) {
      sessionPositionStore.setBorrowAccrualDay(
        session.id,
        session.instrument_id,
        asOfDay,
        occurredAt,
      );
      return;
    }

    const amount = round(settlement.totalAmount, 6);
    sessionCashStore.setSessionCashBalance(
      session.id,
      sessionCashStore.getSessionCashBalance(session) - amount,
      occurredAt,
    );

    sessionPositionStore.applyBorrowAccrualSettlement({
      sessionId: session.id,
      instrumentId: session.instrument_id,
      realizedPnl: position.realized_pnl - amount,
      lastBorrowAccrualDay: asOfDay,
      updatedAt: occurredAt,
    });
  };

  return {
    accruePositionFinancingUntil,
    resolveNextFinancingAccrualDay,
    resolveNextLeverageCycleStartTime,
  };
};
