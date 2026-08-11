// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo } from "react";
import type { SessionSnapshot } from "@/domains/training/types";
import type { ReplayNoteDocumentV1 } from "@zinuto/shared/replayNoteDocument";

export type UseActionDialogHistoryReviewNoteArgs<
  TArchive,
  TDisplayPeriod extends string,
> = {
  actionDialogOpen: boolean;
  barCount: number;
  sessionId: string;
  snapshot: SessionSnapshot | null;
  trainerDisplayPeriod: TDisplayPeriod;
  buildCurrentReplayContext: () => TArchive | null;
  createHistoryReviewReplayNote: (params: {
    trainingProjectId: string;
    contextReplay: TArchive | null;
    contextDisplayPeriod?: TDisplayPeriod;
    contentDocument?: ReplayNoteDocumentV1;
  }) => void;
  setError: (message: string) => void;
  missingContextMessage: string;
};

export const useActionDialogHistoryReviewNote = <
  TArchive,
  TDisplayPeriod extends string,
>({
  actionDialogOpen,
  barCount,
  sessionId,
  snapshot,
  trainerDisplayPeriod,
  buildCurrentReplayContext,
  createHistoryReviewReplayNote,
  setError,
  missingContextMessage,
}: UseActionDialogHistoryReviewNoteArgs<TArchive, TDisplayPeriod>) => {
  const actionDialogHistoryReviewBindingId = useMemo(
    () => (snapshot?.session.id || sessionId || "").trim(),
    [sessionId, snapshot?.session.id],
  );

  const canCreateActionDialogHistoryReviewNote = Boolean(
    actionDialogHistoryReviewBindingId &&
    actionDialogOpen &&
    snapshot &&
    barCount > 0,
  );

  const handleCreateActionDialogHistoryReviewNote = useCallback(() => {
    const contextReplay = buildCurrentReplayContext();
    if (!actionDialogHistoryReviewBindingId || !contextReplay) {
      setError(missingContextMessage);
      return;
    }
    createHistoryReviewReplayNote({
      trainingProjectId: actionDialogHistoryReviewBindingId,
      contextReplay,
      contextDisplayPeriod: trainerDisplayPeriod,
    });
  }, [
    actionDialogHistoryReviewBindingId,
    buildCurrentReplayContext,
    createHistoryReviewReplayNote,
    missingContextMessage,
    setError,
    trainerDisplayPeriod,
  ]);

  return {
    canCreateActionDialogHistoryReviewNote,
    handleCreateActionDialogHistoryReviewNote,
  };
};
