// SPDX-License-Identifier: GPL-3.0-only

import { gunzipSync } from 'node:zlib';
import { db } from '../database.js';
import { normalizeIsoDate } from '../../../domain/training/statsDomain.js';
import { normalizeSpecialTrainingBaseTimeframe } from '@zinuto/shared/specialTrainingModes';
import { buildChallengeStatsProjectDetail } from '../../../domain/specialTraining/statsReplayProjectBuilder.js';
import type { SpecialTrainingModeId } from '../../../domain/specialTraining/contracts.js';
import type {
  ChallengeStatsProjectDetail,
  SpecialTrainingStatsFilters,
} from '../../../domain/specialTraining/statsContracts.js';
import { clampNonNegativeInteger } from '../../../domain/specialTraining/statsProjectionMath.js';
import {
  getSpecialTrainingHistoryQuestionDetailById,
  getSpecialTrainingHistorySessionSummaryById,
} from './historyStore.js';
import { parseSpecialTrainingHistoryQuestionDetailPayload } from '../specialTrainingHistoryQuestionDetailStorage.js';

const SPECIAL_TRAINING_STATS_LIMIT_DEFAULT = 200;
const SPECIAL_TRAINING_STATS_REPAIR_BATCH_LIMIT = 5000;

export type SpecialTrainingStatsProjectionRow = {
  project_id: string;
  session_id: string;
  question_id: string;
  question_order: number;
  mode_id: SpecialTrainingModeId;
  created_at: string;
  settled_at: string;
  finished_at: string;
  symbol: string;
  base_timeframe: string;
  sample_pool_id: string;
  sample_pool_name: string;
  initial_total: number;
  final_equity: number;
  total_pnl: number;
  profit_rate: number;
  return_rate: number;
  total_trades: number;
  duration_days: number;
  max_drawdown_rate: number;
  passed: number;
  decision_seconds_used: number | null;
  decision_count: number;
  selection: string | null;
  actual: string | null;
  correct: number;
  timed_out: number;
  edge_ratio: number;
  opportunity_edge_ratio: number;
  performance_rate: number;
  fast_review_grade: string;
  survived: number;
  comeback: number;
  alpha_ratio: number | null;
  first_action_bars: number;
  behavior: string;
  risk_review_grade: string;
  curve_points_json: string;
  generated_at: string;
  detail_expired_at?: string | null;
};

type SpecialTrainingStatsHistoryRow = {
  id: string;
  session_id: string;
  bank_id: string;
  bank_name: string;
  question_order: number;
  mode_id: SpecialTrainingModeId;
  symbol: string;
  base_timeframe: string;
  effective_timeframe: string;
  initial_total: number;
  final_total_asset: number;
  total_pnl: number;
  return_rate: number;
  max_drawdown_ratio: number;
  passed: number;
  performance_rate: number;
  grade: string;
  detail_blob: unknown;
  created_at: string;
  settled_at: string;
  updated_at: string;
  finished_at: string;
};

type ReplayNoteContextArchiveRow = {
  archive_encoding?: unknown;
  archive_payload?: unknown;
};

type MissingProjectionQuestionRow = {
  question_id?: unknown;
};

export type SpecialTrainingStatsProjectionRepairResult = {
  scannedQuestionRows: number;
  insertedOrUpdatedProjectionRows: number;
};

const toText = (value: unknown): string => String(value ?? '').trim();

const toRecordOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toPayloadBuffer = (payload: unknown): Buffer | null => {
  if (Buffer.isBuffer(payload)) {
    return payload.length > 0 ? payload : null;
  }
  if (payload instanceof Uint8Array) {
    return payload.byteLength > 0 ? Buffer.from(payload) : null;
  }
  if (typeof payload === 'string') {
    const normalized = payload.trim();
    return normalized ? Buffer.from(normalized, 'utf-8') : null;
  }
  return null;
};

