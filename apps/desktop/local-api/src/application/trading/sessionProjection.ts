// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from '@zinuto/shared/period';
import type { BaseTimeframe } from '@zinuto/shared/timeframe';
import type { OhlcvBar } from '../../domain/models.js';
import {
  buildSessionActionState,
} from '../../domain/trading/orderQuote.js';
import {
  POSITION_EPSILON,
  resolveContractMultiplier,
} from '../../domain/trading/orderSizing.js';
import { evaluateSessionTermination } from './sessionTermination.js';
import {
  attachTrainerSessionTradingReadModel,
  buildTrainerActionExecutionConclusion,
  buildTrainerSessionTradingReadModel,
} from './sessionReadModel.js';
import type {
  MarginRequirementInputRow,
  MarginState,
} from '../../domain/trading/sessionMargin.js';
import type { SessionFillRow } from '../ports/infrastructure/db/trading/sessionMetricStore.js';
import type { PositionCalcRow } from '../ports/infrastructure/db/trading/sessionPositionStore.js';
import type {
  AccountRow,
  InstrumentRow,
  PositionRow,
  SessionRow,
  TradingExecutionSettings,
} from '../../domain/trading/types.js';
import type {
  SessionActionAdvanceState,
  SessionActionRuntimeContext,
  SessionAdvancePlan,
} from './sessionTimeline.js';

type RoundFn = (value: number, digits?: number) => number;

type ClientSession = SessionRow & {
  [key: string]: unknown;
  instrumentId: string;
  samplePoolId: string;
  sourceTimeframe: string;
  minimumBaseTimeframe: string;
  symbol: string;
  instrumentName: string | null;
};

type MetricTotals = {
  count: number;
  fee_total: number;
  tax_total: number;
  slippage_total: number;
  long_financing_total: number;
  short_borrow_total: number;
};

type FillPage = {
  fills: SessionFillRow[];
  nextFillCursor: string | null;
  residentFillsStartIndex: number;
};

type SessionMetricStoreLike = {
  readMetricTotals: (sessionId: string) => MetricTotals;
  readFillPage: (
    sessionId: string,
    fillCursor?: string | null,
    limit?: undefined,
    totalFills?: number,
  ) => FillPage;
};

type SessionCashStoreLike = {
  getSessionCashBalance: (session: SessionRow) => number;
  listSessionAccounts: (
    session: SessionRow,
    cashBalance?: number,
  ) => AccountRow[];
};

type SessionPositionStoreLike = {
  listPositionsForSession: (sessionId: string) => PositionCalcRow[];
  getSameDayBoughtQty: (
    sessionId: string,
    instrumentId: string,
    fillIndex: number,
    tradeDay: string,
  ) => number;
  getLongFinancingSince: (
    sessionId: string,
    startTimestamp: string,
  ) => number;
  getShortBorrowSince: (
    sessionId: string,
    startTimestamp: string,
  ) => number;
};

type SessionMarginLike = {
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
};

type ReplaySessionUndoStoreLike = {
  getState: (sessionId: string) => {
    availableSteps: number;
    maxSteps: number;
    lastUndoableAction: 'STEP' | 'BUY' | 'SELL' | null;
  };
};

type SessionProjectionActionResult = {
  runtimeContext?: SessionActionRuntimeContext;
  fillIds?: string[];
};

