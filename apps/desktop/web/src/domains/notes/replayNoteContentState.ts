// SPDX-License-Identifier: GPL-3.0-only

import {
  deriveReplayNoteDocumentPlainText,
  type ReplayNoteAttachmentV1,
  type ReplayNoteDocumentV1,
} from "@zinuto/shared/replayNoteDocument";
import type { ReplayNoteStructuredMeta } from "@/domains/notes/replayNoteSemanticTypes";

/**
 * Minimal structural view of a replay note required to decide whether the user
 * has actually authored anything. Kept independent from the generic note model
 * so the predicate stays a pure, easily testable function.
 */
export type ReplayNoteContentStateInput = {
  contentDocument: ReplayNoteDocumentV1;
  attachments?: ReplayNoteAttachmentV1[] | null;
  meta?: Pick<ReplayNoteStructuredMeta, "reflectionEntries" | "referenceEntries"> | null;
};

/**
 * Returns true when a replay note holds content the user deliberately created:
 * body text, attachments (drawings/capsules/chart views), filled reflection
 * fields, or linked reference notes.
 *
 * A freshly seeded note starts genuinely empty (the seed document has no
 * placeholder text), so an untouched note returns false. This predicate is the
 * single source of truth that protects authored notes from being discarded when
 * the editor is closed by any means other than the explicit "complete" action.
 */
export const replayNoteHasAuthoredContent = (
  note: ReplayNoteContentStateInput | null | undefined,
): boolean => {
  if (!note) {
    return false;
  }

  const attachments = Array.isArray(note.attachments) ? note.attachments : [];

  const bodyText = deriveReplayNoteDocumentPlainText(
    note.contentDocument,
    attachments,
  ).trim();
  if (bodyText) {
    return true;
  }

  if (attachments.length > 0) {
    return true;
  }

  const reflectionEntries = note.meta?.reflectionEntries;
  if (
    reflectionEntries &&
    Object.values(reflectionEntries).some(
      (entry) => String(entry?.value ?? "").trim().length > 0,
    )
  ) {
    return true;
  }

  const referenceEntries = note.meta?.referenceEntries;
  if (Array.isArray(referenceEntries) && referenceEntries.length > 0) {
    return true;
  }

  return false;
};
