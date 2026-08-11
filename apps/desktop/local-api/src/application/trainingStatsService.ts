// SPDX-License-Identifier: GPL-3.0-only

import { parseTrainingSummaryJson } from '../domain/training/summary.js';
import { resolveUnifiedReturnRate } from '@zinuto/shared/domain-calculations/training-return-rate';
import type { OperatorSummary } from '@zinuto/shared/operatorSummary';
import {
  calcSessionTradeAnalytics,
  extractTags,
  normalizeNumber,
  parseReplayFills,
  type ReplayFill,
  type ReplayPayload,
  type SessionAnalytics,
  type TrainingProjectRow,
} from '../domain/training/statsDomain.js';
import {
  invalidateTrainingStatsFilterOptionsSnapshotCache,
  loadReplayPayloadRow,
  listTrainingProjectReplayFills,
  loadTrainingProjectById,
  normalizeFactTimeframe,
  renameTrainingStatsSessionFactByProjectId,
  upsertTrainingStatsFact,
} from './ports/infrastructure/db/training/statsRepository.js';
import { markTrainingStatsDerivedDirty } from './training/statsState.js';
import {
  buildTrainingReviewProjectionMetrics,
  type TrainingReviewProjectionMetrics,
} from '../domain/training/reviewProjection.js';
import { buildHumanOperatorSummary } from '../domain/operatorSummary.js';

export {
  getTrainingStatsReport,
  getTrainingStatsSummary,
  type TrainingStatsSummaryPayload,
} from './training/statsReport.js';

type TrainingProjectProjectionSource = {
  id: string;
  name: string;
  createdAt: string;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  trainingDateRange: string;
  initialTotal: number;
  totalPnl: number;
  profitRate: number;
  durationDays: number;
  totalTrades: number;
  finalEquity: number;
  maxDrawdownRate: number;
  tradingCost: number;
  decisionSecondsUsed: number;
  decisionCount: number;
  replay?: Record<string, unknown>;
  reviewProjection?: TrainingReviewProjectionMetrics | null;
  operatorSummary: OperatorSummary;
};

const normalizeOperatorSummary = (value: unknown): OperatorSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return buildHumanOperatorSummary();
  }
  return buildHumanOperatorSummary();
};

const loadReplayPayload = (projectId: string): ReplayPayload | null => {
  const row = loadReplayPayloadRow(projectId);
  if (!row) {
    return null;
  }
  const fills: ReplayFill[] = listTrainingProjectReplayFills(projectId)
    .map((item) => {
      const side = item.side === 'SELL' ? 'SELL' : 'BUY';
      const fillIndex = Math.max(0, Math.floor(normalizeNumber(item.fill_index, 0)));
      const fillPrice = Math.max(0, normalizeNumber(item.fill_price, 0));
      const fillQty = Math.max(0, normalizeNumber(item.fill_qty, 0));
      if (!Number.isFinite(fillPrice) || !Number.isFinite(fillQty) || fillQty <= 0) {
        return null;
      }
      return {
        side,
        fill_index: fillIndex,
        fill_time: item.fill_time || '',
        fill_price: fillPrice,
        fill_qty: fillQty,
        contract_multiplier: Math.max(Number.EPSILON, normalizeNumber(item.contract_multiplier, 1)),
        fee: Math.max(0, normalizeNumber(item.fee, 0)),
        tax: Math.max(0, normalizeNumber(item.tax, 0)),
        slippage: Math.max(0, normalizeNumber(item.slippage, 0))
      } satisfies ReplayFill;
    })
    .filter((item): item is ReplayFill => Boolean(item));

  return {
    baseTimeframe: row.base_timeframe ?? undefined,
    snapshot: {
      fills
    },
    tradeRounds: []
  };
};

