// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import { ListItemNode, ListNode } from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  createEditor,
  type LexicalEditor,
} from "lexical";
import type { ReplayNoteDocumentV1 } from "@zinuto/shared/replayNoteDocument";

import {
  $applyReplayNoteDocumentToEditor,
  $exportReplayNoteDocumentFromEditor,
} from "../../src/workspaces/notes/replayNoteLexicalAdapter";
import {
  CapsuleNode,
  NoteEmbedNode,
} from "../../src/workspaces/notes/ReplayNoteLexicalNodes";
import {
  $resolveReplayNoteToolbarState,
  applyReplayNoteBlockStyleAction,
  applyReplayNoteInsertBlockAction,
  applyReplayNoteInlineTextAction,
  applyReplayNoteListAction,
  createReplayNoteInitialStickyFormattingState,
  resolveReplayNoteStickyBlockStyleUpdate,
  resolveReplayNoteStickyInlineTextUpdate,
  resolveReplayNoteStickyListUpdate,
  resolveReplayNoteToolbarStateWithStickyFormatting,
  syncReplayNoteStickyFormattingState,
  type ReplayNoteBlockStyleAction,
  type ReplayNoteInlineTextAction,
  type ReplayNoteListAction,
  type ReplayNoteStickyFormattingState,
  type ReplayNoteToolbarState,
} from "../../src/workspaces/notes/replayNoteEditorFormatting";

const createReplayNoteEditor = (): LexicalEditor =>
  createEditor({
    namespace: `replay-note-formatting-test-${Math.random()}`,
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      HorizontalRuleNode,
      CapsuleNode,
      NoteEmbedNode,
    ],
    onError(error) {
      throw error;
    },
  });

const updateEditor = (editor: LexicalEditor, update: () => void): void => {
  editor.update(update, { discrete: true });
};

const loadDocument = (
  editor: LexicalEditor,
  document: ReplayNoteDocumentV1,
): void => {
  updateEditor(editor, () => {
    $applyReplayNoteDocumentToEditor(document);
  });
};

const insertTextAtSelection = (editor: LexicalEditor, text: string): void => {
  updateEditor(editor, () => {
    const selection = $getSelection();
    assert.ok($isRangeSelection(selection));
    selection.insertText(text);
  });
};

const insertParagraphAtSelection = (editor: LexicalEditor): void => {
  updateEditor(editor, () => {
    const selection = $getSelection();
    assert.ok($isRangeSelection(selection));
    selection.insertParagraph();
  });
};

const exportDocument = (editor: LexicalEditor): ReplayNoteDocumentV1 => {
  let document: ReplayNoteDocumentV1 | null = null;
  editor.getEditorState().read(() => {
    document = $exportReplayNoteDocumentFromEditor();
  });
  assert.ok(document);
  return document;
};

const resolveToolbarState = (editor: LexicalEditor): ReplayNoteToolbarState => {
  let toolbarState!: ReplayNoteToolbarState;
  editor.getEditorState().read(() => {
    toolbarState = $resolveReplayNoteToolbarState();
  });
  return toolbarState;
};

const applyStickyBlockStyleAction = (
  editor: LexicalEditor,
  stickyState: ReplayNoteStickyFormattingState,
  action: ReplayNoteBlockStyleAction,
): ReplayNoteStickyFormattingState => {
  const update = resolveReplayNoteStickyBlockStyleUpdate(
    stickyState,
    resolveToolbarState(editor),
    action,
  );
  applyReplayNoteBlockStyleAction(editor, update.actionToApply);
  return update.stickyState;
};

const applyStickyInlineTextAction = (
  editor: LexicalEditor,
  stickyState: ReplayNoteStickyFormattingState,
  action: ReplayNoteInlineTextAction,
): ReplayNoteStickyFormattingState => {
  const update = resolveReplayNoteStickyInlineTextUpdate(
    stickyState,
    resolveToolbarState(editor),
    action,
  );
  applyReplayNoteInlineTextAction(
    editor,
    update.actionToApply,
    update.isActive,
  );
  return update.stickyState;
};

