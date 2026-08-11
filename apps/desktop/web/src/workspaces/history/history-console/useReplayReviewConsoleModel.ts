// SPDX-License-Identifier: GPL-3.0-only

import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type ApiTrainingProject,
  type ApiTrainingReviewDiagnosticsPayload,
  type ApiTrainingReviewReportPayload,
} from "@/api";
import { HISTORY_PROJECT_PAGE_SIZE } from "@/frontend-kernel/runtimeConstants";
import { getTradingSettingsText, type AppUiLanguage } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import { parseTimestampMs } from "@zinuto/shared/marketTime";
import type { TradingAssetClass } from "@zinuto/shared/trading";
import {
  buildReplayReviewSelectionKey,
  isReplayReviewWindowCovered,
  resolveOldestLoadedProjectTs,
  resolveReplayReviewEffectiveCoverage,
  resolveReplayReviewDisplayState,
  shouldReplayReviewLoadMoreHistory,
  shouldReplayReviewRequestBundle,
} from "@/workspaces/history/history-console/replayReviewLoadingState";
import type {
  AssetFilterTab,
  ReplayReviewModel,
  ReplayReviewPendingSections,
  ReplayReviewProject,
  ReplayReviewSessionMetric,
  ReplayReviewWindow,
} from "@/workspaces/history/history-console/types";
import { useReplayReviewConsoleBundle } from "@/workspaces/history/history-console/useReplayReviewConsoleBundle";
import type { LoadMoreHistoryProjects } from "@/domains/history/historyTypes";
import { useReplayReviewHistoryPagination } from "@/workspaces/history/history-console/useReplayReviewHistoryPagination";

type UseReplayReviewConsoleModelArgs = {
  language: AppUiLanguage;
  ui: UiLabelEntry;
  samplePoolAllId: string;
  trainingProjects: ReplayReviewProject[];
  historyProjectsNextCursor: string | null;
  isHistoryProjectsLoading: boolean;
  isHistoryProjectsLoadingMore: boolean;
  loadMoreTrainingProjects: LoadMoreHistoryProjects;
  historyPreset?: "ALL" | "HIGHLIGHT" | "DRAWDOWN";
  reviewWindow?: ReplayReviewWindow;
  reviewDisplayLimit?: number;
  reviewWindowAnchorMs?: number;
  onError?: (message: string) => void;
};

type ReplayReviewSnapshot = {
  selectionKey: string;
  projectIdsKey: string;
  filteredProjects: ReplayReviewProject[];
  candidateSessionMetrics: ReplayReviewSessionMetric[];
  visibleSessionMetrics: ReplayReviewSessionMetric[];
  reviewReport: ApiTrainingReviewReportPayload | null;
  reviewDiagnostics: ApiTrainingReviewDiagnosticsPayload | null;
};

const EMPTY_PENDING_SECTIONS: ReplayReviewPendingSections = Object.freeze({
  overviewKpis: false,
  overviewMatrix: false,
  overviewTrend: false,
  behaviorMargin: false,
  archiveTable: false,
});

const REVIEW_DETAIL_CACHE_MAX = 24;
const REPLAY_REVIEW_DAY_MS = 24 * 60 * 60 * 1000;

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const resolveProjectAssetClass = (
  project: ReplayReviewProject,
): TradingAssetClass | null => {
  const assetClass = String((project as { assetClass?: unknown }).assetClass ?? "")
    .trim()
    .toUpperCase();
  if (
    assetClass === "STOCK" ||
    assetClass === "FUTURES" ||
    assetClass === "FOREX" ||
    assetClass === "CRYPTO"
  ) {
    return assetClass;
  }
  return null;
};

const matchesHistoryPresetByProject = (
  project: ReplayReviewProject,
  preset: "ALL" | "HIGHLIGHT" | "DRAWDOWN",
): boolean => {
  if (preset === "HIGHLIGHT") {
    return normalizeNumber(project.profitRate) > 0.1;
  }
  if (preset === "DRAWDOWN") {
    return normalizeNumber(project.summary?.maxDrawdownRate) > 0.3;
  }
  return true;
};

