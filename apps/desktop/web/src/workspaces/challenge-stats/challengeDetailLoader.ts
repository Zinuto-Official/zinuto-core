// SPDX-License-Identifier: GPL-3.0-only

import type { ApiChallengeStatsProjectDetail } from "@/api";

type ResolveCachedChallengeProjectDetailArgs = {
  projectId: string;
  currentDetailsById: Record<string, ApiChallengeStatsProjectDetail>;
  cachedDetailsById: Record<string, ApiChallengeStatsProjectDetail>;
  fetchDetail: (
    projectId: string,
  ) => Promise<ApiChallengeStatsProjectDetail | null>;
};

export const resolveCachedChallengeProjectDetail = async ({
  projectId,
  currentDetailsById,
  cachedDetailsById,
  fetchDetail,
}: ResolveCachedChallengeProjectDetailArgs): Promise<ApiChallengeStatsProjectDetail | null> => {
  const normalizedId = String(projectId || "").trim();
  if (!normalizedId) {
    return null;
  }
  return (
    currentDetailsById[normalizedId] ??
    cachedDetailsById[normalizedId] ??
    (await fetchDetail(normalizedId))
  );
};
