// SPDX-License-Identifier: GPL-3.0-only

import {
  INPUT_ARRAY_LIMITS,
  INPUT_LIMITS,
  INPUT_SERIALIZED_LIMITS,
} from "./input-limits.js";
import {
  isReplayNoteColorToken,
  type ReplayNoteColorToken,
} from "./replayNoteColors.js";

export const REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const REPLAY_NOTE_BLOCK_KINDS = [
  "PARAGRAPH",
  "H1",
  "H2",
  "H3",
  "QUOTE",
  "BULLET_LIST",
  "ORDERED_LIST",
  "CHECK_LIST",
  "DIVIDER",
  "EMBED",
] as const;

export const REPLAY_NOTE_INLINE_KINDS = ["TEXT", "CAPSULE"] as const;

export const REPLAY_NOTE_INLINE_MARKS = [
  "BOLD",
  "ITALIC",
  "UNDERLINE",
  "HIGHLIGHT",
] as const;

export const REPLAY_NOTE_ATTACHMENT_KINDS = [
  "CAPSULE",
  "REPLAY_CONTEXT",
  "CHART_VIEW",
  "DRAWING_LAYER",
] as const;

export type ReplayNoteBlockKind = (typeof REPLAY_NOTE_BLOCK_KINDS)[number];
export type ReplayNoteInlineKind = (typeof REPLAY_NOTE_INLINE_KINDS)[number];
export type ReplayNoteInlineMark = (typeof REPLAY_NOTE_INLINE_MARKS)[number];
export type ReplayNoteAttachmentKind =
  (typeof REPLAY_NOTE_ATTACHMENT_KINDS)[number];

export type ReplayNoteTextInlineV1 = {
  inlineKind: "TEXT";
  text: string;
  marks?: ReplayNoteInlineMark[];
};

export type ReplayNoteCapsuleInlineV1 = {
  inlineKind: "CAPSULE";
  attachmentRefId: string;
};

export type ReplayNoteInlineV1 =
  | ReplayNoteTextInlineV1
  | ReplayNoteCapsuleInlineV1;

export type ReplayNoteParagraphBlockV1 = {
  blockKind: "PARAGRAPH";
  children: ReplayNoteInlineV1[];
};

export type ReplayNoteHeadingBlockV1 = {
  blockKind: "H1" | "H2" | "H3";
  children: ReplayNoteInlineV1[];
};

export type ReplayNoteQuoteBlockV1 = {
  blockKind: "QUOTE";
  children: ReplayNoteInlineV1[];
};

export type ReplayNoteListBlockV1 = {
  blockKind: "BULLET_LIST" | "ORDERED_LIST";
  items: ReplayNoteInlineV1[][];
};

export type ReplayNoteCheckListItemV1 = {
  checked: boolean;
  children: ReplayNoteInlineV1[];
};

export type ReplayNoteCheckListBlockV1 = {
  blockKind: "CHECK_LIST";
  items: ReplayNoteCheckListItemV1[];
};

export type ReplayNoteDividerBlockV1 = {
  blockKind: "DIVIDER";
};

export type ReplayNoteEmbedBlockV1 = {
  blockKind: "EMBED";
  attachmentRefId: string;
};

export type ReplayNoteBlockV1 =
  | ReplayNoteParagraphBlockV1
  | ReplayNoteHeadingBlockV1
  | ReplayNoteQuoteBlockV1
  | ReplayNoteListBlockV1
  | ReplayNoteCheckListBlockV1
  | ReplayNoteDividerBlockV1
  | ReplayNoteEmbedBlockV1;

export type ReplayNoteDocumentV1 = {
  schemaVersion: typeof REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION;
  blocks: ReplayNoteBlockV1[];
};

export type ReplayNoteAttachmentRefV1 = {
  kind: string;
  id: string | null;
};

export type ReplayNoteAttachmentSummaryV1 = {
  label?: string;
  value?: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
  colorToken?: ReplayNoteColorToken;
};

export type ReplayNoteAttachmentV1 = {
  attachmentRefId: string;
  kind: ReplayNoteAttachmentKind;
  summary?: ReplayNoteAttachmentSummaryV1 | null;
  ref?: ReplayNoteAttachmentRefV1 | null;
  payload?: unknown;
  sortIndex?: number;
};

const MAX_NOTE_BLOCKS = 2000;
const MAX_NOTE_LIST_ITEMS = 2000;
const MAX_NOTE_INLINE_ITEMS = 4000;
const PREVIEW_ELLIPSIS = "…";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n") : "";

