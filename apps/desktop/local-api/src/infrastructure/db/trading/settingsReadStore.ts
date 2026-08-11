// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { Side } from '../../../domain/models.js';
import type { AccountRow } from '../../../domain/trading/types.js';

export type UserSettingsRow = {
  user_id: string;
  initial_securities_balance: number;
  asset_class: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  market_preset_id: string;
  min_trade_step: number;
  commission_rate: number;
  maker_fee_rate: number;
  taker_fee_rate: number;
  funding_rate: number;
  contract_multiplier: number;
  transfer_fee_rate: number;
  regulatory_fee_rate: number;
  platform_fee_rate: number;
  transaction_levy_rate: number;
  slippage_rate: number;
  stamp_duty_rate: number;
  commission_minimum_fee: number;
  platform_fee_minimum_fee: number;
  transaction_levy_minimum_fee: number;
  long_financing_annual_rate: number;
  long_initial_margin_ratio: number;
  long_maintenance_margin_ratio: number;
  short_borrow_annual_rate: number;
  short_initial_margin_ratio: number;
  short_maintenance_margin_ratio: number;
  stamp_duty_mode: 'SINGLE' | 'DOUBLE';
  stamp_duty_single_side: 'BUY' | 'SELL';
  position_cost_mode: 'DILUTED' | 'AVERAGE_OPEN';
  trade_settlement_mode: 'T0' | 'T1';
  free_replay_end_settlement_mode: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
  trade_amount_includes_fees: 0 | 1;
  allow_long_margin_trading: 0 | 1;
  allow_short_selling: 0 | 1;
  updated_at: string;
};

export type OfficialFillReplayRow = {
  side: Side;
  fill_price: number;
  fill_qty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
};

export type TradingInstrumentListRow = {
  id: string;
  symbol: string;
  baseTimeframe: string;
  name: string | null;
  bar_count: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  barsVersionToken: string | null;
  timeZone: string | null;
  minTradeStep: number | null;
  marketPresetId: string | null;
  market: string | null;
  sourceId: string | null;
  sourceName: string | null;
};

type CreateTradingSettingsReadStoreDeps = {
  db: Pick<Database.Database, 'prepare' | 'transaction'>;
};

const bindUserSettings = (row: UserSettingsRow): unknown[] => [
  row.user_id,
  row.initial_securities_balance,
  row.asset_class,
  row.market_preset_id,
  row.min_trade_step,
  row.maker_fee_rate,
  row.taker_fee_rate,
  row.funding_rate,
  row.contract_multiplier,
  row.commission_rate,
  row.transfer_fee_rate,
  row.regulatory_fee_rate,
  row.platform_fee_rate,
  row.transaction_levy_rate,
  row.slippage_rate,
  row.stamp_duty_rate,
  row.commission_minimum_fee,
  row.platform_fee_minimum_fee,
  row.transaction_levy_minimum_fee,
  row.long_financing_annual_rate,
  row.long_initial_margin_ratio,
  row.long_maintenance_margin_ratio,
  row.short_borrow_annual_rate,
  row.short_initial_margin_ratio,
  row.short_maintenance_margin_ratio,
  row.stamp_duty_mode,
  row.stamp_duty_single_side,
  row.position_cost_mode,
  row.trade_settlement_mode,
  row.free_replay_end_settlement_mode,
  row.trade_amount_includes_fees,
  row.allow_long_margin_trading,
  row.allow_short_selling,
  row.updated_at,
];

