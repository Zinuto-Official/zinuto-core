// SPDX-License-Identifier: GPL-3.0-only

export const CHALLENGE_STATS_READMODEL_DATA_PATTERN =
  /readModelFacts\??\.(?:sessionRows|summary|clearHistoryAvailability)\b/;

export const CHALLENGE_STATS_READMODEL_DATA_ALLOWED_REL_PATHS = new Set([
  "apps/desktop/web/src/workspaces/challenge-stats/challengeStatsDashboardSnapshot.ts",
  "apps/desktop/web/src/workspaces/challenge-stats/challengeStatsReadModelFacts.ts",
]);

export const getChallengeStatsReadModelDataViolation = ({
  relPath,
  sourceText,
}) => {
  if (
    !relPath.startsWith("apps/desktop/web/src/workspaces/challenge-stats/") ||
    CHALLENGE_STATS_READMODEL_DATA_ALLOWED_REL_PATHS.has(relPath) ||
    !CHALLENGE_STATS_READMODEL_DATA_PATTERN.test(sourceText)
  ) {
    return null;
  }
  return "Challenge stats UI must read report/readModel data through challengeStatsDashboardSnapshot instead of mixing readModelFacts fields in components.";
};
