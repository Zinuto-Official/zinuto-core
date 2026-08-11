// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReplayNoteDocumentPreview,
  createReplayNoteDocumentFromPlainText,
  deriveReplayNoteDocumentPlainText,
  listReplayNoteDocumentAttachmentRefIds,
  normalizeReplayNoteAttachments,
  normalizeReplayNoteDocument,
  stringifyReplayNoteDocument,
} from "../dist/replayNoteDocument.js";

test("replay note document normalizes supported blocks and inline marks", () => {
  const document = normalizeReplayNoteDocument({
    schemaVersion: 99,
    blocks: [
      {
        blockKind: "h1",
        children: [
          {
            inlineKind: "text",
            text: "Plan",
            marks: ["HIGHLIGHT", "ITALIC", "BOLD", "BAD", "UNDERLINE"],
          },
        ],
      },
      {
        blockKind: "quote",
        children: [{ inlineKind: "text", text: "Stay patient" }],
      },
      {
        blockKind: "ordered_list",
        items: [[{ inlineKind: "text", text: "First" }]],
      },
      { blockKind: "divider" },
      {
        blockKind: "check_list",
        items: [
          {
            checked: true,
            children: [{ inlineKind: "text", text: "Review exit rule" }],
          },
        ],
      },
      { blockKind: "table", rows: [] },
      { blockKind: "embed", attachmentRefId: "chart-1" },
      { blockKind: "unknown", children: [] },
    ],
  });

  assert.equal(document.schemaVersion, 1);
  assert.deepEqual(document.blocks, [
    {
      blockKind: "H1",
      children: [
        {
          inlineKind: "TEXT",
          text: "Plan",
          marks: ["BOLD", "ITALIC", "UNDERLINE", "HIGHLIGHT"],
        },
      ],
    },
    {
      blockKind: "QUOTE",
      children: [{ inlineKind: "TEXT", text: "Stay patient" }],
    },
    {
      blockKind: "ORDERED_LIST",
      items: [[{ inlineKind: "TEXT", text: "First" }]],
    },
    { blockKind: "DIVIDER" },
    {
      blockKind: "CHECK_LIST",
      items: [
        {
          checked: true,
          children: [{ inlineKind: "TEXT", text: "Review exit rule" }],
        },
      ],
    },
    { blockKind: "EMBED", attachmentRefId: "chart-1" },
  ]);
});

test("replay note document derives plain text, preview, attachment refs, and stable json", () => {
  const document = normalizeReplayNoteDocument({
    schemaVersion: 1,
    blocks: [
      {
        blockKind: "PARAGRAPH",
        children: [
          { inlineKind: "TEXT", text: "Breakout " },
          { inlineKind: "CAPSULE", attachmentRefId: "cap-1" },
        ],
      },
      {
        blockKind: "BULLET_LIST",
        items: [[{ inlineKind: "TEXT", text: "Wait for volume" }]],
      },
      {
        blockKind: "CHECK_LIST",
        items: [
          {
            checked: false,
            children: [{ inlineKind: "TEXT", text: "Mark the mistake" }],
          },
        ],
      },
    ],
  });
  const attachments = normalizeReplayNoteAttachments([
    {
      attachmentRefId: "cap-1",
      kind: "CAPSULE",
      summary: { label: "Risk", value: "Low", tone: "positive", colorToken: "GREEN" },
    },
  ]);

  assert.equal(
    deriveReplayNoteDocumentPlainText(document, attachments),
    "Breakout Risk Low\nWait for volume\nMark the mistake",
  );
  assert.equal(
    buildReplayNoteDocumentPreview(document, attachments, 18),
    "Breakout Risk Low…",
  );
  assert.deepEqual(listReplayNoteDocumentAttachmentRefIds(document), ["cap-1"]);
  assert.equal(
    stringifyReplayNoteDocument(createReplayNoteDocumentFromPlainText("One\n\nTwo")),
    '{"schemaVersion":1,"blocks":[{"blockKind":"PARAGRAPH","children":[{"inlineKind":"TEXT","text":"One"}]},{"blockKind":"PARAGRAPH","children":[{"inlineKind":"TEXT","text":"Two"}]}]}',
  );
});