const persistTrainingStatsFact = (session: SessionAnalytics): void => {
  upsertTrainingStatsFact(
    {
      ...session,
      baseTimeframe: normalizeFactTimeframe(session.baseTimeframe),
      initialTotal: Math.max(0, normalizeNumber(session.initialTotal)),
      totalPnl: normalizeNumber(session.totalPnl),
      profitRate: normalizeNumber(session.profitRate),
      durationDays: Math.max(0, Math.floor(normalizeNumber(session.durationDays))),
      totalTrades: Math.max(0, Math.floor(normalizeNumber(session.totalTrades))),
      finalEquity: normalizeNumber(session.finalEquity),
      maxDrawdownRate: Math.max(0, Math.abs(normalizeNumber(session.maxDrawdownRate))),
      tradingCost: Math.max(0, normalizeNumber(session.tradingCost)),
      decisionSecondsUsed: Math.max(0, normalizeNumber(session.decisionSecondsUsed)),
      decisionCount: Math.max(0, Math.floor(normalizeNumber(session.decisionCount))),
      trade: {
        ...session.trade,
        closedTrades: Math.max(0, Math.floor(normalizeNumber(session.trade.closedTrades))),
        winningTrades: Math.max(0, Math.floor(normalizeNumber(session.trade.winningTrades))),
        losingTrades: Math.max(0, Math.floor(normalizeNumber(session.trade.losingTrades))),
        profitTradeTotal: normalizeNumber(session.trade.profitTradeTotal),
        lossTradeTotal: normalizeNumber(session.trade.lossTradeTotal),
        averageHoldBars: Math.max(0, normalizeNumber(session.trade.averageHoldBars)),
        averageTakeProfitRate: Math.max(0, normalizeNumber(session.trade.averageTakeProfitRate)),
        averageStopLossRate: Math.max(0, normalizeNumber(session.trade.averageStopLossRate)),
        addPositionCount: Math.max(0, Math.floor(normalizeNumber(session.trade.addPositionCount))),
        reducePositionCount: Math.max(0, Math.floor(normalizeNumber(session.trade.reducePositionCount))),
        fullPositionCount: Math.max(0, Math.floor(normalizeNumber(session.trade.fullPositionCount))),
        maxConsecutiveWins: Math.max(0, Math.floor(normalizeNumber(session.trade.maxConsecutiveWins))),
        maxConsecutiveLosses: Math.max(0, Math.floor(normalizeNumber(session.trade.maxConsecutiveLosses))),
        totalSlippage: Math.max(0, normalizeNumber(session.trade.totalSlippage)),
        totalFeesFromFills: Math.max(0, normalizeNumber(session.trade.totalFeesFromFills))
      }
    },
    normalizeFactTimeframe(session.baseTimeframe),
    JSON.stringify(session.tags ?? []),
    new Date().toISOString(),
    null
  );
};

const persistTrainingStatsFactFromProject = (
  project: TrainingProjectProjectionSource,
): void => {
  const replayPayload =
    project.replay && typeof project.replay === 'object' && !Array.isArray(project.replay)
      ? (project.replay as ReplayPayload)
      : null;
  const fills = parseReplayFills(replayPayload);
  const trade = calcSessionTradeAnalytics(fills, Math.max(0, project.initialTotal));
  const session: SessionAnalytics = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    symbol: (project.symbol || '').trim().toUpperCase(),
    samplePoolId: project.samplePoolId,
    samplePoolName: project.samplePoolName,
    baseTimeframe: normalizeFactTimeframe(project.baseTimeframe),
    trainingDateRange: project.trainingDateRange,
    initialTotal: Math.max(0, normalizeNumber(project.initialTotal)),
    totalPnl: normalizeNumber(project.totalPnl),
    profitRate: normalizeNumber(project.profitRate),
    durationDays: Math.max(0, Math.floor(normalizeNumber(project.durationDays))),
    totalTrades: Math.max(0, Math.floor(normalizeNumber(project.totalTrades))),
    finalEquity: normalizeNumber(project.finalEquity),
    maxDrawdownRate: Math.max(0, Math.abs(normalizeNumber(project.maxDrawdownRate))),
    tradingCost: Math.max(0, normalizeNumber(project.tradingCost)),
    decisionSecondsUsed: Math.max(0, normalizeNumber(project.decisionSecondsUsed)),
    decisionCount: Math.max(0, Math.floor(normalizeNumber(project.decisionCount))),
    tags: extractTags(project.name),
    operatorSummary: normalizeOperatorSummary(project.operatorSummary),
    trade,
  };
  const reviewMetrics =
    project.reviewProjection ??
    buildTrainingReviewProjectionMetrics({
      initialTotal: session.initialTotal,
      totalPnl: session.totalPnl,
      finalEquity: session.finalEquity,
      totalTrades: session.totalTrades,
      profitRate: session.profitRate,
      maxDrawdownRate: session.maxDrawdownRate,
      decisionCount: session.decisionCount,
      decisionSecondsUsed: session.decisionSecondsUsed,
      replay:
        project.replay && typeof project.replay === 'object' && !Array.isArray(project.replay)
          ? project.replay
          : undefined,
    });
  upsertTrainingStatsFact(
    session,
    session.baseTimeframe,
    JSON.stringify(session.tags ?? []),
    new Date().toISOString(),
    reviewMetrics,
  );
};

