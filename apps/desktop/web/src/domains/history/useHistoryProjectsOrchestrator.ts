// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { useEffect } from 'react';
import type {
  HistoryProjectsLoadMoreOptions,
  HistoryProjectsLoadMoreResult,
} from '@/domains/history/historyTypes';

type HistoryProjectLike = {
  id: string;
  replay?: unknown;
};

type ListResult<TApiProject> = {
  items: TApiProject[];
  nextCursor?: string | null;
};

type UseHistoryProjectsOrchestratorParams<
  TApiProjectSummary,
  TApiProjectDetail extends TApiProjectSummary,
  TProject extends HistoryProjectLike
> = {
  pageSize: number;
  samplePoolAllId: string;
  initialHistorySamplePoolFilter: string;
  appIsMountedRef: MutableRefObject<boolean>;
  mapApiTrainingProjectToLocal: (
    project: TApiProjectSummary | TApiProjectDetail
  ) => TProject;
  listTrainingProjects: (
    pageSize: number,
    cursor?: string,
    options?: { signal?: AbortSignal }
  ) => Promise<ListResult<TApiProjectSummary>>;
  getTrainingProject: (
    projectId: string,
    options?: { signal?: AbortSignal }
  ) => Promise<TApiProjectDetail>;
  setError: (message: string) => void;
  listErrorFallbackText: string;
};

const HISTORY_PROJECT_DETAIL_CACHE_MAX = 12;

const normalizeHistoryCursor = (value: string | null | undefined): string =>
  String(value ?? '').trim();

export const isHistoryAutoPaginationBlocked = (
  failedCursor: string | null | undefined,
  requestedCursor: string | null | undefined,
): boolean => {
  const normalizedRequestedCursor = normalizeHistoryCursor(requestedCursor);
  return Boolean(
    normalizedRequestedCursor &&
      normalizeHistoryCursor(failedCursor) === normalizedRequestedCursor,
  );
};

export const isHistoryPaginationCursorStalled = (
  requestedCursor: string | null | undefined,
  nextCursor: string | null | undefined,
): boolean => {
  const normalizedRequestedCursor = normalizeHistoryCursor(requestedCursor);
  return Boolean(
    normalizedRequestedCursor &&
      normalizeHistoryCursor(nextCursor) === normalizedRequestedCursor,
  );
};

export const useHistoryProjectsOrchestrator = <
  TApiProjectSummary,
  TApiProjectDetail extends TApiProjectSummary,
  TProject extends HistoryProjectLike
