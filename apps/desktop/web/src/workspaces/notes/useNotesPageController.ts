// SPDX-License-Identifier: GPL-3.0-only

import type { ReplayNote } from "@/domains/notes/replayNoteModel";
import { api } from "@/api";
import { REPLAY_NOTE_PAGE_SIZE } from "@/frontend-kernel/runtimeConstants";
import { mapApiReplayNoteToLocal } from "@/domains/notes/replayNoteMapping";
import type {
  ReplayNoteColorToken,
  ReplayNoteScopeFilter,
} from "@zinuto/shared/replayNoteColors";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export type NotesPageScopeFilter = ReplayNoteScopeFilter;

type UseNotesPageControllerOptions = {
  isActive?: boolean;
  language: "en" | "zh-CN" | "ja" | "ko" | "es";
  replayNotes: ReplayNote[];
  hasReplayNotesHydrated: boolean;
  isReplayNotesLoading: boolean;
  isReplayNotesLoadingMore: boolean;
  replayNotesNextCursor: string | null;
  replayNotesTotal: number;
  loadReplayNotesPage: (append: boolean, cursor?: string | null) => Promise<void>;
  loadMoreReplayNotes: () => Promise<void>;
  setReplayNotes: Dispatch<SetStateAction<ReplayNote[]>>;
  mergeReplayNotesInState: (notes: ReplayNote[]) => void;
  selectedReplayNoteId: string;
  setSelectedReplayNoteId: Dispatch<SetStateAction<string>>;
  defaultReplayNoteTitle: string;
  onCreateCustomReplayNote: () => Promise<string | null>;
  onDeleteReplayNote: (noteId: string) => Promise<void>;
  onError: (message: string) => void;
  fallbackErrorMessage: string;
};

const buildNotesCollectionQueryKey = ({
  keyword,
  scope,
  colorTokens,
}: {
  keyword?: string;
  scope?: ReplayNoteScopeFilter;
  colorTokens: readonly ReplayNoteColorToken[];
}): string =>
  JSON.stringify({
    keyword: keyword ?? "",
    scope: scope ?? "ALL",
    colorTokens: [...colorTokens].sort(),
  });

