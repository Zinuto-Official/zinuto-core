// SPDX-License-Identifier: GPL-3.0-only

import { countMarketDaysBetween } from '@zinuto/shared/marketTime';
import type { OhlcvBar } from '../../domain/models.js';
import type { PositionRow, SessionRow, TradingExecutionSettings } from '../../domain/trading/types.js';
import { evaluateSessionTermination } from './sessionTermination.js';
import type { SessionAdvancePlan } from './sessionTimeline.js';
import { buildAccrualIntervalSettlement } from '../../domain/trading/accrualEvents.js';
import { resolveLongFinancingPrincipal } from '../../domain/trading/longFinancingModel.js';
import {
  attachProjectedAfterFill,
  normalizeOrderPrice,
  quoteSessionOrder,
  type QuoteSessionOrderInput,
  type SessionOrderQuote,
} from '../../domain/trading/orderQuote.js';
import { POSITION_EPSILON, resolveContractMultiplier } from '../../domain/trading/orderSizing.js';
import type {
  MarginRequirementInputRow,
  MarginState,
} from '../../domain/trading/sessionMargin.js';

export type SessionOrderRuntimeContext = {
  session?: SessionRow;
  currentBar?: OhlcvBar;
  nextBar?: OhlcvBar;
  advancePlan?: SessionAdvancePlan | null;
  currentPosition?: PositionRow;
  sessionCashBalance?: number;
  sessionTradingSettings?: TradingExecutionSettings;
  barCount?: number;
};

type SessionCashStore = {
  getSessionCashBalance: (session: SessionRow) => number;
};

type SessionPositionStore = {
  getSameDayBoughtQty: (
    sessionId: string,
    instrumentId: string,
    fillIndex: number,
    tradeDay: string,
  ) => number;
};

type SessionMarginDomain = {
  buildProjectedMarginRows: (
    sessionId: string,
    instrumentId: string,
    projectedCurrentQty: number,
    referencePrice: number,
    projectedSessionSettings: TradingExecutionSettings,
  ) => Promise<MarginRequirementInputRow[]>;
  calcMarginRequirements: (
    cash: number,
    positions: MarginRequirementInputRow[],
  ) => MarginState;
  applyProjectedMarginTruthToQuote: (input: {
    sessionId: string;
    instrumentId: string;
    positionQty: number;
    cashBalance: number;
    settings: TradingExecutionSettings;
    quote: SessionOrderQuote;
  }) => Promise<SessionOrderQuote>;
};

