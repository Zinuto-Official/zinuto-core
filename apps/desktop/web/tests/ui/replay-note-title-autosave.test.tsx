// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notesPageSource = readFileSync(
  new URL("../../src/workspaces/notes/NotesPage.tsx", import.meta.url),
  "utf8",
);

const replayNoteEditorWindowSource = readFileSync(
  new URL(
    "../../src/workspaces/notes/ReplayNoteEditorWindowSurface.tsx",
    import.meta.url,
  ),
  "utf8",
);

const notesPagePrimitivesSource = readFileSync(
  new URL("../../src/workspaces/notes/NotesPagePrimitives.tsx", import.meta.url),
  "utf8",
);

const trainingRecordNoteModalSource = readFileSync(
  new URL(
    "../../src/app-shell/AppTrainingRecordNoteModal.tsx",
    import.meta.url,
  ),
  "utf8",
);

const popupNoteEditorCss = readFileSync(
  new URL("../../src/styles/popup-note-editor.css", import.meta.url),
  "utf8",
);

const secondaryNoteEditorRouteSource = readFileSync(
  new URL(
    "../../src/app-shell/secondaryWindows/routes/secondaryNoteEditorRoute.tsx",
    import.meta.url,
  ),
  "utf8",
);

const runtimeReplayNoteEditorHostSource = readFileSync(
  new URL(
    "../../src/app-shell/runtime/runtimeReplayNoteEditorHost.ts",
    import.meta.url,
  ),
  "utf8",
);

const replayNoteFieldActionsSource = readFileSync(
  new URL(
    "../../src/app-shell/useReplayNoteFieldActions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("replay note title blur commits the current input value", () => {
  assert.match(
    notesPageSource,
    /onCommitReplayNoteTitle\(\s*selectedReplayNote\.id,\s*event\.currentTarget\.value,\s*\)/,
  );
  assert.match(
    replayNoteEditorWindowSource,
    /onTitleBlur\(note\.id,\s*event\.currentTarget\.value\)/,
  );
  assert.match(
    secondaryNoteEditorRouteSource,
    /onTitleBlur=\{\(noteId,\s*title\)\s*=>\s*emit\("COMMIT_TITLE",\s*\{\s*noteId,\s*title\s*\}\)\}/,
  );
  assert.match(
    runtimeReplayNoteEditorHostSource,
    /commitReplayNoteTitle\(\s*actionNoteId,\s*typeof payload\.title === "string"\s*\?\s*payload\.title\s*:\s*undefined,\s*\)/,
  );
  assert.match(
    trainingRecordNoteModalSource,
    /onTitleBlur\(note\.id,\s*event\.currentTarget\.value\)/,
  );
});

test("replay note title commit resolves the save value before state updates", () => {
  assert.match(
    replayNoteFieldActionsSource,
    /const commitReplayNoteTitle = useCallback\(\s*\(\s*noteId: string,\s*title\?: string\s*\)/,
  );
  assert.match(
    replayNoteFieldActionsSource,
    /typeof title === 'string'\s*\?\s*title\s*:\s*\(?\s*replayNotesRef\.current\.find/,
  );
  assert.doesNotMatch(
    replayNoteFieldActionsSource,
    /let normalizedTitle = fallbackReplayNoteTitle/,
  );
});

test("replay note popup color controls use the shared editor toolbar slot", () => {
  assert.match(notesPagePrimitivesSource, /export const NoteColorToggleRow/);
  assert.match(
    notesPageSource,
    /toolbarEndContent=\{[\s\S]*?<NoteColorToggleRow/,
  );
  assert.match(
    replayNoteEditorWindowSource,
    /toolbarEndContent=\{[\s\S]*?<NoteColorToggleRow/,
  );
  assert.match(
    trainingRecordNoteModalSource,
    /toolbarEndContent=\{[\s\S]*?<NoteColorToggleRow/,
  );
  assert.doesNotMatch(
    replayNoteEditorWindowSource,
    /TrainingNoteInlineColorPicker|training-note-inline-color-picker/,
  );
  assert.match(
    popupNoteEditorCss,
    /\.desktop-secondary-window-root\s+\.replay-note-editor-toolbar-end\s*\{[\s\S]*?margin-left:\s*auto;/,
  );
});
