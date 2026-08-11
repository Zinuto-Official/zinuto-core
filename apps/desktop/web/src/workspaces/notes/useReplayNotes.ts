// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type ApiReplayNoteDetail,
  type ApiReplayNoteSummary,
} from '@/api';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import type {
  ReplayNoteDetailRequestResult,
  ReplayNoteModel,
} from "@/domains/notes/replayNoteModel";
import { isReplayNoteDetailReady } from "@/domains/notes/replayNoteModel";
import { mergeReplayNotesByServerOrder } from "@/domains/notes/replayNoteCollection";
import type {
  ReplayNoteType,
  SpecialTrainingReplayNoteType,
} from '@/workspaces/notes/replayNoteTypes';

export type {
  ReplayNoteType,
  SpecialTrainingReplayNoteType,
} from '@/workspaces/notes/replayNoteTypes';
export type {
  ReplayNoteDetailRequestResult,
  ReplayNoteModel,
} from "@/domains/notes/replayNoteModel";
export { isReplayNoteDetailReady } from "@/domains/notes/replayNoteModel";

export const isReplaySnapshotNoteType = (
  value: unknown
): value is Extract<ReplayNoteType, 'FREE_REPLAY' | 'CHALLENGE'> =>
  value === 'FREE_REPLAY' || value === 'CHALLENGE';

export const isSpecialTrainingReplayNoteType = (
  value: unknown
): value is SpecialTrainingReplayNoteType =>
  value === 'CHALLENGE';

export const resolveSpecialTrainingReplayNoteType = (
  modeId: string
): SpecialTrainingReplayNoteType | null =>
  String(modeId || '').trim() ? 'CHALLENGE' : null;

type ReplayNotePatch<TContextReplay = unknown, TDisplayPeriod extends string = string> = Partial<
  Pick<
    ReplayNoteModel<TContextReplay, TDisplayPeriod>,
    | 'title'
    | 'contentDocument'
    | 'attachments'
    | 'trainingProjectId'
    | 'contextDisplayPeriod'
    | 'colorTokens'
    | 'source'
    | 'meta'
  >
>;


type UseReplayNotesOptions<TContextReplay, TDisplayPeriod extends string> = {
  pageSize: number;
  mapApiReplayNoteToLocal: (
    note: ApiReplayNoteSummary | ApiReplayNoteDetail
  ) => ReplayNoteModel<TContextReplay, TDisplayPeriod>;
  onError: (message: string) => void;
};

const mergeReplayNoteModel = <
  TContextReplay,
  TDisplayPeriod extends string,
>(
  existing: ReplayNoteModel<TContextReplay, TDisplayPeriod> | undefined,
  note: ReplayNoteModel<TContextReplay, TDisplayPeriod>,
): ReplayNoteModel<TContextReplay, TDisplayPeriod> => ({
  ...existing,
  ...note,
  optimistic: note.optimistic ?? false,
  contentDocument: note.contentLoaded
    ? note.contentDocument
    : existing?.contentDocument ?? note.contentDocument,
  contentLoaded: Boolean(existing?.contentLoaded || note.contentLoaded),
  contentPreview: note.contentPreview ?? existing?.contentPreview,
  contextReplay: note.contextReplay ?? existing?.contextReplay ?? null,
  contextExpiredAt:
    note.contextExpiredAt ?? existing?.contextExpiredAt ?? null,
  colorTokens: Array.isArray(note.colorTokens)
    ? note.colorTokens
    : Array.isArray(existing?.colorTokens)
      ? existing.colorTokens
      : [],
  attachments: Array.isArray(note.attachments)
    ? note.attachments
    : Array.isArray(existing?.attachments)
      ? existing.attachments
      : [],
  source: note.source !== undefined ? note.source : existing?.source ?? null,
  meta: note.meta !== undefined ? note.meta : existing?.meta ?? null,
});

