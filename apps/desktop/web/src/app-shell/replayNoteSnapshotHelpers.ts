// SPDX-License-Identifier: GPL-3.0-only

import {
  isRetryableBackendTransportError,
} from '@/api';
import {
  isReplaySnapshotNoteType,
  isReplayNoteDetailReady,
} from '@/workspaces/notes/useReplayNotes';
import type {
  ReplayArchiveLike,
  ReplayBarLike,
  ReplayNoteLike,
  ReplayNoteSnapshotHydrationState,
  ReplayNoteSnapshotHydrationStatus,
} from '@/app-shell/replayNoteDomainTypes';

const NOTES_PAGE_REPLAY_NOTE_DETAIL_RETRY_DELAYS_MS = [400, 1200] as const;
export const REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT = 6;

export const normalizeReplayNoteId = (value: string | null | undefined): string =>
  String(value || '').trim();

export const resolveReplayContextPreviewBars = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
>(
  archive: TArchive | null | undefined,
): ReplayBarLike[] => {
  if (!archive) {
    return [];
  }
  if (Array.isArray(archive.bars)) {
    return archive.bars;
  }
  return Array.isArray(archive.previewBars) ? archive.previewBars : [];
};

export const resolveReplayContextLastPreviewBarTs = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
>(
  archive: TArchive | null | undefined,
): string | null => {
  const previewBars = resolveReplayContextPreviewBars(archive);
  return previewBars.length ? previewBars[previewBars.length - 1]?.ts ?? null : null;
};

export const resolveReplayContextOriginalCursorIndex = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
>(
  archive: TArchive | null | undefined,
): number => {
  const cursorIndex = Number(archive?.snapshot?.session?.cursor_index);
  if (!Number.isFinite(cursorIndex)) {
    return Number.NaN;
  }
  const windowStartRawIndex = Number(archive?.barWindow?.startRawIndex);
  return Math.max(
    0,
    Math.floor(cursorIndex) +
      (Number.isFinite(windowStartRawIndex)
        ? Math.max(0, Math.floor(windowStartRawIndex))
        : 0),
  );
};

const appendUniqueReplayNoteId = (
  target: string[],
  noteId: string,
): string[] => {
  const normalizedNoteId = normalizeReplayNoteId(noteId);
  if (!normalizedNoteId || target.includes(normalizedNoteId)) {
    return target;
  }
  target.push(normalizedNoteId);
  return target;
};

export const promoteRecentReplayNoteSnapshotId = (
  recentNoteIds: string[],
  noteId: string,
): string[] => {
  const normalizedNoteId = normalizeReplayNoteId(noteId);
  if (!normalizedNoteId) {
    return recentNoteIds;
  }
  const next = [
    normalizedNoteId,
    ...recentNoteIds.filter((currentId) => currentId !== normalizedNoteId),
  ];
  return next.slice(0, REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT);
};

export const buildRetainedReplayNoteSnapshotIds = ({
  selectedNoteId,
  activeNoteId,
  recentNoteIds,
  limit = REPLAY_NOTE_SNAPSHOT_RECENT_CACHE_LIMIT,
}: {
  selectedNoteId?: string | null;
  activeNoteId?: string | null;
  recentNoteIds?: string[];
  limit?: number;
}): string[] => {
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 0));
  const retained: string[] = [];
  appendUniqueReplayNoteId(retained, selectedNoteId ?? '');
  appendUniqueReplayNoteId(retained, activeNoteId ?? '');
  for (const noteId of recentNoteIds ?? []) {
    appendUniqueReplayNoteId(retained, noteId);
    if (retained.length >= normalizedLimit) {
      break;
    }
  }
  return retained.slice(0, normalizedLimit);
};

export const shouldRetryReplayNoteSnapshotHydration = ({
  error,
  retryCount,
}: {
  error: unknown;
  retryCount: number;
}): boolean => {
  const normalizedRetryCount = Math.max(0, Math.floor(Number(retryCount) || 0));
  return (
    isRetryableBackendTransportError(error) &&
    normalizedRetryCount < NOTES_PAGE_REPLAY_NOTE_DETAIL_RETRY_DELAYS_MS.length
  );
};

export const resolveReplayNoteSnapshotRetryDelayMs = (
  retryCount: number,
): number => {
  const normalizedRetryCount = Math.max(0, Math.floor(Number(retryCount) || 0));
  return NOTES_PAGE_REPLAY_NOTE_DETAIL_RETRY_DELAYS_MS[normalizedRetryCount] ?? 0;
};

export const resolveReplayNoteSnapshotHydrationStatus = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
>(
  note: ReplayNoteLike<TDisplayPeriod, TArchive> | null | undefined,
  hydrationState?: ReplayNoteSnapshotHydrationState | null,
): ReplayNoteSnapshotHydrationStatus => {
  if (!note) {
    return 'idle';
  }
  if (isReplayNoteDetailReady(note)) {
    return 'ready';
  }
  if (hydrationState?.status === 'error') {
    return 'error';
  }
  if (hydrationState?.status === 'ready') {
    return 'ready';
  }
  return 'loading';
};

export const shouldHydrateActiveReplayNoteSnapshot = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
>(
  note: ReplayNoteLike<TDisplayPeriod, TArchive> | null | undefined,
  hydrationState?: ReplayNoteSnapshotHydrationState | null,
): boolean => {
  if (
    !note ||
    !isReplaySnapshotNoteType(note.type) ||
    !note.hasContextReplay ||
    note.contextReplay ||
    note.contextExpiredAt
  ) {
    return false;
  }
  return (
    hydrationState?.status !== 'loading' &&
    hydrationState?.status !== 'error'
  );
};
