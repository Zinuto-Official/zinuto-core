// SPDX-License-Identifier: GPL-3.0-only

import { type TrainingProjectRecord } from './historyService.js';
import {
  applyReplayReviewWindowToProjects,
  type ReplayReviewWindow,
  type ReplayReviewWindowInput,
} from '@zinuto/shared/domain-calculations/replay-review-window';
import {
  deriveReplayProfitFactor,
  type ReplayRatioState,
} from '@zinuto/shared/replay';
import {
  clamp,
  normalizeNumber,
  normalizeProjectIds,
  resolveEnvironmentKey,
  resolveEnvironmentLabel,
  selectRepresentativeProjectIds,
  toFixedRound,
  type ReplayReviewEnvironmentContext,
} from './replayReviewEnvironmentContext.js';
import {
  resolveProjectMetrics,
  type ReplayReviewProjectMetrics,
} from './replayReviewDiagnostics/metrics.js';

export type ReplayReviewEnvironmentMatrixRow = {
  environmentKey: string;
  label: string;
  sessionCount: number;
  profitLossRatio: number | null;
  profitLossRatioState: ReplayRatioState;
  expectancy: number;
  maxDrawdownRate: number;
  sampleAdequacy: 'INSUFFICIENT' | 'SUFFICIENT';
  representativeProjectIds: string[];
  context: ReplayReviewEnvironmentContext;
};

export type ReplayReviewExitDisciplinePayload = {
  avgLossCutDelayBars: number;
  dangerDelaySessionRate: number;
  representativeProjectIds: string[];
};

export type ReplayReviewCapitalDisciplinePayload = {
  enabled: boolean;
  dangerSessionRate: number;
  breachCount: number;
  p70: number;
  p85: number;
  p100: number;
  representativeProjectIds: string[];
};

export type ReplayReviewMarginSafetyZone = 'SAFE' | 'CROWDED' | 'DANGER' | 'BREACH';

export type ReplayReviewMarginSafetyPoint = {
  sessionId: string;
  sequenceIndex: number;
  sequenceText: string;
  symbol: string;
  minBufferRate: number;
  peakPressureRate: number;
  zone: ReplayReviewMarginSafetyZone;
  isRepresentative: boolean;
};

export type ReplayReviewMarginSafetyZoneSummary = {
  zone: ReplayReviewMarginSafetyZone;
  count: number;
  share: number;
};

export type ReplayReviewMarginSafetyFocusWindow = {
  isDense: boolean;
  startIndex: number;
  endIndex: number;
  startPercent: number;
  endPercent: number;
};

export type ReplayReviewMarginSafetyPayload = {
  dangerSessionShare: number;
  dangerSessionCount: number;
  minSafetyBufferRate: number;
  breachSessionCount: number;
  sessionSafetyPoints: ReplayReviewMarginSafetyPoint[];
  zoneSummaries: ReplayReviewMarginSafetyZoneSummary[];
  worstSessionPoints: ReplayReviewMarginSafetyPoint[];
  focusWindow: ReplayReviewMarginSafetyFocusWindow;
};

export type ReplayReviewActionableAlert = {
  id: 'ENVIRONMENT_MISMATCH' | 'EXIT_DELAY' | 'MARGIN_PRESSURE';
  severity: 'WATCH' | 'ALERT';
  currentValue: number;
  thresholdValue: number;
  details: Record<string, number>;
  representativeProjectIds: string[];
};

export type ReplayReviewArchiveFinancialDetail = {
  projectId: string;
  grossPnl: number;
  netPnl: number;
  slippageCost: number;
  feeAndTaxCost: number;
  fundingOrBorrowCost: number;
  environmentKey: string;
  context: ReplayReviewEnvironmentContext;
  marginDiagnostics: {
    maxUtilizationRate: number;
    minBufferRate: number;
  };
};

export type ReplayReviewDiagnosticsPayload = {
  generatedAt: string;
  totals: {
    requestedProjects: number;
    resolvedProjects: number;
    missingProjects: number;
  };
  missingProjectIds: string[];
  environmentMatrix: ReplayReviewEnvironmentMatrixRow[];
  exitDiscipline: ReplayReviewExitDisciplinePayload;
  capitalDiscipline: ReplayReviewCapitalDisciplinePayload;
  marginSafety: ReplayReviewMarginSafetyPayload;
  actionableAlerts: ReplayReviewActionableAlert[];
  archiveFinancialDetailsById: Record<string, ReplayReviewArchiveFinancialDetail>;
};