const decodeReplayNoteContextArchive = (
  row: ReplayNoteContextArchiveRow | null | undefined,
): Record<string, unknown> | null => {
  if (!row) {
    return null;
  }
  const encoding = toText(row.archive_encoding).toUpperCase();
  const payloadBuffer = toPayloadBuffer(row.archive_payload);
  if (!payloadBuffer || encoding !== 'GZIP_BINARY') {
    return null;
  }
  try {
    const decoded = gunzipSync(payloadBuffer).toString('utf-8');
    return toRecordOrNull(JSON.parse(decoded));
  } catch {
    return null;
  }
};

const resolveSpecialTrainingReviewNoteType = (
  _modeId: SpecialTrainingModeId,
): 'CHALLENGE' => 'CHALLENGE';

const loadLatestSpecialTrainingReviewReplayContext = (input: {
  questionId: string;
  modeId: SpecialTrainingModeId;
}): Record<string, unknown> | null => {
  const noteType = resolveSpecialTrainingReviewNoteType(input.modeId);
  const questionId = toText(input.questionId);
  if (!noteType || !questionId) {
    return null;
  }
  const bindingIds = Array.from(
    new Set([
      questionId,
      `special-training-review:${questionId}`,
      `special-training-history:${questionId}`,
    ]),
  );
  if (!bindingIds.length) {
    return null;
  }
  const placeholders = bindingIds.map(() => '?').join(', ');
  const matchedNotesSql = `SELECT n.id,n.updated_at,n.created_at
                             FROM replay_notes n
                            WHERE n.type = ?
                              AND n.has_context_replay = 1
                              AND n.training_project_id IN (${placeholders})
                           UNION ALL
                           SELECT n.id,n.updated_at,n.created_at
                             FROM replay_notes n
                            WHERE n.type = ?
                              AND n.has_context_replay = 1
                              AND n.context_session_id IN (${placeholders})
                           UNION ALL
                           SELECT n.id,n.updated_at,n.created_at
                             FROM replay_notes n
                            WHERE n.type = ?
                              AND n.has_context_replay = 1
                              AND n.source_kind = 'SPECIAL_TRAINING_QUESTION'
                              AND n.source_id IN (${placeholders})`;
  const row = db
    .prepare(
      `WITH matched_notes AS (
         ${matchedNotesSql}
       )
       SELECT a.archive_encoding,a.archive_payload
         FROM matched_notes n
         JOIN replay_note_context_archives a ON a.note_id = n.id
        ORDER BY n.updated_at DESC, n.created_at DESC, n.id DESC
        LIMIT 1`,
    )
    .get(
      noteType,
      ...bindingIds,
      noteType,
      ...bindingIds,
      noteType,
      ...bindingIds,
    ) as ReplayNoteContextArchiveRow | undefined;
  return decodeReplayNoteContextArchive(row);
};

const mergeChallengeReplayWithReviewContext = (
  detail: ChallengeStatsProjectDetail,
  reviewContextReplay: Record<string, unknown> | null,
): ChallengeStatsProjectDetail => {
  const baseReplay = toRecordOrNull(detail.replay);
  if (!baseReplay || !reviewContextReplay) {
    return detail;
  }
  return {
    ...detail,
    replay: {
      ...baseReplay,
      ...reviewContextReplay,
    } as ChallengeStatsProjectDetail['replay'],
  };
};

const clampSpecialTrainingStatsLimit = (value: unknown): number => {
  const numeric = Math.floor(Number(value) || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return SPECIAL_TRAINING_STATS_LIMIT_DEFAULT;
  }
  return Math.max(1, Math.min(200, numeric));
};

const normalizeChallengeFilterTimeframe = (value: unknown): string => {
  const normalized = normalizeSpecialTrainingBaseTimeframe(value);
  return normalized ?? '__all__';
};

type SpecialTrainingStatsProjectionQuery = {
  whereSql: string;
  params: unknown[];
};

