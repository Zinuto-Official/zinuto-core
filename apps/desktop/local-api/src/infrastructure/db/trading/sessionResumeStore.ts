// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

export type LatestResumableSessionCandidateRow = {
  sessionId: string;
  symbol: string;
  instrumentName: string | null;
  timeframe: string;
  minimumBaseTimeframe: string;
  samplePoolId: string;
  createdAt: string;
  updatedAt: string;
};

const selectLatestResumableSessionCandidatesStmt = db.prepare(
  `SELECT s.id AS sessionId,
          i.symbol AS symbol,
          i.name AS instrumentName,
          s.timeframe AS timeframe,
          s.minimum_base_timeframe AS minimumBaseTimeframe,
          s.sample_pool_id AS samplePoolId,
          s.created_at AS createdAt,
          s.updated_at AS updatedAt
     FROM replay_sessions s
     JOIN instruments i ON i.id = s.instrument_id
    WHERE s.user_id = ?
      AND s.session_scope = 'OFFICIAL'
    ORDER BY s.updated_at DESC, s.created_at DESC, s.rowid DESC`,
);

export const listLatestResumableSessionCandidates = (
  userId: string,
): LatestResumableSessionCandidateRow[] =>
  selectLatestResumableSessionCandidatesStmt.all(
    userId,
  ) as LatestResumableSessionCandidateRow[];
