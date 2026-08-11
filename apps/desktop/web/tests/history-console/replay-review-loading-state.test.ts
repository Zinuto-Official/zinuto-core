// SPDX-License-Identifier: GPL-3.0-only

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReplayReviewSelectionKey,
  isReplayReviewWindowCovered,
  resolveReplayReviewEffectiveCoverage,
  resolveReplayReviewDisplayState,
  shouldReplayReviewLoadMoreHistory,
} from "../../src/workspaces/history/history-console/replayReviewLoadingState";
import {
  isHistoryAutoPaginationBlocked,
  isHistoryPaginationCursorStalled,
} from "../../src/domains/history/useHistoryProjectsOrchestrator";

const NOW_MS = Date.UTC(2026, 3, 12, 12, 0, 0);

test("recent-count windows settle as soon as enough filtered sessions are loaded", () => {
  assert.equal(
    isReplayReviewWindowCovered({
      window: "LAST_10",
      filteredProjectCount: 10,
      oldestLoadedProjectTs: NOW_MS,
      hasMoreHistory: true,
      anchorMs: NOW_MS,
    }),
    true,
  );

  assert.equal(
    shouldReplayReviewLoadMoreHistory({
      window: "LAST_50",
      filteredProjectCount: 18,
      oldestLoadedProjectTs: NOW_MS,
      hasMoreHistory: true,
      anchorMs: NOW_MS,
      isHistoryProjectsLoading: false,
      isHistoryProjectsLoadingMore: false,
    }),
    true,
  );
});

test("time windows settle once loaded history crosses the requested boundary", () => {
  assert.equal(
    isReplayReviewWindowCovered({
      window: "LAST_7D",
      filteredProjectCount: 2,
      oldestLoadedProjectTs: NOW_MS - 8 * 24 * 60 * 60 * 1000,
      hasMoreHistory: true,
      anchorMs: NOW_MS,
    }),
    true,
  );

  assert.equal(
    isReplayReviewWindowCovered({
      window: "LAST_30D",
      filteredProjectCount: 12,
      oldestLoadedProjectTs: NOW_MS - 10 * 24 * 60 * 60 * 1000,
      hasMoreHistory: true,
      anchorMs: NOW_MS,
    }),
    false,
  );
});

test("all window treats the loaded page as covered instead of auto-loading full history", () => {
  assert.equal(
    isReplayReviewWindowCovered({
      window: "ALL",
      filteredProjectCount: 120,
      oldestLoadedProjectTs: NOW_MS - 60 * 24 * 60 * 60 * 1000,
      hasMoreHistory: true,
      anchorMs: NOW_MS,
    }),
    true,
  );

  assert.equal(
    shouldReplayReviewLoadMoreHistory({
      window: "ALL",
      filteredProjectCount: 120,
      oldestLoadedProjectTs: NOW_MS - 60 * 24 * 60 * 60 * 1000,
      hasMoreHistory: true,
      anchorMs: NOW_MS,
      isHistoryProjectsLoading: false,
      isHistoryProjectsLoadingMore: false,
    }),
    false,
  );

  assert.equal(
    isReplayReviewWindowCovered({
      window: "ALL",
      filteredProjectCount: 120,
      oldestLoadedProjectTs: NOW_MS - 60 * 24 * 60 * 60 * 1000,
      hasMoreHistory: false,
      anchorMs: NOW_MS,
    }),
    true,
  );
});

test("failed pagination cursor is fused until an explicit retry", () => {
  assert.equal(isHistoryAutoPaginationBlocked("cursor-2", "cursor-2"), true);
  assert.equal(isHistoryAutoPaginationBlocked("cursor-2", "cursor-3"), false);
  assert.equal(isHistoryPaginationCursorStalled("cursor-2", "cursor-2"), true);
  assert.equal(isHistoryPaginationCursorStalled("cursor-2", null), false);
});

test("stalled pagination releases the partial snapshot from the initial skeleton", () => {
  assert.equal(
    resolveReplayReviewEffectiveCoverage({
      coverageSatisfied: false,
      paginationStalled: true,
    }),
    true,
  );
  assert.equal(
    resolveReplayReviewEffectiveCoverage({
      coverageSatisfied: false,
      paginationStalled: false,
    }),
    false,
  );
});

test("display state keeps old snapshot while filter changes are revalidating", () => {
  const previousSelectionKey = buildReplayReviewSelectionKey({
    assetTab: "ALL",
    historyPreset: "ALL",
    reviewWindow: "LAST_50",
    reviewWindowAnchorMs: NOW_MS,
  });
  const nextSelectionKey = buildReplayReviewSelectionKey({
    assetTab: "CRYPTO",
    historyPreset: "ALL",
    reviewWindow: "LAST_50",
    reviewWindowAnchorMs: NOW_MS,
  });

  const state = resolveReplayReviewDisplayState({
    hasDisplaySnapshot: true,
    displaySelectionKey: previousSelectionKey,
    displayProjectIdsKey: "p1|p2|p3",
    currentSelectionKey: nextSelectionKey,
    currentProjectIdsKey: "p4|p5|p6",
    coverageSatisfied: true,
    requiresBundle: true,
    currentDataResolved: false,
    currentDataFailed: false,
  });

  assert.equal(state.loadingState, "REVALIDATING");
  assert.equal(state.isRevalidating, true);
  assert.equal(state.pendingReason, "FILTER_CHANGE");
  assert.equal(state.canCommitCurrentSelection, false);
});

test("display state commits immediately once the current window is safe and resolved", () => {
  const selectionKey = buildReplayReviewSelectionKey({
    assetTab: "ALL",
    historyPreset: "ALL",
    reviewWindow: "ALL",
    reviewWindowAnchorMs: NOW_MS,
  });

  const state = resolveReplayReviewDisplayState({
    hasDisplaySnapshot: true,
    displaySelectionKey: selectionKey,
    displayProjectIdsKey: "p1|p2",
    currentSelectionKey: selectionKey,
    currentProjectIdsKey: "p1|p2|p3",
    coverageSatisfied: true,
    requiresBundle: true,
    currentDataResolved: true,
    currentDataFailed: false,
  });

  assert.equal(state.loadingState, "READY");
  assert.equal(state.isRevalidating, false);
  assert.equal(state.pendingReason, null);
  assert.equal(state.canCommitCurrentSelection, true);
});