const buildSpecialTrainingStatsProjectionQuery = (
  filters: SpecialTrainingStatsFilters,
  options: {
    alias?: string;
    timeframeColumn?: string;
  } = {},
): SpecialTrainingStatsProjectionQuery => {
  const alias = options.alias ?? 'q';
  const timeframeColumn = options.timeframeColumn ?? 'effective_timeframe';
  const where = [`${alias}.mode_id = ?`];
  const params: unknown[] = [filters.modeId];
  const fromIso = normalizeIsoDate(filters.from ?? '', false);
  const toIso = normalizeIsoDate(filters.to ?? '', true);
  const symbolFilter = toText(filters.symbol).toUpperCase();
  const timeframeFilter = normalizeChallengeFilterTimeframe(filters.timeframe);
  const profitability = filters.profitability ?? 'ALL';

  if (fromIso) {
    where.push(`${alias}.settled_at >= ?`);
    params.push(fromIso);
  }
  if (toIso) {
    where.push(`${alias}.settled_at <= ?`);
    params.push(toIso);
  }
  if (symbolFilter && symbolFilter !== '__ALL__') {
    where.push(`${alias}.symbol = ?`);
    params.push(symbolFilter);
  }
  if (timeframeFilter !== '__all__') {
    where.push(`${alias}.${timeframeColumn} = ?`);
    params.push(timeframeFilter);
  }
  if (profitability === 'PROFIT') {
    where.push(`${alias}.passed = 1`);
  } else if (profitability === 'LOSS') {
    where.push(`${alias}.passed = 0`);
  }

  return {
    whereSql: where.join(' AND '),
    params,
  };
};

const buildRiskCurvePointsJson = (
  riskReview: Record<string, unknown> | null,
  initialTotal: number,
): string => {
  if (!riskReview || initialTotal <= 0) {
    return '[]';
  }
  const equityCurves = toRecordOrNull(riskReview.equityCurves);
  const rawCurve = Array.isArray(equityCurves?.user)
    ? equityCurves.user
    : [];
  const points = rawCurve
    .map((item, index) => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        return [index, ((item - initialTotal) / initialTotal) * 100];
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const source = item as Record<string, unknown>;
      const barIndex = clampNonNegativeInteger(source.barIndex ?? source.x ?? index);
      const asset = Number(source.asset ?? source.y);
      if (!Number.isFinite(asset)) {
        return null;
      }
      return [barIndex, ((asset - initialTotal) / initialTotal) * 100];
    })
    .filter((item): item is [number, number] => Boolean(item));
  return JSON.stringify(points);
};

const mapHistoryRowToProjectionRow = (
  row: SpecialTrainingStatsHistoryRow,
): SpecialTrainingStatsProjectionRow => {
  const initialTotal = Math.max(0, Number(row.initial_total) || 0);
  const returnRate = Number(row.return_rate) || 0;
  const detail = parseSpecialTrainingHistoryQuestionDetailPayload(row.detail_blob);
  const survived =
    toText(detail.riskReviewGrade).toUpperCase() === 'F' ? 0 : 1;
  const comeback = survived === 1 && returnRate > 0 ? 1 : 0;
  const alphaRaw =
    detail.alpha === null || detail.alpha === undefined
      ? Number.NaN
      : Number(detail.alpha);
  const alphaRatio = Number.isFinite(alphaRaw)
    ? Math.abs(alphaRaw) > 1.2 && initialTotal > 0
      ? alphaRaw / initialTotal
      : alphaRaw
    : null;
  return {
    project_id: row.id,
    session_id: row.session_id,
    question_id: row.id,
    question_order: clampNonNegativeInteger(row.question_order),
    mode_id: row.mode_id,
    created_at: row.created_at,
    settled_at: row.settled_at,
    finished_at: row.finished_at,
    symbol: row.symbol,
    base_timeframe: row.effective_timeframe,
    sample_pool_id: row.bank_id || row.session_id,
    sample_pool_name: row.bank_name || row.bank_id || row.session_id,
    initial_total: initialTotal,
    final_equity: Number(row.final_total_asset) || 0,
    total_pnl: Number(row.total_pnl) || 0,
    profit_rate: returnRate,
    return_rate: returnRate,
    total_trades: clampNonNegativeInteger(detail.tradeActionCount),
    duration_days: 0,
    max_drawdown_rate: Math.max(0, Number(row.max_drawdown_ratio) || 0),
    passed: Number(row.passed) === 1 ? 1 : 0,
    decision_seconds_used:
      detail.decisionSecondsUsed === null
        ? null
        : Number(detail.decisionSecondsUsed) || 0,
    decision_count:
      detail.decisionSecondsUsed === null &&
      !toText(detail.decisionSelection) &&
      !toText(detail.decisionActual)
        ? 0
        : 1,
    selection: toText(detail.decisionSelection) || null,
    actual: toText(detail.decisionActual) || null,
    correct: detail.decisionCorrect === null ? 0 : detail.decisionCorrect ? 1 : 0,
    timed_out: detail.decisionTimedOut === null ? 0 : detail.decisionTimedOut ? 1 : 0,
    edge_ratio: Math.max(0, Number(detail.selectedMfeMaeRatio) || 0),
    opportunity_edge_ratio: Math.max(0, Number(detail.opportunityMfeMaeRatio) || 0),
    performance_rate: Number(row.performance_rate) || 0,
    fast_review_grade: row.grade,
    survived,
    comeback,
    alpha_ratio: alphaRatio,
    first_action_bars: clampNonNegativeInteger(detail.firstActionBars),
    behavior: detail.riskBehavior,
    risk_review_grade: detail.riskReviewGrade,
    curve_points_json: buildRiskCurvePointsJson(detail.riskReview, initialTotal),
    generated_at: row.updated_at,
  };
};

