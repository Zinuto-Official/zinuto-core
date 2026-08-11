// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs } from "@zinuto/shared/marketTime";
import type {
  AssetFilterTab,
  ReplayReviewLoadingState,
  ReplayReviewPendingReason,
  ReplayReviewProject,
  ReplayReviewWindow,
} from "@/workspaces/history/history-console/types";

const REPLAY_REVIEW_DAY_MS = 24 * 60 * 60 * 1000;

const isReplayReviewTimeWindow = (
  window: ReplayReviewWindow,
): window is "LAST_7D" | "LAST_30D" =>
  window === "LAST_7D" || window === "LAST_30D";

const normalizeReplayReviewWindowAnchorDay = (
  window: ReplayReviewWindow,
  anchorMs?: number,
): number | null => {
  if (!isReplayReviewTimeWindow(window)) {
    return null;
  }
  const numeric = Number(anchorMs);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric / REPLAY_REVIEW_DAY_MS);
};

const resolveReplayReviewTimeWindowBoundaryMs = (
  window: ReplayReviewWindow,
  anchorMs?: number,
): number | null => {
  const rangeMs =
    window === "LAST_7D"
      ? 7 * REPLAY_REVIEW_DAY_MS
      : window === "LAST_30D"
        ? 30 * REPLAY_REVIEW_DAY_MS
        : null;
  if (rangeMs === null) {
    return null;
  }
  const numericAnchorMs = Number(anchorMs);
  if (!Number.isFinite(numericAnchorMs) || numericAnchorMs <= 0) {
    return null;
  }
  return numericAnchorMs - rangeMs;
};

type BuildReplayReviewSelectionKeyArgs = {
  assetTab: AssetFilterTab;
  historyPreset: "ALL" | "HIGHLIGHT" | "DRAWDOWN";
  reviewWindow: ReplayReviewWindow;
  reviewWindowAnchorMs?: number;
};

type ResolveReplayReviewWindowCoverageArgs = {
  window: ReplayReviewWindow;
  filteredProjectCount: number;
  oldestLoadedProjectTs: number;
  hasMoreHistory: boolean;
  anchorMs?: number;
};

type ResolveReplayReviewDisplayStateArgs = {
  hasDisplaySnapshot: boolean;
  displaySelectionKey: string | null;
  displayProjectIdsKey: string | null;
  currentSelectionKey: string;
  currentProjectIdsKey: string;
  coverageSatisfied: boolean;
  requiresBundle: boolean;
  currentDataResolved: boolean;
  currentDataFailed: boolean;
};

type ReplayReviewDisplayState = {
  canCommitCurrentSelection: boolean;
  loadingState: ReplayReviewLoadingState;
  isRevalidating: boolean;
  pendingReason: ReplayReviewPendingReason;
};

type ShouldReplayReviewRequestBundleArgs = {
  projectCount: number;
  coverageSatisfied: boolean;
  isHistoryProjectsLoading: boolean;
  isHistoryProjectsLoadingMore: boolean;
};

export const buildReplayReviewSelectionKey = ({
  assetTab,
  historyPreset,
  reviewWindow,
  reviewWindowAnchorMs,
}: BuildReplayReviewSelectionKeyArgs): string =>
  JSON.stringify({
    assetTab,
    historyPreset,
    reviewWindow,
    reviewWindowAnchor: normalizeReplayReviewWindowAnchorDay(
      reviewWindow,
      reviewWindowAnchorMs,
    ),
  });

export const resolveOldestLoadedProjectTs = (
  projects: readonly ReplayReviewProject[],
): number => {
  let oldest = Number.POSITIVE_INFINITY;
  projects.forEach((project) => {
    const ts = parseTimestampMs(project.createdAt || project.updatedAt || "");
    if (Number.isFinite(ts)) {
      oldest = Math.min(oldest, ts);
    }
  });
  return Number.isFinite(oldest) ? oldest : 0;
};

