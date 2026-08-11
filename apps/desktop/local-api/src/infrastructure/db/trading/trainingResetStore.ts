// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { Side } from '../../../domain/models.js';

export type TrainingSessionRow = {
  id: string;
  instrumentId: string;
  symbol: string;
  entryIndex: number;
  cursorIndex: number;
  tradingSettingsJson: string | null;
};

export type TrainingFillRow = {
  sessionId: string;
  instrumentId: string;
  side: Side;
  fillPrice: number;
  fillQty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  fillTime: string;
  createdAt: string;
};

export type TrainingFinancingChargeRow = {
  sessionId: string;
  instrumentId: string;
  amount: number;
  accrualTime: string;
  createdAt: string;
};

export type TrainingPositionRow = {
  sessionId: string;
  instrumentId: string;
  qty: number;
  avgCost: number;
  realizedPnl: number;
  lastBorrowAccrualDay: string | null;
};

export type TrainingPreviewPositionRow = {
  qty: number;
  avgCost: number;
  lastBorrowAccrualDay: string | null;
};

type CreateTrainingResetStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
  defaultUserId: string;
};

type PendingCloseOrderInput = {
  orderId: string;
  sessionId: string;
  instrumentId: string;
  side: Side;
  qty: number;
  priceMode: string;
  submitIndex: number;
  createdAt: string;
};