export type ReplayReviewDiagnosticsRequest = {
  projectIds: readonly string[];
  window?: ReplayReviewWindow;
  anchorMs?: number;
  nowMs?: number;
};

const ENVIRONMENT_SAMPLE_SUFFICIENT_COUNT = 5;
const EXIT_DELAY_DANGER_BARS = 6;
const MARGIN_WARNING_RATE = 0.7;
const MARGIN_DANGER_RATE = 0.85;
const MARGIN_BUFFER_SAFE_RATE = 0.3;
const MARGIN_BUFFER_DANGER_RATE = 0.15;
const MARGIN_BUFFER_BREACH_RATE = 0;
const MARGIN_SAFETY_DENSE_POINT_THRESHOLD = 180;
const MARGIN_SAFETY_FOCUS_POINT_COUNT = 120;
const MARGIN_SAFETY_WORST_SESSION_COUNT = 3;
const MARGIN_SAFETY_ZONE_ORDER: ReplayReviewMarginSafetyZone[] = [
  'BREACH',
  'DANGER',
  'CROWDED',
  'SAFE',
];
const nowIso = (): string => new Date().toISOString();

const buildEnvironmentMatrix = (
  metrics: ReplayReviewProjectMetrics[],
): ReplayReviewEnvironmentMatrixRow[] => {
  if (!metrics.length) {
    return [];
  }
  const grouped = new Map<
    string,
    {
      label: string;
      context: ReplayReviewEnvironmentContext;
      items: ReplayReviewProjectMetrics[];
    }
  >();
  for (const metric of metrics) {
    const environmentKey = resolveEnvironmentKey(metric.environment);
    const existing = grouped.get(environmentKey);
    if (existing) {
      existing.items.push(metric);
      continue;
    }
    grouped.set(environmentKey, {
      label: resolveEnvironmentLabel(metric.environment),
      context: metric.environment,
      items: [metric],
    });
  }

  return Array.from(grouped.entries())
    .map(([environmentKey, group]) => {
      const sessionCount = group.items.length;
      const profitTradeTotal = group.items.reduce(
        (sum, item) => sum + item.profitTradeTotal,
        0,
      );
      const lossTradeTotal = group.items.reduce(
        (sum, item) => sum + item.lossTradeTotal,
        0,
      );
      const profitLossRatio = deriveReplayProfitFactor(
        profitTradeTotal,
        lossTradeTotal,
      );
      const expectancy =
        sessionCount > 0
          ? group.items.reduce((sum, item) => sum + item.returnRate, 0) / sessionCount
          : 0;
      const maxDrawdownRate = group.items.reduce(
        (maxValue, item) => Math.max(maxValue, item.maxDrawdownRate),
        0,
      );
      const representativeProjectIds = selectRepresentativeProjectIds(
        group.items,
        (item) =>
          Math.max(0, -item.returnRate) + item.maxDrawdownRate,
      );

      return {
        environmentKey,
        label: group.label,
        sessionCount,
        profitLossRatio:
          profitLossRatio.value === null
            ? null
            : toFixedRound(profitLossRatio.value, 8),
        profitLossRatioState: profitLossRatio.state,
        expectancy: toFixedRound(expectancy, 8),
        maxDrawdownRate: toFixedRound(maxDrawdownRate, 8),
        sampleAdequacy: (
          sessionCount < ENVIRONMENT_SAMPLE_SUFFICIENT_COUNT
            ? 'INSUFFICIENT'
            : 'SUFFICIENT'
        ) as ReplayReviewEnvironmentMatrixRow['sampleAdequacy'],
        representativeProjectIds,
        context: group.context,
      };
    })
    .sort((left, right) => {
      const adequacyDiff =
        Number(right.sampleAdequacy === 'SUFFICIENT') -
        Number(left.sampleAdequacy === 'SUFFICIENT');
      if (adequacyDiff !== 0) {
        return adequacyDiff;
      }
      if (right.sessionCount !== left.sessionCount) {
        return right.sessionCount - left.sessionCount;
      }
      return right.expectancy - left.expectancy;
    });
};