>({
  pageSize,
  samplePoolAllId,
  initialHistorySamplePoolFilter,
  appIsMountedRef,
  mapApiTrainingProjectToLocal,
  listTrainingProjects,
  getTrainingProject,
  setError,
  listErrorFallbackText
}: UseHistoryProjectsOrchestratorParams<
  TApiProjectSummary,
  TApiProjectDetail,
  TProject
>) => {
  const [trainingProjects, setTrainingProjects] = useState<TProject[]>([]);
  const [historyProjectsNextCursor, setHistoryProjectsNextCursor] = useState<string | null>(null);
  const [isHistoryProjectsLoading, setIsHistoryProjectsLoading] = useState(false);
  const [isHistoryProjectsLoadingMore, setIsHistoryProjectsLoadingMore] = useState(false);
  const [hasHistoryProjectsHydrated, setHasHistoryProjectsHydrated] = useState(false);
  const [selectedHistoryProjectId, setSelectedHistoryProjectId] = useState('');
  const [historyKeyword, setHistoryKeyword] = useState('');
  const [historyProfitFilter, setHistoryProfitFilter] = useState<'ALL' | 'PROFIT' | 'LOSS'>('ALL');
  const [historySamplePoolFilter, setHistorySamplePoolFilter] = useState<string>(() =>
    typeof initialHistorySamplePoolFilter === 'string' && initialHistorySamplePoolFilter.trim() ?
      initialHistorySamplePoolFilter :
      samplePoolAllId
  );

  const historyProjectsPageAbortControllerRef = useRef<AbortController | null>(null);
  const historyProjectsPageRequestVersionRef = useRef(0);
  const failedHistoryProjectsCursorRef = useRef<string | null>(null);
  const historyProjectDetailAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const loadedHistoryProjectIdsRef = useRef<Set<string>>(new Set());
  const retainedHistoryProjectIdsRef = useRef<string[]>([]);

  const cleanupHistoryProjectRequests = useCallback(() => {
    historyProjectsPageAbortControllerRef.current?.abort();
    historyProjectsPageAbortControllerRef.current = null;
    historyProjectDetailAbortControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    historyProjectDetailAbortControllersRef.current.clear();
  }, []);

  const retainHistoryProjectDetailId = useCallback((projectId: string) => {
    const id = String(projectId ?? '').trim();
    if (!id) {
      return;
    }
    retainedHistoryProjectIdsRef.current = [
      id,
      ...retainedHistoryProjectIdsRef.current.filter((item) => item !== id)
    ].slice(0, HISTORY_PROJECT_DETAIL_CACHE_MAX);
  }, []);

  const markHistoryProjectLoaded = useCallback((projectId: string) => {
    const id = String(projectId ?? '').trim();
    if (!id) {
      return;
    }
    retainHistoryProjectDetailId(id);
    loadedHistoryProjectIdsRef.current.add(id);
  }, [retainHistoryProjectDetailId]);

  const pruneHistoryProjectDetailCache = useCallback(() => {
    const retainedIds = new Set(retainedHistoryProjectIdsRef.current);
    loadedHistoryProjectIdsRef.current = new Set(
      Array.from(loadedHistoryProjectIdsRef.current).filter((id) => retainedIds.has(id))
    );
    setTrainingProjects((current) => {
      let changed = false;
      const next = current.map((project) => {
        if (!project.replay || retainedIds.has(project.id)) {
          return project;
        }
        changed = true;
        return {
          ...project,
          replay: undefined
        };
      });
      return changed ? next : current;
    });
  }, []);

  const unmarkHistoryProjectLoaded = useCallback((projectId: string) => {
    const id = String(projectId ?? '').trim();
    if (!id) {
      return;
    }
    loadedHistoryProjectIdsRef.current.delete(id);
    retainedHistoryProjectIdsRef.current = retainedHistoryProjectIdsRef.current.filter(
      (item) => item !== id
    );
  }, []);

  const clearLoadedHistoryProjectIds = useCallback(() => {
    loadedHistoryProjectIdsRef.current.clear();
    retainedHistoryProjectIdsRef.current = [];
  }, []);

  const upsertTrainingProjectInState = useCallback((project: TProject) => {
    setTrainingProjects((current) => {
      const index = current.findIndex((item) => item.id === project.id);
      if (index < 0) {
        return [project, ...current];
      }
      const next = [...current];
      next[index] = {
        ...next[index],
        ...project,
        replay: project.replay ?? next[index].replay
      };
      return next;
    });
  }, []);

  const loadTrainingProjectsPageWithResult = useCallback(
    async (
      append: boolean,
      cursor?: string | null,
    ): Promise<HistoryProjectsLoadMoreResult> => {
      historyProjectsPageRequestVersionRef.current += 1;
      const requestVersion = historyProjectsPageRequestVersionRef.current;
      historyProjectsPageAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      historyProjectsPageAbortControllerRef.current = abortController;
      if (!append) {
        failedHistoryProjectsCursorRef.current = null;
      }

      if (append) {
        setIsHistoryProjectsLoadingMore(true);
      } else {
        setIsHistoryProjectsLoading(true);
      }
      try {
        const page = await listTrainingProjects(pageSize, cursor ?? undefined, {
          signal: abortController.signal
        });
        if (
          !appIsMountedRef.current ||
          historyProjectsPageRequestVersionRef.current !== requestVersion ||
          abortController.signal.aborted
        ) {
          return "SKIPPED";
        }
        const mapped = page.items.map(mapApiTrainingProjectToLocal);
        if (!append) {
          loadedHistoryProjectIdsRef.current = new Set(
            retainedHistoryProjectIdsRef.current
          );
          mapped.forEach((item) => {
            if (item.replay) {
              markHistoryProjectLoaded(item.id);
            }
          });
        }
        setTrainingProjects((current) => {
          if (!append) {
            return mapped.map((item) => {
              const existing = current.find((project) => project.id === item.id);
              if (!existing) {
                return item;
              }
              const retainedIds = new Set(retainedHistoryProjectIdsRef.current);
              return {
                ...existing,
                ...item,
                replay: retainedIds.has(item.id) ? item.replay ?? existing.replay : undefined
              };
            });
          }
          const merged = [...current];
          mapped.forEach((item) => {
            const index = merged.findIndex((existing) => existing.id === item.id);
            if (index >= 0) {
              merged[index] = {
                ...merged[index],
                ...item,
                replay: item.replay ?? merged[index].replay
              };
            } else {
              merged.push(item);
            }
          });
          return merged;
        });
        const nextCursor = page.nextCursor ?? null;
        setHistoryProjectsNextCursor(nextCursor);
        if (append && isHistoryPaginationCursorStalled(cursor, nextCursor)) {
          failedHistoryProjectsCursorRef.current = normalizeHistoryCursor(cursor);
          setError(listErrorFallbackText);
          return "FAILED";
        }
        failedHistoryProjectsCursorRef.current = null;
        return "LOADED";
      } catch (err) {
        if (abortController.signal.aborted) {
          return "SKIPPED";
        }
        if (!appIsMountedRef.current || historyProjectsPageRequestVersionRef.current !== requestVersion) {
          return "SKIPPED";
        }
        if (append) {
          failedHistoryProjectsCursorRef.current = normalizeHistoryCursor(cursor);
        }
        setError(listErrorFallbackText);
        return "FAILED";
      } finally {
        if (historyProjectsPageAbortControllerRef.current === abortController) {
          historyProjectsPageAbortControllerRef.current = null;
        }
        if (appIsMountedRef.current && historyProjectsPageRequestVersionRef.current === requestVersion) {
          if (!append) {
            setHasHistoryProjectsHydrated(true);
          }
          if (append) {
            setIsHistoryProjectsLoadingMore(false);
          } else {
            setIsHistoryProjectsLoading(false);
          }
        }
      }
    },
    [appIsMountedRef, listErrorFallbackText, listTrainingProjects, mapApiTrainingProjectToLocal, markHistoryProjectLoaded, pageSize, setError]
  );

  const loadTrainingProjectsPage = useCallback(
    async (append: boolean, cursor?: string | null): Promise<void> => {
      await loadTrainingProjectsPageWithResult(append, cursor);
    },
    [loadTrainingProjectsPageWithResult],
  );

  const loadMoreTrainingProjects = useCallback(async (
    options: HistoryProjectsLoadMoreOptions = {},
  ): Promise<HistoryProjectsLoadMoreResult> => {
    if (isHistoryProjectsLoading || isHistoryProjectsLoadingMore || !historyProjectsNextCursor) {
      return "SKIPPED";
    }
    if (
      options.automatic &&
      isHistoryAutoPaginationBlocked(
        failedHistoryProjectsCursorRef.current,
        historyProjectsNextCursor,
      )
    ) {
      return "BLOCKED";
    }
    if (!options.automatic) {
      failedHistoryProjectsCursorRef.current = null;
    }
    return loadTrainingProjectsPageWithResult(true, historyProjectsNextCursor);
  }, [historyProjectsNextCursor, isHistoryProjectsLoading, isHistoryProjectsLoadingMore, loadTrainingProjectsPageWithResult]);

  const ensureTrainingProjectDetail = useCallback(
    async (projectId: string) => {
      const id = projectId.trim();
      if (!id || loadedHistoryProjectIdsRef.current.has(id)) {
        return;
      }
      if (historyProjectDetailAbortControllersRef.current.has(id)) {
        return;
      }
      const abortController = new AbortController();
      historyProjectDetailAbortControllersRef.current.set(id, abortController);
      try {
        const detail = mapApiTrainingProjectToLocal(
          await getTrainingProject(id, {
            signal: abortController.signal
          })
        );
        if (abortController.signal.aborted || !appIsMountedRef.current) {
          return;
        }
        markHistoryProjectLoaded(id);
        upsertTrainingProjectInState(detail);
      } catch {
        // Ignore history detail fetch failure to avoid blocking list interactions.
      } finally {
        historyProjectDetailAbortControllersRef.current.delete(id);
      }
    },
    [appIsMountedRef, getTrainingProject, mapApiTrainingProjectToLocal, markHistoryProjectLoaded, upsertTrainingProjectInState]
  );

  useEffect(() => {
    const retainedProjectId = String(selectedHistoryProjectId || '').trim();
    if (retainedProjectId) {
      retainHistoryProjectDetailId(retainedProjectId);
    }
    pruneHistoryProjectDetailCache();
  }, [pruneHistoryProjectDetailCache, retainHistoryProjectDetailId, selectedHistoryProjectId]);

  return {
    trainingProjects,
    setTrainingProjects,
    historyProjectsNextCursor,
    setHistoryProjectsNextCursor,
    isHistoryProjectsLoading,
    isHistoryProjectsLoadingMore,
    hasHistoryProjectsHydrated,
    selectedHistoryProjectId,
    setSelectedHistoryProjectId,
    historyKeyword,
    setHistoryKeyword,
    historyProfitFilter,
    setHistoryProfitFilter,
    historySamplePoolFilter,
    setHistorySamplePoolFilter,
    loadTrainingProjectsPage,
    loadMoreTrainingProjects,
    ensureTrainingProjectDetail,
    upsertTrainingProjectInState,
    cleanupHistoryProjectRequests,
    markHistoryProjectLoaded,
    unmarkHistoryProjectLoaded,
    clearLoadedHistoryProjectIds
  };
};