type CreateSessionProjectionDeps = {
  appError: (
    code: string,
    args?: Record<string, string | number | boolean | null>,
  ) => Error;
  round: RoundFn;
  getSessionById: (sessionId: string) => SessionRow;
  getInstrumentById: (id: string) => InstrumentRow | undefined;
  getOrCreatePosition: (
    sessionId: string,
    instrumentId: string,
  ) => PositionRow;
  getBarByIndex: (
    instrumentId: string,
    index: number,
  ) => Promise<OhlcvBar | undefined>;
  getBarCount: (instrumentId: string) => Promise<number>;
  resolveTradeDay: (value: string, instrumentId?: string) => string;
  resolveSessionTradingSettings: (
    session: SessionRow,
  ) => TradingExecutionSettings;
  normalizeDisplayPeriod: (
    value: unknown,
    fallback: DisplayPeriodKey,
  ) => DisplayPeriodKey;
  toBaseTimeframe: (
    value: unknown,
    fallback?: BaseTimeframe,
  ) => BaseTimeframe;
  toClientSession: (
    session: SessionRow,
    instrument: InstrumentRow,
  ) => ClientSession;
  resolveSessionAdvancePlan: (
    session: SessionRow,
    displayPeriodInput?: DisplayPeriodKey | string,
  ) => Promise<SessionAdvancePlan>;
  toAdvanceStateFromBucket: (
    displayPeriod: DisplayPeriodKey,
    cursorRawIndex: number,
    currentBucket: NonNullable<SessionAdvancePlan['currentBucket']> | null,
    nextDisplayIndex: number | null,
  ) => SessionActionAdvanceState;
  sessionMetricStore: SessionMetricStoreLike;
  sessionCashStore: SessionCashStoreLike;
  sessionPositionStore: SessionPositionStoreLike;
  sessionMargin: SessionMarginLike;
  replaySessionUndoStore: ReplaySessionUndoStoreLike;
};

type TradingCostProjection = {
  fillPage: FillPage;
  totalFills: number;
  fillFeeTotal: number;
  fillTaxTotal: number;
  fillSlippageTotal: number;
  longFinancingChargesTotal: number;
  shortBorrowChargesTotal: number;
  tradingCostBreakdown: {
    fees: number;
    taxes: number;
    slippage: number;
    borrowCost: number;
    financingCost: number;
    totalTradingCost: number;
  };
};

type CurrentLeverageCycleSummary = {
  isActive: boolean;
  holdingStartDate: string | null;
  holdingEndDate: string | null;
  longFinancingFee: number;
  shortFee: number;
  totalFee: number;
};

