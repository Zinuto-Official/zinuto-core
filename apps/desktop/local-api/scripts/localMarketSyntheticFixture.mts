// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_TRADING_CALENDAR_CONFIG,
  serializeTradingCalendarConfig,
} from '@zinuto/shared/tradingCalendar';
import { createSystemDataSourceDiagnosticProfile } from '../src/application/dataSource/diagnosticProfile.js';

type SqliteStatement = {
  run: (...args: unknown[]) => unknown;
};

type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement;
};

type LocalBaseTimeframe = '1m' | '5m' | '1h' | '1d';

type EnsureSyntheticLocalMarketFixtureInput = {
  db: SqliteDatabase;
  sourceId: string;
  sourceName: string;
  instrumentId: string;
  symbol: string;
  baseTimeframe: LocalBaseTimeframe;
  timeZone: string;
  minTradeStep: number;
  barCount: number;
  timeStartTs: string;
  timeEndTs: string;
  barsVersionToken: string;
  createdAt: string;
};

export const ensureSyntheticLocalMarketFixture = ({
  db,
  sourceId,
  sourceName,
  instrumentId,
  symbol,
  baseTimeframe,
  timeZone,
  minTradeStep,
  barCount,
  timeStartTs,
  timeEndTs,
  barsVersionToken,
  createdAt,
}: EnsureSyntheticLocalMarketFixtureInput): void => {
  const diagnosticProfile = createSystemDataSourceDiagnosticProfile(sourceId);
  const tradingCalendarJson = serializeTradingCalendarConfig(
    DEFAULT_TRADING_CALENDAR_CONFIG,
  );

  db.prepare(
    `INSERT INTO local_data_sources (
      id, name, source_folder, source_folder_bookmark_id, import_scope_strategy,
      import_scope_top_level_subfolder, time_zone, time_zone_origin, base_timeframe,
      diagnostic_asset_class, diagnostic_market_preset_id, diagnostic_profile_origin,
      field_mapping_json, trading_calendar_json, status,
      total_files, imported_files, failed_files, symbol_count, bar_count, storage_bytes,
      time_start_ts, time_end_ts, last_job_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      time_zone = excluded.time_zone,
      time_zone_origin = excluded.time_zone_origin,
      base_timeframe = excluded.base_timeframe,
      diagnostic_asset_class = excluded.diagnostic_asset_class,
      diagnostic_market_preset_id = excluded.diagnostic_market_preset_id,
      diagnostic_profile_origin = excluded.diagnostic_profile_origin,
      field_mapping_json = excluded.field_mapping_json,
      trading_calendar_json = excluded.trading_calendar_json,
      status = excluded.status,
      symbol_count = excluded.symbol_count,
      bar_count = excluded.bar_count,
      time_start_ts = excluded.time_start_ts,
      time_end_ts = excluded.time_end_ts,
      updated_at = excluded.updated_at`,
  ).run(
    sourceId,
    sourceName,
    '',
    '',
    null,
    '',
    timeZone,
    'USER_SELECTED',
    baseTimeframe,
    diagnosticProfile.assetClass,
    diagnosticProfile.marketPresetId,
    diagnosticProfile.profileOrigin,
    '{}',
    tradingCalendarJson,
    'READY',
    0,
    0,
    0,
    1,
    barCount,
    0,
    timeStartTs,
    timeEndTs,
    null,
    createdAt,
    createdAt,
  );

  db.prepare(
    `INSERT INTO instruments (
      id, source_id, symbol, base_timeframe, name, market, time_zone, min_trade_step,
      bar_count, time_start_ts, time_end_ts, bars_version_token, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      symbol = excluded.symbol,
      base_timeframe = excluded.base_timeframe,
      name = excluded.name,
      market = excluded.market,
      time_zone = excluded.time_zone,
      min_trade_step = excluded.min_trade_step,
      bar_count = excluded.bar_count,
      time_start_ts = excluded.time_start_ts,
      time_end_ts = excluded.time_end_ts,
      bars_version_token = excluded.bars_version_token`,
  ).run(
    instrumentId,
    sourceId,
    symbol,
    baseTimeframe,
    sourceName,
    'LOCAL',
    timeZone,
    minTradeStep,
    barCount,
    timeStartTs,
    timeEndTs,
    barsVersionToken,
    createdAt,
  );
};
