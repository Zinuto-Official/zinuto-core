// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  normalizeReplayNoteDocument,
  normalizeReplayNoteAttachments,
  type ReplayNoteAttachmentV1,
  type ReplayNoteDocumentV1,
} from '@zinuto/shared/replayNoteDocument';
import type { ReplayNoteColorToken } from '@zinuto/shared/replayNoteColors';
import type {
  ReplayArchiveLike,
  ReplayNoteLike,
  ReplayNoteStructuredMeta,
  PatchPayload,
} from '@/app-shell/replayNoteDomainTypes';

type UseReplayNoteFieldActionsParams<
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
> = {
  setReplayNotes: Dispatch<SetStateAction<TReplayNote[]>>;
  scheduleReplayNotePatch: (noteId: string, patch: PatchPayload<TDisplayPeriod>, debounceMs?: number) => void;
  flushReplayNotePatch: (noteId: string, patch: PatchPayload<TDisplayPeriod>) => Promise<TReplayNote | null>;
  toReplayNotePreview: (
    document: ReplayNoteDocumentV1,
    attachments?: ReplayNoteAttachmentV1[],
  ) => string;
  fallbackReplayNoteTitle: string;
  replayNotesRef: React.MutableRefObject<TReplayNote[]>;
};

export const useReplayNoteFieldActions = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
>({
  setReplayNotes,
  scheduleReplayNotePatch,
  flushReplayNotePatch,
  toReplayNotePreview,
  fallbackReplayNoteTitle,
  replayNotesRef,
}: UseReplayNoteFieldActionsParams<TDisplayPeriod, TArchive, TReplayNote>) => {
  const updateReplayNoteContextDisplayPeriod = useCallback(
    (noteId: string, period: TDisplayPeriod) => {
      setReplayNotes((current) => {
        let changed = false;
        const nowIso = new Date().toISOString();
        const next = current.map((note) => {
          if (note.id !== noteId || note.contextDisplayPeriod === period) {
            return note;
          }
          changed = true;
          return {
            ...note,
            contextDisplayPeriod: period,
            updatedAt: nowIso
          };
        });
        if (changed) {
          scheduleReplayNotePatch(noteId, { contextDisplayPeriod: period }, 120);
        }
        return changed ? next : current;
      });
    },
    [scheduleReplayNotePatch, setReplayNotes]
  );

  const updateReplayNoteTitle = useCallback(
    (noteId: string, title: string) => {
      setReplayNotes((current) => {
        let changed = false;
        const next = current.map((note) => {
          if (note.id !== noteId || note.title === title) {
            return note;
          }
          changed = true;
          return {
            ...note,
            title,
            updatedAt: new Date().toISOString()
          };
        });
        if (changed) {
          scheduleReplayNotePatch(noteId, { title });
        }
        return changed ? next : current;
      });
    },
    [scheduleReplayNotePatch, setReplayNotes]
  );

  const commitReplayNoteTitle = useCallback(
    (noteId: string, title?: string) => {
      const normalizedNoteId = String(noteId || '').trim();
      if (!normalizedNoteId) {
        return;
      }
      const currentTitle =
        typeof title === 'string'
          ? title
          : (replayNotesRef.current.find((note) => note.id === normalizedNoteId)
              ?.title ?? '');
      const normalizedTitle =
        currentTitle.trim() || fallbackReplayNoteTitle;
      setReplayNotes((current) => {
        let changed = false;
        const nowIso = new Date().toISOString();
        const next = current.map((note) => {
          if (note.id !== normalizedNoteId) {
            return note;
          }
          if (normalizedTitle === note.title) {
            return note;
          }
          changed = true;
          return {
            ...note,
            title: normalizedTitle,
            updatedAt: nowIso
          };
        });
        return changed ? next : current;
      });
      void flushReplayNotePatch(normalizedNoteId, { title: normalizedTitle });
    },
    [
      fallbackReplayNoteTitle,
      flushReplayNotePatch,
      replayNotesRef,
      setReplayNotes
    ]
  );

  const updateReplayNoteContent = useCallback(
    (noteId: string, document: ReplayNoteDocumentV1, attachments?: ReplayNoteAttachmentV1[]) => {
      const normalizedDocument = normalizeReplayNoteDocument(document);
      const normalizedAttachments = normalizeReplayNoteAttachments(attachments);
      setReplayNotes((current) => {
        let changed = false;
        const next = current.map((note) => {
          if (note.id !== noteId) {
            return note;
          }
          if (
            JSON.stringify(note.contentDocument) === JSON.stringify(normalizedDocument) &&
            JSON.stringify(note.attachments ?? []) === JSON.stringify(normalizedAttachments)
          ) {
            return note;
          }
          changed = true;
          return {
            ...note,
            contentDocument: normalizedDocument,
            attachments: normalizedAttachments,
            contentPreview: toReplayNotePreview(normalizedDocument, normalizedAttachments),
            contentLoaded: true
          };
        });
        if (changed) {
          scheduleReplayNotePatch(noteId, {
            contentDocument: normalizedDocument,
            attachments: normalizedAttachments,
          });
        }
        return changed ? next : current;
      });
    },
    [scheduleReplayNotePatch, setReplayNotes, toReplayNotePreview]
  );

  const updateReplayNoteColorTokens = useCallback(
    (noteId: string, colorTokens: ReplayNoteColorToken[]) => {
      setReplayNotes((current) => {
        let changed = false;
        const nowIso = new Date().toISOString();
        const next = current.map((note) => {
          if (note.id !== noteId) {
            return note;
          }
          const currentSerialized = JSON.stringify(note.colorTokens ?? []);
          const nextSerialized = JSON.stringify(colorTokens ?? []);
          if (currentSerialized === nextSerialized) {
            return note;
          }
          changed = true;
          return {
            ...note,
            colorTokens,
            updatedAt: nowIso
          };
        });
        if (changed) {
          scheduleReplayNotePatch(noteId, { colorTokens }, 120);
        }
        return changed ? next : current;
      });
    },
    [scheduleReplayNotePatch, setReplayNotes]
  );

  const updateReplayNoteMeta = useCallback(
    (noteId: string, meta: ReplayNoteStructuredMeta | null) => {
      setReplayNotes((current) => {
        let changed = false;
        const nowIso = new Date().toISOString();
        const next = current.map((note) => {
          if (note.id !== noteId) {
            return note;
          }
          const currentSerialized = JSON.stringify(note.meta ?? null);
          const nextSerialized = JSON.stringify(meta ?? null);
          if (currentSerialized === nextSerialized) {
            return note;
          }
          changed = true;
          return {
            ...note,
            meta,
            updatedAt: nowIso
          };
        });
        if (changed) {
          scheduleReplayNotePatch(noteId, { meta }, 120);
        }
        return changed ? next : current;
      });
    },
    [scheduleReplayNotePatch, setReplayNotes]
  );

  return {
    updateReplayNoteContextDisplayPeriod,
    updateReplayNoteTitle,
    commitReplayNoteTitle,
    updateReplayNoteContent,
    updateReplayNoteColorTokens,
    updateReplayNoteMeta,
  };
};
