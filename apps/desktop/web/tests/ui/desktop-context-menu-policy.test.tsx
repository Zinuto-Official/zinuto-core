// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ContextMenu,
  ContextMenuTrigger,
} from "../../src/ui/primitives/context-menu";
import {
  isDesktopDevtoolsShortcut,
  shouldAllowDesktopContextMenu,
  shouldAllowDesktopTextSelection,
  shouldPreventDesktopContextMenu,
  shouldPreventDesktopTextSelection,
  ZINUTO_CONTEXT_MENU_TRIGGER_ATTRIBUTE,
  ZINUTO_CONTEXT_MENU_TRIGGER_VALUE,
  ZINUTO_DEV_TEXT_SELECTION_ATTRIBUTE,
  ZINUTO_DEV_TEXT_SELECTION_VALUE,
} from "../../src/ui/desktopInteractionPolicy";

type FakeContextMenuTarget = {
  closest: (selector: string) => unknown;
  isContentEditable?: boolean;
  nodeType: number;
  parentElement: FakeContextMenuTarget | null;
};

const ELEMENT_NODE_TYPE = 1;
const TEXT_NODE_TYPE = 3;

const readFrontendSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const sliceFromMarker = (
  source: string,
  marker: string,
  length = 6_000,
): string => {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, marker);
  return source.slice(markerIndex, markerIndex + length);
};

const createFakeTarget = ({
  matches = [],
  parentElement = null,
  isContentEditable = false,
}: {
  matches?: string[];
  parentElement?: FakeContextMenuTarget | null;
  isContentEditable?: boolean;
} = {}): FakeContextMenuTarget => {
  const target: FakeContextMenuTarget = {
    nodeType: ELEMENT_NODE_TYPE,
    parentElement,
    isContentEditable,
    closest: (selector: string) => {
      if (matches.some((match) => selector.includes(match))) {
        return target;
      }
      return parentElement?.closest(selector) ?? null;
    },
  };
  return target;
};

test("desktop context menu policy allows app entity menus", () => {
  const target = createFakeTarget({
    matches: [
      `${ZINUTO_CONTEXT_MENU_TRIGGER_ATTRIBUTE}="${ZINUTO_CONTEXT_MENU_TRIGGER_VALUE}"`,
    ],
  });

  assert.equal(shouldAllowDesktopContextMenu(target), true);
  assert.equal(shouldPreventDesktopContextMenu(target), false);
});

test("desktop context menu policy allows editable text and editor surfaces", () => {
  const textareaTarget = createFakeTarget({ matches: ["textarea"] });
  const roleTextboxTarget = createFakeTarget({ matches: ['[role="textbox"]'] });
  const contentEditableTarget = createFakeTarget({ isContentEditable: true });
  const replayNoteEditorTarget = createFakeTarget({
    matches: ['[role="textbox"]', ".replay-note-lexical-content"],
  });
  const codeMirrorTarget = createFakeTarget({ matches: [".cm-editor"] });
  const textNodeTarget = {
    nodeType: TEXT_NODE_TYPE,
    parentElement: textareaTarget,
  };

  assert.equal(shouldAllowDesktopContextMenu(textareaTarget), true);
  assert.equal(shouldAllowDesktopContextMenu(roleTextboxTarget), true);
  assert.equal(shouldAllowDesktopContextMenu(contentEditableTarget), true);
  assert.equal(shouldAllowDesktopContextMenu(replayNoteEditorTarget), true);
  assert.equal(shouldAllowDesktopContextMenu(codeMirrorTarget), true);
  assert.equal(shouldAllowDesktopContextMenu(textNodeTarget), true);
});

test("desktop context menu policy blocks ordinary page targets", () => {
  const plainTarget = createFakeTarget();
  const buttonTarget = createFakeTarget({ matches: ["button"] });
  const chartTarget = createFakeTarget({ matches: [".k-line-chart"] });

  assert.equal(shouldAllowDesktopContextMenu(plainTarget), false);
  assert.equal(shouldPreventDesktopContextMenu(plainTarget), true);
  assert.equal(shouldAllowDesktopContextMenu(buttonTarget), false);
  assert.equal(shouldAllowDesktopContextMenu(chartTarget), false);
});

