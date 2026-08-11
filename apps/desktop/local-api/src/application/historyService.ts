// SPDX-License-Identifier: GPL-3.0-only

import { createId } from '../kernel/id.js';
import { runtimeLimits } from '../kernel/runtimeLimits.js';
import { nowIso } from '../kernel/time.js';
import { appError } from '../kernel/appError.js';
import {
  clearTrainingProjectRows,
  deleteTrainingProjectRows,
  getTrainingProjectRowById,
  insertTrainingProjectRow,
  listTrainingProjectRows,
  renameTrainingProjectRow,
  runTrainingProjectMutation,
  type TrainingProjectRow,
} from './ports/infrastructure/db/history/historyStore.js';
import {
  clearTrainingProjectReplayRef,
  loadTrainingProjectReplayFromRef,
  saveTrainingProjectReplayRef
} from './ports/infrastructure/db/history/replayRefStore.js';
import { ensureReplayNoteContextArchivesForTrainingProjects } from './replayNoteService.js';
import {
  markTrainingStatsDirty,
  renameTrainingStatsSessionFact,
  syncTrainingStatsSessionFactFromProject,
} from './trainingStatsService.js';
import { getTradingSettings } from './trading/sessionService.js';
import {
  normalizeTrainingSummary,
  parseTrainingSummaryJson,
  type TrainingSummaryPayload
} from '../domain/training/summary.js';
import { resolveUnifiedReturnRate } from '@zinuto/shared/domain-calculations/training-return-rate';
import { INPUT_LIMITS, trimAndLimitInputText } from '@zinuto/shared/input-limits';
import type { OperatorSummary } from '@zinuto/shared/operatorSummary';
import type { PriceMode } from '../domain/models.js';
import {
  type TrainingReviewProjectionMetrics,
} from '../domain/training/reviewProjection.js';
import {
  buildReplayPayloadFromSessionArchive,
  resolveArchiveFinalizePriceMode,
  type ArchivedBaseTimeframe,
  type ArchivedDisplayPeriod,
  type ReplayCurvePoint,
} from './history/trainingProjectArchiveCore.js';
import {
  buildHumanOperatorSummary,
  normalizeOperatorSummary,
  resolveArchivedOperatorSummary,
} from '../domain/operatorSummary.js';
import { rebindTrainingRecordNotes } from './replayNoteService.js';

export { buildReplayPayloadFromSessionArchive } from './history/trainingProjectArchiveCore.js';

export interface TrainingProjectReviewProjection {
  marketPresetId: string;
  assetClass: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  tradeSettlementMode: 'T0' | 'T1';
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  leverageMultiple: number;
  usesMakerTaker: boolean;
  fundingRate: number;
  grossPnl: number;
  feeAndTaxCost: number;
  borrowCost: number;
  decisionAverageSeconds: number;
  tradeWinRate: number;
  sessionProfitFactor: number | null;
  expectancyPerTrade: number;
  peakMaintenanceUtilizationRate: number;
  marginMinBufferRate: number;
  trendAligned: boolean;
  criticalFailure: boolean;
  lossCutDelayBarsTotal: number;
  lossCutDelayBarsCount: number;
  analytics: {
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    profitTradeTotal: number;
    lossTradeTotal: number;
    averageHoldBars: number;
    addPositionCount: number;
    reducePositionCount: number;
    fullPositionCount: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    totalSlippage: number;
    totalFeesFromFills: number;
  };
}

export interface TrainingProjectRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  initialTotal: number;
  totalPnl: number;
  profitRate: number;
  durationDays: number;
  totalTrades: number;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  trainingDateRange: string;
  summary: TrainingSummaryPayload;
  finalEquity: number;
  equityReturnRate: number;
  assetClass?: 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO';
  reviewProjection?: TrainingProjectReviewProjection | null;
  replayHydrationStatus?: 'READY' | 'SOURCE_CHANGED' | 'SOURCE_MISSING' | 'SNAPSHOT_ONLY' | 'EXPIRED';
  detailExpiredAt?: string | null;
  replayUnavailableReason?: 'DETAIL_EXPIRED';
  replay?: Record<string, unknown>;
  operatorSummary: OperatorSummary;
}

interface TrainingProjectListResult {
  items: TrainingProjectRecord[];
  nextCursor: string | null;
}

