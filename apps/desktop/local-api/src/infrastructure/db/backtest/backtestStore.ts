// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

const BACKTEST_INSERT_CHUNK_SIZE = 5_000;

export type BacktestBatchRow = {
  id: string;
  name: string;
  status: string;
  config_json: string;
  progress_json: string;
  summary_json: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type BacktestResultRow = {
  id: string;
  batch_id: string;
  instrument_id: string;
  symbol: string;
  timeframe: string;
  bars_count: number;
  final_equity: number;
  total_pnl: number;
  profit_rate: number;
  max_drawdown: number;
  win_rate: number;
  trade_count: number;
  conflict_count: number;
  summary_json: string;
  created_at: string;
  updated_at: string;
};

export type BacktestResultListRow = Omit<BacktestResultRow, 'summary_json'>;

export type BacktestFillRow = {
  id: string;
  batch_id: string;
  result_id: string;
  instrument_id: string;
  symbol: string;
  order_id: string;
  fill_index: number;
  fill_time: string;
  side: 'BUY' | 'SELL';
  price: number;
  qty: number;
  gross: number;
  fee: number;
  tax: number;
  slippage: number;
  created_at: string;
};

export type BacktestEquityPointRow = {
  id: string;
  batch_id: string;
  result_id: string;
  instrument_id: string;
  symbol: string;
  bar_index: number;
  bar_time: string;
  equity: number;
  drawdown: number;
};

export type BacktestInstrumentRow = {
  id: string;
  source_id: string | null;
  symbol: string;
  base_timeframe: string | null;
  name: string | null;
  market: string | null;
  bar_count: number | null;
  time_zone: string | null;
  bars_version_token: string | null;
};

export type BacktestBatchInsertRow = {
  id: string;
  name: string;
  status: string;
  configJson: string;
  progressJson: string;
  summaryJson: string;
  createdAt: string;
  updatedAt: string;
};

export type BacktestBatchUpdateRow = {
  id: string;
  status: string;
  progressJson: string;
  summaryJson: string;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type BacktestResultInsertRow = Omit<BacktestResultRow, 'batch_id' | 'summary_json' | 'created_at' | 'updated_at'> & {
  batchId: string;
  summaryJson: string;
  createdAt: string;
  updatedAt: string;
};

export type BacktestFillInsertRow = Omit<BacktestFillRow, 'batch_id' | 'result_id' | 'created_at'> & {
  batchId: string;
  resultId: string;
  createdAt: string;
};

export type BacktestEquityPointInsertRow = Omit<BacktestEquityPointRow, 'batch_id' | 'result_id'> & {
  batchId: string;
  resultId: string;
};

type BacktestBatchIdRow = {
  id: string;
};

const insertBatchStmt = db.prepare(
  `INSERT INTO backtest_batches (
    id,name,status,config_json,progress_json,summary_json,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?)`,
);

const listBatchesStmt = db.prepare(
  `SELECT id,name,status,config_json,progress_json,summary_json,error_code,error_message,created_at,updated_at,started_at,finished_at
     FROM backtest_batches
    ORDER BY updated_at DESC, created_at DESC, id DESC
    LIMIT 500`,
);

const listActiveBatchesStmt = db.prepare(
  `SELECT id,name,status,config_json,progress_json,summary_json,error_code,error_message,created_at,updated_at,started_at,finished_at
     FROM backtest_batches
    WHERE status IN ('QUEUED', 'RUNNING')
    ORDER BY updated_at ASC, created_at ASC, id ASC`,
);

const hasActiveBatchesStmt = db.prepare(
  `SELECT 1 FROM backtest_batches WHERE status IN ('QUEUED', 'RUNNING') LIMIT 1`,
);

const getBatchStmt = db.prepare(
  `SELECT id,name,status,config_json,progress_json,summary_json,error_code,error_message,created_at,updated_at,started_at,finished_at
     FROM backtest_batches
    WHERE id = ?`,
);

const updateBatchStmt = db.prepare(
  `UPDATE backtest_batches
      SET status = ?,
          progress_json = ?,
          summary_json = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?,
          started_at = ?,
          finished_at = ?
    WHERE id = ?`,
);

const deleteBatchStmt = db.prepare('DELETE FROM backtest_batches WHERE id = ?');
const listAllBatchIdsStmt = db.prepare(
  `SELECT id
     FROM backtest_batches
    ORDER BY updated_at DESC, created_at DESC, id DESC`,
);
const deleteAllBatchesStmt = db.prepare('DELETE FROM backtest_batches');
const deleteRunDataStmt = db.prepare('DELETE FROM backtest_results WHERE batch_id = ?');

const insertResultStmt = db.prepare(
  `INSERT INTO backtest_results (
    id,batch_id,instrument_id,symbol,timeframe,bars_count,final_equity,total_pnl,profit_rate,
    max_drawdown,win_rate,trade_count,conflict_count,summary_json,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const insertFillStmt = db.prepare(
  `INSERT INTO backtest_fills (
    id,batch_id,result_id,instrument_id,symbol,order_id,fill_index,fill_time,side,price,qty,
    gross,fee,tax,slippage,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);

const insertEquityPointStmt = db.prepare(
  `INSERT INTO backtest_equity_curve (
    id,batch_id,result_id,instrument_id,symbol,bar_index,bar_time,equity,drawdown
  ) VALUES (?,?,?,?,?,?,?,?,?)`,
);

const listResultsStmt = db.prepare(
  `SELECT id,batch_id,instrument_id,symbol,timeframe,bars_count,final_equity,total_pnl,profit_rate,
          max_drawdown,win_rate,trade_count,conflict_count,created_at,updated_at
     FROM backtest_results
    WHERE batch_id = ?
    ORDER BY profit_rate DESC, symbol ASC, id ASC`,
);

const getResultBySymbolStmt = db.prepare(
  `SELECT id,batch_id,instrument_id,symbol,timeframe,bars_count,final_equity,total_pnl,profit_rate,
          max_drawdown,win_rate,trade_count,conflict_count,summary_json,created_at,updated_at
     FROM backtest_results
    WHERE batch_id = ? AND symbol = ?
    ORDER BY timeframe ASC, id ASC
    LIMIT 1`,
);

const listFillsStmt = db.prepare(
  `SELECT id,batch_id,result_id,instrument_id,symbol,order_id,fill_index,fill_time,side,price,qty,
          gross,fee,tax,slippage,created_at
     FROM backtest_fills
    WHERE result_id = ?
    ORDER BY fill_index ASC, id ASC`,
);

const listEquityCurveStmt = db.prepare(
  `SELECT id,batch_id,result_id,instrument_id,symbol,bar_index,bar_time,equity,drawdown
     FROM backtest_equity_curve
    WHERE result_id = ?
    ORDER BY bar_index ASC`,
);

const listInstrumentByIdsStmt = db.prepare(
  `SELECT id,source_id,symbol,base_timeframe,name,market,bar_count,time_zone,bars_version_token
     FROM instruments
    WHERE id IN (SELECT value FROM json_each(?))
    ORDER BY symbol ASC, id ASC`,
);

const listInstrumentBySourceIdsStmt = db.prepare(
  `SELECT id,source_id,symbol,base_timeframe,name,market,bar_count,time_zone,bars_version_token
     FROM instruments
    WHERE source_id IN (SELECT value FROM json_each(?))
    ORDER BY symbol ASC, id ASC`,
);

const listSystemInstrumentsStmt = db.prepare(
  `SELECT id,source_id,symbol,base_timeframe,name,market,bar_count,time_zone,bars_version_token
     FROM instruments
    WHERE market = 'SYSTEM'
    ORDER BY symbol ASC, id ASC`,
);

export const insertBacktestBatchRow = (row: BacktestBatchInsertRow): void => {
  insertBatchStmt.run(
    row.id,
    row.name,
    row.status,
    row.configJson,
    row.progressJson,
    row.summaryJson,
    row.createdAt,
    row.updatedAt,
  );
};

export const listBacktestBatchRows = (): BacktestBatchRow[] =>
  listBatchesStmt.all() as BacktestBatchRow[];

export const listActiveBacktestBatchRows = (): BacktestBatchRow[] =>
  listActiveBatchesStmt.all() as BacktestBatchRow[];

export const hasActiveBacktestBatchRows = (): boolean =>
  Boolean(hasActiveBatchesStmt.get());

export const getBacktestBatchRow = (batchId: string): BacktestBatchRow | null =>
  (getBatchStmt.get(batchId) as BacktestBatchRow | undefined) ?? null;

const runBacktestBatchUpdate = (row: BacktestBatchUpdateRow): void => {
  updateBatchStmt.run(
    row.status,
    row.progressJson,
    row.summaryJson,
    row.errorCode,
    row.errorMessage,
    row.updatedAt,
    row.startedAt,
    row.finishedAt,
    row.id,
  );
};

export const updateBacktestBatchRow = (row: BacktestBatchUpdateRow): void => {
  runBacktestBatchUpdate(row);
};

export const recoverInterruptedBacktestBatchRows = (
  rows: readonly BacktestBatchUpdateRow[],
): void => {
  if (!rows.length) {
    return;
  }
  const tx = db.transaction(() => {
    for (const row of rows) {
      deleteRunDataStmt.run(row.id);
      runBacktestBatchUpdate(row);
    }
  });
  tx();
};

const finalizeTerminalBacktestBatchRow = (
  row: BacktestBatchUpdateRow,
): void => {
  const tx = db.transaction(() => {
    deleteRunDataStmt.run(row.id);
    runBacktestBatchUpdate(row);
  });
  tx();
};

export const finalizeCancelledBacktestBatchRow = finalizeTerminalBacktestBatchRow;
export const finalizeFailedBacktestBatchRow = finalizeTerminalBacktestBatchRow;

export const deleteBacktestBatchRow = (batchId: string): boolean =>
  deleteBatchStmt.run(batchId).changes > 0;

export const deleteAllBacktestBatchRows = (): string[] => {
  const tx = db.transaction(() => {
    const batchIds = (listAllBatchIdsStmt.all() as BacktestBatchIdRow[])
      .map((row) => row.id);
    deleteAllBatchesStmt.run();
    return batchIds;
  });
  return tx();
};

export const clearBacktestRunRows = (batchId: string): void => {
  deleteRunDataStmt.run(batchId);
};

const insertResultRows = (rows: readonly BacktestResultInsertRow[]): void => {
  for (const result of rows) {
    insertResultStmt.run(
      result.id,
      result.batchId,
      result.instrument_id,
      result.symbol,
      result.timeframe,
      result.bars_count,
      result.final_equity,
      result.total_pnl,
      result.profit_rate,
      result.max_drawdown,
      result.win_rate,
      result.trade_count,
      result.conflict_count,
      result.summaryJson,
      result.createdAt,
      result.updatedAt,
    );
  }
};

const insertFillRows = (rows: readonly BacktestFillInsertRow[]): void => {
  for (const fill of rows) {
    insertFillStmt.run(
      fill.id,
      fill.batchId,
      fill.resultId,
      fill.instrument_id,
      fill.symbol,
      fill.order_id,
      fill.fill_index,
      fill.fill_time,
      fill.side,
      fill.price,
      fill.qty,
      fill.gross,
      fill.fee,
      fill.tax,
      fill.slippage,
      fill.createdAt,
    );
  }
};

const insertEquityRows = (rows: readonly BacktestEquityPointInsertRow[]): void => {
  for (const point of rows) {
    insertEquityPointStmt.run(
      point.id,
      point.batchId,
      point.resultId,
      point.instrument_id,
      point.symbol,
      point.bar_index,
      point.bar_time,
      point.equity,
      point.drawdown,
    );
  }
};

export const appendBacktestRunResultsChunk = (options: {
  results: readonly BacktestResultInsertRow[];
  fills: readonly BacktestFillInsertRow[];
  equityCurve: readonly BacktestEquityPointInsertRow[];
}): void => {
  if (!options.results.length && !options.fills.length && !options.equityCurve.length) {
    return;
  }
  const tx = db.transaction(() => {
    insertResultRows(options.results);
    for (let offset = 0; offset < options.fills.length; offset += BACKTEST_INSERT_CHUNK_SIZE) {
      insertFillRows(options.fills.slice(offset, offset + BACKTEST_INSERT_CHUNK_SIZE));
    }
    for (let offset = 0; offset < options.equityCurve.length; offset += BACKTEST_INSERT_CHUNK_SIZE) {
      insertEquityRows(options.equityCurve.slice(offset, offset + BACKTEST_INSERT_CHUNK_SIZE));
    }
  });
  tx();
};

export const replaceBacktestRunRows = (options: {
  batch: BacktestBatchUpdateRow;
  results: readonly BacktestResultInsertRow[];
  fills: readonly BacktestFillInsertRow[];
  equityCurve: readonly BacktestEquityPointInsertRow[];
}): void => {
  const tx = db.transaction(() => {
    deleteRunDataStmt.run(options.batch.id);
    insertResultRows(options.results);
    insertFillRows(options.fills);
    insertEquityRows(options.equityCurve);
    updateBacktestBatchRow(options.batch);
  });
  tx();
};

export const listBacktestResultRows = (batchId: string): BacktestResultListRow[] =>
  listResultsStmt.all(batchId) as BacktestResultListRow[];

export const getBacktestResultRowBySymbol = (
  batchId: string,
  symbol: string,
): BacktestResultRow | null =>
  (getResultBySymbolStmt.get(batchId, symbol) as BacktestResultRow | undefined) ?? null;

export const listBacktestFillRows = (resultId: string): BacktestFillRow[] =>
  listFillsStmt.all(resultId) as BacktestFillRow[];

export const listBacktestEquityPointRows = (resultId: string): BacktestEquityPointRow[] =>
  listEquityCurveStmt.all(resultId) as BacktestEquityPointRow[];

export const listBacktestInstrumentRowsByIds = (
  instrumentIds: readonly string[],
): BacktestInstrumentRow[] =>
  listInstrumentByIdsStmt.all(JSON.stringify(instrumentIds)) as BacktestInstrumentRow[];

export const listBacktestInstrumentRowsBySourceIds = (
  sourceIds: readonly string[],
): BacktestInstrumentRow[] =>
  listInstrumentBySourceIdsStmt.all(JSON.stringify(sourceIds)) as BacktestInstrumentRow[];

export const listSystemBacktestInstrumentRows = (): BacktestInstrumentRow[] =>
  listSystemInstrumentsStmt.all() as BacktestInstrumentRow[];