const normalizeProjectionRowsForDisplay = (
  rows: SpecialTrainingStatsProjectionRow[],
): SpecialTrainingStatsProjectionRow[] =>
  rows.map((row) => ({
    ...row,
    question_order: clampNonNegativeInteger(row.question_order),
    initial_total: Number(row.initial_total) || 0,
    final_equity: Number(row.final_equity) || 0,
    total_pnl: Number(row.total_pnl) || 0,
    profit_rate: Number(row.profit_rate) || 0,
    return_rate: Number(row.return_rate) || 0,
    total_trades: clampNonNegativeInteger(row.total_trades),
    duration_days: clampNonNegativeInteger(row.duration_days),
    max_drawdown_rate: Math.max(0, Number(row.max_drawdown_rate) || 0),
    passed: Number(row.passed) === 1 ? 1 : 0,
    decision_seconds_used:
      row.decision_seconds_used === null || row.decision_seconds_used === undefined
        ? null
        : Number(row.decision_seconds_used) || 0,
    decision_count: clampNonNegativeInteger(row.decision_count),
    correct: Number(row.correct) === 1 ? 1 : 0,
    timed_out: Number(row.timed_out) === 1 ? 1 : 0,
    edge_ratio: Math.max(0, Number(row.edge_ratio) || 0),
    opportunity_edge_ratio: Math.max(0, Number(row.opportunity_edge_ratio) || 0),
    performance_rate: Number(row.performance_rate) || 0,
    survived: Number(row.survived) === 1 ? 1 : 0,
    comeback: Number(row.comeback) === 1 ? 1 : 0,
    alpha_ratio:
      row.alpha_ratio === null || row.alpha_ratio === undefined
        ? null
        : Number(row.alpha_ratio) || 0,
    first_action_bars: clampNonNegativeInteger(row.first_action_bars),
    curve_points_json: toText(row.curve_points_json) || '[]',
  }));

const sortProjectionRows = (
  rows: SpecialTrainingStatsProjectionRow[],
): SpecialTrainingStatsProjectionRow[] =>
  [...rows].sort((left, right) => {
    const settledCompare = toText(right.settled_at).localeCompare(toText(left.settled_at));
    if (settledCompare !== 0) {
      return settledCompare;
    }
    return toText(right.project_id).localeCompare(toText(left.project_id));
  });

