// SPDX-License-Identifier: GPL-3.0-only

import type { ChallengeStatsDashboardSessionRow } from '../../domain/specialTraining/statsContracts.js';
import type { SpecialTrainingStatsProjectionRow } from '../ports/infrastructure/db/specialTraining/statsProjectionStore.js';
import {
  clampNonNegativeInteger,
  clampNonNegativeNumber,
  normalizeFastDirectionSelection,
  normalizeReviewGrade,
  normalizeRiskBehavior,
  parseStoredJsonSafe,
} from './statsProjectionRuntime.js';

export const buildChallengeStatsDashboardRows = (
  projectionRows: SpecialTrainingStatsProjectionRow[],
): ChallengeStatsDashboardSessionRow[] =>
  projectionRows.map((row) => {
    const common = {
      id: row.project_id,
      createdAt: row.settled_at || row.created_at,
      symbol: row.symbol,
      samplePoolId: row.sample_pool_id,
      samplePoolName: row.sample_pool_name,
      baseTimeframe: row.base_timeframe,
      totalPnl: Number(row.total_pnl) || 0,
      profitRate: Number(row.profit_rate) || 0,
      totalTrades: clampNonNegativeInteger(row.total_trades),
      durationDays: clampNonNegativeInteger(row.duration_days),
    };

    if (row.mode_id === 'fast-decision-training') {
      return {
        kind: 'fast',
        ...common,
        decisionSeconds:
          row.decision_seconds_used === null
            ? 0
            : clampNonNegativeNumber(row.decision_seconds_used),
        selection: normalizeFastDirectionSelection(row.selection),
        actual: normalizeFastDirectionSelection(row.actual),
        correct: Number(row.correct) === 1,
        timedOut: Number(row.timed_out) === 1,
        edgeRatio: clampNonNegativeNumber(row.edge_ratio),
        opportunityEdgeRatio: clampNonNegativeNumber(row.opportunity_edge_ratio),
        performanceRate: Number(row.performance_rate) || 0,
        reviewGrade: normalizeReviewGrade(row.fast_review_grade),
      };
    }

    return {
      kind: 'risk',
      ...common,
      survived: Number(row.survived) === 1,
      comeback: Number(row.comeback) === 1,
      alphaRatio: row.alpha_ratio === null ? null : Number(row.alpha_ratio) || 0,
      returnRate: Number(row.return_rate) || 0,
      firstActionBars: clampNonNegativeInteger(row.first_action_bars),
      behavior: normalizeRiskBehavior(row.behavior),
      reviewGrade: normalizeReviewGrade(row.risk_review_grade),
      curvePoints: parseStoredJsonSafe<Array<[number, number]>>(
        row.curve_points_json,
        [],
      ),
    };
  });