const applyStickyListAction = (
  editor: LexicalEditor,
  stickyState: ReplayNoteStickyFormattingState,
  action: ReplayNoteListAction,
): ReplayNoteStickyFormattingState => {
  const update = resolveReplayNoteStickyListUpdate(
    stickyState,
    resolveToolbarState(editor),
    action,
  );
  applyReplayNoteListAction(editor, update.actionToApply, update.isActive);
  return update.stickyState;
};

const selectFirstTextRange = (
  editor: LexicalEditor,
  start: number,
  end: number,
): void => {
  updateEditor(editor, () => {
    const paragraph = $getRoot().getFirstChild();
    assert.ok($isElementNode(paragraph));
    const textNode = paragraph.getFirstChild();
    assert.ok($isTextNode(textNode));
    textNode.select(start, end);
  });
};

const selectFirstBlockText = (editor: LexicalEditor): void => {
  updateEditor(editor, () => {
    const block = $getRoot().getFirstChild();
    assert.ok($isElementNode(block));
    block.selectStart();
    const firstText = block.getFirstChild();
    assert.ok($isTextNode(firstText));
    firstText.select(0, firstText.getTextContentSize());
  });
};

test("replay note editor applies a preselected heading before typing", () => {
  const editor = createReplayNoteEditor();

  applyReplayNoteBlockStyleAction(editor, "heading1");
  insertTextAtSelection(editor, "Plan");

  assert.deepEqual(exportDocument(editor).blocks, [
    {
      blockKind: "H1",
      children: [{ inlineKind: "TEXT", text: "Plan" }],
    },
  ]);
});

test("replay note editor keeps preselected inline marks for typed text", () => {
  const editor = createReplayNoteEditor();

  applyReplayNoteInlineTextAction(editor, "bold");
  applyReplayNoteInlineTextAction(editor, "highlight");
  insertTextAtSelection(editor, "Risk");

  let toolbarState!: ReplayNoteToolbarState;
  editor.getEditorState().read(() => {
    toolbarState = $resolveReplayNoteToolbarState();
  });

  assert.equal(toolbarState.inlineFormats.bold, true);
  assert.equal(toolbarState.inlineFormats.highlight, true);
  assert.deepEqual(exportDocument(editor).blocks, [
    {
      blockKind: "PARAGRAPH",
      children: [
        {
          inlineKind: "TEXT",
          text: "Risk",
          marks: ["BOLD", "HIGHLIGHT"],
        },
      ],
    },
  ]);
});

test("replay note editor starts each list type before typing", () => {
  const cases: Array<{
    action: ReplayNoteListAction;
    expectedBlock: ReplayNoteDocumentV1["blocks"][number];
  }> = [
    {
      action: "bulletList",
      expectedBlock: {
        blockKind: "BULLET_LIST",
        items: [[{ inlineKind: "TEXT", text: "Wait" }]],
      },
    },
    {
      action: "orderedList",
      expectedBlock: {
        blockKind: "ORDERED_LIST",
        items: [[{ inlineKind: "TEXT", text: "Wait" }]],
      },
    },
    {
      action: "checkList",
      expectedBlock: {
        blockKind: "CHECK_LIST",
        items: [
          {
            checked: false,
            children: [{ inlineKind: "TEXT", text: "Wait" }],
          },
        ],
      },
    },
  ];

  for (const { action, expectedBlock } of cases) {
    const editor = createReplayNoteEditor();

    applyReplayNoteListAction(editor, action);
    insertTextAtSelection(editor, "Wait");

    assert.deepEqual(exportDocument(editor).blocks, [expectedBlock], action);
  }
});

test("replay note editor creates an input block after a divider before typing", () => {
  const editor = createReplayNoteEditor();
  loadDocument(editor, {
    schemaVersion: 1,
    blocks: [{ blockKind: "DIVIDER" }],
  });
  updateEditor(editor, () => {
    $getRoot().selectEnd();
  });

  applyReplayNoteBlockStyleAction(editor, "heading3");
  insertTextAtSelection(editor, "After");

  assert.deepEqual(exportDocument(editor).blocks, [
    { blockKind: "DIVIDER" },
    {
      blockKind: "H3",
      children: [{ inlineKind: "TEXT", text: "After" }],
    },
  ]);
});

