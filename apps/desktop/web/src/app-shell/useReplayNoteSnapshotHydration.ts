// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  isReplayNoteDetailReady,
  type ReplayNoteDetailRequestResult,
} from '@/workspaces/notes/useReplayNotes';
import { isReplaySnapshotNoteType } from '@/workspaces/notes/useReplayNotes';
import type {
  ReplayArchiveLike,
  ReplayNoteLike,
  ReplayNoteSnapshotHydrationState,
} from '@/app-shell/replayNoteDomainTypes';
import {
  normalizeReplayNoteId,
  promoteRecentReplayNoteSnapshotId,
  buildRetainedReplayNoteSnapshotIds,
  shouldRetryReplayNoteSnapshotHydration,
  resolveReplayNoteSnapshotRetryDelayMs,
  shouldHydrateActiveReplayNoteSnapshot,
  REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT,
} from '@/app-shell/replayNoteSnapshotHelpers';

type UseReplayNoteSnapshotHydrationParams<
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
> = {
  replayNotes: TReplayNote[];
  replayNotesRef: MutableRefObject<TReplayNote[]>;
  selectedReplayNote: TReplayNote | null;
  isNotesPageActive: boolean;
  activeTrainingRecordNoteId: string;
  setReplayNotes: React.Dispatch<React.SetStateAction<TReplayNote[]>>;
  ensureReplayNoteDetail: (
    noteId: string,
  ) => Promise<ReplayNoteDetailRequestResult<TReplayNote>>;
  appIsMountedRef: MutableRefObject<boolean>;
};

