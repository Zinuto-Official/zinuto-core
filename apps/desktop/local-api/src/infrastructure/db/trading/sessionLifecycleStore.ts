// SPDX-License-Identifier: GPL-3.0-only

import type Database from 'better-sqlite3';
import type { SessionRow } from '../../../domain/trading/types.js';

type CreateSessionLifecycleStoreDeps = {
  db: Pick<Database.Database, 'prepare'>;
};

type FindReusableSessionInput = {
  userId: string;
  instrumentId: string;
  timeframe: string;
  minimumBaseTimeframe: string;
  samplePoolId: string;
  sessionScope: ReplaySessionScope;
};

type ReplaySessionScope = 'OFFICIAL' | 'SIMULATION_ONLY';

type UpdateAccessGrantInput = {
  sessionId: string;
  tradingSettingsJson: string;
  accessGrantJson: string;
  updatedAt: string;
};

export const createSessionLifecycleStore = ({
  db,
}: CreateSessionLifecycleStoreDeps) => {
  const touchSessionStmt = db.prepare(
    `UPDATE replay_sessions
        SET updated_at = ?
      WHERE id = ?`,
  );

  const updateSessionAccessGrantStmt = db.prepare(
    `UPDATE replay_sessions
        SET trading_settings_json = ?, access_grant_json = ?, updated_at = ?
      WHERE id = ?`,
  );

  const selectLatestReusableSessionStmt = db.prepare(
    `SELECT id,user_id,instrument_id,sample_pool_id,trading_settings_json,access_grant_json,timeframe,minimum_base_timeframe,start_index,entry_index,history_bars,cursor_index,autoplay_interval_ms,is_paused,session_scope,created_at,updated_at
       FROM replay_sessions
      WHERE user_id = ? AND instrument_id = ? AND timeframe = ? AND minimum_base_timeframe = ? AND sample_pool_id = ? AND session_scope = ?
      ORDER BY created_at DESC
      LIMIT 1`,
  );

  const insertSessionStmt = db.prepare(
    `INSERT INTO replay_sessions (
       id,user_id,instrument_id,sample_pool_id,trading_settings_json,access_grant_json,timeframe,minimum_base_timeframe,start_index,entry_index,history_bars,cursor_index,cash_balance,autoplay_interval_ms,is_paused,session_scope,created_at,updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  const updatePlaybackStmt = db.prepare(
    `UPDATE replay_sessions
       SET autoplay_interval_ms = ?, is_paused = ?, updated_at = ?
     WHERE id = ?`
  );

  const updateTradingSettingsStmt = db.prepare(
    `UPDATE replay_sessions
       SET trading_settings_json = ?, updated_at = ?
     WHERE id = ?`,
  );

  const updateCursorStmt = db.prepare(
    `UPDATE replay_sessions
       SET cursor_index = ?, updated_at = ?
     WHERE id = ?`,
  );

  const touchSession = (sessionId: string, updatedAt: string): void => {
    touchSessionStmt.run(updatedAt, sessionId);
  };

  const updateSessionAccessGrant = ({
    sessionId,
    tradingSettingsJson,
    accessGrantJson,
    updatedAt,
  }: UpdateAccessGrantInput): void => {
    updateSessionAccessGrantStmt.run(
      tradingSettingsJson,
      accessGrantJson,
      updatedAt,
      sessionId,
    );
  };

  const findLatestReusableSession = ({
    userId,
    instrumentId,
    timeframe,
    minimumBaseTimeframe,
    samplePoolId,
    sessionScope,
  }: FindReusableSessionInput): SessionRow | undefined =>
    selectLatestReusableSessionStmt.get(
      userId,
      instrumentId,
      timeframe,
      minimumBaseTimeframe,
      samplePoolId,
      sessionScope,
    ) as SessionRow | undefined;

  const insertSession = (session: SessionRow): void => {
    insertSessionStmt.run(
      session.id,
      session.user_id,
      session.instrument_id,
      session.sample_pool_id,
      session.trading_settings_json,
      session.access_grant_json,
      session.timeframe,
      session.minimum_base_timeframe,
      session.start_index,
      session.entry_index,
      session.history_bars,
      session.cursor_index,
      session.cash_balance,
      session.autoplay_interval_ms,
      session.is_paused,
      session.session_scope,
      session.created_at,
      session.created_at,
    );
  };

  const updatePlayback = (
    sessionId: string,
    intervalMs: number,
    isPaused: boolean,
    updatedAt: string,
  ): void => {
    updatePlaybackStmt.run(
      Math.max(100, intervalMs),
      isPaused ? 1 : 0,
      updatedAt,
      sessionId,
    );
  };

  const updateTradingSettings = (
    sessionId: string,
    settingsJson: string,
    updatedAt: string,
  ): void => {
    updateTradingSettingsStmt.run(settingsJson, updatedAt, sessionId);
  };

  const updateCursor = (
    sessionId: string,
    cursorIndex: number,
    updatedAt: string,
  ): void => {
    updateCursorStmt.run(cursorIndex, updatedAt, sessionId);
  };

  return {
    findLatestReusableSession,
    insertSession,
    touchSession,
    updateCursor,
    updatePlayback,
    updateSessionAccessGrant,
    updateTradingSettings,
  };
};
