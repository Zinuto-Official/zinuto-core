// SPDX-License-Identifier: GPL-3.0-only

import {
  $insertList,
  $isListItemNode,
  $isListNode,
  $removeList,
  type ListType,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $createHorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { $setBlocksType } from "@lexical/selection";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  TEXT_TYPE_TO_FORMAT,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
  type TextFormatType,
} from "lexical";

export type ReplayNoteInlineTextAction =
  | "bold"
  | "italic"
  | "underline"
  | "highlight";
export type ReplayNoteListAction = "bulletList" | "orderedList" | "checkList";
export type ReplayNoteInsertBlockAction = "divider";
export type ReplayNoteBlockStyleAction =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "quote";

export type ReplayNoteToolbarState = {
  blockStyle: ReplayNoteBlockStyleAction;
  inlineFormats: Record<ReplayNoteInlineTextAction, boolean>;
  listStyle: ReplayNoteListAction | null;
};

export type ReplayNoteStickyFormattingState = {
  blockStyle: ReplayNoteBlockStyleAction | null;
  inlineFormats: Record<ReplayNoteInlineTextAction, boolean | null>;
  listStyle: ReplayNoteListAction | null;
};

export type ReplayNoteStickyBlockStyleUpdate = {
  stickyState: ReplayNoteStickyFormattingState;
  actionToApply: ReplayNoteBlockStyleAction;
};

export type ReplayNoteStickyInlineTextUpdate = {
  stickyState: ReplayNoteStickyFormattingState;
  actionToApply: ReplayNoteInlineTextAction;
  isActive: boolean;
};

export type ReplayNoteStickyListUpdate = {
  stickyState: ReplayNoteStickyFormattingState;
  actionToApply: ReplayNoteListAction;
  isActive: boolean;
};

export const REPLAY_NOTE_STICKY_FORMATTING_SYNC_TAG =
  "replay-note-sticky-formatting-sync";

export const createReplayNoteInitialToolbarState =
  (): ReplayNoteToolbarState => ({
    blockStyle: "paragraph",
    inlineFormats: {
      bold: false,
      italic: false,
      underline: false,
      highlight: false,
    },
    listStyle: null,
  });

export const createReplayNoteInitialStickyFormattingState =
  (): ReplayNoteStickyFormattingState => ({
    blockStyle: null,
    inlineFormats: {
      bold: null,
      italic: null,
      underline: null,
      highlight: null,
    },
    listStyle: null,
  });

const HEADING_TAG_BY_BLOCK_STYLE_ACTION: Record<
  "heading1" | "heading2" | "heading3",
  HeadingTagType
> = {
  heading1: "h1",
  heading2: "h2",
  heading3: "h3",
};

const INLINE_FORMAT_BY_ACTION: Record<
  ReplayNoteInlineTextAction,
  TextFormatType
> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  highlight: "highlight",
};

const LIST_TYPE_BY_ACTION: Record<ReplayNoteListAction, ListType> = {
  bulletList: "bullet",
  orderedList: "number",
  checkList: "check",
};

const $isEmptyFormattingTargetElement = (node: ElementNode): boolean =>
  node.isEmpty() ||
  node
    .getChildren()
    .every(
      (child) => $isTextNode(child) && child.getTextContentSize() === 0,
    );

const $createBlockElementForStyle = (
  action: ReplayNoteBlockStyleAction = "paragraph",
): ElementNode => {
  if (action === "quote") {
    return $createQuoteNode();
  }
  if (action === "heading1" || action === "heading2" || action === "heading3") {
    return $createHeadingNode(HEADING_TAG_BY_BLOCK_STYLE_ACTION[action]);
  }
  return $createParagraphNode();
};

const $resolveTopLevelNode = (node: LexicalNode): LexicalNode | null => {
  const root = $getRoot();
  if (node.is(root)) {
    return null;
  }
  let current: LexicalNode | null = node;
  let parent = current.getParent();
  while (current && parent && !parent.is(root)) {
    current = parent;
    parent = current.getParent();
  }
  return parent?.is(root) ? current : null;
};

const $resolveEmptyFormattingTargetElement = (
  selection: RangeSelection,
): ElementNode | null => {
  if (!selection.isCollapsed()) {
    return null;
  }
  const anchorNode = selection.anchor.getNode();
  if (anchorNode.is($getRoot())) {
    return null;
  }
  let current: LexicalNode | null = anchorNode;
  while (current) {
    if ($isListItemNode(current)) {
      return $isEmptyFormattingTargetElement(current) ? current : null;
    }
    const parent: LexicalNode | null = current.getParent();
    if (parent?.is($getRoot()) && $isElementNode(current)) {
      return $isEmptyFormattingTargetElement(current) ? current : null;
    }
    current = parent;
  }
  return null;
};

