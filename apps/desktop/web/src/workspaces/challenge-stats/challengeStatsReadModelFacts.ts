// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiChallengeStatsDashboardInsights,
  ApiChallengeStatsDashboardSessionRow,
  ApiDesktopWorkspaceReadModel,
  ApiSpecialTrainingModeId,
  ApiTrainingStatsReport,
} from "@/api";
import type {
  ChallengeDashboardFamily,
} from "@/workspaces/challenge-stats/challengeStatsModeRegistry";
import type {
  SessionWindowPreset,
} from "@/workspaces/challenge-stats/challengeFusionDashboardModel";

export type ChallengeStatsMetricReadiness = {
  enabled: boolean;
  statusCode: string;
  reasonCode: string | null;
  sampleCount: number;
  minimumSampleCount: number;
  priority: number;
};

export type ChallengeStatsReadModelFacts = {
  summary: {
    generatedAt: string;
    modeId: ApiSpecialTrainingModeId;
    defaultModeId: ApiSpecialTrainingModeId;
    filtersApplied: ApiTrainingStatsReport["filtersApplied"];
    totals: ApiTrainingStatsReport["totals"];
    overview: ApiTrainingStatsReport["overview"];
    modeAvailability: Record<
      ApiSpecialTrainingModeId,
      { tag: string; projectCount: number }
    >;
    dashboardInsights: ApiChallengeStatsDashboardInsights;
    recentSessions: ApiTrainingStatsReport["recentSessions"];
  };
  sessionRows: ApiChallengeStatsDashboardSessionRow[];
  metricReadiness: Record<
    "fast" | "risk",
    Record<SessionWindowPreset, ChallengeStatsMetricReadiness>
  >;
  emptyState: {
    isEmpty: boolean;
    statusCode: string;
    reasonCode: string | null;
    totalProjects: number;
    filteredProjects: number;
    modeProjectCount: number;
  };
  exportAvailability: {
    enabled: boolean;
    reasonCode: string | null;
  };
  clearHistoryAvailability: {
    enabled: boolean;
    reasonCode: string | null;
  };
};

const WINDOW_PRESETS: readonly SessionWindowPreset[] = [
  "RECENT_10",
  "RECENT_50",
  "ALL",
];
const CHALLENGE_STATS_MINIMUM_SAMPLE_COUNT = 3;

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const toCount = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

const toReasonCode = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
};

const readMetricReadiness = (
  source: unknown,
): ChallengeStatsMetricReadiness => {
  const record = toRecord(source);
  return {
    enabled: record.enabled === true,
    statusCode: String(record.statusCode || "EMPTY"),
    reasonCode: toReasonCode(record.reasonCode),
    sampleCount: toCount(record.sampleCount),
    minimumSampleCount: toCount(record.minimumSampleCount),
    priority: toCount(record.priority),
  };
};

const readMetricReadinessFamily = (
  source: unknown,
): Record<SessionWindowPreset, ChallengeStatsMetricReadiness> => {
  const record = toRecord(source);
  return WINDOW_PRESETS.reduce(
    (result, preset) => {
      result[preset] = readMetricReadiness(record[preset]);
      return result;
    },
    {} as Record<SessionWindowPreset, ChallengeStatsMetricReadiness>,
  );
};

