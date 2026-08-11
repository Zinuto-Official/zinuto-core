// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  type ApiChallengeStatsProjectDetail,
  type ApiSpecialTrainingModeId,
  type ApiTrainingProjectDetail,
  type ApiTrainingStatsReport,
} from "@/api";
import {
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  ALL_VALUE,
  ensureDateInput,
  type StatsFilterState,
} from "@/workspaces/challenge-stats/statsFilters";
import { shiftMarketDateKey, toMarketDateKey } from "@zinuto/shared/marketTime";
import {
  readChallengeStatsReadModelFacts,
  type ChallengeStatsReadModelFacts,
} from "@/workspaces/challenge-stats/challengeStatsReadModelFacts";
import {
  CHALLENGE_STATS_DEFAULT_MODE_ID,
  CHALLENGE_STATS_DEFAULT_TAG,
  normalizeChallengeStatsModeTag,
  resolveChallengeStatsModeIdByTag,
} from "@/workspaces/challenge-stats/challengeStatsModeRegistry";
import { hasChallengeStatsReportData } from "@/workspaces/challenge-stats/challengeStatsBootstrap";
import {
  buildStatsApiFilters,
  buildStatsFiltersCacheKey,
  buildInitialFiltersByViewMode,
  clearStatsViewPrefetchTask,
  cloneStatsFilters,
  readSharedStatsViewCacheEntry,
  readStatsViewPrefetchTask,
  resolveNextSelectedSessionId,
  type TrainingStatsPageViewMode,
  type StatsViewCacheEntry,
  updateSharedStatsViewCacheEntry,
  writeStatsViewPrefetchTask,
} from "@/workspaces/challenge-stats/trainingStatsViewCache";
import { resolveCachedChallengeProjectDetail } from "@/workspaces/challenge-stats/challengeDetailLoader";
import { useTrainingStatsPageFilterModels } from "@/workspaces/challenge-stats/useTrainingStatsPageFilterModels";
export type { TrainingStatsPageViewMode };

type UseTrainingStatsPageControllerArgs = {
  isActive?: boolean;
  language: AppUiLanguage;
  ui: UiLabelEntry;
  viewMode: TrainingStatsPageViewMode;
  challengeInitialProfitability?: StatsFilterState["profitability"];
  resolveSamplePoolName?: (
    samplePoolId: string,
    fallbackName?: string,
  ) => string;
  onError?: (message: string) => void;
};

const fetchStatsViewReport = async (
  nextFilters: StatsFilterState,
  targetViewMode: TrainingStatsPageViewMode,
): Promise<{
  report: ApiTrainingStatsReport;
  challengeDetailsById: Record<string, ApiChallengeStatsProjectDetail>;
}> => {
  if (targetViewMode === "challenge") {
    const modeId =
      resolveChallengeStatsModeIdByTag(nextFilters.tag) ??
      CHALLENGE_STATS_DEFAULT_MODE_ID;
    const challengeStats = await api.getSpecialTrainingStats({
      modeId,
      from: ensureDateInput(nextFilters.from) || undefined,
      to: ensureDateInput(nextFilters.to) || undefined,
      symbol:
        nextFilters.symbol !== ALL_VALUE ? nextFilters.symbol : undefined,
      timeframe:
        nextFilters.timeframe !== ALL_VALUE
          ? (nextFilters.timeframe as "1m" | "5m" | "1h" | "1d")
          : undefined,
      profitability: nextFilters.profitability,
      limit: 200,
      includeProjectDetails: false,
    });
    return {
      report: challengeStats.report,
      challengeDetailsById: challengeStats.projectDetailsById,
    };
  }
  return {
    report: await api.getTrainingStats(buildStatsApiFilters(nextFilters)),
    challengeDetailsById: {},
  };
};

const fetchChallengeProjectDetail = async (
  projectId: string,
): Promise<ApiChallengeStatsProjectDetail | null> => {
  const normalizedId = String(projectId || "").trim();
  if (!normalizedId) {
    return null;
  }
  return api.getSpecialTrainingStatsProjectDetail(normalizedId);
};

const fetchChallengeStatsReadModelFacts =
  async (): Promise<ChallengeStatsReadModelFacts | null> =>
    readChallengeStatsReadModelFacts(
      await api.getWorkspaceReadModel("challenge-stats"),
    );