const buildExitDiscipline = (
  metrics: ReplayReviewProjectMetrics[],
): ReplayReviewExitDisciplinePayload => {
  if (!metrics.length) {
    return {
      avgLossCutDelayBars: 0,
      dangerDelaySessionRate: 0,
      representativeProjectIds: [],
    };
  }
  const avgLossCutDelayBars =
    metrics.reduce((sum, item) => sum + item.lossCutDelayBarsTotal, 0) /
    Math.max(
      1,
      metrics.reduce((sum, item) => sum + item.lossCutDelayBarsCount, 0),
    );
  const dangerSessions = metrics.filter((item) => {
    if (item.lossCutDelayBarsCount <= 0) {
      return false;
    }
    return item.lossCutDelayBarsTotal / item.lossCutDelayBarsCount >= EXIT_DELAY_DANGER_BARS;
  });
  const dangerDelaySessionRate =
    metrics.length > 0 ? dangerSessions.length / metrics.length : 0;

  return {
    avgLossCutDelayBars: toFixedRound(avgLossCutDelayBars, 8),
    dangerDelaySessionRate: toFixedRound(dangerDelaySessionRate, 8),
    representativeProjectIds: selectRepresentativeProjectIds(
      metrics.filter((item) => item.lossCutDelayBarsCount > 0),
      (item) => item.lossCutDelayBarsTotal / Math.max(1, item.lossCutDelayBarsCount),
    ),
  };
};

const buildCapitalDiscipline = (
  metrics: ReplayReviewProjectMetrics[],
): ReplayReviewCapitalDisciplinePayload => {
  const capitalMetrics = metrics.filter(
    (item) =>
      item.environment.allowLongMarginTrading ||
      item.environment.allowShortSelling ||
      item.environment.leverageMultiple > 1.01,
  );
  const dangerSessions = capitalMetrics.filter(
    (item) => item.marginMaxUtilizationRate >= MARGIN_DANGER_RATE,
  );
  const warningSessions = capitalMetrics.filter(
    (item) => item.marginMaxUtilizationRate >= MARGIN_WARNING_RATE,
  );
  const breachCount = capitalMetrics.filter(
    (item) => item.marginMaxUtilizationRate >= 1,
  ).length;

  return {
    enabled: capitalMetrics.length > 0,
    dangerSessionRate:
      capitalMetrics.length > 0
        ? toFixedRound(dangerSessions.length / capitalMetrics.length, 8)
        : 0,
    breachCount,
    p70: warningSessions.length,
    p85: dangerSessions.length,
    p100: breachCount,
    representativeProjectIds: selectRepresentativeProjectIds(
      capitalMetrics,
      (item) => item.marginMaxUtilizationRate,
    ),
  };
};

const isMarginRelevantMetric = (metric: ReplayReviewProjectMetrics): boolean =>
  metric.environment.allowLongMarginTrading ||
  metric.environment.allowShortSelling ||
  metric.environment.leverageMultiple > 1.01;

const resolveMarginSafetyZone = (
  bufferRate: number,
): ReplayReviewMarginSafetyZone => {
  if (bufferRate <= MARGIN_BUFFER_BREACH_RATE) {
    return 'BREACH';
  }
  if (bufferRate <= MARGIN_BUFFER_DANGER_RATE) {
    return 'DANGER';
  }
  if (bufferRate <= MARGIN_BUFFER_SAFE_RATE) {
    return 'CROWDED';
  }
  return 'SAFE';
};

const buildMarginSafetyFocusWindow = (
  points: ReplayReviewMarginSafetyPoint[],
): ReplayReviewMarginSafetyFocusWindow => {
  const totalCount = points.length;
  if (totalCount <= 0) {
    return {
      isDense: false,
      startIndex: 0,
      endIndex: 0,
      startPercent: 0,
      endPercent: 100,
    };
  }
  if (totalCount <= MARGIN_SAFETY_DENSE_POINT_THRESHOLD) {
    return {
      isDense: false,
      startIndex: 0,
      endIndex: totalCount - 1,
      startPercent: 0,
      endPercent: 100,
    };
  }

  const worstPoint = points.reduce((currentWorst, point) =>
    point.minBufferRate < currentWorst.minBufferRate ? point : currentWorst,
  );
  const windowSize = Math.min(MARGIN_SAFETY_FOCUS_POINT_COUNT, totalCount);
  const maxStartIndex = Math.max(0, totalCount - windowSize);
  const preferredStartIndex =
    worstPoint.sequenceIndex - Math.floor(windowSize * 0.42);
  const startIndex = clamp(preferredStartIndex, 0, maxStartIndex);
  const endIndex = startIndex + windowSize - 1;

  return {
    isDense: true,
    startIndex,
    endIndex,
    startPercent: toFixedRound((startIndex / totalCount) * 100, 8),
    endPercent: toFixedRound(((endIndex + 1) / totalCount) * 100, 8),
  };
};

