// SPDX-License-Identifier: GPL-3.0-only

import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from "@lexical/list";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode";
import {
  normalizeReplayNoteDocument,
  type ReplayNoteCheckListItemV1,
  type ReplayNoteDocumentV1,
  type ReplayNoteInlineMark,
  type ReplayNoteInlineV1,
} from "@zinuto/shared/replayNoteDocument";
import {
  $createCapsuleNode,
  $createNoteEmbedNode,
  $isCapsuleNode,
  $isNoteEmbedNode,
} from "@/workspaces/notes/ReplayNoteLexicalNodes";

const applyMarks = (
  textNode: ReturnType<typeof $createTextNode>,
  marks?: ReplayNoteInlineMark[],
) => {
  if (marks?.includes("BOLD")) {
    textNode.toggleFormat("bold");
  }
  if (marks?.includes("ITALIC")) {
    textNode.toggleFormat("italic");
  }
  if (marks?.includes("UNDERLINE")) {
    textNode.toggleFormat("underline");
  }
  if (marks?.includes("HIGHLIGHT")) {
    textNode.toggleFormat("highlight");
  }
  return textNode;
};

const appendInlineItems = (
  parent: ElementNode,
  items: readonly ReplayNoteInlineV1[],
) => {
  items.forEach((item) => {
    if (item.inlineKind === "TEXT") {
      parent.append(applyMarks($createTextNode(item.text), item.marks));
      return;
    }
    parent.append($createCapsuleNode(item.attachmentRefId));
  });
};

export const $applyReplayNoteDocumentToEditor = (
  document: ReplayNoteDocumentV1,
): void => {
  const root = $getRoot();
  root.clear();
  const normalizedDocument = normalizeReplayNoteDocument(document);
  normalizedDocument.blocks.forEach((block) => {
    if (block.blockKind === "PARAGRAPH") {
      const paragraph = $createParagraphNode();
      appendInlineItems(paragraph, block.children);
      root.append(paragraph);
      return;
    }
    if (
      block.blockKind === "H1" ||
      block.blockKind === "H2" ||
      block.blockKind === "H3"
    ) {
      const heading = $createHeadingNode(block.blockKind.toLowerCase() as HeadingTagType);
      appendInlineItems(heading, block.children);
      root.append(heading);
      return;
    }
    if (block.blockKind === "QUOTE") {
      const quote = $createQuoteNode();
      appendInlineItems(quote, block.children);
      root.append(quote);
      return;
    }
    if (block.blockKind === "BULLET_LIST" || block.blockKind === "ORDERED_LIST") {
      const list = $createListNode(
        block.blockKind === "BULLET_LIST" ? "bullet" : "number",
      );
      block.items.forEach((item) => {
        const listItem = $createListItemNode();
        appendInlineItems(listItem, item);
        list.append(listItem);
      });
      root.append(list);
      return;
    }
    if (block.blockKind === "CHECK_LIST") {
      const list = $createListNode("check");
      block.items.forEach((item) => {
        const listItem = $createListItemNode(item.checked);
        appendInlineItems(listItem, item.children);
        list.append(listItem);
      });
      root.append(list);
      return;
    }
    if (block.blockKind === "DIVIDER") {
      root.append($createHorizontalRuleNode());
      return;
    }
    if (block.blockKind === "EMBED") {
      root.append($createNoteEmbedNode(block.attachmentRefId));
    }
  });
};

const exportInlineItems = (node: ElementNode): ReplayNoteInlineV1[] => {
  const items: ReplayNoteInlineV1[] = [];
  node.getChildren().forEach((child) => {
    if ($isTextNode(child)) {
      const text = child.getTextContent();
      if (!text) {
        return;
      }
      const marks: ReplayNoteInlineMark[] = [];
      if (child.hasFormat("bold")) {
        marks.push("BOLD");
      }
      if (child.hasFormat("italic")) {
        marks.push("ITALIC");
      }
      if (child.hasFormat("underline")) {
        marks.push("UNDERLINE");
      }
      if (child.hasFormat("highlight")) {
        marks.push("HIGHLIGHT");
      }
      items.push({
        inlineKind: "TEXT",
        text,
        ...(marks.length ? { marks } : {}),
      });
      return;
    }
    if ($isCapsuleNode(child)) {
      items.push({
        inlineKind: "CAPSULE",
        attachmentRefId: child.getAttachmentRefId(),
      });
    }
    if ($isElementNode(child)) {
      items.push(...exportInlineItems(child));
    }
  });
  return items;
};

const exportListItem = (node: LexicalNode): ReplayNoteInlineV1[] => {
  if ($isListItemNode(node)) {
    return exportInlineItems(node);
  }
  return [];
};

const exportCheckListItem = (node: LexicalNode): ReplayNoteCheckListItemV1 => {
  if ($isListItemNode(node)) {
    return {
      checked: node.getChecked() === true,
      children: exportInlineItems(node),
    };
  }
  return { checked: false, children: [] };
};

export const $exportReplayNoteDocumentFromEditor = (): ReplayNoteDocumentV1 => {
  const blocks: ReplayNoteDocumentV1["blocks"] = [];
  $getRoot()
    .getChildren()
    .forEach((child) => {
      if ($isParagraphNode(child)) {
        blocks.push({
          blockKind: "PARAGRAPH",
          children: exportInlineItems(child),
        });
        return;
      }
      if ($isHeadingNode(child)) {
        const tag = child.getTag() as HeadingTagType;
        if (tag === "h1" || tag === "h2" || tag === "h3") {
          blocks.push({
            blockKind: tag.toUpperCase() as "H1" | "H2" | "H3",
            children: exportInlineItems(child),
          });
        }
        return;
      }
      if ($isQuoteNode(child)) {
        blocks.push({
          blockKind: "QUOTE",
          children: exportInlineItems(child),
        });
        return;
      }
      if ($isListNode(child)) {
        const listType = child.getListType();
        if (listType === "bullet" || listType === "number") {
          blocks.push({
            blockKind: listType === "bullet" ? "BULLET_LIST" : "ORDERED_LIST",
            items: child.getChildren().map(exportListItem),
          });
          return;
        }
        if (listType === "check") {
          blocks.push({
            blockKind: "CHECK_LIST",
            items: child.getChildren().map(exportCheckListItem),
          });
        }
        return;
      }
      if ($isHorizontalRuleNode(child)) {
        blocks.push({ blockKind: "DIVIDER" });
        return;
      }
      if ($isNoteEmbedNode(child)) {
        blocks.push({
          blockKind: "EMBED",
          attachmentRefId: child.getAttachmentRefId(),
        });
      }
    });
  return normalizeReplayNoteDocument({
    schemaVersion: 1,
    blocks,
  });
};
