// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ReplayArchiveLike,
  ReplayNoteLike,
} from "@/app-shell/replayNoteDomainTypes";

export const useReplaySnapshotNoteLifecycleState = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>,
>(
  replayNotes: TReplayNote[],
) => {
  const [newlyCreatedReplaySnapshotNoteId, setNewlyCreatedReplaySnapshotNoteId] = useState("");
  const cancelledReplaySnapshotNoteIdsRef = useRef<Set<string>>(new Set());

  const rememberNewlyCreatedReplaySnapshotNote = useCallback((noteId: string) => {
    const normalizedId = noteId.trim();
    if (!normalizedId) {
      return;
    }
    cancelledReplaySnapshotNoteIdsRef.current.delete(normalizedId);
    setNewlyCreatedReplaySnapshotNoteId(normalizedId);
  }, []);

  const clearReplaySnapshotNoteCreateState = useCallback((noteId?: string | null) => {
    const normalizedId = typeof noteId === "string" ? noteId.trim() : "";
    if (normalizedId) {
      setNewlyCreatedReplaySnapshotNoteId((current) =>
        current === normalizedId ? "" : current,
      );
      return;
    }
    setNewlyCreatedReplaySnapshotNoteId("");
  }, []);

  const resetReplaySnapshotNoteLifecycleState = useCallback((noteId?: string | null) => {
    const normalizedId = typeof noteId === "string" ? noteId.trim() : "";
    if (normalizedId) {
      cancelledReplaySnapshotNoteIdsRef.current.delete(normalizedId);
      clearReplaySnapshotNoteCreateState(normalizedId);
      return;
    }
    cancelledReplaySnapshotNoteIdsRef.current.clear();
    clearReplaySnapshotNoteCreateState("");
  }, [clearReplaySnapshotNoteCreateState]);

  const isActiveTrainingRecordNoteNewlyCreated = useCallback(
    (activeNote: TReplayNote | null) => {
      const activeNoteId = activeNote?.id ?? "";
      if (!activeNoteId) {
        return false;
      }
      return (
        activeNoteId === newlyCreatedReplaySnapshotNoteId ||
        activeNote?.optimistic === true
      );
    },
    [newlyCreatedReplaySnapshotNoteId],
  );

  useEffect(() => {
    if (!newlyCreatedReplaySnapshotNoteId) {
      return;
    }
    const stillExists = replayNotes.some(
      (note) => note.id === newlyCreatedReplaySnapshotNoteId,
    );
    if (stillExists) {
      return;
    }
    clearReplaySnapshotNoteCreateState(newlyCreatedReplaySnapshotNoteId);
  }, [
    clearReplaySnapshotNoteCreateState,
    newlyCreatedReplaySnapshotNoteId,
    replayNotes,
  ]);

  return {
    newlyCreatedReplaySnapshotNoteId,
    cancelledReplaySnapshotNoteIdsRef,
    rememberNewlyCreatedReplaySnapshotNote,
    clearReplaySnapshotNoteCreateState,
    resetReplaySnapshotNoteLifecycleState,
    isActiveTrainingRecordNoteNewlyCreated,
  };
};