const selectHistoryRowsForProjection = (
  whereSql: string,
  params: unknown[],
  limit: number,
): SpecialTrainingStatsHistoryRow[] =>
  db
    .prepare(
      `SELECT q.id,q.session_id,q.question_order,q.mode_id,q.symbol,q.base_timeframe,q.effective_timeframe,q.initial_total,
              q.final_total_asset,q.total_pnl,q.return_rate,q.max_drawdown_ratio,
              q.passed,q.performance_rate,q.grade,q.detail_blob,q.created_at,q.settled_at,q.updated_at,
              s.bank_id AS bank_id,
              s.bank_name AS bank_name,
              s.finished_at AS finished_at
         FROM special_training_history_questions q
         JOIN special_training_history_sessions s ON s.id = q.session_id
        WHERE ${whereSql}
          AND q.detail_blob IS NOT NULL
          AND q.detail_expired_at IS NULL
        ORDER BY q.settled_at DESC, q.id DESC
        LIMIT ?`,
    )
    .all(...params, limit) as SpecialTrainingStatsHistoryRow[];

const SPECIAL_TRAINING_STATS_PROJECTION_COLUMNS = [
  'project_id',
  'session_id',
  'question_id',
  'question_order',
  'mode_id',
  'created_at',
  'settled_at',
  'finished_at',
  'symbol',
  'base_timeframe',
  'sample_pool_id',
  'sample_pool_name',
  'initial_total',
  'final_equity',
  'total_pnl',
  'profit_rate',
  'return_rate',
  'total_trades',
  'duration_days',
  'max_drawdown_rate',
  'passed',
  'decision_seconds_used',
  'decision_count',
  'selection',
  'actual',
  'correct',
  'timed_out',
  'edge_ratio',
  'opportunity_edge_ratio',
  'performance_rate',
  'fast_review_grade',
  'survived',
  'comeback',
  'alpha_ratio',
  'first_action_bars',
  'behavior',
  'risk_review_grade',
  'curve_points_json',
  'generated_at',
  'detail_expired_at',
] as const;

const saveSpecialTrainingStatsProjectionRows = (
  rows: readonly SpecialTrainingStatsProjectionRow[],
): number => {
  if (!rows.length) {
    return 0;
  }
  const updateColumns = SPECIAL_TRAINING_STATS_PROJECTION_COLUMNS.filter(
    (column) => column !== 'project_id',
  );
  const insertStmt = db.prepare(
    `INSERT INTO special_training_stats_projection (${SPECIAL_TRAINING_STATS_PROJECTION_COLUMNS.join(',')})
     VALUES (${SPECIAL_TRAINING_STATS_PROJECTION_COLUMNS.map(() => '?').join(',')})
     ON CONFLICT(project_id) DO UPDATE SET
       ${updateColumns.map((column) => `${column} = excluded.${column}`).join(',')}`,
  );
  const tx = db.transaction(() => {
    rows.forEach((row) => {
      insertStmt.run(
        ...SPECIAL_TRAINING_STATS_PROJECTION_COLUMNS.map((column) =>
          column === 'detail_expired_at'
            ? (row.detail_expired_at ?? '')
            : row[column],
        ),
      );
    });
  });
  tx();
  return rows.length;
};

const runProjectionQuestionIdChunks = (
  questionIds: readonly string[],
  handler: (chunk: readonly string[], placeholders: string) => number,
): number => {
  let changed = 0;
  for (let index = 0; index < questionIds.length; index += 400) {
    const chunk = questionIds.slice(index, index + 400);
    if (!chunk.length) {
      continue;
    }
    changed += handler(chunk, chunk.map(() => '?').join(','));
  }
  return changed;
};

export const loadSpecialTrainingStatsProjectionRows = (
  filters: SpecialTrainingStatsFilters,
): SpecialTrainingStatsProjectionRow[] => {
  const limit = clampSpecialTrainingStatsLimit(filters.limit);
  const projectionQuery = buildSpecialTrainingStatsProjectionQuery(filters, {
    alias: 'p',
    timeframeColumn: 'base_timeframe',
  });
  const rows = db
    .prepare(
      `SELECT p.*
         FROM special_training_stats_projection p
        WHERE ${projectionQuery.whereSql}
        ORDER BY p.settled_at DESC, p.project_id DESC
        LIMIT ?`,
    )
    .all(...projectionQuery.params, limit) as SpecialTrainingStatsProjectionRow[];

  return sortProjectionRows(normalizeProjectionRowsForDisplay(rows)).slice(0, limit);
};