export const prefetchTrainingStatsPageView = async ({
  viewMode,
  challengeInitialProfitability = "ALL",
}: {
  viewMode: TrainingStatsPageViewMode;
  challengeInitialProfitability?: StatsFilterState["profitability"];
}): Promise<void> => {
  const currentEntry = readSharedStatsViewCacheEntry(viewMode);
  const nextFilters = cloneStatsFilters(currentEntry.filters);
  if (viewMode === "challenge") {
    nextFilters.profitability = challengeInitialProfitability;
    nextFilters.tag =
      normalizeChallengeStatsModeTag(nextFilters.tag) ||
      CHALLENGE_STATS_DEFAULT_TAG;
  }
  const cacheKey = buildStatsFiltersCacheKey(nextFilters);
  const canReuseCachedReport =
    currentEntry.report &&
    currentEntry.filtersKey === cacheKey &&
    (viewMode !== "challenge" ||
      hasChallengeStatsReportData(currentEntry.report));
  if (canReuseCachedReport) {
    return;
  }
  const cachedTask = readStatsViewPrefetchTask(viewMode, cacheKey);
  if (cachedTask) {
    return cachedTask;
  }
  const task = fetchStatsViewReport(nextFilters, viewMode)
    .then(({ report, challengeDetailsById }) => {
      updateSharedStatsViewCacheEntry(viewMode, {
        pendingFilters: nextFilters,
        filters: nextFilters,
        report,
        challengeDetailsById,
        filtersKey: cacheKey,
        selectedSessionId: resolveNextSelectedSessionId(
          currentEntry.selectedSessionId,
          report,
        ),
      });
    })
    .finally(() => {
      clearStatsViewPrefetchTask(viewMode, cacheKey);
    });
  writeStatsViewPrefetchTask(viewMode, cacheKey, task);
  return task;
};

