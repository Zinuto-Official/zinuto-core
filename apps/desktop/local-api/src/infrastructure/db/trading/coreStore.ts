// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import { GET_SESSION_BY_ID_SQL } from './sessionSql.js';
import type { AccountRow, InstrumentRow, PositionRow, SessionRow } from '../../../domain/trading/types.js';

type CreateTradingCoreStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
  nowIso: () => string;
};

export const createTradingCoreStore = ({
  db,
  nowIso,
}: CreateTradingCoreStoreDeps) => {
  const selectInstrumentBySymbolAndTimeframeStmt = db.prepare(
    `SELECT id,source_id,symbol,base_timeframe,name,market,bar_count,time_zone,bars_version_token
       FROM instruments
      WHERE symbol = ?
        AND base_timeframe = ?
      ORDER BY CASE market WHEN 'SYSTEM' THEN 0 ELSE 1 END ASC,
               created_at ASC
      LIMIT 1`,
  );

  const selectInstrumentBySymbolStmt = db.prepare(
    `SELECT id,source_id,symbol,base_timeframe,name,market,bar_count,time_zone,bars_version_token
       FROM instruments
      WHERE symbol = ?
      ORDER BY CASE base_timeframe
                 WHEN '1d' THEN 0
                 WHEN '1h' THEN 1
                 WHEN '5m' THEN 2
                 WHEN '1m' THEN 3
                 ELSE 4
               END ASC,
               created_at ASC
      LIMIT 1`,
  );

  const selectInstrumentByIdStmt = db.prepare(
    'SELECT id,source_id,symbol,base_timeframe,name,market,bar_count,time_zone,bars_version_token FROM instruments WHERE id = ?',
  );

  const updateInstrumentBarCountStmt = db.prepare(
    'UPDATE instruments SET bar_count = ? WHERE id = ?',
  );

  const selectSessionByIdStmt = db.prepare(GET_SESSION_BY_ID_SQL);

  const selectPositionStmt = db.prepare(
    `SELECT session_id,instrument_id,qty,avg_cost,realized_pnl,last_borrow_accrual_day,current_leverage_cycle_start_time,updated_at
       FROM positions
      WHERE session_id = ? AND instrument_id = ?`,
  );

  const insertPositionStmt = db.prepare(
    `INSERT INTO positions (session_id,instrument_id,qty,avg_cost,realized_pnl,last_borrow_accrual_day,current_leverage_cycle_start_time,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  );

  const selectAccountByIdStmt = db.prepare(
    'SELECT id,user_id,kind,balance,currency FROM accounts WHERE id = ?',
  );

  const updateAccountBalanceStmt = db.prepare(
    'UPDATE accounts SET balance = ? WHERE id = ?',
  );

  const selectLocalSourceTradingCalendarStmt = db.prepare(
    'SELECT trading_calendar_json AS tradingCalendarJson FROM local_data_sources WHERE id = ? LIMIT 1',
  );

  const deleteReplaySessionStmt = db.prepare(
    'DELETE FROM replay_sessions WHERE user_id = ? AND id = ?',
  );

  const getInstrumentBySymbol = (
    symbol: string,
    timeframe?: string,
  ): InstrumentRow | undefined => {
    const normalizedSymbol = symbol.toUpperCase();
    const normalizedTimeframe = String(timeframe || '').trim().toLowerCase();
    if (normalizedTimeframe) {
      return selectInstrumentBySymbolAndTimeframeStmt.get(
        normalizedSymbol,
        normalizedTimeframe,
      ) as InstrumentRow | undefined;
    }
    return selectInstrumentBySymbolStmt.get(normalizedSymbol) as
      | InstrumentRow
      | undefined;
  };

  const getInstrumentById = (id: string): InstrumentRow | undefined =>
    selectInstrumentByIdStmt.get(id) as InstrumentRow | undefined;

  const updateInstrumentBarCount = (
    instrumentId: string,
    barCount: number,
  ): void => {
    updateInstrumentBarCountStmt.run(Math.max(0, Math.floor(barCount)), instrumentId);
  };

  const getSessionById = (sessionId: string): SessionRow | undefined =>
    selectSessionByIdStmt.get(sessionId) as SessionRow | undefined;

  const getOrCreatePosition = (
    sessionId: string,
    instrumentId: string,
  ): PositionRow => {
    const row = selectPositionStmt.get(sessionId, instrumentId) as
      | PositionRow
      | undefined;
    if (row) {
      return row;
    }
    const created: PositionRow = {
      session_id: sessionId,
      instrument_id: instrumentId,
      qty: 0,
      avg_cost: 0,
      realized_pnl: 0,
      last_borrow_accrual_day: null,
      current_leverage_cycle_start_time: null,
      updated_at: nowIso(),
    };
    insertPositionStmt.run(
      created.session_id,
      created.instrument_id,
      created.qty,
      created.avg_cost,
      created.realized_pnl,
      created.last_borrow_accrual_day,
      created.current_leverage_cycle_start_time,
      created.updated_at,
    );
    return created;
  };

  const getAccountById = (accountId: string): AccountRow | undefined =>
    selectAccountByIdStmt.get(accountId) as AccountRow | undefined;

  const setAccountBalance = (accountId: string, balance: number): void => {
    updateAccountBalanceStmt.run(balance, accountId);
  };

  const getLocalSourceTradingCalendarJson = (sourceId: string): string | null => {
    const row = selectLocalSourceTradingCalendarStmt.get(sourceId) as
      | { tradingCalendarJson?: string | null }
      | undefined;
    return row?.tradingCalendarJson ?? null;
  };

  const deleteReplaySession = (userId: string, sessionId: string): number =>
    deleteReplaySessionStmt.run(userId, sessionId).changes;

  return {
    deleteReplaySession,
    getAccountById,
    getInstrumentById,
    getInstrumentBySymbol,
    getLocalSourceTradingCalendarJson,
    getOrCreatePosition,
    getSessionById,
    setAccountBalance,
    updateInstrumentBarCount,
  };
};