const $selectInsertedBlock = (block: ElementNode): RangeSelection | null => {
  block.selectStart();
  const selection = $getSelection();
  return $isRangeSelection(selection) ? selection : null;
};

const $appendBlockAndSelect = (
  blockStyle: ReplayNoteBlockStyleAction,
): RangeSelection | null => {
  const block = $createBlockElementForStyle(blockStyle);
  $getRoot().append(block);
  return $selectInsertedBlock(block);
};

const $insertBlockAtRootOffset = (
  offset: number,
  blockStyle: ReplayNoteBlockStyleAction,
): RangeSelection | null => {
  const root = $getRoot();
  const safeOffset = Math.max(0, Math.min(offset, root.getChildrenSize()));
  const block = $createBlockElementForStyle(blockStyle);
  root.splice(safeOffset, 0, [block]);
  return $selectInsertedBlock(block);
};

const $insertBlockAfterNodeSelection = (
  blockStyle: ReplayNoteBlockStyleAction,
): RangeSelection | null => {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) {
    return null;
  }
  const selectedNodes = selection.getNodes();
  let insertionNode: LexicalNode | null = null;
  for (let index = selectedNodes.length - 1; index >= 0; index -= 1) {
    const selectedNode = selectedNodes[index];
    if (!selectedNode) {
      continue;
    }
    insertionNode = $resolveTopLevelNode(selectedNode);
    if (insertionNode) {
      break;
    }
  }
  if (!insertionNode) {
    return $appendBlockAndSelect(blockStyle);
  }
  const block = $createBlockElementForStyle(blockStyle);
  insertionNode.insertAfter(block);
  return $selectInsertedBlock(block);
};

const $ensureReplayNoteEditableRangeSelection = (
  blockStyle: ReplayNoteBlockStyleAction = "paragraph",
): RangeSelection | null => {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    const anchorNode = selection.anchor.getNode();
    if (!anchorNode.is($getRoot())) {
      return selection;
    }
    if (!selection.isCollapsed()) {
      return selection;
    }
    return $insertBlockAtRootOffset(selection.anchor.offset, blockStyle);
  }
  if ($isNodeSelection(selection)) {
    return $insertBlockAfterNodeSelection(blockStyle);
  }

  const root = $getRoot();
  if (root.getChildrenSize() === 0) {
    return $appendBlockAndSelect(blockStyle);
  }

  const lastChild = root.getLastChild();
  if ($isElementNode(lastChild)) {
    lastChild.selectEnd();
    const nextSelection = $getSelection();
    if ($isRangeSelection(nextSelection)) {
      return nextSelection;
    }
  }
  return $appendBlockAndSelect(blockStyle);
};

export const $resolveReplayNoteBlockStyleFromSelection =
  (): ReplayNoteBlockStyleAction => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return "paragraph";
    }
    const anchorNode = selection.anchor.getNode();
    if (anchorNode.is($getRoot())) {
      return "paragraph";
    }
    const topLevelElement = anchorNode.getTopLevelElementOrThrow();
    if ($isHeadingNode(topLevelElement)) {
      const tag = topLevelElement.getTag();
      if (tag === "h1") {
        return "heading1";
      }
      if (tag === "h2") {
        return "heading2";
      }
      if (tag === "h3") {
        return "heading3";
      }
    }
    if ($isQuoteNode(topLevelElement)) {
      return "quote";
    }
    return "paragraph";
  };

export const $resolveReplayNoteListStyleFromNode = (
  node: LexicalNode,
): ReplayNoteListAction | null => {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isListNode(current)) {
      const listType = current.getListType();
      if (listType === "bullet") {
        return "bulletList";
      }
      if (listType === "number") {
        return "orderedList";
      }
      if (listType === "check") {
        return "checkList";
      }
      return null;
    }
    current = current.getParent();
  }
  return null;
};

const $resolveListItemFromNode = (node: LexicalNode): LexicalNode | null => {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isListItemNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
};

const $exitEmptyListItemToParagraph = (
  selection: RangeSelection,
): boolean => {
  if (!selection.isCollapsed()) {
    return false;
  }
  const listItem = $resolveListItemFromNode(selection.anchor.getNode());
  if (
    !listItem ||
    !$isElementNode(listItem) ||
    !$isEmptyFormattingTargetElement(listItem)
  ) {
    return false;
  }
  const list = listItem.getParent();
  if (!$isListNode(list)) {
    return false;
  }
  const paragraph = $createParagraphNode();
  if (list.getChildrenSize() <= 1) {
    list.replace(paragraph);
    paragraph.selectStart();
    return true;
  }
  listItem.remove();
  list.insertAfter(paragraph);
  paragraph.selectStart();
  return true;
};