export const createTradingSettingsReadStore = ({
  db,
}: CreateTradingSettingsReadStoreDeps) => {
  const getUserSettingsStmt = db.prepare(
    `SELECT user_id,initial_securities_balance,
            asset_class,market_preset_id,min_trade_step,
            maker_fee_rate,taker_fee_rate,funding_rate,contract_multiplier,
            commission_rate,transfer_fee_rate,regulatory_fee_rate,platform_fee_rate,transaction_levy_rate,slippage_rate,stamp_duty_rate,
            commission_minimum_fee,platform_fee_minimum_fee,transaction_levy_minimum_fee,
            long_financing_annual_rate,long_initial_margin_ratio,long_maintenance_margin_ratio,
            short_borrow_annual_rate,short_initial_margin_ratio,short_maintenance_margin_ratio,
            stamp_duty_mode,stamp_duty_single_side,position_cost_mode,trade_settlement_mode,free_replay_end_settlement_mode,trade_amount_includes_fees,allow_long_margin_trading,allow_short_selling,updated_at
       FROM user_settings
      WHERE user_id = ?`,
  );

  const insertUserSettingsStmt = db.prepare(
    `INSERT INTO user_settings (
      user_id,initial_securities_balance,
      asset_class,market_preset_id,min_trade_step,
      maker_fee_rate,taker_fee_rate,funding_rate,contract_multiplier,
      commission_rate,transfer_fee_rate,regulatory_fee_rate,platform_fee_rate,transaction_levy_rate,slippage_rate,stamp_duty_rate,
      commission_minimum_fee,platform_fee_minimum_fee,transaction_levy_minimum_fee,
      long_financing_annual_rate,long_initial_margin_ratio,long_maintenance_margin_ratio,
      short_borrow_annual_rate,short_initial_margin_ratio,short_maintenance_margin_ratio,
      stamp_duty_mode,stamp_duty_single_side,position_cost_mode,trade_settlement_mode,free_replay_end_settlement_mode,trade_amount_includes_fees,allow_long_margin_trading,allow_short_selling,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  const upsertUserSettingsStmt = db.prepare(
    `INSERT INTO user_settings (
      user_id,initial_securities_balance,
      asset_class,market_preset_id,min_trade_step,
      maker_fee_rate,taker_fee_rate,funding_rate,contract_multiplier,
      commission_rate,transfer_fee_rate,regulatory_fee_rate,platform_fee_rate,transaction_levy_rate,slippage_rate,stamp_duty_rate,
      commission_minimum_fee,platform_fee_minimum_fee,transaction_levy_minimum_fee,
      long_financing_annual_rate,long_initial_margin_ratio,long_maintenance_margin_ratio,
      short_borrow_annual_rate,short_initial_margin_ratio,short_maintenance_margin_ratio,
      stamp_duty_mode,stamp_duty_single_side,position_cost_mode,trade_settlement_mode,free_replay_end_settlement_mode,trade_amount_includes_fees,allow_long_margin_trading,allow_short_selling,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET
       initial_securities_balance = excluded.initial_securities_balance,
       asset_class = excluded.asset_class,
       market_preset_id = excluded.market_preset_id,
       min_trade_step = excluded.min_trade_step,
       maker_fee_rate = excluded.maker_fee_rate,
       taker_fee_rate = excluded.taker_fee_rate,
       funding_rate = excluded.funding_rate,
       contract_multiplier = excluded.contract_multiplier,
       commission_rate = excluded.commission_rate,
       transfer_fee_rate = excluded.transfer_fee_rate,
       regulatory_fee_rate = excluded.regulatory_fee_rate,
       platform_fee_rate = excluded.platform_fee_rate,
       transaction_levy_rate = excluded.transaction_levy_rate,
       slippage_rate = excluded.slippage_rate,
       stamp_duty_rate = excluded.stamp_duty_rate,
       commission_minimum_fee = excluded.commission_minimum_fee,
       platform_fee_minimum_fee = excluded.platform_fee_minimum_fee,
       transaction_levy_minimum_fee = excluded.transaction_levy_minimum_fee,
       long_financing_annual_rate = excluded.long_financing_annual_rate,
       long_initial_margin_ratio = excluded.long_initial_margin_ratio,
       long_maintenance_margin_ratio = excluded.long_maintenance_margin_ratio,
       short_borrow_annual_rate = excluded.short_borrow_annual_rate,
       short_initial_margin_ratio = excluded.short_initial_margin_ratio,
       short_maintenance_margin_ratio = excluded.short_maintenance_margin_ratio,
       stamp_duty_mode = excluded.stamp_duty_mode,
       stamp_duty_single_side = excluded.stamp_duty_single_side,
       position_cost_mode = excluded.position_cost_mode,
       trade_settlement_mode = excluded.trade_settlement_mode,
       free_replay_end_settlement_mode = excluded.free_replay_end_settlement_mode,
       trade_amount_includes_fees = excluded.trade_amount_includes_fees,
       allow_long_margin_trading = excluded.allow_long_margin_trading,
       allow_short_selling = excluded.allow_short_selling,
       updated_at = excluded.updated_at`,
  );

  const getLiveFillCountStmt = db.prepare(
    `SELECT COUNT(*) AS count
       FROM sim_fills f
       JOIN replay_sessions s ON s.id = f.session_id
      WHERE s.session_scope = 'OFFICIAL'`,
  );

  const listOfficialFillsStmt = db.prepare(
    `SELECT side, fill_price, fill_qty, contract_multiplier AS contractMultiplier, fee, tax, slippage
       FROM sim_fills f
       JOIN replay_sessions s ON s.id = f.session_id
      WHERE s.session_scope = 'OFFICIAL'
      ORDER BY f.created_at ASC`,
  );

  const sumShortBorrowAccrualsStmt = db.prepare(
    `SELECT COALESCE(SUM(c.amount), 0) AS amount
       FROM sim_accrual_events c
       JOIN replay_sessions s ON s.id = c.session_id
      WHERE s.session_scope = 'OFFICIAL'
        AND c.kind = 'SHORT_BORROW'`,
  );

  const sumLongFinancingAccrualsStmt = db.prepare(
    `SELECT COALESCE(SUM(c.amount), 0) AS amount
       FROM sim_accrual_events c
       JOIN replay_sessions s ON s.id = c.session_id
      WHERE s.session_scope = 'OFFICIAL'
        AND c.kind IN ('LONG_FINANCING','FUNDING')`,
  );

  const listSecuritiesAccountsStmt = db.prepare(
    "SELECT id,user_id,kind,balance,currency FROM accounts WHERE user_id = ? AND kind = 'SECURITIES' ORDER BY kind ASC",
  );

  const getUserSettings = (userId: string): UserSettingsRow | undefined =>
    getUserSettingsStmt.get(userId) as UserSettingsRow | undefined;

  const insertUserSettings = (row: UserSettingsRow): void => {
    insertUserSettingsStmt.run(...bindUserSettings(row));
  };

  const upsertUserSettings = (row: UserSettingsRow): void => {
    upsertUserSettingsStmt.run(...bindUserSettings(row));
  };

  const getLiveFillCount = (): number => {
    const row = getLiveFillCountStmt.get() as { count?: unknown } | undefined;
    return Math.max(0, Math.floor(Number(row?.count) || 0));
  };

  const listOfficialFills = (): OfficialFillReplayRow[] =>
    listOfficialFillsStmt.all() as OfficialFillReplayRow[];

  const getShortBorrowAccrualTotal = (): number =>
    Number(sumShortBorrowAccrualsStmt.pluck().get() ?? 0);

  const getLongFinancingAccrualTotal = (): number =>
    Number(sumLongFinancingAccrualsStmt.pluck().get() ?? 0);

  const listInstrumentRows = ({
    keyword,
    sourceId,
    baseTimeframe,
    minimumBarCount,
    offset,
    limit,
  }: {
    keyword: string;
    sourceId: string;
    baseTimeframe?: string;
    minimumBarCount?: number;
    offset: number;
    limit: number | null;
  }): TradingInstrumentListRow[] => {
    const whereClauses = [
      `(i.market = 'SYSTEM'
         OR (i.market = 'LOCAL' AND i.source_id IS NOT NULL AND src.status = 'READY'))`,
    ];
    const params: unknown[] = [];
    if (keyword) {
      whereClauses.push(`(
        UPPER(i.symbol) LIKE ?
        OR UPPER(COALESCE(i.name, '')) LIKE ?
        OR UPPER(COALESCE(src.name, '')) LIKE ?
      )`);
      const likeKeyword = `%${keyword}%`;
      params.push(likeKeyword, likeKeyword, likeKeyword);
    }
    if (sourceId) {
      whereClauses.push(`i.source_id = ?`);
      params.push(sourceId);
    }
    if (baseTimeframe) {
      whereClauses.push(`i.base_timeframe = ?`);
      params.push(baseTimeframe);
    }
    if (Number.isFinite(Number(minimumBarCount))) {
      whereClauses.push(`COALESCE(i.bar_count, 0) >= ?`);
      params.push(Math.max(0, Math.floor(Number(minimumBarCount))));
    }
    if (limit !== null) {
      params.push(limit, offset);
    }
    return db
      .prepare(
        `SELECT i.id,
                i.symbol,
                i.base_timeframe AS baseTimeframe,
                i.name,
                i.bar_count,
                i.time_start_ts AS timeStartTs,
                i.time_end_ts AS timeEndTs,
                i.bars_version_token AS barsVersionToken,
                i.time_zone AS timeZone,
                i.min_trade_step AS minTradeStep,
                '' AS marketPresetId,
                i.market,
                i.source_id AS sourceId,
                src.name AS sourceName
           FROM instruments i
           LEFT JOIN local_data_sources src ON src.id = i.source_id
          WHERE ${whereClauses.join(' AND ')}
          ORDER BY i.symbol ASC, i.base_timeframe ASC, COALESCE(src.name, '') ASC
          ${limit !== null ? 'LIMIT ? OFFSET ?' : ''}`,
      )
      .all(...params) as TradingInstrumentListRow[];
  };

  const listSecuritiesAccounts = (userId: string): AccountRow[] =>
    listSecuritiesAccountsStmt.all(userId) as AccountRow[];

  const runInTransaction = <T>(callback: () => T): T =>
    db.transaction(callback)();

  return {
    getUserSettings,
    insertUserSettings,
    upsertUserSettings,
    getLiveFillCount,
    listOfficialFills,
    getShortBorrowAccrualTotal,
    getLongFinancingAccrualTotal,
    listInstrumentRows,
    listSecuritiesAccounts,
    runInTransaction,
  };
};