const normalizeId = (value: unknown): string => {
  const id = typeof value === "string" ? value.trim() : "";
  return id.length <= INPUT_LIMITS.idChars ? id : id.slice(0, INPUT_LIMITS.idChars);
};

const normalizeShortText = (
  value: unknown,
  maxChars: number = INPUT_LIMITS.generalNameChars,
): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return undefined;
  }
  return text.length <= maxChars ? text : text.slice(0, maxChars);
};

const normalizeMarks = (rawMarks: unknown): ReplayNoteInlineMark[] | undefined => {
  if (!Array.isArray(rawMarks)) {
    return undefined;
  }
  const marks = REPLAY_NOTE_INLINE_MARKS.filter((mark) =>
    rawMarks.includes(mark),
  );
  return marks.length ? marks : undefined;
};

const sameMarks = (
  left: readonly ReplayNoteInlineMark[] | undefined,
  right: readonly ReplayNoteInlineMark[] | undefined,
): boolean => {
  const leftMarks = left ?? [];
  const rightMarks = right ?? [];
  return (
    leftMarks.length === rightMarks.length &&
    leftMarks.every((mark, index) => mark === rightMarks[index])
  );
};

const pushTextInline = (
  target: ReplayNoteInlineV1[],
  text: string,
  marks?: ReplayNoteInlineMark[],
): void => {
  if (!text) {
    return;
  }
  const previous = target[target.length - 1];
  if (
    previous?.inlineKind === "TEXT" &&
    sameMarks(previous.marks, marks)
  ) {
    previous.text += text;
    return;
  }
  target.push({
    inlineKind: "TEXT",
    text,
    ...(marks?.length ? { marks } : {}),
  });
};

const normalizeInlineItems = (
  rawItems: unknown,
  counters: { textChars: number; inlineItems: number },
): ReplayNoteInlineV1[] => {
  if (!Array.isArray(rawItems) || counters.inlineItems >= MAX_NOTE_INLINE_ITEMS) {
    return [];
  }
  const normalized: ReplayNoteInlineV1[] = [];
  for (const item of rawItems) {
    if (!isRecord(item) || counters.inlineItems >= MAX_NOTE_INLINE_ITEMS) {
      continue;
    }
    const inlineKind = String(item.inlineKind ?? "").trim().toUpperCase();
    if (inlineKind === "TEXT") {
      const availableChars = INPUT_LIMITS.noteContentChars - counters.textChars;
      if (availableChars <= 0) {
        break;
      }
      const text = normalizeText(item.text).slice(0, availableChars);
      if (!text) {
        continue;
      }
      counters.textChars += text.length;
      counters.inlineItems += 1;
      pushTextInline(normalized, text, normalizeMarks(item.marks));
      continue;
    }
    if (inlineKind === "CAPSULE") {
      const attachmentRefId = normalizeId(item.attachmentRefId);
      if (!attachmentRefId) {
        continue;
      }
      counters.inlineItems += 1;
      normalized.push({
        inlineKind: "CAPSULE",
        attachmentRefId,
      });
    }
  }
  return normalized;
};

const normalizeListItems = (
  rawItems: unknown,
  counters: { textChars: number; inlineItems: number },
): ReplayNoteInlineV1[][] => {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems
    .slice(0, MAX_NOTE_LIST_ITEMS)
    .map((item) => normalizeInlineItems(item, counters));
};

const normalizeCheckListItems = (
  rawItems: unknown,
  counters: { textChars: number; inlineItems: number },
): ReplayNoteCheckListItemV1[] => {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems.slice(0, MAX_NOTE_LIST_ITEMS).map((item) => {
    if (!isRecord(item)) {
      return {
        checked: false,
        children: [],
      };
    }
    return {
      checked: item.checked === true,
      children: normalizeInlineItems(item.children, counters),
    };
  });
};

