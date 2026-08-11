// SPDX-License-Identifier: GPL-3.0-only

import type {
  ChallengeStatsDashboardFastInsights,
  ChallengeStatsDashboardInsights,
  ChallengeStatsDashboardRiskBehaviorSummary,
  ChallengeStatsDashboardRiskInsights,
  ChallengeStatsDashboardWindowPreset,
} from '../../domain/specialTraining/statsContracts.js';
import type { SpecialTrainingStatsProjectionRow } from '../ports/infrastructure/db/specialTraining/statsProjectionStore.js';
import {
  clampNonNegativeInteger,
  clampNonNegativeNumber,
  normalizeFastDirectionSelection,
  normalizeRiskBehavior,
} from './statsProjectionRuntime.js';

const CHALLENGE_DASHBOARD_WINDOW_LIMITS: Record<
  ChallengeStatsDashboardWindowPreset,
  number | null
> = {
  RECENT_10: 10,
  RECENT_50: 50,
  ALL: null,
};

const resolveFastSample = (row: SpecialTrainingStatsProjectionRow) => ({
  selection: normalizeFastDirectionSelection(row.selection),
  actual: normalizeFastDirectionSelection(row.actual),
  correct: Number(row.correct) === 1,
  edgeRatio: clampNonNegativeNumber(row.edge_ratio),
  decisionSeconds:
    row.decision_seconds_used === null
      ? 0
      : clampNonNegativeNumber(row.decision_seconds_used),
});

const buildMedian = (values: readonly number[]): number => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values]
    .map((value) => clampNonNegativeNumber(value))
    .sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middleIndex] ?? 0;
  }
  const left = sorted[middleIndex - 1] ?? 0;
  const right = sorted[middleIndex] ?? 0;
  return (left + right) / 2;
};

const buildFastInsights = (
  samples: ReturnType<typeof resolveFastSample>[],
): ChallengeStatsDashboardFastInsights => {
  const sampleCount = samples.length;
  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      winRate: 0,
      avgDecisionSeconds: 0,
      effectiveHitRate: 0,
      medianDecisionSeconds: 0,
      observeMissRate: 0,
      longCount: 0,
      shortCount: 0,
      observeCount: 0,
      longWinRate: 0,
      shortWinRate: 0,
      slowerPercentile: 0,
    };
  }
  const totalDecisionSeconds = samples.reduce(
    (sum, sample) => sum + sample.decisionSeconds,
    0,
  );
  const avgDecisionSeconds = totalDecisionSeconds / sampleCount;
  const medianDecisionSeconds = buildMedian(
    samples.map((sample) => sample.decisionSeconds),
  );
  const slowerCount = samples.filter(
    (sample) => sample.decisionSeconds > avgDecisionSeconds,
  ).length;
  const longSamples = samples.filter((sample) => sample.selection === 'LONG');
  const shortSamples = samples.filter((sample) => sample.selection === 'SHORT');
  const observeCount = samples.filter(
    (sample) => sample.selection === 'OBSERVE',
  ).length;
  const effectiveHitCount = samples.filter(
    (sample) => sample.correct && sample.edgeRatio >= 1,
  ).length;
  const observeMissCount = samples.filter(
    (sample) =>
      sample.selection === 'OBSERVE' && sample.actual !== 'OBSERVE',
  ).length;
  const longWins = longSamples.filter((sample) => sample.correct).length;
  const shortWins = shortSamples.filter((sample) => sample.correct).length;
  const correctCount = samples.filter((sample) => sample.correct).length;

  return {
    sampleCount,
    winRate: correctCount / sampleCount,
    avgDecisionSeconds,
    effectiveHitRate: effectiveHitCount / sampleCount,
    medianDecisionSeconds,
    observeMissRate: observeMissCount / sampleCount,
    longCount: longSamples.length,
    shortCount: shortSamples.length,
    observeCount,
    longWinRate: longSamples.length > 0 ? longWins / longSamples.length : 0,
    shortWinRate: shortSamples.length > 0 ? shortWins / shortSamples.length : 0,
    slowerPercentile: slowerCount / sampleCount,
  };
};

const buildFastInsightsByWindow = (
  samples: ReturnType<typeof resolveFastSample>[],
): ChallengeStatsDashboardInsights['fast'] => {
  const windows = {} as ChallengeStatsDashboardInsights['fast'];
  (
    Object.keys(
      CHALLENGE_DASHBOARD_WINDOW_LIMITS,
    ) as ChallengeStatsDashboardWindowPreset[]
  ).forEach((windowPreset) => {
    const limit = CHALLENGE_DASHBOARD_WINDOW_LIMITS[windowPreset];
    windows[windowPreset] = buildFastInsights(
      limit === null ? samples : samples.slice(0, limit),
    );
  });
  return windows;
};

