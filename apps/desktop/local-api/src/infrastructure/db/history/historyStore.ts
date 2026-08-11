// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

export type TrainingProjectRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  symbol: string;
  sample_pool_id: string;
  sample_pool_name: string;
  base_timeframe: string;
  training_date_range: string;
  initial_total: number;
  total_pnl: number;
  profit_rate: number;
  duration_days: number;
  total_trades: number;
  final_equity: number;
  equity_return_rate: number;
  asset_class?: string | null;
  source_tag?: string;
  detail_expired_at?: string | null;
  summary_json: string;
  operator_summary_json: string | null;
};

export type ArchiveReplayFill = {
  id: string;
  order_id: string;
  session_id: string;
  instrument_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
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

export type ArchiveCashAdjustmentRow = {
  kind: 'LONG_FINANCING' | 'SHORT_BORROW' | 'FUNDING';
  accrualDay: string | null;
  accrualTime: string | null;
  amount: number;
  createdAt: string | null;
};

export type TrainingStatsSnapshotRow = {
  maxConsecutiveWins?: number;
  maxDrawdownRate?: number;
  profitTradeTotal?: number;
  lossTradeTotal?: number;
  totalTrades?: number;
};

type TrainingProjectCursor = {
  createdAt: string;
  id: string;
};

export type InsertTrainingProjectRowInput = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  trainingDateRange: string;
  initialTotal: number;
  totalPnl: number;
  profitRate: number;
  durationDays: number;
  totalTrades: number;
  finalEquity: number;
  equityReturnRate: number;
  simulationBatchId: string | null;
  sourceTag: string;
  summaryJson: string;
  operatorSummaryJson: string;
};

const selectTrainingProjectColumns = `p.id,p.name,p.created_at,p.updated_at,p.symbol,p.sample_pool_id,p.sample_pool_name,p.training_date_range,
        p.base_timeframe,p.initial_total,p.total_pnl,p.profit_rate,p.duration_days,p.total_trades,p.final_equity,
        p.equity_return_rate,p.detail_expired_at,p.summary_json,p.operator_summary_json,s.asset_class`;

const selectTrainingStatsSnapshotStmt = db.prepare(
  `SELECT max_consecutive_wins AS maxConsecutiveWins,
          max_drawdown_rate AS maxDrawdownRate,
          profit_trade_total AS profitTradeTotal,
          loss_trade_total AS lossTradeTotal,
          closed_trades AS totalTrades
     FROM training_stats_sessions
    WHERE project_id = ?
    LIMIT 1`,
);

const listTrainingProjectsStmt = db.prepare(
  `SELECT ${selectTrainingProjectColumns}
     FROM training_projects p
     LEFT JOIN training_stats_sessions s ON s.project_id = p.id
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ?`,
);

const listTrainingProjectsAfterCursorStmt = db.prepare(
  `SELECT ${selectTrainingProjectColumns}
     FROM training_projects p
     LEFT JOIN training_stats_sessions s ON s.project_id = p.id
    WHERE (p.created_at, p.id) < (?, ?)
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ?`,
);

const getTrainingProjectByIdStmt = db.prepare(
  `SELECT ${selectTrainingProjectColumns}
     FROM training_projects p
     LEFT JOIN training_stats_sessions s ON s.project_id = p.id
    WHERE p.id = ?`,
);

const insertTrainingProjectStmt = db.prepare(
  `INSERT INTO training_projects (
    id,name,created_at,updated_at,symbol,sample_pool_id,sample_pool_name,base_timeframe,training_date_range,
    initial_total,total_pnl,profit_rate,duration_days,total_trades,final_equity,equity_return_rate,simulation_batch_id,source_tag,summary_json,operator_summary_json
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const renameTrainingProjectStmt = db.prepare(
  'UPDATE training_projects SET name = ?, updated_at = ? WHERE id = ?',
);

const clearTrainingProjectsStmt = db.prepare('DELETE FROM training_projects');

const ARCHIVE_FILL_BATCH_SIZE = 1_000;

const selectArchiveSessionFillBatchStmt = db.prepare(
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
    LIMIT ?`,
);

