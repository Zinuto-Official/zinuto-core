// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type {
  AccountRow,
  SessionRow,
  TradingExecutionSettings,
  TradingSettings,
} from '../../../domain/trading/types.js';

type CreateSessionCashStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
  round: (value: number, digits?: number) => number;
  nowIso: () => string;
  getTradingSettings: () => TradingSettings;
  resolveSessionTradingSettings: (session: SessionRow) => TradingExecutionSettings;
};

export const createSessionCashStore = ({
  db,
  round,
  nowIso,
  getTradingSettings,
  resolveSessionTradingSettings,
}: CreateSessionCashStoreDeps) => {
  const selectSessionCashBalanceStmt = db.prepare(
    `SELECT cash_balance AS cashBalance
       FROM replay_sessions
      WHERE id = ?
      LIMIT 1`,
  );

  const updateSessionCashBalanceStmt = db.prepare(
    `UPDATE replay_sessions
        SET cash_balance = ?, updated_at = ?
      WHERE id = ?`,
  );

  const resolveSessionInitialCashBalance = (session: SessionRow): number => {
    const sessionSettings = resolveSessionTradingSettings(session);
    const configured = Number(sessionSettings.initialSecuritiesBalance);
    if (Number.isFinite(configured) && configured > 0) {
      return Math.max(0, Math.trunc(configured));
    }
    const fallback = Number(getTradingSettings().initialSecuritiesBalance);
    if (Number.isFinite(fallback) && fallback > 0) {
      return Math.max(0, Math.trunc(fallback));
    }
    return 0;
  };

  const getSessionCashBalance = (session: SessionRow): number => {
    const row = selectSessionCashBalanceStmt.get(session.id) as
      | { cashBalance?: unknown }
      | undefined;
    const rawBalance = row?.cashBalance;
    const storedBalance =
      rawBalance === null || rawBalance === undefined ? NaN : Number(rawBalance);
    if (Number.isFinite(storedBalance)) {
      return round(storedBalance, 6);
    }
    const fallbackBalance = round(resolveSessionInitialCashBalance(session), 6);
    updateSessionCashBalanceStmt.run(fallbackBalance, nowIso(), session.id);
    return fallbackBalance;
  };

  const setSessionCashBalance = (
    sessionId: string,
    value: number,
    updatedAt = nowIso(),
  ): void => {
    updateSessionCashBalanceStmt.run(round(value, 6), updatedAt, sessionId);
  };

  const listSessionAccounts = (
    session: SessionRow,
    cashBalance = getSessionCashBalance(session),
  ): AccountRow[] => [
    {
      id: 'SECURITIES',
      user_id: session.user_id,
      kind: 'SECURITIES',
      balance: cashBalance,
      currency: 'CNY',
    },
  ];

  return {
    getSessionCashBalance,
    listSessionAccounts,
    resolveSessionInitialCashBalance,
    setSessionCashBalance,
  };
};
