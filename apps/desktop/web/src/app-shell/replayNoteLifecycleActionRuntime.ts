// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import { api } from '@/api';
import {
  buildReplayNoteDefaultTitle,
  buildReplayNoteSeedContent,
  buildReplayNoteSeedMeta,
  buildReplayNoteSourceForCreate,
} from '@/domains/notes/replayNoteSemantics';
import { replayNoteHasAuthoredContent } from '@/domains/notes/replayNoteContentState';
import {
  normalizeReplayNoteDocument,
  type ReplayNoteDocumentV1,
} from '@zinuto/shared/replayNoteDocument';
import type {
  ReplayArchiveLike,
  ReplayNoteLike,
} from '@/app-shell/replayNoteDomainTypes';
import { resolveReplayContextLastPreviewBarTs, resolveReplayContextOriginalCursorIndex } from '@/app-shell/replayNoteSnapshotHelpers';
import type { UseReplayNoteLifecycleActionsParams } from "@/app-shell/useReplayNoteLifecycleActions.types";
import { useReplaySnapshotNoteLifecycleState } from "@/app-shell/useReplaySnapshotNoteLifecycleState";

export const useReplayNoteLifecycleActions = <
  TDisplayPeriod extends string,
  TArchive extends ReplayArchiveLike<TDisplayPeriod>,
  TReplayNote extends ReplayNoteLike<TDisplayPeriod, TArchive>
