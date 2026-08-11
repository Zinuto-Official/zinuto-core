// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeReplayNotesByServerOrder,
  type ReplayNoteCollectionItem,
} from "../../src/domains/notes/replayNoteCollection";

type TestNote = ReplayNoteCollectionItem & {
  title: string;
};

const note = (
  id: string,
  updatedAt: string,
  createdAt: string,
  options: { optimistic?: boolean; title?: string } = {},
): TestNote => ({
  id,
  updatedAt,
  createdAt,
  optimistic: options.optimistic,
  title: options.title ?? id,
});

const merge = (
  current: readonly TestNote[],
  incoming: readonly TestNote[],
  retainUnmatched: "all" | "optimistic" = "all",
): TestNote[] =>
  mergeReplayNotesByServerOrder({
    current,
    incoming,
    retainUnmatched,
    mergeItem: (existing, next) => ({ ...existing, ...next }),
  });

test("replay note batches follow the backend updated-created-id descending order", () => {
  const updatedAt = "2026-07-30T12:00:00.000Z";
  const createdAt = "2026-07-29T12:00:00.000Z";
  const result = merge([], [
    note("a", updatedAt, createdAt),
    note("c", updatedAt, createdAt),
    note("older-created", updatedAt, "2026-07-28T12:00:00.000Z"),
    note(
      "newer-updated",
      "2026-07-31T12:00:00.000Z",
      "2026-07-20T12:00:00.000Z",
    ),
    note("b", updatedAt, createdAt),
  ]);

  assert.deepEqual(
    result.map(({ id }) => id),
    ["newer-updated", "c", "b", "a", "older-created"],
  );
});

test("filtered batches merge existing notes without reversing the all-notes list", () => {
  const current = [
    note("latest", "2026-07-30T12:00:00.000Z", "2026-07-30T10:00:00.000Z"),
    note("older", "2026-07-28T12:00:00.000Z", "2026-07-28T10:00:00.000Z"),
  ];
  const result = merge(current, [
    note(
      "middle",
      "2026-07-29T12:00:00.000Z",
      "2026-07-29T10:00:00.000Z",
    ),
    note(
      "latest",
      "2026-07-31T12:00:00.000Z",
      "2026-07-30T10:00:00.000Z",
      { title: "updated title" },
    ),
  ]);

  assert.deepEqual(
    result.map(({ id }) => id),
    ["latest", "middle", "older"],
  );
  assert.equal(result[0]?.title, "updated title");
});

test("optimistic notes stay explicitly pinned until a persisted page replaces them", () => {
  const optimistic = note(
    "pending",
    "2026-07-01T12:00:00.000Z",
    "2026-07-01T12:00:00.000Z",
    { optimistic: true },
  );
  const refreshed = merge(
    [
      note(
        "stale-persisted",
        "2026-07-29T12:00:00.000Z",
        "2026-07-29T12:00:00.000Z",
      ),
      optimistic,
    ],
    [
      note(
        "latest",
        "2026-07-30T12:00:00.000Z",
        "2026-07-30T12:00:00.000Z",
      ),
    ],
    "optimistic",
  );

  assert.deepEqual(
    refreshed.map(({ id }) => id),
    ["pending", "latest"],
  );

  const persisted = merge(refreshed, [
    note(
      "pending",
      "2026-07-28T12:00:00.000Z",
      "2026-07-01T12:00:00.000Z",
      { optimistic: false },
    ),
  ]);
  assert.deepEqual(
    persisted.map(({ id }) => id),
    ["latest", "pending"],
  );
});
