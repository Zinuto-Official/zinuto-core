// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiReplayNoteDetail,
  ApiReplayNoteSummary,
} from "@/api";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type {
  ReplayArchiveLike,
  ReplayBarLike,
  ReplayNoteLike,
  ReplaySnapshotLike,
} from "@/app-shell/replayNoteDomainTypes";
import type {
  ReplayNoteAttachmentV1,
  ReplayNoteDocumentV1,
} from "@zinuto/shared/replayNoteDocument";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

export type UseReplayNoteLifecycleActionsParams<
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>,
> = {
  replayNotes: TReplayNote[];
  replayNotesRef: MutableRefObject<TReplayNote[]>;
  activeTrainingRecordNoteId: string;
  setReplayNotes: Dispatch<SetStateAction<TReplayNote[]>>;
  setSelectedReplayNoteId: Dispatch<SetStateAction<string>>;
  setReplayNotesKeyword: Dispatch<SetStateAction<string>>;
  setActiveTrainingRecordNoteId: Dispatch<SetStateAction<string>>;
  clearReplayNotePendingState: (noteId: string) => void;
  upsertReplayNoteInState: (note: TReplayNote) => void;
  appIsMountedRef: MutableRefObject<boolean>;
  setError: Dispatch<SetStateAction<string>>;
  showNotice: (message: string, title?: string, autoCloseMs?: number) => void;
  tt: (key: AppTextKey) => string;
  language: AppUiLanguage;
  bars: ReplayBarLike[];
  snapshot: ReplaySnapshotLike | null;
  sessionId: string;
  trainerDisplayPeriod: TDisplayPeriod;
  currentTrainingBaseTimeframe: string;
  toReplayNotePreview: (
    document: ReplayNoteDocumentV1,
    attachments?: ReplayNoteAttachmentV1[],
  ) => string;
  mapApiReplayNoteToLocal: (
    note: ApiReplayNoteSummary | ApiReplayNoteDetail,
  ) => TReplayNote;
  buildTrainingRecordContextReplay: () => TArchive | null;
  deriveHistoryReviewMetrics: (archive: TArchive | null) => {
    profitLossRatio: number | null;
    winRate: number | null;
  };
  deriveFastDecisionTitleMetrics: (archive: TArchive | null) => {
    advantageRatio: string | null;
    winRate: number | null;
  };
  deriveRiskDisciplineTitleMetrics: (archive: TArchive | null) => {
    grade: string | null;
    recoveryRate: number | null;
  };
};