const markTrainingStatsCachesDirty = (): void => {
  invalidateTrainingStatsFilterOptionsSnapshotCache();
  markTrainingStatsDerivedDirty();
};

const rowToSessionAnalytics = (row: TrainingProjectRow): SessionAnalytics => {
  const summary = parseTrainingSummaryJson(row.summary_json);
  const replay = loadReplayPayload(row.id);
  const baseTimeframe = normalizeFactTimeframe(
    row.base_timeframe || (typeof replay?.baseTimeframe === 'string' ? replay.baseTimeframe : 'unknown')
  );
  const initialTotal = Math.max(0, normalizeNumber(row.initial_total, summary.initialAsset));
  const totalPnl = normalizeNumber(row.total_pnl, summary.totalPnl);
  const totalTrades = Math.max(0, Math.floor(normalizeNumber(row.total_trades, summary.totalTrades)));
  const durationDays = Math.max(0, Math.floor(normalizeNumber(row.duration_days, summary.durationDays)));
  const maxDrawdownRate = Math.max(0, Math.abs(normalizeNumber(summary.maxDrawdownRate)));
  const tradingCost = Math.max(0, normalizeNumber(summary.tradingCost));
  const decisionSecondsUsed = Math.max(0, normalizeNumber(summary.decisionSecondsUsed));
  const decisionCount = Math.max(0, Math.floor(normalizeNumber(summary.decisionCount)));
  const profitRate = resolveUnifiedReturnRate(
    initialTotal,
    totalPnl,
    normalizeNumber(row.equity_return_rate, Number.NaN),
    normalizeNumber(summary.assetReturnRate, Number.NaN),
    normalizeNumber(row.profit_rate, summary.profitRate)
  );
  const fills = parseReplayFills(replay);
  const trade = calcSessionTradeAnalytics(fills, initialTotal);

  const session: SessionAnalytics = {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    symbol: (row.symbol || '').trim().toUpperCase(),
    samplePoolId: row.sample_pool_id,
    samplePoolName: row.sample_pool_name,
    baseTimeframe,
    trainingDateRange: row.training_date_range,
    initialTotal,
    totalPnl,
    profitRate,
    durationDays,
    totalTrades,
    finalEquity: normalizeNumber(row.final_equity, summary.endingAsset),
    maxDrawdownRate,
    tradingCost,
    decisionSecondsUsed,
    decisionCount,
    tags: extractTags(row.name),
    operatorSummary: (() => {
      try {
        return normalizeOperatorSummary(
          JSON.parse(String(row.operator_summary_json || 'null')),
        );
      } catch {
        return buildHumanOperatorSummary();
      }
    })(),
    trade
  };

  persistTrainingStatsFact(session);
  return session;
};

export const syncTrainingStatsSessionFact = (projectId: string): boolean => {
  const row = loadTrainingProjectById(projectId);
  if (!row) {
    return false;
  }
  rowToSessionAnalytics(row);
  markTrainingStatsCachesDirty();
  return true;
};

export const syncTrainingStatsSessionFactFromProject = (
  project: TrainingProjectProjectionSource,
): void => {
  persistTrainingStatsFactFromProject(project);
  markTrainingStatsCachesDirty();
};

export const markTrainingStatsDirty = (): void => {
  markTrainingStatsCachesDirty();
};

export const renameTrainingStatsSessionFact = (projectId: string, name: string): void => {
  const normalizedProjectId = String(projectId || '').trim();
  if (!normalizedProjectId) {
    return;
  }
  renameTrainingStatsSessionFactByProjectId(
    normalizedProjectId,
    String(name || '').trim(),
    JSON.stringify(extractTags(name)),
    new Date().toISOString()
  );
  markTrainingStatsCachesDirty();
};
