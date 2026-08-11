// SPDX-License-Identifier: GPL-3.0-only

import {
  clampNonNegativeInteger,
} from '../../domain/specialTraining/statsProjectionMath.js';
import type {
  ChallengeStatsFastDirectionSelection,
  ChallengeStatsRecentSession,
  ChallengeStatsReviewGrade,
  ChallengeStatsRiskBehaviorType,
} from '../../domain/specialTraining/statsContracts.js';
export {
  clampNonNegativeInteger,
  clampNonNegativeNumber,
} from '../../domain/specialTraining/statsProjectionMath.js';
import type { SpecialTrainingStatsProjectionRow } from '../ports/infrastructure/db/specialTraining/statsProjectionStore.js';

const toText = (value: unknown): string => String(value ?? '').trim();

export const parseStoredJsonSafe = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return fallback;
  }
  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

export const normalizeFastDirectionSelection = (
  value: unknown,
): ChallengeStatsFastDirectionSelection => {
  const token = toText(value).toUpperCase();
  if (token === 'LONG') {
    return 'LONG';
  }
  if (token === 'SHORT') {
    return 'SHORT';
  }
  return 'OBSERVE';
};

export const normalizeReviewGrade = (
  value: unknown,
): ChallengeStatsReviewGrade => {
  const token = toText(value).toUpperCase();
  if (token === 'S' || token === 'A') {
    return token;
  }
  return 'F';
};

export const normalizeRiskBehavior = (
  value: unknown,
): ChallengeStatsRiskBehaviorType => {
  const token = toText(value).toUpperCase();
  if (token === 'CUT_LOSS' || token === 'ADD_POSITION') {
    return token;
  }
  return 'FREEZE';
};

export const buildChallengeStatsRecentSession = (
  row: SpecialTrainingStatsProjectionRow,
): ChallengeStatsRecentSession => ({
  id: row.project_id,
  name: `${row.mode_id}:${row.question_order}`,
  symbol: toText(row.symbol).toUpperCase() || toText(row.symbol),
  samplePoolId: row.sample_pool_id,
  samplePoolName: row.sample_pool_name,
  baseTimeframe: row.base_timeframe,
  createdAt: row.settled_at || row.created_at,
  profitRate: Number(row.profit_rate) || 0,
  totalPnl: Number(row.total_pnl) || 0,
  totalTrades: clampNonNegativeInteger(row.total_trades),
  durationDays: clampNonNegativeInteger(row.duration_days),
});