export const resolveReplayNoteToolbarStateWithStickyFormatting = (
  selectionState: ReplayNoteToolbarState,
  stickyState: ReplayNoteStickyFormattingState,
): ReplayNoteToolbarState => ({
  blockStyle: stickyState.blockStyle ?? selectionState.blockStyle,
  inlineFormats: {
    bold: stickyState.inlineFormats.bold ?? selectionState.inlineFormats.bold,
    italic:
      stickyState.inlineFormats.italic ?? selectionState.inlineFormats.italic,
    underline:
      stickyState.inlineFormats.underline ??
      selectionState.inlineFormats.underline,
    highlight:
      stickyState.inlineFormats.highlight ??
      selectionState.inlineFormats.highlight,
  },
  listStyle: stickyState.listStyle ?? selectionState.listStyle,
});

export const hasReplayNoteStickyFormattingState = (
  stickyState: ReplayNoteStickyFormattingState,
): boolean =>
  stickyState.blockStyle !== null ||
  stickyState.listStyle !== null ||
  stickyState.inlineFormats.bold !== null ||
  stickyState.inlineFormats.italic !== null ||
  stickyState.inlineFormats.underline !== null ||
  stickyState.inlineFormats.highlight !== null;

export const resolveReplayNoteStickyBlockStyleUpdate = (
  stickyState: ReplayNoteStickyFormattingState,
  selectionState: ReplayNoteToolbarState,
  action: ReplayNoteBlockStyleAction,
): ReplayNoteStickyBlockStyleUpdate => {
  const activeState = resolveReplayNoteToolbarStateWithStickyFormatting(
    selectionState,
    stickyState,
  );
  const actionToApply =
    action !== "paragraph" && activeState.blockStyle === action
      ? "paragraph"
      : action;
  return {
    actionToApply,
    stickyState: {
      ...stickyState,
      blockStyle: actionToApply,
      listStyle: actionToApply === "paragraph" ? stickyState.listStyle : null,
    },
  };
};

export const resolveReplayNoteStickyInlineTextUpdate = (
  stickyState: ReplayNoteStickyFormattingState,
  selectionState: ReplayNoteToolbarState,
  action: ReplayNoteInlineTextAction,
): ReplayNoteStickyInlineTextUpdate => {
  const activeState = resolveReplayNoteToolbarStateWithStickyFormatting(
    selectionState,
    stickyState,
  );
  const isActive = !activeState.inlineFormats[action];
  return {
    actionToApply: action,
    isActive,
    stickyState: {
      ...stickyState,
      inlineFormats: {
        ...stickyState.inlineFormats,
        [action]: isActive,
      },
    },
  };
};

export const resolveReplayNoteStickyListUpdate = (
  stickyState: ReplayNoteStickyFormattingState,
  selectionState: ReplayNoteToolbarState,
  action: ReplayNoteListAction,
): ReplayNoteStickyListUpdate => {
  const activeState = resolveReplayNoteToolbarStateWithStickyFormatting(
    selectionState,
    stickyState,
  );
  const isActive = activeState.listStyle !== action;
  return {
    actionToApply: action,
    isActive,
    stickyState: {
      ...stickyState,
      blockStyle: isActive ? "paragraph" : stickyState.blockStyle,
      listStyle: isActive ? action : null,
    },
  };
};

export const $resolveReplayNoteToolbarState = (): ReplayNoteToolbarState => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return createReplayNoteInitialToolbarState();
  }
  const anchorNode = selection.anchor.getNode();
  return {
    blockStyle: $resolveReplayNoteBlockStyleFromSelection(),
    inlineFormats: {
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      underline: selection.hasFormat("underline"),
      highlight: selection.hasFormat("highlight"),
    },
    listStyle: $resolveReplayNoteListStyleFromNode(anchorNode),
  };
};

const $setSelectionInlineTextAction = (
  selection: RangeSelection,
  action: ReplayNoteInlineTextAction,
  isActive: boolean,
): boolean => {
  const format = INLINE_FORMAT_BY_ACTION[action];
  const isCurrentlyActive = selection.hasFormat(format);
  if (selection.isCollapsed()) {
    if (isCurrentlyActive === isActive) {
      return false;
    }
    selection.formatText(format);
    return true;
  }
  selection.formatText(format, isActive ? TEXT_TYPE_TO_FORMAT[format] : 0);
  return true;
};

const $applyReplayNoteBlockStyleAction = (
  action: ReplayNoteBlockStyleAction,
): boolean => {
  let selection = $ensureReplayNoteEditableRangeSelection(action);
  if (!selection) {
    return false;
  }
  const currentBlockStyle = $resolveReplayNoteBlockStyleFromSelection();
  const currentListStyle = $resolveReplayNoteListStyleFromNode(
    selection.anchor.getNode(),
  );
  if (currentBlockStyle === action && !currentListStyle) {
    return false;
  }
  if (action !== "paragraph" && currentListStyle) {
    $removeList();
    const nextSelection = $getSelection();
    if (!$isRangeSelection(nextSelection)) {
      return false;
    }
    selection = nextSelection;
  }
  $setBlocksType(selection, () => $createBlockElementForStyle(action));
  return true;
};