export const countSpecialTrainingStatsProjectionRows = (
  filters: SpecialTrainingStatsFilters,
): number => {
  const projectionQuery = buildSpecialTrainingStatsProjectionQuery(filters, {
    alias: 'p',
    timeframeColumn: 'base_timeframe',
  });
  const projectedRow = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM special_training_stats_projection p
        WHERE ${projectionQuery.whereSql}`,
    )
    .get(...projectionQuery.params) as { count?: unknown } | undefined;
  return clampNonNegativeInteger(projectedRow?.count);
};

export const ensureSpecialTrainingStatsProjectionRowsForFilters = (
  filters: SpecialTrainingStatsFilters,
): SpecialTrainingStatsProjectionRepairResult => {
  const historyQuery = buildSpecialTrainingStatsProjectionQuery(filters, {
    alias: 'q',
    timeframeColumn: 'effective_timeframe',
  });
  const rows = db
    .prepare(
      `SELECT q.id AS question_id
         FROM special_training_history_questions q
         LEFT JOIN special_training_stats_projection p ON p.question_id = q.id
        WHERE ${historyQuery.whereSql}
          AND q.detail_blob IS NOT NULL
          AND q.detail_expired_at IS NULL
          AND p.question_id IS NULL
        ORDER BY q.settled_at DESC, q.id DESC
        LIMIT ?`,
    )
    .all(
      ...historyQuery.params,
      SPECIAL_TRAINING_STATS_REPAIR_BATCH_LIMIT,
    ) as MissingProjectionQuestionRow[];
  const questionIds = rows
    .map((row) => toText(row.question_id))
    .filter((questionId) => questionId.length > 0);
  return {
    scannedQuestionRows: questionIds.length,
    insertedOrUpdatedProjectionRows:
      upsertSpecialTrainingStatsProjectionRowsForQuestions(questionIds, ''),
  };
};

export const upsertSpecialTrainingStatsProjectionRowsForQuestions = (
  questionIds: readonly string[],
  detailExpiredAt: string,
): number => {
  const normalizedIds = Array.from(
    new Set(
      questionIds
        .map((questionId) => toText(questionId))
        .filter((questionId) => questionId.length > 0),
    ),
  );
  if (!normalizedIds.length) {
    return 0;
  }
  return runProjectionQuestionIdChunks(normalizedIds, (chunk, placeholders) => {
    const rows = selectHistoryRowsForProjection(
      `q.id IN (${placeholders})`,
      [...chunk],
      chunk.length,
    ).map((row) => ({
      ...mapHistoryRowToProjectionRow(row),
      detail_expired_at: detailExpiredAt,
    }));
    if (!rows.length) {
      return 0;
    }
    return saveSpecialTrainingStatsProjectionRows(rows);
  });
};

export const loadChallengeStatsProjectDetailById = async (
  projectId: string,
): Promise<ChallengeStatsProjectDetail | null> => {
  const normalizedId = toText(projectId);
  if (!normalizedId) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT session_id
         FROM special_training_history_questions
        WHERE id = ?
        LIMIT 1`,
    )
    .get(normalizedId) as { session_id?: string } | undefined;
  const sessionId = toText(row?.session_id);
  if (!sessionId) {
    return null;
  }
  const session = getSpecialTrainingHistorySessionSummaryById(sessionId);
  if (!session) {
    return null;
  }
  const question = await getSpecialTrainingHistoryQuestionDetailById(normalizedId);
  if (!question) {
    return null;
  }
  const baseDetail = buildChallengeStatsProjectDetail(session, question);
  const reviewContextReplay = loadLatestSpecialTrainingReviewReplayContext({
    questionId: normalizedId,
    modeId: session.modeId,
  });
  return mergeChallengeReplayWithReviewContext(baseDetail, reviewContextReplay);
};
