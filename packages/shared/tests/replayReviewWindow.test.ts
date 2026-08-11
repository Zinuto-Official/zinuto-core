// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyReplayReviewWindowToProjects,
  normalizeReplayReviewBundleAnchorMs,
  normalizeReplayReviewWindowAnchorDay,
  resolveReplayReviewTimeWindowBoundaryMs,
  resolveStableReplayReviewWindowAnchorMs,
  sortReplayReviewProjectsByRecent,
} from "../dist/domain-calculations/replay-review-window.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR_MS = Date.UTC(2026, 3, 12, 12, 0, 0);

const project = (
  id: string,
  createdAt: string,
  updatedAt = createdAt,
) => ({
  id,
  createdAt,
  updatedAt,
});

test("replay review project windows use recent sort with stable id tie-breaker", () => {
  const sorted = sortReplayReviewProjectsByRecent([
    project("older", "2026-04-01T00:00:00.000Z"),
    project("b", "2026-04-03T00:00:00.000Z"),
    project("a", "2026-04-03T00:00:00.000Z"),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["b", "a", "older"],
  );
});

test("replay review count windows select the most recent projects", () => {
  const projects = Array.from({ length: 12 }, (_, index) =>
    project(
      `p${index}`,
      new Date(Date.UTC(2026, 3, index + 1)).toISOString(),
    ),
  );

  assert.deepEqual(
    applyReplayReviewWindowToProjects(projects, { window: "LAST_10" }).map(
      (item) => item.id,
    ),
    ["p11", "p10", "p9", "p8", "p7", "p6", "p5", "p4", "p3", "p2"],
  );
});

test("replay review time windows use the same boundary as coverage checks", () => {
  assert.equal(
    resolveReplayReviewTimeWindowBoundaryMs("LAST_7D", ANCHOR_MS),
    ANCHOR_MS - 7 * DAY_MS,
  );
  assert.equal(
    resolveReplayReviewTimeWindowBoundaryMs("LAST_30D", ANCHOR_MS),
    ANCHOR_MS - 30 * DAY_MS,
  );
  assert.equal(resolveReplayReviewTimeWindowBoundaryMs("LAST_50", ANCHOR_MS), null);

  const projects = [
    project("outside", new Date(ANCHOR_MS - 31 * DAY_MS).toISOString()),
    project("inside", new Date(ANCHOR_MS - 5 * DAY_MS).toISOString()),
  ];
  assert.deepEqual(
    applyReplayReviewWindowToProjects(projects, {
      window: "LAST_7D",
      anchorMs: ANCHOR_MS,
    }).map((item) => item.id),
    ["inside"],
  );
});

test("replay review anchor normalization stays day-bucketed for time windows only", () => {
  assert.equal(
    normalizeReplayReviewWindowAnchorDay("LAST_7D", ANCHOR_MS),
    Math.floor(ANCHOR_MS / DAY_MS),
  );
  assert.equal(normalizeReplayReviewWindowAnchorDay("LAST_10", ANCHOR_MS), null);
  assert.equal(normalizeReplayReviewWindowAnchorDay("LAST_30D", Number.NaN), null);

  assert.equal(
    normalizeReplayReviewBundleAnchorMs("LAST_30D", ANCHOR_MS),
    Math.floor(ANCHOR_MS / DAY_MS) * DAY_MS + DAY_MS - 1,
  );
  assert.equal(
    resolveStableReplayReviewWindowAnchorMs(ANCHOR_MS),
    Math.floor(ANCHOR_MS / DAY_MS) * DAY_MS + DAY_MS - 1,
  );
  assert.equal(normalizeReplayReviewBundleAnchorMs("ALL", ANCHOR_MS), undefined);
  assert.equal(normalizeReplayReviewBundleAnchorMs("LAST_7D", Number.NaN), undefined);
});
