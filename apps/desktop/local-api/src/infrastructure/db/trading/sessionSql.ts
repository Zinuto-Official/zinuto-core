// SPDX-License-Identifier: GPL-3.0-only

export const GET_SESSION_BY_ID_SQL = `SELECT s.id,s.user_id,s.instrument_id,s.sample_pool_id,s.trading_settings_json,s.access_grant_json,s.timeframe,s.minimum_base_timeframe,s.start_index,s.entry_index,s.history_bars,s.cursor_index,s.cash_balance,s.autoplay_interval_ms,s.is_paused,s.session_scope,s.created_at,s.updated_at,
              i.time_zone AS timeZone,
              i.symbol AS instrument_symbol,
              i.name AS instrument_name,
              i.source_id AS instrument_source_id,
              i.base_timeframe AS instrument_base_timeframe,
              i.market AS instrument_market,
              i.bar_count AS instrument_bar_count,
              i.bars_version_token AS instrument_bars_version_token
       FROM replay_sessions s
       LEFT JOIN instruments i ON i.id = s.instrument_id
       WHERE s.id = ?`;
