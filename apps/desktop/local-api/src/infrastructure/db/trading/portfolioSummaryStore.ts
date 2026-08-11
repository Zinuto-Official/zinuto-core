// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';

type CreatePortfolioSummaryStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
};

export type PortfolioPositionRow = {
  sessionId: string;
  instrumentId: string;
  symbol: string;
  qty: number;
  avgCost: number;
  realizedPnl: number;
  entryIndex: number;
  cursorIndex: number;
  tradingSettingsJson: string | null;
};

export const createPortfolioSummaryStore = ({
  db,
}: CreatePortfolioSummaryStoreDeps) => {
  const listPortfolioPositionRowsStmt = db.prepare(
    `SELECT p.session_id AS sessionId,
            p.instrument_id AS instrumentId,
            i.symbol AS symbol,
            p.qty AS qty,
            p.avg_cost AS avgCost,
            p.realized_pnl AS realizedPnl,
            s.entry_index AS entryIndex,
            s.cursor_index AS cursorIndex,
            s.trading_settings_json AS tradingSettingsJson
       FROM positions p
       JOIN replay_sessions s ON s.id = p.session_id
       JOIN instruments i ON i.id = p.instrument_id
      WHERE s.session_scope = 'OFFICIAL'
        AND (ABS(p.qty) > 0.000001 OR ABS(p.realized_pnl) > 0.000001)
      ORDER BY i.symbol ASC`,
  );

  const listPortfolioPositionRows = (): PortfolioPositionRow[] =>
    listPortfolioPositionRowsStmt.all() as PortfolioPositionRow[];

  return {
    listPortfolioPositionRows,
  };
};
