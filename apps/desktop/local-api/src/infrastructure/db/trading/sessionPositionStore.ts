// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { AccrualEventDraft } from '../../../domain/trading/accrualEvents.js';

export type PositionCalcRow = {
  session_id: string;
  instrument_id: string;
  symbol: string;
  qty: number;
  avgCost: number;
  realizedPnl: number;
  currentLeverageCycleStartTime: string | null;
};

export type OpenMarginPositionRow = {
  sessionId: string;
  instrumentId: string;
  qty: number;
  avgCost: number;
  cursorIndex: number;
  tradingSettingsJson: string | null;
};

type CreateSessionPositionStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
  createId: () => string;
  round: (value: number, digits?: number) => number;
  nowIso: () => string;
};

type SetPositionInput = {
  sessionId: string;
  instrumentId: string;
  qty: number;
  avgCost: number;
  realizedPnl: number;
  lastBorrowAccrualDay: string | null;
  currentLeverageCycleStartTime: string | null;
  updatedAt?: string;
};

type InsertAccrualEventsInput = {
  sessionId: string;
  instrumentId: string;
  events: AccrualEventDraft[];
  lastAccrualDay: string;
  asOfDay: string;
  accrualDays: number;
  accrualAt: string;
  createdAt: string;
};

type ApplyBorrowAccrualSettlementInput = {
  sessionId: string;
  instrumentId: string;
  realizedPnl: number;
  lastBorrowAccrualDay: string;
  updatedAt: string;
};

