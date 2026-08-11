// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNoteColorToken } from "@zinuto/shared/replayNoteColors";
import type {
  ReplayNoteAttachmentV1,
  ReplayNoteDocumentV1,
} from "@zinuto/shared/replayNoteDocument";
import type { ReplayNoteType } from "@zinuto/shared/replayNoteBuilder";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ArchivedReplayData } from "@/domains/history/replayArchiveTypes";
import type {
  ReplayNoteSource,
  ReplayNoteStructuredMeta,
} from "@/domains/notes/replayNoteSemanticTypes";

export type ReplayNoteModel<
  TContextReplay = unknown,
  TDisplayPeriod extends string = string,
> = {
  id: string;
  title: string;
  type: ReplayNoteType;
  contentDocument: ReplayNoteDocumentV1;
  contentPreview?: string;
  contentLoaded: boolean;
  trainingProjectId: string | null;
  hasContextReplay: boolean;
  contextExpiredAt: string | null;
  contextSessionId: string | null;
  contextCursorIndex: number | null;
  contextReplay: TContextReplay | null;
  contextDisplayPeriod?: TDisplayPeriod;
  colorTokens?: ReplayNoteColorToken[];
  attachments?: ReplayNoteAttachmentV1[];
  source?: ReplayNoteSource | null;
  meta?: ReplayNoteStructuredMeta | null;
  optimistic?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReplayNote = ReplayNoteModel<ArchivedReplayData, DisplayPeriodKey>;

export type ReplayNoteDetailRequestResult<TReplayNote> =
  | {
      status: "loaded";
      note: TReplayNote;
    }
  | {
      status: "aborted";
      note: TReplayNote | null;
      error?: unknown;
    }
  | {
      status: "failed";
      note: TReplayNote | null;
      error: unknown;
    };

export const isReplayNoteDetailReady = <
  TContextReplay = unknown,
  TDisplayPeriod extends string = string,
>(
  note: ReplayNoteModel<TContextReplay, TDisplayPeriod> | null | undefined,
): note is ReplayNoteModel<TContextReplay, TDisplayPeriod> =>
  Boolean(
    note &&
      note.contentLoaded &&
      (!note.hasContextReplay || note.contextReplay || note.contextExpiredAt),
  );
