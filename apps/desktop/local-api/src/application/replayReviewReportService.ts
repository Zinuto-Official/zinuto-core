// SPDX-License-Identifier: GPL-3.0-only

import {
  deriveReplayProfitFactor,
  type ReplayCurvePoint,
  type ReplayRatioState,
} from '@zinuto/shared/replay';
import type { TradingAssetClass } from '@zinuto/shared/trading';
import {
  applyReplayReviewWindowToProjects,
  type ReplayReviewWindow,
  type ReplayReviewWindowInput,
} from '@zinuto/shared/domain-calculations/replay-review-window';
import { type TrainingProjectRecord } from './historyService.js';
import {
  ASSET_CLASS_ORDER,
  clamp,
  deriveSessionMetric,
  normalizeNumber,
  resolveReplayArchive,
  type ReplayReviewSessionMetric,
} from './replayReviewSessionMetric.js';

export type { ReplayReviewSessionMetric } from './replayReviewSessionMetric.js';

const SAMPLE_POOL_ALL_ID = '__sample_pool_all__';
const TREND_RECENT_WINDOW_MAX = 10;
const TREND_DRAWDOWN_ANOMALY_THRESHOLD = 0.3;

type ReplayReviewCoverage = {
  filteredProjectCount: number;
  resolvedProjectCount: number;
  replayReadyProjectCount: number;
  pendingProjectCount: number;
};

type ReplayReviewHeroMetrics = {
  totalNetPnl: number;
  tradeWinRate: number | null;
  profitFactor: number | null;
  profitFactorState: ReplayRatioState;
  maxDrawdownRate: number;
  maxConsecutiveLosses: number;
};

type ReplayReviewArenaCard = {
  assetClass: TradingAssetClass;
  sessionCount: number;
  netPnl: number;
  avgReturnRate: number;
  tradeWinRate: number;
  averageHoldBars: number;
  fullPositionRate: number;
  fullPositionCount: number;
  sparklinePoints: ReplayCurvePoint[];
};

type ReplayReviewScatterPoint = {
  sessionId: string;
  symbol: string;
  assetClass: TradingAssetClass;
  outcome: 'PROFIT' | 'LOSS' | 'FLAT';
  pnl: number;
  returnRate: number;
  mfeRate: number;
  maeRate: number;
  holdBars: number;
};

type ReplayReviewWaterfallStep = {
  key: 'gross' | 'slippage' | 'fees' | 'borrow' | 'net';
  value: number;
};

type ReplayReviewBehaviorComparison = {
  key: 'withAdd' | 'withoutAdd';
  sessionCount: number;
  winRate: number;
};

type ReplayReviewRadarMetric = {
  label: string;
  score: number;
  fullMark: number;
  rawValue: number | null;
  valueKind: 'ratio' | 'number' | 'bars' | 'money';
  digits?: number;
};

type ReplayReviewTrendReasonKey =
  | 'criticalFailure'
  | 'deepDrawdown'
  | 'weakReturn'
  | 'representative';

type ReplayReviewTrendPoint = {
  sessionId: string;
  rollingAverage: number;
  rollingWindowSize: number;
  isAnomaly: boolean;
  reasonKey: ReplayReviewTrendReasonKey;
};

type ReplayReviewTrendFacts = {
  recentWindowSize: number;
  recentAverage: number | null;
  positiveShare: number | null;
  anomalyCount: number;
  points: ReplayReviewTrendPoint[];
};

export type ReplayReviewReportPayload = {
  samplePoolOptions: Array<{ id: string; name: string; count: number }>;
  coverage: ReplayReviewCoverage;
  heroMetrics: ReplayReviewHeroMetrics;
  heroProfitFactorReady: boolean;
  trendFacts: ReplayReviewTrendFacts;
  arenaCards: ReplayReviewArenaCard[];
  curvePoints: ReplayCurvePoint[];
  drawdownPoints: ReplayCurvePoint[];
  scatterPoints: ReplayReviewScatterPoint[];
  waterfallSteps: ReplayReviewWaterfallStep[];
  behaviorComparison: ReplayReviewBehaviorComparison[];
  radarMetrics: ReplayReviewRadarMetric[];
  sessions: ReplayReviewSessionMetric[];
};

export type ReplayReviewReportRequest = {
  projectIds: readonly string[];
  window?: ReplayReviewWindow;
  anchorMs?: number;
  nowMs?: number;
};

