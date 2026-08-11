// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { Side } from '../../../domain/models.js';

type CreateSessionFillStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
  createId: () => string;
  round: (value: number, digits?: number) => number;
};

type InsertFillInput = {
  orderId: string;
  sessionId: string;
  instrumentId: string;
  side: Side;
  fillIndex: number;
  fillTime: string;
  fillTradeDay: string;
  fillPrice: number;
  fillQty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  createdAt: string;
};

export const createSessionFillStore = ({
  db,
  createId,
  round,
}: CreateSessionFillStoreDeps) => {
  const insertFillStmt = db.prepare(
    `INSERT INTO sim_fills (
       id,order_id,session_id,instrument_id,side,fill_index,fill_time,fill_trade_day,fill_price,fill_qty,
       contract_multiplier,fee,tax,slippage,created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  const insertFill = ({
    orderId,
    sessionId,
    instrumentId,
    side,
    fillIndex,
    fillTime,
    fillTradeDay,
    fillPrice,
    fillQty,
    contractMultiplier,
    fee,
    tax,
    slippage,
    createdAt,
  }: InsertFillInput): string => {
    const fillId = createId();
    insertFillStmt.run(
      fillId,
      orderId,
      sessionId,
      instrumentId,
      side,
      fillIndex,
      fillTime,
      fillTradeDay,
      fillPrice,
      fillQty,
      round(contractMultiplier, 8),
      round(fee, 6),
      round(tax, 6),
      round(slippage, 6),
      createdAt,
    );
    return fillId;
  };

  return {
    insertFill,
  };
};
