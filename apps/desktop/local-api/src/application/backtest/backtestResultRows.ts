// SPDX-License-Identifier: GPL-3.0-only

import { createId } from '../../kernel/id.js';
import {
  type BacktestEquityPointInsertRow,
  type BacktestFillInsertRow,
  type BacktestResultInsertRow,
} from '../ports/infrastructure/db/backtest/backtestStore.js';
import type {
  BacktestInstrumentRunResult,
} from './types.js';

const jsonStringify = (value: unknown): string => JSON.stringify(value ?? {});

export const resolveBacktestResultEngine = (result: BacktestInstrumentRunResult): string => {
  const engine = result.result.summary.engine;
  return typeof engine === 'string' && engine.trim()
    ? engine.trim()
    : 'TS_REFERENCE';
};

export const buildInsertRowsForBacktestResult = (
  batchId: string,
  item: BacktestInstrumentRunResult,
  timestamp: string,
): {
  results: BacktestResultInsertRow[];
  fills: BacktestFillInsertRow[];
  equityCurve: BacktestEquityPointInsertRow[];
} => {
  const resultId = createId();
  const results: BacktestResultInsertRow[] = [{
    id: resultId,
    batchId,
    instrument_id: item.instrument.instrumentId,
    symbol: item.instrument.symbol,
    timeframe: item.instrument.baseTimeframe,
    bars_count: item.result.barsCount,
    final_equity: item.result.finalEquity,
    total_pnl: item.result.totalPnl,
    profit_rate: item.result.profitRate,
    max_drawdown: item.result.maxDrawdown,
    win_rate: item.result.winRate,
    trade_count: item.result.tradeCount,
    conflict_count: item.result.conflictCount,
    summaryJson: jsonStringify({
      ...item.result.summary,
      engine: resolveBacktestResultEngine(item),
      conflicts: item.conflicts.slice(0, 200),
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
  const fills = item.fills.map((fill) => ({
    id: createId(),
    batchId,
    resultId,
    instrument_id: fill.instrumentId,
    symbol: fill.symbol,
    order_id: fill.orderId,
    fill_index: fill.fillIndex,
    fill_time: fill.fillTime,
    side: fill.side,
    price: fill.price,
    qty: fill.qty,
    gross: fill.gross,
    fee: fill.fee,
    tax: fill.tax,
    slippage: fill.slippage,
    createdAt: timestamp,
  }));
  const equityCurve = item.equityCurve.map((point) => ({
    id: createId(),
    batchId,
    resultId,
    instrument_id: point.instrumentId,
    symbol: point.symbol,
    bar_index: point.barIndex,
    bar_time: point.barTime,
    equity: point.equity,
    drawdown: point.drawdown,
  }));
  return { results, fills, equityCurve };
};