const resolveRiskSample = (row: SpecialTrainingStatsProjectionRow) => ({
  survived: Number(row.survived) === 1,
  comeback: Number(row.comeback) === 1,
  alphaRatio:
    row.alpha_ratio === null ? null : Number(row.alpha_ratio),
  firstActionBars: clampNonNegativeInteger(row.first_action_bars),
  behavior: normalizeRiskBehavior(row.behavior),
});

const buildRiskInsights = (
  samples: ReturnType<typeof resolveRiskSample>[],
): ChallengeStatsDashboardRiskInsights => {
  const sampleCount = samples.length;
  const emptyBehaviorSummary = (): ChallengeStatsDashboardRiskBehaviorSummary => ({
    count: 0,
    survived: 0,
  });
  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      survivalRate: 0,
      comebackRate: 0,
      positiveAlphaRate: 0,
      dominantBehavior: 'CUT_LOSS',
      dominantBehaviorShare: 0,
      medianFirstActionBars: 0,
      averageFirstActionBars: 0,
      behaviorStats: {
        CUT_LOSS: emptyBehaviorSummary(),
        ADD_POSITION: emptyBehaviorSummary(),
        FREEZE: emptyBehaviorSummary(),
      },
    };
  }
  const behaviorStats: ChallengeStatsDashboardRiskInsights['behaviorStats'] = {
    CUT_LOSS: emptyBehaviorSummary(),
    ADD_POSITION: emptyBehaviorSummary(),
    FREEZE: emptyBehaviorSummary(),
  };
  let survivedCount = 0;
  let comebackCount = 0;
  let totalFirstActionBars = 0;
  let positiveAlphaCount = 0;
  for (const sample of samples) {
    if (sample.survived) {
      survivedCount += 1;
    }
    if (sample.comeback) {
      comebackCount += 1;
    }
    if (sample.alphaRatio !== null && sample.alphaRatio > 0) {
      positiveAlphaCount += 1;
    }
    totalFirstActionBars += sample.firstActionBars;
    behaviorStats[sample.behavior].count += 1;
    if (sample.survived) {
      behaviorStats[sample.behavior].survived += 1;
    }
  }
  const dominantBehavior = (
    Object.entries(behaviorStats) as Array<
      [ChallengeStatsDashboardRiskInsights['dominantBehavior'], ChallengeStatsDashboardRiskBehaviorSummary]
    >
  ).reduce<ChallengeStatsDashboardRiskInsights['dominantBehavior']>(
    (winner, [behavior, summary]) =>
      summary.count > behaviorStats[winner].count ? behavior : winner,
    'CUT_LOSS',
  );
  return {
    sampleCount,
    survivalRate: survivedCount / sampleCount,
    comebackRate: comebackCount / sampleCount,
    positiveAlphaRate: positiveAlphaCount / sampleCount,
    dominantBehavior,
    dominantBehaviorShare:
      behaviorStats[dominantBehavior].count / sampleCount,
    medianFirstActionBars: buildMedian(
      samples.map((sample) => sample.firstActionBars),
    ),
    averageFirstActionBars: totalFirstActionBars / sampleCount,
    behaviorStats,
  };
};

const buildRiskInsightsByWindow = (
  samples: ReturnType<typeof resolveRiskSample>[],
): ChallengeStatsDashboardInsights['risk'] => {
  const windows = {} as ChallengeStatsDashboardInsights['risk'];
  (
    Object.keys(
      CHALLENGE_DASHBOARD_WINDOW_LIMITS,
    ) as ChallengeStatsDashboardWindowPreset[]
  ).forEach((windowPreset) => {
    const limit = CHALLENGE_DASHBOARD_WINDOW_LIMITS[windowPreset];
    windows[windowPreset] = buildRiskInsights(
      limit === null ? samples : samples.slice(0, limit),
    );
  });
  return windows;
};

export const buildChallengeStatsDashboardInsights = (
  projectionRows: SpecialTrainingStatsProjectionRow[],
): ChallengeStatsDashboardInsights => {
  const fastSamples = projectionRows.map(resolveFastSample);
  const riskSamples = projectionRows.map(resolveRiskSample);
  return {
    fast: buildFastInsightsByWindow(fastSamples),
    risk: buildRiskInsightsByWindow(riskSamples),
  };
};
