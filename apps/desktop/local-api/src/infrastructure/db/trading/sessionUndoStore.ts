// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { PriceMode, Side } from '../../../domain/models.js';
import { MANUAL_ACTION_UNDO_MAX_STEPS } from '../../../domain/trading/manualUndo.js';

export type ReplaySessionUndoableAction = 'STEP' | 'BUY' | 'SELL';

type ReplaySessionUndoSessionState = {
  id: string;
  user_id: string;
  instrument_id: string;
  sample_pool_id: string;
  trading_settings_json: string;
  access_grant_json: string;
  timeframe: string;
  minimum_base_timeframe: string;
  start_index: number;
  entry_index: number;
  history_bars: number;
  cursor_index: number;
  cash_balance: number | null;
  autoplay_interval_ms: number;
  is_paused: number;
  session_scope: ReplaySessionScope;
  created_at: string;
  updated_at: string;
};

type ReplaySessionUndoPositionState = {
  session_id: string;
  instrument_id: string;
  qty: number;
  avg_cost: number;
  realized_pnl: number;
  last_borrow_accrual_day: string | null;
  current_leverage_cycle_start_time: string | null;
  updated_at: string;
};

type ReplaySessionUndoOrderState = {
  id: string;
  session_id: string;
  instrument_id: string;
  side: Side;
  qty: number | null;
  amount: number | null;
  price_mode: PriceMode;
  submit_index: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  auto_step_next: number;
  created_at: string;
};

type ReplaySessionUndoDelta = {
  session: ReplaySessionUndoSessionState;
  positions: ReplaySessionUndoPositionState[];
  existingOrders: ReplaySessionUndoOrderState[];
  rowidCutoffs: {
    orders: number;
    fills: number;
    accrualEvents: number;
  };
};

type ReplaySessionScope = 'OFFICIAL' | 'SIMULATION_ONLY';

type CreateReplaySessionUndoStoreDeps = {
  db: Pick<Database.Database, 'prepare' | 'transaction'>;
  createId: () => string;
  nowIso: () => string;
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
  normalizeSessionScope: (value: unknown) => ReplaySessionScope;
  rebuildSessionMetricTotals: (sessionId: string, updatedAt: string) => void;
};