export const readChallengeStatsReadModelFacts = (
  model: ApiDesktopWorkspaceReadModel | null | undefined,
): ChallengeStatsReadModelFacts | null => {
  const facts = toRecord(model?.facts);
  const summary = toRecord(facts.summary);
  const metricReadiness = toRecord(facts.metricReadiness);
  const emptyState = toRecord(facts.emptyState);
  const exportAvailability = toRecord(facts.exportAvailability);
  const clearHistoryAvailability = toRecord(facts.clearHistoryAvailability);
  const sessionRows = toArray(facts.sessionRows) as ApiChallengeStatsDashboardSessionRow[];
  if (!summary.generatedAt && sessionRows.length === 0 && !facts.emptyState) {
    return null;
  }
  return {
    summary: {
      generatedAt: String(summary.generatedAt || ""),
      modeId: String(summary.modeId || "fast-decision-training") as ApiSpecialTrainingModeId,
      defaultModeId: String(
        summary.defaultModeId || summary.modeId || "fast-decision-training",
      ) as ApiSpecialTrainingModeId,
      filtersApplied: toRecord(
        summary.filtersApplied,
      ) as ApiTrainingStatsReport["filtersApplied"],
      totals: toRecord(summary.totals) as ApiTrainingStatsReport["totals"],
      overview: toRecord(summary.overview) as ApiTrainingStatsReport["overview"],
      modeAvailability: toRecord(summary.modeAvailability) as Record<
        ApiSpecialTrainingModeId,
        { tag: string; projectCount: number }
      >,
      dashboardInsights: toRecord(
        summary.dashboardInsights,
      ) as ApiChallengeStatsDashboardInsights,
      recentSessions: toArray(
        summary.recentSessions,
      ) as ApiTrainingStatsReport["recentSessions"],
    },
    sessionRows,
    metricReadiness: {
      fast: readMetricReadinessFamily(metricReadiness.fast),
      risk: readMetricReadinessFamily(metricReadiness.risk),
    },
    emptyState: {
      isEmpty: emptyState.isEmpty === true,
      statusCode: String(emptyState.statusCode || "EMPTY"),
      reasonCode: toReasonCode(emptyState.reasonCode),
      totalProjects: toCount(emptyState.totalProjects),
      filteredProjects: toCount(emptyState.filteredProjects),
      modeProjectCount: toCount(emptyState.modeProjectCount),
    },
    exportAvailability: {
      enabled: exportAvailability.enabled === true,
      reasonCode: toReasonCode(exportAvailability.reasonCode),
    },
    clearHistoryAvailability: {
      enabled: clearHistoryAvailability.enabled === true,
      reasonCode: toReasonCode(clearHistoryAvailability.reasonCode),
    },
  };
};

export const readChallengeStatsMetricReadiness = (
  facts: ChallengeStatsReadModelFacts | null,
  family: ChallengeDashboardFamily,
  preset: SessionWindowPreset,
): ChallengeStatsMetricReadiness | null => {
  const key = family === "RISK_DISCIPLINE" ? "risk" : "fast";
  return facts?.metricReadiness[key]?.[preset] ?? null;
};

export const resolveChallengeStatsMetricReadinessForDashboard = ({
  facts,
  dashboardInsights,
  family,
  preset,
}: {
  facts: ChallengeStatsReadModelFacts | null;
  dashboardInsights: ApiChallengeStatsDashboardInsights | null | undefined;
  family: ChallengeDashboardFamily;
  preset: SessionWindowPreset;
}): ChallengeStatsMetricReadiness | null => {
  const readModelReadiness = readChallengeStatsMetricReadiness(
    facts,
    family,
    preset,
  );
  const dashboardWindow =
    family === "RISK_DISCIPLINE"
      ? dashboardInsights?.risk?.[preset] ?? dashboardInsights?.risk?.ALL
      : dashboardInsights?.fast?.[preset] ?? dashboardInsights?.fast?.ALL;
  if (!dashboardWindow) {
    return readModelReadiness;
  }
  const sampleCount = toCount(dashboardWindow.sampleCount);
  const minimumSampleCount =
    readModelReadiness && readModelReadiness.minimumSampleCount > 0
      ? readModelReadiness.minimumSampleCount
      : CHALLENGE_STATS_MINIMUM_SAMPLE_COUNT;
  if (sampleCount >= minimumSampleCount) {
    return {
      enabled: true,
      statusCode: "READY",
      reasonCode: null,
      sampleCount,
      minimumSampleCount,
      priority: readModelReadiness?.priority ?? 20,
    };
  }
  return {
    enabled: false,
    statusCode: sampleCount > 0 ? "INSUFFICIENT_SAMPLE" : "EMPTY",
    reasonCode:
      sampleCount > 0
        ? "CHALLENGE_STATS_MINIMUM_SAMPLE_NOT_MET"
        : (readModelReadiness?.reasonCode ?? "NO_CHALLENGE_HISTORY"),
    sampleCount,
    minimumSampleCount,
    priority: readModelReadiness?.priority ?? (sampleCount > 0 ? 50 : 60),
  };
};