const buildSamplePoolOptions = (
  projects: TrainingProjectRecord[],
): Array<{ id: string; name: string; count: number }> => {
  const poolMap = new Map<string, { id: string; name: string; count: number }>();
  projects.forEach((project) => {
    const id = (project.samplePoolId || '').trim();
    if (!id) {
      return;
    }
    const current = poolMap.get(id) ?? {
      id,
      name: project.samplePoolName || id,
      count: 0,
    };
    current.count += 1;
    poolMap.set(id, current);
  });
  return [
    {
      id: SAMPLE_POOL_ALL_ID,
      name: 'All',
      count: projects.length,
    },
    ...Array.from(poolMap.values()).sort(
      (left, right) => right.count - left.count || left.name.localeCompare(right.name),
    ),
  ];
};

const buildCoverage = ({
  projects,
  sessions,
}: {
  projects: TrainingProjectRecord[];
  sessions: ReplayReviewSessionMetric[];
}): ReplayReviewCoverage => {
  const filtered = projects.length;
  const resolved = sessions.length;
  const pending = Math.max(0, filtered - resolved);
  return {
    filteredProjectCount: filtered,
    resolvedProjectCount: resolved,
    replayReadyProjectCount: resolved,
    pendingProjectCount: pending,
  };
};

const deriveHeroMetrics = (
  sessions: ReplayReviewSessionMetric[],
): { metrics: ReplayReviewHeroMetrics; profitFactorReady: boolean } => {
  const profitFactor = deriveReplayProfitFactor(
    sessions.reduce(
      (sum, session) => sum + session.analytics.profitTradeTotal,
      0,
    ),
    sessions.reduce(
      (sum, session) => sum + session.analytics.lossTradeTotal,
      0,
    ),
  );
  const totalNetPnl = sessions.reduce((sum, session) => sum + normalizeNumber(session.project.totalPnl), 0);
  const closedTrades = sessions.reduce(
    (sum, session) => sum + session.analytics.closedTrades,
    0,
  );
  const winningTrades = sessions.reduce(
    (sum, session) => sum + session.analytics.winningTrades,
    0,
  );
  const maxDrawdownRate = sessions.reduce(
    (maxValue, session) => Math.max(maxValue, session.maxDrawdownRate),
    0,
  );
  const maxConsecutiveLosses = sessions.reduce(
    (maxValue, session) =>
      Math.max(maxValue, session.analytics.maxConsecutiveLosses),
    0,
  );
  const tradeWinRate =
    closedTrades > 0 ? winningTrades / closedTrades : null;
  return {
    metrics: {
      totalNetPnl,
      tradeWinRate,
      profitFactor: profitFactor.value,
      profitFactorState: profitFactor.state,
      maxDrawdownRate,
      maxConsecutiveLosses,
    },
    profitFactorReady: profitFactor.state !== 'NOT_AVAILABLE',
  };
};

const buildArenaCards = (
  sessions: ReplayReviewSessionMetric[],
): ReplayReviewArenaCard[] =>
  ASSET_CLASS_ORDER.map((assetClass) => {
    const assetSessions = sessions.filter(
      (session) => session.assetClass === assetClass,
    );
    const ordered = [...assetSessions].sort(
      (left, right) =>
        left.projectTs - right.projectTs || left.id.localeCompare(right.id),
    );
    const netPnl = assetSessions.reduce(
      (sum, session) => sum + normalizeNumber(session.project.totalPnl),
      0,
    );
    const avgReturnRate =
      assetSessions.length > 0
        ? assetSessions.reduce((sum, session) => sum + session.returnRate, 0) /
          assetSessions.length
        : 0;
    const closedTrades = assetSessions.reduce(
      (sum, session) => sum + session.analytics.closedTrades,
      0,
    );
    const winningTrades = assetSessions.reduce(
      (sum, session) => sum + session.analytics.winningTrades,
      0,
    );
    const averageHoldBars =
      assetSessions.length > 0
        ? assetSessions.reduce(
            (sum, session) => sum + session.analytics.averageHoldBars,
            0,
          ) / assetSessions.length
        : 0;
    const heavySessions = assetSessions.filter(
      (session) => session.analytics.fullPositionCount > 0,
    ).length;
    const fullPositionRate =
      assetSessions.length > 0 ? heavySessions / assetSessions.length : 0;
    const sparklinePoints = ordered.map((session, sessionIndex) => ({
      ts:
        session.projectDateKey ||
        session.project.createdAt ||
        session.project.updatedAt ||
        `${assetClass}-${sessionIndex + 1}`,
      value: session.returnRate,
    }));
    const tradeWinRate =
      closedTrades > 0 ? winningTrades / closedTrades : 0;
    return {
      assetClass,
      sessionCount: assetSessions.length,
      netPnl,
      avgReturnRate,
      tradeWinRate,
      averageHoldBars,
      fullPositionRate,
      fullPositionCount: assetSessions.reduce(
        (sum, session) => sum + session.analytics.fullPositionCount,
        0,
      ),
      sparklinePoints,
    };
  });