export const useNotesPageController = ({
  isActive = true,
  replayNotes,
  hasReplayNotesHydrated,
  isReplayNotesLoading,
  isReplayNotesLoadingMore,
  replayNotesNextCursor,
  replayNotesTotal,
  loadReplayNotesPage,
  loadMoreReplayNotes,
  mergeReplayNotesInState,
  selectedReplayNoteId,
  setSelectedReplayNoteId,
  onCreateCustomReplayNote,
  onDeleteReplayNote,
  onError,
  fallbackErrorMessage,
}: UseNotesPageControllerOptions) => {
  const [replayNotesKeyword, setReplayNotesKeyword] = useState("");
  const [debouncedReplayNotesKeyword, setDebouncedReplayNotesKeyword] =
    useState("");
  const [activeScopeFilter, setActiveScopeFilter] =
    useState<NotesPageScopeFilter>("ALL");
  const [selectedColorTokens, setSelectedColorTokens] = useState<
    ReplayNoteColorToken[]
  >([]);
  const [collectionNoteIds, setCollectionNoteIds] = useState<string[]>([]);
  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionNextCursor, setCollectionNextCursor] = useState<string | null>(
    null,
  );
  const [isCollectionLoading, setIsCollectionLoading] = useState(false);
  const [isCollectionLoadingMore, setIsCollectionLoadingMore] = useState(false);
  const [hasCollectionHydrated, setHasCollectionHydrated] = useState(false);

  const collectionRequestIdRef = useRef(0);
  const collectionAbortControllerRef = useRef<AbortController | null>(null);
  const collectionResolvedQueryKeyRef = useRef<string | null>(null);
  const collectionInFlightRequestKeyRef = useRef<string | null>(null);

  const syncNotesToStore = useCallback(
    (notes: ReplayNote[]) => {
      mergeReplayNotesInState(notes);
    },
    [mergeReplayNotesInState],
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedReplayNotesKeyword(replayNotesKeyword);
    }, 220);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [replayNotesKeyword]);

  const collectionFilters = useMemo(
    () => ({
      keyword: debouncedReplayNotesKeyword.trim() || undefined,
      scope: activeScopeFilter === "ALL" ? undefined : activeScopeFilter,
      colorTokens: selectedColorTokens,
    }),
    [activeScopeFilter, debouncedReplayNotesKeyword, selectedColorTokens],
  );
  const isDefaultCollectionFilters = useMemo(
    () =>
      !collectionFilters.keyword &&
      !collectionFilters.scope &&
      collectionFilters.colorTokens.length === 0,
    [collectionFilters],
  );
  const collectionQueryKey = useMemo(
    () => buildNotesCollectionQueryKey(collectionFilters),
    [collectionFilters],
  );

  const loadCollection = useCallback(
    async (
      append: boolean,
      cursor?: string | null,
      options?: { force?: boolean },
    ) => {
      const normalizedCursor = cursor ?? null;
      const requestKey = `${collectionQueryKey}|${append ? normalizedCursor ?? "" : "first"}`;
      if (
        !options?.force &&
        !append &&
        collectionResolvedQueryKeyRef.current === collectionQueryKey
      ) {
        return;
      }
      if (
        !options?.force &&
        collectionInFlightRequestKeyRef.current === requestKey
      ) {
        return;
      }
      collectionAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      collectionAbortControllerRef.current = abortController;
      collectionInFlightRequestKeyRef.current = requestKey;
      collectionRequestIdRef.current += 1;
      const requestId = collectionRequestIdRef.current;
      if (append) {
        setIsCollectionLoadingMore(true);
      } else {
        setIsCollectionLoading(true);
      }
      try {
        const page = await api.listReplayNotes(
          REPLAY_NOTE_PAGE_SIZE,
          normalizedCursor ?? undefined,
          collectionFilters,
          {
            signal: abortController.signal,
          },
        );
        if (
          abortController.signal.aborted ||
          collectionRequestIdRef.current !== requestId
        ) {
          return;
        }
        const mapped = page.items.map(mapApiReplayNoteToLocal);
        syncNotesToStore(mapped);
        setCollectionNoteIds((current) => {
          if (!append) {
            return mapped.map((item) => item.id);
          }
          const seen = new Set(current);
          const next = [...current];
          mapped.forEach((item) => {
            if (seen.has(item.id)) {
              return;
            }
            seen.add(item.id);
            next.push(item.id);
          });
          return next;
        });
        setCollectionTotal(page.total);
        setCollectionNextCursor(page.nextCursor ?? null);
        if (!append) {
          collectionResolvedQueryKeyRef.current = collectionQueryKey;
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          onError(fallbackErrorMessage);
        }
      } finally {
        if (collectionInFlightRequestKeyRef.current === requestKey) {
          collectionInFlightRequestKeyRef.current = null;
        }
        if (collectionAbortControllerRef.current === abortController) {
          collectionAbortControllerRef.current = null;
        }
        if (
          !abortController.signal.aborted &&
          collectionRequestIdRef.current === requestId
        ) {
          if (!append) {
            setHasCollectionHydrated(true);
          }
          if (append) {
            setIsCollectionLoadingMore(false);
          } else {
            setIsCollectionLoading(false);
          }
        }
      }
    },
    [
      collectionFilters,
      collectionQueryKey,
      fallbackErrorMessage,
      onError,
      syncNotesToStore,
    ],
  );

  useEffect(() => {
    if (!isActive || !isDefaultCollectionFilters) {
      return;
    }
    if (hasReplayNotesHydrated && replayNotes.length === 0) {
      collectionAbortControllerRef.current?.abort();
      collectionAbortControllerRef.current = null;
      collectionRequestIdRef.current += 1;
      collectionInFlightRequestKeyRef.current = null;
      collectionResolvedQueryKeyRef.current = collectionQueryKey;
      setCollectionNoteIds([]);
      setCollectionTotal(0);
      setCollectionNextCursor(null);
      setHasCollectionHydrated(true);
      setIsCollectionLoading(false);
      setIsCollectionLoadingMore(false);
      return;
    }
    if (isReplayNotesLoading || isReplayNotesLoadingMore) {
      return;
    }
    if (!hasReplayNotesHydrated) {
      return;
    }
    collectionAbortControllerRef.current?.abort();
    collectionAbortControllerRef.current = null;
    collectionRequestIdRef.current += 1;
    collectionInFlightRequestKeyRef.current = null;
    collectionResolvedQueryKeyRef.current = collectionQueryKey;
    setCollectionNoteIds(replayNotes.map((note) => note.id));
    setCollectionTotal(Math.max(replayNotesTotal, replayNotes.length));
    setCollectionNextCursor(replayNotesNextCursor);
    setHasCollectionHydrated(true);
    setIsCollectionLoading(false);
    setIsCollectionLoadingMore(false);
  }, [
    collectionQueryKey,
    hasReplayNotesHydrated,
    isActive,
    isDefaultCollectionFilters,
    isReplayNotesLoading,
    isReplayNotesLoadingMore,
    replayNotes,
    replayNotesNextCursor,
    replayNotesTotal,
  ]);

  useEffect(() => {
    if (!isActive || isDefaultCollectionFilters) {
      return;
    }
    void loadCollection(false, null);
  }, [collectionQueryKey, isActive, isDefaultCollectionFilters, loadCollection]);

  useEffect(
    () => () => {
      collectionAbortControllerRef.current?.abort();
    },
    [],
  );

  const replayNotesById = useMemo(() => {
    const map = new Map<string, ReplayNote>();
    replayNotes.forEach((note) => {
      map.set(note.id, note);
    });
    return map;
  }, [replayNotes]);

  const collectionNotes = useMemo(
    () =>
      collectionNoteIds
        .map((noteId) => replayNotesById.get(noteId) ?? null)
        .filter((note): note is ReplayNote => Boolean(note)),
    [collectionNoteIds, replayNotesById],
  );

  const selectedReplayNote = useMemo(() => {
    const selectedById = selectedReplayNoteId
      ? collectionNotes.find((note) => note.id === selectedReplayNoteId) ?? null
      : null;
    return selectedById ?? collectionNotes[0] ?? null;
  }, [collectionNotes, selectedReplayNoteId]);

  useEffect(() => {
    if (!selectedReplayNote?.id) {
      return;
    }
    setSelectedReplayNoteId((current) =>
      current && current === selectedReplayNote.id ? current : selectedReplayNote.id,
    );
  }, [selectedReplayNote?.id, setSelectedReplayNoteId]);

  const loadMoreCollectionNotes = useCallback(async () => {
    if (isDefaultCollectionFilters) {
      if (
        isReplayNotesLoading ||
        isReplayNotesLoadingMore ||
        !replayNotesNextCursor
      ) {
        return;
      }
      await loadMoreReplayNotes();
      return;
    }
    if (
      isCollectionLoading ||
      isCollectionLoadingMore ||
      !collectionNextCursor
    ) {
      return;
    }
    await loadCollection(true, collectionNextCursor);
  }, [
    collectionNextCursor,
    isDefaultCollectionFilters,
    isCollectionLoading,
    isCollectionLoadingMore,
    isReplayNotesLoading,
    isReplayNotesLoadingMore,
    loadCollection,
    loadMoreReplayNotes,
    replayNotesNextCursor,
  ]);

  const refreshNotesWorkspace = useCallback(async () => {
    if (!isActive) {
      return;
    }
    if (isDefaultCollectionFilters) {
      await loadReplayNotesPage(false, null);
      return;
    }
    collectionResolvedQueryKeyRef.current = null;
    await loadCollection(false, null, { force: true });
  }, [isActive, isDefaultCollectionFilters, loadCollection, loadReplayNotesPage]);

  const deleteReplayNote = useCallback(
    async (noteId: string) => {
      const normalizedNoteId = String(noteId || "").trim();
      if (!normalizedNoteId) {
        return;
      }
      try {
        await onDeleteReplayNote(normalizedNoteId);
        setCollectionNoteIds((items) =>
          items.filter((item) => item !== normalizedNoteId),
        );
        setSelectedReplayNoteId((selectedId) =>
          selectedId === normalizedNoteId ? "" : selectedId,
        );
        await refreshNotesWorkspace();
      } catch (error) {
        void error;
        onError(fallbackErrorMessage);
      }
    },
    [
      fallbackErrorMessage,
      onDeleteReplayNote,
      onError,
      refreshNotesWorkspace,
      setSelectedReplayNoteId,
    ],
  );

  const resetNotesPageController = useCallback(() => {
    setReplayNotesKeyword("");
    setDebouncedReplayNotesKeyword("");
    setActiveScopeFilter("ALL");
    setSelectedColorTokens([]);
  }, []);

  const revealCreatedCustomReplayNote = useCallback(
    (noteId: string) => {
      const normalizedNoteId = String(noteId || "").trim();
      if (!normalizedNoteId) {
        return;
      }
      collectionResolvedQueryKeyRef.current = null;
      collectionInFlightRequestKeyRef.current = null;
      setReplayNotesKeyword("");
      setDebouncedReplayNotesKeyword("");
      setActiveScopeFilter("CUSTOM");
      setSelectedColorTokens([]);
      setCollectionNoteIds((current) => [
        normalizedNoteId,
        ...current.filter((item) => item !== normalizedNoteId),
      ]);
      setCollectionTotal((current) =>
        Math.max(
          current,
          collectionNoteIds.includes(normalizedNoteId)
            ? collectionNoteIds.length
            : collectionNoteIds.length + 1,
        ),
      );
      setHasCollectionHydrated(true);
      setIsCollectionLoading(false);
      setIsCollectionLoadingMore(false);
    },
    [collectionNoteIds],
  );

  const handleCreateCustomReplayNote = useCallback(async () => {
    const shouldRefreshCurrentCustomCollection =
      isActive &&
      activeScopeFilter === "CUSTOM" &&
      !debouncedReplayNotesKeyword.trim() &&
      selectedColorTokens.length === 0;
    const createdNoteId = await onCreateCustomReplayNote();
    if (!createdNoteId) {
      return null;
    }
    revealCreatedCustomReplayNote(createdNoteId);
    if (shouldRefreshCurrentCustomCollection) {
      await loadCollection(false, null, { force: true });
    }
    return createdNoteId;
  }, [
    activeScopeFilter,
    debouncedReplayNotesKeyword,
    isActive,
    loadCollection,
    onCreateCustomReplayNote,
    revealCreatedCustomReplayNote,
    selectedColorTokens.length,
  ]);

  useEffect(() => {
    if (
      !isActive ||
      activeScopeFilter !== "CUSTOM" ||
      debouncedReplayNotesKeyword.trim() ||
      selectedColorTokens.length > 0
    ) {
      return;
    }
    if (collectionResolvedQueryKeyRef.current === collectionQueryKey) {
      return;
    }
    void loadCollection(false, null, { force: true });
  }, [
    activeScopeFilter,
    collectionQueryKey,
    debouncedReplayNotesKeyword,
    isActive,
    loadCollection,
    selectedColorTokens.length,
  ]);

  return {
    replayNotesKeyword,
    setReplayNotesKeyword,
    activeScopeFilter,
    setActiveScopeFilter,
    selectedColorTokens,
    setSelectedColorTokens,
    collectionNotes,
    collectionTotal,
    collectionNextCursor,
    isCollectionLoading:
      isCollectionLoading ||
      (isActive && !hasCollectionHydrated && collectionNoteIds.length === 0),
    isCollectionLoadingMore,
    loadMoreCollectionNotes,
    selectedReplayNote,
    deleteReplayNote,
    resetNotesPageController,
    refreshNotesWorkspace,
    onCreateCustomReplayNote: handleCreateCustomReplayNote,
  };
};
