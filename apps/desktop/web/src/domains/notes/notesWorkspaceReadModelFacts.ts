// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useState } from "react";
import { api, type ApiDesktopWorkspaceReadModel } from "@/api";
import type {
  ReplayNoteColorToken,
  ReplayNoteScopeFilter,
} from "@zinuto/shared/replayNoteColors";

export type NotesWorkspaceReadModelQuery = {
  keyword?: string;
  scope?: ReplayNoteScopeFilter;
  colorTokens?: readonly ReplayNoteColorToken[];
};

export type NotesReadModelCtaFacts = {
  enabled: boolean;
  reasonCode: string | null;
};

export type NotesWorkspaceReadModelFacts = {
  statusCode: string;
  reasonCode: string | null;
  totalNotes: number;
  loadedNoteCount: number;
  recentCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  emptyState: {
    statusCode: string;
    reasonCode: string | null;
  };
  cta: {
    createNote: NotesReadModelCtaFacts;
    openRecentNote: NotesReadModelCtaFacts;
    loadMore: NotesReadModelCtaFacts;
  };
};

const EMPTY_CTA: NotesReadModelCtaFacts = {
  enabled: false,
  reasonCode: "WORKSPACE_READ_MODEL_PENDING",
};

const EMPTY_NOTES_FACTS: NotesWorkspaceReadModelFacts = {
  statusCode: "PENDING",
  reasonCode: null,
  totalNotes: 0,
  loadedNoteCount: 0,
  recentCount: 0,
  hasMore: false,
  nextCursor: null,
  emptyState: {
    statusCode: "PENDING",
    reasonCode: null,
  },
  cta: {
    createNote: EMPTY_CTA,
    openRecentNote: EMPTY_CTA,
    loadMore: EMPTY_CTA,
  },
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const normalizeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const normalizeOptionalText = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

const readCtaFacts = (value: unknown): NotesReadModelCtaFacts => {
  const record = toRecord(value);
  return {
    enabled: record.enabled === true,
    reasonCode: normalizeOptionalText(record.reasonCode),
  };
};

const readNotesWorkspaceFacts = (
  model: ApiDesktopWorkspaceReadModel | null,
): NotesWorkspaceReadModelFacts => {
  if (!model) {
    return EMPTY_NOTES_FACTS;
  }
  const facts = toRecord(model.facts);
  const emptyState = toRecord(facts.emptyState);
  const cta = toRecord(facts.cta);
  return {
    statusCode: String(facts.statusCode ?? model.statusCode),
    reasonCode: normalizeOptionalText(facts.reasonCode ?? model.reasonCode),
    totalNotes: normalizeNumber(facts.totalNotes),
    loadedNoteCount: normalizeNumber(facts.loadedNoteCount),
    recentCount: normalizeNumber(facts.recentCount),
    hasMore: facts.hasMore === true,
    nextCursor: normalizeOptionalText(facts.nextCursor),
    emptyState: {
      statusCode: String(emptyState.statusCode ?? model.statusCode),
      reasonCode: normalizeOptionalText(emptyState.reasonCode),
    },
    cta: {
      createNote: readCtaFacts(cta.createNote),
      openRecentNote: readCtaFacts(cta.openRecentNote),
      loadMore: readCtaFacts(cta.loadMore),
    },
  };
};

export const useNotesWorkspaceReadModelFacts = (
  isActive: boolean,
  refreshKey: string,
  query?: NotesWorkspaceReadModelQuery,
): NotesWorkspaceReadModelFacts => {
  const [model, setModel] = useState<ApiDesktopWorkspaceReadModel | null>(null);
  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const abortController = new AbortController();
    api
      .getWorkspaceReadModel("notes", {
        query,
        signal: abortController.signal,
      })
      .then((nextModel) => {
        if (!abortController.signal.aborted) {
          setModel(nextModel);
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setModel(null);
        }
      });
    return () => {
      abortController.abort();
    };
  }, [isActive, query, refreshKey]);

  return useMemo(() => readNotesWorkspaceFacts(model), [model]);
};