const buildSyntheticDetailFromProject = (
  project: ReplayReviewProject,
): ApiTrainingProject | null => {
  const replay = (project as ReplayReviewProject & { replay?: ArchivedReplayData })
    .replay;
  if (!replay) {
    return null;
  }
  return {
    ...project,
    replay,
  };
};

const normalizeReplayArchive = (
  detail: ApiTrainingProject | null | undefined,
): ArchivedReplayData | null => {
  if (!detail || !detail.replay || typeof detail.replay !== "object") {
    return null;
  }
  return detail.replay as ArchivedReplayData;
};

const resolveProjectSortTimestamp = (project: ReplayReviewProject): number => {
  const createdAt = parseTimestampMs(project.createdAt || "");
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }
  const updatedAt = parseTimestampMs(project.updatedAt || "");
  return Number.isFinite(updatedAt) ? updatedAt : 0;
};

const resolveReportEnvironmentKey = (
  session: ApiTrainingReviewReportPayload["sessions"][number],
): string => {
  const marketPresetId = String(session.environment.marketPresetId || "").trim();
  if (marketPresetId) {
    return marketPresetId;
  }
  return `${session.environment.assetClass}_${session.environment.tradeSettlementMode}_${session.environment.allowShortSelling ? "LS" : "L"}`;
};

const adaptReportSessionMetric = (
  session: ApiTrainingReviewReportPayload["sessions"][number],
  assetClassLabels: Record<TradingAssetClass, string>,
): ReplayReviewSessionMetric => {
  const projectReplay = normalizeReplayArchive(session.project);
  return {
    ...session,
    project: {
      ...session.project,
      replay: projectReplay ?? undefined,
    },
    detail: null,
    assetClassLabel: assetClassLabels[session.assetClass],
    environment: {
      key: resolveReportEnvironmentKey(session),
      marketPresetId: session.environment.marketPresetId,
      assetClass: session.environment.assetClass,
      assetClassLabel: assetClassLabels[session.environment.assetClass],
      tradeSettlementMode: session.environment.tradeSettlementMode,
      allowLongMarginTrading: session.environment.allowLongMarginTrading,
      allowShortSelling: session.environment.allowShortSelling,
      leverageMultiple: session.environment.leverageMultiple,
      usesMakerTaker: session.environment.usesMakerTaker,
      fundingRate: session.environment.fundingRate,
    },
  };
};

const adaptReportSessions = (
  report: ApiTrainingReviewReportPayload | null | undefined,
  assetClassLabels: Record<TradingAssetClass, string>,
): ReplayReviewSessionMetric[] => {
  if (!report) {
    return [];
  }
  return report.sessions
    .map((session) => adaptReportSessionMetric(session, assetClassLabels))
    .sort((left, right) => {
      if (right.projectTs !== left.projectTs) {
        return right.projectTs - left.projectTs;
      }
      return right.id.localeCompare(left.id);
    });
};

const resolveActiveDetail = (
  projectId: string,
  projects: ReplayReviewProject[],
  detailMap: Map<string, ApiTrainingProject | null>,
): { project: ReplayReviewProject; detail: ApiTrainingProject } | null => {
  if (!projectId) {
    return null;
  }
  const project = projects.find((item) => item.id === projectId);
  if (!project) {
    return null;
  }
  const detail =
    detailMap.get(projectId) ?? buildSyntheticDetailFromProject(project) ?? null;
  if (!detail || !normalizeReplayArchive(detail)) {
    return null;
  }
  return {
    project,
    detail,
  };
};

const resolveReviewDisplayLimit = (value: number | undefined): number =>
  Math.max(
    HISTORY_PROJECT_PAGE_SIZE,
    Math.floor(Number.isFinite(Number(value)) ? Number(value) : HISTORY_PROJECT_PAGE_SIZE),
  );