export const isReplayReviewWindowCovered = ({
  window,
  filteredProjectCount,
  oldestLoadedProjectTs,
  hasMoreHistory,
  anchorMs,
}: ResolveReplayReviewWindowCoverageArgs): boolean => {
  if (window === "ALL") {
    return true;
  }

  if (window === "LAST_10" || window === "LAST_50") {
    const targetCount = window === "LAST_10" ? 10 : 50;
    return filteredProjectCount >= targetCount || !hasMoreHistory;
  }

  if (!hasMoreHistory) {
    return true;
  }

  if (!Number.isFinite(oldestLoadedProjectTs) || oldestLoadedProjectTs <= 0) {
    return false;
  }

  const numericAnchorMs = Number(anchorMs);
  if (!Number.isFinite(numericAnchorMs) || numericAnchorMs <= 0) {
    return false;
  }

  const requiredBoundary = resolveReplayReviewTimeWindowBoundaryMs(
    window,
    numericAnchorMs,
  );
  if (requiredBoundary === null) {
    return false;
  }
  return oldestLoadedProjectTs <= requiredBoundary;
};

export const shouldReplayReviewLoadMoreHistory = (
  args: ResolveReplayReviewWindowCoverageArgs & {
    isHistoryProjectsLoading: boolean;
    isHistoryProjectsLoadingMore: boolean;
  },
): boolean => {
  if (
    args.isHistoryProjectsLoading ||
    args.isHistoryProjectsLoadingMore ||
    !args.hasMoreHistory
  ) {
    return false;
  }
  return !isReplayReviewWindowCovered(args);
};

export const resolveReplayReviewEffectiveCoverage = ({
  coverageSatisfied,
  paginationStalled,
}: {
  coverageSatisfied: boolean;
  paginationStalled: boolean;
}): boolean => coverageSatisfied || paginationStalled;

export const shouldReplayReviewRequestBundle = ({
  projectCount,
  coverageSatisfied,
  isHistoryProjectsLoading,
  isHistoryProjectsLoadingMore,
}: ShouldReplayReviewRequestBundleArgs): boolean => {
  if (projectCount <= 0 || !coverageSatisfied) {
    return false;
  }
  return !isHistoryProjectsLoading && !isHistoryProjectsLoadingMore;
};

export const resolveReplayReviewDisplayState = ({
  hasDisplaySnapshot,
  displaySelectionKey,
  displayProjectIdsKey,
  currentSelectionKey,
  currentProjectIdsKey,
  coverageSatisfied,
  requiresBundle,
  currentDataResolved,
  currentDataFailed,
}: ResolveReplayReviewDisplayStateArgs): ReplayReviewDisplayState => {
  const canCommitCurrentSelection =
    coverageSatisfied && (!requiresBundle || currentDataResolved);

  if (canCommitCurrentSelection) {
    return {
      canCommitCurrentSelection,
      loadingState: "READY",
      isRevalidating: false,
      pendingReason: null,
    };
  }

  if (!hasDisplaySnapshot) {
    return {
      canCommitCurrentSelection,
      loadingState: currentDataFailed ? "READY" : "INITIAL_SKELETON",
      isRevalidating: false,
      pendingReason: null,
    };
  }

  if (currentDataFailed) {
    return {
      canCommitCurrentSelection,
      loadingState: "READY",
      isRevalidating: false,
      pendingReason: null,
    };
  }

  const pendingReason: ReplayReviewPendingReason =
    displaySelectionKey !== currentSelectionKey
      ? "FILTER_CHANGE"
      : displayProjectIdsKey !== currentProjectIdsKey || !coverageSatisfied
        ? "HISTORY_REFRESH"
        : requiresBundle && !currentDataResolved
          ? "FILTER_CHANGE"
          : null;

  return {
    canCommitCurrentSelection,
    loadingState: pendingReason ? "REVALIDATING" : "READY",
    isRevalidating: pendingReason !== null,
    pendingReason,
  };
};
