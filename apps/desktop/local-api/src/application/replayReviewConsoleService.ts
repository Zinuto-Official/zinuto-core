// SPDX-License-Identifier: GPL-3.0-only

import { parseTrainingSummaryJson } from "../domain/training/summary.js";
import {
  buildReplayReviewReport,
  type ReplayReviewReportPayload,
  type ReplayReviewReportRequest,
} from "./replayReviewReportService.js";
import {
  buildReplayReviewDiagnosticsFromProjects,
  type ReplayReviewDiagnosticsPayload,
} from "./replayReviewDiagnosticsService.js";
import {
  loadReplayReviewProjectRows,
  type ReplayReviewProjectRow,
} from "./ports/infrastructure/db/replayReviewConsole/replayReviewConsoleStore.js";
import {
  buildHumanOperatorSummary,
  normalizeOperatorSummary,
} from "../domain/operatorSummary.js";
import type {
  TrainingProjectRecord,
  TrainingProjectReviewProjection,
} from "./historyService.js";

type ReviewBundleRequest = {
  projectIds: readonly string[];
  window?: ReplayReviewReportRequest["window"];
  anchorMs?: number;
  nowMs?: number;
};

export type ReplayReviewConsoleBundlePayload = {
  report: ReplayReviewReportPayload;
  diagnostics: ReplayReviewDiagnosticsPayload;
};

const REVIEW_BUNDLE_CACHE_TTL_MS = 15_000;
const REVIEW_BUNDLE_CACHE_MAX = 12;
const reviewBundleTaskCache = new Map<
  string,
  { expiresAt: number; task: Promise<ReplayReviewConsoleBundlePayload> }
>();