const $applyReplayNoteListAction = (
  action: ReplayNoteListAction,
  isActive?: boolean,
): boolean => {
  const selection = $ensureReplayNoteEditableRangeSelection();
  if (!selection) {
    return false;
  }
  const currentListStyle = $resolveReplayNoteListStyleFromNode(
    selection.anchor.getNode(),
  );
  if (isActive === false) {
    if (!currentListStyle) {
      return false;
    }
    if ($exitEmptyListItemToParagraph(selection)) {
      return true;
    }
    $removeList();
    return true;
  }
  if (isActive === true) {
    if (currentListStyle === action) {
      return false;
    }
    $insertList(LIST_TYPE_BY_ACTION[action]);
    return true;
  }
  if (currentListStyle === action) {
    $removeList();
    return true;
  }
  $insertList(LIST_TYPE_BY_ACTION[action]);
  return true;
};

export const $syncReplayNoteStickyFormattingState = (
  stickyState: ReplayNoteStickyFormattingState,
): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  let didSync = false;
  (
    Object.entries(stickyState.inlineFormats) as Array<
      [ReplayNoteInlineTextAction, boolean | null]
    >
  ).forEach(([action, isActive]) => {
    if (isActive !== null) {
      didSync =
        $setSelectionInlineTextAction(selection, action, isActive) || didSync;
    }
  });

  const emptyElement = $resolveEmptyFormattingTargetElement(selection);
  if (!emptyElement) {
    return didSync;
  }

  if (stickyState.listStyle) {
    const currentListStyle = $resolveReplayNoteListStyleFromNode(
      selection.anchor.getNode(),
    );
    if (currentListStyle !== stickyState.listStyle) {
      didSync =
        $applyReplayNoteListAction(stickyState.listStyle, true) || didSync;
    }
    return didSync;
  }

  if (stickyState.blockStyle) {
    const currentBlockStyle = $resolveReplayNoteBlockStyleFromSelection();
    const currentListStyle = $resolveReplayNoteListStyleFromNode(
      selection.anchor.getNode(),
    );
    if (
      currentBlockStyle !== stickyState.blockStyle ||
      (stickyState.blockStyle !== "paragraph" && currentListStyle)
    ) {
      didSync =
        $applyReplayNoteBlockStyleAction(stickyState.blockStyle) || didSync;
    }
  }

  return didSync;
};

export const syncReplayNoteStickyFormattingState = (
  editor: LexicalEditor,
  stickyState: ReplayNoteStickyFormattingState,
): boolean => {
  if (!hasReplayNoteStickyFormattingState(stickyState)) {
    return false;
  }
  let didSync = false;
  editor.update(
    () => {
      didSync = $syncReplayNoteStickyFormattingState(stickyState);
    },
    {
      discrete: true,
      tag: REPLAY_NOTE_STICKY_FORMATTING_SYNC_TAG,
    },
  );
  return didSync;
};

export const applyReplayNoteBlockStyleAction = (
  editor: LexicalEditor,
  action: ReplayNoteBlockStyleAction,
): void => {
  editor.update(
    () => {
      $applyReplayNoteBlockStyleAction(action);
    },
    { discrete: true },
  );
};

export const applyReplayNoteInlineTextAction = (
  editor: LexicalEditor,
  action: ReplayNoteInlineTextAction,
  isActive?: boolean,
): void => {
  editor.update(
    () => {
      const selection = $ensureReplayNoteEditableRangeSelection();
      if (!selection) {
        return;
      }
      if (isActive === undefined) {
        selection.formatText(INLINE_FORMAT_BY_ACTION[action]);
        return;
      }
      $setSelectionInlineTextAction(selection, action, isActive);
    },
    { discrete: true },
  );
};

export const applyReplayNoteListAction = (
  editor: LexicalEditor,
  action: ReplayNoteListAction,
  isActive?: boolean,
): void => {
  editor.update(
    () => {
      $applyReplayNoteListAction(action, isActive);
    },
    { discrete: true },
  );
};

export const applyReplayNoteInsertBlockAction = (
  editor: LexicalEditor,
  action: ReplayNoteInsertBlockAction,
): void => {
  if (action !== "divider") {
    return;
  }
  editor.update(
    () => {
      const selection = $ensureReplayNoteEditableRangeSelection();
      if (!selection) {
        return;
      }
      const divider = $createHorizontalRuleNode();
      selection.insertNodes([divider]);
      const paragraph = $createParagraphNode();
      divider.insertAfter(paragraph);
      paragraph.selectStart();
    },
    { discrete: true },
  );
};
