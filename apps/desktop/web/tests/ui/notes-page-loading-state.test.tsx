// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readCssWithImports } from "./readCssWithImports";

const notesPageSource = readFileSync(
  new URL("../../src/workspaces/notes/NotesPage.tsx", import.meta.url),
  "utf8",
);

const notesPageCss = readCssWithImports(
  new URL("../../src/styles/pages/history-notes.css", import.meta.url),
);

const notesPageControllerSource = readFileSync(
  new URL("../../src/workspaces/notes/useNotesPageController.ts", import.meta.url),
  "utf8",
);

const sidebarGroupsSource = readFileSync(
  new URL("../../src/app-shell/useAppSidebarGroups.ts", import.meta.url),
  "utf8",
);

const runtimeStartupHistoryStateSource = readFileSync(
  new URL(
    "../../src/app-shell/runtime/runtimeStartupHistoryState.ts",
    import.meta.url,
  ),
  "utf8",
);

test("notes page uses the shared snapshot renderer and keeps editor hydration structured", () => {
  assert.doesNotMatch(notesPageSource, /const NotesSnapshotLoadingState =/);
  assert.match(notesPageSource, /const NotesEditorLoadingState =/);
  assert.match(notesPageSource, /isSelectedReplayNoteSnapshotLoading/);
  assert.match(notesPageSource, /renderTrainingNoteSnapshot\(selectedReplayNote\.id,\s*{/);
  assert.match(notesPageSource, /heading=\{tt\("appText\.noteContentLoading"\)\}/);
  assert.match(notesPageSource, /showStatus=\{!isSelectedReplayNoteSnapshotLoading\}/);
});

test("notes page keeps a detail loading shell during collection bootstrap instead of empty copy", () => {
  assert.match(notesPageSource, /isCollectionLoading \? \(/);
  assert.match(notesPageSource, /<NotesDetailPanel className="notes-preview-panel" headerHidden>/);
  assert.match(notesPageSource, /heading=\{tt\("appText\.loadingNotes"\)\}/);
  assert.doesNotMatch(
    notesPageSource,
    /isCollectionLoading \? tt\("appText\.loadingNotes"\) : tt\("appText\.createSelectNoteLeft"\)/,
  );
});

test("notes collection skips bootstrap loading when the shared notes store is hydrated empty", () => {
  assert.match(notesPageControllerSource, /hasReplayNotesHydrated:\s*boolean/);
  assert.match(
    notesPageControllerSource,
    /if\s*\(hasReplayNotesHydrated\s*&&\s*replayNotes\.length\s*===\s*0\)\s*{/,
  );
  assert.match(notesPageControllerSource, /setHasCollectionHydrated\(true\)/);
  assert.match(notesPageControllerSource, /setIsCollectionLoading\(false\)/);
});

test("new custom notes are revealed even when the current notes filter would hide them", () => {
  assert.match(notesPageControllerSource, /const revealCreatedCustomReplayNote = useCallback/);
  assert.match(notesPageControllerSource, /setActiveScopeFilter\("CUSTOM"\)/);
  assert.match(notesPageControllerSource, /setSelectedColorTokens\(\[\]\)/);
  assert.match(notesPageControllerSource, /setDebouncedReplayNotesKeyword\(""\)/);
  assert.match(
    notesPageControllerSource,
    /setCollectionNoteIds\(\(current\) => \[\s*normalizedNoteId,\s*\.\.\.current\.filter\(\(item\) => item !== normalizedNoteId\),\s*\]\)/,
  );
  assert.match(
    notesPageControllerSource,
    /revealCreatedCustomReplayNote\(createdNoteId\)/,
  );
});

test("sidebar hover only preloads modules and does not trigger notes data requests", () => {
  assert.match(sidebarGroupsSource, /const preloadWorkspacePage = \(\) => \{/);
  assert.match(sidebarGroupsSource, /const prepareWorkspacePage = \(\) => \{/);
  assert.match(sidebarGroupsSource, /onClick:\s*\(\) => \{[\s\S]*prepareWorkspacePage\(\);[\s\S]*item\.onClick\(\);[\s\S]*\}/);
  assert.match(sidebarGroupsSource, /onPointerEnter:\s*preloadWorkspacePage/);
  assert.doesNotMatch(sidebarGroupsSource, /onPointerEnter:\s*prepareWorkspacePage/);
});

test("history page prefetch no longer warms notes data", () => {
  assert.match(runtimeStartupHistoryStateSource, /if \(page === "HISTORY"\) \{/);
  assert.match(runtimeStartupHistoryStateSource, /if \(page === "NOTES"\) \{/);
  assert.doesNotMatch(
    runtimeStartupHistoryStateSource,
    /if \(page === "HISTORY" \|\| page === "NOTES"\)/,
  );
});

test("notes page injects a per-note market chart eye button into the snapshot toolbar", () => {
  assert.match(notesPageSource, /collapsedChartNoteIds/);
  assert.match(notesPageSource, /selectedReplayNoteChartExpanded/);
  assert.doesNotMatch(notesPageSource, /Switch/);
  assert.doesNotMatch(notesPageSource, /appText\.marketChart/);
  assert.match(notesPageSource, /toolbarLeadingContent:\s*\(/);
  assert.match(notesPageSource, /className="notes-market-chart-eye-button"/);
  assert.match(notesPageSource, /chartBodyVisible:\s*selectedReplayNoteChartExpanded/);
  assert.match(notesPageSource, /tt\("appText\.closeMarketChart"\)/);
  assert.match(notesPageSource, /tt\("appText\.expandMarketChart"\)/);
  assert.match(
    notesPageSource,
    /selectedReplayNoteHasSnapshotChart\s*\?\s*renderTrainingNoteSnapshot/,
  );
  assert.match(
    notesPageCss,
    /\.notes-page \[data-slot="button"\]\.notes-market-chart-eye-button/,
  );
  assert.doesNotMatch(notesPageSource, /selectedReplayNoteHasSnapshotChart &&\s+selectedReplayNoteChartExpanded/);
  assert.doesNotMatch(notesPageCss, /\.notes-market-chart-toggle/);
  assert.match(
    notesPageCss,
    /data-chart-body-visible="false"[\s\S]*\.history-preview-canvas-wrap[\s\S]*display:\s*none/,
  );
  assert.match(
    notesPageCss,
    /data-chart-body-visible="false"[\s\S]*\.replay-note-snapshot-status-overlay[\s\S]*display:\s*none/,
  );
  assert.doesNotMatch(
    notesPageCss,
    /data-chart-body-visible="false"[^{]*\.history-preview-period-toolbar[^{]*\{[^}]*display:\s*none/,
  );
});

test("notes page loading css preserves the editor shell shimmer contract", () => {
  assert.match(notesPageCss, /\.notes-detail-loading-shell--editor\s*{/);
  assert.match(notesPageCss, /\.notes-detail-loading-editor-copy\s*{/);
  assert.match(notesPageCss, /\.notes-detail-loading-status-copy\s*{/);
  assert.match(notesPageCss, /@keyframes notes-detail-loading-shimmer/);
});

test("notes list rows place color tags on the title line and give the type badge half of the meta line", () => {
  assert.match(
    notesPageCss,
    /\.notes-list\s*>\s*\[data-slot="button"\]\.notes-note-row\s*{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*justify-content:\s*stretch;[\s\S]*justify-items:\s*stretch;[\s\S]*text-align:\s*left;/,
  );
  assert.match(
    notesPageCss,
    /\.notes-note-row-main\s*{[\s\S]*justify-self:\s*stretch;[\s\S]*width:\s*100%;[\s\S]*text-align:\s*left;/,
  );
  assert.match(
    notesPageCss,
    /\.notes-note-row-topline\s*{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content;[\s\S]*align-items:\s*center;/,
  );
  assert.match(
    notesPageCss,
    /\.notes-note-row-title\s*{[\s\S]*text-align:\s*left;[\s\S]*text-overflow:\s*ellipsis;/,
  );
  assert.match(
    notesPageCss,
    /\.notes-note-row-colors\s*{[\s\S]*max-width:\s*6\.75rem;[\s\S]*justify-content:\s*flex-end;[\s\S]*flex-wrap:\s*nowrap;/,
  );
  assert.match(
    notesPageCss,
    /\.notes-note-row-subline\s*{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*50%\);[\s\S]*align-items:\s*center;/,
  );
  assert.match(
    notesPageCss,
    /\.notes-note-row-subtitle\s*{[\s\S]*text-align:\s*left;[\s\S]*text-overflow:\s*ellipsis;/,
  );
  assert.match(
    notesPageCss,
    /\.notes-note-row-badge\s*{[\s\S]*box-sizing:\s*border-box;[\s\S]*min-width:\s*0;[\s\S]*width:\s*100%;[\s\S]*justify-self:\s*stretch;[\s\S]*justify-content:\s*center;[\s\S]*text-align:\s*center;/,
  );
  assert.match(
    notesPageCss,
    /\.notes-note-row-badge-label\s*{[\s\S]*max-width:\s*100%;[\s\S]*overflow:\s*hidden;[\s\S]*text-align:\s*center;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/,
  );
  assert.match(
    notesPageSource,
    /<span className="notes-note-row-topline">[\s\S]*<NoteColorDots tokens=\{note\.colorTokens\} \/>[\s\S]*<span className="notes-note-row-subline">[\s\S]*<span className="notes-note-row-badge-label">\s*\{presentation\.typeLabel\}\s*<\/span>/,
  );
  assert.doesNotMatch(notesPageSource, /className="notes-note-row-side"/);
  assert.doesNotMatch(
    notesPageCss,
    /\.notes-list\s*>\s*\[data-slot="button"\]\.notes-note-row\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content;/,
  );
});