export const createSessionPositionStore = ({
  db,
  createId,
  round,
  nowIso,
}: CreateSessionPositionStoreDeps) => {
  const selectSameDayBoughtQtyStmt = db.prepare(
    `SELECT COALESCE(SUM(fill_qty), 0) AS qty
       FROM sim_fills
      WHERE session_id = ?
        AND instrument_id = ?
        AND side = 'BUY'
        AND fill_trade_day = ?
        AND fill_index <= ?`
  );

  const selectPositionsForSessionStmt = db.prepare(
    `SELECT p.session_id,p.instrument_id,i.symbol,p.qty,p.avg_cost AS avgCost,p.realized_pnl AS realizedPnl,
            p.current_leverage_cycle_start_time AS currentLeverageCycleStartTime
       FROM positions p
       JOIN instruments i ON i.id = p.instrument_id
      WHERE p.session_id = ?`
  );

  const selectOpenMarginPositionsStmt = db.prepare(
    `SELECT p.session_id AS sessionId,
            p.instrument_id AS instrumentId,
            p.qty AS qty,
            p.avg_cost AS avgCost,
            s.cursor_index AS cursorIndex,
            s.trading_settings_json AS tradingSettingsJson
       FROM positions p
       JOIN replay_sessions s ON s.id = p.session_id
      WHERE p.session_id = ?
        AND ABS(p.qty) > 0.00000001`
  );

  const selectLongFinancingSinceStmt = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS amount
         FROM sim_accrual_events
        WHERE session_id = ?
          AND kind IN ('LONG_FINANCING','FUNDING')
          AND accrual_time >= ?`
    )
    .pluck();

  const selectShortBorrowSinceStmt = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS amount
         FROM sim_accrual_events
        WHERE session_id = ?
          AND kind = 'SHORT_BORROW'
          AND accrual_time >= ?`
    )
    .pluck();

  const updatePositionStmt = db.prepare(
    `UPDATE positions
       SET qty = ?, avg_cost = ?, realized_pnl = ?, last_borrow_accrual_day = ?,
           current_leverage_cycle_start_time = ?, updated_at = ?
     WHERE session_id = ? AND instrument_id = ?`
  );

  const updatePositionBorrowAccrualDayStmt = db.prepare(
    `UPDATE positions
       SET last_borrow_accrual_day = ?, updated_at = ?
     WHERE session_id = ? AND instrument_id = ?`
  );

  const updatePositionBorrowAccrualSettlementStmt = db.prepare(
    `UPDATE positions
       SET realized_pnl = ?, last_borrow_accrual_day = ?, updated_at = ?
     WHERE session_id = ? AND instrument_id = ?`
  );

  const touchPositionStmt = db.prepare(
    `UPDATE positions
        SET updated_at = ?
      WHERE session_id = ?
        AND instrument_id = ?`,
  );

  const insertAccrualEventStmt = db.prepare(
    `INSERT INTO sim_accrual_events (
       id,session_id,instrument_id,kind,accrual_start_day,accrual_end_day,accrual_days,
       accrual_time,qty,reference_price,notional_basis,annual_rate,amount,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  const listOpenMarginPositions = (sessionId: string): OpenMarginPositionRow[] =>
    selectOpenMarginPositionsStmt.all(sessionId) as OpenMarginPositionRow[];

  const listPositionsForSession = (sessionId: string): PositionCalcRow[] =>
    selectPositionsForSessionStmt.all(sessionId) as PositionCalcRow[];

  const getSameDayBoughtQty = (
    sessionId: string,
    instrumentId: string,
    fillIndex: number,
    tradeDay: string,
  ): number => {
    const row = selectSameDayBoughtQtyStmt.get(
      sessionId,
      instrumentId,
      tradeDay,
      fillIndex,
    ) as { qty: number } | undefined;
    const qty = Number(row?.qty ?? 0);
    return Math.max(0, Number.isFinite(qty) ? qty : 0);
  };

  const setPosition = ({
    sessionId,
    instrumentId,
    qty,
    avgCost,
    realizedPnl,
    lastBorrowAccrualDay,
    currentLeverageCycleStartTime,
    updatedAt = nowIso(),
  }: SetPositionInput): void => {
    updatePositionStmt.run(
      round(qty, 8),
      round(avgCost, 8),
      round(realizedPnl, 6),
      lastBorrowAccrualDay,
      currentLeverageCycleStartTime,
      updatedAt,
      sessionId,
      instrumentId,
    );
  };

  const setBorrowAccrualDay = (
    sessionId: string,
    instrumentId: string,
    lastBorrowAccrualDay: string | null,
    updatedAt = nowIso(),
  ): void => {
    updatePositionBorrowAccrualDayStmt.run(
      lastBorrowAccrualDay,
      updatedAt,
      sessionId,
      instrumentId,
    );
  };

  const applyBorrowAccrualSettlement = ({
    sessionId,
    instrumentId,
    realizedPnl,
    lastBorrowAccrualDay,
    updatedAt,
  }: ApplyBorrowAccrualSettlementInput): void => {
    updatePositionBorrowAccrualSettlementStmt.run(
      round(realizedPnl, 6),
      lastBorrowAccrualDay,
      updatedAt,
      sessionId,
      instrumentId,
    );
  };

  const touchPosition = (
    sessionId: string,
    instrumentId: string,
    updatedAt = nowIso(),
  ): void => {
    touchPositionStmt.run(updatedAt, sessionId, instrumentId);
  };

  const insertAccrualEvents = ({
    sessionId,
    instrumentId,
    events,
    lastAccrualDay,
    asOfDay,
    accrualDays,
    accrualAt,
    createdAt,
  }: InsertAccrualEventsInput): void => {
    for (const event of events) {
      insertAccrualEventStmt.run(
        createId(),
        sessionId,
        instrumentId,
        event.kind,
        lastAccrualDay,
        asOfDay,
        accrualDays,
        accrualAt,
        round(event.qty, 8),
        round(event.referencePrice, 8),
        round(event.notionalBasis, 8),
        round(event.annualRate, 8),
        round(event.amount, 6),
        createdAt,
      );
    }
  };

  const getLongFinancingSince = (
    sessionId: string,
    startTimestamp: string,
  ): number => Number(selectLongFinancingSinceStmt.get(sessionId, startTimestamp) ?? 0);

  const getShortBorrowSince = (
    sessionId: string,
    startTimestamp: string,
  ): number => Number(selectShortBorrowSinceStmt.get(sessionId, startTimestamp) ?? 0);

  return {
    applyBorrowAccrualSettlement,
    getLongFinancingSince,
    getSameDayBoughtQty,
    getShortBorrowSince,
    insertAccrualEvents,
    listOpenMarginPositions,
    listPositionsForSession,
    setBorrowAccrualDay,
    setPosition,
    touchPosition,
  };
};