const pruneReviewBundleTaskCache = (now = Date.now()): void => {
  for (const [cacheKey, cacheEntry] of reviewBundleTaskCache.entries()) {
    if (cacheEntry.expiresAt <= now) {
      reviewBundleTaskCache.delete(cacheKey);
    }
  }
  while (reviewBundleTaskCache.size > REVIEW_BUNDLE_CACHE_MAX) {
    const oldest = reviewBundleTaskCache.keys().next();
    if (oldest.done) {
      break;
    }
    reviewBundleTaskCache.delete(oldest.value);
  }
};

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeProjectIds = (projectIds: readonly string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  projectIds.forEach((projectId) => {
    const id = String(projectId ?? "").trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
};

const buildBundleCacheKey = (request: ReviewBundleRequest): string =>
  JSON.stringify({
    projectIds: normalizeProjectIds(request.projectIds),
    window: request.window ?? "ALL",
    anchorMs: Number.isFinite(Number(request.anchorMs))
      ? Math.floor(Number(request.anchorMs))
      : null,
    nowMs: Number.isFinite(Number(request.nowMs))
      ? Math.floor(Number(request.nowMs))
      : null,
  });

const mapReviewProjection = (
  row: ReplayReviewProjectRow,
): TrainingProjectReviewProjection | null => {
  if (!row.asset_class) {
    return null;
  }
  return {
    marketPresetId: String(row.market_preset_id || "").trim(),
    assetClass:
      row.asset_class === "FUTURES" ||
      row.asset_class === "FOREX" ||
      row.asset_class === "CRYPTO"
        ? row.asset_class
        : "STOCK",
    tradeSettlementMode: row.trade_settlement_mode === "T1" ? "T1" : "T0",
    allowLongMarginTrading: Boolean(row.allow_long_margin_trading),
    allowShortSelling: Boolean(row.allow_short_selling),
    leverageMultiple: Math.max(1, normalizeNumber(row.leverage_multiple, 1)),
    usesMakerTaker: Boolean(row.uses_maker_taker),
    fundingRate: normalizeNumber(row.funding_rate),
    grossPnl: normalizeNumber(row.gross_pnl),
    feeAndTaxCost: normalizeNumber(row.fee_and_tax_cost),
    borrowCost: normalizeNumber(row.borrow_cost),
    decisionAverageSeconds: Math.max(
      0,
      normalizeNumber(row.decision_average_seconds),
    ),
    tradeWinRate: Math.max(0, normalizeNumber(row.trade_win_rate)),
    sessionProfitFactor:
      row.session_profit_factor === null
        ? null
        : Number.isFinite(Number(row.session_profit_factor))
          ? Number(row.session_profit_factor)
          : null,
    expectancyPerTrade: normalizeNumber(row.expectancy_per_trade),
    peakMaintenanceUtilizationRate: normalizeNumber(
      row.peak_maintenance_utilization_rate,
    ),
    marginMinBufferRate: normalizeNumber(row.margin_min_buffer_rate, 1),
    trendAligned: Boolean(row.trend_aligned),
    criticalFailure: Boolean(row.critical_failure),
    lossCutDelayBarsTotal: Math.max(
      0,
      normalizeNumber(row.loss_cut_delay_bars_total),
    ),
    lossCutDelayBarsCount: Math.max(
      0,
      Math.floor(normalizeNumber(row.loss_cut_delay_bars_count)),
    ),
    analytics: {
      closedTrades: Math.max(0, Math.floor(normalizeNumber(row.closed_trades))),
      winningTrades: Math.max(0, Math.floor(normalizeNumber(row.winning_trades))),
      losingTrades: Math.max(0, Math.floor(normalizeNumber(row.losing_trades))),
      profitTradeTotal: normalizeNumber(row.profit_trade_total),
      lossTradeTotal: normalizeNumber(row.loss_trade_total),
      averageHoldBars: Math.max(0, normalizeNumber(row.average_hold_bars)),
      addPositionCount: Math.max(
        0,
        Math.floor(normalizeNumber(row.add_position_count)),
      ),
      reducePositionCount: Math.max(
        0,
        Math.floor(normalizeNumber(row.reduce_position_count)),
      ),
      fullPositionCount: Math.max(
        0,
        Math.floor(normalizeNumber(row.full_position_count)),
      ),
      maxConsecutiveWins: Math.max(
        0,
        Math.floor(normalizeNumber(row.max_consecutive_wins)),
      ),
      maxConsecutiveLosses: Math.max(
        0,
        Math.floor(normalizeNumber(row.max_consecutive_losses)),
      ),
      totalSlippage: Math.max(0, normalizeNumber(row.total_slippage)),
      totalFeesFromFills: Math.max(
        0,
        normalizeNumber(row.total_fees_from_fills),
      ),
    },
  };
};

const mapReviewProjectRow = (
  row: ReplayReviewProjectRow,
): TrainingProjectRecord => {
  const summary = parseTrainingSummaryJson(row.summary_json);
  const operatorSummary = (() => {
    try {
      return normalizeOperatorSummary(
        JSON.parse(String(row.operator_summary_json || "null")),
      );
    } catch {
      return buildHumanOperatorSummary();
    }
  })();
  return {
    id: row.project_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    initialTotal: normalizeNumber(row.initial_total, summary.initialAsset),
    totalPnl: normalizeNumber(row.total_pnl, summary.totalPnl),
    profitRate: normalizeNumber(row.profit_rate, summary.profitRate),
    durationDays: Math.max(0, Math.floor(normalizeNumber(row.duration_days))),
    totalTrades: Math.max(0, Math.floor(normalizeNumber(row.total_trades))),
    symbol: row.symbol,
    samplePoolId: row.sample_pool_id,
    samplePoolName: row.sample_pool_name,
    baseTimeframe: (row.base_timeframe || "").trim() || "1d",
    trainingDateRange: row.training_date_range,
    summary,
    finalEquity: normalizeNumber(row.final_equity, summary.endingAsset),
    equityReturnRate: normalizeNumber(
      row.equity_return_rate,
      summary.assetReturnRate,
    ),
    assetClass:
      row.asset_class === "FUTURES" ||
      row.asset_class === "FOREX" ||
      row.asset_class === "CRYPTO"
        ? row.asset_class
        : "STOCK",
    reviewProjection: mapReviewProjection(row),
    operatorSummary,
  };
};

const loadReviewProjects = (
  projectIds: readonly string[],
): TrainingProjectRecord[] => {
  const normalizedProjectIds = normalizeProjectIds(projectIds);
  return loadReplayReviewProjectRows(normalizedProjectIds).map(
    mapReviewProjectRow,
  );
};

const buildBundle = async (
  request: ReviewBundleRequest,
): Promise<ReplayReviewConsoleBundlePayload> => {
  const projects = loadReviewProjects(request.projectIds);
  return {
    report: buildReplayReviewReport({
      projects: projects as unknown as TrainingProjectRecord[],
      window: request.window,
      anchorMs: request.anchorMs,
      nowMs: request.nowMs,
    }),
    diagnostics: buildReplayReviewDiagnosticsFromProjects(
      projects as unknown as TrainingProjectRecord[],
      normalizeProjectIds(request.projectIds),
      {
        window: request.window,
        anchorMs: request.anchorMs,
        nowMs: request.nowMs,
      },
    ),
  };
};

export const getReplayReviewConsoleBundle = async (
  request: ReviewBundleRequest,
): Promise<ReplayReviewConsoleBundlePayload> => {
  const cacheKey = buildBundleCacheKey(request);
  const now = Date.now();
  pruneReviewBundleTaskCache(now);
  const cached = reviewBundleTaskCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    reviewBundleTaskCache.delete(cacheKey);
    reviewBundleTaskCache.set(cacheKey, cached);
    return cached.task;
  }
  const task = buildBundle(request)
    .then((payload) => {
      const refreshedAt = Date.now();
      reviewBundleTaskCache.set(cacheKey, {
        expiresAt: refreshedAt + REVIEW_BUNDLE_CACHE_TTL_MS,
        task: Promise.resolve(payload),
      });
      pruneReviewBundleTaskCache(refreshedAt);
      return payload;
    })
    .catch((error) => {
      reviewBundleTaskCache.delete(cacheKey);
      throw error;
    });
  reviewBundleTaskCache.set(cacheKey, {
    expiresAt: now + REVIEW_BUNDLE_CACHE_TTL_MS,
    task,
  });
  pruneReviewBundleTaskCache(now);
  return task;
};
