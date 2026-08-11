// SPDX-License-Identifier: GPL-3.0-only

import { db, DEFAULT_USER_ID } from '../database.js';
import type {
  PortableSettingsBundleRows,
  PortableSourceManifestUpsertRow,
  PortableUserAppPreferencesUpsertRow,
  PortableUserSettingsUpsertRow,
} from '../../../domain/portableDataRepositoryTypes.js';

export const loadPortableSettingsBundleRows = (): PortableSettingsBundleRows => {
  const userSettings =
    (db
      .prepare('SELECT * FROM user_settings WHERE user_id = ? LIMIT 1')
      .get(DEFAULT_USER_ID) as Record<string, unknown> | undefined) ?? null;
  const userAppPreferences =
    (db
      .prepare('SELECT * FROM user_app_preferences WHERE user_id = ? LIMIT 1')
      .get(DEFAULT_USER_ID) as Record<string, unknown> | undefined) ?? null;
  return {
    userSettings,
    userAppPreferences,
  };
};

export const getPortableSourceManifestBySourceId = (
  sourceId: string,
): Record<string, unknown> | null => {
  const row = db
    .prepare('SELECT * FROM portable_source_manifests WHERE source_id = ? LIMIT 1')
    .get(sourceId) as Record<string, unknown> | undefined;
  return row ?? null;
};

export const upsertPortableSourceManifestRow = (
  row: PortableSourceManifestUpsertRow,
): void => {
  db.prepare(
    `INSERT INTO portable_source_manifests (
      id,source_id,source_name,base_timeframe,time_zone,symbol_count,bar_count,time_start_ts,time_end_ts,fingerprint_hash,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(source_id) DO UPDATE SET
      source_name = excluded.source_name,
      base_timeframe = excluded.base_timeframe,
      time_zone = excluded.time_zone,
      symbol_count = excluded.symbol_count,
      bar_count = excluded.bar_count,
      time_start_ts = excluded.time_start_ts,
      time_end_ts = excluded.time_end_ts,
      fingerprint_hash = excluded.fingerprint_hash,
      updated_at = excluded.updated_at`,
  ).run(
    row.id,
    row.sourceId,
    row.sourceName,
    row.baseTimeframe,
    row.timeZone,
    row.symbolCount,
    row.barCount,
    row.timeStartTs,
    row.timeEndTs,
    row.fingerprintHash,
    row.createdAt,
    row.updatedAt,
  );
};

export const upsertPortableUserSettingsRow = (
  row: PortableUserSettingsUpsertRow,
): void => {
  db.prepare(
    `INSERT INTO user_settings (
      user_id,initial_securities_balance,initial_bank_balance,asset_class,market_preset_id,min_trade_step,
      commission_rate,maker_fee_rate,taker_fee_rate,funding_rate,contract_multiplier,transfer_fee_rate,regulatory_fee_rate,platform_fee_rate,
      transaction_levy_rate,slippage_rate,stamp_duty_rate,commission_minimum_fee,platform_fee_minimum_fee,transaction_levy_minimum_fee,
      long_financing_annual_rate,long_initial_margin_ratio,long_maintenance_margin_ratio,short_borrow_annual_rate,short_initial_margin_ratio,
      short_maintenance_margin_ratio,stamp_duty_mode,stamp_duty_single_side,position_cost_mode,trade_settlement_mode,free_replay_end_settlement_mode,
      trade_amount_includes_fees,allow_long_margin_trading,allow_short_selling,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      initial_securities_balance = excluded.initial_securities_balance,
      initial_bank_balance = excluded.initial_bank_balance,
      asset_class = excluded.asset_class,
      market_preset_id = excluded.market_preset_id,
      min_trade_step = excluded.min_trade_step,
      commission_rate = excluded.commission_rate,
      maker_fee_rate = excluded.maker_fee_rate,
      taker_fee_rate = excluded.taker_fee_rate,
      funding_rate = excluded.funding_rate,
      contract_multiplier = excluded.contract_multiplier,
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
  ).run(
    DEFAULT_USER_ID,
    row.initialSecuritiesBalance,
    row.initialBankBalance,
    row.assetClass,
    row.marketPresetId,
    row.minTradeStep,
    row.commissionRate,
    row.makerFeeRate,
    row.takerFeeRate,
    row.fundingRate,
    row.contractMultiplier,
    row.transferFeeRate,
    row.regulatoryFeeRate,
    row.platformFeeRate,
    row.transactionLevyRate,
    row.slippageRate,
    row.stampDutyRate,
    row.commissionMinimumFee,
    row.platformFeeMinimumFee,
    row.transactionLevyMinimumFee,
    row.longFinancingAnnualRate,
    row.longInitialMarginRatio,
    row.longMaintenanceMarginRatio,
    row.shortBorrowAnnualRate,
    row.shortInitialMarginRatio,
    row.shortMaintenanceMarginRatio,
    row.stampDutyMode,
    row.stampDutySingleSide,
    row.positionCostMode,
    row.tradeSettlementMode,
    row.freeReplayEndSettlementMode,
    row.tradeAmountIncludesFees,
    row.allowLongMarginTrading,
    row.allowShortSelling,
    row.updatedAt,
  );
};

export const upsertPortableUserAppPreferencesRow = (
  row: PortableUserAppPreferencesUpsertRow,
): void => {
  db.prepare(
    `INSERT INTO user_app_preferences (
      user_id,ui_settings_json,data_pool_removed_symbols_json,updated_at
    ) VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      ui_settings_json = excluded.ui_settings_json,
      data_pool_removed_symbols_json = excluded.data_pool_removed_symbols_json,
      updated_at = excluded.updated_at`,
  ).run(
    DEFAULT_USER_ID,
    row.uiSettingsJson,
    row.dataPoolRemovedSymbolsJson,
    row.updatedAt,
  );
};