test("replay note editor formats only the selected text range", () => {
  const editor = createReplayNoteEditor();
  loadDocument(editor, {
    schemaVersion: 1,
    blocks: [
      {
        blockKind: "PARAGRAPH",
        children: [{ inlineKind: "TEXT", text: "ABCDE" }],
      },
    ],
  });
  selectFirstTextRange(editor, 1, 3);

  applyReplayNoteInlineTextAction(editor, "bold");

  assert.deepEqual(exportDocument(editor).blocks, [
    {
      blockKind: "PARAGRAPH",
      children: [
        { inlineKind: "TEXT", text: "A" },
        { inlineKind: "TEXT", text: "BC", marks: ["BOLD"] },
        { inlineKind: "TEXT", text: "DE" },
      ],
    },
  ]);
});

test("replay note editor converts selected paragraphs to heading and quote blocks", () => {
  const headingEditor = createReplayNoteEditor();
  loadDocument(headingEditor, {
    schemaVersion: 1,
    blocks: [
      {
        blockKind: "PARAGRAPH",
        children: [{ inlineKind: "TEXT", text: "Setup" }],
      },
    ],
  });
  selectFirstBlockText(headingEditor);

  applyReplayNoteBlockStyleAction(headingEditor, "heading2");

  assert.deepEqual(exportDocument(headingEditor).blocks, [
    {
      blockKind: "H2",
      children: [{ inlineKind: "TEXT", text: "Setup" }],
    },
  ]);

  const quoteEditor = createReplayNoteEditor();
  loadDocument(quoteEditor, {
    schemaVersion: 1,
    blocks: [
      {
        blockKind: "PARAGRAPH",
        children: [{ inlineKind: "TEXT", text: "Stay patient" }],
      },
    ],
  });
  selectFirstBlockText(quoteEditor);

  applyReplayNoteBlockStyleAction(quoteEditor, "quote");

  assert.deepEqual(exportDocument(quoteEditor).blocks, [
    {
      blockKind: "QUOTE",
      children: [{ inlineKind: "TEXT", text: "Stay patient" }],
    },
  ]);
});

test("replay note sticky block styles persist across new input blocks until cancelled", () => {
  const cases: Array<{
    action: Exclude<ReplayNoteBlockStyleAction, "paragraph">;
    expectedBlockKind: "H1" | "H2" | "H3" | "QUOTE";
  }> = [
    { action: "heading1", expectedBlockKind: "H1" },
    { action: "heading2", expectedBlockKind: "H2" },
    { action: "heading3", expectedBlockKind: "H3" },
    { action: "quote", expectedBlockKind: "QUOTE" },
  ];

  for (const { action, expectedBlockKind } of cases) {
    const editor = createReplayNoteEditor();
    let stickyState = createReplayNoteInitialStickyFormattingState();

    stickyState = applyStickyBlockStyleAction(editor, stickyState, action);
    insertTextAtSelection(editor, "One");
    insertParagraphAtSelection(editor);
    syncReplayNoteStickyFormattingState(editor, stickyState);
    insertTextAtSelection(editor, "Two");
    insertParagraphAtSelection(editor);
    syncReplayNoteStickyFormattingState(editor, stickyState);
    stickyState = applyStickyBlockStyleAction(editor, stickyState, action);
    insertTextAtSelection(editor, "Plain");

    assert.deepEqual(
      exportDocument(editor).blocks,
      [
        {
          blockKind: expectedBlockKind,
          children: [{ inlineKind: "TEXT", text: "One" }],
        },
        {
          blockKind: expectedBlockKind,
          children: [{ inlineKind: "TEXT", text: "Two" }],
        },
        {
          blockKind: "PARAGRAPH",
          children: [{ inlineKind: "TEXT", text: "Plain" }],
        },
      ],
      action,
    );
    assert.equal(stickyState.blockStyle, "paragraph", action);
  }
});

