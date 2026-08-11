// SPDX-License-Identifier: GPL-3.0-only

import type { ApiTrainingStatsReport } from "@/api";
import type { StatsFilterState } from "@/workspaces/challenge-stats/statsFilters";
import {
  CHALLENGE_STATS_MODE_IDS,
  resolveChallengeStatsModeIdByTag,
  resolveChallengeStatsTagByMode,
} from "@/workspaces/challenge-stats/challengeStatsModeRegistry";

export const hasChallengeStatsReportData = (
  report: ApiTrainingStatsReport | null | undefined,
): boolean => {
  if (!report) {
    return false;
  }
  if ((report.recentSessions?.length ?? 0) > 0) {
    return true;
  }
  if ((report.totals?.filteredProjects ?? 0) > 0) {
    return true;
  }
  return (report.overview?.totalSessions ?? 0) > 0;
};

export const buildChallengeModeFallbackCandidates = (
  filters: StatsFilterState,
): StatsFilterState[] => {
  const currentModeId = resolveChallengeStatsModeIdByTag(filters.tag);
  return CHALLENGE_STATS_MODE_IDS.filter((modeId) => modeId !== currentModeId)
    .map((modeId) => ({
      ...filters,
      tag: resolveChallengeStatsTagByMode(modeId),
    }));
};
