// SPDX-License-Identifier: GPL-3.0-only

import { parseTimestampMs } from "../marketTime.js";

export type ReplayReviewWindow =
  | "LAST_10"
  | "LAST_50"
  | "LAST_7D"
  | "LAST_30D"
  | "ALL";

export type ReplayReviewWindowInput = {
  window?: ReplayReviewWindow;
  anchorMs?: number;
  nowMs?: number;
};

export type ReplayReviewWindowProjectLike = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export const REPLAY_REVIEW_DAY_MS = 24 * 60 * 60 * 1000;

const toPositiveIntegerOrNull = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
};

export const isReplayReviewTimeWindow = (
  window: ReplayReviewWindow,
): window is "LAST_7D" | "LAST_30D" =>
  window === "LAST_7D" || window === "LAST_30D";

export const resolveReplayReviewTimeWindowRangeMs = (
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

export const normalizeReplayReviewWindowAnchorDay = (
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

export const normalizeReplayReviewBundleAnchorMs = (
  window: ReplayReviewWindow,
  anchorMs?: number,
): number | undefined => {
  if (!isReplayReviewTimeWindow(window)) {
    return undefined;
  }
  const numeric = Number(anchorMs);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  const dayBucket = Math.floor(Math.max(0, numeric) / REPLAY_REVIEW_DAY_MS);
  return dayBucket * REPLAY_REVIEW_DAY_MS + REPLAY_REVIEW_DAY_MS - 1;
};

export const resolveStableReplayReviewWindowAnchorMs = (
  nowMs = Date.now(),
): number => {
  const dayBucket = Math.floor(Math.max(0, nowMs) / REPLAY_REVIEW_DAY_MS);
  return dayBucket * REPLAY_REVIEW_DAY_MS + REPLAY_REVIEW_DAY_MS - 1;
};

export const resolveReplayReviewTimeWindowBoundaryMs = (
  window: ReplayReviewWindow,
  anchorMs?: number,
): number | null => {
  const rangeMs = resolveReplayReviewTimeWindowRangeMs(window);
  if (rangeMs === null) {
    return null;
  }
  const numericAnchorMs = Number(anchorMs);
  if (!Number.isFinite(numericAnchorMs) || numericAnchorMs <= 0) {
    return null;
  }
  return numericAnchorMs - rangeMs;
};

export const resolveReplayReviewProjectSortTimestamp = (
  project: ReplayReviewWindowProjectLike,
): number => {
  const createdAt = parseTimestampMs(project.createdAt || "");
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }
  const updatedAt = parseTimestampMs(project.updatedAt || "");
  return Number.isFinite(updatedAt) ? updatedAt : 0;
};

export const sortReplayReviewProjectsByRecent = <
  T extends ReplayReviewWindowProjectLike,
>(
  projects: readonly T[],
): T[] =>
  [...projects].sort((left, right) => {
    const leftTs = resolveReplayReviewProjectSortTimestamp(left);
    const rightTs = resolveReplayReviewProjectSortTimestamp(right);
    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }
    return right.id.localeCompare(left.id, "en");
  });

export const resolveReplayReviewWindowAnchorMs = (
  input: ReplayReviewWindowInput,
): number => {
  const anchorMs = toPositiveIntegerOrNull(input.anchorMs);
  if (anchorMs !== null) {
    return anchorMs;
  }
  const nowMs = toPositiveIntegerOrNull(input.nowMs);
  if (nowMs !== null) {
    return nowMs;
  }
  return Date.now();
};

export const applyReplayReviewWindowToProjects = <
  T extends ReplayReviewWindowProjectLike,
>(
  projects: readonly T[],
  input: ReplayReviewWindowInput,
): T[] => {
  const window = input.window ?? "ALL";
  if (window === "ALL") {
    return [...projects];
  }

  const projectsByRecent = sortReplayReviewProjectsByRecent(projects);
  if (window === "LAST_10") {
    return projectsByRecent.slice(0, 10);
  }
  if (window === "LAST_50") {
    return projectsByRecent.slice(0, 50);
  }

  const anchorMs = resolveReplayReviewWindowAnchorMs(input);
  const rangeStart = resolveReplayReviewTimeWindowBoundaryMs(window, anchorMs);
  if (rangeStart === null) {
    return [];
  }
  return projectsByRecent.filter(
    (project) => resolveReplayReviewProjectSortTimestamp(project) >= rangeStart,
  );
};