export const createTrainingResetStore = ({
  db,
  defaultUserId,
}: CreateTrainingResetStoreDeps) => {
  const listAllTrainingSessionsStmt = db.prepare(
    `SELECT s.id AS id,
            s.instrument_id AS instrumentId,
            i.symbol AS symbol,
            s.entry_index AS entryIndex,
            s.cursor_index AS cursorIndex,
            s.trading_settings_json AS tradingSettingsJson
       FROM replay_sessions s
       JOIN instruments i ON i.id = s.instrument_id
      WHERE s.user_id = ?
        AND s.session_scope = 'OFFICIAL'
      ORDER BY i.symbol ASC, s.created_at ASC`,
  );
  const listTrainingSessionsBySymbolStmt = db.prepare(
    `SELECT s.id AS id,
            s.instrument_id AS instrumentId,
            i.symbol AS symbol,
            s.entry_index AS entryIndex,
            s.cursor_index AS cursorIndex,
            s.trading_settings_json AS tradingSettingsJson
       FROM replay_sessions s
       JOIN instruments i ON i.id = s.instrument_id
      WHERE s.user_id = ?
        AND s.session_scope = 'OFFICIAL'
        AND i.symbol = ?
      ORDER BY i.symbol ASC, s.created_at ASC`,
  );
  const listTrainingSessionsBySymbolAndTimeframeStmt = db.prepare(
    `SELECT s.id AS id,
            s.instrument_id AS instrumentId,
            i.symbol AS symbol,
            s.entry_index AS entryIndex,
            s.cursor_index AS cursorIndex,
            s.trading_settings_json AS tradingSettingsJson
       FROM replay_sessions s
       JOIN instruments i ON i.id = s.instrument_id
      WHERE s.user_id = ?
        AND s.session_scope = 'OFFICIAL'
        AND i.symbol = ?
        AND s.timeframe = ?
      ORDER BY i.symbol ASC, s.created_at ASC`,
  );
  const cancelPendingNextOpenOrdersStmt = db.prepare(
    `UPDATE sim_orders
        SET status = 'CANCELLED'
      WHERE session_id = ?
        AND status = 'PENDING'
        AND price_mode = 'NEXT_OPEN'`,
  );
  const insertPendingCloseOrderStmt = db.prepare(
    `INSERT INTO sim_orders (
       id,session_id,instrument_id,side,qty,amount,price_mode,submit_index,status,auto_step_next,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const cancelPendingOrderStmt = db.prepare(
    `UPDATE sim_orders
        SET status = 'CANCELLED'
      WHERE id = ?
        AND status = 'PENDING'`,
  );
  const updateReplaySessionCursorStmt = db.prepare(
    'UPDATE replay_sessions SET cursor_index = ?, updated_at = ? WHERE id = ?',
  );
  const selectPreviewPositionStmt = db.prepare(
    `SELECT qty,
            avg_cost AS avgCost,
            last_borrow_accrual_day AS lastBorrowAccrualDay
       FROM positions
      WHERE session_id = ?
        AND instrument_id = ?
      LIMIT 1`,
  );
  const deleteOfficialReplaySessionsExceptStmt = db.prepare(
    "DELETE FROM replay_sessions WHERE user_id = ? AND session_scope = 'OFFICIAL' AND id <> ?",
  );
  const deleteAllOfficialReplaySessionsStmt = db.prepare(
    "DELETE FROM replay_sessions WHERE user_id = ? AND session_scope = 'OFFICIAL'",
  );
  const deleteSpecialTrainingQuestionDrawCursorsStmt = db.prepare(
    'DELETE FROM special_training_question_draw_cursors WHERE user_id = ?',
  );
  const deleteSpecialTrainingQuestionScopeIndexesStmt = db.prepare(
    'DELETE FROM special_training_question_scope_indexes WHERE user_id = ?',
  );
  const deleteSpecialTrainingQuestionLedgerStmt = db.prepare(
    'DELETE FROM special_training_question_ledger WHERE user_id = ?',
  );
  const deleteSpecialTrainingHistoryQuestionsStmt = db.prepare(
    'DELETE FROM special_training_history_questions',
  );
  const deleteSpecialTrainingHistorySessionsStmt = db.prepare(
    'DELETE FROM special_training_history_sessions WHERE user_id = ?',
  );
  const deleteSpecialTrainingStatsProjectionStmt = db.prepare(
    'DELETE FROM special_training_stats_projection',
  );
  const deleteOfficialReplaySessionsByInstrumentStmt = db.prepare(
    "DELETE FROM replay_sessions WHERE user_id = ? AND instrument_id = ? AND session_scope = 'OFFICIAL'",
  );
  const listSpecialTrainingLedgerScopeHashesBySymbolStmt = db.prepare(
    `SELECT DISTINCT scope_hash
       FROM special_training_question_ledger
      WHERE user_id = ?
        AND symbol = ?`,
  );
  const deleteSpecialTrainingLedgerBySymbolStmt = db.prepare(
    'DELETE FROM special_training_question_ledger WHERE user_id = ? AND symbol = ?',
  );
  const deleteSpecialTrainingStatsProjectionBySymbolStmt = db.prepare(
    'DELETE FROM special_training_stats_projection WHERE symbol = ?',
  );
  const deleteSpecialTrainingHistorySessionsBySymbolStmt = db.prepare(
    `DELETE FROM special_training_history_sessions
      WHERE user_id = ?
        AND id IN (
          SELECT DISTINCT session_id
            FROM special_training_history_questions
           WHERE symbol = ?
        )`,
  );

  const listTrainingSessions = (
    symbol?: string,
    timeframe?: string,
  ): TrainingSessionRow[] => {
    if (!symbol) {
      return listAllTrainingSessionsStmt.all(defaultUserId) as TrainingSessionRow[];
    }
    const normalizedSymbol = symbol.toUpperCase();
    if (timeframe) {
      return listTrainingSessionsBySymbolAndTimeframeStmt.all(
        defaultUserId,
        normalizedSymbol,
        timeframe,
      ) as TrainingSessionRow[];
    }
    return listTrainingSessionsBySymbolStmt.all(
      defaultUserId,
      normalizedSymbol,
    ) as TrainingSessionRow[];
  };

  const listTrainingFillRows = (sessionIds: string[]): TrainingFillRow[] => {
    if (!sessionIds.length) {
      return [];
    }
    const placeholders = sessionIds.map(() => '?').join(',');
    return db
      .prepare(
        `SELECT session_id AS sessionId,
                instrument_id AS instrumentId,
                side AS side,
                fill_price AS fillPrice,
                fill_qty AS fillQty,
                contract_multiplier AS contractMultiplier,
                fee AS fee,
                tax AS tax,
                slippage AS slippage,
                fill_time AS fillTime,
                created_at AS createdAt
           FROM sim_fills
          WHERE session_id IN (${placeholders})
          ORDER BY fill_time ASC, created_at ASC`,
      )
      .all(...sessionIds) as TrainingFillRow[];
  };

  const listTrainingFinancingChargeRows = (
    sessionIds: string[],
  ): TrainingFinancingChargeRow[] => {
    if (!sessionIds.length) {
      return [];
    }
    const placeholders = sessionIds.map(() => '?').join(',');
    return db
      .prepare(
        `SELECT session_id AS sessionId,
                instrument_id AS instrumentId,
                amount AS amount,
                accrual_time AS accrualTime,
                created_at AS createdAt
           FROM sim_accrual_events
          WHERE session_id IN (${placeholders})
          ORDER BY accrual_time ASC, created_at ASC`,
      )
      .all(...sessionIds) as TrainingFinancingChargeRow[];
  };

  const listTrainingPositionRows = (
    sessionIds: string[],
  ): TrainingPositionRow[] => {
    if (!sessionIds.length) {
      return [];
    }
    const placeholders = sessionIds.map(() => '?').join(',');
    return db
      .prepare(
        `SELECT session_id AS sessionId,
                instrument_id AS instrumentId,
                qty AS qty,
                avg_cost AS avgCost,
                realized_pnl AS realizedPnl,
                last_borrow_accrual_day AS lastBorrowAccrualDay
           FROM positions
          WHERE session_id IN (${placeholders})`,
      )
      .all(...sessionIds) as TrainingPositionRow[];
  };

  const cancelPendingNextOpenOrders = (sessionId: string): number =>
    cancelPendingNextOpenOrdersStmt.run(sessionId).changes;

  const insertPendingCloseOrder = (input: PendingCloseOrderInput): void => {
    insertPendingCloseOrderStmt.run(
      input.orderId,
      input.sessionId,
      input.instrumentId,
      input.side,
      input.qty,
      null,
      input.priceMode,
      input.submitIndex,
      'PENDING',
      0,
      input.createdAt,
    );
  };

  const cancelPendingOrder = (orderId: string): number =>
    cancelPendingOrderStmt.run(orderId).changes;

  const updateReplaySessionCursor = (
    sessionId: string,
    cursorIndex: number,
    updatedAt: string,
  ): number => updateReplaySessionCursorStmt.run(cursorIndex, updatedAt, sessionId).changes;

  const getPreviewPosition = (
    sessionId: string,
    instrumentId: string,
  ): TrainingPreviewPositionRow | undefined =>
    selectPreviewPositionStmt.get(sessionId, instrumentId) as
      | TrainingPreviewPositionRow
      | undefined;

  const deleteOfficialReplaySessionsExcept = (keepSessionId: string): number =>
    deleteOfficialReplaySessionsExceptStmt.run(defaultUserId, keepSessionId).changes;

  const deleteAllOfficialReplaySessions = (): number =>
    deleteAllOfficialReplaySessionsStmt.run(defaultUserId).changes;

  const resetAllTrainingData = (): number => {
    const clearedSessions = deleteAllOfficialReplaySessions();
    deleteSpecialTrainingQuestionDrawCursorsStmt.run(defaultUserId);
    deleteSpecialTrainingQuestionScopeIndexesStmt.run(defaultUserId);
    deleteSpecialTrainingQuestionLedgerStmt.run(defaultUserId);
    deleteSpecialTrainingHistoryQuestionsStmt.run();
    deleteSpecialTrainingHistorySessionsStmt.run(defaultUserId);
    deleteSpecialTrainingStatsProjectionStmt.run();
    return clearedSessions;
  };

  const deleteDrawCursorsByScopeHashes = (scopeHashes: string[]): void => {
    if (!scopeHashes.length) {
      return;
    }
    const placeholders = scopeHashes.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM special_training_question_draw_cursors
        WHERE user_id = ?
          AND scope_hash IN (${placeholders})`,
    ).run(defaultUserId, ...scopeHashes);
  };

  const resetSymbolTrainingData = ({
    instrumentId,
    symbol,
  }: {
    instrumentId: string;
    symbol: string;
  }): number => {
    const clearedSessions = deleteOfficialReplaySessionsByInstrumentStmt.run(
      defaultUserId,
      instrumentId,
    ).changes;
    const affectedScopeRows = listSpecialTrainingLedgerScopeHashesBySymbolStmt
      .all(defaultUserId, symbol) as Array<{ scope_hash?: unknown }>;
    const affectedScopeHashes = affectedScopeRows
      .map((row) => String(row.scope_hash ?? '').trim())
      .filter((scopeHash) => scopeHash.length > 0);
    deleteDrawCursorsByScopeHashes(affectedScopeHashes);
    deleteSpecialTrainingLedgerBySymbolStmt.run(defaultUserId, symbol);
    deleteSpecialTrainingStatsProjectionBySymbolStmt.run(symbol);
    deleteSpecialTrainingHistorySessionsBySymbolStmt.run(defaultUserId, symbol);
    return clearedSessions;
  };

  return {
    cancelPendingNextOpenOrders,
    cancelPendingOrder,
    deleteAllOfficialReplaySessions,
    deleteOfficialReplaySessionsExcept,
    getPreviewPosition,
    insertPendingCloseOrder,
    listTrainingFillRows,
    listTrainingFinancingChargeRows,
    listTrainingPositionRows,
    listTrainingSessions,
    resetAllTrainingData,
    resetSymbolTrainingData,
    updateReplaySessionCursor,
  };
};