export const useTrainingStatsPageController = ({
  isActive = true,
  language,
  ui,
  viewMode,
  challengeInitialProfitability = "ALL",
  resolveSamplePoolName,
  onError,
}: UseTrainingStatsPageControllerArgs) => {
  const challengeDetailCacheOrderRef = useRef<string[]>([]);
  const modeCacheRef = useRef<Record<
    TrainingStatsPageViewMode,
    StatsViewCacheEntry
  >>({
    training: readSharedStatsViewCacheEntry("training"),
    challenge: readSharedStatsViewCacheEntry("challenge"),
  });
  const challengeReportCacheRef = useRef<Record<
    string,
    {
      report: ApiTrainingStatsReport;
      challengeDetailsById: Record<string, ApiChallengeStatsProjectDetail>;
    }
  >>(
    modeCacheRef.current.challenge.report && modeCacheRef.current.challenge.filtersKey
      ? {
          [modeCacheRef.current.challenge.filtersKey]: {
            report: modeCacheRef.current.challenge.report,
            challengeDetailsById:
              modeCacheRef.current.challenge.challengeDetailsById,
          },
        }
      : {},
  );
  const [pendingFilters, setPendingFilters] = useState<StatsFilterState>(() =>
    cloneStatsFilters(modeCacheRef.current[viewMode].pendingFilters),
  );
  const [filters, setFilters] = useState<StatsFilterState>(() =>
    cloneStatsFilters(modeCacheRef.current[viewMode].filters),
  );
  const [report, setReport] = useState<ApiTrainingStatsReport | null>(
    () => modeCacheRef.current[viewMode].report,
  );
  const [challengeDetailsById, setChallengeDetailsById] =
    useState<Record<string, ApiChallengeStatsProjectDetail>>(
      () => modeCacheRef.current[viewMode].challengeDetailsById,
    );
  const [challengeStatsReadModelFacts, setChallengeStatsReadModelFacts] =
    useState<ChallengeStatsReadModelFacts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearingChallengeHistory, setIsClearingChallengeHistory] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(
    () => modeCacheRef.current[viewMode].selectedSessionId,
  );
  const onErrorRef = useRef(onError);
  const uiRef = useRef(ui);
  const requestIdRef = useRef(0);
  const lastErrorKeyRef = useRef("");

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    uiRef.current = ui;
  }, [ui]);

  useLayoutEffect(() => {
    const snapshot = readSharedStatsViewCacheEntry(viewMode);
    modeCacheRef.current[viewMode] = snapshot;
    setPendingFilters(cloneStatsFilters(snapshot.pendingFilters));
    setFilters(cloneStatsFilters(snapshot.filters));
    setReport(snapshot.report);
    setChallengeDetailsById(snapshot.challengeDetailsById);
    setSelectedSessionId(snapshot.selectedSessionId);
    if (viewMode !== "challenge") {
      setChallengeStatsReadModelFacts(null);
    }
    setIsLoading(false);
  }, [viewMode]);

  useEffect(() => {
    const next = cloneStatsFilters(pendingFilters);
    modeCacheRef.current[viewMode].pendingFilters = next;
    updateSharedStatsViewCacheEntry(viewMode, { pendingFilters: next });
  }, [pendingFilters, viewMode]);

  useEffect(() => {
    const next = cloneStatsFilters(filters);
    modeCacheRef.current[viewMode].filters = next;
    updateSharedStatsViewCacheEntry(viewMode, { filters: next });
  }, [filters, viewMode]);

  useEffect(() => {
    modeCacheRef.current[viewMode].selectedSessionId = selectedSessionId;
    updateSharedStatsViewCacheEntry(viewMode, {
      selectedSessionId,
    });
  }, [selectedSessionId, viewMode]);

  useEffect(() => {
    modeCacheRef.current[viewMode].report = report;
    updateSharedStatsViewCacheEntry(viewMode, { report });
  }, [report, viewMode]);

  useEffect(() => {
    modeCacheRef.current[viewMode].challengeDetailsById = challengeDetailsById;
    updateSharedStatsViewCacheEntry(viewMode, {
      challengeDetailsById,
    });
  }, [challengeDetailsById, viewMode]);

  const emitErrorOnce = useCallback(
    (nextFilters: StatsFilterState, message: string) => {
      const normalizedMessage =
        (message || "").trim() || uiRef.current.statsLoadFailed;
      const errorKey = `${JSON.stringify(nextFilters)}::${normalizedMessage}`;
      if (lastErrorKeyRef.current === errorKey) {
        return;
      }
      lastErrorKeyRef.current = errorKey;
      onErrorRef.current?.(normalizedMessage);
    },
    [],
  );

  const syncSelectedSession = useCallback(
    (nextReport: ApiTrainingStatsReport) => {
      setSelectedSessionId((current) => {
        return resolveNextSelectedSessionId(current, nextReport);
      });
    },
    [],
  );

  const fetchReport = useCallback(
    async (
      nextFilters: StatsFilterState,
      targetViewMode: TrainingStatsPageViewMode,
    ) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const cacheKey = buildStatsFiltersCacheKey(nextFilters);
      const cached = modeCacheRef.current[targetViewMode];
      const cachedChallengeReport =
        targetViewMode === "challenge"
          ? challengeReportCacheRef.current[cacheKey]
          : undefined;
      const canReuseCachedReport =
        (cached.report &&
          cached.filtersKey === cacheKey &&
          (targetViewMode !== "challenge" ||
            hasChallengeStatsReportData(cached.report))) ||
        (cachedChallengeReport &&
          hasChallengeStatsReportData(cachedChallengeReport.report));
      if (canReuseCachedReport) {
        const cachedReport =
          cachedChallengeReport?.report ?? (cached.report as ApiTrainingStatsReport);
        const cachedChallengeDetailsById =
          cachedChallengeReport?.challengeDetailsById ?? cached.challengeDetailsById;
        const nextReadModelFacts =
          targetViewMode === "challenge"
            ? await fetchChallengeStatsReadModelFacts()
            : null;
        modeCacheRef.current[targetViewMode].report = cachedReport;
        modeCacheRef.current[targetViewMode].challengeDetailsById =
          cachedChallengeDetailsById;
        modeCacheRef.current[targetViewMode].filtersKey = cacheKey;
        updateSharedStatsViewCacheEntry(targetViewMode, {
          report: cachedReport,
          challengeDetailsById: cachedChallengeDetailsById,
          filtersKey: cacheKey,
        });
        if (targetViewMode === viewMode) {
          setReport(cachedReport);
          setChallengeDetailsById(cachedChallengeDetailsById);
          if (targetViewMode === "challenge") {
            setChallengeStatsReadModelFacts(nextReadModelFacts);
          }
          syncSelectedSession(cachedReport);
          setIsLoading(false);
        }
        return;
      }
      if (targetViewMode === viewMode) {
        setIsLoading(true);
      }
      try {
        const prefetchTask = readStatsViewPrefetchTask(
          targetViewMode,
          cacheKey,
        );
        if (prefetchTask) {
          await prefetchTask;
        }
        const warmed = readSharedStatsViewCacheEntry(targetViewMode);
        let data: ApiTrainingStatsReport;
        let nextChallengeDetailsById: Record<
          string,
          ApiChallengeStatsProjectDetail
        >;
        let nextReadModelFacts: ChallengeStatsReadModelFacts | null = null;
        if (warmed.report && warmed.filtersKey === cacheKey) {
          data = warmed.report;
          nextChallengeDetailsById = warmed.challengeDetailsById;
        } else {
          const fetched = await fetchStatsViewReport(nextFilters, targetViewMode);
          data = fetched.report;
          nextChallengeDetailsById = fetched.challengeDetailsById;
        }
        if (targetViewMode === "challenge") {
          nextReadModelFacts = await fetchChallengeStatsReadModelFacts();
        }
        if (requestId !== requestIdRef.current) {
          return;
        }
        modeCacheRef.current[targetViewMode].report = data;
        modeCacheRef.current[targetViewMode].challengeDetailsById =
          nextChallengeDetailsById;
        modeCacheRef.current[targetViewMode].filtersKey = cacheKey;
        if (targetViewMode === "challenge") {
          challengeReportCacheRef.current[cacheKey] = {
            report: data,
            challengeDetailsById: nextChallengeDetailsById,
          };
        }
        updateSharedStatsViewCacheEntry(targetViewMode, {
          report: data,
          challengeDetailsById: nextChallengeDetailsById,
          filtersKey: cacheKey,
        });
        if (targetViewMode !== viewMode) {
          return;
        }
        setReport(data);
        setChallengeDetailsById(nextChallengeDetailsById);
        if (targetViewMode === "challenge") {
          setChallengeStatsReadModelFacts(nextReadModelFacts);
        }
        syncSelectedSession(data);
        lastErrorKeyRef.current = "";
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (targetViewMode !== viewMode) {
          return;
        }
        console.error("[training-stats] report load failed", error);
        emitErrorOnce(nextFilters, uiRef.current.statsLoadFailed);
      } finally {
        if (requestId === requestIdRef.current && targetViewMode === viewMode) {
          setIsLoading(false);
        }
      }
    },
    [
      emitErrorOnce,
      syncSelectedSession,
      viewMode,
    ],
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }
    void fetchReport(filters, viewMode);
  }, [fetchReport, filters, isActive, viewMode]);

  const applyFilters = useCallback(() => {
    setFilters({ ...pendingFilters });
  }, [pendingFilters]);

  const resetFilters = useCallback(() => {
    const initial = buildInitialFiltersByViewMode(viewMode);
    setPendingFilters(initial);
    setFilters(initial);
    modeCacheRef.current[viewMode].filtersKey = "";
    modeCacheRef.current[viewMode].report = null;
    modeCacheRef.current[viewMode].challengeDetailsById = {};
    if (viewMode === "challenge") {
      challengeReportCacheRef.current = {};
    }
    updateSharedStatsViewCacheEntry(viewMode, {
      filtersKey: "",
      report: null,
      challengeDetailsById: {},
    });
    setReport(null);
    setChallengeDetailsById({});
  }, [viewMode]);

  const applyQuickRange = useCallback((days: number) => {
    if (days <= 0) {
      setPendingFilters((current) => ({ ...current, from: "", to: "" }));
      return;
    }
    const normalizedDays = Math.max(1, Math.floor(days));
    const toInput = toMarketDateKey(Date.now());
    const fromInput =
      shiftMarketDateKey(toInput, -(normalizedDays - 1)) || toInput;
    setPendingFilters((current) => ({
      ...current,
      from: fromInput,
      to: toInput,
    }));
  }, []);

  const clearChallengeHistory = useCallback(
    async (modeId?: ApiSpecialTrainingModeId) => {
      if (isClearingChallengeHistory) {
        return {
          deletedSessionRows: 0,
          deletedQuestionRows: 0,
        };
      }
      setIsClearingChallengeHistory(true);
      try {
        const result = await api.clearSpecialTrainingHistory(
          modeId ? { modeId } : {},
        );
        requestIdRef.current += 1;
        modeCacheRef.current.challenge.filtersKey = "";
        modeCacheRef.current.challenge.report = null;
        modeCacheRef.current.challenge.challengeDetailsById = {};
        modeCacheRef.current.challenge.selectedSessionId = "";
        challengeReportCacheRef.current = {};
        challengeDetailCacheOrderRef.current = [];
        updateSharedStatsViewCacheEntry("challenge", {
          filtersKey: "",
          report: null,
          challengeDetailsById: {},
          selectedSessionId: "",
        });
        if (viewMode === "challenge") {
          setReport(null);
          setChallengeDetailsById({});
          setSelectedSessionId("");
          setChallengeStatsReadModelFacts(null);
          setIsLoading(false);
        }
        lastErrorKeyRef.current = "";
        return result;
      } catch (error) {
        console.error("[training-stats] history clear failed", error);
        emitErrorOnce(filters, uiRef.current.statsLoadFailed);
        throw error;
      } finally {
        setIsClearingChallengeHistory(false);
      }
    },
    [emitErrorOnce, filters, isClearingChallengeHistory, viewMode],
  );

  const loadTrainingProjectDetail = useCallback(
    async (projectId: string): Promise<ApiTrainingProjectDetail> =>
      api.getTrainingProject(projectId),
    [],
  );

  const loadChallengeProjectDetail = useCallback(
    async (projectId: string): Promise<ApiChallengeStatsProjectDetail | null> => {
      const detail = await resolveCachedChallengeProjectDetail({
        projectId,
        currentDetailsById: challengeDetailsById,
        cachedDetailsById: modeCacheRef.current.challenge.challengeDetailsById,
        fetchDetail: fetchChallengeProjectDetail,
      });
      if (!detail) {
        return null;
      }
      const normalizedId = detail.id;
      setChallengeDetailsById((current) => {
        if (current[normalizedId] === detail) {
          return current;
        }
        const nextOrder = [
          normalizedId,
          ...challengeDetailCacheOrderRef.current.filter((item) => item !== normalizedId),
        ].slice(0, 12);
        challengeDetailCacheOrderRef.current = nextOrder;
        const next: Record<string, ApiChallengeStatsProjectDetail> = {
          [normalizedId]: detail,
        };
        nextOrder.slice(1).forEach((itemId) => {
          const cachedDetail = current[itemId];
          if (cachedDetail) {
            next[itemId] = cachedDetail;
          }
        });
        modeCacheRef.current.challenge.challengeDetailsById = next;
        updateSharedStatsViewCacheEntry("challenge", {
          challengeDetailsById: next,
        });
        return next;
      });
      return detail;
    },
    [challengeDetailsById]
  );
  const desktopSecondaryWindows = useMemo(
    () => ({
      open: api.openDesktopSecondaryWindow,
      publish: api.publishDesktopSecondaryWindowState,
      subscribeActions: api.subscribeDesktopSecondaryWindowActions,
    }),
    [],
  );
  const {
    challengeModes,
    activeChallengeModeId,
    handleSelectChallengeMode,
    resolvePoolDisplayName,
    resolvedFilterSamplePools,
    normalizedPendingSamplePoolId,
    normalizedPendingComparePoolA,
    normalizedPendingComparePoolB,
  } = useTrainingStatsPageFilterModels({
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
  });

  return {
    pendingFilters,
    setPendingFilters,
    filters,
    setFilters,
    report,
    challengeDetailsById,
    challengeStatsReadModelFacts,
    isLoading,
    isClearingChallengeHistory,
    selectedSessionId,
    setSelectedSessionId,
    fetchReport,
    clearChallengeHistory,
    applyFilters,
    resetFilters,
    applyQuickRange,
    loadTrainingProjectDetail,
    loadChallengeProjectDetail,
    desktopSecondaryWindows,
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