test("replay note sticky inline marks persist across new input blocks until cancelled", () => {
  const markByAction: Record<
    ReplayNoteInlineTextAction,
    "BOLD" | "ITALIC" | "UNDERLINE" | "HIGHLIGHT"
  > = {
    bold: "BOLD",
    italic: "ITALIC",
    underline: "UNDERLINE",
    highlight: "HIGHLIGHT",
  };

  for (const action of Object.keys(
    markByAction,
  ) as ReplayNoteInlineTextAction[]) {
    const editor = createReplayNoteEditor();
    let stickyState = createReplayNoteInitialStickyFormattingState();

    stickyState = applyStickyInlineTextAction(editor, stickyState, action);
    insertTextAtSelection(editor, "One");
    insertParagraphAtSelection(editor);
    syncReplayNoteStickyFormattingState(editor, stickyState);
    insertTextAtSelection(editor, "Two");
    insertParagraphAtSelection(editor);
    syncReplayNoteStickyFormattingState(editor, stickyState);
    stickyState = applyStickyInlineTextAction(editor, stickyState, action);
    insertTextAtSelection(editor, "Plain");

    assert.deepEqual(
      exportDocument(editor).blocks,
      [
        {
          blockKind: "PARAGRAPH",
          children: [
            {
              inlineKind: "TEXT",
              text: "One",
              marks: [markByAction[action]],
            },
          ],
        },
        {
          blockKind: "PARAGRAPH",
          children: [
            {
              inlineKind: "TEXT",
              text: "Two",
              marks: [markByAction[action]],
            },
          ],
        },
        {
          blockKind: "PARAGRAPH",
          children: [{ inlineKind: "TEXT", text: "Plain" }],
        },
      ],
      action,
    );
    assert.equal(stickyState.inlineFormats[action], false, action);
  }
});

test("replay note sticky lists persist across new list items until cancelled", () => {
  const cases: Array<{
    action: ReplayNoteListAction;
    expectedBlock: ReplayNoteDocumentV1["blocks"][number];
  }> = [
    {
      action: "bulletList",
      expectedBlock: {
        blockKind: "BULLET_LIST",
        items: [
          [{ inlineKind: "TEXT", text: "One" }],
          [{ inlineKind: "TEXT", text: "Two" }],
        ],
      },
    },
    {
      action: "orderedList",
      expectedBlock: {
        blockKind: "ORDERED_LIST",
        items: [
          [{ inlineKind: "TEXT", text: "One" }],
          [{ inlineKind: "TEXT", text: "Two" }],
        ],
      },
    },
    {
      action: "checkList",
      expectedBlock: {
        blockKind: "CHECK_LIST",
        items: [
          {
            checked: false,
            children: [{ inlineKind: "TEXT", text: "One" }],
          },
          {
            checked: false,
            children: [{ inlineKind: "TEXT", text: "Two" }],
          },
        ],
      },
    },
  ];

  for (const { action, expectedBlock } of cases) {
    const editor = createReplayNoteEditor();
    let stickyState = createReplayNoteInitialStickyFormattingState();

    stickyState = applyStickyListAction(editor, stickyState, action);
    insertTextAtSelection(editor, "One");
    insertParagraphAtSelection(editor);
    syncReplayNoteStickyFormattingState(editor, stickyState);
    insertTextAtSelection(editor, "Two");
    insertParagraphAtSelection(editor);
    syncReplayNoteStickyFormattingState(editor, stickyState);
    stickyState = applyStickyListAction(editor, stickyState, action);
    insertTextAtSelection(editor, "Plain");

    assert.deepEqual(
      exportDocument(editor).blocks,
      [
        expectedBlock,
        {
          blockKind: "PARAGRAPH",
          children: [{ inlineKind: "TEXT", text: "Plain" }],
        },
      ],
      action,
    );
    assert.equal(stickyState.listStyle, null, action);
  }
});

test("replay note divider remains a one-shot insert action outside sticky toolbar state", () => {
  const editor = createReplayNoteEditor();
  const stickyState = createReplayNoteInitialStickyFormattingState();

  applyReplayNoteInsertBlockAction(editor, "divider");
  const activeToolbarState = resolveReplayNoteToolbarStateWithStickyFormatting(
    resolveToolbarState(editor),
    stickyState,
  );
  syncReplayNoteStickyFormattingState(editor, stickyState);
  insertTextAtSelection(editor, "After");

  assert.equal(activeToolbarState.listStyle, null);
  assert.deepEqual(activeToolbarState.inlineFormats, {
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
  });
  assert.deepEqual(exportDocument(editor).blocks, [
    { blockKind: "DIVIDER" },
    {
      blockKind: "PARAGRAPH",
      children: [{ inlineKind: "TEXT", text: "After" }],
    },
  ]);
});