const buildAggregateCurve = (
  sessions: ReplayReviewSessionMetric[],
): { curve: ReplayCurvePoint[]; drawdown: ReplayCurvePoint[] } => {
  if (!sessions.length) {
    return { curve: [], drawdown: [] };
  }
  const orderedSessions = [...sessions].sort((left, right) => {
    const diff =
      left.projectTs - right.projectTs;
    if (diff !== 0) {
      return diff;
    }
    return left.id.localeCompare(right.id);
  });
  const firstInitial = Math.max(
    0,
    normalizeNumber(orderedSessions[0]?.project.initialTotal),
  );
  let runningEquity = firstInitial;
  let peak = runningEquity;
  const curve: ReplayCurvePoint[] = [];
  const drawdown: ReplayCurvePoint[] = [];

  orderedSessions.forEach((session, sessionIndex) => {
    const archive = resolveReplayArchive(session.detail);
    const initialCapital = Math.max(0, normalizeNumber(session.project.initialTotal));
    const sessionBase = curve.length > 0 ? runningEquity : initialCapital;
    const equityCurve = Array.isArray(archive?.equityCurve)
      ? archive.equityCurve
      : [];
    if (!equityCurve.length) {
      const fallbackTs =
        session.projectDateKey ||
        `${session.project.createdAt || session.project.updatedAt || sessionIndex}`;
      const value = sessionBase + normalizeNumber(session.project.totalPnl);
      curve.push({ ts: fallbackTs, value });
      peak = Math.max(peak, value);
      drawdown.push({
        ts: fallbackTs,
        value: Math.max(0, peak - value),
      });
      runningEquity = value;
      return;
    }

    equityCurve.forEach((point, pointIndex) => {
      const pointValue = normalizeNumber(point?.value, initialCapital);
      const value = sessionBase + (pointValue - initialCapital);
      const ts =
        typeof point?.ts === 'string' && point.ts.trim()
          ? point.ts
          : `${session.project.createdAt || session.project.updatedAt || sessionIndex}-${pointIndex + 1}`;
      curve.push({ ts, value });
      peak = Math.max(peak, value);
      drawdown.push({
        ts,
        value: Math.max(0, peak - value),
      });
    });

    runningEquity = sessionBase + normalizeNumber(session.project.totalPnl);
  });

  return { curve, drawdown };
};

const buildScatterPoints = (
  sessions: ReplayReviewSessionMetric[],
): ReplayReviewScatterPoint[] =>
  sessions.flatMap((session) =>
    session.tradeRounds.map((round) => ({
      sessionId: session.id,
      symbol: session.project.symbol,
      assetClass: session.assetClass,
      outcome: round.pnl > 0 ? 'PROFIT' : round.pnl < 0 ? 'LOSS' : 'FLAT',
      pnl: round.pnl,
      returnRate: round.returnRate,
      mfeRate: round.mfeRate,
      maeRate: round.maeRate,
      holdBars: round.holdBars,
    })),
  );

const buildWaterfallSteps = (
  sessions: ReplayReviewSessionMetric[],
): ReplayReviewWaterfallStep[] => {
  const gross = sessions.reduce((sum, session) => sum + session.grossPnl, 0);
  const slippage = sessions.reduce(
    (sum, session) => sum + session.slippageCost,
    0,
  );
  const fees = sessions.reduce((sum, session) => sum + session.feeAndTaxCost, 0);
  const borrow = sessions.reduce((sum, session) => sum + session.borrowCost, 0);
  const net = sessions.reduce(
    (sum, session) => sum + normalizeNumber(session.project.totalPnl),
    0,
  );
  return [
    { key: 'gross', value: gross },
    { key: 'slippage', value: -slippage },
    { key: 'fees', value: -fees },
    { key: 'borrow', value: -borrow },
    { key: 'net', value: net },
  ];
};