type CreateSessionOrderQuoteRuntimeDeps = {
  getSessionById: (sessionId: string) => SessionRow;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  getBarCount: (instrumentId: string) => Promise<number>;
  getCloseAtOrBefore: (instrumentId: string, ts: string) => Promise<number | null>;
  getOrCreatePosition: (sessionId: string, instrumentId: string) => PositionRow;
  resolveTradeDay: (value: string, instrumentId?: string) => string;
  resolveSessionTradingSettings: (session: SessionRow) => TradingExecutionSettings;
  resolveSessionAdvancePlan: (
    session: SessionRow,
    displayPeriod?: string,
  ) => Promise<SessionAdvancePlan>;
  sessionCashStore: SessionCashStore;
  sessionPositionStore: SessionPositionStore;
  sessionMargin: SessionMarginDomain;
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

type ProjectedFinancingAccrual = {
  totalAmount: number;
  longFinancingAmount: number;
  shortBorrowAmount: number;
};

const EMPTY_PROJECTED_FINANCING_ACCRUAL: ProjectedFinancingAccrual = {
  totalAmount: 0,
  longFinancingAmount: 0,
  shortBorrowAmount: 0,
};

export const createSessionOrderQuoteRuntime = ({
  getSessionById,
  getBarByIndex,
  getBarCount,
  getCloseAtOrBefore,
  getOrCreatePosition,
  resolveTradeDay,
  resolveSessionTradingSettings,
  resolveSessionAdvancePlan,
  sessionCashStore,
  sessionPositionStore,
  sessionMargin,
}: CreateSessionOrderQuoteRuntimeDeps) => {
  const resolveProjectedFinancingAccrual = async ({
    session,
    position,
    settings,
    cashBalance,
    fillBar,
  }: {
    session: SessionRow;
    position: PositionRow;
    settings: TradingExecutionSettings;
    cashBalance: number;
    fillBar?: OhlcvBar;
  }): Promise<ProjectedFinancingAccrual> => {
    if (
      !fillBar ||
      !Number.isFinite(position.qty) ||
      Math.abs(position.qty) <= POSITION_EPSILON
    ) {
      return EMPTY_PROJECTED_FINANCING_ACCRUAL;
    }

    const asOfDay = resolveTradeDay(fillBar.ts, session.instrument_id);
    const lastAccrualDay = normalizeTradeDay(position.last_borrow_accrual_day);
    if (!asOfDay || !lastAccrualDay) {
      return EMPTY_PROJECTED_FINANCING_ACCRUAL;
    }

    const accrualDays = countCalendarDaysBetween(lastAccrualDay, asOfDay);
    if (accrualDays <= 0) {
      return EMPTY_PROJECTED_FINANCING_ACCRUAL;
    }

    const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
    const isLongPosition = position.qty > POSITION_EPSILON;
    const avgCost = Number(position.avg_cost);
    const fallbackReferencePrice = (() => {
      const asOfClose = Number(fillBar.close);
      if (Number.isFinite(asOfClose) && asOfClose > POSITION_EPSILON) {
        return asOfClose;
      }
      if (Number.isFinite(avgCost) && avgCost > POSITION_EPSILON) {
        return avgCost;
      }
      return 0;
    })();
    const closeAtOrBefore = await getCloseAtOrBefore(
      session.instrument_id,
      `${asOfDay}T23:59:59.999Z`,
    );
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
      longFinancingPrincipal: isLongPosition
        ? resolveLongFinancingPrincipal(cashBalance)
        : 0,
      annualRatePercent: Math.max(
        0,
        Number(
          isLongPosition
            ? settings.longFinancingAnnualRate
            : settings.shortBorrowAnnualRate,
        ) || 0,
      ),
      fundingRatePercent: Number(settings.fundingRate) || 0,
      assetClass: settings.assetClass,
      allowShortSelling: settings.allowShortSelling,
    });
    const totalAmount = Math.max(0, Number(settlement.totalAmount) || 0);
    if (totalAmount <= POSITION_EPSILON) {
      return EMPTY_PROJECTED_FINANCING_ACCRUAL;
    }
    return {
      totalAmount,
      longFinancingAmount: Math.max(0, Number(settlement.longFinancingMetricDelta) || 0),
      shortBorrowAmount: Math.max(0, Number(settlement.shortBorrowMetricDelta) || 0),
    };
  };

  const getSessionOrderQuote = async (
    sessionId: string,
    payload: QuoteSessionOrderInput,
    context?: SessionOrderRuntimeContext,
  ) => {
    const session = context?.session?.id === sessionId
      ? context.session
      : getSessionById(sessionId);
    const currentBar =
      context?.currentBar ?? (await getBarByIndex(session.instrument_id, session.cursor_index));
    const sessionTradingSettings =
      context?.sessionTradingSettings ?? resolveSessionTradingSettings(session);
    const advancePlan =
      context?.advancePlan ?? (await resolveSessionAdvancePlan(session, payload.displayPeriod));
    const displayNextOpenUnavailable = Boolean(
      payload.priceMode === 'NEXT_OPEN' &&
      !advancePlan?.nextBucket,
    );
    const nextOpenDelayBars =
      displayNextOpenUnavailable
        ? 1
        : payload.priceMode === 'NEXT_OPEN'
          ? Math.max(
              1,
              Math.floor(
                Number(advancePlan?.nextOpenRawIndex ?? session.cursor_index + 1) -
                  Math.max(0, Math.floor(Number(session.cursor_index) || 0)),
              ),
            )
          : 1;
    const nextBar =
      payload.priceMode === 'NEXT_OPEN' && !displayNextOpenUnavailable
        ? context?.nextBar ??
          (await getBarByIndex(
            session.instrument_id,
            session.cursor_index + nextOpenDelayBars,
          ))
        : undefined;
    const position =
      context?.currentPosition ?? getOrCreatePosition(session.id, session.instrument_id);
    const sessionCashBalance =
      Number.isFinite(context?.sessionCashBalance)
        ? Number(context?.sessionCashBalance)
        : sessionCashStore.getSessionCashBalance(session);
    const currentTradeDay = resolveTradeDay(
      String(currentBar?.ts ?? ''),
      session.instrument_id,
    );
    const sameDayBoughtQty =
      currentTradeDay && position.qty > POSITION_EPSILON
        ? sessionPositionStore.getSameDayBoughtQty(
            session.id,
            session.instrument_id,
            session.cursor_index,
            currentTradeDay,
          )
        : 0;
    const termination = await evaluateSessionTermination({
      sessionId: session.id,
      instrumentId: session.instrument_id,
      cursorIndex: session.cursor_index,
      maxIndex: Number.isFinite(context?.barCount)
        ? Math.max(0, Math.floor(Number(context?.barCount)) - 1)
        : Math.max(0, (await getBarCount(session.instrument_id)) - 1),
      currentBar,
      settings: sessionTradingSettings,
      accountBalance: sessionCashBalance,
      currentPositionQty: Number(position.qty) || 0,
      sameDayBoughtQty,
      buildProjectedMarginRows: sessionMargin.buildProjectedMarginRows,
      calcMarginRequirements: sessionMargin.calcMarginRequirements,
    });
    const nextTradeDay =
      payload.priceMode === 'NEXT_OPEN'
        ? resolveTradeDay(String(nextBar?.ts ?? ''), session.instrument_id)
        : null;
    const projectedFinancingAccrual = await resolveProjectedFinancingAccrual({
      session,
      position,
      settings: sessionTradingSettings,
      cashBalance: sessionCashBalance,
      fillBar: payload.priceMode === 'NEXT_OPEN' ? nextBar : currentBar,
    });
    const quoteCashBalance =
      sessionCashBalance - projectedFinancingAccrual.totalAmount;
    const quoteRealizedPnl =
      (Number(position.realized_pnl) || 0) - projectedFinancingAccrual.totalAmount;

    const quoteContext = {
        currentPositionQty: Number(position.qty) || 0,
        currentPositionAvgCost: Number(position.avg_cost) || 0,
        currentRealizedPnl: quoteRealizedPnl,
        currentLongFinancingAccrual: projectedFinancingAccrual.longFinancingAmount,
        currentShortBorrowAccrual: projectedFinancingAccrual.shortBorrowAmount,
        securitiesBalance: quoteCashBalance,
        currentBarClose: Number(currentBar?.close ?? 0),
        nextOpenPrice:
          payload.priceMode === 'NEXT_OPEN'
            ? Number(nextBar?.open ?? Number.NaN)
            : null,
        currentFillIndex: session.cursor_index,
        tradingSettings: sessionTradingSettings,
        canStep: termination.hasFutureBars,
        canOpenMinLong: termination.canOpenMinLong,
        canOpenMinShort: termination.canOpenMinShort,
        canFullyClosePosition: termination.canFullyClosePosition,
        getSameDayBoughtQtyAtFillIndex: (fillIndex: number) => {
          const normalizedFillIndex = Math.max(0, Math.floor(fillIndex));
          const tradeDay =
            normalizedFillIndex === session.cursor_index + nextOpenDelayBars
              ? nextTradeDay
              : currentTradeDay;
          if (!tradeDay || Number(position.qty) <= POSITION_EPSILON) {
            return 0;
          }
          return sessionPositionStore.getSameDayBoughtQty(
            session.id,
            session.instrument_id,
            normalizedFillIndex,
            tradeDay,
          );
        },
      };
    const quote = quoteSessionOrder(
      quoteContext,
      {
        ...payload,
        nextOpenDelayBars,
      },
    );
    const marginAlignedQuote = await sessionMargin.applyProjectedMarginTruthToQuote({
      sessionId: session.id,
      instrumentId: session.instrument_id,
      positionQty: Number(position.qty) || 0,
      cashBalance: sessionCashBalance,
      settings: sessionTradingSettings,
      quote,
    });
    const projectedQuote = attachProjectedAfterFill(marginAlignedQuote, quoteContext);
    const fillRawIndex =
      payload.priceMode === 'NEXT_OPEN'
        ? Math.max(0, session.cursor_index + nextOpenDelayBars)
        : Math.max(0, session.cursor_index);
    const fillPrice = normalizeOrderPrice(
      payload.priceMode === 'NEXT_OPEN'
        ? nextBar?.open
        : currentBar?.close,
    );
    return {
      ...projectedQuote,
      executionPlan: {
        displayPeriod: String(payload.displayPeriod),
        fillRawIndex,
        fillPrice: fillPrice > POSITION_EPSILON ? fillPrice : null,
        targetRawIndex:
          payload.priceMode === 'NEXT_OPEN'
            ? advancePlan?.nextBucket?.endRawIndex ?? fillRawIndex
            : advancePlan?.stepTargetRawIndex ?? fillRawIndex,
        nextOpenDisplayIndex:
          payload.priceMode === 'NEXT_OPEN'
            ? advancePlan?.nextDisplayIndex ?? null
            : null,
      },
    };
  };

  return {
    getSessionOrderQuote,
  };
};
