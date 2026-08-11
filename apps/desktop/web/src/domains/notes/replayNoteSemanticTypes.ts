// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNoteColorToken } from "@zinuto/shared/replayNoteColors";
import type { ReplayNoteType } from "@zinuto/shared/replayNoteBuilder";

export type ReplayNoteSourceKind =
  | "TRAINING_PROJECT"
  | "SPECIAL_TRAINING_QUESTION"
  | "CUSTOM"
  | "UNKNOWN";

export type ReplayNoteSource = {
  kind: ReplayNoteSourceKind;
  id: string | null;
  label?: string;
};

export type ReplayNoteStructuredMeta = {
  schemaVersion: number;
  templateId: string;
  layout: "DASHBOARD_REPLAY_REFLECTION" | "DOCUMENT_ONLY";
  reflectionSections: Array<{ key: string; required?: boolean }>;
  reflectionEntries?: Record<
    string,
    {
      value: string;
      updatedAt?: string;
    }
  >;
  referenceEntries?: ReplayNoteReferenceEntry[];
};

export type ReplayNoteReferenceSummaryChipTone =
  | "neutral"
  | "positive"
  | "warning"
  | "danger";

export type ReplayNoteReferenceSummaryChip = {
  label: string;
  value: string;
  tone?: ReplayNoteReferenceSummaryChipTone;
};

export type ReplayNoteReferenceEntry = {
  noteId: string;
  title: string;
  type: ReplayNoteType;
  source?: ReplayNoteSource | null;
  colorTokens?: ReplayNoteColorToken[];
  summaryChips?: ReplayNoteReferenceSummaryChip[];
  addedAt?: string;
};
