// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { PriceMode, Side } from '../../../domain/models.js';
import type { SessionRow } from '../../../domain/trading/types.js';

export type PendingNextOpenOrderRow = {
  id: string;
  side: Side;
  qty: number | null;
  amount: number | null;
  submit_index: number;
};

type PendingNextOpenOrderMetaRow = {
  id: string;
  submit_index: number;
};

type CreateSessionOrderStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
  createId: () => string;
  round: (value: number, digits?: number) => number;
};

type CreatePendingOrderInput = {
  sessionId: string;
  instrumentId: string;
  side: Side;
  qty?: number | null;
  amount?: number | null;
  priceMode: PriceMode;
  submitIndex: number;
  autoStep: boolean;
  createdAt: string;
};

type CreateForcedLiquidationOrderInput = {
  sessionId: string;
  instrumentId: string;
  side: Side;
  qty: number;
  submitIndex: number;
  createdAt: string;
};

export const createSessionOrderStore = ({
  db,
  createId,
  round,
}: CreateSessionOrderStoreDeps) => {
  const selectPendingNextOpenOrdersBySubmitRangeStmt = db.prepare(
    `SELECT id,side,qty,amount,submit_index
       FROM sim_orders
      WHERE session_id = ?
        AND status = 'PENDING'
        AND price_mode = 'NEXT_OPEN'
        AND submit_index >= ?
        AND submit_index < ?
      ORDER BY submit_index ASC, rowid ASC`
  );

  const selectPendingNextOpenOrdersForSessionStmt = db.prepare(
    `SELECT id,submit_index
       FROM sim_orders
      WHERE session_id = ?
        AND status = 'PENDING'
        AND price_mode = 'NEXT_OPEN'
      ORDER BY rowid DESC`
  );

  const cancelPendingNextOpenOrdersForSessionStmt = db.prepare(
    `UPDATE sim_orders
        SET status = 'CANCELLED'
      WHERE session_id = ?
        AND status = 'PENDING'
        AND price_mode = 'NEXT_OPEN'`
  );

  const cancelPendingOrderByIdStmt = db.prepare(
    `UPDATE sim_orders
        SET status = 'CANCELLED'
      WHERE id = ?
        AND status = 'PENDING'`
  );

  const markOrderFilledStmt = db.prepare(
    `UPDATE sim_orders
        SET status = ?
      WHERE id = ?`
  );

  const insertOrderStmt = db.prepare(
    `INSERT INTO sim_orders (
       id,session_id,instrument_id,side,qty,amount,price_mode,submit_index,status,auto_step_next,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );

  const cancelPendingOrderById = (orderId: string): boolean =>
    cancelPendingOrderByIdStmt.run(orderId).changes > 0;

  const normalizePendingNextOpenOrders = (session: SessionRow): void => {
    const pendingOrders = selectPendingNextOpenOrdersForSessionStmt.all(
      session.id
    ) as PendingNextOpenOrderMetaRow[];
    if (!pendingOrders.length) {
      return;
    }

    const cursorIndex = Math.max(0, Math.floor(Number(session.cursor_index) || 0));
    let keptPendingOrder = false;
    for (const order of pendingOrders) {
      const submitIndex = Math.max(0, Math.floor(Number(order.submit_index) || 0));
      const isExpired = submitIndex < cursorIndex;
      if (!isExpired && !keptPendingOrder) {
        keptPendingOrder = true;
        continue;
      }
      cancelPendingOrderById(order.id);
    }
  };

  const listPendingNextOpenOrdersBySubmitRange = (
    sessionId: string,
    startCursorExclusive: number,
    endCursorInclusive: number,
  ): PendingNextOpenOrderRow[] =>
    selectPendingNextOpenOrdersBySubmitRangeStmt.all(
      sessionId,
      startCursorExclusive,
      endCursorInclusive,
    ) as PendingNextOpenOrderRow[];

  const cancelPendingNextOpenOrdersForSession = (sessionId: string): void => {
    cancelPendingNextOpenOrdersForSessionStmt.run(sessionId);
  };

  const markOrderFilled = (orderId: string): void => {
    markOrderFilledStmt.run('FILLED', orderId);
  };

  const createPendingOrder = ({
    sessionId,
    instrumentId,
    side,
    qty,
    amount,
    priceMode,
    submitIndex,
    autoStep,
    createdAt,
  }: CreatePendingOrderInput): string => {
    const orderId = createId();
    insertOrderStmt.run(
      orderId,
      sessionId,
      instrumentId,
      side,
      qty ?? null,
      amount ?? null,
      priceMode,
      submitIndex,
      'PENDING',
      autoStep ? 1 : 0,
      createdAt,
    );
    return orderId;
  };

  const createForcedLiquidationOrder = ({
    sessionId,
    instrumentId,
    side,
    qty,
    submitIndex,
    createdAt,
  }: CreateForcedLiquidationOrderInput): string =>
    createPendingOrder({
      sessionId,
      instrumentId,
      side,
      qty: round(qty, 8),
      amount: null,
      priceMode: 'CUR_CLOSE',
      submitIndex,
      autoStep: false,
      createdAt,
    });

  return {
    cancelPendingNextOpenOrdersForSession,
    cancelPendingOrderById,
    createForcedLiquidationOrder,
    createPendingOrder,
    listPendingNextOpenOrdersBySubmitRange,
    markOrderFilled,
    normalizePendingNextOpenOrders,
  };
};