test("desktop text selection policy only allows editable text surfaces", () => {
  const headingTarget = createFakeTarget({ matches: [".training-command-title"] });
  const buttonTarget = createFakeTarget({ matches: ["button"] });
  const titleInputTarget = createFakeTarget({
    matches: ['input[type="text"]', ".notes-title-inline-input"],
  });
  const noteEditorTarget = createFakeTarget({
    matches: ['[role="textbox"]', ".replay-note-lexical-content"],
  });
  const codeMirrorTarget = createFakeTarget({ matches: [".cm-content"] });
  const textNodeTarget = {
    nodeType: TEXT_NODE_TYPE,
    parentElement: noteEditorTarget,
  };

  assert.equal(shouldAllowDesktopTextSelection(headingTarget), false);
  assert.equal(shouldPreventDesktopTextSelection(headingTarget), true);
  assert.equal(
    shouldAllowDesktopTextSelection(headingTarget, {
      allowGlobalTextSelection: true,
    }),
    true,
  );
  assert.equal(
    shouldPreventDesktopTextSelection(headingTarget, {
      allowGlobalTextSelection: true,
    }),
    false,
  );
  assert.equal(shouldAllowDesktopTextSelection(buttonTarget), false);
  assert.equal(shouldAllowDesktopTextSelection(titleInputTarget), true);
  assert.equal(shouldPreventDesktopTextSelection(titleInputTarget), false);
  assert.equal(shouldAllowDesktopTextSelection(noteEditorTarget), true);
  assert.equal(shouldAllowDesktopTextSelection(codeMirrorTarget), true);
  assert.equal(shouldAllowDesktopTextSelection(textNodeTarget), true);
});

test("desktop interaction policy blocks browser devtools shortcuts only", () => {
  assert.equal(isDesktopDevtoolsShortcut({ key: "F12" }), true);
  assert.equal(isDesktopDevtoolsShortcut({ code: "F12" }), true);
  assert.equal(
    isDesktopDevtoolsShortcut({ key: "I", ctrlKey: true, shiftKey: true }),
    true,
  );
  assert.equal(
    isDesktopDevtoolsShortcut({
      key: "Process",
      code: "KeyI",
      ctrlKey: true,
      shiftKey: true,
    }),
    true,
  );
  assert.equal(
    isDesktopDevtoolsShortcut({ key: "j", metaKey: true, altKey: true }),
    true,
  );
  assert.equal(
    isDesktopDevtoolsShortcut({ key: "c", metaKey: true, altKey: true }),
    true,
  );
  assert.equal(isDesktopDevtoolsShortcut({ key: "i", metaKey: true }), false);
  assert.equal(isDesktopDevtoolsShortcut({ key: "r", metaKey: true }), false);
  assert.equal(
    isDesktopDevtoolsShortcut({ key: "i", ctrlKey: true, altKey: true }),
    false,
  );
});

test("context menu trigger renders the stable app context menu marker", () => {
  const html = renderToStaticMarkup(
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button type="button">Open entity menu</button>
      </ContextMenuTrigger>
    </ContextMenu>,
  );

  assert.match(
    html,
    new RegExp(
      `${ZINUTO_CONTEXT_MENU_TRIGGER_ATTRIBUTE}="${ZINUTO_CONTEXT_MENU_TRIGGER_VALUE}"`,
    ),
  );
});

test("desktop interaction CSS disables ordinary text selection and restores editor surfaces", () => {
  const cssSource = readFrontendSource(
    "../../src/styles/core/desktop-interaction-policy.css",
  );

  assert.match(cssSource, /\.app-root\s*\{[^}]*user-select:\s*none/s);
  assert.match(cssSource, /-webkit-user-select:\s*none/);
  assert.match(
    cssSource,
    new RegExp(
      `html\\[${ZINUTO_DEV_TEXT_SELECTION_ATTRIBUTE}="${ZINUTO_DEV_TEXT_SELECTION_VALUE}"\\]\\s+\\.app-root`,
    ),
  );
  assert.match(cssSource, /\.app-root\s+:where\(\*\)/);
  assert.match(cssSource, /input\[type="text"\]/);
  assert.match(cssSource, /\.replay-note-lexical-content/);
  assert.match(cssSource, /\.cm-content/);
  assert.match(cssSource, /user-select:\s*text/);
});