type CreateTrainingProjectPayload = Omit<TrainingProjectRecord, 'reviewProjection'> & {
  reviewProjection?: TrainingReviewProjectionMetrics | null;
  sourceTag?: string;
  simulationBatchId?: string | null;
};

interface ArchiveTrainingProjectFromSessionPayload {
  sessionId: string;
  name: string;
  samplePoolId: string;
  samplePoolName: string;
  displayPeriod: ArchivedDisplayPeriod;
  finalizePriceMode?: PriceMode;
  drawings?: unknown[];
  chartIndicators?: unknown;
}

interface PreviewTrainingProjectSettlementFromSessionPayload {
  sessionId: string;
  displayPeriod: ArchivedDisplayPeriod;
  finalizePriceMode?: PriceMode;
}

interface TrainingProjectSettlementPreview {
  summary: TrainingSummaryPayload;
  replayMetrics: {
    initialCapital: number;
    finalEquity: number;
    equityReturnRate: number;
    equityCurve: ReplayCurvePoint[];
    drawdownCurve: ReplayCurvePoint[];
  };
  baseTimeframe: ArchivedBaseTimeframe;
  trainingDateRange: string;
}

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeProjectAssetClass = (
  value: unknown
): 'STOCK' | 'FUTURES' | 'FOREX' | 'CRYPTO' => {
  const normalized = String(value || '').trim().toUpperCase();
  if (
    normalized === 'FUTURES' ||
    normalized === 'FOREX' ||
    normalized === 'CRYPTO'
  ) {
    return normalized;
  }
  return 'STOCK';
};

const normalizeReplayRecord = (
  value: unknown
): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const normalizeStoredOperatorSummary = (
  value: unknown
): OperatorSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return buildHumanOperatorSummary();
  }
  return normalizeOperatorSummary(value);
};

const resolveReplayFromRef = async (
  projectId: string,
  symbol: string
): Promise<Record<string, unknown> | undefined> =>
  normalizeReplayRecord(await loadTrainingProjectReplayFromRef(projectId, symbol));

const encodeCursor = (createdAt: string, id: string): string =>
  Buffer.from(JSON.stringify({ createdAt, id }), 'utf-8').toString('base64');

