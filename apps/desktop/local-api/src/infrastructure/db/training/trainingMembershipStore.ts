// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

export type InstrumentMembershipTargetRow = {
  id?: unknown;
  sourceId?: unknown;
  symbol?: unknown;
  baseTimeframe?: unknown;
  market?: unknown;
  localSourceId?: unknown;
  localSourceStatus?: unknown;
  localSourceDeletionState?: unknown;
};

export type LocalSourceMembershipRow = {
  id?: unknown;
  status?: unknown;
  deletionState?: unknown;
};

export type ReplaySessionAccessRecordRow = {
  sessionId: string;
  instrumentId: string;
  samplePoolId: string;
  timeframe: string;
  accessGrantJson: string;
  sessionScope: string;
  createdAt: string;
  symbol: string;
  market: string | null;
  instrumentSourceId: string | null;
  instrumentBaseTimeframe: string | null;
  localSourceId: string | null;
  localSourceStatus: string | null;
  localSourceDeletionState: string | null;
};

const getSystemInstrumentBySymbolStmt = db.prepare(
  `SELECT id
     FROM instruments
    WHERE market = 'SYSTEM'
      AND symbol = ?
      AND base_timeframe = ?
    LIMIT 1`,
);

const getInstrumentMembershipTargetByIdStmt = db.prepare(
  `SELECT i.id,
          i.source_id AS sourceId,
          i.symbol,
          i.base_timeframe AS baseTimeframe,
          i.market,
          ds.id AS localSourceId,
          ds.status AS localSourceStatus,
          ds.deletion_state AS localSourceDeletionState
     FROM instruments i
     LEFT JOIN local_data_sources ds ON ds.id = i.source_id
    WHERE i.id = ?
    LIMIT 1`,
);

const getInstrumentMembershipTargetBySourceSymbolStmt = db.prepare(
  `SELECT i.id,
          i.source_id AS sourceId,
          i.symbol,
          i.base_timeframe AS baseTimeframe,
          i.market,
          ds.id AS localSourceId,
          ds.status AS localSourceStatus,
          ds.deletion_state AS localSourceDeletionState
     FROM instruments i
     LEFT JOIN local_data_sources ds ON ds.id = i.source_id
    WHERE i.market = 'LOCAL'
      AND i.source_id = ?
      AND i.symbol = ?
      AND i.base_timeframe = ?
    LIMIT 1`,
);

const getLocalSourceMembershipByIdStmt = db.prepare(
  `SELECT id,
          status,
          deletion_state AS deletionState
     FROM local_data_sources
    WHERE id = ?
    LIMIT 1`,
);

const getReplaySessionAccessRecordStmt = db.prepare(
  `SELECT s.id AS sessionId,
          i.id AS instrumentId,
          s.sample_pool_id AS samplePoolId,
          s.timeframe AS timeframe,
          s.session_scope AS sessionScope,
          s.access_grant_json AS accessGrantJson,
          s.created_at AS createdAt,
          i.symbol AS symbol,
          i.market AS market,
          i.source_id AS instrumentSourceId,
          i.base_timeframe AS instrumentBaseTimeframe,
          ds.id AS localSourceId,
          ds.status AS localSourceStatus,
          ds.deletion_state AS localSourceDeletionState
     FROM replay_sessions s
     JOIN instruments i ON i.id = s.instrument_id
     LEFT JOIN local_data_sources ds ON ds.id = i.source_id
    WHERE s.id = ?
    LIMIT 1`,
);

const updateReplaySessionAccessGrantStmt = db.prepare(
  `UPDATE replay_sessions
      SET access_grant_json = ?, updated_at = ?
    WHERE id = ?`,
);

export const getSystemInstrumentIdBySymbol = (
  symbol: string,
  timeframe: string,
): string | null => {
  const row = getSystemInstrumentBySymbolStmt.get(symbol, timeframe) as
    | { id?: unknown }
    | undefined;
  return typeof row?.id === 'string' && row.id.trim() ? row.id : null;
};

export const getInstrumentMembershipTargetRowById = (
  instrumentId: string,
): InstrumentMembershipTargetRow | null =>
  (getInstrumentMembershipTargetByIdStmt.get(instrumentId) as
    | InstrumentMembershipTargetRow
    | undefined) ?? null;

export const getInstrumentMembershipTargetRowBySourceSymbol = (
  sourceId: string,
  symbol: string,
  timeframe: string,
): InstrumentMembershipTargetRow | null =>
  (getInstrumentMembershipTargetBySourceSymbolStmt.get(
    sourceId,
    symbol,
    timeframe,
  ) as InstrumentMembershipTargetRow | undefined) ?? null;

export const getLocalSourceMembershipRowById = (
  sourceId: string,
): LocalSourceMembershipRow | null =>
  (getLocalSourceMembershipByIdStmt.get(sourceId) as
    | LocalSourceMembershipRow
    | undefined) ?? null;

export const getReplaySessionAccessRecordRow = (
  sessionId: string,
): ReplaySessionAccessRecordRow | null =>
  (getReplaySessionAccessRecordStmt.get(sessionId) as
    | ReplaySessionAccessRecordRow
    | undefined) ?? null;

export const updateReplaySessionAccessGrantJson = ({
  sessionId,
  accessGrantJson,
  updatedAt,
}: {
  sessionId: string;
  accessGrantJson: string;
  updatedAt: string;
}): void => {
  updateReplaySessionAccessGrantStmt.run(accessGrantJson, updatedAt, sessionId);
};
