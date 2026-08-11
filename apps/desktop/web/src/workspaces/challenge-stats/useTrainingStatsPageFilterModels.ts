// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  ApiSpecialTrainingModeId,
  ApiTrainingStatsReport,
} from "@/api";
import {
  getSpecialTrainingPageContent,
  type AppUiLanguage,
  type SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  ALL_VALUE,
  SAMPLE_POOL_ALL_TOKEN,
  SAMPLE_POOL_UNKNOWN_TOKEN,
  normalizeStatsComparePoolValue,
  normalizeStatsSamplePoolFilterValue,
  type StatsFilterState,
} from "@/workspaces/challenge-stats/statsFilters";
import {
  CHALLENGE_STATS_DEFAULT_MODE_ID,
  CHALLENGE_STATS_DEFAULT_TAG,
  isChallengeStatsModeTag,
  normalizeChallengeStatsModeTag,
  resolveChallengeStatsModeIdByTag,
  resolveChallengeStatsModes,
  resolveChallengeStatsTagByMode,
} from "@/workspaces/challenge-stats/challengeStatsModeRegistry";

type SetFilters = React.Dispatch<React.SetStateAction<StatsFilterState>>;

export const useTrainingStatsPageFilterModels = ({
  language,
  ui,
  viewMode,
  report,
  filters,
  pendingFilters,
  setFilters,
  setPendingFilters,
  challengeInitialProfitability,
  resolveSamplePoolName,
}: {
  language: AppUiLanguage;
  ui: UiLabelEntry;
  viewMode: "training" | "challenge";
  report: ApiTrainingStatsReport | null;
  filters: StatsFilterState;
  pendingFilters: StatsFilterState;
  setFilters: SetFilters;
  setPendingFilters: SetFilters;
  challengeInitialProfitability: StatsFilterState["profitability"];
  resolveSamplePoolName?: (
    samplePoolId: string,
    fallbackName?: string,
  ) => string;
}) => {
  const challengeInitialProfitabilityRef = useRef("");
  const challengeModeSelectionLockedRef = useRef(false);

  const challengeTagsFromReport = useMemo(() => {
    if (viewMode !== "challenge") {
      return [];
    }
    const tagSet = new Set<string>();
    const modeAvailability =
      report && "modeAvailability" in report ? report.modeAvailability : null;
    if (modeAvailability && typeof modeAvailability === "object") {
      Object.values(modeAvailability).forEach((item) => {
        const normalized = normalizeChallengeStatsModeTag(
          typeof item?.tag === "string" ? item.tag : "",
        );
        if (!normalized || !isChallengeStatsModeTag(normalized)) {
          return;
        }
        tagSet.add(normalized);
      });
    }
    return Array.from(tagSet);
  }, [report, viewMode]);

  const challengeDefaultModeId = useMemo(() => {
    if (viewMode !== "challenge" || !report || !("defaultModeId" in report)) {
      return null;
    }
    return report.defaultModeId === "risk-discipline-training"
      ? report.defaultModeId
      : report.defaultModeId === "fast-decision-training"
        ? report.defaultModeId
        : null;
  }, [report, viewMode]);

  const challengeModeAvailability = useMemo(() => {
    if (viewMode !== "challenge" || !report || !("modeAvailability" in report)) {
      return null;
    }
    const source = report.modeAvailability;
    if (!source || typeof source !== "object") {
      return null;
    }
    return source as Record<
      ApiSpecialTrainingModeId,
      {
        tag: string;
        projectCount: number;
      }
    >;
  }, [report, viewMode]);

  useEffect(() => {
    if (viewMode !== "challenge") {
      return;
    }
    const currentTag = normalizeChallengeStatsModeTag(filters.tag);
    if (currentTag && isChallengeStatsModeTag(currentTag)) {
      return;
    }
    const preferredTag = challengeTagsFromReport[0] ?? CHALLENGE_STATS_DEFAULT_TAG;
    if (!preferredTag || preferredTag === currentTag) {
      return;
    }
    setPendingFilters((current) =>
      normalizeChallengeStatsModeTag(current.tag) === preferredTag
        ? current
        : { ...current, tag: preferredTag },
    );
    setFilters((current) =>
      normalizeChallengeStatsModeTag(current.tag) === preferredTag
        ? current
        : { ...current, tag: preferredTag },
    );
  }, [challengeTagsFromReport, filters.tag, setFilters, setPendingFilters, viewMode]);

  useEffect(() => {
    if (
      viewMode !== "challenge" ||
      challengeModeSelectionLockedRef.current ||
      !challengeDefaultModeId ||
      !challengeModeAvailability
    ) {
      return;
    }
    const currentModeId =
      resolveChallengeStatsModeIdByTag(filters.tag) ??
      resolveChallengeStatsModeIdByTag(pendingFilters.tag);
    const currentModeCount = currentModeId
      ? Number(challengeModeAvailability[currentModeId]?.projectCount) || 0
      : 0;
    const shouldAdoptBackendDefault =
      !currentModeId || currentModeId === CHALLENGE_STATS_DEFAULT_MODE_ID;
    if (!shouldAdoptBackendDefault || currentModeCount > 0) {
      return;
    }
    const nextTag = resolveChallengeStatsTagByMode(challengeDefaultModeId);
    setPendingFilters((current) =>
      normalizeChallengeStatsModeTag(current.tag) === nextTag
        ? current
        : { ...current, tag: nextTag },
    );
    setFilters((current) =>
      normalizeChallengeStatsModeTag(current.tag) === nextTag
        ? current
        : { ...current, tag: nextTag },
    );
  }, [
    challengeDefaultModeId,
    challengeModeAvailability,
    filters.tag,
    pendingFilters.tag,
    setFilters,
    setPendingFilters,
    viewMode,
  ]);

  useEffect(() => {
    if (viewMode !== "challenge") {
      return;
    }
    const nextKey = `${viewMode}:${challengeInitialProfitability}`;
    if (challengeInitialProfitabilityRef.current === nextKey) {
      return;
    }
    challengeInitialProfitabilityRef.current = nextKey;
    setPendingFilters((current) => ({
      ...current,
      profitability: challengeInitialProfitability,
    }));
    setFilters((current) => ({
      ...current,
      profitability: challengeInitialProfitability,
    }));
  }, [
    challengeInitialProfitability,
    setFilters,
    setPendingFilters,
    viewMode,
  ]);

  const specialTrainingContent = useMemo(
    () => getSpecialTrainingPageContent(language),
    [language],
  );
  const challengeModes = useMemo(
    () => resolveChallengeStatsModes(specialTrainingContent.modes),
    [specialTrainingContent.modes],
  );
  const activeChallengeModeId = useMemo(() => {
    if (viewMode !== "challenge") {
      return null;
    }
    return (
      resolveChallengeStatsModeIdByTag(pendingFilters.tag) ??
      resolveChallengeStatsModeIdByTag(filters.tag) ??
      challengeDefaultModeId ??
      resolveChallengeStatsModeIdByTag(challengeTagsFromReport[0] ?? "") ??
      CHALLENGE_STATS_DEFAULT_MODE_ID
    );
  }, [
    challengeDefaultModeId,
    challengeTagsFromReport,
    filters.tag,
    pendingFilters.tag,
    viewMode,
  ]);

  const handleSelectChallengeMode = useCallback((modeId: SpecialTrainingModeId) => {
    const nextTag = resolveChallengeStatsTagByMode(modeId);
    challengeModeSelectionLockedRef.current = true;
    setPendingFilters((current) =>
      normalizeChallengeStatsModeTag(current.tag) === nextTag
        ? current
        : { ...current, tag: nextTag },
    );
    setFilters((current) =>
      normalizeChallengeStatsModeTag(current.tag) === nextTag
        ? current
        : { ...current, tag: nextTag },
    );
  }, [setFilters, setPendingFilters]);

  const resolvePoolDisplayName = useCallback(
    (samplePoolId: string, fallbackName: string): string => {
      const normalizedFallbackRaw = (fallbackName || "").trim();
      const normalizedFallbackLower = normalizedFallbackRaw.toLowerCase();
      const normalizedFallback =
        normalizedFallbackLower === SAMPLE_POOL_ALL_TOKEN
          ? ui.statsAllSamplePools
          : normalizedFallbackLower === SAMPLE_POOL_UNKNOWN_TOKEN
            ? ui.statsNoData
            : normalizedFallbackRaw;
      if (resolveSamplePoolName) {
        const resolved = resolveSamplePoolName(
          samplePoolId,
          normalizedFallback,
        );
        const normalizedResolved = (resolved || "").trim();
        if (normalizedResolved.toLowerCase() === SAMPLE_POOL_ALL_TOKEN) {
          return ui.statsAllSamplePools;
        }
        if (normalizedResolved.toLowerCase() === SAMPLE_POOL_UNKNOWN_TOKEN) {
          return ui.statsNoData;
        }
        return normalizedResolved;
      }
      return normalizedFallback;
    },
    [resolveSamplePoolName, ui.statsAllSamplePools, ui.statsNoData],
  );

  const resolvedFilterSamplePools = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    (report?.filterOptions.samplePools ?? []).forEach((item) => {
      const rawId = (item.id || "").trim();
      const normalizedId = normalizeStatsSamplePoolFilterValue(rawId);
      if (!normalizedId || normalizedId === ALL_VALUE) {
        return;
      }
      const resolvedName = resolvePoolDisplayName(rawId, item.name);
      const current = map.get(normalizedId);
      if (!current) {
        map.set(normalizedId, {
          id: normalizedId,
          name: resolvedName || normalizedId,
          count: Math.max(0, Number(item.count) || 0),
        });
        return;
      }
      current.count += Math.max(0, Number(item.count) || 0);
      if (!current.name || current.name === current.id) {
        current.name = resolvedName || current.id;
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"),
    );
  }, [report, resolvePoolDisplayName]);

  const resolvedFilterSamplePoolIds = useMemo(
    () => resolvedFilterSamplePools.map((item) => item.id),
    [resolvedFilterSamplePools],
  );

  const normalizedPendingSamplePoolId = useMemo(() => {
    const normalized = normalizeStatsSamplePoolFilterValue(
      pendingFilters.samplePoolId,
    );
    if (normalized === ALL_VALUE) {
      return ALL_VALUE;
    }
    return resolvedFilterSamplePoolIds.includes(normalized)
      ? normalized
      : ALL_VALUE;
  }, [pendingFilters.samplePoolId, resolvedFilterSamplePoolIds]);

  const normalizedPendingComparePoolA = useMemo(() => {
    const normalized = normalizeStatsComparePoolValue(
      pendingFilters.comparePoolA,
    );
    if (!normalized) {
      return "";
    }
    return resolvedFilterSamplePoolIds.includes(normalized) ? normalized : "";
  }, [pendingFilters.comparePoolA, resolvedFilterSamplePoolIds]);

  const normalizedPendingComparePoolB = useMemo(() => {
    const normalized = normalizeStatsComparePoolValue(
      pendingFilters.comparePoolB,
    );
    if (!normalized) {
      return "";
    }
    return resolvedFilterSamplePoolIds.includes(normalized) ? normalized : "";
  }, [pendingFilters.comparePoolB, resolvedFilterSamplePoolIds]);

  useEffect(() => {
    const optionSet = new Set(resolvedFilterSamplePoolIds);
    const normalizeState = (current: StatsFilterState): StatsFilterState => {
      const normalizedSamplePoolIdRaw = normalizeStatsSamplePoolFilterValue(
        current.samplePoolId,
      );
      const normalizedSamplePoolId =
        normalizedSamplePoolIdRaw === ALL_VALUE ||
        optionSet.has(normalizedSamplePoolIdRaw)
          ? normalizedSamplePoolIdRaw
          : ALL_VALUE;
      const normalizedComparePoolA = (() => {
        const next = normalizeStatsComparePoolValue(current.comparePoolA);
        if (!next) {
          return "";
        }
        return optionSet.has(next) ? next : "";
      })();
      const normalizedComparePoolB = (() => {
        const next = normalizeStatsComparePoolValue(current.comparePoolB);
        if (!next) {
          return "";
        }
        return optionSet.has(next) ? next : "";
      })();
      if (
        normalizedSamplePoolId === current.samplePoolId &&
        normalizedComparePoolA === current.comparePoolA &&
        normalizedComparePoolB === current.comparePoolB
      ) {
        return current;
      }
      return {
        ...current,
        samplePoolId: normalizedSamplePoolId,
        comparePoolA: normalizedComparePoolA,
        comparePoolB: normalizedComparePoolB,
      };
    };
    setPendingFilters((current) => normalizeState(current));
    setFilters((current) => normalizeState(current));
  }, [resolvedFilterSamplePoolIds, setFilters, setPendingFilters]);

  return {
    challengeModes,
    activeChallengeModeId,
    handleSelectChallengeMode,
    resolvePoolDisplayName,
    resolvedFilterSamplePools,
    normalizedPendingSamplePoolId,
    normalizedPendingComparePoolA,
    normalizedPendingComparePoolB,
  };
};