const readReplayReviewTimeWindowMs = (
  window: ReplayReviewWindow,
): number | null => {
  if (window === "LAST_7D") {
    return 7 * REPLAY_REVIEW_DAY_MS;
  }
  if (window === "LAST_30D") {
    return 30 * REPLAY_REVIEW_DAY_MS;
  }
  return null;
};

const collectPreviousReviewProjectIds = ({
  sessionsDesc,
  window,
  anchorMs,
}: {
  sessionsDesc: ReplayReviewSessionMetric[];
  window: ReplayReviewWindow;
  anchorMs?: number;
}): string[] => {
  if (window === "ALL" || sessionsDesc.length <= 0) {
    return [];
  }
  if (window === "LAST_10" || window === "LAST_50") {
    const count = window === "LAST_10" ? 10 : 50;
    return sessionsDesc
      .slice(count, count * 2)
      .map((session) => session.id)
      .filter(Boolean);
  }

  const rangeMs = readReplayReviewTimeWindowMs(window);
  const anchor = Number(anchorMs);
  if (rangeMs === null || !Number.isFinite(anchor)) {
    return [];
  }
  const currentStart = anchor - rangeMs;
  const previousStart = currentStart - rangeMs;
  return sessionsDesc
    .filter((session) => {
      const sessionTs = normalizeNumber(session.projectTs);
      return sessionTs >= previousStart && sessionTs < currentStart;
    })
    .map((session) => session.id)
    .filter(Boolean);
};

const trimReplayReviewDetailMap = (
  detailMap: Map<string, ApiTrainingProject | null>,
  keepProjectId = "",
): Map<string, ApiTrainingProject | null> => {
  if (detailMap.size <= REVIEW_DETAIL_CACHE_MAX) {
    return detailMap;
  }
  const next = new Map(detailMap);
  for (const key of next.keys()) {
    if (next.size <= REVIEW_DETAIL_CACHE_MAX) {
      break;
    }
    if (key === keepProjectId) {
      continue;
    }
    next.delete(key);
  }
  return next;
};