export const useReplayNoteSnapshotHydration = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
>({
  replayNotes,
  replayNotesRef,
  selectedReplayNote,
  isNotesPageActive,
  activeTrainingRecordNoteId,
  setReplayNotes,
  ensureReplayNoteDetail,
  appIsMountedRef,
}: UseReplayNoteSnapshotHydrationParams<TDisplayPeriod, TArchive, TReplayNote>) => {
  const [
    replayNoteSnapshotHydrationStateById,
    setReplayNoteSnapshotHydrationStateById,
  ] = useState<Record<string, ReplayNoteSnapshotHydrationState>>({});
  const [recentReplaySnapshotNoteIds, setRecentReplaySnapshotNoteIds] = useState<
    string[]
  >([]);
  const replayNoteSnapshotRetryTimerRef = useRef<Map<string, number>>(new Map());

  const clearReplayNoteSnapshotRetryTimer = useCallback((noteId: string) => {
    const normalizedId = String(noteId || '').trim();
    if (!normalizedId) {
      return;
    }
    const timerId = replayNoteSnapshotRetryTimerRef.current.get(normalizedId);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }
    replayNoteSnapshotRetryTimerRef.current.delete(normalizedId);
  }, []);

  const clearAllReplayNoteSnapshotRetryTimers = useCallback(() => {
    replayNoteSnapshotRetryTimerRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    replayNoteSnapshotRetryTimerRef.current.clear();
  }, []);

  useEffect(
    () => () => {
      clearAllReplayNoteSnapshotRetryTimers();
    },
    [clearAllReplayNoteSnapshotRetryTimers],
  );

  const selectedReplayNoteId = String(selectedReplayNote?.id ?? '').trim();
  const selectedReplaySnapshotNoteId =
    selectedReplayNote && isReplaySnapshotNoteType(selectedReplayNote.type)
      ? selectedReplayNoteId
      : '';
  const activeReplaySnapshotNoteId = normalizeReplayNoteId(activeTrainingRecordNoteId);
  const selectedReplayNoteHasContextReplay = Boolean(
    selectedReplayNote?.hasContextReplay,
  );
  const selectedReplayNoteHasContextPayload = Boolean(
    selectedReplayNote?.contextReplay,
  );
  const selectedReplayNoteContextExpiredAt =
    selectedReplayNote?.contextExpiredAt ?? null;
  const selectedReplayNoteContentLoaded = Boolean(
    selectedReplayNote?.contentLoaded,
  );
  const selectedReplayNoteIsReady =
    selectedReplayNoteContentLoaded &&
    (!selectedReplayNoteHasContextReplay ||
      selectedReplayNoteHasContextPayload ||
      Boolean(selectedReplayNoteContextExpiredAt));

  const updateReplayNoteSnapshotHydrationState = useCallback(
    (
      noteId: string,
      resolveNextState: (
        currentState: ReplayNoteSnapshotHydrationState | undefined
      ) => ReplayNoteSnapshotHydrationState,
    ) => {
      const normalizedId = normalizeReplayNoteId(noteId);
      if (!normalizedId) {
        return;
      }
      setReplayNoteSnapshotHydrationStateById((current) => {
        const currentState = current[normalizedId];
        const nextState = resolveNextState(currentState);
        if (
          currentState &&
          currentState.status === nextState.status &&
          currentState.retryCount === nextState.retryCount
        ) {
          return current;
        }
        return {
          ...current,
          [normalizedId]: nextState,
        };
      });
    },
    [],
  );

  const hydrateReplayNoteSnapshotDetail = useCallback(
    async (noteId: string, retryCount = 0): Promise<void> => {
      const normalizedId = String(noteId || '').trim();
      if (!normalizedId) {
        return;
      }
      const currentNote =
        replayNotesRef.current.find((item) => item.id === normalizedId) ?? null;
      if (!currentNote) {
        return;
      }
      if (isReplayNoteDetailReady(currentNote)) {
        clearReplayNoteSnapshotRetryTimer(normalizedId);
        updateReplayNoteSnapshotHydrationState(normalizedId, () => ({
          status: 'ready',
          retryCount,
        }));
        return;
      }
      clearReplayNoteSnapshotRetryTimer(normalizedId);
      updateReplayNoteSnapshotHydrationState(normalizedId, () => ({
        status: 'loading',
        retryCount,
      }));
      const result = await ensureReplayNoteDetail(normalizedId);
      if (!appIsMountedRef.current) {
        return;
      }
      if (result.status === 'aborted') {
        return;
      }
      if (result.status === 'loaded') {
        updateReplayNoteSnapshotHydrationState(normalizedId, () => ({
          status: isReplayNoteDetailReady(result.note) ? 'ready' : 'error',
          retryCount,
        }));
        return;
      }
      const shouldRetryHydration =
        (isNotesPageActive && selectedReplayNoteId === normalizedId) ||
        activeReplaySnapshotNoteId === normalizedId;
      if (
        shouldRetryHydration &&
        shouldRetryReplayNoteSnapshotHydration({
          error: result.error,
          retryCount,
        })
      ) {
        const retryDelayMs = resolveReplayNoteSnapshotRetryDelayMs(retryCount);
        const timerId = window.setTimeout(() => {
          replayNoteSnapshotRetryTimerRef.current.delete(normalizedId);
          void hydrateReplayNoteSnapshotDetail(normalizedId, retryCount + 1);
        }, retryDelayMs);
        replayNoteSnapshotRetryTimerRef.current.set(normalizedId, timerId);
        return;
      }
      updateReplayNoteSnapshotHydrationState(normalizedId, () => ({
        status: 'error',
        retryCount,
      }));
    },
    [
      appIsMountedRef,
      activeReplaySnapshotNoteId,
      clearReplayNoteSnapshotRetryTimer,
      ensureReplayNoteDetail,
      isNotesPageActive,
      replayNotesRef,
      selectedReplayNoteId,
      updateReplayNoteSnapshotHydrationState,
    ],
  );

  const retryReplayNoteSnapshotDetail = useCallback(
    (noteId: string) => {
      const normalizedId = String(noteId || '').trim();
      if (!normalizedId) {
        return;
      }
      clearReplayNoteSnapshotRetryTimer(normalizedId);
      updateReplayNoteSnapshotHydrationState(normalizedId, () => ({
        status: 'idle',
        retryCount: 0,
      }));
      void hydrateReplayNoteSnapshotDetail(normalizedId, 0);
    },
    [
      clearReplayNoteSnapshotRetryTimer,
      hydrateReplayNoteSnapshotDetail,
      updateReplayNoteSnapshotHydrationState,
    ],
  );

  useEffect(() => {
    if (!isNotesPageActive || !selectedReplayNoteId) {
      return;
    }
    if (selectedReplayNoteIsReady) {
      clearReplayNoteSnapshotRetryTimer(selectedReplayNoteId);
      updateReplayNoteSnapshotHydrationState(selectedReplayNoteId, (current) => ({
        status: 'ready',
        retryCount: current?.retryCount ?? 0,
      }));
      return;
    }
    const needsContextReplay =
      selectedReplayNoteHasContextReplay &&
      !selectedReplayNoteHasContextPayload &&
      !selectedReplayNoteContextExpiredAt;
    const needsContent = !selectedReplayNoteContentLoaded;
    if (!needsContextReplay && !needsContent) {
      return;
    }
    if (
      replayNoteSnapshotHydrationStateById[selectedReplayNoteId]?.status ===
      'loading'
    ) {
      return;
    }
    void hydrateReplayNoteSnapshotDetail(selectedReplayNoteId, 0);
  }, [
    clearReplayNoteSnapshotRetryTimer,
    hydrateReplayNoteSnapshotDetail,
    isNotesPageActive,
    replayNoteSnapshotHydrationStateById,
    selectedReplayNoteContentLoaded,
    selectedReplayNoteContextExpiredAt,
    selectedReplayNoteHasContextPayload,
    selectedReplayNoteHasContextReplay,
    selectedReplayNoteId,
    selectedReplayNoteIsReady,
    updateReplayNoteSnapshotHydrationState,
  ]);

  const activeTrainingRecordNote = useMemo(
    () =>
      replayNotes.find(
        (note) =>
          note.id === activeTrainingRecordNoteId &&
          isReplaySnapshotNoteType(note.type)
      ) ?? null,
    [activeTrainingRecordNoteId, replayNotes]
  );

  const activeTrainingRecordNoteSnapshotHydrationState = activeTrainingRecordNote
    ? replayNoteSnapshotHydrationStateById[activeTrainingRecordNote.id]
    : undefined;

  useEffect(() => {
    if (
      !activeTrainingRecordNote ||
      !shouldHydrateActiveReplayNoteSnapshot(
        activeTrainingRecordNote,
        activeTrainingRecordNoteSnapshotHydrationState,
      )
    ) {
      return;
    }
    void hydrateReplayNoteSnapshotDetail(activeTrainingRecordNote.id, 0);
  }, [
    activeTrainingRecordNote,
    activeTrainingRecordNoteSnapshotHydrationState,
    hydrateReplayNoteSnapshotDetail,
  ]);

  useEffect(() => {
    if (!selectedReplaySnapshotNoteId) {
      return;
    }
    setRecentReplaySnapshotNoteIds((current) =>
      promoteRecentReplayNoteSnapshotId(current, selectedReplaySnapshotNoteId),
    );
  }, [selectedReplaySnapshotNoteId]);

  useEffect(() => {
    if (!activeReplaySnapshotNoteId) {
      return;
    }
    setRecentReplaySnapshotNoteIds((current) =>
      promoteRecentReplayNoteSnapshotId(current, activeReplaySnapshotNoteId),
    );
  }, [activeReplaySnapshotNoteId]);

  useEffect(() => {
    const snapshotNoteIdSet = new Set(
      replayNotes
        .filter((note) => isReplaySnapshotNoteType(note.type))
        .map((note) => note.id),
    );
    setRecentReplaySnapshotNoteIds((current) => {
      const filtered = current.filter((noteId) => snapshotNoteIdSet.has(noteId));
      if (
        filtered.length === current.length &&
        filtered.every((noteId, index) => noteId === current[index])
      ) {
        return current;
      }
      return filtered.slice(0, REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT);
    });
  }, [replayNotes]);

  const retainedReplayNoteSnapshotIds = useMemo(
    () =>
      buildRetainedReplayNoteSnapshotIds({
        selectedNoteId: selectedReplayNoteId,
        activeNoteId: activeReplaySnapshotNoteId,
        recentNoteIds: recentReplaySnapshotNoteIds,
      }),
    [
      activeReplaySnapshotNoteId,
      recentReplaySnapshotNoteIds,
      selectedReplayNoteId,
    ],
  );
  const retainedReplayNoteSnapshotIdSet = useMemo(
    () => new Set(retainedReplayNoteSnapshotIds),
    [retainedReplayNoteSnapshotIds],
  );

  useEffect(() => {
    setReplayNoteSnapshotHydrationStateById((current) => {
      const nextEntries = Object.entries(current).filter(([noteId]) =>
        retainedReplayNoteSnapshotIdSet.has(noteId),
      );
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(nextEntries);
    });
    replayNoteSnapshotRetryTimerRef.current.forEach((_timerId, noteId) => {
      if (!retainedReplayNoteSnapshotIdSet.has(noteId)) {
        clearReplayNoteSnapshotRetryTimer(noteId);
      }
    });
  }, [
    clearReplayNoteSnapshotRetryTimer,
    retainedReplayNoteSnapshotIdSet,
  ]);

  useEffect(() => {
    setReplayNotes((current) => {
      let changed = false;
      const next = current.map((note) => {
        if (
          !note.contextReplay ||
          !isReplaySnapshotNoteType(note.type) ||
          retainedReplayNoteSnapshotIdSet.has(note.id)
        ) {
          return note;
        }
        changed = true;
        return {
          ...note,
          contextReplay: null
        };
      });
      return changed ? next : current;
    });
  }, [retainedReplayNoteSnapshotIdSet, setReplayNotes]);

  return {
    activeTrainingRecordNote,
    replayNoteSnapshotHydrationStateById,
    retryReplayNoteSnapshotDetail,
    retainedReplayNoteSnapshotIdSet,
  };
};