>({
  replayNotes,
  replayNotesRef,
  activeTrainingRecordNoteId,
  setReplayNotes,
  setSelectedReplayNoteId,
  setReplayNotesKeyword,
  setActiveTrainingRecordNoteId,
  clearReplayNotePendingState,
  upsertReplayNoteInState,
  appIsMountedRef,
  setError,
  showNotice,
  tt,
  language,
  bars,
  snapshot,
  sessionId,
  trainerDisplayPeriod,
  currentTrainingBaseTimeframe,
  toReplayNotePreview,
  mapApiReplayNoteToLocal,
  buildTrainingRecordContextReplay,
  deriveHistoryReviewMetrics,
  deriveFastDecisionTitleMetrics,
  deriveRiskDisciplineTitleMetrics,
}: UseReplayNoteLifecycleActionsParams<TDisplayPeriod, TArchive, TReplayNote>) => {
  const {
    newlyCreatedReplaySnapshotNoteId,
    cancelledReplaySnapshotNoteIdsRef,
    rememberNewlyCreatedReplaySnapshotNote,
    clearReplaySnapshotNoteCreateState,
    resetReplaySnapshotNoteLifecycleState,
    isActiveTrainingRecordNoteNewlyCreated,
  } = useReplaySnapshotNoteLifecycleState<TDisplayPeriod, TArchive, TReplayNote>(replayNotes);

  const consumeCancelledReplaySnapshotNote = useCallback(
    async (noteId: string): Promise<boolean> => {
      const normalizedId = noteId.trim();
      if (
        !normalizedId ||
        !cancelledReplaySnapshotNoteIdsRef.current.has(normalizedId)
      ) {
        return false;
      }
      cancelledReplaySnapshotNoteIdsRef.current.delete(normalizedId);
      clearReplayNotePendingState(normalizedId);
      try {
        await api.deleteReplayNote(normalizedId);
      } catch (err) {
        if (appIsMountedRef.current) {
          setError(tt('appText.deleteNote'));
        }
      }
      return true;
    },
    [appIsMountedRef, clearReplayNotePendingState, setError, tt]
  );

  const closeActiveTrainingRecordNote = useCallback(() => {
    const activeNoteId = String(activeTrainingRecordNoteId || '').trim();
    if (activeNoteId) {
      resetReplaySnapshotNoteLifecycleState(activeNoteId);
    }
    setActiveTrainingRecordNoteId('');
  }, [
    activeTrainingRecordNoteId,
    resetReplaySnapshotNoteLifecycleState,
    setActiveTrainingRecordNoteId,
  ]);

  const cancelActiveTrainingRecordNote = useCallback(() => {
    const activeNoteId = String(activeTrainingRecordNoteId || '').trim();
    if (!activeNoteId) {
      return;
    }
    const currentNote =
      replayNotesRef.current.find((note) => note.id === activeNoteId) ?? null;
    // Closing a freshly-created note must never destroy authored content. If the
    // user actually wrote into it, archive (keep) the note instead of discarding
    // it — the editor closes via the same cancel path on window close, hide-to-
    // tray, backdrop/Escape and the explicit cancel button, and only a truly
    // empty note should be dropped so the notes list isn't littered with blanks.
    if (replayNoteHasAuthoredContent(currentNote)) {
      resetReplaySnapshotNoteLifecycleState(activeNoteId);
      setActiveTrainingRecordNoteId((current) =>
        current === activeNoteId ? '' : current
      );
      return;
    }
    cancelledReplaySnapshotNoteIdsRef.current.add(activeNoteId);
    clearReplayNotePendingState(activeNoteId);
    clearReplaySnapshotNoteCreateState(activeNoteId);
    setReplayNotes((current) =>
      current.filter((note) => note.id !== activeNoteId)
    );
    setSelectedReplayNoteId((current) =>
      current === activeNoteId ? '' : current
    );
    setActiveTrainingRecordNoteId((current) =>
      current === activeNoteId ? '' : current
    );
    if (!currentNote || currentNote.optimistic === true) {
      return;
    }
    void (async () => {
      try {
        await api.deleteReplayNote(activeNoteId);
      } catch (err) {
        if (!appIsMountedRef.current) {
          return;
        }
        setError(tt('appText.deleteNote'));
      } finally {
        cancelledReplaySnapshotNoteIdsRef.current.delete(activeNoteId);
      }
    })();
  }, [
    activeTrainingRecordNoteId,
    appIsMountedRef,
    clearReplayNotePendingState,
    clearReplaySnapshotNoteCreateState,
    replayNotesRef,
    resetReplaySnapshotNoteLifecycleState,
    setActiveTrainingRecordNoteId,
    setError,
    setReplayNotes,
    setSelectedReplayNoteId,
    tt,
  ]);

  const openReplaySnapshotNoteEditor = useCallback(
    (noteId: string) => {
      if (!noteId) {
        return;
      }
      window.setTimeout(() => {
        if (!appIsMountedRef.current) {
          return;
        }
        setActiveTrainingRecordNoteId(noteId);
      }, 0);
    },
    [appIsMountedRef, setActiveTrainingRecordNoteId]
  );

  const createCustomReplayNote = useCallback(async (): Promise<string | null> => {
    const nowIso = new Date().toISOString();
    const noteId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const seededMeta = buildReplayNoteSeedMeta('CUSTOM');
    const seededSource = buildReplayNoteSourceForCreate({
      noteType: 'CUSTOM'
    });
    const seededContent = buildReplayNoteSeedContent('CUSTOM', language);
    const nextTitle = buildReplayNoteDefaultTitle({
      language,
      noteType: 'CUSTOM',
      createdAt: nowIso
    });

    try {
      const saved = mapApiReplayNoteToLocal(
        await api.createReplayNote({
          id: noteId,
          title: nextTitle,
          type: 'CUSTOM',
          contentDocument: seededContent,
          trainingProjectId: null,
          contextDisplayPeriod: null,
          contextSessionId: null,
          contextCursorIndex: null,
          source: seededSource,
          meta: seededMeta,
          createdAt: nowIso,
          updatedAt: nowIso
        })
      );

      if (!appIsMountedRef.current) {
        return null;
      }

      upsertReplayNoteInState(saved);
      setSelectedReplayNoteId(saved.id);
      setReplayNotesKeyword('');
      return saved.id;
    } catch (err) {
      if (!appIsMountedRef.current) {
        return null;
      }
      setError(tt('appText.createNote'));
      return null;
    }
  }, [
    appIsMountedRef,
    mapApiReplayNoteToLocal,
    language,
    setError,
    setReplayNotesKeyword,
    setSelectedReplayNoteId,
    tt,
    upsertReplayNoteInState
  ]);

  const createTrainingRecordReplayNote = useCallback(() => {
    const hasReplayContext = Boolean(snapshot) && bars.length > 0;
    const currentTrainingProjectId =
      sessionId.trim() ||
      (hasReplayContext && snapshot && typeof snapshot.session.id === 'string' ? snapshot.session.id.trim() : '');
    const currentSessionId =
      hasReplayContext && snapshot && typeof snapshot.session.id === 'string' ? snapshot.session.id.trim() : '';
    const currentCursorIndex =
      hasReplayContext && snapshot ? Math.max(0, Math.floor(Number(snapshot.session.cursor_index) || 0)) : -1;

    const existingNote = hasReplayContext
      ? [...replayNotesRef.current]
          .filter((note) => {
            if (note.type !== 'FREE_REPLAY') {
              return false;
            }
            const noteTrainingProjectId = (note.trainingProjectId || '').trim();
            const noteSessionId = (note.contextSessionId || '').trim();
            const sameBinding =
              (noteTrainingProjectId && currentTrainingProjectId && noteTrainingProjectId === currentTrainingProjectId) ||
              (noteSessionId && currentSessionId && noteSessionId === currentSessionId);
            if (!sameBinding) {
              return false;
            }
            const noteCursorIndex = Number(note.contextCursorIndex);
            return Number.isFinite(noteCursorIndex) && Math.max(0, Math.floor(noteCursorIndex)) === currentCursorIndex;
          })
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
      : null;

    if (existingNote) {
      setSelectedReplayNoteId(existingNote.id);
      setReplayNotesKeyword('');
      setActiveTrainingRecordNoteId(existingNote.id);
      return;
    }

    const contextReplay = hasReplayContext ? buildTrainingRecordContextReplay() : null;
    const nowIso = new Date().toISOString();
    const noteId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const contextSessionId =
      contextReplay && typeof contextReplay.snapshot?.session?.id === 'string'
        ? contextReplay.snapshot.session.id.trim()
        : currentSessionId || null;
    const contextSymbol =
      contextReplay && typeof contextReplay.snapshot?.session?.symbol === 'string'
        ? contextReplay.snapshot.session.symbol.trim()
        : null;
    const contextCursorIndexRaw = contextReplay
      ? resolveReplayContextOriginalCursorIndex(contextReplay)
      : Number.NaN;
    const contextCursorIndex = Number.isFinite(contextCursorIndexRaw)
      ? Math.max(0, Math.floor(contextCursorIndexRaw))
      : currentCursorIndex >= 0
        ? currentCursorIndex
        : null;
    const seededMeta = buildReplayNoteSeedMeta('FREE_REPLAY');
    const seededSource = buildReplayNoteSourceForCreate({
      noteType: 'FREE_REPLAY',
      trainingProjectId: currentTrainingProjectId || null,
      contextSessionId,
      symbol: contextSymbol
    });
    const seededContent = buildReplayNoteSeedContent('FREE_REPLAY', language);
    const nextTitle = buildReplayNoteDefaultTitle({
      language,
      noteType: 'FREE_REPLAY',
      createdAt:
        resolveReplayContextLastPreviewBarTs(contextReplay) ?? nowIso,
      symbol: contextSymbol,
      displayPeriod: contextReplay?.displayPeriod ?? trainerDisplayPeriod,
      baseTimeframe: contextReplay?.baseTimeframe ?? currentTrainingBaseTimeframe
    });
    const optimisticNote = {
      id: noteId,
      title: nextTitle,
      type: 'FREE_REPLAY',
      contentDocument: seededContent,
      contentPreview: '',
      contentLoaded: true,
      optimistic: true,
      trainingProjectId: currentTrainingProjectId || null,
      hasContextReplay: Boolean(contextReplay),
      contextExpiredAt: null,
      contextSessionId,
      contextCursorIndex,
      contextReplay,
      contextDisplayPeriod: contextReplay?.displayPeriod ?? trainerDisplayPeriod,
      colorTokens: [],
      source: seededSource,
      meta: seededMeta,
      createdAt: nowIso,
      updatedAt: nowIso
    } as unknown as TReplayNote;

    rememberNewlyCreatedReplaySnapshotNote(noteId);
    upsertReplayNoteInState(optimisticNote);
    setSelectedReplayNoteId(noteId);
    setReplayNotesKeyword('');
    setActiveTrainingRecordNoteId(noteId);

    void (async () => {
      try {
        const saved = mapApiReplayNoteToLocal(
          await api.createReplayNote({
            id: noteId,
            title: nextTitle,
            type: 'FREE_REPLAY',
            contentDocument: seededContent,
            contextReplay,
            trainingProjectId: currentTrainingProjectId || null,
            contextSessionId,
            contextCursorIndex,
            contextDisplayPeriod: contextReplay?.displayPeriod ?? trainerDisplayPeriod,
            source: seededSource,
            meta: seededMeta,
            createdAt: nowIso,
            updatedAt: nowIso
          })
        );

        if (await consumeCancelledReplaySnapshotNote(saved.id)) {
          return;
        }

        if (!appIsMountedRef.current) {
          return;
        }

        upsertReplayNoteInState(saved);

        const hasAnyReplayContextBinding =
          saved.hasContextReplay ||
          (typeof saved.contextSessionId === 'string' && saved.contextSessionId.trim().length > 0) ||
          Number.isFinite(Number(saved.contextCursorIndex));
        if (!hasAnyReplayContextBinding && !saved.contextReplay) {
          showNotice(tt('appText.trainingRecordNoteCreatedButTrainingDataToo'), tt('appText.notice'), 2800);
        }
      } catch (err) {
        if (cancelledReplaySnapshotNoteIdsRef.current.has(noteId)) {
          cancelledReplaySnapshotNoteIdsRef.current.delete(noteId);
          return;
        }
        if (!appIsMountedRef.current) {
          return;
        }
        clearReplaySnapshotNoteCreateState(noteId);
        setReplayNotes((current) => current.filter((note) => note.id !== noteId));
        setSelectedReplayNoteId((current) => (current === noteId ? '' : current));
        setActiveTrainingRecordNoteId((current) => (current === noteId ? '' : current));
        setError(tt('appText.createTrainingRecordNotes'));
      }
    })();
  }, [
    appIsMountedRef,
    bars.length,
    buildTrainingRecordContextReplay,
    clearReplaySnapshotNoteCreateState,
    consumeCancelledReplaySnapshotNote,
    mapApiReplayNoteToLocal,
    replayNotesRef,
    rememberNewlyCreatedReplaySnapshotNote,
    sessionId,
    setActiveTrainingRecordNoteId,
    setError,
    setReplayNotes,
    setReplayNotesKeyword,
    setSelectedReplayNoteId,
    showNotice,
    snapshot,
    trainerDisplayPeriod,
    language,
    tt,
    upsertReplayNoteInState
  ]);

  const createSnapshotReplayNote = useCallback(
    (params: {
      type: 'FREE_REPLAY' | 'CHALLENGE';
      modeId?: string;
      trainingProjectId: string;
      contextReplay: TArchive | null;
      contextDisplayPeriod?: TDisplayPeriod;
      contentDocument?: ReplayNoteDocumentV1;
    }) => {
      const currentTrainingProjectId = params.trainingProjectId.trim();
      const contextReplay = params.contextReplay;
      const initialContentDocument = normalizeReplayNoteDocument(
        params.contentDocument ?? buildReplayNoteSeedContent(params.type, language),
      );
      if (!currentTrainingProjectId || !contextReplay) {
        setError(tt('appText.createNote'));
        return;
      }

      const currentSessionId =
        typeof contextReplay.snapshot?.session?.id === 'string'
          ? contextReplay.snapshot.session.id.trim()
          : '';
      const contextSymbol =
        typeof contextReplay.snapshot?.session?.symbol === 'string'
          ? contextReplay.snapshot.session.symbol.trim()
          : '';
      const currentCursorIndexRaw =
        resolveReplayContextOriginalCursorIndex(contextReplay);
      const currentCursorIndex = Number.isFinite(currentCursorIndexRaw)
        ? Math.max(0, Math.floor(currentCursorIndexRaw))
        : -1;

      const existingNote = [...replayNotesRef.current]
        .filter((note) => {
          if (note.type !== params.type) {
            return false;
          }
          const noteTrainingProjectId = (note.trainingProjectId || '').trim();
          const noteSessionId = (note.contextSessionId || '').trim();
          const sameBinding =
            (noteTrainingProjectId &&
              currentTrainingProjectId &&
              noteTrainingProjectId === currentTrainingProjectId) ||
            (noteSessionId && currentSessionId && noteSessionId === currentSessionId);
          if (!sameBinding) {
            return false;
          }
          const noteCursorIndex = Number(note.contextCursorIndex);
          return (
            Number.isFinite(noteCursorIndex) &&
            Math.max(0, Math.floor(noteCursorIndex)) === currentCursorIndex
          );
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      const seededMeta = buildReplayNoteSeedMeta(params.type);
      const seededSource = buildReplayNoteSourceForCreate({
        noteType: params.type,
        trainingProjectId: currentTrainingProjectId,
        contextSessionId: currentSessionId || null,
        symbol: contextSymbol || null
      });

      if (existingNote) {
        const nextDisplayPeriod =
          params.contextDisplayPeriod ??
          contextReplay.displayPeriod ??
          trainerDisplayPeriod;
        const nowIso = new Date().toISOString();
        upsertReplayNoteInState({
          ...existingNote,
          trainingProjectId: currentTrainingProjectId,
          contextSessionId: currentSessionId || existingNote.contextSessionId,
          contextCursorIndex:
            currentCursorIndex >= 0
              ? currentCursorIndex
              : existingNote.contextCursorIndex,
          contextReplay,
          contextDisplayPeriod: nextDisplayPeriod,
          colorTokens: Array.isArray(existingNote.colorTokens) ? existingNote.colorTokens : [],
          source: existingNote.source ?? seededSource,
          meta: existingNote.meta ?? seededMeta,
          updatedAt: nowIso
        });
        setSelectedReplayNoteId(existingNote.id);
        setReplayNotesKeyword('');
        openReplaySnapshotNoteEditor(existingNote.id);
        void (async () => {
          try {
            const saved = mapApiReplayNoteToLocal(
              await api.updateReplayNote(existingNote.id, {
                trainingProjectId: currentTrainingProjectId,
                contextDisplayPeriod: nextDisplayPeriod,
                contextReplay,
                contextSessionId: currentSessionId || null,
                contextCursorIndex: currentCursorIndex >= 0 ? currentCursorIndex : null,
                colorTokens: Array.isArray(existingNote.colorTokens) ? existingNote.colorTokens : [],
                source: existingNote.source ?? seededSource,
                meta: existingNote.meta ?? seededMeta
              })
            );
            if (!appIsMountedRef.current) {
              return;
            }
            upsertReplayNoteInState(saved);
            setSelectedReplayNoteId(saved.id);
            setReplayNotesKeyword('');
            openReplaySnapshotNoteEditor(saved.id);
          } catch (err) {
            if (!appIsMountedRef.current) {
              return;
            }
            setError(tt('appText.createNote'));
          }
        })();
        return;
      }

      const nowIso = new Date().toISOString();
      const noteId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const contextSessionId =
        typeof contextReplay.snapshot?.session?.id === 'string'
          ? contextReplay.snapshot.session.id.trim()
          : null;
      const contextCursorIndex = Number.isFinite(currentCursorIndexRaw)
        ? Math.max(0, Math.floor(currentCursorIndexRaw))
        : null;
      const historyMetrics = deriveHistoryReviewMetrics(contextReplay);
      const fastDecisionMetrics = deriveFastDecisionTitleMetrics(contextReplay);
      const riskMetrics = deriveRiskDisciplineTitleMetrics(contextReplay);
      const challengeModeId = String(params.modeId ?? '').trim();
      const isFastDecisionChallenge = challengeModeId === 'fast-decision-training';
      const isRiskDisciplineChallenge = challengeModeId === 'risk-discipline-training';
      const nextTitle = buildReplayNoteDefaultTitle({
        language,
        noteType: params.type,
        createdAt:
          resolveReplayContextLastPreviewBarTs(contextReplay) ?? nowIso,
        symbol: contextSymbol || null,
        displayPeriod:
          params.contextDisplayPeriod ??
          contextReplay.displayPeriod ??
          trainerDisplayPeriod,
        baseTimeframe: contextReplay?.baseTimeframe ?? currentTrainingBaseTimeframe,
        profitLossRatio:
          params.type === 'FREE_REPLAY' ? historyMetrics.profitLossRatio : null,
        winRate:
          params.type === 'FREE_REPLAY'
            ? historyMetrics.winRate
            : isFastDecisionChallenge
              ? fastDecisionMetrics.winRate
              : null,
        advantageRatio:
          isFastDecisionChallenge
            ? fastDecisionMetrics.advantageRatio
            : null,
        grade:
          isRiskDisciplineChallenge ? riskMetrics.grade : null,
        recoveryRate:
          isRiskDisciplineChallenge
            ? riskMetrics.recoveryRate
            : null
      });
      const nextDisplayPeriod =
        params.contextDisplayPeriod ??
        contextReplay.displayPeriod ??
        trainerDisplayPeriod;
      const optimisticNote = {
        id: noteId,
        title: nextTitle,
        type: params.type,
        contentDocument: initialContentDocument,
        contentPreview: toReplayNotePreview(initialContentDocument),
        contentLoaded: true,
        optimistic: true,
        trainingProjectId: currentTrainingProjectId,
        hasContextReplay: true,
        contextExpiredAt: null,
        contextSessionId,
        contextCursorIndex,
        contextReplay,
        contextDisplayPeriod: nextDisplayPeriod,
        colorTokens: [],
        source: seededSource,
        meta: seededMeta,
        createdAt: nowIso,
        updatedAt: nowIso,
      } as unknown as TReplayNote;

      rememberNewlyCreatedReplaySnapshotNote(noteId);
      upsertReplayNoteInState(optimisticNote);
      setSelectedReplayNoteId(noteId);
      setReplayNotesKeyword('');
      openReplaySnapshotNoteEditor(noteId);

      void (async () => {
        try {
          const saved = mapApiReplayNoteToLocal(
            await api.createReplayNote({
              id: noteId,
              title: nextTitle,
              type: params.type,
              contentDocument: initialContentDocument,
              contextReplay,
              trainingProjectId: currentTrainingProjectId,
              contextSessionId,
              contextCursorIndex,
              contextDisplayPeriod: nextDisplayPeriod,
              source: seededSource,
              meta: seededMeta,
              createdAt: nowIso,
              updatedAt: nowIso,
            })
          );

          if (await consumeCancelledReplaySnapshotNote(saved.id)) {
            return;
          }

          if (!appIsMountedRef.current) {
            return;
          }

          upsertReplayNoteInState(saved);
        } catch (err) {
          if (cancelledReplaySnapshotNoteIdsRef.current.has(noteId)) {
            cancelledReplaySnapshotNoteIdsRef.current.delete(noteId);
            return;
          }
          if (!appIsMountedRef.current) {
            return;
          }
          clearReplaySnapshotNoteCreateState(noteId);
          setReplayNotes((current) => current.filter((note) => note.id !== noteId));
          setSelectedReplayNoteId((current) => (current === noteId ? '' : current));
          setActiveTrainingRecordNoteId((current) => (current === noteId ? '' : current));
          setError(tt('appText.createNote'));
        }
      })();
    },
    [
      appIsMountedRef,
      clearReplaySnapshotNoteCreateState,
      consumeCancelledReplaySnapshotNote,
      mapApiReplayNoteToLocal,
      rememberNewlyCreatedReplaySnapshotNote,
      replayNotesRef,
      setActiveTrainingRecordNoteId,
      setError,
      setReplayNotes,
      setReplayNotesKeyword,
      setSelectedReplayNoteId,
      toReplayNotePreview,
      trainerDisplayPeriod,
      language,
      tt,
      upsertReplayNoteInState,
      openReplaySnapshotNoteEditor,
      deriveHistoryReviewMetrics,
      deriveFastDecisionTitleMetrics,
      deriveRiskDisciplineTitleMetrics,
      currentTrainingBaseTimeframe,
    ]
  );

  const createHistoryReviewReplayNote = useCallback(
    (params: {
      trainingProjectId: string;
      contextReplay: TArchive | null;
      contextDisplayPeriod?: TDisplayPeriod;
      contentDocument?: ReplayNoteDocumentV1;
    }) => {
      createSnapshotReplayNote({
        ...params,
        type: 'FREE_REPLAY',
      });
    },
    [createSnapshotReplayNote]
  );

  const createChallengeReviewReplayNote = useCallback(
    (params: {
      modeId: string;
      trainingProjectId: string;
      contextReplay: TArchive | null;
      contextDisplayPeriod?: TDisplayPeriod;
      contentDocument?: ReplayNoteDocumentV1;
    }) => {
      createSnapshotReplayNote({
        trainingProjectId: params.trainingProjectId,
        contextReplay: params.contextReplay,
        contextDisplayPeriod: params.contextDisplayPeriod,
        contentDocument: params.contentDocument,
        type: 'CHALLENGE',
        modeId: params.modeId,
      });
    },
    [createSnapshotReplayNote]
  );

  return {
    newlyCreatedReplaySnapshotNoteId,
    isActiveTrainingRecordNoteNewlyCreated,
    resetReplaySnapshotNoteLifecycleState,
    closeActiveTrainingRecordNote,
    cancelActiveTrainingRecordNote,
    createCustomReplayNote,
    createTrainingRecordReplayNote,
    createSnapshotReplayNote,
    createHistoryReviewReplayNote,
    createChallengeReviewReplayNote,
  };
};