test("desktop secondary webview windows explicitly disable devtools", () => {
  const apiSource = readFrontendSource("../../src/api/desktopSecondaryWindows.ts");
  const webviewWindowOptions = sliceFromMarker(
    apiSource,
    "new webviewWindowModule.WebviewWindow(label, {",
    1_400,
  );

  assert.match(webviewWindowOptions, /devtools:\s*false/);
});

test("desktop entity context menu destructive actions reuse the same delete request path as buttons", () => {
  const bankPickerSource = readFrontendSource(
    "../../src/workspaces/special-training/components/SpecialTrainingModePickerView.tsx",
  );
  const bankMenuSource = sliceFromMarker(
    bankPickerSource,
    'className="special-training-bank-row-menu"',
  );
  assert.match(bankMenuSource, /setSelectedBankId\(bank\.id\)/);
  assert.match(bankMenuSource, /requestDeleteBankConfirmation\(bank\)/);
  assert.match(
    bankPickerSource,
    /requestDeleteBankConfirmation\(\s*selectedBank\s*\)/,
  );
  assert.doesNotMatch(bankMenuSource, /confirmDeleteBank\(selectedBank\)/);

  const archiveSource = readFrontendSource(
    "../../src/workspaces/history/history-console/ReplayReviewArchiveSection.tsx",
  );
  const archiveMenuSource = sliceFromMarker(
    archiveSource,
    "ContextMenuItem onSelect={() => openDetails(row.id)}",
  );
  assert.match(archiveMenuSource, /setArmedKey\(deleteSelectedKey\)/);
  assert.match(archiveMenuSource, /onSelectedRowIdsChange\(\[row\.id\]\)/);
  assert.match(archiveMenuSource, /setArmedKey\(`row:\$\{row\.id\}`\)/);
  assert.doesNotMatch(archiveMenuSource, /onDeleteRows\(/);

  const notesPageSource = readFrontendSource(
    "../../src/workspaces/notes/NotesPage.tsx",
  );
  const notesRowStart = notesPageSource.indexOf("const NotesListRow");
  const notesRowEnd = notesPageSource.indexOf("NotesListRow.displayName");
  assert.notEqual(notesRowStart, -1);
  assert.ok(notesRowEnd > notesRowStart);
  const notesRowSource = notesPageSource.slice(notesRowStart, notesRowEnd);
  assert.match(
    notesRowSource,
    /onContextMenu=\{\(\) => onSelectReplayNoteId\(note\.id\)\}/,
  );
  assert.match(
    notesRowSource,
    /<ContextMenu\s+onOpenChange=\{\(open\) => \{[\s\S]*setIsContextDeleteArmed\(false\)/,
  );
  assert.match(
    notesRowSource,
    /event\.preventDefault\(\);[\s\S]*setIsContextDeleteArmed\(true\);/,
  );
  assert.match(
    notesRowSource,
    /isContextDeleteArmed[\s\S]*onRequestReplayNoteDelete\(note\.id, note\.title\)/,
  );
  assert.match(
    notesRowSource,
    /isContextDeleteArmed[\s\S]*tt\("appText\.confirmDelete"\)/,
  );

  const notesDetailSource = sliceFromMarker(
    notesPageSource,
    "const handleSelectedReplayNoteDelete",
  );
  assert.match(notesDetailSource, /isActionArmed\(deleteActionKey\)/);
  assert.match(notesDetailSource, /setArmedKey\(deleteActionKey\)/);
  assert.match(notesPageSource, /notes-detail-toolbar-btn danger/);
  assert.match(notesPageSource, /onClick=\{handleSelectedReplayNoteDelete\}/);
});