const selectArchiveCashAdjustmentsStmt = db.prepare(
  `SELECT CASE WHEN kind = 'SHORT_BORROW' THEN 'SHORT_BORROW' ELSE 'LONG_FINANCING' END AS kind,
          accrual_end_day AS accrualDay,
          accrual_time AS accrualTime,
          amount AS amount,
          created_at AS createdAt
     FROM sim_accrual_events
    WHERE session_id = ?
      AND kind IN ('LONG_FINANCING','SHORT_BORROW','FUNDING')
    ORDER BY accrual_time ASC, created_at ASC, rowid ASC`,
);

export const runTrainingProjectMutation = <T>(fn: () => T): T =>
  db.transaction(fn)();

export const loadTrainingStatsSnapshotRow = (
  projectId: string,
): TrainingStatsSnapshotRow | null =>
  (selectTrainingStatsSnapshotStmt.get(projectId) as
    | TrainingStatsSnapshotRow
    | undefined) ?? null;

export const listArchiveSessionFills = (sessionId: string): ArchiveReplayFill[] => {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return [];
  }

  const fills: ArchiveReplayFill[] = [];
  let lastFillIndex = -1;
  let lastRowid = 0;
  while (true) {
    const rows = selectArchiveSessionFillBatchStmt.all(
      normalizedSessionId,
      lastFillIndex,
      lastFillIndex,
      lastRowid,
      ARCHIVE_FILL_BATCH_SIZE,
    ) as Array<ArchiveReplayFill & { fill_rowid: number }>;
    if (!rows.length) {
      break;
    }
    for (const row of rows) {
      const { fill_rowid: _fillRowid, ...fill } = row;
      fills.push(fill);
    }
    const lastRow = rows[rows.length - 1];
    lastFillIndex = Math.max(0, Math.floor(Number(lastRow?.fill_index) || 0));
    lastRowid = Math.max(0, Math.floor(Number(lastRow?.fill_rowid) || 0));
    if (rows.length < ARCHIVE_FILL_BATCH_SIZE) {
      break;
    }
  }
  return fills;
};

export const listArchiveCashAdjustmentRows = (
  sessionId: string,
): ArchiveCashAdjustmentRow[] =>
  (selectArchiveCashAdjustmentsStmt.all(sessionId) as ArchiveCashAdjustmentRow[])
    .sort((left, right) => {
      const leftTime = String(left.accrualTime || '').trim();
      const rightTime = String(right.accrualTime || '').trim();
      if (leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }
      return String(left.createdAt || '').localeCompare(String(right.createdAt || ''));
    });

export const listTrainingProjectRows = ({
  cursor,
  limit,
}: {
  cursor: TrainingProjectCursor | null;
  limit: number;
}): TrainingProjectRow[] =>
  cursor
    ? listTrainingProjectsAfterCursorStmt.all(
        cursor.createdAt,
        cursor.id,
        limit,
      ) as TrainingProjectRow[]
    : listTrainingProjectsStmt.all(limit) as TrainingProjectRow[];

export const getTrainingProjectRowById = (
  projectId: string,
): TrainingProjectRow | null =>
  (getTrainingProjectByIdStmt.get(projectId) as TrainingProjectRow | undefined) ??
  null;

export const insertTrainingProjectRow = (
  row: InsertTrainingProjectRowInput,
): void => {
  insertTrainingProjectStmt.run(
    row.id,
    row.name,
    row.createdAt,
    row.updatedAt,
    row.symbol,
    row.samplePoolId,
    row.samplePoolName,
    row.baseTimeframe,
    row.trainingDateRange,
    row.initialTotal,
    row.totalPnl,
    row.profitRate,
    row.durationDays,
    row.totalTrades,
    row.finalEquity,
    row.equityReturnRate,
    row.simulationBatchId,
    row.sourceTag,
    row.summaryJson,
    row.operatorSummaryJson,
  );
};

export const renameTrainingProjectRow = ({
  id,
  name,
  updatedAt,
}: {
  id: string;
  name: string;
  updatedAt: string;
}): number => renameTrainingProjectStmt.run(name, updatedAt, id).changes;

export const deleteTrainingProjectRows = (
  projectIds: readonly string[],
): number => {
  if (!projectIds.length) {
    return 0;
  }
  const placeholders = projectIds.map(() => '?').join(',');
  return db
    .prepare(`DELETE FROM training_projects WHERE id IN (${placeholders})`)
    .run(...projectIds).changes;
};

export const clearTrainingProjectRows = (): number =>
  clearTrainingProjectsStmt.run().changes;