const normalizeBlock = (
  rawBlock: unknown,
  counters: { textChars: number; inlineItems: number },
): ReplayNoteBlockV1 | null => {
  if (!isRecord(rawBlock)) {
    return null;
  }
  const blockKind = String(rawBlock.blockKind ?? "").trim().toUpperCase();
  if (
    blockKind === "PARAGRAPH" ||
    blockKind === "H1" ||
    blockKind === "H2" ||
    blockKind === "H3" ||
    blockKind === "QUOTE"
  ) {
    return {
      blockKind,
      children: normalizeInlineItems(rawBlock.children, counters),
    };
  }
  if (blockKind === "BULLET_LIST" || blockKind === "ORDERED_LIST") {
    return {
      blockKind,
      items: normalizeListItems(rawBlock.items, counters),
    };
  }
  if (blockKind === "CHECK_LIST") {
    return {
      blockKind: "CHECK_LIST",
      items: normalizeCheckListItems(rawBlock.items, counters),
    };
  }
  if (blockKind === "DIVIDER") {
    return { blockKind: "DIVIDER" };
  }
  if (blockKind === "EMBED") {
    const attachmentRefId = normalizeId(rawBlock.attachmentRefId);
    return attachmentRefId
      ? {
          blockKind: "EMBED",
          attachmentRefId,
        }
      : null;
  }
  return null;
};

export const createEmptyReplayNoteDocument = (): ReplayNoteDocumentV1 => ({
  schemaVersion: REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION,
  blocks: [],
});

export const createReplayNoteDocumentFromPlainText = (
  text: string,
): ReplayNoteDocumentV1 => {
  const normalized = normalizeText(text);
  if (!normalized.trim()) {
    return createEmptyReplayNoteDocument();
  }
  const blocks = normalized
    .split(/\n{2,}/)
    .slice(0, MAX_NOTE_BLOCKS)
    .map<ReplayNoteParagraphBlockV1>((paragraph) => ({
      blockKind: "PARAGRAPH",
      children: paragraph
        ? [
            {
              inlineKind: "TEXT",
              text: paragraph.slice(0, INPUT_LIMITS.noteContentChars),
            },
          ]
        : [],
    }));
  return normalizeReplayNoteDocument({
    schemaVersion: REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION,
    blocks,
  });
};

export const normalizeReplayNoteDocument = (
  value: unknown,
): ReplayNoteDocumentV1 => {
  if (!isRecord(value)) {
    return createEmptyReplayNoteDocument();
  }
  const rawBlocks = Array.isArray(value.blocks) ? value.blocks : [];
  const counters = { textChars: 0, inlineItems: 0 };
  const blocks = rawBlocks
    .slice(0, MAX_NOTE_BLOCKS)
    .map((block) => normalizeBlock(block, counters))
    .filter((block): block is ReplayNoteBlockV1 => Boolean(block));
  return {
    schemaVersion: REPLAY_NOTE_DOCUMENT_SCHEMA_VERSION,
    blocks,
  };
};

export const normalizeReplayNoteAttachmentSummary = (
  value: unknown,
): ReplayNoteAttachmentSummaryV1 | null => {
  if (!isRecord(value)) {
    return null;
  }
  const tone = String(value.tone ?? "").trim();
  const colorToken = String(value.colorToken ?? "").trim().toUpperCase();
  return {
    label: normalizeShortText(value.label),
    value: normalizeShortText(value.value),
    tone:
      tone === "neutral" ||
      tone === "positive" ||
      tone === "warning" ||
      tone === "danger"
        ? tone
        : undefined,
    colorToken: isReplayNoteColorToken(colorToken) ? colorToken : undefined,
  };
};

export const normalizeReplayNoteAttachments = (
  value: unknown,
): ReplayNoteAttachmentV1[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const maxItems = Math.max(1, INPUT_ARRAY_LIMITS.replayNoteColors * 100);
  const attachments: ReplayNoteAttachmentV1[] = [];
  value.slice(0, maxItems).forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const attachmentRefId = normalizeId(item.attachmentRefId);
    const kind = String(item.kind ?? "").trim().toUpperCase();
    if (
      !attachmentRefId ||
      seen.has(attachmentRefId) ||
      !REPLAY_NOTE_ATTACHMENT_KINDS.includes(kind as ReplayNoteAttachmentKind)
    ) {
      return;
    }
    seen.add(attachmentRefId);
    const ref = isRecord(item.ref)
      ? {
          kind: normalizeShortText(item.ref.kind, INPUT_LIMITS.shortCodeChars) ?? "",
          id: normalizeId(item.ref.id) || null,
        }
      : null;
    attachments.push({
      attachmentRefId,
      kind: kind as ReplayNoteAttachmentKind,
      summary: normalizeReplayNoteAttachmentSummary(item.summary),
      ref: ref?.kind ? ref : null,
      payload: item.payload,
      sortIndex: Number.isFinite(Number(item.sortIndex))
        ? Math.max(0, Math.floor(Number(item.sortIndex)))
        : index,
    });
  });
  return attachments;
};