const buildBehaviorComparison = (
  sessions: ReplayReviewSessionMetric[],
): ReplayReviewBehaviorComparison[] => {
  const groups: Array<{
    key: 'withAdd' | 'withoutAdd';
    items: ReplayReviewSessionMetric[];
  }> = [
    {
      key: 'withAdd',
      items: sessions.filter((session) => session.analytics.addPositionCount > 0),
    },
    {
      key: 'withoutAdd',
      items: sessions.filter((session) => session.analytics.addPositionCount <= 0),
    },
  ];
  return groups.map((group) => {
    const sessionCount = group.items.length;
    const profitableCount = group.items.filter(
      (session) => normalizeNumber(session.project.totalPnl) > 0,
    ).length;
    return {
      key: group.key,
      sessionCount,
      winRate: sessionCount > 0 ? profitableCount / sessionCount : 0,
    };
  });
};

const buildRadarMetrics = (
  sessions: ReplayReviewSessionMetric[],
): ReplayReviewRadarMetric[] => {
  if (!sessions.length) {
    return [
      { label: 'winRate', score: 0, fullMark: 100, rawValue: 0, valueKind: 'ratio' },
      { label: 'profitLossRatio', score: 0, fullMark: 100, rawValue: 0, valueKind: 'number', digits: 2 },
      { label: 'averageHoldBars', score: 0, fullMark: 100, rawValue: 0, valueKind: 'bars', digits: 1 },
      { label: 'fullPosition', score: 0, fullMark: 100, rawValue: 0, valueKind: 'number', digits: 0 },
      { label: 'cost', score: 0, fullMark: 100, rawValue: 0, valueKind: 'money' },
    ];
  }
  const closedTrades = sessions.reduce(
    (sum, session) => sum + session.analytics.closedTrades,
    0,
  );
  const winningTrades = sessions.reduce(
    (sum, session) => sum + session.analytics.winningTrades,
    0,
  );
  const profitSum = sessions.reduce(
    (sum, session) => sum + session.analytics.profitTradeTotal,
    0,
  );
  const lossSum = Math.abs(
    sessions.reduce((sum, session) => sum + session.analytics.lossTradeTotal, 0),
  );
  const averageHoldBars =
    sessions.reduce((sum, session) => sum + session.analytics.averageHoldBars, 0) /
    sessions.length;
  const heavySessions = sessions.length
    ? sessions.filter((session) => session.analytics.fullPositionCount > 0).length
    : 0;
  const totalCost = sessions.reduce(
    (sum, session) => sum + session.slippageCost + session.feeAndTaxCost + session.borrowCost,
    0,
  );
  const tradeWinRate = closedTrades > 0 ? winningTrades / closedTrades : 0;
  const profitFactor = deriveReplayProfitFactor(profitSum, lossSum);
  const frictionScore =
    profitSum > 1e-9
      ? Math.max(0, 100 - Math.min(1, totalCost / profitSum) * 100)
      : totalCost > 0
        ? 0
        : 100;
  return [
    {
      label: 'winRate',
      score: clamp(tradeWinRate * 100, 0, 100),
      fullMark: 100,
      rawValue: tradeWinRate,
      valueKind: 'ratio',
    },
    {
      label: 'profitLossRatio',
      score:
        profitFactor.state === 'POSITIVE_INFINITY'
          ? 100
          : clamp((profitFactor.value ?? 0) * 25, 0, 100),
      fullMark: 100,
      rawValue: profitFactor.value,
      valueKind: 'number',
      digits: 2,
    },
    {
      label: 'averageHoldBars',
      score: clamp((averageHoldBars / 12) * 100, 0, 100),
      fullMark: 100,
      rawValue: averageHoldBars,
      valueKind: 'bars',
      digits: 1,
    },
    {
      label: 'fullPosition',
      score: clamp(100 - (heavySessions / sessions.length) * 100, 0, 100),
      fullMark: 100,
      rawValue: sessions.reduce(
        (sum, session) => sum + session.analytics.fullPositionCount,
        0,
      ),
      valueKind: 'number',
      digits: 0,
    },
    {
      label: 'cost',
      score: clamp(frictionScore, 0, 100),
      fullMark: 100,
      rawValue: totalCost,
      valueKind: 'money',
    },
  ];
};