const decodeCursor = (rawCursor?: string): { createdAt: string; id: string } | null => {
  if (!rawCursor) {
    return null;
  }
  try {
    const decoded = Buffer.from(rawCursor, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as { createdAt?: unknown; id?: unknown };
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt.trim() : '';
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    if (!createdAt || !id) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
};

const mapProjectRow = async (row: TrainingProjectRow, includeReplay: boolean): Promise<TrainingProjectRecord> => {
  const summary = parseTrainingSummaryJson(row.summary_json);
  const initialTotal = Math.max(0, normalizeNumber(row.initial_total, summary.initialAsset));
  const totalPnl = normalizeNumber(row.total_pnl, summary.totalPnl);
  const equityReturnRate = normalizeNumber(row.equity_return_rate, Number.NaN);
  const unifiedReturnRate = resolveUnifiedReturnRate(
    initialTotal,
    totalPnl,
    equityReturnRate,
    normalizeNumber(summary.assetReturnRate, Number.NaN),
    normalizeNumber(row.profit_rate, summary.profitRate)
  );
  const finalEquity = normalizeNumber(
    row.final_equity,
    initialTotal + totalPnl
  );

  const detailExpiredAt =
    typeof row.detail_expired_at === 'string' && row.detail_expired_at.trim()
      ? row.detail_expired_at.trim()
      : null;
  const replay = includeReplay && !detailExpiredAt ? await resolveReplayFromRef(row.id, row.symbol) : undefined
  const replayHydrationStatus =
    detailExpiredAt
      ? 'EXPIRED'
      : typeof replay?.replayHydrationStatus === 'string'
      ? (replay.replayHydrationStatus as TrainingProjectRecord['replayHydrationStatus'])
      : undefined

  // Once the detail window is expired the source is gone for good; expose a
  // distinguishable reason instead of silently returning an absent replay.
  const replayUnavailableReason = detailExpiredAt ? 'DETAIL_EXPIRED' : undefined

  const operatorSummary = (() => {
    const raw = typeof row.operator_summary_json === 'string' ? row.operator_summary_json : '';
    if (!raw) {
      return buildHumanOperatorSummary();
    }
    try {
      return normalizeStoredOperatorSummary(JSON.parse(raw));
    } catch {
      return buildHumanOperatorSummary();
    }
  })();

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    initialTotal,
    totalPnl,
    profitRate: unifiedReturnRate,
    durationDays: Math.max(0, Math.floor(normalizeNumber(row.duration_days))),
    totalTrades: Math.max(0, Math.floor(normalizeNumber(row.total_trades))),
    symbol: row.symbol,
    samplePoolId: row.sample_pool_id,
    samplePoolName: row.sample_pool_name,
    baseTimeframe: (row.base_timeframe || '').trim() || '1d',
    trainingDateRange: row.training_date_range,
    summary: {
      ...summary,
      assetReturnRate: unifiedReturnRate,
      profitRate: unifiedReturnRate
    },
    finalEquity,
    equityReturnRate: Number.isFinite(equityReturnRate) ? equityReturnRate : unifiedReturnRate,
    assetClass: row.asset_class ? normalizeProjectAssetClass(row.asset_class) : undefined,
    replayHydrationStatus,
    detailExpiredAt,
    replayUnavailableReason,
    replay,
    operatorSummary,
  };
};


const normalizeTrainingProjectIds = (projectIds: readonly string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  projectIds.forEach((projectId) => {
    const id = String(projectId ?? '').trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
};


export const listTrainingProjects = async (limit = 50, cursor?: string): Promise<TrainingProjectListResult> => {
  const normalizedLimit = Math.max(
    1,
    Math.min(runtimeLimits.trainingProjectsQueryLimitMax, Math.floor(Number.isFinite(limit) ? limit : 50))
  );
  const cursorMeta = decodeCursor(cursor);
  const queryLimit = normalizedLimit + 1;
  const rows = listTrainingProjectRows({
    cursor: cursorMeta,
    limit: queryLimit,
  });

  const hasMore = rows.length > normalizedLimit;
  const trimmed = hasMore ? rows.slice(0, normalizedLimit) : rows;
  const nextCursor = hasMore
    ? (() => {
        const last = trimmed[trimmed.length - 1];
        return last ? encodeCursor(last.created_at, last.id) : null;
      })()
    : null;

  const visibleItems = await Promise.all(trimmed.map((row) => mapProjectRow(row, false)));

  return {
    items: visibleItems,
    nextCursor
  };
};

export const getTrainingProjectById = async (id: string): Promise<TrainingProjectRecord | null> => {
  const projectId = id.trim();
  if (!projectId) {
    return null;
  }
  const row = getTrainingProjectRowById(projectId);
  if (!row) {
    return null;
  }
  return mapProjectRow(row, true);
};

export const archiveTrainingProjectFromSession = async (
  payload: ArchiveTrainingProjectFromSessionPayload
): Promise<TrainingProjectRecord> => {
  const sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) {
    throw appError('SESSION_NOT_FOUND');
  }
  const createdAt = nowIso();
  const name =
    trimAndLimitInputText(payload.name || '', INPUT_LIMITS.trainingProjectNameChars) ||
    createdAt.slice(0, 16).replace('T', ' ');
  const samplePoolId = String(payload.samplePoolId || '').trim() || '__sample_pool_unknown__';
  const samplePoolName =
    trimAndLimitInputText(payload.samplePoolName || '', INPUT_LIMITS.samplePoolNameChars) ||
    'Unknown';
  const operatorSummary = resolveArchivedOperatorSummary();
  const finalizePriceMode = resolveArchiveFinalizePriceMode(payload.finalizePriceMode);
  const initialCapital = Math.max(
    0,
    normalizeNumber(getTradingSettings().initialSecuritiesBalance)
  );
  const replayResult = await buildReplayPayloadFromSessionArchive(
    sessionId,
    initialCapital,
    payload.drawings ?? [],
    payload.chartIndicators,
    payload.displayPeriod,
    finalizePriceMode
  );
  const summary = replayResult.summary;
  const baseTimeframe = replayResult.baseTimeframe;
  const trainingDateRange = replayResult.trainingDateRange;
  const finalEquity = replayResult.metrics.finalEquity;
  const unifiedReturnRate = replayResult.metrics.equityReturnRate;

  const saved = await createTrainingProject({
    id: createId(),
    name,
    createdAt,
    updatedAt: createdAt,
    initialTotal: normalizeNumber(summary.initialAsset),
    totalPnl: normalizeNumber(summary.totalPnl),
    profitRate: unifiedReturnRate,
    durationDays: Math.max(0, Math.floor(normalizeNumber(summary.durationDays))),
    totalTrades: Math.max(0, Math.floor(normalizeNumber(summary.totalTrades))),
    symbol: replayResult.symbol,
    samplePoolId,
    samplePoolName,
    baseTimeframe,
    trainingDateRange,
    summary: {
      ...summary,
      assetReturnRate: unifiedReturnRate,
      profitRate: unifiedReturnRate
    },
    finalEquity,
    equityReturnRate: unifiedReturnRate,
    replay: replayResult.replay,
    reviewProjection: replayResult.reviewProjection,
    operatorSummary,
  });
  rebindTrainingRecordNotes(sessionId, saved.id);
  return saved;
};

export const previewTrainingProjectSettlementFromSession = async (
  payload: PreviewTrainingProjectSettlementFromSessionPayload
): Promise<TrainingProjectSettlementPreview> => {
  const sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) {
    throw appError('SESSION_NOT_FOUND');
  }
  const finalizePriceMode = resolveArchiveFinalizePriceMode(payload.finalizePriceMode);
  const initialCapital = Math.max(
    0,
    normalizeNumber(getTradingSettings().initialSecuritiesBalance)
  );
  const replayResult = await buildReplayPayloadFromSessionArchive(
    sessionId,
    initialCapital,
    [],
    undefined,
    payload.displayPeriod,
    finalizePriceMode
  );
  const equityReturnRate = replayResult.metrics.equityReturnRate;

  return {
    summary: {
      ...replayResult.summary,
      assetReturnRate: equityReturnRate,
      profitRate: equityReturnRate
    },
    replayMetrics: {
      initialCapital: replayResult.metrics.initialCapital,
      finalEquity: replayResult.metrics.finalEquity,
      equityReturnRate,
      equityCurve: replayResult.metrics.equityCurve,
      drawdownCurve: replayResult.metrics.drawdownCurve
    },
    baseTimeframe: replayResult.baseTimeframe,
    trainingDateRange: replayResult.trainingDateRange
  };
};

export const createTrainingProject = async (payload: CreateTrainingProjectPayload): Promise<TrainingProjectRecord> => {
  const createdAt = (payload.createdAt || '').trim() || nowIso();
  const updatedAt = (payload.updatedAt || '').trim() || createdAt;
  const id = (payload.id || '').trim() || createId();
  const name = trimAndLimitInputText(
    payload.name || '',
    INPUT_LIMITS.trainingProjectNameChars
  );
  const symbol = (payload.symbol || '').trim().toUpperCase();
  const samplePoolId = (payload.samplePoolId || '').trim() || '__sample_pool_unknown__';
  const samplePoolName = trimAndLimitInputText(
    payload.samplePoolName || '',
    INPUT_LIMITS.samplePoolNameChars
  );
  const trainingDateRange = (payload.trainingDateRange || '').trim();
  const baseTimeframe = String(payload.baseTimeframe || '').trim().toLowerCase() || '1d';
  const normalizedSummary = normalizeTrainingSummary(payload.summary);
  const normalizedInitialTotal = Math.max(0, normalizeNumber(payload.initialTotal, normalizedSummary.initialAsset));
  const normalizedTotalPnl = normalizeNumber(payload.totalPnl, normalizedSummary.totalPnl);
  const normalizedEquityReturnRate = resolveUnifiedReturnRate(
    normalizedInitialTotal,
    normalizedTotalPnl,
    normalizeNumber(payload.equityReturnRate, Number.NaN),
    normalizeNumber(normalizedSummary.assetReturnRate, Number.NaN),
    normalizeNumber(payload.profitRate, normalizedSummary.profitRate)
  );
  const normalizedFinalEquity = normalizeNumber(payload.finalEquity, normalizedInitialTotal + normalizedTotalPnl);
  const normalizedSummaryWithUnifiedReturn = {
    ...normalizedSummary,
    endingAsset: normalizedFinalEquity,
    assetReturnRate: normalizedEquityReturnRate,
    totalPnl: normalizedTotalPnl,
    profitRate: normalizedEquityReturnRate
  };
  const operatorSummary = normalizeStoredOperatorSummary(payload.operatorSummary);
  const shouldPersistReplay = Boolean(payload.replay);

  runTrainingProjectMutation(() => {
    insertTrainingProjectRow({
      id,
      name,
      createdAt,
      updatedAt,
      symbol,
      samplePoolId,
      samplePoolName,
      baseTimeframe,
      trainingDateRange,
      initialTotal: normalizedInitialTotal,
      totalPnl: normalizedTotalPnl,
      profitRate: normalizedEquityReturnRate,
      durationDays: Math.max(0, Math.floor(normalizeNumber(payload.durationDays))),
      totalTrades: Math.max(0, Math.floor(normalizeNumber(payload.totalTrades))),
      finalEquity: normalizedFinalEquity,
      equityReturnRate: normalizedEquityReturnRate,
      simulationBatchId: String(payload.simulationBatchId ?? '').trim() || null,
      sourceTag: String(payload.sourceTag || '').trim(),
      summaryJson: JSON.stringify(normalizedSummaryWithUnifiedReturn),
      operatorSummaryJson: JSON.stringify(operatorSummary),
    });
    if (shouldPersistReplay) {
      const replayRefMeta = saveTrainingProjectReplayRef(id, payload.replay, updatedAt);
      if (!replayRefMeta) {
        throw appError('TRAINING_PROJECT_REPLAY_REF_SAVE_FAILED');
      }
    } else {
      clearTrainingProjectReplayRef(id);
    }
  });
  const saved = await getTrainingProjectById(id);
  if (!saved) {
    throw appError('HISTORY_PROJECT_SAVE_FAILED');
  }
  syncTrainingStatsSessionFactFromProject({
    id: saved.id,
    name: saved.name,
    createdAt: saved.createdAt,
    symbol: saved.symbol,
    samplePoolId: saved.samplePoolId,
    samplePoolName: saved.samplePoolName,
    baseTimeframe: saved.baseTimeframe,
    trainingDateRange: saved.trainingDateRange,
    initialTotal: saved.initialTotal,
    totalPnl: saved.totalPnl,
    profitRate: saved.profitRate,
    durationDays: saved.durationDays,
    totalTrades: saved.totalTrades,
    finalEquity: saved.finalEquity,
    maxDrawdownRate: normalizeNumber(saved.summary?.maxDrawdownRate),
    tradingCost: normalizeNumber(saved.summary?.tradingCost),
    decisionSecondsUsed: normalizeNumber(saved.summary?.decisionSecondsUsed),
    decisionCount: normalizeNumber(saved.summary?.decisionCount),
    replay: saved.replay,
    reviewProjection: payload.reviewProjection ?? null,
    operatorSummary: saved.operatorSummary,
  });
  return saved;
};

export const renameTrainingProject = async (id: string, name: string): Promise<TrainingProjectRecord> => {
  const projectId = id.trim();
  const nextName = trimAndLimitInputText(name, INPUT_LIMITS.trainingProjectNameChars);
  if (!projectId) {
    throw appError('TRAINING_PROJECT_NOT_FOUND');
  }
  if (!nextName) {
    throw appError('PROJECT_NAME_REQUIRED');
  }
  const changed = renameTrainingProjectRow({
    id: projectId,
    name: nextName,
    updatedAt: nowIso(),
  });
  if (!changed) {
    throw appError('TRAINING_PROJECT_NOT_FOUND');
  }
  renameTrainingStatsSessionFact(projectId, nextName);
  const saved = await getTrainingProjectById(projectId);
  if (!saved) {
    throw appError('TRAINING_PROJECT_NOT_FOUND');
  }
  return saved;
};

const finalizeTrainingProjectDelete = (deleted: number): { deleted: number } => {
  if (deleted > 0) {
    markTrainingStatsDirty();
  }
  return { deleted };
};

export const deleteTrainingProjects = async (ids: readonly string[]): Promise<{ deleted: number }> => {
  const projectIds = normalizeTrainingProjectIds(ids);
  if (!projectIds.length) {
    return { deleted: 0 };
  }
  await ensureReplayNoteContextArchivesForTrainingProjects(projectIds);
  return finalizeTrainingProjectDelete(deleteTrainingProjectRows(projectIds));
};

export const deleteTrainingProject = async (id: string): Promise<{ deleted: number }> => {
  const projectId = id.trim();
  if (!projectId) {
    return { deleted: 0 };
  }
  return deleteTrainingProjects([projectId]);
};

export const clearTrainingProjects = async (): Promise<{ deleted: number }> => {
  await ensureReplayNoteContextArchivesForTrainingProjects();
  return finalizeTrainingProjectDelete(clearTrainingProjectRows());
};
