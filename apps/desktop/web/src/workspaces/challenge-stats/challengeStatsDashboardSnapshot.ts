// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiChallengeStatsDashboardInsights,
  ApiChallengeStatsDashboardSessionRow,
  ApiSpecialTrainingStatsReport,
  ApiTrainingStatsReport,
} from "@/api";
import type {
  ChallengeStatsReadModelFacts,
} from "@/workspaces/challenge-stats/challengeStatsReadModelFacts";

export type ChallengeStatsDashboardSnapshotSource =
  | "report"
  | "readModel"
  | "empty";

export type ChallengeStatsDashboardSnapshot = {
  source: ChallengeStatsDashboardSnapshotSource;
  dashboardRows: ApiChallengeStatsDashboardSessionRow[];
  recentSessions: ApiTrainingStatsReport["recentSessions"];
  dashboardInsights: ApiChallengeStatsDashboardInsights | null;
  clearHistoryEnabled: boolean;
};

const isSpecialTrainingStatsReport = (
  report: ApiTrainingStatsReport | null | undefined,
): report is ApiSpecialTrainingStatsReport =>
  Boolean(
    report &&
      "dashboardRows" in report &&
      "dashboardInsights" in report &&
      "modeAvailability" in report,
  );

const hasReportChallengeHistory = (
  report: ApiSpecialTrainingStatsReport,
): boolean =>
  Object.values(report.modeAvailability ?? {}).some(
    (item) => Number(item?.projectCount) > 0,
  );

export const resolveChallengeStatsDashboardSnapshot = ({
  report,
  readModelFacts,
}: {
  report: ApiTrainingStatsReport | null | undefined;
  readModelFacts?: ChallengeStatsReadModelFacts | null;
}): ChallengeStatsDashboardSnapshot => {
  if (isSpecialTrainingStatsReport(report)) {
    return {
      source: "report",
      dashboardRows: Array.isArray(report.dashboardRows)
        ? report.dashboardRows
        : [],
      recentSessions: Array.isArray(report.recentSessions)
        ? report.recentSessions
        : [],
      dashboardInsights: report.dashboardInsights,
      clearHistoryEnabled: hasReportChallengeHistory(report),
    };
  }

  if (readModelFacts) {
    return {
      source: "readModel",
      dashboardRows: readModelFacts.sessionRows,
      recentSessions: readModelFacts.summary.recentSessions,
      dashboardInsights: readModelFacts.summary.dashboardInsights,
      clearHistoryEnabled: readModelFacts.clearHistoryAvailability.enabled,
    };
  }

  return {
    source: "empty",
    dashboardRows: [],
    recentSessions: [],
    dashboardInsights: null,
    clearHistoryEnabled: false,
  };
};