const averageNumbers = (values: number[]): number | null =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

const isTrendAnomalySession = (session: ReplayReviewSessionMetric): boolean =>
  session.criticalFailure ||
  normalizeNumber(session.maxDrawdownRate) >= TREND_DRAWDOWN_ANOMALY_THRESHOLD;

const selectTrendReasonKey = (
  session: ReplayReviewSessionMetric,
): ReplayReviewTrendReasonKey => {
  if (session.criticalFailure) {
    return 'criticalFailure';
  }
  if (normalizeNumber(session.maxDrawdownRate) >= TREND_DRAWDOWN_ANOMALY_THRESHOLD) {
    return 'deepDrawdown';
  }
  if (normalizeNumber(session.returnRate) <= 0) {
    return 'weakReturn';
  }
  return 'representative';
};

const buildTrendFacts = (
  sessions: ReplayReviewSessionMetric[],
): ReplayReviewTrendFacts => {
  if (!sessions.length) {
    return {
      recentWindowSize: 0,
      recentAverage: null,
      positiveShare: null,
      anomalyCount: 0,
      points: [],
    };
  }

  const orderedSessions = [...sessions].sort((left, right) => {
    const diff = left.projectTs - right.projectTs;
    if (diff !== 0) {
      return diff;
    }
    return left.id.localeCompare(right.id);
  });
  const recentWindowSize = Math.min(
    TREND_RECENT_WINDOW_MAX,
    orderedSessions.length,
  );
  const recentSessions = orderedSessions.slice(-recentWindowSize);
  const positiveCount = recentSessions.filter(
    (session) => normalizeNumber(session.returnRate) > 0,
  ).length;

  return {
    recentWindowSize,
    recentAverage: averageNumbers(
      recentSessions.map((session) => normalizeNumber(session.returnRate)),
    ),
    positiveShare:
      recentSessions.length > 0 ? positiveCount / recentSessions.length : null,
    anomalyCount: orderedSessions.filter(isTrendAnomalySession).length,
    points: orderedSessions.map((session, index) => {
      const start = Math.max(0, index - TREND_RECENT_WINDOW_MAX + 1);
      const windowSessions = orderedSessions.slice(start, index + 1);
      return {
        sessionId: session.id,
        rollingAverage:
          averageNumbers(
            windowSessions.map((item) => normalizeNumber(item.returnRate)),
          ) ?? 0,
        rollingWindowSize: windowSessions.length,
        isAnomaly: isTrendAnomalySession(session),
        reasonKey: selectTrendReasonKey(session),
      };
    }),
  };
};

type ReplayReviewReportParams = {
  projects: TrainingProjectRecord[];
} & ReplayReviewWindowInput;

export const buildReplayReviewReport = ({
  projects,
  window,
  anchorMs,
  nowMs,
}: ReplayReviewReportParams): ReplayReviewReportPayload => {
  const windowedProjects = applyReplayReviewWindowToProjects(projects, {
    window,
    anchorMs,
    nowMs,
  });
  const sessions = windowedProjects
    .map((project) => deriveSessionMetric(project))
    .filter((session): session is ReplayReviewSessionMetric => Boolean(session));
  const samplePoolOptions = buildSamplePoolOptions(windowedProjects);
  const coverage = buildCoverage({ projects: windowedProjects, sessions });
  const heroResult = deriveHeroMetrics(sessions);

  const aggregateCurve = buildAggregateCurve(sessions);
  return {
    samplePoolOptions,
    coverage,
    heroMetrics: heroResult.metrics,
    heroProfitFactorReady: heroResult.profitFactorReady,
    trendFacts: buildTrendFacts(sessions),
    arenaCards: buildArenaCards(sessions),
    curvePoints: aggregateCurve.curve,
    drawdownPoints: aggregateCurve.drawdown,
    scatterPoints: buildScatterPoints(sessions),
    waterfallSteps: buildWaterfallSteps(sessions),
    behaviorComparison: buildBehaviorComparison(sessions),
    radarMetrics: buildRadarMetrics(sessions),
    sessions,
  };
};