export const useReplayReviewConsoleModel = ({
  language,
  ui: _ui,
  samplePoolAllId: _samplePoolAllId,
  trainingProjects,
  historyProjectsNextCursor,
  isHistoryProjectsLoading,
  isHistoryProjectsLoadingMore,
  loadMoreTrainingProjects,
  historyPreset = "ALL",
  reviewWindow = "ALL",
  reviewDisplayLimit,
  reviewWindowAnchorMs,
  onError,
}: UseReplayReviewConsoleModelArgs): ReplayReviewModel => {
  const tradingText = getTradingSettingsText(language);
  const [assetTab, setAssetTab] = useState<AssetFilterTab>("ALL");
  const [detailMap, setDetailMap] = useState<Map<string, ApiTrainingProject | null>>(
    () => new Map(),
  );
  const [activeReplayProjectId, setActiveReplayProjectId] = useState("");
  const [settledSnapshot, setSettledSnapshot] = useState<ReplayReviewSnapshot | null>(
    null,
  );
  const detailInFlightIdsRef = useRef<Set<string>>(new Set());

  const filteredProjects = useMemo(
    () =>
      [...trainingProjects]
        .filter((project) => {
          if (assetTab !== "ALL" && resolveProjectAssetClass(project) !== assetTab) {
            return false;
          }
          return matchesHistoryPresetByProject(project, historyPreset);
        })
        .sort((left, right) => {
          const diff = resolveProjectSortTimestamp(right) - resolveProjectSortTimestamp(left);
          if (diff !== 0) {
            return diff;
          }
          return right.id.localeCompare(left.id);
        }),
    [
      assetTab,
      historyPreset,
      trainingProjects,
    ],
  );
  const boundedFilteredProjects = useMemo(() => {
    if (reviewWindow !== "ALL") {
      return filteredProjects;
    }
    return filteredProjects.slice(0, resolveReviewDisplayLimit(reviewDisplayLimit));
  }, [filteredProjects, reviewDisplayLimit, reviewWindow]);
  const reportProjectIds = useMemo(
    () => boundedFilteredProjects.map((project) => project.id),
    [boundedFilteredProjects],
  );
  const currentProjectIdsKey = useMemo(
    () => reportProjectIds.join("|"),
    [reportProjectIds],
  );
  const currentSelectionKey = useMemo(
    () =>
      buildReplayReviewSelectionKey({
        assetTab,
        historyPreset,
        reviewWindow,
        reviewWindowAnchorMs,
      }),
    [
      assetTab,
      historyPreset,
      reviewWindow,
      reviewWindowAnchorMs,
    ],
  );
  const hasMoreHistory = Boolean(historyProjectsNextCursor);
  const oldestLoadedProjectTs = useMemo(
    () => resolveOldestLoadedProjectTs(trainingProjects),
    [trainingProjects],
  );
  const shouldLoadMoreHistory = useMemo(
    () =>
      shouldReplayReviewLoadMoreHistory({
        window: reviewWindow,
        filteredProjectCount: boundedFilteredProjects.length,
        oldestLoadedProjectTs,
        hasMoreHistory,
        anchorMs: reviewWindowAnchorMs,
        isHistoryProjectsLoading,
        isHistoryProjectsLoadingMore,
      }),
    [
      boundedFilteredProjects.length,
      hasMoreHistory,
      isHistoryProjectsLoading,
      isHistoryProjectsLoadingMore,
      oldestLoadedProjectTs,
      reviewWindow,
      reviewWindowAnchorMs,
    ],
  );

  const {
    isHistoryPaginationStalled,
    retryHistoryPagination,
  } = useReplayReviewHistoryPagination({
    historyProjectsNextCursor,
    loadMoreTrainingProjects,
    shouldLoadMoreHistory,
  });

  const coverageSatisfied = useMemo(
    () =>
      isReplayReviewWindowCovered({
        window: reviewWindow,
        filteredProjectCount: boundedFilteredProjects.length,
        oldestLoadedProjectTs,
        hasMoreHistory,
        anchorMs: reviewWindowAnchorMs,
      }),
    [
      boundedFilteredProjects.length,
      hasMoreHistory,
      oldestLoadedProjectTs,
      reviewWindow,
      reviewWindowAnchorMs,
    ],
  );
  const effectiveCoverageSatisfied = resolveReplayReviewEffectiveCoverage({
    coverageSatisfied,
    paginationStalled: isHistoryPaginationStalled,
  });
  const bundleRequestEnabled = useMemo(
    () =>
      shouldReplayReviewRequestBundle({
        projectCount: reportProjectIds.length,
        coverageSatisfied: effectiveCoverageSatisfied,
        isHistoryProjectsLoading,
        isHistoryProjectsLoadingMore,
      }),
    [
      effectiveCoverageSatisfied,
      isHistoryProjectsLoading,
      isHistoryProjectsLoadingMore,
      reportProjectIds.length,
    ],
  );

  const catalogState = useReplayReviewConsoleBundle({
    projectIds: reportProjectIds,
    window: "ALL",
    anchorMs: reviewWindowAnchorMs,
    enabled: bundleRequestEnabled,
    onError,
  });
  const reviewBundleState = useReplayReviewConsoleBundle({
    projectIds: reportProjectIds,
    window: reviewWindow,
    anchorMs: reviewWindowAnchorMs,
    enabled: bundleRequestEnabled && reviewWindow !== "ALL",
    onError,
  });
  const reviewState = reviewWindow === "ALL" ? catalogState : reviewBundleState;
  const requiresBundle = reportProjectIds.length > 0;
  const currentCatalogResolved =
    !requiresBundle || catalogState.resolvedKey === catalogState.requestKey;
  const currentReviewResolved =
    !requiresBundle || reviewState.resolvedKey === reviewState.requestKey;
  const currentDataResolved = currentCatalogResolved && currentReviewResolved;
  const currentDataFailed =
    (requiresBundle && catalogState.failedKey === catalogState.requestKey) ||
    (requiresBundle && reviewState.failedKey === reviewState.requestKey);

  const currentCandidateSessionMetrics = useMemo(
    () =>
      currentCatalogResolved
        ? adaptReportSessions(catalogState.bundle?.report, tradingText.assetClassLabels)
        : [],
    [catalogState.bundle?.report, currentCatalogResolved, tradingText.assetClassLabels],
  );
  const currentVisibleSessionMetrics = useMemo(
    () =>
      currentReviewResolved
        ? adaptReportSessions(reviewState.bundle?.report, tradingText.assetClassLabels)
        : [],
    [currentReviewResolved, reviewState.bundle?.report, tradingText.assetClassLabels],
  );
  const previousReportProjectIds = useMemo(
    () =>
      collectPreviousReviewProjectIds({
        sessionsDesc: currentCandidateSessionMetrics,
        window: reviewWindow,
        anchorMs: reviewWindowAnchorMs,
      }),
    [currentCandidateSessionMetrics, reviewWindow, reviewWindowAnchorMs],
  );
  const previousBundleState = useReplayReviewConsoleBundle({
    projectIds: previousReportProjectIds,
    window: "ALL",
    enabled:
      bundleRequestEnabled &&
      reviewWindow !== "ALL" &&
      previousReportProjectIds.length > 0,
    onError,
  });
  const previousReportResolved =
    previousReportProjectIds.length > 0 &&
    previousBundleState.resolvedKey === previousBundleState.requestKey;
  const previousReviewReport = previousReportResolved
    ? (previousBundleState.bundle?.report ?? null)
    : null;
  const currentSnapshot = useMemo<ReplayReviewSnapshot | null>(() => {
    if (
      !effectiveCoverageSatisfied ||
      (requiresBundle && !currentDataResolved)
    ) {
      return null;
    }
    return {
      selectionKey: currentSelectionKey,
      projectIdsKey: currentProjectIdsKey,
      filteredProjects: boundedFilteredProjects,
      candidateSessionMetrics: currentCandidateSessionMetrics,
      visibleSessionMetrics: currentVisibleSessionMetrics,
      reviewReport: reviewState.bundle?.report ?? null,
      reviewDiagnostics: reviewState.bundle?.diagnostics ?? null,
    };
  }, [
    effectiveCoverageSatisfied,
    currentCandidateSessionMetrics,
    currentDataResolved,
    currentProjectIdsKey,
    currentSelectionKey,
    currentVisibleSessionMetrics,
    boundedFilteredProjects,
    requiresBundle,
    reviewState.bundle?.report,
    reviewState.bundle?.diagnostics,
  ]);
  const displaySnapshot = currentSnapshot ?? settledSnapshot;
  const displayState = useMemo(
    () =>
      resolveReplayReviewDisplayState({
        hasDisplaySnapshot: Boolean(displaySnapshot),
        displaySelectionKey: displaySnapshot?.selectionKey ?? null,
        displayProjectIdsKey: displaySnapshot?.projectIdsKey ?? null,
        currentSelectionKey,
        currentProjectIdsKey,
        coverageSatisfied: effectiveCoverageSatisfied,
        requiresBundle,
        currentDataResolved,
        currentDataFailed,
      }),
    [
      effectiveCoverageSatisfied,
      currentDataFailed,
      currentDataResolved,
      currentProjectIdsKey,
      currentSelectionKey,
      displaySnapshot,
      requiresBundle,
    ],
  );
  const activeTabPendingSections = useMemo<ReplayReviewPendingSections>(
    () =>
      displayState.isRevalidating
        ? {
            overviewKpis: true,
            overviewMatrix: true,
            overviewTrend: true,
            behaviorMargin: true,
            archiveTable: true,
          }
        : EMPTY_PENDING_SECTIONS,
    [displayState.isRevalidating],
  );
  const displayProjects = displaySnapshot?.filteredProjects ?? [];
  const displayProjectIdSet = useMemo(
    () => new Set(displayProjects.map((project) => project.id)),
    [displayProjects],
  );

  useEffect(() => {
    if (!currentSnapshot) {
      return;
    }
    setSettledSnapshot((current) => {
      if (
        current?.selectionKey === currentSnapshot.selectionKey &&
        current?.projectIdsKey === currentSnapshot.projectIdsKey
      ) {
        return current;
      }
      return currentSnapshot;
    });
  }, [currentSnapshot]);

  useEffect(() => {
    detailInFlightIdsRef.current = new Set(
      Array.from(detailInFlightIdsRef.current).filter(
        (projectId) => projectId === activeReplayProjectId,
      ),
    );
    setDetailMap((current) => {
      const next = trimReplayReviewDetailMap(current, activeReplayProjectId);
      return next === current ? current : next;
    });
  }, [activeReplayProjectId]);

  useEffect(() => {
    if (
      activeReplayProjectId &&
      !displayProjectIdSet.has(activeReplayProjectId) &&
      !displayProjects.some((project) => project.id === activeReplayProjectId)
    ) {
      setActiveReplayProjectId("");
    }
  }, [activeReplayProjectId, displayProjectIdSet, displayProjects]);

  useEffect(() => {
    const projectId = String(activeReplayProjectId || "").trim();
    if (!projectId || detailMap.has(projectId) || detailInFlightIdsRef.current.has(projectId)) {
      return;
    }
    const controller = new AbortController();
    detailInFlightIdsRef.current.add(projectId);
    void api
      .getTrainingProject(projectId, {
        signal: controller.signal,
      })
      .then((detail) => {
        if (controller.signal.aborted) {
          return;
        }
        setDetailMap((current) => {
          const next = new Map(current);
          next.delete(projectId);
          next.set(projectId, detail);
          return trimReplayReviewDetailMap(next, projectId);
        });
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setDetailMap((current) => {
          const next = new Map(current);
          next.delete(projectId);
          next.set(projectId, null);
          return trimReplayReviewDetailMap(next, projectId);
        });
      })
      .finally(() => {
        detailInFlightIdsRef.current.delete(projectId);
      });
    return () => {
      controller.abort();
      detailInFlightIdsRef.current.delete(projectId);
    };
  }, [activeReplayProjectId, detailMap]);

  const visibleSessionMetrics = useMemo(
    () =>
      (displaySnapshot?.visibleSessionMetrics ?? []).map((session) => ({
        ...session,
        detail: detailMap.get(session.id) ?? null,
      })),
    [detailMap, displaySnapshot],
  );
  const activeReplayProject = useMemo(
    () => resolveActiveDetail(activeReplayProjectId, displayProjects, detailMap),
    [activeReplayProjectId, detailMap, displayProjects],
  );
  const activeReplayResolved = useMemo(
    () => detailMap.has(activeReplayProjectId),
    [activeReplayProjectId, detailMap],
  );

  return {
    locale: language,
    filters: {
      assetTab,
    },
    setAssetTab,
    loadingState: displayState.loadingState,
    hasSettledSnapshot: Boolean(displaySnapshot),
    isRevalidating: displayState.isRevalidating,
    pendingReason: displayState.pendingReason,
    isHistoryPaginationStalled,
    retryHistoryPagination,
    activeTabPendingSections,
    windowCandidateSessionMetrics: displaySnapshot?.candidateSessionMetrics ?? [],
    visibleSessionMetrics,
    reviewReport: displaySnapshot?.reviewReport ?? null,
    previousReviewReport,
    activeReplayProjectId,
    isActiveReplayLoading: Boolean(activeReplayProjectId) && !activeReplayResolved,
    activeReplayProject,
    reviewDiagnostics: displaySnapshot?.reviewDiagnostics ?? null,
    isDiagnosticsLoading: reviewState.isLoading,
    openReplayProject: setActiveReplayProjectId,
    closeReplayProject: () => setActiveReplayProjectId(""),
  };
};