const resolveAttachmentLabel = (
  attachmentRefId: string,
  attachmentByRefId?: ReadonlyMap<string, ReplayNoteAttachmentV1>,
): string => {
  const summary = attachmentByRefId?.get(attachmentRefId)?.summary;
  return [summary?.label, summary?.value].filter(Boolean).join(" ").trim();
};

const inlineText = (
  inline: ReplayNoteInlineV1,
  attachmentByRefId?: ReadonlyMap<string, ReplayNoteAttachmentV1>,
): string => {
  if (inline.inlineKind === "TEXT") {
    return inline.text;
  }
  return resolveAttachmentLabel(inline.attachmentRefId, attachmentByRefId);
};

const inlineItemsText = (
  items: readonly ReplayNoteInlineV1[],
  attachmentByRefId?: ReadonlyMap<string, ReplayNoteAttachmentV1>,
): string => items.map((item) => inlineText(item, attachmentByRefId)).join("");

export const deriveReplayNoteDocumentPlainText = (
  document: ReplayNoteDocumentV1,
  attachments: readonly ReplayNoteAttachmentV1[] = [],
): string => {
  const normalizedDocument = normalizeReplayNoteDocument(document);
  const attachmentByRefId = new Map(
    normalizeReplayNoteAttachments(attachments).map((attachment) => [
      attachment.attachmentRefId,
      attachment,
    ]),
  );
  return normalizedDocument.blocks
    .map((block) => {
      switch (block.blockKind) {
        case "PARAGRAPH":
        case "H1":
        case "H2":
        case "H3":
        case "QUOTE":
          return inlineItemsText(block.children, attachmentByRefId);
        case "BULLET_LIST":
        case "ORDERED_LIST":
          return block.items
            .map((item) => inlineItemsText(item, attachmentByRefId))
            .filter(Boolean)
            .join("\n");
        case "CHECK_LIST":
          return block.items
            .map((item) => inlineItemsText(item.children, attachmentByRefId))
            .filter(Boolean)
            .join("\n");
        case "DIVIDER":
          return "";
        case "EMBED":
          return resolveAttachmentLabel(block.attachmentRefId, attachmentByRefId);
      }
    })
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
};

export const buildReplayNoteDocumentPreview = (
  document: ReplayNoteDocumentV1,
  attachments: readonly ReplayNoteAttachmentV1[] = [],
  maxChars = 180,
): string => {
  const normalized = deriveReplayNoteDocumentPlainText(document, attachments)
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}${PREVIEW_ELLIPSIS}`;
};

export const listReplayNoteDocumentAttachmentRefIds = (
  document: ReplayNoteDocumentV1,
): string[] => {
  const refs = new Set<string>();
  normalizeReplayNoteDocument(document).blocks.forEach((block) => {
    if (block.blockKind === "EMBED") {
      refs.add(block.attachmentRefId);
      return;
    }
    const inlineGroups: ReplayNoteInlineV1[][] =
      block.blockKind === "BULLET_LIST" || block.blockKind === "ORDERED_LIST"
        ? block.items
        : block.blockKind === "CHECK_LIST"
          ? block.items.map((item) => item.children)
          : block.blockKind === "PARAGRAPH" ||
              block.blockKind === "H1" ||
              block.blockKind === "H2" ||
              block.blockKind === "H3" ||
              block.blockKind === "QUOTE"
          ? [block.children]
          : [];
    inlineGroups.forEach((items) => {
      items.forEach((item) => {
        if (item.inlineKind === "CAPSULE") {
          refs.add(item.attachmentRefId);
        }
      });
    });
  });
  return [...refs];
};

export const stringifyReplayNoteDocument = (
  document: ReplayNoteDocumentV1,
): string => JSON.stringify(normalizeReplayNoteDocument(document));

export const measureReplayNoteDocumentJsonBytes = (
  document: ReplayNoteDocumentV1,
): number => new TextEncoder().encode(stringifyReplayNoteDocument(document)).length;

export const isReplayNoteDocumentWithinSerializedLimit = (
  document: ReplayNoteDocumentV1,
): boolean =>
  measureReplayNoteDocumentJsonBytes(document) <=
  INPUT_SERIALIZED_LIMITS.replayNoteMetaBytes * 4;