export const createReplaySessionUndoStore = ({
  db,
  createId,
  nowIso,
  appError,
  normalizeSessionScope,
  rebuildSessionMetricTotals,
}: CreateReplaySessionUndoStoreDeps) => {
  const insertReplaySessionUndoEntryStmt = db.prepare(
    `INSERT INTO replay_session_undo_entries (
       id,session_id,action_type,undo_delta_json,created_at
     ) VALUES (?,?,?,?,?)`,
  );

  const deleteReplaySessionUndoEntriesBeyondLimitStmt = db.prepare(
    `DELETE FROM replay_session_undo_entries
      WHERE session_id = ?
        AND id IN (
          SELECT id
            FROM (
              SELECT id,
                     ROW_NUMBER() OVER (ORDER BY created_at DESC, rowid DESC) AS undo_rank
                FROM replay_session_undo_entries
               WHERE session_id = ?
            )
           WHERE undo_rank > ?
        )`,
  );

  const selectLatestReplaySessionUndoEntryStmt = db.prepare(
    `SELECT id,action_type AS actionType,undo_delta_json AS undoDeltaJson,created_at AS createdAt
       FROM replay_session_undo_entries
      WHERE session_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1`,
  );

  const deleteReplaySessionUndoEntryByIdStmt = db.prepare(
    `DELETE FROM replay_session_undo_entries
      WHERE id = ?`,
  );

  const selectReplaySessionUndoCountStmt = db.prepare(
    `SELECT COUNT(*) AS count
       FROM replay_session_undo_entries
      WHERE session_id = ?`,
  );

  const readTableMaxRowid = (tableName: string, sessionId: string): number => {
    const value = db
      .prepare(`SELECT COALESCE(MAX(rowid), 0) AS rowidMax FROM ${tableName} WHERE session_id = ?`)
      .pluck()
      .get(sessionId) as number | undefined;
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
  };

  const captureDelta = (sessionId: string): ReplaySessionUndoDelta => {
    const sessionRow = db
      .prepare(
        `SELECT id,user_id,instrument_id,sample_pool_id,trading_settings_json,access_grant_json,timeframe,minimum_base_timeframe,
                start_index,entry_index,history_bars,cursor_index,cash_balance,autoplay_interval_ms,is_paused,
                session_scope,created_at,updated_at
           FROM replay_sessions
          WHERE id = ?`,
      )
      .get(sessionId) as ReplaySessionUndoSessionState | undefined;
    if (!sessionRow) {
      throw appError('SESSION_NOT_FOUND');
    }

    return {
      session: sessionRow,
      positions: db
        .prepare(
          `SELECT session_id,instrument_id,qty,avg_cost,realized_pnl,last_borrow_accrual_day,current_leverage_cycle_start_time,updated_at
             FROM positions
            WHERE session_id = ?
            ORDER BY rowid ASC`,
        )
        .all(sessionId) as ReplaySessionUndoPositionState[],
      existingOrders: db
        .prepare(
          `SELECT id,session_id,instrument_id,side,qty,amount,price_mode,submit_index,status,auto_step_next,created_at
             FROM sim_orders
            WHERE session_id = ?
              AND status IN ('PENDING', 'FILLED')
            ORDER BY rowid ASC`,
        )
        .all(sessionId) as ReplaySessionUndoOrderState[],
      rowidCutoffs: {
        orders: readTableMaxRowid('sim_orders', sessionId),
        fills: readTableMaxRowid('sim_fills', sessionId),
        accrualEvents: readTableMaxRowid('sim_accrual_events', sessionId),
      },
    };
  };

  const insertDelta = (
    sessionId: string,
    action: ReplaySessionUndoableAction,
    delta: ReplaySessionUndoDelta,
    createdAt = nowIso(),
  ): void => {
    insertReplaySessionUndoEntryStmt.run(
      createId(),
      sessionId,
      action,
      JSON.stringify(delta),
      createdAt,
    );
    deleteReplaySessionUndoEntriesBeyondLimitStmt.run(
      sessionId,
      sessionId,
      MANUAL_ACTION_UNDO_MAX_STEPS,
    );
  };

  const getState = (
    sessionId: string,
  ): {
    availableSteps: number;
    maxSteps: number;
    lastUndoableAction: ReplaySessionUndoableAction | null;
  } => {
    const countRow = selectReplaySessionUndoCountStmt.get(sessionId) as
      | { count: number }
      | undefined;
    const latestRow = selectLatestReplaySessionUndoEntryStmt.get(sessionId) as
      | { actionType?: ReplaySessionUndoableAction | null }
      | undefined;
    const availableSteps = Math.max(
      0,
      Math.floor(Number(countRow?.count) || 0),
    );
    const rawAction = String(latestRow?.actionType || '').trim().toUpperCase();
    const lastUndoableAction =
      rawAction === 'STEP' || rawAction === 'BUY' || rawAction === 'SELL'
        ? rawAction
        : null;
    return {
      availableSteps,
      maxSteps: MANUAL_ACTION_UNDO_MAX_STEPS,
      lastUndoableAction,
    };
  };

  const restoreDelta = (
    sessionId: string,
    delta: ReplaySessionUndoDelta,
  ): void => {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId || normalizedSessionId !== delta.session.id) {
      throw appError('SESSION_NOT_FOUND');
    }

    db.transaction(() => {
      db.prepare(
        `INSERT INTO replay_sessions (
         id,user_id,instrument_id,sample_pool_id,trading_settings_json,access_grant_json,timeframe,minimum_base_timeframe,start_index,
         entry_index,history_bars,cursor_index,cash_balance,autoplay_interval_ms,is_paused,session_scope,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         instrument_id = excluded.instrument_id,
         sample_pool_id = excluded.sample_pool_id,
         trading_settings_json = excluded.trading_settings_json,
         access_grant_json = excluded.access_grant_json,
         timeframe = excluded.timeframe,
         minimum_base_timeframe = excluded.minimum_base_timeframe,
         start_index = excluded.start_index,
         entry_index = excluded.entry_index,
         history_bars = excluded.history_bars,
         cursor_index = excluded.cursor_index,
         cash_balance = excluded.cash_balance,
         autoplay_interval_ms = excluded.autoplay_interval_ms,
         is_paused = excluded.is_paused,
         session_scope = excluded.session_scope,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
    ).run(
      delta.session.id,
      delta.session.user_id,
      delta.session.instrument_id,
      delta.session.sample_pool_id,
      delta.session.trading_settings_json,
      delta.session.access_grant_json,
      delta.session.timeframe,
      delta.session.minimum_base_timeframe,
      delta.session.start_index,
      delta.session.entry_index,
      delta.session.history_bars,
      delta.session.cursor_index,
      delta.session.cash_balance,
      delta.session.autoplay_interval_ms,
      delta.session.is_paused,
      normalizeSessionScope(delta.session.session_scope),
      delta.session.created_at,
      delta.session.updated_at,
    );

    db.prepare(
      'DELETE FROM sim_accrual_events WHERE session_id = ? AND rowid > ?',
    ).run(normalizedSessionId, delta.rowidCutoffs.accrualEvents);
    db.prepare('DELETE FROM sim_fills WHERE session_id = ? AND rowid > ?').run(
      normalizedSessionId,
      delta.rowidCutoffs.fills,
    );
    db.prepare('DELETE FROM sim_orders WHERE session_id = ? AND rowid > ?').run(
      normalizedSessionId,
      delta.rowidCutoffs.orders,
    );
    rebuildSessionMetricTotals(normalizedSessionId, delta.session.updated_at);

    const insertPositionStmt = db.prepare(
      `INSERT INTO positions (
         session_id,instrument_id,qty,avg_cost,realized_pnl,last_borrow_accrual_day,current_leverage_cycle_start_time,updated_at
       ) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id,instrument_id) DO UPDATE SET
         qty = excluded.qty,
         avg_cost = excluded.avg_cost,
         realized_pnl = excluded.realized_pnl,
         last_borrow_accrual_day = excluded.last_borrow_accrual_day,
         current_leverage_cycle_start_time = excluded.current_leverage_cycle_start_time,
         updated_at = excluded.updated_at`,
    );
    const restoredPositionKeys = new Set<string>();
    delta.positions.forEach((row) => {
      restoredPositionKeys.add(row.instrument_id);
      insertPositionStmt.run(
        row.session_id,
        row.instrument_id,
        row.qty,
        row.avg_cost,
        row.realized_pnl,
        row.last_borrow_accrual_day,
        row.current_leverage_cycle_start_time,
        row.updated_at,
      );
    });
    const currentPositionRows = db
      .prepare('SELECT instrument_id FROM positions WHERE session_id = ?')
      .all(normalizedSessionId) as Array<{ instrument_id: string }>;
    const deletePositionStmt = db.prepare(
      'DELETE FROM positions WHERE session_id = ? AND instrument_id = ?',
    );
    currentPositionRows.forEach((row) => {
      if (!restoredPositionKeys.has(row.instrument_id)) {
        deletePositionStmt.run(normalizedSessionId, row.instrument_id);
      }
    });

    const insertOrderStmt = db.prepare(
      `INSERT INTO sim_orders (
         id,session_id,instrument_id,side,qty,amount,price_mode,submit_index,status,auto_step_next,created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         session_id = excluded.session_id,
         instrument_id = excluded.instrument_id,
         side = excluded.side,
         qty = excluded.qty,
         amount = excluded.amount,
         price_mode = excluded.price_mode,
         submit_index = excluded.submit_index,
         status = excluded.status,
         auto_step_next = excluded.auto_step_next,
         created_at = excluded.created_at
       WHERE session_id = excluded.session_id`,
    );
    delta.existingOrders.forEach((row) => {
      insertOrderStmt.run(
        row.id,
        row.session_id,
        row.instrument_id,
        row.side,
        row.qty,
        row.amount,
        row.price_mode,
        row.submit_index,
        row.status,
        row.auto_step_next,
        row.created_at,
      );
    });
    })();
  };

  const restoreLatestDelta = (sessionId: string): void => {
    const latestEntry = selectLatestReplaySessionUndoEntryStmt.get(sessionId) as
      | {
          id: string;
          undoDeltaJson: string;
        }
      | undefined;
    if (!latestEntry) {
      throw appError('INVALID_PARAMS');
    }
    const delta = JSON.parse(
      String(latestEntry.undoDeltaJson || ''),
    ) as ReplaySessionUndoDelta;
    restoreDelta(sessionId, delta);
    deleteReplaySessionUndoEntryByIdStmt.run(latestEntry.id);
  };

  return {
    captureDelta,
    insertDelta,
    getState,
    restoreLatestDelta,
  };
};
