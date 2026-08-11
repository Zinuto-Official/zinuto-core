// SPDX-License-Identifier: GPL-3.0-only

import type {
  SpecialTrainingModeDefinition,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";

export type ChallengeDashboardFamily = "FAST_DECISION" | "RISK_DISCIPLINE";

type ChallengeStatsModeRegistryEntry = {
  id: SpecialTrainingModeId;
  tag: string;
  dashboardFamily: ChallengeDashboardFamily;
};

export const CHALLENGE_STATS_MODE_REGISTRY: Readonly<
  Record<SpecialTrainingModeId, ChallengeStatsModeRegistryEntry>
> = {
  "fast-decision-training": {
    id: "fast-decision-training",
    tag: "special_fast_decision",
    dashboardFamily: "FAST_DECISION",
  },
  "risk-discipline-training": {
    id: "risk-discipline-training",
    tag: "special_risk",
    dashboardFamily: "RISK_DISCIPLINE",
  },
};

export const CHALLENGE_STATS_MODE_IDS = Object.freeze(
  Object.keys(CHALLENGE_STATS_MODE_REGISTRY),
) as readonly SpecialTrainingModeId[];

export const CHALLENGE_STATS_DEFAULT_MODE_ID: SpecialTrainingModeId =
  CHALLENGE_STATS_MODE_IDS[0];

export const CHALLENGE_STATS_DEFAULT_TAG =
  CHALLENGE_STATS_MODE_REGISTRY[CHALLENGE_STATS_DEFAULT_MODE_ID].tag;

const normalizeStatsTag = (value: string): string =>
  String(value || "")
    .trim()
    .toLowerCase();

export const resolveChallengeStatsModeIdByTag = (
  tag: string,
): SpecialTrainingModeId | null => {
  const normalizedTag = normalizeStatsTag(tag);
  if (!normalizedTag) {
    return null;
  }
  for (const modeId of CHALLENGE_STATS_MODE_IDS) {
    if (CHALLENGE_STATS_MODE_REGISTRY[modeId].tag === normalizedTag) {
      return modeId;
    }
  }
  return null;
};

export const resolveChallengeStatsTagByMode = (
  modeId: SpecialTrainingModeId,
): string => CHALLENGE_STATS_MODE_REGISTRY[modeId].tag;

export const resolveChallengeStatsDashboardFamilyByModeId = (
  modeId: SpecialTrainingModeId,
): ChallengeDashboardFamily =>
  CHALLENGE_STATS_MODE_REGISTRY[modeId].dashboardFamily;

export const resolveChallengeStatsModes = (
  modes: readonly SpecialTrainingModeDefinition[],
): SpecialTrainingModeDefinition[] =>
  CHALLENGE_STATS_MODE_IDS.flatMap((modeId) => {
    const mode = modes.find((item) => item.id === modeId);
    return mode ? [mode] : [];
  });

export const normalizeChallengeStatsModeTag = normalizeStatsTag;

export const isChallengeStatsModeTag = (tag: string): boolean =>
  resolveChallengeStatsModeIdByTag(tag) !== null;