const buildMarginSafetyFacts = (
  metrics: ReplayReviewProjectMetrics[],
  representativeProjectIds: readonly string[],
): ReplayReviewMarginSafetyPayload => {
  const representativeIdSet = new Set(representativeProjectIds);
  const marginMetrics = metrics
    .filter(isMarginRelevantMetric)
    .sort((left, right) => {
      if (left.projectTs !== right.projectTs) {
        return left.projectTs - right.projectTs;
      }
      return left.projectId.localeCompare(right.projectId, 'en');
    });
  const sessionSafetyPoints = marginMetrics.map((metric, index) => {
    const minBufferRate = toFixedRound(
      normalizeNumber(metric.marginMinBufferRate, 1),
      8,
    );
    return {
      sessionId: metric.projectId,
      sequenceIndex: index,
      sequenceText: `#${index + 1}`,
      symbol: metric.symbol,
      minBufferRate,
      peakPressureRate: toFixedRound(
        Math.max(0, normalizeNumber(metric.marginMaxUtilizationRate)),
        8,
      ),
      zone: resolveMarginSafetyZone(minBufferRate),
      isRepresentative: representativeIdSet.has(metric.projectId),
    };
  });
  const dangerSessionCount = sessionSafetyPoints.filter(
    (point) => point.minBufferRate <= MARGIN_BUFFER_DANGER_RATE,
  ).length;
  const breachSessionCount = sessionSafetyPoints.filter(
    (point) => point.minBufferRate <= MARGIN_BUFFER_BREACH_RATE,
  ).length;
  const totalCount = sessionSafetyPoints.length;
  const zoneSummaries = MARGIN_SAFETY_ZONE_ORDER.map((zone) => {
    const count = sessionSafetyPoints.filter((point) => point.zone === zone).length;
    return {
      zone,
      count,
      share: totalCount > 0 ? toFixedRound(count / totalCount, 8) : 0,
    };
  });

  return {
    dangerSessionShare:
      totalCount > 0 ? toFixedRound(dangerSessionCount / totalCount, 8) : 0,
    dangerSessionCount,
    minSafetyBufferRate: totalCount
      ? toFixedRound(
          Math.min(...sessionSafetyPoints.map((point) => point.minBufferRate)),
          8,
        )
      : 1,
    breachSessionCount,
    sessionSafetyPoints,
    zoneSummaries,
    worstSessionPoints: [...sessionSafetyPoints]
      .sort(
        (left, right) =>
          left.minBufferRate - right.minBufferRate ||
          right.peakPressureRate - left.peakPressureRate ||
          left.sequenceIndex - right.sequenceIndex,
      )
      .slice(0, MARGIN_SAFETY_WORST_SESSION_COUNT),
    focusWindow: buildMarginSafetyFocusWindow(sessionSafetyPoints),
  };
};