export const createSessionProjection = ({
  appError,
  round,
  getSessionById,
  getInstrumentById,
  getOrCreatePosition,
  getBarByIndex,
  getBarCount,
  resolveTradeDay,
  resolveSessionTradingSettings,
  normalizeDisplayPeriod,
  toBaseTimeframe,
  toClientSession,
  resolveSessionAdvancePlan,
  toAdvanceStateFromBucket,
  sessionMetricStore,
  sessionCashStore,
  sessionPositionStore,
  sessionMargin,
  replaySessionUndoStore,
}: CreateSessionProjectionDeps) => {
  const resolveSessionInstrument = (session: SessionRow): InstrumentRow => {
    const instrument = session.instrument_symbol
      ? {
          id: session.instrument_id,
          symbol: session.instrument_symbol,
          name: session.instrument_name ?? null,
          source_id: session.instrument_source_id ?? undefined,
          base_timeframe: session.instrument_base_timeframe ?? undefined,
          market: session.instrument_market ?? undefined,
          bar_count: session.instrument_bar_count,
          time_zone: session.timeZone ?? undefined,
          bars_version_token: session.instrument_bars_version_token ?? undefined,
        }
      : getInstrumentById(session.instrument_id);
    if (!instrument) {
      throw appError('INSTRUMENT_INFO_NOT_FOUND');
    }
    return instrument;
  };

  const mapPositions = async (
    session: SessionRow,
    cursorBarOverride?: OhlcvBar,
  ) => {
    const cursorBar =
      cursorBarOverride ??
      (await getBarByIndex(session.instrument_id, session.cursor_index));
    const markPrice = cursorBar?.close ?? 0;
    const settings = resolveSessionTradingSettings(session);
    const contractMultiplier = resolveContractMultiplier(
      settings.contractMultiplier,
    );
    const rows = sessionPositionStore.listPositionsForSession(session.id);

    return rows.map((row) => {
      const unrealizedPnl =
        row.qty * (markPrice - row.avgCost) * contractMultiplier;
      return {
        sessionId: row.session_id,
        instrumentId: row.instrument_id,
        symbol: row.symbol,
        qty: row.qty,
        avgCost: row.avgCost,
        realizedPnl: row.realizedPnl,
        unrealizedPnl,
        totalPnl: row.realizedPnl + unrealizedPnl,
        markPrice,
      };
    });
  };

  const calcCurrentLeverageCycleSummary = (
    session: SessionRow,
    currentQty: number,
    asOfTs: string,
    currentCycleStartTime: string | null,
  ): CurrentLeverageCycleSummary => {
    if (!Number.isFinite(currentQty) || Math.abs(currentQty) <= POSITION_EPSILON) {
      return {
        isActive: false,
        holdingStartDate: null,
        holdingEndDate: null,
        longFinancingFee: 0,
        shortFee: 0,
        totalFee: 0,
      };
    }

    const normalizedAsOfTs = String(asOfTs ?? '').trim();
    const cycleStartTs =
      String(currentCycleStartTime ?? '').trim() || normalizedAsOfTs;
    if (!cycleStartTs) {
      return {
        isActive: false,
        holdingStartDate: null,
        holdingEndDate: null,
        longFinancingFee: 0,
        shortFee: 0,
        totalFee: 0,
      };
    }

    const longFinancingFeeRaw = sessionPositionStore.getLongFinancingSince(
      session.id,
      cycleStartTs,
    );
    const longFinancingFee = Number.isFinite(longFinancingFeeRaw)
      ? round(longFinancingFeeRaw, 6)
      : 0;
    const shortFeeRaw = sessionPositionStore.getShortBorrowSince(
      session.id,
      cycleStartTs,
    );
    const shortFee = Number.isFinite(shortFeeRaw)
      ? Math.max(0, round(shortFeeRaw, 6))
      : 0;

    return {
      isActive:
        Math.abs(longFinancingFee) > POSITION_EPSILON ||
        shortFee > POSITION_EPSILON,
      holdingStartDate: resolveTradeDay(cycleStartTs, session.instrument_id),
      holdingEndDate: resolveTradeDay(
        normalizedAsOfTs || cycleStartTs,
        session.instrument_id,
      ),
      longFinancingFee,
      shortFee,
      totalFee: round(longFinancingFee + shortFee, 6),
    };
  };

  const readTradingCostProjection = (
    sessionId: string,
    fillCursor?: string | null,
  ): TradingCostProjection => {
    const metricTotals = sessionMetricStore.readMetricTotals(sessionId);
    const totalFills = Math.max(0, Math.floor(Number(metricTotals.count ?? 0)));
    const fillPage = sessionMetricStore.readFillPage(
      sessionId,
      fillCursor,
      undefined,
      totalFills,
    );
    const fillFeeTotal = Number.isFinite(metricTotals.fee_total)
      ? round(Math.max(0, Number(metricTotals.fee_total) || 0), 6)
      : 0;
    const fillTaxTotal = Number.isFinite(metricTotals.tax_total)
      ? round(Math.max(0, Number(metricTotals.tax_total) || 0), 6)
      : 0;
    const fillSlippageTotal = Number.isFinite(metricTotals.slippage_total)
      ? round(Math.max(0, Number(metricTotals.slippage_total) || 0), 6)
      : 0;
    const shortBorrowChargesTotalRaw = metricTotals.short_borrow_total;
    const shortBorrowChargesTotal = Number.isFinite(shortBorrowChargesTotalRaw)
      ? Math.max(0, round(shortBorrowChargesTotalRaw, 6))
      : 0;
    const longFinancingChargesTotalRaw = metricTotals.long_financing_total;
    const longFinancingChargesTotal = Number.isFinite(
      longFinancingChargesTotalRaw,
    )
      ? round(longFinancingChargesTotalRaw, 6)
      : 0;
    return {
      fillPage,
      totalFills,
      fillFeeTotal,
      fillTaxTotal,
      fillSlippageTotal,
      longFinancingChargesTotal,
      shortBorrowChargesTotal,
      tradingCostBreakdown: {
        fees: fillFeeTotal,
        taxes: fillTaxTotal,
        slippage: fillSlippageTotal,
        borrowCost: shortBorrowChargesTotal,
        financingCost: longFinancingChargesTotal,
        totalTradingCost: round(
          fillFeeTotal +
            fillTaxTotal +
            fillSlippageTotal +
            shortBorrowChargesTotal +
            longFinancingChargesTotal,
          6,
        ),
      },
    };
  };

  const createSameDayBoughtQtyResolver = (
    session: SessionRow,
    currentPosition: PositionRow,
    cursorTradeDay: string,
    nextTradeDay: string,
  ) => {
    const sameDayBoughtQtyCache = new Map<string, number>();
    return (fillIndex: number): number => {
      const normalizedFillIndex = Math.max(0, Math.floor(fillIndex));
      const tradeDay =
        normalizedFillIndex === session.cursor_index + 1
          ? nextTradeDay
          : cursorTradeDay;
      if (!tradeDay || Number(currentPosition.qty) <= POSITION_EPSILON) {
        return 0;
      }
      const cacheKey = `${normalizedFillIndex}\u0000${tradeDay}`;
      const cached = sameDayBoughtQtyCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
      const resolved = sessionPositionStore.getSameDayBoughtQty(
        session.id,
        session.instrument_id,
        normalizedFillIndex,
        tradeDay,
      );
      sameDayBoughtQtyCache.set(cacheKey, resolved);
      return resolved;
    };
  };

  const getSessionRuntimeDelta = async (
    sessionId: string,
    actionResult: SessionProjectionActionResult,
    fillCursor?: string | null,
  ) => {
    const session = getSessionById(sessionId);
    const instrument = resolveSessionInstrument(session);
    const {
      fillPage,
      totalFills,
      longFinancingChargesTotal,
      shortBorrowChargesTotal,
      tradingCostBreakdown,
    } = readTradingCostProjection(session.id, fillCursor);
    const currentPosition = getOrCreatePosition(
      session.id,
      session.instrument_id,
    );
    const sessionCashBalance = sessionCashStore.getSessionCashBalance(session);
    const sessionTradingSettings = resolveSessionTradingSettings(session);

    const [cursorBar, nextBar, entryBar, barCount] = await Promise.all([
      getBarByIndex(session.instrument_id, session.cursor_index),
      getBarByIndex(session.instrument_id, session.cursor_index + 1),
      getBarByIndex(session.instrument_id, session.entry_index),
      getBarCount(session.instrument_id),
    ]);

    const cursorTradeDay = resolveTradeDay(
      String(cursorBar?.ts ?? ''),
      session.instrument_id,
    );
    const sameDayBoughtQty =
      cursorTradeDay && currentPosition.qty > POSITION_EPSILON
        ? sessionPositionStore.getSameDayBoughtQty(
            session.id,
            session.instrument_id,
            session.cursor_index,
            cursorTradeDay,
          )
        : 0;

    const [currentLeverageCycle, termination] = await Promise.all([
      Promise.resolve(
        calcCurrentLeverageCycleSummary(
          session,
          Number(currentPosition.qty),
          String(cursorBar?.ts ?? ''),
          currentPosition.current_leverage_cycle_start_time,
        ),
      ),
      evaluateSessionTermination({
        sessionId: session.id,
        instrumentId: session.instrument_id,
        cursorIndex: session.cursor_index,
        maxIndex: Math.max(0, barCount - 1),
        currentBar: cursorBar,
        settings: sessionTradingSettings,
        accountBalance: sessionCashBalance,
        currentPositionQty: Number(currentPosition.qty) || 0,
        sameDayBoughtQty,
        buildProjectedMarginRows: sessionMargin.buildProjectedMarginRows,
        calcMarginRequirements: sessionMargin.calcMarginRequirements,
      }),
    ]);
    const nextTradeDay = resolveTradeDay(
      String(nextBar?.ts ?? ''),
      session.instrument_id,
    );
    const getSameDayBoughtQtyAtFillIndex = createSameDayBoughtQtyResolver(
      session,
      currentPosition,
      cursorTradeDay,
      nextTradeDay,
    );
    const baseActionState = buildSessionActionState({
      currentPositionQty: Number(currentPosition.qty) || 0,
      currentPositionAvgCost: Number(currentPosition.avg_cost) || 0,
      currentRealizedPnl: Number(currentPosition.realized_pnl) || 0,
      securitiesBalance: sessionCashBalance,
      currentBarClose: Number(cursorBar?.close ?? 0),
      nextOpenPrice: Number(nextBar?.open ?? Number.NaN),
      currentFillIndex: session.cursor_index,
      tradingSettings: sessionTradingSettings,
      canStep: termination.hasFutureBars,
      canOpenMinLong: termination.canOpenMinLong,
      canOpenMinShort: termination.canOpenMinShort,
      canFullyClosePosition: termination.canFullyClosePosition,
      getSameDayBoughtQtyAtFillIndex,
      undoState: replaySessionUndoStore.getState(session.id),
    });
    const lastActionExecution = buildTrainerActionExecutionConclusion({
      action: actionResult.runtimeContext?.action ?? 'STEP',
      fillIds: actionResult.fillIds,
      fills: fillPage.fills,
    });
    const actionState = attachTrainerSessionTradingReadModel(
      baseActionState,
      buildTrainerSessionTradingReadModel({
        session,
        instrument,
        position: currentPosition,
        cursorBar,
        entryBar,
        barCount,
        sessionCashBalance,
        tradingSettings: sessionTradingSettings,
        tradingCostBreakdown,
        currentLeverageCycle,
        termination,
        actionState: baseActionState,
        lastActionExecution,
        resolveTradeDay,
      }),
    );
    const displayPeriod = normalizeDisplayPeriod(
      actionResult.runtimeContext?.displayPeriod,
      toBaseTimeframe(session.timeframe, '1d') as DisplayPeriodKey,
    );
    const cursorRawIndex = Math.max(
      0,
      Math.floor(Number(session.cursor_index) || 0),
    );
    let advanceState =
      actionResult.runtimeContext?.advanceState?.displayPeriod === displayPeriod &&
      actionResult.runtimeContext.advanceState.cursorRawIndex === cursorRawIndex
        ? actionResult.runtimeContext.advanceState
        : undefined;
    if (!advanceState) {
      const advancePlan = await resolveSessionAdvancePlan(
        session,
        displayPeriod,
      );
      const currentBucket =
        'currentBucket' in advancePlan && advancePlan.currentBucket
          ? advancePlan.currentBucket
          : null;
      advanceState = toAdvanceStateFromBucket(
        displayPeriod,
        cursorRawIndex,
        currentBucket,
        advancePlan.nextDisplayIndex,
      );
    }

    return {
      sessionId: session.id,
      session: toClientSession(session, instrument),
      action: actionResult.runtimeContext?.action ?? 'STEP',
      previousCursorRawIndex:
        actionResult.runtimeContext?.previousCursorRawIndex ?? cursorRawIndex,
      cursorRawIndex,
      displayPeriod,
      previousDisplayIndex:
        actionResult.runtimeContext?.previousDisplayIndex ?? null,
      displayIndex: advanceState.displayIndex,
      displayStartRawIndex:
        advanceState.displayStartRawIndex ?? cursorRawIndex,
      displayEndRawIndex: advanceState.displayEndRawIndex ?? cursorRawIndex,
      nextDisplayIndex: advanceState.nextDisplayIndex,
      hasFutureBars: termination.hasFutureBars,
      actionState,
      positions: await mapPositions(session, cursorBar),
      accounts: sessionCashStore.listSessionAccounts(
        session,
        sessionCashBalance,
      ),
      sessionTradingSettings,
      tradingCostBreakdown,
      longFinancingChargesTotal,
      shortBorrowChargesTotal,
      currentLeverageCycle,
      fills: fillPage.fills,
      fillsTotal: totalFills,
      nextFillCursor: fillPage.nextFillCursor,
      residentFillsStartIndex: fillPage.residentFillsStartIndex,
      termination,
    };
  };

  const getSessionSnapshot = async (
    sessionId: string,
    fillCursor?: string | null,
  ) => {
    const session = getSessionById(sessionId);
    const instrument = resolveSessionInstrument(session);
    const {
      fillPage,
      totalFills,
      longFinancingChargesTotal,
      shortBorrowChargesTotal,
      tradingCostBreakdown,
    } = readTradingCostProjection(session.id, fillCursor);
    const currentPosition = getOrCreatePosition(
      session.id,
      session.instrument_id,
    );
    const sessionCashBalance = sessionCashStore.getSessionCashBalance(session);
    const sessionTradingSettings = resolveSessionTradingSettings(session);

    const [cursorBar, nextBar, entryBar, barCount] = await Promise.all([
      getBarByIndex(session.instrument_id, session.cursor_index),
      getBarByIndex(session.instrument_id, session.cursor_index + 1),
      getBarByIndex(session.instrument_id, session.entry_index),
      getBarCount(session.instrument_id),
    ]);

    const cursorTradeDay = resolveTradeDay(
      String(cursorBar?.ts ?? ''),
      session.instrument_id,
    );
    const nextTradeDay = resolveTradeDay(
      String(nextBar?.ts ?? ''),
      session.instrument_id,
    );
    const getSameDayBoughtQtyAtFillIndex = createSameDayBoughtQtyResolver(
      session,
      currentPosition,
      cursorTradeDay,
      nextTradeDay,
    );
    const sameDayBoughtQty =
      cursorTradeDay && currentPosition.qty > POSITION_EPSILON
        ? getSameDayBoughtQtyAtFillIndex(session.cursor_index)
        : 0;

    const [currentLeverageCycle, termination] = await Promise.all([
      Promise.resolve(
        calcCurrentLeverageCycleSummary(
          session,
          Number(currentPosition.qty),
          String(cursorBar?.ts ?? ''),
          currentPosition.current_leverage_cycle_start_time,
        ),
      ),
      evaluateSessionTermination({
        sessionId: session.id,
        instrumentId: session.instrument_id,
        cursorIndex: session.cursor_index,
        maxIndex: Math.max(0, barCount - 1),
        currentBar: cursorBar,
        settings: sessionTradingSettings,
        accountBalance: sessionCashBalance,
        currentPositionQty: Number(currentPosition.qty) || 0,
        sameDayBoughtQty,
        buildProjectedMarginRows: sessionMargin.buildProjectedMarginRows,
        calcMarginRequirements: sessionMargin.calcMarginRequirements,
      }),
    ]);
    const baseActionState = buildSessionActionState({
      currentPositionQty: Number(currentPosition.qty) || 0,
      currentPositionAvgCost: Number(currentPosition.avg_cost) || 0,
      currentRealizedPnl: Number(currentPosition.realized_pnl) || 0,
      securitiesBalance: sessionCashBalance,
      currentBarClose: Number(cursorBar?.close ?? 0),
      nextOpenPrice: Number(nextBar?.open ?? Number.NaN),
      currentFillIndex: session.cursor_index,
      tradingSettings: sessionTradingSettings,
      canStep: termination.hasFutureBars,
      canOpenMinLong: termination.canOpenMinLong,
      canOpenMinShort: termination.canOpenMinShort,
      canFullyClosePosition: termination.canFullyClosePosition,
      getSameDayBoughtQtyAtFillIndex,
      undoState: replaySessionUndoStore.getState(session.id),
    });
    const actionState = attachTrainerSessionTradingReadModel(
      baseActionState,
      buildTrainerSessionTradingReadModel({
        session,
        instrument,
        position: currentPosition,
        cursorBar,
        entryBar,
        barCount,
        sessionCashBalance,
        tradingSettings: sessionTradingSettings,
        tradingCostBreakdown,
        currentLeverageCycle,
        termination,
        actionState: baseActionState,
        lastActionExecution: null,
        resolveTradeDay,
      }),
    );

    return {
      session: toClientSession(session, instrument),
      sessionTradingSettings,
      positions: await mapPositions(session, cursorBar),
      fills: fillPage.fills,
      fillsTotal: totalFills,
      nextFillCursor: fillPage.nextFillCursor,
      residentFillsStartIndex: fillPage.residentFillsStartIndex,
      accounts: sessionCashStore.listSessionAccounts(
        session,
        sessionCashBalance,
      ),
      tradingCostBreakdown,
      longFinancingChargesTotal,
      shortBorrowChargesTotal,
      currentLeverageCycle,
      termination,
      actionState,
      drawings: [],
    };
  };

  return {
    getSessionRuntimeDelta,
    getSessionSnapshot,
  };
};