export const useReplayNotes = <TContextReplay, TDisplayPeriod extends string = string>({
  pageSize,
  mapApiReplayNoteToLocal,
  onError
}: UseReplayNotesOptions<TContextReplay, TDisplayPeriod>) => {
  const [replayNotes, setReplayNotes] = useState<Array<ReplayNoteModel<TContextReplay, TDisplayPeriod>>>([]);
  const [isReplayNotesLoading, setIsReplayNotesLoading] = useState(false);
  const [isReplayNotesLoadingMore, setIsReplayNotesLoadingMore] = useState(false);
  const [hasReplayNotesHydrated, setHasReplayNotesHydrated] = useState(false);
  const [replayNotesNextCursor, setReplayNotesNextCursor] = useState<string | null>(null);
  const [replayNotesTotal, setReplayNotesTotal] = useState(0);

  const replayNotesRef = useRef<Array<ReplayNoteModel<TContextReplay, TDisplayPeriod>>>([]);
  const replayNoteDetailPromiseRef = useRef<
    Map<
      string,
      Promise<
        ReplayNoteDetailRequestResult<
          ReplayNoteModel<TContextReplay, TDisplayPeriod>
        >
      >
    >
  >(new Map());
  const replayNoteDetailAbortControllerRef = useRef<Map<string, AbortController>>(new Map());
  const replayNotePendingPatchRef = useRef<Map<string, ReplayNotePatch<TContextReplay, TDisplayPeriod>>>(new Map());
  const replayNoteSaveTimerRef = useRef<Map<string, number>>(new Map());
  const replayNotePatchTaskRef = useRef<Map<string, Promise<void>>>(new Map());
  const replayNotePatchRequestIdRef = useRef<Map<string, number>>(new Map());
  const replayNotePatchVersionRef = useRef<Map<string, number>>(new Map());
  const replayNotePatchGlobalVersionRef = useRef(0);
  const replayNotesPageAbortControllerRef = useRef<AbortController | null>(null);
  const replayNotesPageRequestVersionRef = useRef(0);
  const isMountedRef = useRef(true);

  const clearAllReplayNotePendingState = useCallback(() => {
    replayNotesPageRequestVersionRef.current += 1;
    replayNotesPageAbortControllerRef.current?.abort();
    replayNotesPageAbortControllerRef.current = null;
    replayNoteSaveTimerRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    replayNoteSaveTimerRef.current.clear();
    replayNotePatchGlobalVersionRef.current += 1;
    replayNotePendingPatchRef.current.clear();
    replayNotePatchTaskRef.current.clear();
    replayNotePatchVersionRef.current.clear();
    replayNoteDetailAbortControllerRef.current.forEach((controller) => {
      controller.abort();
    });
    replayNoteDetailAbortControllerRef.current.clear();
    replayNoteDetailPromiseRef.current.clear();
  }, []);

  useEffect(() => {
    replayNotesRef.current = replayNotes;
  }, [replayNotes]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAllReplayNotePendingState();
    };
  }, [clearAllReplayNotePendingState]);

  const mergeReplayNotesInState = useCallback(
    (notes: Array<ReplayNoteModel<TContextReplay, TDisplayPeriod>>) => {
      setReplayNotes((current) =>
        mergeReplayNotesByServerOrder({
          current,
          incoming: notes,
          retainUnmatched: "all",
          mergeItem: mergeReplayNoteModel,
        }),
      );
    },
    [],
  );

  const upsertReplayNoteInState = useCallback(
    (note: ReplayNoteModel<TContextReplay, TDisplayPeriod>) => {
      mergeReplayNotesInState([note]);
    },
    [mergeReplayNotesInState],
  );

  const clearReplayNotePendingSave = useCallback((noteId: string) => {
    const id = noteId.trim();
    if (!id) {
      return;
    }
    const timerId = replayNoteSaveTimerRef.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }
    replayNoteSaveTimerRef.current.delete(id);
    const currentPatchVersion = replayNotePatchVersionRef.current.get(id) ?? 0;
    replayNotePatchVersionRef.current.set(id, currentPatchVersion + 1);
    replayNotePendingPatchRef.current.delete(id);
    replayNotePatchTaskRef.current.delete(id);
  }, []);

  const clearReplayNoteDetailRequest = useCallback((noteId: string) => {
    const id = noteId.trim();
    if (!id) {
      return;
    }
    const controller = replayNoteDetailAbortControllerRef.current.get(id);
    if (controller) {
      controller.abort();
    }
    replayNoteDetailAbortControllerRef.current.delete(id);
    replayNoteDetailPromiseRef.current.delete(id);
  }, []);

  const clearReplayNotePendingState = useCallback(
    (noteId: string) => {
      clearReplayNotePendingSave(noteId);
      clearReplayNoteDetailRequest(noteId);
    },
    [clearReplayNoteDetailRequest, clearReplayNotePendingSave]
  );

  const loadReplayNotesPage = useCallback(
    async (append: boolean, cursor?: string | null) => {
      replayNotesPageRequestVersionRef.current += 1;
      const requestVersion = replayNotesPageRequestVersionRef.current;
      replayNotesPageAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      replayNotesPageAbortControllerRef.current = abortController;

      if (append) {
        setIsReplayNotesLoadingMore(true);
      } else {
        setIsReplayNotesLoading(true);
      }
      try {
        const page = await api.listReplayNotes(
          pageSize,
          cursor ?? undefined,
          undefined,
          {
            signal: abortController.signal
          }
        );
        if (!isMountedRef.current || replayNotesPageRequestVersionRef.current !== requestVersion || abortController.signal.aborted) {
          return;
        }
        const mapped = page.items.map(mapApiReplayNoteToLocal);
        setReplayNotes((current) =>
          mergeReplayNotesByServerOrder({
            current,
            incoming: mapped,
            retainUnmatched: append ? "all" : "optimistic",
            mergeItem: mergeReplayNoteModel,
          }),
        );
        setReplayNotesTotal(page.total);
        setReplayNotesNextCursor(page.nextCursor ?? null);
      } catch (err) {
        if (abortController.signal.aborted) {
          return;
        }
        if (!isMountedRef.current || replayNotesPageRequestVersionRef.current !== requestVersion) {
          return;
        }
        onError(tt("appText.readNotes"));
      } finally {
        if (replayNotesPageAbortControllerRef.current === abortController) {
          replayNotesPageAbortControllerRef.current = null;
        }
        if (!isMountedRef.current || replayNotesPageRequestVersionRef.current !== requestVersion) {
          return;
        }
        if (!append) {
          setHasReplayNotesHydrated(true);
        }
        if (append) {
          setIsReplayNotesLoadingMore(false);
        } else {
          setIsReplayNotesLoading(false);
        }
      }
    },
    [mapApiReplayNoteToLocal, onError, pageSize]
  );

  const loadMoreReplayNotes = useCallback(async () => {
    if (isReplayNotesLoading || isReplayNotesLoadingMore || !replayNotesNextCursor) {
      return;
    }
    await loadReplayNotesPage(true, replayNotesNextCursor);
  }, [isReplayNotesLoading, isReplayNotesLoadingMore, loadReplayNotesPage, replayNotesNextCursor]);

  const isReplayNoteDetailAbortError = useCallback((error: unknown): boolean => {
    if (
      typeof DOMException !== 'undefined' &&
      error instanceof DOMException
    ) {
      return error.name === 'AbortError';
    }
    if (!error || typeof error !== 'object' || Array.isArray(error)) {
      return false;
    }
    return String((error as { name?: unknown }).name ?? '').trim() === 'AbortError';
  }, []);

  const ensureReplayNoteDetail = useCallback(
    async (
      noteId: string,
    ): Promise<
      ReplayNoteDetailRequestResult<
        ReplayNoteModel<TContextReplay, TDisplayPeriod>
      >
    > => {
      const id = noteId.trim();
      if (!id) {
        return {
          status: 'aborted',
          note: null,
        };
      }
      const current = replayNotesRef.current.find((item) => item.id === id) ?? null;
      if (isReplayNoteDetailReady(current)) {
        return {
          status: 'loaded',
          note: current,
        };
      }
      const pending = replayNoteDetailPromiseRef.current.get(id);
      if (pending) {
        return pending;
      }
      const abortController = new AbortController();
      replayNoteDetailAbortControllerRef.current.set(id, abortController);
      const task = (async () => {
        try {
          const detail = mapApiReplayNoteToLocal(
            await api.getReplayNote(id, {
              signal: abortController.signal
            })
          );
          if (abortController.signal.aborted || !isMountedRef.current) {
            return {
              status: 'aborted' as const,
              note: current,
            };
          }
          if (replayNotesRef.current.some((item) => item.id === id)) {
            upsertReplayNoteInState(detail);
          }
          return {
            status: 'loaded' as const,
            note: detail,
          };
        } catch (error) {
          if (
            abortController.signal.aborted ||
            !isMountedRef.current ||
            isReplayNoteDetailAbortError(error)
          ) {
            return {
              status: 'aborted' as const,
              note: current,
              error,
            };
          }
          return {
            status: 'failed' as const,
            note: current,
            error,
          };
        } finally {
          replayNoteDetailAbortControllerRef.current.delete(id);
          replayNoteDetailPromiseRef.current.delete(id);
        }
      })();
      replayNoteDetailPromiseRef.current.set(id, task);
      return task;
    },
    [isReplayNoteDetailAbortError, mapApiReplayNoteToLocal, upsertReplayNoteInState]
  );

  const flushReplayNotePatch = useCallback(
    async (
    noteId: string,
    immediatePatch?: ReplayNotePatch<TContextReplay, TDisplayPeriod>)
    : Promise<ReplayNoteModel<TContextReplay, TDisplayPeriod> | null> => {
      const id = noteId.trim();
      if (!id) {
        return null;
      }
      const timerId = replayNoteSaveTimerRef.current.get(id);
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
      replayNoteSaveTimerRef.current.delete(id);
      const queued = replayNotePendingPatchRef.current.get(id) ?? {};
      replayNotePendingPatchRef.current.delete(id);
      const patch = {
        ...queued,
        ...(immediatePatch ?? {})
      };
      if (!Object.keys(patch).length) {
        return replayNotesRef.current.find((item) => item.id === id) ?? null;
      }
      const mergedPatch = {
        ...(replayNotePendingPatchRef.current.get(id) ?? {}),
        ...patch
      };
      replayNotePendingPatchRef.current.set(id, mergedPatch);
      const runningTask = replayNotePatchTaskRef.current.get(id);
      if (runningTask) {
        await runningTask;
      }
      const nextRequestId = (replayNotePatchRequestIdRef.current.get(id) ?? 0) + 1;
      replayNotePatchRequestIdRef.current.set(id, nextRequestId);
      const expectedPatchVersion = replayNotePatchVersionRef.current.get(id) ?? 0;
      const expectedGlobalVersion = replayNotePatchGlobalVersionRef.current;
      const isPatchContextActive = () =>
        isMountedRef.current &&
        replayNotePatchRequestIdRef.current.get(id) === nextRequestId &&
        (replayNotePatchVersionRef.current.get(id) ?? 0) === expectedPatchVersion &&
        replayNotePatchGlobalVersionRef.current === expectedGlobalVersion;

      const sendPendingPatchTask = (async (): Promise<void> => {
        while (isPatchContextActive()) {
          const currentPatch = replayNotePendingPatchRef.current.get(id);
          if (!currentPatch || !Object.keys(currentPatch).length) {
            replayNotePendingPatchRef.current.delete(id);
            return;
          }
          replayNotePendingPatchRef.current.delete(id);
          const payload: Parameters<typeof api.updateReplayNote>[1] = {};
          if (Object.prototype.hasOwnProperty.call(currentPatch, 'title')) {
            payload.title = currentPatch.title ?? '';
          }
          if (Object.prototype.hasOwnProperty.call(currentPatch, 'contentDocument')) {
            payload.contentDocument = currentPatch.contentDocument;
          }
          if (Object.prototype.hasOwnProperty.call(currentPatch, 'attachments')) {
            payload.attachments = Array.isArray(currentPatch.attachments)
              ? currentPatch.attachments
              : [];
          }
          if (Object.prototype.hasOwnProperty.call(currentPatch, 'trainingProjectId')) {
            payload.trainingProjectId = currentPatch.trainingProjectId ?? null;
          }
          if (Object.prototype.hasOwnProperty.call(currentPatch, 'contextDisplayPeriod')) {
            payload.contextDisplayPeriod = currentPatch.contextDisplayPeriod ?? null;
          }
          if (Object.prototype.hasOwnProperty.call(currentPatch, 'colorTokens')) {
            payload.colorTokens = Array.isArray(currentPatch.colorTokens)
              ? currentPatch.colorTokens
              : [];
          }
          if (Object.prototype.hasOwnProperty.call(currentPatch, 'source')) {
            payload.source = currentPatch.source
              ? {
                  kind: String(currentPatch.source.kind ?? '').trim(),
                  id:
                    typeof currentPatch.source.id === 'string' &&
                    currentPatch.source.id.trim()
                      ? currentPatch.source.id.trim()
                      : null,
                  label:
                    typeof currentPatch.source.label === 'string' &&
                    currentPatch.source.label.trim()
                      ? currentPatch.source.label.trim()
                      : undefined
                }
              : null;
          }
          if (Object.prototype.hasOwnProperty.call(currentPatch, 'meta')) {
            payload.meta = currentPatch.meta
              ? {
                  schemaVersion: Number.isFinite(
                    Number(currentPatch.meta.schemaVersion)
                  )
                    ? Math.max(1, Math.floor(Number(currentPatch.meta.schemaVersion)))
                    : 1,
                  templateId: String(currentPatch.meta.templateId ?? '').trim(),
                  layout:
                    currentPatch.meta.layout === 'DOCUMENT_ONLY'
                      ? 'DOCUMENT_ONLY'
                      : 'DASHBOARD_REPLAY_REFLECTION',
                  reflectionSections: Array.isArray(
                    currentPatch.meta.reflectionSections
                  )
                    ? currentPatch.meta.reflectionSections.map((section) => ({
                        key: String(section.key ?? '').trim(),
                        required: Boolean(section.required)
                      }))
                    : [],
                  reflectionEntries:
                    currentPatch.meta.reflectionEntries &&
                    typeof currentPatch.meta.reflectionEntries === 'object'
                      ? Object.entries(currentPatch.meta.reflectionEntries).reduce<
                          Record<string, { value?: string; updatedAt?: string }>
                        >((acc, [key, entry]) => {
                          const normalizedKey = String(key ?? '').trim();
                          if (!normalizedKey || !entry) {
                            return acc;
                          }
                          acc[normalizedKey] = {
                            value: String(entry.value ?? ''),
                            updatedAt:
                              typeof entry.updatedAt === 'string' &&
                              entry.updatedAt.trim()
                                ? entry.updatedAt.trim()
                                : undefined
                          };
                          return acc;
                        }, {})
                      : undefined,
                  referenceEntries: Array.isArray(currentPatch.meta.referenceEntries)
                    ? currentPatch.meta.referenceEntries.map((entry) => ({
                        noteId: String(entry.noteId ?? '').trim(),
                        title: String(entry.title ?? '').trim(),
                        type: String(entry.type ?? '').trim(),
                        addedAt:
                          typeof entry.addedAt === 'string' &&
                          entry.addedAt.trim()
                            ? entry.addedAt.trim()
                            : undefined,
                        source: entry.source
                          ? {
                              kind: String(entry.source.kind ?? '').trim(),
                              id:
                                typeof entry.source.id === 'string' &&
                                entry.source.id.trim()
                                  ? entry.source.id.trim()
                                  : null,
                              label:
                                typeof entry.source.label === 'string' &&
                                entry.source.label.trim()
                                  ? entry.source.label.trim()
                                  : undefined
                            }
                          : null,
                        colorTokens: Array.isArray(entry.colorTokens)
                          ? entry.colorTokens
                          : [],
                        summaryChips: Array.isArray(entry.summaryChips)
                          ? entry.summaryChips.map((chip) => ({
                              label: String(chip.label ?? '').trim(),
                              value: String(chip.value ?? '').trim(),
                              tone:
                                chip.tone === 'neutral' ||
                                chip.tone === 'positive' ||
                                chip.tone === 'warning' ||
                                chip.tone === 'danger'
                                  ? chip.tone
                                  : undefined
                            }))
                          : []
                      }))
                    : undefined
                }
              : null;
          }
          try {
            const saved = mapApiReplayNoteToLocal(
              await api.updateReplayNote(id, payload)
            );
            if (!isPatchContextActive()) {
              return;
            }
            upsertReplayNoteInState(saved);
          } catch (err) {
            if (!isPatchContextActive()) {
              return;
            }
            onError(tt("appText.saveNote"));
            return;
          }
        }
      })();
      replayNotePatchTaskRef.current.set(id, sendPendingPatchTask);
      try {
        await sendPendingPatchTask;
      } finally {
        if (replayNotePatchTaskRef.current.get(id) === sendPendingPatchTask) {
          replayNotePatchTaskRef.current.delete(id);
        }
      }
      return replayNotesRef.current.find((item) => item.id === id) ?? null;
    },
    [mapApiReplayNoteToLocal, onError, upsertReplayNoteInState]
  );

  const scheduleReplayNotePatch = useCallback(
    (noteId: string, patch: ReplayNotePatch<TContextReplay, TDisplayPeriod>, delayMs = 360) => {
      const id = noteId.trim();
      if (!id) {
        return;
      }
      const patchKeys = Object.keys(patch);
      if (!patchKeys.length) {
        return;
      }
      const current = replayNotePendingPatchRef.current.get(id) ?? {};
      if (
        patchKeys.length === 1 &&
        Object.prototype.hasOwnProperty.call(patch, 'contentDocument') &&
        Object.prototype.hasOwnProperty.call(current, 'contentDocument') &&
        JSON.stringify(current.contentDocument) === JSON.stringify(patch.contentDocument)
      ) {
        return;
      }
      replayNotePendingPatchRef.current.set(id, {
        ...current,
        ...patch
      });
      const timerId = replayNoteSaveTimerRef.current.get(id);
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
      const nextTimerId = window.setTimeout(() => {
        void flushReplayNotePatch(id);
      }, delayMs);
      replayNoteSaveTimerRef.current.set(id, nextTimerId);
    },
    [flushReplayNotePatch]
  );

  return {
    replayNotes,
    setReplayNotes,
    replayNotesRef,
    isReplayNotesLoading,
    isReplayNotesLoadingMore,
    hasReplayNotesHydrated,
    replayNotesTotal,
    replayNotesNextCursor,
    replayNoteDetailPromiseRef,
    replayNoteSaveTimerRef,
    loadReplayNotesPage,
    loadMoreReplayNotes,
    ensureReplayNoteDetail,
    mergeReplayNotesInState,
    upsertReplayNoteInState,
    clearReplayNotePendingSave,
    clearReplayNotePendingState,
    clearReplayNoteDetailRequest,
    clearAllReplayNotePendingState,
    flushReplayNotePatch,
    scheduleReplayNotePatch,
    setReplayNotesNextCursor
  };
};