const buildActionableAlerts = ({
  metrics,
  environmentMatrix,
  exitDiscipline,
  capitalDiscipline,
}: {
  metrics: ReplayReviewProjectMetrics[];
  environmentMatrix: ReplayReviewEnvironmentMatrixRow[];
  exitDiscipline: ReplayReviewExitDisciplinePayload;
  capitalDiscipline: ReplayReviewCapitalDisciplinePayload;
}): ReplayReviewActionableAlert[] => {
  if (!metrics.length) {
    return [];
  }
  const alerts: ReplayReviewActionableAlert[] = [];
  const sufficientRows = environmentMatrix.filter(
    (row) => row.sampleAdequacy === 'SUFFICIENT',
  );
  const weakRows = sufficientRows.filter((row) => row.expectancy < 0);
  if (weakRows.length > 0) {
    const weakestRow = [...weakRows].sort((left, right) => {
      if (left.expectancy !== right.expectancy) {
        return left.expectancy - right.expectancy;
      }
      return right.maxDrawdownRate - left.maxDrawdownRate;
    })[0];
    if (weakestRow) {
      const weakEnvironmentRate =
        sufficientRows.length > 0 ? weakRows.length / sufficientRows.length : 0;
      alerts.push({
        id: 'ENVIRONMENT_MISMATCH',
        severity:
          weakestRow.expectancy <= -0.02 || weakEnvironmentRate >= 0.5
            ? 'ALERT'
            : 'WATCH',
        currentValue: toFixedRound(weakestRow.expectancy, 8),
        thresholdValue: 0,
        details: {
          weakEnvironmentCount: weakRows.length,
          sufficientEnvironmentCount: sufficientRows.length,
          worstExpectancy: toFixedRound(weakestRow.expectancy, 8),
        },
        representativeProjectIds: weakestRow.representativeProjectIds,
      });
    }
  }

  if (
    exitDiscipline.avgLossCutDelayBars >= 3 ||
    exitDiscipline.dangerDelaySessionRate >= 0.25
  ) {
    alerts.push({
      id: 'EXIT_DELAY',
      severity:
        exitDiscipline.avgLossCutDelayBars >= EXIT_DELAY_DANGER_BARS ||
        exitDiscipline.dangerDelaySessionRate >= 0.35
          ? 'ALERT'
          : 'WATCH',
      currentValue: exitDiscipline.dangerDelaySessionRate,
      thresholdValue: 0.25,
      details: {
        avgLossCutDelayBars: exitDiscipline.avgLossCutDelayBars,
        dangerDelaySessionRate: exitDiscipline.dangerDelaySessionRate,
      },
      representativeProjectIds: exitDiscipline.representativeProjectIds,
    });
  }

  if (
    capitalDiscipline.enabled &&
    (capitalDiscipline.dangerSessionRate >= 0.15 || capitalDiscipline.p100 > 0)
  ) {
    alerts.push({
      id: 'MARGIN_PRESSURE',
      severity:
        capitalDiscipline.p100 > 0 || capitalDiscipline.dangerSessionRate >= 0.3
          ? 'ALERT'
          : 'WATCH',
      currentValue: capitalDiscipline.dangerSessionRate,
      thresholdValue: 0.15,
      details: {
        dangerSessionRate: capitalDiscipline.dangerSessionRate,
        warningSessionCount: capitalDiscipline.p85,
        breachCount: capitalDiscipline.p100,
      },
      representativeProjectIds: capitalDiscipline.representativeProjectIds,
    });
  }

  return alerts;
};

const buildArchiveFinancialDetails = (
  metrics: ReplayReviewProjectMetrics[],
): Record<string, ReplayReviewArchiveFinancialDetail> => {
  const result: Record<string, ReplayReviewArchiveFinancialDetail> = {};
  for (const metric of metrics) {
    const environmentKey = resolveEnvironmentKey(metric.environment);
    result[metric.projectId] = {
      projectId: metric.projectId,
      grossPnl: metric.grossPnl,
      netPnl: metric.netPnl,
      slippageCost: metric.slippageCost,
      feeAndTaxCost: metric.feeAndTaxCost,
      fundingOrBorrowCost: metric.fundingOrBorrowCost,
      environmentKey,
      context: metric.environment,
      marginDiagnostics: {
        maxUtilizationRate: metric.marginMaxUtilizationRate,
        minBufferRate: metric.marginMinBufferRate,
      },
    };
  }
  return result;
};

export const buildReplayReviewDiagnosticsFromProjects = (
  projects: TrainingProjectRecord[],
  requestedProjectIds: readonly string[],
  windowInput: ReplayReviewWindowInput = {},
): ReplayReviewDiagnosticsPayload => {
  const requestedIdSet = new Set(normalizeProjectIds(requestedProjectIds));
  const resolvedIdSet = new Set(projects.map((project) => project.id));
  const missingProjectIds = Array.from(requestedIdSet).filter(
    (projectId) => !resolvedIdSet.has(projectId),
  );
  const windowedProjects = applyReplayReviewWindowToProjects(
    projects,
    windowInput,
  );
  const metrics = windowedProjects.map((project) => resolveProjectMetrics(project));
  const environmentMatrix = buildEnvironmentMatrix(metrics);
  const exitDiscipline = buildExitDiscipline(metrics);
  const capitalDiscipline = buildCapitalDiscipline(metrics);
  const marginSafety = buildMarginSafetyFacts(
    metrics,
    capitalDiscipline.representativeProjectIds,
  );

  return {
    generatedAt: nowIso(),
    totals: {
      requestedProjects: requestedIdSet.size,
      resolvedProjects: windowedProjects.length,
      missingProjects: missingProjectIds.length,
    },
    missingProjectIds,
    environmentMatrix,
    exitDiscipline,
    capitalDiscipline,
    marginSafety,
    actionableAlerts: buildActionableAlerts({
      metrics,
      environmentMatrix,
      exitDiscipline,
      capitalDiscipline,
    }),
    archiveFinancialDetailsById: buildArchiveFinancialDetails(metrics),
  };
};
