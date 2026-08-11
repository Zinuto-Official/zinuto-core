// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createEmptyReplayNoteDocument,
  createReplayNoteDocumentFromPlainText,
  type ReplayNoteAttachmentV1,
} from "@zinuto/shared/replayNoteDocument";

import { replayNoteHasAuthoredContent } from "../../src/domains/notes/replayNoteContentState";

const lifecycleRuntimeSource = readFileSync(
  new URL(
    "../../src/app-shell/replayNoteLifecycleActionRuntime.ts",
    import.meta.url,
  ),
  "utf8",
);

test("a freshly seeded note has no authored content", () => {
  assert.equal(
    replayNoteHasAuthoredContent({
      contentDocument: createEmptyReplayNoteDocument(),
    }),
    false,
  );
});

test("null/undefined notes are treated as empty", () => {
  assert.equal(replayNoteHasAuthoredContent(null), false);
  assert.equal(replayNoteHasAuthoredContent(undefined), false);
});

test("body text marks a note as authored", () => {
  assert.equal(
    replayNoteHasAuthoredContent({
      contentDocument: createReplayNoteDocumentFromPlainText("本次自由推演复盘"),
    }),
    true,
  );
});

test("whitespace-only body text does not count as authored", () => {
  assert.equal(
    replayNoteHasAuthoredContent({
      contentDocument: createReplayNoteDocumentFromPlainText("   \n  \t "),
    }),
    false,
  );
});

test("an attachment marks an otherwise empty note as authored", () => {
  const attachment: ReplayNoteAttachmentV1 = {
    attachmentRefId: "att-1",
    kind: "DRAWING_LAYER",
  };
  assert.equal(
    replayNoteHasAuthoredContent({
      contentDocument: createEmptyReplayNoteDocument(),
      attachments: [attachment],
    }),
    true,
  );
});

test("a filled reflection entry marks a note as authored", () => {
  assert.equal(
    replayNoteHasAuthoredContent({
      contentDocument: createEmptyReplayNoteDocument(),
      meta: {
        reflectionEntries: {
          scenario: { value: "突破回踩进场" },
        },
      },
    }),
    true,
  );
});

test("blank reflection entries do not count as authored", () => {
  assert.equal(
    replayNoteHasAuthoredContent({
      contentDocument: createEmptyReplayNoteDocument(),
      meta: {
        reflectionEntries: {
          scenario: { value: "   " },
          decision: { value: "" },
        },
      },
    }),
    false,
  );
});

test("linked reference notes mark a note as authored", () => {
  assert.equal(
    replayNoteHasAuthoredContent({
      contentDocument: createEmptyReplayNoteDocument(),
      meta: {
        referenceEntries: [
          {
            noteId: "note-1",
            title: "参考笔记",
            type: "FREE_REPLAY",
          },
        ],
      },
    }),
    true,
  );
});

test("cancelling a freshly-created note archives it when it holds content", () => {
  // The discard path must consult the authored-content guard and return early
  // (keeping the note) before it filters the note out of state or deletes it on
  // the server. This protects free-deduction notes from vanishing when the
  // editor is closed via window close, hide-to-tray, backdrop/Escape, etc.
  assert.match(
    lifecycleRuntimeSource,
    /if \(replayNoteHasAuthoredContent\(currentNote\)\) \{[\s\S]*?resetReplaySnapshotNoteLifecycleState\(activeNoteId\);[\s\S]*?return;\s*\}/,
  );
  const guardIndex = lifecycleRuntimeSource.indexOf(
    "if (replayNoteHasAuthoredContent(currentNote))",
  );
  const deleteIndex = lifecycleRuntimeSource.indexOf(
    "await api.deleteReplayNote(activeNoteId)",
  );
  assert.ok(guardIndex >= 0 && deleteIndex >= 0);
  assert.ok(
    guardIndex < deleteIndex,
    "authored-content guard must run before the delete call",
  );
});
