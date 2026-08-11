// SPDX-License-Identifier: GPL-3.0-only

import type {
  BacktestResultListRow,
} from '../ports/infrastructure/db/backtest/backtestStore.js';
import type { BacktestResultListItem } from './types.js';

export const toBacktestResultListItem = (
  row: BacktestResultListRow,
): BacktestResultListItem => ({
  id: row.id,
  batchId: row.batch_id,
  instrumentId: row.instrument_id,
  symbol: row.symbol,
  timeframe: row.timeframe,
  barsCount: row.bars_count,
  finalEquity: row.final_equity,
  totalPnl: row.total_pnl,
  profitRate: row.profit_rate,
  maxDrawdown: row.max_drawdown,
  winRate: row.win_rate,
  tradeCount: row.trade_count,
  conflictCount: row.conflict_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
