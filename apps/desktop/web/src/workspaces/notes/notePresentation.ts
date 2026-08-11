// SPDX-License-Identifier: GPL-3.0-only

import {
  REPLAY_NOTE_TYPE_LABEL_BY_LANGUAGE,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { ReplayNoteType } from "@/workspaces/notes/useReplayNotes";
import type { ReplayNoteSource } from "@/domains/notes/replayNoteSemantics";

export type ReplayNotePresentationBadgeTone = "accent";

export type ReplayNotePresentationPrimaryBadge = {
  key: string;
  label: string;
  tone: ReplayNotePresentationBadgeTone;
};

export type ReplayNotePresentation = {
  typeLabel: string;
  descriptorLabel: string;
  primaryBadge: ReplayNotePresentationPrimaryBadge;
};

export const buildReplayNotePresentation = (params: {
  language: AppUiLanguage;
  noteType: ReplayNoteType;
  source?: ReplayNoteSource | null;
  contextDisplayPeriod?: string | null;
  t: (key: "common.symbol.middleDot") => string;
}): ReplayNotePresentation => {
  const typeLabel =
    REPLAY_NOTE_TYPE_LABEL_BY_LANGUAGE[params.language]?.[params.noteType] ??
    params.noteType;
  const sourceLabel = String(params.source?.label ?? "").trim();
  const periodLabel = String(params.contextDisplayPeriod ?? "").trim();
  const descriptorLabel = [sourceLabel, periodLabel]
    .filter(Boolean)
    .join(` ${params.t("common.symbol.middleDot")} `);
  return {
    typeLabel,
    descriptorLabel,
    primaryBadge: {
      key: "type",
      label: typeLabel,
      tone: "accent",
    },
  };
};
