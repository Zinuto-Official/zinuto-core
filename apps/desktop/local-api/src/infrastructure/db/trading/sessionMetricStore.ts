// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import { DESKTOP_API_LIMITS } from '@zinuto/shared/input-limits';
import type { Side } from '../../../domain/models.js';
import { POSITION_EPSILON } from '../../../domain/trading/orderSizing.js';

export type SessionFillRow = {
  id: string;
  order_id: string;
  session_id: string;
  instrument_id: string;
  symbol: string;
  side: Side;
  fill_index: number;
  fill_time: string;
  fill_price: number;
  fill_qty: number;
  contract_multiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  created_at: string;
};

type SessionFillCursorMeta = {
  fillIndex: number;
  rowid: number;
};

type SessionMetricTotals = {
  count: number;
  fee_total: number;
  tax_total: number;
  slippage_total: number;
  long_financing_total: number;
  short_borrow_total: number;
};

type CreateSessionMetricStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
  round: (value: number, digits?: number) => number;
};

const SESSION_FILLS_PAGE_LIMIT = DESKTOP_API_LIMITS.sessionFillsPageMax;

export const createSessionMetricStore = ({
  db,
  round,
}: CreateSessionMetricStoreDeps) => {
  const selectSessionMetricTotalsStmt = db.prepare(
    `SELECT fills_count AS count,
            fill_fee_total AS fee_total,
            fill_tax_total AS tax_total,
            fill_slippage_total AS slippage_total,
            long_financing_total AS long_financing_total,
            short_borrow_total AS short_borrow_total
       FROM replay_session_metric_totals
      WHERE session_id = ?`
  );

  const upsertSessionMetricTotalsDeltaStmt = db.prepare(
    `INSERT INTO replay_session_metric_totals (
       session_id,fills_count,fill_fee_total,fill_tax_total,fill_slippage_total,
       long_financing_total,short_borrow_total,updated_at
     ) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id) DO UPDATE SET
       fills_count = MAX(0, replay_session_metric_totals.fills_count + excluded.fills_count),
       fill_fee_total = MAX(0, replay_session_metric_totals.fill_fee_total + excluded.fill_fee_total),
       fill_tax_total = MAX(0, replay_session_metric_totals.fill_tax_total + excluded.fill_tax_total),
       fill_slippage_total = MAX(0, replay_session_metric_totals.fill_slippage_total + excluded.fill_slippage_total),
       long_financing_total = MAX(0, replay_session_metric_totals.long_financing_total + excluded.long_financing_total),
       short_borrow_total = MAX(0, replay_session_metric_totals.short_borrow_total + excluded.short_borrow_total),
       updated_at = excluded.updated_at`
  );

  const upsertSessionMetricTotalsAbsoluteStmt = db.prepare(
    `INSERT INTO replay_session_metric_totals (
       session_id,fills_count,fill_fee_total,fill_tax_total,fill_slippage_total,
       long_financing_total,short_borrow_total,updated_at
     ) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id) DO UPDATE SET
       fills_count = MAX(0, excluded.fills_count),
       fill_fee_total = MAX(0, excluded.fill_fee_total),
       fill_tax_total = MAX(0, excluded.fill_tax_total),
       fill_slippage_total = MAX(0, excluded.fill_slippage_total),
       long_financing_total = MAX(0, excluded.long_financing_total),
       short_borrow_total = MAX(0, excluded.short_borrow_total),
       updated_at = excluded.updated_at`
  );

  const selectSessionFillMetricsAggregateStmt = db.prepare(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(MAX(0, fee)), 0) AS fee_total,
            COALESCE(SUM(MAX(0, tax)), 0) AS tax_total,
            COALESCE(SUM(MAX(0, slippage)), 0) AS slippage_total
       FROM sim_fills
      WHERE session_id = ?`
  );

  const selectSessionLongFinancingAggregateStmt = db
    .prepare(
      `SELECT COALESCE(SUM(MAX(0, amount)), 0) AS amount
         FROM sim_accrual_events
        WHERE session_id = ?
          AND kind IN ('LONG_FINANCING','FUNDING')`
    )
    .pluck();

  const selectSessionShortBorrowAggregateStmt = db
    .prepare(
      `SELECT COALESCE(SUM(MAX(0, amount)), 0) AS amount
         FROM sim_accrual_events
        WHERE session_id = ?
          AND kind = 'SHORT_BORROW'`
    )
    .pluck();

  const selectSessionSnapshotFillsTailPageStmt = db.prepare(
    `SELECT *
       FROM (
         SELECT f.rowid AS fill_rowid,
                f.id,f.order_id,f.session_id,f.instrument_id,i.symbol,f.side,f.fill_index,f.fill_time,
                f.fill_price,f.fill_qty,f.contract_multiplier,f.fee,f.tax,f.slippage,f.created_at
           FROM sim_fills f
           JOIN instruments i ON i.id = f.instrument_id
          WHERE f.session_id = ?
          ORDER BY f.fill_index DESC, f.rowid DESC
          LIMIT ?
       )
      ORDER BY fill_index ASC, fill_rowid ASC`
  );

  const selectSessionSnapshotFillsAfterCursorStmt = db.prepare(
    `SELECT f.rowid AS fill_rowid,
            f.id,f.order_id,f.session_id,f.instrument_id,i.symbol,f.side,f.fill_index,f.fill_time,
            f.fill_price,f.fill_qty,f.contract_multiplier,f.fee,f.tax,f.slippage,f.created_at
       FROM sim_fills f
       JOIN instruments i ON i.id = f.instrument_id
      WHERE f.session_id = ?
        AND (
          f.fill_index > ?
          OR (f.fill_index = ? AND f.rowid > ?)
        )
      ORDER BY f.fill_index ASC, f.rowid ASC
      LIMIT ?`
  );

  const selectSessionSnapshotFillsInRawIndexRangeStmt = db.prepare(
    `SELECT f.rowid AS fill_rowid,
            f.id,f.order_id,f.session_id,f.instrument_id,i.symbol,f.side,f.fill_index,f.fill_time,
            f.fill_price,f.fill_qty,f.contract_multiplier,f.fee,f.tax,f.slippage,f.created_at
       FROM sim_fills f
       JOIN instruments i ON i.id = f.instrument_id
      WHERE f.session_id = ?
        AND f.fill_index >= ?
        AND f.fill_index <= ?
      ORDER BY f.fill_index ASC, f.rowid ASC`
  );

  const countSessionSnapshotFillsStmt = db.prepare(
    `SELECT COUNT(*) AS count
       FROM sim_fills
      WHERE session_id = ?`
  );

  const countSessionSnapshotFillsBeforeRawIndexStmt = db.prepare(
    `SELECT COUNT(*) AS count
       FROM sim_fills
      WHERE session_id = ?
        AND fill_index < ?`
  );

  const countSessionSnapshotFillsThroughCursorStmt = db.prepare(
    `SELECT COUNT(*) AS count
       FROM sim_fills
      WHERE session_id = ?
        AND (
          fill_index < ?
          OR (fill_index = ? AND rowid <= ?)
        )`
  );

  const readMetricTotals = (sessionId: string): SessionMetricTotals => {
    const row = selectSessionMetricTotalsStmt.get(sessionId) as
      | SessionMetricTotals
      | undefined;
    return {
      count: Math.max(0, Math.floor(Number(row?.count ?? 0) || 0)),
      fee_total: Number(row?.fee_total ?? 0) || 0,
      tax_total: Number(row?.tax_total ?? 0) || 0,
      slippage_total: Number(row?.slippage_total ?? 0) || 0,
      long_financing_total: Number(row?.long_financing_total ?? 0) || 0,
      short_borrow_total: Number(row?.short_borrow_total ?? 0) || 0,
    };
  };

  const encodeSessionFillCursor = (
    fillIndex: number,
    rowid: number,
  ): string => `${Math.max(0, Math.floor(fillIndex))}:${Math.max(0, Math.floor(rowid))}`;

  const decodeSessionFillCursor = (
    cursorRaw: unknown,
  ): SessionFillCursorMeta | null => {
    const normalized = String(cursorRaw ?? '').trim();
    if (!normalized) {
      return null;
    }
    const separatorIndex = normalized.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
      return null;
    }
    const fillIndex = Math.floor(Number(normalized.slice(0, separatorIndex)));
    const rowid = Math.floor(Number(normalized.slice(separatorIndex + 1)));
    if (!Number.isFinite(fillIndex) || !Number.isFinite(rowid)) {
      return null;
    }
    if (fillIndex < 0 || rowid < 0) {
      return null;
    }
    return {
      fillIndex,
      rowid,
    };
  };

  const readFillPage = (
    sessionId: string,
    fillCursor?: string | null,
    limit = SESSION_FILLS_PAGE_LIMIT,
    totalFills?: number,
  ): {
    fills: SessionFillRow[];
    nextFillCursor: string | null;
    residentFillsStartIndex: number;
  } => {
    const safeLimit = Math.max(
      1,
      Math.min(
        SESSION_FILLS_PAGE_LIMIT,
        Math.floor(Number.isFinite(limit) ? limit : SESSION_FILLS_PAGE_LIMIT),
      ),
    );
    const cursorMeta = decodeSessionFillCursor(fillCursor);
    const normalizedTotalFills = Math.max(
      0,
      Math.floor(Number(totalFills) || 0),
    );
    const rawRows = (
      cursorMeta
        ? selectSessionSnapshotFillsAfterCursorStmt.all(
            sessionId,
            cursorMeta.fillIndex,
            cursorMeta.fillIndex,
            cursorMeta.rowid,
            safeLimit,
          )
        : selectSessionSnapshotFillsTailPageStmt.all(sessionId, safeLimit)
    ) as Array<
      SessionFillRow & {
        fill_rowid: number;
      }
    >;
    const visibleRows = rawRows.map(({ fill_rowid: _fillRowId, ...row }) => row);
    const lastRawRow = rawRows[rawRows.length - 1];
    const cursorBaseIndex = cursorMeta
      ? Math.max(
          0,
          Math.floor(
            Number(
              (
                countSessionSnapshotFillsThroughCursorStmt.get(
                  sessionId,
                  cursorMeta.fillIndex,
                  cursorMeta.fillIndex,
                  cursorMeta.rowid,
                ) as { count?: number } | undefined
              )?.count ?? 0,
            ) || 0,
          ),
        )
      : Math.max(0, normalizedTotalFills - visibleRows.length);
    return {
      fills: visibleRows,
      nextFillCursor: lastRawRow
        ? encodeSessionFillCursor(lastRawRow.fill_index, Number(lastRawRow.fill_rowid) || 0)
        : cursorMeta
          ? encodeSessionFillCursor(cursorMeta.fillIndex, cursorMeta.rowid)
          : null,
      residentFillsStartIndex: cursorMeta
        ? cursorBaseIndex
        : Math.max(0, normalizedTotalFills - visibleRows.length),
    };
  };

  const readFillSnapshotWindow = (
    sessionId: string,
    startRawIndex: number,
    endRawIndex: number,
  ): {
    fills: SessionFillRow[];
    fillsTotal: number;
    residentFillsStartIndex: number;
  } => {
    const normalizedSessionId = String(sessionId || '').trim();
    const startIndex = Math.max(0, Math.floor(Number(startRawIndex) || 0));
    const endIndex = Math.max(0, Math.floor(Number(endRawIndex) || 0));
    const totalRow = countSessionSnapshotFillsStmt.get(normalizedSessionId) as
      | { count?: number }
      | undefined;
    const fillsTotal = Math.max(
      0,
      Math.floor(Number(totalRow?.count ?? 0) || 0),
    );
    if (!normalizedSessionId || endIndex < startIndex) {
      return {
        fills: [],
        fillsTotal,
        residentFillsStartIndex: 0,
      };
    }

    const beforeRow = countSessionSnapshotFillsBeforeRawIndexStmt.get(
      normalizedSessionId,
      startIndex,
    ) as { count?: number } | undefined;
    const residentFillsStartIndex = Math.max(
      0,
      Math.floor(Number(beforeRow?.count ?? 0) || 0),
    );
    const rows = selectSessionSnapshotFillsInRawIndexRangeStmt.all(
      normalizedSessionId,
      startIndex,
      endIndex,
    ) as Array<
      SessionFillRow & {
        fill_rowid: number;
      }
    >;
    return {
      fills: rows.map(({ fill_rowid: _fillRowId, ...row }) => row),
      fillsTotal,
      residentFillsStartIndex,
    };
  };

  const applyDelta = (
    sessionId: string,
    delta: {
      fillsCount?: number;
      fillFeeTotal?: number;
      fillTaxTotal?: number;
      fillSlippageTotal?: number;
      longFinancingTotal?: number;
      shortBorrowTotal?: number;
    },
    updatedAt: string,
  ): void => {
    const fillsCount = Math.floor(Number(delta.fillsCount ?? 0) || 0);
    const fillFeeTotal = round(Number(delta.fillFeeTotal ?? 0) || 0, 6);
    const fillTaxTotal = round(Number(delta.fillTaxTotal ?? 0) || 0, 6);
    const fillSlippageTotal = round(Number(delta.fillSlippageTotal ?? 0) || 0, 6);
    const longFinancingTotal = round(Number(delta.longFinancingTotal ?? 0) || 0, 6);
    const shortBorrowTotal = round(Number(delta.shortBorrowTotal ?? 0) || 0, 6);
    if (
      fillsCount === 0 &&
      Math.abs(fillFeeTotal) <= POSITION_EPSILON &&
      Math.abs(fillTaxTotal) <= POSITION_EPSILON &&
      Math.abs(fillSlippageTotal) <= POSITION_EPSILON &&
      Math.abs(longFinancingTotal) <= POSITION_EPSILON &&
      Math.abs(shortBorrowTotal) <= POSITION_EPSILON
    ) {
      return;
    }
    upsertSessionMetricTotalsDeltaStmt.run(
      sessionId,
      fillsCount,
      fillFeeTotal,
      fillTaxTotal,
      fillSlippageTotal,
      longFinancingTotal,
      shortBorrowTotal,
      updatedAt,
    );
  };

  const rebuildTotals = (
    sessionId: string,
    updatedAt: string,
  ): void => {
    const fillMetricsRow = selectSessionFillMetricsAggregateStmt.get(sessionId) as
      | {
          count: number;
          fee_total: number;
          tax_total: number;
          slippage_total: number;
        }
      | undefined;
    const longFinancingTotalRaw = selectSessionLongFinancingAggregateStmt.get(sessionId) as number;
    const shortBorrowTotalRaw = selectSessionShortBorrowAggregateStmt.get(sessionId) as number;
    upsertSessionMetricTotalsAbsoluteStmt.run(
      sessionId,
      Math.max(0, Math.floor(Number(fillMetricsRow?.count ?? 0) || 0)),
      round(Number(fillMetricsRow?.fee_total ?? 0) || 0, 6),
      round(Number(fillMetricsRow?.tax_total ?? 0) || 0, 6),
      round(Number(fillMetricsRow?.slippage_total ?? 0) || 0, 6),
      round(Number(longFinancingTotalRaw ?? 0) || 0, 6),
      round(Number(shortBorrowTotalRaw ?? 0) || 0, 6),
      updatedAt,
    );
  };

  return {
    readMetricTotals,
    readFillPage,
    readFillSnapshotWindow,
    applyDelta,
    rebuildTotals,
  };
};
